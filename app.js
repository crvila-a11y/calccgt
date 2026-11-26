'use strict';
/*
 * Calculadora CGT – versión móvil (PWA)
 *
 * Toda la interfaz se genera a partir de APARTADOS. Para cambiar un valor por
 * defecto, añadir un botón o un apartado nuevo basta con editar esta tabla.
 *
 * Estado:
 *  - historial[ap]: lista de pulsaciones ('mes'/'año', nº de horas o id de mérito)
 *  - config[id]:    valores de referencia (puntos, horas por tramo, máximos)
 * Ambos se guardan en localStorage, así que cerrar la app no pierde nada.
 */

const ALMACEN = 'cgt-calculadora-v1';
const BOTONES_HORAS = [1, 2, 3, 5, 10, 12, 15, 20, 30, 35, 40, 45, 50, 60, 90, 100, 110];
const DECIMALES = { cargo: 4, horas: 2, merito: 3 };
const EPS = 1e-9;

const APARTADOS = [
  { id: '113', tipo: 'cargo', titulo: '1.1.3 Puestos E.D.', color: 'naranja', puntosAnyo: 4 },
  { id: '41', tipo: 'cargo', titulo: '4.1 Director/a', color: 'naranja', puntosAnyo: 4.5 },
  { id: '42', tipo: 'cargo', titulo: '4.2 Vicedirección, jefatura de estudios, secretaría', color: 'naranja', puntosAnyo: 3 },
  { id: '43', tipo: 'cargo', titulo: '4.3 Tutoría, coordinación', color: 'naranja', puntosAnyo: 1.5 },
  { id: '51', tipo: 'horas', titulo: '5.1 Formación recibida', color: 'azul', puntos: 0.1, cada: 10, max: 9 },
  { id: '52', tipo: 'horas', titulo: '5.2 Formación impartida', color: 'verde', puntos: 0.1, cada: 3, max: 3 },
  {
    id: '61', tipo: 'merito', titulo: '6.1 Libros y revistas', grupos: [
      { nombre: 'Libros', color: 'verde', items: [
        ['p61Lib1Aut', 'Autoría', 1], ['p61Lib2Aut', 'Coautoría', 0.5], ['p61Lib3Aut', '3 autores', 0.4],
        ['p61Lib4Aut', '4 autores', 0.3], ['p61Lib5Aut', '5 autores', 0.2], ['p61Lib6Aut', '6 o más autores', 0.1]] },
      { nombre: 'Revistas', color: 'azul', items: [
        ['p61Rev1Aut', 'Autoría', 0.2], ['p61Rev2Aut', 'Coautoría', 0.1], ['p61Rev3Aut', '3 o más autores', 0.05]] }
    ]
  },
  {
    id: '62', tipo: 'merito', titulo: '6.2 Proyectos de investigación / innovación', grupos: [
      { nombre: 'Participación', color: 'verde', items: [
        ['p62_20', 'Menos de 20h', 0.1], ['p62_20-60', 'De 21h a 60h', 0.3], ['p62_60', 'Más de 60h', 0.5]] }
    ]
  },
  {
    id: '63', tipo: 'merito', ancho: true, titulo: '6.3 Méritos artísticos, deportivos y literarios', grupos: [
      { nombre: 'Premios (exposición, concurso, certamen)', color: 'verde', items: [
        ['p63premAut', 'Autonómico', 0.2], ['p63premNac', 'Nacional', 0.5], ['p63premInter', 'Internacional', 1]] },
      { nombre: 'Teatro, circo, composición, coreografía', color: 'azul', items: [
        ['p63TeatroAut', 'Autoría', 1]] },
      { nombre: 'Actuación / concierto', color: 'naranja', items: [
        ['p63ActuaDir', 'Director', 1], ['p63ActuaAct', 'Actor', 1], ['p63ActuaBai', 'Bailarín', 1],
        ['p63ActuaSol', 'Solista', 1], ['p63ActuaDuo', 'Dúo/trío/cuarteto', 0.5]] },
      { nombre: 'Exposiciones', color: 'marron', items: [
        ['p63ExpoInd', 'Individual', 0.5], ['p63ExpoCol', 'Colectiva', 0.2]] },
      { nombre: 'Obra literaria', color: 'morado', items: [
        ['p63ObraAut', 'Autor', 1], ['p63ObraIlu', 'Ilustrador', 0.2]] },
      { nombre: 'Deportistas', color: 'verdeosc', items: [
        ['p63DepNiv', 'Alto nivel', 1], ['p63DepRen', 'Alto rendimiento', 0.5]] }
    ]
  }
];

