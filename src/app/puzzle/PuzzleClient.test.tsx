// Màn giải cờ thế: chọn quân, đi đúng/sai, gợi ý, chấm sao, chuyển thế, chương VIP, thế 2 nước, lưu tiến độ.
// Đồng hồ giả cho lần tự đặt lại sau nước sai và nước đỡ của máy.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/session-types";
import { applyMove, legalMoves, outcome, parseFen, sq, type Move } from "@/lib/xiangqi/engine";
import { toughestReply, winningMoves } from "@/lib/xiangqi/mate";
import { PUZZLES, type Puzzle } from "@/lib/xiangqi/puzzles";
import { PuzzleClient } from "./PuzzleClient";

const session = vi.hoisted(() => ({ user: undefined as unknown, refresh: vi.fn() }));
vi.mock("@/components/session/SessionProvider", () => ({ useSession: () => ({ ...session, setUser: () => {} }) }));

const actions = vi.hoisted(() => ({
  loadPuzzleState: vi.fn(async (): Promise<null | { stars: Record<string, number>; hints: string[] }> => null),
  submitPuzzleSolution: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, stars: 3, reward: 20 })),
  getHint: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, charged: 10, hint: "", from: 0 })),
}));
vi.mock("@/app/actions/economy", () => actions);

const MEMBER: SessionUser = {
  id: "u1", username: "haianh", displayName: "Hải Anh", rating: 1500, isGuest: false, isAdmin: false, coins: 100,
  vipUntil: null, avatar: "tuong-do", frame: "none", boardSkin: "go", pieceSkin: "wood", email: null,
  emailVerified: false, hasPassword: true, ban: null,
};
const VIP = () => ({ ...MEMBER, vipUntil: Date.now() + 86_400_000 });
const FREE = PUZZLES.filter((p) => !p.vip);
const firstOf = (pred: (p: Puzzle) => boolean) => PUZZLES.findIndex(pred);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  session.user = undefined;
  session.refresh.mockReset();
  for (const f of Object.values(actions)) f.mockClear();
});

/** Bấm vào một ô: quân trên ô đó, hoặc chấm "Đi tới ô này". */
function tap(r: number, c: number) {
  const el = document.querySelector<HTMLElement>(`button[data-square="${sq(r, c)}"]`);
  if (!el) throw new Error(`Không có nút ở ô ${r},${c}`);
  fireEvent.click(el);
}
const tapSq = (i: number) => tap(Math.floor(i / 9), i % 9);

