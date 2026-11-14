/* ============================================================
   Deep presoras - Frontend
   - Clave primaria: serial (fallback a ip)
   - Legacy: <= 2026-10 (no confiable, no suma)
   - Confiable: >= 2026-11 (scan contra scan)
   - Soft delete: impresora con borradaEn set deja de contar
   - escanear: false => monitor.ps1 la omite
   ============================================================ */

const LEGACY_HASTA = '2026-10';
function esLegacy(mesKey) { return mesKey <= LEGACY_HASTA; }

const PALETA_MODELOS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#84cc16', '#a855f7'
];

const EDIFICIO_ICONS = [
  // 0: Torre
  '<path d="M18 42V12l6-4 6 4v30"/><path d="M12 42h24"/><rect x="21" y="18" width="6" height="3"/><rect x="21" y="25" width="6" height="3"/><rect x="21" y="32" width="6" height="3"/>',
  // 1: Edificio con techo triangular
  '<path d="M9 42V22L24 9l15 13v20"/><path d="M6 42h36"/><rect x="20" y="30" width="8" height="12"/>',
  // 2: Edificio ancho con ventanas
  '<rect x="7" y="20" width="34" height="22" rx="1"/><path d="M4 42h40"/><path d="M13 26h4M23 26h4M33 26h4M13 32h4M23 32h4M33 32h4"/>',
  // 3: Dos torres
  '<rect x="10" y="18" width="10" height="24"/><rect x="28" y="24" width="10" height="18"/><path d="M6 42h36"/><rect x="13" y="24" width="4" height="3"/><rect x="13" y="32" width="4" height="3"/><rect x="31" y="30" width="4" height="3"/>',
  // 4: Edificio con cúpula
  '<path d="M10 42V22c0-5 6-10 14-10s14 5 14 10v20"/><path d="M6 42h36"/><path d="M24 12V6"/><circle cx="24" cy="4" r="1.5"/><rect x="21" y="30" width="6" height="12"/>',
  // 5: Casa
  '<path d="M10 42V22L24 10l14 12v20"/><path d="M7 42h34"/><rect x="20" y="30" width="8" height="12"/><path d="M20 36h8"/>'
];
const EDIFICIO_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
const SIN_EDIFICIO_COLOR = '#94a3b8';

const state = {
  impresoras: [],
  registros: {},
  meta: {},
  view: 'tablero',
  detalleKey: null,
  detalleFrom: 'buscar',
  edificioSeleccionado: null,
  editingKey: null,
  search: { text: '', edificio: '', piso: '', estado: '' },
  histSort: { col: 'total', dir: 'desc' },
  printerSort: { col: 'status', dir: 'asc' },
  serverAvailable: false,
  lastStats: {},
  isEditor: false,
  lockOwner: null
};

const KRAKEN_TARGET = 8;
const KRAKEN_WINDOW_MS = 800;
let krakenClicks = 0;
let krakenLastClick = 0;

function handleKrakenClick() {
  const now = Date.now();
  if (now - krakenLastClick > KRAKEN_WINDOW_MS) krakenClicks = 0;
  krakenLastClick = now;
  krakenClicks++;
  if (krakenClicks >= KRAKEN_TARGET) {
    krakenClicks = 0;
    triggerKrakenEasterEgg();
  }
}

