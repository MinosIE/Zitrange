import type { PartitionStrategy, StrategyMode } from './types';

/** 全量模式（拆分全量字体）下有意义的分片模式 */
const FULL_MODES: readonly StrategyMode[] = ['frequency', 'codepoint', 'block'];
/** 纯输入且选了兜底字表时可选的分片模式 */
const FALLBACK_MODES: readonly StrategyMode[] = ['hybrid', 'frequency', 'codepoint'];

/**
 * 策略归一化：把「分片模式」约束在当前字符集来源下真正有意义的值域内，
 * 让界面选项与实际生效的模式始终一致（避免 Segmented 高亮 A、实际却跑 B）。
 *
 * 规则：
 * - 全量模式（useFontCmap）：只能是 {frequency, codepoint, block}。
 *   此时字符集已含 cmap 全部码位且不读站点文本，站点频次全部为 0，
 *   sortByFrequency 会退化为按码位升序，故 hybrid/site 无意义。
 * - 纯输入 + 不兜底：恒为 hybrid。字符集就是你输入的字，按文本频次排序恒最优，
 *   界面据此隐藏整个「分片模式」字段。
 * - 纯输入 + 有兜底：{hybrid, frequency, codepoint}。
 *   block 依赖 cmap 的巨型连续块，对「站点字 + 字频补字」这种分散字符集会退化，
 *   故只保留在全量模式。
 *
 * 幂等；且已合法时直接返回入参引用，避免无谓的重渲染。
 */
export function normalizeStrategy(s: PartitionStrategy): PartitionStrategy {
  if (s.useFontCmap) {
    return FULL_MODES.includes(s.mode) ? s : { ...s, mode: 'frequency' };
  }
  if (s.fallback === 'none') {
    return s.mode === 'hybrid' ? s : { ...s, mode: 'hybrid' };
  }
  return FALLBACK_MODES.includes(s.mode) ? s : { ...s, mode: 'hybrid' };
}
