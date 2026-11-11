/* =====================================================================
   ALMACÉN · PRODUCIR Y ENTREGAR · INVENTARIO DE VENDEDORES
   ===================================================================== */
const EMO_CAT = CAT_ICO;
const nivel = (p) => {
  const ref = p.modo === 'piezas' ? 100 : p.gramos_por_unidad == 1000 ? 10000 : 4 * p.gramos_por_unidad;
  const pct = Math.min(100, (p.stock / ref) * 100);
  return { pct, bajo: pct < 20 };
};

VIEWS['almacen'] = async (v) => {
  const alm = await API.rpc('almacen');
  const adm = alm.es_admin;
  const costoTxt = (p) => p.modo === 'gramos' ? `${money(p.costo_unidad)} / ${esc(p.unidad_compra)}` : `${money(p.costo_unidad)} / pieza`;
  // Valor al público: con el precio más bajo por gramo/pieza (seguro) y con el más alto (vendiendo en piezas chicas)
  const pub = (p) => {
    const ps = p.presentaciones.filter((pr) => +pr.precio_pieza > 0);
    const unit = ps.map((pr) => p.modo === 'gramos' ? (+pr.gramos ? pr.precio_pieza / pr.gramos : 0) : pr.precio_pieza).filter((x) => x > 0);
    if (!unit.length) return { min: 0, max: 0 };
    return { min: +p.stock * Math.min(...unit), max: +p.stock * Math.max(...unit) };
  };
  const prods = alm.productos.map((p) => ({ ...p, pub: pub(p), costo: +p.valor || 0, n: nivel(p) }));
  const total = prods.reduce((s, p) => s + p.costo, 0);
  const pubMin = prods.reduce((s, p) => s + p.pub.min, 0);
  const pubMax = prods.reduce((s, p) => s + p.pub.max, 0);
  const gan = pubMin - total;
  const agotados = prods.filter((p) => +p.stock <= 0);
  const bajos = prods.filter((p) => +p.stock > 0 && p.n.bajo);
  const cats = [];
  prods.forEach((p) => { const k = p.categoria || 'otro'; let c = cats.find((x) => x.k === k); if (!c) cats.push(c = { k, items: [], costo: 0, pub: 0 }); c.items.push(p); c.costo += p.costo; c.pub += p.pub.min; });
  const maxCat = Math.max(1, ...cats.map((c) => c.pub || c.costo));
  const pctM = (c, pu) => pu > 0 ? Math.round(((pu - c) / pu) * 100) : 0;
  v.innerHTML = `
    <div class="page-head"><div><h1>Almacén</h1><div class="muted small">${prods.length} productos${bajos.length ? ` · <span style="color:var(--warn)">${bajos.length} con poco stock</span>` : ''}${agotados.length ? ` · <span style="color:var(--err)">${agotados.length} sin stock</span>` : ''}</div></div>
      <div class="tools"><a class="btn btn-primary" href="#/entregar">☕ Producir y entregar</a></div></div>
    ${adm ? `<div class="kpis kpis-g4 alm-kpis">
      ${kpi('Valor a costo', money0(total), 'lo que pagaste por lo que hay')}
      ${kpi('Valor al público', money0(pubMin), pubMax > pubMin + 1 ? `hasta <b>${money0(pubMax)}</b> si se vende en piezas chicas` : 'precio de venta', { cls: 'hl' })}
      ${kpi('Ganancia esperada', money0(gan), `${pctM(total, pubMin)}% de margen${pubMax > pubMin + 1 ? ` · hasta ${money0(pubMax - total)}` : ''}`, { cls: gan >= 0 ? 'ok' : 'bad' })}
      ${kpi('Alertas', `${agotados.length + bajos.length}`, `${agotados.length} sin stock · ${bajos.length} poco stock`, { cls: agotados.length + bajos.length ? 'warn' : '' })}
    </div>
    <div class="card alm-cats"><div class="card-head"><h2>Valor por categoría</h2><span class="small muted"><i class="lg lg-c"></i> costo <i class="lg lg-p"></i> público</span></div>
      ${cats.map((c) => `<div class="ac-row stk-${c.k}"><span class="ac-n">${EMO_CAT[c.k] || '📦'} ${esc(CAT[c.k] || c.k)}</span>
        <span class="ac-bars"><i class="ac-p" style="width:${(c.pub / maxCat) * 100}%"></i><i class="ac-c" style="width:${(c.costo / maxCat) * 100}%"></i></span>
        <span class="ac-v"><b>${money0(c.pub)}</b><small>costo ${money0(c.costo)}</small></span></div>`).join('')}
    </div>` : ''}
    ${cats.map((c) => `<section class="alm-sec">
      <div class="alm-sec-h"><h2>${EMO_CAT[c.k] || '📦'} ${esc(CAT[c.k] || c.k)}</h2>${adm ? `<span class="small muted">costo <b>${money0(c.costo)}</b> · público <b>${money0(c.pub)}</b></span>` : ''}</div>
      <div class="prod-grid">${c.items.map((p) => {
      const n = p.n;
      const pz14 = p.modo === 'gramos' && p.presentaciones.some((pr) => es14(pr.gramos)) ? Math.floor(p.stock / GRAMOS_14) : 0;
      const sin = +p.stock <= 0;
      return `<div class="pcard stk-${c.k} ${sin ? 'agotado' : n.bajo ? 'bajo' : ''}">
        <div class="pcard-h"><span class="pcard-e">${EMO_CAT[p.categoria] || '📦'}</span><div><b>${esc(p.sku)}</b>${p.nombre !== p.sku ? `<div class="small muted">${esc(p.nombre)}</div>` : ''}</div>
          ${sin ? '<span class="badge b-err">Sin stock</span>' : n.bajo ? '<span class="badge b-warn">Poco</span>' : ''}</div>
        <div class="pcard-n">${cant(p.stock, p.modo)}</div>
        <div class="bar"><i style="width:${n.pct}%"></i></div>
        <div class="small muted pcard-s">${p.modo === 'gramos' && p.gramos_por_unidad != 1000 ? `${fnum(p.stock / p.gramos_por_unidad, 2)} bolsas · ` : ''}${pz14 ? `alcanza para ~${fnum(pz14)} piezas de 14 g` : p.modo === 'piezas' ? 'piezas sueltas' : ''}</div>
        ${adm && !sin ? `<div class="pcard-m">
          <div><small>Costo</small><b>${money0(p.costo)}</b></div>
          <div><small>Público</small><b>${money0(p.pub.min)}</b></div>${p.pub.max > p.pub.min + 1 ? `<div class="pm-max"><small>En piezas chicas</small><b>hasta ${money0(p.pub.max)}</b></div>` : ''}
          <div><small>Ganancia</small><b class="${p.pub.min - p.costo >= 0 ? 'pos' : 'neg'}">${money0(p.pub.min - p.costo)}</b><em>${pctM(p.costo, p.pub.min)}%</em></div>
        </div>` : ''}
        <div class="pcard-a"><button class="btn btn-sm btn-primary" data-ent="${p.id}">+ Entrada</button><button class="btn btn-sm" data-det="${p.id}">Detalles</button></div>
      </div>`;
    }).join('')}</div></section>`).join('')}
    ${alm.empacado.length ? `<div class="card"><div class="card-head"><h2>📦 Piezas empacadas que regresaron</h2><a class="btn btn-sm" href="#/entregar?o=empacado">Entregar a vendedor</a></div>
      <div class="chips">${alm.empacado.map((e) => `<span class="chip chip-static"><b>${e.piezas}</b> × ${esc(e.descripcion)}</span>`).join('')}</div></div>` : ''}
    <details class="card fold"><summary><h2 style="display:inline">Movimientos del almacén</h2> <span class="muted small">entradas, producción, merma, devoluciones</span></summary>
      <div style="margin-top:12px">${rangoHTML('hoy')}</div><div id="movs"></div></details>`;

  const TIPOS = { entrada: ['Entrada', 'b-ok'], ajuste: ['Ajuste', 'b-warn'], retiro: ['A producción', 'b-info'], merma: ['Merma', 'b-err'], devolucion: ['Devolución', 'b-brand'], entrega_empacado: ['Entrega empacado', 'b-info'] };
  let movN = 0;
  const loadMovs = async (r) => {
    const yo = ++movN;
    const m = await API.rpc('movimientos_lista', { p_desde: r.desde, p_hasta: r.hasta });
    if (yo !== movN) return;
    $('#movs', v).innerHTML = m.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th class="num">Cantidad</th>${adm ? '<th class="num">Costo</th>' : ''}<th>Detalle</th></tr></thead><tbody>
      ${m.map((x) => `<tr><td class="small">${fecha(x.fecha)}</td><td><span class="badge ${TIPOS[x.tipo][1]}">${TIPOS[x.tipo][0]}</span></td><td>${esc(x.descripcion)}</td>
        <td class="num">${x.piezas != null ? `${x.piezas > 0 ? '+' : ''}${x.piezas} pz` : `${x.cantidad > 0 ? '+' : ''}${cant(x.cantidad, x.modo)}`}</td>
        ${adm ? `<td class="num">${x.costo == null ? '—' : money(x.costo)}</td>` : ''}<td class="small muted">${[x.vendedor && esc(x.vendedor), x.nota && esc(x.nota), x.usuario && `por ${esc(x.usuario)}`].filter(Boolean).join(' · ')}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Sin movimientos en este periodo</div>';
  };
  const leer = bindRango($('#movs', v).parentElement, loadMovs);
  loadMovs(leer());

  const prodDe = (id) => alm.productos.find((p) => p.id === +id);
  $$('[data-ent]', v).forEach((b) => b.addEventListener('click', () => {
    const p = prodDe(b.dataset.ent);
    const unidad = p.modo === 'piezas' ? 'Piezas' : p.unidad_compra === 'kg' ? 'Kilos' : `Bolsas (${p.unidad_compra})`;
    let pago = 'banco';
    modal(`<h2>${EMO_CAT[p.categoria] || ''} Entrada de ${esc(p.sku)}</h2><div class="muted">Mercancía nueva que llega al almacén. Hay ${cant(p.stock, p.modo)}.</div>
      <form id="fent">
        <div class="row">
          <label class="field"><span>${unidad}</span><input name="c" type="number" step="any" min="0" required inputmode="decimal" class="input-big"></label>
          ${adm ? `<label class="field"><span>Costo total (MXN)</span><input name="t" type="number" step="any" min="0" required inputmode="decimal" class="input-big"><small>Costo actual: ${costoTxt(p)}</small></label>` : ''}
        </div>
        ${adm ? `<div class="field"><span>¿Cómo se paga?</span>
          <div class="tiles tiles-2" id="fpago">
            <button type="button" class="tile tile-sm on" data-p="banco"><span class="tile-e">🏦</span><span class="tile-t">Pagado del banco</span><span class="tile-s">sale del banco ahora</span></button>
            <button type="button" class="tile tile-sm" data-p="deuda"><span class="tile-e">🤝</span><span class="tile-t">A consignación</span><span class="tile-s">se debe al proveedor</span></button>
            <button type="button" class="tile tile-sm" data-p=""><span class="tile-e">➖</span><span class="tile-t">No registrar pago</span><span class="tile-s">ya estaba pagado</span></button>
          </div></div>
          <label class="field"><span>Proveedor <i class="muted">(opcional)</i></span><input name="pv" placeholder="Ej. Finca Don Pepe"></label>` : ''}
        <label class="field"><span>Nota <i class="muted">(opcional)</i></span><input name="n" placeholder="Factura, lote…"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Registrar entrada</button></div>
      </form>`);
    const f = $('#fent', dlg);
    let tocado = false;
    if (adm) {
      f.t.addEventListener('input', () => (tocado = true));
      f.c.addEventListener('input', () => { if (!tocado) f.t.value = f.c.value ? Math.round(f.c.value * p.costo_unidad * 100) / 100 : ''; });
      $$('#fpago .tile', dlg).forEach((x) => x.addEventListener('click', () => { pago = x.dataset.p; $$('#fpago .tile', dlg).forEach((y) => y.classList.toggle('on', y === x)); }));
    }
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (adm && pago === 'deuda' && !f.pv.value.trim()) { f.pv.focus(); return toast('Escribe el proveedor al que se le debe', true); }
      await run($('.btn-primary', f), async () => {
        await API.rpc('registrar_entrada', { p_producto: p.id, p_cantidad: +f.c.value, p_costo_total: adm ? +f.t.value : null, p_nota: f.n.value || null,
          p_pago: adm ? pago || null : null, p_proveedor: adm ? f.pv.value || null : null });
        dlg.close(); FX.exito();
        toast(adm && pago === 'deuda' ? `Entrada registrada · se debe ${money(f.t.value)} a ${f.pv.value}` : 'Entrada registrada'); route();
      });
    });
    f.c.focus();
  }));
  $$('[data-det]', v).forEach((b) => b.addEventListener('click', () => {
    const p = prodDe(b.dataset.det);
    modal(`<h2>${EMO_CAT[p.categoria] || ''} ${esc(p.sku)} <span class="muted small">${esc(p.nombre)}</span></h2>
      <div class="calc">
        <div><div class="l">En stock</div><div class="v">${cant(p.stock, p.modo)}</div></div>
        ${adm ? `<div><div class="l">Costo</div><div class="v">${costoTxt(p)}</div></div><div><div class="l">Valor</div><div class="v">${money0(p.valor)}</div></div>` : ''}
      </div>
      <h3>Se vende en</h3>
      <div class="chips" style="margin-bottom:14px">${p.presentaciones.map((pr) => `<span class="chip chip-static">${esc(pr.nombre)} · ${money0(pr.precio_pieza)}${pr.promo_3x2 ? ' · 3×2' : ''}</span>`).join('')}</div>
      <h3>Ajustar stock</h3><div class="muted small">Para corregir (conteo físico, producto dañado…).</div>
      <form id="faj">
        <div class="seg" id="ajsig"><button type="button" class="on" data-s="-1">− Quitar</button><button type="button" data-s="1">+ Agregar</button></div>
        <label class="field"><span>${p.modo === 'piezas' ? 'Piezas' : 'Gramos'}</span><input name="c" type="number" step="any" min="0" required inputmode="decimal"></label>
        <label class="field"><span>Motivo</span><input name="n" required placeholder="Ej. conteo físico, bolsa rota"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cerrar</button><button class="btn btn-primary">Guardar ajuste</button></div>
      </form>`);
    let s = -1;
    $$('#ajsig button', dlg).forEach((x) => x.addEventListener('click', () => { s = +x.dataset.s; $$('#ajsig button', dlg).forEach((y) => y.classList.toggle('on', y === x)); }));
    const f = $('#faj', dlg);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await run($('.btn-primary', f), async () => {
        await API.rpc('ajustar_stock', { p_producto: p.id, p_cantidad: s * +f.c.value, p_nota: f.n.value });
        dlg.close(); toast('Ajuste guardado'); route();
      });
    });
  }));
};

/* ---------- producir y entregar ---------- */
VIEWS['entregar'] = async (v, q) => {
  let alm = await API.rpc('almacen');
  if (!alm.vendedores.length) {
    v.innerHTML = '<div class="page-head"><h1>Producir y entregar</h1></div><div class="alert alert-warn">No hay vendedores activos. Créalos primero en Usuarios.</div>';
    return;
  }
  let vendId = alm.vendedores.some((x) => x.id === q.v) ? q.v : alm.vendedores[0].id;
  let origen = q.o === 'empacado' ? 'empacado' : 'almacen';
  let prodId = '';
  let estado = {}; // presentacion_id -> piezas
  let retirar = 0;
  let sols = await API.rpc('solicitudes_lista');
  let solActual = null;
  const adm = alm.es_admin;
  const prod = () => alm.productos.find((p) => p.id === +prodId);
  const vendNombre = () => alm.vendedores.find((x) => x.id === vendId)?.nombre || '';

  async function despuesDeEntregar(msg) {
    if (solActual) {
      try { await API.rpc('cambiar_solicitud', { p_id: solActual, p_estado: 'atendida' }); } catch {}
      solActual = null;
    }
    FX.fiesta(90);
    toast(msg);
    [alm, sols] = await Promise.all([API.rpc('almacen'), API.rpc('solicitudes_lista')]);
    estado = {}; retirar = 0; prodId = '';
    shell();
  }

  function solicitudesHTML() {
    if (!sols.length) return '';
    return `<div class="card sol-card"><div class="card-head"><h2>🔔 Le piden producto <span class="badge b-warn">${sols.length}</span></h2></div>
      <div class="sols">${sols.map((s) => `<div class="sol ${solActual === s.id ? 'on' : ''}">
        <span class="mini-ava">${avatar({ nombre: s.vendedor })}</span>
        <div class="sol-b"><b>${esc(s.vendedor)}</b> pide <b>${s.piezas} × ${esc(s.descripcion)}</b><div class="small muted">${fecha(s.fecha)}${s.nota ? ' · ' + esc(s.nota) : ''}</div></div>
        <div class="inline"><button class="btn btn-sm btn-primary" data-atender="${s.id}">Atender</button><button class="btn btn-sm btn-ghost" data-sol-ok="${s.id}" title="Marcar atendida">✓</button></div></div>`).join('')}</div></div>`;
  }

  function shell() {
    const tot = alm.empacado.reduce((s, e) => s + e.piezas, 0);
    v.innerHTML = `
      <div class="page-head"><div><h1>Producir y entregar</h1><div class="muted small">Del almacén a las manos del vendedor, en 4 pasos</div></div></div>
      ${solicitudesHTML()}
      <div class="card">
        <div class="paso"><div class="paso-n">1</div><div class="paso-b"><div class="paso-t">¿Para quién es?</div>
          <div class="ava-row ava-row-sm" id="vchips">${alm.vendedores.map((x) => `<button type="button" class="ava-pick ${x.id === vendId ? 'on' : ''}" data-v="${x.id}"><span class="ava-wrap">${avatar(x)}</span><span class="ava-name">${esc(x.nombre)}</span></button>`).join('')}</div></div></div>
        <div class="paso"><div class="paso-n">2</div><div class="paso-b"><div class="paso-t">¿De dónde sale?</div>
          <div class="tiles tiles-2" id="orig">
            <button type="button" class="tile tile-sm ${origen === 'almacen' ? 'on' : ''}" data-o="almacen"><span class="tile-e">🏭</span><span class="tile-t">Del almacén</span><span class="tile-s">producir piezas nuevas</span></button>
            <button type="button" class="tile tile-sm ${origen === 'empacado' ? 'on' : ''}" data-o="empacado" ${tot ? '' : 'disabled'}><span class="tile-e">📦</span><span class="tile-t">Ya empacado</span><span class="tile-s">${tot ? `${tot} piezas que regresaron` : 'no hay piezas devueltas'}</span></button>
          </div></div></div>
        <div id="ebody"></div>
      </div>`;
    $$('#vchips .ava-pick', v).forEach((b) => b.addEventListener('click', () => { vendId = b.dataset.v; $$('#vchips .ava-pick', v).forEach((x) => x.classList.toggle('on', x === b)); body(); }));
    $$('#orig .tile', v).forEach((b) => b.addEventListener('click', () => { origen = b.dataset.o; $$('#orig .tile', v).forEach((x) => x.classList.toggle('on', x === b)); body(); }));
    $$('[data-atender]', v).forEach((b) => b.addEventListener('click', () => {
      const s = sols.find((x) => x.id === +b.dataset.atender);
      solActual = s.id; vendId = s.vendedor_id; origen = 'almacen'; prodId = String(s.producto_id); estado = {}; retirar = 0;
      const p = prod();
      const pr = p?.presentaciones.find((x) => x.id === s.presentacion_id);
      if (p && pr) {
        estado[pr.id] = s.piezas;
        retirar = p.modo === 'piezas' ? s.piezas : Math.round(s.piezas * pr.gramos * 100) / 100;
      }
      shell();
      toast(`Atendiendo: ${s.piezas} pz de ${s.descripcion} para ${s.vendedor}. Al entregar se marca como atendida.`);
      $('#ebody', v).scrollIntoView({ behavior: 'smooth' });
    }));
    $$('[data-sol-ok]', v).forEach((b) => b.addEventListener('click', async () => {
      await run(b, async () => {
        await API.rpc('cambiar_solicitud', { p_id: +b.dataset.solOk, p_estado: 'atendida' });
        if (solActual === +b.dataset.solOk) solActual = null;
        sols = await API.rpc('solicitudes_lista'); shell();
      });
    }));
    body();
  }

  function body() {
    const box = $('#ebody', v);
    if (origen === 'empacado') {
      box.innerHTML = `<div class="paso"><div class="paso-n">3</div><div class="paso-b"><div class="paso-t">¿Cuántas piezas?</div>
        ${alm.empacado.length ? `<div class="emp-list">${alm.empacado.map((e) => `<div class="emp-i"><div><b>${esc(e.descripcion)}</b><div class="small muted">${e.piezas} disponibles</div></div>
          <input type="number" min="1" max="${e.piezas}" step="1" data-epz="${e.presentacion_id}" inputmode="numeric" placeholder="0" style="width:90px">
          <button class="btn btn-sm btn-primary" data-eent="${e.presentacion_id}">Entregar a ${esc(vendNombre())}</button></div>`).join('')}</div>` : '<div class="empty">No hay piezas empacadas devueltas</div>'}</div></div>`;
      $$('[data-eent]', box).forEach((b) => b.addEventListener('click', async () => {
        const id = +b.dataset.eent;
        const pz = parseInt($(`[data-epz="${id}"]`, box).value);
        if (!pz || pz <= 0) return toast('Indica cuántas piezas', true);
        await run(b, async () => {
          await API.rpc('entregar_empacado', { p_vendedor: vendId, p_presentacion: id, p_piezas: pz });
          await despuesDeEntregar(`Entregado a ${vendNombre()}`);
        });
      }));
      return;
    }
    box.innerHTML = `<div class="paso"><div class="paso-n">3</div><div class="paso-b"><div class="paso-t">¿Qué producto?</div>
        <div class="tiles tiles-prod" id="ptiles">${alm.productos.map((p) => `<button type="button" class="tile tile-sm ${+prodId === p.id ? 'on' : ''}" data-p="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
          <span class="tile-e">${EMO_CAT[p.categoria] || '📦'}</span><span class="tile-t">${esc(p.sku)}</span><span class="tile-s">${cant(p.stock, p.modo)}</span></button>`).join('')}</div></div></div>
      <div id="pdet"></div>`;
    $$('#ptiles .tile', box).forEach((b) => b.addEventListener('click', () => { prodId = b.dataset.p; estado = {}; retirar = 0; $$('#ptiles .tile', box).forEach((x) => x.classList.toggle('on', x === b)); detalle(); $('#pdet', v).scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }));
    detalle();
  }

  function detalle() {
    const p = prod();
    const box = $('#pdet', v);
    if (!p) { box.innerHTML = ''; return; }
    if (p.modo === 'piezas') {
      const pr = p.presentaciones[0];
      box.innerHTML = `<div class="paso"><div class="paso-n">4</div><div class="paso-b"><div class="paso-t">¿Cuántas piezas de ${esc(p.sku)}?</div>
          <div class="inline"><div class="stepper"><button type="button" data-st="-10">−10</button><button type="button" data-st="-1">−</button>
            <input type="number" id="pzs" min="1" step="1" max="${p.stock}" inputmode="numeric" value="${retirar || ''}" placeholder="0">
            <button type="button" data-st="1">+</button><button type="button" data-st="10">+10</button></div>
            <span class="small muted">Disponibles: ${cant(p.stock, 'piezas')}</span></div>
        <div class="calc" id="calc"></div>
        <button class="btn btn-primary btn-lg" id="go">Entregar a ${esc(vendNombre())}</button></div></div>`;
      const inp = $('#pzs', box);
      const upd = () => {
        retirar = parseInt(inp.value) || 0;
        const ref = pr ? pr.precio_pieza : 0;
        $('#calc', box).innerHTML = `<div><div class="l">Piezas</div><div class="v">${fnum(retirar)}</div></div>
          ${adm ? `<div><div class="l">Costo</div><div class="v">${money(retirar * p.costo_base)}</div></div>` : ''}
          <div><div class="l">Valor al público</div><div class="v">${money(retirar * ref)}</div></div>
          ${p.categoria === 'filtro' ? '<div><div class="l">Nota</div><div class="small">Se venden en paquetes de 2, 12 o 25. Valor a $' + fnum(ref, 2) + '/pz (paquete de 25).</div></div>' : ''}`;
      };
      inp.addEventListener('input', upd);
      $$('[data-st]', box).forEach((b) => b.addEventListener('click', () => { inp.value = Math.max(0, Math.min(p.stock, (parseInt(inp.value) || 0) + +b.dataset.st)); upd(); }));
      upd();
      $('#go', box).onclick = async (e) => {
        if (retirar <= 0) return toast('Indica cuántas piezas', true);
        if (retirar > p.stock) return toast('No hay suficiente stock', true);
        if (!(await confirmar('Confirmar entrega', `${retirar} pz de ${p.sku} para ${vendNombre()}.`, 'Entregar'))) return;
        await run(e.target, async () => {
          await API.rpc('entregar', { p_vendedor: vendId, p_producto: p.id, p_retirar: retirar, p_items: [{ presentacion_id: pr.id, piezas: retirar }] });
          await despuesDeEntregar(`Entregado a ${vendNombre()}`);
        });
      };
      return;
    }
    // café por gramos
    const chips = p.gramos_por_unidad == 1000 ? [[500, '500 g'], [1000, '1 kg'], [2000, '2 kg'], [5000, '5 kg']]
      : [[+p.gramos_por_unidad, `1 bolsa (${fnum(p.gramos_por_unidad)} g)`], [2 * p.gramos_por_unidad, '2 bolsas']];
    box.innerHTML = `<div class="paso"><div class="paso-n">4</div><div class="paso-b"><div class="paso-t">¿Cuánto retiras y en qué presentaciones?</div>
      <div class="inline">
        <div class="chips">${chips.map(([g, l]) => `<button type="button" class="chip" data-g="${g}" ${g > p.stock ? 'disabled' : ''}>${l}</button>`).join('')}</div>
        <label class="inline small"><input type="number" id="ret" min="1" step="any" inputmode="decimal" value="${retirar || ''}" style="width:120px" placeholder="gramos"> g · hay ${cant(p.stock)}</label>
      </div>
      <div class="pres-grid" style="margin-top:14px">${p.presentaciones.map((pr) => `<div class="pres ${estado[pr.id] ? 'on' : ''}" data-box="${pr.id}">
        <div class="t">${esc(pr.nombre)}</div>
        <div class="s">${es14(pr.gramos) ? '35 piezas = 500 g' : pr.gramos && Math.abs(pr.gramos / GRAMOS_14 - Math.round(pr.gramos / GRAMOS_14)) < 0.001 ? `cada uno = ${Math.round(pr.gramos / GRAMOS_14)} piezas de 14 g` : `${fnum(pr.gramos, 1)} g c/u`} · ${money0(pr.precio_pieza)}</div>
        <div class="stepper stepper-sm"><button type="button" data-m="${pr.id}" data-d="-1">−</button>
          <input type="number" min="0" step="1" inputmode="numeric" data-pr="${pr.id}" value="${estado[pr.id] || ''}" placeholder="0">
          <button type="button" data-m="${pr.id}" data-d="1">+</button></div>
        <button type="button" class="link small" data-fill="${pr.id}">Llenar con lo que resta</button></div>`).join('')}</div>
      <div class="gauge" id="gauge"><i></i></div>
      <div class="calc" id="calc"></div>
      <div id="avisos"></div>
      <button class="btn btn-primary btn-lg" id="go">Producir y entregar a ${esc(vendNombre())}</button></div></div>`;

    const usado = () => p.presentaciones.reduce((s, pr) => s + (estado[pr.id] || 0) * pr.gramos, 0);
    const upd = () => {
      const u = Math.round(usado() * 100) / 100;
      let merma = Math.round((retirar - u) * 100) / 100;
      if (Math.abs(merma) < 0.01) merma = 0;
      const valor = p.presentaciones.reduce((s, pr) => s + (estado[pr.id] || 0) * pr.precio_pieza, 0);
      const piezas = Object.values(estado).reduce((s, x) => s + (x || 0), 0);
      const g = $('#gauge i', box);
      g.style.width = `${retirar ? Math.min(100, (u / retirar) * 100) : 0}%`;
      g.parentElement.classList.toggle('over', merma < 0);
      g.parentElement.classList.toggle('full', retirar > 0 && merma === 0);
      $$('.pres', box).forEach((el) => el.classList.toggle('on', !!estado[el.dataset.box]));
      $('#calc', box).innerHTML = `
        <div><div class="l">Retiras</div><div class="v">${cant(retirar)}</div></div>
        <div><div class="l">Piezas producidas</div><div class="v">${fnum(piezas)} pz</div><div class="l">${cant(u)}</div></div>
        <div><div class="l">${merma >= 0 ? 'Merma' : 'Te faltan'}</div><div class="v" style="color:${merma < 0 ? 'var(--err)' : merma > 0 ? 'var(--warn)' : 'var(--ok)'}">${fnum(Math.abs(merma), 2)} g</div></div>
        ${adm ? `<div><div class="l">Costo</div><div class="v">${money(retirar * p.costo_base)}</div></div>` : ''}
        <div><div class="l">Valor al público</div><div class="v">${money(valor)}</div></div>`;
      const av = [];
      if (retirar > p.stock) av.push(`<div class="alert alert-err">Solo hay ${cant(p.stock)} en stock.</div>`);
      if (merma < 0) av.push(`<div class="alert alert-err">Las piezas suman ${cant(u)} y solo retiras ${cant(retirar)}. Quita piezas o retira más.</div>`);
      else if (merma > 0 && piezas > 0) av.push(`<div class="alert alert-warn">Quedarán <b>${fnum(merma, 2)} g</b> sin producir. Se registrarán como merma${adm ? ` (${money(merma * p.costo_base)})` : ''}.</div>`);
      else if (piezas > 0 && merma === 0) av.push('<div class="alert alert-ok">✓ Cuadra exacto, sin merma.</div>');
      $('#avisos', box).innerHTML = av.join('');
      return { merma, piezas, u };
    };
    $('#ret', box).addEventListener('input', (e) => { retirar = +e.target.value || 0; upd(); });
    $$('[data-g]', box).forEach((b) => b.addEventListener('click', () => { retirar = +b.dataset.g; $('#ret', box).value = retirar; upd(); }));
    $$('[data-pr]', box).forEach((inp) => inp.addEventListener('input', () => { estado[inp.dataset.pr] = parseInt(inp.value) || 0; upd(); }));
    $$('[data-m]', box).forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.m;
      estado[id] = Math.max(0, (estado[id] || 0) + +b.dataset.d);
      $(`[data-pr="${id}"]`, box).value = estado[id] || '';
      upd();
    }));
    $$('[data-fill]', box).forEach((b) => b.addEventListener('click', () => {
      const pr = p.presentaciones.find((x) => x.id === +b.dataset.fill);
      estado[pr.id] = 0;
      const n = Math.max(0, Math.floor((retirar - usado() + 0.01) / pr.gramos));
      estado[pr.id] = n;
      $(`[data-pr="${pr.id}"]`, box).value = n || '';
      upd();
    }));
    upd();
    $('#go', box).onclick = async (e) => {
      const { merma, piezas } = upd();
      if (retirar <= 0) return toast('Indica cuánto vas a retirar', true);
      if (retirar > p.stock) return toast('No hay suficiente stock', true);
      if (!piezas) return toast('Indica cuántas piezas de cada presentación', true);
      if (merma < 0) return toast('Las piezas exceden lo retirado', true);
      const lista = p.presentaciones.filter((pr) => estado[pr.id] > 0).map((pr) => `• ${estado[pr.id]} × ${pr.nombre}`).join('\n');
      const ok = await confirmar('Confirmar producción', `${p.sku}: se retiran ${cant(retirar)} del almacén para ${vendNombre()}.\n\n${lista}${merma > 0 ? `\n\n⚠ Merma: ${fnum(merma, 2)} g${adm ? ` (${money(merma * p.costo_base)})` : ''}` : ''}`, 'Producir y entregar');
      if (!ok) return;
      await run(e.target, async () => {
        const items = p.presentaciones.filter((pr) => estado[pr.id] > 0).map((pr) => ({ presentacion_id: pr.id, piezas: estado[pr.id] }));
        const r = await API.rpc('entregar', { p_vendedor: vendId, p_producto: p.id, p_retirar: retirar, p_items: items });
        await despuesDeEntregar(`Entregado a ${vendNombre()}${+r.merma ? ` · merma ${fnum(r.merma, 2)} g` : ''}`);
      });
    };
  }
  shell();
};

/* ---------- inventario de vendedores (producción) ---------- */
VIEWS['vendedores'] = async (v, q) => {
  const alm = await API.rpc('almacen');
  if (!alm.vendedores.length) { v.innerHTML = '<div class="page-head"><h1>Inventario de vendedores</h1></div><div class="alert alert-warn">No hay vendedores activos.</div>'; return; }
  let vendId = alm.vendedores.some((x) => x.id === q.v) ? q.v : alm.vendedores[0].id;
  v.innerHTML = `<div class="page-head"><h1>Inventario de vendedores</h1></div>
    <div class="ava-row ava-row-sm" id="vch">${alm.vendedores.map((x) => `<button type="button" class="ava-pick ${x.id === vendId ? 'on' : ''}" data-v="${x.id}"><span class="ava-wrap">${avatar(x)}</span><span class="ava-name">${esc(x.nombre)}</span></button>`).join('')}</div>
    <div id="vb"></div>`;
  let invN = 0;
  const load = async () => {
    const yo = ++invN, id = vendId; // se fija el vendedor antes de esperar
    const nombre = alm.vendedores.find((x) => x.id === id).nombre;
    const inv = await API.rpc('inventario_de', { p_vendedor: id });
    if (yo !== invN) return;
    const box = $('#vb', v);
    box.innerHTML = `<div class="card"><div class="card-head"><h2>Lo que trae ${esc(nombre)}</h2><a class="btn btn-sm btn-primary" href="#/entregar?v=${vendId}">+ Entregarle producto</a></div>
      ${tablaInventario(inv, { devolver: true })}</div>`;
    bindDevolver(box, id, nombre, load);
  };
  $$('#vch .ava-pick', v).forEach((b) => b.addEventListener('click', () => {
    vendId = b.dataset.v; $$('#vch .ava-pick', v).forEach((x) => x.classList.toggle('on', x === b)); load();
  }));
  await load();
};
