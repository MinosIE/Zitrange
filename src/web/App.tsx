import { useMemo, useState } from 'react';
import { extractCharFreq, FALLBACK_SIZES } from '@core/charset';
import type { OutputFormat, PartitionStrategy } from '@core/types';
import { processFont, type ProcessResult } from './api';
import { CharSourcePanel } from './components/CharSourcePanel';
import { FontSourcePanel, type LoadedFont } from './components/FontSourcePanel';
import { StrategyPanel } from './components/StrategyPanel';
import { SizeComparison } from './components/SizeComparison';
import { AdvicePanel } from './components/AdvicePanel';
import { ChunkTable } from './components/ChunkTable';
import { OutputPanel } from './components/OutputPanel';
import { Empty, Note, Panel, Stat } from './components/ui';

const DEFAULT_STRATEGY: PartitionStrategy = {
  mode: 'hybrid',
  baseSize: 200,
  growth: 1.35,
  maxSize: 800,
  fallback: 'common-3500',
};

const SAMPLE_TEXT =
  '中文网页字体优化是一种针对中文字体文件体积过大的有效方案。' +
  '通过按使用频率拆分并配合 unicode-range，浏览器只会下载当前页面真正需要的字形，' +
  '首屏不再被迫加载数 MB 的完整字体。';

export default function App() {
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [sampleText, setSampleText] = useState('');
  const [format, setFormat] = useState<OutputFormat[]>(['woff2']);
  const [strategy, setStrategy] = useState<PartitionStrategy>(DEFAULT_STRATEGY);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 字符集规模估算：文本去重 + 兜底字表将追加的量。
  // 只用于驱动前端实时校验，真实值以服务端返回的 charsetSize 为准。
  const charCount = useMemo(
    () => extractCharFreq(text).size + (FALLBACK_SIZES[strategy.fallback] ?? 0),
    [text, strategy.fallback],
  );

  const totalOut = useMemo(() => {
    if (!result) return 0;
    const f = format[0];
    return result.chunks.reduce(
      (s, c) => s + (c.files[f]?.bytes ?? Object.values(c.files)[0]?.bytes ?? 0),
      0,
    );
  }, [result, format]);

  async function doProcess() {
    if (!font) return;
    setError('');
    setBusy(true);
    try {
      setResult(
        await processFont({
          path: font.path,
          text,
          format,
          strategy,
          sampleText: sampleText || text,
        }),
      );
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function toggleFormat(f: OutputFormat) {
    setFormat((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-7">
      <header className="mb-5 flex items-end justify-between border-b border-line pb-4">
        <div>
          <div className="font-song text-[26px] font-bold leading-none tracking-wide text-paper">
            Zitrange
          </div>
          <div className="mt-2 text-[11px] text-paper-mute">
            中文字体分包与优化 · 本地运行，字体文件全程不出本机
          </div>
        </div>
        <div className="text-right">
          <div className="zr-eyebrow">ENGINE</div>
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                busy ? 'zr-dot-live bg-brass-400' : 'bg-jade-400'
              }`}
            />
            <span className="text-paper-dim">{busy ? '处理中' : '就绪'}</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-[3px] border-l-2 border-danger-500 bg-danger-500/[0.08] px-3 py-2 text-[12px] text-danger-400">
          {error}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[360px_1fr]">
        {/* ---- 左：配置 ---- */}
        <div className="space-y-4">
          <FontSourcePanel
            font={font}
            onLoaded={setFont}
            onError={setError}
            busy={busy}
          />
          <CharSourcePanel
            text={text}
            onTextChange={setText}
            sampleText={sampleText}
            onSampleChange={setSampleText}
          />
          <StrategyPanel
            font={font}
            charCount={charCount}
            strategy={strategy}
            onStrategy={setStrategy}
            format={format}
            onToggleFormat={toggleFormat}
          />

          <button
            type="button"
            className="zr-btn zr-btn-primary w-full py-2.5 text-[13px]"
            onClick={doProcess}
            disabled={busy || !font}
          >
            {busy ? (
              <>
                <span className="zr-sweep h-1 w-24 rounded-full" />
                处理中…
              </>
            ) : (
              '生成分片'
            )}
          </button>
          {!font && (
            <div className="text-center text-[10px] text-paper-mute">先加载一个字体文件</div>
          )}
        </div>

        {/* ---- 右：结果 ---- */}
        <div className="space-y-4">
          {!result ? (
            <Panel title="结果" delay={180}>
              <Empty>
                加载字体并生成分片后，这里会给出体积对比、分片清单，
                <br />
                以及可以直接复制的 @font-face CSS。
              </Empty>
            </Panel>
          ) : (
            <>
              <Panel
                title="体积对比"
                delay={0}
                hint={<span className="zr-num">字符集 {result.charsetSize.toLocaleString()} 字</span>}
              >
                <SizeComparison
                  original={font?.bytes ?? result.font.bytes}
                  total={totalOut}
                  actual={result.simulation ? result.simulation.totalBytes : null}
                  hitIndices={result.simulation?.hitIndices ?? []}
                  chunkCount={result.chunks.length}
                />
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="分片数" value={String(result.chunks.length)} />
                  <Stat
                    label="模拟命中"
                    value={
                      result.simulation
                        ? `${result.simulation.hitIndices.length}/${result.chunks.length}`
                        : '—'
                    }
                  />
                  <Stat
                    label="字符覆盖率"
                    value={
                      result.simulation
                        ? `${(result.simulation.coverage * 100).toFixed(1)}%`
                        : '—'
                    }
                    tone="jade"
                  />
                  <Stat
                    label="分片合计"
                    value={`${(totalOut / 1024).toFixed(0)} KB`}
                    tone="brass"
                  />
                </div>
              </Panel>

              <Panel title="智能建议" delay={60}>
                <AdvicePanel rec={result.recommendation} />
                {result.issues.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-line-soft pt-3">
                    {result.issues.map((i) => (
                      <Note key={i.id} level={i.level}>
                        {i.text}
                      </Note>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                title="分片清单"
                delay={120}
                hint={<span className="text-paper-mute">高亮行 = 样本文本会命中的片</span>}
              >
                <ChunkTable
                  chunks={result.chunks}
                  format={format[0]}
                  hitIndices={result.simulation?.hitIndices ?? []}
                />
              </Panel>

              <Panel title="产物预览" delay={180}>
                <OutputPanel
                  jobId={result.jobId}
                  css={result.css}
                  chunks={result.chunks}
                  format={format[0]}
                  sampleText={sampleText || text}
                />
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
