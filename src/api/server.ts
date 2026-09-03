import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { basename, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
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
  '.otf': 'font/otf',
  '.ttc': 'font/collection',
  '.otc': 'font/collection',
  '.json': 'application/json',
};

/** 允许通过 /api/raw 读取的字体扩展名白名单 */
const FONT_EXT = new Set(['.woff2', '.woff', '.ttf', '.otf', '.ttc', '.otc']);

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
    // 上传：请求体为原始二进制（前端直接传 File），流式落盘，避免 multipart 解析与内存膨胀
    if (req.method === 'POST' && pathname === '/api/upload') {
      const rawName = url.searchParams.get('name') ?? 'font.ttf';
      const safe = basename(rawName).replace(/[^\w.\-一-龥]/g, '_');
      const dir = join(ROOT, '.tmp', 'uploads');
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, `${randomUUID().slice(0, 8)}-${safe}`);
      await pipeline(req, createWriteStream(filePath));
      return sendJson(res, 200, {
        path: relative(ROOT, filePath),
        fileName: safe,
        bytes: (await stat(filePath)).size,
      });
    }

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

    // 源字体读取（字形预览用）：仅限工作区内、扩展名在白名单内的文件，防路径穿越
    if (req.method === 'GET' && pathname === '/api/raw') {
      const p = url.searchParams.get('path');
      if (!p) return sendJson(res, 400, { error: '缺少 path' });
      const abs = resolve(ROOT, p);
      const ext = extname(abs).toLowerCase();
      if (abs !== ROOT && !abs.startsWith(ROOT + sep)) {
        return sendJson(res, 403, { error: '越权路径' });
      }
      if (!FONT_EXT.has(ext)) return sendJson(res, 403, { error: '仅允许读取字体文件' });
      try {
        const s = await stat(abs);
        if (!s.isFile()) return sendJson(res, 404, { error: '文件不存在' });
        res.writeHead(200, {
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        return createReadStream(abs).pipe(res);
      } catch {
        return sendJson(res, 404, { error: '文件不存在' });
      }
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
