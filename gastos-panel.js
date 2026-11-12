/* ---------- Panel de gastos: quién lo registró, de dónde salió y si ya está confirmado ----------
   Se usa en Finanzas y en Caja y banco: tarjetaGastos(contenedor, 'semana') */
async function tarjetaGastos(box, def = 'semana', dias = {}) {
  if (!box) return;
  let lista = [], filtro = 'todos', quien = '', rg = null, n = 0;
  box.innerHTML = `<div class="card gx"><div class="card-head"><h2>🧾 Gastos operativos <span class="muted small" data-gx-per></span></h2>
      <div class="tools">${rangoHTML(def, true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']], ...dias })}
      <a class="btn btn-sm btn-primary" href="#/caja?op=gasto">+ Gasto</a></div></div>
    <div data-gx></div></div>`;
  const cuerpo = $('[data-gx]', box);
  const suma = (xs) => xs.reduce((s, g) => s + +g.monto, 0);
  const plural = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
  const origen = (g) => g.cuenta === 'caja'
    ? `<span class="badge b-ok">Efectivo</span><div class="small muted">de ${esc(g.efectivo_de || '—')}</div>`
    : '<span class="badge b-info">Banco</span>';

  const pintar = () => {
    if (!lista.length) { cuerpo.innerHTML = `<div class="empty">Sin gastos ${esc(rg.etiqueta.toLowerCase())}</div>`; return; }
    const conf = lista.filter((g) => g.confirmado), pend = lista.filter((g) => !g.confirmado);
    const gente = {};
    lista.forEach((g) => {
      const k = g.registro_id || '?';
      const p = (gente[k] ||= { id: k, nombre: g.registro || 'Sin registro', usuario: g.registro_usuario, num: 0, total: 0, pend: 0 });
      p.num++; p.total += +g.monto; if (!g.confirmado) p.pend++;
    });
    const ver = lista.filter((g) => (filtro === 'todos' || (filtro === 'pend' ? !g.confirmado : g.confirmado)) && (!quien || (g.registro_id || '?') === quien));
    cuerpo.innerHTML = `<div class="gx-k">
        <div><span>Total gastado</span><b>${money0(suma(lista))}</b><small>${plural(lista.length, 'gasto', 'gastos')}</small></div>
        <div class="ok"><span>✓ Confirmados</span><b>${money0(suma(conf))}</b><small>${plural(conf.length, 'pagado', 'pagados')}</small></div>
        <div class="${pend.length ? 'warn' : ''}"><span>Por confirmar</span><b>${money0(suma(pend))}</b><small>${plural(pend.length, 'pendiente', 'pendientes')}</small></div>
      </div>
      <div class="gx-sub">¿Quién registró los gastos? <span class="muted small">toca para ver solo los suyos</span></div>
      <div class="gx-gente">${Object.values(gente).sort((a, b) => b.total - a.total).map((p) => `<button type="button" class="gx-p ${quien === p.id ? 'on' : ''}" data-q="${esc(p.id)}">
        <span class="mini-ava">${avatar(p)}</span><span class="gx-p-i"><b>${esc(p.nombre)}</b><small>${plural(p.num, 'gasto', 'gastos')}${p.pend ? ` · ${p.pend} por confirmar` : ''}</small></span><b>${money0(p.total)}</b></button>`).join('')}</div>
      <div class="gx-bar"><div class="seg seg-sm" data-gx-f>${[['todos', 'Todos'], ['pend', `Por confirmar (${pend.length})`], ['conf', `Confirmados (${conf.length})`]].map(([k, l]) => `<button type="button" data-f="${k}" class="${filtro === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${quien ? '<button type="button" class="btn btn-sm btn-ghost" data-gx-todos>Ver de todos ✕</button>' : ''}</div>
      ${ver.length ? `<div class="tbl-wrap"><table class="tbl gx-t"><thead><tr><th>Pagado</th><th>Gasto</th><th>Registró</th><th>De dónde</th><th class="num">Monto</th><th></th></tr></thead><tbody>
        ${ver.map((g) => { const [, e, l] = catGasto(g.categoria); return `<tr class="${g.confirmado ? 'gx-ok' : ''}">
          <td><button type="button" class="gx-chk ${g.confirmado ? 'on' : ''}" data-chk="${g.id}" title="${g.confirmado ? `Confirmado por ${esc(g.confirmado_por || '')} · ${fecha(g.confirmado_fecha)} — toca para quitar` : 'Marcar como pagado y confirmado'}" aria-label="${g.confirmado ? 'Quitar confirmación' : 'Confirmar pago'}">${g.confirmado ? '✓' : ''}</button></td>
          <td><b>${e} ${esc(g.concepto || l)}</b>${g.beneficiario ? `<div class="small">→ <b>${esc(g.beneficiario)}</b></div>` : ''}<div class="small muted">${esc(l)} · ${fecha(g.fecha)}${g.confirmado ? ` · ✓ ${esc(g.confirmado_por || '')}` : ''}</div></td>
          <td class="small">${g.registro ? `<span class="mini-ava">${avatar({ nombre: g.registro, usuario: g.registro_usuario })}</span> ${esc(g.registro)}` : '—'}</td>
          <td>${origen(g)}</td>
          <td class="num"><b>${money0(g.monto)}</b></td>
          <td><button type="button" class="btn btn-sm btn-ghost gx-rev" data-rev="${g.id}" title="Revertir este gasto (si se registró por error o duplicado)">↩ Revertir</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">No hay gastos con este filtro</div>'}`;
    $$('[data-q]', cuerpo).forEach((b) => b.addEventListener('click', () => { quien = quien === b.dataset.q ? '' : b.dataset.q; FX.tap(); pintar(); }));
    $('[data-gx-todos]', cuerpo)?.addEventListener('click', () => { quien = ''; pintar(); });
    $$('[data-gx-f] [data-f]', cuerpo).forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; FX.tap(); pintar(); }));
    $$('[data-rev]', cuerpo).forEach((b) => b.addEventListener('click', () => revertir(lista.find((x) => x.id === +b.dataset.rev))));
    $$('[data-chk]', cuerpo).forEach((b) => b.addEventListener('click', async () => {
      const g = lista.find((x) => x.id === +b.dataset.chk);
      const ok = !g.confirmado;
      b.disabled = true;
      try {
        const r = await API.rpc('confirmar_gasto', { p_id: g.id, p_ok: ok });
        Object.assign(g, { confirmado: r.confirmado, confirmado_por: r.por, confirmado_fecha: r.fecha });
        if (ok) FX.swOn(); else FX.swOff();
        toast(ok ? `Pago confirmado: ${money0(g.monto)}${g.beneficiario ? ' a ' + g.beneficiario : ''}` : 'Se quitó la confirmación');
        pintar();
      } catch (e) { toast(e.message, true); b.disabled = false; }
    }));
  };

  // Revertir un gasto mal registrado: el dinero regresa a la caja/banco de donde salió
  const revertir = async (g) => {
    const dup = lista.filter((x) => x.id !== g.id && x.fecha !== g.fecha && +x.monto === +g.monto && (x.concepto || '') === (g.concepto || '') && x.categoria === g.categoria);
    // un gasto mixto son dos renglones (efectivo + banco) con la misma fecha: se revierten juntos
    const partes = lista.filter((x) => x.id === g.id || (x.fecha === g.fecha && x.registro_id === g.registro_id && x.categoria === g.categoria && x.cuenta !== g.cuenta));
    const tot = suma(partes);
    const aDonde = (x) => (x.cuenta === 'caja' ? `al efectivo de ${x.efectivo_de || 'quien lo pagó'}` : 'al banco');
    const de = partes.length > 1 ? partes.map((x) => `${money0(x.monto)} ${aDonde(x)}`).join(' y ') : aDonde(g);
    const ok = await confirmar('↩ Revertir gasto', `${g.concepto || catGasto(g.categoria)[2]} · ${money0(tot)}${partes.length > 1 ? ' (pago mixto)' : ''}\nRegistró: ${g.registro || '—'} · ${fecha(g.fecha)}\n\nSe quita el gasto y regresan ${partes.length > 1 ? de : `los ${money0(tot)} ${de}`}.${dup.length ? `\n\nHay ${dup.length} gasto(s) igual(es) en este periodo: se revierte solo este.` : ''}${g.confirmado ? '\n\nOjo: este gasto ya estaba confirmado como pagado.' : ''}`, 'Sí, revertir', true);
    if (!ok) return;
    try {
      const r = await API.rpc('revertir_gasto', { p_id: g.id, p_motivo: dup.length ? 'Duplicado' : 'Registrado por error' });
      FX.swOff(); toast(`Gasto revertido · regresaron ${partes.length > 1 ? de : `${money0(r.monto)} ${de}`}`);
      await cargar(rg);
      document.dispatchEvent(new CustomEvent('gasto-revertido'));
    } catch (e) { toast(e.message, true); }
  };

  const cargar = async (r) => {
    rg = r; const yo = ++n;
    $('[data-gx-per]', box).textContent = '· ' + r.etiqueta;
    try {
      const d = await API.rpc('gastos_periodo', { p_desde: r.desde, p_hasta: r.hasta });
      if (yo !== n) return;
      lista = d.gastos; quien = ''; pintar();
    } catch (e) { if (yo === n) cuerpo.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
  };
  const leer = bindRango($('[data-rango]', box), cargar);
  await cargar(leer());
}
