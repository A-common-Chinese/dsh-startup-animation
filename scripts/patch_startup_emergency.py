#!/usr/bin/env python3
"""Space aborts the opening show: short red/black emergency panel, then the Harness.

v2 (this revision)
  * shorter: the panel runs EC_PANEL_MS = 1900 ms (the progress bar fills in 1550 ms)
  * same-voice narration: plays assets/voice/emergency.wav ("Emergency confirmed."),
    generated locally with sherpa-onnx ZipVoice from the very reference clips the
    addon's own narration was cloned from, so the timbre matches
  * animated background: drifting engineering grid, sweeping scan band, pulsing red
    glow, radar rings and blinking corner ticks — the same idiom as the main show

Behaviour: during playback (or while waiting to start) Space freezes the stage, shows
the panel, and hands control back to the Harness. A second Space during the panel skips
it at once, but the panel deliberately does not advertise that. Enter and clicks still
advance the show exactly as before.

Handles three cases: fresh insert, upgrade of the v1 panel, and no-op when v2 is
already in place. Usage:
  python scripts/patch_startup_emergency.py <startup-preview.js> <bridge.mjs> <startup-voice.js>
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

V2_MARKER = "LOCAL PATCH: Space aborts the show (v2)"
V1_START = "/* LOCAL PATCH: Space aborts the show"
V1_BLOCK = re.compile(r"/\* LOCAL PATCH: Space aborts[\s\S]*?setTimeout\(\(\)=>finishEmbedded\('skip'\),\d+\);\r?\n\}")

SKIP_ANCHOR = "function skip(){if(accessBlocked()){requireAccess();return;}generation++;starting=false;stopAudio();cancelVoice();sequence.seek(total);phaseAge=0;manualPause=false;local.cancelLoad(false);refresh();announce('已跳过启动演出。');finishEmbedded('skip');}"

OLD_KEYS = "if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();activate();}"
NEW_KEYS = "if(e.key==='Enter'&&!e.target.closest('button')){e.preventDefault();activate();return;}\n if(e.key===' '&&!e.target.closest('button')){e.preventDefault();emergency();return;} // LOCAL PATCH: Space = emergency abort"

VOICE_ANCHOR = "  globalThis.DSHVoice = Object.freeze({\n    unlock, phase, cancel,"
VOICE_NEW = """  // LOCAL PATCH: play a one-off line by name (used by the emergency panel).
  function say(name) {
    cancel();
    if (!unlocked || muted || typeof name !== 'string') return;
    const id = generation;
    active = true;
    play(name, id).finally(() => { if (id === generation) active = false; });
  }
  globalThis.DSHVoice = Object.freeze({
    unlock, phase, cancel, say,"""

BLOCK = """
/* LOCAL PATCH: Space aborts the show (v2). Freezes the stage, plays a short red/black
   "emergency code" panel with an animated background, then hands control straight back
   to the Harness. Self-contained: the panel carries its own inline styling. */
let emergencyActive=false;
const EC_PANEL_MS=1900,EC_BAR_MS=1550,EC_VOICE_DELAY_MS=140;
function emergency(){
 if(embeddedEnded)return;
 if(emergencyActive){finishEmbedded('skip');return;} // second press skips the panel (not advertised on-screen)
 emergencyActive=true;generation++;starting=false;manualPause=true;
 sequence.pause();stopAudio();cancelVoice();local.cancelLoad(false);
 const code='E-'+String(Math.floor(1000+Math.random()*8999));
 const style=document.createElement('style');
 style.textContent='#emergencyCode{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20px;overflow:hidden;background:radial-gradient(120% 90% at 50% 0%,#2c0806 0%,#120405 55%,#080203 100%);color:#ff5a48;font-family:inherit;letter-spacing:.16em;text-align:center;animation:ecIn .22s ease-out both}'
  +'#emergencyCode .ec-layer{position:absolute;inset:0;pointer-events:none}'
  +'#emergencyCode .ec-grid{background-image:linear-gradient(rgba(255,70,50,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(255,70,50,.10) 1px,transparent 1px);background-size:38px 38px;animation:ecDrift 2.6s linear infinite}'
  +'#emergencyCode .ec-glow{background:radial-gradient(46% 34% at 50% 46%,rgba(255,59,40,.30) 0%,rgba(255,59,40,.07) 42%,transparent 72%);animation:ecPulse 1.15s ease-in-out infinite alternate}'
  +'#emergencyCode .ec-scan{height:22%;top:-22%;inset:auto 0 auto 0;background:linear-gradient(180deg,transparent,rgba(255,86,64,.20) 45%,rgba(255,140,120,.30) 50%,rgba(255,86,64,.20) 55%,transparent);animation:ecSweep 1.5s linear infinite}'
  +'#emergencyCode .ec-rings{position:absolute;left:50%;top:46%;translate:-50% -50%;width:min(58vw,620px);aspect-ratio:1;border-radius:50%;border:1px dashed rgba(255,70,50,.22);animation:ecSpin 7s linear infinite}'
  +'#emergencyCode .ec-rings:after{content:"";position:absolute;inset:16%;border-radius:50%;border:1px solid rgba(255,70,50,.30);animation:ecPing 1.5s ease-out infinite}'
  +'#emergencyCode .ec-ticks:before,#emergencyCode .ec-ticks:after{content:"";position:absolute;width:46px;height:46px;border:2px solid rgba(255,86,64,.55);animation:ecBlink 1.1s steps(2,end) infinite}'
  +'#emergencyCode .ec-ticks:before{left:68px;top:68px;border-right:0;border-bottom:0}'
  +'#emergencyCode .ec-ticks:after{right:68px;bottom:68px;border-left:0;border-top:0}'
  +'#emergencyCode .ec-code{font-size:calc(34px + 2.4vw);font-weight:700;letter-spacing:.24em;color:#ff3b28;text-shadow:0 0 28px rgba(255,59,40,.55);animation:ecFlicker 1.3s steps(3,end) infinite}'
  +'#emergencyCode .ec-row{position:relative;z-index:1;font-size:calc(11px + .5vw);opacity:.72}'
  +'#emergencyCode .ec-mid{position:relative;z-index:1;font-size:calc(12px + .6vw);opacity:.9}'
  +'#emergencyCode .ec-foot{position:relative;z-index:1;font-size:calc(10px + .4vw);opacity:.58}'
  +'#emergencyCode .ec-track{position:relative;z-index:1;width:min(46vw,520px);height:3px;background:rgba(255,90,72,.22);overflow:hidden}'
  +'#emergencyCode .ec-fill{height:100%;width:0;background:#ff3b28;box-shadow:0 0 14px rgba(255,59,40,.85);transition:width '+EC_BAR_MS+'ms linear}'
  +'@keyframes ecIn{from{opacity:0}to{opacity:1}}'
  +'@keyframes ecDrift{from{background-position:0 0}to{background-position:38px 38px}}'
  +'@keyframes ecPulse{from{opacity:.55}to{opacity:1}}'
  +'@keyframes ecSweep{from{top:-22%}to{top:100%}}'
  +'@keyframes ecSpin{from{rotate:0deg}to{rotate:360deg}}'
  +'@keyframes ecPing{from{transform:scale(.86);opacity:.85}to{transform:scale(1.12);opacity:0}}'
  +'@keyframes ecBlink{50%{opacity:.25}}'
  +'@keyframes ecFlicker{0%,100%{opacity:1}48%{opacity:.82}52%{opacity:.94}}';
 const host=document.createElement('div');
 host.id='emergencyCode';
 host.setAttribute('role','alertdialog');
 host.setAttribute('aria-label','紧急代码已确认，正在进入 Harness');
 host.innerHTML='<div class="ec-layer ec-grid"></div><div class="ec-layer ec-glow"></div><div class="ec-layer ec-rings"></div><div class="ec-layer ec-ticks"></div><div class="ec-layer ec-scan"></div>'
  +'<div class="ec-row">EMERGENCY ABORT · 紧急中止</div>'
  +'<div class="ec-code">'+code+'</div>'
  +'<div class="ec-mid">紧急代码已确认 · CONFIRMED</div>'
  +'<div class="ec-track"><div class="ec-fill" id="ecBar"></div></div>'
  +'<div class="ec-foot">正在进入 HARNESS</div>';
 document.head.append(style);document.body.append(host);
 requestAnimationFrame(()=>{const fill=document.getElementById('ecBar');if(fill)fill.style.width='100%';});
 if(!muted)ping(.02,196,.5,.035);
 setTimeout(()=>{if(!embeddedEnded)window.DSHVoice?.say?.('emergency');},EC_VOICE_DELAY_MS);
 setTimeout(()=>finishEmbedded('skip'),EC_PANEL_MS);
}"""


def patch_preview(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if V2_MARKER in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"
    block = BLOCK.replace("\n", newline).strip(newline)

    if V1_START in text:
        match = V1_BLOCK.search(text)
        if not match:
            return "SKIPPED: v1 panel found but its end could not be located"
        text = text[: match.start()] + block + text[match.end():]
        path.write_text(text, encoding="utf-8")
        return "upgraded v1 -> v2"

    if SKIP_ANCHOR not in text:
        return "SKIPPED: skip() anchor not found"
    text = text.replace(SKIP_ANCHOR, SKIP_ANCHOR + "\n" + block, 1)
    if OLD_KEYS in text:
        text = text.replace(OLD_KEYS, NEW_KEYS.replace("\n", newline), 1)
    path.write_text(text, encoding="utf-8")
    return "inserted v2"


def patch_voice(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if "function say(name)" in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"
    anchor, new = VOICE_ANCHOR.replace("\n", newline), VOICE_NEW.replace("\n", newline)
    if anchor not in text:
        return "SKIPPED: DSHVoice export anchor not found"
    path.write_text(text.replace(anchor, new, 1), encoding="utf-8")
    return "patched"


def patch_bridge(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if "Space · 紧急中止" in text:
        return "already patched"
    old = "Enter / Space · 继续当前阶段"
    new = "Enter / 点击 · 继续当前阶段　Space · 紧急中止（红黑确认后直接进入）"
    if old not in text:
        return "SKIPPED: key legend anchor not found"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    return "patched"


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    preview, bridge, voice = (Path(a) for a in sys.argv[1:])
    failed = 0
    for path, fn in ((preview, patch_preview), (bridge, patch_bridge), (voice, patch_voice)):
        if not path.is_file():
            print(f"{path}: NOT FOUND")
            failed = 1
            continue
        result = fn(path)
        print(f"{path.name}: {result}")
        if result.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
