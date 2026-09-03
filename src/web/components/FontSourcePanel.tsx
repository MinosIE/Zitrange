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
  const [path, setPath] = useState('');
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

  async function ingestPath() {
    const p = path.trim();
    if (!p) return;
    setUploading(true);
    try {
      const info = await inspectFont(p);
      onLoaded({ ...info, path: p });
    } catch (e: any) {
      onError(String(e?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  // 用计数器抵消 dragenter/dragleave 在子元素间冒泡导致的闪烁
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
    <Panel step="01" title="字体" delay={0} hint={font ? `${fmtBytes(font.bytes)}` : undefined}>
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
        <div>
          <div className="font-song text-[19px] font-semibold leading-tight text-paper">
            {font.family || font.fileName}
          </div>
          <div className="zr-num mt-1 truncate text-[11px] text-paper-mute">{font.fileName}</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge tone="brass">{font.numGlyphs.toLocaleString()} 字形</Badge>
            <Badge>{fmtBytes(font.bytes)}</Badge>
            <Badge>{font.subfamily}</Badge>
            <Badge>w{font.weight}</Badge>
            <Badge>{font.outline === 'cff' ? 'CFF 轮廓' : 'glyf 轮廓'}</Badge>
            {font.isVariable && <Badge tone="jade">可变字体</Badge>}
          </div>
          <button
            type="button"
            className="zr-btn zr-btn-ghost mt-3 w-full py-1.5 text-[12px]"
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
            <div className="w-full px-4">
              <div className="mb-2 text-[12px] text-brass-300">上传并检视中…</div>
              <div className="zr-sweep h-1 w-full rounded-full" />
            </div>
          ) : (
            <>
              <div className="font-song text-[15px] text-paper-dim">拖入字体文件</div>
              <div className="text-[11px] text-paper-mute">
                或点击选择 · TTF / OTF / WOFF2 / WOFF
              </div>
            </>
          )}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer select-none text-[11px] text-paper-mute hover:text-paper-dim">
          用本地路径指定
        </summary>
        <div className="mt-2 flex gap-2">
          <input
            className="zr-field zr-num flex-1 text-[12px]"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="demo/FZJinHJW.TTF"
          />
          <button
            type="button"
            className="zr-btn zr-btn-ghost px-3 text-[12px]"
            onClick={ingestPath}
            disabled={locked || !path.trim()}
          >
            读取
          </button>
        </div>
      </details>
    </Panel>
  );
}
