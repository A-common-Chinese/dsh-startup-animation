import { useState, type ReactNode } from "react";
import { StartupGate, type FinishReason } from "./StartupGate";
import { useUiPreferences } from "./uiPreferences";
import { useVisualStyle } from "./visualStyle";

function StartupPlayback({ startupUrl, onFinish, onUnlock, onProfileChanged }: {
  startupUrl: string;
  onFinish: (reason: FinishReason) => void;
  onUnlock?: () => void;
  onProfileChanged?: () => void;
}) {
  // The profile may change from the film's own settings. Keep its navigation
  // and authenticated channel stable until the next explicit replay.
  const [frameUrl] = useState(startupUrl);
  return <StartupGate enabled startupUrl={frameUrl} onFinish={onFinish} onUnlock={onUnlock} onProfileChanged={onProfileChanged}>{null}</StartupGate>;
}

/** Keep the working application mounted while the isolated film owns focus. */
export function StartupSurface({
  playing,
  generation,
  onFinish,
  onUnlock,
  onProfileChanged,
  children,
}: {
  playing: boolean;
  generation: number;
  onFinish: (reason: FinishReason) => void;
  onUnlock?: () => void;
  onProfileChanged?: () => void;
  children: ReactNode;
}) {
  const [preferences] = useUiPreferences();
  const style = useVisualStyle();
  const query = new URLSearchParams();
  if (style === "laterano") query.set("style", style);
  if (preferences.reducedMotion === "reduce") query.set("motion", "reduce");
  const suffix = query.size ? `?${query}` : "";
  return (
    <>
      <div hidden={playing} inert={playing}>
        {children}
      </div>
      {playing && <StartupPlayback
        key={generation}
        startupUrl={`/startup-preview.html${suffix}`}
        onFinish={onFinish}
        onUnlock={onUnlock}
        onProfileChanged={onProfileChanged}
      />}
    </>
  );
}
