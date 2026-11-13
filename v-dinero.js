/* =====================================================================
   FINANZAS y CAJA Y BANCO (solo admin)
   ===================================================================== */
const CATS_GASTO = [['gasolina', '⛽', 'Gasolina'], ['taxis', '🚕', 'Taxis / transporte'], ['empaque', '📦', 'Empaque'], ['bolsas', '🛍️', 'Bolsas'], ['insumos', '🧴', 'Insumos'], ['servicios', '💡', 'Servicios'], ['otros', '🧾', 'Otros']];
const catGasto = (k) => CATS_GASTO.find((c) => c[0] === k) || ['otros', '🧾', k || 'Otros'];
const TIPO_DIN = { venta: 'Venta', reverso: 'Reverso', pago_comision: 'Comisión', pago_envio: 'Pago a paquetería', gasto: 'Gasto', ingreso: 'Ingreso', deposito: 'Depósito', retiro: 'Retiro', ajuste: 'Ajuste', entrega: 'Efectivo recibido', pago_proveedor: 'Pago a proveedor', compra: 'Compra', extra: '🎁 Extra / propina (del vendedor)' };
const tipoDin = (m) => m.tipo === 'venta' ? (m.cuenta === 'banco' ? '🔁 Transferencia de venta' : 'Venta en efectivo')
  : m.tipo === 'pago_comision' ? (m.venta_id ? 'Comisión (se la quedó)' : m.cuenta === 'caja' ? 'Comisión/extras tomados de su efectivo' : 'Comisión/extras pagados del banco')
  : m.tipo === 'deposito' ? (m.cuenta === 'banco' ? '🏧 Depósito de efectivo' : 'Retiro de caja → banco')
  : m.tipo === 'retiro' && RET_CAT[m.categoria] ? RET_CAT[m.categoria] : (TIPO_DIN[m.tipo] || m.tipo);
const RET_CAT = { prestamo: '🤝 Préstamo a admin', sueldo: '💼 Sueldo de admin', otro: '🏦 Retiro de admin', devolucion: '↩️ Devolución de préstamo' };

// Banco: lo que entró − lo que salió. Con `acumulado` también muestra con cuánto empezó y con cuánto terminó el periodo.
function bancoCuadre(bp, r, acumulado = true) {
  const fila = (l, n, k = '', sub = '') => `<div class="bq-r ${k}"><span>${l}${sub ? ` <i>${sub}</i>` : ''}</span><b class="${(k === 'ini' || k === 'fin') && +n < 0 ? 'neg-t' : ''}">${k === 'neg' ? '−' : k === 'pos' ? '+' : ''}${k === 'neg' || k === 'pos' ? money0(Math.abs(n)) : money0(n)}</b></div>`;
  const filas = [];
  if (acumulado) filas.push(fila('Había al empezar', bp.inicial, 'ini'));
  filas.push(fila('Transferencias de ventas', bp.transferencias, 'pos', `${bp.transf_num} · de clientes`));
  filas.push(fila('Depósitos de efectivo', bp.depositos, 'pos', `${bp.dep_num} · retiro de caja de vendedores`));
  if (+bp.extras) filas.push(fila('Extras / propinas', bp.extras, 'pos', 'de clientes · son de los vendedores'));
  if (+bp.ingresos) filas.push(fila('Otros ingresos', bp.ingresos, 'pos'));
  if (+bp.comisiones) filas.push(fila('Comisiones y extras pagados', bp.comisiones, 'neg'));
  if (+bp.paqueteria) filas.push(fila('Pagado a paquetería', bp.paqueteria, 'neg'));
  if (+bp.gastos) filas.push(fila('Gastos', bp.gastos, 'neg'));
  if (+bp.proveedores) filas.push(fila('Proveedores y compras', bp.proveedores, 'neg'));
  if (+bp.admin_entro) filas.push(fila('Devoluciones de préstamos', bp.admin_entro, 'pos', 'de administradores'));
  if (+bp.admin_salio) filas.push(fila('Préstamos y retiros de admin', bp.admin_salio, 'neg', 'sueldo, préstamos…'));
  if (+bp.otros) filas.push(fila('Ajustes', bp.otros, +bp.otros > 0 ? 'pos' : 'neg'));
  filas.push(acumulado ? fila('Al cierre', bp.final, 'fin') : fila(r.hoy ? 'Neto de hoy' : 'Neto', +bp.final - +bp.inicial, 'fin'));
  return `<div class="bq">${filas.join('')}</div>`;
}
const bancoEntro = (bp) => +bp.transferencias + +bp.depositos + +bp.ingresos + (+bp.extras || 0) + (+bp.admin_entro || 0) + Math.max(0, +bp.otros);
const bancoSalio = (bp) => +bp.comisiones + +bp.paqueteria + +bp.gastos + +bp.proveedores + (+bp.admin_salio || 0) + Math.max(0, -bp.otros);

// Utilidad bruta y neta de un periodo. La merma (café que sobra al producir) también cuesta.
function utilidades(d) {
  const vt = d.ventas;
  const bruta = vt.productos - vt.costo;
  const merma = +(d.merma?.costo || 0);
  const neta = bruta - vt.comisiones + (vt.envio_cobro - vt.envio_costo) - d.gastos - merma;
  return { bruta, neta, merma, margen: vt.productos ? (neta / vt.productos) * 100 : 0 };
}

