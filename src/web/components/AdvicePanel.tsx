import type { Recommendation } from '@core/types';
import { Note, Stat, fmtBytes } from './ui';

/** 智能参数建议（PRD F2.8）：可解释优先，每条理由都带上支撑它的数据 */
export function AdvicePanel({ rec }: { rec: Recommendation }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="预计分片数" value={String(rec.estimate.chunkCount)} />
        <Stat label="分片合计（估）" value={fmtBytes(rec.estimate.totalSize)} />
        <Stat label="典型页面加载" value={fmtBytes(rec.estimate.typicalPageLoad)} tone="brand" />
      </div>

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
