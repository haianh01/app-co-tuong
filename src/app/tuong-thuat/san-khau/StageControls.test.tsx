import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiVoiceButton } from "./StageControls";

describe("nút 🎙 phong cách & giọng AI trên sân khấu", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mở bảng thấy cài đặt hiện tại, bấm Hóm hỉnh rồi giọng Nam thì gửi đúng lên server", async () => {
    const posted: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/bot/status") {
        return new Response(JSON.stringify({ settings: { inGame: true, style: "coach", voice: "female" } }));
      }
      posted.push(JSON.parse(String(init?.body)));
      return new Response("{}");
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiVoiceButton />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Phong cách và giọng AI" }));
    });

    expect(screen.getByRole("button", { name: /Thầy giáo/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Nữ · Hoài My/ }).getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hóm hỉnh/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Nam · Nam Minh/ }));
    });

    expect(posted).toEqual([{ style: "humorous" }, { voice: "male" }]);
    expect(screen.getByRole("button", { name: /Hóm hỉnh/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Nam · Nam Minh/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("server lỗi thì trả lựa chọn về như cũ và báo cho người live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/bot/status"
          ? new Response(JSON.stringify({ settings: { inGame: false, style: "coach", voice: "female" } }))
          : new Response("lỗi", { status: 500 }),
      ),
    );

    render(<AiVoiceButton />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Phong cách và giọng AI" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Triệu Hâm Hâm/ }));
    });

    expect(screen.getByRole("button", { name: /Thầy giáo/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Không đổi được, thử lại")).toBeTruthy();
  });

  it("tắt đọc to: gửi speak=false, nút micro chuyển sang gạch chéo; bật lại thì gửi speak=true", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/bot/status") {
          return new Response(JSON.stringify({ settings: { inGame: false, style: "coach", voice: "female", speak: true } }));
        }
        posted.push(JSON.parse(String(init?.body)));
        return new Response("{}");
      }),
    );

    render(<AiVoiceButton />);
    const mic = screen.getByRole("button", { name: "Phong cách và giọng AI" });
    await act(async () => {
      fireEvent.click(mic);
    });
    expect(screen.getByRole("button", { name: /Bật/ }).getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tắt/ }));
    });
    expect(screen.getByRole("button", { name: /Tắt/ }).getAttribute("aria-pressed")).toBe("true");
    expect(mic.getAttribute("data-muted")).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Bật/ }));
    });
    expect(posted).toEqual([{ speak: false }, { speak: true }]);
    expect(mic.getAttribute("data-muted")).toBeNull();
  });
});
