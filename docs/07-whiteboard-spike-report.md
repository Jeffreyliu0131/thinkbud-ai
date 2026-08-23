# 白板可视化 Spike 技术决策报告

**日期:** 2026-03-26
**作者:** Claude (Phase 7 Spike)
**状态:** Final

## 1. 概述

本 spike 评估"AI 教练在作业照片上画标注"这一方向的技术可行性。核心问题：火山引擎 OCR 是否返回可用的 bounding box 数据？如何将 AI 语义指令（"圈出等号"）映射到画布坐标？用哪种渲染技术？

**一句话结论：** Conditional Go -- react-konva 渲染方案验证通过，AI 索引映射架构可行，但 OCR bbox 字段名需运行时验证（已内置 raw_keys 自检机制），LLM 结构化输出稳定性需后续测试。

## 2. OCR Bounding Box 验证结果

### 使用的 API

- **Action:** `OCRNormal`
- **Version:** `2020-08-26`
- **Endpoint:** `visual.volcengineapi.com`
- **签名:** V4 HMAC-SHA256（复用现有 `volcengine-sign.ts`）

### 实际返回字段

Plan 01 实现了 `raw_keys` 调试字段，API 端点返回 `Object.keys(data)` 用于运行时验证。

**当前状态：** 字段名基于中文开发者社区博客推测，**尚未用真实作业照片进行运行时验证**。推测的字段结构为：

| 字段 | 类型 | 置信度 | 说明 |
|------|------|--------|------|
| `line_texts` | `string[]` | HIGH | 现有 OCR 端点已在使用 |
| `line_rects` | `{x,y,width,height}[]` | MEDIUM | 多个社区源一致，但未验证 |
| `chars` | `{char,x,y,width,height,score}[]` | MEDIUM | 字符级 bbox，手写体精度未知 |
| `polygons` | `number[][][]` | MEDIUM | 多边形坐标，文档不可访问 |

**raw_keys 机制：** 即使字段名不完全匹配，`raw_keys` 返回 `data` 对象的所有真实 key，开发者可在浏览器控制台直接查看，无需重新部署即可发现正确字段名。

### 数据质量评估

- **行级 bbox（`line_rects`）：** 如果字段存在，精度应足够支撑行级标注（圈出整行、下划线整行）
- **字符级 bbox（`chars`）：** 对印刷体预计精度较高，对儿童手写体精度未知，可能出现字符框不准或 chars 数组为空的情况
- **手写体表现：** OCRNormal 设计面向通用文本识别，儿童手写体是已知弱点，需更多样本测试

### 结论

bbox 数据**大概率可用**（多个独立信息源一致），但字段名和数据质量需要用真实作业照片运行时确认。`raw_keys` 机制保证了即使字段名不匹配也能快速发现并修正。如果 OCR 完全不返回 bbox，则需考虑切换到 `MultiLanguageOCR` API（返回 `ocr_infos[].rect` 多边形）。

## 3. 渲染方案三选一评估

| 维度 | react-konva | Canvas API | SVG |
|------|-------------|------------|-----|
| **React 集成** | 声明式 JSX，组件化 | 命令式 ref + draw | 原生 JSX |
| **移动端触控** | 内置（Konva 原生支持） | 手动实现 touchstart/move/end | 原生但功能有限 |
| **图片合成** | `<KonvaImage>` + `useImage` hook | `drawImage()` 手动管理 | CSS background / `<image>` |
| **动画** | 内置 tween + Spring | requestAnimationFrame | CSS transition / animation |
| **包体大小** | ~90KB gzipped (konva) | 0 (原生) | 0 (原生) |
| **50+ 标注性能** | 高 (canvas 像素渲染) | 高 (canvas 像素渲染) | 低 (DOM 节点膨胀) |
| **多层叠加** | 原生 Layer 概念 | 多 canvas 或手动 z-order | z-index 管理 |
| **学习曲线** | 低（JSX 语法） | 中（命令式 API） | 低（JSX 语法） |
| **调试友好** | 组件树可见 | DevTools 看不到 canvas 内容 | DOM 可检查 |
| **Spike 验证** | 已验证可运行 | 未验证 | 未验证 |

### 选定方案：react-konva

**理由：**

1. **声明式 React 集成** -- 标注形状是 JSX 组件（`<Rect>`, `<Line>`, `<Arrow>`），状态变更自动重渲染，与 React 数据流一致
2. **Layer 分离天然适配** -- 底图 / OCR debug / AI 标注三层独立渲染，互不干扰
3. **移动端触控内置** -- Konva 原生支持触控事件，未来做手动标注不需要额外开发
4. **已在 Spike 中验证** -- Plan 01 已成功运行 react-konva 画布渲染 + OCR bbox 叠加
5. **包体增量可接受** -- ~90KB gzipped 对移动端应用可接受，且只有进入白板页面才加载（可 lazy import）

**Canvas API 不选的原因：** 命令式代码与 React 声明式模型冲突，需要手动管理重渲染和事件绑定，开发效率低。

**SVG 不选的原因：** 50+ 标注时 DOM 节点膨胀影响性能，图片合成需要额外处理，不支持 canvas 级别的像素操作。

## 4. AI 语义标注映射方案

### 架构

