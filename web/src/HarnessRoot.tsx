import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "./App";
import { StartupSurface } from "./StartupSurface";
import { AccessEntry } from "./AccessEntry";
import { accessStatus, bootstrap, errorText, isAbort } from "./api";
import { consumeInitialPlayback } from "./preferences";
import { consumeLaunchPlayback } from "./launchOverride";
import { useInterfaceEffects } from "./uiPreferences";
import { acceptVisualProfile, useVisualStyleEffects } from "./visualStyle";
import type { AccessStatus, Bootstrap } from "./types";
import "./access.css";

/** Protected data is never requested or mounted until the service grants access. */
export function HarnessRoot() {
  useInterfaceEffects();
  useVisualStyleEffects();
  const [access, setAccess] = useState<AccessStatus>();
  const [boot, setBoot] = useState<Bootstrap>();
  const [play, setPlay] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [checking, setChecking] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  const profileRead = useRef<AbortController | undefined>(undefined);
  const playbackChosen = useRef(false);

  useEffect(() => {
    if (!access || access.unlocked) return;
    const desktop = window as typeof window & {
      __DSH_DESKTOP__?: boolean;
      ipc?: { postMessage?: (message: string) => void };
    };
    // A verified locked entry is a usable frontend too. Do not fetch private
    // bootstrap data merely to satisfy the native window's readiness check.
    if (desktop.__DSH_DESKTOP__ && typeof desktop.ipc?.postMessage === "function") {
      desktop.ipc.postMessage(JSON.stringify({ event: "dsh-ready", version: 1 }));
    }
  }, [access]);

  const connect = useCallback(async (choosePlayback = false) => {
    profileRead.current?.abort();
    active.current?.abort();
    const abort = new AbortController();
    active.current = abort;
    setChecking(true);
    setError("");
    try {
      const status = await accessStatus(abort.signal);
      if (abort.signal.aborted) return;
      acceptVisualProfile(status.profile);
      setAccess(status);
      if (choosePlayback && !playbackChosen.current) {
        playbackChosen.current = true;
        setPlay(consumeLaunchPlayback(() => consumeInitialPlayback(
          status.startup.enabled, status.startup.override_enabled,
        )));
      }
      if (!status.unlocked) {
        setBoot(undefined);
        return;
      }
      const data = await bootstrap(abort.signal);
      if (!abort.signal.aborted) {
        acceptVisualProfile(data.profile);
        setAccess((previous) => previous && { ...previous, profile: data.profile });
        setBoot(data);
      }
    } catch (failure) {
      if (!abort.signal.aborted && !isAbort(failure)) {
        setError(errorText(failure));
        // A failed recheck must be visible, including while the film owns focus.
        setPlay(false);
      }
    } finally {
      if (!abort.signal.aborted) setChecking(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    profileRead.current?.abort();
    const abort = new AbortController();
    profileRead.current = abort;
    setProfileError("");
    try {
      // A channel-bound message is a refresh hint, never profile authority.
      const status = await accessStatus(abort.signal);
      if (abort.signal.aborted) return;
      acceptVisualProfile(status.profile);
      setAccess(status);
      if (!status.unlocked) setBoot(undefined);
    } catch (failure) {
      if (!abort.signal.aborted && !isAbort(failure)) setProfileError(errorText(failure));
    }
  }, []);

  useEffect(() => {
    void connect(true);
    const locked = () => {
      // A revoked session must also remove conversations already rendered.
      setBoot(undefined);
      setPlay(false);
      void connect();
    };
    window.addEventListener("dsh-access-locked", locked);
    return () => {
      active.current?.abort();
      profileRead.current?.abort();
      window.removeEventListener("dsh-access-locked", locked);
    };
  }, [connect]);

  return (
    <StartupSurface
      playing={play}
      generation={generation}
      onUnlock={() => void connect()}
      onProfileChanged={() => void refreshProfile()}
      onFinish={() => {
        setPlay(false);
        if (!boot) void connect();
      }}
    >
      {access && !access.unlocked ? (
        <AccessEntry status={access} onUnlocked={() => connect()} connectionError={error} checking={checking} onRetry={() => connect()} />
      ) : boot ? (
        <><App initialData={boot} latestProfile={access?.profile} onReplay={() => {
          setGeneration((value) => value + 1);
          setPlay(true);
        }} />
        {profileError && <div className="profile-sync-notice" role="alert">
          <span>界面资料同步失败：{profileError}</span>
          <button onClick={() => void refreshProfile()}>重新同步</button>
        </div>}</>
      ) : (
        <div className="initial-connection" role={error ? "alert" : "status"}>
          <span className="eyebrow">DSH / LOCAL WORKSPACE</span>
          <p>{error || "正在连接本机 Harness…"}</p>
          {error && <button className="outline-button" disabled={checking} onClick={() => void connect(true)}>重新连接</button>}
        </div>
      )}
    </StartupSurface>
  );
}
