# Changelog

All notable changes to ThinkBud will be documented in this file.

## [1.2.1.0] - 2026-04-10

### Added
- 路由级代码分割：12 个页面 React.lazy + Suspense，主包从 717KB 降至 244KB
- shared/ 共享代码目录：bkt.ts、kcVocabulary.ts、audit.ts、types.ts 前后端统一引用
- TypeScript project references（tsconfig.shared.json），tsc -b 零错误
- ChatPage 首次进入引导：BudMascot 气泡引导拍照，8 秒自动消失
- RTC 中途断连自动降级 STT 管道 + Toast 通知用户
- SSE 流中断保留已接收的部分 AI 内容，追加错误提示
- chat.ts 端点 11 个测试（SSE 流式、参数校验、限流、D1 写入、合规审计）
- rtc-start.ts 端点 11 个测试（参数校验、限流、API 错误、成功响应）
- Vite @shared 路径别名

### Changed
- --color-text-muted 从 #9B918A 升级到 #706460（WCAG AA 5.29:1 对比度）
- RTC SDK chunk（1,294KB）仅在 /chat 路由按需加载，非聊天页面零加载
- extract-knowledge 限流 5 次/分钟，end-conversation 限流 10 次/分钟
- rtc-token 端点验证 userId 与认证用户一致（防代理请求）

### Fixed
- ChatPage localStorage 隐私浏览模式 SecurityError 崩溃
- 首次引导气泡与"卡住帮助"气泡同时显示的重叠问题
- npm 12 个 high-severity 依赖漏洞（serialize-javascript override）

### Security
- Per-user 滑动窗口限流（extract-knowledge 5/min、end-conversation 10/min）
- rtc-token 身份验证：userId !== context.data.userId 返回 403
- npm audit 零 high-severity 漏洞

## [1.2.0.0] - 2026-04-09

### Added
- BKT 贝叶斯知识追踪算法（`src/lib/bkt.ts`），替代 +/-0.1 线性置信度更新
- 会话评估引擎（`functions/_shared/assessment-engine.ts`），从 D1 已有数据纯计算独立性等级/引导效率/行为指标，无额外 LLM 调用
- D1 新增 `assessment_events` 和 `learning_snapshots` 表
- AI 教练笔记：每次对话结束后 LLM 自动生成结构化笔记（做了什么/卡在哪/策略/精彩瞬间）
- 家长报告 API（`/api/parent/report`）：10 个并行 D1 查询聚合学科进度、薄弱点、学习频率
- 家长 Dashboard（`src/pages/ParentPage.tsx`）：4 层信息架构（一句话安心 → 策略工具箱 → 精彩瞬间 → 详细数据）
- 冷启动渐进披露：0-2 次对话显示"认识中"，3-5 次显示学科区域，6+ 次显示概念级趋势
- 思维花园（`src/pages/ProgressPage.tsx`）：孩子端过程指标 + 植物隐喻可视化（🌱种子/🌿树苗/🌳大树/🌸开花）
- Accordion 可复用组件（`src/components/shared/Accordion.tsx`）
- 知识点提取验证框架：23 条合成对话 ground truth + precision gate 测试
- `useProgressData` hook：IndexedDB 本地读取会话数据，零 API 调用

### Changed
- `buildKnowledgeContext()` 增强：趋势检测（最近 3 次遭遇方向）、一致性评分、时间衰减（λ=0.01，~70天半衰期）
- `MAX_CONTEXT_CHARS` 从 600 提升到 1000（AI 教学更具针对性）
- `end-conversation.ts` 扩展：BKT 置信度更新 + 评估引擎计算 + AI 教练笔记生成（3 个独立 try/catch）
- 知识点提取使用 BKT 算法替代线性 +/-0.1 模型（客户端 + 服务端同步替换）
- WelcomePage 新增"我的花园"和"家长报告"入口按钮
- 置信度不再暴露原始数字，转换为"正在探索/逐渐掌握/已经很熟练"文字标签

### Fixed
- RTC 语音会话数据管道断裂：disconnect 时写入完整分析数据（resolution_type、emotion_trajectory 等 6 个字段）
- RTC 会话自动检测学科（detectSubject 提取为共享工具函数）
- RTC 会话结束时触发知识点提取（与文字管道对齐）
- ParentPage 独立解决率双重百分比乘法 bug

## [1.1.0.0] - 2026-04-03

### Added
- 白板 MVP：步骤卡片（StepCard）、白板面板（WhiteboardPanel）、KaTeX 数学渲染（MathBlock）
- 白板集成：ChatPage 分屏布局，useWhiteboardSteps hook，答案泄露审计
- 知识追踪数据层：KC 词汇表（90+ 知识点），IndexedDB v4，D1 knowledge_points 表
- 知识点提取：/api/extract-knowledge 端点，LLM 从对话中识别掌握/薄弱知识点
- 自适应 AI 教练：知识图谱上下文注入 system prompt，AI 感知孩子的薄弱点
- 白板 spike 原型：react-konva 标注画布，OCR bbox 验证，AI 标注坐标映射
- OCR 详细端点：/api/ocr-detailed 返回完整 bbox 数据供白板标注
- BudMascot 9 种情绪表情（从 5 种扩展：新增惊喜、好奇、困倦、专注）
- AiCoachOrb 光晕呼吸动画
- 测试框架完善：vitest + @testing-library/react，18 个测试文件，287 个测试用例

