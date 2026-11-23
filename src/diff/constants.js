/**
 * 对照区共用常量。
 *
 * 五条注入安全判据与后端 `src/tools/md_diff_viewer_data.py` 逐字对应，
 * 改动其中任何一条都会让高亮与离线预览页漂移，属于冻结算法的一部分。
 */

export const SIDE_REFERENCE = 'reference'
export const SIDE_INPUT = 'input'
export const SIDES = [SIDE_REFERENCE, SIDE_INPUT]

export const SIDE_LABELS = {
  [SIDE_REFERENCE]: '参考侧',
  [SIDE_INPUT]: '发布侧',
}

/** 两侧摘要的拼接符，与后端 `side_text` 一致。 */
export const TEXT_JOINER = '\n'

/** 摘要最多展示的字数；超出后截断并加省略号。 */
export const SUMMARY_MAX_CHARS = 120

/** 内容类型 → 计数单位。 */
export const UNIT_BY_CONTENT_TYPE = { text: '处', link: '处', image: '张' }
export const DEFAULT_UNIT = '处'

/** 变化方向 → 展示名。 */
export const KIND_LABELS = { added: '新增', removed: '删除', replaced: '修改' }

/** 结论状态 → 展示名。 */
export const STATUS_LABELS = {
  pending: '待核查',
  processing: '核查中',
  completed: '已完成',
  failed: '失败',
}

/** 结论状态 → antd 标签色。 */
export const STATUS_COLORS = {
  pending: 'default',
  processing: 'processing',
  completed: 'success',
  failed: 'error',
}

/** 匹配态 → 展示名（0 不匹配、1 匹配、2 未知）。 */
export const MATCHED_LABELS = { 0: '不匹配', 1: '匹配', 2: '未知' }

// ---------------------------------------------------------------------------
// 以下正则逐字移植自后端 unsafe_reason 所用的五条判据。
// `_STARTS_BLOCK` 在原实现里用 re.match(body, start) 锚定在区间起点，
// 这里用 `^(?:...)` 对切片表达同样的锚定语义，不能用 search。
// ---------------------------------------------------------------------------
const BLOCK_PREFIX =
  '[ \\t]{0,3}(?:#{1,6}[ \\t]+|>[ \\t]?|[-*+][ \\t]+|\\d+\\.[ \\t]+|```|\\|)'

export const BLANK_LINE = /\n[ \t]*\n/
export const AT_LINE_START = new RegExp('\n' + BLOCK_PREFIX)
export const STARTS_BLOCK_AT = new RegExp('^(?:' + BLOCK_PREFIX + ')')
export const IMAGE_SPAN = /!\[[^\]]*\]\([^)]*\)/g
export const LINK_SPAN = /(?<!!)\[([^\]]*)\]\(([^)]*)\)/g
