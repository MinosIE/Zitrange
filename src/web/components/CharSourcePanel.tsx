import { useMemo, useState } from 'react';
import { extractCharFreq } from '@core/charset';
import { Panel } from './ui';

export function CharSourcePanel({
  text,
  onTextChange,
  sampleText,
  onSampleChange,
}: {
  text: string;
  onTextChange: (v: string) => void;
  sampleText: string;
  onSampleChange: (v: string) => void;
}) {
  const [openSample, setOpenSample] = useState(false);

  // core 是纯函数，直接在前端算，输入即反馈
  const stats = useMemo(() => {
    const freq = extractCharFreq(text);
    let total = 0;
    for (const n of freq.values()) total += n;
    return { unique: freq.size, total };
  }, [text]);

  return (
    <Panel
      step="02"
      title="字符集来源"
      delay={60}
      hint={
        <span className="zr-num">
          去重 {stats.unique.toLocaleString()} 字 / 共 {stats.total.toLocaleString()} 次
        </span>
      }
    >
      <textarea
        className="zr-field h-28 resize-y leading-relaxed"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="粘贴站点正文、导航与标题文案……"
      />

      <button
        type="button"
        className="mt-2 text-[11px] text-paper-mute underline decoration-dotted underline-offset-4 hover:text-paper-dim"
        onClick={() => setOpenSample((v) => !v)}
      >
        {openSample ? '收起' : '单独指定模拟加载用的样本文本'}
      </button>

      {openSample && (
        <div className="mt-2">
          <textarea
            className="zr-field h-20 resize-y leading-relaxed"
            value={sampleText}
            onChange={(e) => onSampleChange(e.target.value)}
            placeholder="留空则使用上方文本。填入则用它模拟「某个页面会下载哪些片」。"
          />
          <div className="mt-1 text-[10px] leading-snug text-paper-mute">
            模拟结果会告诉你：这个页面实际只会下载几片、多少 KB。
          </div>
        </div>
      )}
    </Panel>
  );
}
