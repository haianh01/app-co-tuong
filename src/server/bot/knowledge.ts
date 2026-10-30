// Kiến thức kỳ lý cho bot trợ lý live, chia thành từng mục nhỏ để mỗi câu hỏi chỉ gửi kèm các mục liên quan
// (gửi cả kho ~35k token mỗi câu thì dễ chạm giới hạn gói Gemini miễn phí khi live đông):
// - tóm tắt 144 bài Triệu Hâm Hâm (48 khai cuộc, 48 trung cuộc, 48 tàn cuộc) và sổ khai cuộc;
// - bài giảng .md trong docs/transcripts, cắt theo từng mốc thời gian.
// Chỉ lấy phần "principle" (đã biên tập) của các bài; phần trích phụ đề nguyên văn có lỗi nhận dạng giọng nên bỏ.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { OPENING_BOOK_LINES, type OpeningBookLine } from "@/lib/xiangqi/openings";
import { ZHAO_ENDGAME_LESSONS } from "@/lib/xiangqi/zhao48-endgame-lessons";
import { ZHAO_LESSONS } from "@/lib/xiangqi/zhao48-lessons";
import { ZHAO_OPENING_LESSONS } from "@/lib/xiangqi/zhao48-opening-lessons";

export interface KnowledgeItem {
  /** Nhóm, cũng là tên thẻ khi đưa vào đề bài: ky_ly_khai_cuoc, so_khai_cuoc, bai_giang… */
  group: string;
  text: string;
  /** Phần dùng để so khớp nếu khác `text`: biến khai cuộc chỉ so tên và ý đồ, vì chuỗi nước đi
   *  ("Pháo 2 bình 5, Mã 8 tiến 7…") câu nào cũng trùng chữ "pháo", "mã". */
  index?: string;
}

interface LessonCard {
  lesson: number;
  title: string;
  principle: string;
}

const PIECE: Record<string, string> = { X: "Xe", M: "Mã", P: "Pháo", B: "Tốt", T: "Tượng", S: "Sĩ", K: "Tướng", Tg: "Tướng" };
const ACTION: Record<string, string> = { "-": "bình", ".": "tiến", "/": "thoái" };

/** "P2-5" → "Pháo 2 bình 5"; ký hiệu lạ thì giữ nguyên. */
export function spellMove(m: string): string {
  const x = /^([A-Za-z]+)(\d)([-./])(\d)$/.exec(m);
  if (!x || !PIECE[x[1]]) return m;
  return `${PIECE[x[1]]} ${x[2]} ${ACTION[x[3]]} ${x[4]}`;
}

function bookLine(l: OpeningBookLine): KnowledgeItem {
  const moves = l.moves.map((m, i) => `${i % 2 ? "Đen" : "Đỏ"} ${spellMove(m)}`).join(", ");
  const intent = l.intent ? ` Ý đồ: Đỏ ${l.intent.r}; Đen ${l.intent.b}.` : "";
  return { group: "so_khai_cuoc", text: `${l.name}: ${moves}.${intent}`, index: `${l.name}.${intent}` };
}

const lessonItems = (group: string, label: string, cards: Record<number, LessonCard>): KnowledgeItem[] =>
  Object.values(cards)
    .sort((a, b) => a.lesson - b.lesson)
    .map((c) => ({ group, text: `${label} bài ${c.lesson}. ${c.title}: ${c.principle}` }));

/** Bài giảng .md: mỗi mốc "### ⏱ [MM:SS]" là một mục, kèm tên bài để AI biết nguồn. */
function transcriptItems(dir: string): { names: string[]; items: KnowledgeItem[] } {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { names: [], items: [] };
  }
  const items: KnowledgeItem[] = [];
  for (const f of files) {
    const md = readFileSync(path.join(dir, f), "utf8");
    const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? f;
    const parts = md.split(/^###\s+/m).slice(1);
    // Bài không chia mốc thì cắt theo đoạn văn.
    const chunks = parts.length ? parts : md.split(/\n\s*\n/).filter((p) => p.trim().length > 80);
    for (const c of chunks) items.push({ group: "bai_giang", text: `${title} — ${c.replace(/\s+/g, " ").trim()}` });
  }
  return { names: files, items };
}

/** Nạp toàn bộ kho: dữ liệu bài giảng trong lib của app và bài giảng .md trong `transcriptsDir`. */
export function loadKnowledge(transcriptsDir: string): { names: string[]; items: KnowledgeItem[] } {
  const items: KnowledgeItem[] = [
    ...lessonItems("ky_ly_khai_cuoc", "Khai cuộc", ZHAO_OPENING_LESSONS),
    ...lessonItems("ky_ly_trung_cuoc", "Trung cuộc", ZHAO_LESSONS),
    ...lessonItems("ky_ly_tan_cuoc", "Tàn cuộc", ZHAO_ENDGAME_LESSONS),
    ...OPENING_BOOK_LINES.map(bookLine),
  ];
  const names = [
    "48 bài khai cuộc Triệu Hâm Hâm",
    "48 bài trung cuộc Triệu Hâm Hâm",
    "48 bài tàn cuộc Triệu Hâm Hâm",
    `Sổ khai cuộc (${OPENING_BOOK_LINES.length} biến)`,
  ];
  const transcripts = transcriptItems(transcriptsDir);
  names.push(...transcripts.names);
  items.push(...transcripts.items);
  return { names, items };
}

