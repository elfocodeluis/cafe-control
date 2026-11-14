/* =====================================================================
   REPORTE DE VENTAS DEL VENDEDOR (solo admin) — Ventas › 📄 Exportar
   Eliges vendedor y periodo; sale una hoja lista para guardar como PDF:
   qué vendió, cuánto cobró en efectivo y por transferencia, su comisión,
   cómo se llega al efectivo que trae (movimiento por movimiento) y lo que
   tiene que entregar. Todo sale de lo registrado en el sistema.
   ===================================================================== */

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
  const [tp, ventas, inv] = await Promise.all([
    API.rpc('tesoreria', { p_desde: r.desde, p_hasta: r.hasta }),
    API.rpc('ventas_de', { p_desde: r.desde, p_hasta: r.hasta, p_vendedor: vend.id }),
    API.rpc('inventario_de', { p_vendedor: vend.id }).catch(() => []),
  ]);
  const x = tp.vendedores.find((y) => y.vendedor_id === vend.id) || {};
  const enPoder = +(x.en_poder || 0);

  const vs = ventas.filter((v) => !v.anulada);
  const tot = (k) => vs.reduce((s, v) => s + +(v[k] || 0), 0);
  const piezas = vs.reduce((s, v) => s + (v.items || []).reduce((a, i) => a + +i.piezas + +(i.piezas_gratis || 0), 0), 0);
  const efNeto = tot('pago_efectivo') - +(x.comision_efectivo || 0); // cobrado en efectivo, ya sin su comisión
  const trTot = tot('pago_transfer') + tot('extra');
  const trPend = vs.filter((v) => +v.pago_transfer + +v.extra > 0 && !v.verificada);
  // producto por categoría, sin precios
  const stock = (inv || []).filter((i) => +i.piezas > 0);
  const cats = [];
  stock.forEach((i) => {
    const k = i.categoria || 'otro';
    let g = cats.find((c) => c.k === k);
    if (!g) cats.push(g = { k, items: [], pz: 0 });
    g.items.push(i); g.pz += +i.piezas;
  });
  const metodo = (v) => (+v.pago_efectivo + +v.pago_transfer + +v.extra <= 0 ? (v.metodo === 'efectivo' ? 'Efectivo' : v.metodo === 'mixto' ? 'Mixto' : 'Transferencia')
    : v.metodo === 'mixto' || (+v.pago_efectivo > 0 && +v.pago_transfer > 0) ? 'Mixto' : +v.pago_transfer > 0 ? 'Transferencia' : 'Efectivo');
  const prod = (v) => (v.items || []).map((i) => `${i.cantidad}× ${esc(i.descripcion)}${i.promo ? ' (3×2)' : ''}`).join('<br>');
  const fRep = (iso) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const fechas = (() => {
    const f = (d) => new Date(d).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const ult = new Date(new Date(r.hasta).getTime() - 1);
    const a = f(new Date(new Date(r.desde).getTime() + 6 * 36e5)), b = f(new Date(ult.getTime() - CORTE_H * 36e5));
    return a === b ? a : `${a} al ${b}`;
  })();
  // ventas agrupadas por día de operación, de la más vieja a la más nueva
  const porDia = [];
  vs.slice().reverse().forEach((v) => { const d = diaMX(v.fecha); const g = porDia.at(-1); if (g && g[0] === d) g[1].push(v); else porDia.push([d, [v]]); });
  const diaTxt = (d) => { const t = new Date(`${d}T18:00:00Z`).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const folioRep = `R-${diaMX().replace(/-/g, '')}-${String(vend.usuario || vend.nombre || '').slice(0, 3).toUpperCase()}`;

  return `
  <header class="rp-head">
    <div class="rp-marca">${logo(34)}<div><b>Café · Control</b><span>Reporte de ventas</span></div></div>
    <div class="rp-folio"><span>Folio</span><b>${folioRep}</b><span>${ahora.toLocaleString('es-MX', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
  </header>

  <section class="rp-quien">
    <div><b class="rp-nom">${esc(vend.nombre)}</b><span class="rp-per">${esc(r.etiqueta)} · ${esc(fechas)}</span></div>
  </section>

  <section class="rp-resumen rp-resumen-1">
    <div class="rp-k"><span>💵 Efectivo pendiente para depositar</span><b>${money0(enPoder)}</b></div>
  </section>

  <section class="rp-sec">
    <h3>Resumen de ventas</h3>
    <div class="rp-kpis rp-kpis-4">
      <div><span>🧾 Ventas</span><b>${vs.length}</b><small>${fnum(piezas)} piezas</small></div>
      <div><span>💵 Cobrado en efectivo</span><b>${money0(efNeto)}</b><small>ya sin tu comisión · lo traes tú</small></div>
      <div><span>🔁 Por transferencia</span><b>${money0(trTot)}</b><small>cayó directo al banco${trPend.length ? ` · ${trPend.length} por confirmar` : ''}</small></div>
      <div><span>🎁 Tu comisión</span><b>${money0(tot('comision'))}</b><small>ganada en el periodo</small></div>
    </div>
  </section>

  <section class="rp-sec">
    <h3>Ventas</h3>
    ${vs.length ? `<table class="rp-t"><thead><tr><th>Venta</th><th>Hora</th><th>Cliente</th><th>Productos</th><th>Pago</th><th class="n">Total</th><th class="n">Efectivo</th><th class="n">Transf.</th><th class="n">Comisión</th></tr></thead><tbody>
      ${porDia.map(([dia, lista]) => `<tr class="rp-dia"><td colspan="9"><b>${esc(diaTxt(dia))}</b><span>${lista.length} ${lista.length === 1 ? 'venta' : 'ventas'} · ${money0(lista.reduce((t, v) => t + +v.total, 0))}</span></td></tr>
      ${lista.map((v) => `<tr><td><b>${folio(v.id)}</b></td><td>${fRep(v.fecha)}</td><td>${esc(v.cliente || '—')}${v.tipo === 'paqueteria' ? `<div class="rp-mut">📦 ${esc(v.municipio || 'paquetería')}</div>` : ''}</td>
        <td>${prod(v)}</td><td>${metodo(v)}${+v.pago_transfer + +v.extra > 0 ? `<div class="rp-mut">${v.verificada ? '✓ confirmada' : 'por confirmar'}${v.referencia ? ` · ref ${esc(v.referencia)}` : ''}</div>` : ''}</td>
        <td class="n"><b>${money0(v.total)}</b></td><td class="n">${+v.pago_efectivo ? money0(v.pago_efectivo) : '—'}</td><td class="n">${+v.pago_transfer + +v.extra ? money0(+v.pago_transfer + +v.extra) : '—'}</td><td class="n">${money0(v.comision)}</td></tr>`).join('')}`).join('')}
      </tbody><tfoot><tr><td colspan="5">${vs.length} ${vs.length === 1 ? 'venta' : 'ventas'}</td><td class="n">${money0(tot('total'))}</td><td class="n">${money0(tot('pago_efectivo'))}</td><td class="n">${money0(trTot)}</td><td class="n">${money0(tot('comision'))}</td></tr></tfoot></table>`
      : '<div class="rp-vacio">Sin ventas en este periodo.</div>'}
  </section>

  <section class="rp-sec">
    <h3>Producto que traes</h3>
    ${cats.length ? `<div class="rp-cats">${cats.map((g) => `<div class="rp-cat">
        <div class="rp-cat-h"><span>${CAT_ICO[g.k] || '📦'} ${esc(CAT[g.k] || 'Otro')}</span><b>${fnum(g.pz)} pz</b></div>
        ${g.items.map((i) => `<div class="rp-cat-i"><span>${esc(i.descripcion || i.presentacion || i.sku)}</span><b>${fnum(i.piezas)}</b></div>`).join('')}
      </div>`).join('')}</div>` : '<div class="rp-vacio">No traes producto.</div>'}
  </section>

  <section class="rp-sec">
    <h3>Resumen</h3>
    <div class="rp-cta">
      <div class="rp-r"><span>💵 Efectivo pendiente para depositar</span><b>${money0(enPoder)}</b></div>
    </div>
  </section>

`;
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
