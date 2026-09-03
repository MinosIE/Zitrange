import { splitBytes } from './ui';

/**
 * 三级体积对比（PRD F4.4）。
 *
 * 三根条用**真实比例**绘制，只有下限被夹到 1.2% 以保证极小的那根仍然可见——
 * 「本页实际加载」通常只有源字体的 1%，如果为了让图好看而放大它，
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
      bar: 'linear-gradient(90deg, #2A303A, #3B4453)',
      tone: 'text-paper',
      emphasis: false,
      note: '完整字体，未做任何处理',
    },
    {
      key: 'total',
      label: '全部分片',
      bytes: total,
      bar: 'linear-gradient(90deg, #8A5C12, #DB9526)',
      tone: 'text-paper-dim',
      emphasis: false,
      note: '磁盘成本，不是首屏成本',
    },
    {
      key: 'actual',
      label: '本页实际',
      bytes: actual,
      bar: 'linear-gradient(90deg, #F5B342, #FFE0A8)',
      tone: 'text-brass-400',
      emphasis: true,
      note: '浏览器只为这个页面下载的量',
    },
  ];

  const saved = actual != null && original > 0 ? (1 - actual / original) * 100 : null;

  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((r, i) => {
          const { value, unit } = r.bytes != null ? splitBytes(r.bytes) : { value: '—', unit: '' };
          const pct = r.bytes != null && original > 0 ? (r.bytes / original) * 100 : null;
          return (
            <div key={r.key} className="grid grid-cols-[62px_1fr_auto] items-center gap-3">
              <div
                className={`text-[11px] leading-tight ${
                  r.emphasis ? 'text-brass-300' : 'text-paper-mute'
                }`}
              >
                {r.label}
              </div>

              <div className="h-[26px] overflow-hidden rounded-[2px] border border-line-soft bg-ink-900/70">
                <div
                  className="zr-grow h-full rounded-[1px]"
                  style={{
                    width: r.bytes != null ? widthOf(r.bytes) : '0%',
                    background: r.bar,
                    animationDelay: `${i * 90}ms`,
                    opacity: r.bytes == null ? 0.25 : 1,
                  }}
                />
              </div>

              <div className="min-w-[104px] text-right">
                <span
                  className={`zr-figure text-[21px] ${r.emphasis ? 'text-brass-400' : r.tone}`}
                >
                  {value}
                </span>
                <span className="ml-1 text-[11px] text-paper-mute">{unit}</span>
                {pct != null && r.key !== 'original' && (
                  <div className="zr-num text-[10px] text-paper-mute">
                    {pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}% of 源
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2.5 text-[11px]">
        {actual != null ? (
          <>
            <span className="zr-num text-brass-300">
              命中 {hitIndices.length} / {chunkCount} 片
            </span>
            {saved != null && (
              <span className="zr-num text-jade-300">首屏相比源字体减少 {saved.toFixed(1)}%</span>
            )}
          </>
        ) : (
          <span className="text-paper-mute">填入样本文本，即可预测首屏实际下载量</span>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-paper-mute">
        全部分片之和接近源字体大小，但浏览器<strong className="text-paper-dim">只会下载命中的分片</strong>
        ——两者不是一回事，别拿磁盘成本当成首屏成本。
      </p>
    </div>
  );
}
