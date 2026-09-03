// 纯 TS 实现的最小 ZIP（store 法，无压缩）。
// 用途：把多分片字体 + CSS 打包成单个 .zip 下载。
// 字体已是 woff2（压缩格式），store 即可，无需引入额外依赖。

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** 把若干文件打包成 ZIP（store）并返回 Blob */
export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // 本地文件头
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); // 签名
    lv.setUint16(4, 20, true); // 所需版本
    lv.setUint16(6, 0, true); // 通用标志
    lv.setUint16(8, 0, true); // 压缩方法 = store
    lv.setUint16(10, 0, true); // 修改时间
    lv.setUint16(12, 0, true); // 修改日期
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // 压缩后大小
    lv.setUint32(22, size, true); // 未压缩大小
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // 扩展字段长度
    lh.set(nameBytes, 30);
    chunks.push(lh, entry.data);

    // 中央目录头
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // 制作版本
    cv.setUint16(6, 20, true); // 所需版本
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // 本地头偏移
    ch.set(nameBytes, 46);
    central.push(ch);

    offset += lh.length + entry.data.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);

  // 合并为单个 ArrayBuffer 支持的 Uint8Array 再交给 Blob（规避 TS 对 BlobPart 的泛型约束）
  const parts = [...chunks, ...central, eocd];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return new Blob([out], { type: 'application/zip' });
}

/** 生成并触发下载一个包含全部 entry 的 .zip */
export async function downloadZip(name: string, entries: ZipEntry[]): Promise<void> {
  const blob = buildZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
