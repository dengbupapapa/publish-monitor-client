/**
 * 行规划的形态回归：用后端真实产物 + 一份构造样本，锁住三种“结构不对称”的排布。
 *
 * 三份 fixture 的来源：
 * - `asymmetric-2to1.json`  后端 `output/md_diff_preview_data.json`，两侧 22/23 块，
 *   一条 replaced 记录参考侧 2 处、发布侧 1 处；
 * - `multi-row-record.json` 后端 `output/md_diff_payload.json` 的一页（投影成 preview 形状），
 *   两侧 22/34 块，一条 added 记录 8 个区间落在 8 行；
 * - `cross-row-order-swap.json` 构造样本：两段顺序互换，对应后端 replace 组配对交叉、
 *   整组退化成一条跨越全篇的 paired 条目那条路径。
 *
 * 断言只用纯函数（`lexBlocks` / `planRows` / `blockIndexAt`），与详情页算行规格的
 * 那段代码同源；DOM 侧的渲染与连线在浏览器里另行验收。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { lexBlocks } from './blocks.js'
import { alignmentEntries, blockIndexAt, planRows } from './rows.js'

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

/** 两侧块索引与行规格，和 `MatchResultDetail` 里的桥接同一套函数。 */
function planOf(fixture) {
  const blocks = {
    reference: lexBlocks(fixture.article.reference_body),
    input: lexBlocks(fixture.article.input_body),
  }
  assert.ok(blocks.reference && blocks.input, '正文必须能切成块')
  return { blocks, rows: planRows(blocks.reference, blocks.input, alignmentEntries(fixture.alignment)) }
}

/** 记录每条区间落在哪一行；等价于详情页 `measureAnchors` 的纯函数版。 */
function rowPairs(fixture, blocks, rows, recordId) {
  return fixture.ranges
    .filter((range) => range.record_id === recordId)
    .map((range) => ({
      side: range.side,
      row: rows.findIndex((row) => row[range.side] === blockIndexAt(blocks[range.side], range.start)),
    }))
}

/** 去重后的命行数组，顺序即游标推进顺序。 */
function rowsOfRecord(fixture, blocks, rows, recordId) {
  return [...new Set(rowPairs(fixture, blocks, rows, recordId).map((pair) => pair.row))]
}

const singleSideRows = (rows) => rows.filter((row) => row.reference < 0 || row.input < 0)

test('单侧行：整段只在一侧存在时，空侧不占块', () => {
  const fixture = load('asymmetric-2to1.json')
  const { blocks, rows } = planOf(fixture)

  assert.equal(blocks.reference.length, 22)
  assert.equal(blocks.input.length, 23)
  assert.equal(rows.length, 23)
  assert.deepEqual(singleSideRows(rows), [{ reference: -1, input: 7 }])
})

test('一条记录多处：参考侧 2 处、发布侧 1 处落在同一行', () => {
  const fixture = load('asymmetric-2to1.json')
  const { blocks, rows } = planOf(fixture)

  const pairs = rowPairs(fixture, blocks, rows, 'body-0001')
  assert.equal(pairs.filter((pair) => pair.side === 'reference').length, 2)
  assert.equal(pairs.filter((pair) => pair.side === 'input').length, 1)
  assert.deepEqual(rowsOfRecord(fixture, blocks, rows, 'body-0001'), [0])
})

test('一条记录跨多行：整段新增的 8 个区间分别命中 8 行', () => {
  const fixture = load('multi-row-record.json')
  const { blocks, rows } = planOf(fixture)

  assert.equal(blocks.reference.length, 22)
  assert.equal(blocks.input.length, 34)
  assert.equal(rows.length, 34)
  assert.equal(singleSideRows(rows).length, 12)
  assert.deepEqual(rowsOfRecord(fixture, blocks, rows, 'body-0002'), [24, 25, 26, 28, 30, 31, 32, 33])
})

test('跨行：段落换序时同一记录两侧落在不同行', () => {
  const fixture = load('cross-row-order-swap.json')
  const { blocks, rows } = planOf(fixture)

  assert.equal(rows.length, 3)
  assert.deepEqual(rowPairs(fixture, blocks, rows, 'body-0001'), [
    { side: 'reference', row: 1 },
    { side: 'input', row: 2 },
  ])
  assert.deepEqual(rowPairs(fixture, blocks, rows, 'body-0002'), [
    { side: 'reference', row: 2 },
    { side: 'input', row: 1 },
  ])
})
