# Zitrange 设计标准（Design Standard）

```
项目：Zitrange · 中文字体分包与优化工具
版本：v1.1
模式：纪律模式（Disciplined）
技术栈：React 19 + Tailwind v4 + Vite，明暗双主题
更新日期：2026-09-03
```

---

## 1. 设计原则

1. **一致性优先** — 同类元素用同一套 token，不另起样式；牺牲个性换可维护性。
2. **密度服从功能** — 工具型界面允许信息密度，但不牺牲扫描性（数字列右对齐、等宽、制表对齐）。
3. **状态可辨识** — 成功/警告/错误/进行中各有统一色，不靠文案单独表达。
4. **明暗同构** — 双主题共用同一套语义 token，只换值不换结构；切换后不重排、不丢失层级。
5. **数据诚实** — 可视化不得为了好看而扭曲比例（体积对比条按真实比例绘制）。

## 2. 色彩系统

采用 Stripe 风基线：**brand 主色 + ink 中性阶 + cyanx 点缀 + 语义五档**。

### Light（默认）

| Token | 值 | 用法 |
|---|---|---|
| `brand` | `#635BFF` | 主按钮、关键强调、选中态 |
| `brand-hover` | `#5851E8` | 主按钮 hover |
| `brand-100` | `#EFEEFF` | 浅色徽章、选中行背景 |
| `brand-50` | `#F7F7FF` | 主色极浅底 |
| `ink-900` | `#0A2540` | 标题 / 主文字 |
| `ink-700` | `#1A3A5C` | 次级文字 |
| `ink-500` | `#425466` | 正文 |
| `ink-400` | `#697386` | 辅助文字 |
| `ink-300` | `#8792A2` | 占位符 |
| `ink-200` | `#C1C9D2` | 边框（strong） |
| `ink-100` | `#E3E8EE` | 边框 / 分隔线 |
| `ink-50` | `#F6F9FC` | 页面底 |
| `surface` | `#FFFFFF` | 卡片底 |
| `cyanx` | `#00D4FF` | 点缀 / 高亮 |

### Dark

| Token | 值 | 用法 |
|---|---|---|
| `brand` | `#8B85FF` | 暗底提亮，保证对比度 |
| `brand-hover` | `#A29DFF` | hover |
| `brand-100` | `#2A2A5E` | 浅底反相为深底 |
| `brand-50` | `#1B1B3A` | 极浅底反相 |
| `ink-900` | `#E8EEF7` | 标题（暗底最亮） |
| `ink-700` | `#C3CEDC` | 次级文字 |
| `ink-500` | `#9AA7B8` | 正文 |
| `ink-400` | `#7D8A9C` | 辅助文字 |
| `ink-300` | `#63718A` | 占位符 |
| `ink-200` | `#3A4A63` | 边框（strong） |
| `ink-100` | `#26344A` | 边框 / 分隔线 |
| `ink-50` | `#131C2B` | 卡片底 |
| `surface` | `#131C2B` | 卡片底 |
| `page` | `#0A1120` | 页面底 |
| `cyanx` | `#22D3EE` | 点缀 |

### 语义色（五档）

| 语义 | Light | Dark |
|---|---|---|
| success | `#10B981` / bg `#D1FAE5` | `#34D399` / bg `#064E3B` |
| warning | `#F59E0B` / bg `#FEF3C7` | `#FBBF24` / bg `#78350F` |
| danger | `#EF4444` / bg `#FEE2E2` | `#F87171` / bg `#7F1D1D` |
| info | `#3B82F6` / bg `#DBEAFE` | `#60A5FA` / bg `#1E3A8A` |

**规则**
- 文字只用 `ink` 中性阶，**禁止用主色当正文色**。
- 语义色只表达状态，不做装饰。
- 明暗切换只换 token 值，组件不写死颜色。

## 3. 排版系统

```
巨号数字 / 品牌名 : Songti SC（中文衬线，排印重量感，仅用于体积对比数字与 Logo）
标题 / 正文       : PingFang SC（中文黑体）
数据 / 代码       : SF Mono / JetBrains Mono（等宽，制表对齐）
```

| 级别 | 字号/行高/字重 | 用途 |
|---|---|---|
| D1 | 40/46/700 | 体积对比的巨号数字 |
| H1 | 24/32/600 | 品牌名 |
| H2 | 16/24/600 | 面板标题 |
| H3 | 14/20/600 | 卡片标题 |
| Body | 13/20/400 | 正文 |
| Caption | 12/16/400 | 辅助说明 |
| Micro | 11/14/500 | 标签、表头 |

