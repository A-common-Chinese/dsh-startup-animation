import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Emblem } from "./Emblem";
import { acceptVisualProfile, readVisualStyle, saveVisualStyle, useVisualStyleEffects } from "./visualStyle";
import * as api from "./api";
import "../../docs/startup-emblem.js";
import "../../docs/startup-laterano-emblem.js";

vi.mock("./api", async (original) => ({ ...(await original<typeof import("./api")>()), post: vi.fn() }));
function Surface() {
  useVisualStyleEffects();
  return <Emblem />;
}
beforeEach(() => acceptVisualProfile({}));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("Shared visual style", () => {
  it("renders each original mark, updates the favicon and native shell, and restores old profiles to Rhine", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("__DSH_DESKTOP__", true);
    vi.stubGlobal("ipc", { postMessage });
    render(<Surface />);
    const rhine = screen.getByRole("img", { name: "DSH DELTA CIRCUIT 部门徽章" }).innerHTML;
    const favicon = document.querySelector<HTMLLinkElement>('link[data-dsh-favicon]')!;
    const rhineIcon = favicon.href;
    act(() => acceptVisualProfile({ visual_style: "laterano" }));
    expect(screen.getByRole("img", { name: "DSH CONCORD 部门徽章" }).innerHTML).not.toBe(rhine);
    expect(document.documentElement.dataset.visualStyle).toBe("laterano");
    expect(favicon.href).not.toBe(rhineIcon);
    expect(postMessage).toHaveBeenLastCalledWith(JSON.stringify({ event: "dsh-visual-style", visual_style: "laterano" }));
    expect(localStorage.getItem("dsh.visual_style")).toBeNull();
    act(() => acceptVisualProfile({}));
    expect(screen.getByRole("img", { name: "DSH DELTA CIRCUIT 部门徽章" }).innerHTML).toBe(rhine);
    expect(favicon.href).toBe(rhineIcon);
  });

  it("rejects an older service silently dropping the selected style", async () => {
    vi.mocked(api.post).mockResolvedValue({ username: "Operator", badge_id: "01" });
    await expect(saveVisualStyle("token", "laterano")).rejects.toThrow("本机服务未保存此 UI 风格");
    expect(api.post).toHaveBeenCalledWith("/api/profile", "token", { visual_style: "laterano" });
    expect(readVisualStyle()).toBe("rhine");
  });
});
