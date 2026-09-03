/** Unicode 码位 */
export type Codepoint = number;

/** 码位 -> 出现次数 */
export type CharFreq = Map<Codepoint, number>;

export type SourceKind = 'text' | 'files' | 'url' | 'builtin';

export type StrategyMode = 'site' | 'frequency' | 'hybrid' | 'codepoint' | 'block';

/** 兜底字表档位。数字表示取字表前 N 字 */
export type FallbackCharset = 'none' | 'common-3500' | 'common-7000' | 'gb2312';

export type OutputFormat = 'woff2' | 'woff' | 'ttf';

export type FontDisplay = 'swap' | 'block' | 'fallback' | 'optional';

export interface PartitionStrategy {
  mode: StrategyMode;
  /** 目标单片字数，默认 200 */
  baseSize: number;
  /** 递增系数，默认 1.35；传 1 表示固定分片 */
  growth: number;
  /** 递增上限，默认 800 */
  maxSize: number;
  fallback: FallbackCharset;
  /** 拆分全量字体：用字体 cmap 的全部码位作为字符集，绕过兜底字表上限 */
  useFontCmap?: boolean;
  /**
   * ASCII/标点保底：是否自动把数字、字母、中英文标点等「任何页面都用得到」的字符
   * 注入字符集（受字体支持情况裁剪），默认 true。
   * 开启时这些字永远在产物里，配合「ASCII 优先片」可让首屏立即可用；
   * 关闭则只切你输入的字符（你的文本若含 ASCII/标点仍会被纳入），
   * 适合想严格只出自己字、不要任何多余字符的场景。
   * 全量模式（useFontCmap）下此选项无作用（cmap 已含这些字）。
   */
  includeAsciiPunct?: boolean;
  /**
   * 是否把 ASCII/标点单独成第 0 片（PRD F2.4），默认 true。
   * 关闭后这些字符并入正文片、第 0 片不再单独存在；
   * 代价：拉丁/数字/标点的首屏局部性收益减弱（它们不再稳定先于正文片加载）。
   */
  asciiFirst?: boolean;
  /**
   * 目标片数：>0 时按字符集字形总数动态推导每片字数（固定分片），
   * 覆盖 baseSize/growth，使片数大致稳定、不随字形总量暴涨。
   * 全量中文约 20000 字、每片固定 500–1000 会切出 20–40 片请求过多，
   * 设目标片数（如 20）即可把每片字数自动放大到 ~1000，片数收敛到目标值附近。
   * 码块模式（mode='block'）下此值直接作为「均匀码块」的块数。
   * 码位模式（mode='codepoint'）下此值作为片数上限（等价 maxChunks）——
   * 该模式在 partition() 中先于动态片数推导就 return，故由 partitionByCodepoint 自行消费。
   */
  targetSlices?: number;
  /**
   * 首屏片永载：开启（且 asciiFirst 开启）时，ASCII/标点片不写 unicode-range，
   * 浏览器无条件下载，保证首屏零解析成本、立即可用（参考 demo 的 basic 片）。
   */
  asciiAlwaysLoad?: boolean;
  /**
   * 仅 mode='codepoint' 生效：片数硬上限。
   * 字符集极度分散（几乎无连续段）时每片退化为单字、片数暴涨，
   * 用此上限把相邻段合并以控制 @font-face 数量（合并后的片 range 会变长，属可接受退化）。
   * 取值优先级：本字段 > targetSlices（界面「按目标片数」档）> 默认 512。
   * 界面已不再直接暴露本字段，保留它仅供历史配置与程序化调用。
   */
  maxChunks?: number;
}

export interface Chunk {
  index: number;
  codepoints: Codepoint[];
}

/** 字体元信息，来自 inspect */
export interface FontInfo {
  /** 服务端侧的临时文件标识 */
  id: string;
  fileName: string;
  bytes: number;
  family: string;
  subfamily: string;
  weight: number;
  style: 'normal' | 'italic';
  numGlyphs: number;
  /** 源字体的轮廓类型，决定输出格式（PRD §6.8：不做轮廓转换） */
  outline: 'glyf' | 'cff';
  isVariable: boolean;
  /** 字体在集合文件（.ttc/.otc）中的索引，非集合文件为 0 */
  fontNumber: number;
}

export interface ValidationIssue {
  id: string;
  level: 'info' | 'warn';
  text: string;
}


