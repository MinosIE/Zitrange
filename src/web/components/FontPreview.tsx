import { useEffect, useState } from 'react';
import type { LoadedFont } from './FontSourcePanel';
import { rawFontUrl } from '../api';
import { Panel } from './ui';

// 扩展名 -> @font-face format() 提示；ttc/otc 集合体浏览器取首个字形面，预览足够用
const FORMAT_HINT: Record<string, string> = {
  '.ttf': 'truetype',
  '.otf': 'opentype',
  '.woff': 'woff',
  '.woff2': 'woff2',
  '.ttc': 'truetype',
  '.otc': 'opentype',
};

const DEFAULT_SAMPLE =
  '永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭，修禊事也。\n' +
  '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。寒来暑往，秋收冬藏。\n' +
  '轻量分包，按需加载，让中文网页秒开。';

const FAMILY = 'zr-preview';

export function FontPreview({ font }: { font: LoadedFont }) {
  const [text, setText] = useState(DEFAULT_SAMPLE);
  const [size, setSize] = useState(26);

  const ext = '.' + (font.fileName.split('.').pop() ?? 'ttf').toLowerCase();
  const format = FORMAT_HINT[ext] ?? 'truetype';

  // 把上传字体注册为 webfont：/api/raw 经 Vite 代理指向本地 API，
  // 同一台机器上 Node 直接读盘返回字体二进制，浏览器即可用其渲染。
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.zrPreview = '1';
    style.textContent =
      `@font-face{font-family:'${FAMILY}';` +
      `src:url('${rawFontUrl(font.path)}') format('${format}');` +
      `font-display:swap;}`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [font.path, format]);

  return (
    <Panel
      title="字体预览"
      step="01"
      hint={<span className="zr-num">{font.family || font.fileName}</span>}
    >
      <div className="flex flex-col gap-3">
        <textarea
          className="zr-field zr-num min-h-[60px] w-full resize-y text-[13px] leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[11px] text-ink-400">字号</span>
          <input
            type="range"
            min={14}
            max={72}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
          <span className="zr-num w-10 shrink-0 text-right text-[11px] text-ink-500">
            {size}px
          </span>
        </div>
        <div
          className="min-h-[120px] w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas px-4 py-3"
          style={{ fontFamily: `'${FAMILY}', system-ui, sans-serif`, fontSize: size, lineHeight: 1.4 }}
        >
          {text}
        </div>
        <p className="text-[10px] leading-snug text-ink-300">
          以你上传的字体渲染上方文字；若显示为系统默认字体，说明该字体尚未加载完成，或浏览器不支持其格式。
        </p>
      </div>
    </Panel>
  );
}
