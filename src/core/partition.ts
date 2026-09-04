import type { Chunk, Codepoint, PartitionStrategy } from './types';

/**
 * 归入「ASCII 首屏片（basic 片）」的码位（PRD F2.4）。
 * 这些字符几乎必然出现在任何页面，单独成片可让命中率接近 100%，
 * 且体积仅 5–10KB，并随页面立即加载。
 */
export function isAsciiOrPunct(cp: number): boolean {
  return (
    (cp >= 0x20 && cp <= 0x7e) || // ASCII
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 符号和标点
    (cp >= 0xff01 && cp <= 0xff5e) // 全角 ASCII 变体
  );
}

/** 常用字优先模式下的「常用字」区间：CJK 统一汉字区前 3500 字（U+4E00–U+5BAB） */
export const COMMON_LO = 0x4e00;
export const COMMON_HI = 0x5bab;

export interface PartitionOptions {
  /** 是否把 ASCII/标点单独成第 0 片，默认 true */
  asciiFirst?: boolean;
}

/** 片数安全上限（内部常量，界面不暴露） */
const DEFAULT_MAX_CHUNKS = 512;

/**
 * 按码位均匀切片（当前唯一的分片模型，对应 yipai 的 basic/common/rare 思路）。
 *
 * - ASCII/标点（如有）单独成首屏片（basic 片），可随页面立即加载；
 * - 其余字符按码位升序排序，连续段折叠为单区间，再按固定「每片字数」装进定长片。
 *   连续大块（如整个 CJK 基本区）因此折叠成 `U+4E00-9FFF` 这样的单区间，
 *   单行 `unicode-range` 最短，首屏解析最快。
 * - 片数超过安全上限则顺序合并相邻段，控制 @font-face 数量。
 *
 * @param ordered 待分片的码位集合（顺序无关，函数内部按码位重排）
 */
export function partition(
  ordered: readonly Codepoint[],
  strategy: PartitionStrategy,
  options: PartitionOptions = {},
): Chunk[] {
  const { asciiFirst = true } = options;
  const baseSize = Math.max(1, Math.floor(strategy.baseSize) || 4000);
  const commonFirst = strategy.commonFirst ?? false;

  let asciiChunk: Codepoint[] = [];
  let body = ordered;
  if (asciiFirst) {
    asciiChunk = ordered.filter(isAsciiOrPunct);
    body = ordered.filter((cp) => !isAsciiOrPunct(cp));
  }

  const sorted = [...new Set(body)].sort((a, b) => a - b);

  // 常用字优先：把常用 3500 字（U+4E00–5BAB）独立成首组，其余按原样均匀切片。
  // 这样常用片常驻高频连续区间（短 range），罕见字片按需懒加载（方案 B 的 common/ext 双层）。
  let groups: Codepoint[][];
  if (commonFirst) {
    const common: Codepoint[] = [];
    const rest: Codepoint[] = [];
    for (const cp of sorted) {
      if (cp >= COMMON_LO && cp <= COMMON_HI) common.push(cp);
      else rest.push(cp);
    }
    groups = [...uniformGroups(common, baseSize), ...uniformGroups(rest, baseSize)];
  } else {
    groups = uniformGroups(sorted, baseSize);
  }

  // 片数超过上限则顺序合并相邻段，控制 @font-face 数量
  const maxChunks = strategy.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const capped = capToMaxChunks(groups, maxChunks);

  const finalGroups = asciiChunk.length > 0 ? [asciiChunk, ...capped] : capped;

  return finalGroups.map((codepoints, index) => ({ index, codepoints }));
}

/**
 * 把已按码位升序、去重的字符集按固定每片字数装进定长片：
 * 1) 先拆成极大连续段（步长 > 1 即断开）；
 * 2) 连续段不被拆散，故每片仍是单区间，单行 `unicode-range` 最短；
 * 3) 超长连续段（如整个 CJK 基本区）切成连续子段，每段仍是单区间。
 */
function uniformGroups(sorted: Codepoint[], baseSize: number): Codepoint[][] {
  // 1) 拆成极大连续段
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

  // 2) 把连续段按固定每片字数装进定长片
  const groups: Codepoint[][] = [];
  let buf: Codepoint[] = [];
  let bufSize = 0;
  for (const r of runs) {
    if (r.length > baseSize) {
      // 超长连续段：先 flush 当前 buf，再把它切成连续子段（每段仍是单区间）
      if (bufSize > 0) {
        groups.push(buf);
        buf = [];
        bufSize = 0;
      }
      for (let s = 0; s < r.length; s += baseSize) {
        groups.push(r.slice(s, s + baseSize));
      }
      continue;
    }
    if (bufSize > 0 && bufSize + r.length > baseSize) {
      groups.push(buf);
      buf = [];
      bufSize = 0;
    }
    buf = buf.concat(r);
    bufSize += r.length;
  }
  if (bufSize > 0) groups.push(buf);

  return groups;
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
