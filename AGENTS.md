# AGENTS.md

> 面向 AI Agent 的项目开发指南。最后更新：2026-09-14 · 适用分支：main
> 维护约定：改动架构/接口/策略字段/约定后，必须同步更新本文件对应小节（尤其 §3 联动表）。

## 0. 快速上手（30 秒版）

- **项目一句话**：Zitrange 是一个**纯本地运行**的中文字体分包工具——把 10–25MB 的 CJK 字体按 `unicode-range` 切成分片，生成可上线的 woff2 + `@font-face` CSS，浏览器按需下载，字体不出本机。
- **技术栈**：React 19 + Vite 8 + Tailwind v4（CSS-first，设计令牌在 `src/web/index.css` 的 `@theme`，无需 `tailwind.config.js`）；API 用 Node `http` + `tsx`；子集化引擎是 Python `fontTools`。
- **装依赖**：`npm run setup`（`python3 -m venv .venv` + 装 `fonttools`/`brotli` + `npm install`）
- **起服务**：`npm run dev`（前端 :5173、API :5174 同时起，Vite 已代理 `/api` 与 `/output`）
- **跑测试**：`npm run test`（vitest，71 项）；**类型检查**：`npm run typecheck`
- **改代码前必读**：§3 联动表 + `src/core/types.ts`（策略字段定义）+ `src/adapters/pipeline.ts`（处理管线）

## 1. 项目全局认知

### 1.1 目标与定位
本地可视化、可调分片策略、产物落盘的 CJK 字体子集化工具。非目标：云端部署、造字/改字形、URL 渲染抓取、CDN 上传、可变字体 instancing（见 PRD §2.2）。

### 1.2 整体架构（分层 + 目录地图）

```
src/
  core/         纯函数域逻辑（无 I/O、无 DOM，全单测覆盖）。禁止在这里发请求/碰 DOM。
                 charset    字符集：扫描文本/文件 → CharFreq，兜底字表补全
                 partition  分片：单一「按码位均匀切片」模型（basic/common/rare 结构）
                 unicodeRange  码位 → 紧凑 unicode-range 字符串
                 simulate   按需加载模拟（命中哪些片、多少 KB）
                 validate   实时校验（返回 ValidationIssue[]，只提示不阻止）
                 strategy   策略归一化（normalizestrategy 补默认值）
                 coverage   覆盖形态判定（连续 CJK/散点等，驱动提示）
                 presets    三档预设（细/中/粗 = 1500/4000/8000）
                 types      PartitionStrategy / Chunk / FontInfo 等类型（★权威定义）
  adapters/     Node ↔ Python 适配边界
                 python     runPython(script,input)：spawn 解释器，stdin=JSON→stdout=JSON
                 fontEngine inspectFont / subsetChunks（封装 runPython）
                 pipeline   processFont：完整管线（见 §1.5）
                 deps       F5.1 依赖自检（resolvePython / checkEnv / buildEnvReport）
  engine/       Python 子集化脚本（fontTools.subset，两阶段提速）
                 font_inspect.py   取元信息 + 支持码位
                 subset.py         按多组码位切出 woff2/woff/ttf
  api/          Node http 服务（server.ts，PORT=5174，由 vite 代理到 /api）
  web/          React 19 界面
                 App.tsx    顶层状态（font/text/strategy/result）+ 主流程编排
                 components/  CharSourcePanel · FontSourcePanel · StrategyPanel
                             ChunkTable · OutputPanel · FontPreview · SizeComparison
                             EnvBanner · ui.tsx（Panel/Note/HelpTip/Switch 等基元）
                 api.ts      fetch 封装（fetchDeps/processFont/...）
                 useTheme.ts · zip.ts · index.css（Tailwind v4 @theme 设计令牌）
```

**调用方向（单向，禁止反向依赖）**：`web → api → adapters → engine`，`core` 被上述所有层引用但自身零依赖。`adapters` 是 Node↔Python 唯一边界，子集化逻辑**只**在 `engine/`。

