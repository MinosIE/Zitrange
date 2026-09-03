import { useState } from 'react';
import { downloadText } from './ui';

/**
 * 产物预览：展示可直接复制的 @font-face CSS 源码，并支持下载。
 * 字形验证改由「分片清单」的字符样本与「字体预览」承担，这里不再重复渲染。
 */
export function OutputPanel({ css, baseName = 'zitrange' }: { css: string; baseName?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用时静默失败，用户仍可手动选中复制 */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-song text-[13px] font-semibold text-ink-900">@font-face CSS</h3>
        <div className="flex-1" />
        <button
          type="button"
          className="zr-btn zr-btn-ghost shrink-0 px-3 py-1 text-[12px]"
          onClick={() => downloadText(css, `${baseName}.css`)}
        >
          下载
        </button>
        <button
          type="button"
          className="zr-btn zr-btn-ghost shrink-0 px-3 py-1 text-[12px]"
          onClick={copy}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="zr-num max-h-[320px] overflow-auto rounded-xl border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-700">
        {css}
      </pre>
    </div>
  );
}
