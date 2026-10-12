import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { consumeNext, profileInput, saveSettings, settings } from './state.mjs';

export const name = 'dsh-original-startup';
export const inject = ['webServer', 'skills', 'loader', 'connection', 'agentPresets'];
export const PREFIX = '/__dsh_startup';
const assetRoot = fileURLToPath(new URL('./assets/', import.meta.url));
// Cordis publishes FiberState as an erased TypeScript const enum, not a JS
// export. These values are verified against the pinned official release.
const ACTIVE = 2, FAILED = 3;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };

/* LOCAL DEBUG: log the guard's inputs on failure only, so a rejected mutation can be
   told apart from a rejected Host/Origin. The token itself is never written. */
function guardLog(req, port, token, mutation) {
  try {
    appendFileSync(new URL('./guard.log', import.meta.url), JSON.stringify({
      at: new Date().toISOString(), mutation, method: req.method, url: req.url,
      host: req.headers.host, origin: req.headers.origin, remote: req.socket?.remoteAddress,
      tokenLen: (req.headers['x-dsh-token'] || '').length, expectedTokenLen: token.length,
      tokenMatch: req.headers['x-dsh-token'] === token, port,
    }) + '\n');
  } catch (_) { /* diagnostics must never break a request */ }
}
export function localRequest(req, port, token, mutation = false) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!hosts.includes(req.headers.host)) return false;
  if (req.socket?.remoteAddress && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  return !mutation || (req.headers.origin === `http://${req.headers.host}` && req.headers['x-dsh-token'] === token);
}
/* LOCAL DEBUG: record what the inventory load actually produced (or why it failed). */
function loadLog(entry) {
  try {
    appendFileSync(new URL('./load.log', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (_) { /* diagnostics must never break a request */ }
}
/* LOCAL DEBUG: record every gated /api request and the host's verdict. */
function requestLog(entry) {
  try {
    appendFileSync(new URL('./request.log', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (_) { /* diagnostics must never break a request */ }
}
/* LOCAL DEBUG: step trace for the inventory walk (it once never returned). */
function stepLog(entry) {
  try {
    appendFileSync(new URL('./step.log', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (_) { /* diagnostics must never break a request */ }
}
/* LOCAL DEBUG: never let one host call hold the whole inventory hostage. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }),
  ]);
}
async function body(req) {
  let content = '';
  for await (const chunk of req) { content += chunk; if (Buffer.byteLength(content) > 8192) throw new Error('Profile is too large.'); }
  return JSON.parse(content);
}
export async function inventory(ctx, emit, signal) {
  const started = performance.now(), skills = [], plugins = [], issues = [];
  stepLog({ step: 'enter', cwd: process.cwd() });
  emit({ type: 'stage', stage: 'skills', status: 'loading' });
  let lease;
  try {
    // Official Web's filesystem providers live in the selected default preset,
    // not the host layer. Borrow that actual revision without creating an Agent
    // or session, and release it after discovery.
    lease = await withTimeout(ctx.agentPresets?.acquireScope?.(), 2500, 'agentPresets.acquireScope')
      .catch(error => { stepLog({ step: 'scope-timeout', message: error.message }); issues.push({ kind: 'skill', name: 'preset-scope', message: error.message }); return undefined; });
    stepLog({ step: 'scope', hasLease: Boolean(lease) });
    // LOCAL PATCH: the desktop app's cwd is its install directory, which carries no
    // project skills. Prefer the user's registered workspace so skill discovery matches
    // what the user actually has; fall back to the process cwd when none is registered.
    let cwd = process.cwd();
    try {
      const spaces = await ctx.workspaceRegistry?.list?.();
      const usable = Array.isArray(spaces) ? spaces.find(space => space && typeof space.path === 'string' && space.path) : undefined;
      if (usable) cwd = usable.path;
    } catch (_) { /* keep the process cwd */ }
    stepLog({ step: 'cwd', cwd, viaWorkspace: cwd !== process.cwd() });
    const snapshot = await withTimeout(ctx.skills.snapshot({ cwd, signal, ...(lease ? { scope: lease.key } : {}) }), 20000, 'skills.snapshot')
      .catch(error => { stepLog({ step: 'snapshot-timeout', message: error.message }); issues.push({ kind: 'skill', name: 'catalog', message: error.message }); return { skills: [], complete: false }; });
    stepLog({ step: 'snapshot-done', skills: snapshot.skills.length, complete: snapshot.complete });
    for (const skill of snapshot.skills) {
      const item = { name: skill.name, source: skill.path || `${skill.provider} / ${skill.source}`, status: 'loaded' };
      skills.push(item); emit({ type: 'item', kind: 'skill', ...item });
    }
    if (!snapshot.complete) issues.push({ kind: 'skill', name: 'catalog', message: 'The official registry reported an incomplete observation; retry after its providers settle.' });
  } catch (error) { issues.push({ kind: 'skill', name: 'catalog', message: error.message }); }
  finally { if (lease) await lease[Symbol.asyncDispose](); }
  emit({ type: 'stage', stage: 'skills', status: 'complete' });
  emit({ type: 'stage', stage: 'plugins', status: 'loading' });
  try {
    // These are live Loader fibers, not dependency manifests. Client-only rows,
    // disabled entries and pending service consumers are not reported as mounted.
    for (const entry of ctx.loader.entries()) {
      if (entry.options.group || entry.subtree || entry.subgroup || entry.disabled) continue;
      const label = entry.options.name || entry.id;
      if (entry.fiber?.state === ACTIVE) {
        const item = { id: entry.id, name: label, source: entry.id, status: 'loaded' };
        plugins.push(item); emit({ type: 'item', kind: 'plugin', ...item });
      } else if (entry.fiber?.state === FAILED) {
        const issue = { kind: 'plugin', name: label, message: 'The official Loader reports this plugin failed.' };
        issues.push(issue); emit({ type: 'item', ...issue, source: entry.id, status: 'error' });
      }
    }
    for (const preset of await ctx.agentPresets?.compositionInventory() ?? []) {
      if (!preset.isDefault) continue;
      if (preset.broken) issues.push({ kind: 'plugin', name: `preset:${preset.id}`, message: preset.broken });
      for (const row of preset.rows) {
        if (row.enabled !== true || row.fiberState !== ACTIVE) continue;
        const item = { id: `preset:${preset.id}/${row.entryId}`, name: row.moduleName, source: `preset:${preset.id}/${row.entryId}`, status: 'loaded' };
        plugins.push(item); emit({ type: 'item', kind: 'plugin', ...item });
      }
    }
  } catch (error) { issues.push({ kind: 'plugin', name: 'registry', message: error.message }); }
  stepLog({ step: 'plugins-done', plugins: plugins.length, skills: skills.length, issues: issues.length });
  emit({ type: 'stage', stage: 'plugins', status: 'complete' });
  const result = { type: 'complete', skills, plugins, issues, cwd, elapsed_ms: Math.round(performance.now() - started) };
  emit(result); return result;
}

export function apply(ctx, config = {}) {
  const token = randomBytes(32).toString('hex'), instance = randomBytes(16).toString('hex');
  let launchChoice;
  const register = route => ctx.effect(() => ctx.webServer.register(route), `startup ${route.path}`);
  register({ kind: 'prefix', path: PREFIX, async handler(req, res) {
    if (!localRequest(req, ctx.webServer.port, token)) { guardLog(req, ctx.webServer.port, token, false); return json(res, 403, { error: 'Startup is available only on this local machine.' }); }
    const path = new URL(req.url, `http://${req.headers.host}`).pathname.slice(PREFIX.length);
    if (path === '/launch' || path.startsWith('/api/')) {
      const rejection = ctx.connection.requestRejection(req);
      requestLog({ path, method: req.method, host: req.headers.host, origin: req.headers.origin, referer: req.headers.referer, cookie: Boolean(req.headers.cookie), secFetchSite: req.headers['sec-fetch-site'], rejection: rejection ?? null });
      if (rejection !== undefined) return json(res, rejection, { error: 'Open the official DSH login URL before reading startup data.' });
    }
    try {
      if (path === '/debug' && req.method === 'GET') {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          appendFileSync(new URL('./overlay.log', import.meta.url), JSON.stringify({ at: new Date().toISOString(), from: url.searchParams.get('from') || '?', event: url.searchParams.get('event') || '?', detail: url.searchParams.get('detail') || '' }) + '\n');
        } catch (_) { /* diagnostics must never break a request */ }
        return json(res, 200, { ok: true });
      }
      if (path === '/launch' && req.method === 'GET') {
        if (req.headers['x-dsh-startup'] !== 'launch') return json(res, 403, { error: 'Launch must originate from the local startup overlay.' });
        if (launchChoice === undefined) {
          const next = consumeNext();
          launchChoice = typeof config.override === 'boolean' ? config.override : next ?? settings().enabled;
        }
        return json(res, 200, { enabled: launchChoice, instance });
      }
      if (path === '/api/profile') {
        if (req.method === 'POST') {
          if (!localRequest(req, ctx.webServer.port, token, true)) { guardLog(req, ctx.webServer.port, token, true); return json(res, 403, { error: 'Invalid local request.' }); }
          saveSettings(profileInput(await body(req)));
        } else if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
        const value = settings();
        return json(res, 200, { mode: 'local', token, username: value.username, badge_id: value.badge_id, visual_style: value.visual_style, sound: value.sound, workspace: process.cwd(), inventory_mode: 'mounted', runtime: 'native', runtime_label: 'NATIVE' });
      }
      if (path === '/api/load' && req.method === 'POST') {
        if (!localRequest(req, ctx.webServer.port, token, true)) return json(res, 403, { error: 'Invalid local request.' });
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
        const controller = new AbortController();
        res.on('close', () => controller.abort());
        try {
          const loaded = await inventory(ctx, event => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); }, controller.signal);
          loadLog({ ok: true, cwd: loaded.cwd, skills: loaded.skills.length, plugins: loaded.plugins.length, issues: loaded.issues.length, elapsed_ms: loaded.elapsed_ms });
        } catch (error) {
          loadLog({ ok: false, message: String((error && error.message) || error) });
          throw error;
        }
        res.end(); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
      let relative = decodeURIComponent(path).replace(/^\//, '');
      if (relative === 'overlay.js' || relative === 'bridge.js') {
        const script = await readFile(new URL(`./${relative.replace('.js', '.mjs')}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }); return res.end(req.method === 'HEAD' ? undefined : script);
      }
      const absolute = resolve(assetRoot, relative);
      if (!absolute.startsWith(assetRoot + (assetRoot.endsWith(sep) ? '' : sep)) || !MIME[extname(absolute)]) return json(res, 404, { error: 'Asset not found.' });
      let content = await readFile(absolute);
      if (relative === 'startup-preview.html') {
        content = Buffer.from(content.toString('utf8').replace('<head>', `<head><script src="${PREFIX}/bridge.js"></script>`));
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(absolute)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'Asset not found.' : error.message });
    }
  } });
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'script-src', placement: 'head', src: `${PREFIX}/overlay.js` });
  });
}
