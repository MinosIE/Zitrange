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
    <div className="max-h-[280px] overflow-auto rounded-[3px] border border-line-soft">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-ink-800 text-[10px] uppercase tracking-wide text-paper-mute">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-normal">#</th>
            <th className="px-2 py-1.5 text-right font-normal">字数</th>
            <th className="px-2 py-1.5 text-left font-normal">unicode-range</th>
            <th className="px-2.5 py-1.5 text-right font-normal">大小</th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((c) => {
            const on = hit.has(c.index);
            const bytes = c.files[format]?.bytes ?? Object.values(c.files)[0]?.bytes ?? 0;
            return (
              <tr
                key={c.index}
                className={`border-t border-line-soft/70 ${on ? 'bg-brass-500/[0.07]' : ''}`}
              >
                <td className="px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2.5 w-[2px] rounded-full ${
                        on ? 'bg-brass-400' : 'bg-ink-600'
                      }`}
                    />
                    <span className={`zr-num ${on ? 'text-brass-300' : 'text-paper-mute'}`}>
                      {String(c.index).padStart(2, '0')}
                    </span>
                  </span>
                </td>
                <td className="zr-num px-2 py-1.5 text-right text-paper-dim">
                  {c.codepoints.length}
                </td>
                <td className="zr-num max-w-0 truncate px-2 py-1.5 text-paper-mute">
                  {c.unicodeRange}
                </td>
                <td className="zr-num px-2.5 py-1.5 text-right text-paper-dim">
                  {fmtBytes(bytes)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
