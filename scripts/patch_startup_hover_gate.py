#!/usr/bin/env python3
"""Fingerprint-style gate on the first stage, with a symmetric read ring.

Behaviour
  * Only while the show sits on phase 0 (waiting for its first press).
  * Put the pointer on the emblem (a circle around its centre) and hold: a ring inside
    the existing main hoop fills **from 12 o'clock downwards on both sides at once**
    (right clockwise, left anticlockwise) and meets at 6 o'clock after HOVER_DWELL_MS.
  * Leaving early drains the ring back at 3x speed.
  * Completing it, clicking, or staying idle for HOVER_IDLE_MS all start the show; the
    ring flashes once on the way out.
  * A click is still instant - the gate only adds a hands-free path.

The loop keeps running while the gate is armed, so reduced-motion users can still hold.

Idempotent. Usage:
  python scripts/patch_startup_hover_gate.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: fingerprint-style gate"

STATE_AND_FUNCS = """
/* LOCAL PATCH: fingerprint-style gate on the first stage. Holding the pointer on the
   emblem fills a ring from 12 o'clock downwards on both sides; completing it starts the
   show exactly like a click. Staying idle for HOVER_IDLE_MS also starts it. */
const HOVER_DWELL_MS=1000,HOVER_DRAIN_MS=HOVER_DWELL_MS/3,HOVER_IDLE_MS=6000;
let hoverInside=false,hoverCharge=0,hoverFlash=0,lastInteract=performance.now();
function hoverGateActive(){return sequence.phase===0&&!sequence.playing&&!sequence.completed&&!manualPause&&!starting;}
function hoverZoneRadius(){return Math.min(width,height)*.425*.86;}
function hoverInZone(){const dx=(pointer.x-.5)*width,dy=(pointer.y-.47)*height;return Math.hypot(dx,dy)<=hoverZoneRadius();}
function updateHoverGate(delta){
 const active=hoverGateActive(),dt=delta*1000;
 if(active&&hoverInside&&hoverInZone())hoverCharge=Math.min(1,hoverCharge+dt/HOVER_DWELL_MS);
 else hoverCharge=Math.max(0,hoverCharge-dt/HOVER_DRAIN_MS);
 if(hoverFlash>0)hoverFlash=Math.max(0,hoverFlash-dt/220);
 if(!active)return;
 if(hoverCharge>=1){hoverCharge=0;hoverFlash=1;clickSound();activate();return;}
 if(performance.now()-lastInteract>=HOVER_IDLE_MS){lastInteract=performance.now();hoverFlash=1;activate();}
}
function drawHoverRing(){
 if(!ctx)return;
 const active=hoverGateActive();
 if(!active&&hoverCharge<=0&&hoverFlash<=0)return;
 const cx=width/2,cy=height*.47,R=hoverZoneRadius();
 const channel=Math.min(2,sequence.choices[Math.min(4,sequence.phase)]||0);
 const accent=visualStyle==='laterano'?'#c8a24a':(light?['#c5793f','#29848e','#8a668e']:['#82bfd2','#81c1a7','#b59ad9'])[channel];
 const span=Math.PI*hoverCharge;
 ctx.save();ctx.lineCap='butt';
 if(active){
  ctx.globalAlpha=.12;ctx.strokeStyle=accent;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
 }
 if(span>.004){
  ctx.globalAlpha=.92;ctx.lineWidth=2.6;ctx.strokeStyle=accent;
  ctx.beginPath();ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+span,false);ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2-span,true);ctx.stroke();
  ctx.globalAlpha=1;ctx.fillStyle=accent;
  for(const a of [-Math.PI/2+span,-Math.PI/2-span]){
   ctx.beginPath();ctx.arc(cx+Math.cos(a)*R,cy+Math.sin(a)*R,2.6,0,Math.PI*2);ctx.fill();
  }
 }
 if(hoverFlash>0){
  ctx.globalAlpha=hoverFlash*.85;ctx.lineWidth=4.5;ctx.strokeStyle=accent;
  ctx.beginPath();ctx.arc(cx,cy,R+3.5,0,Math.PI*2);ctx.stroke();
 }
 ctx.globalAlpha=1;ctx.restore();
}
"""

LISTENERS = """/* LOCAL PATCH: fingerprint-style gate - track the pointer on the stage and keep the
   idle fallback honest; the charge itself is advanced by the frame loop. */
stage.addEventListener('pointerenter',()=>{hoverInside=true;lastInteract=performance.now();wake();});
stage.addEventListener('pointermove',()=>{hoverInside=true;lastInteract=performance.now();wake();});
stage.addEventListener('pointerleave',()=>{hoverInside=false;});
stage.addEventListener('pointerdown',()=>{lastInteract=performance.now();});
document.addEventListener('keydown',()=>{lastInteract=performance.now();},true);
"""

# anchor -> (old, new)
PAIRS = [
    # 1) functions + state, right after drawScene
    (""" paintedPhase=sequence.phase;paintedProgress=visualProgress;paintedAmbientTime=ambientTime;
}""",
     """ paintedPhase=sequence.phase;paintedProgress=visualProgress;paintedAmbientTime=ambientTime;
 drawHoverRing();
}""" + STATE_AND_FUNCS),
    # 2) advance the gate in the frame loop
    (""" renderUI();drawScene();
 if(sequence.completed&&finishEmbedded('complete'))return;
 if(!raf&&!document.hidden&&(!reducedMotion.matches||sequence.playing))raf=requestAnimationFrame(frame);""",
     """ updateHoverGate(delta);renderUI();drawScene();
 if(sequence.completed&&finishEmbedded('complete'))return;
 if(!raf&&!document.hidden&&(!reducedMotion.matches||sequence.playing||hoverGateActive()||hoverCharge>0||hoverFlash>0))raf=requestAnimationFrame(frame);"""),
    # 3) pointer listeners, after the existing pointercancel handler
    ("""stage.addEventListener('pointercancel',()=>{pointerDown=null;stage.classList.remove('dragging');});""",
     """stage.addEventListener('pointercancel',()=>{pointerDown=null;stage.classList.remove('dragging');});
""" + LISTENERS),
    # 4) reset the gate on replay
    ("sequence.restart();phaseAge=0;",
     "sequence.restart();hoverInside=false;hoverCharge=0;hoverFlash=0;lastInteract=performance.now();phaseAge=0;"),
]


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print(f"{path.name}: already patched")
        return 0
    newline = "\r\n" if "\r\n" in text else "\n"
    for old, new in PAIRS:
        old_n = old.replace("\n", newline)
        if old_n not in text:
            print(f"{path.name}: SKIPPED: anchor not found -> {old.splitlines()[0][:64]}")
            return 1
        text = text.replace(old_n, new.replace("\n", newline), 1)
    path.write_text(text, encoding="utf-8")
    print(f"{path.name}: patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
