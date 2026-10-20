/**
 * Finanzas Matt · API para la app instalable (GitHub Pages).
 *
 * Este archivo reemplaza completo al Code.gs anterior. Va en el proyecto de Apps Script
 * ligado a la hoja "Finanzas Matt · Base de datos" (cuenta matturano1@gmail.com).
 *
 * Primera vez (no hay que ejecutar nada a mano):
 *   1. Implementar → Nueva implementación → Aplicación web:
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario. Autoriza con tu cuenta.
 *   2. En la app pega la URL /exec e inventa una clave (mínimo 8 caracteres).
 *      La primera conexión guarda esa clave y actualiza la hoja sola, sin borrar datos.
 * Opcional desde el menú de la hoja: revisarEstructura(), actualizarEstructura(), generarClave().
 *
 * Toda la información vive en la hoja. La app solo guarda una copia en cada dispositivo
 * para abrir sin internet.
 */

const VERSION_API = '2026.10.19';
const PROP_CLAVE = 'CLAVE_API';
const FILA_GRUPOS = 1;
const FILA_TITULOS = 2;
const FILA_DATOS = 3;
const MAX_INTENTOS = 20;

/* ------------------------------------------------------------------ */
/* Estructura esperada: nombre interno, título de columna, tipo, grupo  */
/* y sinónimos que se aceptan si la columna ya existe con otro nombre.  */
/* ------------------------------------------------------------------ */
function f_(key, titulo, tipo, grupo, alias) { return { key: key, titulo: titulo, tipo: tipo, grupo: grupo, alias: alias || [] }; }

