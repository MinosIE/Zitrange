import type { ManualOverride, OutputFormat } from '@core/types';
import { useState } from 'react';
import type { ChunkResult } from '../api';
import { Dropdown, fmtBytes, downloadText, downloadUrl } from './ui';

// 取分片前若干字符作为样本，便于一眼看清这一片大致覆盖哪些字；
// 完整编码范围仍由调用方以 title 形式保留。
function sampleGlyphs(cps: number[]): string {
  if (cps.length === 0) return '—';
  const head = cps.slice(0, 8).map((c) => String.fromCodePoint(c));
  return cps.length > 8 ? head.join('') + '…' : head.join('');
}

export function ChunkTable({
  chunks,
  format,
  hitIndices,
  overrides,
  css,
  baseName,
  onPin,
  onExclude,
  onReset,
}: {
  chunks: ChunkResult[];
  format: OutputFormat;
  hitIndices: number[];
  overrides?: ManualOverride[];
  css: string;
  baseName: string;
  onPin: (targetIndex: number, chars: string) => void;
  onExclude: (chars: string) => void;
  onReset: () => void;
}) {
  const hit = new Set(hitIndices);
  const [charInput, setCharInput] = useState('');
  const [pinTarget, setPinTarget] = useState('0');

  const pinOptions = chunks.map((c) => ({
    value: String(c.index),
    label: `#${c.index} · ${c.codepoints.length}字`,
  }));
  const overrideCount = overrides?.length ?? 0;

  function downloadAll() {
    for (const c of chunks) {
      for (const fmt of Object.keys(c.files) as OutputFormat[]) {
        const f = c.files[fmt];
        if (f) downloadUrl(f.url, `${baseName}-${c.index}.${fmt === 'ttf' ? 'ttf' : fmt}`);
      }
    }
    downloadText(css, `${baseName}.css`);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="scrollbar-hide max-h-[280px] overflow-auto rounded-xl border border-line">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-2.5 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-right font-medium">字数</th>
              <th className="px-2 py-2 text-left font-medium">字符</th>
              <th className="px-2.5 py-2 text-right font-medium">大小</th>
              <th className="px-2 py-2 text-center font-medium">下载</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((c) => {
              const on = hit.has(c.index);
              const bytes = c.files[format]?.bytes ?? Object.values(c.files)[0]?.bytes ?? 0;
              const formats = (Object.keys(c.files) as OutputFormat[]).filter((f) => c.files[f]);
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
                  <td className="px-2 py-2 text-ink-700" title={c.unicodeRange}>
                    <span className="font-song text-[13px] leading-none">
                      {sampleGlyphs(c.codepoints)}
                    </span>
                  </td>
                  <td className="zr-num px-2.5 py-2 text-right text-ink-700">{fmtBytes(bytes)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {formats.length === 0 ? (
                        <span className="text-[10px] text-ink-300">—</span>
                      ) : (
                        formats.map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() =>
                              downloadUrl(
                                c.files[fmt]!.url,
                                `${baseName}-${c.index}.${fmt === 'ttf' ? 'ttf' : fmt}`,
                              )
                            }
                            title={`下载 ${fmt.toUpperCase()}`}
                            className="zr-btn zr-btn-ghost px-1.5 py-0.5 text-[10px]"
                          >
                            {fmt}
                          </button>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={charInput}
            onChange={(e) => setCharInput(e.target.value)}
            placeholder="输入字符，如 品牌名"
            className="zr-field min-w-0 flex-1 px-2 py-1 text-[12px]"
          />
          <Dropdown value={pinTarget} onChange={setPinTarget} options={pinOptions} />
          <button
            type="button"
            onClick={() => {
              onPin(Number(pinTarget), charInput);
              setCharInput('');
            }}
            className="zr-btn zr-btn-ghost px-2 py-1 text-[11px]"
          >
            钉到片
          </button>
          <button
            type="button"
            onClick={() => {
              onExclude(charInput);
              setCharInput('');
            }}
            className="zr-btn zr-btn-ghost px-2 py-1 text-[11px]"
          >
            排除
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ink-300">
            手动编辑叠加在自动分片之上；改参数重新生成时保留
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={downloadAll}
              className="zr-btn zr-btn-ghost px-2 py-0.5 text-[10px]"
            >
              下载全部
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={overrideCount === 0}
              className="zr-btn zr-btn-ghost px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
            >
              重置手动编辑{overrideCount > 0 ? ` (${overrideCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
