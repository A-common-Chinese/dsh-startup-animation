#!/usr/bin/env python3
"""Space aborts the opening show: a red/black emergency panel, then the Harness.

Panel timeline (v2.8.1)
  EC_PANEL_MS 2400   total on screen (was 1900)
  EC_BAR_MS   2050   progress bar travel, leaving a 350 ms tail
  EC_RED_MS    683   = EC_BAR_MS / 3 - the wash from the show's own light look to full
                     red/black completes exactly when the bar is one third full
  entrance           the panel fades in over 0.5 s (was 0.22 s); the wash and the
                     decorative layers ramp in over EC_RED_MS

Narration: the addon's own phase-5 line ("Welcome, Operator.", assets/voice/phase-5.wav) is
reused verbatim, so the panel speaks in exactly the original voice. scripts/make_emergency_
voice.py, match_emergency_voice.py and compare_emergency_voice.py remain available if a
custom line is ever wanted.

Behaviour: Space freezes the stage, shows the panel, then hands control back. A second
Space skips the panel at once, but the panel does not advertise that. Enter and clicks
still advance the show. In a static (non-embedded) preview the panel clears itself.

Usage:
  python scripts/patch_startup_emergency.py <startup-preview.js> <bridge.mjs> <startup-voice.js>
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

V4_MARKER = "LOCAL PATCH: Space aborts the show (v2.8.1)"
BLOCK_RE = re.compile(r"/\* LOCAL PATCH: Space aborts the show[\s\S]*?\},EC_PANEL_MS\);\r?\n\}")

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
/* LOCAL PATCH: Space aborts the show (v2.8.1). Freezes the stage, plays a red/black
   "emergency code" panel - starting from the show's own light look and washing over to
   full red/black by the time the bar is a third full - then hands control straight back
   to the Harness. Self-contained: the panel carries its own inline styling. */
let emergencyActive=false;
const EC_PANEL_MS=2400,EC_BAR_MS=2050,EC_RED_MS=Math.round(EC_BAR_MS/3),EC_VOICE_DELAY_MS=140;
function emergency(){
 if(embeddedEnded)return;
 if(emergencyActive){finishEmbedded('skip');return;} // second press skips the panel (not advertised on-screen)
 emergencyActive=true;generation++;starting=false;manualPause=true;
 sequence.pause();stopAudio();cancelVoice();local.cancelLoad(false);
 const code='E-'+String(Math.floor(1000+Math.random()*8999));
 const wash=EC_RED_MS+'ms linear forwards';
 const style=document.createElement('style');
 style.textContent='#emergencyCode{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;overflow:hidden;background:linear-gradient(180deg,#f3f0ea 0%,#ded9d1 100%);color:#17171a;font-family:inherit;letter-spacing:.16em;text-align:center;animation:ecIn .5s ease-out both}'
  +'#emergencyCode .ec-wash{position:absolute;inset:0;opacity:0;background:radial-gradient(120% 90% at 50% 0%,#2c0806 0%,#120405 55%,#080203 100%);animation:ecWash '+wash+'}'
  +'#emergencyCode .ec-deco{position:absolute;inset:0;pointer-events:none;opacity:0;animation:ecWash '+wash+'}'
  +'#emergencyCode .ec-layer{position:absolute;inset:0}'
  +'#emergencyCode .ec-grid{background-image:linear-gradient(rgba(255,70,50,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(255,70,50,.10) 1px,transparent 1px);background-size:38px 38px;animation:ecDrift 2.6s linear infinite}'
  +'#emergencyCode .ec-glow{background:radial-gradient(46% 34% at 50% 50%,rgba(255,59,40,.30) 0%,rgba(255,59,40,.07) 42%,transparent 72%);animation:ecPulse 1.15s ease-in-out infinite alternate}'
  +'#emergencyCode .ec-scan{height:22%;top:-22%;inset:auto 0 auto 0;background:linear-gradient(180deg,transparent,rgba(255,86,64,.20) 45%,rgba(255,140,120,.30) 50%,rgba(255,86,64,.20) 55%,transparent);animation:ecSweep 1.5s linear infinite}'
  +'#emergencyCode .ec-rings{position:absolute;left:50%;top:50%;translate:-50% -50%;width:min(58vw,620px);aspect-ratio:1;border-radius:50%;border:1px dashed rgba(255,70,50,.22);animation:ecSpin 7s linear infinite}'
  +'#emergencyCode .ec-rings:after{content:"";position:absolute;inset:16%;border-radius:50%;border:1px solid rgba(255,70,50,.30);animation:ecPing 1.5s ease-out infinite}'
  +'#emergencyCode .ec-ticks:before,#emergencyCode .ec-ticks:after{content:"";position:absolute;width:46px;height:46px;border:2px solid rgba(255,86,64,.55);animation:ecBlink 1.1s steps(2,end) infinite}'
  +'#emergencyCode .ec-ticks:before{left:68px;top:68px;border-right:0;border-bottom:0}'
  +'#emergencyCode .ec-ticks:after{right:68px;bottom:68px;border-left:0;border-top:0}'
  +'#emergencyCode .ec-content{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;animation:ecInk '+wash+'}'
  +'#emergencyCode .ec-row{font-size:calc(11px + .5vw)}'
  +'#emergencyCode .ec-mid{font-size:calc(12px + .6vw)}'
  +'#emergencyCode .ec-foot{font-size:calc(10px + .4vw);line-height:1.7}'
+'#emergencyCode .ec-brand{position:absolute;left:28px;top:20px;z-index:3;pointer-events:none;opacity:.9;color:#ff5a48;--ink:#ff5a48;--soft:rgba(255,90,72,.62);--bg:#0b0304;--line:rgba(255,70,50,.25);--accent:#ff3b28}'
+'@media(min-width:1500px){#emergencyCode .ec-brand{left:45px;top:32px}}'
  +'#emergencyCode .ec-code{font-size:calc(34px + 2.4vw);font-weight:700;letter-spacing:.24em;animation:ecCodeInk '+wash+',ecFlicker 1.3s steps(3,end) '+EC_RED_MS+'ms infinite}'
  +'#emergencyCode .ec-track{position:relative;width:min(46vw,520px);height:3px;background:rgba(23,23,26,.16)}'
  +'#emergencyCode .ec-fill{height:100%;width:0;background:#ff3b28;box-shadow:0 0 14px rgba(255,59,40,.85);transition:width '+EC_BAR_MS+'ms linear}'
  +'@keyframes ecIn{from{opacity:0}to{opacity:1}}'
  +'@keyframes ecWash{from{opacity:0}to{opacity:1}}'
  +'@keyframes ecInk{from{color:rgba(23,23,26,.62)}to{color:#ff5a48}}'
  +'@keyframes ecCodeInk{from{color:#17171a}to{color:#ff3b28}}'
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
 host.innerHTML='<div class="ec-brand"></div><div class="ec-wash"></div><div class="ec-deco"><div class="ec-layer ec-grid"></div><div class="ec-layer ec-glow"></div><div class="ec-layer ec-rings"></div><div class="ec-layer ec-ticks"></div><div class="ec-layer ec-scan"></div></div>'
  +'<div class="ec-content"><div class="ec-row">EMERGENCY ABORT · 紧急中止</div>'
  +'<div class="ec-code">'+code+'</div>'
  +'<div class="ec-mid">紧急代码已确认 · CONFIRMED</div>'
  +'<div class="ec-track"><div class="ec-fill" id="ecBar"></div></div>'
  +'<div class="ec-foot">跳过验证程序<br>正在紧急启动DeepSeek Harness</div></div>';
 document.head.append(style);document.body.append(host);
 
 /* Mirror the show's own masthead into the panel: clone the live .brand node (it carries
    the current REV/ID text and the NATIVE badge) and drop its ids so nothing is duplicated. */
 const brandSource=document.querySelector('.masthead .brand');
 if(brandSource){const holder=host.querySelector('.ec-brand');if(holder){const clone=brandSource.cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));holder.append(clone);}}
 requestAnimationFrame(()=>{const fill=document.getElementById('ecBar');if(fill)fill.style.width='100%';});
 /* Space can be pressed before the show has started, and both audio paths (the score
    and the narration module) are only initialised inside start(). Acquire them here, in
    the key gesture, so the sting and the line are audible either way. */
 const ecAudio=Promise.all([Promise.resolve(ensureAudio()).catch(()=>false),Promise.resolve(window.DSHVoice?.unlock?.()).catch(()=>false)]);
 ecAudio.then(()=>{if(!muted&&!embeddedEnded)ping(.02,196,.5,.035);});
 setTimeout(()=>{if(embeddedEnded)return;ecAudio.then(()=>{if(!muted)window.DSHVoice?.say?.('phase-5');});},EC_VOICE_DELAY_MS);
 setTimeout(()=>{
  if(window.DSHEmbed?.embedded){finishEmbedded('skip');return;}
  // Static preview (no host): take the panel away so the show can be replayed.
  host.remove();style.remove();emergencyActive=false;manualPause=false;refresh();
 },EC_PANEL_MS);
}"""


def patch_preview(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if V4_MARKER in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"

    def nl(chunk: str) -> str:
        return chunk.replace("\n", newline)

    if "function emergency()" in text:
        match = BLOCK_RE.search(text)
        if not match:
            return "SKIPPED: existing panel found but its end could not be located"
        text = text[: match.start()] + nl(BLOCK.strip("\n")) + text[match.end():]
        action = "replaced panel"
    else:
        if SKIP_ANCHOR not in text:
            return "SKIPPED: skip() anchor not found"
        text = text.replace(SKIP_ANCHOR, SKIP_ANCHOR + "\n" + nl(BLOCK.strip("\n")), 1)
        if OLD_KEYS in text:
            text = text.replace(OLD_KEYS, nl(NEW_KEYS), 1)
        action = "inserted panel"
    path.write_text(text, encoding="utf-8")
    return action


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