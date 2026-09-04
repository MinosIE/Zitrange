# 中文字体拆分方案（unicode-range 分片）

> 状态：方案已定（方案 B），待实施。
> 本文档为**可直接照做的执行手册**：含精确 unicode-range 区间、可复制的生成脚本、完整 @font-face 声明与验证方法。

## 一、背景

全站采用「得意黑标题 + 思源黑体正文」混排，字体本地自托管于 `apps/web/public/fonts/`：

| 字体 | 文件 | 体积 | 用途 |
|---|---|---|---|
| 思源黑体 400 | `noto-regular.woff2` | 1.14 MB | 正文 |
| 思源黑体 700 | `noto-700.woff2` | 1.17 MB | 正文粗体 |
| 得意黑 Smiley Sans | `smiley-sans.woff2` | 1.36 MB | 标题（100–900） |

三款合计约 **3.67 MB**，当前经 `next/font/local` 注入，浏览器首屏需下载全量字体。

> 已清理：`public/fonts/sub/`（零引用子集产物 1.9 MB）、`zcool.woff2` + `font-preview` 页（字体选型完成后删除，共 1.77 MB）。当前 `public/fonts/` 仅保留上述 3 个在用字体。

## 二、目标

用 `unicode-range` 拆分字体，让浏览器**只下载渲染当前页面所需的字形子集**：首屏体积显著下降，同时生僻字/动态内容不缺字。

## 三、方案 B：手写 @font-face + unicode-range 分片

脱离 `next/font`，改为在全局 CSS 手写 `@font-face`，每款字体拆两片：

- **common 片（首屏）**：源码实际汉字（771 字）+ 常用 3500 字连续区间，首屏立即下载。
- **ext 片（懒加载）**：剩余 CJK 基本区 + 扩展 A 区，仅在出现生僻字时按需下载。

### 3.1 需拆分的字体（3 个）

| 字体 | 字重 | 输出文件（6 个） |
|---|---|---|
| 思源黑体 400 | `400` | `noto-regular-common.woff2` / `noto-regular-ext.woff2` |
| 思源黑体 700 | `700` | `noto-700-common.woff2` / `noto-700-ext.woff2` |
| 得意黑（标题） | `100 900` | `smiley-sans-common.woff2` / `smiley-sans-ext.woff2` |

输出目录：`public/fonts/sub/`（脚本会自动创建）。

### 3.2 分片与 unicode-range 定义（两片严格互斥）

| 片 | 字符集 | unicode-range |
|---|---|---|
| **common**（首屏） | 源码实际汉字 + 常用 3500 字 `U+4E00–U+5BAB` + 拉丁/数字/标点 | `U+4E00-5BAB, U+0020-007E, U+3000-303F, U+FF00-FFEF, U+2018-201F, U+2026, U+00B7` |
| **ext**（懒加载） | 剩余 CJK 基本区 `U+5BAC–U+9FFF` + 扩展 A 区 `U+3400–U+4DBF` | `U+5BAC-9FFF, U+3400-4DBF` |

> 区间推导：常用 3500 字取 `range(0x4E00, 0x4E00+3500)`，末位为 `0x5BAB`；ext 从 `0x5BAC` 起，两片无缝且互斥。
> 源码 771 字中若有超出 `U+4E00–U+5BAB` 的汉字，会走 ext 片（功能正常，仅该字延迟）。

### 3.3 生成脚本（可整段复制，在 `apps/web/` 下执行）

```bash
cd /Users/wedo/Study/jingcai/apps/web

# 1) 环境准备
python3 -m venv /tmp/ft_env
/tmp/ft_env/bin/pip install fonttools brotli
PY=/tmp/ft_env/bin/python3
PYS=/tmp/ft_env/bin/pyftsubset

# 2) 生成 common 片字符集：源码汉字 + 常用 3500 字 + 拉丁/数字/标点
$PY - <<'PYEOF'
import glob
chars = set()
for ext in ('tsx', 'ts', 'md', 'json'):
    for f in glob.glob(f'src/**/*.{ext}', recursive=True):
        try:
            t = open(f, encoding='utf-8').read()
        except Exception:
            continue
        chars |= {c for c in t if '\u4e00' <= c <= '\u9fff'}
chars |= {chr(c) for c in range(0x4E00, 0x4E00 + 3500)}   # 常用 3500 字 U+4E00-U+5BAB
chars |= {chr(c) for c in range(0x20, 0x7f)}                # 拉丁/数字/半角标点
chars |= {chr(c) for c in range(0x3000, 0x3040)}            # 中文标点
chars |= {chr(c) for c in range(0xFF00, 0xFFF0)}            # 全角字符
chars |= set('…·“”—’‘')
open('/tmp/charset-common.txt', 'w', encoding='utf-8').write(''.join(sorted(chars)))
print('common 字符集字数:', len(chars))
PYEOF

# 3) 生成 3 款字体 × common 片
mkdir -p public/fonts/sub
for n in noto-regular noto-700 smiley-sans; do
  $PYS "public/fonts/$n.woff2" \
    --output-file="public/fonts/sub/$n-common.woff2" \
    --flavor=woff2 --text-file=/tmp/charset-common.txt \
    --no-hinting --layout-features='*'
done

# 4) 生成 3 款字体 × ext 片（剩余 CJK + 扩展 A 区）
for n in noto-regular noto-700 smiley-sans; do
  $PYS "public/fonts/$n.woff2" \
    --output-file="public/fonts/sub/$n-ext.woff2" \
    --flavor=woff2 --unicodes="U+5BAC-9FFF,U+3400-4DBF" \
    --no-hinting --layout-features='*'
done

ls -la public/fonts/sub/
```

