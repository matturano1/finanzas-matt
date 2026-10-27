/* Finanzas Matt · app instalable
   Datos: Google Sheet personal vía Apps Script (URL y clave capturadas en cada dispositivo).
   Este repositorio no contiene datos, ID de la hoja, URL de la API ni clave. */
(function () {
'use strict';

/* ================= constantes ================= */
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const PAL = ['#4FD6F0','#2EC4B6','#9D86FF','#5B9DFF','#D07BE8','#7EE0B5','#F5C065','#FF8FA3'];
const ROLES = [['fijos','Cargos fijos y recurrentes'],['corriente','Gasto corriente'],['ahorro','Ahorro e inversión'],['otro','Otro']];
const FORMAS = ['Cargo automático','Transferencia','Pago directo','Tarjeta de crédito','Efectivo'];
const TIPOS = ['Fijo','Variable','Extra'];
const FREQ = [[1,'Mensual'],[2,'Bimestral'],[3,'Trimestral'],[6,'Semestral'],[12,'Anual'],[0,'Ocasional']];
const TABLAS = ['cuentas','categorias','categoriasIngreso','conceptos','historial','pagos','movimientos','ingresos','ingresosFijos','transferencias','saldos','metas','ahorros'];
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg>';

/* ================= utilidades ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const eq = (a, b) => N(a) === N(b);
const fmt = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(+n || 0)).toLocaleString('es-MX');
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const r2 = n => Math.round((+n || 0) * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
/* Ciclos: desde noviembre 2026 cada ciclo va del 15 al 14 y se llama por el mes en que empieza
   (15 nov–14 dic = "Noviembre 2026"). Octubre 2026 es de transición: 1 oct–14 nov. Antes, mes calendario. */
const CICLO_DESDE = '2026-11', DIA_CICLO = 15, HORA_PAGO = 17;
const cicloDe = f => {
  const s = String(f || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  const ym = s.slice(0, 7);
  if (ym < CICLO_DESDE) return ym;
  return +s.slice(8) >= DIA_CICLO ? ym : addM(ym, -1);
};
const mesHoy = () => cicloDe(hoyISO());
const mesLbl = id => { if (!id) return '—'; const [y, m] = id.split('-').map(Number); return MESES[m - 1] + ' ' + y; };
const mesN = id => MESES[+id.slice(5) - 1];
const addM = (id, k) => { let [y, m] = id.split('-').map(Number); m += k; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + pad(m); };
const mdiff = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const fLbl = f => { if (!f) return ''; const [, m, d] = f.split('-').map(Number); return d + ' ' + MESES[m - 1].slice(0, 3).toLowerCase(); };
const diaEnMes = (mid, dia) => { const [y, mo] = mid.split('-').map(Number), last = new Date(y, mo, 0).getDate(); return y + '-' + pad(mo) + '-' + pad(Math.min(+dia, last)); };
const ultimoDia = mid => { const [y, mo] = mid.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
// Un día de pago menor a 15 cae en el mes calendario siguiente al del inicio del ciclo.
const calDeCiclo = (mid, dia) => mid >= CICLO_DESDE && +dia >= 1 && +dia < DIA_CICLO ? addM(mid, 1) : mid;
const fechaCiclo = (mid, dia) => diaEnMes(calDeCiclo(mid, dia), dia);
const cicloIni = mid => mid >= CICLO_DESDE ? mid + '-' + DIA_CICLO : mid + '-01';
const cicloFin = mid => mid >= addM(CICLO_DESDE, -1) ? addM(mid, 1) + '-' + pad(DIA_CICLO - 1) : mid + '-' + pad(ultimoDia(mid));
const cicloRango = mid => mid ? fLbl(cicloIni(mid)) + ' – ' + fLbl(cicloFin(mid)) : '';
const daysTo = f => { const [y, m, d] = f.split('-').map(Number), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(y, m - 1, d) - t) / 864e5); };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* ================= estado ================= */
const vacio = () => { const o = {}; TABLAS.forEach(t => o[t] = []); return o; };
const S = {
  api: LS.get('fm_api', null),
  T: null, cfg: {}, faltantes: {}, calculadas: {},
  outbox: LS.get('fm_outbox', []),
  sync: 'idle', syncMsg: '', ts: null,
  mesId: null, tab: LS.get('fm_tab', 'resumen'), filtro: LS.get('fm_f', 'pend'), vista: LS.get('fm_v', 'fecha'),
  flushing: false, install: null
};
(function cargarCache() {
  const c = LS.get('fm_cache', null);
  if (c && c.T) { S.T = Object.assign(vacio(), c.T); S.cfg = c.cfg || {}; S.faltantes = c.faltantes || {}; S.calculadas = c.calculadas || {}; S.ts = c.ts || null; }
})();
const guardarCache = () => LS.set('fm_cache', { T: S.T, cfg: S.cfg, faltantes: S.faltantes, calculadas: S.calculadas, ts: S.ts });
const guardarOutbox = () => LS.set('fm_outbox', S.outbox);

/* ================= API ================= */
async function api(accion, extra) {
  let res;
  try {
    res = await fetch(S.api.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ clave: S.api.clave, accion }, extra || {})) });
  } catch (e) { const er = new Error('Sin conexión'); er.red = true; throw er; }
  let j;
  try { j = await res.json(); } catch (e) { const er = new Error(res.ok ? 'La API no respondió JSON. Revisa que la URL termine en /exec y que el acceso sea “Cualquier usuario”.' : 'Error ' + res.status); er.server = true; throw er; }
  if (!j.ok) { const er = new Error(j.error || 'Error de la API'); er.server = true; er.codigo = j.codigo; throw er; }
  return j;
}

