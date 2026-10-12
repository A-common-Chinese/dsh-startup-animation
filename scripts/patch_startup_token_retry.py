#!/usr/bin/env python3
"""Make the startup addon survive a stale per-process token, and diagnose it.

plugin.mjs mints a fresh random token on every mount (a profile edit re-mounts the
plugin), and startup-local.js sends the token it read from an earlier /api/profile.
A page that outlives a re-mount therefore gets 403 "Invalid local request." on every
mutation: the identity save and the inventory load both fail while GETs keep working.

This adds:
  A. startup-local.js — on a 403 from a mutation, refresh the token via connect(true)
     and retry once (works on a plain page reload).
  B. plugin.mjs — log the guard's inputs on failure only (host, origin, token lengths
     and whether they matched; the token itself is never written).

Idempotent. Usage:
  python scripts/patch_startup_token_retry.py <startup-local.js> <plugin.mjs>
"""
from __future__ import annotations

import sys
from pathlib import Path

CLIENT_MARKER = "LOCAL PATCH: a 403 means our token is stale"

OLD_LOAD = """        const response = await this.request('/api/load', { method: 'POST', signal: controller.signal, cache: 'no-store', credentials: 'same-origin', headers: { 'X-DSH-Token': this.token } });
        if (!response.ok) throw await this.failure(response, '读取失败');"""
NEW_LOAD = """        let response = await this.request('/api/load', { method: 'POST', signal: controller.signal, cache: 'no-store', credentials: 'same-origin', headers: { 'X-DSH-Token': this.token } });
        // LOCAL PATCH: a 403 means our token is stale (the host re-mounts the plugin on a
        // profile edit and mints a new token). Refresh it and retry once.
        if (response.status === 403) { await this.connect(true); if (current()) response = await this.request('/api/load', { method: 'POST', signal: controller.signal, cache: 'no-store', credentials: 'same-origin', headers: { 'X-DSH-Token': this.token } }); }
        if (!response.ok) throw await this.failure(response, '读取失败');"""

OLD_SAVE = """        const response = await this.request('/api/profile', { method: 'POST', signal: controller.signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-DSH-Token': this.token }, body: JSON.stringify(update) });"""
NEW_SAVE = """        let response = await this.request('/api/profile', { method: 'POST', signal: controller.signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-DSH-Token': this.token }, body: JSON.stringify(update) });
        // LOCAL PATCH: same stale-token recovery as load().
        if (response.status === 403) { await this.connect(true); response = await this.request('/api/profile', { method: 'POST', signal: controller.signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-DSH-Token': this.token }, body: JSON.stringify(update) }); }"""

SERVER_MARKER = "LOCAL DEBUG: log the guard's inputs on failure"
OLD_IMPORT = "import { randomBytes } from 'node:crypto';\nimport { readFile } from 'node:fs/promises';"
NEW_IMPORT = "import { randomBytes } from 'node:crypto';\nimport { appendFileSync } from 'node:fs';\nimport { readFile } from 'node:fs/promises';"

OLD_GUARD = "export function localRequest(req, port, token, mutation = false) {"
NEW_GUARD = """/* LOCAL DEBUG: log the guard's inputs on failure only, so a rejected mutation can be
   told apart from a rejected Host/Origin. The token itself is never written. */
function guardLog(req, port, token, mutation) {
  try {
    appendFileSync(new URL('./guard.log', import.meta.url), JSON.stringify({
      at: new Date().toISOString(), mutation, method: req.method, url: req.url,
      host: req.headers.host, origin: req.headers.origin, remote: req.socket?.remoteAddress,
      tokenLen: (req.headers['x-dsh-token'] || '').length, expectedTokenLen: token.length,
      tokenMatch: req.headers['x-dsh-token'] === token, port,
    }) + '\\n');
  } catch (_) { /* diagnostics must never break a request */ }
}
export function localRequest(req, port, token, mutation = false) {"""

OLD_SITES = (
    "if (!localRequest(req, ctx.webServer.port, token)) return json(res, 403, { error: 'Startup is available only on this local machine.' });",
    "if (!localRequest(req, ctx.webServer.port, token, true)) return json(res, 403, { error: 'Invalid local request.' });",
)
NEW_SITES = (
    "if (!localRequest(req, ctx.webServer.port, token)) { guardLog(req, ctx.webServer.port, token, false); return json(res, 403, { error: 'Startup is available only on this local machine.' }); }",
    "if (!localRequest(req, ctx.webServer.port, token, true)) { guardLog(req, ctx.webServer.port, token, true); return json(res, 403, { error: 'Invalid local request.' }); }",
)


def rewrite(path: Path, marker: str, pairs) -> str:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"
    for old, new in pairs:
        old_n, new_n = old.replace("\n", newline), new.replace("\n", newline)
        if old_n not in text:
            return f"SKIPPED: anchor not found -> {old.splitlines()[0][:70]}"
        text = text.replace(old_n, new_n, 1)
    path.write_text(text, encoding="utf-8")
    return "patched"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    client, server = Path(sys.argv[1]), Path(sys.argv[2])
    failed = 0
    for path, marker, pairs in (
        (client, CLIENT_MARKER, [(OLD_LOAD, NEW_LOAD), (OLD_SAVE, NEW_SAVE)]),
        (server, SERVER_MARKER, [(OLD_IMPORT, NEW_IMPORT), (OLD_GUARD, NEW_GUARD), (OLD_SITES[0], NEW_SITES[0]), (OLD_SITES[1], NEW_SITES[1])]),
    ):
        if not path.is_file():
            print(f"{path}: NOT FOUND")
            failed = 1
            continue
        result = rewrite(path, marker, pairs)
        print(f"{path}: {result}")
        if result.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