```
OCR 行文本 ──→ LLM context ──→ LLM 输出 JSON ──→ 客户端解析 ──→ canvas 渲染
 [L0] 3+5=?     带索引引用      AiAnnotation[]     resolveAnnotation()   Konva shapes
```

### 输入格式（送入 LLM）

OCR 识别结果按行编号，作为 LLM 对话上下文的一部分：

```
[L0] 3 + 5 = ?
[L1] 12 - 7 = ?
[L2] 4 x 6 = 24
```

### 输出格式（LLM 返回）

AI 教练在回复中嵌入结构化标注指令 `AiAnnotation[]`：

```typescript
// "圈出第一行的等号"
{ type: "circle", target: { line: 0, charStart: 6, charEnd: 6 }, label: "=" }

// "在第二行下面画线"
{ type: "underline", target: { line: 1 } }

// "用箭头指向第三行"
{ type: "arrow", target: { line: 2 }, label: "check this" }
```

### 客户端解析

`resolveAnnotation()` 函数负责将索引映射为像素坐标：

1. 通过 `target.line` 索引到 `ocrData.line_rects[line]` 获取行级 bbox
2. 如果指定了 `charStart/charEnd` 且 `chars` 数据可用，精确定位到字符级 bbox
3. 字符索引通过累加前面行的字符数计算全局偏移
4. 索引越界时 graceful fallback 到行级 bbox 或返回 null

### 已知限制

| 限制 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 可能输出越界索引 | 标注指向错误位置或无法渲染 | `resolveAnnotation` 边界检查 + null 返回 |
| chars 数据可能不存在 | 字符级标注退化为行级 | 自动 fallback 到 `line_rects` |
| LLM JSON 输出不稳定 | 解析失败 | 前端 try-catch + JSON schema 校验 |
| 手写体字符 bbox 不准 | 标注位置偏移 | 行级标注为主，字符级标注为辅 |

### 评估

该方案**可行且合理**。核心优势：
- LLM 不需要理解像素坐标，只需引用行/字符索引（认知负担低）
- 客户端负责坐标解析，可以处理各种边界情况
- 与现有 META 解析模式一致（AI 输出结构化数据，前端解析渲染）

## 5. 未验证项和风险

### 高优先级

| 风险 | 状态 | 验证方式 |
|------|------|----------|
| OCR bbox 字段名是否与推测一致 | **未验证** | 用真实作业照片调用 API，查看 `raw_keys` 输出 |
| 火山方舟 LLM 能否稳定输出结构化 JSON 标注 | **未测试** | 在 system prompt 中加入 few-shot 示例 + 输出格式要求 |
| 手写体 OCR 字符级 bbox 精度 | **未测试** | 需 3+ 张不同笔迹的手写作业照片 |

### 中优先级

| 风险 | 状态 | 验证方式 |
|------|------|----------|
| 实时标注性能（语音对话 + 标注动画同时进行） | **未测试** | 需在 RTC 对话中同步触发标注渲染，测量帧率 |
| react-konva 在低端安卓设备的渲染性能 | **未测试** | 需真机测试 |
| 标注动画效果（渐入/脉冲等）是否影响教学体验 | **未设计** | 需教育设计评审 |

### 低优先级

| 风险 | 状态 | 验证方式 |
|------|------|----------|
| `MultiLanguageOCR` 作为 bbox 备选 API | **未测试** | 如果 OCRNormal 不返回 bbox，可切换 |
| 多题作业的标注上下文管理 | **未设计** | 多题会话管理已有框架（session-manager.ts），可扩展 |

## 6. Go / No-Go 结论

### 判定：Conditional Go

**条件：** 用一张真实作业照片验证 OCR API 确实返回 bbox 数据（通过 `raw_keys` 检查），如果返回则 Go，如果不返回则需切换 OCR API 或调整方案。

**Go 的依据：**
- react-konva 渲染方案已验证可运行，三层架构清晰
- AI 索引映射方案架构合理，`resolveAnnotation` 已实现并通过 TypeScript 类型检查
- 与现有技术栈（React 19、TypeScript、Cloudflare Pages Functions）完全兼容
- 包体增量可接受（~90KB），可 lazy load

**Conditional 的原因：**
- OCR bbox 字段名是社区博客推测，非官方文档验证
- LLM 结构化 JSON 输出稳定性未实测
- 儿童手写体 OCR 精度未知

### 推荐的 MVP 范围

如果条件满足（OCR bbox 可用），建议 MVP 包含：

1. **行级标注**（circle + underline）-- 最可靠，不依赖字符级 bbox
2. **单题模式** -- 一次标注一道题的一张照片
3. **标注与对话联动** -- AI 回复中嵌入标注指令，通过 META 格式传输
4. **预设标注模板** -- 减少 LLM 自由发挥空间，提高输出一致性

### 下一步行动建议

1. **立即可做：** 用真实作业照片调用 `/api/ocr-detailed`，查看 `raw_keys` 和实际数据，确认字段名
2. **确认后：** 在 system prompt v5 中加入标注输出格式说明 + few-shot 示例
3. **原型扩展：** 在 RTC 对话中触发标注渲染，验证实时性
4. **教育评审：** 标注类型和动画效果需要教育设计评审，确认对教学的实际价值

---

*本报告基于 Phase 7 Spike 的实际代码实现和研究数据。OCR 字段信息来源于中文开发者社区博客，置信度为 MEDIUM。react-konva 渲染已在 Spike 原型中验证运行。*