function triggerKrakenEasterEgg() {
  document.body.classList.add('kraken-fire');
  const icon = document.getElementById('brandIcon');
  if (icon) {
    const rect = icon.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 14; i++) {
      const spark = document.createElement('span');
      spark.textContent = '🔥';
      spark.className = 'kraken-spark';
      spark.style.left = `${cx}px`;
      spark.style.top = `${cy}px`;
      spark.style.animationDelay = `${i * 35}ms`;
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.6;
      const dist = 90 + Math.random() * 140;
      spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      spark.style.fontSize = `${18 + Math.random() * 16}px`;
      document.body.appendChild(spark);
      setTimeout(() => spark.remove(), 1400);
    }
  }
  setTimeout(() => document.body.classList.remove('kraken-fire'), 1500);
  setTimeout(() => {
    window.open('https://github.com/nekher', '_blank', 'noopener,noreferrer');
  }, 700);
}

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmtNum = (n) => new Intl.NumberFormat('es-AR').format(n || 0);

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevMonthKey() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthKeyToLabel(key) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${meses[parseInt(m, 10) - 1]} ${y}`;
}
function monthNameUpper(key) {
  const [, m] = key.split('-');
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  return meses[parseInt(m, 10) - 1];
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}
function getPrinterKey(p) {
  if (!p) return '';
  return p.serial || p.ip || '';
}
function getPrinterByKey(key) {
  return state.impresoras.find(x => getPrinterKey(x) === key) || { ip: key };
}
function getReg(key) {
  const r = state.registros[key];
  if (!r) return { meses: {}, deltasManuales: {}, ultimaRespuesta: null, ultimoEstado: 'error' };
  return { deltasManuales: {}, ...r };
}
function getEstado(key) {
  const r = getReg(key);
  if (r.ultimoEstado === 'ok')  return 'ok';
  if (r.ultimoEstado === 'usb') return 'usb';
  return 'error';
}
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isBorrada(p) { return !!(p && p.borradaEn); }
function getImpresorasActivas() { return state.impresoras.filter(p => !isBorrada(p)); }
function getImpresorasBorradas() { return state.impresoras.filter(p => isBorrada(p)); }

function esEscanable(p) {
  if (!p) return false;
  if ((p.ip || '').toUpperCase() === 'USB') return false;
  return p.escanear !== false;
}

// --- LECTURAS ---
function getRaw(printer, mesKey) {
  const r = getReg(getPrinterKey(printer)).meses?.[mesKey];
  return r != null ? Number(r) : null;
}
function getManualDelta(printer, mesKey) {
  const r = getReg(getPrinterKey(printer)).deltasManuales?.[mesKey];
  return r != null ? Number(r) : null;
}
function getBaseline(printer) {
  const b = printer.baseline;
  if (!b || !b.mes || b.raw == null) return null;
  const raw = Number(b.raw);
  if (isNaN(raw)) return null;
  return { mes: String(b.mes), raw };
}
function getPrevRaw(printer, mesKey) {
  const reg = getReg(getPrinterKey(printer));
  const baseline = getBaseline(printer);
  let best = null;
  Object.keys(reg.meses || {}).forEach(m => {
    if (m < mesKey && reg.meses[m] != null) {
      if (!best || m > best.mes) best = { mes: m, raw: Number(reg.meses[m]) };
    }
  });
  if (baseline && baseline.mes < mesKey) {
    if (!best || baseline.mes > best.mes) best = baseline;
  }
  return best;
}
function getDelta(printer, mesKey) {
  if (esLegacy(mesKey)) return null;
  const reg = getReg(getPrinterKey(printer));
  const manual = reg.deltasManuales?.[mesKey];
  if (manual != null) return Math.max(0, Number(manual));
  const raw = getRaw(printer, mesKey);
  if (raw == null) return null;
  const prev = getPrevRaw(printer, mesKey);
  if (!prev) return null;
  return Math.max(0, raw - prev.raw);
}
function getTotalDelta(printer) {
  const reg = getReg(getPrinterKey(printer));
  const allMonths = new Set([
    ...Object.keys(reg.meses || {}),
    ...Object.keys(reg.deltasManuales || {})
  ]);
  let total = 0, hasAny = false;
  allMonths.forEach(m => {
    if (esLegacy(m)) return;
    const d = getDelta(printer, m);
    if (d != null) { total += d; hasAny = true; }
  });
  return hasAny ? total : null;
}
function getLatestRaw(printer) {
  const reg = getReg(getPrinterKey(printer));
  const months = Object.keys(reg.meses || {}).filter(m => reg.meses[m] != null).sort();
  if (months.length === 0) return null;
  const last = months[months.length - 1];
  return { mes: last, raw: Number(reg.meses[last]) };
}

function getUltimosMeses(n) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// --- EDIFICIOS ---
function getEdificiosUnicos() {
  const activas = getImpresorasActivas();
  const grupos = {};
  activas.forEach(p => {
    const edif = String(p.edificio || '').trim();
    const key = edif || '__sin__';
    if (!grupos[key]) grupos[key] = { key, nombre: edif, count: 0 };
    grupos[key].count++;
  });
  const out = Object.values(grupos);
  out.sort((a, b) => {
    if (a.key === '__sin__') return -1;
    if (b.key === '__sin__') return 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return out;
}
function getEdificioVisual(index, esSin) {
  if (esSin) {
    return { icon: EDIFICIO_ICONS[0], color: SIN_EDIFICIO_COLOR };
  }
  const idx = index % EDIFICIO_ICONS.length;
  return { icon: EDIFICIO_ICONS[idx], color: EDIFICIO_COLORS[idx] };
}

// --- STATS AGREGADOS ---
function getTotalHojas() {
  let total = 0;
  getImpresorasActivas().forEach(p => {
    const t = getTotalDelta(p);
    if (t != null) total += t;
  });
  return total;
}
function getHojasMes(mesKey) {
  let total = 0;
  getImpresorasActivas().forEach(p => {
    const d = getDelta(p, mesKey);
    if (d != null) total += d;
  });
  return total;
}
function getTopPrinter() {
  let best = null;
  getImpresorasActivas().forEach(p => {
    const t = getTotalDelta(p);
    if (t != null && (best == null || t > best.value)) {
      best = { printer: p, value: t };
    }
  });
  return best;
}
function getPeorMes() {
  const activas = getImpresorasActivas();
  const mesesSet = new Set();
  activas.forEach(p => {
    const r = getReg(getPrinterKey(p));
    Object.keys(r.meses || {}).forEach(m => { if (!esLegacy(m)) mesesSet.add(m); });
    Object.keys(r.deltasManuales || {}).forEach(m => { if (!esLegacy(m)) mesesSet.add(m); });
  });
  const meses = [...mesesSet].sort();
  let best = null;
  meses.forEach(m => {
    let sum = 0, count = 0;
    activas.forEach(p => {
      const d = getDelta(p, m);
      if (d != null) { sum += d; count++; }
    });
    if (count > 0 && (best == null || sum > best.value)) {
      best = { mes: m, value: sum, count };
    }
  });
  return best;
}
function getPisoTop() {
  const meses = getUltimosMeses(3);
  const grupos = {};
  getImpresorasActivas().forEach(p => {
    const val = getPisoValue(p);
    if (!grupos[val]) {
      grupos[val] = { piso: val, total: 0, label: val === 999 ? 'Sin piso' : pisoLabel(p.piso) };
    }
    meses.forEach(m => {
      const d = getDelta(p, m);
      if (d != null) grupos[val].total += d;
    });
  });
  const entries = Object.values(grupos).sort((a, b) => b.total - a.total);
  return entries[0] || null;
}

function proyectarMes(mesKey) {
  const hoy = new Date();
  const [y, m] = mesKey.split('-').map(Number);
  if (y !== hoy.getFullYear() || m !== hoy.getMonth() + 1) return null;
  const diasTranscurridos = hoy.getDate();
  const diasDelMes = new Date(y, m, 0).getDate();
  let total = 0;
  getImpresorasActivas().forEach(p => {
    const d = getDelta(p, mesKey);
    if (d != null) total += d;
  });
  if (diasTranscurridos === 0) return { total: 0, proyectado: 0, dias: 0, diasTotal: diasDelMes };
  const proyectado = Math.round(total / diasTranscurridos * diasDelMes);
  return { total, proyectado, dias: diasTranscurridos, diasTotal: diasDelMes };
}

function getPorEdificio() {
  const grupos = {};
  getImpresorasActivas().forEach(p => {
    const edif = String(p.edificio || '').trim();
    const key = edif || '__sin__';
    const label = edif || 'Sin edificio';
    if (!grupos[key]) grupos[key] = { key, label, count: 0, total: 0 };
    grupos[key].count++;
    const t = getTotalDelta(p);
    if (t != null) grupos[key].total += t;
  });
  const out = Object.values(grupos);
  out.sort((a, b) => {
    if (a.key === '__sin__') return -1;
    if (b.key === '__sin__') return 1;
    return b.count - a.count || a.label.localeCompare(b.label, 'es');
  });
  return out;
}

// --- VALIDACIÓN ---
function isValidHost(host) {
  if (!host) return false;
  if (host.toUpperCase().startsWith('USB')) return true;
  const parts = host.split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    return parts.every(p => { const n = parseInt(p, 10); return n >= 0 && n <= 255; });
  }
  if (!/^[a-zA-Z0-9.\-]+$/.test(host)) return false;
  if (/^[.\-]|[.\-]$/.test(host)) return false;
  if (host.includes('..')) return false;
  return true;
}

// --- PISO ---
function getPisoValue(printer) {
  const p = String(printer.piso ?? '').trim();
  if (!p) return 999;
  const n = parseInt(p, 10);
  return isNaN(n) ? 999 : n;
}
function pisoLabel(v) {
  if (v === '' || v === null || v === undefined) return '—';
  const n = parseInt(v, 10);
  if (n === -1) return 'SS';
  if (n === 0)  return 'PB';
  if (isNaN(n)) return String(v);
  return `P${n}`;
}

// --- SORT ---
function statusOrder(estado) { return estado === 'ok' ? 0 : estado === 'usb' ? 1 : 2; }
function defaultDirForColumn(col) {
  return (col === 'total' || col === 'ultimaRespuesta' || col === 'baseline') ? 'desc' : 'asc';
}
function sortPrinters(printers) {
  const { col, dir } = state.printerSort;
  const dirMul = dir === 'asc' ? 1 : -1;
  return [...printers].sort((a, b) => {
    let va, vb, isStr = false;
    if (col === 'status') { va = statusOrder(getEstado(getPrinterKey(a))); vb = statusOrder(getEstado(getPrinterKey(b))); }
    else if (col === 'piso') { va = getPisoValue(a); vb = getPisoValue(b); }
    else if (col === 'total') { va = getTotalDelta(a) ?? 0; vb = getTotalDelta(b) ?? 0; }
    else if (col === 'ip') { va = a.ip || ''; vb = b.ip || ''; isStr = true; }
    else if (col === 'area') { va = a.area || ''; vb = b.area || ''; isStr = true; }
    else if (col === 'modelo') { va = a.modelo || ''; vb = b.modelo || ''; isStr = true; }
    else if (col === 'funcionario') { va = a.funcionario || ''; vb = b.funcionario || ''; isStr = true; }
    else if (col === 'baseline') { va = a.baseline?.mes || ''; vb = b.baseline?.mes || ''; isStr = true; }
    else if (col === 'ultimaRespuesta') {
      va = getReg(getPrinterKey(a)).ultimaRespuesta ? new Date(getReg(getPrinterKey(a)).ultimaRespuesta).getTime() : 0;
      vb = getReg(getPrinterKey(b)).ultimaRespuesta ? new Date(getReg(getPrinterKey(b)).ultimaRespuesta).getTime() : 0;
    } else return 0;
    let cmp = isStr ? va.localeCompare(vb, 'es', { numeric: true }) : (va || 0) - (vb || 0);
    if (cmp !== 0) return cmp * dirMul;
    const pa = getPisoValue(a), pb = getPisoValue(b);
    if (pa !== pb) return pa - pb;
    return (a.ip || '').localeCompare(b.ip || '', 'es', { numeric: true });
  });
}

// --- LOAD / SAVE ---
async function loadData() {
  try {
    const res = await fetch('/api/datos', { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    state.impresoras = data.impresoras || [];
    state.registros = data.registros || {};
    state.meta = data.meta || {};
    state.serverAvailable = true;
    state.isEditor = !!data.isEditor;
    state.lockOwner = data.lockOwner || null;

    state.impresoras.forEach(p => {
      if (p.baseline) return;
      const reg = getReg(getPrinterKey(p));
      const mesesConDato = Object.keys(reg.meses || {}).filter(m => reg.meses[m] != null);
      if (mesesConDato.length === 0) return;
      if (mesesConDato.some(m => esLegacy(m))) return;
      const mesMasViejo = mesesConDato.sort()[0];
      p.baseline = { mes: mesMasViejo, raw: Number(reg.meses[mesMasViejo]) };
    });

    return { source: 'server' };
  } catch {
    state.impresoras = []; state.registros = {}; state.meta = {};
    state.serverAvailable = false;
    return { source: 'offline' };
  }
}
async function persistPrinters() {
  if (!state.serverAvailable) { showToast('⚠ Servidor no disponible', 'error'); return false; }
  try {
    const res = await fetch('/api/impresoras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ impresoras: state.impresoras })
    });
    if (!res.ok) throw new Error('save failed');
    return true;
  } catch (e) { showToast(`⚠ Error al guardar: ${e.message}`, 'error'); return false; }
}
async function persistHistorico(key, meses, deltasManuales) {
  if (!state.serverAvailable) { showToast('⚠ Servidor no disponible', 'error'); return false; }
  try {
    const res = await fetch('/api/historico', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, meses, deltasManuales })
    });
    if (!res.ok) throw new Error('save failed');
    if (!state.registros[key]) state.registros[key] = { meses: {}, deltasManuales: {}, ultimoIntento: null, ultimaRespuesta: null, ultimoEstado: 'error' };
    state.registros[key].meses = meses;
    state.registros[key].deltasManuales = deltasManuales;
    return true;
  } catch (e) { showToast(`⚠ Error al guardar histórico: ${e.message}`, 'error'); return false; }
}

// --- VIEWS ---
function switchView(view) {
  state.view = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  render();
}
function irADetalle(key, from = 'buscar') {
  state.detalleKey = key;
  state.detalleFrom = from;
  switchView('detalle');
}
function render() {
  if (state.view === 'tablero')    renderTablero();
  if (state.view === 'impresoras') renderImpresoras();
  if (state.view === 'buscar')     renderBuscar();
  if (state.view === 'detalle')    renderDetalle();
  if (state.view === 'historico')  renderHistorico();
}

// --- ANIMACIONES ---
function animateNumber(el, from, to, duration = 800) {
  if (from === to) { el.textContent = fmtNum(to); return; }
  const start = performance.now();
  const diff = to - from;
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmtNum(Math.round(from + diff * eased));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = fmtNum(to);
  };
  requestAnimationFrame(step);
}
function setStatValue(id, value, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = state.lastStats[key];
  if (prev === value) return;
  state.lastStats[key] = value;
  animateNumber(el, prev ?? 0, value);
}
function setCountWithPulse(id, value, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = state.lastStats[key];
  if (prev === value) return;
  state.lastStats[key] = value;
  el.textContent = String(value);
  if (prev !== undefined) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 750);
  }
}

// --- TABLERO ---
function renderTablero() {
  const activas = getImpresorasActivas();
  const ok = activas.filter(p => getEstado(getPrinterKey(p)) === 'ok').length;
  const err = activas.length - ok;

  const totalHojas = getTotalHojas();
  const mesKey = currentMonthKey();
  const hojasMes = getHojasMes(mesKey);
  const topPrinter = getTopPrinter();
  const peorMes = getPeorMes();
  const pisoTop = getPisoTop();

  setStatValue('statTotalHojas', totalHojas, 'totalHojas');
  setStatValue('statHojasMes', hojasMes, 'hojasMes');
  setStatValue('statTopPrinterValue', topPrinter ? topPrinter.value : 0, 'topPrinter');
  setStatValue('statWorstMonthValue', peorMes ? peorMes.value : 0, 'worstMonth');
  setStatValue('statTopFloorValue', pisoTop ? pisoTop.total : 0, 'topFloor');

  const proy = proyectarMes(mesKey);
  const proyTxt = proy ? ` · Proy: ~${fmtNum(proy.proyectado)}` : '';
  $('#statHojasMesSub').textContent = `${monthKeyToLabel(mesKey)} (parcial)${proyTxt}`;

  const mesPrev = prevMonthKey();
  const hojasMesPrev = getHojasMes(mesPrev);
  if (hojasMesPrev > 0 && proy) {
    const pct = ((proy.proyectado - hojasMesPrev) / hojasMesPrev * 100).toFixed(0);
    const arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '=');
    const absPct = Math.abs(pct);
    $('#statHojasMesSub').textContent += ` · ${arrow} ${absPct}% vs ${monthKeyToLabel(mesPrev)}`;
  }

  $('#statTopPrinterName').textContent = topPrinter ? (topPrinter.printer.area || topPrinter.printer.ip) : 'Sin datos';
  $('#statWorstMonthName').textContent = peorMes ? monthKeyToLabel(peorMes.mes) : 'Sin datos';
  $('#statTopFloorName').textContent = pisoTop ? pisoTop.label : 'Sin datos';

  if (state.meta.ultimaActualizacion) {
    $('#lastUpdate').textContent = `Actualizado: ${formatDateTime(state.meta.ultimaActualizacion)}`;
  } else {
    $('#lastUpdate').textContent = 'Sin fecha de actualización';
  }

  renderDonut(ok, err);
  renderTopMes();
  renderTopHistorico();
  renderDonutModelos();
  renderTendencia();
  renderPorEdificio();
  renderPorPiso();
  renderPorFuncionario();
  renderConsumoPorEdificio();
  renderHojasPorFuncionario();
  renderListaOk();
  renderListaProblemas();
}
function renderDonut(ok, err) {
  const svg = $('#donut');
  const total = ok + err;
  const R = 40, C = 2 * Math.PI * R;
  const okLen = total > 0 ? (ok / total) * C : 0;
  const errLen = total > 0 ? (err / total) * C : 0;
  const errColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
  const okColor = getComputedStyle(document.documentElement).getPropertyValue('--success').trim();
  const trackColor = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim();
  svg.innerHTML = `
    <circle cx="50" cy="50" r="${R}" stroke="${trackColor}"></circle>
    ${ok > 0 ? `<circle cx="50" cy="50" r="${R}" stroke="${okColor}" stroke-dasharray="${okLen} ${C}" stroke-dashoffset="0"></circle>` : ''}
    ${err > 0 ? `<circle cx="50" cy="50" r="${R}" stroke="${errColor}" stroke-dasharray="${errLen} ${C}" stroke-dashoffset="${-okLen}"></circle>` : ''}
  `;
  $('#donutNumber').textContent = ok;
  $('#donutLegend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:${okColor}"></span> Responden <span class="legend-value">${ok}</span></div>
    <div class="legend-item"><span class="legend-dot" style="background:${errColor}"></span> Sin respuesta <span class="legend-value">${err}</span></div>
  `;
}
function renderDonutModelos() {
  const svg = $('#donutModelos');
  if (!svg) return;
  const grupos = {};
  getImpresorasActivas().forEach(p => {
    const m = String(p.modelo || '').trim() || 'Sin modelo';
    grupos[m] = (grupos[m] || 0) + 1;
  });
  const entries = Object.entries(grupos).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const R = 40, C = 2 * Math.PI * R;
  const top = entries.slice(0, 10);
  const resto = entries.slice(10);
  const data = [];
  top.forEach(([l, n], i) => data.push({ label: l, n, color: PALETA_MODELOS[i % PALETA_MODELOS.length], otros: false }));
  if (resto.length > 0) {
    data.push({ label: `Otros (${resto.length})`, n: resto.reduce((s, [, n]) => s + n, 0), color: null, otros: true });
  }
  const totalAll = data.reduce((s, d) => s + d.n, 0) || 1;
  let acc = 0;
  const trackColor = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim();
  const dimColor = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim();
  const segs = data.map(d => {
    const len = (d.n / totalAll) * C;
    const offset = -acc;
    acc += len;
    const color = d.otros ? dimColor : d.color;
    const attr = d.otros ? '' : ` data-modelo="${escapeAttr(d.label)}"`;
    return `<circle cx="50" cy="50" r="${R}" stroke="${color}" stroke-dasharray="${len} ${C}" stroke-dashoffset="${offset}"${attr}></circle>`;
  }).join('');
  svg.innerHTML = `<circle cx="50" cy="50" r="${R}" stroke="${trackColor}"></circle>${segs}`;
  const legend = $('#donutModelosLegend');
  if (legend) {
    legend.innerHTML = data.map(d => {
      const color = d.otros ? dimColor : d.color;
      return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span> ${escapeHtml(d.label)} <span class="legend-value">${d.n}</span></div>`;
    }).join('');
  }
  const panel = document.getElementById('donutModelosPanel');
  if (panel) { panel.hidden = true; panel.innerHTML = ''; panel.dataset.modelo = ''; }
}
function renderTopMes() {
  const mesKey = currentMonthKey();
  $('#topMesTitle').textContent = `TOP 5 MÁS UTILIZADAS DE ${monthNameUpper(mesKey)} ${mesKey.split('-')[0]}`;
  const rows = getImpresorasActivas()
    .map(p => ({ printer: p, value: getDelta(p, mesKey) ?? 0 }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  const max = rows[0]?.value || 1;
  const cont = $('#topMes');
  if (rows.length === 0) {
    cont.innerHTML = `<div class="empty">Sin datos de este mes todavía</div>`;
    return;
  }
  cont.innerHTML = rows.map(r => `
    <div class="top-row">
      <div class="top-header"><span class="top-name">${escapeHtml(r.printer.area || r.printer.ip)}</span><span class="top-value">${fmtNum(r.value)}</span></div>
      <div class="top-bar"><div class="top-fill" style="width:${(r.value / max * 100).toFixed(1)}%"></div></div>
      <div class="top-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)} · ${escapeHtml(r.printer.funcionario || '')}</div>
    </div>
  `).join('');
}
function renderTopHistorico() {
  const rows = getImpresorasActivas()
    .map(p => ({ printer: p, value: getTotalDelta(p) ?? 0 }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  const max = rows[0]?.value || 1;
  const cont = $('#topHistorico');
  if (rows.length === 0) {
    cont.innerHTML = `<div class="empty">Sin datos históricos</div>`;
    return;
  }
  cont.innerHTML = rows.map(r => `
    <div class="top-row">
      <div class="top-header"><span class="top-name">${escapeHtml(r.printer.area || r.printer.ip)}</span><span class="top-value">${fmtNum(r.value)}</span></div>
      <div class="top-bar"><div class="top-fill" style="width:${(r.value / max * 100).toFixed(1)}%"></div></div>
      <div class="top-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)} · ${escapeHtml(r.printer.funcionario || '')}</div>
    </div>
  `).join('');
}

function renderPorPiso() {
  const cont = $('#graficoPorPiso');
  const grupos = {};
  getImpresorasActivas().forEach(p => {
    const valor = getPisoValue(p);
    const label = valor === 999 ? 'Sin piso' : pisoLabel(p.piso);
    if (!grupos[valor]) grupos[valor] = { label, count: 0 };
    grupos[valor].count++;
  });
  const entries = Object.entries(grupos).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
  if (entries.length === 0) {
    cont.innerHTML = `<div class="empty">Sin impresoras.</div>`;
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v.count), 1);
  cont.innerHTML = entries.map(([, v]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(v.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v.count / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${v.count}</div>
    </div>
  `).join('');
}

function renderPorFuncionario() {
  const cont = $('#graficoPorFuncionario');
  const grupos = {};
  getImpresorasActivas().forEach(p => {
    const f = (p.funcionario || '').trim() || '(Sin asignar)';
    grupos[f] = (grupos[f] || 0) + 1;
  });
  const entries = Object.entries(grupos).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  if (entries.length === 0) {
    cont.innerHTML = `<div class="empty">Sin impresoras.</div>`;
    return;
  }
  const top = entries.slice(0, 10);
  const resto = entries.slice(10);
  const max = Math.max(...top.map(([, n]) => n), resto.length ? resto.reduce((s, [, n]) => s + n, 0) : 0, 1);
  let html = top.map(([f, n]) => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(f)}">${escapeHtml(f)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(n / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${n}</div>
    </div>
  `).join('');
  if (resto.length > 0) {
    const restoCount = resto.reduce((s, [, n]) => s + n, 0);
    html += `
      <div class="bar-row bar-row-otros">
        <div class="bar-label">Otros (${resto.length})</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(restoCount / max * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${restoCount}</div>
      </div>
    `;
  }
  cont.innerHTML = html;
}

function renderHojasPorFuncionario() {
  const cont = $('#graficoHojasPorFuncionario');
  const meses = getUltimosMeses(3);
  const grupos = {};
  getImpresorasActivas().forEach(p => {
    const f = (p.funcionario || '').trim() || '(Sin asignar)';
    if (!grupos[f]) grupos[f] = 0;
    meses.forEach(m => {
      const d = getDelta(p, m);
      if (d != null) grupos[f] += d;
    });
  });
  const entries = Object.entries(grupos)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  if (entries.length === 0) {
    cont.innerHTML = `<div class="empty">Sin datos en los últimos 3 meses.</div>`;
    return;
  }
  const top = entries.slice(0, 5);
  const resto = entries.slice(5);
  const max = Math.max(...top.map(([, n]) => n), resto.length ? resto.reduce((s, [, n]) => s + n, 0) : 0, 1);
  let html = top.map(([f, n]) => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(f)}">${escapeHtml(f)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(n / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${fmtNum(n)}</div>
    </div>
  `).join('');
  if (resto.length > 0) {
    const restoCount = resto.reduce((s, [, n]) => s + n, 0);
    html += `
      <div class="bar-row bar-row-otros">
        <div class="bar-label">Otros (${resto.length})</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(restoCount / max * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${fmtNum(restoCount)}</div>
      </div>
    `;
  }
  cont.innerHTML = html;
}

// --- NUEVAS MÉTRICAS DEL TABLERO ---
function renderTendencia() {
  const cont = $('#graficoTendencia');
  if (!cont) return;

  const mesesSet = new Set();
  getImpresorasActivas().forEach(p => {
    const reg = getReg(getPrinterKey(p));
    Object.keys(reg.meses || {}).forEach(m => {
      if (!esLegacy(m)) mesesSet.add(m);
    });
  });
  const todosMeses = [...mesesSet].sort();
  const meses = todosMeses.slice(-6);

  if (meses.length === 0) {
    cont.innerHTML = `<div class="empty">Todavía no hay datos mensuales para mostrar tendencia.</div>`;
    return;
  }

  const data = meses.map(m => {
    const proy = proyectarMes(m);
    if (proy) {
      return { mes: m, total: proy.proyectado, real: proy.total, esProy: true };
    }
    let total = 0;
    getImpresorasActivas().forEach(p => {
      const d = getDelta(p, m);
      if (d != null) total += d;
    });
    return { mes: m, total, real: total, esProy: false };
  });

  const max = Math.max(...data.map(d => d.total), 1);

  cont.innerHTML = data.map((d, i) => {
    const prev = i > 0 ? data[i - 1].total : null;
    let trendTxt = '';
    if (prev != null && prev > 0) {
      const pct = ((d.total - prev) / prev * 100).toFixed(0);
      const color = pct > 0 ? 'var(--danger)' : (pct < 0 ? 'var(--success)' : 'var(--text-muted)');
      const arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '=');
      trendTxt = `<span style="color:${color};font-size:11px;margin-left:8px;">${arrow} ${Math.abs(pct)}%</span>`;
    }
    const label = monthKeyToLabel(d.mes) + (d.esProy ? ' (proy.)' : '');
    const value = fmtNum(d.total) + (d.esProy ? `<div style="font-size:10px;color:var(--text-dim);font-weight:400;">hasta hoy: ${fmtNum(d.real)}</div>` : '');
    return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.total / max * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${value}${trendTxt}</div>
      </div>
    `;
  }).join('');
}

function renderPorEdificio() {
  const cont = $('#graficoPorEdificio');
  if (!cont) return;
  const grupos = getPorEdificio();
  if (grupos.length === 0) {
    cont.innerHTML = `<div class="empty">Sin impresoras.</div>`;
    return;
  }
  const max = Math.max(...grupos.map(g => g.count), 1);
  cont.innerHTML = grupos.map(g => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(g.label)}">${escapeHtml(g.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(g.count / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${g.count}</div>
    </div>
  `).join('');
}

function renderConsumoPorEdificio() {
  const cont = $('#consumoPorEdificio');
  if (!cont) return;
  const grupos = getPorEdificio().filter(g => g.total > 0);
  if (grupos.length === 0) {
    cont.innerHTML = `<div class="empty">Sin consumo registrado.</div>`;
    return;
  }
  grupos.sort((a, b) => b.total - a.total);
  const max = Math.max(...grupos.map(g => g.total), 1);
  cont.innerHTML = grupos.map(g => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(g.label)}">${escapeHtml(g.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(g.total / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${fmtNum(g.total)}</div>
    </div>
  `).join('');
}

function selectModelo(modelo) {
  const panel = document.getElementById('donutModelosPanel');
  if (!panel) return;
  if (panel.dataset.modelo === modelo && !panel.hidden) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.dataset.modelo = '';
    return;
  }
  const activas = getImpresorasActivas().filter(p => (String(p.modelo || '').trim() || 'Sin modelo') === modelo);
  const count = activas.length;
  const mesKey = currentMonthKey();
  let hojasMes = 0, totalHist = 0;
  activas.forEach(p => {
    const dm = getDelta(p, mesKey);
    if (dm != null) hojasMes += dm;
    const th = getTotalDelta(p);
    if (th != null) totalHist += th;
  });
  panel.dataset.modelo = modelo;
  panel.innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">${escapeHtml(modelo)}</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;color:var(--text-muted);font-size:12px;">
      <span><strong style="color:var(--text);">${count}</strong> impresora${count === 1 ? '' : 's'}</span>
      <span><strong style="color:var(--text);">${fmtNum(hojasMes)}</strong> hojas este mes</span>
      <span><strong style="color:var(--text);">${fmtNum(totalHist)}</strong> hojas históricas</span>
    </div>
  `;
  panel.hidden = false;
}

function renderListaOk() {
  const mesKey = currentMonthKey();
  const rows = getImpresorasActivas()
    .filter(p => getEstado(getPrinterKey(p)) === 'ok')
    .map(p => ({ printer: p, delta: getDelta(p, mesKey) }))
    .sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1) || (a.printer.area || '').localeCompare(b.printer.area || '', 'es'));

  setCountWithPulse('countOk', rows.length, 'countOk');
  const cont = $('#listaOk');
  if (rows.length === 0) {
    cont.innerHTML = `<div class="empty">Ninguna impresora respondiendo.</div>`;
    return;
  }
  cont.innerHTML = rows.map(r => `
    <div class="collapse-row">
      <div class="collapse-row-main">
        <div class="collapse-row-name">${escapeHtml(r.printer.area || r.printer.ip)}</div>
        <div class="collapse-row-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)}${r.printer.serial ? ' · ' + escapeHtml(r.printer.serial) : ''} · ${escapeHtml(pisoLabel(r.printer.piso))}${r.printer.edificio ? ' · ' + escapeHtml(r.printer.edificio) : ''}</div>
      </div>
      <div class="collapse-row-value">${r.delta != null ? fmtNum(r.delta) : '—'}</div>
    </div>
  `).join('');
}