const ESQUEMA = {
  cuentas: { hoja: 'Cuentas', campos: [
    f_('nombre', 'Nombre', 'texto', 'Cuenta', ['Cuenta', 'Banco', 'Nombre de la cuenta']),
    f_('uso', 'Uso', 'texto', 'Cuenta', ['Rol', 'Para qué la uso', 'Tipo de cuenta', 'Tipo']),
    f_('recibeIngresos', 'Recibe ingresos', 'bool', 'Cuenta', ['Cuenta de ingresos', 'Recibe ingreso']),
    f_('color', 'Color', 'texto', 'Presentación', []),
    f_('activa', 'Activa', 'bool', 'Presentación', ['Activo']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  categorias: { hoja: 'Categorías', campos: [
    f_('nombre', 'Nombre', 'texto', 'Categoría de gasto', ['Categoría', 'Categoria']),
    f_('color', 'Color', 'texto', 'Categoría de gasto', []),
    f_('activa', 'Activa', 'bool', 'Categoría de gasto', ['Activo']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  categoriasIngreso: { hoja: 'Categorías de ingreso', campos: [
    f_('nombre', 'Nombre', 'texto', 'Categoría de ingreso', ['Categoría', 'Categoría de ingreso']),
    f_('color', 'Color', 'texto', 'Categoría de ingreso', []),
    f_('activa', 'Activa', 'bool', 'Categoría de ingreso', ['Activo']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  conceptos: { hoja: 'Conceptos', campos: [
    f_('nombre', 'Concepto', 'texto', 'Concepto', ['Nombre', 'Nombre del concepto']),
    f_('categoria', 'Categoría', 'texto', 'Concepto', ['Categoria']),
    f_('tipo', 'Tipo de gasto', 'texto', 'Concepto', ['Tipo']),
    f_('forma', 'Forma de pago', 'texto', 'Cómo se paga', ['Forma']),
    f_('cuenta', 'Cuenta de pago', 'texto', 'Cómo se paga', ['Cuenta', 'Se paga desde', 'Pagado desde']),
    f_('frecuencia', 'Frecuencia', 'texto', 'Cuándo se paga', ['Periodicidad']),
    f_('ancla', 'Mes de referencia', 'mes', 'Cuándo se paga', ['Mes ancla', 'Primer mes', 'Mes en que toca']),
    f_('dia', 'Día de pago', 'entero', 'Cuándo se paga', ['Día', 'Dia de pago', 'Día habitual de pago']),
    f_('monto', 'Monto base', 'num', 'Cuánto', ['Monto', 'Monto mensual', 'Plan', 'Monto planeado', 'Presupuesto']),
    f_('variable', 'Monto variable', 'bool', 'Cuánto', ['Variable']),
    f_('suscripcion', 'Suscripción', 'bool', 'Clasificación', ['Suscripcion', 'Es suscripción']),
    f_('negocio', 'Gasto de negocio', 'bool', 'Clasificación', ['Negocio', 'Es negocio', 'Es gasto de negocio']),
    f_('activo', 'Activo', 'bool', 'Clasificación', ['Activa', 'Estado']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  historial: { hoja: 'Historial de montos', campos: [
    f_('fecha', 'Fecha', 'fecha', 'Cambio', ['Fecha del cambio']),
    f_('mes', 'Mes', 'mes', 'Cambio', ['Desde el mes']),
    f_('concepto', 'Concepto', 'texto', 'Cambio', []),
    f_('anterior', 'Monto anterior', 'num', 'Montos', ['De', 'Antes']),
    f_('nuevo', 'Monto nuevo', 'num', 'Montos', ['A', 'Ahora']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  pagos: { hoja: 'Pagos del mes', campos: [
    f_('mes', 'Mes', 'mes', 'Pago', []),
    f_('concepto', 'Concepto', 'texto', 'Pago', ['Nombre']),
    f_('categoria', 'Categoría', 'texto', 'Pago', ['Categoria']),
    f_('tipo', 'Tipo de gasto', 'texto', 'Pago', ['Tipo']),
    f_('forma', 'Forma de pago', 'texto', 'Pago', ['Forma']),
    f_('cuenta', 'Cuenta de pago', 'texto', 'Pago', ['Cuenta', 'Pagado desde', 'Se paga desde']),
    f_('plan', 'Monto planeado', 'num', 'Montos', ['Plan', 'Presupuesto', 'Monto presupuestado', 'Monto']),
    f_('pagado', 'Monto pagado', 'num', 'Montos', ['Pagado']),
    f_('fechaLimite', 'Fecha límite', 'fecha', 'Fechas', ['Vence', 'Fecha de vencimiento', 'Fecha limite']),
    f_('fechaPago', 'Fecha de pago', 'fecha', 'Fechas', ['Pagado el', 'Fecha pagado']),
    f_('cerrado', 'Cerrado', 'bool', 'Cierre', ['Pago cerrado']),
    f_('sobrante', 'Sobrante', 'num', 'Cierre', ['Sobrante a ahorro']),
    f_('unaVez', 'Solo este mes', 'bool', 'Cierre', ['Una sola vez', 'Gasto de una sola vez']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  movimientos: { hoja: 'Movimientos', campos: [
    f_('fecha', 'Fecha', 'fecha', 'Movimiento', []),
    f_('mes', 'Mes', 'mes', 'Movimiento', []),
    f_('concepto', 'Concepto', 'texto', 'Movimiento', ['Nombre']),
    f_('categoria', 'Categoría', 'texto', 'Movimiento', ['Categoria']),
    f_('monto', 'Monto', 'num', 'Dinero', ['Importe', 'Monto pagado']),
    f_('cuenta', 'Cuenta', 'texto', 'Dinero', ['Cuenta de pago', 'Pagado desde']),
    f_('nota', 'Nota', 'texto', 'Detalle', ['Notas', 'Comentario']),
    f_('tipo', 'Tipo de movimiento', 'texto', 'Detalle', ['Tipo']),
    f_('pagoId', 'Referencia de pago', 'texto', 'Control', ['ID del pago']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  ingresos: { hoja: 'Ingresos', campos: [
    f_('mes', 'Mes', 'mes', 'Ingreso', []),
    f_('fecha', 'Fecha', 'fecha', 'Ingreso', ['Fecha de cobro']),
    f_('nombre', 'Descripción', 'texto', 'Ingreso', ['Concepto', 'Nombre', 'Descripcion']),
    f_('fuente', 'Fuente', 'texto', 'Ingreso', ['Origen', 'Empresa']),
    f_('categoria', 'Categoría de ingreso', 'texto', 'Ingreso', ['Categoría', 'Categoria']),
    f_('cuenta', 'Cuenta destino', 'texto', 'Ingreso', ['Cuenta', 'Entra a', 'Cuenta donde entra']),
    f_('esperado', 'Monto esperado', 'num', 'Montos', ['Monto', 'Monto planeado']),
    f_('recibido', 'Monto recibido', 'num', 'Montos', ['Monto real']),
    f_('diferencia', 'Diferencia', 'num', 'Montos', []),
    f_('recibidoSi', 'Recibido', 'bool', 'Estado', ['Cobrado', 'Estado', '¿Recibido?']),
    f_('fijo', 'Ingreso fijo', 'texto', 'Estado', ['Fijo', 'Ingreso fijo de origen']),
    f_('nota', 'Nota', 'texto', 'Estado', ['Notas', 'Comentario']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  ingresosFijos: { hoja: 'Ingresos fijos', campos: [
    f_('nombre', 'Descripción', 'texto', 'Ingreso fijo', ['Concepto', 'Nombre', 'Descripcion']),
    f_('fuente', 'Fuente', 'texto', 'Ingreso fijo', ['Origen', 'Empresa']),
    f_('categoria', 'Categoría de ingreso', 'texto', 'Ingreso fijo', ['Categoría', 'Categoria']),
    f_('cuenta', 'Cuenta destino', 'texto', 'Ingreso fijo', ['Cuenta', 'Entra a']),
    f_('monto', 'Monto', 'num', 'Cuánto y cuándo', ['Monto esperado', 'Monto mensual']),
    f_('dia', 'Día de cobro', 'entero', 'Cuánto y cuándo', ['Día', 'Dia', 'Día de pago']),
    f_('activo', 'Activo', 'bool', 'Cuánto y cuándo', ['Activa', 'Estado']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  transferencias: { hoja: 'Transferencias', campos: [
    f_('fecha', 'Fecha', 'fecha', 'Transferencia', []),
    f_('mes', 'Mes', 'mes', 'Transferencia', []),
    f_('de', 'Cuenta de origen', 'texto', 'Transferencia', ['Desde', 'De', 'Origen']),
    f_('a', 'Cuenta destino', 'texto', 'Transferencia', ['Hacia', 'A', 'Destino']),
    f_('monto', 'Monto', 'num', 'Transferencia', ['Importe']),
    f_('nota', 'Nota', 'texto', 'Detalle', ['Notas', 'Comentario']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  saldos: { hoja: 'Saldos iniciales', campos: [
    f_('mes', 'Mes', 'mes', 'Saldo', []),
    f_('cuenta', 'Cuenta', 'texto', 'Saldo', ['Banco']),
    f_('saldo', 'Saldo inicial', 'num', 'Saldo', ['Saldo', 'Monto']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  metas: { hoja: 'Metas de ahorro', campos: [
    f_('nombre', 'Meta', 'texto', 'Meta', ['Nombre', 'Nombre de la meta']),
    f_('objetivo', 'Objetivo', 'num', 'Montos', ['Monto objetivo']),
    f_('ahorrado', 'Ahorrado inicial', 'num', 'Montos', ['Ahorrado', 'Ya ahorrado']),
    f_('aporte', 'Aporte mensual', 'num', 'Montos', ['Aporte']),
    f_('cuenta', 'Cuenta', 'texto', 'Meta', ['Cuenta donde se guarda']),
    f_('activa', 'Activa', 'bool', 'Meta', ['Activo']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]},
  ahorros: { hoja: 'Ahorros del mes', campos: [
    f_('fecha', 'Fecha', 'fecha', 'Registro', []),
    f_('mes', 'Mes', 'mes', 'Registro', []),
    f_('origen', 'Origen', 'texto', 'De dónde viene', ['Tipo de origen']),
    f_('concepto', 'Concepto de origen', 'texto', 'De dónde viene', ['Concepto']),
    f_('monto', 'Monto', 'num', 'Dinero', []),
    f_('de', 'Cuenta de origen', 'texto', 'Dinero', ['Sale de']),
    f_('a', 'Cuenta destino', 'texto', 'Dinero', ['Queda en']),
    f_('meta', 'Meta', 'texto', 'Dinero', ['Meta de ahorro']),
    f_('nota', 'Nota', 'texto', 'Control', ['Notas']),
    f_('referencia', 'Referencia', 'texto', 'Control', ['ID de origen']),
    f_('id', 'ID', 'texto', 'Control', ['Id', 'Identificador'])
  ]}
};

const CONFIG_HOJA = 'Configuración';
const CONFIG_CLAVES = {
  metaAhorroPct: ['Meta de ahorro', 'Meta de ahorro (%)', 'Porcentaje de ahorro', 'Meta de ahorro mensual'],
  ingresoMensual: ['Ingreso mensual estimado', 'Ingreso mensual', 'Ingreso esperado'],
  mesActivo: ['Mes activo', 'Mes actual'],
  cuentaIngresos: ['Cuenta que recibe ingresos', 'Cuenta de ingresos', 'Cuenta principal']
};
const CONFIG_TITULO = { metaAhorroPct: 'Meta de ahorro', ingresoMensual: 'Ingreso mensual estimado', mesActivo: 'Mes activo', cuentaIngresos: 'Cuenta que recibe ingresos' };

/* ------------------------------------------------------------------ */
/* Entradas web                                                        */
/* ------------------------------------------------------------------ */
function doGet() {
  return json_({ ok: true, servicio: 'Finanzas Matt API', version: VERSION_API });
}

function doPost(e) {
  let pedido;
  try { pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Pedido inválido.' }); }

  const permiso = validarClave_(pedido.clave);
  if (permiso !== true) return json_({ ok: false, error: permiso, codigo: 'clave' });

  try {
    if (pedido.accion === 'ping') return json_({ ok: true, version: VERSION_API, hoja: libro_().getName() });
    if (pedido.accion === 'leer') {
      const lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try {
        const migracion = faltaEstructura_() ? estructura_(true, true) : '';
        const datos = leerTodo_();
        datos.migracion = migracion;
        return json_({ ok: true, version: VERSION_API, datos: datos });
      } finally { lock.releaseLock(); }
    }
    if (pedido.accion === 'lote') {
      const lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try { const r = aplicarLote_(pedido.ops || []); return json_({ ok: true, aplicadas: r }); }
      finally { lock.releaseLock(); }
    }
    return json_({ ok: false, error: 'Acción desconocida.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Clave secreta                                                       */
/* ------------------------------------------------------------------ */
function generarClave() {
  const clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
  PropertiesService.getScriptProperties().setProperty(PROP_CLAVE, clave);
  const msg = 'Clave nueva de la API (cópiala en la app, en cada dispositivo):\n\n' + clave +
    '\n\nLa clave anterior deja de funcionar.';
  Logger.log(msg);
  avisar_(msg);
  return clave;
}

function verClave() {
  const clave = PropertiesService.getScriptProperties().getProperty(PROP_CLAVE) || '(sin clave: ejecuta generarClave)';
  Logger.log(clave);
  avisar_('Clave actual de la API:\n\n' + clave);
}

function validarClave_(clave) {
  const real = PropertiesService.getScriptProperties().getProperty(PROP_CLAVE);
  if (!real) { // primer uso: la clave que escribas en la app queda como la clave de la API
    const c = String(clave || '');
    if (c.length < 8) return 'La primera vez escribe una clave nueva de al menos 8 caracteres.';
    PropertiesService.getScriptProperties().setProperty(PROP_CLAVE, c);
    return true;
  }
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_INTENTOS) return 'Demasiados intentos fallidos. Espera 10 minutos.';
  const a = String(clave || ''), b = real;
  let dif = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) dif |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  if (dif !== 0) { cache.put('fallos', String(fallos + 1), 600); return 'Clave incorrecta.'; }
  return true;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */
function libro_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}
function zona_() { return libro_().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }

function normal_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Abre una pestaña y ubica cada campo por el título de la fila 2 (primero exacto, luego sinónimos). */
function abrir_(key) {
  const def = ESQUEMA[key];
  const sh = libro_().getSheetByName(def.hoja);
  const t = { key: key, def: def, sh: sh, cols: {}, calc: {}, checkbox: {}, filas: [], ultima: FILA_DATOS - 1, ancho: 0 };
  if (!sh) return t;
  const ancho = sh.getLastColumn();
  t.ancho = ancho;
  if (!ancho) return t;
  const crudos = sh.getRange(FILA_TITULOS, 1, 1, ancho).getDisplayValues()[0];
  t.titulos = crudos;
  const titulos = crudos.map(normal_);
  const f2 = sh.getRange(FILA_TITULOS, 1, 1, ancho).getFormulas()[0];
  const f3 = sh.getMaxRows() >= FILA_DATOS ? sh.getRange(FILA_DATOS, 1, 1, ancho).getFormulas()[0] : [];
  const usado = {};
  def.campos.forEach(function (c) {
    const i = titulos.indexOf(normal_(c.titulo));
    if (i >= 0 && !usado[i]) { t.cols[c.key] = i; usado[i] = true; }
  });
  def.campos.forEach(function (c) {
    if (t.cols[c.key] != null) return;
    for (let j = 0; j < c.alias.length; j++) {
      const i = titulos.indexOf(normal_(c.alias[j]));
      if (i >= 0 && !usado[i]) { t.cols[c.key] = i; usado[i] = true; return; }
    }
  });
  Object.keys(t.cols).forEach(function (k) {
    const i = t.cols[k];
    if (f2[i] || f3[i]) t.calc[k] = true;
  });
  // Casillas de verificación: se escriben como verdadero/falso en lugar de Sí/No.
  if (sh.getMaxRows() >= FILA_DATOS) {
    def.campos.forEach(function (c) {
      if (c.tipo !== 'bool' || t.cols[c.key] == null || t.calc[c.key]) return;
      const dv = sh.getRange(FILA_DATOS, t.cols[c.key] + 1).getDataValidation();
      if (dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX) t.checkbox[c.key] = true;
    });
  }
  const last = sh.getLastRow();
  if (last >= FILA_DATOS) {
    const vals = sh.getRange(FILA_DATOS, 1, last - FILA_DATOS + 1, ancho).getValues();
    const llaves = Object.keys(t.cols).filter(function (k) { return !t.calc[k] && k !== 'id'; });
    vals.forEach(function (v, n) {
      const tieneDatos = llaves.some(function (k) { const x = v[t.cols[k]]; return x !== '' && x !== null && x !== false; });
      if (!tieneDatos) return;
      t.filas.push({ fila: FILA_DATOS + n, v: v });
      t.ultima = FILA_DATOS + n;
    });
  }
  return t;
}

function leerVal_(x, tipo, tz) {
  if (x === '' || x === null || x === undefined) return (tipo === 'bool' || tipo === 'num' || tipo === 'entero') ? null : '';
  switch (tipo) {
    case 'num': { const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
    case 'entero': { const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? Math.round(n) : null; }
    case 'bool': return leerBool_(x);
    case 'fecha': return leerFecha_(x, tz);
    case 'mes': return leerMes_(x, tz);
    default: return esFecha_(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x).trim();
  }
}
function leerBool_(x) {
  if (x === true) return true;
  if (x === false || x == null) return false;
  if (typeof x === 'number') return x !== 0;
  const s = normal_(x);
  return ['si', 'true', 'verdadero', 'x', '1', 'ok', 'recibido', 'cobrado', 'pagado', 'cerrado', 'activo', 'activa'].indexOf(s) >= 0;
}
function leerFecha_(x, tz) {
  if (esFecha_(x)) return Utilities.formatDate(x, tz, 'yyyy-MM-dd');
  const s = String(x).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
const MESES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function leerMes_(x, tz) {
  if (esFecha_(x)) return Utilities.formatDate(x, tz, 'yyyy-MM');
  const s = String(x).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  const n = normal_(s);
  for (let i = 0; i < 12; i++) {
    if (n.indexOf(MESES_[i]) === 0 || n.indexOf(MESES_[i].slice(0, 3)) === 0) {
      const y = s.match(/(\d{4})/);
      if (y) return y[1] + '-' + ('0' + (i + 1)).slice(-2);
    }
  }
  const f = leerFecha_(s, tz);
  return f ? f.slice(0, 7) : '';
}

function filaObj_(t, r, tz) {
  const o = {};
  t.def.campos.forEach(function (c) {
    if (t.cols[c.key] == null) return;
    o[c.key] = leerVal_(r.v[t.cols[c.key]], c.tipo, tz);
  });
  if (!o.id) o.id = 'fila' + r.fila; // sin columna ID todavía: identificador temporal
  return o;
}

function leerTodo_() {
  const tz = zona_();
  const out = { tablas: {}, faltantes: {}, calculadas: {}, config: leerConfig_() };
  Object.keys(ESQUEMA).forEach(function (k) {
    const t = abrir_(k);
    out.tablas[k] = t.sh ? t.filas.map(function (r) { return filaObj_(t, r, tz); }) : [];
    const falt = ESQUEMA[k].campos.filter(function (c) { return t.cols[c.key] == null; }).map(function (c) { return c.key; });
    if (!t.sh || falt.length) out.faltantes[k] = t.sh ? falt : ['(pestaña completa)'];
    const calc = Object.keys(t.calc);
    if (calc.length) out.calculadas[k] = calc;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Configuración (pestaña de parámetro y valor)                        */
/* ------------------------------------------------------------------ */
function abrirConfig_() {
  const sh = libro_().getSheetByName(CONFIG_HOJA);
  if (!sh) return null;
  const ancho = Math.max(2, sh.getLastColumn());
  const t = sh.getRange(FILA_TITULOS, 1, 1, ancho).getValues()[0].map(normal_);
  let cp = t.findIndex(function (x) { return ['parametro', 'concepto', 'clave', 'nombre', 'ajuste'].indexOf(x) >= 0; });
  let cv = t.findIndex(function (x) { return ['valor', 'monto', 'dato'].indexOf(x) >= 0; });
  if (cp < 0) cp = 0;
  if (cv < 0) cv = cp + 1;
  return { sh: sh, cp: cp, cv: cv };
}
function claveConfig_(texto) {
  const n = normal_(texto);
  for (const k in CONFIG_CLAVES) if (CONFIG_CLAVES[k].some(function (a) { return normal_(a) === n; })) return k;
  return null;
}
function leerConfig_() {
  const c = abrirConfig_(), tz = zona_(), o = {};
  if (!c) return o;
  const last = c.sh.getLastRow();
  if (last < FILA_DATOS) return o;
  const vals = c.sh.getRange(FILA_DATOS, 1, last - FILA_DATOS + 1, Math.max(c.cp, c.cv) + 1).getValues();
  vals.forEach(function (v) {
    const k = claveConfig_(v[c.cp]);
    if (!k) return;
    let x = v[c.cv];
    if (k === 'mesActivo') x = leerMes_(x, tz);
    else if (k === 'metaAhorroPct' || k === 'ingresoMensual') x = leerVal_(x, 'num', tz);
    else x = String(x).trim();
    o[k] = x;
  });
  return o;
}
function escribirConfig_(k, valor) {
  if (!CONFIG_CLAVES[k]) throw new Error('Parámetro desconocido: ' + k);
  let c = abrirConfig_();
  if (!c) {
    const sh = libro_().insertSheet(CONFIG_HOJA);
    sh.getRange(FILA_GRUPOS, 1, 1, 2).merge().setValue('Parámetros de la app');
    sh.getRange(FILA_TITULOS, 1, 1, 2).setValues([['Parámetro', 'Valor']]);
    estiloEncabezado_(sh, 2);
    c = abrirConfig_();
  }
  const last = c.sh.getLastRow();
  let fila = -1;
  if (last >= FILA_DATOS) {
    const vals = c.sh.getRange(FILA_DATOS, c.cp + 1, last - FILA_DATOS + 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) if (claveConfig_(vals[i][0]) === k) { fila = FILA_DATOS + i; break; }
  }
  if (fila < 0) { fila = Math.max(last, FILA_DATOS - 1) + 1; c.sh.getRange(fila, c.cp + 1).setValue(CONFIG_TITULO[k]); }
  const celda = c.sh.getRange(fila, c.cv + 1);
  let v = valor;
  if (k === 'mesActivo' && v) { v = Utilities.parseDate(v + '-01', zona_(), 'yyyy-MM-dd'); celda.setNumberFormat('mmmm yyyy'); }
  if (k === 'metaAhorroPct') { const pct = /%/.test(celda.getNumberFormat()); v = pct ? Number(valor) / 100 : Number(valor); }
  if (k === 'ingresoMensual') { v = Number(valor) || 0; celda.setNumberFormat('$#,##0.00'); }
  celda.setValue(v);
}

/* ------------------------------------------------------------------ */
/* Escritura: lote de operaciones                                      */
/*   {op:'guardar', tabla, fila:{id,...}}  crea o actualiza por ID      */
/*   {op:'eliminar', tabla, id}                                         */
/*   {op:'reemplazar', tabla, campo, de, a}  renombra en toda la columna */
/*   {op:'config', clave, valor}                                        */
/* ------------------------------------------------------------------ */
function aplicarLote_(ops) {
  const ctx = {};
  const tabla = function (k) {
    if (!ESQUEMA[k]) throw new Error('Tabla desconocida: ' + k);
    if (!ctx[k]) {
      ctx[k] = abrir_(k);
      if (!ctx[k].sh) { estructura_(true, true); ctx[k] = abrir_(k); }
      if (!ctx[k].sh) throw new Error('Falta la pestaña "' + ESQUEMA[k].hoja + '".');
      if (ctx[k].cols.id == null) { estructura_(true, true); ctx[k] = abrir_(k); }
      if (ctx[k].cols.id == null) throw new Error('La pestaña "' + ESQUEMA[k].hoja + '" no tiene columna ID.');
    }
    return ctx[k];
  };
  let n = 0;
  ops.forEach(function (op) {
    if (op.op === 'guardar') { guardar_(tabla(op.tabla), op.fila || {}); }
    else if (op.op === 'eliminar') { eliminar_(tabla(op.tabla), op.id); ctx[op.tabla] = null; }
    else if (op.op === 'reemplazar') { reemplazar_(tabla(op.tabla), op.campo, op.de, op.a); ctx[op.tabla] = null; }
    else if (op.op === 'config') { escribirConfig_(op.clave, op.valor); }
    else throw new Error('Operación desconocida: ' + op.op);
    n++;
  });
  SpreadsheetApp.flush();
  return n;
}

function buscarFila_(t, id) {
  const ci = t.cols.id;
  for (let i = 0; i < t.filas.length; i++) if (String(t.filas[i].v[ci]) === String(id)) return t.filas[i];
  return null;
}

function valorEscribir_(t, c, x, tz) {
  if (x === null || x === undefined || x === '') return c.tipo === 'bool' ? (t.checkbox[c.key] ? false : 'No') : '';
  switch (c.tipo) {
    case 'num': { const n = Number(x); return isFinite(n) ? n : ''; }
    case 'entero': { const n = Math.round(Number(x)); return isFinite(n) ? n : ''; }
    case 'bool': { const b = x === true || leerBool_(x); return t.checkbox[c.key] ? b : (b ? 'Sí' : 'No'); }
    case 'fecha': { const s = leerFecha_(x, tz); return s ? Utilities.parseDate(s, tz, 'yyyy-MM-dd') : ''; }
    case 'mes': { const s = leerMes_(x, tz); return s ? Utilities.parseDate(s + '-01', tz, 'yyyy-MM-dd') : ''; }
    default: return String(x);
  }
}
const FORMATO_ = { num: '$#,##0.00', fecha: 'dd/mm/yyyy', mes: 'mmmm yyyy', entero: '0' };

function guardar_(t, fila) {
  const tz = zona_();
  if (!fila.id) fila.id = 'x' + Utilities.getUuid().slice(0, 8);
  let r = buscarFila_(t, fila.id);
  let nueva = false;
  if (!r) {
    nueva = true;
    const num = t.ultima + 1;
    if (num > t.sh.getMaxRows()) t.sh.insertRowsAfter(t.sh.getMaxRows(), 20);
    r = { fila: num, v: new Array(t.ancho).fill('') };
    t.filas.push(r);
    t.ultima = num;
  }
  const celdas = [];
  t.def.campos.forEach(function (c) {
    if (!(c.key in fila) || t.cols[c.key] == null || t.calc[c.key]) return;
    const v = valorEscribir_(t, c, fila[c.key], tz);
    celdas.push({ col: t.cols[c.key], v: v, tipo: c.tipo });
    r.v[t.cols[c.key]] = v;
  });
  celdas.sort(function (a, b) { return a.col - b.col; });
  // Escribe por tramos contiguos para no tocar columnas calculadas.
  for (let i = 0; i < celdas.length;) {
    let j = i;
    while (j + 1 < celdas.length && celdas[j + 1].col === celdas[j].col + 1) j++;
    const tramo = celdas.slice(i, j + 1);
    const rango = t.sh.getRange(r.fila, tramo[0].col + 1, 1, tramo.length);
    rango.setValues([tramo.map(function (x) { return x.v; })]);
    if (nueva) rango.setNumberFormats([tramo.map(function (x) { return FORMATO_[x.tipo] || '@'; })]);
    i = j + 1;
  }
}

function eliminar_(t, id) {
  const r = buscarFila_(t, id);
  if (!r) return;
  try { t.sh.deleteRow(r.fila); }
  catch (e) { // última fila libre de la pestaña: se vacía en lugar de borrarse
    Object.keys(t.cols).forEach(function (k) { if (!t.calc[k]) t.sh.getRange(r.fila, t.cols[k] + 1).clearContent(); });
  }
}

function reemplazar_(t, campo, de, a) {
  const ci = t.cols[campo];
  if (ci == null || t.calc[campo]) return;
  const n = normal_(de);
  t.filas.forEach(function (r) {
    if (normal_(r.v[ci]) === n) t.sh.getRange(r.fila, ci + 1).setValue(a);
  });
}

/* ------------------------------------------------------------------ */
/* Actualización de estructura (sin borrar datos)                      */
/* ------------------------------------------------------------------ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Finanzas Matt')
    .addItem('Revisar estructura (no cambia nada)', 'revisarEstructura')
    .addItem('Actualizar estructura', 'actualizarEstructura')
    .addSeparator()
    .addItem('Generar clave nueva de la API', 'generarClave')
    .addItem('Ver clave actual', 'verClave')
    .addToUi();
}

function revisarEstructura() { return estructura_(false); }

/** ¿Falta alguna pestaña o columna? (la API actualiza la hoja sola la primera vez) */
function faltaEstructura_() {
  return Object.keys(ESQUEMA).some(function (k) {
    const t = abrir_(k);
    return !t.sh || ESQUEMA[k].campos.some(function (c) { return t.cols[c.key] == null; });
  });
}
function actualizarEstructura() { return estructura_(true); }

function estructura_(aplicar, silencioso) {
  const ss = libro_(), tz = zona_(), log = [];
  log.push(aplicar ? 'ACTUALIZACIÓN DE ESTRUCTURA' : 'REVISIÓN DE ESTRUCTURA (no se cambió nada)');

  Object.keys(ESQUEMA).forEach(function (k) {
    const def = ESQUEMA[k];
    let t = abrir_(k);
    if (!t.sh) {
      log.push('• Pestaña nueva: "' + def.hoja + '" con ' + def.campos.length + ' columnas.');
      if (aplicar) crearPestana_(ss, def);
      return;
    }
    const faltan = def.campos.filter(function (c) { return t.cols[c.key] == null; });
    const mapeo = def.campos.filter(function (c) { return t.cols[c.key] != null; }).map(function (c) {
      const titulo = t.titulos[t.cols[c.key]];
      return normal_(titulo) === normal_(c.titulo) ? null : '"' + titulo + '" se usa como "' + c.titulo + '"';
    }).filter(Boolean);
    if (mapeo.length) log.push('• ' + def.hoja + ': ' + mapeo.join(' · '));
    if (Object.keys(t.calc).length) log.push('• ' + def.hoja + ': columnas calculadas que la app no escribe → ' + Object.keys(t.calc).map(function (x) { return titulo_(def, x); }).join(', '));
    if (faltan.length) {
      log.push('• ' + def.hoja + ': columnas nuevas al final → ' + faltan.map(function (c) { return c.titulo; }).join(', '));
      if (aplicar) { agregarColumnas_(t.sh, faltan); t = abrir_(k); }
    }
    if (aplicar && t.cols.id != null) {
      const sinId = t.filas.filter(function (r) { return !r.v[t.cols.id]; });
      sinId.forEach(function (r) { t.sh.getRange(r.fila, t.cols.id + 1).setValue('x' + Utilities.getUuid().slice(0, 8)); });
      if (sinId.length) log.push('  ' + sinId.length + ' filas recibieron ID.');
      formatoColumnas_(t);
    } else if (!aplicar && t.filas.length) {
      log.push('  ' + t.filas.length + ' filas con datos se conservan.');
    }
  });

  // Ingresos ya recibidos: copiar el monto esperado a "Monto recibido".
  const ing = abrir_('ingresos');
  if (ing.sh && ing.cols.recibidoSi != null && ing.cols.esperado != null) {
    const pend = ing.filas.filter(function (r) {
      return leerBool_(r.v[ing.cols.recibidoSi]) && (ing.cols.recibido == null || r.v[ing.cols.recibido] === '');
    });
    if (pend.length) {
      log.push('• Ingresos: ' + pend.length + ' ingresos recibidos toman su monto esperado como monto recibido.');
      if (aplicar && ing.cols.recibido != null && !ing.calc.recibido) pend.forEach(function (r) {
        ing.sh.getRange(r.fila, ing.cols.recibido + 1).setValue(r.v[ing.cols.esperado]);
      });
    }
  }

  // Pagos con monto pagado que no tiene movimiento: se registra un movimiento para que cuadren las cuentas.
  const conc = conciliar_(aplicar, tz);
  if (conc.n) log.push('• Pagos sin movimiento: ' + conc.n + ' movimientos de conciliación por ' + pesos_(conc.total) + (aplicar ? ' registrados.' : ' se registrarían.'));

  if (!aplicar) log.push('\nSi todo se ve bien, ejecuta actualizarEstructura().');
  else log.push('\nListo. Ahora ejecuta generarClave() si aún no tienes clave, y publica la API.');
  const txt = log.join('\n');
  Logger.log(txt);
  if (!silencioso) avisar_(txt);
  return txt;
}

function titulo_(def, key) { const c = def.campos.find(function (x) { return x.key === key; }); return c ? c.titulo : key; }
function pesos_(n) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function conciliar_(aplicar, tz) {
  const p = abrir_('pagos'), m = abrir_('movimientos');
  const res = { n: 0, total: 0 };
  if (!p.sh || !m.sh || p.cols.pagado == null || p.calc.pagado || p.cols.concepto == null) return res;
  if (aplicar && (m.cols.id == null || m.cols.monto == null)) return res;
  const movs = m.filas.map(function (r) { return filaObj_(m, r, tz); });
  p.filas.forEach(function (r) {
    const x = filaObj_(p, r, tz);
    const pagado = Number(x.pagado) || 0;
    if (pagado <= 0) return;
    const suma = movs.filter(function (v) {
      const mes = v.mes || String(v.fecha || '').slice(0, 7);
      return (v.pagoId && v.pagoId === x.id) || (!v.pagoId && normal_(v.concepto) === normal_(x.concepto) && mes === x.mes);
    }).reduce(function (a, v) { return a + (Number(v.monto) || 0); }, 0);
    const dif = Math.round((pagado - suma) * 100) / 100;
    if (dif < 0.5) return;
    res.n++; res.total += dif;
    if (aplicar) guardar_(m, {
      id: 'x' + Utilities.getUuid().slice(0, 8), mes: x.mes, fecha: x.fechaPago || (x.mes ? x.mes + '-01' : ''),
      concepto: x.concepto, categoria: x.categoria || '', monto: dif, cuenta: x.cuenta || '',
      nota: 'Registrado antes de la migración', tipo: 'Pago', pagoId: x.id
    });
  });
  return res;
}

function crearPestana_(ss, def) {
  const sh = ss.insertSheet(def.hoja);
  const n = def.campos.length;
  sh.getRange(FILA_TITULOS, 1, 1, n).setValues([def.campos.map(function (c) { return c.titulo; })]);
  escribirGrupos_(sh, 1, def.campos);
  estiloEncabezado_(sh, n);
  sh.setFrozenRows(FILA_TITULOS);
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  const t = abrir_(Object.keys(ESQUEMA).find(function (k) { return ESQUEMA[k] === def; }));
  formatoColumnas_(t);
}

function agregarColumnas_(sh, campos) {
  const desde = sh.getLastColumn() + 1;
  if (sh.getMaxColumns() < desde + campos.length - 1) sh.insertColumnsAfter(sh.getMaxColumns(), desde + campos.length - 1 - sh.getMaxColumns());
  sh.getRange(FILA_TITULOS, desde, 1, campos.length).setValues([campos.map(function (c) { return c.titulo; })]);
  escribirGrupos_(sh, desde, campos);
  sh.getRange(FILA_GRUPOS, desde, 2, campos.length).setFontWeight('bold').setBackground('#E8EEF9').setFontColor('#0A1430');
}

function escribirGrupos_(sh, desde, campos) {
  let i = 0;
  while (i < campos.length) {
    let j = i;
    while (j + 1 < campos.length && campos[j + 1].grupo === campos[i].grupo) j++;
    const r = sh.getRange(FILA_GRUPOS, desde + i, 1, j - i + 1);
    if (j > i) r.merge();
    r.setValue(campos[i].grupo).setHorizontalAlignment('center');
    i = j + 1;
  }
}

function estiloEncabezado_(sh, n) {
  sh.getRange(FILA_GRUPOS, 1, 1, n).setFontWeight('bold').setBackground('#0A1430').setFontColor('#FFFFFF');
  sh.getRange(FILA_TITULOS, 1, 1, n).setFontWeight('bold').setBackground('#E8EEF9').setFontColor('#0A1430');
}

function formatoColumnas_(t) {
  if (!t || !t.sh) return;
  const filas = Math.max(1, t.sh.getMaxRows() - FILA_DATOS + 1);
  const siNo = SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No'], true).setAllowInvalid(true).build();
  t.def.campos.forEach(function (c) {
    const i = t.cols[c.key];
    if (i == null || t.calc[c.key]) return;
    const r = t.sh.getRange(FILA_DATOS, i + 1, filas, 1);
    if (FORMATO_[c.tipo]) r.setNumberFormat(FORMATO_[c.tipo]);
    if (c.tipo === 'bool' && !t.checkbox[c.key] && !r.getDataValidation()) r.setDataValidation(siNo);
  });
}

function avisar_(txt) {
  // Ventana no bloqueante: la ejecución termina aunque nadie la cierre.
  try {
    const html = HtmlService.createHtmlOutput('<pre style="white-space:pre-wrap;font:13px/1.45 monospace">' +
      String(txt).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>').setWidth(640).setHeight(520);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Finanzas Matt');
  } catch (e) {
    try { libro_().toast('Listo. Revisa el registro de ejecución en Apps Script.', 'Finanzas Matt', 8); } catch (e2) {}
  }
}

function esFecha_(x) { return Object.prototype.toString.call(x) === '[object Date]' && !isNaN(x.getTime()); }
