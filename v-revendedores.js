// Revendedores (solo administradores): ventas de mayoreo con precio especial y SIN comisión.
// Precio sugerido = costo de adquisición + $200 (se puede corregir a mano y aplicar un % de descuento).
// La venta la hace un administrador con su inventario; lo que le falte sale del almacén. El "cliente" es el revendedor.
VIEWS['revendedores'] = async (v) => {
  let datos = await API.rpc('revendedores_datos');
  const municipios = await API.rpc('municipios_lista').catch(() => []);
  municipios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  let admId = (datos.admins.find((a) => a.id === ME.id) || datos.admins.find((a) => +a.piezas > 0) || datos.admins[0])?.id;
  let cart = {};    // opcion_id -> cantidad
  let precios = {}; // opcion_id -> precio corregido a mano
  let descPct = '';
  let tipo = 'tienda', metodo = 'efectivo', munId = null, efMix = '';

  const adm = () => datos.admins.find((a) => a.id === admId);
  const invDe = (presId) => +(adm()?.inventario.find((i) => i.presentacion_id === presId)?.piezas || 0);
  const opDe = (id) => datos.catalogo.find((o) => o.opcion_id === +id);
  const usadas = (presId) => Object.entries(cart).reduce((s, [id, c]) => { const o = opDe(id); return s + (o.presentacion_id === presId ? c * o.piezas : 0); }, 0);
  const pu = (id) => (precios[id] !== undefined && precios[id] !== '' ? Math.max(0, +precios[id] || 0) : +opDe(id).precio_revendedor);
  const productos = () => Object.entries(cart).reduce((s, [id, c]) => s + c * pu(id), 0);
  const pct = () => Math.min(100, Math.max(0, +descPct || 0));
  const descuento = () => Math.round(productos() * pct()) / 100;
  const ahorro = () => Object.entries(cart).reduce((s, [id, c]) => s + c * (+opDe(id).precio - pu(id)), 0) + descuento();
  const mun = () => municipios.find((m) => m.id === munId);
  const envio = () => (tipo === 'paqueteria' ? +(mun()?.precio || 0) : tipo === 'local' ? +datos.envio_local : 0);
  const total = () => productos() - descuento() + envio();
  const costoVenta = () => Object.entries(cart).reduce((s, [id, c]) => s + c * +opDe(id).costo, 0);

  v.innerHTML = `<div class="page-head"><div><span class="eyebrow">Solo administradores</span><h1>Revendedores</h1>
      <div class="muted small">Precio de revendedor = costo + $200 · sin comisión</div></div></div>
    ${tabsHTML('rev', [['vender', 'Vender'], ['panel', 'Revendedores']], 'vender')}
    <div data-panel="rev:vender"><div class="rev-grid">
      <div class="rev-main">
        <div class="card"><div class="rev-paso"><b>1</b> ¿Qué administrador vende?</div><div class="pick-row" id="radm"></div>
          <div class="small muted" style="margin-top:8px">Sale de su inventario; si no trae suficiente, lo que falte sale del almacén.</div></div>
        <div class="card"><div class="rev-paso"><b>2</b> Revendedor</div>
          <div class="rev-2col">
            <label class="field"><span>Nombre del revendedor</span><input id="rnom" list="rlist" autocomplete="off" maxlength="80" placeholder="Ej. Juan Pérez">
              <datalist id="rlist"></datalist></label>
            <label class="field"><span>Teléfono <i class="muted">(opcional)</i></span><input id="rtel" inputmode="tel" maxlength="20"></label>
          </div></div>
        <div class="card"><div class="rev-paso"><b>3</b> Productos <span class="muted small">· precio de revendedor</span></div><div id="rprod"></div></div>
        <div class="card"><div class="rev-paso"><b>4</b> Entrega</div>
          <div class="chips" id="rtipo">
            <button type="button" class="chip on" data-t="tienda">🏪 En tienda</button>
            <button type="button" class="chip" data-t="local">🛵 Envío local</button>
            <button type="button" class="chip" data-t="paqueteria">📦 Paquetería</button></div>
          <label class="field" id="rmun-w" hidden style="margin-top:12px"><span>Municipio de destino</span><select id="rmun"><option value="">Elige el municipio…</option>
            ${municipios.map((m) => `<option value="${m.id}">${esc(m.nombre)} · ${money0(m.precio)}</option>`).join('')}</select></label>
          <label class="field" style="margin-top:12px"><span>Nota <i class="muted">(opcional)</i></span><input id="rnota" maxlength="200"></label>
        </div>
      </div>
      <aside class="rev-side"><div class="card rev-res">
        <h2 style="margin:0 0 10px">Resumen</h2>
        <div id="rlin"></div>
        <div class="rev-blk"><div class="rev-blk-h">🏷️ Descuento</div>
          <div class="rev-desc"><div class="chips" id="rdchips">${[0, 5, 10, 15, 20].map((p) => `<button type="button" class="chip ${p === 0 ? 'on' : ''}" data-d="${p}">${p ? p + '%' : 'Sin'}</button>`).join('')}</div>
            <label class="rev-pct"><input id="rdesc" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="0"><span>%</span></label></div></div>
        <div id="rtot"></div>
        <div class="rev-blk"><div class="rev-blk-h">💳 Pago</div>
          <div class="chips" id="rmet">
            <button type="button" class="chip on" data-m="efectivo">💵 Efectivo</button>
            <button type="button" class="chip" data-m="transferencia">🏦 Transferencia</button>
            <button type="button" class="chip" data-m="mixto">🔀 Mixto</button></div>
          <label class="field" id="ref-w" hidden style="margin-top:8px"><span>¿Cuánto en efectivo?</span><input id="ref" type="number" min="0" step="any" inputmode="decimal"></label></div>
        <div class="small muted" id="rnotas" style="margin:10px 0 12px"></div>
        <button type="button" class="btn btn-primary btn-block btn-lg" id="rcobrar" disabled>Registrar venta</button>
      </div></aside>
    </div></div>
    <div data-panel="rev:panel" hidden>
      <div class="ana-head"><div><h1 style="font-size:20px">Panel de revendedores</h1><div class="muted small">Lo que compró cada revendedor en el periodo</div></div><div class="tools">${rangoHTML('mes')}</div></div>
      <div id="rpanel"></div>
    </div>`;

  const pintarAdmins = () => {
    $('#radm', v).innerHTML = datos.admins.map((a) => `<button type="button" class="pick ${a.id === admId ? 'on' : ''}" data-a="${a.id}">
      <span class="mini-ava">${avatar(a)}</span>${esc(a.nombre)}<small>${+a.piezas ? `${a.piezas} pz en inventario` : 'vende del almacén'}</small></button>`).join('');
    $$('#radm .pick', v).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === admId) return;
      admId = b.dataset.a; cart = {}; precios = {}; FX.tap(); pintarAdmins(); pintarProductos(); pintarResumen();
    }));
  };

  const pintarRevendedores = () => {
    $('#rlist', v).innerHTML = datos.revendedores.map((r) => `<option value="${esc(r.nombre)}">`).join('');
  };

  const ORDEN_CAT = ['cafe', 'premium', 'capsula', 'capsula_vps', 'filtro', 'alimentos', 'otro'];
  let catSel = 'todos';
  const pintarProductos = () => {
    const box = $('#rprod', v);
    if (!adm()) { box.innerHTML = '<div class="empty">No hay administradores activos</div>'; return; }
    // existencias por presentación: lo que trae el administrador + lo que hay en almacén
    const disp = (pid) => invDe(pid) + +(datos.catalogo.find((o) => o.presentacion_id === pid)?.almacen || 0);
    const cats = ORDEN_CAT.filter((c) => datos.catalogo.some((o) => o.categoria === c))
      .concat([...new Set(datos.catalogo.map((o) => o.categoria))].filter((c) => !ORDEN_CAT.includes(c)));
    if (catSel !== 'todos' && !cats.includes(catSel)) catSel = 'todos';
    const enCarrito = (c) => Object.entries(cart).reduce((s, [id, n]) => s + (opDe(id).categoria === c ? n : 0), 0);
    const fila = (o) => {
      const pid = o.presentacion_id, c = cart[o.opcion_id] || 0, quedan = disp(pid) - usadas(pid);
      const esp = +o.precio_revendedor < +o.precio, trae = invDe(pid), alm = +o.almacen || 0;
      const nombre = o.presentacion === 'Pieza' ? (o.piezas > 1 ? o.opcion : 'Pieza') : o.presentacion + (o.piezas > 1 ? ` · ${o.opcion}` : '');
      return `<div class="rev-op ${disp(pid) <= 0 ? 'agotado' : ''}">
        <span class="rev-op-i"><b>${esc(nombre)}</b>
          <small class="muted">${disp(pid) <= 0 ? 'Sin existencias' : [trae ? `${esc(adm().nombre)} trae ${trae}` : '', alm ? `almacén ${alm}` : ''].filter(Boolean).join(' · ')}</small></span>
        <span class="rev-precio">${esp ? `<s>${money0(o.precio)}</s>` : ''}<b>${money0(o.precio_revendedor)}</b></span>
        <span class="rev-q"><button type="button" class="icon-btn" data-menos="${o.opcion_id}" ${c ? '' : 'disabled'} aria-label="Quitar">−</button><b>${c}</b>
          <button type="button" class="icon-btn" data-mas="${o.opcion_id}" ${quedan >= o.piezas ? '' : 'disabled'} aria-label="Agregar">+</button></span></div>`;
    };
    const seccion = (cat) => {
      const ops = datos.catalogo.filter((o) => o.categoria === cat);
      const skus = [...new Set(ops.map((o) => o.sku))];
      // primero los productos con existencias
      skus.sort((a, b) => (ops.some((o) => o.sku === b && disp(o.presentacion_id) > 0) ? 1 : 0) - (ops.some((o) => o.sku === a && disp(o.presentacion_id) > 0) ? 1 : 0));
      return `<section class="rev-cat"><h3>${CAT_ICO[cat] || '📦'} ${esc(CAT[cat] || cat)} <span class="muted small">${skus.length} ${skus.length === 1 ? 'producto' : 'productos'}</span></h3>
        <div class="rev-prods">${skus.map((sku) => {
          const mios = ops.filter((o) => o.sku === sku);
          const hay = mios.some((o) => disp(o.presentacion_id) > 0);
          return `<div class="rev-p ${hay ? '' : 'agotado'}"><div class="rev-p-h"><b>${esc(sku)}</b>${mios[0].producto && mios[0].producto !== sku ? `<span class="muted small">${esc(mios[0].producto)}</span>` : ''}</div>${mios.map(fila).join('')}</div>`;
        }).join('')}</div></section>`;
    };
    box.innerHTML = `<div class="chips rev-cats">${[['todos', 'Todos']].concat(cats.map((c) => [c, `${CAT_ICO[c] || '📦'} ${CAT[c] || c}`])).map(([k, l]) => {
        const n = k === 'todos' ? Object.values(cart).reduce((s, x) => s + x, 0) : enCarrito(k);
        return `<button type="button" class="chip ${catSel === k ? 'on' : ''}" data-cat="${k}">${l}${n ? ` <span class="badge b-brand">${n}</span>` : ''}</button>`; }).join('')}</div>
      ${(catSel === 'todos' ? cats : [catSel]).map(seccion).join('')}`;
    $$('[data-cat]', box).forEach((b) => b.addEventListener('click', () => { catSel = b.dataset.cat; FX.tap(); pintarProductos(); }));
    $$('[data-mas]', box).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.mas; cart[id] = (cart[id] || 0) + 1; FX.add(); pintarProductos(); pintarResumen(); }));
    $$('[data-menos]', box).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.menos; cart[id] = Math.max(0, (cart[id] || 0) - 1); if (!cart[id]) delete cart[id]; FX.quitar(); pintarProductos(); pintarResumen(); }));
  };

  // Resumen: líneas con precio editable; los totales se repintan solos sin perder el foco del campo
  const pintarTotales = () => {
    const ef = metodo === 'efectivo' ? total() : metodo === 'mixto' ? Math.min(total(), Math.max(0, +efMix || 0)) : 0;
    const bajo = Object.keys(cart).filter((id) => pu(id) < +opDe(id).costo);
    $('#rtot', v).innerHTML = `
      <div class="bq-r"><span>Productos</span><b>${money0(productos())}</b></div>
      ${descuento() ? `<div class="bq-r" style="color:var(--ok)"><span>Descuento ${pct()}%</span><b>−${money0(descuento())}</b></div>` : ''}
      ${envio() ? `<div class="bq-r"><span>Envío ${tipo === 'paqueteria' ? `· ${esc(mun()?.nombre || '')}` : 'local'}</span><b>${money0(envio())}</b></div>` : ''}
      <div class="bq-r fin"><span>Total</span><b>${money0(total())}</b></div>
      ${ahorro() > 0 ? `<div class="rev-ahorro">El revendedor ahorra ${money0(ahorro())} vs. precio al público</div>` : ''}
      ${Object.keys(cart).length ? `<div class="small muted" style="margin-top:6px">Ganancia: <b style="color:${total() - envio() - costoVenta() >= 0 ? 'var(--ok)' : 'var(--err)'}">${money0(total() - envio() - costoVenta())}</b> sobre un costo de ${money0(costoVenta())}</div>` : ''}
      ${bajo.length ? `<div class="small" style="color:var(--err);margin-top:6px">⚠️ ${bajo.map((id) => esc(opDe(id).descripcion)).join(', ')} queda abajo de su costo</div>` : ''}`;
    $('#rnotas', v).textContent = `Sin comisión · sale del inventario de ${adm()?.nombre || '—'} (lo que falte, del almacén)${metodo !== 'efectivo' && total() ? ` · ${money0(total() - ef)} por transferencia, queda por verificar` : ''}`;
    $('#rcobrar', v).disabled = !Object.keys(cart).length;
    Object.keys(cart).forEach((id) => { const el = $(`[data-sub="${id}"]`, v); if (el) el.textContent = money0(cart[id] * pu(id)); });
  };
  const pintarResumen = () => {
    const lineas = Object.entries(cart).map(([id, c]) => ({ id, o: opDe(id), c }));
    $('#rlin', v).innerHTML = lineas.length ? lineas.map(({ id, o, c }) => {
      const man = precios[id] !== undefined && precios[id] !== '';
      return `<div class="rev-lin"><div class="rev-lin-h"><span>${c}× ${esc(o.descripcion)}${o.piezas > 1 ? ' · ' + esc(o.opcion) : ''}</span><b data-sub="${id}">${money0(c * pu(id))}</b></div>
        <div class="rev-lin-p"><label class="rev-pu"><span>$</span><input type="number" min="0" step="any" inputmode="decimal" data-pu="${id}" value="${man ? esc(precios[id]) : +o.precio_revendedor}" aria-label="Precio por pieza"></label>
          <small class="muted">c/u · sugerido ${money0(o.precio_revendedor)}</small>${man ? `<button type="button" class="rev-reset" data-reset="${id}" title="Volver al precio sugerido">↺</button>` : ''}</div></div>`;
    }).join('') : '<div class="muted small" style="margin-bottom:10px">Agrega productos</div>';
    $$('[data-pu]', v).forEach((inp) => inp.addEventListener('input', () => {
      const id = inp.dataset.pu;
      precios[id] = inp.value;
      if (+inp.value === +opDe(id).precio_revendedor) delete precios[id];
      pintarTotales();
    }));
    $$('[data-pu]', v).forEach((inp) => inp.addEventListener('change', () => pintarResumen()));
    $$('[data-reset]', v).forEach((b) => b.addEventListener('click', () => { delete precios[b.dataset.reset]; FX.tap(); pintarResumen(); }));
    pintarTotales();
  };

  async function cobrar(btn) {
    const nombre = $('#rnom', v).value.trim();
    if (!nombre) { toast('Escribe el nombre del revendedor', true); $('#rnom', v).focus(); return; }
    if (tipo === 'paqueteria' && !munId) { toast('Elige el municipio de destino', true); return; }
    if (metodo === 'mixto' && !(+efMix > 0 && +efMix < total())) { toast(`Escribe cuánto paga en efectivo (menos de ${money0(total())})`, true); $('#ref', v).focus(); return; }
    await run(btn, async () => {
      const r = await API.rpc('registrar_venta_revendedor', {
        p_admin: admId, p_revendedor: nombre, p_metodo: metodo,
        p_items: Object.entries(cart).map(([id, c]) => ({ opcion_id: +id, cantidad: c, ...(precios[id] !== undefined && precios[id] !== '' ? { precio: pu(id) } : {}) })),
        p_tipo: tipo, p_municipio: tipo === 'paqueteria' ? munId : null, p_telefono: $('#rtel', v).value.trim() || null,
        p_efectivo: metodo === 'mixto' ? +efMix || 0 : null, p_nota: $('#rnota', v).value.trim() || null, p_descuento: pct(),
      });
      FX.caja();
      toast(`Venta ${folio(r.venta_id)} a ${r.revendedor} · ${money0(r.total)}${+r.por_verificar ? ` · ${money0(r.por_verificar)} por verificar en Ventas` : ''}`);
      cart = {}; precios = {}; descPct = ''; $('#rdesc', v).value = ''; $$('#rdchips .chip', v).forEach((x) => x.classList.toggle('on', x.dataset.d === '0'));
      $('#rnom', v).value = ''; $('#rtel', v).value = ''; $('#rnota', v).value = '';
      datos = await API.rpc('revendedores_datos');
      pintarAdmins(); pintarRevendedores(); pintarProductos(); pintarResumen();
    });
  }
  $('#rcobrar', v).addEventListener('click', (e) => cobrar(e.currentTarget));

  // revendedor conocido: llena su teléfono
  $('#rnom', v).addEventListener('change', () => {
    const r = datos.revendedores.find((x) => x.nombre.toUpperCase() === $('#rnom', v).value.trim().toUpperCase());
    if (r && r.telefono && !$('#rtel', v).value) $('#rtel', v).value = r.telefono;
  });
  const ponMetodo = (m) => { metodo = m; $$('#rmet .chip', v).forEach((x) => x.classList.toggle('on', x.dataset.m === m)); $('#ref-w', v).hidden = m !== 'mixto'; };
  $$('#rtipo .chip', v).forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.t; $$('#rtipo .chip', v).forEach((x) => x.classList.toggle('on', x === b));
    $('#rmun-w', v).hidden = tipo !== 'paqueteria';
    if (tipo === 'paqueteria' && metodo !== 'transferencia') ponMetodo('transferencia');
    pintarTotales();
  }));
  $('#rmun', v).addEventListener('change', (e) => { munId = +e.target.value || null; pintarTotales(); });
  $$('#rmet .chip', v).forEach((b) => b.addEventListener('click', () => {
    if (tipo === 'paqueteria' && b.dataset.m !== 'transferencia') { toast('Las ventas por paquetería se pagan por transferencia', true); return; }
    FX.tap(); ponMetodo(b.dataset.m); if (metodo === 'mixto') $('#ref', v).focus(); pintarTotales();
  }));
  $('#ref', v).addEventListener('input', (e) => { efMix = e.target.value; pintarTotales(); });
  $$('#rdchips .chip', v).forEach((b) => b.addEventListener('click', () => {
    descPct = b.dataset.d === '0' ? '' : b.dataset.d; $('#rdesc', v).value = descPct;
    $$('#rdchips .chip', v).forEach((x) => x.classList.toggle('on', x === b)); FX.tap(); pintarTotales();
  }));
  $('#rdesc', v).addEventListener('input', (e) => {
    descPct = e.target.value;
    $$('#rdchips .chip', v).forEach((x) => x.classList.toggle('on', x.dataset.d === String(+descPct || 0)));
    pintarTotales();
  });

  /* ---------- panel por revendedor ---------- */
  let panel = [];
  const verRevendedor = (r) => {
    modal(`<h2>${esc(r.nombre)}</h2><div class="muted">${r.telefono ? esc(r.telefono) + ' · ' : ''}${r.compras} compra${r.compras === 1 ? '' : 's'} en el periodo</div>
      <div class="kpis" style="margin:14px 0">${kpi('Compró', money0(r.total))}${kpi('Piezas', r.piezas)}${kpi('Ahorro', money0(r.ahorro), 'vs. precio normal')}</div>
      ${r.ventas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Folio</th><th>Productos</th><th>Pago</th><th class="num">Total</th></tr></thead><tbody>
        ${r.ventas.map((x) => `<tr style="${x.anulada ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${folio(x.id)}<div class="small muted">${fecha(x.fecha)} · ${esc(x.admin)}</div></td>
          <td class="small">${(x.items || []).map((i) => `${i.cantidad}× ${esc(i.descripcion)} <span class="muted">${money0(i.precio_unit)}</span>`).join('<br>')}
            ${+x.descuento ? `<div style="color:var(--ok)">Descuento −${money0(x.descuento)}</div>` : ''}
            ${x.tipo !== 'tienda' ? `<div class="muted">${x.tipo === 'paqueteria' ? '📦 ' + esc(x.municipio || '') : '🛵 Envío local'}</div>` : ''}</td>
          <td><span class="badge ${x.metodo === 'efectivo' ? 'b-ok' : 'b-info'}">${x.metodo === 'efectivo' ? 'Efectivo' : x.metodo === 'mixto' ? 'Mixto' : 'Transf.'}</span>${x.metodo !== 'efectivo' && !x.verificada && !x.anulada ? '<div class="small" style="color:var(--warn)">por verificar</div>' : ''}</td>
          <td class="num"><b>${money0(x.total)}</b></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Sin compras en este periodo</div>'}`, true);
  };
  const cargarPanel = async (rg) => {
    const box = $('#rpanel', v);
    const d = await API.rpc('revendedores_panel', { p_desde: rg.desde, p_hasta: rg.hasta });
    panel = d.revendedores;
    const activos = panel.filter((r) => r.compras > 0);
    const tot = activos.reduce((s, r) => s + +r.total, 0), pz = activos.reduce((s, r) => s + +r.piezas, 0), ah = activos.reduce((s, r) => s + +r.ahorro, 0);
    box.innerHTML = `<div class="kpis kpis-g4">${kpi('Vendido a revendedores', money0(tot), rg.etiqueta)}${kpi('Piezas', pz)}${kpi('Revendedores que compraron', activos.length, `de ${panel.length} registrados`)}${kpi('Descuento dado', money0(ah), 'vs. precio normal')}</div>
      ${panel.length ? `<div class="rev-cards">${panel.map((r, i) => `<button type="button" class="rev-card ${r.compras ? '' : 'sin'}" data-i="${i}">
        <span class="rev-ini">${esc(r.nombre.trim().slice(0, 1).toUpperCase())}</span>
        <span class="rev-info"><b>${esc(r.nombre)}</b><small>${r.compras ? `${r.compras} compra${r.compras === 1 ? '' : 's'} · ${r.piezas} pz` : 'sin compras en el periodo'}${r.ultima ? ` · última ${fecha(r.ultima)}` : ''}</small>
          ${+r.por_verificar ? `<small style="color:var(--warn)">${money0(r.por_verificar)} por verificar</small>` : ''}</span>
        <b class="rev-tot">${money0(r.total)}</b></button>`).join('')}</div>`
        : '<div class="empty">Todavía no hay revendedores. Se agregan solos al registrar su primera venta.</div>'}`;
    $$('.rev-card', box).forEach((b) => b.addEventListener('click', () => verRevendedor(panel[+b.dataset.i])));
  };
  const leer = bindRango($('[data-panel="rev:panel"]', v), (rg) => cargarPanel(rg).catch((e) => toast(e.message, true)));
  bindTabs(v, 'rev', { alCambiar: (k) => { if (k === 'panel') cargarPanel(leer()).catch((e) => toast(e.message, true)); } });

  pintarAdmins(); pintarRevendedores(); pintarProductos(); pintarResumen();
};