### 3.4 完整 @font-face 声明（写入 `apps/web/src/app/globals.css`）

```css
/* ===== 正文：思源黑体 Noto Sans SC ===== */
@font-face {
  font-family: "NotoSC";
  src: url("/fonts/sub/noto-regular-common.woff2") format("woff2");
  font-weight: 400; font-style: normal; font-display: swap;
  unicode-range: U+4E00-5BAB, U+0020-007E, U+3000-303F, U+FF00-FFEF, U+2018-201F, U+2026, U+00B7;
}
@font-face {
  font-family: "NotoSC";
  src: url("/fonts/sub/noto-regular-ext.woff2") format("woff2");
  font-weight: 400; font-style: normal; font-display: swap;
  unicode-range: U+5BAC-9FFF, U+3400-4DBF;
}
@font-face {
  font-family: "NotoSC";
  src: url("/fonts/sub/noto-700-common.woff2") format("woff2");
  font-weight: 700; font-style: normal; font-display: swap;
  unicode-range: U+4E00-5BAB, U+0020-007E, U+3000-303F, U+FF00-FFEF, U+2018-201F, U+2026, U+00B7;
}
@font-face {
  font-family: "NotoSC";
  src: url("/fonts/sub/noto-700-ext.woff2") format("woff2");
  font-weight: 700; font-style: normal; font-display: swap;
  unicode-range: U+5BAC-9FFF, U+3400-4DBF;
}

/* ===== 标题：得意黑 Smiley Sans ===== */
@font-face {
  font-family: "SmileySC";
  src: url("/fonts/sub/smiley-sans-common.woff2") format("woff2");
  font-weight: 100 900; font-style: normal; font-display: swap;
  unicode-range: U+4E00-5BAB, U+0020-007E, U+3000-303F, U+FF00-FFEF, U+2018-201F, U+2026, U+00B7;
}
@font-face {
  font-family: "SmileySC";
  src: url("/fonts/sub/smiley-sans-ext.woff2") format("woff2");
  font-weight: 100 900; font-style: normal; font-display: swap;
  unicode-range: U+5BAC-9FFF, U+3400-4DBF;
}
```

### 3.5 配套代码改动（3 个文件）

1. **`apps/web/src/app/layout.tsx`**
   - 删除 `import localFont` 及 `notoSansSC` / `smileySans` 两个 `localFont` 定义。
   - `<html>` 去掉 `${notoSansSC.variable} ${smileySans.variable}`。
2. **`apps/web/src/app/globals.css`** `:root`
   - `--font-sans-sc` 的 `var(--font-sans-sc)` 改为 `"NotoSC", <系统兜底>`。
   - `--font-display` 改为 `"SmileySC", "NotoSC", <系统兜底>`。
   - ⚠️ **不要自引用同名变量**（如 `--font-display: var(--font-display)`），此前已踩坑，会导致变量失效回退。
3. **`apps/web/tailwind.config.ts`**
   - `fontFamily.sans` 首项改 `"NotoSC"`；`fontFamily.display` 首项改 `"SmileySC"`。

### 3.6 预期收益

- 首屏字体体积：从 ~3.67 MB 降至 common 片合计约 **0.9 MB**（实测值：思源 400 ≈276 KB、思源 700 ≈282 KB、得意黑 ≈335 KB），降幅约 **76%**。
- ext 片约 1.1 MB，但懒加载、不进首屏；营销站文案固定，基本不触发。
- 生僻字/动态内容（如用户生成的商拍文案）通过 ext 片按需下载，不缺字。

### 3.7 风险与注意

- 字体/CSS 变量/`tailwind.config.ts` 改动 **HMR 不生效**：须 `rm -rf .next` 后重启 dev，浏览器 `Cmd+Shift+R` 强刷（woff2 响应头 `Cache-Control: immutable`）。
- `unicode-range` 必须覆盖标点与拉丁字符，否则数字/英文 fallback 异常（common 片已含 `U+0020-007E` 等）。
- 得意黑为斜体窄身，仅作标题；两片均需为其单独生成。
- **每次新增/修改文案后需重跑 3.3 生成脚本**，否则新出现的汉字会走 ext 片或 fallback。

### 3.8 验证方法

```bash
rm -rf .next && pnpm dev
```

- DevTools → Network 筛 `woff2`：**首屏应只看到 3 个 `-common.woff2`**。
- 滚动/输入生僻字时才出现 `-ext.woff2`，即懒加载生效。
- Elements → 选中标题 → Computed → `font-family` 应显示 `SmileySC`；正文显示 `NotoSC`。

## 四、备选方案（未采用）

- **方案 A（精确子集）**：仅把字体换成 4271 字子集版（保留 next/font 管理），首屏同样小 75%、改动最小，但动态内容超出的字会 fallback 系统字体、不可懒加载补全。
- 选定方案 B 以换取「首屏最小 + 生僻字不缺」。

## 五、待办（实施时）

- [ ] 安装 fonttools 虚拟环境（或复用 `/tmp/ft_env`）
- [ ] 跑 3.3 脚本，生成 3 款字体 × 两片共 6 个 woff2
- [ ] `globals.css` 写入 3.4 的 6 个 @font-face
- [ ] 改写 `layout.tsx` 去 next/font，同步 `:root` 变量（避免自引用）
- [ ] 同步 `tailwind.config.ts` 的 `fontFamily`
- [ ] `rm -rf .next` + 重启 + 强刷，按 3.8 验证
- [ ] 构建通过、确认首屏仅加载 3 个 common 片
