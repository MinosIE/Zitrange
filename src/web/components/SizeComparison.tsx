import { splitBytes } from './ui';

/**
 * 三级体积对比（PRD F4.4）。
 *
 * 三根条按**真实比例**绘制，只把下限夹到 1.2% 保证极小的那根仍可见——
 * 「本页实际加载」通常只有源字体的 1%，若为图好看而放大它，
 * 就等于替用户做了错误的判断。
 */
export function SizeComparison({
  original,
  total,
  actual,
  hitIndices,
  chunkCount,
}: {
  original: number;
  /** 全部分片合计：磁盘成本 */
  total: number;
  /** 样本文本命中的分片合计：首屏真实成本 */
  actual: number | null;
  hitIndices: number[];
  chunkCount: number;
}) {
  const max = Math.max(original, total, actual ?? 0, 1);
  const widthOf = (v: number) => `${Math.max((v / max) * 100, 1.2)}%`;

  const rows = [
    {
      key: 'original',
      label: '源字体',
      bytes: original,
      bar: 'bg-ink-300',
      num: 'text-ink-900',
      emphasis: false,
    },
    {
      key: 'total',
      label: '全部分片',
      bytes: total,
      bar: 'bg-brand opacity-50',
      num: 'text-ink-700',
      emphasis: false,
    },
    {
      key: 'actual',
      label: '本页实际',
      bytes: actual,
      bar: 'bg-brand',
      num: 'text-brand',
      emphasis: true,
    },
  ];

  const saved = actual != null && original > 0 ? (1 - actual / original) * 100 : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => {
          const { value, unit } = r.bytes != null ? splitBytes(r.bytes) : { value: '—', unit: '' };
          const pct = r.bytes != null && original > 0 ? (r.bytes / original) * 100 : null;
          return (
            <div key={r.key} className="grid grid-cols-[62px_1fr_auto] items-center gap-3">
              <span
                className={`text-[11px] leading-tight ${r.emphasis ? 'text-brand' : 'text-ink-400'}`}
              >
                {r.label}
              </span>

              <div className="h-[26px] overflow-hidden rounded-lg border border-line bg-surface-2">
                <div
                  className={`zr-grow h-full rounded-lg ${r.bar}`}
                  style={{
                    width: r.bytes != null ? widthOf(r.bytes) : '0%',
                    animationDelay: `${i * 90}ms`,
                    opacity: r.bytes == null ? 0.25 : undefined,
                  }}
                />
              </div>

              <div className="flex min-w-[104px] flex-col items-end">
                <span className="flex items-baseline gap-1">
                  <span className={`zr-figure text-[21px] ${r.num}`}>{value}</span>
                  <span className="text-[11px] text-ink-400">{unit}</span>
                </span>
                {pct != null && r.key !== 'original' && (
                  <span className="zr-num text-[10px] text-ink-400">
                    {pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}% of 源
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px]">
        {actual != null ? (
          <>
            <span className="zr-num text-brand">
              命中 {hitIndices.length} / {chunkCount} 片
            </span>
            {saved != null && (
              <span className="zr-num text-success">
                首屏相比源字体减少 {saved.toFixed(1)}%
              </span>
            )}
          </>
        ) : (
          <span className="text-ink-400">填入样本文本，即可预测首屏实际下载量</span>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-ink-400">
        全部分片之和接近源字体大小，但浏览器
        <strong className="font-semibold text-ink-700">只会下载命中的分片</strong>
        ——两者不是一回事，别把磁盘成本当成首屏成本。
      </p>
    </div>
  );
}
