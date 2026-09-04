import type { PartitionStrategy } from './types';

/**
 * 策略预设：把「每片多大」收敛为三个目标导向档位，降低决策成本。
 * 分片模型已统一为「按码位均匀切片」，三档只决定固定的每片字数：
 * - fine    细切：每片约 1500 字，片数多、首屏命中精细，请求数偏多
 * - medium  中切：每片约 4000 字（默认），片数与体积折中
 * - coarse  粗切：每片约 8000 字，@font-face 最少，单页加载字节更多
 */
export type StrategyPreset = 'fine' | 'medium' | 'coarse';

/** 预设只覆盖「每片字数」，其余策略字段（兜底 / ASCII 等）保持原样 */
export const STRATEGY_PRESETS: Record<StrategyPreset, { baseSize: number }> = {
  fine: { baseSize: 1500 },
  medium: { baseSize: 4000 },
  coarse: { baseSize: 8000 },
};

export const STRATEGY_PRESET_ORDER: readonly StrategyPreset[] = ['fine', 'medium', 'coarse'];

/** 应用预设：只覆盖每片字数，不动兜底 / ASCII 等其他字段 */
export function applyPreset(
  strategy: PartitionStrategy,
  preset: StrategyPreset,
): PartitionStrategy {
  return { ...strategy, baseSize: STRATEGY_PRESETS[preset].baseSize };
}

/**
 * 识别当前每片字数落在哪一档预设。
 * 与模板不一致（手动改过每片字数）即视为「自定义」（界面据此自动切换）。
 */
export function detectPreset(strategy: PartitionStrategy): StrategyPreset | 'custom' {
  for (const id of STRATEGY_PRESET_ORDER) {
    if (strategy.baseSize === STRATEGY_PRESETS[id].baseSize) return id;
  }
  return 'custom';
}

export interface PresetEstimate {
  /** 按码位均匀切片、对 N 个字预计切出的片数（含 ASCII 首屏片则至少 1 片） */
  slices: number;
  /** 固定的每片字数 */
  perSlice: number;
}

/**
 * 估算某档预设对给定字形数 N 会切成几片（供 UI「策略预设」简介随当前字体 / 字符集联动）。
 * 均匀切片口径：slices = max(1, ⌈N / 每片字数⌉)。
 */
export function estimatePreset(preset: StrategyPreset, charCount: number): PresetEstimate {
  const perSlice = STRATEGY_PRESETS[preset].baseSize;
  if (charCount <= 0) return { slices: 0, perSlice };
  return { slices: Math.max(1, Math.ceil(charCount / perSlice)), perSlice };
}
