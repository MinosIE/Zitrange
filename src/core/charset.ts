import type { CharFreq, Codepoint } from './types';
import { charFreqCodepoints } from './assets/charfreq-zh';

/**
 * 任何页面都会用到的 ASCII 与常用标点，保底纳入字符集，确保产物含数字 / 字母 / 标点。
 * 受字体支持情况裁剪：字体不含的码位不会被加入。是否注入由策略项 `includeAsciiPunct` 控制。
 */
export const ASCII_PUNCT: readonly number[] = (() => {
  const out: number[] = [];
  for (let cp = 0x20; cp <= 0x7e; cp++) out.push(cp); // ASCII 可打印
  for (let cp = 0x3000; cp <= 0x303f; cp++) out.push(cp); // CJK 符号和标点
  for (let cp = 0xff01; cp <= 0xff5e; cp++) out.push(cp); // 全角 ASCII 变体
  return out;
})();

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
 * 用兜底字表补足字符集（仅「仅用户内容」模式）。
 *
 * 兜底字的频次记为 0，与「站点用字优先」语义一致（排序交给 partition 按码位处理）。
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

/** 兜底字表 → 取前 N 字；'common' = 通用常用字表前 3500 字 */
export const FALLBACK_SIZES: Record<string, number> = {
  none: 0,
  common: 3500,
};

/** 兜底字表所用的通用常用字序列（按字频降序，仅用于「补全常用字」） */
export const COMMON_TABLE: readonly Codepoint[] = charFreqCodepoints();
