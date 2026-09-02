import { coverageFor } from './coverage';
import { DEFAULT_STRATEGY } from './partition';
import { estimateChunkSize } from './simulate';
import type { FontInfo, OutputFormat, PartitionStrategy, Reason, Recommendation } from './types';

export interface RecommendInput {
  font: FontInfo;
  /** 字符集大小（去重码位数） */
  charCount: number;
}

/** 用于估算首屏下载量的「典型页面」不同字符数 */
const TYPICAL_CHARS = 400;

/**
 * 把分片策略套到字符集上，返回每片的字数（不依赖真实码位，纯估算）。
 * 忽略 ASCII/标点的第 0 片拆分，因此片数略少，对估算足够。
 */
export function chunkPlan(charCount: number, s: PartitionStrategy): number[] {
  const sizes: number[] = [];
  let remaining = Math.max(0, charCount);
  let k = 0;
  while (remaining > 0) {
    const size = Math.min(Math.round(s.baseSize * Math.pow(s.growth, k)), s.maxSize);
    const take = Math.min(size, remaining);
    sizes.push(take);
    remaining -= take;
    k++;
  }
  return sizes.length === 0 ? [0] : sizes;
}

function estimateTotal(charCount: number, s: PartitionStrategy, avg: number): number {
  return chunkPlan(charCount, s).reduce((sum, n) => sum + estimateChunkSize(n, avg), 0) / 1024;
}

/** 典型页面（前 TYPICAL_CHARS 字）会命中的前几片合计字节数 */
function estimateTypical(plan: number[], avg: number): number {
  let cum = 0;
  let bytes = 0;
  for (const n of plan) {
    if (cum >= TYPICAL_CHARS) break;
    bytes += estimateChunkSize(n, avg);
    cum += n;
  }
  return bytes;
}

/**
 * 根据字体规格与字符集规模，给出分片策略、输出格式、建议理由与体积估算。
 * 不修改调用方数据，纯函数。
 */
export function recommend(input: RecommendInput): Recommendation {
  const { font, charCount } = input;
  const avg = font.numGlyphs > 0 ? font.bytes / font.numGlyphs : 270;
  // 复杂轮廓（书法体）每字字节高，缩小单片刻数以免单文件过大
  const complex = avg > 600;

  const strategy: PartitionStrategy = {
    ...DEFAULT_STRATEGY,
    baseSize: complex ? 100 : 200,
    maxSize: complex ? 400 : 800,
  };

  const format: OutputFormat[] = ['woff2'];
  const reasons: Reason[] = [];
  const mb = (font.bytes / 1048576).toFixed(1);

  reasons.push({
    id: 'R1',
    level: 'info',
    text: '默认输出 woff2：相比 TTF 小 3–5 倍，且浏览器可逐片按需下载；font-display 默认 swap 避免文字不可见（FOIT）。',
    evidence: `源字体 ${mb}MB / ${font.numGlyphs} 字形`,
  });

  reasons.push({
    id: 'R2',
    level: 'info',
    text: '采用「频次递增分片」：高频字进小片、低频字进大片，首页只下载真正需要的字。',
    evidence: '中文字符集通常 >6000 字，一次全下不现实',
  });

  reasons.push({
    id: 'R3',
    level: 'warn',
    text: 'woff2 只做「拆分 + 压缩」，不减少字形总数。全部分片之和仍接近源字体大小。',
    evidence: `合计预计 ≈ ${estimateTotal(charCount, strategy, avg).toFixed(0)}KB`,
  });

  reasons.push({
    id: 'R4',
    level: 'info',
    text: '中文标点与 ASCII 单独成第 0 片，几乎任何页面都会命中，命中率≈100% 且体积仅数 KB。',
    evidence: 'PRD F2.4',
  });

  const cov = coverageFor(3500).toFixed(2);
  reasons.push({
    id: 'R5',
    level: 'info',
    text: `建议开启兜底「常用字前 3500」，可使任意页面覆盖 ${cov}%（基于字频统计）。`,
    evidence: `前 3500 字覆盖率 ${cov}%`,
  });

  reasons.push({
    id: 'R6',
    level: 'info',
    text: `单片字数上限约 ${strategy.maxSize} 字，避免单个 woff2 过大导致首屏卡顿。`,
    evidence: '实测每字体积差异极大：简黑≈80B，书法体≈930B/字',
  });

  if (charCount >= font.numGlyphs) {
    reasons.push({
      id: 'R8',
      level: 'warn',
      text: '字符集规模已接近或超过源字体字形数，生僻字/扩展区可能无对应字形，将缺字回退。',
      evidence: `字符集 ${charCount} vs 字体字形 ${font.numGlyphs}`,
    });
  }

  const plan = chunkPlan(charCount, strategy);
  const totalSize = plan.reduce((s, n) => s + estimateChunkSize(n, avg), 0);
  const typicalPageLoad = estimateTypical(plan, avg);

  return {
    strategy,
    format,
    reasons,
    estimate: {
      chunkCount: plan.length,
      totalSize,
      typicalPageLoad,
    },
  };
}
