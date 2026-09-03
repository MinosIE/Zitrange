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
      title="你的网站会出现哪些字"
      delay={60}
      hint={
        stats.unique > 0 ? (
          <span className="zr-num">识别到 {stats.unique.toLocaleString()} 个字</span>
        ) : (
          <span className="text-ink-300">尚未粘贴，将只用兜底字表</span>
        )
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-[11px] leading-relaxed text-ink-400">
          把网站文案粘贴进来，工具就只切出这些字——不必为整本字典买单。
          <br />
          文案给得越全，切出来的字体越不容易缺字。
        </p>

        <textarea
          className="zr-field h-28 resize-y leading-relaxed"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={
            '粘贴网站的正文、导航、标题、按钮文案……\n' +
            '留空也可以，工具会退回到「兜底字表」来选字。'
          }
        />

        <button
          type="button"
          className="self-start text-[11px] text-ink-400 underline decoration-dotted underline-offset-4 hover:text-ink-700"
          onClick={() => setOpenSample((v) => !v)}
        >
          {openSample ? '收起' : '我想预测单个页面的加载量'}
        </button>

        {openSample && (
          <div className="flex flex-col gap-1">
            <textarea
              className="zr-field h-20 resize-y leading-relaxed"
              value={sampleText}
              onChange={(e) => onSampleChange(e.target.value)}
              placeholder="粘贴某一个页面的文案，比如首页"
            />
            <span className="text-[10px] leading-snug text-ink-300">
              上面那框决定「切哪些字」；这里只决定「预测哪个页面」，不会改变产物。
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
