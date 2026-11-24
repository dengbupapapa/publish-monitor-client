# Design

## Context

列表页把过滤与分页全部折叠进路由 query，再由 `state` computed 还原后驱动 `load()`：

```
route.query --(state computed，白名单校验)--> { scope, matched, page, size }
                                                    |
                                    watch([...]) --> load() --> GET /match-results
                                                    |
                            toListQuery(state) --> router.push/replace
```

三处现有实现决定了改动的形状（均在 `src/views/MatchResultList.vue`）：

- `state` 对每个键做白名单校验，非法值回落缺省，缺省值不回写地址。
- 规范化 `watch(route.query)` 只比对 `scope / matched / page / size`，新增键不加进去，地址会被反复改写或改不回去。
- `openDetail` 复用 `toListQuery(state.value)`，过滤项只要进了 `toListQuery`，从详情返回就自动恢复。

服务端关键词参数已就绪（`keyword`，`max_length=128`，两侧标题 `icontains` 的 OR，空白视为不传，作用在「每篇最新结论」去重之后）。动机见 `proposal.md`，行为契约见本次 `specs/match-result-list/spec.md`。

## Goals / Non-Goals

**Goals:**

- 关键词沿用「地址即状态」的既有约定，且不破坏输入体验（不逐字符刷历史）。
- 关注集勾选做到「记住选择」但仍可分享，两者共存且规则可解释。
- 移除匹配态控件时保留其数据通路，使恢复成本只有一次模板改动。
- 改动集中在 `buildListQuery`、一个极小的缓存模块与列表视图，不动详情链路与数据层。

**Non-Goals:**

- 不改后端、不改详情页、不改结果列判定与进入详情规则。
- 不做关键词高亮：服务端不返回命中区间，本地再造一套匹配等于把同一谓词写两遍。
- 不在前端做任何关键词二次过滤或本地补齐。
- 不改 `matched` 的语义、取值集合与请求参数名。

## Decisions

**1. 关键词：输入框持「输入态」，地址持「归一态」，防抖后替换地址。**

结构如下：

```
  a-input (v-model:keywordInput, maxlength=128)
        |  300ms 防抖
        v
  归一化：trim -> 截断 128 -> 为空则不带键
        |
        v
  router.replace({ query: toListQuery({ ...explicit, keyword, page: 1 }) })
        |
        v
  route.query --(state computed)--> load()
        ^
        |  watch(route.query.keyword)：与输入框 trim 后不同则回灌输入框
        +-- 外部变化（后退/前进/直开）时先清掉未触发的防抖定时器
```

- 用 `replace` 而非 `push`：逐字符 push 会让返回键退化成逐字回退，这是可观察的体验缺陷。
- 用 300ms 防抖：既避免每键一请求，也保证停顿后自动出结果，不额外要求回车。
- 回灌守卫：写地址前比对「trim 后的输入」与「当前 `state.keyword`」，相等则不写。否则后退恢复旧关键词时，挂起的防抖回调会把地址又改回去。
- 组件卸载时清定时器，避免离开页面后仍有 replace。

备选：关键词只存组件内状态（最省事，但丢掉分享与详情返回恢复，与本页既有约定不一致）；回车才提交（少一类竞态，但多一次显式动作，且按移动端习惯也不自然）。

**2. 128 长度上限做两层：输入框 `maxlength` 拦截输入，`state` 对地址取值再截断一次。**

地址可以绕过 `maxlength`，而超长取值会撞上后端 `max_length=128` 得到 422（`http.js` 会把它变成「加载失败：…」）。因此 `state.keyword` 必须自己截断，输入框的 `maxlength` 只是让用户在正常路径上看不到这件事。

**3. 匹配态只删控件，状态层一列不动。**

删除清单：模板中的 `a-select`、`MATCHED_OPTIONS`、`matchedOption`、`onMatchedChange`（以及它们的样式类）。保留清单：`MATCHED_VALUES`、`state.matched`、`load()` 中的透传、`toListQuery` 的写入、规范化 watch 的比对键数组、`emptyDescription` 中「关注集 × 未知」的分支。

理由：控件是唯一入口，但状态层是恢复时的全部成本。保留后，将来只需把 `a-select` 与一个 `onMatchedChange` 加回来，地址协议、请求参数与空态文案都不用动。备选是连 `state.matched`、`toListQuery` 一并删除（更干净），但旧书签会静默失效且恢复需要重做一遍地址解析，与「后续可快速恢复」的目标相反。

**4. 关注集缓存：地址优先、缓存兜底、只由显式操作写入。**

```
             地址里有没有 scope？
          +---------+-----------+
          | 有（合法 warn）      | 有（其它非空取值）
          v                     v
       勾选                 未勾选（不读缓存）
          |
          | 没有（或空串）
          v
   读本地缓存 -> 勾选 / 未勾选
```

实现上要把「地址里的显式取值」与「实际生效取值」拆成两个 computed：