function renderListaProblemas() {
  const rows = getImpresorasActivas()
    .filter(p => getEstado(getPrinterKey(p)) !== 'ok')
    .map(p => {
      const key = getPrinterKey(p);
      const reg = getReg(key);
      const estado = getEstado(key);
      return { printer: p, estado, ultimaRespuesta: reg.ultimaRespuesta || null, escaneable: esEscanable(p) };
    })
    .sort((a, b) => {
      const ta = a.ultimaRespuesta ? new Date(a.ultimaRespuesta).getTime() : 0;
      const tb = b.ultimaRespuesta ? new Date(b.ultimaRespuesta).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return (a.printer.area || '').localeCompare(b.printer.area || '', 'es');
    });

  setCountWithPulse('countProblemas', rows.length, 'countProblemas');
  const cont = $('#listaProblemas');
  if (rows.length === 0) {
    cont.innerHTML = `<div class="empty">Todas responden ✅</div>`;
    return;
  }
  cont.innerHTML = rows.map(r => {
    const dias = daysSince(r.ultimaRespuesta);
    let since;
    if (!r.escaneable) since = 'No escaneable';
    else if (dias === null) since = 'Nunca respondió';
    else if (dias === 0) since = 'Hoy';
    else if (dias === 1) since = 'Hace 1 día';
    else since = `Hace ${dias} días`;
    let badge;
    if (r.estado === 'usb') badge = `<span class="badge badge-usb">USB</span>`;
    else if (!r.escaneable) badge = `<span class="badge badge-noscan">No scan</span>`;
    else badge = `<span class="badge badge-error">Sin respuesta</span>`;
    return `
      <div class="collapse-row">
        <div class="collapse-row-main">
          <div class="collapse-row-name">${escapeHtml(r.printer.area || r.printer.ip)}</div>
          <div class="collapse-row-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)} · ${escapeHtml(pisoLabel(r.printer.piso))}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          ${badge}
          <div class="collapse-row-since">${since}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --- IMPRESORAS: nivel edificios + nivel edificio ---
function renderImpresoras() {
  // Auto-reset si el edificio seleccionado ya no existe
  if (state.edificioSeleccionado !== null) {
    const existe = state.edificioSeleccionado === '__sin__'
      ? getImpresorasActivas().some(p => !String(p.edificio || '').trim())
      : getImpresorasActivas().some(p => String(p.edificio || '').trim() === state.edificioSeleccionado);
    if (!existe) state.edificioSeleccionado = null;
  }

  const enEdificio = state.edificioSeleccionado !== null;
  $('#edificiosGrid').hidden = enEdificio;
  $('#edificiosExtras').hidden = enEdificio;
  $('#impresorasListWrap').hidden = !enEdificio;
  $('#btnBackToEdificios').hidden = !enEdificio;

  if (enEdificio) {
    const nombre = state.edificioSeleccionado === '__sin__' ? 'Sin edificio' : state.edificioSeleccionado;
    $('#impresorasTitle').textContent = nombre;
    renderImpresorasTabla(state.edificioSeleccionado);
  } else {
    $('#impresorasTitle').textContent = 'Lista de Impresoras';
    renderEdificiosGrid();
  }

  renderImpresorasBorradas();
  updateBackupBadge();
}

function renderEdificiosGrid() {
  const cont = $('#edificiosGrid');
  const edificios = getEdificiosUnicos();
  if (edificios.length === 0) {
    cont.innerHTML = `<div class="empty" style="padding:32px;text-align:center;">No hay impresoras activas.</div>`;
    return;
  }
  cont.innerHTML = edificios.map((e, i) => {
    const esSin = e.key === '__sin__';
    const { icon, color } = getEdificioVisual(i, esSin);
    const displayName = esSin ? 'Sin edificio' : e.nombre;
    const countTxt = `${e.count} impresora${e.count === 1 ? '' : 's'}`;
    return `
      <div class="edificio-card ${esSin ? 'edificio-card-sin' : ''}" data-edificio="${escapeAttr(e.key)}" style="--edificio-color: ${color};">
        <svg class="edificio-card-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        <div class="edificio-card-nombre">${escapeHtml(displayName)}</div>
        <div class="edificio-card-count">${countTxt}</div>
      </div>
    `;
  }).join('');
}

function renderImpresorasTabla(edificioKey) {
  const thead = $('#printersTable thead');
  const tbody = $('#printersTable tbody');
  const arrow = (c) => state.printerSort.col === c ? (state.printerSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const activas = getImpresorasActivas();
  const filtradas = activas.filter(p => {
    const e = String(p.edificio || '').trim();
    return edificioKey === '__sin__' ? !e : e === edificioKey;
  });
  const rows = sortPrinters(filtradas);
  const sumaTotal = rows.reduce((s, p) => s + (getTotalDelta(p) ?? 0), 0);

  thead.innerHTML = `
    <tr>
      <th data-col="ip">IP / Serial${arrow('ip')}</th>
      <th data-col="modelo">Modelo${arrow('modelo')}</th>
      <th data-col="area">Área${arrow('area')}</th>
      <th data-col="piso">Piso${arrow('piso')}</th>
      <th data-col="funcionario">Funcionario${arrow('funcionario')}</th>
      <th data-col="baseline">Contador inicial${arrow('baseline')}</th>
      <th data-col="status">Estado${arrow('status')}</th>
      <th data-col="total" class="text-right th-total">Total${arrow('total')}<br><span class="th-sum" title="Suma de totales de este edificio">Σ ${fmtNum(sumaTotal)}</span></th>
      <th data-col="ultimaRespuesta">Última respuesta${arrow('ultimaRespuesta')}</th>
      <th class="text-right">Acciones</th>
    </tr>
  `;
  thead.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const c = th.dataset.col;
      if (state.printerSort.col === c) state.printerSort.dir = state.printerSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.printerSort.col = c; state.printerSort.dir = defaultDirForColumn(c); }
      renderImpresorasTabla(edificioKey);
    });
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty">📭 Sin impresoras en este edificio.</td></tr>`;
    return;
  }
  const mesKey = currentMonthKey();
  tbody.innerHTML = rows.map(p => {
    const key = getPrinterKey(p);
    const estado = getEstado(key);
    const reg = getReg(key);
    const totalHist = getTotalDelta(p);
    const delta = getDelta(p, mesKey);
    const rawMes = getRaw(p, mesKey);
    const manualMes = getManualDelta(p, mesKey);
    const totalCell = totalHist != null ? fmtNum(totalHist) : '—';
    const escaneable = esEscanable(p);
    let esteMesHtml;
    if (delta != null) {
      const tagManual = manualMes != null ? ' <small style="font-size:10px;color:var(--primary);">manual</small>' : '';
      esteMesHtml = fmtNum(delta) + tagManual;
    } else if (rawMes != null) {
      esteMesHtml = `<span style="color:var(--text-dim);">${fmtNum(rawMes)} <small style="font-size:10px;">(absoluto)</small></span>`;
    } else {
      esteMesHtml = '—';
    }
    let badge;
    if (estado === 'ok') badge = `<span class="badge badge-ok">OK</span>`;
    else if (estado === 'usb') badge = `<span class="badge badge-usb">USB</span>`;
    else if (!escaneable) badge = `<span class="badge badge-noscan" title="No escaneable">No scan</span>`;
    else badge = `<span class="badge badge-error badge-x" title="Sin respuesta" aria-label="Sin respuesta">✕</span>`;
    const b = p.baseline;
    const baselineCell = (b && b.mes && b.raw != null)
      ? `<span style="font-size:12px;"><strong>${fmtNum(b.raw)}</strong><div class="cell-sub">${monthKeyToLabel(b.mes)}</div></span>`
      : `<span style="color:var(--text-dim);font-size:12px;font-style:italic;">Sin dato</span>`;
    const ipDisplay = p.ip === 'USB'
      ? `<strong style="color:var(--text-muted);">USB</strong>`
      : `<a class="ip-link" href="http://${escapeAttr(p.ip)}" target="_blank" rel="noopener">${escapeHtml(p.ip)}</a>`;
    const serialDisplay = p.serial ? `<div class="cell-sub cell-serial-link" title="Ver DNI de la impresora" style="font-family:monospace;font-size:10px;">${escapeHtml(p.serial)}</div>` : '';
    const modeloCell = p.modelo
      ? `<strong style="font-size:12px;">${escapeHtml(p.modelo)}</strong>`
      : `<span style="color:var(--text-dim);font-size:12px;font-style:italic;">—</span>`;
    return `
      <tr class="printer-row" data-row-key="${escapeAttr(key)}">
        <td>${ipDisplay}${serialDisplay}</td>
        <td>${modeloCell}</td>
        <td>${escapeHtml(p.area || '—')}</td>
        <td>${escapeHtml(pisoLabel(p.piso))}</td>
        <td>${escapeHtml(p.funcionario || '—')}</td>
        <td>${baselineCell}</td>
        <td>${badge}</td>
        <td class="text-right"><strong>${totalCell}</strong><div class="cell-sub">Este mes: ${esteMesHtml}</div></td>
        <td>${reg.ultimaRespuesta ? formatDateTime(reg.ultimaRespuesta) : '—'}</td>
        <td class="text-right"><div class="row-actions">
          <button class="icon-btn" title="Editar" data-edit="${escapeAttr(key)}"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          <button class="icon-btn danger" title="Borrar" data-del="${escapeAttr(key)}"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div></td>
      </tr>
    `;
  }).join('');
}

function renderImpresorasBorradas() {
  const rows = getImpresorasBorradas()
    .map(p => ({
      printer: p,
      borradaEn: p.borradaEn ? new Date(p.borradaEn).getTime() : 0,
      ultimaRespuesta: getReg(getPrinterKey(p)).ultimaRespuesta || null
    }))
    .sort((a, b) => b.borradaEn - a.borradaEn);

  setCountWithPulse('countBorradas', rows.length, 'countBorradas');
  const cont = $('#listaBorradas');
  if (!cont) return;
  if (rows.length === 0) {
    cont.innerHTML = `<div class="empty">No hay impresoras borradas.</div>`;
    return;
  }
  cont.innerHTML = rows.map(r => {
    const p = r.printer;
    const key = getPrinterKey(p);
    const dias = daysSince(r.ultimaRespuesta);
    const ultimaTxt = dias === null ? 'Nunca respondió' : dias === 0 ? 'Última respuesta: hoy' : dias === 1 ? 'Última respuesta: hace 1 día' : `Última respuesta: hace ${dias} días`;
    return `
      <div class="collapse-row deleted-row">
        <div class="collapse-row-main">
          <div class="collapse-row-name">${escapeHtml(p.area || p.ip)}</div>
          <div class="collapse-row-meta">${escapeHtml(p.modelo || '—')} · ${escapeHtml(p.ip)}${p.serial ? ' · ' + escapeHtml(p.serial) : ''} · ${escapeHtml(pisoLabel(p.piso))}${p.edificio ? ' · ' + escapeHtml(p.edificio) : ''} · ${escapeHtml(p.funcionario || 'sin funcionario')}</div>
          <div class="collapse-row-meta">Borrada el ${formatDate(p.borradaEn)} · ${ultimaTxt}</div>
        </div>
        <div class="collapse-row-actions">
          <button class="btn btn-secondary btn-sm" data-revive="${escapeAttr(key)}">Revivir</button>
        </div>
      </div>
    `;
  }).join('');
}

// --- BUSCADOR ---
function buscarResultados() {
  const text = normalize(state.search.text);
  const edif = state.search.edificio;
  const piso = state.search.piso;
  const est  = state.search.estado;
  const out = [];
  getImpresorasActivas().forEach(p => {
    if (text) {
      const haystack = [
        normalize(p.ip), normalize(p.serial), normalize(p.area),
        normalize(p.funcionario), normalize(p.modelo),
        normalize(p.piso), normalize(p.edificio), normalize(p.equipamiento), normalize(p.marca)
      ].join(' ');
      if (!haystack.includes(text)) return;
    }
    if (edif && String(p.edificio || '').trim() !== edif) return;
    if (piso && String(p.piso || '').trim() !== piso) return;
    if (est) {
      const estado = getEstado(getPrinterKey(p));
      const escan = esEscanable(p);
      if (est === 'ok' && estado !== 'ok') return;
      if (est === 'usb' && estado !== 'usb') return;
      if (est === 'error' && (estado !== 'error' || !escan)) return;
      if (est === 'noscan' && escan) return;
    }
    out.push(p);
  });
  out.sort((a, b) => (getTotalDelta(b) ?? 0) - (getTotalDelta(a) ?? 0));
  return out;
}

function renderBuscar() {
  const activas = getImpresorasActivas();
  const edificios = [...new Set(activas.map(p => String(p.edificio || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const pisos = [...new Set(activas.map(p => String(p.piso || '').trim()).filter(v => v !== ''))]
    .sort((a, b) => getPisoValue({ piso: a }) - getPisoValue({ piso: b }));

  const edifSel = $('#searchEdificio');
  const pisoSel = $('#searchPiso');
  const curEdif = state.search.edificio;
  const curPiso = state.search.piso;
  edifSel.innerHTML = '<option value="">Todos</option>' + edificios.map(e => `<option value="${escapeAttr(e)}">${escapeHtml(e)}</option>`).join('');
  pisoSel.innerHTML = '<option value="">Todos</option>' + pisos.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(pisoLabel(v))}</option>`).join('');
  if (curEdif && edificios.includes(curEdif)) edifSel.value = curEdif; else { if (curEdif) state.search.edificio = ''; }
  if (curPiso && pisos.includes(curPiso)) pisoSel.value = curPiso; else { if (curPiso) state.search.piso = ''; }
  $('#searchText').value = state.search.text;
  $('#searchEstado').value = state.search.estado || '';

  const hayFiltros = !!(state.search.text || state.search.edificio || state.search.piso || state.search.estado);
  const emptyDiv = $('#searchEmpty');
  const resultsCard = $('#searchResultsCard');

  if (!hayFiltros) {
    emptyDiv.hidden = false;
    resultsCard.hidden = true;
    return;
  }

  const rows = buscarResultados();
  emptyDiv.hidden = true;
  resultsCard.hidden = false;
  $('#searchResultsCount').textContent = `${rows.length} impresora${rows.length === 1 ? '' : 's'}`;
  const tbody = $('#searchResults tbody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Sin resultados.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(p => {
    const key = getPrinterKey(p);
    const estado = getEstado(key);
    const escan = esEscanable(p);
    let badge;
    if (estado === 'ok') badge = `<span class="badge badge-ok">OK</span>`;
    else if (estado === 'usb') badge = `<span class="badge badge-usb">USB</span>`;
    else if (!escan) badge = `<span class="badge badge-noscan">No scan</span>`;
    else badge = `<span class="badge badge-error">Sin respuesta</span>`;
    const total = getTotalDelta(p);
    const totalTxt = total != null ? fmtNum(total) : '—';
    const ipDisplay = p.ip === 'USB'
      ? `<strong style="color:var(--text-muted);">USB</strong>`
      : `<a class="ip-link" href="http://${escapeAttr(p.ip)}" target="_blank" rel="noopener">${escapeHtml(p.ip)}</a>`;
    const serialDisplay = p.serial ? `<div class="cell-sub" style="font-family:monospace;font-size:10px;">${escapeHtml(p.serial)}</div>` : '';
    return `
      <tr class="search-result-row" data-open="${escapeAttr(key)}">
        <td><strong>${escapeHtml(p.modelo || '—')}</strong></td>
        <td>${ipDisplay}${serialDisplay}</td>
        <td>${escapeHtml(p.area || '—')}</td>
        <td>${escapeHtml(pisoLabel(p.piso))}</td>
        <td>${escapeHtml(p.edificio || '—')}</td>
        <td>${escapeHtml(p.funcionario || '—')}</td>
        <td>${badge}</td>
        <td class="text-right"><strong>${totalTxt}</strong></td>
      </tr>
    `;
  }).join('');
}

// --- DETALLE (DNI) ---
function renderDetalle() {
  const cont = $('#detalleContent');
  if (!cont) return;
  const backBtn = $('#btnBackToSearch');
  const labels = {
    buscar: '← Volver al buscador',
    impresoras: '← Volver a la lista',
    historico: '← Volver a históricos'
  };
  if (backBtn) backBtn.textContent = labels[state.detalleFrom] || labels.buscar;
  const key = state.detalleKey;
  const p = state.impresoras.find(x => getPrinterKey(x) === key);
  if (!p) {
    cont.innerHTML = `<div class="card"><div class="empty">No se encontró la impresora.</div></div>`;
    return;
  }
  const estado = getEstado(key);
  const reg = getReg(key);
  const total = getTotalDelta(p);
  const mesKey = currentMonthKey();
  const deltaMes = getDelta(p, mesKey);
  const latest = getLatestRaw(p);
  const escan = esEscanable(p);

  let estadoBadge;
  if (estado === 'ok') estadoBadge = `<span class="badge badge-ok">OK</span>`;
  else if (estado === 'usb') estadoBadge = `<span class="badge badge-usb">USB</span>`;
  else if (!escan) estadoBadge = `<span class="badge badge-noscan">No escaneable</span>`;
  else estadoBadge = `<span class="badge badge-error">Sin respuesta</span>`;

  const modelo = String(p.modelo || '').trim() || 'Sin modelo';
  const b = getBaseline(p);

  const mesesSet = new Set([
    ...Object.keys(reg.meses || {}),
    ...Object.keys(reg.deltasManuales || {})
  ]);
  const meses = [...mesesSet].sort().reverse();
  let histHtml;
  if (meses.length === 0) {
    histHtml = `<div class="empty">Sin lecturas registradas.</div>`;
  } else {
    histHtml = `
      <table class="table table-hist">
        <thead>
          <tr>
            <th>Mes</th>
            <th class="text-right">Contador</th>
            <th class="text-right">Delta</th>
            <th class="text-right">Manual</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${meses.map(m => {
            const raw = getRaw(p, m);
            const d = getDelta(p, m);
            const manual = getManualDelta(p, m);
            const isLeg = esLegacy(m);
            return `
              <tr>
                <td>${monthKeyToLabel(m)}${isLeg ? ' <small style="color:var(--text-dim);">⚠</small>' : ''}</td>
                <td class="text-right ${isLeg ? 'hist-cell-legacy' : ''}">${raw != null ? fmtNum(raw) : '—'}</td>
                <td class="text-right">${d != null ? fmtNum(d) : '—'}</td>
                <td class="text-right">${manual != null ? fmtNum(manual) : '—'}</td>
                <td>${isLeg ? '<span style="color:var(--text-dim);font-style:italic;">Legacy</span>' : '<span style="color:var(--success);font-weight:600;">Confiables</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  const escanTxt = escan ? 'Sí' : 'No';
  const esUSB = (p.ip || '').toUpperCase() === 'USB';

  cont.innerHTML = `
    <div class="dni-card">
      <div class="dni-grid">
        <div class="dni-foto">
          <div class="dni-foto-svg">
            <svg viewBox="0 0 120 120" width="100%">
              <rect x="20" y="40" width="80" height="50" rx="6" fill="currentColor" opacity="0.15"/>
              <rect x="30" y="26" width="60" height="16" rx="3" fill="currentColor" opacity="0.3"/>
              <rect x="35" y="88" width="50" height="10" rx="2" fill="currentColor" opacity="0.3"/>
              <rect x="35" y="55" width="50" height="25" rx="2" fill="white" opacity="0.9"/>
              <circle cx="90" cy="50" r="3" fill="${estado === 'ok' ? '#10b981' : '#f43f5e'}"/>
            </svg>
          </div>
          <div class="dni-modelo-label">${escapeHtml(modelo)}</div>
          <div class="dni-estado">${estadoBadge}</div>
          <button class="btn btn-secondary btn-sm" data-edit-dni="${escapeAttr(key)}">✎ Editar</button>
        </div>

        <div class="dni-datos">
          <h1>${escapeHtml(p.area || p.ip)}</h1>
          <div class="dni-sub">${escapeHtml(p.ip || '—')}${p.serial ? ' · ' + escapeHtml(p.serial) : ''}</div>

          <div class="dni-info-grid">
            <div class="dni-info-item">
              <div class="dni-info-label">Modelo</div>
              <div class="dni-info-value">${escapeHtml(modelo)}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Marca</div>
              <div class="dni-info-value">${escapeHtml(p.marca || '—')}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Equipamiento</div>
              <div class="dni-info-value">${escapeHtml(p.equipamiento || '—')}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Funcionario</div>
              <div class="dni-info-value">${escapeHtml(p.funcionario || '—')}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Piso</div>
              <div class="dni-info-value">${escapeHtml(pisoLabel(p.piso))}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Edificio</div>
              <div class="dni-info-value">${escapeHtml(p.edificio || '—')}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Escaneable</div>
              <div class="dni-info-value">${escanTxt}${esUSB ? ' <small style="color:var(--text-dim);">(USB)</small>' : ''}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Contador inicial</div>
              <div class="dni-info-value">${b ? `${fmtNum(b.raw)} <small style="color:var(--text-muted);">(${monthKeyToLabel(b.mes)})</small>` : '—'}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Última respuesta</div>
              <div class="dni-info-value">${reg.ultimaRespuesta ? formatDateTime(reg.ultimaRespuesta) : '—'}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Hojas este mes</div>
              <div class="dni-info-value">${deltaMes != null ? fmtNum(deltaMes) : '—'}</div>
            </div>
            <div class="dni-info-item dni-info-item-total">
              <div class="dni-info-label">Total histórico</div>
              <div class="dni-info-value">${total != null ? fmtNum(total) : '—'}</div>
            </div>
            <div class="dni-info-item">
              <div class="dni-info-label">Última lectura</div>
              <div class="dni-info-value">${latest ? `${fmtNum(latest.raw)} <small style="color:var(--text-muted);">(${monthKeyToLabel(latest.mes)})</small>` : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dni-historico">
        <h2>Histórico mes a mes</h2>
        <div class="table-wrap">${histHtml}</div>
      </div>
    </div>
  `;
}

// --- HISTORICO ---
function renderHistorico() {
  const activas = getImpresorasActivas();
  const mesesSet = new Set();
  activas.forEach(p => {
    const reg = getReg(getPrinterKey(p));
    Object.keys(reg.meses || {}).forEach(m => mesesSet.add(m));
    Object.keys(reg.deltasManuales || {}).forEach(m => mesesSet.add(m));
  });
  const meses = [...mesesSet].sort().reverse();
  let rows = activas.map(p => ({ printer: p, total: getTotalDelta(p) }));
  const { col, dir } = state.histSort;
  rows.sort((a, b) => {
    let va, vb;
    if (col === 'nombre') { va = a.printer.area || ''; vb = b.printer.area || ''; }
    else if (col === 'total') { va = a.total ?? -1; vb = b.total ?? -1; }
    else { va = getDelta(a.printer, col) ?? -1; vb = getDelta(b.printer, col) ?? -1; }
    if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return dir === 'asc' ? va - vb : vb - va;
  });
  const thead = $('#histTable thead');
  const arrow = (c) => state.histSort.col === c ? (state.histSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  thead.innerHTML = `
    <tr>
      <th data-col="nombre">Impresora${arrow('nombre')}</th>
      ${meses.map(m => {
        const isLeg = esLegacy(m);
        return `<th data-col="${m}" class="text-right ${isLeg ? 'hist-col-legacy' : ''}">${monthKeyToLabel(m)}${isLeg ? ' ⚠' : ''}${arrow(m)}</th>`;
      }).join('')}
      <th data-col="total" class="text-right">Total${arrow('total')}</th>
    </tr>
  `;
  const tbody = $('#histTable tbody');
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="${meses.length + 2}" class="empty">Sin datos.</td></tr>`; return; }
  tbody.innerHTML = rows.map(r => {
    return `
      <tr>
        <td><strong>${escapeHtml(r.printer.area || r.printer.ip)}</strong><div class="top-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)} · <span class="cell-serial-link" data-open="${escapeAttr(getPrinterKey(r.printer))}" title="Ver DNI de la impresora">${escapeHtml(r.printer.serial || '—')}</span></div></td>
        ${meses.map(m => {
          if (esLegacy(m)) {
            const raw = getRaw(r.printer, m);
            return `<td class="text-right hist-cell-legacy">${raw != null ? fmtNum(raw) : '—'}</td>`;
          }
          const d = getDelta(r.printer, m);
          const isManual = getManualDelta(r.printer, m) != null;
          const tag = isManual ? ' <small style="font-size:9px;color:var(--primary);">M</small>' : '';
          return `<td class="text-right">${d != null ? fmtNum(d) + tag : '—'}</td>`;
        }).join('')}
        <td class="text-right"><strong>${r.total != null ? fmtNum(r.total) : '—'}</strong></td>
      </tr>
    `;
  }).join('');
  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const c = th.dataset.col;
      if (state.histSort.col === c) state.histSort.dir = state.histSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.histSort.col = c; state.histSort.dir = 'desc'; }
      renderHistorico();
    });
  });
}

// --- MODAL ---
function renderBaseline(printer) {
  const b = getBaseline(printer);
  const lockedDiv = $('#baselineLocked');
  const editDiv = $('#baselineEdit');
  if (b) {
    $('#baselineValue').textContent = `${fmtNum(b.raw)} · ${monthKeyToLabel(b.mes)}`;
    lockedDiv.hidden = false;
    editDiv.hidden = true;
  } else {
    lockedDiv.hidden = true;
    editDiv.hidden = false;
    const hint = $('#baselineEditHint');
    if (hint) hint.textContent = 'Todavía no tiene baseline. Cargalo la primera vez que tengas el dato.';
    $('#inputBaselineMes').value = prevMonthKey();
    $('#inputBaselineRaw').value = '';
  }
}

function desbloquearBaseline() {
  const ok = confirm(
    '¿Desbloquear el contador inicial?\n\n' +
    'Si lo cambiás, los deltas de todos los meses se recalculan. ' +
    'Esto normalmente NO es necesario y puede alterar estadísticas viejas.\n\n' +
    '¿Continuar?'
  );
  if (!ok) return;
  const p = getPrinterByKey(state.editingKey);
  const b = getBaseline(p);
  $('#baselineLocked').hidden = true;
  $('#baselineEdit').hidden = false;
  const hint = $('#baselineEditHint');
  if (hint) hint.textContent = '⚠ Estás editando el baseline existente. Guardá con cuidado.';
  if (b) {
    $('#inputBaselineMes').value = b.mes;
    $('#inputBaselineRaw').value = b.raw;
  }
}

function renderLecturaActual(printer) {
  const key = getPrinterKey(printer);
  const mesKey = currentMonthKey();
  const mesPrev = prevMonthKey();
  const estado = getEstado(key);
  const escan = esEscanable(printer);
  const rawMes = getRaw(printer, mesKey);
  const rawPrev = getRaw(printer, mesPrev);

  $('#lecturaMesLabel').textContent = monthKeyToLabel(mesKey);
  $('#lecturaAnteriorLabel').textContent = monthKeyToLabel(mesPrev);

  const esAuto = escan && estado === 'ok';
  if (esAuto) {
    $('#lecturaActualAuto').hidden = false;
    $('#lecturaActualManual').hidden = true;
    $('#inputLecturaAuto').value = rawMes != null ? fmtNum(rawMes) : '—';
  } else {
    $('#lecturaActualAuto').hidden = true;
    $('#lecturaActualManual').hidden = false;
    const inp = $('#inputLecturaManual');
    inp.value = rawMes != null ? rawMes : '';
  }

  $('#lecturaAnteriorSection').hidden = true;
  $('#btnMostrarMesAnterior').hidden = false;
  const inpPrev = $('#inputLecturaAnterior');
  inpPrev.value = rawPrev != null ? rawPrev : '';
}

function openModal(key = null, edificioDefault = null) {
  if (!state.isEditor) { showToast('⚠ Estás en modo visualización.', 'error'); return; }
  state.editingKey = key;
  const modal = $('#modal');
  const title = $('#modalTitle');
  const form = $('#printerForm');
  form.reset();
  if (key) {
    const p = getPrinterByKey(key);
    title.textContent = 'Editar impresora';
    $('#inputIp').value = p.ip || '';
    $('#inputIp').readOnly = true;
    $('#inputSerial').value = p.serial || '';
    $('#inputSerial').readOnly = true;
    $('#inputModelo').value = p.modelo || '';
    $('#inputArea').value = p.area || '';
    $('#inputFuncionario').value = p.funcionario || '';
    $('#inputPiso').value = p.piso ?? '';
    $('#inputEdificio').value = p.edificio || '';
    const esUSB = (p.ip || '').toUpperCase() === 'USB';
    $('#inputEscanear').checked = !esUSB && (p.escanear !== false);
    $('#inputEscanear').disabled = esUSB;

    renderBaseline(p);
    renderLecturaActual(p);
  } else {
    title.textContent = 'Agregar impresora';
    $('#inputIp').readOnly = false;
    $('#inputSerial').readOnly = false;
    $('#inputModelo').value = '';
    $('#inputArea').value = '';
    $('#inputFuncionario').value = '';
    $('#inputPiso').value = '';
    $('#inputEdificio').value = (edificioDefault && edificioDefault !== '__sin__') ? edificioDefault : '';
    $('#inputEscanear').checked = true;
    $('#inputEscanear').disabled = false;

    $('#baselineLocked').hidden = true;
    $('#baselineEdit').hidden = false;
    const bHint = $('#baselineEditHint');
    if (bHint) bHint.textContent = 'Cargalo si lo tenés. Si no, el primer scan va a servir de punto de partida.';
    $('#inputBaselineMes').value = prevMonthKey();
    $('#inputBaselineRaw').value = '';

    $('#lecturaMesLabel').textContent = monthKeyToLabel(currentMonthKey());
    $('#lecturaAnteriorLabel').textContent = monthKeyToLabel(prevMonthKey());
    $('#lecturaActualAuto').hidden = true;
    $('#lecturaActualManual').hidden = false;
    $('#inputLecturaManual').value = '';
    $('#lecturaAnteriorSection').hidden = true;
    $('#btnMostrarMesAnterior').hidden = false;
    $('#inputLecturaAnterior').value = '';
  }
  modal.hidden = false;
  setTimeout(() => $('#inputIp').focus(), 50);
}
function closeModal() {
  $('#modal').hidden = true;
  state.editingKey = null;
}

async function savePrinter(e) {
  e.preventDefault();
  const isEdit = !!state.editingKey;
  let ip = $('#inputIp').value.trim().toLowerCase();
  if (ip === 'usb') ip = 'USB';
  const serial = $('#inputSerial').value.trim();
  const modelo = $('#inputModelo').value.trim();
  const area   = $('#inputArea').value.trim();
  const funcionario = $('#inputFuncionario').value.trim();
  const piso   = $('#inputPiso').value.trim();
  const edificio = $('#inputEdificio').value.trim();
  const escanear = $('#inputEscanear').checked;

  if (!ip) { alert('IP vacía.'); return; }
  if (!isValidHost(ip)) { alert('IP inválida.'); return; }
  if (!area) { alert('Área vacía.'); return; }

  let baselineNuevo = null;
  const baselineEditVisible = !$('#baselineEdit').hidden;
  if (baselineEditVisible) {
    const bMes = $('#inputBaselineMes').value.trim();
    const bRaw = $('#inputBaselineRaw').value.trim();
    if (bMes && bRaw) {
      const rawNum = parseInt(bRaw, 10);
      if (isNaN(rawNum) || rawNum < 0) { alert('Valor de baseline inválido.'); return; }
      baselineNuevo = { mes: bMes, raw: rawNum };
    } else if (bMes || bRaw) {
      alert('Completá mes Y valor del baseline, o dejá ambos vacíos.');
      return;
    }
  }

  let lecturaActualNueva = null;
  if (!$('#lecturaActualManual').hidden) {
    const val = $('#inputLecturaManual').value.trim();
    if (val !== '') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0) lecturaActualNueva = n;
    }
  }

  let lecturaAnteriorNueva = null;
  if (!$('#lecturaAnteriorSection').hidden) {
    const val = $('#inputLecturaAnterior').value.trim();
    if (val !== '') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0) lecturaAnteriorNueva = n;
    }
  }

  if (isEdit) {
    const p = state.impresoras.find(x => getPrinterKey(x) === state.editingKey);
    if (p) {
      p.modelo = modelo;
      p.area = area;
      p.funcionario = funcionario;
      p.piso = piso;
      p.edificio = edificio;
      const esUSB = ip.toUpperCase() === 'USB';
      p.escanear = esUSB ? false : !!escanear;
      if (baselineNuevo !== null) p.baseline = baselineNuevo;
    }

    if (lecturaActualNueva !== null || lecturaAnteriorNueva !== null) {
      const reg = getReg(state.editingKey);
      const mesesFinales = { ...reg.meses };
      const deltasFinales = { ...reg.deltasManuales };
      const mesKey = currentMonthKey();
      const mesPrev = prevMonthKey();
      if (lecturaActualNueva !== null) mesesFinales[mesKey] = lecturaActualNueva;
      if (lecturaAnteriorNueva !== null) mesesFinales[mesPrev] = lecturaAnteriorNueva;
      const savedHist = await persistHistorico(state.editingKey, mesesFinales, deltasFinales);
      if (savedHist) showToast('✓ Histórico actualizado');
    }
  } else {
    const newKey = serial || ip;
    const existing = state.impresoras.find(x => getPrinterKey(x) === newKey);
    if (existing) {
      if (isBorrada(existing)) {
        alert(`Ya existe una impresora con ese serial/IP, pero está en "Impresoras borradas".\nRevivila desde la sección "Impresoras borradas" en lugar de crear una nueva.`);
      } else {
        alert('Ya existe una impresora con ese serial/IP.');
      }
      return;
    }
    const esUSB = ip.toUpperCase() === 'USB';
    const nueva = {
      serial, ip, area, funcionario, piso,
      modelo, edificio,
      escanear: esUSB ? false : !!escanear
    };
    if (baselineNuevo) nueva.baseline = baselineNuevo;
    state.impresoras.push(nueva);
    if (!state.registros[newKey]) {
      state.registros[newKey] = { meses: {}, deltasManuales: {}, ultimoIntento: null, ultimaRespuesta: null, ultimoEstado: 'error' };
    }
    if (lecturaActualNueva !== null || lecturaAnteriorNueva !== null) {
      const reg = state.registros[newKey];
      const mesKey = currentMonthKey();
      const mesPrev = prevMonthKey();
      const mesesFinales = { ...reg.meses };
      if (lecturaActualNueva !== null) mesesFinales[mesKey] = lecturaActualNueva;
      if (lecturaAnteriorNueva !== null) mesesFinales[mesPrev] = lecturaAnteriorNueva;
      await persistHistorico(newKey, mesesFinales, {});
    }
  }

  const saved = await persistPrinters();
  if (!saved) return;

  if (isEdit) {
    closeModal();
    render();
    showToast(`✓ ${ip} actualizada`);
  } else {
    render();
    showToast(`✓ ${ip} agregada.`);
    closeModal();
  }
}

