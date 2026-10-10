// Danh mục vật phẩm trang trí: bàn cờ, quân cờ, khung avatar, avatar. Dùng chung cho giao diện và cửa hàng.

export interface BoardSkin {
  id: string;
  name: string;
  desc: string;
  /** Giá bằng xu; 0 = miễn phí. */
  price: number;
  vipOnly?: boolean;
  board: string;
  line: string;
  rim: string;
}

export interface PieceSkin {
  id: string;
  name: string;
  desc: string;
  price: number;
  vipOnly?: boolean;
  face: string;
  red: string;
  black: string;
  edge: string;
}

export interface FrameItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  vipOnly?: boolean;
  /** Chỉ nhận được qua phần thưởng (mùa giải, giải đấu), không bán. */
  rewardOnly?: boolean;
  ring: string;
  ring2: string;
  seal?: string;
}

export const BOARD_SKINS: BoardSkin[] = [
  { id: "go", name: "Gỗ hương", desc: "Bàn cờ mặc định, vân gỗ ấm.", price: 0, board: "#e9c88e", line: "#5a3418", rim: "#6e3f1c" },
  { id: "bamboo", name: "Trúc lâm", desc: "Thanh trúc vàng nhạt.", price: 3600, board: "#dccb7a", line: "#3f3a10", rim: "#5e5a1e" },
  { id: "paper", name: "Giấy dó", desc: "Nền giấy mộc, nét mực tàu.", price: 4200, board: "#efe6d2", line: "#2a211b", rim: "#8c7a62" },
  { id: "night", name: "Dạ cờ", desc: "Nền đêm dịu mắt khi chơi khuya.", price: 5500, board: "#2c3a4a", line: "#9fb3c8", rim: "#121a23" },
  { id: "jade", name: "Ngọc bích", desc: "Mặt ngọc xanh, viền đồng.", price: 6800, board: "#9cc7b0", line: "#1e3d33", rim: "#2f5d50" },
  { id: "lacquer", name: "Sơn mài", desc: "Đỏ son, nét vẽ vàng.", price: 9900, board: "#7d1712", line: "#e6b65a", rim: "#2a0b08" },
  { id: "imperial", name: "Hoàng cung", desc: "Vàng hoàng gia, dành riêng cho VIP.", price: 0, vipOnly: true, board: "#e6b65a", line: "#5e1a14", rim: "#5e1a14" },
];

export const PIECE_SKINS: PieceSkin[] = [
  { id: "wood", name: "Quân gỗ cổ", desc: "Quân mặc định, khắc chữ Khải.", price: 0, face: "#f3dfb6", red: "#b3261e", black: "#1e1915", edge: "#9c7a4a" },
  { id: "ink", name: "Quân thủy mặc", desc: "Nét bút lông phóng khoáng.", price: 4800, face: "#f4efe4", red: "#c8312a", black: "#3a3a3a", edge: "#b5ac9a" },
  { id: "jade", name: "Quân ngọc", desc: "Ngọc trắng, chữ khắc chìm.", price: 7200, face: "#eaf2ec", red: "#a3221b", black: "#1e3d33", edge: "#9db5a7" },
  { id: "gold", name: "Quân hoàng kim", desc: "Mạ vàng lấp lánh.", price: 15000, face: "#e6b65a", red: "#7d1712", black: "#2a1a08", edge: "#8a5a12" },
];

export const FRAMES: FrameItem[] = [
  { id: "none", name: "Không khung", desc: "Avatar mặc định.", price: 0, ring: "#8c7a62", ring2: "transparent" },
  { id: "plum", name: "Hoa mai", desc: "Mai vàng ngày Tết.", price: 6600, ring: "#f3d08a", ring2: "#c8312a", seal: "迎春" },
  { id: "jade", name: "Ngọc lục", desc: "Viền ngọc xanh thanh nhã.", price: 8000, ring: "#6fb08f", ring2: "#1e3d33", seal: "翡翠" },
  { id: "dragon", name: "Long phụng", desc: "Rồng phượng đỏ vàng.", price: 12000, ring: "#c8312a", ring2: "#d9a441", seal: "龍鳳" },
  { id: "vip", name: "Khung VIP", desc: "Dành cho thành viên VIP.", price: 0, vipOnly: true, ring: "#d9a441", ring2: "#7d1712", seal: "貴賓" },
  { id: "champion", name: "Kỳ Vương", desc: "Thưởng cho top 10 mùa giải.", price: 0, rewardOnly: true, ring: "#ffd36b", ring2: "#a3221b", seal: "棋王" },
  { id: "arena", name: "Quán quân", desc: "Thưởng cho người vô địch giải đấu.", price: 0, rewardOnly: true, ring: "#e6e0d0", ring2: "#3d4f7a", seal: "冠軍" },
];

/** Avatar miễn phí: một chữ Hán trên nền màu. */
export const AVATARS: { id: string; char: string; bg: string }[] = [
  { id: "tuong-do", char: "帥", bg: "#a3221b" },
  { id: "tuong-den", char: "將", bg: "#1e1915" },
  { id: "xe", char: "車", bg: "#3d4f7a" },
  { id: "ma", char: "馬", bg: "#2f5d50" },
  { id: "phao", char: "炮", bg: "#8a5a12" },
  { id: "si", char: "仕", bg: "#5a3e6e" },
  { id: "tuong-voi", char: "象", bg: "#6b4a2b" },
  { id: "tot", char: "兵", bg: "#7a3b5c" },
  { id: "long", char: "龍", bg: "#5e1a14" },
  { id: "ho", char: "虎", bg: "#8c5a1e" },
  { id: "mai", char: "梅", bg: "#9a3b5a" },
  { id: "truc", char: "竹", bg: "#3f5a1e" },
];

export const boardSkin = (id?: string | null) => BOARD_SKINS.find((s) => s.id === id) ?? BOARD_SKINS[0];
export const pieceSkin = (id?: string | null) => PIECE_SKINS.find((s) => s.id === id) ?? PIECE_SKINS[0];
export const frameItem = (id?: string | null) => FRAMES.find((s) => s.id === id) ?? FRAMES[0];
export const avatarItem = (id?: string | null) => AVATARS.find((s) => s.id === id) ?? AVATARS[0];

export type ItemKind = "board" | "piece" | "frame";

export function findItem(kind: ItemKind, id: string): BoardSkin | PieceSkin | FrameItem | undefined {
  if (kind === "board") return BOARD_SKINS.find((s) => s.id === id);
  if (kind === "piece") return PIECE_SKINS.find((s) => s.id === id);
  return FRAMES.find((s) => s.id === id);
}

/** Mã vật phẩm trong bảng user_items: "board:jade", "piece:gold", "frame:plum". */
export const itemKey = (kind: ItemKind, id: string) => `${kind}:${id}`;
