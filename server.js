const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawn, exec } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;
const SCAN_TIMEOUT_MS = 10 * 60 * 1000;

// =============================================================
// ===== LOCK ==================================================
// Un solo editor a la vez. Lock file en la carpeta compartida.
// Viewer: N instancias simultáneas, sin lock.
// =============================================================

const LOCK_FILE    = path.join(ROOT, '_lock.json');
const LOCK_STALE_MS = 120 * 1000;
const HOSTNAME     = os.hostname();
const MY_PID       = process.pid;

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); }
  catch { return null; }
}
function writeLock() {
  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    hostname: HOSTNAME,
    pid: MY_PID,
    timestamp: Date.now(),
    nota: '🚽 Ocupado — no usar'
  }, null, 2), 'utf8');
}
function isLockFresh(lock) {
  if (!lock || !lock.timestamp) return false;
  return (Date.now() - lock.timestamp) < LOCK_STALE_MS;
}
function lockIsMine() {
  const l = readLock();
  return !!l && l.pid === MY_PID && l.hostname === HOSTNAME;
}
function releaseLock() {
  if (lockIsMine()) { try { fs.unlinkSync(LOCK_FILE); } catch {} }
}
function tryAcquireLock() {
  try {
    const lock = readLock();
    if (lock && isLockFresh(lock) && !(lock.pid === MY_PID && lock.hostname === HOSTNAME)) {
      return false;
    }
    writeLock();
    return true;
  } catch (e) {
    console.error(`[LOCK] No se pudo adquirir: ${e.message}`);
    return false;
  }
}
// Verifica que seguimos siendo editor Y refresca el lock.
// Si perdimos el lock (otro lo tomó por stale), marca isEditor=false.
function ensureEditor() {
  if (!isEditor) return false;
  if (!lockIsMine()) { isEditor = false; return false; }
  try { writeLock(); return true; }
  catch { isEditor = false; return false; }
}

let isEditor = tryAcquireLock();
if (isEditor) {
  console.log(`[LOCK] Editor (${HOSTNAME}:${MY_PID})`);
} else {
  const l = readLock();
  console.log(`[LOCK] Viewer. Lock en ${l?.hostname}:${l?.pid}`);
}

process.on('SIGINT',  () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
process.on('exit',    () => { releaseLock(); });

// =============================================================
// ===== HELPERS ===============================================
// =============================================================

function readJson(file) {
  try {
    let content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    return JSON.parse(content);
  } catch { return null; }
}
function writeJson(file, data) {
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(data, null, 2), 'utf8');
}
function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function sendFile(res, file, contentType) {
  fs.readFile(path.join(ROOT, file), (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

let scanning = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/datos' && req.method === 'GET') {
    const impresoras = readJson('impresoras.json')?.impresoras || [];
    const registros  = readJson('historico.json')?.registros || {};
    const meta       = readJson('meta.json') || {};
    const lock = readLock();
    console.log(`[GET /api/datos] ${impresoras.length} impresoras, ${Object.keys(registros).length} registros, editor=${isEditor}`);
    return sendJson(res, 200, {
      impresoras, registros, meta,
      isEditor,
      lockOwner: lock && isLockFresh(lock) ? { hostname: lock.hostname } : null
    });
  }

  if (url.pathname === '/api/lock' && req.method === 'GET') {
    const lock = readLock();
    return sendJson(res, 200, {
      isEditor,
      lockOwner: lock && isLockFresh(lock) ? { hostname: lock.hostname } : null,
      isStale: lock ? !isLockFresh(lock) : true
    });
  }

  if (url.pathname === '/api/heartbeat' && req.method === 'POST') {
    if (!ensureEditor()) return sendJson(res, 409, { ok: false, error: 'not editor' });
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/take-edit' && req.method === 'POST') {
    if (isEditor) return sendJson(res, 200, { ok: true, isEditor: true });
    if (!tryAcquireLock()) {
      const lock = readLock();
      return sendJson(res, 409, { ok: false, error: 'lock occupied', lockOwner: lock ? { hostname: lock.hostname } : null });
    }
    isEditor = true;
    console.log(`[LOCK] Tomado en caliente por ${HOSTNAME}:${MY_PID}`);
    return sendJson(res, 200, { ok: true, isEditor: true });
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let exit = false;
      try { exit = !!JSON.parse(body || '{}').exit; } catch {}
      if (isEditor) {
        releaseLock();
        isEditor = false;
        console.log(`[LOCK] Liberado por logout (exit=${exit})`);
      }
      sendJson(res, 200, { ok: true, exit });
      if (exit) setTimeout(() => process.exit(0), 300);
    });
    return;
  }

  if (url.pathname === '/api/impresoras' && req.method === 'POST') {
    if (!ensureEditor()) return sendJson(res, 403, { ok: false, error: 'solo lectura' });
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!Array.isArray(data.impresoras)) throw new Error('Formato inválido');
        writeJson('impresoras.json', { impresoras: data.impresoras });
        console.log(`[POST /api/impresoras] ${data.impresoras.length} impresoras guardadas`);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[POST /api/impresoras] Error:', e.message);
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (url.pathname === '/api/historico' && req.method === 'POST') {
    if (!ensureEditor()) return sendJson(res, 403, { ok: false, error: 'solo lectura' });
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.key || typeof data.meses !== 'object' || Array.isArray(data.meses)) {
          throw new Error('Formato inválido: se espera { key, meses, deltasManuales }');
        }
        const deltasManuales = (data.deltasManuales && typeof data.deltasManuales === 'object')
          ? data.deltasManuales : {};
        const historico = readJson('historico.json') || { registros: {} };
        if (!historico.registros) historico.registros = {};
        const previo = historico.registros[data.key] || {};
        historico.registros[data.key] = {
          meses: data.meses,
          deltasManuales: deltasManuales,
          ultimoIntento:   previo.ultimoIntento   || null,
          ultimaRespuesta: previo.ultimaRespuesta || null,
          ultimoEstado:    previo.ultimoEstado    || 'error'
        };
        writeJson('historico.json', historico);
        console.log(`[POST /api/historico] ${data.key}: ${Object.keys(data.meses).length} raws, ${Object.keys(deltasManuales).length} deltas manuales`);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[POST /api/historico] Error:', e.message);
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (url.pathname === '/api/scan' && req.method === 'POST') {
    if (!ensureEditor()) return sendJson(res, 403, { ok: false, error: 'solo lectura' });
    if (scanning) {
      return sendJson(res, 429, { ok: false, error: 'Ya hay un escaneo en curso.' });
    }
    scanning = true;
    const t0 = Date.now();
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  ▶ Escaneo iniciado');
    console.log('═══════════════════════════════════════════');

    const ps = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass', '-NoProfile', '-NoLogo',
      '-File', path.join(ROOT, 'monitor.ps1')
    ], { cwd: ROOT });

    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { ps.kill('SIGKILL'); } catch {}
    }, SCAN_TIMEOUT_MS);

    ps.stdout.on('data', d => { const s = d.toString(); output += s; process.stdout.write(s); });
    ps.stderr.on('data', d => { const s = d.toString(); output += s; process.stderr.write(s); });

    ps.on('error', err => {
      clearTimeout(timer); scanning = false;
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: `No se pudo lanzar PowerShell: ${err.message}` });
    });

    ps.on('close', code => {
      clearTimeout(timer); scanning = false;
      const duracion = Math.round((Date.now() - t0) / 1000);
      const tail = output.split(/\r?\n/).filter(l => l.trim()).slice(-40).join('\n');
      if (res.headersSent) return;
      if (timedOut) {
        sendJson(res, 500, { ok: false, duracion, error: `Timeout ${SCAN_TIMEOUT_MS / 1000}s`, output: tail });
      } else if (code === 0) {
        console.log(`  ✓ Escaneo OK en ${duracion}s`);
        sendJson(res, 200, { ok: true, duracion, output: tail });
      } else {
        console.log(`  ✗ Escaneo FALLÓ (exit ${code})`);
        sendJson(res, 500, { ok: false, duracion, error: `Exit ${code}`, output: tail });
      }
    });
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const ext = path.extname(file);
  sendFile(res, file, MIME[ext] || 'application/octet-stream');
});