async function deletePrinter(key) {
  if (!state.isEditor) { showToast('⚠ Estás en modo visualización.', 'error'); return; }
  const p = state.impresoras.find(x => getPrinterKey(x) === key);
  if (!p) return;
  const label = p.serial ? `${p.ip} (${p.serial})` : key;
  const ok = confirm(
    `¿Mover la impresora ${label} a "Impresoras borradas"?\n\n` +
    `• Dejará de contar para todos los totales, tops y estadísticas.\n` +
    `• Sus datos históricos se conservan.\n` +
    `• Podés revivirla cuando quieras desde la sección "Impresoras borradas".\n\n` +
    `¿Continuar?`
  );
  if (!ok) return;
  p.borradaEn = new Date().toISOString();
  const saved = await persistPrinters();
  if (!saved) return;
  if (state.view === 'detalle' && state.detalleKey === key) switchView('impresoras');
  else render();
  showToast(`✓ ${label} movida a borradas`);
}

async function revivePrinter(key) {
  if (!state.isEditor) { showToast('⚠ Estás en modo visualización.', 'error'); return; }
  const p = state.impresoras.find(x => getPrinterKey(x) === key);
  if (!p) return;
  const ok = confirm(`¿Revivir la impresora ${p.ip}?\n\nVolverá a contar para los totales, tops y estadísticas.`);
  if (!ok) return;
  delete p.borradaEn;
  const saved = await persistPrinters();
  if (!saved) return;
  render();
  showToast(`✓ ${p.ip} revivida`);
}

