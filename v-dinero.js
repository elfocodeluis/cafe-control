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
    modal(`<h2>Gastos operativos · ${esc(r.etiqueta)}</h2>
      ${d.gastos_lista.length ? Object.entries(porCat).map(([c, gs]) => { const [, e, l] = catGasto(c); return `<div class="gcat"><div class="gcat-h"><span>${e} <b>${esc(l)}</b></span><b>${money0(gs.reduce((s, g) => s + +g.monto, 0))}</b></div>
        ${gs.map((g) => `<div class="gcat-i"><span>${esc(g.concepto)} <span class="muted small">· ${fecha(g.fecha)} · ${g.cuenta === 'caja' ? 'Efectivo' : 'Banco'}</span></span><span>${money0(g.monto)}</span></div>`).join('')}</div>`; }).join('')
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

VIEWS['resumen'] = async (v) => {
  v.innerHTML = `<div class="page-head"><div><span class="eyebrow"><span class="vivo"></span>En vivo · hoy</span><h1>Finanzas</h1><div class="muted small">${fechaDia(new Date().toISOString())}</div></div></div>
    <div id="res"></div>
    <div class="ana-head" id="ana-h"><div><span class="eyebrow">Solo lectura</span><h1>Analítica</h1><div class="muted small">Semanas, meses y años que ya pasaron, para comparar</div></div><div class="tools">${rangoHTML('semana', true, { quick: RAPIDOS_ANA, analitica: true })}</div></div>
    ${tabsHTML('ana', [['tend', 'Tendencia'], ['vend', 'Vendedores'], ['util', 'Utilidades']], 'tend')}
    <div data-panel="ana:tend"><div id="ana-t"></div></div>
    <div data-panel="ana:vend" hidden><div id="ana-p"></div></div>
    <div data-panel="ana:util" hidden><div id="ana-v"></div></div>`;
  bindTabs(v, 'ana');

  // ---------- HOY: operación ----------
  const r = hoyRango();
  const [d, pend] = await Promise.all([
    API.rpc('resumen', { p_desde: r.desde, p_hasta: r.hasta }),
    API.rpc('ventas_de', { p_desde: r.desde, p_hasta: r.hasta, p_pendientes: true }),
  ]);
  const di = d.dinero, inv = d.inventario, pv = d.por_vendedor, bp = di.banco_periodo, vt = d.ventas;
  const box = $('#res', v);
  const netoBanco = +bp.final - +bp.inicial;
  const u = utilidades(d);
  const porPagar = +di.por_pagar_comisiones + +di.por_pagar_paqueteria;
  const pendientes = [
    di.por_verificar_num && ['⏳', `${di.por_verificar_num} ${di.por_verificar_num === 1 ? 'transferencia' : 'transferencias'} por verificar`, di.por_verificar, '#/ventas?pend=1'],
    porPagar && ['🧾', 'Por pagar: comisiones y paquetería', porPagar, '#/caja?ir=porpagar'],
    +d.deuda && ['🤝', 'Debemos a proveedores', d.deuda, '#/caja?ir=deudas'],
  ].filter(Boolean);
  box.innerHTML = `
    <div class="hero">
      <a class="hero-k hl" href="#/ventas"><span class="hk-l">Ventas de hoy</span><b>${cuenta(vt.total)}</b><span class="hk-s">${vt.num} ${vt.num === 1 ? 'venta' : 'ventas'} · ${fnum(d.piezas)} piezas</span>${barra2(vt.efectivo, vt.transferencia)}</a>
      <div class="hero-k ${u.neta < 0 ? 'bad' : ''}"><span class="hk-l">Utilidad neta</span><b>${cuenta(u.neta)}</b><span class="hk-s">bruta ${money0(u.bruta)} · margen ${fnum(u.margen, 1)}%</span></div>
      <a class="hero-k" href="#/caja"><span class="hk-l">Efectivo con vendedores</span><b>${cuenta(di.caja)}</b><span class="hk-s">hasta que lo depositen al banco</span>${desglose(pv.filter((p) => +p.en_poder).map((p) => ({ ...p, monto: p.en_poder })))}</a>
      <a class="hero-k ${netoBanco < 0 ? 'bad' : ''}" href="#/caja"><span class="hk-l">Banco hoy</span><b>${cuenta(netoBanco)}</b><span class="hk-s">entró ${money0(bancoEntro(bp))} · salió ${money0(bancoSalio(bp))}</span></a>
    </div>
    <div class="pend">${pendientes.length ? pendientes.map(([e, t, m, h]) => `<a class="pend-i" href="${h}"><span class="pend-e">${e}</span><span>${t}</span><b>${money0(m)}</b><span class="go">›</span></a>`).join('')
      : '<div class="pend-ok"><span class="foco foco-ok"></span> Todo en orden: nada por verificar, nada por pagar.</div>'}</div>
    ${tabsHTML('fin', [['ventas', 'Ventas y utilidad'], ['dinero', 'Dinero'], ['inv', 'Inventario']], 'ventas')}
    <div data-panel="fin:ventas"><div id="hoy-v"></div></div>
    <div data-panel="fin:dinero" hidden>
    <div class="kpis kpis-g3">
      ${kpi('Efectivo', cuenta(di.caja), 'Cobros en efectivo que traen los vendedores hasta que los depositan', { cls: 'hl', href: '#/caja', det: desglose(pv.map((p) => ({ ...p, monto: p.en_poder }))) })}
      ${kpi('Banco hoy', cuenta(netoBanco), `entró ${money0(bancoEntro(bp))} · salió ${money0(bancoSalio(bp))}`, { href: '#/caja', cls: netoBanco < 0 ? 'bad' : '', info: 'Lo que se movió hoy en el banco: transferencias de ventas de los clientes y depósitos de efectivo (retiro de caja de los vendedores), menos pagos y gastos de hoy. El saldo acumulado está en Analítica.',
        det: bancoCuadre(bp, r, false) })}
      ${kpi('Transferencias hoy', cuenta(vt.transferencia), `${pv.reduce((s, p) => s + p.transf_num, 0)} ventas pagadas directo al banco por clientes`, { href: '#/ventas', info: 'Ventas que el cliente pagó por transferencia a la cuenta del banco, a través de cada vendedor. Son distintas a los depósitos de efectivo.',
        cls: +vt.transferencia_pendiente ? 'warn' : '',
        det: pv.filter((p) => p.transf_num).map((p) => `<div class="pv-i"><span><span class="mini-ava">${avatar(p)}</span>${esc(p.nombre)} <span class="muted">· ${p.transf_num} ${p.transf_num === 1 ? 'venta' : 'ventas'}</span></span><b>${money0(p.transferencia)} ${p.transf_pend_num ? `<span class="foco foco-am" title="${p.transf_pend_num} por verificar"></span>` : '<span class="foco foco-ok" title="verificadas"></span>'}</b></div>`).join('') || '<div class="small muted">Sin transferencias hoy</div>' })}
      ${kpi('Por pagar', cuenta(porPagar), porPagar ? 'Comisiones, extras de vendedores y paquetería' : 'Todo pagado ✓',
        { href: '#/caja?ir=porpagar', cls: porPagar ? 'warn' : '', info: 'Las ventas por transferencia caen completas al banco: ahí se le debe la comisión al vendedor y el envío a la paquetería.',
          det: [...pv.filter((p) => +p.comision_pendiente > 0).map((p) => `<div class="pv-i"><span>Comisión${+p.extra ? ' + extras' : ''} ${esc(p.nombre)}</span><b>${money0(p.comision_pendiente)}</b></div>`),
            +di.por_pagar_paqueteria ? `<div class="pv-i"><span>Paquetería</span><b>${money0(di.por_pagar_paqueteria)}</b></div>` : ''].join('') })}
      ${kpi('Por verificar', cuenta(di.por_verificar), di.por_verificar_num ? `${di.por_verificar_num} transferencias que aún no confirmas en tu banca` : 'Todas las transferencias están confirmadas ✓',
        { cls: di.por_verificar_num ? 'warn' : '', href: '#/ventas?pend=1', info: 'Transferencias que un vendedor registró pero que todavía no revisas en tu banco. No cuentan en Banco hasta que las marques.',
          det: pend.slice(0, 3).map((x) => `<div class="pv-i"><span>${esc(x.cliente)} <span class="muted">· ${esc(x.vendedor)}</span></span><b>${money0(x.total)}</b></div>`).join('') + (pend.length > 3 ? `<div class="small muted">y ${pend.length - 3} más…</div>` : '') })}
      ${kpi('Debemos a proveedores', cuenta(d.deuda), +d.deuda ? 'Mercancía a consignación o a crédito' : 'Sin deudas 🎉', { href: '#/caja?ir=deudas', cls: +d.deuda ? 'warn' : '' })}
    </div></div>
    <div data-panel="fin:inv" hidden>
    <div class="kpis kpis-g3">
      ${kpi('En almacén', cuenta(inv.almacen), 'Café a granel, cápsulas y filtros (a costo)', { href: '#/almacen' })}
      ${kpi('En manos de vendedores', cuenta(inv.vendedores_publico), `valor al público · a costo ${money0(inv.vendedores)}`, { det: desglose(pv.filter((p) => +p.inventario_publico).map((p) => ({ ...p, monto: p.inventario_publico }))) })}
      ${kpi('Empacado devuelto', cuenta(inv.empacado_publico), `piezas ya empacadas que regresaron · a costo ${money0(inv.empacado)}`)}
    </div></div>`;
  bindTabs(box, 'fin');
  bloqueVentas($('#hoy-v', box), d, r);
  animarNumeros(box);

  // ---------- ANALÍTICA: días pasados y acumulados ----------
  let anaN = 0;
  const cargarAna = async (ra) => {
    const yo = ++anaN;
    const a = await API.rpc('resumen', { p_desde: ra.desde, p_hasta: ra.hasta });
    if (yo !== anaN) return; // llegó una respuesta vieja: la nueva manda
    const ab = a.dinero.banco_periodo;
    const porV = ab.por_vendedor;
    $('#ana-t', v).innerHTML = `
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>Ventas · ${esc(ra.etiqueta)}</h2><span class="muted small">${a.ventas.num} ventas · ${money0(a.ventas.total)}</span></div>${graficaSerie(a.serie, ra)}</div>
        <div class="card"><div class="card-head"><h2>Banco · ${esc(ra.etiqueta)}</h2><span class="muted small">saldo total hoy <b class="${+di.banco < 0 ? 'neg-t' : ''}">${money0(di.banco)}</b></span></div>
          ${bancoCuadre(ab, ra, true)}</div>
      </div>`;
    $('#ana-p', v).innerHTML = `
      <div class="card"><div class="card-head"><h2>Por vendedor · ${esc(ra.etiqueta)}</h2></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vendedor</th><th class="num">Ventas</th><th class="num">Efectivo</th><th class="num">🔁 Transf. de ventas</th><th class="num">🏧 Depósitos de efectivo</th><th class="num">Comisión</th><th class="num">Utilidad bruta</th></tr></thead><tbody>
          ${a.por_vendedor.map((p) => { const b = porV.find((x) => x.vendedor_id === p.vendedor_id) || {}; const ub = p.total - p.costo; return `<tr><td><span class="mini-ava">${avatar(p)}</span> <b>${esc(p.nombre)}</b></td><td class="num">${money0(p.total)}<div class="small muted">${p.num} · ${fnum(p.piezas)} pz</div></td><td class="num">${money0(p.efectivo)}<div class="small muted">${p.efectivo_num}</div></td><td class="num">${money0(p.transferencia)}<div class="small muted">${p.transf_num}</div></td><td class="num">${money0(b.depositos || 0)}<div class="small muted">${b.dep_num || 0}</div></td><td class="num">${money0(p.comision)}</td><td class="num"><b>${money0(ub)}</b></td></tr>`; }).join('')}
        </tbody></table></div></div>`;
    bloqueVentas($('#ana-v', v), a, ra);
    animarNumeros(v);
  };
  const leerAna = bindRango($('#ana-h', v), cargarAna);
  await cargarAna(leerAna());
};

// Tabla de movimientos de dinero con filtros (Todo / Banco / Efectivo / Pagos)
function tablaMovs(movs, r, per) {
  return `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Movimientos · ${esc(per)}</h2>
    <div class="seg seg-sm" data-mcta><button type="button" class="on" data-c="">Todo</button><button type="button" data-c="banco">Banco</button><button type="button" data-c="caja">Efectivo</button><button type="button" data-c="pagos">Pagos</button></div></div>
    ${movs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${r.hoy ? 'Hora' : 'Fecha'}</th><th>Dónde</th><th>Tipo</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>
    ${movs.map((m) => `<tr data-cta="${m.cuenta}" data-pago="${['pago_comision', 'pago_envio', 'pago_proveedor'].includes(m.tipo) && !m.venta_id ? 1 : ''}"><td class="small">${r.hoy ? hora(m.fecha) : fecha(m.fecha)}</td>
      <td>${m.cuenta === 'caja' ? `<span class="badge b-ok">Efectivo</span><div class="small muted">${esc(m.vendedor || '')}</div>` : `<span class="badge b-info">Banco</span>${m.vendedor && ['deposito', 'venta', 'reverso'].includes(m.tipo) ? `<div class="small muted">vía ${esc(m.vendedor)}</div>` : ''}`}</td>
      <td>${tipoDin(m)}${m.categoria && m.tipo === 'gasto' ? ` <span class="small">${catGasto(m.categoria)[1]}</span>` : ''}</td>
      <td class="small">${m.venta_id ? `${folio(m.venta_id)} · ` : ''}${esc(m.concepto || '')}${m.usuario ? ` <span class="muted">· ${esc(m.usuario)}</span>` : ''}</td>
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

/* ---------- caja y banco ----------
   No hay caja de oficina: el efectivo lo trae cada vendedor hasta que lo deposita al banco.
   Comisiones de ventas por transferencia y la paquetería quedan "por pagar". */
VIEWS['caja'] = async (v, q) => {
  const ACCIONES = [['deposito', '🏧', 'Depósito', 'efectivo de un vendedor'], ['pago_comision', '🎁', 'Pagar comisión', 'y extras de vendedores'], ['pago_envio', '📦', 'Pagar paquetería', 'envíos pendientes'],
    ['gasto', '🧾', 'Gasto', 'gasolina, bolsas…'], ['retiro_admin', '🏦', 'Préstamo / retiro', 'admin · sale del banco'], ['pago_proveedor', '🤝', 'Pagar proveedor', 'abonar a deuda'], ['ingreso', '➕', 'Otro ingreso', 'que no es venta'], ['ajuste', '⚖️', 'Ajuste', 'corregir saldo']];
  v.innerHTML = `<div class="page-head"><div><span class="eyebrow"><span class="vivo"></span>En vivo · hoy</span><h1>Caja y banco</h1><div class="muted small">${fechaDia(new Date().toISOString())} · quién trae el efectivo, qué entró al banco y qué falta pagar</div></div></div>
    <div class="acciones">${ACCIONES.map(([k, e, t, s]) => `<button type="button" class="tile tile-sm" data-op="${k}"><span class="tile-e">${e}</span><span class="tile-t">${t}</span><span class="tile-s">${s}</span></button>`).join('')}</div>
    <div id="cj"></div>
    <div class="ana-head" id="hist-h"><div><span class="eyebrow">Solo lectura</span><h1>Historial</h1><div class="muted small">Días que ya pasaron, con el saldo acumulado del banco</div></div><div class="tools">${rangoHTML('semana', true, { quick: RAPIDOS_ANA, analitica: true })}</div></div>
    <div id="hist"></div>`;
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
    box.innerHTML = `
      <div class="grid2" style="margin-bottom:16px">
        <div class="card saldo-card"><div class="saldo-l">💵 EFECTIVO · LO TRAEN LOS VENDEDORES</div><div class="saldo">${cuenta(d.caja)}</div>
          <div class="small muted">Cobros en efectivo. No se guarda en oficina: cada vendedor lo trae hasta que lo deposita al banco (retiro de caja).</div>
          <div class="holders">
            ${vs.map((x) => `<div class="holder"><span class="mini-ava">${avatar(x)}</span><span>${esc(x.nombre)} trae${+x.depositado ? `<small class="muted"> · depositó ${money0(x.depositado)} ${esc(per)}</small>` : ''}</span><b>${money0(x.en_poder)}</b>
              ${+x.en_poder > 0 ? `<button class="btn btn-sm btn-primary" data-depositar="${x.vendedor_id}">🏧 Depositó</button>` : '<span class="small muted">✓</span>'}</div>`).join('')}
          </div></div>
        <div class="card saldo-card"><div class="saldo-l">🏦 BANCO · LO QUE SE MOVIÓ HOY</div><div class="saldo ${+bp.final - +bp.inicial < 0 ? 'neg-t' : ''}">${cuenta(+bp.final - +bp.inicial)}</div>
          <div class="small muted">Entró ${money0(bancoEntro(bp))} · salió ${money0(bancoSalio(bp))}</div>
          <div class="leyenda"><span><b>🔁 Transferencias</b> = un cliente pagó una venta directo al banco.</span><span><b>🏧 Depósitos</b> = el vendedor llevó su efectivo al banco (retiro de caja de vendedores).</span></div>
          <div class="bk">
            <div class="bk-h"><span>hoy</span><span>🔁 Transf. de ventas</span><span>🏧 Depósitos</span></div>
            ${bp.por_vendedor.map((x) => `<div class="bk-r"><span><span class="mini-ava">${avatar(x)}</span>${esc(x.nombre)}</span><b>${money0(x.transferencias)}<small>${x.transf_num} ${x.transf_num === 1 ? 'venta' : 'ventas'}</small></b><b>${money0(x.depositos)}<small>${x.dep_num} ${x.dep_num === 1 ? 'depósito' : 'depósitos'}</small></b></div>`).join('')}
          </div>
          <div class="bq-wrap">${bancoCuadre(bp, r, false)}</div>
          ${d.por_verificar.num ? `<a class="pv-link" href="#/ventas?pend=1">⏳ ${money0(d.por_verificar.monto)} en ${d.por_verificar.num} transferencias por verificar →</a>` : '<div class="pv-ok">✓ Todas las transferencias verificadas</div>'}
          ${totDeuda ? `<button type="button" class="pv-link deuda" data-ir="deudas">🤝 Debemos ${money0(totDeuda)} a proveedores →</button>` : ''}</div>
      </div>

      ${tabsHTML('caja', [['pagar', 'Por pagar', totPorPagar ? '!' : ''], ['vend', 'Vendedores'], ['gastos', 'Gastos y proveedores'], ['admins', 'Administradores', admins.some((a) => +a.prestamo_pendiente > 0) ? '!' : ''], ['movs', 'Movimientos', d.movimientos.length || '']], 'pagar')}
      <div data-panel="caja:pagar">
      <div class="card porpagar ${totPorPagar ? 'warn' : ''}" id="porpagar">
        <div class="card-head"><h2>🧾 Por pagar</h2><span class="badge ${totPorPagar ? 'b-warn' : 'b-ok'}">${totPorPagar ? `${money0(totPorPagar)} pendiente` : 'Todo pagado ✓'}</span></div>
        <div class="small muted" style="margin-bottom:10px">Las ventas por transferencia caen completas al banco, así que ahí se le debe la comisión al vendedor y el envío a la paquetería (cuentan en cuanto verificas la transferencia). Los <b>extras</b> (propinas o servicio extra que el cliente transfirió de más) también son del vendedor. Se pagan del banco o se descuentan del efectivo que ya trae.</div>
        <div class="pp-list">
          ${vs.map((x) => `<div class="pp ${+x.comision_pendiente ? '' : 'ok'}"><span class="mini-ava">${avatar(x)}</span>
            <div><b>Comisiones${+x.extra ? ' y extras' : ''} de ${esc(x.nombre)}</b><div class="small muted">${+x.comision_pendiente ? `de transferencias ya verificadas, sin pagar` : 'No se le debe nada'}${+x.extra ? ` · 🎁 extras ${esc(per)} ${money0(x.extra)} (${x.extra_num}) · <a href="#/ventas?v=${x.vendedor_id}">ver sus ventas</a>` : ''}${+x.comision_pagada ? ` · pagado ${esc(per)} ${money0(x.comision_pagada)}` : ''}</div></div>
            <b class="pp-m">${money0(x.comision_pendiente)}</b>
            ${+x.comision_pendiente ? `<div class="pp-b"><button class="btn btn-sm" data-pcom="${x.vendedor_id}" data-o="caja" ${+x.en_poder > 0 ? '' : 'disabled'}>💵 Descontar de su efectivo</button><button class="btn btn-sm btn-primary" data-pcom="${x.vendedor_id}" data-o="banco">🏦 Pagar del banco</button></div>` : '<span class="pp-b small muted">✓</span>'}
          </div>`).join('')}
          <div class="pp ${+pp.paqueteria ? '' : 'ok'}"><span class="mini-ava mini-of">📦</span>
            <div><b>Paquetería</b><div class="small muted">${+pp.paqueteria ? `envíos ya cobrados y verificados, sin pagar` : 'No se le debe nada'}${+pg.paqueteria ? ` · pagado ${esc(per)} ${money0(pg.paqueteria)}` : ''}</div></div>
            <b class="pp-m">${money0(pp.paqueteria)}</b>
            ${+pp.paqueteria ? '<div class="pp-b"><button class="btn btn-sm btn-primary" data-op="pago_envio">Pagar</button></div>' : '<span class="pp-b small muted">✓</span>'}
          </div>
        </div>
        ${+pg.paqueteria || +pg.comisiones_banco || +pg.comisiones_efectivo ? `<div class="pp-hecho"><b>Pagos hechos ${esc(per)}:</b>
          <span>📦 a paquetería ${money0(pg.paqueteria)}</span><span>🏦 comisiones/extras del banco ${money0(pg.comisiones_banco)}</span><span>💵 comisiones/extras tomados del efectivo ${money0(pg.comisiones_efectivo)}</span></div>` : ''}
      </div>

      </div>
      <div data-panel="caja:vend" hidden>
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
      <div data-panel="caja:gastos" hidden>
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>🧾 Gastos operativos · ${esc(per)}</h2><button class="btn btn-sm btn-primary" data-op="gasto">+ Gasto</button></div>
          ${d.gastos.length ? `<div class="gbars">${d.gastos.map((g) => { const [, e, l] = catGasto(g.categoria); return `<div class="gbar"><span>${e} ${esc(l)} <span class="muted small">(${g.num})</span></span><div class="bar"><i style="width:${(g.total / maxG) * 100}%"></i></div><b>${money0(g.total)}</b></div>`; }).join('')}</div>
            <div class="gtot">Total <b>${money(totGastos)}</b></div>` : `<div class="empty">Sin gastos ${esc(per)}</div>`}</div>
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
      </div></div>
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
      </div>
      <div data-panel="caja:movs" hidden>${tablaMovs(d.movimientos, r, per)}</div>`;
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
    bindMovs(box);
    const TAB_DE = { porpagar: 'pagar', deudas: 'gastos' };
    $('[data-ir=deudas]', box)?.addEventListener('click', () => { irCaja('gastos'); $('#deudas', box).scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    if (q.ir) { const ir = q.ir; q.ir = ''; if (TAB_DE[ir]) irCaja(TAB_DE[ir], false); }
  };


  /* ---------- historial: días pasados, solo lectura ---------- */
  let histN = 0;
  const cargarHist = async (rh) => {
    const yo = ++histN;
    const h = await API.rpc('tesoreria', { p_desde: rh.desde, p_hasta: rh.hasta });
    if (yo !== histN) return;
    const per = rh.etiqueta.toLowerCase();
    const hb = h.banco_periodo, hp = h.pagado;
    const totG = h.gastos.reduce((s, g) => s + +g.total, 0);
    const maxG = Math.max(1, ...h.gastos.map((g) => +g.total));
    const paqVs = h.vendedores.filter((x) => +x.paq.num);
    const box = $('#hist', v);
    box.innerHTML = `
      ${tabsHTML('hist', [['banco', 'Banco y pagos'], ['vend', 'Vendedores'], ['movs', 'Movimientos']], 'banco')}
      <div data-panel="hist:banco">
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>🏦 Banco · ${esc(rh.etiqueta)}</h2><span class="muted small">saldo total en la cuenta hoy <b class="${+h.banco < 0 ? 'neg-t' : ''}">${money0(h.banco)}</b></span></div>
          ${bancoCuadre(hb, rh, true)}</div>
        <div class="card"><div class="card-head"><h2>🧾 Pagos hechos · ${esc(rh.etiqueta)}</h2></div>
          <div class="bq">
            <div class="bq-r"><span>📦 A paquetería <i>${hp.paq_num} pagos</i></span><b>${money0(hp.paqueteria)}</b></div>
            <div class="bq-r"><span>🏦 Comisiones pagadas del banco</span><b>${money0(hp.comisiones_banco)}</b></div>
            <div class="bq-r"><span>💵 Comisiones tomadas del efectivo</span><b>${money0(hp.comisiones_efectivo)}</b></div>
            <div class="bq-r"><span>🧾 Gastos operativos</span><b>${money0(totG)}</b></div>
          </div>
          ${h.gastos.length ? `<div class="gbars" style="margin-top:14px">${h.gastos.map((g) => { const [, e, l] = catGasto(g.categoria); return `<div class="gbar"><span>${e} ${esc(l)} <span class="muted small">(${g.num})</span></span><div class="bar"><i style="width:${(g.total / maxG) * 100}%"></i></div><b>${money0(g.total)}</b></div>`; }).join('')}</div>` : ''}
        </div>
      </div>
      </div>
      <div data-panel="hist:vend" hidden>
      <div class="card"><div class="card-head"><h2>Por vendedor · ${esc(rh.etiqueta)}</h2></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vendedor</th><th class="num">Cobró en efectivo</th><th class="num">🔁 Transf. de ventas</th><th class="num">🏧 Depósitos de efectivo</th><th class="num">Comisión ganada</th><th class="num">🎁 Extras</th><th class="num">Comisión pagada</th></tr></thead><tbody>
          ${h.vendedores.map((x) => { const b = hb.por_vendedor.find((y) => y.vendedor_id === x.vendedor_id) || {}; return `<tr><td><span class="mini-ava">${avatar(x)}</span> <b>${esc(x.nombre)}</b></td><td class="num">${money0(x.efectivo)}</td><td class="num">${money0(x.transferencia)}${+x.transf_pendiente ? `<div class="small warn-t">${money0(x.transf_pendiente)} por verificar</div>` : ''}</td><td class="num">${money0(b.depositos || 0)}<div class="small muted">${b.dep_num || 0} depósitos</div></td><td class="num">${money0(x.comision)}</td><td class="num">${+x.extra ? `${money0(x.extra)}<div class="small muted">${x.extra_num} ventas</div>` : '—'}</td><td class="num">${money0(x.comision_pagada)}</td></tr>`; }).join('')}
        </tbody></table></div></div>
      ${paqVs.length ? `<div class="card"><div class="card-head"><h2>📦 Paquetería · ${esc(rh.etiqueta)}</h2></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vendedor</th><th class="num">Envíos</th><th class="num">Cobrado (al banco)</th><th class="num">A paquetería</th><th class="num">Comisión</th><th class="num">Costo café</th><th class="num">Utilidad bruta</th></tr></thead><tbody>
        ${paqVs.map((x) => { const p = x.paq; const ub = p.cobrado - p.envio - p.comision - p.costo; return `<tr><td><b>${esc(x.nombre)}</b></td><td class="num">${p.num}</td><td class="num">${money0(p.cobrado)}</td><td class="num">−${money0(p.envio)}</td><td class="num">−${money0(p.comision)}</td><td class="num">−${money0(p.costo)}</td><td class="num"><b style="color:${ub >= 0 ? 'var(--ok)' : 'var(--err)'}">${money0(ub)}</b></td></tr>`; }).join('')}
        </tbody></table></div></div>` : ''}
      </div>
      <div data-panel="hist:movs" hidden>${tablaMovs(h.movimientos, rh, per)}</div>`;
    bindTabs(box, 'hist', { recordar: true });
    bindMovs(box);
  };

  const TIT = {
    deposito: ['🏧 Depósito de efectivo', 'El vendedor lleva al banco el efectivo de sus ventas (retiro de su caja). No es una venta: queda registrado quién lo depositó.'],
    pago_comision: ['🎁 Pagar comisión y extras', 'Comisiones de ventas por transferencia y extras (propinas que el cliente transfirió de más). Ese dinero cayó al banco: se paga del banco, o se descuenta del efectivo que trae el vendedor.'],
    pago_envio: ['📦 Pagar a la paquetería', 'Lo que se le debe a la paquetería por los envíos ya cobrados.'],
    gasto: ['🧾 Registrar gasto', 'Dinero que sale para operar: gasolina, bolsas, empaque, taxis…'],
    pago_proveedor: ['🤝 Pagar a proveedor', 'Abona a lo que se debe de mercancía a consignación o crédito.'],
    ingreso: ['➕ Otro ingreso', 'Dinero que entra y no es venta (aportación, préstamo…).'],
    retiro_admin: ['🏦 Préstamo o retiro de administrador', 'Dinero que un administrador saca del banco: préstamo (lo devuelve después), sueldo u otro retiro. Queda registrado quién lo tomó.'],
    ajuste: ['⚖️ Ajuste de saldo', 'Corrige el saldo después de revisar el banco o contar el efectivo de un vendedor. Usa negativo para restar.'],
  };
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
  // Pagar paquetería: por vendedor y por envío (cliente), como "Pagar comisión"
  async function formPaq(pre = {}) {
    const lista = await API.rpc('paqueteria_pendiente').catch((e) => { toast(e.message, true); return null; });
    if (!lista) return;
    if (!lista.length) return toast('No se le debe nada a la paquetería ✓', true);
    const vends = [];
    lista.forEach((x) => { let g = vends.find((y) => y.vendedor_id === x.vendedor_id); if (!g) vends.push(g = { vendedor_id: x.vendedor_id, nombre: x.vendedor, usuario: x.usuario, en_poder: +x.en_poder, comision: +x.comision_pendiente, envios: [], total: 0 }); g.envios.push(x); g.total += +x.pendiente; });
    let vend = (pre.vendedor && vends.find((g) => g.vendedor_id === pre.vendedor)) ? pre.vendedor : vends[0].vendedor_id;
    let origen = 'banco';
    const g = () => vends.find((x) => x.vendedor_id === vend);
    modal(`<h2>📦 Pagar paquetería</h2><div class="muted">Envíos ya cobrados al cliente (transferencia verificada) que falta pagar. Se paga por cada envío y queda ligado a su venta.</div>
      <form id="fpaq">
        <div class="field"><span>¿A quién se le debe?</span><div class="pick-row" id="pvend">${vends.map((x) => `<button type="button" class="pick ${x.vendedor_id === vend ? 'on' : ''}" data-v="${x.vendedor_id}"><span class="mini-ava">${avatar(x)}</span>${esc(x.nombre)}<small>${x.envios.length} ${x.envios.length === 1 ? 'envío' : 'envíos'} · ${money0(x.total)}</small></button>`).join('')}</div></div>
        <div class="field"><span>¿Qué envíos?</span><div id="penv"></div></div>
        <div class="field"><span>¿De dónde sale?</span><div id="porig"></div></div>
        <div id="pcom"></div>
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
    const pinta = () => {
      const t = total();
      $('#ptot', f).textContent = money0(t.tot);
      $('#pgo', f).textContent = t.tot ? `Pagar ${money0(t.tot)}` : 'Pagar';
      $('#pgo', f).disabled = !t.tot;
      const sin = origen !== 'banco' && t.tot > g().en_poder + 0.005;
      $('#pgo', f).disabled = !t.tot || sin;
      $('#pwarn', f) && ($('#pwarn', f).hidden = !sin);
    };
    const render = () => {
      const x = g();
      if (origen !== 'banco') origen = vend;
      $('#penv', f).innerHTML = `<div class="paq-list">${x.envios.map((e) => `<label class="paq-i"><input type="checkbox" data-env="${e.venta_id}" checked>
          <span class="paq-t"><b>Envío de ${esc(e.cliente)}${e.municipio ? ` <span class="muted">· 📍 ${esc(e.municipio)}</span>` : ''}</b><small>Venta #${String(e.venta_id).padStart(4, '0')} · ${fecha(e.fecha)} · cobrada ${money0(e.total)}</small></span><b class="paq-m">${money0(e.pendiente)}</b></label>`).join('')}</div>`;
      $('#porig', f).innerHTML = `<div class="pick-row" id="porow"><button type="button" class="pick ${origen === 'banco' ? 'on' : ''}" data-o="banco"><span class="mini-ava mini-of">🏦</span>Banco<small>${money0(d.banco)}</small></button>
        <button type="button" class="pick ${origen !== 'banco' ? 'on' : ''}" data-o="${x.vendedor_id}" ${x.en_poder <= 0 ? 'disabled' : ''}><span class="mini-ava">${avatar(x)}</span>De su efectivo<small>trae ${money0(x.en_poder)}</small></button></div>
        <div class="small" id="pwarn" style="color:var(--err)" hidden>${esc(x.nombre)} no trae suficiente efectivo para todo esto.</div>`;
      $('#pcom', f).innerHTML = x.comision > 0 ? `<label class="paq-com"><input type="checkbox" id="pcomchk"> <span>Pagar también su comisión y extras pendientes <b>${money0(x.comision)}</b></span></label>` : '';
      $$('[data-env]', f).forEach((c) => c.addEventListener('change', pinta));
      $('#pcomchk', f)?.addEventListener('change', pinta);
      $$('#porow .pick', f).forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; origen = b.dataset.o; $$('#porow .pick', f).forEach((y) => y.classList.toggle('on', y === b)); pinta(); }));
      pinta();
    };
    $$('#pvend .pick', f).forEach((b) => b.addEventListener('click', () => { vend = b.dataset.v; origen = 'banco'; $$('#pvend .pick', f).forEach((y) => y.classList.toggle('on', y === b)); render(); }));
    render();
    f.addEventListener('submit', (e) => { e.preventDefault(); const t = total(); const ids = sel(); run($('#pgo', f), async () => {
      const cuenta = origen === 'banco' ? 'banco' : 'caja';
      if (ids.length) await API.rpc('pagar_paqueteria', { p_ventas_json: ids, p_cuenta: cuenta });
      if (t.com > 0) {
        try { await API.rpc('registrar_dinero', { p_tipo: 'pago_comision', p_cuenta: cuenta, p_monto: t.com, p_concepto: null, p_vendedor: vend }); }
        catch (err) {
          dlg.close(); load(); recargarHist();
          if (!ids.length) throw err;
          return toast(`Envíos pagados ✓, pero la comisión no se pudo pagar: ${err.message}`, true);
        }
      }
      dlg.close(); toast(`Pagado ${money0(t.tot)}${ids.length ? ` · ${ids.length} ${ids.length === 1 ? 'envío' : 'envíos'}` : ''}${t.com ? ' + comisión' : ''}`); load(); recargarHist();
    }); });
  }
  function formDinero(tipo, pre = {}) {
    if (!d) return toast('Espera un segundo, todavía se están cargando los saldos', true);
    if (tipo === 'pago_envio') return formPaq(pre);
    if (tipo === 'retiro_admin') return formRetiro(pre);
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
    let origen = tipo === 'deposito' ? vend : tipo === 'pago_comision' ? (pre.origen === 'caja' ? vend : 'banco') : 'banco';
    let deuda = pre.deuda || abiertas[0]?.id;
    let cat = 'gasolina';
    const vx = (id) => vs.find((x) => x.vendedor_id === id);
    const conceptoReq = ['gasto', 'ingreso', 'ajuste'].includes(tipo);
    const sugerido = () => {
      if (tipo === 'deposito') return +(vx(vend)?.en_poder || 0);
      if (tipo === 'pago_comision') { const p = +(vx(vend)?.comision_pendiente || 0); return origen === 'banco' ? p : Math.min(p, +(vx(vend)?.en_poder || 0)); }
      if (tipo === 'pago_envio') return +d.por_pagar.paqueteria;
      if (tipo === 'pago_proveedor') return +(abiertas.find((x) => x.id === +deuda)?.saldo || 0);
      return '';
    };
    const pickVend = (lista, sub) => `<div class="pick-row" id="dvend">${lista.map((x) => `<button type="button" class="pick ${vend === x.vendedor_id ? 'on' : ''}" data-v="${x.vendedor_id}"><span class="mini-ava">${avatar(x)}</span>${esc(x.nombre)}<small>${sub(x)}</small></button>`).join('')}</div>`;
    const pickOrigen = () => {
      const lista = tipo === 'pago_comision' ? [vx(vend)] : vs;
      const entra = ['ingreso', 'ajuste'].includes(tipo);
      return `<div class="pick-row" id="dorig"><button type="button" class="pick ${origen === 'banco' ? 'on' : ''}" data-o="banco"><span class="mini-ava mini-of">🏦</span>Banco<small>${money0(d.banco)}</small></button>
        ${lista.map((x) => `<button type="button" class="pick ${origen === x.vendedor_id ? 'on' : ''}" data-o="${x.vendedor_id}" ${!entra && +x.en_poder <= 0 ? 'disabled' : ''}><span class="mini-ava">${avatar(x)}</span>${tipo === 'pago_comision' ? 'De su efectivo' : `Efectivo de ${esc(x.nombre)}`}<small>trae ${money0(x.en_poder)}</small></button>`).join('')}</div>`;
    };
    modal(`<h2>${tit}</h2><div class="muted">${desc}</div>
      <form id="fdin">
        ${tipo === 'deposito' ? `<div class="field"><span>¿Quién depositó?</span>${pickVend(vs, (x) => `trae ${money0(x.en_poder)}`)}</div>` : ''}
        ${tipo === 'pago_comision' ? `<div class="field"><span>¿A quién?</span>${pickVend(conPend, (x) => `se le deben ${money0(x.comision_pendiente)}`)}</div>` : ''}
        ${tipo === 'pago_proveedor' ? `<label class="field"><span>¿A quién le abonas?</span><select name="deuda">${abiertas.map((x) => `<option value="${x.id}" ${x.id === +deuda ? 'selected' : ''}>${esc(x.proveedor)} · ${esc(x.concepto)} — resta ${money0(x.saldo)}</option>`).join('')}</select></label>` : ''}
        ${tipo === 'gasto' ? `<div class="field"><span>¿En qué?</span><div class="chips" id="dcat">${CATS_GASTO.map(([k, e, l]) => `<button type="button" class="chip ${k === cat ? 'on' : ''}" data-k="${k}">${e} ${l}</button>`).join('')}</div></div>` : ''}
        ${tipo !== 'deposito' ? `<div class="field"><span>${['ingreso'].includes(tipo) ? '¿A dónde entra?' : tipo === 'ajuste' ? '¿Qué saldo corriges?' : '¿De dónde sale?'}</span><div id="dorig-w">${pickOrigen()}</div></div>` : ''}
        <label class="field"><span>Monto</span><input name="m" type="number" step="any" ${tipo === 'ajuste' ? '' : 'min="0.01"'} required inputmode="decimal" class="input-big" value="${sugerido()}"></label>
        <label class="field"><span>${tipo === 'gasto' ? 'Detalle' : 'Concepto'}${conceptoReq ? '' : ' <i class="muted">(opcional)</i>'}</span><input name="c" ${conceptoReq ? 'required' : ''} placeholder="${tipo === 'gasto' ? 'Ej. 100 bolsas kraft' : tipo === 'deposito' ? 'Ej. depósito en OXXO' : ''}"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div>
      </form>`);
    const f = $('#fdin', dlg);
    const bindOrigen = () => $$('#dorig .pick', dlg).forEach((x) => x.addEventListener('click', () => {
      origen = x.dataset.o; $$('#dorig .pick', dlg).forEach((y) => y.classList.toggle('on', y === x)); if (tipo === 'pago_comision') f.m.value = sugerido();
    }));
    bindOrigen();
    $$('#dcat .chip', dlg).forEach((x) => x.addEventListener('click', () => { cat = x.dataset.k; $$('#dcat .chip', dlg).forEach((y) => y.classList.toggle('on', y === x)); }));
    $$('#dvend .pick', dlg).forEach((x) => x.addEventListener('click', () => {
      vend = x.dataset.v; $$('#dvend .pick', dlg).forEach((y) => y.classList.toggle('on', y === x));
      if (tipo === 'deposito') origen = vend;
      if (tipo === 'pago_comision') { if (origen !== 'banco') origen = vend; $('#dorig-w', dlg).innerHTML = pickOrigen(); bindOrigen(); }
      f.m.value = sugerido();
    }));
    f.deuda?.addEventListener('change', () => { deuda = +f.deuda.value; f.m.value = sugerido(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await run($('.btn-primary', f), async () => {
        const enCaja = origen !== 'banco';
        await API.rpc('registrar_dinero', { p_tipo: tipo, p_cuenta: enCaja ? 'caja' : 'banco', p_monto: +f.m.value, p_concepto: f.c.value,
          p_vendedor: tipo === 'pago_comision' ? vend : enCaja ? origen : null, p_categoria: tipo === 'gasto' ? cat : null, p_deuda: tipo === 'pago_proveedor' ? +deuda : null });
        dlg.close();
        if (['deposito', 'pago_proveedor', 'pago_comision', 'pago_envio'].includes(tipo)) FX.caja(); else FX.exito();
        toast('Movimiento registrado'); load(); recargarHist();
      });
    });
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
  const leerH = bindRango($('#hist-h', v), cargarHist);
  const recargarHist = () => cargarHist(leerH());
  recargarHist();
  if (q.op && TIT[q.op]) formDinero(q.op, { vendedor: q.v, origen: q.o });
};
