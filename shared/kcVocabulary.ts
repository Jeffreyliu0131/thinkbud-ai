import type { Subject } from './types'

export interface KCEntry {
  concept: string               // English slug, used as KC key
  label: string                 // Chinese display name shown to child/parent
  subject: Subject
  gradeHint: 'lower' | 'upper' | 'both'
}

export const KC_VOCABULARY: KCEntry[] = [
  // ===== MATH — Lower Grade (1-3) =====
  { concept: 'make_ten',         label: '凑十法',       subject: 'math', gradeHint: 'lower' },
  { concept: 'split_method',     label: '拆分法',       subject: 'math', gradeHint: 'lower' },
  { concept: 'counting',         label: '数数法',       subject: 'math', gradeHint: 'lower' },
  { concept: 'long_form',        label: '竖式计算',     subject: 'math', gradeHint: 'lower' },
  { concept: 'diagram',          label: '画图法',       subject: 'math', gradeHint: 'lower' },
  { concept: 'carrying',         label: '进位加法',     subject: 'math', gradeHint: 'lower' },
  { concept: 'borrowing',        label: '退位减法',     subject: 'math', gradeHint: 'lower' },
  { concept: 'times_tables',     label: '乘法口诀',     subject: 'math', gradeHint: 'lower' },
  { concept: 'reverse_reasoning',label: '倒推法',       subject: 'math', gradeHint: 'lower' },
  { concept: 'compare_size',     label: '大小比较',     subject: 'math', gradeHint: 'lower' },
  { concept: 'place_value',      label: '数位概念',     subject: 'math', gradeHint: 'lower' },
  { concept: 'simple_fraction',  label: '简单分数',     subject: 'math', gradeHint: 'lower' },

  // ===== MATH — Upper Grade (4-6) =====
  { concept: 'round_split',      label: '拆分凑整',     subject: 'math', gradeHint: 'upper' },
  { concept: 'step_estimate',    label: '分步估算',     subject: 'math', gradeHint: 'upper' },
  { concept: 'inverse_check',    label: '逆运算验证',   subject: 'math', gradeHint: 'upper' },
  { concept: 'number_line',      label: '画线段图',     subject: 'math', gradeHint: 'upper' },
  { concept: 'table_method',     label: '列表法',       subject: 'math', gradeHint: 'upper' },
  { concept: 'auxiliary_line',   label: '找辅助线',     subject: 'math', gradeHint: 'upper' },
  { concept: 'area_split',       label: '面积拆分',     subject: 'math', gradeHint: 'upper' },
  { concept: 'fraction_denom',   label: '分数通分',     subject: 'math', gradeHint: 'upper' },
  { concept: 'balance_model',    label: '天平模型',     subject: 'math', gradeHint: 'upper' },
  { concept: 'equation_reverse', label: '方程倒推',     subject: 'math', gradeHint: 'upper' },
  { concept: 'ratio_proportion', label: '比例关系',     subject: 'math', gradeHint: 'upper' },
  { concept: 'volume_area',      label: '体积面积',     subject: 'math', gradeHint: 'upper' },
  { concept: 'divisibility',     label: '整除与余数',   subject: 'math', gradeHint: 'upper' },

  // ===== CHINESE — Lower Grade =====
  { concept: 'initial_finals',   label: '声母韵母拆分', subject: 'chinese', gradeHint: 'lower' },
  { concept: 'radical_assoc',    label: '偏旁联想记字', subject: 'chinese', gradeHint: 'lower' },
  { concept: 'guided_observe',   label: '观察引导写字', subject: 'chinese', gradeHint: 'lower' },
  { concept: 'stroke_order',     label: '笔画顺序',     subject: 'chinese', gradeHint: 'lower' },
  { concept: 'word_context',     label: '词语搭配',     subject: 'chinese', gradeHint: 'lower' },
  { concept: 'rhyme_tone',       label: '韵母声调',     subject: 'chinese', gradeHint: 'lower' },
  { concept: 'sentence_sense',   label: '语感造句',     subject: 'chinese', gradeHint: 'lower' },
  { concept: 'read_aloud',       label: '朗读节奏',     subject: 'chinese', gradeHint: 'lower' },
  { concept: 'punctuation_use',  label: '标点符号使用', subject: 'chinese', gradeHint: 'lower' },
  { concept: 'simple_narrative', label: '简单叙事结构', subject: 'chinese', gradeHint: 'lower' },

  // ===== CHINESE — Upper Grade =====
  { concept: 'para_locate',      label: '段落定位',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'key_sentence',     label: '关键句提取',   subject: 'chinese', gradeHint: 'upper' },
  { concept: 'retell_train',     label: '复述训练',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'grammar_error',    label: '病句分析',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'essay_outline',    label: '作文大纲',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'metaphor_figure',  label: '修辞手法',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'theme_extract',    label: '主旨提炼',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'inference',        label: '文意推断',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'ancient_poetry',   label: '古诗词理解',   subject: 'chinese', gradeHint: 'upper' },
  { concept: 'char_meaning',     label: '字词释义',     subject: 'chinese', gradeHint: 'both'  },
  { concept: 'reading_comp',     label: '阅读理解策略', subject: 'chinese', gradeHint: 'upper' },
  { concept: 'writing_express',  label: '写作表达',     subject: 'chinese', gradeHint: 'upper' },
  { concept: 'idiom_usage',      label: '成语积累与运用', subject: 'chinese', gradeHint: 'upper' },

  // ===== ENGLISH — Lower Grade =====
  { concept: 'phonics',          label: '自然拼读',     subject: 'english', gradeHint: 'lower' },
  { concept: 'syllable_split',   label: '音节拆分',     subject: 'english', gradeHint: 'lower' },
  { concept: 'sight_words',      label: '常见词识记',   subject: 'english', gradeHint: 'lower' },
  { concept: 'basic_sentence',   label: '基本句型',     subject: 'english', gradeHint: 'lower' },
  { concept: 'abc_sounds',       label: '字母发音',     subject: 'english', gradeHint: 'lower' },
  { concept: 'simple_dialogue',  label: '简单对话句式', subject: 'english', gradeHint: 'lower' },
  { concept: 'number_words',     label: '数字单词',     subject: 'english', gradeHint: 'lower' },
  { concept: 'daily_vocab',      label: '日常词汇积累', subject: 'english', gradeHint: 'lower' },
  { concept: 'yes_no_question',  label: '一般疑问句',   subject: 'english', gradeHint: 'lower' },

  // ===== ENGLISH — Upper Grade =====
  { concept: 'sentence_parts',   label: '句子成分识别', subject: 'english', gradeHint: 'upper' },
  { concept: 'context_infer',    label: '上下文推断词义', subject: 'english', gradeHint: 'upper' },
  { concept: 'word_root',        label: '词根联想记忆', subject: 'english', gradeHint: 'upper' },
  { concept: 'tense_use',        label: '时态运用',     subject: 'english', gradeHint: 'upper' },
  { concept: 'reading_strategy', label: '阅读策略',     subject: 'english', gradeHint: 'upper' },
  { concept: 'grammar_struct',   label: '语法结构',     subject: 'english', gradeHint: 'upper' },
  { concept: 'writing_organize', label: '写作组织',     subject: 'english', gradeHint: 'upper' },
  { concept: 'passive_voice',    label: '被动语态',     subject: 'english', gradeHint: 'upper' },
  { concept: 'clause_complex',   label: '从句结构',     subject: 'english', gradeHint: 'upper' },
  { concept: 'preposition_use',  label: '介词搭配',     subject: 'english', gradeHint: 'both'  },
  { concept: 'phrase_colloc',    label: '短语搭配',     subject: 'english', gradeHint: 'both'  },
  { concept: 'listening_comp',   label: '听力理解',     subject: 'english', gradeHint: 'both'  },
]

/** Build a compact vocabulary string for the LLM extraction prompt.
 *  Filtered to the given subject to keep token count low.
 */
export function buildVocabString(subject: Subject): string {
  return KC_VOCABULARY
    .filter(e => e.subject === subject)
    .map(e => `${e.concept}(${e.label})`)
    .join(', ')
}
