import type { Chunk, Codepoint, ManualOverride, PartitionStrategy } from './types';

/**
 * 归入「ASCII 优先片」的码位（PRD F2.4）。
 * 这些字符几乎必然出现在任何页面，单独成片可让命中率接近 100%，
 * 且体积仅 5–10KB。
 */
export function isAsciiOrPunct(cp: number): boolean {
  return (
    (cp >= 0x20 && cp <= 0x7e) || // ASCII
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 符号和标点
    (cp >= 0xff01 && cp <= 0xff5e) // 全角 ASCII 变体
  );
}

/**
 * 第 k 片的大小。
 * growth <= 1 时为固定分片；否则按 baseSize × growth^k 递增并 clamp 到 maxSize。
 */
function chunkSizeAt(s: PartitionStrategy, k: number): number {
  if (s.growth <= 1) return s.baseSize;
  const size = Math.round(s.baseSize * Math.pow(s.growth, k));
  return Math.min(size, s.maxSize);
}

export interface PartitionOptions {
  /** 是否把 ASCII/标点单独成第 0 片，默认 true */
  asciiFirst?: boolean;
}

/**
 * 把有序字符集切成若干分片。
 *
 * @param ordered 已按频率降序排列的码位
 */
export function partition(
  ordered: readonly Codepoint[],
  strategy: PartitionStrategy,
  options: PartitionOptions = {},
): Chunk[] {
  const { asciiFirst = true } = options;
  const groups: Codepoint[][] = [];

  let body = ordered;
  if (asciiFirst) {
    const head = ordered.filter(isAsciiOrPunct);
    if (head.length > 0) groups.push(head);
    body = ordered.filter((cp) => !isAsciiOrPunct(cp));
  }

  let offset = 0;
  let k = 0;
  while (offset < body.length) {
    const size = chunkSizeAt(strategy, k);
    groups.push(body.slice(offset, offset + size));
    offset += size;
    k++;
  }

  // 尾片过小时并入前一片，避免为几个字单独发一个请求
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    const prev = groups[groups.length - 2];
    if (last.length < strategy.baseSize / 3) {
      groups.splice(groups.length - 2, 2, [...prev, ...last]);
    }
  }

  const applied = strategy.overrides?.length
    ? applyOverrides(groups, strategy.overrides)
    : groups;

  return applied.map((codepoints, index) => ({ index, codepoints }));
}

/**
 * 把手动编辑操作作用在自动分片结果上（PRD F2.11）。
 * 操作按数组顺序依次应用，每步都基于上一步的结果。
 */
export function applyOverrides(
  chunks: readonly Codepoint[][],
  overrides: readonly ManualOverride[],
): Codepoint[][] {
  let cur = chunks.map((c) => [...c]);

  for (const ov of overrides) {
    switch (ov.kind) {
      case 'merge': {
        const [a, b] = ov.chunks;
        if (a === b || cur[a] === undefined || cur[b] === undefined) break;
        const merged = [...cur[a], ...cur[b]];
        cur = cur.filter((_, i) => i !== a && i !== b);
        cur.splice(Math.min(a, b), 0, merged);
        break;
      }
      case 'split': {
        const src = cur[ov.chunk];
        if (!src || src.length < 2) break;
        const raw = ov.at === 'median' ? Math.ceil(src.length / 2) : ov.at;
        const pos = Math.max(1, Math.min(Math.trunc(raw), src.length - 1));
        cur = [...cur];
        cur.splice(ov.chunk, 1, src.slice(0, pos), src.slice(pos));
        break;
      }
      case 'pin': {
        const cps = new Set(flattenChars(ov.chars));
        cur = cur.map((c) => c.filter((cp) => !cps.has(cp)));
        const target = cur[ov.to];
        // 钉入的字符放在片首：该片一旦被加载，这些字必定可用
        if (target) cur[ov.to] = [...cps, ...target];
        break;
      }
      case 'exclude': {
        const cps = new Set(flattenChars(ov.chars));
        cur = cur.map((c) => c.filter((cp) => !cps.has(cp))).filter((c) => c.length > 0);
        break;
      }
    }
  }

  return cur;
}

/** 把字符串数组展开为去重后的码位数组，按码位迭代以正确处理代理对 */
export function flattenChars(chars: readonly string[]): Codepoint[] {
  const out = new Set<Codepoint>();
  for (const s of chars) {
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined) out.add(cp);
    }
  }
  return [...out];
}

export const DEFAULT_STRATEGY: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 200,
  growth: 1.35,
  maxSize: 800,
  fallback: 'common-3500',
};
