# 字体子集（subsets）说明

本目录下的 `.woff2` 文件是由 **Alibaba PuHuiTi** 四个字重（Light/Regular/Medium/Bold）
的 OTF 源字体按需拆分出的子集，配合 `unicode-range` 实现「页面用到哪些字、哪个字重，
才加载哪些子集」，避免一次性下载约 26MB 的全量字库。

## 拆分逻辑

源字体（均位于 `public/assets/font/`）：

- `Alibaba-PuHuiTi-Light.otf`（weight 300）
- `Alibaba-PuHuiTi-Regular.otf`（weight 400）
- `Alibaba-PuHuiTi-Medium.otf`（weight 500）
- `Alibaba-PuHuiTi-Bold.otf`（weight 700）

拆分工具：[`fonttools`](https://github.com/fonttools/fonttools) 的 `pyftsubset`
（通过 `scripts/split-font.mjs` 调用，需先在 venv 中 `pip install "fonttools[woff]"`）

每个字重的拆分规则相同：

1. **基础片 `subset-{weight}-basic.woff2`**：固定包含 ASCII 可见字符 + 中文标点区 + 全角符号
   - `U+0020-007E`（英文、数字、半角标点）
   - `U+3000-303F`（CJK 符号和标点）
   - `U+FF00-FFE5`（全角字符）
   - 首屏几乎必载，约 10 KB

2. **常用字片 `subset-{weight}-common.woff2`**：把源字体中 **CJK 统一汉字区
   （U+4E00–U+9FFF）内码位排序后的前 3000 个字符**单独成一片
   （常量 `COMMON_COUNT = 3000`，近似 GB2312 一级常用字区）。约 400 KB，首屏几乎必载。

3. **生僻字片 `subset-{weight}-rare-1.woff2` ~ `subset-{weight}-rare-5.woff2`**：
   码位前 3000 之后的剩余汉字按码位顺序每 4000 个切一片
   （常量 `RARE_PER_SLICE = 4000`），连续码位合并为区间写入 `unicode-range`。
   - 粒度权衡：越细越精准但单页面请求数飙升（同页面分散用字会触发所有命中的片），
     4000 是请求数与体积的常用平衡点。实测单页字体请求数约 22 次。
   - 浏览器根据页面实际出现的汉字命中对应区间，仅下载用到的那几片。

4. 所有子集均用 `--flavor=woff2` 输出（内部 Brotli 压缩）。

## 文件命名

每个字重一组，前缀区分字重：

| 前缀 | 字重 | 说明 |
|------|------|------|
| `subset-light-*`    | 300 | Light（含 `-basic`/`-common`/`-rare-{1..5}`） |
| `subset-regular-*`  | 400 | Regular |
| `subset-medium-*`   | 500 | Medium（加粗文本使用） |
| `subset-bold-*`     | 700 | Bold |

每个字重共 7 个子集：1 个 `basic` + 1 个 `common` + 5 个 `rare`，全站共 28 个。

> 注：范围与大小为生成当时的快照，重跑脚本后可能变化。

## 在项目中如何被引用

实际的 `@font-face` 声明位于 **`src/font-subsets.scss`**
（由 `src/style.scss` 顶部 `@use './font-subsets.scss';` 引入），
由 `scripts/split-font.mjs` 直接生成，请勿手改。

每个子集声明 `font-family: 'Alibaba PuHuiTi 2.0';` + 对应 `font-weight`，
并带各自的 `unicode-range`，实现按需加载。浏览器按 `font-weight` 自动匹配
真实 Medium/Bold，恢复加粗效果（不再依赖伪粗体）。

## 重新生成

```bash
# 1. 创建并激活 venv（首次）
python3 -m venv .venv-font
. .venv-font/bin/activate
pip install "fonttools[woff]"

# 2. 运行拆分脚本
node scripts/split-font.mjs
```

## 注意事项

- 切片仅覆盖源字体已有的字形；若页面用到源字体不含的字符，
  浏览器会回退到系统字体（本项目咨询文案为后台动态配置，无法预知全量字，
  故采用按 Unicode 区块均匀切片，而非按「页面已用字」切片）。
- 多字重意味着汉字子集在四个字重下各存一份（轮廓不同，无法跨字重共享）。
  但浏览器按需加载：仅当页面出现某字重的文字时才下载对应子集，
  首屏通常只需 4 个字重的 `basic`（各 ~10KB）+ 各自 `common`（各 ~400KB），
  约 1.7MB 且单包均 <500KB；`rare` 片仅当页面用到对应生僻字时才下载。
- 本目录文件会随 `public/` 进入版本库（未被 `.gitignore` 忽略）。
- `.venv-font/` 为本地拆分工具虚拟环境，已被 `.gitignore` 忽略，请勿提交。