// --- EXPORT REPORT (PDF) ---
function buildReportRows() {
  const mes = currentMonthKey();
  const rows = getImpresorasActivas().map(p => {
    const delta = getDelta(p, mes);
    const totalHist = getTotalDelta(p);
    return { printer: p, delta, totalHist };
  });
  rows.sort((a, b) => {
    const da = a.delta ?? -1;
    const db = b.delta ?? -1;
    if (da !== db) return db - da;
    return (a.printer.area || '').localeCompare(b.printer.area || '', 'es', { numeric: true });
  });
  return rows;
}

function buildReportContext() {
  const mes = currentMonthKey();
  const mesPrev = prevMonthKey();
  const rows = buildReportRows();
  const totalHojasMes = rows.reduce((s, r) => s + (r.delta ?? 0), 0);
  const hoy = new Date();
  const hoyFormateado = hoy.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return {
    mesKey: mes,
    mesLabel: monthKeyToLabel(mes),
    mesAnteriorLabel: monthKeyToLabel(mesPrev),
    hoyFormateado,
    totalHojasMes,
    rows
  };
}

function exportarPDF() {
  if (getImpresorasActivas().length === 0) { showToast('⚠ Sin impresoras para exportar', 'error'); return; }

  const prev = document.getElementById('pdf-report');
  if (prev) prev.remove();

  const ctx = buildReportContext();

  const filasHtml = ctx.rows.map(r => {
    const p = r.printer;
    const deltaTxt = r.delta != null ? fmtNum(r.delta) : '—';
    const totalTxt = r.totalHist != null ? fmtNum(r.totalHist) : '—';
    return `
      <tr>
        <td style="font-family:monospace;font-size:9pt;">${escapeHtml(p.serial || '—')}</td>
        <td>${escapeHtml(p.ip || '—')}</td>
        <td>${escapeHtml(p.modelo || '—')}</td>
        <td>${escapeHtml(p.area || '—')}</td>
        <td>${escapeHtml(pisoLabel(p.piso))}</td>
        <td class="num"><strong>${deltaTxt}</strong></td>
        <td class="num">${totalTxt}</td>
      </tr>
    `;
  }).join('');

  const cont = document.createElement('div');
  cont.id = 'pdf-report';
  cont.innerHTML = `
    <h1>Reporte de consumo de impresoras</h1>
    <p class="pdf-subtitle">Emitido el ${ctx.hoyFormateado}</p>
    <div class="pdf-summary">
      <strong>Información al día ${ctx.hoyFormateado}:</strong>
      desde la última comprobación del mes anterior
      (<strong>${ctx.mesAnteriorLabel}</strong>) a la fecha,
      se imprimieron <strong>${fmtNum(ctx.totalHojasMes)}</strong> hojas en total.
    </div>
    <table>
      <thead>
        <tr>
          <th>Serial</th>
          <th>IP</th>
          <th>Modelo</th>
          <th>Área</th>
          <th>Piso</th>
          <th class="num">Hojas ${ctx.mesLabel}</th>
          <th class="num">Total histórico</th>
        </tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>
    <div class="pdf-footer">
      La columna "Hojas ${ctx.mesLabel}" corresponde a la diferencia entre el último contador
      del mes anterior (o el más reciente disponible) y la lectura actual de cada impresora.
      Las impresoras sin lectura reciente se muestran con "—" y no suman al total.
    </div>
  `;
  document.body.appendChild(cont);
  document.body.classList.add('printing-pdf');

  const tituloOriginal = document.title;
  document.title = `Hojas ${ctx.mesLabel} — Deep presoras`;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('printing-pdf');
    cont.remove();
    document.title = tituloOriginal;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 120000);

  try {
    window.print();
  } catch (e) {
    cleanup();
    showToast(`⚠ Error al imprimir: ${e.message}`, 'error');
  }
}

