import type { CharFreq, Codepoint } from './types';
import { charFreqCodepoints } from './assets/charfreq-zh';

/**
 * 需要纳入字符集的码位区间（PRD §6.1）。
 * 排除 ASCII 控制字符与私用区。
 */
const TARGET_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], // ASCII 可打印
  [0xa0, 0xff], // 拉丁补充：© ® ° × ÷ ¡ ¿ 等
  [0x2000, 0x206f], // 通用标点：“ ” ‘ ’ — … ‰
  [0x3000, 0x303f], // CJK 符号和标点：。、《》「」【】
  [0x3040, 0x30ff], // 平假名 / 片假名
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0x4e00, 0x9fff], // CJK 基本区
  [0xf900, 0xfaff], // CJK 兼容表意文字
  [0xfe10, 0xfe19], // 竖排标点
  [0xfe30, 0xfe4f], // CJK 兼容形式
  [0xff00, 0xffef], // 全角 / 半角形式
  [0x20000, 0x2fa1f], // CJK 扩展 B–F + 兼容补充
  [0x30000, 0x323af], // CJK 扩展 G–H
];

export function isTargetCodepoint(cp: number): boolean {
  return TARGET_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/**
 * 统计文本中的码位频次。
 * 使用 for..of 按码位迭代，自动正确处理代理对（扩展区汉字）。
 */
export function extractCharFreq(text: string): CharFreq {
  const freq: CharFreq = new Map();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || !isTargetCodepoint(cp)) continue;
    freq.set(cp, (freq.get(cp) ?? 0) + 1);
  }
  return freq;
}

export function mergeCharFreq(...maps: CharFreq[]): CharFreq {
  const out: CharFreq = new Map();
  for (const m of maps) {
    for (const [cp, n] of m) {
      out.set(cp, (out.get(cp) ?? 0) + n);
    }
  }
  return out;
}

/**
 * 按出现次数降序排列。
 * 次数相同时按码位升序，保证结果稳定可复现（同频次字符不会因 Map 顺序抖动）。
 */
export function sortByFrequency(freq: CharFreq): Codepoint[] {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([cp]) => cp);
}

/** 全局字频表码位 → 名次（越小越高频）。不在表中的字名次取其长度，排最后。 */
const GLOBAL_RANK: ReadonlyMap<number, number> = (() => {
  const table = charFreqCodepoints();
  const m = new Map<number, number>();
  table.forEach((cp, i) => m.set(cp, i));
  return m;
})();

/**
 * 按全局字频表名次升序排列（PRD §6.2.1「字频」模式）。
 * 忽略字符在站点文本中的真实频次，一律以通用字频为准——
 * 这正是「内容不可预知时按通用频率优化」的含义。不在表中的字排最后，
 * 同名次时按码位升序，保证结果稳定可复现。
 */
export function sortByGlobalRank(freq: CharFreq): Codepoint[] {
  const max = GLOBAL_RANK.size;
  return [...freq.keys()].sort((a, b) => {
    const ra = GLOBAL_RANK.get(a) ?? max;
    const rb = GLOBAL_RANK.get(b) ?? max;
    return ra - rb || a - b;
  });
}

/**
 * 用兜底字表补足字符集。
 *
 * 兜底字的频次记为 0，因此排序时永远排在站点实际用字之后——
 * 这保证了「站点用字优先进入高频片」这一混合策略的核心语义（PRD F2.3）。
 *
 * @param count 取字表前 N 字；0 表示不补
 * @returns 实际补进来的字数
 */
export function applyFallback(
  freq: CharFreq,
  table: readonly Codepoint[],
  count: number,
): number {
  if (count <= 0) return 0;
  let added = 0;
  for (let i = 0; i < Math.min(count, table.length); i++) {
    const cp = table[i];
    if (freq.has(cp)) continue;
    freq.set(cp, 0);
    added++;
  }
  return added;
}

export const FALLBACK_SIZES: Record<string, number> = {
  none: 0,
  'common-3500': 3500,
  'common-7000': 7000,
  gb2312: 6763,
};