/* ---------- valores por defecto e índices ---------- */
const DEFECTO = {};
const ITEMS = {};          // id de mérito -> { ap, etiqueta, corto }
const AP = {};             // id de apartado -> definición
APARTADOS.forEach(a => {
  AP[a.id] = a;
  DEFECTO['maxref' + a.id] = a.max ?? null;
  if (a.tipo === 'cargo') DEFECTO['puntosref' + a.id] = a.puntosAnyo;
  if (a.tipo === 'horas') { DEFECTO['puntosref' + a.id] = a.puntos; DEFECTO['ref' + a.id] = a.cada; }
  if (a.tipo === 'merito') a.grupos.forEach(g => g.items.forEach(([id, txt, val]) => {
    DEFECTO[id] = val;
    ITEMS[id] = { ap: a.id, etiqueta: `${g.nombre} · ${txt}` };
  }));
});

/* ---------- estado ---------- */
let config = { ...DEFECTO };
const historial = {};
APARTADOS.forEach(a => historial[a.id] = []);

function cargar() {
  try {
    const s = JSON.parse(localStorage.getItem(ALMACEN) || '{}');
    if (s.config) Object.keys(DEFECTO).forEach(k => { if (k in s.config) config[k] = s.config[k]; });
    if (s.historial) APARTADOS.forEach(a => { if (Array.isArray(s.historial[a.id])) historial[a.id] = s.historial[a.id]; });
  } catch (e) { /* datos corruptos: se empieza de cero */ }
}
function guardar() {
  try { localStorage.setItem(ALMACEN, JSON.stringify({ config, historial })); } catch (e) { }
}