function csvCell(val) {
  const s = String(val ?? '');
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// --- EXPORTAR DASHBOARD (HTML / PDF) ---
// Construye el HTML standalone del dashboard. Reusable por el Compartir (descarga)
// y por "Exportar PDF → Dashboard completo" (abre pestaña + print).
function buildDashboardHTML() {
  const activas = getImpresorasActivas();

  const hoy = new Date();
  const fecha = hoy.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = hoy.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const ok = activas.filter(p => getEstado(getPrinterKey(p)) === 'ok').length;
  const err = activas.length - ok;
  const totalHojas = getTotalHojas();
  const mesKey = currentMonthKey();
  const hojasMes = getHojasMes(mesKey);
  const topPrinter = getTopPrinter();
  const peorMes = getPeorMes();
  const pisoTop = getPisoTop();

  const colors = {
    primary: '#6366f1', primary2: '#8b5cf6',
    success: '#10b981', danger: '#f43f5e',
    text: '#0f172a', textMuted: '#64748b', textDim: '#94a3b8',
    surface: '#ffffff', surface2: '#f8fafc', border: '#e2e8f0',
    palette: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#84cc16', '#a855f7']
  };

  // Donut estado
  const donutEstadoTotal = ok + err;
  const R = 40, C = 2 * Math.PI * R;
  const okLen = donutEstadoTotal > 0 ? (ok / donutEstadoTotal) * C : 0;
  const errLen = donutEstadoTotal > 0 ? (err / donutEstadoTotal) * C : 0;
  const donutEstadoSvg = `
    <svg viewBox="0 0 100 100" class="donut-svg">
      <circle cx="50" cy="50" r="${R}" stroke="${colors.surface2}" stroke-width="14" fill="none"></circle>
      ${ok > 0 ? `<circle cx="50" cy="50" r="${R}" stroke="${colors.success}" stroke-width="14" fill="none" stroke-dasharray="${okLen} ${C}" stroke-dashoffset="0"></circle>` : ''}
      ${err > 0 ? `<circle cx="50" cy="50" r="${R}" stroke="${colors.danger}" stroke-width="14" fill="none" stroke-dasharray="${errLen} ${C}" stroke-dashoffset="${-okLen}"></circle>` : ''}
    </svg>
    <div class="donut-center">
      <div class="donut-number">${ok}</div>
      <div class="donut-label">responden</div>
    </div>
  `;

  // Donut modelos
  const gruposModelo = {};
  activas.forEach(p => {
    const m = String(p.modelo || '').trim() || 'Sin modelo';
    gruposModelo[m] = (gruposModelo[m] || 0) + 1;
  });
  const entriesModelo = Object.entries(gruposModelo).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const topModelos = entriesModelo.slice(0, 10);
  const restoModelos = entriesModelo.slice(10);
  const dataModelos = [];
  topModelos.forEach(([l, n], i) => dataModelos.push({ label: l, n, color: colors.palette[i % colors.palette.length], otros: false }));
  if (restoModelos.length > 0) {
    dataModelos.push({ label: `Otros (${restoModelos.length})`, n: restoModelos.reduce((s, [, n]) => s + n, 0), color: colors.textDim, otros: true });
  }
  const totalModelos = dataModelos.reduce((s, d) => s + d.n, 0) || 1;
  let accM = 0;
  const segmentosModelo = dataModelos.map(d => {
    const len = (d.n / totalModelos) * C;
    const offset = -accM;
    accM += len;
    return `<circle cx="50" cy="50" r="${R}" stroke="${d.color}" stroke-width="14" fill="none" stroke-dasharray="${len} ${C}" stroke-dashoffset="${offset}"></circle>`;
  }).join('');
  const donutModelosSvg = `
    <svg viewBox="0 0 100 100" class="donut-svg">
      <circle cx="50" cy="50" r="${R}" stroke="${colors.surface2}" stroke-width="14" fill="none"></circle>
      ${segmentosModelo}
    </svg>
  `;
  const legendModelosHtml = dataModelos.map(d => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${d.color}"></span>
      <span class="legend-label">${escapeHtml(d.label)}</span>
      <span class="legend-value">${d.n}</span>
    </div>
  `).join('');

  // Top 5 mes
  const topMes = activas
    .map(p => ({ printer: p, value: getDelta(p, mesKey) ?? 0 }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  const maxMes = topMes[0]?.value || 1;
  const topMesHtml = topMes.length === 0
    ? `<div class="empty">Sin datos de este mes todavía</div>`
    : topMes.map(r => `
      <div class="top-row">
        <div class="top-header"><span class="top-name">${escapeHtml(r.printer.area || r.printer.ip)}</span><span class="top-value">${fmtNum(r.value)}</span></div>
        <div class="top-bar"><div class="top-fill" style="width:${(r.value / maxMes * 100).toFixed(1)}%"></div></div>
        <div class="top-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)} · ${escapeHtml(r.printer.funcionario || '')}</div>
      </div>
    `).join('');

  // Top 5 histórico
  const topHist = activas
    .map(p => ({ printer: p, value: getTotalDelta(p) ?? 0 }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  const maxHist = topHist[0]?.value || 1;
  const topHistHtml = topHist.length === 0
    ? `<div class="empty">Sin datos históricos</div>`
    : topHist.map(r => `
      <div class="top-row">
        <div class="top-header"><span class="top-name">${escapeHtml(r.printer.area || r.printer.ip)}</span><span class="top-value">${fmtNum(r.value)}</span></div>
        <div class="top-bar"><div class="top-fill" style="width:${(r.value / maxHist * 100).toFixed(1)}%"></div></div>
        <div class="top-meta">${escapeHtml(r.printer.modelo || '—')} · ${escapeHtml(r.printer.ip)} · ${escapeHtml(r.printer.funcionario || '')}</div>
      </div>
    `).join('');

  // Gráfico por piso
  const gruposPiso = {};
  activas.forEach(p => {
    const val = getPisoValue(p);
    const label = val === 999 ? 'Sin piso' : pisoLabel(p.piso);
    if (!gruposPiso[val]) gruposPiso[val] = { label, count: 0 };
    gruposPiso[val].count++;
  });
  const entriesPiso = Object.entries(gruposPiso).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
  const maxPiso = Math.max(...entriesPiso.map(([, v]) => v.count), 1);
  const pisoHtml = entriesPiso.map(([, v]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(v.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v.count / maxPiso * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${v.count}</div>
    </div>
  `).join('');

  // Gráfico por funcionario (conteo)
  const gruposFunc = {};
  activas.forEach(p => {
    const f = (p.funcionario || '').trim() || '(Sin asignar)';
    gruposFunc[f] = (gruposFunc[f] || 0) + 1;
  });
  const entriesFunc = Object.entries(gruposFunc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const topFunc = entriesFunc.slice(0, 10);
  const restoFunc = entriesFunc.slice(10);
  const maxFunc = Math.max(...topFunc.map(([, n]) => n), restoFunc.length ? restoFunc.reduce((s, [, n]) => s + n, 0) : 0, 1);
  let funcHtml = topFunc.map(([f, n]) => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(f)}">${escapeHtml(f)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(n / maxFunc * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${n}</div>
    </div>
  `).join('');
  if (restoFunc.length > 0) {
    const rc = restoFunc.reduce((s, [, n]) => s + n, 0);
    funcHtml += `
      <div class="bar-row bar-row-otros">
        <div class="bar-label">Otros (${restoFunc.length})</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(rc / maxFunc * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${rc}</div>
      </div>
    `;
  }

  // Hojas por funcionario (rolling 3m)
  const ult3 = getUltimosMeses(3);
  const gruposHojasFunc = {};
  activas.forEach(p => {
    const f = (p.funcionario || '').trim() || '(Sin asignar)';
    if (!gruposHojasFunc[f]) gruposHojasFunc[f] = 0;
    ult3.forEach(m => {
      const d = getDelta(p, m);
      if (d != null) gruposHojasFunc[f] += d;
    });
  });
  const entriesHojasFunc = Object.entries(gruposHojasFunc).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const topHojasFunc = entriesHojasFunc.slice(0, 5);
  const restoHojasFunc = entriesHojasFunc.slice(5);
  const maxHojasFunc = Math.max(...topHojasFunc.map(([, n]) => n), restoHojasFunc.length ? restoHojasFunc.reduce((s, [, n]) => s + n, 0) : 0, 1);
  let hojasFuncHtml = topHojasFunc.map(([f, n]) => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(f)}">${escapeHtml(f)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(n / maxHojasFunc * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${fmtNum(n)}</div>
    </div>
  `).join('');
  if (restoHojasFunc.length > 0) {
    const rc = restoHojasFunc.reduce((s, [, n]) => s + n, 0);
    hojasFuncHtml += `
      <div class="bar-row bar-row-otros">
        <div class="bar-label">Otros (${restoHojasFunc.length})</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(rc / maxHojasFunc * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${fmtNum(rc)}</div>
      </div>
    `;
  }

  // Tabla completa
  const tablaRows = [...activas].sort((a, b) => (getTotalDelta(b) ?? 0) - (getTotalDelta(a) ?? 0));
  const tablaHtml = tablaRows.map(p => {
    const total = getTotalDelta(p);
    return `
      <tr>
        <td>${escapeHtml(p.area || '—')}</td>
        <td><strong>${escapeHtml(p.modelo || '—')}</strong></td>
        <td>${escapeHtml(p.ip || '—')}</td>
        <td>${escapeHtml(pisoLabel(p.piso))}</td>
        <td>${escapeHtml(p.funcionario || '—')}</td>
        <td class="text-right"><strong>${total != null ? fmtNum(total) : '—'}</strong></td>
      </tr>
    `;
  }).join('');

  // Sub-texto extendido del "Hojas este mes"
  const proyExp = proyectarMes(mesKey);
  const proyTxtExp = proyExp ? ` · Proy: ~${fmtNum(proyExp.proyectado)}` : '';
  let mesSubTxt = `${monthKeyToLabel(mesKey)} (parcial)${proyTxtExp}`;
  const mesPrevExp = prevMonthKey();
  const hojasMesPrevExp = getHojasMes(mesPrevExp);
  if (hojasMesPrevExp > 0 && proyExp) {
    const pctExp = ((proyExp.proyectado - hojasMesPrevExp) / hojasMesPrevExp * 100).toFixed(0);
    const arrowExp = pctExp > 0 ? '▲' : (pctExp < 0 ? '▼' : '=');
    mesSubTxt += ` · ${arrowExp} ${Math.abs(pctExp)}% vs ${monthKeyToLabel(mesPrevExp)}`;
  }

  // Tendencia mensual
  const mesesTendSet = new Set();
  activas.forEach(p => {
    const reg = getReg(getPrinterKey(p));
    Object.keys(reg.meses || {}).forEach(m => { if (!esLegacy(m)) mesesTendSet.add(m); });
  });
  const mesesTend = [...mesesTendSet].sort().slice(-6);
  const tendenciaData = mesesTend.map(m => {
    const proy = proyectarMes(m);
    if (proy) return { mes: m, total: proy.proyectado, real: proy.total, esProy: true };
    let total = 0;
    activas.forEach(p => {
      const d = getDelta(p, m);
      if (d != null) total += d;
    });
    return { mes: m, total, real: total, esProy: false };
  });
  const maxTend = Math.max(...tendenciaData.map(d => d.total), 1);
  const tendenciaHtml = tendenciaData.length === 0
    ? `<div class="empty">Todavía no hay datos mensuales.</div>`
    : tendenciaData.map((d, i) => {
      const prev = i > 0 ? tendenciaData[i - 1].total : null;
      let trendTxt = '';
      if (prev != null && prev > 0) {
        const pct = ((d.total - prev) / prev * 100).toFixed(0);
        const color = pct > 0 ? colors.danger : (pct < 0 ? colors.success : colors.textMuted);
        const arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '=');
        trendTxt = `<span style="color:${color};font-size:11px;margin-left:8px;">${arrow} ${Math.abs(pct)}%</span>`;
      }
      const label = monthKeyToLabel(d.mes) + (d.esProy ? ' (proy.)' : '');
      const value = fmtNum(d.total) + (d.esProy ? `<div style="font-size:10px;color:${colors.textDim};font-weight:400;">hasta hoy: ${fmtNum(d.real)}</div>` : '');
      return `<div class="bar-row">
        <div class="bar-label">${escapeHtml(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.total / maxTend * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${value}${trendTxt}</div>
      </div>`;
    }).join('');

  // Impresoras y consumo por edificio
  const gruposEdif = {};
  activas.forEach(p => {
    const e = String(p.edificio || '').trim();
    const key = e || '__sin__';
    const label = e || 'Sin edificio';
    if (!gruposEdif[key]) gruposEdif[key] = { key, label, count: 0, total: 0 };
    gruposEdif[key].count++;
    const t = getTotalDelta(p);
    if (t != null) gruposEdif[key].total += t;
  });
  const edifArr = Object.values(gruposEdif).sort((a, b) => {
    if (a.key === '__sin__') return -1;
    if (b.key === '__sin__') return 1;
    return b.count - a.count || a.label.localeCompare(b.label, 'es');
  });
  const maxEdif = Math.max(...edifArr.map(g => g.count), 1);
  const porEdificioHtml = edifArr.length === 0
    ? `<div class="empty">Sin impresoras.</div>`
    : edifArr.map(g => `<div class="bar-row">
        <div class="bar-label" title="${escapeAttr(g.label)}">${escapeHtml(g.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(g.count / maxEdif * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${g.count}</div>
      </div>`).join('');

  const edifCons = edifArr.filter(g => g.total > 0).sort((a, b) => b.total - a.total);
  const maxEdifCons = Math.max(...edifCons.map(g => g.total), 1);
  const consumoEdificioHtml = edifCons.length === 0
    ? `<div class="empty">Sin consumo registrado.</div>`
    : edifCons.map(g => `<div class="bar-row">
        <div class="bar-label" title="${escapeAttr(g.label)}">${escapeHtml(g.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(g.total / maxEdifCons * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${fmtNum(g.total)}</div>
      </div>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Deep presoras — Reporte ${fecha}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { height: 100%; background: #f1f5f9; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    min-height: 100%;
    position: relative;
    padding: 32px 24px 48px;
  }
  body::before {
    content: '';
    position: fixed;
    inset: -30%;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.15), transparent 45%),
      radial-gradient(circle at 80% 70%, rgba(99, 102, 241, 0.12), transparent 45%),
      radial-gradient(circle at 50% 50%, rgba(236, 72, 153, 0.06), transparent 55%);
    filter: blur(60px);
  }
  .report { max-width: 1200px; margin: 0 auto; }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .kraken {
    width: 42px; height: 42px;
    padding: 8px;
    border-radius: 11px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #fff;
    box-shadow: 0 4px 14px rgba(99, 102, 241, .35);
  }
  .brand-title { font-weight: 700; font-size: 16px; letter-spacing: -.01em; }
  .brand-subtitle { font-size: 12px; color: #64748b; }
  .report-meta { text-align: right; }
  .report-title { font-weight: 600; font-size: 13px; color: #0f172a; }
  .report-date { font-size: 12px; color: #64748b; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 14px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, .06);
    min-width: 0;
  }
  .stat-icon {
    width: 42px; height: 42px;
    border-radius: 11px;
    display: grid; place-items: center;
    font-size: 20px;
    flex-shrink: 0;
    background: rgba(99, 102, 241, 0.15);
  }
  .stat-icon.mes { background: rgba(16, 185, 129, 0.15); }
  .stat-icon.printer { background: rgba(245, 158, 11, 0.18); }
  .stat-icon.peor { background: rgba(244, 63, 94, 0.15); }
  .stat-icon.piso { background: rgba(99, 102, 241, 0.15); }
  .stat-body { min-width: 0; flex: 1; }
  .stat-label {
    font-size: 10px; color: #64748b;
    text-transform: uppercase; letter-spacing: .06em;
    font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .stat-value {
    font-size: 22px; font-weight: 700;
    line-height: 1.15; margin-top: 2px;
    letter-spacing: -.02em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .stat-sub {
    font-size: 11px; color: #94a3b8; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }
  .card {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 14px;
    padding: 22px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, .06);
  }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; letter-spacing: -.01em; }

  .donut-wrap { position: relative; display: grid; place-items: center; margin: 8px 0 16px; }
  .donut-svg { width: 220px; height: 220px; transform: rotate(-90deg); }
  .donut-center { position: absolute; text-align: center; pointer-events: none; }
  .donut-number { font-size: 36px; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
  .donut-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }
  .legend { display: flex; justify-content: center; gap: 10px 20px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-label { flex: 1; }
  .legend-value { font-weight: 600; color: #0f172a; }
  .legend-modelos { justify-content: flex-start; }

  .top-list { display: flex; flex-direction: column; gap: 12px; }
  .top-row { display: flex; flex-direction: column; gap: 6px; }
  .top-header { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
  .top-name { font-weight: 600; }
  .top-value { font-weight: 700; color: #6366f1; }
  .top-bar { height: 6px; background: rgba(241, 245, 249, 0.8); border-radius: 4px; overflow: hidden; }
  .top-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
  .top-meta { color: #64748b; font-size: 12px; }

  .bar-chart { display: flex; flex-direction: column; gap: 6px; }
  .bar-row {
    display: grid;
    grid-template-columns: 130px 1fr minmax(50px, auto);
    gap: 10px;
    align-items: center;
    font-size: 12px;
  }
  .bar-label { color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { height: 18px; background: rgba(241, 245, 249, 0.8); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 4px; }
  .bar-value { font-weight: 600; text-align: right; color: #0f172a; }
  .bar-row-otros .bar-label { font-style: italic; }
  .bar-row-otros .bar-fill { background: #94a3b8; }

  .empty { color: #64748b; font-size: 13px; font-style: italic; padding: 8px 0; }

  .dash-section-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #64748b;
    font-weight: 700;
    margin: 24px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
  }
  .dash-section-title:first-of-type { margin-top: 4px; }

  details {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 14px;
    margin-bottom: 16px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, .06);
  }
  summary {
    padding: 16px 20px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before {
    content: '▸';
    color: #64748b;
    transition: transform .15s ease;
    display: inline-block;
    width: 12px;
  }
  details[open] summary::before { transform: rotate(90deg); }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; font-weight: 600; font-size: 11px;
    text-transform: uppercase; letter-spacing: .06em;
    color: #64748b;
    padding: 10px 12px;
    background: rgba(248, 250, 252, 0.9);
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }
  td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  .text-right { text-align: right; }

  footer {
    margin-top: 24px;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 12px;
    font-size: 11px;
    color: #94a3b8;
    text-align: center;
    line-height: 1.6;
  }
  footer strong { color: #64748b; }

  @media (max-width: 1000px) {
    .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 700px) {
    body { padding: 20px 14px 32px; }
    .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-2 { grid-template-columns: 1fr; }
    .bar-row { grid-template-columns: 100px 1fr minmax(45px, auto); }
    .report-meta { text-align: left; }
    .donut-svg { width: 180px; height: 180px; }
  }
  @media (max-width: 420px) {
    .stats-grid { grid-template-columns: 1fr; }
  }

  /* Print: limpiar el PDF (sin fondo animado, sin glassmorphism, tabla legible) */
  @media print {
    @page { margin: 12mm; }
    body::before { display: none !important; }
    body { background: #fff !important; padding: 0 !important; }
    .report { max-width: 100%; }
    .stat-card, .card, details, footer {
      background: #fff !important;
      box-shadow: none !important;
      border-color: #ddd !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    .card:hover, .stat-card:hover { transform: none !important; }
    .stats-grid { grid-template-columns: repeat(5, 1fr) !important; }
    .grid-2 { grid-template-columns: 1fr 1fr !important; }
    .donut-svg { width: 160px !important; height: 160px !important; }
    details:not([open]) { display: none !important; }
    details[open] { page-break-inside: avoid; }
    table { font-size: 10pt !important; }
    th, td { padding: 6px 8px !important; }
  }
</style>
</head>
<body>
<div class="report">

  <header>
    <div class="brand">
      <svg class="kraken" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="9" rx="5.5" ry="4.5" fill="#fff"/>
        <circle cx="10" cy="9" r="1" fill="#1e2547"/>
        <circle cx="14" cy="9" r="1" fill="#1e2547"/>
        <path d="M6 12 Q5 15 6 18 Q7.5 18 7.5 15 Q7.5 13 8 12 Z" fill="#fff"/>
        <path d="M10 12 Q9 16 10 19 Q11.5 19 11 16 Q11 14 11 12 Z" fill="#fff"/>
        <path d="M12.5 12 Q12 17 12.5 20 Q14 17 13.5 12 Z" fill="#fff"/>
        <path d="M15 12 Q16 16 15 19 Q13.5 19 14 16 Q14 14 14 12 Z" fill="#fff"/>
        <path d="M18 12 Q19 15 18 18 Q16.5 18 16.5 15 Q16.5 13 16 12 Z" fill="#fff"/>
      </svg>
      <div>
        <div class="brand-title">Deep presoras</div>
        <div class="brand-subtitle">Reporte del dashboard</div>
      </div>
    </div>
    <div class="report-meta">
      <div class="report-title">Generado el ${fecha}</div>
      <div class="report-date">${hora} · ${activas.length} impresoras activas</div>
    </div>
  </header>

  <div class="dash-section-title">Resumen</div>

  <section class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon">📊</div>
      <div class="stat-body">
        <div class="stat-label">Hojas históricas</div>
        <div class="stat-value">${fmtNum(totalHojas)}</div>
        <div class="stat-sub">confiables</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon mes">📅</div>
      <div class="stat-body">
        <div class="stat-label">Hojas este mes</div>
        <div class="stat-value">${fmtNum(hojasMes)}</div>
        <div class="stat-sub">${mesSubTxt}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon printer">🏆</div>
      <div class="stat-body">
        <div class="stat-label">Impresora top</div>
        <div class="stat-value">${topPrinter ? fmtNum(topPrinter.value) : '—'}</div>
        <div class="stat-sub">${topPrinter ? escapeHtml(topPrinter.printer.area || topPrinter.printer.ip) : 'Sin datos'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon peor">🔥</div>
      <div class="stat-body">
        <div class="stat-label">Peor mes</div>
        <div class="stat-value">${peorMes ? fmtNum(peorMes.value) : '—'}</div>
        <div class="stat-sub">${peorMes ? monthKeyToLabel(peorMes.mes) : 'Sin datos'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon piso">🏢</div>
      <div class="stat-body">
        <div class="stat-label">Piso más abusador</div>
        <div class="stat-value">${pisoTop ? fmtNum(pisoTop.total) : '—'}</div>
        <div class="stat-sub">${pisoTop ? escapeHtml(pisoTop.label) : 'Sin datos'}</div>
      </div>
    </div>
  </section>

  <div class="grid-2">
    <div class="card">
      <h2>Estado general</h2>
      <div class="donut-wrap">
        ${donutEstadoSvg}
      </div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:${colors.success}"></span> Responden <span class="legend-value">${ok}</span></div>
        <div class="legend-item"><span class="legend-dot" style="background:${colors.danger}"></span> Sin respuesta <span class="legend-value">${err}</span></div>
      </div>
    </div>
    <div class="card">
      <h2>TOP 5 MÁS UTILIZADAS DE ${monthNameUpper(mesKey)} ${mesKey.split('-')[0]}</h2>
      <div class="top-list">${topMesHtml}</div>
    </div>
  </div>

  <div class="dash-section-title">Tendencia</div>

  <div class="card" style="margin-bottom:16px;">
    <h2>Tendencia mensual</h2>
    <p class="card-hint" style="margin-top:-8px;">El mes en curso se muestra proyectado a fin de mes.</p>
    <div class="bar-chart">${tendenciaHtml}</div>
  </div>

  <div class="dash-section-title">Distribución</div>

  <div class="grid-2">
    <div class="card">
      <h2>Impresoras por modelo</h2>
      <div class="donut-wrap">
        ${donutModelosSvg}
      </div>
      <div class="legend legend-modelos">${legendModelosHtml}</div>
    </div>
    <div class="card">
      <h2>Impresoras por edificio</h2>
      <div class="bar-chart">${porEdificioHtml}</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Impresoras por piso</h2>
      <div class="bar-chart">${pisoHtml}</div>
    </div>
    <div class="card">
      <h2>Impresoras por funcionario</h2>
      <div class="bar-chart">${funcHtml}</div>
    </div>
  </div>

  <div class="dash-section-title">Consumo</div>

  <div class="grid-2">
    <div class="card">
      <h2>TOP 5 MÁS UTILIZADAS — HISTÓRICO</h2>
      <div class="top-list">${topHistHtml}</div>
    </div>
    <div class="card">
      <h2>Consumo por edificio</h2>
      <div class="bar-chart">${consumoEdificioHtml}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px;">
    <h2>Hojas por funcionario (últimos 3 meses)</h2>
    <div class="bar-chart">${hojasFuncHtml}</div>
  </div>

  <div class="dash-section-title">Estado operativo</div>

  <details>
    <summary>Tabla completa de impresoras (${activas.length})</summary>
    <div style="padding:0 20px 20px;">
      <table>
        <thead>
          <tr>
            <th>Área</th>
            <th>Modelo</th>
            <th>IP</th>
            <th>Piso</th>
            <th>Funcionario</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>${tablaHtml}</tbody>
      </table>
    </div>
  </details>

  <footer>
    <strong>Reporte generado desde Deep presoras.</strong><br>
    Este archivo contiene datos internos de la organización. No compartir fuera del ámbito de la misma.<br>
    ${fecha} · ${hora}
  </footer>

</div>
</body>
</html>`;
}

function exportarDashboardHTML() {
  const activas = getImpresorasActivas();
  if (activas.length === 0) { showToast('⚠ Sin impresoras para exportar', 'error'); return; }
  const html = buildDashboardHTML();
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deep-presoras-${yyyy}-${mm}-${dd}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`✓ Dashboard exportado (${activas.length} impresoras)`);
}

function exportarDashboardPDF() {
  const activas = getImpresorasActivas();
  if (activas.length === 0) { showToast('⚠ Sin impresoras para exportar', 'error'); return; }
  const html = buildDashboardHTML();
  const win = window.open('', '_blank');
  if (!win) {
    showToast('⚠ Permitir ventanas emergentes para exportar a PDF', 'error', 6000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      showToast(`⚠ Error al imprimir: ${e.message}`, 'error');
    }
  }, 500);
  showToast('✓ Elegí "Guardar como PDF" en el diálogo de impresión', 'ok', 6000);
}

