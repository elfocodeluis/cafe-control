/* =====================================================================
   VENTAS — un solo panel: elegir vendedor → vender → pedidos → desempeño
   (el admin elige vendedor; el vendedor se ve solo a sí mismo)
   ===================================================================== */
VIEWS['ventas'] = async (v, q) => {
  const admin = ME.rol === 'admin';
  const [perfil, catalogo, vendedores] = await Promise.all([
    API.rpc('mi_perfil'),
    API.rpc('catalogo_venta'),
    admin ? API.rpc('almacen').then((a) => a.vendedores) : Promise.resolve([{ id: ME.id, nombre: ME.nombre, usuario: ME.usuario, envio_nacional: ME.envio_nacional }]),
  ]);
  if (!vendedores.length) {
    v.innerHTML = '<div class="page-head"><h1>Ventas</h1></div><div class="alert alert-warn">No hay vendedores activos. Créalos en Usuarios.</div>';
    return;
  }
  let clientes = [];
  API.rpc('clientes_lista').then((c) => { clientes = c; pintarClientes(); }).catch(() => {});

  // el admin que también vende arranca vendiendo como él mismo
  let vendId = admin ? (q.v || store.get('ventas.vend', '') || ME.id) : ME.id;
  if (!vendedores.some((x) => x.id === vendId)) vendId = (vendedores.find((x) => x.id === ME.id) || vendedores[0]).id;
  let verTodos = !!q.pend;
  let soloPend = !!q.pend;
  let promoHoy = perfil.dia_promo;
  const vend = () => vendedores.find((x) => x.id === vendId);

  // estado de la venta
  let inv = [];
  let cart = []; // {opcion_id, promo, cantidad}
  let tipo = 'local', metodo = '', ajuste = { modo: 'desc', valor: '' };
  let efMix = '', extra = '', extraAbierto = false; // pago mixto: cuánto en efectivo · extra (propina) por transferencia
  const hayTr = () => metodo === 'transferencia' || metodo === 'mixto';
  const extraN = () => (hayTr() ? Math.max(0, +extra || 0) : 0);
  const extraSub = () => (extraN() ? `es ${admin ? `de ${esc(vend().nombre)}` : 'tuyo'} · no cuenta como venta` : 'Toca si el cliente te transfirió propina o servicio');
  const efectivoN = (t) => (metodo === 'efectivo' ? t : metodo === 'mixto' ? Math.max(0, +efMix || 0) : 0);
  const puedePaq = () => !!vend()?.envio_nacional;
  const envio = () => (tipo === 'paqueteria' ? +perfil.envio_cobro_paqueteria : tipo === 'local' ? +perfil.envio_cobro_local : 0);
  const opDe = (id) => catalogo.find((o) => o.opcion_id === +id);
  const invDe = (presId) => inv.find((i) => i.presentacion_id === presId)?.piezas || 0;
  const piezasLinea = (l) => { const o = opDe(l.opcion_id); return l.promo ? 3 * l.cantidad : l.cantidad * o.piezas; };
  const subLinea = (l) => { const o = opDe(l.opcion_id); return l.promo ? 2 * l.cantidad * o.precio : l.cantidad * o.precio; };
  const usadas = (presId) => cart.reduce((s, l) => s + (opDe(l.opcion_id).presentacion_id === presId ? piezasLinea(l) : 0), 0);
  const productos = () => cart.reduce((s, l) => s + subLinea(l), 0);
  const descuento = () => {
    if (!admin || ajuste.valor === '') return 0;
    const val = +ajuste.valor || 0;
    const d = ajuste.modo === 'desc' ? val : productos() + envio() - val;
    return Math.max(0, Math.min(productos(), Math.round(d * 100) / 100));
  };
  const total = () => productos() - descuento() + envio();

  v.innerHTML = `
    <div class="page-head"><div><h1>${admin ? 'Ventas' : 'Vender'}</h1><div class="muted small">${fechaDia(new Date().toISOString())}</div></div>
      <div class="tools">${rangoHTML('hoy')}</div></div>
    ${promoHoy ? '<div class="promo-banner"><span class="promo-tag">3×2</span> Hoy hay promoción en piezas de 14 g de café (B-GUM, TROP-M y AFG-HZ): se llevan 3 y pagan 2.</div>' : ''}
    ${admin ? `<div class="ava-row" id="avas">${vendedores.map((x) => `
      <button type="button" class="ava-pick ${x.id === vendId ? 'on' : ''}" data-v="${x.id}">
        <span class="ava-wrap">${avatar(x)}</span>
        <span class="ava-name">${esc(x.nombre)}</span>
        <span class="ava-sub" data-sub="${x.id}">&nbsp;</span>
      </button>`).join('')}</div>` : ''}
    ${tabsHTML('ventas', [['vender', 'Vender'], ['pedidos', 'Pedidos'], ['tablero', 'Tablero'], ['inv', 'Inventario'], ...(admin ? [['equipo', 'Equipo']] : [])], q.pend ? 'pedidos' : 'vender')}
    <div data-panel="ventas:vender"><div class="ventas-grid">
      <div class="card venta-card" id="nueva"></div>
      <div id="lado"></div>
    </div></div>
    <div data-panel="ventas:pedidos" hidden><div class="card" id="pedidos"></div></div>
    <div data-panel="ventas:tablero" hidden><div id="dash"></div></div>
    <div data-panel="ventas:inv" hidden><div class="card"><div class="card-head"><h2>Inventario</h2><span class="muted small" id="invsum"></span></div><div id="invbody"></div></div></div>
    ${admin ? '<div data-panel="ventas:equipo" hidden><div id="desemp"></div></div>' : ''}`;
  const irTab = bindTabs(v, 'ventas', { recordar: !q.pend });
  if (q.pend) irTab('pedidos', false);

  let leer;
  let panel = [];

  /* ---------- nueva venta ---------- */
  let limpiarForm = false;
  function pintarNueva() {
    const box = $('#nueva', v);
    const keep = limpiarForm ? [] : ['cliente', 'telefono', 'nota'].map((id) => [id, $('#' + id, v)?.value || '']);
    limpiarForm = false;
    if (tipo === 'paqueteria' && !puedePaq()) tipo = 'local';
    if (tipo === 'paqueteria') metodo = 'transferencia';
    const hayStock = inv.some((i) => i.piezas > 0);
    box.innerHTML = `
      <div class="card-head"><h2>Nueva venta${admin ? ` · <span class="brand-t">${esc(vend().nombre)}</span>` : ''}</h2>
        ${cart.length ? '<button type="button" class="btn btn-sm" id="vaciar">Empezar de nuevo</button>' : ''}</div>
      ${!hayStock ? `<div class="alert alert-warn">${admin ? `${esc(vend().nombre)} no tiene piezas. Entrégale producto en <a href="#/entregar?v=${vendId}">Producir y entregar</a>.` : 'No tienes piezas para vender. Pide producto en "Pedir producto".'}</div>` : ''}
      <div class="paso"><div class="paso-n">1</div><div class="paso-b"><div class="paso-t">¿Cómo se entrega?</div>
        <div class="tiles tiles-3" id="tipos">
          ${[['tienda', '🏪', 'En tienda', 'Sin cargo'], ['local', '🛵', 'Envío local', 'Sin cargo'], ['paqueteria', '📦', 'Paquetería', `+${money0(perfil.envio_cobro_paqueteria)} · solo transferencia`]].map(([k, e, t, s]) => {
            const lock = k === 'paqueteria' && !puedePaq();
            return `<button type="button" class="tile ${tipo === k ? 'on' : ''}" data-t="${k}" ${lock ? 'disabled' : ''}>
              <span class="tile-e">${e}</span><span class="tile-t">${t}</span><span class="tile-s">${lock ? `${admin ? 'Actívalo en Usuarios' : 'No habilitado'}` : s}</span></button>`;
          }).join('')}
        </div></div></div>
      <div class="paso"><div class="paso-n">2</div><div class="paso-b"><div class="paso-t">¿Qué se lleva? <span class="muted small" style="font-weight:400">${admin ? `stock de ${esc(vend().nombre)}` : 'tu stock'} · toca para agregar</span></div>
        <div class="pk" id="prods">${stockTiles() || '<div class="empty">Sin piezas para vender</div>'}</div>
        <div id="carrito" class="cesta"></div>
      </div></div>
      <div class="paso"><div class="paso-n">3</div><div class="paso-b"><div class="paso-t">Cliente y pago</div>
        <div class="row">
          <label class="field"><span>Nombre del cliente</span><input id="cliente" list="dl-clientes" placeholder="Ej. Tienda Lupita" autocomplete="off"><datalist id="dl-clientes"></datalist></label>
          <label class="field"><span>Teléfono <i class="muted">(opcional)</i></span><input id="telefono" type="tel" inputmode="tel" placeholder="10 dígitos"></label>
        </div>
        <div class="tiles tiles-3" id="metodos" style="margin-top:12px">
          <button type="button" class="tile ${metodo === 'efectivo' ? 'on' : ''}" data-m="efectivo" ${tipo === 'paqueteria' ? 'disabled' : ''}><span class="tile-e">💵</span><span class="tile-t">Efectivo</span><span class="tile-s">${tipo === 'paqueteria' ? 'No aplica en paquetería' : 'Se cobra en mano'}</span></button>
          <button type="button" class="tile ${metodo === 'transferencia' ? 'on' : ''}" data-m="transferencia"><span class="tile-e">🏦</span><span class="tile-t">Transferencia</span><span class="tile-s">Se verifica en el banco</span></button>
          <button type="button" class="tile ${metodo === 'mixto' ? 'on' : ''}" data-m="mixto" ${tipo === 'paqueteria' ? 'disabled' : ''}><span class="tile-e">🔀</span><span class="tile-t">Mixto</span><span class="tile-s">${tipo === 'paqueteria' ? 'No aplica en paquetería' : 'Parte y parte'}</span></button>
        </div>
        <div class="row ${metodo === 'mixto' ? '' : 'hidden'}" id="mixbox" style="margin-top:12px">
          <label class="field"><span>💵 ¿Cuánto pagó en efectivo?</span><input id="efmix" type="number" min="1" step="any" inputmode="decimal" placeholder="Ej. 200" value="${esc(efMix)}"></label>
          <div class="field"><span>🏦 El resto por transferencia</span><div class="mix-resto" id="mixresto">—</div></div>
        </div>
        <div class="${hayTr() ? '' : 'hidden'}" id="trbox">
          <button type="button" class="extra-btn ${extraN() ? 'on' : ''}" id="extrabtn" aria-expanded="${extraAbierto || !!extraN()}">
            <span class="extra-e">🎁</span>
            <span class="extra-t"><b>Servicio extra transferido</b><small id="extrasub">${extraSub()}</small></span>
            <span class="extra-v" id="extraval">${extraN() ? '+' + money0(extraN()) : '+'}</span>
          </button>
          <div class="extra-box ${extraAbierto || extraN() ? '' : 'hidden'}" id="extrabox">
            <label class="field"><span>¿Cuánto te transfirieron de servicio extra?</span>
              <input id="extra" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 100" value="${esc(extra)}"></label>
            <div class="extra-chips">${[50, 100, 150, 200].map((n) => `<button type="button" class="chip" data-ex="${n}">${money0(n)}</button>`).join('')}<button type="button" class="chip" data-ex="0">Quitar</button></div>
          </div>
        </div>
        ${admin ? `<details class="ajuste" ${ajuste.valor !== '' ? 'open' : ''}><summary>Descuento o precio especial <span class="badge b-brand">solo admin</span></summary>
          <div class="inline" style="margin-top:10px"><div class="seg seg-sm" id="ajm"><button type="button" data-a="desc" class="${ajuste.modo === 'desc' ? 'on' : ''}">Descuento $</button><button type="button" data-a="final" class="${ajuste.modo === 'final' ? 'on' : ''}">Precio final $</button></div>
          <input id="ajv" type="number" min="0" step="any" inputmode="decimal" value="${esc(ajuste.valor)}" style="max-width:160px" placeholder="0"></div></details>` : ''}
        <details class="ajuste"><summary>Agregar nota</summary><input id="nota" style="margin-top:10px" placeholder="Ej. entregar después de las 5"></details>
      </div></div>
      <div class="cobrar">
        <div><div class="muted small">Total a cobrar</div><div class="big" id="vtotal">$0</div><div class="small muted" id="vdesg"></div></div>
        <button class="btn btn-primary btn-lg" id="vguardar" type="button">Cobrar</button>
      </div>`;

    keep.forEach(([id, val]) => { const el = $('#' + id, box); if (el && val) el.value = val; });
    $$('#tipos .tile', box).forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.t; pintarNueva(); }));
    $$('#metodos .tile', box).forEach((b) => b.addEventListener('click', () => {
      metodo = b.dataset.m; $$('#metodos .tile', box).forEach((x) => x.classList.toggle('on', x === b));
      $('#mixbox', box).classList.toggle('hidden', metodo !== 'mixto'); $('#trbox', box).classList.toggle('hidden', !hayTr());
      if (metodo === 'mixto') $('#efmix', box).focus();
      totales();
    }));
    $('#efmix', box).addEventListener('input', (e) => { efMix = e.target.value; totales(); });
    const pintaExtra = () => {
      $('#extrabtn', box).classList.toggle('on', !!extraN());
      $('#extraval', box).textContent = extraN() ? '+' + money0(extraN()) : '+';
      $('#extrasub', box).innerHTML = extraSub();
      totales();
    };
    $('#extrabtn', box).addEventListener('click', () => {
      extraAbierto = $('#extrabox', box).classList.toggle('hidden') === false;
      $('#extrabtn', box).setAttribute('aria-expanded', extraAbierto);
      if (extraAbierto) $('#extra', box).focus();
    });
    $('#extra', box).addEventListener('input', (e) => { extra = e.target.value; pintaExtra(); });
    $$('[data-ex]', box).forEach((b) => b.addEventListener('click', () => {
      extra = +b.dataset.ex ? b.dataset.ex : ''; $('#extra', box).value = extra; FX.tap();
      if (!extra) { extraAbierto = false; $('#extrabox', box).classList.add('hidden'); }
      pintaExtra();
    }));
    bindArrastre($('#prods', box));
    $('#vaciar', box)?.addEventListener('click', () => { cart = []; ajuste.valor = ''; pintarNueva(); });
    $$('#ajm button', box).forEach((b) => b.addEventListener('click', () => { ajuste.modo = b.dataset.a; $$('#ajm button', box).forEach((x) => x.classList.toggle('on', x === b)); totales(); }));
    $('#ajv', box)?.addEventListener('input', (e) => { ajuste.valor = e.target.value; totales(); });
    $('#vguardar', box).addEventListener('click', cobrar);
    pintarClientes();
    pintarCarrito();
  }

  function pintarClientes() {
    const dl = $('#dl-clientes', v);
    if (dl) dl.innerHTML = clientes.slice(0, 200).map((c) => `<option value="${esc(c.nombre)}">${c.telefono ? esc(c.telefono) + ' · ' : ''}${c.compras} compras</option>`).join('');
    const ci = $('#cliente', v);
    if (ci && !ci.dataset.b) {
      ci.dataset.b = 1;
      ci.addEventListener('change', () => { const c = clientes.find((x) => x.nombre.toLowerCase() === ci.value.trim().toLowerCase()); if (c?.telefono && !$('#telefono', v).value) $('#telefono', v).value = c.telefono; });
    }
  }

  /* ---------- stock del vendedor en cuadritos: se arrastran al carrito ---------- */
  const ICO_CAT = CAT_ICO;
  const opsDe = (presId) => catalogo.filter((o) => o.presentacion_id === presId).sort((a, b) => a.piezas - b.piezas);
  const quedan = (presId) => invDe(presId) - usadas(presId);
  const necesita = (o, promo) => (promo ? 3 : o.piezas);
  const nomOp = (o) => (o.piezas > 1 ? o.opcion.replace('Paquete de ', 'Paq ') : o.presentacion);
  // Productos agrupados: categoría → producto → presentaciones (botones grandes: gramos, precio, cuántas quedan)
  function tileHTML(i) {
    const ops = opsDe(i.presentacion_id);
    const def = ops.find((o) => o.piezas === 1) || ops[0];
    const tiene3x2 = def.promo_3x2 && def.piezas === 1;
    const otras = ops.filter((o) => o !== def);
    const q = quedan(i.presentacion_id);
    const chips = [
      ...otras.map((o) => `<button type="button" class="stk-c" data-op="${o.opcion_id}" title="Se lleva ${o.piezas} piezas"><b>${esc(nomOp(o))}</b><span>${o.piezas} pz · ${money0(o.precio)}</span></button>`),
      tiene3x2 ? `<button type="button" class="stk-c promo" data-op="${def.opcion_id}" data-promo="1" ${promoHoy ? '' : 'data-off="1" disabled'} title="${promoHoy ? 'Se lleva 3 piezas y paga 2' : 'La promoción 3×2 solo aplica viernes, sábado y domingo'}"><b>3×2</b><span>${promoHoy ? `3 pz · ${money0(def.precio * 2)}` : 'vie–dom'}</span></button>` : '',
    ].join('');
    const tam = def.piezas > 1 ? nomOp(def) : i.presentacion === 'Pieza' ? '1 pieza' : i.presentacion;
    return `<div class="stk-w">
      <div class="stk stk-${i.categoria || 'cafe'} ${q < def.piezas ? 'agotado' : ''}" data-op="${def.opcion_id}" data-pres="${i.presentacion_id}" role="button" tabindex="0" aria-label="Agregar ${esc(i.producto)} ${esc(tam)}, ${money0(def.precio)}">
        <span class="stk-g">${esc(tam)}</span>
        <span class="stk-pr">${money0(def.precio)}</span>
        <span class="stk-q"><b data-n>${q}</b> ${q === 1 ? 'queda' : 'quedan'}</span>
      </div>
      ${chips ? `<div class="stk-cs">${chips}</div>` : ''}
    </div>`;
  }
  function stockTiles() {
    const items = inv.filter((i) => i.piezas > 0 && opsDe(i.presentacion_id).length);
    if (!items.length) return '';
    const cats = [];
    items.forEach((i) => {
      const ck = i.categoria || 'cafe';
      let c = cats.find((x) => x.k === ck); if (!c) cats.push(c = { k: ck, prods: [] });
      let pr = c.prods.find((x) => x.sku === i.sku); if (!pr) c.prods.push(pr = { sku: i.sku, nombre: i.producto || i.sku, items: [] });
      pr.items.push(i);
    });
    return cats.map((c) => `<section class="pk-cat">
      ${cats.length > 1 ? `<div class="pk-cat-h">${ICO_CAT[c.k] || '☕'} ${esc(CAT[c.k] || c.k)}</div>` : ''}
      ${c.prods.map((pr) => `<div class="pk-prod stk-${c.k}">
        <div class="pk-prod-h"><span class="pk-ico">${ICO_CAT[c.k] || '☕'}</span><b>${esc(pr.nombre)}</b></div>
        <div class="pk-row">${pr.items.map(tileHTML).join('')}</div>
      </div>`).join('')}
    </section>`).join('');
  }
  function bindArrastre(zona) {
    if (!zona) return;
    let st = null; let nocl = false;
    const fin = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); window.removeEventListener('pointercancel', cancelar); document.body.classList.remove('arrastrando'); $('#carrito', v)?.classList.remove('sobre'); };
    const sobreCesta = (x, y) => { const c = $('#carrito', v); if (!c) return false; const r = c.getBoundingClientRect(); return x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; };
    function mover(e) {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.g) {
        if (Math.hypot(dx, dy) < 7) return;
        const r = st.el.getBoundingClientRect();
        const g = document.createElement('div');
        g.className = 'stk-ghost'; g.innerHTML = st.label;
        g.style.left = `${e.clientX}px`; g.style.top = `${e.clientY}px`;
        document.body.appendChild(g); st.g = g; st.r = r;
        document.body.classList.add('arrastrando'); st.el.classList.add('levantado'); FX.tap();
      }
      st.g.style.left = `${e.clientX}px`; st.g.style.top = `${e.clientY}px`;
      $('#carrito', v)?.classList.toggle('sobre', sobreCesta(e.clientX, e.clientY));
    }
    function soltar(e) {
      if (!st) return;
      const s0 = st; st = null; fin();
      s0.el.classList.remove('levantado');
      if (!s0.g) return;
      nocl = true; setTimeout(() => { nocl = false; }, 50);
      if (sobreCesta(e.clientX, e.clientY)) { const r = s0.g.getBoundingClientRect(); s0.g.remove(); agregar(+s0.op, s0.promo, s0.tile, r); }
      else { s0.g.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { left: `${s0.r.left + s0.r.width / 2}px`, top: `${s0.r.top + s0.r.height / 2}px`, transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }], { duration: 260, easing: 'ease-in' }).onfinish = () => s0.g.remove(); }
    }
    function cancelar() { if (st?.g) st.g.remove(); st?.el.classList.remove('levantado'); st = null; fin(); }
    zona.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch') return; // en el celular: tocar agrega
      const el = e.target.closest('.stk-c') || e.target.closest('.stk');
      if (!el || el.disabled || el.classList.contains('agotado')) return;
      const tile = el.closest('.stk-w')?.querySelector('.stk');
      const o = opDe(el.dataset.op); const promo = !!el.dataset.promo;
      if (quedan(o.presentacion_id) < necesita(o, promo)) return;
      e.preventDefault();
      st = { x: e.clientX, y: e.clientY, el, tile, op: el.dataset.op, promo, label: `<b>${esc(o.sku)}</b><span>${promo ? '3×2 · 3 pz' : o.piezas > 1 ? `${esc(nomOp(o))} · ${o.piezas} pz` : esc(o.presentacion)}</span>` };
      window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar); window.addEventListener('pointercancel', cancelar);
    });
    zona.addEventListener('click', (e) => {
      if (nocl) return;
      const el = e.target.closest('.stk-c') || e.target.closest('.stk');
      if (!el || el.disabled) return;
      const tile = el.closest('.stk-w')?.querySelector('.stk');
      if (tile.classList.contains('agotado') && el === tile) return;
      agregar(+el.dataset.op, !!el.dataset.promo, tile, el.getBoundingClientRect());
    });
    zona.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('stk')) { e.preventDefault(); e.target.click(); } });
  }
  // la pieza vuela del cuadrito al carrito
  function volar(desde, html) {
    const ico = $('#cesta-ico', v);
    if (!ico || !desde) return;
    const r = ico.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'stk-fly'; f.innerHTML = html;
    f.style.left = `${desde.left + desde.width / 2}px`; f.style.top = `${desde.top + desde.height / 2}px`;
    document.body.appendChild(f);
    const tx = r.left + r.width / 2 - (desde.left + desde.width / 2), ty = r.top + r.height / 2 - (desde.top + desde.height / 2);
    f.animate([
      { transform: 'translate(-50%,-50%) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx * 0.5}px), calc(-50% + ${ty * 0.5 - 60}px)) scale(.9) rotate(-12deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.25) rotate(8deg)`, opacity: 0.6 },
    ], { duration: 520, easing: 'cubic-bezier(.5,0,.6,1)' }).onfinish = () => {
      f.remove(); FX.cesta();
      const c = $('#cesta-ico', v); c?.classList.remove('trago'); void c?.offsetWidth; c?.classList.add('trago');
    };
  }
  function agregar(opId, promo, tile, desde) {
    const o = opDe(opId);
    const nuevo = necesita(o, promo);
    if (usadas(o.presentacion_id) + nuevo > invDe(o.presentacion_id)) { FX.error(); tile?.classList.add('niega'); setTimeout(() => tile?.classList.remove('niega'), 400); return toast(`No hay más piezas de ${o.descripcion}`, true); }
    const l = cart.find((x) => x.opcion_id === opId && x.promo === promo);
    if (l) l.cantidad++; else cart.push({ opcion_id: opId, promo, cantidad: 1 });
    FX.add();
    if (tile) {
      const n = $('[data-n]', tile); n?.classList.remove('bump'); void n?.offsetWidth; n?.classList.add('bump');
      const m = document.createElement('span'); m.className = 'stk-menos'; m.textContent = `−${nuevo}`; tile.appendChild(m); setTimeout(() => m.remove(), 700);
    }
    volar(desde, `<b>${esc(o.sku)}</b><span>${promo ? '3×2 · 3 pz' : o.piezas > 1 ? `${esc(nomOp(o))} · ${o.piezas} pz` : esc(o.presentacion)}</span>`);
    refrescarOps();
    pintarCarrito();
  }
  function refrescarOps() {
    $$('.stk', v).forEach((t) => {
      const pres = +t.dataset.pres;
      const q = quedan(pres);
      $('[data-n]', t).textContent = q;
      t.classList.toggle('agotado', q < opDe(t.dataset.op).piezas);
      $$('.stk-c', t.closest('.stk-w')).forEach((c) => { c.disabled = !!c.dataset.off || q < necesita(opDe(c.dataset.op), !!c.dataset.promo); });
    });
  }
  function pintarCarrito() {
    const box = $('#carrito', v);
    const pz = cart.reduce((s, l) => s + piezasLinea(l), 0);
    box.classList.toggle('llena', !!cart.length);
    box.innerHTML = `<div class="cesta-h"><span class="cesta-ico" id="cesta-ico">🛒${pz ? `<i>${pz}</i>` : ''}</span>
        <div><b>Carrito</b><div class="small muted">${cart.length ? `${pz} ${pz === 1 ? 'pieza' : 'piezas'} · ${money0(productos())}` : 'Toca un producto para agregarlo'}</div></div></div>
      ${cart.length ? `<div class="cart">${cart.map((l, i) => {
      const o = opDe(l.opcion_id);
      return `<div class="cart-l pop">
        <div class="cart-d"><b>${esc(o.descripcion)}${o.piezas > 1 ? ' · ' + esc(o.opcion) : ''}</b>${l.promo ? ' <span class="badge b-brand">3×2</span>' : ''}
          <div class="small muted">${piezasLinea(l)} pz${l.promo ? ` (${l.cantidad} gratis)` : ''}</div></div>
        <div class="qty"><button type="button" data-q="-1" data-i="${i}" aria-label="Menos">−</button><span>${l.cantidad}</span><button type="button" data-q="1" data-i="${i}" aria-label="Más">+</button></div>
        <b class="cart-s">${money0(subLinea(l))}</b></div>`;
    }).join('')}</div>` : ''}`;
    $$('[data-q]', box).forEach((b) => b.addEventListener('click', () => {
      const l = cart[+b.dataset.i];
      if (+b.dataset.q > 0) { agregar(l.opcion_id, l.promo, $(`.stk[data-pres="${opDe(l.opcion_id).presentacion_id}"]`, v)); return; }
      l.cantidad--; if (l.cantidad <= 0) cart.splice(+b.dataset.i, 1);
      FX.tap(); refrescarOps(); pintarCarrito();
    }));
    totales();
  }
  function totales() {
    const t = total(), d = descuento(), env = envio();
    const el = $('#vtotal', v);
    if (!el) return;
    el.textContent = money0(t);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const com = cart.length ? +perfil.comision_venta : 0;
    const paq = tipo === 'paqueteria' ? +perfil.envio_cobro_paqueteria : 0;
    const partes = [`Productos ${money0(productos())}`];
    if (env) partes.push(`envío +${money0(env)}`);
    if (d) partes.push(`descuento −${money0(d)}`);
    const quien = admin ? esc(vend().nombre) : 'tú';
    const ef = efectivoN(t), ex = extraN(), tr = t - ef, ret = Math.min(com, ef), debe = com - ret + ex;
    const mr = $('#mixresto', v);
    if (mr) mr.innerHTML = metodo !== 'mixto' ? '—' : ef > 0 && ef < t ? `<b>${money0(tr)}</b>` : `<span style="color:var(--warn)">el efectivo debe ser menor a ${money0(t)}</span>`;
    const partesPago = [];
    if (ef > 0) partesPago.push(admin ? `💵 ${quien} se queda ${money0(ret)} de comisión y <b>trae ${money0(ef - ret)}</b>` : `💵 te quedas ${money0(ret)} de comisión y <b>traes ${money0(ef - ret)}</b>`);
    if (tr + ex > 0) partesPago.push(`🏦 <b>entran ${money0(tr + ex)} al banco</b>${ex ? ` (${money0(ex)} de extra)` : ''}`);
    const deQue = com - ret > 0 && ex ? ' (comisión + extra)' : ex ? ' (el extra)' : ' de comisión';
    if (debe > 0 && hayTr()) partesPago.push(admin ? `se le deben ${money0(debe)}${deQue} a ${quien}` : `se te deben ${money0(debe)}${deQue}`);
    if (paq && hayTr()) partesPago.push(`${money0(paq)} a la paquetería`);
    const linea2 = !cart.length ? '' : !metodo ? `Comisión ${admin ? `de ${quien}` : ''} ${money0(com)}${paq ? ` · paquetería ${money0(paq)}` : ''} · elige cómo paga` : partesPago.join(' · ');
    $('#vdesg', v).innerHTML = partes.join(' · ') + (linea2 ? `<br>${linea2}` : '');
    $('#vguardar', v).textContent = cart.length ? `Cobrar ${money0(t)}${extraN() ? ` +${money0(extraN())}` : ''}` : 'Cobrar';
  }

  async function cobrar(e) {
    const btn = e.currentTarget;
    const cliente = $('#cliente', v).value.trim();
    if (!cart.length) return toast('Agrega al menos un producto', true);
    if (!cliente) { $('#cliente', v).focus(); return toast('Escribe el nombre del cliente', true); }
    if (!metodo) return toast('Elige efectivo, transferencia o mixto', true);
    // en este navegador se entró con otra cuenta en otra pestaña: no registrar a nombre equivocado
    if (await API.usuarioId().catch(() => ME.id) !== ME.id) {
      toast('En este navegador se abrió otra cuenta. Recargando…', true);
      return setTimeout(() => location.reload(), 1500);
    }
    const t = total();
    const ef = efectivoN(t), ex = extraN();
    if (metodo === 'mixto' && !(ef > 0 && ef < t)) { $('#efmix', v).focus(); return toast(`Escribe cuánto pagó en efectivo (menos de ${money0(t)})`, true); }
    let verificarYa = false;
    if (hayTr()) {
      const r = await alertaTransferencia(t - ef + ex, cliente, ex);
      if (!r) return;
      verificarYa = r === 'verificada';
    }
    let r = null;
    await run(btn, async () => {
      r = await API.rpc('registrar_venta', {
        p_cliente: cliente, p_metodo: metodo, p_vendedor: admin ? vendId : null, p_tipo: tipo,
        p_items: cart.map((l) => ({ opcion_id: l.opcion_id, cantidad: l.cantidad, promo: l.promo })),
        p_nota: $('#nota', v).value || null, p_telefono: $('#telefono', v).value || null,
        p_descuento: descuento(),
        p_efectivo: metodo === 'mixto' ? ef : null, p_extra: ex,
      });
    });
    if (!r) return; // no se registró: el carrito sigue igual para intentar de nuevo
    // la venta ya existe: se limpia el carrito pase lo que pase con la verificación
    const eraTransf = hayTr();
    cart = []; metodo = ''; ajuste.valor = ''; tipo = 'local'; limpiarForm = true; efMix = ''; extra = ''; extraAbierto = false;
    let verifOk = !verificarYa;
    if (verificarYa) {
      try { await API.rpc('verificar_transferencia', { p_venta: r.venta_id, p_verificada: true }); verifOk = true; }
      catch { toast(`Venta ${folio(r.venta_id)} registrada, pero no se pudo marcar verificada. Verifícala en Pedidos.`, true); }
    }
    FX.fiesta();
    if (verifOk) toast(`Venta ${folio(r.venta_id)} registrada: ${money(r.total)}${eraTransf && !verificarYa ? ' · transferencia por verificar' : ''}`);
    API.rpc('clientes_lista').then((c) => { clientes = c; }).catch(() => {});
    await cargarTodo();
  }

  function alertaTransferencia(monto, cliente, ex = 0) {
    return new Promise((resolve) => {
      modal(`<div class="seg-alert"><div class="seg-ico">🔒</div>
        <h2>Verifica la transferencia</h2>
        <p>Abre tu <b>banca móvil</b> y confirma que llegó la transferencia de <b>${money(monto)}</b> de <b>${esc(cliente)}</b>.</p>
        ${ex ? `<p class="small">Incluye <b>${money(ex)}</b> de extra (propina / servicio) para ${admin ? esc(vend().nombre) : 'ti'}.</p>` : ''}
        <ul class="small muted"><li>No te fíes de capturas de pantalla: revisa el movimiento en tu banco.</li><li>Confirma el monto exacto y el nombre de quien envía.</li>
        ${admin ? '' : '<li>El administrador la marcará como verificada al revisarla.</li>'}</ul>
        <label class="chk big-chk"><input type="checkbox" id="vchk"> ${admin ? 'Ya la vi reflejada en el banco' : 'Revisé el comprobante con el cliente'}</label></div>
        <div class="modal-actions">
          <button class="btn" data-r="no">Regresar</button>
          ${admin ? '<button class="btn" data-r="despues">Registrar, verificar después</button>' : ''}
          <button class="btn btn-primary" data-r="si" disabled>${admin ? 'Registrar y marcar verificada' : 'Registrar venta'}</button></div>`);
      FX.tap();
      let fin = false;
      const done = (x) => { if (fin) return; fin = true; dlg.close(); resolve(x); };
      $('#vchk', dlg).addEventListener('change', (e) => { $('[data-r=si]', dlg).disabled = !e.target.checked; });
      $('[data-r=no]', dlg).onclick = () => done(null);
      $('[data-r=despues]', dlg)?.addEventListener('click', () => done('despues'));
      $('[data-r=si]', dlg).onclick = () => done(admin ? 'verificada' : 'ok');
      dlg.addEventListener('close', () => done(null), { once: true });
    });
  }

  /* ---------- lado derecho: cómo va el vendedor ---------- */
  function pintarLado(r) {
    const p = panel.find((x) => x.vendedor_id === vendId);
    const box = $('#lado', v);
    if (!p) { box.innerHTML = ''; return; }
    const ue = p.ultima_entrega;
    const pctUe = ue && ue.piezas ? Math.min(100, (ue.vendidas / ue.piezas) * 100) : 0;
    box.innerHTML = `<div class="card lado-card">
      <div class="lado-head"><span class="lado-ava">${avatar(p)}</span><div><div class="muted small">${esc(r.etiqueta)}</div><h2 style="margin:0">${esc(p.nombre)}</h2></div></div>
      <div class="hero-n">${cuenta(p.total)}</div>
      <div class="muted small">${p.num} ${p.num === 1 ? 'venta' : 'ventas'} · ${fnum(p.piezas)} piezas${p.paqueteria ? ` · ${p.paqueteria} por paquetería` : ''}</div>
      <div style="margin:14px 0 4px">${barra2(p.efectivo, p.transferencia)}</div>
      <div class="mini-kpis">
        <div class="mk"><span class="mk-l">${admin ? 'Trae en efectivo' : 'Efectivo por entregar'}</span><b>${money0(p.en_poder)}</b><span class="mk-s">ya sin su comisión</span></div>
        <div class="mk ${+p.comision_pendiente ? 'warn' : ''}"><span class="mk-l">Comisión ganada</span><b>${money0(p.comision)}</b><span class="mk-s">${+p.comision_pendiente ? `le debemos ${money0(p.comision_pendiente)}${+p.extra ? ' (con extras)' : ''}` : 'pagada ✓'}</span></div>
        ${+p.extra ? `<div class="mk"><span class="mk-l">🎁 Extras (propinas)</span><b>${money0(p.extra)}</b><span class="mk-s">${p.extra_num} ${p.extra_num == 1 ? 'venta' : 'ventas'} · son suyos</span></div>` : ''}
        <div class="mk ${+p.transf_pendiente ? 'warn' : ''}"><span class="mk-l">Transf. por verificar</span><b>${money0(p.transf_pendiente)}</b><span class="mk-s">${+p.transf_pendiente ? 'revisar en el banco' : 'todo en orden'}</span></div>
        <div class="mk"><span class="mk-l">Le quedan</span><b>${fnum(p.inventario)} pz</b><span class="mk-s">valen ${money0(p.inventario_valor)}</span></div>
      </div>
      ${p.top ? `<div class="top-p">⭐ Lo que más vende: <b>${esc(p.top.descripcion)}</b> <span class="muted">(${fnum(p.top.piezas)} pz)</span></div>` : ''}
      ${ue ? `<div class="ue"><div class="small"><b>Última entrega</b> · ${fecha(ue.fecha)}</div>
        <div class="bar bar-lg"><i style="width:${pctUe}%"></i></div>
        <div class="small muted">Vendió ${fnum(ue.vendidas)} de ${fnum(ue.piezas)} piezas entregadas</div></div>` : ''}
      ${admin ? `<div class="inline" style="margin-top:14px"><a class="btn btn-sm" href="#/entregar?v=${vendId}">+ Entregarle producto</a>${+p.en_poder > 0 ? `<a class="btn btn-sm" href="#/caja?op=deposito&v=${vendId}">Registrar depósito</a>` : ''}${+p.comision_pendiente ? `<a class="btn btn-sm" href="#/caja?op=pago_comision&v=${vendId}">Pagar comisión${+p.extra ? ' y extras' : ''}</a>` : ''}</div>` : ''}
    </div>`;
    animarNumeros(box);
  }

  /* ---------- pedidos ---------- */
  async function pintarPedidos(r) {
    const box = $('#pedidos', v);
    const ventas = await API.rpc('ventas_de', { p_desde: r.desde, p_hasta: r.hasta, p_vendedor: admin && !verTodos ? vendId : null, p_pendientes: soloPend });
    const t = totalesVentas(ventas);
    const tb = $('[data-tab="pedidos"]', v);
    if (tb) tb.innerHTML = `Pedidos${t.num ? ` <span class="tab-n">${t.num}</span>` : ''}`;
    box.innerHTML = `<div class="card-head"><h2>Pedidos <span class="muted small">${soloPend ? 'por verificar' : esc(r.etiqueta)}</span></h2>
      <div class="inline">${admin ? `<div class="seg seg-sm" id="ptodos"><button type="button" data-t="0" class="${verTodos ? '' : 'on'}">De ${esc(vend().nombre)}</button><button type="button" data-t="1" class="${verTodos ? 'on' : ''}">Todos</button></div>
        <label class="chk small"><input type="checkbox" id="ppend" ${soloPend ? 'checked' : ''}> Solo por verificar</label>` : ''}
        <input id="pbus" type="search" placeholder="Buscar cliente o folio" style="width:190px;min-height:34px;padding:6px 10px"></div></div>
      ${ventas.length ? `<div class="ped-tot small muted">${t.num} pedidos · <b>${money(t.total)}</b> · efectivo ${money0(t.efectivo)} · transferencia ${money0(t.transferencia)}${t.extra ? ` · <span class="badge b-extra">🎁 ${money0(t.extra)} de extras en ${t.extraNum} ${t.extraNum === 1 ? 'venta' : 'ventas'}</span>` : ''}${t.pendiente ? ` · <span style="color:var(--warn)">${money0(t.pendiente)} por verificar</span>` : ''}</div>
      <div class="tbl-wrap"><table class="tbl ped"><thead><tr><th>Hora</th><th>Folio</th><th>Cliente</th><th>Producto</th><th class="num">Pz</th><th class="num">Total</th><th>Pago</th><th>Entrega</th><th></th></tr></thead><tbody>
      ${ventas.map((x) => {
        const pz = (x.items || []).reduce((s, i) => s + i.piezas, 0);
        const esTr = pagoTr(x) > 0;
        return `<tr class="${x.anulada ? 'anul' : ''}${+x.extra && !x.anulada ? ' con-extra' : ''}" data-busca="${esc((x.cliente + ' ' + folio(x.id) + ' ' + (x.telefono || '')).toLowerCase())}">
          <td class="small">${r.hoy ? hora(x.fecha) : fecha(x.fecha)}</td>
          <td><button type="button" class="link" data-ver="${x.id}">${folio(x.id)}</button></td>
          <td><b>${esc(x.cliente)}</b>${x.telefono ? `<div class="small muted">${esc(x.telefono)}</div>` : ''}${verTodos && admin ? `<div class="small muted">${esc(x.vendedor)}</div>` : ''}</td>
          <td class="small">${(x.items || []).map((i) => `${i.cantidad}× ${esc(i.descripcion)}`).join('<br>')}</td>
          <td class="num">${pz}</td>
          <td class="num"><b>${money0(x.total)}</b>${+x.descuento ? `<div class="small muted">−${money0(x.descuento)}</div>` : ''}</td>
          <td>${pagoBadges(x, false)}${x.metodo === 'mixto' && !x.anulada ? `<div class="small muted">💵 ${money0(x.pago_efectivo)} · 🏦 ${money0(x.pago_transfer)}</div>` : ''}</td>
          <td><span class="badge ${x.tipo === 'paqueteria' ? 'b-brand' : ''}">${TIPOS_VENTA[x.tipo]}</span></td>
          <td class="actions">${admin && !x.anulada && esTr ? `<label class="chk small" title="Verificada en el banco (${money0(pagoTr(x))})"><input type="checkbox" data-verif="${x.id}" ${x.verificada ? 'checked' : ''}> ok</label>` : ''}
            ${puedeCambiarPago(x, admin) ? `<button class="btn btn-sm btn-ghost" data-cpago="${x.id}" title="Cambiar cómo pagó">💱</button>` : ''}
            ${admin && !x.anulada ? `<button class="btn btn-sm btn-ghost" data-anular="${x.id}" title="Cancelar venta">✕</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : `<div class="empty">${soloPend ? 'No hay transferencias por verificar 🎉' : 'Aún no hay pedidos en este periodo'}</div>`}`;
    $$('#ptodos button', box).forEach((b) => b.addEventListener('click', () => { verTodos = b.dataset.t === '1'; pintarPedidos(leer()); }));
    $('#ppend', box)?.addEventListener('change', (e) => { soloPend = e.target.checked; if (soloPend) verTodos = true; pintarPedidos(leer()); });
    $('#pbus', box).addEventListener('input', (e) => { const s = e.target.value.trim().toLowerCase(); $$('tbody tr', box).forEach((tr) => tr.classList.toggle('hidden', s && !tr.dataset.busca.includes(s))); });
    $$('[data-ver]', box).forEach((b) => b.addEventListener('click', () => {
      const x = ventas.find((y) => y.id === +b.dataset.ver);
      modal(`<h2>Pedido ${folio(x.id)}</h2>${ventaHTML(x, admin)}`, true);
      bindVerificar(dlg, () => { dlg.close(); cargarTodo(); });
      bindAnular(dlg, cargarTodo);
      bindCambiarPago(dlg, ventas, admin, cargarTodo);
    }));
    bindVerificar(box, cargarTodo);
    bindAnular(box, cargarTodo);
    bindCambiarPago(box, ventas, admin, cargarTodo);
  }

  /* ---------- desempeño (admin) ---------- */
  function pintarDesemp(r) {
    const box = $('#desemp', v);
    if (!box) return;
    const top = panel.filter((p) => +p.total > 0)[0];
    box.innerHTML = `<div class="card"><div class="card-head"><h2>¿Cómo van? <span class="muted small">${esc(r.etiqueta)}</span></h2></div>
      <div class="cmp">${panel.map((p) => `<div class="cmp-i ${top && p.vendedor_id === top.vendedor_id ? 'lider' : ''}">
        ${top && p.vendedor_id === top.vendedor_id ? '<span class="corona" title="Vende más">👑</span>' : ''}
        <span class="cmp-ava">${avatar(p)}</span><b>${esc(p.nombre)}</b>
        <div class="cmp-n">${money0(p.total)}</div><div class="small muted">${p.num} venta${p.num == 1 ? '' : 's'} · ${fnum(p.piezas)} pz</div>
        ${barra2(p.efectivo, p.transferencia, 'Ef.', 'Tr.')}
        <div class="cmp-r"><span>Trae efectivo</span><b>${money0(p.en_poder)}</b></div>
        <div class="cmp-r"><span>Transf. por verificar</span><b>${money0(p.transf_pendiente)}</b></div>
        <div class="cmp-r"><span>Comisión</span><b>${money0(p.comision)}</b></div>
        <div class="cmp-r"><span>🎁 Extras</span><b>${+p.extra ? `${money0(p.extra)} <span class="muted small">(${p.extra_num})</span>` : '—'}</b></div>
        ${+p.comision_pendiente ? `<div class="cmp-r"><span>Le debemos</span><b style="color:var(--warn)">${money0(p.comision_pendiente)}</b></div>` : ''}
        <div class="cmp-r"><span>Top</span><b>${p.top ? esc(p.top.descripcion) : '—'}</b></div>
        <div class="cmp-r"><span>Le quedan</span><b>${fnum(p.inventario)} pz</b></div>
      </div>`).join('')}</div></div>`;
  }

  function pintarInventario() {
    const nombre = vend().nombre;
    $('#invsum', v).textContent = `${fnum(inv.reduce((s, i) => s + i.piezas, 0))} piezas · ${money0(inv.reduce((s, i) => s + +i.valor_publico, 0))} al público`;
    const box = $('#invbody', v);
    box.innerHTML = tablaInventario(inv, { admin, devolver: admin });
    bindDevolver(box, vendId, nombre, cargarTodo);
  }

  let cargaN = 0;
  async function cargarTodo() {
    const yo = ++cargaN, id = vendId;
    const r = leer();
    const [inv2, panel2, perf2] = await Promise.all([
      API.rpc('inventario_de', { p_vendedor: admin ? id : null }),
      API.rpc('ventas_panel', { p_desde: r.desde, p_hasta: r.hasta }),
      API.rpc('mi_perfil').catch(() => perfil),
    ]);
    if (yo !== cargaN || id !== vendId) return; // ya se pidió otra cosa: esta respuesta es vieja
    inv = inv2; panel = panel2;
    promoHoy = perf2.dia_promo; // si cambia el día (domingo → lunes) el 3×2 se apaga solo
    if (admin) panel.forEach((p) => { const s = $(`[data-sub="${p.vendedor_id}"]`, v); if (s) s.textContent = `${money0(p.total)} · ${p.num} venta${p.num == 1 ? '' : 's'}`; });
    pintarNueva();
    pintarLado(r);
    pintarDesemp(r);
    pintarInventario();
    tableroVendedor($('#dash', v), { vendId, r, p: panel.find((x) => x.vendedor_id === vendId), inv, admin, recargar: cargarTodo, vigente: () => yo === cargaN }).catch((e) => console.error(e));
    await pintarPedidos(r);
  }

  $$('#avas .ava-pick', v).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.v === vendId) return;
    vendId = b.dataset.v; store.set('ventas.vend', vendId);
    cart = []; ajuste.valor = ''; tipo = 'local'; metodo = ''; efMix = ''; extra = ''; extraAbierto = false;
    $$('#avas .ava-pick', v).forEach((x) => x.classList.toggle('on', x === b));
    cargarTodo();
  }));
  leer = bindRango(v, () => cargarTodo());
  await cargarTodo();
};

/* =====================================================================
   MI PANEL (vendedor)
   ===================================================================== */
VIEWS['inicio'] = async (v) => {
  const now = new Date();
  const rh = rangoHoy();
  const [perfil, inv, ventas, panel, sols] = await Promise.all([
    API.rpc('mi_perfil'), API.rpc('inventario_de'),
    API.rpc('ventas_de', { p_desde: rh.desde, p_hasta: rh.hasta }),
    API.rpc('ventas_panel', { p_desde: rh.desde, p_hasta: rh.hasta }),
    API.rpc('solicitudes_lista'),
  ]);
  const t = totalesVentas(ventas);
  const p = panel[0] || {};
  const valor = inv.reduce((s, i) => s + +i.valor_publico, 0);
  v.innerHTML = `
    <div class="hola card"><span class="hola-ava">${avatar(perfil)}</span>
      <div><h1>¡Hola, ${esc(perfil.nombre)}!</h1><div class="muted">${fechaDia(now.toISOString())}</div></div>
      <a class="btn btn-primary btn-lg" href="#/ventas">+ Nueva venta</a></div>
    ${perfil.dia_promo ? '<div class="promo-banner"><span class="promo-tag">3×2</span> Hoy aplica la promoción en piezas de 14 g de café (B-GUM, TROP-M y AFG-HZ).</div>' : ''}
    <div class="kpis">
      ${kpi('Vendí hoy', cuenta(t.total), `${t.num} venta${t.num == 1 ? '' : 's'} · ${fnum(t.piezas)} pz`, 'hl')}
      ${kpi('Mi comisión', cuenta(t.comision), +p.comision_pendiente ? `me deben ${money0(p.comision_pendiente)}${t.extra ? ' (con extras)' : ' de transferencias'}` : `${money0(perfil.comision_venta)} por venta · todo pagado ✓`, +p.comision_pendiente ? 'warn' : '')}
      ${kpi('Efectivo que traigo', cuenta(p.en_poder || 0), 'ya sin mi comisión · hasta depositarlo al banco')}
      ${kpi('Transferencias', cuenta(t.transferencia), t.pendiente ? `${money0(t.pendiente)} por verificar` : 'todo verificado')}
    </div>
    ${+p.comision_pendiente ? `<div class="card pp-vend"><div><b>🎁 Te debemos ${money0(p.comision_pendiente)} de comisiones y extras</b>
      <div class="small muted">Son comisiones de ventas por transferencia y extras (propinas) que cayeron al banco. Puedes tomarlas del efectivo que traes${+p.en_poder > 0 ? ` (traes ${money0(p.en_poder)})` : ''}, o te las pagan del banco.</div></div>
      ${+p.en_poder > 0 ? `<button class="btn btn-primary" id="tomar">Tomar ${money0(Math.min(+p.comision_pendiente, +p.en_poder))} de mi efectivo</button>` : ''}</div>` : ''}
    ${sols.length ? `<div class="alert alert-warn">Tienes ${sols.length} ${sols.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} con producción · <a href="#/pedir">ver</a></div>` : ''}
    <div id="dash"></div>
    <details class="card fold"><summary><h2 style="display:inline">Lo que traigo (tabla)</h2> <span class="muted small">Valor al público: <b>${money(valor)}</b></span></summary>
      ${tablaInventario(inv)}<div style="margin-top:10px"><a class="btn btn-sm" href="#/pedir">Pedir más</a></div></details>
    <div class="card"><div class="card-head"><h2>Mis ventas de hoy</h2></div>
      ${ventas.length ? ventas.map((x) => ventaHTML(x, false)).join('') : '<div class="empty">Aún no hay ventas hoy. ¡A vender! ☕</div>'}</div>`;
  bindCambiarPago(v, ventas, false, route);
  animarNumeros(v);
  tableroVendedor($('#dash', v), { vendId: perfil.id, r: rh, p: { ...p, nombre: perfil.nombre, usuario: perfil.usuario }, inv, admin: false, recargar: route }).catch((e) => console.error(e));
  $('#tomar', v)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const m = Math.min(+p.comision_pendiente, +p.en_poder);
    if (!(await confirmar('Tomar mi comisión', `Tomas ${money0(m)} del efectivo que traes como pago de tus comisiones y extras. Ya no se te deberán.`, 'Tomar'))) return;
    await run(btn, async () => { await API.rpc('tomar_comision', { p_monto: m }); FX.caja(); toast('Listo, comisión cobrada'); route(); });
  });
};

/* ---------- pedir producto (vendedor) ---------- */
VIEWS['pedir'] = async (v) => {
  const [catalogo, pend, todas] = await Promise.all([API.rpc('catalogo_venta'), API.rpc('solicitudes_lista'), API.rpc('solicitudes_lista', { p_estado: null })]);
  const pres = [];
  catalogo.forEach((o) => { if (!pres.some((p) => p.presentacion_id === o.presentacion_id)) pres.push(o); });
  const grupos = {};
  pres.forEach((o) => (grupos[o.producto] ||= []).push(o));
  const hist = todas.filter((s) => s.estado !== 'pendiente');
  v.innerHTML = `<div class="page-head"><h1>Pedir producto</h1></div>
    <form class="card" id="fped">
      <div class="muted" style="margin-bottom:14px">Avisa a producción qué te hace falta. Te lo preparan y te llega a tu inventario.</div>
      <div class="row">
        <label class="field"><span>Producto</span><select name="p" required><option value="">Elige…</option>
          ${Object.entries(grupos).map(([g, ops]) => `<optgroup label="${esc(g)}">${ops.map((o) => `<option value="${o.presentacion_id}">${esc(o.descripcion)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="field"><span>Piezas</span><input name="n" type="number" min="1" step="1" required inputmode="numeric"></label>
      </div>
      <label class="field" style="margin-top:12px"><span>Nota (opcional)</span><input name="nota" placeholder="Ej. lo necesito para el viernes"></label>
      <button class="btn btn-primary" style="margin-top:14px">Enviar solicitud</button>
    </form>
    <div class="card"><h2>Pendientes</h2>${pend.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>
      ${pend.map((s) => `<tr><td><b>${esc(s.descripcion)}</b><div class="small muted">${fecha(s.fecha)}${s.nota ? ' · ' + esc(s.nota) : ''}</div></td><td class="num">${s.piezas} pz</td>
        <td class="actions"><button class="btn btn-sm btn-danger" data-cancel="${s.id}">Cancelar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No tienes solicitudes pendientes</div>'}</div>
    ${hist.length ? `<div class="card"><h2>Últimos 30 días</h2><div class="tbl-wrap"><table class="tbl"><tbody>
      ${hist.map((s) => `<tr><td>${esc(s.descripcion)}<div class="small muted">${fecha(s.fecha)}</div></td><td class="num">${s.piezas} pz</td>
        <td><span class="badge ${s.estado === 'atendida' ? 'b-ok' : 'b-err'}">${s.estado === 'atendida' ? 'Atendida' : 'Cancelada'}</span></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  $('#fped', v).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    await run($('button', f), async () => {
      await API.rpc('crear_solicitud', { p_presentacion: +f.p.value, p_piezas: +f.n.value, p_nota: f.nota.value || null });
      FX.exito(); toast('Solicitud enviada a producción'); route();
    });
  });
  $$('[data-cancel]', v).forEach((b) => b.addEventListener('click', async () => {
    await run(b, async () => { await API.rpc('cambiar_solicitud', { p_id: +b.dataset.cancel, p_estado: 'cancelada' }); toast('Solicitud cancelada'); route(); });
  }));
};

/* =====================================================================
   TABLERO DEL VENDEDOR — efectivo, stock, transferencias (con foquito),
   depósitos, recargas de producción y cuándo vende más
   ===================================================================== */
const DIAS_SEM = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const horaTxt = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
async function tableroVendedor(box, { vendId, r, p, inv, admin, recargar, vigente = () => true }) {
  if (!box || !p) return;
  const d = await API.rpc('vendedor_dashboard', { p_desde: r.desde, p_hasta: r.hasta, p_vendedor: vendId });
  if (!vigente()) return;
  const per = r.hoy ? 'hoy' : r.etiqueta.toLowerCase();
  const tr = d.transferencias, dep = d.depositos;
  const trPend = tr.filter((x) => !x.verificada);
  const trTot = tr.reduce((s, x) => s + (+x.pago_transfer || 0) + (+x.extra || 0), 0);
  const depTot = dep.reduce((s, x) => s + +x.monto, 0);
  const ticket = p.num ? p.total / p.num : 0;
  const stock = inv.filter((i) => i.piezas > 0);
  const stockPz = stock.reduce((s, i) => s + i.piezas, 0);
  const stockVal = stock.reduce((s, i) => s + +i.valor_publico, 0);
  // hora pico (últimos 30 días)
  const horas = d.por_hora.filter((x) => x.h >= 7 && x.h <= 22);
  const maxH = Math.max(1, ...horas.map((x) => x.num));
  const pico = d.por_hora.reduce((a, x) => (x.num > a.num ? x : a), { num: 0 });
  const mejorDia = d.por_dia.reduce((a, x) => (x.num > a.num ? x : a), { num: 0 });
  const maxS = Math.max(1, ...d.serie.map((x) => +x.total));
  const ICO = CAT_ICO;
  const quien = admin ? p.nombre : 'Tú';
  box.innerHTML = `<div class="card dash">
    <div class="card-head"><h2><span class="dash-ava">${avatar(p)}</span> Tablero de ${esc(p.nombre)} <span class="muted small">· ${esc(r.etiqueta)}</span></h2>
      ${admin ? `<div class="inline"><a class="btn btn-sm" href="#/entregar?v=${vendId}">📦 Recargar</a>${+p.en_poder > 0 ? `<a class="btn btn-sm" href="#/caja?op=deposito&v=${vendId}">🏧 Depósito</a>` : ''}${+p.comision_pendiente ? `<a class="btn btn-sm btn-primary" href="#/caja?op=pago_comision&v=${vendId}">🎁 Pagar comisión</a>` : ''}</div>` : ''}</div>
    <div class="dk">
      <div class="dk-i dk-ef"><span class="dk-e">💵</span><span class="dk-l">Efectivo que ${admin ? 'trae' : 'traigo'}</span><b>${money0(p.en_poder)}</b><span class="dk-s">cobros en efectivo, ya sin comisión</span></div>
      <div class="dk-i"><span class="dk-e">📦</span><span class="dk-l">Stock en mano</span><b>${fnum(stockPz)} pz</b><span class="dk-s">vale ${money0(stockVal)} al público</span></div>
      <div class="dk-i ${trPend.length ? 'warn' : ''}"><span class="dk-e">🔁</span><span class="dk-l">Transferencias ${esc(per)}</span><b>${money0(trTot)}</b><span class="dk-s">${tr.length} ${tr.length === 1 ? 'venta' : 'ventas'}${trPend.length ? ` · <span class="foco foco-am"></span> ${trPend.length} por verificar` : tr.length ? ' · <span class="foco foco-ok"></span> verificadas' : ''}</span></div>
      <div class="dk-i"><span class="dk-e">🏧</span><span class="dk-l">Depósitos ${esc(per)}</span><b>${money0(depTot)}</b><span class="dk-s">${dep.length} al banco de su efectivo</span></div>
      <div class="dk-i ${+p.comision_pendiente ? 'warn' : ''}"><span class="dk-e">🎁</span><span class="dk-l">Comisión ${esc(per)}</span><b>${money0(p.comision)}</b><span class="dk-s">${+p.comision_pendiente ? `${admin ? 'le debemos' : 'me deben'} ${money0(p.comision_pendiente)}` : 'todo pagado ✓'}${+d.comision_tomada ? ` · tomó ${money0(d.comision_tomada)} del efectivo` : ''}</span></div>
      <div class="dk-i"><span class="dk-e">🧾</span><span class="dk-l">Ventas ${esc(per)}</span><b>${p.num}</b><span class="dk-s">${fnum(p.piezas)} pz · ticket promedio ${money0(ticket)}</span></div>
    </div>
    <div class="dash-g">
      <div class="dash-b"><div class="dash-t">📦 Lo que ${admin ? 'trae' : 'traigo'} ahora</div>
        ${stock.length ? `<div class="mstk">${stock.map((i) => `<div class="mstk-i stk-${i.categoria || 'cafe'}"><span class="mstk-e">${ICO[i.categoria] || '☕'}</span><b>${i.piezas}</b><span class="mstk-s">${esc(i.sku)}</span><span class="mstk-p">${esc(i.presentacion)}</span><span class="mstk-v">${money0(i.valor_publico)}</span></div>`).join('')}</div>`
          : `<div class="empty">Sin piezas. ${admin ? 'Recárgale producto.' : 'Pide producto.'}</div>`}
        ${d.recargas.length ? `<div class="dash-t" style="margin-top:14px">🚚 Recargas de producción</div><div class="rec">${d.recargas.slice(0, 5).map((x) => `<div class="rec-i"><span class="rec-f">${fecha(x.fecha)}</span><span>${esc(x.detalle || x.sku)}</span><b>${x.piezas} pz</b></div>`).join('')}</div>` : ''}
      </div>
      <div class="dash-b"><div class="dash-t">⏰ ¿Cuándo vende más? <span class="muted small">últimos 30 días</span></div>
        ${pico.num ? `<div class="pico"><b>Hora pico: ${horaTxt(pico.h)}</b> · ${pico.num} ventas${mejorDia.num ? ` · mejor día: <b>${DIAS_SEM[mejorDia.d]}</b>` : ''}</div>` : '<div class="small muted">Aún no hay suficientes ventas para ver un patrón.</div>'}
        <div class="hbars">${horas.map((x) => `<div class="hb ${x.h === pico.h && pico.num ? 'top' : ''}" title="${horaTxt(x.h)}: ${x.num} ventas · ${money0(x.total)}"><i style="height:${(x.num / maxH) * 100}%"></i><span>${x.h % 3 === 0 ? horaTxt(x.h).replace(' ', '') : ''}</span></div>`).join('')}</div>
        <div class="dash-t" style="margin-top:14px">📈 Últimos 14 días</div>
        <div class="sbars">${d.serie.map((x, k) => `<div class="sb ${k === d.serie.length - 1 ? 'hoy' : ''}" title="${x.dia}: ${money0(x.total)} · ${x.num} ventas"><i style="height:${(+x.total / maxS) * 100}%"></i></div>`).join('')}</div>
      </div>
      <div class="dash-b"><div class="dash-t">🔁 Transferencias ${esc(per)} <span class="muted small">${admin ? 'enciende el foco cuando la veas en tu banca móvil' : 'el foco se pone verde cuando el admin la confirma'}</span></div>
        ${tr.length ? `<div class="trl">${tr.map((x) => `<div class="tr-i ${x.verificada ? 'ok' : 'pend'}">
          <span class="foco ${x.verificada ? 'foco-ok' : 'foco-am'}" title="${x.verificada ? 'Verificada en el banco' : 'Por verificar'}"></span>
          <div><b>${esc(x.cliente)}</b><div class="small muted">${folio(x.id)} · ${r.hoy ? hora(x.fecha) : fecha(x.fecha)}${x.tipo === 'paqueteria' ? ' · 📦 paquetería' : ''}${x.referencia ? ` · ref ${esc(x.referencia)}` : ''}</div></div>
          <b>${money0((+x.pago_transfer || 0) + (+x.extra || 0))}${x.metodo === 'mixto' ? ' <span class="badge b-brand">mixto</span>' : ''}${+x.extra ? ` <span class="badge b-extra">+${money0(x.extra)} extra</span>` : ''}</b>
          ${admin ? `<label class="sw" title="${x.verificada ? 'Verificada' : 'Marcar verificada'}"><input type="checkbox" data-verif="${x.id}" ${x.verificada ? 'checked' : ''}><i></i></label>` : `<span class="small ${x.verificada ? '' : 'warn-t'}">${x.verificada ? 'verificada' : 'por verificar'}</span>`}
        </div>`).join('')}</div>` : `<div class="empty">Sin transferencias ${esc(per)}</div>`}
      </div>
      <div class="dash-b"><div class="dash-t">🏧 Depósitos al banco ${esc(per)} <span class="muted small">retiro de caja de su efectivo</span></div>
        ${dep.length ? `<div class="rec">${dep.map((x) => `<div class="rec-i"><span class="rec-f">${r.hoy ? hora(x.fecha) : fecha(x.fecha)}</span><span>${esc(x.concepto || 'Depósito')}</span><b>${money0(x.monto)}</b></div>`).join('')}</div>` : `<div class="empty">${quien === 'Tú' ? 'No has' : 'No ha'} depositado ${esc(per)}${+p.en_poder > 0 ? ` · ${admin ? 'trae' : 'traes'} ${money0(p.en_poder)}` : ''}</div>`}
        ${p.ultima_entrega ? `<div class="dash-t" style="margin-top:14px">🎯 Última recarga</div>
          <div class="bar bar-lg"><i style="width:${p.ultima_entrega.piezas ? Math.min(100, (p.ultima_entrega.vendidas / p.ultima_entrega.piezas) * 100) : 0}%"></i></div>
          <div class="small muted">${fecha(p.ultima_entrega.fecha)} · vendió ${fnum(p.ultima_entrega.vendidas)} de ${fnum(p.ultima_entrega.piezas)} piezas</div>` : ''}
      </div>
    </div></div>`;
  animarNumeros(box);
  bindVerificar(box, recargar);
}
