import type { OutputFormat } from '@core/types';
import type { ChunkResult } from '../api';
import { fmtBytes } from './ui';

export function ChunkTable({
  chunks,
  format,
  hitIndices,
}: {
  chunks: ChunkResult[];
  format: OutputFormat;
  hitIndices: number[];
}) {
  const hit = new Set(hitIndices);

  return (
    <div className="scrollbar-hide max-h-[280px] overflow-auto rounded-xl border border-line">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] uppercase tracking-wide text-ink-400">
          <tr>
            <th className="px-2.5 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-right font-medium">字数</th>
            <th className="px-2 py-2 text-left font-medium">unicode-range</th>
            <th className="px-2.5 py-2 text-right font-medium">大小</th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((c) => {
            const on = hit.has(c.index);
            const bytes = c.files[format]?.bytes ?? Object.values(c.files)[0]?.bytes ?? 0;
            return (
              <tr
                key={c.index}
                className={`border-t border-line ${on ? 'bg-brand-100' : 'hover:bg-surface-2'}`}
              >
                <td className="px-2.5 py-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2.5 w-[2px] rounded-full ${
                        on ? 'bg-brand' : 'bg-ink-300'
                      }`}
                    />
                    <span className={`zr-num ${on ? 'font-medium text-brand' : 'text-ink-400'}`}>
                      {String(c.index).padStart(2, '0')}
                    </span>
                  </span>
                </td>
                <td className="zr-num px-2 py-2 text-right text-ink-700">{c.codepoints.length}</td>
                <td className="zr-num max-w-0 truncate px-2 py-2 text-ink-400">
                  {c.unicodeRange}
                </td>
                <td className="zr-num px-2.5 py-2 text-right text-ink-700">{fmtBytes(bytes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
