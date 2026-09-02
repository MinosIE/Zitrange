import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectFont } from '../adapters/fontEngine';
import { processFont } from '../adapters/pipeline';
import type { OutputFormat, PartitionStrategy } from '../core/types';

const PORT = Number(process.env.PORT ?? 5174);
const ROOT = process.cwd();
const OUTPUT_DIR = join(ROOT, 'output');

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

function sendJson(res: any, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: any) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export const handler = async (req: any, res: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const { pathname } = url;

  try {
    if (req.method === 'POST' && pathname === '/api/inspect') {
      const body = await readBody(req);
      if (!body.path) return sendJson(res, 400, { error: '缺少 path' });
      const info = await inspectFont(body.path, body.fontNumber ?? 0);
      return sendJson(res, 200, info);
    }

    if (req.method === 'POST' && pathname === '/api/process') {
      const body = await readBody(req);
      if (!body.path) return sendJson(res, 400, { error: '缺少 path' });
      const jobId = randomUUID().slice(0, 8);
      const result = await processFont({
        fontPath: body.path,
        fontNumber: body.fontNumber ?? 0,
        text: body.text,
        files: body.files,
        format: (body.format as OutputFormat[]) ?? ['woff2'],
        strategy: body.strategy as PartitionStrategy,
        sampleText: body.sampleText,
        outDir: join(OUTPUT_DIR, jobId),
        baseName: 'font',
        publicBase: `/output/${jobId}`,
      });
      return sendJson(res, 200, { jobId, ...result });
    }

    if (req.method === 'GET' && pathname.startsWith('/output/')) {
      const rel = decodeURIComponent(pathname.slice('/output/'.length));
      const filePath = normalize(join(OUTPUT_DIR, rel));
      if (!filePath.startsWith(OUTPUT_DIR)) {
        res.writeHead(403);
        return res.end();
      }
      try {
        const s = await stat(filePath);
        if (!s.isFile()) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        return createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404);
        return res.end();
      }
    }

    res.writeHead(404);
    res.end('not found');
  } catch (e: any) {
    sendJson(res, 500, { error: String(e?.message ?? e) });
  }
};

/** 创建 API 服务实例（不直接监听，便于测试时由调用方控制生命周期） */
export function createApiServer(): ReturnType<typeof createServer> {
  return createServer(handler);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createApiServer().listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
    console.log(`[api] output dir: ${OUTPUT_DIR}`);
  });
}