- `explicitScope`：只描述地址，空串与缺失都归为「未带」，非空但不是 `warn` 归为「显式未勾选」。
- `effectiveScope`：`explicitScope` 有结论就用它，没有才读缓存。

两条使用边界：

- **地址规范化与 `toListQuery` 用 `explicitScope`**，因此缓存回填不会把 `?scope=warn` 写进地址——地址始终是使用者显式意图的记录，把自己的偏好悄悄写进地址再复制给别人是没必要的副作用。
- **`openDetail` 用 `effectiveScope`**，因为详情页要恢复的是使用者看到的视图；从详情返回时地址里带上 `scope=warn`，与生效状态一致，不产生冲突。

缓存写入只发生在 `onScopeChange`（用户勾选/取消）。加载、地址恢复、规范化一律不写，否则打开别人的分享链接就会悄悄改掉自己的偏好。

备选：缓存唯一、`scope` 彻底退出地址（改动更小，但分享链接不再携带勾选态，与既有规格冲突）；缓存优先于地址（会让分享链接失效，直接违背本次选择）。

**5. 缓存模块放在 `src/stores/listPrefs.js`，两个函数、全量兜底。**

```
readAttentionOnly()          -> boolean   缺省 false
writeAttentionOnly(boolean)  -> void      失败静默
```

key 用 `pm.list.attentionOnly`，值为 `'1'` / `'0'`。读写都包在 `try/catch` 里，并对 `typeof localStorage === 'undefined'` 做守卫（隐私模式、被禁用、以及 Node 测试环境下都不存在该对象）。不引入 pinia 之类的状态管理：这是一个单键偏好，不是跨组件共享状态。

**6. 空态文案扩展为四级优先级。**

`emptyDescription` 现有顺序是「加载中 → 取数失败 → 关注集×未知无交集 → 一般无结果」，本次在「无交集」之后、一般无结果之前插入一级「关键词无命中」：

```
loading -> error -> warn×matched=2 -> keyword 非空 -> 没有符合条件的结论
```

插入位置有依据：关键词与关注集是正交维度，若两者同时生效且无结果，优先解释「关注集×未知」这个恒空组合更有信息量；而关键词无命中是可自救的（清空即可），必须与「真的没有数据」区分开。

**7. `buildListQuery` 保留 `matched` 分支，新增 `keyword` 分支。**

API 层是后端契约的镜像，`matched` 即使界面不再使用也应当继续可表达（已有单测锁住缺省不发）。`keyword` 的处理与 `scope` 同风格：只有归一化后非空才写入查询串，长度截断在这一层再做一次，保证任何调用方都不会发出超长参数。

## Risks / Trade-offs

- **隐藏的匹配态不可见，列表变窄时无人解释** → 这是选择 A 的已知代价。缓解：仅存在于「地址显式带 `matched`」这一种情况；将来若要恢复可解释性，加回控件即可，不需要再动状态层。若实际反馈「数据莫名变少」，应优先怀疑地址里的遗留参数而不是后端。
- **缓存回填与地址规范化互相打架** → 若规范化用 `effectiveScope`，打开页面就会把偏好写进地址，分享出去等于外溢偏好。缓解：规范化与 `toListQuery` 只认 `explicitScope`，`openDetail` 才用生效值。
- **防抖回调覆盖后退结果** → 回灌守卫（比对 trim 后的值）+ 地址外部变化时清定时器 + 卸载时清定时器，三者缺一都会复现「点了返回又跳回关键词」。
- **关注集勾选写的缓存被加载逻辑覆盖** → 缓存只在 `onScopeChange` 写入，任何加载路径都不写；这一点需要在实现时显式遵守，否则分享链接会污染偏好。
- **空串 `?scope=` 的归属歧义** → 约定空串等同「未带」，由 `explicitScope` 统一处理并让规范化把该键移除，避免「空值走缓存、非法值不走缓存」的第三种解释。
- **Node 测试环境没有 `localStorage`** → 模块内 `typeof` 守卫是前提；测试用 stub 注入 `globalThis.localStorage` 覆盖「写入后读回」与「访问抛错时降级」两条路径。
- **关键词超长导致 422** → 输入框 `maxlength` 与 `state` 截断双层防护；`buildListQuery` 再截断一次作为最后一道保险。

## Migration Plan

纯前端读侧参数，无数据迁移。上线即生效：

- 旧的 `?matched=1` 链接继续按匹配态过滤，只是界面上没有对应控件。
- 首次访问且无缓存时行为等同当前版本（未勾选、无关键词）。
- 回滚方式：恢复匹配态 `a-select`、移除关键词输入与缓存读取，地址协议向后兼容（`keyword` 会被规范化丢弃）。

## Open Questions

- 关键词是否需要命中高亮：服务端未返回命中区间，本次不做。若产品后续要求，应在后端返回区间而不是前端重跑匹配谓词，届时单开一个 change。
