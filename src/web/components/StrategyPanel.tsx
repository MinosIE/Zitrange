import { useMemo } from 'react';
import { validate } from '@core/validate';
import type {
  FallbackCharset,
  FontInfo,
  OutputFormat,
  PartitionStrategy,
  StrategyMode,
} from '@core/types';
import { ChipGroup, Field, Note, NumberField, Panel, Segmented, Select } from './ui';

const MODES: { value: StrategyMode; label: string }[] = [
  { value: 'hybrid', label: '混合' },
  { value: 'frequency', label: '字频' },
  { value: 'site', label: '站点' },
];

const MODE_HINT: Record<StrategyMode, string> = {
  hybrid: '站点用字优先排前，字频表兜底补全生僻字。兼顾二者，适合大多数站点。',
  frequency: '完全按通用字频降序切分。适合内容不可预知的博客、CMS 与 UGC。',
  site: '只打包扫描到的字符，通常 500–5000 字。适合文案固定的落地页与活动页。',
};

const FALLBACKS: { value: FallbackCharset; label: string }[] = [
  { value: 'none', label: '不兜底' },
  { value: 'common-3500', label: '常用字前 3500' },
  { value: 'common-7000', label: '常用字前 7000' },
  { value: 'gb2312', label: 'GB2312 全集' },
];

const FORMATS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: 'woff2', label: 'woff2', hint: '默认。比 TTF 小 3–5 倍，覆盖约 97% 浏览器' },
  { value: 'woff', label: 'woff', hint: '需兼容 IE11 / 老 Safari 时追加' },
  { value: 'ttf', label: 'ttf', hint: '无压缩，供原生 App、PDF 内嵌等非 Web 场景' },
];

export function StrategyPanel({
  font,
  charCount,
  strategy,
  onStrategy,
  format,
  onToggleFormat,
  delay = 120,
}: {
  font: FontInfo | null;
  charCount: number;
  strategy: PartitionStrategy;
  onStrategy: (s: PartitionStrategy) => void;
  format: OutputFormat[];
  onToggleFormat: (f: OutputFormat) => void;
  delay?: number;
}) {
  // 校验是 core 里的纯函数，参数一改即时出结论，不打断输入
  const issues = useMemo(
    () => validate({ charCount, strategy, format, font: font ?? undefined }),
    [charCount, strategy, format, font],
  );

  return (
    <Panel step="03" title="分片策略" delay={delay}>
      <Field label="输出格式">
        <ChipGroup values={format} onToggle={onToggleFormat} options={FORMATS} />
      </Field>

      <div className="mt-3.5">
        <Field label="分片模式">
          <Segmented
            value={strategy.mode}
            onChange={(mode) => onStrategy({ ...strategy, mode })}
            options={MODES}
          />
        </Field>
        <div className="mt-1.5 text-[10px] leading-snug text-paper-mute">
          {MODE_HINT[strategy.mode]}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        <Field label="单片字数" hint="默认 200">
          <NumberField
            value={strategy.baseSize}
            onChange={(baseSize) => onStrategy({ ...strategy, baseSize })}
          />
        </Field>
        <Field label="递增系数" hint="1 = 固定分片">
          <NumberField
            value={strategy.growth}
            step={0.05}
            min={0}
            onChange={(growth) => onStrategy({ ...strategy, growth })}
          />
        </Field>
        <Field label="单片上限">
          <NumberField
            value={strategy.maxSize}
            onChange={(maxSize) => onStrategy({ ...strategy, maxSize })}
          />
        </Field>
      </div>

      <div className="mt-3.5">
        <Field label="兜底字表" hint="站点未覆盖的字，按通用字频补全">
          <Select
            value={strategy.fallback}
            onChange={(fallback) => onStrategy({ ...strategy, fallback })}
            options={FALLBACKS}
          />
        </Field>
      </div>

      {issues.length > 0 && (
        <div className="mt-3.5 space-y-1.5 border-t border-line-soft pt-3">
          {issues.map((i) => (
            <Note key={i.id} level={i.level}>
              {i.text}
            </Note>
          ))}
        </div>
      )}
    </Panel>
  );
}
