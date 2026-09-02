import { processFont } from '../src/adapters/pipeline';

const text =
  '中文网页字体优化是一种针对中文字体文件体积过大的有效方案。' +
  '通过按使用频率拆分并配合 unicode-range，浏览器只会下载当前页面真正需要的字形，' +
  '首屏不再被迫加载数 MB 的完整字体。';

processFont({
  fontPath: 'demo/FZJinHJW.TTF',
  text,
  sampleText: text,
  format: ['woff2'],
  strategy: { mode: 'hybrid', baseSize: 200, growth: 1.35, maxSize: 800, fallback: 'common-3500' },
  outDir: '.tmp/out',
  baseName: 'demo',
})
  .then((r) => {
    console.log('font      :', r.font.family, '| glyphs', r.font.numGlyphs, '|', (r.font.bytes / 1048576).toFixed(1) + 'MB');
    console.log('charset   :', r.charsetSize, '字（含兜底）');
    console.log('chunks    :', r.chunks.length, '片');
    const total = r.chunks.reduce((s, c) => s + (c.files.woff2?.bytes ?? 0), 0);
    console.log('total out :', (total / 1024).toFixed(1) + 'KB woff2');
    console.log('chunk0    :', r.chunks[0].unicodeRange, '=>', r.chunks[0].files.woff2?.bytes, 'B');
    console.log('simulation:', JSON.stringify(r.simulation));
    console.log('issues    :', r.issues.map((i) => i.id + ':' + i.level).join(', ') || '(none)');
    console.log('--- CSS (first 2 faces) ---');
    console.log(r.css.split('\n\n').slice(0, 2).join('\n\n'));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