const targets = () => screen.queryAllByRole("button", { name: "Đi tới ô này" }).map((b) => Number(b.dataset.square)).sort((a, b) => a - b);
const status = () => screen.getByRole("status").textContent;
const tries = () => screen.getByText(/Số lần thử/).querySelector("strong")!.textContent;
// Tên nút = số thứ tự + tên thế + trạng thái; khớp trọn tên để "Xe Pháo" không trúng "Xe Pháo II".
const listItem = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^\\d+\\s*${title}\\s*(Đã giải|Chưa giải|Dành cho VIP)`) });
const SOLVED = /^Đã giải$/;

/** Giải thế 1 nước đang mở bằng lời giải mẫu. */
function solve(index: number) {
  const { from, to } = PUZZLES[index].solution;
  tapSq(from);
  tapSq(to);
}

/** Đi trọn lời giải (cả các nước Đen do máy tự đỡ), trả về chuỗi nước đã đi. */
function playLine(index: number) {
  const p = PUZZLES[index];
  let pos = parseFen(p.fen);
  const line: Move[] = [];
  for (let left = p.depth; left > 0; left--) {
    const m = p.line ? p.line[line.length] : left === p.depth ? p.solution : winningMoves(pos, left)[0];
    tapSq(m.from);
    tapSq(m.to);
    line.push(m);
    pos = applyMove(pos, m);
    if (left > 1) {
      const reply = p.line ? p.line[line.length] : toughestReply(pos, left - 1)!;
      act(() => vi.advanceTimersByTime(600));
      line.push(reply);
      pos = applyMove(pos, reply);
    }
  }
  return line;
}

const WRONG = { from: [2, 8], to: [3, 8] } as const; // thế 1: xe đi 1 bước, không chiếu bí

describe("PuzzleClient", () => {
  it("mở thế đầu tiên, liệt kê thế thường 'Chưa giải' và thế VIP bị khóa", () => {
    render(<PuzzleClient />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PUZZLES[0].title);
    expect(screen.getByText(`${PUZZLES[0].chapter.toUpperCase()} · THẾ 1 / ${PUZZLES.length}`)).toBeTruthy();
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    const nav = screen.getByRole("navigation", { name: "Danh sách thế cờ" });
    expect(within(nav).getAllByText("Chưa giải")).toHaveLength(FREE.length);
    expect(within(nav).getAllByText("Dành cho VIP")).toHaveLength(PUZZLES.length - FREE.length);
    expect(listItem(PUZZLES[0].title).getAttribute("aria-current")).toBe("true");
  });

  it("bấm quân Đỏ thì hiện các ô đi được; bấm lại thì bỏ chọn", () => {
    render(<PuzzleClient />);
    tap(2, 8);
    expect(targets().length).toBeGreaterThan(0);
    expect(targets()).toContain(sq(2, 3));
    tap(2, 8);
    expect(targets()).toEqual([]);
  });

  it("không chọn được quân Đen; bấm quân Đen khi đang chọn thì bỏ chọn", () => {
    render(<PuzzleClient />);
    tap(0, 3);
    expect(targets()).toEqual([]);
    tap(2, 8);
    tap(4, 7); // pháo đen, không phải ô xe đi được
    expect(targets()).toEqual([]);
  });

  it("giải đúng ngay lần đầu: báo chiếu bí, 3 sao, đánh dấu 'Đã giải'", () => {
    render(<PuzzleClient />);
    solve(0);
    const dialog = screen.getByRole("dialog", { name: "Chiếu bí! Giải đúng thế cờ." });
    expect(within(dialog).getByText("3 sao")).toBeTruthy();
    expect(status()).toBe(`Chính xác! Ví dụ lời giải: ${PUZZLES[0].solutionText}.`);
    expect(tries()).toBe("1");
    expect(within(listItem(PUZZLES[0].title)).getByText(SOLVED)).toBeTruthy();
  });

  it("đi sai: báo thử lại, khóa bàn cờ, tự đặt lại sau 1,2 giây và vẫn tính số lần thử", () => {
    render(<PuzzleClient />);
    tap(...WRONG.from);
    tap(...WRONG.to);
    expect(status()).toBe("Chưa chiếu bí. Thử lại nhé!");
    expect(tries()).toBe("1");
    tap(3, 8); // bàn cờ đang khóa
    expect(targets()).toEqual([]);

    act(() => vi.advanceTimersByTime(1199));
    expect(status()).toBe("Chưa chiếu bí. Thử lại nhé!");
    act(() => vi.advanceTimersByTime(1));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    // Xe đã về chỗ cũ.
    expect(document.querySelector(`button[data-square="${sq(2, 8)}"]`)?.getAttribute("aria-label")).toBe("Xe đỏ");

    solve(0);
    expect(tries()).toBe("2");
    expect(screen.getByText("2 sao")).toBeTruthy();
  });

  it("thử từ 4 lần trở lên chỉ còn 1 sao", () => {
    render(<PuzzleClient />);
    for (let i = 0; i < 3; i++) {
      tap(...WRONG.from);
      tap(...WRONG.to);
      act(() => vi.advanceTimersByTime(1200));
    }
    solve(0);
    expect(tries()).toBe("4");
    expect(screen.getByText("1 sao")).toBeTruthy();
  });

  it("chương hướng dẫn: gợi ý miễn phí, dùng gợi ý thì không được 3 sao dù đúng ngay lần đầu", async () => {
    render(<PuzzleClient />);
    const hint = screen.getByRole("button", { name: "Gợi ý" }) as HTMLButtonElement;
    fireEvent.click(hint);
    await act(async () => {});
    expect(status()).toBe(`Gợi ý: ${PUZZLES[0].hint}`);
    expect(hint.disabled).toBe(true);
    expect(actions.getHint).not.toHaveBeenCalled();
    solve(0);
    expect(screen.getByText("2 sao")).toBeTruthy();
  });

  it("'Đặt lại' đưa bàn cờ về thế ban đầu (kể cả đang chờ sau nước sai)", () => {
    render(<PuzzleClient />);
    tap(...WRONG.from);
    tap(...WRONG.to);
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    act(() => vi.advanceTimersByTime(5000));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
  });

  it("'Thế tiếp theo' đi hết dãy thế miễn phí đầu danh sách", () => {
    render(<PuzzleClient />);
    const lead = PUZZLES.findIndex((p) => p.vip || p.depth > 1);
    for (let i = 0; i < lead; i++) {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PUZZLES[i].title);
      solve(i);
      fireEvent.click(screen.getByRole("button", { name: "Thế tiếp theo" }));
    }
    const nav = screen.getByRole("navigation", { name: "Danh sách thế cờ" });
    expect(within(nav).getAllByText(SOLVED)).toHaveLength(lead);
    expect(screen.getByText(`Đã giải ${lead}/${PUZZLES.length} thế`)).toBeTruthy();
    // Giải liền ~30 thế, truy vấn theo vai trò trên danh sách >100 thế: chậm khi máy bận.
  }, 30_000);

  it("chọn thế trong danh sách; thế mới bắt đầu sạch (không giữ quân đã chọn, gợi ý)", () => {
    render(<PuzzleClient />);
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý" }));
    tap(2, 8);
    fireEvent.click(listItem(PUZZLES[1].title));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PUZZLES[1].title);
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    expect(targets()).toEqual([]);
    expect(tries()).toBe("0");
  });

  it("'Chơi lại' sau khi giải xong cho giải lại thế đó", () => {
    render(<PuzzleClient />);
    solve(0);
    fireEvent.click(screen.getByRole("button", { name: "Chơi lại" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    expect(within(listItem(PUZZLES[0].title)).getByText(SOLVED)).toBeTruthy();
  });

  it("thế VIP khi chưa là VIP: khóa bàn cờ, mời xem gói VIP", () => {
    render(<PuzzleClient />);
    const i = firstOf((p) => !!p.vip);
    fireEvent.click(listItem(PUZZLES[i].title));
    expect(status()).toBe("Chương này dành cho thành viên VIP.");
    expect(screen.getByRole("link", { name: "Xem gói VIP" }).getAttribute("href")).toBe("/shop#vip");
    tapSq(PUZZLES[i].solution.from);
    expect(targets()).toEqual([]);
  });

  it("thế 2 nước: đi đúng thì Đen tự đỡ, chiếu bí xong thì gửi cả chuỗi nước lên máy chủ và báo thưởng", async () => {
    session.user = VIP();
    render(<PuzzleClient />);
    const i = firstOf((p) => p.depth === 2);
    fireEvent.click(listItem(PUZZLES[i].title));
    tapSq(PUZZLES[i].solution.from);
    tapSq(PUZZLES[i].solution.to);
    expect(status()).toBe("Đúng hướng! Đen đang đỡ…");
    act(() => vi.advanceTimersByTime(600));
    expect(status()).toBe("Đen đã đỡ. Tiếp tục ép sát!");
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));

    const line = playLine(i);
    expect(screen.getByRole("dialog", { name: "Chiếu bí! Giải đúng thế cờ." })).toBeTruthy();
    expect(tries()).toBe("1");
    await act(async () => {});
    expect(actions.submitPuzzleSolution).toHaveBeenCalledWith(PUZZLES[i].id, line, 1);
    expect(screen.getByText("+20 xu (lần giải đầu)")).toBeTruthy();
    expect(session.refresh).toHaveBeenCalled();
  });

  it("thế cuối cùng (VIP) giải xong thì không còn nút 'Thế tiếp theo'", () => {
    session.user = VIP();
    render(<PuzzleClient />);
    fireEvent.click(listItem(PUZZLES.at(-1)!.title));
    playLine(PUZZLES.length - 1);
    expect(screen.getByRole("dialog", { name: "Chiếu bí! Giải đúng thế cờ." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thế tiếp theo" })).toBeNull();
  });

  it("thế 2 nước: nước đầu không ép được thì báo sai và đặt lại", () => {
    session.user = VIP();
    render(<PuzzleClient />);
    const i = firstOf((p) => p.depth === 2);
    const p = PUZZLES[i];
    fireEvent.click(listItem(p.title));
    // Nước sai: bất kỳ nước đúng luật nào khác nước thắng duy nhất.
    const pos = parseFen(p.fen);
    const wrong = winningMoves(pos, 0).length === 0
      ? (() => {
        tapSq(p.solution.from);
        const to = targets().find((t) => t !== p.solution.to);
        return to === undefined ? null : { from: p.solution.from, to };
      })()
      : null;
    if (!wrong) throw new Error("Thế mẫu không có nước sai cho quân này");
    expect(winningMoves(pos, 2)).not.toContainEqual(wrong);
    tapSq(wrong.to);
    expect(status()).toBe("Nước này để Đen thoát được. Thử lại nhé!");
    expect(actions.submitPuzzleSolution).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1200));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
  });

  it("thế dài: đi lệch biến chính thì báo không kịp; đi đúng thì Đen đỡ theo biến chính tới chiếu bí", async () => {
    session.user = VIP();
    render(<PuzzleClient />);
    const i = firstOf((p) => !!p.line);
    const p = PUZZLES[i];
    fireEvent.click(listItem(p.title));
    expect(screen.getByText(`Xuất xứ: ${p.source}`)).toBeTruthy();
    const pos = parseFen(p.fen);
    const wrong = legalMoves(pos).find((m) => (m.from !== p.solution.from || m.to !== p.solution.to) && !outcome(applyMove(pos, m)).over)!;
    tapSq(wrong.from);
    tapSq(wrong.to);
    expect(status()).toBe(`Nước này không chiếu bí kịp trong ${p.depth} nước. Thử lại nhé!`);
    act(() => vi.advanceTimersByTime(1200));

    const line = playLine(i);
    expect(line).toEqual(p.line);
    expect(screen.getByRole("dialog", { name: "Chiếu bí! Giải đúng thế cờ." })).toBeTruthy();
    await act(async () => {});
    expect(actions.submitPuzzleSolution).toHaveBeenCalledWith(p.id, p.line, 2);
  });

  it("chưa đăng nhập: giải xong được mời đăng nhập để lưu, không gọi máy chủ", async () => {
    render(<PuzzleClient />);
    solve(0);
    await act(async () => {});
    expect(screen.getByText("Đăng nhập để lưu tiến độ và nhận xu thưởng.")).toBeTruthy();
    expect(actions.submitPuzzleSolution).not.toHaveBeenCalled();
  });

  it("đã đăng nhập: tải số sao đã đạt từ máy chủ và hiện trong danh sách", async () => {
    session.user = MEMBER;
    actions.loadPuzzleState.mockResolvedValueOnce({ stars: { [PUZZLES[1].id]: 2 }, hints: [] });
    render(<PuzzleClient />);
    await act(async () => {});
    expect(within(listItem(PUZZLES[1].title)).getByLabelText("2 sao")).toBeTruthy();
  });

  it("gợi ý ngoài chương hướng dẫn tốn 10 xu: khách được mời đăng nhập, thành viên mua qua máy chủ", async () => {
    const i = firstOf((p) => p.depth === 1 && p.chapter !== PUZZLES[0].chapter);
    const first = render(<PuzzleClient />);
    fireEvent.click(listItem(PUZZLES[i].title));
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý (10 xu)" }));
    await act(async () => {});
    expect(status()).toBe("Đăng nhập để dùng gợi ý (10 xu mỗi thế).");
    expect(actions.getHint).not.toHaveBeenCalled();
    first.unmount();

    session.user = MEMBER;
    render(<PuzzleClient />);
    fireEvent.click(listItem(PUZZLES[i].title));
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý (10 xu)" }));
    await act(async () => {});
    expect(actions.getHint).toHaveBeenCalledWith(PUZZLES[i].id);
    expect(status()).toBe(`Gợi ý: ${PUZZLES[i].hint}`);
    expect(session.refresh).toHaveBeenCalled();
  });
});