### 1.3 技术栈（版本来自 package.json / requirements.txt）
| 层 | 技术 | 版本 |
|---|---|---|
| 前端 | React / react-dom | ^19.2.8 |
| 构建 | Vite + @vitejs/plugin-react | ^8.2.2 / ^6.1.1 |
| 样式 | Tailwind v4（`@tailwindcss/vite`，CSS-first） | ^4.3.3 |
| 运行 API | tsx（watch 跑 `src/api/server.ts`） | ^4.23.13 |
| 测试 | vitest | ^4.1.11 |
| 语言 | TypeScript | ^7.0.2 |
| 引擎 | Python ≥3.10 + fontTools ≥4.50 + brotli ≥1.1 | requirements.txt |
| 运行时 | Node ≥20 | engines |

### 1.4 核心模块职责（含「不负责」）
| 模块 | 负责 | 不负责 |
|---|---|---|
| `core/partition` | 给定字符集+策略，产出 `Chunk[]`（码位分组） | 字体读写、CSS 生成、网络 |
| `core/charset` | 字符集构建（文本扫描 × 兜底 × ASCII 保底 × 全量 cmap） | 分片顺序、子集化 |
| `adapters/pipeline` | 编排 inspect→charset→partition→subset→css→simulate | 任何 Python 实现细节 |
| `adapters/python` | 进程启动 + JSON 通道 + 依赖解析 | 字体算法（交给 engine） |
| `engine/*.py` | 真正的子集化（fontTools） | 业务编排、前端 |
| `api/server` | HTTP 路由、文件落盘(.tmp/uploads、output/)、依赖守卫 | 分片算法、UI |
| `web/App` | 状态编排、调 `/api/process`、渲染结果 | 字体算法、Python 调用 |

### 1.5 数据流 / 业务流程
```
[上传] 前端 File → POST /api/upload → 流式落盘 .tmp/uploads/{uuid}-{name}
  → POST /api/inspect (path, fontNumber) → runPython(font_inspect.py) → FontInfo
  → POST /api/process (path, text, format, strategy, sampleText)
        pipeline.processFont:
          1. inspectFont           取 codepoints 支持集
          2. 字符集 = 文本/文件扫描 × [全量cmap 或 兜底字表('common'=3500)] × ASCII保底
          3. partition(字符集, 策略) → Chunk[]   （ASCII首屏片在前，commonFirst 时常用片随后）
          4. subsetChunks → runPython(subset.py) 切出 font-{i}.{fmt}
          5. toUnicodeRange + toCss（首屏片永载时省略该片 unicode-range）
          6. simulateLoad（有 sampleText 时）
        → 产物写入 output/{jobId}/，返回 {css, chunks[], simulation?}
  → 前端渲染 SizeComparison / ChunkTable / OutputPanel
  → 浏览器经 /output/{jobId}/font-{i}.woff2 取片（API 静态托管 + 长缓存）
```

### 1.6 关键设计原则（真实约束，可验证）
1. **分片模型唯一**：已收敛为「按码位均匀切片」（PRD §6.3）。`baseSize` 是唯一尺寸旋钮（`commonFirst` 是顺序开关，不是另一种模式）；混合/字频/码块模式**已删除**，回归会破坏 UI 与 PRD 一致性。
2. **两个独立维度，勿混淆**：`fallback`（决定「切哪些字」= 补字符集）与 `commonFirst`（决定「怎么切」= 分片顺序）是互不相关的两个开关；UI 已用维度词区分，代码层也注释互斥。新增字段不要复用二者的语义。
3. **首屏片永载**：当 `asciiFirst && asciiAlwaysLoad` 时，ASCII 片**省略 `unicode-range`** 让浏览器无条件下载；`toCss` 用 `codepoints.every(isAsciiOrPunct)` 定位该片区，改分片逻辑须同步此处匹配条件。
4. **Python 解释器不硬编码**：`resolvePython()` 按 `$ZITRANGE_PYTHON → .venv/bin/python → PATH python3` 顺序探测并缓存（F5.1）。缺依赖时 API 返回 503 + 安装步骤，前端 `EnvBanner` 展示；**不要**把 `.venv` 路径写死回 `runPython`。
5. **CORS 全开 + 路径穿越防护**：本地工具，CORS `*`，但 `/api/raw` 与 `/output` 有 `ROOT` 前缀与扩展名白名单校验，新增文件读取接口须沿用该防护。

