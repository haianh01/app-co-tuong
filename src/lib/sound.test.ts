// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const load = async () => {
  vi.resetModules();
  return import("./sound");
};

describe("bộ âm thanh đi cờ", () => {
  beforeEach(() => localStorage.clear());

  it("mặc định là Gỗ cổ điển, giá trị lạ trong bộ nhớ cũng quay về mặc định", async () => {
    expect((await load()).getSoundPack()).toBe("go");
    localStorage.setItem("kd:sound-pack", "khong-co");
    expect((await load()).getSoundPack()).toBe("go");
  });

  it("chọn bộ mới thì lưu lại, báo cho nơi đang theo dõi và lần tải sau vẫn giữ", async () => {
    const sound = await load();
    const seen = vi.fn();
    const off = sound.subscribeSoundPack(seen);
    sound.setSoundPack("su");
    expect(sound.getSoundPack()).toBe("su");
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    expect((await load()).getSoundPack()).toBe("su");
  });
});
