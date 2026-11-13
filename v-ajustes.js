/* =====================================================================
   PRECIOS (catálogo simplificado) y USUARIOS
   ===================================================================== */
const CFG_INFO = {
  comision_venta: ['🎁', 'Comisión por venta', 'Lo que gana el vendedor por cada venta (sin importar cuántos productos lleve). Se la queda al cobrar.'],
  envio_cobro_paqueteria: ['📦', 'Envío por paquetería (lo paga el cliente)', 'Siempre el mismo, vaya a donde vaya. Lo que cobra la paquetería se pone en cada municipio, abajo.'],
  envio_costo_paqueteria: ['🚚', 'Lo que cobra la paquetería', 'Se descuenta de cada venta por paquetería.'],
  envio_cobro_local: ['🛵', 'Envío local (lo paga el cliente)', 'Pon 0 si el envío local es gratis.'],
};

VIEWS['catalogo'] = async (v) => {
  const [cat, cfg0, muns] = await Promise.all([API.rpc('catalogo_admin'), API.rpc('config_lista'), API.rpc('municipios_lista', { p_todos: true })]);
  muns.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cfg = cfg0.filter((c) => c.clave !== 'envio_costo_paqueteria' && c.clave !== 'corte_dia_hora'); // lo que cobra la paquetería va por municipio
  const corte = cfg0.find((c) => c.clave === 'corte_dia_hora');
  v.innerHTML = `<div class="page-head"><div><h1>Precios</h1><div class="muted small">Cambia un precio y se guarda solo. Las ventas anteriores conservan su precio.</div></div>
      <div class="tools"><input type="search" id="buscar" placeholder="Buscar producto…" style="width:200px"><button class="btn" id="np">+ Producto nuevo</button></div></div>
    <div class="sec-t">⚙️ Reglas de cobro</div>
    <div class="cfg-grid">${cfg.map((c) => { const [e, t, d] = CFG_INFO[c.clave] || ['⚙️', c.nombre, '']; return `<label class="cfg">
      <span class="cfg-e">${e}</span><span class="cfg-t">${esc(t)}</span><span class="cfg-d">${esc(d)}</span>
      <span class="money-in"><span>$</span><input type="number" min="0" step="any" data-cfg="${c.clave}" value="${+c.valor}" inputmode="decimal"></span></label>`; }).join('')}</div>
    ${corte ? `<label class="cfg cfg-corte"><span class="cfg-e">🌙</span><span class="cfg-t">El día termina a las…</span>
      <span class="cfg-d">Lo que se registre después de medianoche y antes de esta hora cuenta para la noche anterior en reportes y cortes.</span>
      <select data-corte>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => `<option value="${h}" ${+corte.valor === h ? 'selected' : ''}>${h === 0 ? '12:00 a.m. (medianoche)' : `${h}:00 a.m.`}</option>`).join('')}</select></label>` : ''}
    <div class="sec-t">📍 Lo que cobra la paquetería según municipio <span class="muted small" style="font-weight:400">es lo que le pagamos a la paquetería · el cliente siempre paga la tarifa fija de arriba</span></div>
    <div class="mun-ed">${muns.map((m) => `<div class="mun-r ${m.activo ? '' : 'off'}" data-mid="${m.id}">
        <input class="mun-n" data-mf="nombre" value="${esc(m.nombre)}" aria-label="Municipio">
        <span class="money-in"><span>$</span><input type="number" min="0" step="any" data-mf="precio" value="${+m.precio}" inputmode="decimal"></span>
        <label class="chk small"><input type="checkbox" data-mf="activo" ${m.activo ? 'checked' : ''}> Activo</label></div>`).join('')}
      <button class="btn btn-sm" id="nmun">+ Municipio</button></div>
    <div class="sec-t">☕ Lista de precios</div>
    <div class="precios">${cat.map((p) => `<div class="card pr-card ${p.activo ? '' : 'inactivo'}" data-prod="${p.id}" data-busca="${esc((p.sku + ' ' + p.nombre).toLowerCase())}">
      <div class="pr-h"><span class="pcard-e">${EMO_CAT[p.categoria] || '📦'}</span><div><b>${esc(p.sku)}</b> ${p.activo ? '' : '<span class="badge b-err">Inactivo</span>'}<div class="small muted">${esc(p.nombre)}</div></div></div>
      <div class="pr-rows">${p.presentaciones.filter((pr) => pr.activo || !p.activo).map((pr) => pr.opciones.map((o) => `
        <div class="pr-row ${o.activo && pr.activo ? '' : 'off'}">
          <span>${esc(pr.nombre)}${o.piezas > 1 || o.nombre !== 'Pieza' ? ` <span class="muted">· ${esc(o.nombre)}</span>` : ''}${pr.promo_3x2 ? ' <span class="badge b-brand">3×2</span>' : ''}</span>
          <span class="money-in"><span>$</span><input type="number" step="any" min="0" value="${+o.precio}" data-op="${o.id}" inputmode="decimal"></span>
        </div>`).join('')).join('')}</div>
      <details class="mas"><summary>Más opciones</summary>
        <div class="row" style="align-items:end;margin-top:10px">
          <label class="field"><span>Nombre</span><input data-pf="nombre" value="${esc(p.nombre)}"></label>
          <label class="field"><span>Costo por ${esc(p.unidad_compra)}</span><input data-pf="costo_unidad" type="number" step="any" min="0" value="${+p.costo_unidad}"></label>
          <label class="chk"><input type="checkbox" data-pf="activo" ${p.activo ? 'checked' : ''}> Se vende</label>
          <button class="btn btn-sm" data-savep="${p.id}">Guardar</button>
        </div>
        ${p.presentaciones.map((pr) => `<div class="mas-pr">
          <b>${esc(pr.nombre)}</b>${pr.gramos ? ` <span class="small muted">${es14(pr.gramos) ? '35 pz = 500 g' : fnum(pr.gramos, 2) + ' g c/u'}</span>` : ''}
          <label class="chk small"><input type="checkbox" data-prf="activo" data-pr="${pr.id}" data-n="${esc(pr.nombre)}" ${pr.activo ? 'checked' : ''}> Activa</label>
          ${pr.opciones.length > 1 || pr.opciones.some((o) => !o.activo) ? pr.opciones.map((o) => `<label class="chk small"><input type="checkbox" data-opa="${o.id}" ${o.activo ? 'checked' : ''}> ${esc(o.nombre)}</label>`).join('') : ''}
          <button class="btn btn-sm btn-ghost" data-addop="${pr.id}">+ Paquete</button></div>`).join('')}
        ${p.modo === 'gramos' ? `<button class="btn btn-sm" data-addpr="${p.id}" style="margin-top:10px">+ Nueva presentación</button>` : ''}
      </details>
    </div>`).join('')}</div>`;

  const recargar = () => route();
  const guardado = (el) => { const w = el.closest('.money-in, .cfg, .chk') || el; w.classList.remove('ok'); void w.offsetWidth; w.classList.add('ok'); FX.add(); };
  $('#buscar', v).addEventListener('input', (e) => { const s = e.target.value.trim().toLowerCase(); $$('[data-prod]', v).forEach((c) => c.classList.toggle('hidden', s && !c.dataset.busca.includes(s))); });
  $$('[data-mf]', v).forEach((i) => i.addEventListener('change', () => {
    const r = i.closest('[data-mid]');
    const p = { id: r.dataset.mid, nombre: $('[data-mf=nombre]', r).value, precio: $('[data-mf=precio]', r).value, activo: $('[data-mf=activo]', r).checked };
    if (p.precio === '' || +p.precio < 0) { toast('Escribe un precio válido', true); return; }
    run(i, async () => { await API.rpc('guardar_municipio', { p }); r.classList.toggle('off', !p.activo); guardado(i); toast('Municipio guardado'); });
  }));
  $('#nmun', v).addEventListener('click', () => {
    modal(`<h2>Municipio nuevo</h2><form id="fmun"><div class="row"><label class="field"><span>Municipio</span><input name="nombre" required placeholder="Ej. Centro"></label>
      <label class="field"><span>Precio del envío</span><input name="precio" type="number" min="0" step="any" required inputmode="decimal"></label></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Agregar</button></div></form>`);
    const f = $('#fmun', dlg);
    f.addEventListener('submit', (e) => { e.preventDefault(); run(f.querySelector('.btn-primary'), async () => {
      await API.rpc('guardar_municipio', { p: { nombre: f.nombre.value, precio: f.precio.value } }); dlg.close(); toast('Municipio agregado'); recargar();
    }); });
  });
  $('[data-corte]', v)?.addEventListener('change', (e) => run(e.target, async () => { await API.rpc('guardar_config', { p_clave: 'corte_dia_hora', p_valor: +e.target.value }); CORTE_H = +e.target.value; guardado(e.target); toast('Guardado: el día termina a las ' + e.target.selectedOptions[0].textContent); }));
  $$('[data-cfg]', v).forEach((i) => i.addEventListener('change', () => run(i, async () => { await API.rpc('guardar_config', { p_clave: i.dataset.cfg, p_valor: +i.value }); guardado(i); toast('Guardado'); })));
  $$('[data-op]', v).forEach((i) => { i.dataset.prev = i.value; i.addEventListener('change', () => {
    if (i.value === '' || +i.value < 0) { i.value = i.dataset.prev; return toast('Escribe un precio válido', true); }
    run(i, async () => { await API.rpc('guardar_opcion', { p: { id: i.dataset.op, precio: +i.value } }); i.dataset.prev = i.value; guardado(i); toast('Precio guardado'); });
  }); });
  $$('[data-opa]', v).forEach((i) => i.addEventListener('change', () => run(i, async () => { await API.rpc('guardar_opcion', { p: { id: i.dataset.opa, activo: i.checked } }); guardado(i); })));
  $$('[data-prf]', v).forEach((i) => i.addEventListener('change', () => run(i, async () => {
    const id = i.dataset.pr;
    await API.rpc('guardar_presentacion', { p: { id, nombre: i.dataset.n, promo_3x2: false, activo: $(`[data-prf=activo][data-pr="${id}"]`, v).checked } });
    guardado(i);
  })));
  $$('[data-savep]', v).forEach((b) => b.addEventListener('click', async () => {
    const card = b.closest('[data-prod]');
    const p = cat.find((x) => x.id === +b.dataset.savep);
    await run(b, async () => {
      await API.rpc('guardar_producto', { p: { id: p.id, sku: p.sku, nombre: $('[data-pf=nombre]', card).value, costo_unidad: $('[data-pf=costo_unidad]', card).value, activo: $('[data-pf=activo]', card).checked } });
      toast('Producto guardado'); recargar();
    });
  }));
  $$('[data-addop]', v).forEach((b) => b.addEventListener('click', () => {
    modal(`<h2>Nuevo paquete</h2><div class="muted">Ej. "Paquete de 12" con 12 piezas a $1,000.</div>
      <form id="fop"><div class="row"><label class="field"><span>Nombre</span><input name="n" required placeholder="Paquete de 12"></label>
      <label class="field"><span>Piezas</span><input name="pz" type="number" min="1" step="1" value="1" required></label>
      <label class="field"><span>Precio</span><input name="pr" type="number" min="0" step="any" required></label></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Agregar</button></div></form>`);
    $('#fop', dlg).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await run($('.btn-primary', dlg), async () => {
        await API.rpc('guardar_opcion', { p: { presentacion_id: b.dataset.addop, nombre: f.n.value, piezas: f.pz.value, precio: f.pr.value } });
        dlg.close(); toast('Agregado'); recargar();
      });
    });
  }));
  $$('[data-addpr]', v).forEach((b) => b.addEventListener('click', () => {
    modal(`<h2>Nueva presentación</h2>
      <form id="fpr"><div class="row"><label class="field"><span>Nombre</span><input name="n" required placeholder="Ej. 250 g"></label>
      <label class="field"><span>Gramos por pieza</span><input name="g" type="number" min="0.1" step="any" required></label>
      <label class="field"><span>Precio por pieza</span><input name="pr" type="number" min="0" step="any" required></label></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Agregar</button></div></form>`);
    $('#fpr', dlg).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await run($('.btn-primary', dlg), async () => {
        const r = await API.rpc('guardar_presentacion', { p: { producto_id: b.dataset.addpr, nombre: f.n.value, gramos: f.g.value, promo_3x2: false } });
        await API.rpc('guardar_opcion', { p: { presentacion_id: r.id, nombre: 'Pieza', piezas: 1, precio: f.pr.value } });
        dlg.close(); toast('Presentación agregada'); recargar();
      });
    });
  }));
  $('#np', v).addEventListener('click', () => {
    modal(`<h2>Producto nuevo</h2>
      <form id="fnp">
        <div class="row"><label class="field"><span>Clave (SKU)</span><input name="sku" required placeholder="COF-X"></label>
        <label class="field"><span>Nombre</span><input name="nombre" required></label></div>
        <div class="row"><label class="field"><span>Categoría</span><select name="cat">${Object.entries(CAT).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
        <label class="field"><span>Se maneja por</span><select name="modo"><option value="gramos">Gramos (se produce en presentaciones)</option><option value="piezas">Piezas</option></select></label></div>
        <div class="row"><label class="field" data-g><span>Gramos por unidad de compra</span><input name="gpu" type="number" min="1" step="any" value="1000"><small>1000 = se compra por kilo</small></label>
        <label class="field"><span>Costo por unidad de compra</span><input name="costo" type="number" min="0" step="any" required></label></div>
        <div class="muted small">Después agrega sus presentaciones y precios en "Más opciones".</div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Crear</button></div>
      </form>`);
    const f = $('#fnp', dlg);
    f.modo.addEventListener('change', () => $('[data-g]', f).classList.toggle('hidden', f.modo.value === 'piezas'));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const gpu = +f.gpu.value;
      await run($('.btn-primary', f), async () => {
        await API.rpc('guardar_producto', { p: { sku: f.sku.value, nombre: f.nombre.value, categoria: f.cat.value, modo: f.modo.value,
          gramos_por_unidad: f.modo.value === 'gramos' ? gpu : null,
          unidad_compra: f.modo.value === 'piezas' ? 'pieza' : gpu === 1000 ? 'kg' : `bolsa ${gpu} g`, costo_unidad: f.costo.value } });
        dlg.close(); toast('Producto creado'); recargar();
      });
    });
  });
};