## 2. 开发规则

- **2.1 代码组织**：纯逻辑进 `core/`，Node↔Python 边界进 `adapters/`，算法进 `engine/`，HTTP 进 `api/`，界面进 `web/`。`core/` 保持零 I/O、零 DOM。
- **2.2 命名**：类型用 `PascalCase`（`PartitionStrategy`/`Chunk`），接口入参 `Request`/`Result`（`ProcessRequest`/`ProcessResult`）；常量枚举 `FALLBACKS`/`OutputFormat`。组件 `PascalCase.tsx`，组件文件与默认导出同名。
- **2.3 文件结构**：`core/` 每个 `.ts` 配同名 `.test.ts`；组件导出默认函数 + 局部子组件。
- **2.4 拆分原则**：可单测的纯函数提到 `core/`；跨多步的编排放 `adapters/pipeline`；不把算法塞进组件或 server handler。
- **2.5 接口规范**：所有 `/api/*` 走 JSON；请求体由 `readBody` 解析，错误统一 `sendJson(res, 4xx/5xx, {error})`。新增策略字段：在 `core/types.ts` 定义 → `strategy.ts` 归一化 → `StrategyPanel` UI → `pipeline.ts` 读取，四处同步。
- **2.6 错误处理**：Python 失败透传 stderr；缺模块时 `moduleHint` 给 `npm run setup` 指引；API 顶层 `try/catch` 兜底 500。前端 `App.runProcess` 的 `catch` 写入 `error` 状态行。
- **2.7 日志**：仅 API 侧 `console.log`（依赖自检、监听地址）；子集化细节在 Python stderr，不回流到前端。禁止在前端 `console.log` 调试残留。
- **2.8 测试**：vitest，覆盖在 `src/**/*.test.ts`。`core/` 改动**必跑** `npm run test`；`partition`/`charset`/`validate`/`unicodeRange`/`simulate`/`strategy` 均有契约测试，改逻辑先读对应 `.test.ts` 的行为预期。

## 3. AI Agent 开发指导 ★最高优先级★

### 3.1 改动前必须了解
- 改**分片逻辑** → 先读 `src/core/partition.ts` + `src/core/types.ts#PartitionStrategy` + `partition.test.ts`。
- 改**字符集/兜底** → 先读 `src/core/charset.ts`（含 `COMMON_TABLE`/`FALLBACK_SIZES`/`ASCII_PUNCT`）。
- 改**处理管线/产物命名** → 先读 `src/adapters/pipeline.ts`（尤其 `toCss` 的 `asciiIdx` 匹配）。
- 改 **API/依赖** → 先读 `src/api/server.ts` + `src/adapters/deps.ts`（解释器解析顺序、白名单）。
- 改 **Python 引擎** → 先读 `src/engine/subset.py` 与 `font_inspect.py` 的 stdin/stdout JSON 约定。

### 3.2 禁止随意修改的文件（含原因）
- **`src/adapters/python.ts` 的 `resolvePython`/`candidates`**：不要把 `.venv` 路径重新硬编码——F5.1 已刻意移除硬编码以支持 `$ZITRANGE_PYTHON` 与系统 Python。
- **`src/core/partition.ts`**：不要加回 混合/字频/码块 模式分支。单一「按码位均匀切片」是 PRD §6.3 既定收敛，回归会破坏 UI 与 PRD 一致性。
- **`package-lock.json` / `requirements.txt`**：锁版本文件，改动须有理由并跑 `npm install`。
- **`output/` / `.tmp/`**：运行时生成物，已被 `.gitignore` 忽略，勿提交、勿手动编辑产物。

