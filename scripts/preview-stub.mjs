/**
 * 形态验收用的本地 stub：把 `src/diff/fixtures` 里的样本按真实接口形状暴露出来。
 *
 * 用途：列表/详情页的三种结构形态（单侧行、一条记录多行、跨行连线）在真实 dev 库里
 * 没有样本，用这些 fixture 起一个假后端即可在浏览器里验收：
 *
 *   node scripts/preview-stub.mjs
 *   $env:BACKEND_ORIGIN='http://127.0.0.1:8003'; pnpm dev
 *
 * 只实现验收需要的两个读接口：`GET /match-results` 与 `GET /match-results/{id}/preview`。
 *
 * 列表按真实契约取数：只认 `pageNum`（从 0 起）与 `pageSize`，响应为 `{total, rows}`，
 * 旧 `skip`/`limit` 与后端一样被忽略。默认只出 3 条样本，需要翻页时用
 *
 *   $env:STUB_TOTAL_ROWS='12'; node scripts/preview-stub.mjs
 *
 * 让样本循环补齐行数。
 */

import fs from 'node:fs'
import http from 'node:http'

const PORT = Number(process.env.STUB_PORT) || 8003

const FIXTURES = [
  { id: '9001', file: 'asymmetric-2to1.json' },
  { id: '9002', file: 'multi-row-record.json' },
  { id: '9003', file: 'cross-row-order-swap.json' },
]

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../src/diff/fixtures/${file}`, import.meta.url), 'utf8'))

const pages = new Map(FIXTURES.map(({ id, file }) => [id, read(file)]))

const TOTAL_ROWS = Math.max(FIXTURES.length, Number(process.env.STUB_TOTAL_ROWS) || FIXTURES.length)

// 列表行按真实接口的条目形状拼：记录只带变化方向，够 `changeSummary` 出计数。
// 超出样本数量的行循环复用样本，并各自获得唯一 id，让分页与详情跳转能一起验收。
const rows = Array.from({ length: TOTAL_ROWS }, (_, index) => {
  const fixture = FIXTURES[index % FIXTURES.length]
  const page = pages.get(fixture.id)
  const id = String(Number(fixture.id) + index)
  pages.set(id, page)

  return {
    id,
    matched: 1,
    status: 'completed',
    coordinate_version: page.article.coordinate_version,
    created_at: `2026-11-23T10:${String(index).padStart(2, '0')}:00`,
    reference: { id: `ref-${id}`, title: page.article.reference_title },
    input: { id: `inp-${id}`, business_id: `https://example.com/${id}`, title: page.article.input_title },
    records: page.records.map((record) => ({ change_kind: record.change_kind })),
  }
})

const envelope = (data) => JSON.stringify({ code: 200, msg: 'ok', data })

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  const preview = url.pathname.match(/^\/match-results\/([^/]+)\/preview$/)
  if (preview) {
    const page = pages.get(preview[1])
    if (!page) {
      response.statusCode = 404
      response.end(JSON.stringify({ code: 404, msg: 'not found', data: null }))
      return
    }
    response.end(envelope(page))
    return
  }

  if (url.pathname === '/match-results') {
    const pageNum = Math.max(0, Math.floor(Number(url.searchParams.get('pageNum')) || 0))
    const pageSize = Math.min(
      200,
      Math.max(1, Math.floor(Number(url.searchParams.get('pageSize')) || 20)),
    )
    const matched = url.searchParams.get('matched')
    const filtered = matched === null || matched === ''
      ? rows
      : rows.filter((row) => String(row.matched) === matched)
    const start = pageNum * pageSize

    response.end(envelope({ total: filtered.length, rows: filtered.slice(start, start + pageSize) }))
    return
  }

  response.statusCode = 404
  response.end(JSON.stringify({ code: 404, msg: 'not found', data: null }))
})

server.listen(PORT, '127.0.0.1', () => console.log(`stub ready on http://127.0.0.1:${PORT}`))
