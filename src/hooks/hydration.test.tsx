// useHydrated và useNextParam: giá trị khác nhau giữa lúc render trên server và khi chạy trên trình duyệt.

import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useHydrated } from "./useHydrated";
import { useNextParam } from "./useLocationSearch";

function HydratedProbe() {
  return <span>{useHydrated() ? "client" : "server"}</span>;
}

function NextProbe({ fallback }: { fallback?: string }) {
  return <span data-testid="next">{useNextParam(fallback)}</span>;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useHydrated", () => {
  it("trên server trả false (nút gửi form còn khóa)", () => {
    expect(renderToString(<HydratedProbe />)).toContain("server");
  });

  it("trên trình duyệt trả true", () => {
    expect(renderHook(() => useHydrated()).result.current).toBe(true);
  });
});

describe("useNextParam", () => {
  it("đọc ?next= trên URL", () => {
    window.history.replaceState(null, "", "/login?next=%2Fplay%3Flevel%3D5");
    render(<NextProbe />);
    expect(screen.getByTestId("next").textContent).toBe("/play?level=5");
  });

  it("không có ?next= thì dùng mặc định /online (hoặc giá trị truyền vào)", () => {
    window.history.replaceState(null, "", "/login");
    render(<NextProbe />);
    expect(screen.getByTestId("next").textContent).toBe("/online");
    render(<NextProbe fallback="/" />);
    expect(screen.getAllByTestId("next")[1].textContent).toBe("/");
  });

  it("trên server luôn trả mặc định (trang prerender tĩnh được)", () => {
    expect(renderToString(<NextProbe />)).toContain("/online");
  });

  it("bấm Back/Forward (popstate) thì cập nhật theo URL mới", () => {
    window.history.replaceState(null, "", "/login?next=/a");
    render(<NextProbe />);
    act(() => {
      window.history.pushState(null, "", "/login?next=/b");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("next").textContent).toBe("/b");
  });
});
