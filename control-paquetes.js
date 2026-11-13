/* =====================================================================
   CONTROL DE PAQUETES (solo admin) — Ventas › Equipo
   El Pack 28 g y el 3×2 salen más baratos por pieza que el 14 g suelto.
   · Confirmar con el cliente: ventas con paquete elegidas al azar para escribirle por WhatsApp.
   · Mezcla de ventas: cuánto de lo que vende cada quien es suelto o paquete, contra el resto del equipo.
   · Teléfonos para revisar: números que no parecen reales o que se repiten.
   ===================================================================== */
const VERIF_EST = {
  pendiente: ['⏳', 'Pendiente', 'b-warn'],
  coincide: ['✓', 'Coincide', 'b-ok'],
  no_coincide: ['✗', 'No coincide', 'b-err'],
  sin_respuesta: ['…', 'No contestó', 'b-info'],
};
const tel10 = (t) => String(t || '').replace(/\D/g, '').slice(-10);

function waConfirmar(x) {
  const dia = new Date(x.fecha).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const nom = String(x.cliente || '').trim().split(/\s+/)[0] || '';
  const txt = `Hola${nom ? ` ${nom}` : ''} 👋 Te escribimos de Café. Gracias por tu compra del ${dia} con ${x.vendedor}: ${x.productos}, por ${money0(x.total)}. `
    + '¿Nos confirmas que todo llegó bien y que ese fue el precio que pagaste? Nos ayuda a darte mejor servicio ☕';
  return `https://wa.me/52${tel10(x.telefono)}?text=${encodeURIComponent(txt)}`;
}

