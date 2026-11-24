/**
 * 行 → 变化方向标签的归组。
 *
 * 标签挂在发布稿单元格左上角，归组依据与连线 `wires.js` 的发布稿端点
 * （`y2`）取值规则一致：发布稿侧真有高亮时端点落在本侧命中行；发布稿
 * 侧没有任何命中（半线）时，端点 y 取参考侧的值，即落在参考侧命中行。
 * 改动 `wires.js` 的端点取值时必须同步检查这里。
 */

/**
 * 归组每行的标签。
 *
 * @param {Array<{reference: string[], input: string[]}>} rowMarks
 *   每行两侧命中的记录标识（rid 列表），顺序即行号。
 * @param {(rid: string) => string} kindOf 记录的变化方向。
 * @param {Array<{id: string}>} records 记录列表，用于稳定横排顺序。
 * @returns {Array<Array<{rid: string, kind: string}>>} 每行的标签列表。
 */
export function buildRowTags(rowMarks, kindOf, records) {
  const rows = Array.isArray(rowMarks) ? rowMarks : []

  const inputRows = new Set()
  for (const marks of rows) {
    for (const rid of marks.input || []) inputRows.add(rid)
  }

  return rows.map((marks) => {
    const rids = new Set()
    // 发布稿侧真有命中的行：端点在本侧，直接归组
    for (const rid of marks.input || []) rids.add(rid)
    // 半线端点：发布稿侧没有任何命中的记录，端点画在参考侧命中行
    for (const rid of marks.reference || []) {
      if (!inputRows.has(rid)) rids.add(rid)
    }
    return (records || [])
      .filter((record) => rids.has(record.id))
      .map((record) => ({ rid: record.id, kind: kindOf(record.id) }))
  })
}
