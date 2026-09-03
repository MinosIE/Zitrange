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
  if (strategy.mode === 'codepoint') {
    return partitionByCodepoint(ordered, strategy, options);
  }

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

/** 码位聚类模式下的默认片数上限（见 PartitionStrategy.maxChunks） */
const DEFAULT_MAX_CHUNKS = 512;

/**
 * 按码位邻近度聚类分片（mode='codepoint'）。
 *
 * 与混合/字频/站点模式相反：本模式忽略频率，仅按码位大小升序排序后，
 * 把「极大连续段」按目标大小（baseSize / growth）装进定长片（bin-packing）。
 * 连续段本身不被拆散，只有超过目标大小的超长段才切片成连续子段，
 * 因此连续子集里每片仍是单区间（PRD §6.4），单行 `unicode-range` 显著变短；
 * 同时片数由 baseSize 直接控制，与频率类模式一致，避免片数暴涨带来的加载开销。
 *
 * 适用场景：全量字体（cmap 多为 4E00–9FFF 等巨型连续块）分片时效果最佳，
 * 一整个 CJK 区块可折叠成 `U+4E00-9FFF` 这样的单区间，且片数可控。
 * 代价：放弃「高频字进小首屏片」的频率局域性，F4.3 首屏收益减弱（产品取向变更）。
 *
 * 退化情形：若字符集字字分散（几乎无连续段），则每片退化为若干孤立字，
 * 单行 range 偏长（属可接受退化，因不声明不存在码位无法更短，见 §6.4）；
 * 极端情况下仍用 `maxChunks` 兜底控制 @font-face 数量上限。
 */
export function partitionByCodepoint(
  ordered: readonly Codepoint[],
  strategy: PartitionStrategy,
  options: PartitionOptions = {},
): Chunk[] {
  const { asciiFirst = true } = options;

  let asciiChunk: Codepoint[] = [];
  let body = ordered;
  if (asciiFirst) {
    asciiChunk = ordered.filter(isAsciiOrPunct);
    body = ordered.filter((cp) => !isAsciiOrPunct(cp));
  }

  const sorted = [...new Set(body)].sort((a, b) => a - b);

  // 1) 拆成极大连续段（步长 > 1 即断开）
  const runs: Codepoint[][] = [];
  let run: Codepoint[] = [];
  for (const cp of sorted) {
    if (run.length > 0 && cp !== run[run.length - 1] + 1) {
      runs.push(run);
      run = [];
    }
    run.push(cp);
  }
  if (run.length > 0) runs.push(run);

  // 2) 把连续段按目标大小装进定长片（bin-packing）。
  //    连续段本身不被拆散（仅超长段切片成连续子段），故连续子集里每片仍是单区间；
  //    片数由 baseSize 直接控制，避免零散子集产生海量片。
  const groups: Codepoint[][] = [];
  let buf: Codepoint[] = [];
  let bufSize = 0;
  let k = 0;
  for (const r of runs) {
    const target = chunkSizeAt(strategy, k);
    if (r.length > target) {
      // 超长连续段：先 flush 当前 buf，再把它切成连续子段（每段仍是单区间）
      if (bufSize > 0) {
        groups.push(buf);
        buf = [];
        bufSize = 0;
        k++;
      }
      for (let s = 0; s < r.length; s += target) {
        groups.push(r.slice(s, s + target));
        k++;
      }
      continue;
    }
    if (bufSize > 0 && bufSize + r.length > target) {
      groups.push(buf);
      buf = [];
      bufSize = 0;
      k++;
    }
    buf = buf.concat(r);
    bufSize += r.length;
  }
  if (bufSize > 0) groups.push(buf);

  // 3) 段数超过上限则顺序合并相邻段，控制 @font-face 数量
  const maxChunks = strategy.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const capped = capToMaxChunks(groups, maxChunks);

  const finalGroups = asciiChunk.length > 0 ? [asciiChunk, ...capped] : capped;

  const applied = strategy.overrides?.length
    ? applyOverrides(finalGroups, strategy.overrides)
    : finalGroups;

  return applied.map((codepoints, index) => ({ index, codepoints }));
}

/**
 * 把相邻 group 合并，使最终数量不超过 maxChunks。
 * 不变量：每步都满足 `out.length + 剩余未处理组数 ≤ maxChunks`，
 * 因此一旦「剩下的组都能单独成片」就立即发出当前累积，合并尽量靠前、均匀分布。
 */
function capToMaxChunks(groups: Codepoint[][], maxChunks: number): Codepoint[][] {
  if (groups.length <= maxChunks) return groups;

  const out: Codepoint[][] = [];
  let buf: Codepoint[] = [];
  for (let i = 0; i < groups.length; i++) {
    buf = buf.concat(groups[i]);
    const remaining = groups.length - i; // 含当前组在内尚未处理的组数
    if (out.length + remaining <= maxChunks) {
      out.push(buf);
      buf = [];
    }
    // 否则继续累积（不发出），直到满足上限约束再发出
  }
  if (buf.length > 0) out.push(buf);
  return out;
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
