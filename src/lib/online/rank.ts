// Danh hiệu theo Elo (giống hệ "đẳng" của các app cờ Trung Quốc). Elo khởi điểm 1500 = Tam đẳng.

export interface RankTitle {
  name: string;
  seal: string;
  min: number;
}

const RANKS: RankTitle[] = [
  { name: "Đại sư", seal: "大師", min: 2100 },
  { name: "Cửu đẳng", seal: "九段", min: 2025 },
  { name: "Bát đẳng", seal: "八段", min: 1950 },
  { name: "Thất đẳng", seal: "七段", min: 1850 },
  { name: "Lục đẳng", seal: "六段", min: 1750 },
  { name: "Ngũ đẳng", seal: "五段", min: 1650 },
  { name: "Tứ đẳng", seal: "四段", min: 1550 },
  { name: "Tam đẳng", seal: "三段", min: 1400 },
  { name: "Nhị đẳng", seal: "二段", min: 1300 },
  { name: "Nhất đẳng", seal: "一段", min: 1200 },
  { name: "Tân thủ", seal: "新手", min: -Infinity },
];

export function rankTitle(rating: number): RankTitle {
  return RANKS.find((r) => rating >= r.min)!;
}