function setSync(st, msg) {
  S.sync = st; S.syncMsg = msg || '';
  const b = $('#sync'); if (!b) return;
  b.className = 'sync ' + (st === 'busy' ? 'busy' : st === 'off' ? 'off' : st === 'err' ? 'err' : '');
  const pend = S.outbox.length;
  const hora = S.ts ? new Date(S.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
  b.querySelector('span').textContent =
    st === 'busy' ? 'Sincronizando…' :
    st === 'off' ? 'Sin conexión' + (pend ? ' · ' + pend + ' por guardar' : '') :
    st === 'err' ? 'Error · toca para reintentar' :
    !S.api ? 'Sin conectar' :
    pend ? pend + ' por guardar' : (hora ? 'Al día · ' + hora : 'Al día');
  b.title = S.syncMsg || '';
}

async function flush() {
  if (S.flushing || !S.api) return false;
  S.flushing = true;
  try {
    while (S.outbox.length) {
      const b = S.outbox[0];
      try {
        const j = await api('lote', { ops: b.ops });
        if (j.avisos && j.avisos.length) toast('Ojo con la hoja: ' + j.avisos[0], 8000);
      }
      catch (e) {
        if (e.red) { setSync('off'); return false; }
        S.outbox.shift(); guardarOutbox();
        toast('No se guardó “' + b.label + '”: ' + e.message, 6000);
        continue;
      }
      S.outbox.shift(); guardarOutbox();
    }
    return true;
  } finally { S.flushing = false; }
}

let syncTimer = null, syncing = null;
function syncPronto(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(sincronizar, ms ?? 400); }
const API_ESPERADA = '2026.10.23';
async function sincronizar() {
  if (!S.api) return;
  if (syncing) return syncing;
  syncing = (async () => {
    setSync('busy');
    try {
      const ok = await flush();
      if (!ok && S.outbox.length) return;
      const j = await api('leer');
      if (S.outbox.length) { syncPronto(200); return; }
      const d = j.datos || {};
      S.T = Object.assign(vacio(), d.tablas || {});
      S.cfg = d.config || {};
      S.faltantes = d.faltantes || {};
      S.calculadas = d.calculadas || {};
      S.ts = Date.now(); S.apiVersion = j.version || '';
      if (S.apiVersion < API_ESPERADA) toast('Tu API de Google es una versión vieja (' + (S.apiVersion || 'sin versión') + '). En Apps Script: Implementar → Administrar implementaciones → lápiz → Nueva versión.', 9000);
      if (d.reparadas) toast('Hoja reparada: ' + d.reparadas + ' celda(s) que bloqueaban las fórmulas de nombre y categoría.', 7000);
      if (d.migracion) { LS.set('fm_migracion', d.migracion); toast('Tu hoja se actualizó: pestañas y columnas nuevas listas, sin borrar datos.', 6000); }
      guardarCache();
      elegirMes();
      setSync('ok');
      completarDias();
      if (!$('#sheet')) { render(); revisarPago(); }
    } catch (e) {
      if (e.red) setSync('off'); else { setSync('err', e.message); if (e.codigo === 'clave') toast(e.message + ' Revisa la clave en Ajustes → Conexión.', 6000); }
    } finally { syncing = null; }
  })();
  return syncing;
}

/* Cambios: se aplican en el dispositivo al instante y se mandan a la hoja en orden. */
function aplicarLocal(ops) {
  ops.forEach(op => {
    if (op.op === 'guardar') {
      const L = S.T[op.tabla]; const i = L.findIndex(r => r.id === op.fila.id);
      if (i >= 0) L[i] = Object.assign({}, L[i], op.fila); else L.push(Object.assign({}, op.fila));
    } else if (op.op === 'eliminar') {
      S.T[op.tabla] = S.T[op.tabla].filter(r => r.id !== op.id);
    } else if (op.op === 'reemplazar') {
      S.T[op.tabla].forEach(r => { if (eq(r[op.campo], op.de)) r[op.campo] = op.a; });
    } else if (op.op === 'config') {
      S.cfg[op.clave] = op.valor;
    }
  });
}
function commit(ops, label, ok) {
  ops = ops.filter(Boolean);
  if (!ops.length) { if (ok) toast(ok); return; }
  aplicarLocal(ops);
  S.outbox.push({ ops, label: label || 'cambio', t: Date.now() });
  guardarOutbox(); guardarCache();
  if (ok) toast(ok);
  render();
  syncPronto(300);
}
const G = (tabla, fila) => ({ op: 'guardar', tabla, fila });
const DEL = (tabla, id) => ({ op: 'eliminar', tabla, id });
const REN = (tabla, campo, de, a) => ({ op: 'reemplazar', tabla, campo, de, a });
const CFG = (clave, valor) => ({ op: 'config', clave, valor });

/* ================= catálogos ================= */
const colorDe = (x, i) => { const c = x && x.color; if (typeof c === 'string' && /^#/.test(c)) return c; if (c !== '' && c != null && isFinite(+c)) return PAL[(+c) % PAL.length]; return PAL[(i || 0) % PAL.length]; };
const rolDe = c => { const u = N(c && c.uso); if (/fij|recurr/.test(u)) return 'fijos'; if (/corr|diari/.test(u)) return 'corriente'; if (/ahorr|invers/.test(u)) return 'ahorro'; return 'otro'; };
const rolLbl = r => (ROLES.find(x => x[0] === r) || ROLES[3])[1];
const cuentas = () => (S.T.cuentas || []).filter(c => c.nombre && c.activa !== false);
const cuentaObj = n => (S.T.cuentas || []).find(c => eq(c.nombre, n));
const ctaColor = n => { const L = S.T.cuentas || []; const i = L.findIndex(c => eq(c.nombre, n)); return i >= 0 ? colorDe(L[i], i) : 'var(--faint)'; };
const porRol = r => cuentas().find(c => rolDe(c) === r);
function cIng() {
  const c = S.cfg.cuentaIngresos; if (c && cuentaObj(c)) return cuentaObj(c).nombre;
  const r = cuentas().find(x => x.recibeIngresos); if (r) return r.nombre;
  return (porRol('fijos') || cuentas()[0] || { nombre: '' }).nombre;
}
const cAhorro = () => (porRol('ahorro') || {}).nombre || '';
const acctTag = n => `<span class="acct"><span class="dot" style="background:${ctaColor(n)}"></span>${esc(n || 'Sin cuenta')}</span>`;

function listaCat(tabla, usados) { // categorías registradas + las que se usan sin estar registradas
  const L = (S.T[tabla] || []).filter(c => c.nombre).map((c, i) => Object.assign({}, c, { _i: i }));
  usados.forEach(n => { if (n && !L.some(c => eq(c.nombre, n))) L.push({ id: null, nombre: n, _i: L.length }); });
  return L;
}
const catsGasto = () => listaCat('categorias', [...S.T.conceptos.map(c => c.categoria), ...S.T.pagos.map(p => p.categoria)]);
const catsIngreso = () => listaCat('categoriasIngreso', [...S.T.ingresos.map(i => i.categoria), ...S.T.ingresosFijos.map(i => i.categoria)]);
const catsActivas = L => L.filter(c => c.activa !== false);
const catColor = n => { const L = catsGasto(); const c = L.find(x => eq(x.nombre, n)); return c ? colorDe(c, c._i) : 'var(--faint)'; };
const catIngColor = n => { const L = catsIngreso(); const c = L.find(x => eq(x.nombre, n)); return c ? colorDe(c, c._i + 3) : 'var(--faint)'; };

const conDe = n => S.T.conceptos.find(c => eq(c.nombre, n));
const fq = c => { const f = c && c.frecuencia; if (f === '' || f == null) return 1; if (isFinite(+f)) return +f; const n = N(f); const x = FREQ.find(([, t]) => N(t) === n || n.startsWith(N(t).slice(0, 4))); return x ? x[0] : 1; };
const fqLbl = n => (FREQ.find(f => f[0] === n) || FREQ[0])[1];
const tipoNorm = s => { const n = N(s); if (!n) return null; if (n.startsWith('var')) return 'Variable'; if (n.startsWith('ext') || n.startsWith('impro')) return 'Extra'; if (n.startsWith('fij') || n.startsWith('rec')) return 'Fijo'; return null; };
const tipoDe = c => tipoNorm(c && c.tipo) || (c && c.variable ? 'Variable' : 'Fijo');
const formaDe = x => (x && x.forma) || 'Pago directo';
function cuentaRegla(x) {
  if (x.cuenta && cuentaObj(x.cuenta)) return cuentaObj(x.cuenta).nombre;
  if (x.cuenta) return x.cuenta;
  const f = formaDe(x), t = x.tipo || 'Fijo', fij = (porRol('fijos') || {}).nombre, cor = (porRol('corriente') || {}).nombre;
  if (f === 'Cargo automático') return fij || cIng();
  if (t === 'Variable' || t === 'Extra' || f === 'Efectivo' || f === 'Tarjeta de crédito') return cor || cIng();
  return fij || cIng();
}
function tocaEn(c, mid) { const n = fq(c); if (n === 1) return true; if (n === 0) return false; if (!c.ancla) return true; return ((mdiff(c.ancla, mid) % n) + n) % n === 0; }
const tocaCiclo = (c, mid) => tocaEn(c, calDeCiclo(mid, c.dia));
function proximo(c, mid) { const n = fq(c); if (n <= 1) return null; for (let i = 1; i <= n; i++) { const id = addM(mid, i); if (tocaCiclo(c, id)) return id; } return null; }
const metaPct = () => { const v = +S.cfg.metaAhorroPct; if (!(v > 0)) return 20; return v <= 1 ? v * 100 : v; };
const fijosActivos = () => S.T.ingresosFijos.filter(f => f.activo !== false && (f.nombre || f.fuente));
const ingresoMensual = () => { const f = fijosActivos(); return f.length ? sum(f, x => x.monto) : (+S.cfg.ingresoMensual || 0); };
const nomIng = i => i.nombre || i.fuente || 'Ingreso';
const metas = () => S.T.metas.filter(m => m.nombre);
const metaAhorrado = m => (+m.ahorrado || 0) + sum(S.T.ahorros.filter(a => eq(a.meta, m.nombre)), a => a.monto);

/* ================= meses ================= */
const mesMov = m => m.mes || cicloDe(m.fecha);
const mesIng = i => i.mes || cicloDe(i.fecha);
const AJ = 'Ajuste de saldo';
const esAjuste = m => eq(m.tipo, AJ);
const ajustesMes = mid => S.T.movimientos.filter(m => esAjuste(m) && mesMov(m) === mid);
function mesesDisp() {
  const s = new Set();
  S.T.pagos.forEach(p => p.mes && s.add(p.mes));
  S.T.saldos.forEach(p => p.mes && s.add(p.mes));
  S.T.ingresos.forEach(i => { const m = mesIng(i); if (m) s.add(m); });
  if (S.cfg.mesActivo) s.add(S.cfg.mesActivo);
  return [...s].filter(x => /^\d{4}-\d{2}$/.test(x)).sort();
}
function elegirMes() {
  const ids = mesesDisp();
  if (S.mesId && ids.includes(S.mesId)) return;
  S.mesId = ids.includes(S.cfg.mesActivo) ? S.cfg.mesActivo : ids.includes(mesHoy()) ? mesHoy() : ids[ids.length - 1] || mesHoy();
}
const ultimoMes = () => { const ids = mesesDisp(); return ids[ids.length - 1] || null; };

/* ================= cálculo del mes ================= */
function mkLinea(p, c, movs, mid) {
  const pagSum = sum(movs, m => m.monto);
  const pag = r2(movs.length ? pagSum : (+p.pagado || 0));
  const plan = +p.plan || 0, cerrado = !!p.cerrado;
  const tipo = tipoNorm(p.tipo) || (c ? tipoDe(c) : (p.unaVez ? 'Extra' : 'Fijo'));
  const forma = p.forma || (c && c.forma) || 'Pago directo';
  const cta = cuentaRegla({ cuenta: p.cuenta || (c && c.cuenta), forma, tipo });
  const fecha = p.fechaLimite || (c && c.dia ? fechaCiclo(mid, c.dia) : null);
  const pendBase = cerrado ? 0 : Math.max(r2(plan - pag), 0);
  const fuera = pendBase > 0 && !!fecha && fecha > cicloFin(mid); // vence después del 14: lo paga el siguiente ciclo
  return {
    id: p.id, p, c, mid, nombre: p.concepto || (c && c.nombre) || 'Sin nombre', cat: p.categoria || (c && c.categoria) || 'Otros',
    cta, plan, pag, cerrado, sobrante: +p.sobrante || 0, unaVez: !!p.unaVez || !c, movs, tipo, forma,
    variable: tipo === 'Variable' || !!(c && c.variable), extra: tipo === 'Extra', fecha,
    fuera, pendSig: fuera ? pendBase : 0,
    comp: cerrado || fuera ? pag : Math.max(plan, pag), pend: fuera ? 0 : pendBase
  };
}
function lineasMes(mid) {
  const out = [], usados = new Set(), M = S.T.movimientos.filter(m => !esAjuste(m)); // los ajustes de saldo no son gasto
  const movsMes = M.filter(m => mesMov(m) === mid);
  const pagos = S.T.pagos.filter(p => p.mes === mid);
  const ids = new Set(pagos.map(p => p.id));
  pagos.forEach(p => {
    const c = conDe(p.concepto);
    const ms = M.filter(m => !usados.has(m.id) && (m.pagoId ? m.pagoId === p.id : (mesMov(m) === mid && eq(m.concepto, p.concepto))));
    ms.forEach(m => usados.add(m.id));
    out.push(mkLinea(p, c, ms, mid));
  });
  const orf = {};
  movsMes.filter(m => !usados.has(m.id) && !(m.pagoId && ids.has(m.pagoId))).forEach(m => { const k = N(m.concepto) || '-'; (orf[k] = orf[k] || []).push(m); });
  Object.values(orf).forEach(ms => {
    const nombre = ms[0].concepto || 'Sin concepto';
    out.push(mkLinea({ id: 'orf:' + N(nombre) + ':' + mid, mes: mid, concepto: nombre, categoria: ms[0].categoria, plan: 0, unaVez: true, _virtual: true }, conDe(nombre), ms, mid));
  });
  return out;
}
function ingresosMes(mid) {
  return S.T.ingresos.filter(i => mesIng(i) === mid).map(i => {
    const esp = i.esperado != null && i.esperado !== '' ? +i.esperado : (+i.recibido || 0);
    const rec = i.recibidoSi ? (i.recibido != null && i.recibido !== '' ? +i.recibido : esp) : 0;
    return Object.assign({}, i, { esp, rec, dif: i.recibidoSi ? r2(rec - esp) : 0 });
  });
}
function calc(mid) {
  const rows = lineasMes(mid), ing = ingresosMes(mid);
  const ini = sum(S.T.saldos.filter(s => s.mes === mid), s => s.saldo);
  const ingRec = sum(ing.filter(i => i.recibidoSi), i => i.rec), porCobrar = sum(ing.filter(i => !i.recibidoSi), i => i.esp);
  const faltante = sum(ing.filter(i => i.dif < 0), i => -i.dif), excedente = sum(ing.filter(i => i.dif > 0), i => i.dif);
  const ajustes = ajustesMes(mid), aj = sum(ajustes, m => m.monto);
  const recursos = ini + ingRec + aj, comp = sum(rows, r => r.comp), pag = sum(rows, r => r.pag), pend = sum(rows, r => r.pend);
  const ahorros = S.T.ahorros.filter(a => (a.mes || cicloDe(a.fecha)) === mid);
  return { rows, ing, ini, aj, ajustes, ingRec, porCobrar, faltante, excedente, recursos, comp, pag, pend, disp: recursos - pag,
    total: recursos + porCobrar, ahorro: recursos + porCobrar - comp, ahorroReal: recursos - comp, ahorros, ahorroReg: sum(ahorros, a => a.monto) };
}
function saldos(mid, k) {
  const o = {};
  const ensure = n => { const key = N(n || cIng()); if (!o[key]) { const c = cuentaObj(n) || { nombre: n || cIng(), uso: 'Otro' }; o[key] = { nombre: c.nombre, c, ini: 0, ing: 0, tin: 0, tout: 0, pag: 0, aj: 0, pend: 0, n: 0 }; } return o[key]; };
  cuentas().forEach(c => ensure(c.nombre));
  S.T.saldos.filter(s => s.mes === mid).forEach(s => ensure(s.cuenta).ini += +s.saldo || 0);
  k.ing.filter(i => i.recibidoSi).forEach(i => ensure(i.cuenta || cIng()).ing += i.rec);
  S.T.transferencias.filter(t => mesMov(t) === mid).forEach(t => { ensure(t.de).tout += +t.monto || 0; ensure(t.a).tin += +t.monto || 0; });
  k.ahorros.forEach(a => { if (a.de && a.a && !eq(a.de, a.a)) { ensure(a.de).tout += +a.monto || 0; ensure(a.a).tin += +a.monto || 0; } });
  k.rows.forEach(r => { r.movs.forEach(m => ensure(m.cuenta || r.cta).pag += +m.monto || 0); if (!r.movs.length && r.pag) ensure(r.cta).pag += r.pag; const a = ensure(r.cta); a.pend += r.pend; if (r.pend > 0) a.n++; });
  k.ajustes.forEach(m => ensure(m.cuenta).aj += +m.monto || 0);
  Object.values(o).forEach(a => a.saldo = a.ini + a.ing + a.tin - a.tout - a.pag + a.aj);
  return o;
}
function dispersion(k, o) {
  const org = cIng(), ah = cAhorro(), moves = [];
  Object.values(o).forEach(a => {
    if (eq(a.nombre, org)) return;
    let monto, mot;
    if (ah && eq(a.nombre, ah)) { monto = Math.max(0, a.pend) + Math.max(0, k.ahorroReal - a.tin); mot = `Ahorro del mes ${fmt(Math.max(0, k.ahorroReal))}${a.tin ? ' · ya llegaron ' + fmt(a.tin) : ''}`; }
    else { monto = Math.max(0, a.pend - Math.max(0, a.saldo)); mot = `${a.n} pagos pendientes por ${fmt(a.pend)} · saldo estimado ${fmt(a.saldo)}`; }
    moves.push({ a, monto: Math.round(monto), mot });
  });
  const o0 = o[N(org)], libre = o0 ? o0.saldo - o0.pend : 0, tot = sum(moves, x => x.monto);
  return { org, moves, libre, tot, falta: Math.max(0, tot - libre), o0 };
}
function pagosPrevios(nombre, antes) {
  const out = [];
  mesesDisp().filter(m => m < antes).reverse().forEach(m => { const l = lineasMes(m).find(r => eq(r.nombre, nombre)); if (l && l.pag > 0) out.push({ m, v: l.pag }); });
  return out;
}
function estimar(c, mid) { const v = pagosPrevios(c.nombre, mid).slice(0, 3); if (tipoDe(c) === 'Variable' && v.length) return Math.round(sum(v, x => x.v) / v.length); return +c.monto || 0; }
function equivMensual(c) {
  if (c.activo === false || tipoDe(c) === 'Extra') return 0;
  const n = fq(c);
  if (n === 0) { const ids = mesesDisp(); if (!ids.length) return 0; return sum(ids, m => sum(lineasMes(m).filter(r => eq(r.nombre, c.nombre)), r => r.comp)) / ids.length; }
  return (+c.monto || 0) / n;
}
const dueIn = r => r.pend > 0 && r.fecha ? daysTo(r.fecha) : null;

function fugas(k) {
  const out = [], pct = metaPct(), ls = a => a.map(r => esc(r.nombre) + ' ' + fmt(r.comp)).join(' · ');
  const subs = k.rows.filter(r => r.c && r.c.suscripcion && r.comp > 0).sort((a, b) => b.comp - a.comp), sT = sum(subs, r => r.comp);
  if (sT > 0) out.push({ sev: sT >= 1000 ? 'warn' : 'info', t: 'Suscripciones digitales', m: sT, det: ls(subs), acc: 'Deja una o dos plataformas de streaming y rota las demás por temporada. Revisa si necesitas a la vez Claude, ChatGPT, Microsoft y Google.' });
  const neg = k.rows.filter(r => r.c && r.c.negocio && r.comp > 0).sort((a, b) => b.comp - a.comp), nT = sum(neg, r => r.comp);
  if (nT > 0) out.push({ sev: nT >= 3000 ? 'crit' : 'warn', t: 'Gastos de negocio pagados con tu dinero', m: nT, det: ls(neg), acc: 'Cárgalos a Matti Ceramics o NetPay (factura o reembolso). Es dinero recuperable, no gasto personal.' });
  const subio = k.rows.map(r => ({ r, p: pagosPrevios(r.nombre, k.rows[0] ? k.rows[0].mid : S.mesId)[0] })).filter(x => x.p && x.r.pag > 0 && x.r.pag > x.p.v * 1.1), uT = sum(subio, x => x.r.pag - x.p.v);
  if (uT > 0) out.push({ sev: 'warn', t: 'Conceptos que subieron vs. su último pago', m: uT, det: subio.map(x => `${esc(x.r.nombre)} ${fmt(x.p.v)} → ${fmt(x.r.pag)} (+${Math.round((x.r.pag / x.p.v - 1) * 100)}%)`).join(' · '), acc: 'Revisa consumo o tarifa. Si el aumento es permanente, sube el monto base para que la proyección no te engañe.' });
  const ext = k.rows.filter(r => (r.extra || r.unaVez) && !(r.c && r.c.negocio) && r.comp > 0), eT = sum(ext, r => r.comp), eP = k.comp ? eT / k.comp * 100 : 0;
  if (eT > 0) out.push({ sev: eP >= 8 ? 'warn' : 'info', t: 'Gastos improvisados y extras', m: eT, det: `${eP.toFixed(0)}% de lo comprometido · ` + ls(ext), acc: 'Fija un tope mensual de extras y regístralos al momento con “+ Gasto”.' });
  k.rows.filter(r => r.plan > 0 && r.pag > r.plan * 1.05).forEach(r => out.push({ sev: r.variable ? 'warn' : 'crit', t: 'Pagaste más de lo planeado: ' + esc(r.nombre), m: r.pag - r.plan, det: `Plan ${fmt(r.plan)} · pagado ${fmt(r.pag)}`, acc: r.variable ? 'Es variable; la app ajusta la estimación del próximo mes con tus pagos reales.' : 'Ajusta el plan o recorta en otra categoría este mes.' }));
  if (k.faltante > 0) out.push({ sev: 'warn', t: 'Ingresos por debajo de lo esperado', m: k.faltante, det: k.ing.filter(i => i.dif < 0).map(i => `${esc(nomIng(i))} ${fmt(i.esp)} → ${fmt(i.rec)}`).join(' · '), acc: 'Confirma si el faltante llega después. Si es permanente, baja el monto del ingreso fijo.' });
  const meta = k.total * pct / 100;
  if (k.total > 0 && k.ahorro < meta) out.push({ sev: 'crit', t: `Ahorro por debajo de la meta (${pct}%)`, m: meta - k.ahorro, det: `Proyectado ${fmt(k.ahorro)} · meta ${fmt(meta)}`, acc: 'Cierra la brecha con las fugas de arriba antes de recortar lo esencial.', gap: true });
  const top = [...k.rows].sort((a, b) => b.comp - a.comp).slice(0, 3), tT = sum(top, r => r.comp);
  if (k.comp > 0) out.push({ sev: 'info', t: 'Concentración del gasto', m: tT, det: `${(tT / k.comp * 100).toFixed(0)}% está en 3 conceptos: ` + ls(top), acc: 'Aquí está el mayor margen de negociación o ajuste.' });
  const o = { crit: 0, warn: 1, info: 2 }; return out.sort((a, b) => o[a.sev] - o[b.sev] || b.m - a.m);
}

/* ================= operaciones compuestas ================= */
// Recalcula el monto pagado (y el sobrante si está cerrado) de una línea tras cambiar sus movimientos.
function opsLinea(r, nuevoPag, extra) {
  const ops = [];
  const fila = Object.assign({ id: r.id, pagado: r2(nuevoPag) }, extra || {});
  if (r.p && r.p._virtual) Object.assign(fila, { mes: r.mid, concepto: r.nombre, categoria: r.cat, cuenta: r.cta, plan: 0, unaVez: true, tipo: r.tipo, forma: r.forma });
  const cerrado = 'cerrado' in fila ? fila.cerrado : r.cerrado;
  if (cerrado) {
    const sob = Math.max(0, r2(r.plan - nuevoPag));
    if (!('sobrante' in fila)) fila.sobrante = sob;
    const ah = S.T.ahorros.find(a => a.referencia === r.id && eq(a.origen, 'Pago'));
    if (ah && !('sobrante' in (extra || {}))) ops.push(sob > 0 ? G('ahorros', { id: ah.id, monto: sob }) : DEL('ahorros', ah.id));
  }
  ops.unshift(G('pagos', fila));
  return ops;
}
// Para líneas creadas a partir de movimientos sueltos: crea la fila del pago con un ID real.
function materializar(r) {
  if (!(r.p && r.p._virtual)) return { r, ops: [] };
  const id = uid('p');
  const ops = [G('pagos', { id, mes: r.mid, concepto: r.nombre, categoria: r.cat, cuenta: r.cta, plan: 0, pagado: r.pag, unaVez: true, tipo: r.tipo, forma: r.forma })];
  r.movs.forEach(m => ops.push(G('movimientos', { id: m.id, pagoId: id })));
  const nr = Object.assign({}, r, { id, p: { id, mes: r.mid } });
  return { r: nr, ops };
}

/* ================= piezas de vista ================= */
function toast(t, ms) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, ms || 2800); }
function vencChip(r) {
  if (r.cerrado) return `<span class="pill good">Cerrado${r.sobrante > 0 ? ' · ' + fmt(r.sobrante) + ' a ahorro' : ''}</span>`;
  if (r.fuera) return `<span class="pill info">Siguiente ciclo · vence ${fLbl(r.fecha)}</span>`;
  if (r.plan > 0 && r.pend === 0) { const f = r.p.fechaPago; return `<span class="pill good">Pagado${f ? ' ' + fLbl(f) : ''}</span>`; }
  if (r.pend <= 0) return '';
  if (!r.fecha) return '<span class="pill info">Sin fecha</span>';
  const n = daysTo(r.fecha), f = fLbl(r.fecha);
  if (n < 0) return `<span class="pill crit">Venció ${f}</span>`;
  if (n === 0) return '<span class="pill warn">Vence hoy</span>';
  if (n <= 7) return `<span class="pill warn">Vence ${f} · ${n} d</span>`;
  return `<span class="pill info">Vence ${f}</span>`;
}
function rowHTML(r) {
  const done = r.cerrado || (r.plan > 0 && r.pag >= r.plan), part = r.pag > 0 && !done, n = r.c ? fq(r.c) : 1;
  let extra = '';
  if (r.unaVez) extra += '<span class="pill info">Solo este mes</span>';
  if (n !== 1) extra += `<span class="pill info">${fqLbl(n)}</span>`;
  if (r.variable) extra += '<span class="pill info">≈ Variable</span>';
  if (r.pag > 0 && r.plan > 0 && !r.cerrado && Math.abs(r.pag - r.plan) / r.plan > 0.03) { const d = Math.round((r.pag / r.plan - 1) * 100); extra += `<span class="pill ${d > 0 ? 'warn' : 'good'}">${d > 0 ? '+' : ''}${d}% vs plan</span>`; }
  return `<div class="row ${done ? 'paid' : ''}">
    <button class="chk ${done ? 'on' : part ? 'part' : ''}" data-act="toggle" data-id="${esc(r.id)}" aria-label="${done ? 'Ver pago' : 'Registrar pago'}: ${esc(r.nombre)}">${done ? CHECK : ''}</button>
    <button class="main" data-act="editLinea" data-id="${esc(r.id)}"><div class="name">${esc(r.nombre)}</div>
      <div class="meta">${vencChip(r)}<span class="acct"><span class="dot" style="background:${catColor(r.cat)}"></span>${esc(r.cat)}</span><span>${esc(r.forma)}</span>${acctTag(r.cta)}${extra}</div></button>
    <div class="amt"><div class="num">${fmt(r.pag)}</div><div class="of num">de ${r.variable && !done ? '≈' : ''}${fmt(r.plan)}</div></div></div>`;
}
function ingRowHTML(x) {
  const st = x.recibidoSi ? (x.dif < 0 ? `<span class="pill crit">Faltaron ${fmt(-x.dif)}</span>` : x.dif > 0 ? `<span class="pill good">Excedente ${fmt(x.dif)}</span>` : '<span class="pill good">Recibido</span>') : '<span class="pill warn">Por cobrar</span>';
  return `<div class="row ${x.recibidoSi ? 'paid' : ''}">
    <button class="chk ${x.recibidoSi ? 'on' : ''}" data-act="cerrarIng" data-id="${esc(x.id)}" aria-label="${x.recibidoSi ? 'Revisar cobro' : 'Registrar cobro'}: ${esc(nomIng(x))}">${x.recibidoSi ? CHECK : ''}</button>
    <button class="main" data-act="editIng" data-id="${esc(x.id)}"><div class="name">${esc(nomIng(x))}${x.nombre && x.fuente ? ' · ' + esc(x.fuente) : ''}</div>
      <div class="meta">${st}${x.fecha ? `<span>${fLbl(x.fecha)}</span>` : ''}${x.categoria ? `<span class="acct"><span class="dot" style="background:${catIngColor(x.categoria)}"></span>${esc(x.categoria)}</span>` : ''}${acctTag(x.cuenta || cIng())}${x.fijo ? '<span class="pill info">Fijo</span>' : ''}</div></button>
    <div class="amt"><div class="num">${fmt(x.recibidoSi ? x.rec : x.esp)}</div>${x.recibidoSi && x.dif ? `<div class="of num">esperado ${fmt(x.esp)}</div>` : ''}</div></div>`;
}
function movRowHTML(m) {
  return `<div class="row flat"><button class="main" data-act="editMov" data-id="${esc(m.id)}"><div class="name">${esc(m.concepto || 'Movimiento')}</div>
    <div class="meta"><span>${fLbl(m.fecha) || esc(mesLbl(mesMov(m)))}</span>${m.cuenta ? acctTag(m.cuenta) : ''}${m.tipo && !eq(m.tipo, 'Pago') ? `<span class="pill info">${esc(m.tipo)}</span>` : ''}${m.nota ? '<span>' + esc(m.nota) + '</span>' : ''}</div></button>
    <div class="amt num">${fmt(m.monto)}</div></div>`;
}
function ahorroRowHTML(a) {
  const dest = a.meta ? `${acctTag(a.a)}<span class="pill info">Meta: ${esc(a.meta)}</span>` : acctTag(a.a);
  return `<div class="row flat"><button class="main" data-act="editAhorro" data-id="${esc(a.id)}"><div class="name">${esc(a.concepto || a.origen || 'Ahorro')}</div>
    <div class="meta"><span class="pill ${eq(a.origen, 'Ingreso') ? 'good' : eq(a.origen, 'Pago') ? 'info' : 'info'}">${esc(a.origen || 'Manual')}</span>${a.de ? acctTag(a.de) + '<span class="muted">→</span>' : ''}${dest}${a.fecha ? `<span>${fLbl(a.fecha)}</span>` : ''}</div></button>
    <div class="amt num" style="color:var(--teal)">${fmt(a.monto)}</div></div>`;
}
function avisoEstructura() {
  const f = S.faltantes || {}, ks = Object.keys(f);
  if (!ks.length) return '';
  const ESQ = { cuentas: 'Cuentas', categorias: 'Categorías', categoriasIngreso: 'Categorías de ingreso', conceptos: 'Conceptos', historial: 'Historial de montos', pagos: 'Pagos del mes', movimientos: 'Movimientos', ingresos: 'Ingresos', ingresosFijos: 'Ingresos fijos', transferencias: 'Transferencias', saldos: 'Saldos iniciales', metas: 'Metas de ahorro', ahorros: 'Ahorros del mes' };
  return `<div class="box" style="border-color:var(--warn);color:var(--ink)"><b>Tu hoja necesita actualizarse.</b> En Apps Script ejecuta <b>actualizarEstructura()</b> (menú “Finanzas Matt” de la hoja). Faltan: ${ks.map(k => esc(ESQ[k] || k)).join(', ')}. Hasta entonces algunos cambios no se podrán guardar.</div>`;
}

/* ================= vistas ================= */
function vResumen(k) {
  const pct = metaPct(), meta = k.total * pct / 100, ok = k.ahorro >= meta, ap = k.total ? k.ahorro / k.total * 100 : 0;
  const w = v => k.total > 0 ? Math.max(0, Math.min(100, v / k.total * 100)) : 0;
  const cs = {}; k.rows.forEach(r => cs[r.cat] = (cs[r.cat] || 0) + r.comp);
  const cl = Object.entries(cs).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]), mx = cl.length ? cl[0][1] : 1;
  const prox = k.rows.filter(r => { const d = dueIn(r); return d != null && d <= 7; }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const sinDia = k.rows.filter(r => r.pend > 0 && !r.fecha).length;
  const o = saldos(S.mesId, k), dsp = dispersion(k, o);
  const movs = S.T.movimientos.filter(m => !esAjuste(m) && mesMov(m) === S.mesId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 6);
  const abierto = S.mesId === cicloAbierto();
  return `${avisoEstructura()}
  <section class="hero">
    <div class="label">Disponible hoy · todas tus cuentas · ciclo ${cicloRango(S.mesId)}</div>
    <div class="big num">${fmt(k.disp)}</div>
    <div class="sub">de ${fmt(k.recursos)} recibidos${k.aj ? ` (ajustes ${k.aj > 0 ? '+' : ''}${fmt(k.aj)})` : ''}${k.porCobrar ? ` · ${fmt(k.porCobrar)} por cobrar` : ''} · <button class="link" data-act="editMes">saldos iniciales</button> · <button class="link" data-act="ajustar">ajustar saldos</button>${abierto ? ` · <button class="link" data-act="cerrarCiclo">cerrar ${esc(mesN(S.mesId).toLowerCase())}</button>` : ''}</div>
    <div class="meter" role="img" aria-label="Pagado, por pagar y ahorro proyectado">
      <i style="width:${w(k.pag)}%;background:var(--violet)"></i><i style="width:${w(k.pend)}%;background:var(--warn)"></i><i style="width:${w(Math.max(k.ahorro, 0))}%;background:var(--teal)"></i></div>
    <div class="legend"><span><b style="background:var(--violet)"></b>Pagado ${fmt(k.pag)}</span><span><b style="background:var(--warn)"></b>Por pagar ${fmt(k.pend)}</span><span><b style="background:var(--teal)"></b>Ahorro ${fmt(k.ahorro)}</span></div>
  </section>
  <div class="strip">${Object.values(o).map(a => `<button class="chip" data-act="tab" data-v="cuentas"><span class="dot" style="background:${ctaColor(a.nombre)}"></span>${esc(a.nombre)} <b class="num">${fmt(a.saldo)}</b></button>`).join('')}
    ${dsp.tot > 0 ? `<button class="chip" data-act="tab" data-v="cuentas" style="color:var(--cyan)">Por dispersar ${fmt(dsp.tot)} →</button>` : ''}</div>
  <section class="kpis">
    <div class="kpi"><div class="label">Comprometido</div><div class="v">${fmt(k.comp)}</div><div class="h">gasto total del ciclo</div></div>
    <div class="kpi"><div class="label">Pagado</div><div class="v">${fmt(k.pag)}</div><div class="h">${k.comp ? Math.round(k.pag / k.comp * 100) : 0}% del plan</div></div>
    <div class="kpi"><div class="label">Por pagar</div><div class="v">${fmt(k.pend)}</div><div class="h">${k.rows.filter(r => r.pend > 0).length} conceptos</div></div>
    <div class="kpi"><div class="label">Ahorro proyectado</div><div class="v">${fmt(k.ahorro)}</div><div class="h"><span class="pill ${ok ? 'good' : 'crit'}">${ap.toFixed(1)}% · meta ${pct}%</span></div></div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Próximos pagos</h2><button class="link" data-act="tab" data-v="pagos">Calendario completo</button></div>
    ${prox.length ? `<div class="list">${prox.map(rowHTML).join('')}</div>` : '<p class="note">Nada vence en los próximos 7 días.</p>'}
    ${sinDia ? `<div class="bar2" style="margin-top:10px"><p class="note">${sinDia} pagos pendientes sin fecha; no te puedo recordar esos.</p><button class="btn sm" data-act="fechas">Asignar fechas</button></div>` : ''}
  </section>
  <section class="card">
    <div class="sec-h"><h2>Ingresos del mes</h2><button class="link" data-act="newIng">+ Ingreso</button></div>
    ${k.ing.length ? `<div class="list">${k.ing.map(ingRowHTML).join('')}</div>
      <div class="legend"><span>Recibido ${fmt(k.ingRec)}</span><span>Por cobrar ${fmt(k.porCobrar)}</span>${k.faltante ? `<span style="color:var(--crit)">Faltante ${fmt(k.faltante)}</span>` : ''}${k.excedente ? `<span style="color:var(--good)">Excedente ${fmt(k.excedente)}</span>` : ''}</div>`
      : '<p class="note">Registra lo que entra con “+ Ingreso”. Los ingresos fijos aparecen solos cada mes como “por cobrar”.</p>'}
    <p class="note" style="margin-top:8px">Toca el círculo para cerrar un ingreso con el monto real: si llegó menos se registra el faltante; si llegó más puedes mandar el excedente a ahorro.</p>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Gasto por categoría</h2><button class="link" data-act="ajustes">Editar categorías</button></div>
    ${cl.length ? `<div class="cats">${cl.map(([c, v]) => `<div class="cat"><span>${esc(c)}</span><span class="bar"><i style="width:${v / mx * 100}%;background:${catColor(c)}"></i></span><span class="amt num">${fmt(v)}</span></div>`).join('')}</div>` : '<p class="note">Sin gastos este mes.</p>'}
  </section>
  <section class="card">
    <div class="sec-h"><h2>Movimientos recientes</h2><button class="link" data-act="tab" data-v="pagos">Ver todos</button></div>
    ${movs.length ? `<div class="list">${movs.map(movRowHTML).join('')}</div>` : '<p class="note">Registra cada gasto con “+ Gasto” y aquí verás el historial del mes.</p>'}
  </section>`;
}

