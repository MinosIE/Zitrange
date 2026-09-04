import type { FallbackCharset, PartitionStrategy } from './types';

const FALLBACKS: readonly FallbackCharset[] = ['none', 'common'];

/**
 * 策略归一化：补齐默认值、约束兜底字表取值，保证界面 / 管线拿到的字段始终合法。
 *
 * 规则很简单——分片模型已收敛为单一的「按码位均匀切片」，不再有模式分支：
 * - `baseSize` 缺失或 < 1 时回退到 4000；
 * - `fallback` 只接受 'none' / 'common'，其余视为 'none'；
 * - `useFontCmap / includeAsciiPunct / asciiFirst / asciiAlwaysLoad` 给默认布尔值；
 * - `maxChunks` 仅当显式 > 0 时保留（内部安全上限，界面不暴露）。
 */
export function normalizeStrategy(s: PartitionStrategy): PartitionStrategy {
  const baseSize = s.baseSize && s.baseSize >= 1 ? Math.floor(s.baseSize) : 4000;
  const fallback: FallbackCharset = FALLBACKS.includes(s.fallback) ? s.fallback : 'none';
  const out: PartitionStrategy = {
    baseSize,
    fallback,
    useFontCmap: s.useFontCmap ?? false,
    includeAsciiPunct: s.includeAsciiPunct ?? true,
    asciiFirst: s.asciiFirst ?? true,
    asciiAlwaysLoad: s.asciiAlwaysLoad ?? false,
  };
  if (s.maxChunks && s.maxChunks > 0) out.maxChunks = s.maxChunks;
  return out;
}