// ---------- Tìm mục liên quan ----------

/** Bỏ dấu, viết thường: người xem hay gõ không dấu ("phao dau", "binh phong ma"). */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Từ hỏi han, xưng hô: có mặt khắp nơi, không giúp chọn mục. Không có "ma" (bỏ dấu của cả "mà" lẫn quân Mã).
const STOP = new Set(
  "a ad ah anh ban be cac cai cho chu chi co con cua da dang day de di duoc em gi ha hay hoi khi khong la lam lai luc minh mot moi nao nay ne nhe nhi nhieu nhu nhung nua oi o qua ra roi sao se tai the thi thay thu toi tren trong va vay ve vi voi vs a ak k ko".split(
    " ",
  ),
);

// Cách nói của người xem → thêm các cách viết trong bài giảng (đã bỏ dấu), giữ cả chữ gốc.
const SYNONYMS: [RegExp, (m: string) => string][] = [
  [/\b(?:chot|tot|binh) qua (?:song|ha)\b/g, () => "tot qua song binh qua song qua ha"],
  [/\bchot\b/g, () => "tot binh"],
  [/\b(?:ra|xuat) (?:xe|ma|phao)\b|\b(?:xe|ma|phao) ra\b/g, (m) => `xuat ${m.replace(/\b(ra|xuat)\b/g, "").trim()}`],
  [/\btrung phao\b/g, () => "phao dau"],
  [/\bphao dau\b/g, () => "trung phao"],
];

function features(text: string): string[] {
  let folded = fold(text);
  for (const [re, to] of SYNONYMS) folded += " " + (folded.match(re) ?? []).map(to).join(" ");
  const words = folded.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!STOP.has(words[i]) && words[i].length > 1) out.push(words[i]);
    // Cặp tiếng ("phao dau", "binh phong") nói đúng ý hơn từng tiếng lẻ, giữ cả khi có một tiếng là từ dừng.
    if (i + 1 < words.length) out.push(`${words[i]} ${words[i + 1]}`);
  }
  return out;
}

export interface KnowledgeSearch {
  /** Các mục khớp nhất, cộng dồn tới khi chạm `budget` ký tự; gói thành thẻ theo nhóm. "" nếu không có gì khớp. */
  search(query: string, budget?: number): string;
}

/** Điểm tối thiểu của một mục: khoảng hai chữ hiếm, hoặc một cặp tiếng khớp. Dưới mức này coi như không liên quan. */
const MIN_SCORE = 6;
/** Số mục tối đa mỗi câu, và tối đa mỗi nhóm để không một nhóm (thường là sổ khai cuộc) chiếm hết. */
const MAX_ITEMS = 8;
const MAX_PER_GROUP = 4;

export function createSearch(items: KnowledgeItem[]): KnowledgeSearch {
  const docs = items.map((it) => new Set(features(it.index ?? it.text)));
  const df = new Map<string, number>();
  for (const d of docs) for (const f of d) df.set(f, (df.get(f) ?? 0) + 1);
  const idf = (f: string) => Math.log(1 + items.length / (df.get(f) ?? items.length));

  return {
    search(query, budget = 4000) {
      const q = [...new Set(features(query))];
      if (!q.length) return "";
      const scored = items
        .map((it, i) => {
          let score = 0;
          for (const f of q) if (docs[i].has(f)) score += idf(f) * (f.includes(" ") ? 2 : 1);
          // Mục dài (một đoạn bài giảng) chứa nhiều chữ hơn nên dễ khớp hơn; chia bớt cho công bằng.
          return { it, score: score / Math.sqrt(Math.max(1, docs[i].size / 40)) };
        })
        .filter((x) => x.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score);
      // Bỏ các mục khớp quá yếu so với mục tốt nhất (chỉ trùng một chữ lẻ).
      const best = scored[0]?.score ?? 0;
      const picked: KnowledgeItem[] = [];
      const perGroup = new Map<string, number>();
      let used = 0;
      for (const { it, score } of scored) {
        if (score < best * 0.35 || picked.length >= MAX_ITEMS) break;
        const n = perGroup.get(it.group) ?? 0;
        if (n >= MAX_PER_GROUP || used + it.text.length > budget) continue;
        picked.push(it);
        perGroup.set(it.group, n + 1);
        used += it.text.length;
      }
      const groups = new Map<string, string[]>();
      for (const it of picked) groups.set(it.group, [...(groups.get(it.group) ?? []), `- ${it.text}`]);
      return [...groups].map(([g, lines]) => `<${g}>\n${lines.join("\n")}\n</${g}>`).join("\n");
    },
  };
}