### 3.3 强依赖联动表（改动联动）
| 改 A | 必须同步改 B |
|---|---|
| `PartitionStrategy` 新增/改名字段 | `core/types.ts` ↔ `strategy.ts`(normalize) ↔ `web/components/StrategyPanel.tsx`(UI) ↔ `adapters/pipeline.ts`(读取) |
| 产物文件名 `{baseName}-{index}.{fmt}` | `pipeline.ts`(subsetChunks 入参 + `toCss` 的 url) ↔ `web/components/ChunkTable.tsx`(下载) ↔ `web/components/OutputPanel.tsx` |
| `unicode-range` / 首屏片逻辑 | `core/partition.ts`(片顺序) ↔ `core/unicodeRange.ts` ↔ `pipeline.ts`(`toCss` 的 `asciiIdx` 匹配：`every(isAsciiOrPunct)`) |
| API 路由/返回字段 | `api/server.ts` ↔ `web/api.ts`(fetch 封装) ↔ 调用组件(`App`/`EnvBanner`) |
| `commonFirst` 语义 | 勿与 `fallback` 合并；二者在 UI 提示、注释、类型中均标注为独立维度 |

### 3.4 常见错误模式（真实踩坑）
- **TDZ 报错 `Cannot access 'X' before initialization`**：React 函数组件内，派生 `const` 必须在被引用的位置**之前**声明（曾因 `asciiFirstOn` 提前引用触发）。新增派生变量检查声明顺序。
- **把 README 当事实源**：README 仍描述「混合/字频/站点三模式」「无 zip 按钮」，而代码已收敛为单一模型且加了 zip 下载。**以代码 + `docs/prd.md` 为准**，README 仅作安装/启动参考。
- **端口占用 `EADDRINUSE :5173/:5174`**：残留 dev 进程未退出。重启前先杀掉旧进程（`lsof -ti:5173,5174 | xargs kill`）。
- **在 Node 侧重写子集化**：字体算法只在 `engine/*.py`（fontTools）。Node 侧只经 `runPython` 调用，勿把 pyftsubset 逻辑搬进 TS。
- **改了字段漏同步 UI/归一化**：`PartitionStrategy` 字段若只在 `types.ts` 加、未在 `strategy.ts` 归一化，界面可能拿到 `undefined` 默认。

### 3.5 推荐开发流程
1. 改 `core/`（纯函数，**先读对应 `.test.ts` 的行为契约**）。
2. 改 `adapters/` 或 `api/` 或 `web/`（按需）。
3. `npm run typecheck` + `npm run test` 必须全绿。
4. `npm run dev` 手动走主流程（加载字体 → 生成分片 → 看体积对比/分片清单/CSS）。
5. 提交（commit 风格见 git log：`<type>(<scope>): <中文短句>`，如 `feat(core)`、`refactor(ui)`、`fix(partition)`）。

### 3.6 Debug 排查顺序
- **前端不渲染/报错** → 浏览器 console + `App` 状态；确认 `npm run dev` 两个进程都起。
- **产物缺字** → 字符集是 `文本 ∪ 兜底 ∪ ASCII保底` 与字体 `cmap` 的**交集**；扩大兜底或补文案。
- **依赖/Python 报错** → 调 `/api/deps` 看 `EnvReport`；或 `npm run setup` 重建 `.venv`。
- **字体文件 404** → 检查 vite.config 的 `/api`、`/output` 代理是否到位；产物路径 `output/{jobId}/`。
- **`.ttc/.otc` 只切出部分字** → 集合体默认 `fontNumber=0`，换面需传 `fontNumber`。

### 3.7 回归清单（避免破坏已有功能）
- [ ] `npm run typecheck` 通过（TS 全量）。
- [ ] `npm run test` 全绿（当前 71 项；`core` 改动尤其要过）。
- [ ] 主流程手测：全量模式（默认）出片、仅用户内容 + 兜底、开启 `commonFirst`、ASCII 首屏片开关、zip 下载。
- [ ] 若改 `toCss`/`partition`：确认首屏片 `unicode-range` 省略逻辑仍正确（浏览器无条件下载 ASCII 片）。

## 4. 文档索引

