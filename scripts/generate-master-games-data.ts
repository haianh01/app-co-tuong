import fs from "node:fs";
import path from "node:path";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";

const dataDir = path.join(process.cwd(), ".data", "master-games");
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("game_") && f.endsWith(".json"));

interface CompactMasterGame {
  id: number;
  red: string;
  black: string;
  result: "red_wins" | "black_wins" | "draw" | "unknown";
  tournament: string;
  date: string;
  eccoCode: string;
  eccoName: string;
  masterRed: string | null;
  masterBlack: string | null;
  moveCount: number;
  movesVN: string[];
  movesCN: string[];
}

const games: CompactMasterGame[] = [];
let converted = 0;

for (const file of files) {
  const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
  const rawMoves: string[] = content.moves_chinese ?? [];
  const conv = convertChineseGame(rawMoves);
  if (!conv.success || conv.moves.length < 6) continue;

  games.push({
    id: content.gameid,
    red: content.red_player,
    black: content.black_player,
    result: content.result,
    tournament: content.tournament || "",
    date: content.date || "",
    eccoCode: content.ecco_code || "",
    eccoName: content.ecco_name || "",
    masterRed: content.master_red || null,
    masterBlack: content.master_black || null,
    moveCount: conv.notations.length,
    movesVN: conv.notations,
    movesCN: rawMoves,
  });
  converted++;
}

// Sắp xếp: ưu tiên các ván có đại sư nổi tiếng lên đầu, sau đó theo ID
games.sort((a, b) => {
  const aHasMaster = a.masterRed || a.masterBlack ? 1 : 0;
  const bHasMaster = b.masterRed || b.masterBlack ? 1 : 0;
  if (aHasMaster !== bHasMaster) return bHasMaster - aHasMaster;
  return a.id - b.id;
});

const tsContent = `// Dữ liệu ${games.length} ván cờ đại sư thu thập từ xqbase.com
// Sinh tự động bởi scripts/generate-master-games-data.ts

export interface MasterGameRecord {
  id: number;
  red: string;
  black: string;
  result: "red_wins" | "black_wins" | "draw" | "unknown";
  tournament: string;
  date: string;
  eccoCode: string;
  eccoName: string;
  masterRed: string | null;
  masterBlack: string | null;
  moveCount: number;
  movesVN: string[];
  movesCN: string[];
}

export const MASTER_GAMES: MasterGameRecord[] = ${JSON.stringify(games, null, 2)};
`;

const outFile = path.join(process.cwd(), "src", "lib", "xiangqi", "master-games.generated.ts");
fs.writeFileSync(outFile, tsContent, "utf-8");
console.log(`Đã xuất ${games.length} ván cờ vào: ${outFile}`);
