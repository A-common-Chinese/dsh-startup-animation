import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartupSurface } from "./StartupSurface";
import { readUiPreferences, resetUiPreferences, updateUiPreferences } from "./uiPreferences";
import { acceptVisualProfile } from "./visualStyle";

beforeEach(() => {
  resetUiPreferences();
  acceptVisualProfile({ visual_style: "rhine" });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => {
  cleanup();
  resetUiPreferences();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Work() {
  const [draft, setDraft] = useState("");
  return (
    <input
      aria-label="draft"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
it("preserves the mounted working app and its draft throughout replay", () => {
  const finish = vi.fn();
  const view = render(
    <StartupSurface playing={false} generation={0} onFinish={finish}>
      <Work />
    </StartupSurface>,
  );
  fireEvent.change(screen.getByLabelText("draft"), {
    target: { value: "keep this task" },
  });
  view.rerender(
    <StartupSurface playing generation={1} onFinish={finish}>
      <Work />
    </StartupSurface>,
  );
  expect(screen.getByTitle("DSH 沉浸式启动动画")).toBeTruthy();
  expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe(
    "keep this task",
  );
  fireEvent.click(screen.getByText("跳过开场"));
  view.rerender(
    <StartupSurface playing={false} generation={1} onFinish={finish}>
      <Work />
    </StartupSurface>,
  );
  expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe(
    "keep this task",
  );
  expect(screen.queryByTitle("DSH 沉浸式启动动画")).toBeNull();
});

it.each([
  { theme: "light", style: "rhine", systemDark: true },
  { theme: "dark", style: "laterano", systemDark: false },
] as const)("passes explicit $style and $theme without altering saved preferences", ({ theme, style, systemDark }) => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: systemDark })));
  updateUiPreferences({ theme });
  acceptVisualProfile({ visual_style: style });
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(<StartupSurface playing generation={0} onFinish={vi.fn()}>{null}</StartupSurface>);
  const frame = screen.getByTitle("DSH 沉浸式启动动画") as HTMLIFrameElement;
  const query = new URL(frame.src).searchParams;
  expect(query.get("style")).toBe(style);
  expect(query.get("theme")).toBe(theme);
  expect(readUiPreferences().theme).toBe(theme);
  expect(write).not.toHaveBeenCalled();
});

it.each([false, true])("resolves the current system theme at playback entry (dark: %s)", (systemDark) => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: systemDark })));
  // The parent's effect may not have run yet; use the actual media preference
  // rather than copying a stale data-theme value from the previous render.
  document.documentElement.dataset.theme = systemDark ? "light" : "dark";
  render(<StartupSurface playing generation={0} onFinish={vi.fn()}>{null}</StartupSurface>);
  const frame = screen.getByTitle("DSH 沉浸式启动动画") as HTMLIFrameElement;
  expect(new URL(frame.src).searchParams.get("theme")).toBe(systemDark ? "dark" : "light");
  expect(readUiPreferences().theme).toBe("system");
});

it("keeps the same iframe and access channel during preference changes, then snapshots the next replay", () => {
  updateUiPreferences({ theme: "dark" });
  const finish = vi.fn(), unlock = vi.fn();
  const view = render(<StartupSurface playing generation={0} onFinish={finish} onUnlock={unlock}>{null}</StartupSurface>);
  const frame = screen.getByTitle("DSH 沉浸式启动动画") as HTMLIFrameElement;
  const originalUrl = frame.src, originalWindow = frame.contentWindow;
  const originalChannel = new URL(originalUrl).searchParams.get("channel");

  act(() => {
    updateUiPreferences({ theme: "light", reducedMotion: "reduce" });
    acceptVisualProfile({ visual_style: "laterano" });
  });
  expect(screen.getByTitle("DSH 沉浸式启动动画")).toBe(frame);
  expect(frame.contentWindow).toBe(originalWindow);
  expect(frame.src).toBe(originalUrl);
  expect(finish).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();

  view.rerender(<StartupSurface playing generation={1} onFinish={finish} onUnlock={unlock}>{null}</StartupSurface>);
  const replay = screen.getByTitle("DSH 沉浸式启动动画") as HTMLIFrameElement;
  const query = new URL(replay.src).searchParams;
  expect(replay).not.toBe(frame);
  expect(query.get("channel")).not.toBe(originalChannel);
  expect(query.get("theme")).toBe("light");
  expect(query.get("style")).toBe("laterano");
  expect(query.get("motion")).toBe("reduce");
  expect(finish).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
});
