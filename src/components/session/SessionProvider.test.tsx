// Phiên đăng nhập phía client: tải /api/me, tải lại khi có sự kiện hoặc khi chuyển trang. fetch được giả lập.

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_REFRESH_EVENT } from "@/lib/events";
import type { SessionUser } from "@/lib/session-types";
import { SessionProvider, SessionRefresher, useSession } from "./SessionProvider";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const USER = { id: "u1", username: "haianh", displayName: "Hải Anh", rating: 1520 } as SessionUser;

function Probe() {
  const { user, setUser, refresh } = useSession();
  return (
    <>
      <span data-testid="user">{user === undefined ? "đang tải" : user === null ? "khách" : user.displayName}</span>
      <button onClick={() => setUser(null)}>đăng xuất</button>
      <button onClick={refresh}>tải lại</button>
    </>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function respond(...users: (SessionUser | null)[]) {
  for (const user of users) fetchMock.mockResolvedValueOnce({ json: async () => ({ user }) });
}

beforeEach(() => {
  nav.pathname = "/";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

const shown = () => screen.getByTestId("user").textContent;

describe("SessionProvider", () => {
  it("lúc đầu là 'đang tải', sau đó hiện người dùng từ /api/me (không cache)", async () => {
    respond(USER);
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(shown()).toBe("đang tải");
    await waitFor(() => expect(shown()).toBe("Hải Anh"));
    expect(fetchMock).toHaveBeenCalledWith("/api/me", { cache: "no-store" });
  });

  it("chưa đăng nhập thì là khách (null)", async () => {
    respond(null);
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(shown()).toBe("khách"));
  });

  it("lỗi mạng không làm sập trang, vẫn ở trạng thái đang tải", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<SessionProvider><Probe /></SessionProvider>);
    await act(async () => {});
    expect(shown()).toBe("đang tải");
  });

  it("sự kiện USER_REFRESH_EVENT (vd. vừa xong ván, Elo đổi) thì tải lại", async () => {
    respond(USER, { ...USER, rating: 1540 });
    function Rating() {
      const { user } = useSession();
      return <span data-testid="rating">{user?.rating ?? "-"}</span>;
    }
    render(<SessionProvider><Rating /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId("rating").textContent).toBe("1520"));
    act(() => {
      window.dispatchEvent(new Event(USER_REFRESH_EVENT));
    });
    await waitFor(() => expect(screen.getByTestId("rating").textContent).toBe("1540"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("setUser cập nhật ngay (vd. bấm đăng xuất), refresh() tải lại", async () => {
    respond(USER, USER);
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(shown()).toBe("Hải Anh"));
    act(() => screen.getByText("đăng xuất").click());
    expect(shown()).toBe("khách");
    act(() => screen.getByText("tải lại").click());
    await waitFor(() => expect(shown()).toBe("Hải Anh"));
  });

  it("phản hồi cũ về muộn sau khi gỡ component thì bị bỏ qua", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = render(<SessionProvider><Probe /></SessionProvider>);
    unmount();
    await act(async () => resolve({ json: async () => ({ user: USER }) }));
    expect(screen.queryByTestId("user")).toBeNull();
  });

  it("gỡ component thì thôi nghe sự kiện tải lại", async () => {
    respond(USER);
    const { unmount } = render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    window.dispatchEvent(new Event(USER_REFRESH_EVENT));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dùng ngoài Provider: coi như đang tải, các hàm không làm gì", () => {
    render(<Probe />);
    expect(shown()).toBe("đang tải");
    act(() => screen.getByText("đăng xuất").click());
    expect(shown()).toBe("đang tải");
  });
});

describe("SessionRefresher", () => {
  it("không tải lại ở lần đầu, chỉ tải lại khi chuyển trang", async () => {
    respond(USER, USER);
    const tree = (
      <SessionProvider>
        <SessionRefresher />
        <Probe />
      </SessionProvider>
    );
    const { rerender } = render(tree);
    await waitFor(() => expect(shown()).toBe("Hải Anh"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(tree);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nav.pathname = "/online";
    rerender(
      <SessionProvider>
        <SessionRefresher />
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