// =============================================================
// ===== BACKUP ================================================
// =============================================================

const BACKUP_LS_KEY = 'deep-presoras-last-backup';

function getLastBackupISO() {
  try {
    const raw = localStorage.getItem(BACKUP_LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.iso !== 'string') return null;
    const d = new Date(obj.iso);
    if (isNaN(d.getTime())) return null;
    return obj.iso;
  } catch { return null; }
}

function setLastBackupNow() {
  try {
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify({ iso: new Date().toISOString() }));
  } catch {}
}

function todayFileStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function computeBackupBadge() {
  const iso = getLastBackupISO();
  if (!iso) {
    return { text: '⚠ Sin backup', level: 'danger', title: 'Nunca se realizó un backup' };
  }
  const last = new Date(iso);
  const now = new Date();
  const sameMonth =
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth();
  const dias = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
  const fechaHumana = last.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  if (!sameMonth) {
    return { text: '⚠ Backup vencido', level: 'danger', title: `Último backup: ${fechaHumana}` };
  }
  if (dias >= 7) {
    return { text: `⚠ Hace ${dias} días`, level: 'warning', title: `Último backup: ${fechaHumana}` };
  }
  return { text: '', level: 'ok', title: `Último backup: ${fechaHumana}` };
}

function updateBackupBadge() {
  const badge = document.getElementById('backupBadge');
  const btn = document.getElementById('btnBackup');
  if (!badge || !btn) return;
  const info = computeBackupBadge();
  btn.title = info.title || 'Realizar backup';
  if (!info.text) {
    badge.hidden = true;
    badge.textContent = '';
    badge.className = 'backup-badge';
    return;
  }
  badge.hidden = false;
  badge.textContent = info.text;
  badge.className = 'backup-badge backup-badge-' + info.level;
}

function downloadCsv(filename, lines) {
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildCsvImpresoras() {
  const headers = [
    'Serial', 'IP', 'Modelo', 'Marca', 'Equipamiento', 'Área', 'Funcionario',
    'Piso', 'Edificio', 'Escaneable', 'Estado', 'Baseline mes', 'Baseline valor',
    'Última respuesta', 'Hojas este mes', 'Total histórico'
  ];
  const mesKey = currentMonthKey();
  const lines = [headers.map(csvCell).join(';')];

  getImpresorasActivas().forEach(p => {
    const key = getPrinterKey(p);
    const estado = getEstado(key);
    const reg = getReg(key);
    const b = getBaseline(p);
    const deltaMes = getDelta(p, mesKey);
    const totalHist = getTotalDelta(p);
    const escaneable = esEscanable(p);

    lines.push([
      csvCell(p.serial || ''),
      csvCell(p.ip || ''),
      csvCell(p.modelo || ''),
      csvCell(p.marca || ''),
      csvCell(p.equipamiento || ''),
      csvCell(p.area || ''),
      csvCell(p.funcionario || ''),
      csvCell(pisoLabel(p.piso)),
      csvCell(p.edificio || ''),
      csvCell(escaneable ? 'Sí' : 'No'),
      csvCell(estado),
      csvCell(b ? b.mes : ''),
      csvCell(b ? b.raw : ''),
      csvCell(reg.ultimaRespuesta ? formatDateTime(reg.ultimaRespuesta) : ''),
      csvCell(deltaMes != null ? deltaMes : ''),
      csvCell(totalHist != null ? totalHist : '')
    ].join(';'));
  });

  return lines;
}

function buildCsvHistorico() {
  const activas = getImpresorasActivas();
  const mesesSet = new Set();
  activas.forEach(p => {
    const reg = getReg(getPrinterKey(p));
    Object.keys(reg.meses || {}).forEach(m => mesesSet.add(m));
    Object.keys(reg.deltasManuales || {}).forEach(m => mesesSet.add(m));
  });
  const meses = [...mesesSet].sort();

  const baseHeaders = [
    'Serial', 'IP', 'Modelo', 'Área', 'Funcionario',
    'Piso', 'Edificio', 'Baseline mes', 'Baseline valor'
  ];
  const monthHeaders = meses.map(m => `${monthKeyToLabel(m)}${esLegacy(m) ? ' ⚠' : ''}`);
  const headers = [...baseHeaders, ...monthHeaders, 'Total histórico'];
  const lines = [headers.map(csvCell).join(';')];

  activas.forEach(p => {
    const key = getPrinterKey(p);
    const reg = getReg(key);
    const b = getBaseline(p);
    const totalHist = getTotalDelta(p);

    const baseCols = [
      csvCell(p.serial || ''),
      csvCell(p.ip || ''),
      csvCell(p.modelo || ''),
      csvCell(p.area || ''),
      csvCell(p.funcionario || ''),
      csvCell(pisoLabel(p.piso)),
      csvCell(p.edificio || ''),
      csvCell(b ? b.mes : ''),
      csvCell(b ? b.raw : '')
    ];

    const monthCols = meses.map(m => {
      if (esLegacy(m)) {
        const raw = getRaw(p, m);
        return csvCell(raw != null ? raw : '');
      }
      const d = getDelta(p, m);
      return csvCell(d != null ? d : '');
    });

    const totalCol = csvCell(totalHist != null ? totalHist : '');
    lines.push([...baseCols, ...monthCols, totalCol].join(';'));
  });

  return lines;
}

function runBackupTotal() {
  const stamp = todayFileStamp();
  const impLines = buildCsvImpresoras();
  const histLines = buildCsvHistorico();
  downloadCsv(`deep-presoras-impresoras-${stamp}.csv`, impLines);
  setTimeout(() => {
    downloadCsv(`deep-presoras-historico-${stamp}.csv`, histLines);
  }, 250);
  setLastBackupNow();
  updateBackupBadge();
  showToast(`✓ Backup total descargado (2 archivos)`);
}

function runBackupImpresoras() {
  const stamp = todayFileStamp();
  downloadCsv(`deep-presoras-impresoras-${stamp}.csv`, buildCsvImpresoras());
  setLastBackupNow();
  updateBackupBadge();
  showToast(`✓ Lista de impresoras descargada`);
}

function runBackupHistorico() {
  const stamp = todayFileStamp();
  downloadCsv(`deep-presoras-historico-${stamp}.csv`, buildCsvHistorico());
  setLastBackupNow();
  updateBackupBadge();
  showToast(`✓ Histórico descargado`);
}

function toggleBackupMenu(force) {
  const menu = document.getElementById('backupMenu');
  const btn = document.getElementById('btnBackup');
  if (!menu || !btn) return;
  const next = (typeof force === 'boolean') ? force : menu.hidden;
  if (next) closePdfMenu();
  menu.hidden = !next;
  btn.setAttribute('aria-expanded', String(next));
}

function closeBackupMenu() {
  const menu = document.getElementById('backupMenu');
  const btn = document.getElementById('btnBackup');
  if (!menu) return;
  menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function initBackupUI() {
  const btn = document.getElementById('btnBackup');
  const menu = document.getElementById('backupMenu');
  if (!btn || !menu) return;

  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBackupMenu();
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('[data-backup]');
    if (!item) return;
    const kind = item.dataset.backup;
    closeBackupMenu();
    if (kind === 'total') runBackupTotal();
    else if (kind === 'impresoras') runBackupImpresoras();
    else if (kind === 'historico') runBackupHistorico();
  });

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('backupWrap');
    if (!wrap) return;
    if (!wrap.contains(e.target)) closeBackupMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBackupMenu();
  });

  updateBackupBadge();
}