function vPagos(k) {
  const f = S.filtro, v = S.vista;
  let rows = k.rows.filter(r => !r.fuera);
  const sig = k.rows.filter(r => r.fuera).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (f === 'pend') rows = rows.filter(r => r.pend > 0 || (r.plan === 0 && r.pag === 0 && !r.cerrado));
  if (f === 'pag') rows = rows.filter(r => r.pag > 0 && r.pend === 0 || r.cerrado);
  const conLinea = new Set(k.rows.map(r => N(r.nombre)));
  const noToca = S.T.conceptos.filter(c => c.nombre && c.activo !== false && tipoDe(c) !== 'Extra' && !conLinea.has(N(c.nombre)));
  const sortF = (a, b) => (a.fecha || '9').localeCompare(b.fecha || '9') || b.comp - a.comp;
  const grp = (t, rs, cls = '', tail = '', dot = '') => `<div class="grp"><div class="grp-h ${cls}"><span>${dot}${t} · ${rs.length}</span><span class="num">${fmt(sum(rs, r => f === 'pag' ? r.pag : r.comp))}</span></div><div class="list">${rs.sort(sortF).map(rowHTML).join('')}</div>${tail}</div>`;
  let body = '';
  if (v === 'fecha') {
    const Gs = [['Vencidos', 'crit', r => { const d = dueIn(r); return d != null && d < 0; }], ['Próximos 7 días', 'warn', r => { const d = dueIn(r); return d != null && d >= 0 && d <= 7; }], ['Más adelante este mes', '', r => { const d = dueIn(r); return d != null && d > 7; }], ['Sin fecha asignada', '', r => r.pend > 0 && !r.fecha || (r.plan === 0 && r.pag === 0 && !r.cerrado)], ['Pagados y cerrados', '', r => r.pend === 0]];
    const used = new Set();
    body = Gs.map(([t, cls, fn]) => { const rs = rows.filter(r => !used.has(r.id) && fn(r)); rs.forEach(r => used.add(r.id)); return rs.length ? grp(t, rs, cls) : ''; }).join('');
  } else {
    const key = v === 'cuenta' ? (r => r.cta) : (r => r.cat);
    const by = {}; rows.forEach(r => (by[key(r)] = by[key(r)] || []).push(r));
    const base = v === 'cuenta' ? cuentas().map(c => c.nombre) : catsGasto().map(c => c.nombre);
    const order = [...base, ...Object.keys(by)].filter((x, i, a) => by[x] && a.indexOf(x) === i);
    body = order.map(c => grp(esc(c), by[c], '', '', `<span class="dot" style="background:${v === 'cuenta' ? ctaColor(c) : catColor(c)};margin-right:8px"></span>`)).join('');
  }
  const movs = S.T.movimientos.filter(m => !esAjuste(m) && mesMov(m) === S.mesId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return `
  <div class="sec-h" style="margin:0"><h2>Pagos de ${mesLbl(S.mesId)} <span class="note" style="font-weight:400">· ${cicloRango(S.mesId)}</span></h2><div class="btns"><button class="btn sm" data-act="fechas">Fechas, forma y cuenta</button><button class="btn sm" data-act="newCon">Nuevo concepto</button></div></div>
  <div class="bar2">
    <div class="chips" role="group" aria-label="Filtro">
      <button data-act="filtro" data-v="pend" aria-pressed="${f === 'pend'}">Por pagar · ${fmt(k.pend)}</button>
      <button data-act="filtro" data-v="pag" aria-pressed="${f === 'pag'}">Pagados · ${fmt(k.pag)}</button>
      <button data-act="filtro" data-v="all" aria-pressed="${f === 'all'}">Todos</button></div>
    <div class="chips" role="group" aria-label="Agrupar">
      <button data-act="vista" data-v="fecha" aria-pressed="${v === 'fecha'}">Por fecha</button>
      <button data-act="vista" data-v="cat" aria-pressed="${v === 'cat'}">Por categoría</button>
      <button data-act="vista" data-v="cuenta" aria-pressed="${v === 'cuenta'}">Por cuenta</button></div>
  </div>
  <section class="card">
    ${body || `<p class="note">${f === 'pend' ? 'Todo pagado este mes.' : 'Sin conceptos en este filtro.'}</p>`}
    ${sig.length && f !== 'pag' ? `<div class="grp"><div class="grp-h"><span>Siguiente ciclo · vencen después del ${fLbl(cicloFin(S.mesId))} · ${sig.length}</span><span class="num">${fmt(sum(sig, r => r.pendSig))}</span></div><div class="list">${sig.map(rowHTML).join('')}</div>
      <p class="note" style="margin-top:6px">No cuentan en “Por pagar” de este ciclo: al cerrarlo pasan solos al siguiente. Si alguno sí es de este ciclo, corrige su fecha límite.</p></div>` : ''}
    ${noToca.length ? `<details><summary>No toca este mes (${noToca.length}) · bimestrales, ocasionales y sin cargo</summary><div class="list">${noToca.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => { const n = fq(c), p = proximo(c, S.mesId);
      return `<div class="row flat"><button class="main" data-act="editCon" data-id="${esc(c.id)}"><div class="name">${esc(c.nombre)}</div><div class="meta"><span class="pill info">${n === 0 ? 'Ocasional · cuando compres' : p ? 'Próximo: ' + mesLbl(p) : 'Sin cargo este mes'}</span><span class="acct"><span class="dot" style="background:${catColor(c.categoria)}"></span>${esc(c.categoria || '')}</span></div></button><button class="btn sm" data-act="addLinea" data-id="${esc(c.id)}">Agregar a ${mesN(S.mesId)}</button></div>`; }).join('')}</div></details>` : ''}
  </section>
  <p class="note">Toca el círculo para registrar el pago: ya trae el monto completo, o escribe menos y marca “Cerrar el pago” para mandar el sobrante a ahorro. Toca el nombre para editar o eliminar.</p>
  <section class="card">
    <div class="sec-h"><h2>Movimientos de ${mesN(S.mesId)} · ${movs.length}</h2><button class="link" data-act="newGasto">+ Gasto</button></div>
    ${movs.length ? `<div class="list">${movs.map(movRowHTML).join('')}</div><p class="note" style="margin-top:8px">Toca un movimiento para corregirlo o eliminarlo si lo registraste por error.</p>` : '<p class="note">Sin movimientos este mes.</p>'}
  </section>`;
}