/* ---------- usuarios ---------- */
VIEWS['usuarios'] = async (v) => {
  const perfiles = await API.rpc('perfiles_lista');
  v.innerHTML = `<div class="page-head"><h1>Usuarios</h1></div>
    <div class="ugrid">${perfiles.map((p) => `<div class="card ucard" data-u="${p.id}">
      <div class="vcard-h"><span class="lado-ava">${avatar(p)}</span><div><b>${esc(p.nombre)}</b><div class="small muted"><code>${esc(p.usuario)}</code></div></div></div>
      <label class="field"><span>Nombre</span><input data-f="nombre" value="${esc(p.nombre)}"></label>
      <label class="field"><span>Qué puede hacer</span><select data-f="rol">
        <option value="vendedor" ${p.rol === 'vendedor' ? 'selected' : ''}>Vendedor (solo vende)</option>
        <option value="produccion" ${p.rol === 'produccion' ? 'selected' : ''}>Producción (stock y entregas)</option>
        <option value="admin" ${p.rol === 'admin' ? 'selected' : ''}>Administrador (todo)</option></select></label>
      <label class="chk small" data-vende ${p.rol === 'admin' ? '' : 'hidden'}><input type="checkbox" data-f="vende" ${p.vende ? 'checked' : ''}> 🛍️ También vende (aparece como vendedor)</label>
      <label class="chk small"><input type="checkbox" data-f="envio" ${p.envio_nacional ? 'checked' : ''}> 📦 Puede vender por paquetería</label>
      <label class="chk small"><input type="checkbox" data-f="activo" ${p.activo ? 'checked' : ''}> Activo (puede entrar)</label>
      <button class="btn btn-sm btn-primary" data-save>Guardar</button></div>`).join('')}</div>
    <div class="alert alert-info small">
      <b>Para crear un usuario nuevo:</b> en Supabase ve a <i>Authentication → Users → Add user → Create new user</i>.
      Correo: <code>nombre@${esc(C.dominioUsuarios)}</code>, su contraseña, y marca <i>Auto Confirm User</i>. Aparecerá aquí como vendedor y entra solo con <code>nombre</code> y su contraseña.</div>`;
  $$('[data-f=rol]', v).forEach((sel) => sel.addEventListener('change', () => {
    $('[data-vende]', sel.closest('[data-u]')).hidden = sel.value !== 'admin';
  }));
  $$('[data-save]', v).forEach((b) => b.addEventListener('click', async () => {
    const c = b.closest('[data-u]');
    await run(b, async () => {
      await API.rpc('actualizar_perfil', { p_id: c.dataset.u, p_nombre: $('[data-f=nombre]', c).value, p_rol: $('[data-f=rol]', c).value, p_activo: $('[data-f=activo]', c).checked, p_envio_nacional: $('[data-f=envio]', c).checked, p_vende: $('[data-f=rol]', c).value === 'admin' && $('[data-f=vende]', c).checked });
      FX.exito(); toast('Usuario guardado');
    });
  }));
};
