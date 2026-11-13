/* =====================================================================
   REPORTE DE VENTAS DEL VENDEDOR (solo admin) — Ventas › 📄 Exportar
   Eliges vendedor y periodo; sale una hoja lista para guardar como PDF:
   qué vendió, cuánto cobró en efectivo y por transferencia, su comisión,
   cómo se llega al efectivo que trae (movimiento por movimiento) y lo que
   tiene que entregar. Todo sale de lo registrado en el sistema.
   ===================================================================== */

// lo que dice cada movimiento de efectivo, visto desde el vendedor
const REP_MOV = (m) => {
  if (m.tipo === 'venta') return ['💵', 'Cobraste en efectivo'];
  if (m.tipo === 'reverso') return ['↩️', 'Ventas canceladas (se restan)'];
  if (m.tipo === 'pago_comision') return m.venta_id ? ['🎁', 'Tu comisión (te la quedaste al cobrar)'] : ['🎁', 'Comisión que tomaste de tu efectivo'];
  if (m.tipo === 'deposito') return ['🏧', 'Depositaste al banco'];
  if (m.tipo === 'pago_envio') return ['📦', 'Pagaste paquetería con tu efectivo'];
  if (m.tipo === 'gasto') return ['🧾', 'Gastos pagados con tu efectivo'];
  if (m.tipo === 'pago_proveedor') return ['🤝', 'Pagaste a proveedor con tu efectivo'];
  if (m.tipo === 'ajuste') return ['⚖️', 'Ajustes de efectivo'];
  if (m.tipo === 'entrega') return ['💵', 'Efectivo que entregaste'];
  return ['•', TIPO_DIN[m.tipo] || m.tipo];
};

function abrirExportar(vendedores, vendIdActual) {
  if (!vendedores?.length) return toast('No hay vendedores', true);
  let elegido = vendedores.some((x) => x.id === vendIdActual) ? vendIdActual : vendedores[0].id;
  modal(`<h2>📄 Reporte de ventas</h2>
    <div class="muted">Elige al vendedor y el periodo. Se arma una hoja para guardar en PDF y entregársela.</div>
    <div class="rep-pick">${vendedores.map((x) => `<button type="button" class="ava-pick ${x.id === elegido ? 'on' : ''}" data-rv="${x.id}">
      <span class="ava-wrap">${avatar(x)}</span><span class="ava-name">${esc(x.nombre)}</span></button>`).join('')}</div>
    <label class="field"><span>Periodo</span></label>
    <div class="rep-rango">${rangoHTML('semana', true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']] })}</div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button>
      <button type="button" class="btn btn-rojo" id="rep-go">📄 Generar reporte y exportar</button></div>`);
  $$('[data-rv]', dlg).forEach((b) => b.addEventListener('click', () => {
    elegido = b.dataset.rv; FX.tap();
    $$('[data-rv]', dlg).forEach((x) => x.classList.toggle('on', x === b));
  }));
  const caja = $('.rep-rango', dlg);
  bindRango(caja, () => {});
  $('#rep-go', dlg).addEventListener('click', (e) => run(e.currentTarget, async () => {
    const vend = vendedores.find((x) => x.id === elegido);
    const r = leerRango(caja);
    const html = await armarReporte(vend, r);
    dlg.close();
    mostrarReporte(html, vend, r);
  }));
}

