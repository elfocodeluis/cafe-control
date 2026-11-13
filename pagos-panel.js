/* ---------- Panel de comisiones y paquetería ----------
   Igual que "Gastos operativos", pero para lo que se les paga a los vendedores:
   · Por pagar ahora: a quién se le debe comisión o paquetería (con botón para pagar).
   · Pagos hechos en el periodo: a quién, de dónde salió (efectivo / banco / mixto), quién lo registró y si ya está confirmado.
   Un pago mixto o de varios envíos se muestra como UN solo pago con sus partes.
   Se usa en Finanzas y en Caja y banco: tarjetaPagos(contenedor, 'semana') */
async function tarjetaPagos(box, def = 'semana', dias = {}, { sinPorPagar = false } = {}) {
  if (!box) return;
  let pagos = [], debe = { comisiones: [], paqueteria: [] }, tipoF = 'todos', estado = 'todos', quien = '', rg = null, n = 0;
  box.innerHTML = `<div class="card gx px"><div class="card-head"><h2>💸 Comisiones y paquetería <span class="muted small" data-px-per></span></h2>
      <div class="tools">${rangoHTML(def, true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']], ...dias })}</div></div>
    <div data-px></div></div>`;
  const cuerpo = $('[data-px]', box);
  const suma = (xs) => xs.reduce((s, g) => s + +g.total, 0);
  const plural = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
  const TIPO = { pago_comision: ['🎁', 'Comisión'], pago_envio: ['📦', 'Paquetería'] };

  // junta los movimientos de un mismo pago (misma fecha, tipo, persona y quien registró)
  const agrupar = (lista) => {
    const m = new Map();
    lista.forEach((x) => {
      const k = [x.tipo, x.para_id || '', x.fecha, x.registro_id || ''].join('|');
      let g = m.get(k);
      if (!g) m.set(k, g = { k, tipo: x.tipo, fecha: x.fecha, para_id: x.para_id, para: x.para, para_usuario: x.para_usuario, registro_id: x.registro_id, registro: x.registro,
        registro_usuario: x.registro_usuario, ids: [], movs: [], efectivo: 0, banco: 0, total: 0, envios: [] });
      g.ids.push(x.id); g.movs.push(x); g.total += +x.monto;
      if (x.cuenta === 'caja') g.efectivo += +x.monto; else g.banco += +x.monto;
      if (x.venta_id && !g.envios.some((e) => e.venta_id === x.venta_id)) g.envios.push(x);
    });
    return [...m.values()].map((g) => {
      const conf = g.movs.filter((x) => x.confirmado);
      return Object.assign(g, { confirmado: conf.length === g.movs.length, parcial: conf.length > 0 && conf.length < g.movs.length,
        confirmado_por: conf[0]?.confirmado_por, confirmado_fecha: conf[0]?.confirmado_fecha });
    });
  };
  const origen = (g) => {
    const ef = g.efectivo > 0.005, bc = g.banco > 0.005;
    if (ef && bc) return `<span class="badge b-brand">Mixto</span><div class="small">💵 ${money0(g.efectivo)} de su efectivo</div><div class="small">🏦 ${money0(g.banco)} del banco</div>`;
    if (ef) return `<span class="badge b-ok">Efectivo</span><div class="small muted">de ${esc(g.para || '—')}</div>`;
    return '<span class="badge b-info">Banco</span><div class="small muted">transferencia</div>';
  };
  const detalle = (g) => {
    if (g.tipo === 'pago_envio') {
      if (!g.envios.length) return '<div class="small muted">Pago general a paquetería</div>';
      const xs = g.envios.slice(0, 3).map((e) => `${esc(e.cliente || '')}${e.municipio ? ` · ${esc(e.municipio)}` : ''}`);
      return `<div class="small muted">${plural(g.envios.length, 'envío', 'envíos')}: ${xs.join(', ')}${g.envios.length > 3 ? ` y ${g.envios.length - 3} más` : ''}</div>`;
    }
    const c = g.movs.map((x) => x.concepto).find((t) => t && !/^Pago de comisiones a |tomó su comisión de su efectivo$/.test(t));
    return c ? `<div class="small muted">${esc(c)}</div>` : '';
  };

  // "Por pagar ahora": por persona, comisión + paquetería
  const porPagarHTML = () => {
    const gente = {};
    debe.comisiones.forEach((c) => { (gente[c.vendedor_id] ||= { id: c.vendedor_id, nombre: c.nombre, usuario: c.usuario, en_poder: +c.en_poder, com: 0, paq: 0, envios: 0 }).com += +c.monto; });
    debe.paqueteria.forEach((p) => { const x = (gente[p.vendedor_id] ||= { id: p.vendedor_id, nombre: p.nombre, usuario: p.usuario, en_poder: +p.en_poder, com: 0, paq: 0, envios: 0 }); x.paq += +p.monto; x.envios++; });
    const lista = Object.values(gente).sort((a, b) => b.com + b.paq - (a.com + a.paq));
    const tot = lista.reduce((s, x) => s + x.com + x.paq, 0);
    if (!lista.length) return '<div class="px-ok">✓ No se le debe comisión ni paquetería a nadie</div>';
    return `<div class="gx-sub">Por pagar ahora <b>${money0(tot)}</b> <span class="muted small">lo que se les debe hoy, sin importar el periodo</span></div>
      <div class="px-debe">${lista.map((x) => `<div class="px-d">
        <span class="mini-ava">${avatar(x)}</span>
        <span class="px-d-i"><b>${esc(x.nombre)}</b>
          <small>${x.com > 0.005 ? `🎁 Comisión ${money0(x.com)}` : ''}${x.com > 0.005 && x.paq > 0.005 ? ' · ' : ''}${x.paq > 0.005 ? `📦 Paquetería ${money0(x.paq)} (${plural(x.envios, 'envío', 'envíos')})` : ''}</small>
          ${x.en_poder > 0.005 ? `<small class="muted">trae ${money0(x.en_poder)} en efectivo${x.en_poder + 0.005 < x.com + x.paq ? ' · puedes pagar mixto' : ''}</small>` : ''}</span>
        <b>${money0(x.com + x.paq)}</b>
        <span class="px-d-a">${x.com > 0.005 ? `<a class="btn btn-sm" href="#/caja?op=pago_comision&v=${x.id}">Pagar comisión</a>` : ''}${x.paq > 0.005 ? `<a class="btn btn-sm" href="#/caja?op=pago_envio&v=${x.id}">Pagar paquetería</a>` : ''}</span>
      </div>`).join('')}</div>`;
  };

  const pintar = () => {
    const todos = agrupar(pagos);
    const deTipo = todos.filter((g) => tipoF === 'todos' || g.tipo === tipoF);
    const conf = deTipo.filter((g) => g.confirmado), pend = deTipo.filter((g) => !g.confirmado);
    const gente = {};
    deTipo.forEach((g) => {
      const k = g.para_id || '?';
      const p = (gente[k] ||= { id: k, nombre: g.para || 'Paquetería general', usuario: g.para_usuario, num: 0, total: 0, pend: 0 });
      p.num++; p.total += g.total; if (!g.confirmado) p.pend++;
    });
    const ver = deTipo.filter((g) => (estado === 'todos' || (estado === 'pend' ? !g.confirmado : g.confirmado)) && (!quien || (g.para_id || '?') === quien));
    const sumT = (t) => suma(todos.filter((g) => g.tipo === t));
    cuerpo.innerHTML = `${sinPorPagar ? '' : porPagarHTML()}
      <div class="gx-sub" style="margin-top:${sinPorPagar ? 0 : 18}px">Pagos hechos <span class="muted small">${esc(rg.etiqueta.toLowerCase())}</span></div>
      ${todos.length ? `<div class="gx-k px-k">
        <div><span>Pagado</span><b>${money0(suma(todos))}</b><small>${plural(todos.length, 'pago', 'pagos')}</small></div>
        <div><span>🎁 Comisiones</span><b>${money0(sumT('pago_comision'))}</b><small>${plural(todos.filter((g) => g.tipo === 'pago_comision').length, 'pago', 'pagos')}</small></div>
        <div><span>📦 Paquetería</span><b>${money0(sumT('pago_envio'))}</b><small>${plural(todos.filter((g) => g.tipo === 'pago_envio').reduce((s, g) => s + Math.max(1, g.envios.length), 0), 'envío', 'envíos')}</small></div>
        <div class="${todos.some((g) => !g.confirmado) ? 'warn' : 'ok'}"><span>Por confirmar</span><b>${money0(suma(todos.filter((g) => !g.confirmado)))}</b><small>${plural(todos.filter((g) => !g.confirmado).length, 'pendiente', 'pendientes')}</small></div>
      </div>
      <div class="gx-bar"><div class="seg seg-sm" data-px-t>${[['todos', 'Todo'], ['pago_comision', '🎁 Comisiones'], ['pago_envio', '📦 Paquetería']].map(([k, l]) => `<button type="button" data-t="${k}" class="${tipoF === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg seg-sm" data-px-f>${[['todos', 'Todos'], ['pend', `Por confirmar (${pend.length})`], ['conf', `Confirmados (${conf.length})`]].map(([k, l]) => `<button type="button" data-f="${k}" class="${estado === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${Object.keys(gente).length > 1 ? `<div class="gx-sub">¿A quién se le pagó? <span class="muted small">toca para ver solo los suyos</span></div>
      <div class="gx-gente">${Object.values(gente).sort((a, b) => b.total - a.total).map((p) => `<button type="button" class="gx-p ${quien === p.id ? 'on' : ''}" data-q="${esc(p.id)}">
        <span class="mini-ava">${avatar(p)}</span><span class="gx-p-i"><b>${esc(p.nombre)}</b><small>${plural(p.num, 'pago', 'pagos')}${p.pend ? ` · ${p.pend} por confirmar` : ''}</small></span><b>${money0(p.total)}</b></button>`).join('')}</div>
        ${quien ? '<button type="button" class="btn btn-sm btn-ghost" data-px-todos style="margin-bottom:8px">Ver de todos ✕</button>' : ''}` : ''}
      ${ver.length ? `<div class="tbl-wrap"><table class="tbl gx-t"><thead><tr><th>Pagado</th><th>Pago</th><th>De dónde</th><th>Registró</th><th class="num">Monto</th></tr></thead><tbody>
        ${ver.map((g) => { const [e, l] = TIPO[g.tipo]; return `<tr class="${g.confirmado ? 'gx-ok' : ''}">
          <td><button type="button" class="gx-chk ${g.confirmado ? 'on' : ''}" data-chk="${esc(g.k)}" title="${g.confirmado ? `Confirmado por ${esc(g.confirmado_por || '')} · ${fecha(g.confirmado_fecha)} — toca para quitar` : 'Marcar como pagado y confirmado'}" aria-label="${g.confirmado ? 'Quitar confirmación' : 'Confirmar pago'}">${g.confirmado ? '✓' : g.parcial ? '–' : ''}</button></td>
          <td><b>${e} ${l} → ${esc(g.para || 'paquetería')}</b>${detalle(g)}<div class="small muted">${fecha(g.fecha)}${g.confirmado ? ` · ✓ ${esc(g.confirmado_por || '')}` : ''}</div></td>
          <td>${origen(g)}</td>
          <td class="small">${g.registro ? `<span class="mini-ava">${avatar({ nombre: g.registro, usuario: g.registro_usuario })}</span> ${esc(g.registro)}` : '—'}</td>
          <td class="num"><b>${money0(g.total)}</b></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">No hay pagos con este filtro</div>'}`
      : `<div class="empty">Sin pagos de comisión o paquetería ${esc(rg.etiqueta.toLowerCase())}</div>`}`;
    $$('[data-q]', cuerpo).forEach((b) => b.addEventListener('click', () => { quien = quien === b.dataset.q ? '' : b.dataset.q; FX.tap(); pintar(); }));
    $('[data-px-todos]', cuerpo)?.addEventListener('click', () => { quien = ''; pintar(); });
    $$('[data-px-t] [data-t]', cuerpo).forEach((b) => b.addEventListener('click', () => { tipoF = b.dataset.t; quien = ''; FX.tap(); pintar(); }));
    $$('[data-px-f] [data-f]', cuerpo).forEach((b) => b.addEventListener('click', () => { estado = b.dataset.f; FX.tap(); pintar(); }));
    $$('[data-chk]', cuerpo).forEach((b) => b.addEventListener('click', async () => {
      const g = todos.find((x) => x.k === b.dataset.chk);
      const ok = !g.confirmado;
      b.disabled = true;
      try {
        const r = await API.rpc('confirmar_pagos', { p_ids: g.ids, p_ok: ok });
        pagos.forEach((x) => { if (g.ids.includes(x.id)) Object.assign(x, { confirmado: r.confirmado, confirmado_por: r.por, confirmado_fecha: r.fecha }); });
        if (ok) FX.swOn(); else FX.swOff();
        toast(ok ? `Pago confirmado: ${money0(g.total)} a ${g.para || 'paquetería'}` : 'Se quitó la confirmación');
        pintar();
      } catch (e) { toast(e.message, true); b.disabled = false; }
    }));
  };

  const cargar = async (r) => {
    rg = r; const yo = ++n;
    $('[data-px-per]', box).textContent = '· ' + r.etiqueta;
    try {
      const d = await API.rpc('pagos_periodo', { p_desde: r.desde, p_hasta: r.hasta });
      if (yo !== n) return;
      pagos = d.pagos; debe = d.por_pagar; quien = ''; pintar();
    } catch (e) { if (yo === n) cuerpo.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
  };
  const leer = bindRango($('[data-rango]', box), cargar);
  await cargar(leer());
}