### Changed
- AI 情绪分化：低年级活泼具象夸奖，高年级尊重式确认，受挫 3 级递进
- Prompt core 升级：答案验算规则、元问题处理、受挫累积检测
- UI 产品级升级：全页面奶油底色 + 3D 按钮 + design tokens + easing 系统
- 登录/引导/欢迎/聊天/历史/管理后台全部视觉统一
- 对话详情页改为 ChatGPT 风格平铺排版（AI 无气泡、用户浅色卡片）
- Skeleton 骨架屏升级为暖色奶油色系
- 语音参数按学段分化（SilenceTime、语速、AIVAD）
- RTC SilenceTime 低年级降至 1000ms（原 1800ms 导致 ASR 超时无字幕）

### Fixed
- XSS 防护：MathBlock 的 KaTeX 输出 HTML 转义
- Emoji bug：5 个文件补全 emotion 映射（惊喜/好奇/困倦/专注）
- D1 upsert 竞态：改用 INSERT OR IGNORE + UPDATE 两步法
- Cookie 检测补全：localhost 开发时去掉 Secure 标记
- RTC ASR 添加 Cluster 配置
- useVoicePipeline stale closure 修复

---

## [1.0.0.2] - 2026-03-25

### Fixed
- 清除全部 22 个 ESLint errors 和 4 个 warnings（从 26 → 0）
- 修复 3 处 `any` 类型断言、2 处正则转义、6 处 dead imports
- 修复 React 编译器规则：CompletionCard 中 Date.now() 不再在 useMemo 内调用
- WelcomePage 引导状态从 useEffect+setState 改为 useState 初始化
- useChatSession prepareRTCConnect 移除多余的 showToast 依赖

---

## [1.0.0.1] - 2026-03-25

### Added
- "拍题"按钮：CameraPreview 新增手动拍照按钮，用户主动控制拍题时机
- 权限前置：WelcomePage "开始学习"时一次性请求摄像头+麦克风权限，ChatPage 不再弹窗
- ControlBar 拍题引导文案（"对准作业拍题，然后点麦克风"）

### Fixed
- 修复拍题后 AI 不知道题目：OCR 2秒超时竞态导致 RTC 连接时丢失 OCR 结果
- 自动截帧不再锁定摄像头画面：跳过拍题直接点麦克风时，摄像头保持实时预览，只显示"✓ 已识别"角标

### Changed
- 麦克风按钮点击到 AI 就绪时间从 5-10 秒降至 2-3 秒（已拍题时跳过 OCR）

---

## [1.0.0.0] - 2026-03-25

### Added
- 手机号 + 验证码认证系统（invite 模式 + 阿里云 SMS 双模式）
- 管理后台（用户列表、对话查看、统计面板、错误日志）
- RTC 语音对话管道（火山引擎 Voice Agent，ASR+LLM+TTS 一体）
- STT/TTS 备用语音管道（RTC 失败自动降级）
- 拍题 OCR 识别（火山引擎 OCR + 方舟视觉兜底）
- System Prompt v4 模块化架构（数学/语文/英语三学科）
- 多题会话管理（AI 自管理多道题流转）
- 新用户引导流程（3 步 Onboarding + BudMascot 吉祥物）
- 合规审计系统（8 类检测规则，270+ 测试用例）
- Per-user API 限流（chat/tts/stt/ocr）
- D1 写入重试包装器（exponential backoff）
- RTC 字幕消息缓冲与批量持久化
- 客户端错误上报 + 服务端错误日志
- CSP 安全头注入（middleware + 静态资源）
- 手机号 HMAC-SHA256 哈希（双查找自动迁移）
- RTC 30 分钟会话限制 + 25 分钟温馨提醒
- RTC SDK 预加载消除首次延迟
- AI 教练标识和首次 AI 内容披露提示
- ChatPage 分解重构（608→267 行，useReducer 状态机）
- 设计系统基础（Lucide 图标、CSS tokens、页面过渡动画）
- 吉祥物引导系统（5 场景语音气泡引导）
- CI 管道测试门控（GitHub Actions）
- 228 个 vitest 测试用例（含 auditAi 50 例、auth 25 例、rate-limit 10 例、RTC 10 例、组件 55 例等）

### Fixed
- System Prompt 信任边界修复（服务端构建，前端只传参数）
- RTC 对话所有权校验（防止跨用户数据写入）
- /api/error-report IP 限流（防滥用）
- 前后端 audit 代码合并为单一来源
- 统一 ContextData 类型 + 移除类型断言
- OCR 支持语文英语
- 思考链显示 AI 消息修复
- Middleware 白名单收窄为精确匹配

### Changed
- 使用时长限制暂停（测试阶段不限流）
- ASR 升级到 seedasr 2.0 大模型

### Removed
- 调试端点 rtc-diagnose.ts、tts-diagnose.ts
- 测试万能码 000000
