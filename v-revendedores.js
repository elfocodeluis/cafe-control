// Revendedores (solo administradores): ventas de mayoreo con precio especial y SIN comisión.
// La venta la hace un administrador con su propio inventario; el "cliente" es el revendedor.
VIEWS['revendedores'] = async (v) => {
  let datos = await API.rpc('revendedores_datos');
  const municipios = await API.rpc('municipios_lista').catch(() => []);
  municipios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  let admId = (datos.admins.find((a) => a.id === ME.id && +a.piezas > 0) || datos.admins.find((a) => +a.piezas > 0) || datos.admins[0])?.id;
  let cart = {}; // opcion_id -> cantidad
  let tipo = 'tienda', metodo = 'efectivo', munId = null, efMix = '';

  const adm = () => datos.admins.find((a) => a.id === admId);
  const invDe = (presId) => +(adm()?.inventario.find((i) => i.presentacion_id === presId)?.piezas || 0);
  const opDe = (id) => datos.catalogo.find((o) => o.opcion_id === +id);
  const usadas = (presId) => Object.entries(cart).reduce((s, [id, c]) => { const o = opDe(id); return s + (o.presentacion_id === presId ? c * o.piezas : 0); }, 0);
  const productos = () => Object.entries(cart).reduce((s, [id, c]) => s + c * +opDe(id).precio_revendedor, 0);
  const ahorro = () => Object.entries(cart).reduce((s, [id, c]) => s + c * (+opDe(id).precio - +opDe(id).precio_revendedor), 0);
  const mun = () => municipios.find((m) => m.id === munId);
  const envio = () => (tipo === 'paqueteria' ? +(mun()?.precio || 0) : tipo === 'local' ? +datos.envio_local : 0);
  const total = () => productos() + envio();

  v.innerHTML = `<div class="page-head"><div><span class="eyebrow">Solo administradores</span><h1>Revendedores</h1>
      <div class="muted small">Ventas con precio especial para revendedores · sin comisión</div></div></div>
    ${tabsHTML('rev', [['vender', 'Vender'], ['panel', 'Revendedores']], 'vender')}
    <div data-panel="rev:vender"><div class="rev-grid">
      <div class="rev-main">
        <div class="card"><div class="rev-paso"><b>1</b> ¿Qué administrador vende?</div><div class="pick-row" id="radm"></div></div>
        <div class="card"><div class="rev-paso"><b>2</b> Revendedor</div>
          <div class="rev-2col">
            <label class="field"><span>Nombre del revendedor</span><input id="rnom" list="rlist" autocomplete="off" maxlength="80" placeholder="Ej. Juan Pérez">
              <datalist id="rlist"></datalist></label>
            <label class="field"><span>Teléfono <i class="muted">(opcional)</i></span><input id="rtel" inputmode="tel" maxlength="20"></label>
          </div></div>
        <div class="card"><div class="rev-paso"><b>3</b> Productos <span class="muted small">· precio de revendedor</span></div><div id="rprod"></div></div>
        <div class="card"><div class="rev-paso"><b>4</b> Entrega y pago</div>
          <div class="field"><span>Entrega</span><div class="chips" id="rtipo">
            <button type="button" class="chip on" data-t="tienda">🏪 En tienda</button>
            <button type="button" class="chip" data-t="local">🛵 Envío local</button>
            <button type="button" class="chip" data-t="paqueteria">📦 Paquetería</button></div></div>
          <label class="field" id="rmun-w" hidden><span>Municipio de destino</span><select id="rmun"><option value="">Elige el municipio…</option>
            ${municipios.map((m) => `<option value="${m.id}">${esc(m.nombre)} · ${money0(m.precio)}</option>`).join('')}</select></label>
          <div class="field"><span>Pago</span><div class="chips" id="rmet">
            <button type="button" class="chip on" data-m="efectivo">💵 Efectivo</button>
            <button type="button" class="chip" data-m="transferencia">🏦 Transferencia</button>
            <button type="button" class="chip" data-m="mixto">🔀 Mixto</button></div></div>
          <label class="field" id="ref-w" hidden><span>¿Cuánto en efectivo?</span><input id="ref" type="number" min="0" step="any" inputmode="decimal"></label>
          <label class="field"><span>Nota <i class="muted">(opcional)</i></span><input id="rnota" maxlength="200"></label>
        </div>
      </div>
      <aside class="rev-side"><div class="card rev-res" id="rres"></div></aside>
    </div></div>
    <div data-panel="rev:panel" hidden>
      <div class="ana-head"><div><h1 style="font-size:20px">Panel de revendedores</h1><div class="muted small">Lo que compró cada revendedor en el periodo</div></div><div class="tools">${rangoHTML('mes')}</div></div>
      <div id="rpanel"></div>
    </div>`;

  const pintarAdmins = () => {
    $('#radm', v).innerHTML = datos.admins.map((a) => `<button type="button" class="pick ${a.id === admId ? 'on' : ''}" data-a="${a.id}">
      <span class="mini-ava">${avatar(a)}</span>${esc(a.nombre)}<small>${+a.piezas ? `${a.piezas} pz en inventario` : 'sin inventario'}</small></button>`).join('');
    $$('#radm .pick', v).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === admId) return;
      admId = b.dataset.a; cart = {}; FX.tap(); pintarAdmins(); pintarProductos(); pintarResumen();
    }));
  };

  const pintarRevendedores = () => {
    $('#rlist', v).innerHTML = datos.revendedores.map((r) => `<option value="${esc(r.nombre)}">`).join('');
  };

  const pintarProductos = () => {
    const box = $('#rprod', v);
    const pres = [...new Set(datos.catalogo.map((o) => o.presentacion_id))].filter((p) => invDe(p) > 0);
    if (!adm()) { box.innerHTML = '<div class="empty">No hay administradores activos</div>'; return; }
    if (!pres.length) { box.innerHTML = `<div class="empty">${esc(adm().nombre)} no tiene inventario. Entrégale producto desde "Producir y entregar" para venderlo aquí.</div>`; return; }
    box.innerHTML = `<div class="rev-prods">${pres.map((pid) => {
      const ops = datos.catalogo.filter((o) => o.presentacion_id === pid);
      const quedan = invDe(pid) - usadas(pid);
      return `<div class="rev-p"><div class="rev-p-h"><b>${esc(ops[0].descripcion)}</b><span class="muted small">quedan ${quedan} de ${invDe(pid)} pz</span></div>
        ${ops.map((o) => { const c = cart[o.opcion_id] || 0; const esp = +o.precio_revendedor < +o.precio; return `<div class="rev-op">
          <span>${o.piezas > 1 ? esc(o.opcion) : 'Pieza'} <span class="rev-precio">${esp ? `<s>${money0(o.precio)}</s> ` : ''}<b>${money0(o.precio_revendedor)}</b></span></span>
          <span class="rev-q"><button type="button" class="icon-btn" data-menos="${o.opcion_id}" ${c ? '' : 'disabled'} aria-label="Quitar">−</button><b>${c}</b>
          <button type="button" class="icon-btn" data-mas="${o.opcion_id}" ${quedan >= o.piezas ? '' : 'disabled'} aria-label="Agregar">+</button></span></div>`; }).join('')}</div>`;
    }).join('')}</div>`;
    $$('[data-mas]', box).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.mas; cart[id] = (cart[id] || 0) + 1; FX.add(); pintarProductos(); pintarResumen(); }));
    $$('[data-menos]', box).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.menos; cart[id] = Math.max(0, (cart[id] || 0) - 1); if (!cart[id]) delete cart[id]; FX.quitar(); pintarProductos(); pintarResumen(); }));
  };

  const pintarResumen = () => {
    const lineas = Object.entries(cart).map(([id, c]) => ({ o: opDe(id), c }));
    const ef = metodo === 'efectivo' ? total() : metodo === 'mixto' ? Math.min(total(), Math.max(0, +efMix || 0)) : 0;
    $('#rres', v).innerHTML = `<h2 style="margin:0 0 10px">Resumen</h2>
      ${lineas.length ? lineas.map(({ o, c }) => `<div class="bq-r"><span>${c}× ${esc(o.descripcion)}${o.piezas > 1 ? ' · ' + esc(o.opcion) : ''}</span><b>${money0(c * o.precio_revendedor)}</b></div>`).join('') : '<div class="muted small">Agrega productos</div>'}
      ${envio() ? `<div class="bq-r"><span>Envío ${tipo === 'paqueteria' ? `· ${esc(mun()?.nombre || '')}` : 'local'}</span><b>${money0(envio())}</b></div>` : ''}
      <div class="bq-r fin"><span>Total</span><b>${money0(total())}</b></div>
      ${ahorro() ? `<div class="rev-ahorro">El revendedor ahorra ${money0(ahorro())} vs. precio normal</div>` : ''}
      <div class="small muted" style="margin:8px 0 12px">Sin comisión · sale del inventario de ${esc(adm()?.nombre || '—')}${metodo !== 'efectivo' && total() ? ` · ${money0(total() - ef)} por transferencia (queda por verificar)` : ''}</div>
      <button type="button" class="btn btn-primary btn-block btn-lg" id="rcobrar" ${lineas.length ? '' : 'disabled'}>Registrar venta</button>`;
    $('#rcobrar', v).onclick = (e) => cobrar(e.currentTarget);
  };

  async function cobrar(btn) {
    const nombre = $('#rnom', v).value.trim();
    if (!nombre) { toast('Escribe el nombre del revendedor', true); $('#rnom', v).focus(); return; }
    if (tipo === 'paqueteria' && !munId) { toast('Elige el municipio de destino', true); return; }
    await run(btn, async () => {
      const r = await API.rpc('registrar_venta_revendedor', {
        p_admin: admId, p_revendedor: nombre, p_metodo: metodo,
        p_items: Object.entries(cart).map(([id, c]) => ({ opcion_id: +id, cantidad: c })),
        p_tipo: tipo, p_municipio: tipo === 'paqueteria' ? munId : null, p_telefono: $('#rtel', v).value.trim() || null,
        p_efectivo: metodo === 'mixto' ? +efMix || 0 : null, p_nota: $('#rnota', v).value.trim() || null,
      });
      FX.caja();
      toast(`Venta ${folio(r.venta_id)} a ${r.revendedor} · ${money0(r.total)}${+r.por_verificar ? ` · ${money0(r.por_verificar)} por verificar en Ventas` : ''}`);
      cart = {}; $('#rnom', v).value = ''; $('#rtel', v).value = ''; $('#rnota', v).value = '';
      datos = await API.rpc('revendedores_datos');
      pintarAdmins(); pintarRevendedores(); pintarProductos(); pintarResumen();
    });
  }

  // revendedor conocido: llena su teléfono
  $('#rnom', v).addEventListener('change', () => {
    const r = datos.revendedores.find((x) => x.nombre.toUpperCase() === $('#rnom', v).value.trim().toUpperCase());
    if (r && r.telefono && !$('#rtel', v).value) $('#rtel', v).value = r.telefono;
  });
  $$('#rtipo .chip', v).forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.t; $$('#rtipo .chip', v).forEach((x) => x.classList.toggle('on', x === b));
    $('#rmun-w', v).hidden = tipo !== 'paqueteria';
    if (tipo === 'paqueteria' && metodo !== 'transferencia') { metodo = 'transferencia'; $$('#rmet .chip', v).forEach((x) => x.classList.toggle('on', x.dataset.m === metodo)); $('#ref-w', v).hidden = true; }
    pintarResumen();
  }));
  $('#rmun', v).addEventListener('change', (e) => { munId = +e.target.value || null; pintarResumen(); });
  $$('#rmet .chip', v).forEach((b) => b.addEventListener('click', () => {
    if (tipo === 'paqueteria' && b.dataset.m !== 'transferencia') { toast('Las ventas por paquetería se pagan por transferencia', true); return; }
    metodo = b.dataset.m; $$('#rmet .chip', v).forEach((x) => x.classList.toggle('on', x === b));
    $('#ref-w', v).hidden = metodo !== 'mixto'; pintarResumen();
  }));
  $('#ref', v).addEventListener('input', (e) => { efMix = e.target.value; pintarResumen(); });

  /* ---------- panel por revendedor ---------- */
  let panel = [];
  const verRevendedor = (r) => {
    modal(`<h2>${esc(r.nombre)}</h2><div class="muted">${r.telefono ? esc(r.telefono) + ' · ' : ''}${r.compras} compra${r.compras === 1 ? '' : 's'} en el periodo</div>
      <div class="kpis" style="margin:14px 0">${kpi('Compró', money0(r.total))}${kpi('Piezas', r.piezas)}${kpi('Ahorro', money0(r.ahorro), 'vs. precio normal')}</div>
      ${r.ventas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Folio</th><th>Productos</th><th>Pago</th><th class="num">Total</th></tr></thead><tbody>
        ${r.ventas.map((x) => `<tr style="${x.anulada ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${folio(x.id)}<div class="small muted">${fecha(x.fecha)} · ${esc(x.admin)}</div></td>
          <td class="small">${(x.items || []).map((i) => `${i.cantidad}× ${esc(i.descripcion)} <span class="muted">${money0(i.precio_unit)}</span>`).join('<br>')}
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