// =============================================================
// ===== /BACKUP ===============================================
// =============================================================

// =============================================================
// ===== LOCK (editor / viewer) ================================
// =============================================================

const IDLE_MS      = 15 * 60 * 1000;
const IDLE_POPUP_MS = 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const POLL_MS      = 30 * 1000;

let heartbeatTimer   = null;
let lockPollTimer    = null;
let idleTimer        = null;
let idleCountdownIv  = null;

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/heartbeat', { method: 'POST' });
      if (res.status === 409) {
        stopHeartbeat();
        state.isEditor = false;
        state.lockOwner = null;
        renderRoleUI();
        showToast('⚠ Se liberó tu edición. Ahora estás en modo visualización.', 'error', 6000);
      }
    } catch {}
  }, HEARTBEAT_MS);
}
function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startLockPolling() {
  if (lockPollTimer) return;
  lockPollTimer = setInterval(async () => {
    if (state.isEditor) return;
    try {
      const res = await fetch('/api/lock');
      if (!res.ok) return;
      const data = await res.json();
      const nuevo = data.lockOwner;
      const antes = state.lockOwner;
      const cambió = JSON.stringify(nuevo) !== JSON.stringify(antes);
      if (cambió) {
        state.lockOwner = nuevo;
        renderRoleUI();
      }
    } catch {}
  }, POLL_MS);
}

function resetIdleTimer() {
  if (!state.isEditor) return;
  if (idleTimer) clearTimeout(idleTimer);
  if (idleCountdownIv) { clearInterval(idleCountdownIv); idleCountdownIv = null; }
  const modal = document.getElementById('idleModal');
  if (modal) modal.hidden = true;
  idleTimer = setTimeout(showIdlePopup, IDLE_MS);
}
function showIdlePopup() {
  if (!state.isEditor) return;
  const modal = document.getElementById('idleModal');
  const counter = document.getElementById('idleCountdown');
  if (!modal) return;
  let remaining = 60;
  if (counter) counter.textContent = remaining;
  modal.hidden = false;
  idleCountdownIv = setInterval(() => {
    remaining--;
    if (counter) counter.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(idleCountdownIv);
      idleCountdownIv = null;
      autoLogout();
    }
  }, 1000);
}
async function autoLogout() {
  const modal = document.getElementById('idleModal');
  if (modal) modal.hidden = true;
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exit: false })
    });
  } catch {}
  stopHeartbeat();
  state.isEditor = false;
  state.lockOwner = null;
  renderRoleUI();
  render();
  showToast('⚠ Edición liberada por inactividad. Ahora estás en modo visualización.', 'error', 6000);
}
function initIdleListeners() {
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, resetIdleTimer, { passive: true });
  });
}

function renderRoleUI() {
  const badge = document.getElementById('roleBadge');
  const logoutBtn = document.getElementById('btnLogout');
  const banner = document.getElementById('roleBanner');
  const scanBtn = document.getElementById('btnScan');
  const addBtn = document.getElementById('btnAddPrinter');
  if (!badge) return;

  document.body.classList.toggle('is-viewer', !state.isEditor);

  if (state.isEditor) {
    badge.textContent = '🟢 Editando';
    badge.className = 'role-badge role-badge-editor';
    if (logoutBtn) logoutBtn.hidden = false;
    if (banner) banner.hidden = true;
    if (scanBtn) scanBtn.hidden = false;
    if (addBtn) addBtn.hidden = false;
  } else {
    badge.textContent = '⚪ Solo lectura';
    badge.className = 'role-badge role-badge-viewer';
    if (logoutBtn) logoutBtn.hidden = true;
    if (scanBtn) scanBtn.hidden = true;
    if (addBtn) addBtn.hidden = true;
    if (banner) {
      banner.hidden = false;
      if (state.lockOwner) {
        banner.innerHTML = '🔒 El programa está siendo utilizado por otra persona. Estás en modo visualización.';
      } else {
        banner.innerHTML = '🔓 Nadie está editando. <button class="btn btn-primary btn-sm" id="btnTakeEdit">Tomar edición</button>';
      }
      const takeBtn = document.getElementById('btnTakeEdit');
      if (takeBtn) takeBtn.addEventListener('click', onTakeEdit);
    }
  }
}
async function onTakeEdit() {
  try {
    const res = await fetch('/api/take-edit', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.lockOwner) state.lockOwner = data.lockOwner;
      renderRoleUI();
      showToast('⚠ No se pudo tomar. Otro usuario lo tiene.', 'error');
      return;
    }
    state.isEditor = true;
    state.lockOwner = null;
    startHeartbeat();
    resetIdleTimer();
    renderRoleUI();
    render();
    showToast('✓ Ahora estás editando');
  } catch (e) {
    showToast(`⚠ ${e.message}`, 'error');
  }
}

async function initRoleLock() {
  initIdleListeners();
  renderRoleUI();
  if (state.isEditor) {
    startHeartbeat();
    resetIdleTimer();
  }
  startLockPolling();

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (!confirm('¿Cerrar sesión y cerrar el programa?\n\nSe libera la edición para que otra persona pueda usar el programa.\n\n¿Continuar?')) return;
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exit: true })
        });
      } catch {}
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;text-align:center;padding:24px;"><div><h1 style="margin-bottom:12px;">Sesión cerrada.</h1><p style="color:#666;">Podés cerrar esta pestaña.</p></div></div>';
    });
  }
  const btnIdleConfirm = document.getElementById('btnIdleConfirm');
  if (btnIdleConfirm) btnIdleConfirm.addEventListener('click', resetIdleTimer);
  const btnIdleLogout = document.getElementById('btnIdleLogout');
  if (btnIdleLogout) btnIdleLogout.addEventListener('click', autoLogout);
}

// =============================================================
// ===== /LOCK ================================================
// =============================================================

// =============================================================
// ===== PDF DROPDOWN ==========================================
// Reusa las clases .backup-wrap / .backup-menu del backup.
// =============================================================

function togglePdfMenu(force) {
  const menu = document.getElementById('pdfMenu');
  const btn = document.getElementById('btnExportPdf');
  if (!menu || !btn) return;
  const next = (typeof force === 'boolean') ? force : menu.hidden;
  if (next) closeBackupMenu();
  menu.hidden = !next;
  btn.setAttribute('aria-expanded', String(next));
}

function closePdfMenu() {
  const menu = document.getElementById('pdfMenu');
  const btn = document.getElementById('btnExportPdf');
  if (!menu) return;
  menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function runPdfLista() {
  exportarPDF();
}

function runPdfDashboard() {
  exportarDashboardPDF();
}

function initPdfUI() {
  const btn = document.getElementById('btnExportPdf');
  const menu = document.getElementById('pdfMenu');
  if (!btn || !menu) return;

  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePdfMenu();
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('[data-pdf]');
    if (!item) return;
    const kind = item.dataset.pdf;
    closePdfMenu();
    if (kind === 'lista') runPdfLista();
    else if (kind === 'dashboard') runPdfDashboard();
  });

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('pdfWrap');
    if (!wrap) return;
    if (!wrap.contains(e.target)) closePdfMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePdfMenu();
  });
}

// =============================================================
// ===== /PDF DROPDOWN =========================================
// =============================================================

// --- SCAN ---
let scanRunning = false;
async function runScan() {
  if (!state.isEditor) { showToast('⚠ Estás en modo visualización.', 'error'); return; }
  if (scanRunning) return;
  if (!state.serverAvailable) { showToast('⚠ Servidor no disponible.', 'error'); return; }
  const escaneables = getImpresorasActivas().filter(p => esEscanable(p)).length;
  if (escaneables === 0) { showToast('⚠ Sin impresoras escaneables.', 'error'); return; }
  scanRunning = true;
  const btn = $('#btnScan'), text = $('#scanText'), icon = $('#scanIcon');
  btn.disabled = true; text.textContent = 'Actualizando…'; icon.textContent = '⏳';
  const closeLoading = showLoadingToast(`Consultando ${escaneables} impresoras vía SNMP…`);
  try {
    const res = await fetch('/api/scan', { method: 'POST' });
    let data;
    try { data = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
    if (!res.ok || !data.ok) {
      throw new Error((data.error || `HTTP ${res.status}`) + (data.output ? `\n\n${data.output}` : ''));
    }
    closeLoading();
    await loadData();
    render();
    showToast(`✓ Listo. Actualizado en ${data.duracion}s.`);
  } catch (err) {
    closeLoading();
    console.error('Scan error:', err);
    showToast(`⚠ ${(err.message || '').split('\n')[0]}`, 'error', 8000);
  } finally {
    btn.disabled = false; text.textContent = 'Actualizar ahora'; icon.textContent = '🔄';
    scanRunning = false;
  }
}

// --- THEME ---
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = $('#themeToggle');
  btn.querySelector('.theme-icon').textContent = theme === 'dark' ? '🌙' : '☀️';
  btn.querySelector('.theme-label').textContent = theme === 'dark' ? 'Tema oscuro' : 'Tema claro';
}

// --- UTILS ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function showLoadingToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-loading';
  const spinner = document.createElement('span'); spinner.className = 'toast-spinner';
  const label = document.createElement('span'); label.textContent = msg;
  toast.appendChild(spinner); toast.appendChild(label);
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  return () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); };
}
function showToast(msg, type = 'ok', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, duration);
}

// --- INIT ---
async function init() {
  applyTheme(localStorage.getItem('theme') || 'light');
  const { source } = await loadData();
  console.log(`[Deep presoras] Datos: ${source}`);
  if (source === 'offline') {
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.innerHTML = '⚠️ El servidor no está corriendo. Ejecutá <strong>start.bat</strong>.';
    document.body.prepend(banner);
  }
  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark'); render();
  });

  const brandIcon = $('#brandIcon');
  if (brandIcon) {
    brandIcon.addEventListener('click', handleKrakenClick);
    brandIcon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleKrakenClick();
      }
    });
  }

  $('#btnScan').addEventListener('click', runScan);
  $('#btnAddPrinter').addEventListener('click', () => openModal(null, state.edificioSeleccionado));
  $('#btnCancel').addEventListener('click', closeModal);
  $('#printerForm').addEventListener('submit', savePrinter);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#btnUnlockBaseline').addEventListener('click', desbloquearBaseline);
  $('#btnMostrarMesAnterior').addEventListener('click', () => {
    $('#lecturaAnteriorSection').hidden = false;
    $('#btnMostrarMesAnterior').hidden = true;
  });
  $('#inputIp').addEventListener('input', () => {
    const ip = $('#inputIp').value.trim().toUpperCase();
    const esUSB = ip === 'USB';
    $('#inputEscanear').disabled = esUSB;
    if (esUSB) $('#inputEscanear').checked = false;
  });

  // Edificios grid
  $('#edificiosGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-edificio]');
    if (card) {
      state.edificioSeleccionado = card.dataset.edificio;
      renderImpresoras();
    }
  });
  $('#btnBackToEdificios').addEventListener('click', () => {
    state.edificioSeleccionado = null;
    renderImpresoras();
  });

  // Tabla de impresoras (dentro de un edificio)
  $('#printersTable').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (editBtn) { openModal(editBtn.dataset.edit); return; }
    if (delBtn) { deletePrinter(delBtn.dataset.del); return; }
    if (e.target.closest('a')) return;
    const row = e.target.closest('tr[data-row-key]');
    if (row) irADetalle(row.dataset.rowKey, 'impresoras');
  });
  $('#listaBorradas')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-revive]');
    if (btn) revivePrinter(btn.dataset.revive);
  });

  $('#searchText').addEventListener('input', (e) => { state.search.text = e.target.value; renderBuscar(); });
  $('#searchEdificio').addEventListener('change', (e) => { state.search.edificio = e.target.value; renderBuscar(); });
  $('#searchPiso').addEventListener('change', (e) => { state.search.piso = e.target.value; renderBuscar(); });
  $('#searchEstado').addEventListener('change', (e) => { state.search.estado = e.target.value; renderBuscar(); });
  $('#btnClearFilters').addEventListener('click', () => {
    state.search = { text: '', edificio: '', piso: '', estado: '' };
    renderBuscar();
  });
  $('#searchResults')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-open]');
    if (row) {
      irADetalle(row.dataset.open);
    }
  });
  $('#btnBackToSearch').addEventListener('click', () => switchView(state.detalleFrom || 'buscar'));

  $('#histTable').addEventListener('click', (e) => {
    const openEl = e.target.closest('[data-open]');
    if (openEl) irADetalle(openEl.dataset.open, 'historico');
  });

  $('#detalleContent')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-dni]');
    if (editBtn) openModal(editBtn.dataset.editDni);
  });

  $('#btnShareDashboard')?.addEventListener('click', exportarDashboardHTML);

  $('#legacyToggle')?.addEventListener('click', () => {
    const panel = $('#legacyPanel');
    const toggle = $('#legacyToggle');
    if (!panel || !toggle) return;
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    toggle.classList.toggle('active', !isOpen);
  });

  // ===== BACKUP + PDF: dropdowns =====
  initBackupUI();
  initPdfUI();

  // ===== LOCK: editor / viewer =====
  initRoleLock();

  // Click en segmentos del donut de modelos
  $('#donutModelos')?.addEventListener('click', (e) => {
    const circle = e.target.closest('circle[data-modelo]');
    if (!circle) return;
    selectModelo(circle.dataset.modelo);
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);