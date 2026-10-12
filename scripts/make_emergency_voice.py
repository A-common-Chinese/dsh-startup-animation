#!/usr/bin/env python3
"""Post-process a locally generated line into the addon's narration envelope.

Mirrors the manifest's documented `postprocess` recipe:
  24 kHz mono PCM16, 24 Hz high-pass, padding trim, -2.16 dBFS peak, 6 ms fades,
  no time stretching.

Usage:
  python make_emergency_voice.py <input.wav> <output.wav> "<text>"
Prints the measured envelope so it can be recorded next to the other clips.
"""
from __future__ import annotations

import hashlib
import json
import sys
import wave
from pathlib import Path

import numpy as np

TARGET_PEAK = 10 ** (-2.16 / 20)  # -2.16 dBFS -> 0.7800
FADE_MS = 6.0
PAD_MS = 10.0
TRIM_DB = -50.0


def read_wav(path: Path):
    with wave.open(str(path), "rb") as w:
        params = w.getparams()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
    if params.nchannels != 1:
        data = data.reshape(-1, params.nchannels).mean(axis=1)
    return data, params.framerate


def high_pass(x: np.ndarray, sr: int, cutoff: float = 24.0) -> np.ndarray:
    """One-pole high-pass, enough to remove DC/rumble as the recipe asks."""
    rc = 1.0 / (2 * np.pi * cutoff)
    alpha = rc / (rc + 1.0 / sr)
    out = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, sample in enumerate(x):
        prev_y = alpha * (prev_y + sample - prev_x)
        prev_x = sample
        out[i] = prev_y
    return out


def trim(x: np.ndarray, sr: int) -> np.ndarray:
    threshold = 10 ** (TRIM_DB / 20)
    loud = np.flatnonzero(np.abs(x) > threshold)
    if loud.size == 0:
        return x
    pad = int(sr * PAD_MS / 1000)
    start = max(0, loud[0] - pad)
    end = min(x.size, loud[-1] + pad + 1)
    return x[start:end]


def fade(x: np.ndarray, sr: int) -> np.ndarray:
    n = max(1, int(sr * FADE_MS / 1000))
    env = np.ones_like(x)
    env[:n] = np.linspace(0.0, 1.0, n)
    env[-n:] = np.linspace(1.0, 0.0, n)
    return x * env


def main() -> int:
    src, dst, text = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    data, sr = read_wav(src)
    if sr != 24000:
        raise SystemExit(f"expected 24 kHz, got {sr}")
    data = high_pass(data, sr)
    data = fade(trim(data, sr), sr)
    peak = float(np.max(np.abs(data))) or 1.0
    data = data * (TARGET_PEAK / peak)
    pcm = np.clip(np.round(data * 32767.0), -32768, 32767).astype("<i2")

    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm.tobytes())

    raw = dst.read_bytes()
    payload = raw[44:] if raw[:4] == b"RIFF" else raw
    samples = pcm.astype(np.float64) / 32768.0
    threshold = 10 ** (TRIM_DB / 20)
    loud = np.flatnonzero(np.abs(samples) > threshold)
    tail = (samples.size - 1 - loud[-1]) / 24000 if loud.size else 0.0
    report = {
        "file": dst.name,
        "text": text,
        "sample_rate": 24000,
        "channels": 1,
        "format": "PCM_16",
        "frames": int(samples.size),
        "duration_seconds": round(samples.size / 24000, 4),
        "peak": round(float(np.max(np.abs(samples))), 6),
        "peak_dbfs": round(20 * float(np.log10(max(1e-9, np.max(np.abs(samples))))), 2),
        "rms": round(float(np.sqrt(np.mean(samples ** 2))), 6),
        "clipped_fraction": round(float(np.mean(np.abs(samples) >= 0.999)), 6),
        "tail_silence_seconds": round(tail, 6),
        "bytes": len(raw),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