/* ---------- utilidades ---------- */
const $id = id => document.getElementById(id);
const redondear = n => Math.round(n * 1e6) / 1e6;
const fmt = (n, d) => redondear(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtCorto = n => redondear(n).toLocaleString('es-ES', { maximumFractionDigits: 4 });
const num = id => { const v = parseFloat(config[id]); return isNaN(v) ? 0 : v; };
const maxDe = ap => { const v = parseFloat(config['maxref' + ap]); return (isNaN(v) || v <= 0) ? null : v; };

/* ---------- cálculo ---------- */
function calcular(ap) {
  const a = AP[ap], h = historial[ap];
  let bruto = 0, detalle = '';

  if (a.tipo === 'cargo') {
    const meses = h.filter(x => x === 'mes').length;
    const anyos = h.length - meses;
    bruto = (anyos + meses / 12) * num('puntosref' + ap);
    if (h.length) detalle = `Meses: ${meses} · Años: ${anyos}\nTiempo total: ${anyos + Math.floor(meses / 12)} años y ${meses % 12} meses`;
  } else if (a.tipo === 'horas') {
    const horas = h.reduce((s, x) => s + x, 0);
    const cada = num('ref' + ap);
    const tramos = cada > 0 ? Math.floor(horas / cada) : 0;
    bruto = tramos * num('puntosref' + ap);
    if (h.length) detalle = `Horas totales: ${horas} (${tramos} tramos de ${fmtCorto(cada)}h)\n${h.join(' + ')}`;
  } else {
    const cuenta = new Map();
    h.forEach(id => {
      bruto += num(id);
      const et = ITEMS[id] ? ITEMS[id].etiqueta : id;
      cuenta.set(et, (cuenta.get(et) || 0) + 1);
    });
    detalle = [...cuenta].map(([et, n]) => `${et}: ${n}`).join('\n');
  }

  const max = maxDe(ap);
  const total = max !== null ? Math.min(bruto, max) : bruto;
  let aviso = '';
  if (max !== null && bruto >= max - EPS) {
    aviso = `Máximo alcanzado: ${fmtCorto(max)} p`;
    if (bruto > max + EPS) aviso += ` (sin tope: ${fmt(bruto, DECIMALES[a.tipo])})`;
  }
  return { bruto, total, aviso, detalle };
}

/* ---------- acciones ---------- */
function vibrar() { if (navigator.vibrate) navigator.vibrate(8); }
function sumar(ap, valor) { historial[ap].push(valor); guardar(); pintar(ap); vibrar(); }
function deshacer(ap) { if (!historial[ap].length) return; historial[ap].pop(); guardar(); pintar(ap); vibrar(); }
function resetear(ap) {
  if (!historial[ap].length) return;
  if (!confirm(`¿Poner a cero ${AP[ap].titulo}?`)) return;
  historial[ap].length = 0; guardar(); pintar(ap);
}
function resetearTodo() {
  if (!confirm('¿Poner a cero TODOS los apartados?\n(Los valores de referencia se mantienen)')) return;
  APARTADOS.forEach(a => historial[a.id].length = 0); guardar(); pintarTodo();
}
function restaurarValores() {
  if (!confirm('¿Restaurar todos los valores de referencia por defecto?')) return;
  config = { ...DEFECTO }; guardar(); construirConfig(); pintarTodo();
}

/* ---------- pintado ---------- */
function pintarTotalGeneral() {
  const suma = APARTADOS.reduce((s, a) => s + calcular(a.id).total, 0);
  $id('totalGeneral').textContent = fmt(suma, 4);
}

function pintar(ap) {
  const a = AP[ap], r = calcular(ap);
  const txt = fmt(r.total, DECIMALES[a.tipo]);
  $id('total' + ap).textContent = txt;
  $id('chip' + ap).textContent = txt;
  $id('max' + ap).textContent = r.aviso;
  $id('detalle' + ap).textContent = r.detalle;
  $id('deshacer' + ap).disabled = historial[ap].length === 0;

  if (a.tipo === 'cargo') {
    const pa = num('puntosref' + ap);
    $id('sub' + ap).textContent = `${fmtCorto(pa)} p/año · ${fmt(pa / 12, 4)} p/mes`;
  } else if (a.tipo === 'horas') {
    $id('sub' + ap).textContent = `${fmtCorto(num('puntosref' + ap))} p por cada ${fmtCorto(num('ref' + ap))}h`;
  } else {
    a.grupos.forEach(g => g.items.forEach(([id]) => { $id('val-' + id).textContent = fmtCorto(num(id)) + ' p'; }));
  }
  const max = maxDe(ap);
  $id('tope' + ap).textContent = max !== null ? `máx. ${fmtCorto(max)}` : '';
  pintarTotalGeneral();
}

function pintarTodo() { APARTADOS.forEach(a => pintar(a.id)); }

/* ---------- construcción de la interfaz ---------- */
function htmlBoton(ap, valor, color, texto, extra = '') {
  return `<button type="button" class="b ${color}" data-ap="${ap}" data-v="${valor}">${texto}${extra}</button>`;
}

function construirApartados() {
  $id('chips').innerHTML = APARTADOS.map(a =>
    `<a class="chip" href="#ap-${a.id}">${a.titulo.split(' ')[0]} <b id="chip${a.id}">0</b></a>`).join('');

  $id('apartados').innerHTML = APARTADOS.map(a => {
    let cuerpo = '';
    if (a.tipo === 'cargo') {
      cuerpo = `<div class="botones grandes">${htmlBoton(a.id, 'mes', a.color, '+ mes')}${htmlBoton(a.id, 'año', a.color, '+ año')}</div>`;
    } else if (a.tipo === 'horas') {
      cuerpo = `<div class="botones">${BOTONES_HORAS.map(h => htmlBoton(a.id, h, a.color, `+${h}h`)).join('')}</div>`;
    } else {
      cuerpo = a.grupos.map(g => `
        <h3>${g.nombre}</h3>
        <div class="botones meritos">${g.items.map(([id, txt]) =>
          htmlBoton(a.id, id, g.color, txt, `<small id="val-${id}"></small>`)).join('')}</div>`).join('');
    }
    return `
      <section class="tarjeta${a.ancho ? ' ancha' : ''}" id="ap-${a.id}">
        <header>
          <div><h2>${a.titulo}</h2><p class="sub" id="sub${a.id}"></p></div>
          <div class="caja-total"><output id="total${a.id}">0</output><span class="tope" id="tope${a.id}"></span></div>
        </header>
        ${cuerpo}
        <div class="aviso" id="max${a.id}" role="status"></div>
        <div class="detalle" id="detalle${a.id}"></div>
        <footer>
          <button type="button" class="accion" id="deshacer${a.id}" data-accion="deshacer" data-ap="${a.id}">↶ Deshacer</button>
          <button type="button" class="accion peligro" data-accion="reset" data-ap="${a.id}">Reset</button>
        </footer>
      </section>`;
  }).join('');
}

function campo(id, etiqueta, sufijo = '') {
  const v = config[id] ?? '';
  return `<label class="campo"><span>${etiqueta}</span>
    <input type="number" inputmode="decimal" step="any" data-cfg="${id}" value="${v}"${id.startsWith('maxref') ? ' placeholder="sin tope"' : ''}>${sufijo ? `<em>${sufijo}</em>` : ''}</label>`;
}

function construirConfig() {
  $id('camposConfig').innerHTML = APARTADOS.map(a => {
    let filas = '';
    if (a.tipo === 'cargo') filas = campo('puntosref' + a.id, 'Puntos por año', 'p');
    if (a.tipo === 'horas') filas = campo('puntosref' + a.id, 'Puntos por tramo', 'p') + campo('ref' + a.id, 'Horas por tramo', 'h');
    if (a.tipo === 'merito') filas = a.grupos.map(g => g.items.map(([id, txt]) => campo(id, `${g.nombre} · ${txt}`, 'p')).join('')).join('');
    filas += campo('maxref' + a.id, 'Máximo del apartado', 'p');
    return `<fieldset><legend>${a.titulo}</legend>${filas}</fieldset>`;
  }).join('');
}

/* ---------- eventos ---------- */
function alPulsar(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const ap = b.dataset.ap;
  if (b.dataset.accion === 'deshacer') return deshacer(ap);
  if (b.dataset.accion === 'reset') return resetear(ap);
  if (b.id === 'btnResetTodo') return resetearTodo();
  if (b.id === 'btnRestaurar') return restaurarValores();
  if (ap && b.dataset.v !== undefined) {
    const a = AP[ap];
    sumar(ap, a.tipo === 'horas' ? Number(b.dataset.v) : b.dataset.v);
  }
}

function alCambiarConfig(e) {
  const id = e.target.dataset && e.target.dataset.cfg;
  if (!id) return;
  const v = e.target.value.trim();
  config[id] = v === '' ? null : parseFloat(v);
  guardar();
  pintarTodo();
}

function iniciar() {
  cargar();
  construirApartados();
  construirConfig();
  pintarTodo();
  document.addEventListener('click', alPulsar);
  document.addEventListener('input', alCambiarConfig);

  // Service worker: permite instalar la app y usarla sin conexión
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const habiaControlador = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (habiaControlador) location.reload();   // nueva versión publicada
    });
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
