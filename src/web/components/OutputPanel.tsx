import { useEffect, useMemo, useState } from 'react';
import type { OutputFormat } from '@core/types';
import type { ChunkResult } from '../api';
import { Segmented } from './ui';

const FMT_HINT: Record<OutputFormat, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
};

const DEFAULT_PREVIEW = '中文网页字体优化 · Zitrange 0123456789 ABCabc，。、《》';

/**
 * 产物预览：CSS 源码 / 用产出的分片字体真渲染。
 *
 * 字形预览不是装饰——它用带 unicode-range 的分片字体渲染样本文本，
 * 能直接验证切分有没有切坏、缺字会不会发生（PRD F4.6）。
 */
export function OutputPanel({
  jobId,
  css,
  chunks,
  format,
  sampleText,
}: {
  jobId: string;
  css: string;
  chunks: ChunkResult[];
  format: OutputFormat;
  sampleText: string;
}) {
  const [tab, setTab] = useState<'css' | 'glyph'>('css');
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(34);
  const fam = useMemo(() => `zr-prev-${jobId}`, [jobId]);

  useEffect(() => {
    if (tab !== 'glyph') return;
    const rules = chunks
      .map((c) => {
        const f = c.files[format];
        if (!f) return '';
        return `@font-face{font-family:"${fam}";src:url("${f.url}") format("${FMT_HINT[format]}");unicode-range:${c.unicodeRange};font-display:swap;}`;
      })
      .join('\n');
    const el = document.createElement('style');
    el.textContent = rules;
    document.head.appendChild(el);
    return () => {
      document.head.removeChild(el);
    };
  }, [tab, chunks, format, fam]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用时静默失败，用户仍可手动选中复制 */
    }
  }

  const text = sampleText.trim() || DEFAULT_PREVIEW;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-[190px] shrink-0">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'css', label: '@font-face CSS' },
              { value: 'glyph', label: '字形预览' },
            ]}
          />
        </div>

        {tab === 'css' ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className="zr-btn zr-btn-ghost shrink-0 px-3 py-1 text-[12px]"
              onClick={copy}
            >
              {copied ? '已复制' : '复制'}
            </button>
          </>
        ) : (
          <>
            <div className="flex-1" />
            <label className="flex shrink-0 items-center gap-2 text-[11px] text-ink-400">
              字号
              <input
                type="range"
                min={16}
                max={72}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-28 accent-brand"
              />
              <span className="zr-num w-7 text-right">{size}</span>
            </label>
          </>
        )}
      </div>

      {tab === 'css' ? (
        <pre className="zr-num max-h-[320px] overflow-auto rounded-xl border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-700">
          {css}
        </pre>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div
            className="break-words leading-relaxed text-ink-900"
            style={{ fontFamily: `"${fam}", sans-serif`, fontSize: `${size}px` }}
          >
            {text}
          </div>
          <div className="border-t border-line pt-2 text-[10px] leading-snug text-ink-400">
            用本次产出的 {chunks.length} 个分片（{format}）渲染。若某个字看起来与其他字字体不一致，
            说明它落在缺字回退上——去看上面的建议面板有没有缺字告警。
          </div>
        </div>
      )}
    </div>
  );
}