async function armarReporte(vend, r) {
  const ahora = new Date();
  const futuro = '2100-01-01T00:00:00Z';
  const [tp, tAll, ventas, inv] = await Promise.all([
    API.rpc('tesoreria', { p_desde: r.desde, p_hasta: r.hasta }),
    API.rpc('tesoreria', { p_desde: r.desde, p_hasta: futuro }),
    API.rpc('ventas_de', { p_desde: r.desde, p_hasta: r.hasta, p_vendedor: vend.id }),
    API.rpc('inventario_de', { p_vendedor: vend.id }).catch(() => []),
  ]);
  const x = tp.vendedores.find((y) => y.vendedor_id === vend.id) || {};
  const enPoder = +(x.en_poder || 0);
  const comPend = Math.max(0, +(x.comision_pendiente || 0));

  // efectivo: todos sus movimientos de caja desde que empezó el periodo
  const movsDesde = tAll.movimientos.filter((m) => m.cuenta === 'caja' && m.vendedor === vend.nombre);
  const suma = (xs) => xs.reduce((s, m) => s + +m.monto, 0);
  const finPer = new Date(r.hasta) > ahora;
  const movsPer = movsDesde.filter((m) => new Date(m.fecha) < new Date(r.hasta)).sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.id - b.id);
  const inicial = enPoder - suma(movsDesde);
  const alCierre = inicial + suma(movsPer);
  // agrupado por tipo, en el orden en que suman
  const grupos = [];
  movsPer.forEach((m) => {
    const [e, l] = REP_MOV(m);
    let g = grupos.find((y) => y.l === l);
    if (!g) grupos.push(g = { e, l, monto: 0, num: 0 });
    g.monto += +m.monto; g.num++;
  });
  grupos.sort((a, b) => (b.monto > 0) - (a.monto > 0));

  const vs = ventas.filter((v) => !v.anulada);
  const anuladas = ventas.filter((v) => v.anulada);
  const tot = (k) => vs.reduce((s, v) => s + +(v[k] || 0), 0);
  const sinDesglose = tot('total') - tot('pago_efectivo') - tot('pago_transfer') - tot('extra') + vs.reduce((s, v) => s + Math.max(0, +v.pago_efectivo + +v.pago_transfer + +v.extra - +v.total), 0);
  const piezas = vs.reduce((s, v) => s + (v.items || []).reduce((a, i) => a + +i.piezas + +(i.piezas_gratis || 0), 0), 0);
  const trans = vs.filter((v) => +v.pago_transfer + +v.extra > 0);
  const trPend = trans.filter((v) => !v.verificada);
  const stock = (inv || []).filter((i) => +i.piezas > 0);
  const stockPz = stock.reduce((s, i) => s + +i.piezas, 0);
  const stockVal = stock.reduce((s, i) => s + +i.valor_publico, 0);
  const metodo = (v) => (+v.pago_efectivo + +v.pago_transfer + +v.extra <= 0 ? `${v.metodo === 'efectivo' ? 'Efectivo' : v.metodo === 'mixto' ? 'Mixto' : 'Transferencia'} <span class="rp-mut">· sin desglose</span>`
    : v.metodo === 'mixto' || (+v.pago_efectivo > 0 && +v.pago_transfer > 0) ? 'Mixto' : +v.pago_transfer > 0 ? 'Transferencia' : 'Efectivo');
  const prod = (v) => (v.items || []).map((i) => `${i.cantidad}× ${esc(i.descripcion)}${i.promo ? ' (3×2)' : ''}`).join('<br>');
  const fRep = (iso) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const fechas = (() => {
    const f = (d) => new Date(d).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const ult = new Date(new Date(r.hasta).getTime() - 1);
    const a = f(new Date(new Date(r.desde).getTime() + 6 * 36e5)), b = f(new Date(ult.getTime() - CORTE_H * 36e5));
    return a === b ? a : `${a} al ${b}`;
  })();
  const folioRep = `R-${diaMX().replace(/-/g, '')}-${String(vend.usuario || vend.nombre || '').slice(0, 3).toUpperCase()}`;
  const neto = Math.max(0, enPoder - comPend);

  return `
  <header class="rp-head">
    <div class="rp-marca">${logo(34)}<div><b>Café · Control</b><span>Reporte de ventas del vendedor</span></div></div>
    <div class="rp-folio"><span>Folio</span><b>${folioRep}</b><span>Hecho el ${ahora.toLocaleString('es-MX', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
  </header>

  <section class="rp-quien">
    <span class="rp-ava">${avatar(vend)}</span>
    <div><span class="rp-l">Vendedor</span><b class="rp-nom">${esc(vend.nombre)}</b><span class="rp-per">Periodo: <b>${esc(r.etiqueta)}</b> · ${esc(fechas)}</span></div>
  </section>

  <section class="rp-cuentas">
    <div class="rp-entrega">
      <span class="rp-l">💵 Efectivo que tienes que entregar</span>
      <b class="rp-big">${money(enPoder)}</b>
      <span>Es todo el efectivo de ventas que traes ahora y que todavía no depositas al banco. Ya tiene descontada la comisión que te quedaste al cobrar.</span>
    </div>
    <div class="rp-lado">
      <div class="rp-k ${comPend ? 'rp-k-ok' : ''}"><span>🎁 Comisión que te debemos</span><b>${money(comPend)}</b><small>${comPend ? 'de ventas por transferencia ya confirmadas' : 'no se te debe nada'}</small></div>
      ${comPend && enPoder > 0 ? `<div class="rp-k rp-k-neto"><span>Si tomas tu comisión de ese efectivo</span><b>entregas ${money(neto)}</b><small>${money(enPoder)} − ${money(comPend)}${comPend > enPoder ? ' · el resto se te paga aparte' : ''}</small></div>` : ''}
      ${trPend.length ? `<div class="rp-k rp-k-warn"><span>⏳ Transferencias por confirmar</span><b>${money(trPend.reduce((s, v) => s + +v.pago_transfer + +v.extra, 0))}</b><small>${trPend.length} ${trPend.length === 1 ? 'venta' : 'ventas'} · se revisan contra el banco</small></div>` : ''}
    </div>
  </section>

  <section class="rp-sec">
    <h3>1 · Lo que vendiste</h3>
    <div class="rp-kpis">
      <div><span>Ventas</span><b>${vs.length}</b><small>${fnum(piezas)} piezas</small></div>
      <div><span>Total vendido</span><b>${money0(tot('total'))}</b><small>lo que pagaron los clientes</small></div>
      <div><span>💵 Cobrado en efectivo</span><b>${money0(tot('pago_efectivo'))}</b><small>lo trajiste tú</small></div>
      <div><span>🔁 Por transferencia</span><b>${money0(tot('pago_transfer') + tot('extra'))}</b><small>cayó directo al banco</small></div>
      <div><span>🎁 Tu comisión ganada</span><b>${money0(tot('comision'))}</b><small>efectivo ${money0(x.comision_efectivo || 0)} · transf. ${money0(x.comision_transf || 0)}</small></div>
    </div>
    ${sinDesglose > 0.5 ? `<div class="rp-mut" style="margin-top:6px">⚠️ ${money0(sinDesglose)} de ventas no tienen guardado cómo se pagaron (ventas registradas antes de que el sistema separara efectivo y transferencia). No cuentan ni en tu efectivo ni en el banco.</div>` : ''}
  </section>

  <section class="rp-sec">
    <h3>2 · Así se calcula tu efectivo</h3>
    <div class="rp-cta">
      <div class="rp-r rp-ini"><span>Efectivo que traías al empezar el periodo</span><b>${money(inicial)}</b></div>
      ${grupos.map((g) => `<div class="rp-r ${g.monto < 0 ? 'rp-neg' : 'rp-pos'}"><span>${g.e} ${esc(g.l)} <i>${g.num} ${g.num === 1 ? 'movimiento' : 'movimientos'}</i></span><b>${g.monto < 0 ? '−' : '+'}${money(Math.abs(g.monto))}</b></div>`).join('')
        || '<div class="rp-r"><span class="rp-mut">No hubo movimientos de efectivo en este periodo</span><b></b></div>'}
      <div class="rp-r rp-fin"><span>${finPer ? '= Efectivo que traes ahora' : '= Efectivo que traías al cierre del periodo'}</span><b>${money(alCierre)}</b></div>
      ${finPer ? '' : `<div class="rp-r rp-ini"><span>Movimientos después del periodo</span><b>${alCierre <= enPoder ? '+' : '−'}${money(Math.abs(enPoder - alCierre))}</b></div>
        <div class="rp-r rp-fin"><span>= Efectivo que traes hoy</span><b>${money(enPoder)}</b></div>`}
    </div>
    ${movsPer.length ? `<table class="rp-t rp-t-sm"><thead><tr><th>Fecha</th><th>Movimiento</th><th class="n">Monto</th><th class="n">Traías</th></tr></thead><tbody>
      ${(() => { let s = inicial; return movsPer.map((m) => { s += +m.monto; return `<tr><td>${fRep(m.fecha)}</td><td>${esc(REP_MOV(m)[1])}${m.venta_id ? ` · venta ${folio(m.venta_id)}` : ''}<div class="rp-mut">${esc(m.concepto || '')}</div></td>
        <td class="n ${+m.monto < 0 ? 'rp-neg' : 'rp-pos'}">${+m.monto < 0 ? '−' : '+'}${money(Math.abs(+m.monto))}</td><td class="n">${money(s)}</td></tr>`; }).join(''); })()}
    </tbody></table>` : ''}
  </section>

  <section class="rp-sec">
    <h3>3 · Cada venta, una por una</h3>
    ${vs.length ? `<table class="rp-t"><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Pago</th><th class="n">Total</th><th class="n">Efectivo</th><th class="n">Transf.</th><th class="n">Comisión</th></tr></thead><tbody>
      ${vs.slice().reverse().map((v) => `<tr><td><b>${folio(v.id)}</b></td><td>${fRep(v.fecha)}</td><td>${esc(v.cliente || '—')}${v.tipo === 'paqueteria' ? `<div class="rp-mut">📦 ${esc(v.municipio || 'paquetería')}</div>` : ''}</td>
        <td>${prod(v)}</td><td>${metodo(v)}${+v.pago_transfer + +v.extra > 0 ? `<div class="rp-mut">${v.verificada ? '✓ confirmada' : '⏳ por confirmar'}${v.referencia ? ` · ref ${esc(v.referencia)}` : ''}</div>` : ''}</td>
        <td class="n"><b>${money0(v.total)}</b></td><td class="n">${+v.pago_efectivo ? money0(v.pago_efectivo) : '—'}</td><td class="n">${+v.pago_transfer + +v.extra ? money0(+v.pago_transfer + +v.extra) : '—'}</td><td class="n">${money0(v.comision)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5">Totales · ${vs.length} ventas</td><td class="n">${money0(tot('total'))}</td><td class="n">${money0(tot('pago_efectivo'))}</td><td class="n">${money0(tot('pago_transfer') + tot('extra'))}</td><td class="n">${money0(tot('comision'))}</td></tr></tfoot></table>`
      : `<div class="rp-vacio">No registraste ventas en este periodo.</div>`}
    ${anuladas.length ? `<div class="rp-mut" style="margin-top:6px">Ventas canceladas en el periodo (no cuentan): ${anuladas.map((v) => `${folio(v.id)} ${esc(v.cliente || '')}`).join(', ')}</div>` : ''}
  </section>

  <section class="rp-sec rp-2">
    <div>
      <h3>4 · Producto que traes ahora</h3>
      ${stock.length ? `<table class="rp-t rp-t-sm"><thead><tr><th>Producto</th><th class="n">Piezas</th><th class="n">Vale</th></tr></thead><tbody>
        ${stock.map((i) => `<tr><td>${esc(i.descripcion || i.presentacion || i.sku)}</td><td class="n">${fnum(i.piezas)}</td><td class="n">${money0(i.valor_publico)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td>Total</td><td class="n">${fnum(stockPz)}</td><td class="n">${money0(stockVal)}</td></tr></tfoot></table>
        <div class="rp-mut">Valor al público. Este producto es del negocio: se vende o se regresa.</div>` : '<div class="rp-vacio">No traes producto.</div>'}
    </div>
    <div>
      <h3>5 · Resumen para cuadrar</h3>
      <div class="rp-cta">
        <div class="rp-r"><span>💵 Efectivo en tus manos</span><b>${money(enPoder)}</b></div>
        <div class="rp-r"><span>📦 Producto en tus manos <i>al público</i></span><b>${money0(stockVal)}</b></div>
        <div class="rp-r rp-pos"><span>🎁 Comisión que te debemos</span><b>${money(comPend)}</b></div>
        <div class="rp-r rp-fin"><span>Entregas en efectivo</span><b>${money(comPend && enPoder > 0 ? neto : enPoder)}</b></div>
      </div>
    </div>
  </section>

  <section class="rp-nota">
    Este reporte sale directo del sistema. Cada venta, cada transferencia y cada depósito quedó registrado con fecha, hora y quién lo hizo, y las transferencias se confirman contra el estado de cuenta del banco. Si algo no te cuadra, avísanos hoy mismo para revisarlo juntos.
  </section>

  <section class="rp-firmas">
    <div><i></i><span>${esc(vend.nombre)} · recibí este reporte</span></div>
    <div><i></i><span>Administración · entregó</span></div>
  </section>`;
}

function mostrarReporte(html, vend, r) {
  $('.rep-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'rep-ov';
  ov.innerHTML = `<div class="rep-bar"><b>📄 Reporte de ${esc(vend.nombre)}</b>
      <div class="inline"><button type="button" class="btn btn-rojo" data-rp-pdf>⬇️ Guardar PDF</button><button type="button" class="btn" data-rp-x>Cerrar</button></div></div>
    <div class="rep-hoja">${html}</div>`;
  document.body.appendChild(ov);
  document.body.classList.add('rep-on');
  const tituloAntes = document.title;
  const cerrar = () => { ov.remove(); document.body.classList.remove('rep-on'); document.title = tituloAntes; };
  $('[data-rp-x]', ov).addEventListener('click', cerrar);
  $('[data-rp-pdf]', ov).addEventListener('click', () => {
    // el nombre del PDF sale del título de la página
    document.title = `Reporte ${vend.nombre} ${diaMX()} ${r.etiqueta}`.replace(/[\\/:*?"<>|]+/g, '-');
    setTimeout(() => window.print(), 50);
  });
  window.addEventListener('afterprint', () => { document.title = tituloAntes; }, { once: true });
  ov.scrollTop = 0;
}