**规则**
- 层级靠字号 + 字重 + 中性色阶建立，**不靠颜色**。
- 禁用 Inter / Roboto / Arial / 系统默认字体栈。
- 所有数字用等宽 + `tabular-nums`。

## 4. 间距与布局

```
间距阶梯：4 / 8 / 12 / 16 / 24 / 32 / 48
容器：max-w-[1440px]，左右 padding 24
栅格：grid-cols-[380px_1fr]，gap 16
区块垂直节奏：面板之间 16
```

**规则**
- **全禁 margin** —— 一律 `flex` / `grid` + `gap`。禁止 `m-*` `mt-*` `mb-*` `ml-*` `mr-*` `mx-*` `my-*` `space-*`。
- 禁止 `mx-auto`，居中用父级 `flex justify-center`。
- 内间距（padding）不受限，但只用阶梯值。

**左右失衡的修正**：右栏不得出现空壳。未生成结果时，用 `core/recommend` 纯函数给出的**预估值**填充体积对比与建议区（标注「预估」），使左右两栏在任何状态下都有可比的视觉重量。

## 5. 圆角与阴影

```
圆角：8 / 12 / 16 / 24（四级，禁止 13px 这类随手值）
阴影：
  soft : 0 1px 2px rgba(10,37,64,.04), 0 2px 8px rgba(10,37,64,.04)
  card : 0 1px 3px rgba(10,37,64,.06), 0 8px 24px rgba(10,37,64,.06)
  lift : 0 2px 4px rgba(10,37,64,.06), 0 16px 40px rgba(10,37,64,.10)
```

**规则**：阴影只表达层级，不做装饰；低透明度 + 大模糊，避免硬黑阴影。

## 6. 组件规范

| 组件 | 结构 | 状态 | 禁止 |
|---|---|---|---|
| 按钮 | 图标(可选)+文案，高度 36/40，圆角 8 | default/hover/active/disabled/loading | 渐变 + 描边 + 阴影三者叠加 |
| 输入框 | 标签 + 输入区 + 提示/错误文案，高度 36 | default/focus/error/disabled | 用原生 placeholder 当标签 |
| 卡片（面板） | 头部(序号+标题+操作) + 内容 | default/hover/selected | 内容区自带外边距 |
| 表格 | sticky 表头 + 行 hover + 圆角包裹 | default/hover/selected/empty | **禁用原生 `select`** |
| 徽章 | 语义色浅底 + 深字 + 圆角 8 | success/warning/danger/info/neutral | 自造语义色 |
| 下拉 | 自定义：触发器 + 浮层列表 | default/open/disabled | **原生 `<select>`**（暗色下 option 无法定制） |
| 主题切换 | 图标按钮，位于 header | light/dark | 刷新后丢失选择 |
| 进度 | 斜纹流动条，不透明遮罩 | running/done | 用 `vh` 撑高度 |

## 7. 动效规范

```
时长：微交互 120–160ms / 常规 200–240ms / 页面级 320–400ms
曲线：cubic-bezier(.2,.8,.2,1)
允许：opacity / transform / 高度展开 / staggered reveal
```

**规则**：动效克制，只用于反馈与展开，不做装饰；尊重 `prefers-reduced-motion`。

## 8. 主题切换机制

- `<html data-theme="light|dark">` 驱动，`tokens.css` 内两套变量。
- 初始值取 `localStorage['zr-theme']`，未设置则跟随 `prefers-color-scheme`。
- 切换不触发组件重挂载，纯 CSS 变量换值。

## 9. 红线清单（可 grep 校验）

```bash
# 应全部为空
grep -rnoE '\b(m|mt|mb|ml|mr|mx|my)-[0-9a-z.\[\]-]+|space-[xy]-' src/web/
grep -rnoE '[0-9]+vh|h-screen|mx-auto' src/web/
grep -rnoE 'rounded-\[[0-9]+px\]' src/web/     # 圆角只能用 8/12/16/24
grep -rn '<select' src/web/                     # 禁用原生 select
```

## 10. 交付物清单

- [x] `docs/design-standard.md`（本文档）
- [ ] `src/web/styles/tokens.css`（源码级 token，明暗双主题）
- [ ] 明暗主题切换（localStorage + 系统偏好）
- [ ] 布局失衡修正（右栏预估态填充）
- [ ] 红线重构：零 margin / 圆角分级 / 阴影三档 / 自定义下拉
- [ ] 红线校验通过
