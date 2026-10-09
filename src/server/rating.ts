// Hệ số Elo: người mới (dưới 30 ván) điểm thay đổi nhanh hơn để sớm về đúng trình độ.

export const DEFAULT_RATING = 1500;

export const kFactor = (gamesPlayed: number) => (gamesPlayed < 30 ? 40 : 20);

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + 10 ** ((opponent - rating) / 400));

/** Điểm thay đổi sau một ván. `score`: 1 thắng, 0.5 hòa, 0 thua. */
export function ratingDelta(rating: number, opponent: number, score: number, gamesPlayed: number): number {
  return Math.round(kFactor(gamesPlayed) * (score - expectedScore(rating, opponent)));
}
