// Hook useScreenMirror: mở hộp chọn ở mục Tab, nhận ra người dùng đã chọn tab, cửa sổ hay toàn màn hình.

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScreenMirror } from "./useScreenMirror";

function fakeStream(displaySurface?: string) {
  const track = { getSettings: () => ({ displaySurface }), addEventListener: vi.fn(), stop: vi.fn() };
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

function withDisplayMedia(impl: () => Promise<MediaStream>) {
  const getDisplayMedia = vi.fn(impl);
  Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });
  return getDisplayMedia;
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

describe("chọn nguồn chia sẻ", () => {
  it("mở sẵn mục Tab và ẩn chính trang tường thuật khỏi danh sách", async () => {
    const getDisplayMedia = withDisplayMedia(async () => fakeStream("browser"));
    const { result } = renderHook(() => useScreenMirror(() => {}));
    await act(() => result.current.start());
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ displaySurface: "browser" }), selfBrowserSurface: "exclude" }),
    );
    expect(result.current.status).toBe("picking");
    expect(result.current.surface).toBe("browser");
  });

  it.each(["window", "monitor"])("người dùng vẫn chọn %s: ghi nhận để trang cảnh báo", async (kind) => {
    withDisplayMedia(async () => fakeStream(kind));
    const { result } = renderHook(() => useScreenMirror(() => {}));
    await act(() => result.current.start());
    expect(result.current.surface).toBe(kind);
  });

  it("trình duyệt không cho biết loại nguồn (Firefox cũ): không cảnh báo bừa", async () => {
    withDisplayMedia(async () => fakeStream(undefined));
    const { result } = renderHook(() => useScreenMirror(() => {}));
    await act(() => result.current.start());
    expect(result.current.surface).toBeNull();
  });

  it("dừng chia sẻ thì xóa loại nguồn cũ", async () => {
    withDisplayMedia(async () => fakeStream("window"));
    const { result } = renderHook(() => useScreenMirror(() => {}));
    await act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.surface).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("đóng hộp chọn không chọn gì: báo lỗi, không đổi trạng thái", async () => {
    withDisplayMedia(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { result } = renderHook(() => useScreenMirror(() => {}));
    await act(() => result.current.start());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/Chưa chọn/);
  });
});