| 文档 | 路径 | 用途 | 重要度 | 何时查看 |
|---|---|---|---|---|
| PRD（权威规格） | `docs/prd.md` | 功能表(§5)、架构/处理(§6-§7)、验收(§10)、状态与优化建议(§12) | 🔴必读 | 任何功能/接口/验收相关判断 |
| 类型定义 | `src/core/types.ts` | `PartitionStrategy`/`Chunk`/`FontInfo` 字段权威来源 | 🔴必读 | 改策略/接口字段 |
| 处理管线 | `src/adapters/pipeline.ts` | 管线顺序 + `toCss` 首屏片逻辑 | 🔴必读 | 改产物/CSS/分片联动 |
| README | `README.md` | 用户向安装/启动/操作（**行为描述已过时**，以代码+PRD 为准） | 🟡常用 | 装环境、写用户文档时 |
| 行为契约 | `src/**/*.test.ts` | 各纯函数的预期行为 | 🟡常用 | 改 `core/` 前 |
| 设计令牌 | `src/web/index.css` | 颜色/字号/主题变量（`--c-*`/`--l-*`/`--d-*`） | 🟢参考 | 改样式 |

**快捷路由**：架构问题 → `docs/prd.md` §6；数据模型 → `src/core/types.ts`；API → `src/api/server.ts`；业务规则 → PRD §5；部署/环境 → README §3 + `src/adapters/deps.ts`。

## 5. 当前项目状态

### 5.1 已完成模块
- 单一「按码位均匀切片」分片模型；ASCII 首屏片 + 首屏片永载；`commonFirst` 常用字优先分片；三档预设（细/中/粗）。
- 全量字体拆分（`useFontCmap`）；兜底字表 `common`（前 3500 字）；ASCII/标点保底。
- 子集化（woff2/woff/ttf）、两阶段提速；`@font-face` CSS 生成；`unicode-range` 紧凑模式（256 块通配符，可选）。
- 前端：加载/字体预览/字符源/策略面板/体积对比/分片清单(逐片+全量 zip 下载)/产物预览/按需加载模拟/实时校验(`?` 提示)。
- F5.1 依赖自检（`/api/deps` + `EnvBanner`）；字体/集合(`fontNumber`)支持。

### 5.2 开发中模块
- 无（相对空闲，可承接 PRD §12.2 优化项）。

### 5.3 未完成计划（PRD §12.2，按价值）
- **P0 批量多字重**：`/api/process` 仅收单字体，G2「一次任务处理多字重家族」未打通（需 `/api/job` + 并发限流）。
- **P0 任务取消**：无 `/api/cancel` + 子进程组 kill，大字体任务无法中途停止。
- **P1 report.json**（F3.5）：zip 产物未含 `{originalSize,totalSize,coverage,missingChars}`。
- **P2 方案保存**（F2.12）、**P2 F4.6 分片覆盖核对**（悬停字符样本）等。

### 5.4 技术债务
- **README 与实现严重漂移**（最该修）：README 仍写「三模式 + 无 zip」，与代码/PRD 完全不符；任何基于 README 的判断都会出错。

### 5.5 已知问题（现象 + 规避）
- **稀疏字体 range 仍长**：如 7900 个散点字符，开启 `commonFirst` 只改善「常用字优先加载」、**不缩短** `unicode-range`（散点固有限制）；UI 已有稀疏提示。
- **端口占用**：重启前杀残留 dev 进程（见 §3.4）。
- **`.ttc/.otc` 默认取首个字形面**（`fontNumber=0`）。

### 5.6 后续规划 / 路线图
- 批量多字重（G2）+ 任务取消（F3.7）→ 解锁 PRD §10.6 验收。
- 桌面化演进为 Tauri（G5，UI 零改动，架构已预留）；不引入云端/多租户（N2）。

## 6. 变更记录（本文件）
- 2026-09-14：初版生成。依据实际代码 + `docs/prd.md` + `package.json` + git log 取证；明确标注 README 已过时、单一分片模型收敛、F5.1 解释器不硬编码、常见 TDZ/端口踩坑。