// Ventas, utilidades, comisiones, envíos y gastos de un periodo (se usa en Hoy y en Analítica)
function bloqueVentas(box, d, r) {
  const vt = d.ventas, pv = d.por_vendedor;
  const { bruta, neta, merma } = utilidades(d);
  const margen = vt.productos ? (neta / vt.productos) * 100 : 0;
  const comPaq = d.envios_lista.reduce((s, x) => s + +x.comision, 0);
  const per = r.hoy ? 'hoy' : `en “${r.etiqueta.toLowerCase()}”`;
  const wf = [
    ['Ventas de producto', vt.productos, 'pos', 'Lo que pagaron los clientes por el café (sin envíos)'],
    ['Costo del producto vendido', -vt.costo, 'neg', 'Lo que nos costó el café que se vendió'],
    ['Utilidad bruta', bruta, 'sub', 'Lo que deja el producto antes de pagar a nadie'],
    ['Comisiones de vendedores', -vt.comisiones, 'neg', ''],
    ['Envíos cobrados al cliente', +vt.envio_cobro, 'pos', ''],
    ['Pagado a paquetería', -vt.envio_costo, 'neg', ''],
    ...(+vt.envio_cobro - vt.envio_costo > 0 ? [['Sobrante de envíos · para embalaje', vt.envio_cobro - vt.envio_costo, 'sub', 'El cliente siempre paga la tarifa fija de envío; lo que no se le paga a la paquetería se queda en el banco como dinero del negocio, para cajas, cinta y durex']] : []),
    ['Gastos operativos', -d.gastos, 'neg', ''],
    ...(merma ? [['Merma de producción', -merma, 'neg', 'Café que sobró al producir y no alcanzó para una pieza']] : []),
    ['Utilidad neta', neta, 'tot', 'Lo que realmente nos queda'],
  ];
  const maxWf = Math.max(1, ...wf.map((w) => Math.abs(w[1])));
  box.innerHTML = `
    <div class="kpis kpis-g4">
      ${kpi('Ventas', cuenta(vt.total), `${vt.num} ventas · ${fnum(d.piezas)} piezas`, { href: '#/ventas', det: barra2(vt.efectivo, vt.transferencia) })}
      ${kpi('Utilidad bruta', cuenta(bruta), vt.productos ? `margen bruto ${fnum((bruta / vt.productos) * 100, 1)}% · ventas de producto − costo del café` : 'ventas de producto − costo del café', { cls: bruta > 0 ? 'ok' : '', info: 'Lo que deja el producto antes de pagar comisiones, envíos y gastos.' })}
      ${kpi('Utilidad neta', cuenta(neta), `margen ${fnum(margen, 1)}% · después de comisiones, envíos, gastos y merma`, { cls: neta < 0 ? 'bad' : neta > 0 ? 'ok' : '', info: 'Lo que realmente nos queda. El detalle está en “¿Cuánto ganamos?”.' })}
      ${kpi('Comisiones', cuenta(vt.comisiones), 'En efectivo se la quedan al cobrar; las de transferencia se les pagan después', { det: desglose(pv.filter((p) => +p.comision).map((p) => ({ ...p, monto: p.comision }))) })}
      ${kpi('Envíos nacionales', cuenta(+vt.envio_costo + comPaq), `${vt.paqueteria} por paquetería: ${money0(vt.envio_costo)} a la paquetería + ${money0(comPaq)} al vendedor`, { click: 'envios', info: 'Lo que se paga por cada venta por paquetería: el envío y la comisión del vendedor. El cliente lo paga por adelantado.' })}
      ${kpi('Gastos operativos', cuenta(d.gastos), 'Bolsas, empaque, gasolina, taxis, insumos', { click: 'gastos' })}
      ${kpi('Promo 3×2', `${cuenta(d.promo.piezas_gratis, 'n')} pz`, +d.promo.piezas_gratis ? `regaladas ${per} · nos costaron ${money0(d.promo.costo)}` : `sin promociones ${per}`, { info: 'Piezas de 14 g que se regalaron con la promoción 3×2 (viernes a domingo).' })}
      ${kpi('Compras al almacén', cuenta(d.compras), 'Mercancía que entró (a costo), pagada o a deuda', { href: '#/almacen', info: 'El valor del café, cápsulas y filtros que se metieron al almacén en este periodo.' })}
    </div>
    <div class="card">
      <div class="card-head"><h2>¿Cuánto ganamos ${per}?</h2><span class="badge ${neta >= 0 ? 'b-ok' : 'b-err'}">margen ${fnum(margen, 1)}%</span></div>
      <div class="wf">${wf.map(([l, n, k, ex]) => `<div class="wf-r wf-${k}">
        <div class="wf-l">${l}${ex ? `<div class="wf-ex">${ex}</div>` : ''}</div>
        <div class="wf-bar"><i style="width:${(Math.abs(n) / maxWf) * 100}%"></i></div>
        <div class="wf-n">${k === 'neg' && n ? '−' : ''}${money0(Math.abs(n))}</div></div>`).join('')}</div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Lo más vendido ${per}</h2>${tablaPorProducto(d.por_producto.map((p) => ({ ...p, total: +p.total })))}</div>
      <div class="card"><div class="card-head"><h2>Merma</h2><span class="muted small"><b>${fnum(d.merma.gramos, 1)} g</b> · ${money0(d.merma.costo)}</span></div>
        <div class="small muted" style="margin-bottom:8px">Café que sobró al producir y no alcanzó para una pieza.</div>
        ${d.merma.detalle.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Merma</th><th class="num">Costo</th></tr></thead><tbody>
          ${d.merma.detalle.map((m) => `<tr><td class="small">${fecha(m.fecha)}<div class="muted">${esc(m.vendedor)}</div></td><td>${esc(m.sku)}</td><td class="num">${fnum(m.merma, 1)} g</td><td class="num">${money(m.costo)}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">Sin merma ${per} ✓</div>`}</div>
    </div>`;
  $('[data-kpi=envios]', box)?.addEventListener('click', () => modal(`<h2>Envíos nacionales · ${esc(r.etiqueta)}</h2>
    <div class="muted small">Cada venta por paquetería: el cliente paga el producto + el envío de su municipio por transferencia; se paga la paquetería y la comisión del vendedor.</div>
    ${d.envios_lista.length ? `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Folio</th><th>Cliente</th><th class="num">Cobrado</th><th class="num">Paquetería</th><th class="num">Vendedor</th><th class="num">Queda</th></tr></thead><tbody>
      ${d.envios_lista.map((x) => `<tr><td>${folio(x.id)}<div class="small muted">${fecha(x.fecha)}</div></td><td><b>${esc(x.cliente)}</b><div class="small muted">${esc(x.vendedor)}${x.verificada ? '' : ' · <span style="color:var(--warn)">por verificar</span>'}</div></td>
        <td class="num">${money0(x.total)}</td><td class="num">${money0(x.envio_costo)}</td><td class="num">${money0(x.comision)}</td><td class="num"><b>${money0(x.total - x.envio_costo - x.comision)}</b></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Sin envíos por paquetería en este periodo</div>'}`, true));
  $('[data-kpi=gastos]', box)?.addEventListener('click', () => {
    const porCat = {};
    d.gastos_lista.forEach((g) => { (porCat[g.categoria] ||= []).push(g); });
    const porBen = d.gastos_por_beneficiario || [];
    const maxB = Math.max(1, ...porBen.map((b) => +b.total));
    modal(`<h2>Gastos operativos · ${esc(r.etiqueta)}</h2>
      ${porBen.some((b) => b.beneficiario) ? `<div class="gben"><div class="gben-t">¿A quién se le pagó?</div>
        ${porBen.map((b) => `<div class="gbar"><span>${b.beneficiario ? `<b>${esc(b.beneficiario)}</b>` : '<span class="muted">Sin especificar</span>'} <span class="muted small">(${b.num})</span></span><div class="bar"><i style="width:${(b.total / maxB) * 100}%"></i></div><b>${money0(b.total)}</b></div>`).join('')}</div>` : ''}
      ${d.gastos_lista.length ? Object.entries(porCat).map(([c, gs]) => { const [, e, l] = catGasto(c); return `<div class="gcat"><div class="gcat-h"><span>${e} <b>${esc(l)}</b></span><b>${money0(gs.reduce((s, g) => s + +g.monto, 0))}</b></div>
        ${gs.map((g) => `<div class="gcat-i"><span>${esc(g.concepto)}${g.beneficiario ? ` <b>→ ${esc(g.beneficiario)}</b>` : ''} <span class="muted small">· ${fecha(g.fecha)} · ${g.cuenta === 'caja' ? 'Efectivo' : 'Banco'}</span></span><span>${money0(g.monto)}</span></div>`).join('')}</div>`; }).join('')
      : '<div class="empty">Sin gastos en este periodo</div>'}
      ${r.hoy ? '<div class="modal-actions"><a class="btn btn-primary" href="#/caja?op=gasto" data-close>+ Registrar gasto</a></div>' : ''}`, true);
  });
}

// Gráfica de ventas por día (o por mes si el periodo es largo)
function graficaSerie(serie, r) {
  let pts = serie.map((x) => ({ k: x.dia, l: x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7), total: +x.total, ut: +x.utilidad, num: +x.num }));
  const dias = (new Date(r.hasta) - new Date(r.desde)) / 864e5;
  if (dias > 62 || r.clave === 'todo') {
    const M = {};
    pts.forEach((p) => { const k = p.k.slice(0, 7); (M[k] ||= { k, l: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+k.slice(5, 7) - 1], total: 0, ut: 0, num: 0 }); M[k].total += p.total; M[k].ut += p.ut; M[k].num += p.num; });
    pts = Object.values(M).sort((a, b) => a.k.localeCompare(b.k));
  }
  if (!pts.length) return '<div class="empty">Sin ventas en este periodo</div>';
  const max = Math.max(1, ...pts.map((p) => p.total));
  const mejor = pts.reduce((a, p) => (p.total > a.total ? p : a), pts[0]);
  return `<div class="small muted" style="margin-bottom:8px">Mejor ${dias > 62 || r.clave === 'todo' ? 'mes' : 'día'}: <b>${esc(mejor.l)}</b> con ${money0(mejor.total)} · promedio ${money0(pts.reduce((s, p) => s + p.total, 0) / pts.length)}</div>
    <div class="gser">${pts.map((p) => `<div class="gs ${p === mejor ? 'top' : ''}" title="${esc(p.l)}: ${money0(p.total)} · ${p.num} ventas · utilidad ${money0(p.ut)}"><b>${p.total >= 1000 ? fnum(p.total / 1000, 1) + 'k' : fnum(p.total)}</b><i style="height:${(p.total / max) * 100}%"><u style="height:${p.total ? Math.max(0, (p.ut / p.total) * 100) : 0}%"></u></i><span>${esc(p.l)}</span></div>`).join('')}</div>
    <div class="small muted" style="margin-top:6px"><span class="ley-c" style="background:var(--brand)"></span> ventas <span class="ley-c" style="background:var(--accent);margin-left:10px"></span> utilidad bruta</div>`;
}

const hoyRango = rangoHoy;