server.on('error', (err) => {
  console.error('');
  if (err.code === 'EADDRINUSE') {
    console.error(`  ✗ El puerto ${PORT} ya está en uso.`);
  } else {
    console.error('  ✗ Error del servidor:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const supportsColor = process.stdout.isTTY && process.env.NO_COLOR == null;
  const cc = (c) => (s) => supportsColor ? `\x1b[${c}m${s}\x1b[0m` : s;
  const cyan = cc('36'), gray = cc('90'), boldWht = cc('1;97'), magenta = cc('35'), yellow = cc('33');
  const W = 59;
  const bl = (text, fn) => { const pad = W - text.length; const l = Math.floor(pad/2); const r = pad-l; return cyan('║') + ' '.repeat(l) + fn(text) + ' '.repeat(r) + cyan('║'); };
  const sep = gray('─'.repeat(W + 2));

  console.log('');
  console.log(cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(cyan('║' + ' '.repeat(W) + '║'));
  console.log(bl('d e e p', boldWht));
  console.log(bl('p r e s o r a s', boldWht));
  console.log(cyan('║' + ' '.repeat(W) + '║'));
  console.log(bl('"Do Printers Dream of Electric Ink?"', gray));
  console.log(cyan('║' + ' '.repeat(W) + '║'));
  console.log(bl('Control de contadores vía SNMP v2c', gray));
  console.log(bl(`http://localhost:${PORT}`, gray));
  console.log(cyan('╚' + '═'.repeat(W) + '╝'));
  console.log('');
  console.log(sep);
  console.log(gray('  Creado en Noviembre de 2026'));
  console.log(gray('  por ') + boldWht('Nicolas Maximiliano Rodriguez Digon') + gray(','));
  console.log(gray('  con ayuda de los futuros ') + magenta('Overlords IA') + gray(','));
  console.log(gray('  en particular ') + magenta('DeepSeek') + gray('.'));
  console.log(sep);
  console.log(yellow('  All Hail Megatron.'));
  console.log(sep);
  console.log(gray('  GitHub: ') + cyan('@nekher'));
  console.log(sep);
  console.log('');

  const url = `http://localhost:${PORT}`;
  try {
    if (process.platform === 'win32') exec(`start "" "${url}"`);
    else if (process.platform === 'darwin') exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  } catch {}
});