function vCuentas(k) {
  const o = saldos(S.mesId, k), d = dispersion(k, o), tot = sum(Object.values(o), a => a.saldo), org = d.o0;
  const flujo = [
    ...S.T.transferencias.filter(t => mesMov(t) === S.mesId).map(t => ({ tipo: 'tr', id: t.id, de: t.de, a: t.a, monto: t.monto, fecha: t.fecha, n: t.nota })),
    ...k.ahorros.filter(a => a.de && a.a && !eq(a.de, a.a)).map(a => ({ tipo: 'ah', id: a.id, de: a.de, a: a.a, monto: a.monto, fecha: a.fecha, n: 'Ahorro · ' + (a.concepto || a.origen || '') }))
  ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return `
  <section class="hero"><div class="label">Dinero en tus cuentas · estimado</div>
    <div class="big num">${fmt(tot)}</div>
    <div class="sub">Saldo inicial + ingresos recibidos − pagos ± transferencias, ahorros y ajustes de ${mesLbl(S.mesId)} (${cicloRango(S.mesId)}).</div></section>
  <section class="accts">${Object.values(o).map(a => `<div class="acc" style="--c:${ctaColor(a.nombre)}"><div class="n"><span class="dot" style="background:${ctaColor(a.nombre)}"></span>${esc(a.nombre)}${eq(a.nombre, d.org) ? '<span class="pill info">Recibe ingresos</span>' : ''}</div>
      <div class="r">${esc(rolLbl(rolDe(a.c)))}</div><div class="s">${fmt(a.saldo)}</div>
      <div class="r">${a.n ? `${a.n} pagos pendientes · ${fmt(a.pend)}` : 'Sin pagos pendientes'}${a.tin ? ` · recibió ${fmt(a.tin)}` : ''}</div></div>`).join('')}</section>
  <section class="card">
    <div class="sec-h"><h2>Cuánto mover a cada cuenta</h2><button class="link" data-act="newTr">Registrar transferencia</button></div>
    <div class="list">${d.moves.map(x => `<div class="move"><div><div class="flow">${acctTag(d.org)}<span class="arrow">→</span>${acctTag(x.a.nombre)}<b class="num" style="margin-left:4px">${fmt(x.monto)}</b></div><div class="note" style="margin-top:3px">${x.mot}</div></div>
      ${x.monto > 0 ? `<button class="btn sm pri" data-act="doTr" data-id="${esc(x.a.nombre)}" data-v="${x.monto}">Ya lo transferí</button>` : '<span class="pill good">Cubierto</span>'}</div>`).join('') || '<p class="note">Agrega tus cuentas en Ajustes.</p>'}</div>
    <div class="box" style="margin-top:10px">${esc(d.org)} conserva ${fmt(org ? org.pend : 0)} para sus ${org ? org.n : 0} cargos pendientes. Libre para dispersar: <b class="num">${fmt(d.libre)}</b>.${d.falta > 0 ? ` <span class="pill crit">Faltan ${fmt(d.falta)}</span> Espera tus ingresos por cobrar o reduce el envío a ahorro.` : ''}</div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Transferencias y ahorros de ${mesN(S.mesId)}</h2></div>
    ${flujo.length ? `<div class="list">${flujo.map(t => `<div class="row flat"><div class="main"><div class="flow" style="font-weight:500">${acctTag(t.de)}<span class="arrow">→</span>${acctTag(t.a)}</div><div class="meta">${fLbl(t.fecha)}${t.n ? ' · ' + esc(t.n) : ''}</div></div><div class="amt"><div class="num">${fmt(t.monto)}</div><button class="del" data-act="${t.tipo === 'tr' ? 'delTr' : 'editAhorro'}" data-id="${esc(t.id)}">${t.tipo === 'tr' ? 'Quitar' : 'Editar'}</button></div></div>`).join('')}</div>` : '<p class="note">Cuando muevas dinero entre cuentas, márcalo aquí para que los saldos cuadren.</p>'}
  </section>
  <section class="card">
    <div class="sec-h"><h2>Ajustes de saldo · ${k.ajustes.length}</h2><button class="link" data-act="ajustar">Ajustar saldos</button></div>
    ${k.ajustes.length ? `<div class="list">${k.ajustes.map(ajusteRowHTML).join('')}</div>` : '<p class="note">Si lo que dice tu banco no cuadra con la app, usa “Ajustar saldos”: la diferencia queda registrada sin contar como gasto ni como ahorro.</p>'}
  </section>
  <div class="btns"><button class="btn pri" data-act="ajustar">Ajustar saldos</button><button class="btn" data-act="ajustes">Editar cuentas</button><button class="btn" data-act="editMes">Saldos iniciales del ciclo</button></div>`;
}

function vFugas(k) {
  const fs = fugas(k), rec = sum(fs.filter(x => x.sev !== 'info' && !x.gap), x => x.m);
  return `
  <section class="hero"><div class="label">Fugas detectadas · ${mesLbl(S.mesId)}</div>
    <div class="big num">${fmt(rec)}</div>
    <div class="sub">al mes · ${fmt(rec * 12)} al año si no cambias nada. Suma de alertas rojas y ámbar.</div></section>
  <section class="card stack">
    ${fs.length ? fs.map(x => `<div class="leak ${x.sev}"><div class="top"><span class="t">${x.t}</span><span class="m">${fmt(x.m)} <span class="muted" style="font-size:12px">· ${fmt(x.m * 12)}/año</span></span></div>
      <div class="det">${x.det}</div><div>${x.acc}</div></div>`).join('<hr class="sep">') : '<p class="note">Sin fugas este mes.</p>'}
  </section>
  <p class="note">Marca un concepto como “Suscripción”, “Negocio” o tipo “Variable” al editarlo para que entre en estas reglas.</p>`;
}

function vAhorro(k) {
  const ing = ingresoMensual(), pct = metaPct(), nf = fijosActivos().length;
  const cons = S.T.conceptos.filter(c => c.nombre);
  const base = sum(cons, equivMensual);
  const subsEnt = sum(k.rows.filter(r => r.c && r.c.suscripcion && !r.c.negocio), r => r.comp);
  const neg = sum(cons.filter(c => c.negocio && tipoDe(c) !== 'Extra'), equivMensual);
  const ms = metas(), aport = sum(ms.filter(m => m.activa !== false), m => m.aporte);
  const acum = cuentasAhorro(saldos(S.mesId, k));
  const mens = ing - base, opt = mens + subsEnt + neg, Nn = 12, A = [], B = []; let a = k.ahorro, b = k.ahorro;
  for (let i = 0; i < Nn; i++) { a += mens; b += opt; A.push(a); B.push(b); }
  const lab = []; for (let i = 1; i <= Nn; i++) lab.push(mesN(addM(S.mesId, i)).slice(0, 3));
  return `
  <section class="hero"><div class="label">Ahorro acumulado en 12 meses</div>
    <div class="big num">${fmt(A[Nn - 1])}</div>
    <div class="sub">Con tu gasto base actual. Con fugas corregidas: <b class="num" style="color:var(--teal)">${fmt(B[Nn - 1])}</b>.</div>
    ${acum.length ? `<div class="sub">Ahorro acumulado hoy: <b class="num" style="color:var(--teal)">${fmt(sum(acum, a => a.saldo))}</b> en ${acum.map(a => esc(a.nombre)).join(', ')} · se arrastra al cerrar cada ciclo.</div>` : ''}</section>
  <section class="card">${chart(A, B, lab)}
    <div class="legend"><span><b style="background:var(--violet)"></b>Plan actual · ${fmt(mens)}/mes</span><span><b style="background:var(--cyan)"></b>Sin streaming y con gastos de negocio reembolsados · ${fmt(opt)}/mes</span></div></section>
  <section class="kpis">
    <div class="kpi"><div class="label">Ingreso mensual</div><div class="v">${fmt(ing)}</div><div class="h">${nf ? 'suma de ingresos fijos' : 'estimado editable'}</div></div>
    <div class="kpi"><div class="label">Gasto base</div><div class="v">${fmt(base)}</div><div class="h">equivalente mensual</div></div>
    <div class="kpi"><div class="label">Ahorrado este mes</div><div class="v">${fmt(k.ahorroReg)}</div><div class="h">sobrantes, excedentes y abonos</div></div>
    <div class="kpi"><div class="label">Meta de ahorro</div><div class="v">${pct}%</div><div class="h">${fmt(ing * pct / 100)}/mes · <span class="pill ${aport <= mens ? 'good' : 'crit'}">aportes ${aport <= mens ? 'caben' : 'exceden'}</span></div></div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Ahorro registrado en ${mesN(S.mesId)}</h2><button class="link" data-act="newAhorro">+ Ahorro</button></div>
    ${k.ahorros.length ? `<div class="list">${k.ahorros.map(ahorroRowHTML).join('')}</div>` : '<p class="note">Cuando cierres un pago con sobrante o un ingreso con excedente, aquí verás cuánto, de dónde sale y dónde queda.</p>'}
  </section>
  <div class="btns"><button class="btn" data-act="editCfg">Editar supuestos</button><button class="btn pri" data-act="newMeta">Nueva meta de ahorro</button>${S.mesId === cicloAbierto() ? `<button class="btn" data-act="cerrarCiclo">Cerrar ${mesLbl(S.mesId)}</button>` : ''}</div>
  <section class="card">
    <div class="sec-h"><h2>Metas de ahorro</h2></div>
    ${ms.length ? `<div class="stack">${ms.map(g => { const ah = metaAhorrado(g), p = g.objetivo ? Math.min(100, ah / g.objetivo * 100) : 0, falt = Math.max(0, (+g.objetivo || 0) - ah), n = g.aporte > 0 ? Math.ceil(falt / g.aporte) : null;
      return `<div class="goal"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><button class="link" data-act="editMeta" data-id="${esc(g.id)}" style="color:var(--ink)">${esc(g.nombre)}</button><span class="num">${fmt(ah)} / ${fmt(g.objetivo || 0)}</span></div>
      <div class="bar"><i style="width:${p}%"></i></div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:6px;font-size:13px;color:var(--muted);flex-wrap:wrap"><span>${g.aporte ? fmt(g.aporte) + '/mes' : 'Sin aporte fijo'}${n != null ? ' · ' + (n ? n + ' meses' : 'meta cumplida') : ''}${g.cuenta ? ' · ' + esc(g.cuenta) : ''}</span>${g.aporte ? `<button class="link" data-act="abonar" data-id="${esc(g.id)}">Registrar aporte</button>` : ''}</div></div>`; }).join('')}</div>`
      : '<p class="note">Crea una meta (fondo de emergencia, viaje, equipo para Matti) con un aporte mensual. Los sobrantes y excedentes pueden ir directo a una meta.</p>'}
  </section>
  <p class="note">Gasto base mensual: los bimestrales cuentan a la mitad, los anuales a 1/12 y los ocasionales con su promedio real. Los extras no cuentan.</p>`;
}

function vAjustes() {
  const cnt = {}; S.T.conceptos.forEach(c => cnt[N(c.categoria)] = (cnt[N(c.categoria)] || 0) + 1);
  const icnt = {}; S.T.ingresosFijos.forEach(c => icnt[N(c.categoria)] = (icnt[N(c.categoria)] || 0) + 1); S.T.ingresos.forEach(c => icnt[N(c.categoria)] = (icnt[N(c.categoria)] || 0) + 1);
  const ccnt = {}; S.T.conceptos.filter(c => c.activo !== false).forEach(c => { const n = N(cuentaRegla({ cuenta: c.cuenta, forma: c.forma, tipo: tipoDe(c) })); ccnt[n] = (ccnt[n] || 0) + 1; });
  const act = S.T.conceptos.filter(c => c.nombre && c.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const ina = S.T.conceptos.filter(c => c.nombre && c.activo === false);
  const fA = S.T.ingresosFijos.filter(f => (f.nombre || f.fuente) && f.activo !== false), fI = S.T.ingresosFijos.filter(f => (f.nombre || f.fuente) && f.activo === false);
  const catRow = (c, i, tipo, n) => `<div class="row flat"><button class="main" data-act="${tipo}" data-id="${esc(c.id || '')}" data-v="${esc(c.nombre)}"><div class="name"><span class="dot" style="background:${tipo === 'editCatIng' ? catIngColor(c.nombre) : catColor(c.nombre)};margin-right:8px"></span>${esc(c.nombre)}${c.activa === false ? ' <span class="pill info">Inactiva</span>' : ''}${!c.id ? ' <span class="pill warn">Sin registrar</span>' : ''}</div></button><span class="note">${n} ${tipo === 'editCatIng' ? 'ingresos' : 'conceptos'}</span></div>`;
  const api = S.api || {};
  return `
  <section class="hero"><div class="label">Ajustes</div><div class="big" style="font-size:clamp(30px,7vw,42px)">Cuentas, categorías, conceptos e ingresos</div></section>
  ${avisoEstructura()}
  <section class="card">
    <div class="sec-h"><h2>Conexión</h2><button class="link" data-act="conexion">Cambiar URL o clave</button></div>
    <div class="kv"><span>Hoja</span><span>${S.sync === 'err' ? 'Error' : S.api ? 'Conectada' : 'Sin conectar'}</span><span>API</span><span>…${esc(String(api.url || '').slice(-18))}</span><span>Última sincronización</span><span>${S.ts ? new Date(S.ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span><span>Versión de la API</span><span>${esc(S.apiVersion || '—')}${S.apiVersion && S.apiVersion < API_ESPERADA ? ' · vieja: publica nueva versión' : ''}</span><span>Cambios por guardar</span><span>${S.outbox.length}</span></div>
    ${S.syncMsg && S.sync === 'err' ? `<div class="box" style="color:var(--crit)">${esc(S.syncMsg)}</div>` : ''}
    ${LS.get('fm_migracion', '') ? `<details><summary>Qué cambió en tu hoja al conectarla</summary><pre class="box" style="white-space:pre-wrap;font-size:12px">${esc(LS.get('fm_migracion', ''))}</pre></details>` : ''}
    <div class="btns"><button class="btn sm" data-act="sincronizar">Sincronizar ahora</button>${S.install ? '<button class="btn sm pri" data-act="instalar">Instalar en este dispositivo</button>' : ''}<button class="btn sm dan" data-act="olvidar">Borrar datos de este dispositivo</button></div>
    ${S.install ? '' : '<p class="note">Para instalarla: en Android o Chrome usa “Instalar app” del menú; en iPhone, Compartir → “Agregar a inicio”.</p>'}
  </section>
  <section class="card">
    <div class="sec-h"><h2>Cuentas</h2><button class="link" data-act="newCta">+ Nueva cuenta</button></div>
    <div class="list">${(S.T.cuentas || []).filter(c => c.nombre).map((c, i) => `<div class="row flat"><button class="main" data-act="editCta" data-id="${esc(c.id)}"><div class="name"><span class="dot" style="background:${colorDe(c, i)};margin-right:8px"></span>${esc(c.nombre)}${c.activa === false ? ' <span class="pill info">Inactiva</span>' : ''}</div>
      <div class="meta">${esc(rolLbl(rolDe(c)))}${eq(c.nombre, cIng()) ? '<span class="pill info">Recibe ingresos</span>' : ''}</div></button><span class="note">${ccnt[N(c.nombre)] || 0} conceptos</span></div>`).join('') || '<p class="note">Sin cuentas.</p>'}</div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Categorías de gasto</h2><button class="link" data-act="newCat">+ Nueva categoría</button></div>
    <div class="list">${catsGasto().map((c, i) => catRow(c, i, 'editCat', cnt[N(c.nombre)] || 0)).join('')}</div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Categorías de ingreso</h2><button class="link" data-act="newCatIng">+ Nueva categoría</button></div>
    <div class="list">${catsIngreso().map((c, i) => catRow(c, i, 'editCatIng', icnt[N(c.nombre)] || 0)).join('') || '<p class="note">Ejemplos: Comisión, Venta, Honorarios, Reembolso de negocio.</p>'}</div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Conceptos de gasto · ${act.length}</h2><button class="link" data-act="newCon">+ Nuevo concepto</button></div>
    <div class="list">${act.map(c => `<div class="row flat"><button class="main" data-act="editCon" data-id="${esc(c.id)}"><div class="name">${esc(c.nombre)}</div><div class="meta"><span class="acct"><span class="dot" style="background:${catColor(c.categoria)}"></span>${esc(c.categoria)}</span><span>${esc(tipoDe(c))}</span><span>${esc(formaDe(c))}</span>${acctTag(cuentaRegla({ cuenta: c.cuenta, forma: c.forma, tipo: tipoDe(c) }))}<span>${fqLbl(fq(c))}</span></div></button><span class="num note">${fmt(+c.monto || 0)}</span></div>`).join('')}</div>
    ${ina.length ? `<details><summary>Inactivos (${ina.length})</summary><div class="list">${ina.map(c => `<div class="row flat"><button class="main" data-act="editCon" data-id="${esc(c.id)}"><div class="name">${esc(c.nombre)}</div><div class="meta">${esc(c.categoria)}</div></button><button class="btn sm" data-act="reactivar" data-id="${esc(c.id)}">Reactivar</button></div>`).join('')}</div></details>` : ''}
  </section>
  <section class="card">
    <div class="sec-h"><h2>Ingresos fijos · ${fA.length}</h2><button class="link" data-act="newFijo">+ Ingreso fijo</button></div>
    <div class="list">${fA.map(f => `<div class="row flat"><button class="main" data-act="editFijo" data-id="${esc(f.id)}"><div class="name">${esc(f.nombre || f.fuente)}</div><div class="meta">${f.fuente && f.nombre ? '<span>' + esc(f.fuente) + '</span>' : ''}${f.categoria ? `<span class="acct"><span class="dot" style="background:${catIngColor(f.categoria)}"></span>${esc(f.categoria)}</span>` : ''}${acctTag(f.cuenta || cIng())}${f.dia ? '<span>Día ' + f.dia + '</span>' : ''}</div></button><span class="num note">${fmt(f.monto)}</span></div>`).join('') || '<p class="note">Sin ingresos fijos. Al registrar un ingreso puedes marcarlo como fijo.</p>'}</div>
    ${fI.length ? `<details><summary>Inactivos (${fI.length})</summary><div class="list">${fI.map(f => `<div class="row flat"><button class="main" data-act="editFijo" data-id="${esc(f.id)}"><div class="name">${esc(f.nombre || f.fuente)}</div></button><button class="btn sm" data-act="reactivarFijo" data-id="${esc(f.id)}">Reactivar</button></div>`).join('')}</div></details>` : ''}
  </section>`;
}

function chart(A, B, lab) {
  const W = 640, H = 220, pl = 56, pr = 12, pt = 12, pb = 26, all = [...A, ...B, 0];
  let mn = Math.min(...all), mx = Math.max(...all); if (mx === mn) mx = mn + 1;
  const step = Math.pow(10, Math.floor(Math.log10((mx - mn) / 4 || 1))); const nice = [1, 2, 2.5, 5, 10].map(x => x * step).find(s => (mx - mn) / s <= 5) || step * 10;
  mn = Math.floor(mn / nice) * nice; mx = Math.ceil(mx / nice) * nice;
  const x = i => pl + (W - pl - pr) * i / (A.length - 1), y = v => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  let g = ''; for (let v = mn; v <= mx + 1e-6; v += nice) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v === 0 ? 1.5 : 1}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-MX') + 'k' : v}</text>`;
  const path = s => s.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const area = `${path(B)} L${x(B.length - 1)} ${y(Math.max(mn, 0))} L${x(0)} ${y(Math.max(mn, 0))} Z`;
  const xl = lab.map((l, i) => i % 2 === 0 || i === lab.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${l}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Proyección de ahorro acumulado a 12 meses">${g}
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FD6F0" stop-opacity=".28"/><stop offset="1" stop-color="#4FD6F0" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#ga)"/><path d="${path(B)}" fill="none" stroke="var(--cyan)" stroke-width="2.5"/>
    <path d="${path(A)}" fill="none" stroke="var(--violet)" stroke-width="2" stroke-dasharray="5 4"/>
    <circle cx="${x(B.length - 1)}" cy="${y(B[B.length - 1])}" r="4" fill="var(--cyan)"/><circle cx="${x(A.length - 1)}" cy="${y(A[A.length - 1])}" r="4" fill="var(--violet)"/>${xl}</svg>`;
}

function vSetup() {
  const a = S.api || {};
  return `<div class="setup">
    <img class="logo" src="icons/icon-192.png" alt="">
    <div><h2 style="font-size:26px">Conecta tu hoja</h2><p class="note">La app lee y guarda en tu Google Sheet personal mediante tu API de Apps Script. La URL y la clave se quedan solo en este dispositivo.</p></div>
    <form class="card" id="setupForm" novalidate>
      ${fld('s_url', 'URL de la API (termina en /exec)', a.url || '', 'url', 'required placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"')}
      ${fld('s_key', 'Clave secreta (la primera vez invéntala: mínimo 8 caracteres)', a.clave || '', 'password', 'required autocomplete="new-password" minlength="8"')}
      <div class="btns" style="justify-content:flex-end"><button class="btn pri">Conectar</button></div>
      <ol><li>Apps Script → Implementar → Nueva implementación → Aplicación web, acceso “Cualquier usuario”. Copia la URL.</li><li>Pégala aquí e inventa tu clave. La primera conexión guarda la clave y prepara tu hoja sola.</li><li>En tus otros dispositivos usa la misma URL y clave.</li></ol>
    </form></div>`;
}

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'));
  $('#gear').setAttribute('aria-pressed', S.tab === 'ajustes');
  setSync(S.sync);
  const v = $('#view');
  if (!S.api) { $('#fabs').hidden = true; $('#tabs').hidden = true; $('#mesNav').hidden = true; v.innerHTML = vSetup(); bindSetup(); return; }
  $('#tabs').hidden = false; $('#mesNav').hidden = false;
  if (!S.T) { $('#fabs').hidden = true; v.innerHTML = '<div class="empty"><h2>Cargando tus cuentas…</h2><p>Conectando con tu hoja.</p></div>'; return; }
  elegirMes();
  const ids = mesesDisp(), i = ids.indexOf(S.mesId);
  $('#mLbl').textContent = mesLbl(S.mesId); $('#mLbl').title = 'Ciclo ' + cicloRango(S.mesId); $('#mPrev').disabled = i <= 0; $('#mNext').disabled = i < 0 || i >= ids.length - 1;
  $('#fabs').hidden = S.tab === 'ajustes';
  if (S.tab === 'ajustes') { v.innerHTML = vAjustes(); return; }
  const k = calc(S.mesId);
  v.innerHTML = S.tab === 'pagos' ? vPagos(k) : S.tab === 'cuentas' ? vCuentas(k) : S.tab === 'fugas' ? vFugas(k) : S.tab === 'ahorro' ? vAhorro(k) : vResumen(k);
}

/* ================= formularios: piezas ================= */
function openSheet(html, onSubmit, wide) {
  $('#modal').innerHTML = `<div class="scrim" id="scrim"><form class="sheet ${wide ? 'wide' : ''}" id="sheet" novalidate>${html}</form></div>`;
  $('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeSheet(); });
  const f = $('#sheet');
  f.addEventListener('submit', e => { e.preventDefault(); onSubmit(new FormData(f), e.submitter && e.submitter.value); });
  f.addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeSheet(); });
  bindWhen(f);
  const first = f.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select');
  if (first && matchMedia('(min-width:700px)').matches) first.focus({ preventScroll: true });
  return f;
}
function closeSheet() { $('#modal').innerHTML = ''; render(); }
function bindWhen(f) {
  const up = () => {
    const fd = new FormData(f);
    f.querySelectorAll('[data-when]').forEach(el => {
      el.hidden = !el.dataset.when.split('&').every(w => {
        const m = w.match(/^([\w]+)(!?=)(.*)$/);
        if (m) { const v = String(fd.get(m[1]) ?? ''); return m[2] === '=' ? v === m[3] : v !== m[3]; }
        return !!fd.get(w);
      });
    });
  };
  f.addEventListener('change', up); f.addEventListener('input', up); up();
}
const fld = (id, lab, val, type = 'text', extra = '') => `<div class="fld"><label for="${id}">${lab}</label><input id="${id}" name="${id}" type="${type === 'number' ? 'text' : type}" value="${esc(val ?? '')}" ${type === 'number' ? 'inputmode="decimal"' : ''} ${extra}></div>`;
const sel = (id, lab, opts, val, extra = '') => `<div class="fld"><label for="${id}">${lab}</label><select id="${id}" name="${id}" ${extra}>${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></div>`;
const tog = (id, lab, on) => `<label class="tog"><input type="checkbox" id="${id}" name="${id}" ${on ? 'checked' : ''}> ${lab}</label>`;
const seg = (name, lab, opts, val) => `<div class="fld">${lab ? `<span class="label">${lab}</span>` : ''}<div class="seg" role="radiogroup" ${lab ? `aria-label="${esc(lab)}"` : ''}>${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(val) ? 'checked' : ''}>${esc(t)}</label>`).join('')}</div></div>`;
const swatches = (name, val) => { const i = Math.max(0, PAL.indexOf(val)); return `<div class="fld"><span class="label">Color</span><div class="swatches">${PAL.map((c, j) => `<label style="--c:${c}" aria-label="Color ${j + 1}"><input type="radio" name="${name}" value="${c}" ${j === i ? 'checked' : ''}><span></span></label>`).join('')}</div></div>`; };
const actions = (save = 'Guardar', more = '') => `<div class="btns" style="justify-content:flex-end">${more}<button type="button" class="btn" data-close>Cancelar</button><button class="btn pri" value="save">${save}</button></div>`;
function ctaSel(id, lab, val, rule) {
  const L = cuentas().map(c => c.nombre);
  if (val && !L.some(n => eq(n, val))) L.push(val);
  return `<div class="fld"><label for="${id}">${lab}</label><select id="${id}" name="${id}">${rule ? `<option value="" ${!val ? 'selected' : ''}>Según regla automática</option>` : ''}${L.map(n => `<option value="${esc(n)}" ${eq(n, val) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
}
function catSel(id, lab, list, val) {
  const names = list.map(c => c.nombre); if (val && !names.some(n => eq(n, val))) names.unshift(val);
  return `<div class="fld"><label for="${id}">${lab}</label><select id="${id}" name="${id}">${names.map(n => `<option value="${esc(n)}" ${eq(n, val) ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="__nueva" ${!names.length ? 'selected' : ''}>+ Nueva categoría…</option></select></div>
    <div data-when="${id}=__nueva">${fld(id + '_n', 'Nombre de la categoría nueva', '', 'text', 'maxlength="40"')}</div>`;
}
const metaSel = (id, lab, val) => sel(id, lab, [['', 'Ninguna'], ...metas().filter(m => m.activa !== false || eq(m.nombre, val)).map(m => [m.nombre, m.nombre])], val || '');
function resolverCat(fd, id, tabla) {
  const v = fd.get(id);
  if (v !== '__nueva') return { nombre: v, ops: [] };
  const n = String(fd.get(id + '_n') || '').trim();
  if (!n) return { error: 'Escribe el nombre de la categoría nueva.' };
  const ex = (S.T[tabla] || []).find(c => eq(c.nombre, n));
  if (ex) return { nombre: ex.nombre, ops: [] };
  return { nombre: n, ops: [G(tabla, { id: uid('k'), nombre: n, color: PAL[(S.T[tabla] || []).length % PAL.length], activa: true })] };
}
function ahorroBox(p, de, metaVal, aVal) {
  return `<div class="two">${ctaSel(p + '_de', 'Sale de la cuenta', de)}${ctaSel(p + '_a', 'Queda en la cuenta', aVal || cAhorro() || de)}</div>${metaSel(p + '_m', 'Asignar a una meta (opcional)', metaVal)}`;
}
function bindMetaCuenta(f, p) {
  const m = f.querySelector('#' + p + '_m'); if (!m) return;
  m.addEventListener('change', () => { const g = metas().find(x => eq(x.nombre, m.value)); if (g && g.cuenta) f.querySelector('#' + p + '_a').value = g.cuenta; });
}
const opAhorro = (fd, p, o) => G('ahorros', Object.assign({ id: uid('a'), nota: '', de: fd.get(p + '_de') || '', a: fd.get(p + '_a') || '', meta: fd.get(p + '_m') || '' }, o));
const fechaDef = () => S.mesId === mesHoy() ? hoyISO() : cicloIni(S.mesId);
let armed = null;
const arm = (k, msg) => { if (armed === k) { armed = null; return true; } armed = k; toast(msg || 'Toca otra vez para confirmar.'); setTimeout(() => { if (armed === k) armed = null; }, 4000); return false; };
const linea = id => calc(S.mesId).rows.find(r => r.id === id);
const ahorroDe = (ref, origen) => S.T.ahorros.find(a => a.referencia === ref && eq(a.origen, origen));
function diffBox(el, v, txt) { el.className = 'diff ' + (v > 0 ? 'good' : v < 0 ? 'crit' : 'info'); el.innerHTML = txt; }

/* ================= gastos ================= */
function sheetGasto(preId) {
  const k = calc(S.mesId);
  const abiertas = k.rows.filter(r => !r.cerrado);
  const byCat = {}; abiertas.forEach(r => (byCat[r.cat] = byCat[r.cat] || []).push(r));
  const opts = Object.keys(byCat).sort().map(c => `<optgroup label="${esc(c)}">${byCat[c].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(r => `<option value="${esc(r.id)}" ${r.id === preId ? 'selected' : ''}>${esc(r.nombre)}${r.pend ? ' · faltan ' + fmt(r.pend) : ''}</option>`).join('')}</optgroup>`).join('');
  const cats = catsActivas(catsGasto());
  const f = openSheet(`<h3>Registrar gasto</h3>
    ${seg('g_modo', '', [['con', 'De un concepto del mes'], ['imp', 'Improvisado']], abiertas.length ? 'con' : 'imp')}
    <div data-when="g_modo=con" class="stack">
      <div class="fld"><label for="g_l">Concepto</label><select id="g_l" name="g_l">${opts}</select></div>
      <div class="box" id="g_info"></div>
    </div>
    <div data-when="g_modo=imp" class="stack">
      ${fld('g_n', 'Nombre del gasto', '', 'text', 'maxlength="80" placeholder="Ej. Regalo, reparación, comida fuera"')}
      ${catSel('g_c', 'Categoría', cats, cats[0] && cats[0].nombre)}
      ${seg('g_t', 'Tipo de gasto', TIPOS.map(t => [t, t]), 'Extra')}
      ${sel('g_fo', 'Forma de pago', FORMAS, 'Pago directo')}
      ${seg('g_p', '¿Se repite?', [['una', 'Solo este mes'], ['perm', 'Permanente']], 'una')}
      <div data-when="g_p=perm" class="two">${sel('g_q', 'Frecuencia', FREQ, 1)}${fld('g_d', 'Día de pago (1–31)', +fechaDef().slice(8), 'number')}</div>
      <p class="note" data-when="g_p=perm">Se crea un concepto que aparece en los meses siguientes con este monto como base.</p>
    </div>
    <div class="two">${fld('g_m', 'Monto (MXN)', '', 'number', 'required')}${fld('g_f', 'Fecha', fechaDef(), 'date')}</div>
    <div class="two">${ctaSel('g_a', 'Pagado desde', cIng())}${fld('g_nt', 'Nota (opcional)', '', 'text', 'maxlength="80"')}</div>
    <div data-when="g_modo=con" class="stack">
      ${tog('g_x', 'Cerrar este pago: ya no gastaré más en este concepto este mes', false)}
      <div data-when="g_x" class="sub-box"><div class="diff info" id="g_sob"></div><div id="g_ahw">${ahorroBox('gs', cIng())}</div></div>
    </div>
    ${actions('Registrar')}`, fd => {
    const modo = fd.get('g_modo'), monto = num(fd.get('g_m')), fecha = fd.get('g_f') || fechaDef(), cuenta = fd.get('g_a'), nota = String(fd.get('g_nt') || '').trim();
    if (modo === 'con') {
      let r = k.rows.find(x => x.id === fd.get('g_l')); if (!r) { toast('Elige un concepto.'); return; }
      const cerrar = !!fd.get('g_x');
      if (!(monto > 0) && !cerrar) { toast('Escribe un monto mayor a cero.'); return; }
      const mz = materializar(r); r = mz.r; const ops = mz.ops;
      if (monto > 0) ops.push(G('movimientos', { id: uid('m'), mes: S.mesId, fecha, concepto: r.nombre, categoria: r.cat, monto, cuenta, nota, tipo: 'Pago', pagoId: r.id }));
      const nuevo = r2(r.pag + monto), extra = { fechaPago: fecha };
      if (cerrar) {
        const sob = Math.max(0, r2(r.plan - nuevo));
        Object.assign(extra, { cerrado: true, sobrante: sob });
        if (sob > 0) ops.push(opAhorro(fd, 'gs', { mes: S.mesId, fecha, origen: 'Pago', concepto: r.nombre, monto: sob, referencia: r.id }));
      }
      ops.push(...opsLinea(r, nuevo, extra));
      closeSheet();
      commit(ops, 'Gasto ' + r.nombre, (monto > 0 ? 'Gasto registrado: ' + fmt(monto) : 'Pago cerrado') + (cerrar && extra.sobrante > 0 ? ' · ' + fmt(extra.sobrante) + ' a ahorro' : ''));
      return;
    }
    const nombre = String(fd.get('g_n') || '').trim();
    if (!nombre) { toast('Escribe el nombre del gasto.'); return; }
    if (!(monto > 0)) { toast('Escribe un monto mayor a cero.'); return; }
    const cat = resolverCat(fd, 'g_c', 'categorias'); if (cat.error) { toast(cat.error); return; }
    const perm = fd.get('g_p') === 'perm', tipo = fd.get('g_t'), forma = fd.get('g_fo');
    if (perm && conDe(nombre)) { toast('Ya existe un concepto con ese nombre. Elígelo en “De un concepto del mes” o usa otro nombre.', 5000); return; }
    const ops = [...cat.ops], pid = uid('p');
    if (perm) {
      const q = +fd.get('g_q'); let dia = Math.round(num(fd.get('g_d'))); dia = dia >= 1 && dia <= 31 ? dia : '';
      ops.push(G('conceptos', { id: uid('c'), nombre, categoria: cat.nombre, tipo, forma, cuenta, frecuencia: fqLbl(q), ancla: q > 1 ? S.mesId : '', dia, monto, variable: tipo === 'Variable', suscripcion: false, negocio: false, activo: true }));
    }
    ops.push(G('pagos', { id: pid, mes: S.mesId, concepto: nombre, categoria: cat.nombre, tipo, forma, cuenta, plan: monto, pagado: monto, fechaPago: fecha, cerrado: false, sobrante: 0, unaVez: !perm }));
    ops.push(G('movimientos', { id: uid('m'), mes: S.mesId, fecha, concepto: nombre, categoria: cat.nombre, monto, cuenta, nota, tipo: 'Gasto improvisado', pagoId: pid }));
    closeSheet();
    commit(ops, 'Gasto ' + nombre, 'Gasto registrado: ' + fmt(monto) + (perm ? ' · concepto permanente' : ''));
  });
  const $f = s => f.querySelector(s);
  const upd = () => {
    const modo = new FormData(f).get('g_modo');
    if (modo === 'con') {
      const r = k.rows.find(x => x.id === $f('#g_l').value); if (!r) return;
      $f('#g_info').innerHTML = `Plan ${fmt(r.plan)} · pagado ${fmt(r.pag)} · ${r.pend ? 'faltan ' + fmt(r.pend) : 'sin pendiente'}${r.c ? ' · ' + esc(fqLbl(fq(r.c))) : ''}`;
      const m = num($f('#g_m').value), sob = Math.max(0, r2(r.plan - r.pag - m));
      diffBox($f('#g_sob'), sob > 0 ? 1 : 0, sob > 0 ? `<span>Sobrante que va a ahorro</span><b>${fmt(sob)}</b>` : '<span>Sin sobrante: se cierra sin mandar nada a ahorro</span>');
      $f('#g_ahw').hidden = !(sob > 0);
    }
  };
  const syncCta = () => {
    const modo = new FormData(f).get('g_modo');
    if (modo === 'con') { const r = k.rows.find(x => x.id === $f('#g_l').value); if (r) { $f('#g_a').value = r.cta; $f('#gs_de').value = r.cta; } }
    else { const fd = new FormData(f); $f('#g_a').value = cuentaRegla({ forma: fd.get('g_fo'), tipo: fd.get('g_t') }); }
  };
  f.addEventListener('input', upd); f.addEventListener('change', e => { if (['g_l', 'g_modo', 'g_fo', 'g_t'].includes(e.target.name)) syncCta(); upd(); });
  bindMetaCuenta(f, 'gs'); syncCta(); upd();
}

// El círculo siempre abre el pago: monto completo ya escrito (un toque en Guardar) y opción de pagar menos o cerrar el pago.
function quickToggle(id) {
  if (!linea(id)) return;
  sheetPago(id);
}

function sheetPago(id) {
  let r = linea(id); if (!r) return;
  const prev = pagosPrevios(r.nombre, S.mesId)[0];
  const ah = ahorroDe(r.id, 'Pago');
  const movs = r.movs.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const head = `<h3>${esc(r.nombre)}</h3>
    <div class="box">Plan ${r.variable ? 'estimado ' : ''}${fmt(r.plan)} · pagado ${fmt(r.pag)}${r.pend ? ' · faltan ' + fmt(r.pend) : ''} · ${esc(r.forma)}${r.c ? ' · ' + fqLbl(fq(r.c)) : ''}${prev ? ` · último pago ${fmt(prev.v)} (${mesLbl(prev.m)})` : ''}</div>
    ${movs.length ? `<div><div class="label">Pagos registrados</div><div class="list">${movs.map(m => `<div class="row flat"><div class="main"><div class="meta"><span>${fLbl(m.fecha)}</span>${acctTag(m.cuenta || r.cta)}${m.nota ? '<span>' + esc(m.nota) + '</span>' : ''}</div></div><div class="amt"><span class="num">${fmt(m.monto)}</span> <button type="button" class="del" data-delmov="${esc(m.id)}">Eliminar</button></div></div>`).join('')}</div></div>` : ''}`;
  if (r.cerrado) {
    const f = openSheet(`${head}
      <div class="diff good"><span>Pago cerrado${r.sobrante > 0 ? ' · sobrante a ahorro' : ''}</span><b>${fmt(r.sobrante)}</b></div>
      ${ah ? `<p class="note">${esc(ah.de)} → ${esc(ah.a)}${ah.meta ? ' · meta ' + esc(ah.meta) : ''}.</p>` : ''}
      <p class="note">Reabrir quita el registro de ahorro de este sobrante y deja el pago como pendiente.</p>
      ${actions('Listo', `<div class="btns" style="margin-right:auto">${btnPorPagar(r)}<button class="btn" value="reabrir">Reabrir pago</button></div>`)}`, (fd, btn) => {
      if (btn === 'porpagar') { closeSheet(); commit(opsPorPagar(r), 'Por pagar ' + r.nombre, r.nombre + ' vuelve a por pagar'); return; }
      if (btn === 'reabrir') { closeSheet(); commit([G('pagos', { id: r.id, cerrado: false, sobrante: 0 }), ah && DEL('ahorros', ah.id)], 'Reabrir ' + r.nombre, 'Pago reabierto'); return; }
      closeSheet();
    });
    bindDelMov(f, r);
    return;
  }
  const f = openSheet(`${head}
    ${r.pag > 0 && r.pend === 0 ? '<div class="diff good"><span>Ya está pagado completo. Si lo marcaste por error usa “Marcar por pagar”.</span></div>' : ''}
    <div class="two">${fld('p_m', r.pag > 0 && r.pend === 0 ? 'Agregar otro pago (opcional)' : 'Monto de este pago', r.pend || '', 'number')}${fld('p_f', 'Fecha de pago', fechaDef(), 'date')}</div>
    ${ctaSel('p_a', 'Pagado desde', r.cta)}
    ${tog('p_x', 'Cerrar el pago (gasté menos de lo presupuestado y no habrá más cargos)', false)}
    <div data-when="p_x" class="sub-box"><div class="diff info" id="p_sob"></div><div id="p_ahw">${ahorroBox('ps', r.cta)}</div></div>
    ${r.c && !r.unaVez ? tog('p_b', 'Usar el total pagado como monto base de los próximos meses', false) : ''}
    ${actions(r.pend > 0 ? 'Registrar pago' : 'Guardar', `<div class="btns" style="margin-right:auto">${btnPorPagar(r)}<button type="button" class="btn" data-act2="editar">Editar</button></div>`)}`, (fd, btn) => {
    if (btn === 'porpagar') { closeSheet(); commit(opsPorPagar(r), 'Por pagar ' + r.nombre, r.nombre + ' vuelve a por pagar'); return; }
    const monto = num(fd.get('p_m')), cerrar = !!fd.get('p_x'), fecha = fd.get('p_f') || fechaDef();
    if (!(monto > 0) && !cerrar) { toast('Escribe el monto que pagaste o marca “Cerrar el pago”.'); return; }
    const mz = materializar(r); r = mz.r; const ops = mz.ops;
    if (monto > 0) ops.push(G('movimientos', { id: uid('m'), mes: S.mesId, fecha, concepto: r.nombre, categoria: r.cat, monto, cuenta: fd.get('p_a'), nota: '', tipo: 'Pago', pagoId: r.id }));
    const nuevo = r2(r.pag + monto), extra = { fechaPago: fecha };
    if (cerrar) {
      const sob = Math.max(0, r2(r.plan - nuevo));
      Object.assign(extra, { cerrado: true, sobrante: sob });
      if (sob > 0) ops.push(opAhorro(fd, 'ps', { mes: S.mesId, fecha, origen: 'Pago', concepto: r.nombre, monto: sob, referencia: r.id }));
    }
    ops.push(...opsLinea(r, nuevo, extra));
    if (fd.get('p_b') && r.c && (+r.c.monto || 0) !== nuevo) ops.push(G('conceptos', { id: r.c.id, monto: nuevo }), G('historial', { id: uid('h'), fecha: hoyISO(), mes: S.mesId, concepto: r.nombre, anterior: +r.c.monto || 0, nuevo }));
    closeSheet();
    commit(ops, 'Pago ' + r.nombre, (monto > 0 ? 'Pago registrado: ' + fmt(monto) : 'Pago cerrado') + (extra.sobrante > 0 ? ' · ' + fmt(extra.sobrante) + ' a ahorro' : ''));
  });
  const upd = () => {
    const m = num(f.querySelector('#p_m').value), sob = Math.max(0, r2(r.plan - r.pag - m));
    diffBox(f.querySelector('#p_sob'), sob > 0 ? 1 : 0, sob > 0 ? `<span>Sobrante que va a ahorro</span><b>${fmt(sob)}</b>` : '<span>Sin sobrante: se cierra sin mandar nada a ahorro</span>');
    f.querySelector('#p_ahw').hidden = !(sob > 0);
  };
  f.addEventListener('input', upd); upd();
  f.querySelector('#p_a').addEventListener('change', e => { f.querySelector('#ps_de').value = e.target.value; });
  f.querySelector('[data-act2="editar"]').addEventListener('click', () => sheetLinea(r.id));
  bindMetaCuenta(f, 'ps'); bindDelMov(f, r);
}
// Deshace el pago completo: borra sus movimientos y su ahorro ligado, y lo deja por pagar.
function opsPorPagar(r) {
  const ah = ahorroDe(r.id, 'Pago');
  return [...r.movs.map(m => DEL('movimientos', m.id)), r.p && r.p._virtual ? null : G('pagos', { id: r.id, pagado: 0, fechaPago: '', cerrado: false, sobrante: 0 }), ah && DEL('ahorros', ah.id)];
}
const btnPorPagar = r => r.pag > 0 || r.cerrado ? '<button class="btn dan" value="porpagar">Marcar por pagar</button>' : '';
function bindDelMov(f, r) {
  f.querySelectorAll('[data-delmov]').forEach(b => b.addEventListener('click', () => {
    const m = r.movs.find(x => x.id === b.dataset.delmov); if (!m) return;
    if (!arm('dm' + m.id, 'Toca “Eliminar” otra vez para borrar el pago de ' + fmt(m.monto) + '.')) return;
    closeSheet();
    commit([DEL('movimientos', m.id), ...(r.p && r.p._virtual ? [] : opsLinea(r, r2(r.pag - m.monto)))], 'Eliminar movimiento', 'Movimiento eliminado');
  }));
}

function sheetMov(id) {
  const m = S.T.movimientos.find(x => x.id === id); if (!m) return;
  if (esAjuste(m)) { sheetVerAjuste(id); return; }
  const r = calc(mesMov(m) || S.mesId).rows.find(x => x.movs.some(y => y.id === id));
  openSheet(`<h3>Movimiento</h3>
    <div class="box">${esc(m.concepto || 'Sin concepto')} · ${esc(mesLbl(mesMov(m)))}${m.tipo ? ' · ' + esc(m.tipo) : ''}</div>
    <div class="two">${fld('v_m', 'Monto', m.monto, 'number')}${fld('v_f', 'Fecha', m.fecha || '', 'date')}</div>
    <div class="two">${ctaSel('v_a', 'Cuenta', m.cuenta || (r && r.cta) || cIng())}${fld('v_n', 'Nota', m.nota || '', 'text', 'maxlength="80"')}</div>
    <p class="note">Si lo registraste por error, elimínalo: el pagado del concepto se ajusta solo.</p>
    ${actions('Guardar', '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>')}`, (fd, btn) => {
    const virt = !r || (r.p && r.p._virtual);
    if (btn === 'del') {
      if (!arm('mv' + id, 'Toca “Eliminar” otra vez para borrar este movimiento.')) return;
      closeSheet(); commit([DEL('movimientos', id), ...(virt ? [] : opsLinea(r, r2(r.pag - (+m.monto || 0))))], 'Eliminar movimiento', 'Movimiento eliminado'); return;
    }
    const monto = num(fd.get('v_m')); if (!(monto > 0)) { toast('El monto debe ser mayor a cero. Para quitarlo usa “Eliminar”.'); return; }
    const fecha = fd.get('v_f') || m.fecha;
    const ops = [G('movimientos', { id, monto, fecha, mes: mesMov(m) || cicloDe(fecha), cuenta: fd.get('v_a'), nota: String(fd.get('v_n') || '').trim() })];
    if (!virt && monto !== +m.monto) ops.push(...opsLinea(r, r2(r.pag - (+m.monto || 0) + monto)));
    closeSheet(); commit(ops, 'Editar movimiento', 'Movimiento actualizado');
  });
}

function sheetLinea(id) {
  const r = linea(id); if (!r) return;
  if (r.c && !r.unaVez) { sheetCon(r.c.id, r.id); return; }
  const cats = catsActivas(catsGasto());
  const f = openSheet(`<h3>Gasto de ${mesN(S.mesId)}</h3>
    ${fld('u_n', 'Nombre', r.nombre, 'text', 'maxlength="80" required')}
    ${catSel('u_c', 'Categoría', cats, r.cat)}
    ${seg('u_t', 'Tipo de gasto', TIPOS.map(t => [t, t]), r.tipo)}
    <div class="two">${sel('u_fo', 'Forma de pago', FORMAS, r.forma)}${ctaSel('u_a', 'Cuenta', r.cta)}</div>
    <div class="two">${fld('u_p', 'Presupuesto de este mes', r.plan, 'number')}${fld('u_v', 'Fecha límite', r.p.fechaLimite || '', 'date')}</div>
    <div class="box">Pagado ${fmt(r.pag)} en ${r.movs.length} movimiento${r.movs.length === 1 ? '' : 's'}. Eliminar borra el gasto, sus movimientos y su ahorro ligado.</div>
    ${actions('Guardar', '<div class="btns" style="margin-right:auto"><button class="btn dan" value="del">Eliminar</button><button class="btn" value="perm">Hacer permanente</button></div>')}`, (fd, btn) => {
    if (btn === 'del') {
      if (!arm('ul' + id, 'Toca “Eliminar” otra vez para borrar ' + r.nombre + ' y sus movimientos.')) return;
      const ah = ahorroDe(r.id, 'Pago');
      closeSheet(); commit([r.p._virtual ? null : DEL('pagos', r.id), ...r.movs.map(m => DEL('movimientos', m.id)), ah && DEL('ahorros', ah.id)], 'Eliminar ' + r.nombre, 'Gasto eliminado'); return;
    }
    const nombre = String(fd.get('u_n') || '').trim(); if (!nombre) { toast('Escribe el nombre.'); return; }
    const cat = resolverCat(fd, 'u_c', 'categorias'); if (cat.error) { toast(cat.error); return; }
    const mz = materializar(r), rr = mz.r, ops = [...cat.ops, ...mz.ops];
    const tipo = fd.get('u_t'), forma = fd.get('u_fo'), cuenta = fd.get('u_a');
    const perm = btn === 'perm';
    // Gasto libre: su nombre y categoría viven en un concepto oculto (inactivo) de la hoja; se edita ahí.
    const oculto = r.c && r.c.activo === false ? r.c : null;
    const otro = conDe(nombre);
    if (otro && (!oculto || otro.id !== oculto.id) && (perm || !eq(nombre, r.nombre))) { toast('Ya existe un concepto con ese nombre.', 4000); return; }
    ops.push(G('pagos', { id: rr.id, concepto: nombre, categoria: cat.nombre, tipo, forma, cuenta, plan: num(fd.get('u_p')), fechaLimite: fd.get('u_v') || '', unaVez: !perm }));
    if (!eq(nombre, r.nombre) || !eq(cat.nombre, r.cat)) r.movs.forEach(m => ops.push(G('movimientos', { id: m.id, concepto: nombre, categoria: cat.nombre })));
    if (oculto) {
      const dia = r.p.fechaLimite ? +r.p.fechaLimite.slice(8) : (r.movs[0] && r.movs[0].fecha ? +String(r.movs[0].fecha).slice(8) : '');
      ops.push(G('conceptos', Object.assign({ id: oculto.id, nombre, categoria: cat.nombre, tipo, forma, cuenta, monto: num(fd.get('u_p')) || r.pag },
        perm ? { activo: true, frecuencia: 'Mensual', ancla: '', dia, variable: tipo === 'Variable' } : {})));
    } else if (perm) { const dia = r.p.fechaLimite ? +r.p.fechaLimite.slice(8) : (r.movs[0] && r.movs[0].fecha ? +String(r.movs[0].fecha).slice(8) : ''); ops.push(G('conceptos', { id: uid('c'), nombre, categoria: cat.nombre, tipo, forma, cuenta, frecuencia: 'Mensual', ancla: '', dia, monto: num(fd.get('u_p')) || r.pag, variable: tipo === 'Variable', suscripcion: false, negocio: false, activo: true })); }
    closeSheet(); commit(ops, 'Editar ' + nombre, perm ? 'Ahora es un concepto permanente' : 'Gasto actualizado');
  });
}

function sheetCon(cid, lineId) {
  const c = cid ? S.T.conceptos.find(x => x.id === cid) : null;
  const x = c || { nombre: '', categoria: (catsActivas(catsGasto())[0] || {}).nombre || '', tipo: 'Fijo', forma: 'Pago directo', dia: '', monto: 0, frecuencia: 'Mensual', activo: true };
  const k = calc(S.mesId);
  const r = lineId ? k.rows.find(y => y.id === lineId) : (c ? k.rows.find(y => y.c && y.c.id === c.id) : null);
  const hist = c ? S.T.historial.filter(h => eq(h.concepto, c.nombre)).slice(-3).reverse() : [];
  const mesOpts = () => { const o = []; for (let i = -1; i < 12; i++) { const id = addM(S.mesId, i); o.push([id, mesLbl(id)]); } return o; };
  const f = openSheet(`<h3>${c ? 'Editar concepto' : 'Nuevo concepto'}</h3>${fld('c_n', 'Nombre', x.nombre, 'text', 'required maxlength="80"')}
    ${catSel('c_c', 'Categoría', catsActivas(catsGasto()), x.categoria)}
    ${seg('c_t', 'Tipo de gasto', TIPOS.map(t => [t, t]), tipoDe(x))}
    <div class="two">${sel('c_fo', 'Forma de pago', FORMAS, formaDe(x))}${ctaSel('c_ct', 'Se paga desde', x.cuenta || '', true)}</div>
    <div class="label" style="margin-top:4px">Cuándo se paga</div>
    <div class="two">${sel('c_q', 'Frecuencia', FREQ, fq(x))}${fld('c_d', 'Día habitual de pago (1–31)', x.dia || '', 'number')}</div>
    <div data-when="c_q!=1&c_q!=0">${sel('c_a', 'Mes en que toca pagar', mesOpts(), x.ancla || S.mesId)}</div>
    <div class="label" style="margin-top:4px">Cuánto</div>
    ${fld('c_pb', 'Monto base de los próximos meses', x.monto ?? 0, 'number')}
    ${r ? `<div class="two">${fld('c_pm', 'Presupuesto de ' + mesN(S.mesId), r.plan, 'number')}${fld('c_v', 'Fecha límite en ' + mesN(S.mesId), r.p.fechaLimite || '', 'date')}</div>` : (cid ? '' : fld('c_pm', 'Presupuesto de ' + mesN(S.mesId) + ' (0 = no agregar a este mes)', '', 'number'))}
    ${hist.length ? `<div class="box">Cambios de monto: ${hist.map(h => `${mesLbl(h.mes)}: ${fmt(h.anterior)} → ${fmt(h.nuevo)}`).join(' · ')}</div>` : ''}
    ${tog('c_s', 'Es suscripción', x.suscripcion)}
    ${tog('c_e', 'Es gasto de negocio (Matti / NetPay)', x.negocio)}
    ${c ? '<div class="box">Desactivar lo quita de los meses nuevos y conserva su historial. Eliminar borra el concepto y sus pagos pendientes desde este mes; los pagos ya hechos se conservan.</div>' : ''}
    ${actions('Guardar', c ? `<div class="btns" style="margin-right:auto"><button class="btn dan" value="del">Eliminar</button>${c.activo !== false ? '<button class="btn" value="off">Desactivar</button>' : '<button class="btn" value="on">Reactivar</button>'}</div>` : '')}`, (fd, btn) => {
    if (btn === 'del') {
      if (!arm('del' + cid, 'Toca “Eliminar” otra vez para borrar ' + c.nombre + '.')) return;
      const ops = [DEL('conceptos', cid)];
      mesesDisp().filter(m => m >= S.mesId).forEach(m => lineasMes(m).filter(l => l.c && l.c.id === cid && !l.p._virtual && !l.movs.length && !l.pag).forEach(l => ops.push(DEL('pagos', l.id))));
      closeSheet(); commit(ops, 'Eliminar ' + c.nombre, 'Concepto eliminado'); return;
    }
    if (btn === 'off' || btn === 'on') { closeSheet(); commit([G('conceptos', { id: cid, activo: btn === 'on' })], 'Concepto', btn === 'on' ? 'Concepto reactivado' : 'Concepto desactivado'); return; }
    const nombre = String(fd.get('c_n') || '').trim(); if (!nombre) { toast('El concepto necesita un nombre.'); return; }
    const otro = conDe(nombre); if (otro && (!c || otro.id !== c.id)) { toast('Ya existe un concepto con ese nombre.'); return; }
    const cat = resolverCat(fd, 'c_c', 'categorias'); if (cat.error) { toast(cat.error); return; }
    const q = +fd.get('c_q'), dia = Math.round(num(fd.get('c_d'))), base = num(fd.get('c_pb')), tipo = fd.get('c_t');
    const id = c ? c.id : uid('c');
    const body = { id, nombre, categoria: cat.nombre, tipo, forma: fd.get('c_fo'), cuenta: fd.get('c_ct') || '', frecuencia: fqLbl(q), ancla: q > 1 ? fd.get('c_a') : '', dia: dia >= 1 && dia <= 31 ? dia : '', monto: base, variable: tipo === 'Variable', suscripcion: !!fd.get('c_s'), negocio: !!fd.get('c_e'), activo: c ? c.activo !== false : true };
    const ops = [...cat.ops, G('conceptos', body)];
    if (c && !eq(c.nombre, nombre)) ['pagos', 'movimientos', 'historial', 'ahorros'].forEach(t => ops.push(REN(t, 'concepto', c.nombre, nombre)));
    if (c && (+c.monto || 0) !== base) ops.push(G('historial', { id: uid('h'), fecha: hoyISO(), mes: S.mesId, concepto: nombre, anterior: +c.monto || 0, nuevo: base }));
    if (c) S.T.pagos.filter(p => eq(p.concepto, c.nombre) && p.mes > S.mesId).forEach(p => ops.push(G('pagos', { id: p.id, categoria: cat.nombre, tipo, forma: body.forma, cuenta: body.cuenta })));
    if (r) {
      const mz = materializar(r); ops.push(...mz.ops);
      ops.push(G('pagos', { id: mz.r.id, concepto: nombre, categoria: cat.nombre, tipo, forma: body.forma, cuenta: body.cuenta, plan: num(fd.get('c_pm')), fechaLimite: fd.get('c_v') || '', unaVez: false }));
      if (r.cerrado) { const sob = Math.max(0, r2(num(fd.get('c_pm')) - r.pag)); ops.push(G('pagos', { id: mz.r.id, sobrante: sob })); const ah = ahorroDe(r.id, 'Pago'); if (ah) ops.push(sob > 0 ? G('ahorros', { id: ah.id, monto: sob }) : DEL('ahorros', ah.id)); }
    } else if (!c && num(fd.get('c_pm')) > 0) {
      ops.push(G('pagos', { id: uid('p'), mes: S.mesId, concepto: nombre, categoria: cat.nombre, tipo, forma: body.forma, cuenta: body.cuenta, plan: num(fd.get('c_pm')), pagado: 0, fechaLimite: body.dia ? fechaCiclo(S.mesId, body.dia) : '', cerrado: false, sobrante: 0, unaVez: false }));
    }
    closeSheet(); commit(ops, 'Concepto ' + nombre, c ? 'Concepto actualizado' : 'Concepto creado');
  });
  return f;
}
function addLinea(cid) {
  const c = S.T.conceptos.find(x => x.id === cid); if (!c) return;
  commit([G('pagos', { id: uid('p'), mes: S.mesId, concepto: c.nombre, categoria: c.categoria, tipo: tipoDe(c), forma: formaDe(c), cuenta: c.cuenta || '', plan: estimar(c, S.mesId), pagado: 0, fechaLimite: c.dia ? fechaCiclo(S.mesId, c.dia) : '', cerrado: false, sobrante: 0, unaVez: false })], 'Agregar ' + c.nombre, c.nombre + ' agregado a ' + mesLbl(S.mesId));
}

function sheetFechas() {
  const CN = catsGasto().map(c => N(c.nombre));
  const L = S.T.conceptos.filter(c => c.nombre && c.activo !== false && tipoDe(c) !== 'Extra').sort((a, b) => CN.indexOf(N(a.categoria)) - CN.indexOf(N(b.categoria)) || a.nombre.localeCompare(b.nombre));
  const o = (opts, v) => opts.map(x => { const [a, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
  const ct = v => `<option value="" ${!v ? 'selected' : ''}>Regla</option>` + cuentas().map(c => `<option value="${esc(c.nombre)}" ${eq(c.nombre, v) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  openSheet(`<h3>Fechas, forma y cuenta</h3><p class="note">Con el día de pago la app te avisa 7 días antes y marca los vencidos.</p>
    <div class="tbl"><table><thead><tr><th>Concepto</th><th>Día</th><th>Frecuencia</th><th>Forma</th><th>Cuenta</th><th>Tipo</th></tr></thead><tbody>
    ${L.map((c, i) => `<tr><td><div style="font-weight:600">${esc(c.nombre)}</div><div class="muted" style="font-size:12px">${esc(c.categoria)}</div></td>
      <td><input type="number" name="d_${i}" min="1" max="31" inputmode="numeric" value="${c.dia || ''}" aria-label="Día de pago de ${esc(c.nombre)}"></td>
      <td><select name="q_${i}" aria-label="Frecuencia de ${esc(c.nombre)}">${o(FREQ, fq(c))}</select></td>
      <td><select name="f_${i}" aria-label="Forma de pago de ${esc(c.nombre)}">${o(FORMAS, formaDe(c))}</select></td>
      <td><select name="c_${i}" aria-label="Cuenta de ${esc(c.nombre)}">${ct(c.cuenta)}</select></td>
      <td><select name="t_${i}" aria-label="Tipo de ${esc(c.nombre)}">${o(TIPOS, tipoDe(c))}</select></td></tr>`).join('')}
    </tbody></table></div><p class="note">“Regla”: cargos automáticos y fijos van a la cuenta de cargos fijos; variables, efectivo y tarjeta a gasto corriente.</p>${actions('Guardar todo')}`, fd => {
    const ops = [];
    L.forEach((c, i) => {
      let d = Math.round(num(fd.get('d_' + i))); d = d >= 1 && d <= 31 ? d : '';
      const q = +fd.get('q_' + i), fo = fd.get('f_' + i), cv = fd.get('c_' + i) || '', t = fd.get('t_' + i), up = { id: c.id };
      if ((c.dia || '') !== d) up.dia = d;
      if (fq(c) !== q) { up.frecuencia = fqLbl(q); if (q > 1 && !c.ancla) up.ancla = S.mesId; }
      if (formaDe(c) !== fo) up.forma = fo;
      if ((c.cuenta || '') !== cv) up.cuenta = cv;
      if (tipoDe(c) !== t) { up.tipo = t; up.variable = t === 'Variable'; }
      if (Object.keys(up).length > 1) ops.push(G('conceptos', up));
    });
    closeSheet(); commit(ops, 'Fechas y cuentas', ops.length ? `${ops.length} conceptos actualizados` : 'Sin cambios');
  }, true);
}

/* ================= ingresos ================= */
const fuentes = () => [...new Set(['NetPay', 'Matti Ceramics', ...S.T.ingresos.map(i => i.fuente), ...S.T.ingresosFijos.map(i => i.fuente)].filter(Boolean))];
function sheetIngreso(id) {
  const x = id ? S.T.ingresos.find(i => i.id === id) : null;
  const cats = catsActivas(catsIngreso());
  const v = x || { nombre: '', fuente: '', categoria: (cats[0] || {}).nombre || '', cuenta: cIng(), esperado: '', fecha: fechaDef() };
  openSheet(`<h3>${x ? 'Editar ingreso' : 'Nuevo ingreso'}</h3>
    ${fld('i_n', 'Nombre o descripción', v.nombre, 'text', 'maxlength="80" placeholder="Comisión octubre, venta de piezas…"')}
    <div class="two">${fld('i_s', 'Fuente', v.fuente, 'text', 'list="i_sl" maxlength="60" placeholder="NetPay, Matti Ceramics, cliente…"')}<datalist id="i_sl">${fuentes().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      ${ctaSel('i_a', 'Cuenta donde entra', v.cuenta || cIng())}</div>
    ${catSel('i_c', 'Categoría de ingreso', cats, v.categoria)}
    <div class="two">${fld('i_m', x && x.recibidoSi ? 'Monto esperado' : 'Monto (MXN)', x ? (x.esperado ?? x.recibido) : '', 'number', 'required')}${fld('i_f', 'Fecha', v.fecha || fechaDef(), 'date')}</div>
    ${x ? `<div class="box">${x.recibidoSi ? `Recibido ${fmt(x.recibido ?? x.esperado)}${x.diferencia ? ' · diferencia ' + fmt(x.diferencia) : ''}. Para cambiar el monto recibido toca el círculo del ingreso.` : 'Por cobrar. Toca el círculo del ingreso cuando llegue.'}${x.fijo ? ' Viene del ingreso fijo “' + esc(x.fijo) + '”.' : ''}</div>`
      : `${seg('i_e', 'Estado', [['rec', 'Ya lo recibí'], ['pend', 'Por cobrar']], 'rec')}
         ${seg('i_p', '¿Se repite?', [['una', 'Una sola vez'], ['fijo', 'Fijo cada mes']], 'una')}
         <p class="note" data-when="i_p=fijo">Se guarda como ingreso fijo: cada mes nuevo aparece como “por cobrar” el mismo día.</p>`}
    ${actions('Guardar', x ? '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>' : '')}`, (fd, btn) => {
    if (btn === 'del') {
      if (!arm('ing' + id, 'Toca “Eliminar” otra vez para borrar este ingreso.')) return;
      const ah = ahorroDe(id, 'Ingreso');
      closeSheet(); commit([DEL('ingresos', id), ah && DEL('ahorros', ah.id)], 'Eliminar ingreso', 'Ingreso eliminado'); return;
    }
    const nombre = String(fd.get('i_n') || '').trim(), fuente = String(fd.get('i_s') || '').trim();
    if (!nombre && !fuente) { toast('Escribe un nombre o la fuente.'); return; }
    const monto = num(fd.get('i_m')); if (!(monto > 0)) { toast('Escribe un monto mayor a cero.'); return; }
    const cat = resolverCat(fd, 'i_c', 'categoriasIngreso'); if (cat.error) { toast(cat.error); return; }
    const fecha = fd.get('i_f') || fechaDef(), cuenta = fd.get('i_a');
    const ops = [...cat.ops];
    if (x) {
      const up = { id, nombre, fuente, categoria: cat.nombre, cuenta, esperado: monto, fecha, mes: x.mes || cicloDe(fecha) };
      if (x.recibidoSi) up.diferencia = r2((x.recibido ?? monto) - monto);
      ops.push(G('ingresos', up));
      closeSheet(); commit(ops, 'Ingreso ' + (nombre || fuente), 'Ingreso actualizado'); return;
    }
    const rec = fd.get('i_e') === 'rec', fijo = fd.get('i_p') === 'fijo', nf = nombre || fuente;
    if (fijo) {
      if (S.T.ingresosFijos.some(f => eq(f.nombre || f.fuente, nf))) { toast('Ya existe un ingreso fijo con ese nombre.'); return; }
      ops.push(G('ingresosFijos', { id: uid('f'), nombre: nf, fuente, categoria: cat.nombre, cuenta, monto, dia: +fecha.slice(8), activo: true }));
    }
    ops.push(G('ingresos', { id: uid('i'), mes: S.mesId, fecha, nombre, fuente, categoria: cat.nombre, cuenta, esperado: monto, recibido: rec ? monto : '', diferencia: rec ? 0 : '', recibidoSi: rec, fijo: fijo ? nf : '', nota: '' }));
    closeSheet(); commit(ops, 'Ingreso ' + nf, (rec ? 'Ingreso registrado: ' : 'Por cobrar: ') + fmt(monto) + (fijo ? ' · fijo cada mes' : ''));
  });
}

function sheetCerrarIng(id) {
  const x = ingresosMes(S.mesId).find(i => i.id === id) || ingresosMes(mesIng(S.T.ingresos.find(i => i.id === id) || {})).find(i => i.id === id);
  if (!x) return;
  const ah = ahorroDe(id, 'Ingreso');
  const f = openSheet(`<h3>${x.recibidoSi ? 'Cobro de ' : 'Cerrar '}${esc(nomIng(x))}</h3>
    <div class="box">Esperado ${fmt(x.esp)}${x.fuente ? ' · ' + esc(x.fuente) : ''}${x.categoria ? ' · ' + esc(x.categoria) : ''}</div>
    <div class="two">${fld('ci_m', 'Monto que llegó', x.recibidoSi ? x.rec : x.esp, 'number', 'required')}${fld('ci_f', 'Fecha', x.fecha || fechaDef(), 'date')}</div>
    ${ctaSel('ci_a', 'Cuenta donde entró', x.cuenta || cIng())}
    <div class="diff info" id="ci_d"></div>
    <div id="ci_x" class="stack">${tog('ci_ah', 'Mandar el excedente a ahorro', !!ah || !(x.recibidoSi && x.dif > 0))}
      <div data-when="ci_ah" class="sub-box">${ahorroBox('cs', (ah && ah.de) || x.cuenta || cIng(), ah && ah.meta, ah && ah.a)}</div></div>
    ${actions('Guardar', x.recibidoSi ? '<button class="btn" value="undo" style="margin-right:auto">Marcar por cobrar</button>' : '')}`, (fd, btn) => {
    if (btn === 'undo') { closeSheet(); commit([G('ingresos', { id, recibidoSi: false, recibido: '', diferencia: '' }), ah && DEL('ahorros', ah.id)], 'Ingreso por cobrar', 'Marcado por cobrar'); return; }
    const rec = num(fd.get('ci_m')); if (rec < 0) { toast('El monto no puede ser negativo.'); return; }
    const fecha = fd.get('ci_f') || fechaDef(), cuenta = fd.get('ci_a'), dif = r2(rec - x.esp);
    const ops = [G('ingresos', { id, recibidoSi: true, recibido: rec, esperado: x.esp, diferencia: dif, fecha, cuenta, mes: x.mes || cicloDe(fecha) })];
    if (ah) ops.push(DEL('ahorros', ah.id));
    if (dif > 0 && fd.get('ci_ah')) ops.push(opAhorro(fd, 'cs', { mes: x.mes || cicloDe(fecha), fecha, origen: 'Ingreso', concepto: nomIng(x), monto: dif, referencia: id }));
    closeSheet();
    commit(ops, 'Cobro ' + nomIng(x), dif < 0 ? `Recibido ${fmt(rec)} · faltante ${fmt(-dif)} registrado` : dif > 0 ? `Recibido ${fmt(rec)} · excedente ${fmt(dif)}${fd.get('ci_ah') ? ' a ahorro' : ''}` : 'Ingreso recibido: ' + fmt(rec));
  });
  const upd = () => {
    const rec = num(f.querySelector('#ci_m').value), dif = r2(rec - x.esp);
    diffBox(f.querySelector('#ci_d'), dif, dif < 0 ? `<span>Faltante: se registra y baja tu ahorro proyectado</span><b>${fmt(-dif)}</b>` : dif > 0 ? `<span>Excedente sobre lo esperado</span><b>${fmt(dif)}</b>` : '<span>Llegó exacto lo esperado</span><b>$0</b>');
    f.querySelector('#ci_x').hidden = !(dif > 0);
  };
  f.addEventListener('input', upd); upd();
  f.querySelector('#ci_a').addEventListener('change', e => { f.querySelector('#cs_de').value = e.target.value; });
  bindMetaCuenta(f, 'cs');
}

function sheetFijo(id) {
  const x = id ? S.T.ingresosFijos.find(f => f.id === id) : null;
  const cats = catsActivas(catsIngreso());
  const v = x || { nombre: '', fuente: '', categoria: (cats[0] || {}).nombre || '', cuenta: cIng(), monto: '', dia: '' };
  const pend = x ? S.T.ingresos.filter(i => eq(i.fijo, x.nombre || x.fuente) && !i.recibidoSi && mesIng(i) >= S.mesId) : [];
  openSheet(`<h3>${x ? 'Editar ingreso fijo' : 'Nuevo ingreso fijo'}</h3>
    ${fld('x_n', 'Nombre', v.nombre || v.fuente, 'text', 'required maxlength="80"')}
    <div class="two">${fld('x_s', 'Fuente', v.fuente, 'text', 'list="x_sl" maxlength="60"')}<datalist id="x_sl">${fuentes().map(s => `<option value="${esc(s)}">`).join('')}</datalist>${ctaSel('x_a', 'Cuenta donde entra', v.cuenta || cIng())}</div>
    ${catSel('x_c', 'Categoría de ingreso', cats, v.categoria)}
    <div class="two">${fld('x_m', 'Monto mensual', v.monto, 'number', 'required')}${fld('x_d', 'Día de cobro (1–31)', v.dia || '', 'number')}</div>
    ${x ? (pend.length ? `<p class="note">También se actualizan ${pend.length} cobros pendientes desde ${mesLbl(S.mesId)}.</p>` : '') : tog('x_e', 'Agregarlo a ' + mesLbl(S.mesId) + ' como por cobrar', true)}
    ${x ? '<div class="box">Desactivar deja de copiarlo a los meses nuevos. Eliminar lo borra; los ingresos ya registrados se conservan.</div>' : ''}
    ${actions('Guardar', x ? `<div class="btns" style="margin-right:auto"><button class="btn dan" value="del">Eliminar</button>${x.activo !== false ? '<button class="btn" value="off">Desactivar</button>' : '<button class="btn" value="on">Reactivar</button>'}</div>` : '')}`, (fd, btn) => {
    if (btn === 'del') { if (!arm('fx' + id, 'Toca “Eliminar” otra vez.')) return; closeSheet(); commit([DEL('ingresosFijos', id), ...pend.map(i => DEL('ingresos', i.id))], 'Eliminar ingreso fijo', 'Ingreso fijo eliminado'); return; }
    if (btn === 'off' || btn === 'on') { closeSheet(); commit([G('ingresosFijos', { id, activo: btn === 'on' })], 'Ingreso fijo', btn === 'on' ? 'Reactivado' : 'Desactivado'); return; }
    const nombre = String(fd.get('x_n') || '').trim(), fuente = String(fd.get('x_s') || '').trim();
    if (!nombre) { toast('Escribe el nombre.'); return; }
    if (S.T.ingresosFijos.some(f => f.id !== id && eq(f.nombre || f.fuente, nombre))) { toast('Ya existe un ingreso fijo con ese nombre.'); return; }
    const monto = num(fd.get('x_m')); if (!(monto > 0)) { toast('Escribe un monto mayor a cero.'); return; }
    const cat = resolverCat(fd, 'x_c', 'categoriasIngreso'); if (cat.error) { toast(cat.error); return; }
    let dia = Math.round(num(fd.get('x_d'))); dia = dia >= 1 && dia <= 31 ? dia : '';
    const cuenta = fd.get('x_a'), fid = id || uid('f');
    const ops = [...cat.ops, G('ingresosFijos', { id: fid, nombre, fuente, categoria: cat.nombre, cuenta, monto, dia, activo: x ? x.activo !== false : true })];
    if (x && !eq(x.nombre || x.fuente, nombre)) ops.push(REN('ingresos', 'fijo', x.nombre || x.fuente, nombre));
    pend.forEach(i => ops.push(G('ingresos', { id: i.id, nombre, fuente, categoria: cat.nombre, cuenta, esperado: monto, fijo: nombre })));
    if (!x && fd.get('x_e')) ops.push(G('ingresos', { id: uid('i'), mes: S.mesId, fecha: dia ? fechaCiclo(S.mesId, dia) : '', nombre, fuente, categoria: cat.nombre, cuenta, esperado: monto, recibido: '', diferencia: '', recibidoSi: false, fijo: nombre, nota: '' }));
    closeSheet(); commit(ops, 'Ingreso fijo ' + nombre, x ? 'Ingreso fijo actualizado' : 'Ingreso fijo creado');
  });
}

/* ================= cuentas, categorías, metas ================= */
const CAMPOS_CUENTA = [['conceptos', 'cuenta'], ['pagos', 'cuenta'], ['movimientos', 'cuenta'], ['ingresos', 'cuenta'], ['ingresosFijos', 'cuenta'], ['transferencias', 'de'], ['transferencias', 'a'], ['saldos', 'cuenta'], ['metas', 'cuenta'], ['ahorros', 'de'], ['ahorros', 'a']];
function sheetCuenta(id) {
  const L = S.T.cuentas.filter(c => c.nombre);
  const x = id ? L.find(c => c.id === id) : null;
  const v = x || { nombre: '', uso: rolLbl('otro'), color: PAL[L.length % PAL.length], activa: true };
  const otras = L.filter(c => !x || c.id !== x.id);
  openSheet(`<h3>${x ? 'Editar cuenta' : 'Nueva cuenta'}</h3>${fld('a_n', 'Nombre del banco o cuenta', v.nombre, 'text', 'required maxlength="40"')}
    ${sel('a_r', 'Para qué la usas', ROLES, rolDe(v))}${swatches('a_c', colorDe(v, L.indexOf(x)))}
    ${tog('a_i', 'Aquí llegan mis ingresos (desde aquí se dispersa)', x && eq(x.nombre, cIng()))}
    ${x && otras.length ? sel('a_m', 'Si la eliminas, su historial y conceptos pasan a', otras.map(c => c.nombre), otras[0].nombre) : ''}
    <p class="note">La regla automática usa la primera cuenta de cada uso.</p>
    ${actions('Guardar', x && otras.length ? '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>' : '')}`, (fd, btn) => {
    if (btn === 'del') {
      if (!arm('cta' + id, 'Toca “Eliminar” otra vez. Todo lo de ' + x.nombre + ' pasa a la cuenta elegida.')) return;
      const dest = fd.get('a_m'), ops = CAMPOS_CUENTA.map(([t, c]) => REN(t, c, x.nombre, dest));
      ops.push(DEL('cuentas', id)); if (eq(cIng(), x.nombre)) ops.push(CFG('cuentaIngresos', dest));
      closeSheet(); commit(ops, 'Eliminar cuenta', 'Cuenta eliminada'); return;
    }
    const nombre = String(fd.get('a_n') || '').trim(); if (!nombre) { toast('La cuenta necesita un nombre.'); return; }
    if (L.some(c => c.id !== id && eq(c.nombre, nombre))) { toast('Ya existe una cuenta con ese nombre.'); return; }
    const cid = id || uid('ct'), ops = [G('cuentas', { id: cid, nombre, uso: rolLbl(fd.get('a_r')), color: fd.get('a_c'), recibeIngresos: !!fd.get('a_i'), activa: true })];
    if (x && !eq(x.nombre, nombre)) { CAMPOS_CUENTA.forEach(([t, c]) => ops.push(REN(t, c, x.nombre, nombre))); if (eq(S.cfg.cuentaIngresos, x.nombre)) ops.push(CFG('cuentaIngresos', nombre)); }
    if (fd.get('a_i')) { ops.push(CFG('cuentaIngresos', nombre)); L.filter(c => c.id !== cid && c.recibeIngresos).forEach(c => ops.push(G('cuentas', { id: c.id, recibeIngresos: false }))); }
    closeSheet(); commit(ops, 'Cuenta ' + nombre, 'Cuenta guardada');
  });
}

function sheetCat(id, nombreSinId, kind) {
  const ing = kind === 'ingreso', tabla = ing ? 'categoriasIngreso' : 'categorias';
  const L = ing ? catsIngreso() : catsGasto();
  const x = id ? L.find(c => c.id === id) : nombreSinId ? L.find(c => !c.id && eq(c.nombre, nombreSinId)) : null;
  const usos = x ? (ing ? S.T.ingresos.filter(i => eq(i.categoria, x.nombre)).length + S.T.ingresosFijos.filter(i => eq(i.categoria, x.nombre)).length
    : S.T.conceptos.filter(c => eq(c.categoria, x.nombre)).length) : 0;
  const otras = L.filter(c => !x || !eq(c.nombre, x.nombre));
  const campos = ing ? [['ingresos', 'categoria'], ['ingresosFijos', 'categoria']] : [['conceptos', 'categoria'], ['pagos', 'categoria'], ['movimientos', 'categoria']];
  openSheet(`<h3>${x ? 'Editar categoría' : 'Nueva categoría'} de ${ing ? 'ingreso' : 'gasto'}</h3>${fld('k_n', 'Nombre', x ? x.nombre : '', 'text', 'required maxlength="40" ' + (ing ? 'placeholder="Comisión, Venta, Honorarios, Reembolso de negocio"' : ''))}
    ${swatches('k_c', x ? colorDe(x, x._i + (ing ? 3 : 0)) : PAL[L.length % PAL.length])}
    ${x && x.id ? tog('k_a', 'Activa (aparece en los formularios)', x.activa !== false) : ''}
    ${x && otras.length ? sel('k_m', `Si la eliminas, mover sus ${usos} ${ing ? 'ingresos' : 'conceptos'} a`, otras.map(c => c.nombre), otras[0].nombre) : ''}
    ${actions('Guardar', x && (otras.length || !usos) ? '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>' : '')}`, (fd, btn) => {
    if (btn === 'del') {
      if (!arm('cat' + (x.id || x.nombre), 'Toca “Eliminar” otra vez. Lo que usa esta categoría pasa a la elegida.')) return;
      const dest = fd.get('k_m'), ops = dest ? campos.map(([t, c]) => REN(t, c, x.nombre, dest)) : [];
      if (x.id) ops.push(DEL(tabla, x.id));
      closeSheet(); commit(ops, 'Eliminar categoría', 'Categoría eliminada'); return;
    }
    const nombre = String(fd.get('k_n') || '').trim(); if (!nombre) { toast('La categoría necesita un nombre.'); return; }
    if (L.some(c => (!x || !eq(c.nombre, x.nombre)) && eq(c.nombre, nombre))) { toast('Ya existe una categoría con ese nombre.'); return; }
    const ops = [G(tabla, { id: (x && x.id) || uid('k'), nombre, color: fd.get('k_c'), activa: x && x.id ? !!fd.get('k_a') : true })];
    if (x && !eq(x.nombre, nombre)) campos.forEach(([t, c]) => ops.push(REN(t, c, x.nombre, nombre)));
    closeSheet(); commit(ops, 'Categoría ' + nombre, 'Categoría guardada');
  });
}

function sheetMeta(id) {
  const g = id ? S.T.metas.find(m => m.id === id) : null;
  const v = g || { nombre: '', objetivo: '', ahorrado: 0, aporte: '', cuenta: cAhorro() };
  openSheet(`<h3>${g ? 'Editar meta' : 'Nueva meta de ahorro'}</h3>${fld('t_n', 'Nombre', v.nombre, 'text', 'required maxlength="60"')}
    <div class="two">${fld('t_o', 'Objetivo', v.objetivo, 'number')}${fld('t_a', 'Ahorrado antes de usar la app', v.ahorrado, 'number')}</div>
    <div class="two">${fld('t_m', 'Aporte mensual', v.aporte, 'number')}${ctaSel('t_c', 'Cuenta donde se guarda', v.cuenta || cAhorro() || cIng())}</div>
    ${g ? `<p class="note">Ahorrado total: ${fmt(metaAhorrado(g))} (incluye sobrantes, excedentes y aportes registrados).</p>` : ''}
    ${actions('Guardar', g ? '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>' : '')}`, (fd, btn) => {
    if (btn === 'del') { if (!arm('meta' + id)) return; closeSheet(); commit([DEL('metas', id), REN('ahorros', 'meta', g.nombre, '')], 'Eliminar meta', 'Meta eliminada'); return; }
    const nombre = String(fd.get('t_n') || '').trim(); if (!nombre) { toast('La meta necesita un nombre.'); return; }
    const ops = [G('metas', { id: id || uid('g'), nombre, objetivo: num(fd.get('t_o')), ahorrado: num(fd.get('t_a')), aporte: num(fd.get('t_m')), cuenta: fd.get('t_c'), activa: true })];
    if (g && !eq(g.nombre, nombre)) ops.push(REN('ahorros', 'meta', g.nombre, nombre));
    closeSheet(); commit(ops, 'Meta ' + nombre, 'Meta guardada');
  });
}
function abonar(id) {
  const g = S.T.metas.find(m => m.id === id); if (!g || !(g.aporte > 0)) return;
  commit([G('ahorros', { id: uid('a'), mes: S.mesId, fecha: fechaDef(), origen: 'Manual', concepto: 'Aporte a ' + g.nombre, monto: +g.aporte, de: cIng(), a: g.cuenta || cAhorro() || cIng(), meta: g.nombre, referencia: '', nota: '' })], 'Aporte ' + g.nombre, 'Aporte registrado: ' + fmt(g.aporte));
}
function sheetAhorro(id) {
  const a = id ? S.T.ahorros.find(x => x.id === id) : null;
  const v = a || { monto: '', fecha: fechaDef(), de: cIng(), a: cAhorro() || cIng(), meta: '', nota: '', origen: 'Manual' };
  const auto = a && (eq(a.origen, 'Pago') || eq(a.origen, 'Ingreso'));
  openSheet(`<h3>${a ? 'Ahorro registrado' : 'Registrar ahorro'}</h3>
    ${auto ? `<div class="box">Viene de ${eq(a.origen, 'Pago') ? 'cerrar el pago' : 'el excedente del ingreso'} “${esc(a.concepto)}”. Para cambiar el monto, edita ${eq(a.origen, 'Pago') ? 'el pago' : 'el cobro'}.</div>` : fld('h_c', 'Concepto', v.concepto || '', 'text', 'maxlength="60" placeholder="Ahorro del mes, aguinaldo…"')}
    <div class="two">${fld('h_mo', 'Monto', v.monto, 'number', auto ? 'readonly' : 'required')}${fld('h_f', 'Fecha', v.fecha || fechaDef(), 'date')}</div>
    ${ahorroBox('h', v.de, v.meta, v.a)}
    ${fld('h_n', 'Nota (opcional)', v.nota || '', 'text', 'maxlength="80"')}
    ${actions('Guardar', a ? '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>' : '')}`, (fd, btn) => {
    if (btn === 'del') {
      if (!arm('ah' + id, 'Toca “Eliminar” otra vez. El dinero se queda en la cuenta de origen.')) return;
      const ops = [DEL('ahorros', id)]; if (eq(a.origen, 'Pago') && a.referencia) ops.push(G('pagos', { id: a.referencia, sobrante: 0 }));
      closeSheet(); commit(ops, 'Eliminar ahorro', 'Ahorro eliminado'); return;
    }
    const monto = num(fd.get('h_mo')); if (!(monto > 0)) { toast('Escribe un monto mayor a cero.'); return; }
    const fecha = fd.get('h_f') || fechaDef();
    const fila = { id: id || uid('a'), monto, fecha, mes: (a && a.mes) || cicloDe(fecha), de: fd.get('h_de'), a: fd.get('h_a'), meta: fd.get('h_m') || '', nota: String(fd.get('h_n') || '').trim() };
    if (!auto) Object.assign(fila, { origen: 'Manual', concepto: String(fd.get('h_c') || '').trim() || 'Ahorro', referencia: '' });
    closeSheet(); commit([G('ahorros', fila)], 'Ahorro', a ? 'Ahorro actualizado' : 'Ahorro registrado: ' + fmt(monto));
  });
}

/* ================= mes, transferencias, supuestos ================= */
function sheetTr(a, monto) {
  const org = cIng();
  openSheet(`<h3>Registrar transferencia</h3><div class="two">${ctaSel('t_de', 'Desde', org)}${ctaSel('t_a', 'Hacia', a || (cuentas().find(c => !eq(c.nombre, org)) || {}).nombre)}</div>
    <div class="two">${fld('t_m', 'Monto (MXN)', monto || '', 'number', 'required')}${fld('t_f', 'Fecha', fechaDef(), 'date')}</div>${fld('t_n', 'Nota (opcional)', '', 'text', 'maxlength="60"')}${actions('Registrar')}`, fd => {
    const de = fd.get('t_de'), to = fd.get('t_a'), mo = num(fd.get('t_m'));
    if (eq(de, to)) { toast('Elige dos cuentas distintas.'); return; }
    if (!(mo > 0)) { toast('Escribe un monto mayor a cero.'); return; }
    closeSheet(); commit([G('transferencias', { id: uid('t'), mes: S.mesId, fecha: fd.get('t_f') || fechaDef(), de, a: to, monto: mo, nota: String(fd.get('t_n') || '').trim() })], 'Transferencia', `Transferencia registrada: ${fmt(mo)} a ${to}`);
  });
}
function sheetMes() {
  const rows = S.T.saldos.filter(s => s.mes === S.mesId);
  const val = n => { const r = rows.find(s => eq(s.cuenta, n)); return r ? r.saldo : 0; };
  openSheet(`<h3>Saldos iniciales de ${mesLbl(S.mesId)}</h3><p class="note">Lo que tenía cada cuenta al arrancar el ciclo. Los ingresos van con “+ Ingreso” y los movimientos entre cuentas con “Registrar transferencia”.</p>
    ${cuentas().map((c, i) => fld('s_' + i, c.nombre, val(c.nombre), 'number')).join('')}${actions()}`, fd => {
    const ops = [];
    cuentas().forEach((c, i) => { const v = num(fd.get('s_' + i)), r = rows.find(s => eq(s.cuenta, c.nombre)); if (r) { if (+r.saldo !== v) ops.push(G('saldos', { id: r.id, saldo: v })); } else if (v) ops.push(G('saldos', { id: uid('s'), mes: S.mesId, cuenta: c.nombre, saldo: v })); });
    closeSheet(); commit(ops, 'Saldos iniciales', 'Saldos actualizados');
  });
}
function sheetCfg() {
  const nf = fijosActivos().length;
  openSheet(`<h3>Supuestos de proyección</h3>${nf ? `<div class="box">El ingreso mensual sale de tus ${nf} ingresos fijos (${fmt(ingresoMensual())}). Edítalos en Ajustes.</div>` : fld('f_i', 'Ingreso mensual estimado', S.cfg.ingresoMensual || 0, 'number')}
    ${fld('f_p', 'Meta de ahorro (% de tus recursos)', metaPct(), 'number')}${actions()}`, fd => {
    const ops = [CFG('metaAhorroPct', Math.max(0, Math.min(100, num(fd.get('f_p')))))]; if (!nf) ops.push(CFG('ingresoMensual', num(fd.get('f_i'))));
    closeSheet(); commit(ops, 'Supuestos', 'Supuestos actualizados');
  });
}
/* ================= ciclo: cierre, ajustes de saldo y pago del día 15 ================= */
const cicloAbierto = () => { const ids = mesesDisp(); return S.cfg.mesActivo && ids.includes(S.cfg.mesActivo) ? S.cfg.mesActivo : (ids[ids.length - 1] || mesHoy()); };
const pagoPrincipal = () => fijosActivos().slice().sort((a, b) => (+b.monto || 0) - (+a.monto || 0))[0] || null;
const cuentasAhorro = o => Object.values(o).filter(a => rolDe(a.c) === 'ahorro');
const fechaEnCiclo = mid => { const h = hoyISO(); return h < cicloIni(mid) ? cicloIni(mid) : h > cicloFin(mid) ? cicloFin(mid) : h; };
const opAjuste = (mid, cuenta, monto, nota) => G('movimientos', { id: uid('j'), mes: mid, fecha: fechaEnCiclo(mid), concepto: AJ, categoria: '', monto: r2(monto), cuenta, nota, tipo: AJ, pagoId: '' });

function sheetAjuste() {
  const mid = S.mesId, k = calc(mid), o = saldos(mid, k), L = cuentas();
  const est = n => { const a = o[N(n)]; return a ? r2(a.saldo) : 0; };
  const f = openSheet(`<h3>Ajustar saldos · ${esc(mesLbl(mid))}</h3>
    <p class="note">Escribe lo que dice tu banco. La diferencia contra lo que calcula la app queda registrada como “Ajuste de saldo”: no cuenta como gasto ni como ahorro, solo corrige el saldo. Deja en blanco las cuentas que sí cuadran.</p>
    ${L.map((c, i) => `<div class="two">${fld('aj_' + i, esc(c.nombre) + ' · saldo real', '', 'number', `placeholder="${est(c.nombre)}"`)}<div class="fld"><span class="label">Según la app</span><div class="num" style="padding:12px 0">${fmt(est(c.nombre))}</div></div></div>`).join('')}
    <div class="diff info" id="aj_d"></div>
    ${fld('aj_m', 'Motivo (opcional)', '', 'text', 'maxlength="80" placeholder="Comisión, intereses, gasto que no registré…"')}
    ${actions('Ajustar')}`, fd => {
    const motivo = String(fd.get('aj_m') || '').trim(), ops = [];
    L.forEach((c, i) => {
      const raw = String(fd.get('aj_' + i) || '').trim(); if (raw === '') return;
      const v = num(raw), d = r2(v - est(c.nombre));
      if (Math.abs(d) >= 0.5) ops.push(opAjuste(mid, c.nombre, d, motivo || ('Saldo real ' + fmt(v))));
    });
    if (!ops.length) { toast('Todo cuadra: no hay nada que ajustar.'); return; }
    closeSheet(); commit(ops, 'Ajuste de saldo', ops.length === 1 ? 'Saldo ajustado' : ops.length + ' saldos ajustados');
  });
  const upd = () => {
    let t = 0, n = 0;
    L.forEach((c, i) => { const raw = f.querySelector('#aj_' + i).value.trim(); if (raw === '') return; const d = r2(num(raw) - est(c.nombre)); if (Math.abs(d) >= 0.5) { t += d; n++; } });
    diffBox(f.querySelector('#aj_d'), t, n ? `<span>${n} cuenta${n === 1 ? '' : 's'} con diferencia${t < 0 ? ': falta dinero vs. lo registrado' : ': hay más de lo registrado'}</span><b>${t > 0 ? '+' : ''}${fmt(t)}</b>` : '<span>Sin diferencias</span><b>$0</b>');
  };
  f.addEventListener('input', upd); upd();
}
function sheetVerAjuste(id) {
  const m = S.T.movimientos.find(x => x.id === id); if (!m) return;
  openSheet(`<h3>Ajuste de saldo</h3>
    <div class="box">${acctTag(m.cuenta)} · ${esc(mesLbl(mesMov(m)))}${m.fecha ? ' · ' + fLbl(m.fecha) : ''}${m.nota ? '<br>' + esc(m.nota) : ''}</div>
    <div class="diff ${+m.monto >= 0 ? 'good' : 'crit'}"><span>${+m.monto >= 0 ? 'Se sumó al saldo' : 'Se restó del saldo'}</span><b>${fmt(Math.abs(+m.monto || 0))}</b></div>
    <p class="note">Si lo registraste por error, elimínalo y el saldo vuelve a lo calculado.</p>
    ${actions('Listo', '<button class="btn dan" value="del" style="margin-right:auto">Eliminar</button>')}`, (fd, btn) => {
    if (btn === 'del') { if (!arm('aj' + id, 'Toca “Eliminar” otra vez para quitar este ajuste.')) return; closeSheet(); commit([DEL('movimientos', id)], 'Quitar ajuste', 'Ajuste eliminado'); return; }
    closeSheet();
  });
}
function ajusteRowHTML(m) {
  return `<div class="row flat"><button class="main" data-act="verAjuste" data-id="${esc(m.id)}"><div class="name">${AJ}</div>
    <div class="meta">${acctTag(m.cuenta)}${m.fecha ? `<span>${fLbl(m.fecha)}</span>` : ''}${m.nota ? '<span>' + esc(m.nota) + '</span>' : ''}</div></button>
    <div class="amt num" style="color:${+m.monto >= 0 ? 'var(--good)' : 'var(--crit)'}">${+m.monto >= 0 ? '+' : ''}${fmt(m.monto)}</div></div>`;
}

function sheetCerrarCiclo(llego) {
  const from = cicloAbierto(), nid = addM(from, 1), pp = pagoPrincipal();
  if (S.T.pagos.some(p => p.mes === nid) || S.T.saldos.some(s => s.mes === nid)) {
    if (S.cfg.mesActivo !== nid) commit([CFG('mesActivo', nid)], 'Ciclo activo');
    S.mesId = nid; render();
    const ing = llego && pp && ingresosMes(nid).find(i => !i.recibidoSi && eq(i.fijo, pp.nombre || pp.fuente));
    if (ing) sheetCerrarIng(ing.id); else toast(mesLbl(nid) + ' ya está abierto.');
    return;
  }
  const k = calc(from), o = saldos(from, k), fijos = fijosActivos(), L = cuentas();
  const pend = k.rows.filter(r => r.pend > 0 && !r.cerrado && !(r.p && r.p._virtual));
  const sig = k.rows.filter(r => r.fuera && !(r.p && r.p._virtual));
  const cons = S.T.conceptos.filter(c => c.nombre && c.activo !== false && tipoDe(c) !== 'Extra');
  const rec = cons.filter(c => fq(c) !== 0 && tocaCiclo(c, nid)).map(c => ({ c, plan: estimar(c, nid) })).filter(x => x.plan > 0);
  const omit = cons.filter(c => fq(c) > 1 && !tocaCiclo(c, nid)).map(c => c.nombre);
  const est = n => { const a = o[N(n)]; return a ? Math.round(a.saldo) : 0; };
  const ahAcum = sum(cuentasAhorro(o), a => a.saldo);
  const f = openSheet(`<h3>Cerrar ${esc(mesLbl(from))}</h3>
    <p class="note">Ciclo ${cicloRango(from)}. Se abre ${esc(mesLbl(nid))}: ${cicloRango(nid)}.</p>
    <div class="kv"><span>Ingresos recibidos</span><span class="num">${fmt(k.ingRec)}</span><span>Pagado</span><span class="num">${fmt(k.pag)}</span><span>Ahorro registrado</span><span class="num">${fmt(k.ahorroReg)}</span>${k.aj ? `<span>Ajustes de saldo</span><span class="num">${k.aj > 0 ? '+' : ''}${fmt(k.aj)}</span>` : ''}<span>Por pagar</span><span class="num">${fmt(k.pend)}</span>${sig.length ? `<span>Pasan al siguiente ciclo</span><span class="num">${fmt(sum(sig, r => r.pendSig))} · ${sig.length}</span>` : ''}</div>
    ${pend.length ? `<div class="label" style="margin-top:6px">Pendientes · ${pend.length} · ${fmt(sum(pend, r => r.pend))}</div>
      <p class="note">${pend.map(r => esc(r.nombre) + ' ' + fmt(r.pend)).join(' · ')}</p>
      ${seg('cc_p', '', [['pasar', 'Pasarlos a ' + mesN(nid)], ['cancelar', 'Ya no se pagarán']], 'pasar')}` : ''}
    <div class="label" style="margin-top:6px">Saldo de cada cuenta al cierre</div>
    <p class="note">Lo que tiene cada cuenta${llego ? ', sin contar el pago que acaba de llegar' : ''}. Es el saldo inicial de ${esc(mesN(nid))}: tu ahorro se acumula de un ciclo a otro. Si no cuadra con tu banco, escribe el real y la diferencia queda como ajuste de saldo.</p>
    ${L.map((c, i) => fld('cc_' + i, esc(c.nombre) + (rolDe(c) === 'ahorro' ? ' · ahorro' : ''), est(c.nombre), 'number')).join('')}
    <div class="diff info" id="cc_d"></div>
    ${llego ? `<div class="label" style="margin-top:6px">Pago mensual recibido</div>
      <div class="two">${fld('cc_m', pp ? esc(nomIng(pp)) : 'Monto del pago', pp ? (+pp.monto || '') : '', 'number', 'required')}${ctaSel('cc_a', 'Entró a', (pp && pp.cuenta) || cIng())}</div>` : ''}
    <div class="box">Se crean ${rec.length} pagos por ${fmt(sum(rec, x => x.plan))}${pend.length ? ' más los pendientes que pases' : ''}. Los variables usan el promedio de tus últimos pagos.${omit.length ? ` No tocan este ciclo: ${omit.map(esc).join(', ')}.` : ''}${fijos.length ? ` Ingresos fijos: ${fmt(ingresoMensual())}${llego && pp ? ' (el pago mensual ya como recibido)' : ' como por cobrar'}.` : ''}</div>
    ${actions('Cerrar y abrir ' + mesN(nid))}`, fd => {
    const ops = [], pasar = fd.get('cc_p') !== 'cancelar';
    pend.forEach(r => {
      ops.push(G('pagos', { id: r.id, cerrado: true, sobrante: 0 }));
      if (pasar) ops.push(G('pagos', { id: uid('p'), mes: nid, concepto: r.nombre, categoria: r.cat, tipo: r.tipo, forma: r.forma, cuenta: r.cta, plan: r.pend, pagado: 0, fechaLimite: r.fecha || '', cerrado: false, sobrante: 0, unaVez: true }));
    });
    const yaVan = new Set();
    sig.forEach(r => { // vencen en el ciclo nuevo: se mudan como su pago de ese ciclo (sin duplicar el recurrente)
      ops.push(G('pagos', { id: r.id, cerrado: true, sobrante: 0 }));
      ops.push(G('pagos', { id: uid('p'), mes: nid, concepto: r.nombre, categoria: r.cat, tipo: r.tipo, forma: r.forma, cuenta: r.cta, plan: r.pendSig, pagado: 0, fechaLimite: r.fecha, cerrado: false, sobrante: 0, unaVez: !r.c || r.unaVez }));
      yaVan.add(N(r.nombre));
    });
    L.forEach((c, i) => {
      const v = num(fd.get('cc_' + i)), d = r2(v - r2((o[N(c.nombre)] || { saldo: 0 }).saldo));
      if (Math.abs(d) >= 0.5) ops.push(opAjuste(from, c.nombre, d, 'Cuadre al cierre de ' + mesLbl(from)));
      ops.push(G('saldos', { id: uid('s'), mes: nid, cuenta: c.nombre, saldo: v }));
    });
    rec.filter(x => !yaVan.has(N(x.c.nombre))).forEach(x => ops.push(G('pagos', { id: uid('p'), mes: nid, concepto: x.c.nombre, categoria: x.c.categoria, tipo: tipoDe(x.c), forma: formaDe(x.c), cuenta: x.c.cuenta || '', plan: x.plan, pagado: 0, fechaLimite: x.c.dia ? fechaCiclo(nid, x.c.dia) : '', cerrado: false, sobrante: 0, unaVez: false })));
    const montoPago = num(fd.get('cc_m')), ctaPago = fd.get('cc_a') || cIng();
    if (llego && !(montoPago > 0)) { toast('Escribe el monto del pago que llegó.'); return; }
    fijos.forEach(fj => {
      const nom = fj.nombre || fj.fuente, esp = +fj.monto || 0, es = llego && fj === pp;
      ops.push(G('ingresos', { id: uid('i'), mes: nid, fecha: es ? fechaEnCiclo(nid) : (fj.dia ? fechaCiclo(nid, fj.dia) : ''), nombre: nom, fuente: fj.fuente || '', categoria: fj.categoria || '', cuenta: es ? ctaPago : (fj.cuenta || cIng()), esperado: esp,
        recibido: es ? montoPago : '', diferencia: es ? r2(montoPago - esp) : '', recibidoSi: es, fijo: nom, nota: '' }));
    });
    if (llego && !pp) ops.push(G('ingresos', { id: uid('i'), mes: nid, fecha: fechaEnCiclo(nid), nombre: 'Pago mensual', fuente: '', categoria: '', cuenta: ctaPago, esperado: montoPago, recibido: montoPago, diferencia: 0, recibidoSi: true, fijo: '', nota: '' }));
    ops.push(CFG('mesActivo', nid));
    LS.del('fm_pagoPosp');
    closeSheet();
    commit(ops, 'Cerrar ' + mesLbl(from), mesLbl(from) + ' cerrado · ' + mesLbl(nid) + ' abierto' + (ahAcum > 0 ? ' · ahorro acumulado ' + fmt(ahAcum) : ''));
    S.mesId = nid; render();
  });
  const upd = () => {
    let t = 0, n = 0;
    L.forEach((c, i) => { const d = r2(num(f.querySelector('#cc_' + i).value) - r2((o[N(c.nombre)] || { saldo: 0 }).saldo)); if (Math.abs(d) >= 0.5) { t += d; n++; } });
    const ah = sum(L.filter(c => rolDe(c) === 'ahorro'), c => num(f.querySelector('#cc_' + L.indexOf(c)).value));
    diffBox(f.querySelector('#cc_d'), n ? t : 1, (n ? `<span>${n} ajuste${n === 1 ? '' : 's'} de saldo al cierre</span><b>${t > 0 ? '+' : ''}${fmt(t)}</b>` : `<span>Ahorro acumulado que pasa a ${esc(mesN(nid))}</span><b>${fmt(ah)}</b>`));
  };
  f.addEventListener('input', upd); upd();
}

// Conceptos sin día de pago: lo toma de la fecha límite que ya capturaste en "Pagos del mes" (solo llena vacíos).
function completarDias() {
  const ab = cicloAbierto(), ops = [];
  S.T.conceptos.filter(c => c.nombre && !(+c.dia >= 1)).forEach(c => {
    const p = S.T.pagos.filter(x => eq(x.concepto, c.nombre) && /^\d{4}-\d{2}-\d{2}$/.test(String(x.fechaLimite || ''))).sort((a, b) => (b.mes === ab) - (a.mes === ab) || String(b.mes).localeCompare(String(a.mes)))[0];
    if (p) ops.push(G('conceptos', { id: c.id, dia: +p.fechaLimite.slice(8) }));
  });
  if (ops.length) commit(ops, 'Días de pago', ops.length + ' días de pago tomados de tus fechas límite');
}

// Día 15 a las 5 pm: si el ciclo nuevo no se ha abierto, pregunta si ya llegó el pago mensual.
function revisarPago() {
  if (!S.T || !S.api || $('#sheet')) return;
  const ab = cicloAbierto(), hoyC = mesHoy();
  if (!(hoyC > ab)) return;
  if (+hoyISO().slice(8) === DIA_CICLO && hoyC === hoyISO().slice(0, 7) && new Date().getHours() < HORA_PAGO) return;
  if (Date.now() < LS.get('fm_pagoPosp', 0)) return;
  LS.set('fm_pagoPosp', Date.now() + 30 * 60000); // si cierra la ventana sin contestar, vuelve a preguntar en media hora
  const nid = addM(ab, 1), pp = pagoPrincipal();
  openSheet(`<h3>¿Ya llegó tu pago mensual?</h3>
    <div class="box">Arranca ${esc(mesLbl(nid))} (${cicloRango(nid)})${pp ? ' · ' + esc(nomIng(pp)) + ' ' + fmt(pp.monto) : ''}.</div>
    <p class="note">Si ya llegó, cierro ${esc(mesLbl(ab))}, paso tus saldos y pendientes, y abro el ciclo nuevo con tu ahorro acumulado.</p>
    <div class="btns" style="justify-content:flex-end"><button class="btn" value="no">Todavía no</button><button class="btn pri" value="si">Sí, ya llegó</button></div>`, (fd, btn) => {
    if (btn === 'si') { closeSheet(); sheetCerrarCiclo(true); return; }
    LS.set('fm_pagoPosp', Date.now() + 3 * 3600000);
    closeSheet(); toast('Te vuelvo a preguntar en 3 horas.');
  });
}

/* ================= conexión ================= */
async function probarYGuardar(url, clave) {
  url = String(url || '').trim(); clave = String(clave || '').trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { toast('La URL debe ser la de tu aplicación web de Apps Script (https://script.google.com/…/exec).', 5000); return false; }
  if (!clave) { toast('Escribe la clave.'); return false; }
  const prev = S.api; S.api = { url, clave };
  try { await api('ping'); }
  catch (e) { S.api = prev; toast(e.red ? 'No hay conexión con la API. Revisa tu internet o la URL.' : e.message, 6000); return false; }
  LS.set('fm_api', S.api);
  if (!prev || prev.url !== url) { S.T = null; LS.del('fm_cache'); }
  toast('Conectado a tu hoja');
  return true;
}
function bindSetup() {
  const f = $('#setupForm'); if (!f) return;
  f.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(f); const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Conectando…';
    if (await probarYGuardar(fd.get('s_url'), fd.get('s_key'))) { render(); sincronizar(); } else { b.disabled = false; b.textContent = 'Conectar'; } });
}
function sheetConexion() {
  const a = S.api || {};
  openSheet(`<h3>Conexión con tu hoja</h3>${fld('q_u', 'URL de la API (termina en /exec)', a.url || '', 'url', 'autocomplete="off"')}${fld('q_k', 'Clave secreta', a.clave || '', 'password', 'autocomplete="off"')}
    <p class="note">Si generaste una clave nueva en Apps Script, cámbiala aquí en cada dispositivo.</p>${actions('Probar y guardar')}`, async fd => {
    if (await probarYGuardar(fd.get('q_u'), fd.get('q_k'))) { closeSheet(); sincronizar(); }
  });
}

/* ================= eventos ================= */
const goTab = t => { S.tab = t; if (t !== 'ajustes') LS.set('fm_tab', t); render(); window.scrollTo(0, 0); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act],[data-tab]'); if (!b || b.closest('#sheet')) return;
  if (b.dataset.tab) { goTab(b.dataset.tab); return; }
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'tab') return goTab(b.dataset.v);
  if (a === 'ajustes') return goTab('ajustes');
  if (a === 'filtro') { S.filtro = b.dataset.v; LS.set('fm_f', S.filtro); return render(); }
  if (a === 'vista') { S.vista = b.dataset.v; LS.set('fm_v', S.vista); return render(); }
  if (a === 'sincronizar') return sincronizar();
  if (a === 'conexion') return sheetConexion();
  if (a === 'instalar') { if (S.install) { S.install.prompt(); S.install = null; } return; }
  if (a === 'olvidar') { if (!arm('olvidar', 'Toca otra vez: se borran la URL, la clave y la copia local. Tu hoja no se toca.')) return; ['fm_api', 'fm_cache', 'fm_outbox'].forEach(LS.del); location.reload(); return; }
  if (!S.T) return;
  const map = {
    toggle: () => quickToggle(id), editLinea: () => sheetLinea(id), editMov: () => sheetMov(id), newGasto: () => sheetGasto(),
    editCon: () => sheetCon(id), newCon: () => sheetCon(null), addLinea: () => addLinea(id), fechas: () => sheetFechas(),
    reactivar: () => commit([G('conceptos', { id, activo: true })], 'Concepto', 'Concepto reactivado'),
    reactivarFijo: () => commit([G('ingresosFijos', { id, activo: true })], 'Ingreso fijo', 'Ingreso fijo reactivado'),
    newIng: () => sheetIngreso(null), editIng: () => sheetIngreso(id), cerrarIng: () => sheetCerrarIng(id),
    newFijo: () => sheetFijo(null), editFijo: () => sheetFijo(id),
    editCta: () => sheetCuenta(id), newCta: () => sheetCuenta(null),
    editCat: () => sheetCat(id || null, b.dataset.v, 'gasto'), newCat: () => sheetCat(null, null, 'gasto'),
    editCatIng: () => sheetCat(id || null, b.dataset.v, 'ingreso'), newCatIng: () => sheetCat(null, null, 'ingreso'),
    editCfg: () => sheetCfg(), newMeta: () => sheetMeta(null), editMeta: () => sheetMeta(id), abonar: () => abonar(id),
    newAhorro: () => sheetAhorro(null), editAhorro: () => sheetAhorro(id),
    editMes: () => sheetMes(), cerrarCiclo: () => sheetCerrarCiclo(false), ajustar: () => sheetAjuste(), verAjuste: () => sheetVerAjuste(id), newTr: () => sheetTr(null, null), doTr: () => sheetTr(id, +b.dataset.v),
    delTr: () => { if (!arm('tr' + id)) return; commit([DEL('transferencias', id)], 'Quitar transferencia', 'Transferencia quitada'); }
  };
  if (map[a]) map[a]();
});
$('#gear').addEventListener('click', () => goTab(S.tab === 'ajustes' ? 'resumen' : 'ajustes'));
$('#fabGas').addEventListener('click', () => { if (S.T) sheetGasto(); });
$('#fabIng').addEventListener('click', () => { if (S.T) sheetIngreso(null); });
$('#sync').addEventListener('click', () => sincronizar());
$('#mPrev').addEventListener('click', () => { const ids = mesesDisp(), i = ids.indexOf(S.mesId); if (i > 0) { S.mesId = ids[i - 1]; render(); } });
$('#mNext').addEventListener('click', () => { const ids = mesesDisp(), i = ids.indexOf(S.mesId); if (i >= 0 && i < ids.length - 1) { S.mesId = ids[i + 1]; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet')) closeSheet(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.api && (!S.ts || Date.now() - S.ts > 60000 || S.outbox.length)) sincronizar(); });
window.addEventListener('online', () => sincronizar());
window.addEventListener('offline', () => setSync('off'));
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.install = e; if (S.tab === 'ajustes' && !$('#sheet')) render(); });

/* ================= arranque ================= */
if (S.T) elegirMes();
render();
if (S.api) sincronizar();
revisarPago();
setInterval(() => { if (document.visibilityState === 'visible') revisarPago(); }, 60000);
})();