// Fechas de un periodo para mostrarlas: "9 – 15 nov"
const fechasRango = (r) => {
  const fc = (x) => new Date(diaMX(new Date(x)) + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const a = r.desde, b = new Date(new Date(r.hasta) - 1).toISOString();
  if (r.clave === 'todo') return 'desde el inicio';
  return diaMX(new Date(a)) === diaMX(new Date(b)) ? fechaDia(new Date(new Date(a).getTime() + 12 * 36e5).toISOString()) : `${fc(a)} – ${fc(b)}`;
};
// "hoy" / "esta semana" / "el mié 5 nov" para usar dentro de una frase
const perTxt = (r) => (r.hoy ? 'hoy' : r.clave === 'custom' ? (r.dia ? `el ${r.etiqueta}` : `del ${r.etiqueta}`) : r.etiqueta.toLowerCase());

VIEWS['resumen'] = async (v) => {
  // Un solo selector de periodo arriba: todo el tablero (tarjetas, utilidades, gráficas y paneles) sigue ese periodo
  v.innerHTML = `<div class="fin-head" id="fin-h"><div><h1>Finanzas</h1><div class="muted small">${hoyTxt()}</div></div>
      <div class="tools">${rangoHTML('hoy', true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']], cal: true })}</div></div>
    <div class="fin-per" id="fin-per"></div>
    <div id="res"></div>
    <div class="ana-head" id="ana-h"><div><span class="eyebrow">Tendencia</span><h1 id="ana-tit">Analítica</h1><div class="muted small" id="ana-sub"></div></div></div>
    ${tabsHTML('ana', [['tend', 'Tendencia de ventas'], ['vend', 'Por vendedor']], 'tend')}
    <div data-panel="ana:tend"><div id="ana-t"></div></div>
    <div data-panel="ana:vend" hidden><div id="ana-p"></div></div>
`;
  bindTabs(v, 'ana');
  let n = 0;

  const cargar = async (r) => {
    const yo = ++n;
    const per = perTxt(r);
    $('#fin-per', v).innerHTML = r.hoy
      ? '<span class="eyebrow"><span class="vivo"></span>En vivo · hoy</span>'
      : `<span class="eyebrow">📊 ${esc(r.etiqueta)}</span><small>${esc(fechasRango(r))}</small><button type="button" class="btn btn-sm btn-ghost" data-ir-hoy>Volver a hoy</button>`;
    $('[data-ir-hoy]', v)?.addEventListener('click', () => $('#fin-h [data-q=hoy]', v).click());
    $('#res', v).classList.add('cargando');
    // la gráfica de un solo día se ve mejor con los 14 días anteriores
    const dia = r.hoy ? diaMX() : r.dia;
    const rs = dia ? { clave: 'custom', desde: isoMX(masDias(dia, -13)), hasta: isoMX(masDias(dia, 1)), etiqueta: 'Últimos 14 días' } : r;
    const [d, serie, tes] = await Promise.all([
      API.rpc('resumen', { p_desde: r.desde, p_hasta: r.hasta }),
      dia ? API.rpc('resumen', { p_desde: rs.desde, p_hasta: rs.hasta }) : null,
      API.rpc('tesoreria', { p_desde: r.desde, p_hasta: r.hasta }).catch(() => null),
    ]).catch((e) => { toast(e.message, true); return []; });
    if (yo !== n || !d) return;
    $('#res', v).classList.remove('cargando');
    const di = d.dinero, inv = d.inventario, bp = di.banco_periodo;
    const box = $('#res', v);
    box.innerHTML = `
    <div id="hoy-v"></div>
    ${(() => {
      const pg = tes?.pagado || {}, bpp = tes?.banco_periodo || {};
      const filas = [
        ['🧾', 'Gastos operativos', +d.gastos, '#/caja?ir=salidas'],
        ['🎁', 'Comisiones pagadas', +(pg.comisiones_banco || 0) + +(pg.comisiones_efectivo || 0), '#/caja?ir=salidas'],
        ['📦', 'Pagado a paquetería', +(pg.paqueteria || 0), '#/caja?ir=salidas'],
        ['🤝', 'Abonos a proveedores', +(bpp.proveedores || 0), '#/caja?ir=deudas'],
      ];
      const tot = filas.reduce((x, f) => x + f[2], 0), max = Math.max(1, ...filas.map((f) => f[2]));
      return `<div class="grid2 fin-abajo" style="margin-top:16px">
        <div class="card fin-salidas"><div class="card-head"><h2>💸 En qué se fue el dinero</h2><span class="muted small">pagos hechos ${esc(per)}</span></div>
          <div class="bq">${filas.map(([e, l, m, h]) => `<a class="bq-r" href="${h}"><span>${e} ${l}</span><span class="bar"><i style="width:${(m / max) * 100}%"></i></span><b>${money0(m)}</b></a>`).join('')}
            <div class="bq-r fin"><span>Total</span><b>${money0(tot)}</b></div></div>
          <div class="small muted" style="margin-top:8px">El detalle y los botones para pagar están en <a href="#/caja">Caja y pagos</a>.</div></div>
        <div class="card"><div class="card-head"><h2>📦 Lo que vale el inventario</h2><span class="muted small">ahora, no depende del periodo</span></div>
          <div class="bq">
            <a class="bq-r" href="#/almacen"><span>En almacén <i>a costo</i></span><b>${money0(inv.almacen)}</b></a>
            <div class="bq-r"><span>En manos de vendedores <i>a costo · al público ${money0(inv.vendedores_publico)}</i></span><b>${money0(inv.vendedores)}</b></div>
            <div class="bq-r"><span>Empacado devuelto <i>a costo</i></span><b>${money0(inv.empacado)}</b></div>
            <div class="bq-r fin"><span>Total a costo</span><b>${money0(+inv.almacen + +inv.vendedores + +inv.empacado)}</b></div>
          </div></div>
      </div>`;
    })()}`;
    bloqueVentas($('#hoy-v', box), d, r);

    // ---------- Tendencia (abajo): gráfica de ventas y cuadre del banco del mismo periodo ----------
    const s = serie || d;
    $('#ana-tit', v).textContent = `Analítica · ${r.etiqueta}`;
    $('#ana-sub', v).textContent = dia ? `Ventas de los 14 días hasta ${r.hoy ? 'hoy' : r.etiqueta}` : `Ventas por ${(new Date(r.hasta) - new Date(r.desde)) / 864e5 > 62 || r.clave === 'todo' ? 'mes' : 'día'} · ${esc(r.etiqueta)}`;
    const porV = bp.por_vendedor || [];
    $('#ana-t', v).innerHTML = `
      <div class="card"><div class="card-head"><h2>Ventas · ${esc(rs.etiqueta)}</h2><span class="muted small">${s.ventas.num} ventas · ${money0(s.ventas.total)}</span></div>${graficaSerie(s.serie, rs)}</div>`;
    $('#ana-p', v).innerHTML = `
      <div class="card"><div class="card-head"><h2>Por vendedor · ${esc(r.etiqueta)}</h2></div>
        ${d.por_vendedor.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vendedor</th><th class="num">Ventas</th><th class="num">Efectivo</th><th class="num">🔁 Transf. de ventas</th><th class="num">🏧 Depósitos de efectivo</th><th class="num">Comisión</th><th class="num">Utilidad bruta</th></tr></thead><tbody>
          ${d.por_vendedor.map((p) => { const b = porV.find((x) => x.vendedor_id === p.vendedor_id) || {}; const ub = p.total - p.costo; return `<tr><td><span class="mini-ava">${avatar(p)}</span> <b>${esc(p.nombre)}</b></td><td class="num">${money0(p.total)}<div class="small muted">${p.num} · ${fnum(p.piezas)} pz</div></td><td class="num">${money0(p.efectivo)}<div class="small muted">${p.efectivo_num}</div></td><td class="num">${money0(p.transferencia)}<div class="small muted">${p.transf_num}</div></td><td class="num">${money0(b.depositos || 0)}<div class="small muted">${b.dep_num || 0}</div></td><td class="num">${money0(p.comision)}</td><td class="num"><b>${money0(ub)}</b></td></tr>`; }).join('')}
        </tbody></table></div>` : `<div class="empty">Sin ventas ${esc(per)}</div>`}</div>`;
    animarNumeros(v);

  };
  const leer = bindRango($('#fin-h', v), cargar);
  await cargar(leer());
};

// Tabla de movimientos de dinero con filtros (Todo / Banco / Efectivo / Pagos)
function tablaMovs(movs, r, per) {
  return `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Movimientos · ${esc(per)}</h2>
    <div class="seg seg-sm" data-mcta><button type="button" class="on" data-c="">Todo</button><button type="button" data-c="banco">Banco</button><button type="button" data-c="caja">Efectivo</button><button type="button" data-c="pagos">Pagos</button></div></div>
    ${movs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${r.hoy ? 'Hora' : 'Fecha'}</th><th>Dónde</th><th>Tipo</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>
    ${movs.map((m) => `<tr data-cta="${m.cuenta}" data-pago="${['pago_comision', 'pago_envio', 'pago_proveedor'].includes(m.tipo) && !m.venta_id ? 1 : ''}"><td class="small">${r.hoy ? hora(m.fecha) : fecha(m.fecha)}</td>
      <td>${m.cuenta === 'caja' ? `<span class="badge b-ok">Efectivo</span><div class="small muted">${esc(m.vendedor || '')}</div>` : `<span class="badge b-info">Banco</span>${m.vendedor && ['deposito', 'venta', 'reverso'].includes(m.tipo) ? `<div class="small muted">vía ${esc(m.vendedor)}</div>` : ''}`}</td>
      <td>${tipoDin(m)}${m.categoria && m.tipo === 'gasto' ? ` <span class="small">${catGasto(m.categoria)[1]}</span>` : ''}</td>
      <td class="small">${m.venta_id ? `${folio(m.venta_id)} · ` : ''}${esc(m.concepto || '')}${m.beneficiario ? ` <b>→ ${esc(m.beneficiario)}</b>` : ''}${m.usuario ? ` <span class="muted">· ${esc(m.usuario)}</span>` : ''}</td>
      <td class="num" style="color:${m.monto < 0 ? 'var(--err)' : 'var(--ok)'}"><b>${m.monto > 0 ? '+' : ''}${money(m.monto)}</b></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">Sin movimientos ${esc(per)}</div>`}</div>`;
}
function bindMovs(box) {
  $$('[data-mcta]', box).forEach((seg) => {
    const card = seg.closest('.card');
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      const c = b.dataset.c;
      $$('tr[data-cta]', card).forEach((tr) => tr.classList.toggle('hidden', !!c && (c === 'pagos' ? !tr.dataset.pago : tr.dataset.cta !== c)));
    }));
  });
}

// Cuadrar banco: escribes lo que dice tu banca en línea y la diferencia queda registrada con su motivo
// alListo: qué recargar al terminar · abrirOp: abrir el formulario de depósito o gasto
async function formCuadreBanco(sis, { alListo = () => {}, abrirOp = (op) => { location.hash = '#/caja?op=' + op; } } = {}) {
  const MOT_MAS = [['saldo_inicial', '💰', 'Ya había dinero', 'antes de usar el sistema'], ['transferencia', '🔁', 'Transferencia', 'que entró y no se registró'], ['otro', '✏️', 'Otro', 'escribe qué pasó']];
  const MOT_MENOS = [['comision_banco', '🏦', 'Cargo del banco', 'comisión, IVA, anualidad…'], ['otro', '✏️', 'Otro', 'escribe qué pasó']];
  let motivo = '';
  modal(`<h2>🧮 Cuadrar banco</h2><div class="muted">Abre tu banca en línea y escribe cuánto hay ahorita. Te digo si cuadra con lo registrado y, si no, la diferencia queda anotada con su motivo.</div>
    <form id="fcua">
      <div class="cua-sis"><span>Según el sistema</span><b class="${sis < 0 ? 'neg-t' : ''}">${money0(sis)}</b></div>
      <label class="field"><span>¿Cuánto hay en el banco ahorita?</span><input name="real" type="number" step="any" inputmode="decimal" class="input-big" required placeholder="Ej. 5500"></label>
      <div id="cua-r"></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="cua-go" disabled>Guardar</button></div>
      <div id="cua-h"></div>
    </form>`);
  const f = $('#fcua', dlg), res = $('#cua-r', f), go = $('#cua-go', f);
  const pinta = () => {
    const txt = f.real.value.trim();
    if (txt === '') { res.innerHTML = ''; go.disabled = true; go.textContent = 'Guardar'; return; }
    const real = +txt, dif = Math.round((real - sis) * 100) / 100;
    if (Math.abs(dif) < 0.005) {
      res.innerHTML = '<div class="cua-ok">✓ ¡Cuadra! El banco y el sistema dicen lo mismo.</div>';
      go.disabled = false; go.textContent = 'Listo'; motivo = ''; return;
    }
    const mas = dif > 0, mots = mas ? MOT_MAS : MOT_MENOS;
    if (!mots.some((m) => m[0] === motivo)) motivo = '';
    res.innerHTML = `<div class="cua-dif ${mas ? 'mas' : 'menos'}">${mas ? `En el banco hay <b>${money0(dif)} más</b> de lo registrado` : `En el banco hay <b>${money0(-dif)} menos</b> de lo registrado`}</div>
      <div class="cua-tip">${mas
        ? `Antes de ajustar, revisa: ¿un vendedor depositó efectivo? <button type="button" class="btn btn-sm" data-cua-op="deposito">🏧 Registrar depósito</button> (así se le descuenta de lo que trae). ¿Un gasto se pagó en efectivo pero quedó como banco? Revíertelo en <b>Gastos operativos</b> y regístralo bien.`
        : `Antes de ajustar, revisa: ¿falta registrar un gasto o un pago? <button type="button" class="btn btn-sm" data-cua-op="gasto">🧾 Registrar gasto</button>`}</div>
      <div class="field"><span>Si no es eso, ¿por qué la diferencia?</span><div class="pick-row" id="cua-m">${mots.map(([k, e, l, sub]) => `<button type="button" class="pick ${motivo === k ? 'on' : ''}" data-m="${k}"><span class="mini-ava mini-of">${e}</span>${l}<small>${sub}</small></button>`).join('')}</div></div>
      <label class="field"><span>Nota ${motivo === 'otro' ? '' : '<i class="muted">(opcional)</i>'}</span><input name="nota" maxlength="140" placeholder="Ej. saldo al 10 de noviembre" value="${esc(f.nota?.value || '')}"></label>`;
    $$('#cua-m .pick', res).forEach((b) => b.addEventListener('click', () => { motivo = b.dataset.m; pinta(); }));
    $$('[data-cua-op]', res).forEach((b) => b.addEventListener('click', () => { dlg.close(); abrirOp(b.dataset.cuaOp); }));
    go.disabled = !motivo;
    go.textContent = motivo ? `Registrar ajuste de ${mas ? '+' : '−'}${money0(Math.abs(dif))}` : 'Elige el motivo';
  };
  f.real.addEventListener('input', pinta);
  f.addEventListener('submit', (e) => { e.preventDefault(); run(go, async () => {
    const r = await API.rpc('cuadrar_banco', { p_saldo_real: +f.real.value, p_motivo: motivo || null, p_nota: f.nota?.value || null });
    dlg.close();
    if (r.cuadra) { FX.exito(); toast('✓ El banco cuadra'); alListo(); return; }
    FX.caja(); toast(`Banco cuadrado · ajuste de ${r.diferencia > 0 ? '+' : '−'}${money0(Math.abs(r.diferencia))}`); alListo();
  }); });
  f.real.focus();
  // cuadres anteriores
  const hist = await API.rpc('cuadres_banco').catch(() => []);
  if (hist.length && $('#cua-h', dlg)) $('#cua-h', dlg).innerHTML = `<div class="cua-hist"><div class="small muted">Cuadres anteriores</div>${hist.slice(0, 5).map((h) => `<div class="cua-hi"><span>${esc(h.concepto.replace(/^Cuadre de banco · /, ''))}<small class="muted"> · ${esc(h.por || '')} · ${fecha(h.registrado || h.fecha)}</small></span><b class="${h.monto < 0 ? 'neg-t' : ''}">${h.monto > 0 ? '+' : '−'}${money0(Math.abs(h.monto))}</b></div>`).join('')}</div>`;
}

/* ---------- caja y banco ----------
   No hay caja de oficina: el efectivo lo trae cada vendedor hasta que lo deposita al banco.
   Comisiones de ventas por transferencia y la paquetería quedan "por pagar". */
VIEWS['caja'] = async (v, q) => {
  const ACCIONES = [['deposito', '🏧', 'Depósito', 'efectivo de un vendedor'], ['pago_comision', '🎁', 'Pagar comisión', 'y extras de vendedores'], ['pago_envio', '📦', 'Pagar paquetería', 'envíos pendientes'],
    ['gasto', '🧾', 'Gasto', 'gasolina, bolsas…'], ['retiro_admin', '🏦', 'Préstamo / retiro', 'admin · sale del banco'], ['pago_proveedor', '🤝', 'Pagar proveedor', 'abonar a deuda'], ['ingreso', '➕', 'Otro ingreso', 'que no es venta']];
  v.innerHTML = `<div class="page-head"><div><h1>Caja y pagos</h1><div class="muted small">${hoyTxt()} · qué hay que pagar y registrar · el dinero (banco y efectivo) está en la <a href="#/boveda">🔒 Bóveda</a></div></div></div>
    <div class="acciones">${ACCIONES.map(([k, e, t, s]) => `<button type="button" class="tile tile-sm" data-op="${k}"><span class="tile-e">${e}</span><span class="tile-t">${t}</span><span class="tile-s">${s}</span></button>`).join('')}</div>
    <div id="cj"></div>
`;
  let salTab = 'gastos';
  const recargarHist = () => {}; // el historial se fue: banco a la Bóveda, pagos hechos a Finanzas
  let d = null;
  let adminsCache = [];

  const load = async () => {
    const r = hoyRango();
    let admins;
    [d, admins] = await Promise.all([API.rpc('tesoreria', { p_desde: r.desde, p_hasta: r.hasta }), API.rpc('retiros_admin', { p_desde: r.desde, p_hasta: r.hasta }).catch(() => [])]);
    adminsCache = admins;
    const per = r.hoy ? 'hoy' : r.etiqueta.toLowerCase();
    const vs = d.vendedores;
    const pp = d.por_pagar, pg = d.pagado, bp = d.banco_periodo;
    const abiertas = d.deudas.filter((x) => +x.saldo > 0);
    const totDeuda = abiertas.reduce((s, x) => s + +x.saldo, 0);
    const totGastos = d.gastos.reduce((s, g) => s + +g.total, 0);
    const maxG = Math.max(1, ...d.gastos.map((g) => +g.total));
    const paqVs = vs.filter((x) => x.envio_nacional || +x.paq.num);
    const totPorPagar = +pp.comisiones + +pp.paqueteria;
    const box = $('#cj', v);
    // proveedores con saldo, agrupados por nombre
    const provAb = [];
    abiertas.forEach((x) => { const k = String(x.proveedor || 'Sin nombre').trim().toUpperCase(); let g = provAb.find((y) => y.k === k); if (!g) provAb.push(g = { k, nombre: x.proveedor || 'Sin nombre', saldo: 0, num: 0 }); g.saldo += +x.saldo; g.num++; });
    provAb.sort((a, b) => b.saldo - a.saldo);
    const nosDeben = admins.filter((a) => +a.prestamo_pendiente > 0);
    const totDebe = totPorPagar + totDeuda;
    box.innerHTML = `
      <div class="card porpagar ${totDebe ? 'warn' : ''}" id="porpagar">
        <div class="card-head"><h2>🧾 Todo lo que se debe</h2><span class="badge ${totDebe ? 'b-warn' : 'b-ok'}">${totDebe ? `${money0(totDebe)} pendiente` : 'Todo pagado ✓'}</span></div>
        <div class="debe-sec">Vendedores y paquetería · ${money0(totPorPagar)}</div>
        <div class="small muted" style="margin-bottom:10px">Las ventas por transferencia caen completas al banco, así que ahí se le debe la comisión al vendedor y el envío a la paquetería (cuentan en cuanto verificas la transferencia).</div>
        <div class="pp-list">
          ${vs.map((x) => `<div class="pp ${+x.comision_pendiente ? '' : 'ok'}"><span class="mini-ava">${avatar(x)}</span>
            <div><b>Comisiones${+x.extra ? ' y extras' : ''} de ${esc(x.nombre)}</b><div class="small muted">${+x.comision_pendiente ? `de transferencias ya verificadas, sin pagar` : 'No se le debe nada'}${+x.extra ? ` · 🎁 extras ${esc(per)} ${money0(x.extra)} (${x.extra_num}) · <a href="#/ventas?v=${x.vendedor_id}">ver sus ventas</a>` : ''}${+x.comision_pagada ? ` · pagado ${esc(per)} ${money0(x.comision_pagada)}` : ''}</div></div>
            <b class="pp-m">${money0(x.comision_pendiente)}</b>
            ${+x.comision_pendiente ? `<div class="pp-b"><button class="btn btn-sm ${+x.en_poder > 0 ? 'btn-primary' : ''}" data-pcom="${x.vendedor_id}" data-o="caja" ${+x.en_poder > 0 ? '' : 'disabled'}>💵 Descontar de su efectivo</button><button class="btn btn-sm ${+x.en_poder > 0 ? '' : 'btn-primary'}" data-pcom="${x.vendedor_id}" data-o="banco">🏦 Pagar del banco</button></div>` : '<span class="pp-b small muted">✓</span>'}
          </div>`).join('')}
          <div class="pp ${+pp.paqueteria ? '' : 'ok'}"><span class="mini-ava mini-of">📦</span>
            <div><b>Paquetería</b><div class="small muted">${+pp.paqueteria ? `envíos ya cobrados y verificados, sin pagar` : 'No se le debe nada'}${+pg.paqueteria ? ` · pagado ${esc(per)} ${money0(pg.paqueteria)}` : ''}</div></div>
            <b class="pp-m">${money0(pp.paqueteria)}</b>
            ${+pp.paqueteria ? '<div class="pp-b"><button class="btn btn-sm btn-primary" data-op="pago_envio">Pagar</button></div>' : '<span class="pp-b small muted">✓</span>'}
          </div>
        </div>
        <div class="debe-sec">Proveedores · ${money0(totDeuda)}</div>
        ${provAb.length ? `<div class="pp-list">${provAb.map((g) => `<div class="pp"><span class="mini-ava mini-of">🤝</span>
            <div><b>${esc(g.nombre)}</b><div class="small muted">${g.num} ${g.num === 1 ? 'compra' : 'compras'} con saldo · consignación o crédito</div></div>
            <b class="pp-m">${money0(g.saldo)}</b>
            <div class="pp-b"><button type="button" class="btn btn-sm btn-primary" data-ir="deudas">Abonar</button></div></div>`).join('')}</div>`
          : '<div class="small muted">✓ No se le debe a ningún proveedor</div>'}
        ${nosDeben.length ? `<div class="debe-sec">Nos deben</div><div class="pp-list">${nosDeben.map((a) => `<div class="pp"><span class="mini-ava">${avatar(a)}</span>
            <div><b>Préstamo a ${esc(a.nombre)}</b><div class="small muted">administrador · lo devuelve después</div></div>
            <b class="pp-m">${money0(a.prestamo_pendiente)}</b>
            <div class="pp-b"><button type="button" class="btn btn-sm" data-devolver="${a.id}">↩️ Devolvió</button></div></div>`).join('')}</div>` : ''}
      </div>

      <div class="card nucleo-sal" id="salidas">
        <div class="card-head"><h2>💸 Salidas del negocio</h2><span class="muted small">lo que sale del dinero del negocio, cada cosa en su pestaña</span></div>
        <div class="seg" data-sal>${[['gastos', '🧾 Gastos operativos'], ['pagos', '🎁 Comisiones y 📦 paquetería']].map(([k, l]) => `<button type="button" data-s="${k}" class="${salTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div id="gastos-cj" ${salTab === 'gastos' ? '' : 'hidden'}></div>
        <div id="pagos-cj" ${salTab === 'pagos' ? '' : 'hidden'}></div>
      </div>

      ${tabsHTML('caja', [['vend', 'Cuentas de vendedores'], ['prov', 'Proveedores', totDeuda ? '!' : ''], ['admins', 'Administradores', nosDeben.length ? '!' : '']], 'vend')}
      <div data-panel="caja:vend">
      <div class="vgrid">${vs.map((x) => `<div class="card vcard">
        <div class="vcard-h"><span class="lado-ava">${avatar(x)}</span><div><b>${esc(x.nombre)}</b><div class="small muted">${x.num} ventas · ${money0(x.total)}</div></div></div>
        <div class="vrow"><span>💵 Cobró en efectivo</span><b>${money0(x.efectivo)}</b></div>
        <div class="vrow sub"><span>se quedó su comisión</span><b>${money0(x.comision_efectivo)}</b></div>
        <div class="vrow"><span>🔁 Transferencias de ventas (al banco)</span><b>${money0(x.transferencia)}</b></div>
        ${+x.transf_pendiente ? `<div class="vrow sub warn"><span>de ellas por verificar</span><b>${money0(x.transf_pendiente)}</b></div>` : ''}
        <div class="vrow sub"><span>comisión ganada en transferencias</span><b>${money0(x.comision_transf)}</b></div>
        ${+x.extra ? `<div class="vrow"><span>🎁 Extras / propinas (son suyos)</span><b>${money0(x.extra)} <span class="muted small">· ${x.extra_num}</span></b></div>` : ''}
        ${+x.comision_pagada ? `<div class="vrow"><span>🎁 Comisión pagada</span><b>${money0(x.comision_pagada)}</b></div>` : ''}
        <div class="vrow"><span>🏧 Depositó al banco (retiro de caja)</span><b>${money0(x.depositado)}</b></div>
        <div class="vrow tot"><span>Trae en efectivo ahora</span><b>${money0(x.en_poder)}</b></div>
        ${+x.comision_pendiente ? `<div class="vrow tot debe"><span>Le debemos (comisión${+x.extra ? ' + extras' : ''})</span><b>${money0(x.comision_pendiente)}</b></div>` : ''}
      </div>`).join('')}</div>

      ${paqVs.length ? `<div class="card"><div class="card-head"><h2>📦 Paquetería · ${esc(per)}</h2><span class="badge b-ok">siempre por transferencia, por adelantado</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vendedor</th><th class="num">Envíos</th><th class="num">Cobrado (al banco)</th><th class="num">A paquetería</th><th class="num">Comisión</th><th class="num">Costo café</th><th class="num">Utilidad bruta</th></tr></thead><tbody>
        ${paqVs.map((x) => { const p = x.paq; const ub = p.cobrado - p.envio - p.comision - p.costo; return `<tr><td><b>${esc(x.nombre)}</b></td><td class="num">${p.num}</td><td class="num">${money0(p.cobrado)}</td><td class="num">−${money0(p.envio)}</td><td class="num">−${money0(p.comision)}</td><td class="num">−${money0(p.costo)}</td><td class="num"><b style="color:${ub >= 0 ? 'var(--ok)' : 'var(--err)'}">${money0(ub)}</b></td></tr>`; }).join('')}
        </tbody></table></div></div>` : ''}
      </div>
      <div data-panel="caja:prov" hidden>
        <div class="card" id="deudas"><div class="card-head"><h2>🤝 Proveedores</h2><button class="btn btn-sm" id="nueva-deuda">+ Deuda</button></div>
          <div class="small muted" style="margin-bottom:8px">Mercancía a consignación o a crédito. Abona desde el banco o con efectivo de un vendedor.</div>
          ${d.deudas.length ? (() => {
            const grupos = [];
            d.deudas.forEach((x) => {
              const k = String(x.proveedor || 'Sin nombre').trim().toUpperCase();
              let g = grupos.find((y) => y.k === k); if (!g) grupos.push(g = { k, nombre: x.proveedor, items: [], monto: 0, pagado: 0, saldo: 0 });
              g.items.push(x); g.monto += +x.monto; g.pagado += +x.pagado; g.saldo += +x.saldo;
            });
            grupos.sort((a, b) => b.saldo - a.saldo);
            return `<div class="pvs">${grupos.map((g) => { const pct = g.monto ? (g.pagado / g.monto) * 100 : 0; const abiertas = g.items.filter((x) => +x.saldo > 0).length; return `<details class="pvg ${g.saldo ? '' : 'pagada'}">
              <summary class="pvg-h"><span class="pvg-ava">${esc(g.nombre.trim().slice(0, 1).toUpperCase())}</span>
                <span class="pvg-t"><b>${esc(g.nombre)}</b><span class="small muted">${g.items.length} ${g.items.length === 1 ? 'compra' : 'compras'} · pagado ${money0(g.pagado)}</span>
                  <span class="bar"><i style="width:${pct}%"></i></span></span>
                <span class="pvg-v">${g.saldo ? `<small>se le debe</small><b>${money0(g.saldo)}</b>` : '<span class="badge b-ok">Pagado ✓</span>'}</span><span class="pvg-car">›</span></summary>
              <div class="pvg-b">${g.items.map((x) => { const pc = x.monto ? (x.pagado / x.monto) * 100 : 0; return `<div class="deuda ${+x.saldo ? '' : 'pagada'}">
                <div class="deuda-h"><span><b>${esc(String(x.concepto || '').split(' · ').filter((t) => t.trim().toUpperCase() !== g.k).join(' · '))}</b><div class="small muted">${fecha(x.fecha)}</div></span>
                  ${+x.saldo ? `<button class="btn btn-sm btn-primary" data-abonar="${x.id}">Abonar</button>` : '<span class="badge b-ok">Pagada ✓</span>'}</div>
                <div class="bar bar-lg"><i style="width:${pc}%"></i></div>
                <div class="small muted">Pagado ${money0(x.pagado)} de ${money0(x.monto)}${+x.saldo ? ` · <b style="color:var(--warn)">resta ${money0(x.saldo)}</b>` : ''}</div>
                ${+x.pagado === 0 ? `<button type="button" class="deuda-fix" data-a-banco="${x.id}">¿Se equivocaron? Cambiar a pagado por banco</button>` : ''}</div>`; }).join('')}</div>
            </details>`; }).join('')}</div>
            <div class="pvs-tot">Total que se debe <b>${money0(grupos.reduce((t, g) => t + g.saldo, 0))}</b></div>`;
          })()
          : '<div class="empty">Sin deudas con proveedores</div>'}
          <details class="cb-box" id="cbanco"><summary>🏦 Compras pagadas por banco (últimos 30 días) · corregir si eran consignación</summary><div class="cb-list"><div class="empty">Cargando…</div></div></details></div>
      </div>
      <div data-panel="caja:admins" hidden>
        <div class="card"><div class="card-head"><h2>🏦 Préstamos y retiros de administradores</h2><button class="btn btn-sm btn-primary" data-op="retiro_admin">+ Préstamo / retiro</button></div>
          <div class="small muted" style="margin-bottom:12px">Dinero que un administrador saca del banco. Los <b>préstamos</b> se quedan como deuda del administrador hasta que los devuelve; el <b>sueldo</b> y otros retiros solo quedan registrados.</div>
          ${admins.length ? `<div class="adm-grid">${admins.map((a) => `<div class="adm-c">
            <div class="adm-h"><span class="lado-ava">${avatar(a)}</span><div><b>${esc(a.nombre)}</b><div class="small muted">${esc(per)}: ${[+a.prestamos && `préstamos ${money0(a.prestamos)}`, +a.sueldos && `sueldo ${money0(a.sueldos)}`, +a.otros && `otros ${money0(a.otros)}`, +a.devoluciones && `devolvió ${money0(a.devoluciones)}`].filter(Boolean).join(' · ') || 'sin retiros'}</div></div></div>
            <div class="adm-debe ${+a.prestamo_pendiente ? '' : 'ok'}"><span>${+a.prestamo_pendiente ? 'Debe de préstamos' : 'No debe préstamos'}</span><b>${money0(a.prestamo_pendiente)}</b>
              ${+a.prestamo_pendiente ? `<button class="btn btn-sm" data-devolver="${a.id}">↩️ Devolvió</button>` : ''}</div>
            ${a.movs.length ? `<div class="adm-movs">${a.movs.map((m) => `<div class="adm-m"><span>${RET_CAT[m.categoria] || 'Retiro'}<small>${fecha(m.fecha)}${m.concepto && m.concepto.includes(' · ') ? ' · ' + esc(m.concepto.split(' · ').slice(1).join(' · ')) : ''}</small></span><b style="color:${m.monto < 0 ? 'var(--err)' : 'var(--ok)'}">${m.monto > 0 ? '+' : ''}${money0(m.monto)}</b></div>`).join('')}</div>` : ''}
          </div>`).join('')}</div>` : '<div class="empty">No hay administradores activos</div>'}
        </div>
      </div>`;
    const irCaja = bindTabs(box, 'caja');
    $$('[data-devolver]', box).forEach((b) => b.addEventListener('click', () => formDevolver(admins.find((a) => a.id === b.dataset.devolver))));
    animarNumeros(box);
    $$('[data-depositar]', box).forEach((b) => b.addEventListener('click', () => formDinero('deposito', { vendedor: b.dataset.depositar })));
    $$('[data-pcom]', box).forEach((b) => b.addEventListener('click', () => formDinero('pago_comision', { vendedor: b.dataset.pcom, origen: b.dataset.o })));
    $$('[data-abonar]', box).forEach((b) => b.addEventListener('click', () => formDinero('pago_proveedor', { deuda: +b.dataset.abonar })));
    $$('[data-op]', box).forEach((b) => b.addEventListener('click', () => formDinero(b.dataset.op)));
    $('#nueva-deuda', box).addEventListener('click', formDeuda);
    const provs = [...new Set(d.deudas.map((x) => String(x.proveedor || '').trim().toUpperCase()).filter(Boolean))];
    $$('[data-a-banco]', box).forEach((b) => b.addEventListener('click', () => {
      const x = d.deudas.find((y) => y.id === +b.dataset.aBanco);
      modal(`<h2>🏦 Cambiar a pagado por banco</h2><div class="muted">${esc(x.concepto)}</div>
        <p>Se quita la deuda de <b>${esc(x.proveedor)}</b> y se registra como pagada desde el banco: sale <b>${money0(x.monto)}</b> del banco. El stock no cambia.</p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="okfix">Sí, se pagó por banco</button></div>`);
      $('#okfix', dlg).addEventListener('click', (e) => run(e.currentTarget, async () => {
        await API.rpc('corregir_compra', { p_deuda: x.id });
        dlg.close(); toast('Corregido: quedó pagada por banco'); load(); recargarHist();
      }));
    }));
    const cb = $('#cbanco', box);
    cb.addEventListener('toggle', async () => {
      if (!cb.open || cb.dataset.ok) return;
      const lista = await API.rpc('compras_banco_recientes').catch((e) => { toast(e.message, true); return []; });
      cb.dataset.ok = '1';
      $('.cb-list', cb).innerHTML = lista.length ? lista.map((c) => `<div class="cb-row"><span><b>${esc(c.concepto)}</b><div class="small muted">${fecha(c.fecha)}${c.usuario ? ` · por ${esc(c.usuario)}` : ''} · ${money0(c.monto)}</div></span>
        <button type="button" class="btn btn-sm" data-a-deuda="${c.id}">Era consignación</button></div>`).join('') : '<div class="empty">No hay compras pagadas por banco</div>';
      $$('[data-a-deuda]', cb).forEach((b) => b.addEventListener('click', () => {
        const c = lista.find((y) => y.id === +b.dataset.aDeuda);
        const sug = (String(c.concepto).split(' · ').length > 2 ? String(c.concepto).split(' · ').pop() : '').trim().toUpperCase();
        modal(`<h2>🤝 Cambiar a consignación</h2><div class="muted">${esc(c.concepto)}</div>
          <p>Se regresan <b>${money0(c.monto)}</b> al banco y queda como deuda con el proveedor. El stock no cambia.</p>
          <form id="ffix"><label class="field"><span>Proveedor</span><input name="p" required list="provs-l" value="${esc(sug)}" autocomplete="off"></label>
          <datalist id="provs-l">${provs.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
          <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Sí, era consignación</button></div></form>`);
        $('#ffix', dlg).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; run($('.btn-primary', f), async () => {
          await API.rpc('corregir_compra', { p_dinero: c.id, p_proveedor: f.p.value });
          dlg.close(); toast('Corregido: ahora es deuda con ' + f.p.value.trim().toUpperCase()); load(); recargarHist();
        }); });
      }));
    });
    const irDeudas = () => { irCaja('prov'); $('#deudas', box).scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $$('[data-ir=deudas]', box).forEach((b) => b.addEventListener('click', irDeudas));
    // salidas del negocio: gastos operativos | comisiones y paquetería (mismo núcleo, sin mezclarse)
    tarjetaGastos($('#gastos-cj', box));
    tarjetaPagos($('#pagos-cj', box), 'semana', {}, { sinPorPagar: true });
    $$('[data-sal] [data-s]', box).forEach((b) => b.addEventListener('click', () => {
      salTab = b.dataset.s; FX.tap();
      $$('[data-sal] [data-s]', box).forEach((x) => x.classList.toggle('on', x === b));
      $('#gastos-cj', box).hidden = salTab !== 'gastos'; $('#pagos-cj', box).hidden = salTab !== 'pagos';
    }));
    if (q.ir) {
      const ir = q.ir; q.ir = '';
      if (ir === 'deudas') irCaja('prov', false);
      else if (ir === 'salidas') setTimeout(() => $('#salidas', box)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      else if (ir === 'porpagar') setTimeout(() => $('#porpagar', box)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };


  const TIT = {
    deposito: ['🏧 Depósito de efectivo', 'El vendedor lleva al banco el efectivo de sus ventas (retiro de su caja). No es una venta: queda registrado quién lo depositó.'],
    pago_comision: ['🎁 Pagar comisión y extras', 'Comisiones de ventas por transferencia y extras (propinas que el cliente transfirió de más). Ese dinero cayó al banco: se paga del banco, o se descuenta del efectivo que trae el vendedor.'],
    pago_envio: ['📦 Pagar a la paquetería', 'Lo que se le debe a la paquetería por los envíos ya cobrados.'],
    gasto: ['🧾 Registrar gasto', 'Dinero que sale para operar: gasolina, bolsas, empaque, taxis…'],
    pago_proveedor: ['🤝 Pagar a proveedor', 'Abona a lo que se debe de mercancía a consignación o crédito.'],
    ingreso: ['➕ Otro ingreso', 'Dinero que entra y no es venta (aportación, préstamo…).'],
    retiro_admin: ['🏦 Préstamo o retiro de administrador', 'Dinero que un administrador saca del banco: préstamo (lo devuelve después), sueldo u otro retiro. Queda registrado quién lo tomó.'],
    cuadre: ['🧮 Cuadrar banco', ''],
    ajuste: ['⚖️ Ajuste de saldo', 'Corrige el saldo después de revisar el banco o contar el efectivo de un vendedor. Usa negativo para restar.'],
  };
  // Cuadrar banco (la misma ventana que usa la Bóveda)
  function formCuadre() { return formCuadreBanco(+d.banco, { alListo: () => { load(); recargarHist(); }, abrirOp: (op) => formDinero(op) }); }
  // Préstamo / retiro del banco para un administrador
  function formRetiro(pre = {}) {
    const admins = adminsCache.length ? adminsCache : [{ id: ME.id, nombre: ME.nombre, usuario: ME.usuario, prestamo_pendiente: 0 }];
    let quien = admins.some((a) => a.id === ME.id) ? ME.id : admins[0].id, motivo = 'prestamo';
    const MOT = [['prestamo', '🤝', 'Préstamo', 'lo devuelve después'], ['sueldo', '💼', 'Sueldo', 'pago al administrador'], ['otro', '🏦', 'Otro retiro', 'escribe para qué']];
    modal(`<h2>🏦 Préstamo o retiro del banco</h2><div class="muted">Sale del banco y queda registrado qué administrador lo tomó.</div>
      <form id="fret">
        <div class="field"><span>¿Quién lo toma?</span><div class="pick-row" id="rq">${admins.map((a) => `<button type="button" class="pick ${a.id === quien ? 'on' : ''}" data-q="${a.id}"><span class="mini-ava">${avatar(a)}</span>${esc(a.nombre)}<small>${+a.prestamo_pendiente ? `debe ${money0(a.prestamo_pendiente)}` : 'no debe'}</small></button>`).join('')}</div></div>
        <div class="field"><span>¿Para qué?</span><div class="tiles tiles-3" id="rm">${MOT.map(([k, e, t, s]) => `<button type="button" class="tile tile-sm ${k === motivo ? 'on' : ''}" data-m="${k}"><span class="tile-e">${e}</span><span class="tile-t">${t}</span><span class="tile-s">${s}</span></button>`).join('')}</div></div>
        <div class="row"><label class="field"><span>¿Cuánto?</span><input name="m" type="number" min="1" step="any" inputmode="decimal" required placeholder="Ej. 2000"></label>
          <label class="field"><span id="rcl">Nota <i class="muted">(opcional)</i></span><input name="c" placeholder="Ej. quincena del 15"></label></div>
        <div class="small" id="rwarn" style="color:var(--warn)" hidden></div>
        <div class="small muted">En el banco hay ${money0(d.banco)} según la app.</div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="rgo">Registrar retiro</button></div>
      </form>`);
    const f = $('#fret', dlg);
    const pinta = () => {
      const m = +f.m.value || 0;
      $('#rcl', f).innerHTML = motivo === 'otro' ? '¿Para qué es?' : 'Nota <i class="muted">(opcional)</i>';
      f.c.required = motivo === 'otro';
      const w = $('#rwarn', f); w.hidden = !(m > 0 && m > +d.banco); w.textContent = `Ojo: es más de lo que hay en el banco según la app (${money0(d.banco)}).`;
      $('#rgo', f).textContent = m ? `Retirar ${money0(m)}` : 'Registrar retiro';
    };
    $$('#rq .pick', f).forEach((b) => b.addEventListener('click', () => { quien = b.dataset.q; $$('#rq .pick', f).forEach((y) => y.classList.toggle('on', y === b)); }));
    $$('#rm .tile', f).forEach((b) => b.addEventListener('click', () => { motivo = b.dataset.m; $$('#rm .tile', f).forEach((y) => y.classList.toggle('on', y === b)); pinta(); }));
    f.m.addEventListener('input', pinta); pinta(); f.m.focus();
    f.addEventListener('submit', (e) => { e.preventDefault(); run($('#rgo', f), async () => {
      await API.rpc('retiro_admin', { p_monto: +f.m.value, p_motivo: motivo, p_concepto: f.c.value || null, p_admin: quien });
      dlg.close(); toast(`Registrado: ${money0(+f.m.value)} ${motivo === 'prestamo' ? 'de préstamo' : motivo === 'sueldo' ? 'de sueldo' : 'retirado'} · ${admins.find((a) => a.id === quien).nombre}`); load(); recargarHist();
    }); });
  }
  function formDevolver(a) {
    modal(`<h2>↩️ Devolución de préstamo</h2><div class="muted">${esc(a.nombre)} regresa al banco dinero que pidió prestado. Debe ${money0(a.prestamo_pendiente)}.</div>
      <form id="fdev"><div class="row"><label class="field"><span>¿Cuánto devolvió?</span><input name="m" type="number" min="1" step="any" max="${+a.prestamo_pendiente}" value="${+a.prestamo_pendiente}" inputmode="decimal" required></label>
        <label class="field"><span>Nota <i class="muted">(opcional)</i></span><input name="c"></label></div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Registrar devolución</button></div></form>`);
    const f = $('#fdev', dlg);
    f.addEventListener('submit', (e) => { e.preventDefault(); run(f.querySelector('.btn-primary'), async () => {
      await API.rpc('devolver_prestamo', { p_monto: +f.m.value, p_admin: a.id, p_concepto: f.c.value || null });
      dlg.close(); toast(`Devolución registrada: ${money0(+f.m.value)}`); load(); recargarHist();
    }); });
  }
  // Pago mixto (como en ventas): parte del efectivo de alguien y el resto del banco
  const mixBox = (id, ef) => `<div class="row mixpago" id="${id}">
      <label class="field"><span>💵 ¿Cuánto sale del efectivo?</span><input data-efmix type="number" min="1" step="any" inputmode="decimal" value="${ef}"></label>
      <div class="field"><span>🏦 El resto sale del banco</span><div class="mix-resto" data-mixresto>—</div></div>
    </div>`;
  // Devuelve el texto de validación (o '' si está bien) y pinta el resto
  const mixPinta = (box, total, poder, nombre) => {
    const ef = +$('[data-efmix]', box).value || 0;
    const resto = Math.round((total - ef) * 100) / 100;
    let err = '';
    if (!(ef > 0)) err = 'Escribe cuánto sale del efectivo';
    else if (ef > poder + 0.005) err = `${nombre} solo trae ${money0(poder)} en efectivo`;
    else if (resto <= 0.005) err = `El efectivo debe ser menor a ${money0(total)} (si alcanza, elige "De su efectivo")`;
    $('[data-mixresto]', box).innerHTML = err ? `<span style="color:var(--warn)">${esc(err)}</span>` : `<b>${money0(resto)}</b>`;
    return { ef, resto, err };
  };
  // Pagar paquetería: por vendedor y por envío (cliente), como "Pagar comisión"
  async function formPaq(pre = {}) {
    const lista = await API.rpc('paqueteria_pendiente').catch((e) => { toast(e.message, true); return null; });
    if (!lista) return;
    if (!lista.length) return toast('No se le debe nada a la paquetería ✓', true);
    const vends = [];
    lista.forEach((x) => { let g = vends.find((y) => y.vendedor_id === x.vendedor_id); if (!g) vends.push(g = { vendedor_id: x.vendedor_id, nombre: x.vendedor, usuario: x.usuario, en_poder: +x.en_poder, comision: +x.comision_pendiente, envios: [], total: 0 }); g.envios.push(x); g.total += +x.pendiente; });
    let vend = (pre.vendedor && vends.find((g) => g.vendedor_id === pre.vendedor)) ? pre.vendedor : vends[0].vendedor_id;
    // si el vendedor trae efectivo, de entrada se le paga de ahí (lo que no alcance queda pendiente)
    const origenDef = () => (pre.origen === 'banco' || !(vends.find((x) => x.vendedor_id === vend)?.en_poder > 0) ? 'banco' : 'caja');
    let origen = origenDef(); // 'banco' | 'caja' | 'mixto'
    const g = () => vends.find((x) => x.vendedor_id === vend);
    modal(`<h2>📦 Pagar paquetería</h2><div class="muted">Envíos ya cobrados al cliente (transferencia verificada) que falta pagar. Se paga por cada envío y queda ligado a su venta.</div>
      <form id="fpaq">
        <div class="field"><span>¿A quién se le debe?</span><div class="pick-row" id="pvend">${vends.map((x) => `<button type="button" class="pick ${x.vendedor_id === vend ? 'on' : ''}" data-v="${x.vendedor_id}"><span class="mini-ava">${avatar(x)}</span>${esc(x.nombre)}<small>${x.envios.length} ${x.envios.length === 1 ? 'envío' : 'envíos'} · ${money0(x.total)}</small></button>`).join('')}</div></div>
        <div class="field"><span>¿Qué envíos?</span><div id="penv"></div></div>
        <div id="pcom"></div>
        <div class="field"><span>¿De dónde sale?</span><div id="porig"></div></div>
        <div class="paq-tot"><span>Total a pagar</span><b id="ptot"></b></div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="pgo">Pagar</button></div>
      </form>`);
    const f = $('#fpaq', dlg);
    const sel = () => $$('[data-env]', f).filter((c) => c.checked).map((c) => +c.dataset.env);
    const total = () => {
      const env = g().envios.filter((x) => sel().includes(x.venta_id)).reduce((t, x) => t + +x.pendiente, 0);
      const com = $('#pcomchk', f)?.checked ? g().comision : 0;
      return { env, com, tot: env + com };
    };
    let mix = null;
    const pinta = () => {
      const t = total(), x = g();
      $('#ptot', f).textContent = money0(t.tot);
      // solo efectivo y no alcanza: se paga lo que trae (primero los envíos) y lo demás queda pendiente
      const sin = origen === 'caja' && t.tot > x.en_poder + 0.005;
      const parcial = sin ? Math.round(x.en_poder * 100) / 100 : 0;
      mix = origen === 'mixto' ? mixPinta($('#pmix', f), t.tot, x.en_poder, x.nombre) : null;
      $('#pgo', f).textContent = !t.tot ? 'Pagar' : mix && !mix.err ? `Pagar ${money0(t.tot)} (💵 ${money0(mix.ef)} + 🏦 ${money0(mix.resto)})` : sin ? `Pagar ${money0(parcial)} de su efectivo` : `Pagar ${money0(t.tot)}`;
      $('#pgo', f).disabled = !t.tot || (sin && parcial <= 0) || !!(mix && mix.err);
      $('#pwarn', f).hidden = !sin;
      if (sin) $('#pwarn', f).innerHTML = `${esc(x.nombre)} trae ${money0(x.en_poder)}: se pagan ${money0(parcial)} de su efectivo y quedan <b>${money0(t.tot - parcial)}</b> pendientes para después. <button type="button" class="btn btn-sm" id="pamix">🔀 Mejor pagar el resto del banco (mixto)</button>`;
      $('#pamix', f)?.addEventListener('click', () => ponOrigen('mixto', x.en_poder));
    };
    const ponOrigen = (o, ef) => {
      origen = o;
      $$('#porow .pick', f).forEach((y) => y.classList.toggle('on', y.dataset.o === o));
      const box = $('#pmix', f);
      box.hidden = o !== 'mixto';
      if (o === 'mixto') { const inp = $('[data-efmix]', box); inp.value = ef ?? (g().en_poder < total().tot ? g().en_poder : ''); inp.focus(); }
      pinta();
    };
    const render = () => {
      const x = g();
      $('#penv', f).innerHTML = `<div class="paq-list">${x.envios.map((e) => `<label class="paq-i"><input type="checkbox" data-env="${e.venta_id}" checked>
          <span class="paq-t"><b>Envío de ${esc(e.cliente)}${e.municipio ? ` <span class="muted">· 📍 ${esc(e.municipio)}</span>` : ''}</b><small>Venta #${String(e.venta_id).padStart(4, '0')} · ${fecha(e.fecha)} · cobrada ${money0(e.total)}</small></span><b class="paq-m">${money0(e.pendiente)}</b></label>`).join('')}</div>`;
      const sinEf = x.en_poder <= 0;
      if (sinEf) origen = 'banco';
      $('#porig', f).innerHTML = `<div class="pick-row" id="porow"><button type="button" class="pick ${origen === 'banco' ? 'on' : ''}" data-o="banco"><span class="mini-ava mini-of">🏦</span>Banco<small>${money0(d.banco)}</small></button>
        <button type="button" class="pick ${origen === 'caja' ? 'on' : ''}" data-o="caja" ${sinEf ? 'disabled' : ''}><span class="mini-ava">${avatar(x)}</span>De su efectivo<small>trae ${money0(x.en_poder)}</small></button>
        <button type="button" class="pick ${origen === 'mixto' ? 'on' : ''}" data-o="mixto" ${sinEf ? 'disabled' : ''}><span class="mini-ava mini-of">🔀</span>Mixto<small>efectivo + banco</small></button></div>
        <div class="small" id="pwarn" style="color:var(--warn);margin-top:8px" hidden></div>
        ${mixBox('pmix', x.en_poder < x.total ? x.en_poder : '')}`;
      const box = $('#pmix', f); box.hidden = origen !== 'mixto';
      $('[data-efmix]', box).addEventListener('input', pinta);
      $('#pcom', f).innerHTML = x.comision > 0 ? `<label class="paq-com"><input type="checkbox" id="pcomchk"> <span>Pagar también su comisión y extras pendientes <b>${money0(x.comision)}</b></span></label>` : '';
      $$('[data-env]', f).forEach((c) => c.addEventListener('change', pinta));
      $('#pcomchk', f)?.addEventListener('change', pinta);
      $$('#porow .pick', f).forEach((b) => b.addEventListener('click', () => { if (!b.disabled) ponOrigen(b.dataset.o); }));
      pinta();
    };
    $$('#pvend .pick', f).forEach((b) => b.addEventListener('click', () => { vend = b.dataset.v; origen = origenDef(); $$('#pvend .pick', f).forEach((y) => y.classList.toggle('on', y === b)); render(); }));
    render();
    f.addEventListener('submit', (e) => { e.preventDefault(); const t = total(); const ids = sel(); run($('#pgo', f), async () => {
      // cuánto efectivo va a los envíos y cuánto a la comisión (el efectivo se usa primero en los envíos)
      const soloEf = origen === 'caja';
      const ef = origen === 'banco' ? 0 : soloEf ? Math.min(t.tot, Math.round(g().en_poder * 100) / 100) : mix.ef;
      const efEnv = Math.min(ef, t.env), efCom = Math.round((ef - efEnv) * 100) / 100;
      // solo efectivo: lo que no alcance queda pendiente (no se toca el banco)
      const como = (efx, monto) => (soloEf ? ['caja', efx >= monto - 0.005 ? null : efx] : efx <= 0.005 ? ['banco', null] : efx >= monto - 0.005 ? ['caja', null] : ['mixto', efx]);
      const pagaEnv = ids.length && !(soloEf && efEnv <= 0.005);
      const comMonto = soloEf ? efCom : t.com;
      if (pagaEnv) { const [c, x] = como(efEnv, t.env); await API.rpc('pagar_paqueteria', { p_ventas_json: ids, p_cuenta: c, p_efectivo: x }); }
      if (comMonto > 0.005) {
        const [c] = como(efCom, t.com);
        try { await API.rpc('registrar_dinero', { p_tipo: 'pago_comision', p_cuenta: c, p_monto: comMonto, p_concepto: null, p_vendedor: vend, p_efectivo: c === 'mixto' ? efCom : null }); }
        catch (err) {
          dlg.close(); load(); recargarHist();
          if (!ids.length) throw err;
          return toast(`Envíos pagados ✓, pero la comisión no se pudo pagar: ${err.message}`, true);
        }
      }
      FX.caja();
      dlg.close(); toast(`Pagado ${money0(t.tot)}${ids.length ? ` · ${ids.length} ${ids.length === 1 ? 'envío' : 'envíos'}` : ''}${t.com ? ' + comisión' : ''}${origen === 'mixto' ? ` · 💵 ${money0(ef)} + 🏦 ${money0(t.tot - ef)}` : ''}`); load(); recargarHist();
    }); });
  }
  function formDinero(tipo, pre = {}) {
    if (!d) return toast('Espera un segundo, todavía se están cargando los saldos', true);
    if (tipo === 'pago_envio') return formPaq(pre);
    if (tipo === 'retiro_admin') return formRetiro(pre);
    if (tipo === 'cuadre') return formCuadre();
    const [tit, desc] = TIT[tipo];
    const vs = d.vendedores;
    if (pre.vendedor && !vs.some((x) => x.vendedor_id === pre.vendedor)) pre.vendedor = null;
    const abiertas = d.deudas.filter((x) => +x.saldo > 0);
    const conPend = vs.filter((x) => +x.comision_pendiente > 0);
    if (tipo === 'pago_proveedor' && !abiertas.length) return toast('No hay deudas con proveedores. Regístrala al meter mercancía al almacén o con "+ Deuda".', true);
    if (tipo === 'deposito' && !vs.some((x) => +x.en_poder > 0)) return toast('Ningún vendedor trae efectivo ahora', true);
    if (tipo === 'pago_comision' && !conPend.length) return toast('No se le debe comisión a nadie ✓', true);
    if (tipo === 'pago_envio' && !+d.por_pagar.paqueteria) return toast('No se le debe nada a la paquetería ✓', true);
    // origen: 'banco' o el id de un vendedor (su efectivo)
    let vend = pre.vendedor || (tipo === 'deposito' ? vs.find((x) => +x.en_poder > 0)?.vendedor_id : tipo === 'pago_comision' ? conPend[0].vendedor_id : '');
    // comisión: si el vendedor trae efectivo, de entrada se descuenta de ahí
    const comDef = () => (pre.origen === 'banco' || !(+(vs.find((x) => x.vendedor_id === vend)?.en_poder || 0) > 0) ? 'banco' : vend);
    let origen = tipo === 'deposito' ? vend : tipo === 'pago_comision' ? comDef() : 'banco';
    let deuda = pre.deuda || abiertas[0]?.id;
    let cat = 'gasolina';
    const vx = (id) => vs.find((x) => x.vendedor_id === id);
    const conceptoReq = ['gasto', 'ingreso', 'ajuste'].includes(tipo);
    const sugerido = () => {
      if (tipo === 'deposito') return +(vx(vend)?.en_poder || 0);
      if (tipo === 'pago_comision') { const p = +(vx(vend)?.comision_pendiente || 0); return origen === 'banco' || origen === 'mixto' ? p : Math.min(p, +(vx(vend)?.en_poder || 0)); }
      if (tipo === 'pago_envio') return +d.por_pagar.paqueteria;
      if (tipo === 'pago_proveedor') return +(abiertas.find((x) => x.id === +deuda)?.saldo || 0);
      return '';
    };
    const pickVend = (lista, sub) => `<div class="pick-row" id="dvend">${lista.map((x) => `<button type="button" class="pick ${vend === x.vendedor_id ? 'on' : ''}" data-v="${x.vendedor_id}"><span class="mini-ava">${avatar(x)}</span>${esc(x.nombre)}<small>${sub(x)}</small></button>`).join('')}</div>`;
    // mixto: parte del efectivo de alguien (mixVend) y el resto del banco
    const puedeMix = ['gasto', 'pago_comision', 'pago_proveedor'].includes(tipo);
    const conEf = () => (tipo === 'pago_comision' ? [vx(vend)] : vs).filter((x) => x && +x.en_poder > 0);
    let mixVend = '';
    const pickOrigen = () => {
      const lista = tipo === 'pago_comision' ? [vx(vend)] : vs;
      const entra = ['ingreso', 'ajuste'].includes(tipo);
      const mixOk = puedeMix && conEf().length > 0;
      if (origen === 'mixto' && !mixOk) origen = 'banco';
      if (origen === 'mixto' && !conEf().some((x) => x.vendedor_id === mixVend)) mixVend = conEf()[0].vendedor_id;
      return `<div class="pick-row" id="dorig"><button type="button" class="pick ${origen === 'banco' ? 'on' : ''}" data-o="banco"><span class="mini-ava mini-of">🏦</span>Banco<small>${money0(d.banco)}</small></button>
        ${lista.map((x) => `<button type="button" class="pick ${origen === x.vendedor_id ? 'on' : ''}" data-o="${x.vendedor_id}" ${!entra && +x.en_poder <= 0 ? 'disabled' : ''}><span class="mini-ava">${avatar(x)}</span>${tipo === 'pago_comision' ? 'De su efectivo' : `Efectivo de ${esc(x.nombre)}`}<small>trae ${money0(x.en_poder)}</small></button>`).join('')}
        ${puedeMix ? `<button type="button" class="pick ${origen === 'mixto' ? 'on' : ''}" data-o="mixto" ${mixOk ? '' : 'disabled'}><span class="mini-ava mini-of">🔀</span>Mixto<small>efectivo + banco</small></button>` : ''}</div>
        <div class="small" id="dwarn" style="color:var(--err);margin-top:8px" hidden></div>
        ${puedeMix ? `<div id="dmixw" ${origen === 'mixto' ? '' : 'hidden'}>
          ${tipo !== 'pago_comision' && conEf().length > 1 ? `<div class="small muted" style="margin:10px 0 6px">¿Efectivo de quién?</div><div class="pick-row" id="dmixv">${conEf().map((x) => `<button type="button" class="pick ${mixVend === x.vendedor_id ? 'on' : ''}" data-mv="${x.vendedor_id}"><span class="mini-ava">${avatar(x)}</span>${esc(x.nombre)}<small>trae ${money0(x.en_poder)}</small></button>`).join('')}</div>` : ''}
          ${mixBox('dmix', '')}</div>` : ''}`;
    };
    modal(`<h2>${tit}</h2><div class="muted">${desc}</div>
      <form id="fdin">
        ${tipo === 'deposito' ? `<div class="field"><span>¿Quién depositó?</span>${pickVend(vs, (x) => `trae ${money0(x.en_poder)}`)}</div>` : ''}
        ${tipo === 'pago_comision' ? `<div class="field"><span>¿A quién?</span>${pickVend(conPend, (x) => `se le deben ${money0(x.comision_pendiente)}`)}</div>` : ''}
        ${tipo === 'pago_proveedor' ? `<label class="field"><span>¿A quién le abonas?</span><select name="deuda">${abiertas.map((x) => `<option value="${x.id}" ${x.id === +deuda ? 'selected' : ''}>${esc(x.proveedor)} · ${esc(x.concepto)} — resta ${money0(x.saldo)}</option>`).join('')}</select></label>` : ''}
        ${tipo === 'gasto' ? `<div class="field"><span>¿En qué?</span><div class="chips" id="dcat">${CATS_GASTO.map(([k, e, l]) => `<button type="button" class="chip ${k === cat ? 'on' : ''}" data-k="${k}">${e} ${l}</button>`).join('')}</div></div>` : ''}
        ${tipo !== 'deposito' ? `<div class="field"><span>${['ingreso'].includes(tipo) ? '¿A dónde entra?' : tipo === 'ajuste' ? '¿Qué saldo corriges?' : '¿De dónde sale?'}</span><div id="dorig-w">${pickOrigen()}</div></div>` : ''}
        <label class="field"><span>Monto</span><input name="m" type="number" step="any" ${tipo === 'ajuste' ? '' : 'min="0.01"'} required inputmode="decimal" class="input-big" value="${sugerido()}"></label>
        ${tipo === 'gasto' ? `<label class="field"><span>¿A quién se le paga? <i class="muted">(proveedor, vendedor o cualquier nombre)</i></span><input name="b" list="dbenef" maxlength="120" autocomplete="off" placeholder="Ej. Juan Pablo"><datalist id="dbenef">${(d.beneficiarios || []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>` : ''}
        <label class="field"><span>${tipo === 'gasto' ? 'Detalle' : 'Concepto'}${conceptoReq ? '' : ' <i class="muted">(opcional)</i>'}</span><input name="c" ${conceptoReq ? 'required' : ''} placeholder="${tipo === 'gasto' ? 'Ej. 100 bolsas kraft' : tipo === 'deposito' ? 'Ej. depósito en OXXO' : ''}"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div>
      </form>`);
    const f = $('#fdin', dlg);
    let mix = null;
    const btnG = $('.btn-primary', f);
    const pintaMix = () => {
      const monto = +f.m.value || 0;
      const w = $('#dwarn', dlg);
      const vo = origen !== 'banco' && origen !== 'mixto' ? vx(origen) : null;
      const sale = !['ingreso', 'ajuste', 'deposito'].includes(tipo);
      const sin = !!(vo && sale && monto > +vo.en_poder + 0.005);
      mix = origen === 'mixto' ? mixPinta($('#dmix', dlg), monto, +(vx(mixVend)?.en_poder || 0), vx(mixVend)?.nombre || '') : null;
      if (w) {
        w.hidden = !sin;
        if (sin) {
          w.innerHTML = `${esc(vo.nombre)} solo trae ${money0(vo.en_poder)} en efectivo. <button type="button" class="btn btn-sm" id="dsolo">💵 Pagar solo sus ${money0(vo.en_poder)}</button>${puedeMix ? ` <button type="button" class="btn btn-sm" id="damix">🔀 Sus ${money0(vo.en_poder)} y el resto del banco</button>` : ''}`;
          $('#dsolo', dlg)?.addEventListener('click', () => { f.m.value = +vo.en_poder; pintaMix(); });
          $('#damix', dlg)?.addEventListener('click', () => { mixVend = vo.vendedor_id; ponOrigen('mixto', +vo.en_poder); });
        }
      }
      btnG.disabled = sin;
      btnG.textContent = mix && !mix.err ? `Guardar (💵 ${money0(mix.ef)} + 🏦 ${money0(mix.resto)})` : 'Guardar';
    };
    const ponOrigen = (o, ef) => {
      origen = o;
      if (tipo === 'pago_comision') f.m.value = sugerido();
      $('#dorig-w', dlg).innerHTML = pickOrigen(); bindOrigen();
      if (o === 'mixto') { const inp = $('#dmix [data-efmix]', dlg); inp.value = ef ?? (+(vx(mixVend)?.en_poder || 0) < (+f.m.value || 0) ? +vx(mixVend).en_poder : ''); inp.focus(); }
      pintaMix();
    };
    const bindOrigen = () => {
      $$('#dorig .pick', dlg).forEach((x) => x.addEventListener('click', () => { if (!x.disabled) ponOrigen(x.dataset.o); }));
      $$('#dmixv .pick', dlg).forEach((x) => x.addEventListener('click', () => { mixVend = x.dataset.mv; ponOrigen('mixto'); }));
      $('#dmix [data-efmix]', dlg)?.addEventListener('input', pintaMix);
    };
    bindOrigen();
    f.m.addEventListener('input', pintaMix);
    $$('#dcat .chip', dlg).forEach((x) => x.addEventListener('click', () => { cat = x.dataset.k; $$('#dcat .chip', dlg).forEach((y) => y.classList.toggle('on', y === x)); }));
    $$('#dvend .pick', dlg).forEach((x) => x.addEventListener('click', () => {
      vend = x.dataset.v; $$('#dvend .pick', dlg).forEach((y) => y.classList.toggle('on', y === x));
      if (tipo === 'deposito') origen = vend;
      if (tipo === 'pago_comision') { origen = comDef(); $('#dorig-w', dlg).innerHTML = pickOrigen(); bindOrigen(); }
      f.m.value = sugerido(); pintaMix();
    }));
    f.deuda?.addEventListener('change', () => { deuda = +f.deuda.value; f.m.value = sugerido(); pintaMix(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (mix?.err) { $('#dmix [data-efmix]', dlg).focus(); return toast(mix.err, true); }
      await run($('.btn-primary', f), async () => {
        const esMix = origen === 'mixto';
        const enCaja = !esMix && origen !== 'banco';
        await API.rpc('registrar_dinero', { p_tipo: tipo, p_cuenta: esMix ? 'mixto' : enCaja ? 'caja' : 'banco', p_monto: +f.m.value, p_concepto: f.c.value,
          p_vendedor: tipo === 'pago_comision' ? vend : esMix ? mixVend : enCaja ? origen : null, p_categoria: tipo === 'gasto' ? cat : null, p_deuda: tipo === 'pago_proveedor' ? +deuda : null,
          p_beneficiario: tipo === 'gasto' ? (f.b.value.trim() || null) : null, p_efectivo: esMix ? mix.ef : null });
        dlg.close();
        if (['deposito', 'pago_proveedor', 'pago_comision', 'pago_envio'].includes(tipo)) FX.caja(); else FX.exito();
        toast('Movimiento registrado'); load(); recargarHist();
      });
    });
    pintaMix();
    f.m.focus(); f.m.select();
  }
  function formDeuda() {
    modal(`<h2>🤝 Nueva deuda con proveedor</h2><div class="muted">Para algo que se compró a crédito fuera del almacén. (La mercancía a consignación se registra sola al meterla al almacén.)</div>
      <form id="fdeu"><label class="field"><span>Proveedor</span><input name="p" required></label>
      <label class="field"><span>Concepto</span><input name="c" required placeholder="Ej. 500 bolsas impresas"></label>
      <label class="field"><span>Monto</span><input name="m" type="number" min="0.01" step="any" required class="input-big"></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`);
    $('#fdeu', dlg).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await run($('.btn-primary', f), async () => {
        await API.rpc('registrar_deuda', { p_proveedor: f.p.value, p_concepto: f.c.value, p_monto: +f.m.value });
        dlg.close(); toast('Deuda registrada'); load(); recargarHist();
      });
    });
  }
  $$('.acciones [data-op]', v).forEach((b) => b.addEventListener('click', () => formDinero(b.dataset.op)));
  await load();
  // al revertir un gasto desde el panel, se recalculan los saldos
  const onRev = () => { if (!document.body.contains(v)) return document.removeEventListener('gasto-revertido', onRev); load(); recargarHist(); };
  document.addEventListener('gasto-revertido', onRev);
  if (q.op && TIT[q.op]) formDinero(q.op, { vendedor: q.v, origen: q.o });
};