async function pintarControlPaquetes(box, r, { vigente = () => true } = {}) {
  if (!box) return;
  let lista, ctl;
  try {
    [lista, ctl] = await Promise.all([
      API.rpc('verificaciones_lista', { p_estado: null }),
      API.rpc('control_paquetes', { p_desde: r.desde, p_hasta: r.hasta }),
    ]);
  } catch (e) { if (vigente()) box.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; return; }
  if (!vigente()) return;
  const pend = lista.filter((x) => x.estado === 'pendiente');
  const hechas = lista.filter((x) => x.estado !== 'pendiente').slice(0, 15);

  // mezcla: la parte de paquetes de cada quien contra la del resto del equipo
  const vs = ctl.vendedores.map((x) => ({ ...x, unid: +x.sueltas + +x.packs + +x.tres }));
  const totU = vs.reduce((s, x) => s + x.unid, 0), totP = vs.reduce((s, x) => s + +x.packs + +x.tres, 0);
  vs.forEach((x) => {
    x.pct = x.unid ? ((+x.packs + +x.tres) / x.unid) * 100 : 0;
    const otrosU = totU - x.unid, otrosP = totP - (+x.packs + +x.tres);
    x.otros = otrosU ? (otrosP / otrosU) * 100 : null;
    x.alerta = +x.no_coinciden > 0 ? 'roja' : (x.unid >= 6 && x.otros !== null && x.pct > x.otros + 25 ? 'mezcla' : '');
  });

  const fila = (x) => {
    const [e, l, b] = VERIF_EST[x.estado];
    const tienePago = x.metodo === 'efectivo' ? '💵 efectivo' : x.metodo === 'mixto' ? '🔀 mixto' : '🔁 transferencia';
    return `<div class="cp-v ${x.estado}">
      <div class="cp-v-i"><b>${esc(x.cliente || 'Sin nombre')}</b> <span class="muted small">· ${folio(x.venta_id)} · ${esc(x.vendedor)} · ${fecha(x.fecha)}</span>
        <div class="small">${esc(x.productos || '')} · <b>${money0(x.total)}</b> · ${tienePago}${x.origen === 'manual' ? ' · <span class="muted">agregada a mano</span>' : ''}</div>
        <div class="small muted">📱 ${esc(x.telefono || '—')}${x.estado !== 'pendiente' ? ` · <span class="badge ${b}">${e} ${l}</span>${x.por ? ` por ${esc(x.por)}` : ''}${x.nota ? ` · “${esc(x.nota)}”` : ''}` : ''}</div></div>
      <div class="cp-v-a">
        ${x.estado === 'pendiente' ? `<a class="btn btn-sm btn-wa" href="${waConfirmar(x)}" target="_blank" rel="noopener">💬 WhatsApp</a>
          <button type="button" class="btn btn-sm" data-cv="${x.venta_id}" data-e="coincide">✓ Coincide</button>
          <button type="button" class="btn btn-sm cp-no" data-cv="${x.venta_id}" data-e="no_coincide">✗ No coincide</button>
          <button type="button" class="btn btn-sm btn-ghost" data-cv="${x.venta_id}" data-e="sin_respuesta">No contestó</button>`
          : `<button type="button" class="btn btn-sm btn-ghost" data-cv="${x.venta_id}" data-e="pendiente">Deshacer</button>`}
      </div></div>`;
  };

  box.innerHTML = `
    <div class="card cp">
      <div class="card-head"><h2>🛡️ Confirmar con el cliente</h2><span class="badge ${pend.length ? 'b-warn' : 'b-ok'}">${pend.length ? `${pend.length} por confirmar` : 'Al día ✓'}</span></div>
      <div class="small muted" style="margin-bottom:10px">El sistema escoge al azar ${fnum(ctl.pct ?? 30)}% de las ventas con <b>Pack 28 g</b> o <b>3×2</b>. Escríbele al cliente: si te dice que compró otra cosa o pagó otro precio, márcala como <b>No coincide</b>.</div>
      ${pend.length ? `<div class="cp-lista">${pend.map(fila).join('')}</div>` : '<div class="empty">No hay ventas por confirmar</div>'}
      ${hechas.length ? `<details class="cb-box"><summary>Ya revisadas (${hechas.length})</summary><div class="cp-lista">${hechas.map(fila).join('')}</div></details>` : ''}
    </div>

    <div class="card cp">
      <div class="card-head"><h2>📊 Mezcla de ventas <span class="muted small">· ${esc(r.etiqueta)}</span></h2></div>
      <div class="small muted" style="margin-bottom:10px">De lo que vende cada quien, cuánto es 14 g suelto y cuánto paquete. Si alguien vende muchos más paquetes que el resto del equipo, vale la pena confirmar más de sus ventas.</div>
      <div class="cp-mz">${vs.filter((x) => x.unid || +x.no_coinciden).map((x) => `<div class="cp-m ${x.alerta}">
        <div class="cp-m-h"><span class="mini-ava">${avatar(x)}</span><b>${esc(x.nombre)}</b>
          ${x.alerta === 'roja' ? `<span class="badge b-err">✗ ${x.no_coinciden} no ${+x.no_coinciden === 1 ? 'coincide' : 'coinciden'}</span>` : x.alerta === 'mezcla' ? '<span class="badge b-warn">⚠️ muchos paquetes</span>' : '<span class="badge b-ok">normal</span>'}</div>
        <div class="cp-bar" title="sueltas ${x.sueltas} · packs ${x.packs} · 3×2 ${x.tres}">
          <i class="s" style="width:${x.unid ? (x.sueltas / x.unid) * 100 : 0}%"></i><i class="p" style="width:${x.unid ? (x.packs / x.unid) * 100 : 0}%"></i><i class="t" style="width:${x.unid ? (x.tres / x.unid) * 100 : 0}%"></i></div>
        <div class="cp-m-n small"><span>☕ ${fnum(x.sueltas)} sueltas</span><span>📦 ${fnum(x.packs)} packs</span><span>🎁 ${fnum(x.tres)} de 3×2</span></div>
        <div class="small"><b>${fnum(x.pct, 0)}%</b> paquetes${x.otros !== null ? ` <span class="muted">· resto del equipo ${fnum(x.otros, 0)}%</span>` : ''}${+x.paq_efectivo ? ` <span class="muted">· ${x.paq_efectivo} en efectivo</span>` : ''}</div>
        <div class="small muted">Confirmadas: ✓ ${x.coinciden} · ✗ ${x.no_coinciden} · ⏳ ${x.pendientes}${+x.sin_respuesta ? ` · … ${x.sin_respuesta}` : ''}</div>
        <button type="button" class="btn btn-sm" data-mas="${x.id}" data-n="${esc(x.nombre)}">🔎 Confirmar 5 ventas más</button>
      </div>`).join('') || '<div class="empty">Sin ventas de café de 14 g ni paquetes en este periodo</div>'}</div>
      <div class="cp-ley small muted"><span><i class="s"></i>14 g suelto</span><span><i class="p"></i>Pack 28 g</span><span><i class="t"></i>3×2</span></div>
    </div>

    ${ctl.telefonos.length ? `<div class="card cp"><div class="card-head"><h2>📱 Teléfonos para revisar <span class="muted small">· ${esc(r.etiqueta)}</span></h2></div>
      <div class="small muted" style="margin-bottom:8px">En ventas con paquete: números que no parecen reales, o el mismo número con varias ventas o con nombres distintos.</div>
      <div class="cp-lista">${ctl.telefonos.map((t) => `<div class="cp-t"><b>${esc(t.telefono || 'sin número')}</b>
        <span class="small">${t.raro ? '<span class="badge b-err">no parece real</span> ' : ''}${t.ventas} ${t.ventas === 1 ? 'venta' : 'ventas'}${t.clientes > 1 ? ` · ${t.clientes} nombres distintos` : ''} · ${esc(t.vendedores)}</span></div>`).join('')}</div></div>` : ''}`;

  $$('[data-cv]', box).forEach((b) => b.addEventListener('click', async () => {
    const id = +b.dataset.cv, est = b.dataset.e;
    let nota = null;
    if (est === 'no_coincide') {
      nota = await pedirNota();
      if (nota === null) return;
    }
    await run(b, async () => {
      await API.rpc('verificar_cliente', { p_venta: id, p_estado: est, p_nota: nota });
      toast(est === 'pendiente' ? 'Regresó a pendientes' : `Marcada: ${VERIF_EST[est][1]}`);
      pintarControlPaquetes(box, r, { vigente });
    });
  }));
  $$('[data-mas]', box).forEach((b) => b.addEventListener('click', () => run(b, async () => {
    const res = await API.rpc('verificar_mas', { p_vendedor: b.dataset.mas, p_n: 5 });
    toast(res.agregadas ? `Se agregaron ${res.agregadas} ventas de ${b.dataset.n} para confirmar` : `${b.dataset.n} no tiene más ventas con paquete y teléfono en los últimos 30 días`, !res.agregadas);
    pintarControlPaquetes(box, r, { vigente });
  })));
}

function pedirNota() {
  return new Promise((ok) => {
    let listo = false;
    modal(`<h2>✗ No coincide</h2><div class="muted">Anota qué te dijo el cliente, para tenerlo de respaldo.</div>
      <form id="fnc"><label class="field"><span>¿Qué te dijo?</span><textarea name="n" rows="3" placeholder="Ej. compró 1 bolsita de 14 g y pagó $450" required></textarea></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`);
    $('#fnc', dlg).addEventListener('submit', (e) => { e.preventDefault(); listo = true; const v = e.target.n.value.trim(); dlg.close(); ok(v || 'No coincide'); });
    dlg.addEventListener('close', () => { if (!listo) ok(null); }, { once: true });
  });
}
