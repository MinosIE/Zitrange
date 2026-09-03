import { useRef, useState, type DragEvent } from 'react';
import { inspectFont, uploadFont, type InspectResult } from '../api';
import { Badge, Panel, fmtBytes } from './ui';

export interface LoadedFont extends InspectResult {
  /** 服务端相对路径，processFont 需要 */
  path: string;
}

const ACCEPT = '.ttf,.otf,.woff2,.woff,.ttc,.otc';

export function FontSourcePanel({
  font,
  onLoaded,
  onError,
  busy,
}: {
  font: LoadedFont | null;
  onLoaded: (f: LoadedFont) => void;
  onError: (msg: string) => void;
  busy: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const depth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = busy || uploading;

  async function ingestFile(file: File) {
    setUploading(true);
    try {
      const up = await uploadFont(file);
      const info = await inspectFont(up.path);
      onLoaded({ ...info, path: up.path });
    } catch (e: any) {
      onError(String(e?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  // 计数器抵消 dragenter/dragleave 在子元素间冒泡导致的闪烁
  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    if (locked) return;
    depth.current += 1;
    setDrag(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setDrag(false);
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    depth.current = 0;
    setDrag(false);
    if (locked) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void ingestFile(f);
  }

  return (
    <Panel step="01" title="字体" delay={0} hint={font ? fmtBytes(font.bytes) : undefined}>
      <div className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ingestFile(f);
            e.target.value = '';
          }}
        />

        {font ? (
          <div className="flex flex-col gap-2">
            <div className="font-song text-[19px] font-semibold leading-tight text-ink-900">
              {font.family || font.fileName}
            </div>
            <div className="zr-num truncate text-[11px] text-ink-400">{font.fileName}</div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">{font.numGlyphs.toLocaleString()} 字形</Badge>
              <Badge>{fmtBytes(font.bytes)}</Badge>
              <Badge>{font.subfamily}</Badge>
              <Badge>w{font.weight}</Badge>
              <Badge>{font.outline === 'cff' ? 'CFF 轮廓' : 'glyf 轮廓'}</Badge>
              {font.isVariable && <Badge tone="info">可变字体</Badge>}
            </div>
            <button
              type="button"
              className="zr-btn zr-btn-ghost w-full py-1.5 text-[12px]"
              onClick={() => inputRef.current?.click()}
              disabled={locked}
            >
              更换字体
            </button>
          </div>
        ) : (
          <div
            className="zr-drop flex cursor-pointer flex-col items-center justify-center gap-1.5 px-4 py-7 text-center"
            data-active={drag ? 'true' : 'false'}
            onClick={() => !locked && inputRef.current?.click()}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {uploading ? (
              <div className="flex w-full flex-col gap-2 px-4">
                <span className="text-[12px] text-brand">上传并检视中…</span>
                <span className="zr-sweep h-1 w-full rounded-full" />
              </div>
            ) : (
              <>
                <span className="font-song text-[15px] text-ink-700">拖入字体文件</span>
                <span className="text-[11px] text-ink-300">
                  或点击选择 · TTF / OTF / WOFF2 / WOFF
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
