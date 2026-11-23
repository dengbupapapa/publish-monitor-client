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

// 列表行按真实接口的条目形状拼：记录只带变化方向，够 `changeSummary` 出计数
const items = FIXTURES.map(({ id }, index) => {
  const page = pages.get(id)
  return {
    id,
    matched: 1,
    status: 'completed',
    coordinate_version: page.article.coordinate_version,
    created_at: `2026-11-23T10:0${index}:00`,
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
    response.end(envelope({ total: items.length, items }))
    return
  }

  response.statusCode = 404
  response.end(JSON.stringify({ code: 404, msg: 'not found', data: null }))
})

server.listen(PORT, '127.0.0.1', () => console.log(`stub ready on http://127.0.0.1:${PORT}`))
