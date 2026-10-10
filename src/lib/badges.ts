// Huy hiệu thành tích, tính trực tiếp từ thống kê (không cần bảng riêng, không bao giờ lệch dữ liệu).

export interface BadgeStats {
  gamesPlayed: number;
  wins: number;
  peakRating: number;
  puzzlesSolved: number;
  puzzlesTotal: number;
  seasonsTop10: number;
  vip: boolean;
}

export interface Badge {
  id: string;
  seal: string;
  name: string;
  desc: string;
  earned: boolean;
}

const DEFS: { id: string; seal: string; name: string; desc: string; test: (s: BadgeStats) => boolean }[] = [
  { id: "first-game", seal: "初", name: "Nhập môn", desc: "Chơi ván xếp hạng đầu tiên", test: (s) => s.gamesPlayed >= 1 },
  { id: "first-win", seal: "勝", name: "Khai thắng", desc: "Thắng ván xếp hạng đầu tiên", test: (s) => s.wins >= 1 },
  { id: "ten-wins", seal: "十", name: "Thập thắng", desc: "Thắng 10 ván xếp hạng", test: (s) => s.wins >= 10 },
  { id: "hundred-games", seal: "百", name: "Bách chiến", desc: "Chơi 100 ván xếp hạng", test: (s) => s.gamesPlayed >= 100 },
  { id: "hundred-wins", seal: "雄", name: "Bách thắng", desc: "Thắng 100 ván xếp hạng", test: (s) => s.wins >= 100 },
  { id: "elo-1600", seal: "士", name: "Kỳ sĩ", desc: "Đạt Elo 1600", test: (s) => s.peakRating >= 1600 },
  { id: "elo-1800", seal: "高", name: "Cao thủ", desc: "Đạt Elo 1800", test: (s) => s.peakRating >= 1800 },
  { id: "elo-2000", seal: "師", name: "Đại sư", desc: "Đạt Elo 2000", test: (s) => s.peakRating >= 2000 },
  { id: "puzzle-10", seal: "解", name: "Giải thế", desc: "Giải 10 thế cờ", test: (s) => s.puzzlesSolved >= 10 },
  {
    id: "puzzle-all", seal: "全", name: "Vua cờ thế", desc: "Giải toàn bộ thế cờ",
    test: (s) => s.puzzlesTotal > 0 && s.puzzlesSolved >= s.puzzlesTotal,
  },
  { id: "season", seal: "王", name: "Kỳ Vương", desc: "Vào top 10 một mùa giải", test: (s) => s.seasonsTop10 >= 1 },
  { id: "vip", seal: "貴", name: "Hội viên VIP", desc: "Đang là thành viên VIP", test: (s) => s.vip },
];

export function computeBadges(stats: BadgeStats): Badge[] {
  return DEFS.map(({ test, ...b }) => ({ ...b, earned: test(stats) }));
}
