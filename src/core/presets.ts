import type { PartitionStrategy } from './types';

/**
 * F2.10 策略预设：把「分片尺寸」收敛为三个目标导向档位，降低决策成本。
 *
 * 三档只负责 baseSize / growth / maxSize / targetSlices 这组「片大小↔片数」参数，
 * 与「分片模式 / 兜底字表 / ASCII 选项」正交（后者由高级设置独立控制）。
 *
 * 口径（PRD F2.10，界面默认展示这三档）：
 * - volume   最小体积：首屏传输量最小。按 baseSize×growth^k 递增、首片小，
 *            浏览器首屏只下载命中头部的高频小片。targetSlices 不设（避免被
 *            目标片数压成均匀片而丢失递增首片收益）。
 * - balance  均衡：片数与首屏折中，即应用当前的默认参数（目标片数 20，
 *            全量约 2 万字时单片 ~1000 字、共 ~20 次请求）。
 * - requests 最少请求：@font-face 数量最少。大片固定（全量约 8 次请求），
 *            适合同域并发受限或整页都会用到的场景。
 */
export type StrategyPreset = 'volume' | 'balance' | 'requests';

/** 尺寸参数：预设真正覆盖的字段（其余策略字段保持不变） */
export interface PresetParams {
  baseSize: number;
  growth: number;
  maxSize: number;
  /** undefined 表示走「按每片字数」档（递增），>0 表示走「按目标片数」档 */
  targetSlices?: number;
}

export const STRATEGY_PRESETS: Record<StrategyPreset, PresetParams> = {
  volume: {
    // 递增小首片：200×1.4^k，封顶 1500
    baseSize: 200,
    growth: 1.4,
    maxSize: 1500,
    targetSlices: undefined,
  },
  balance: {
    // = 应用当前默认（App 的 DEFAULT_STRATEGY / partition 里 PRD 建议 500 / 1.35 / 1000）
    baseSize: 500,
    growth: 1.35,
    maxSize: 1000,
    targetSlices: 20,
  },
  requests: {
    // 大片固定：2500 字/片；targetSlices 8 保证片数上限也收敛到 8
    baseSize: 2500,
    growth: 1,
    maxSize: 2500,
    targetSlices: 8,
  },
};

export const STRATEGY_PRESET_ORDER: readonly StrategyPreset[] = [
  'volume',
  'balance',
  'requests',
];

/** 应用预设：只覆盖尺寸参数，不动模式/兜底/ASCII 等其他字段 */
export function applyPreset(
  strategy: PartitionStrategy,
  preset: StrategyPreset,
): PartitionStrategy {
  return { ...strategy, ...STRATEGY_PRESETS[preset] };
}

/**
 * 识别当前尺寸参数落在哪一档预设。
 * 任何一项与三档模板不一致即视为「自定义」（手动改过高级参数后界面据此自动切换）。
 */
export function detectPreset(strategy: PartitionStrategy): StrategyPreset | 'custom' {
  for (const id of STRATEGY_PRESET_ORDER) {
    const p = STRATEGY_PRESETS[id];
    if (
      strategy.baseSize === p.baseSize &&
      strategy.growth === p.growth &&
      strategy.maxSize === p.maxSize &&
      (strategy.targetSlices ?? 0) === (p.targetSlices ?? 0)
    ) {
      return id;
    }
  }
  return 'custom';
}

/** 动态片数推导的每片字数下限，与 partition.ts 里的 MIN_CHUNK 保持一致口径 */
const MIN_CHUNK = 100;

export interface PresetEstimate {
  /** 该档对 N 个字预计切出的片数（尾片并入 / ASCII 首片可致 ±1 差，文案作「约」处理） */
  slices: number;
  /** 均匀分片档（balance / requests）的每片字数；递增档（volume）每片不等长，缺省 */
  perSlice?: number;
}

/**
 * 估算某档预设对给定字形数 N 会切成几片（供 UI「策略预设」简介随当前字体/字符集联动）。
 * 复刻 partition.ts 的尺寸推导口径：
 * - targetSlices>0（balance / requests）：每片 = max(100, ⌈N/target⌉)，均匀切到 ≤ target 片；
 * - 否则（volume）：按 baseSize × growth^k 递增、clamp 到 maxSize，累计覆盖 N。
 * 仅对按字数切分的模式（hybrid / frequency / site）成立；codepoint / block 由码位分布决定，
 * 不适用本估算（界面只在对应模式下才展示换算）。
 */
export function estimatePreset(preset: StrategyPreset, charCount: number): PresetEstimate {
  if (charCount <= 0) return { slices: 0 };
  const p = STRATEGY_PRESETS[preset];
  if (p.targetSlices && p.targetSlices > 0) {
    const perSlice = Math.max(MIN_CHUNK, Math.ceil(charCount / p.targetSlices));
    return { slices: Math.ceil(charCount / perSlice), perSlice };
  }
  let done = 0;
  let k = 0;
  while (done < charCount) {
    const size =
      p.growth <= 1
        ? p.baseSize
        : Math.min(Math.round(p.baseSize * Math.pow(p.growth, k)), p.maxSize);
    done += size;
    k++;
  }
  return { slices: k };
}
