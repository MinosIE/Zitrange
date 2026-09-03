import type { Recommendation, Suggestion } from '@core/types';
import { Note, Stat, fmtBytes } from './ui';

/** 智能建议（PRD F2.8）：可解释优先，每条理由都带上支撑它的数据 */
export function AdvicePanel({
  rec,
  onApply,
}: {
  rec: Recommendation;
  onApply: (s: Suggestion) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="预计分片数" value={String(rec.estimate.chunkCount)} />
        <Stat label="分片合计（估）" value={fmtBytes(rec.estimate.totalSize)} />
        <Stat label="典型页面加载" value={fmtBytes(rec.estimate.typicalPageLoad)} tone="brand" />
      </div>

      {rec.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="zr-eyebrow">可一键应用</span>
          {rec.suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[12.5px] text-ink-800">{s.label}</span>
                <span className="text-[11px] text-ink-400">{s.detail}</span>
              </div>
              {s.applied ? (
                <span className="shrink-0 text-[11px] font-medium text-success">已应用</span>
              ) : (
                <button
                  type="button"
                  className="zr-btn zr-btn-ghost shrink-0 px-3 py-1 text-[12px]"
                  onClick={() => onApply(s)}
                >
                  应用
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {rec.reasons.map((r) => (
          <Note key={r.id} level={r.level} tag={r.id} evidence={r.evidence}>
            {r.text}
          </Note>
        ))}
      </div>
    </div>
  );
}
