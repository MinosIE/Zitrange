import { createApiServer } from '../src/api/server';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

async function main() {
  const server = createApiServer();
  await new Promise<void>((r) => server.listen(PORT, r));

  try {
    const ins = await fetch(`${BASE}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'demo/FZJinHJW.TTF' }),
    });
    const insJ = await ins.json();
    console.log('INSPECT:', insJ.family, insJ.numGlyphs, 'glyphs');

    const proc = await fetch(`${BASE}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'demo/FZJinHJW.TTF',
        text: '中文网页字体优化方案，按频率拆分。',
        format: ['woff2'],
        strategy: { mode: 'hybrid', baseSize: 200, growth: 1.35, maxSize: 800, fallback: 'common-3500' },
      }),
    });
    const procJ = await proc.json();
    console.log(
      'PROCESS: jobId',
      procJ.jobId,
      '| charset',
      procJ.charsetSize,
      '| chunks',
      procJ.chunks.length,
      '| css',
      procJ.css.length,
      'chars | reasons',
      procJ.recommendation.reasons.length,
    );

    const url = procJ.chunks[0].files.woff2.url;
    const w = await fetch(`${BASE}${url}`);
    const buf = Buffer.from(await w.arrayBuffer());
    console.log(
      'CHUNK GET:',
      w.status,
      buf.length,
      'bytes | magic',
      buf.slice(0, 4).toString('hex'),
      '(expect 774f4632 = wOF2)',
    );

    const miss = await fetch(`${BASE}/output/nope/font-0.woff2`);
    console.log('404 check:', miss.status, '(expect 404)');

    console.log('ALL_OK');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
