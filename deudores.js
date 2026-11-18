// Deudores: clientes de confianza que se llevaron producto a crédito. Aviso arriba de Finanzas y panel para cobrarles.
(function () {
  const diasDesde = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5));
  const hace = (iso) => { const d = diasDesde(iso); return d === 0 ? 'hoy' : d === 1 ? 'desde ayer' : `hace ${d} días`; };
  const tel = (t) => String(t || '').replace(/\D/g, '').slice(-10);

  // aviso: "Ale te debe $4,500 · Cristel $150 — Ver y cobrar"
  async function aviso(el) {
    if (!el || ME?.rol !== 'admin') return;
    const d = await API.rpc('deudores').catch(() => null);
    if (!d || !d.clientes.length) { el.innerHTML = ''; return; }
    const top = d.clientes.slice(0, 3);
    el.innerHTML = `<button type="button" class="deu-aviso" data-deu-abrir>
      <span class="deu-ico" aria-hidden="true">💳</span>
      <span class="deu-txt"><b>Por cobrar ${money0(d.total)}</b>
        <small>${top.map((c) => `${esc(c.cliente)} te debe <b>${money0(c.debe)}</b>`).join(' · ')}${d.clientes.length > 3 ? ` · y ${d.clientes.length - 3} más` : ''}</small></span>
      <span class="deu-ir">Ver y cobrar</span></button>`;
    $('[data-deu-abrir]', el).onclick = () => abrir(() => aviso(el));
  }

  // panel: cada cliente con sus ventas pendientes y un botón para cobrar
  async function abrir(alCambiar) {
    modal('<h2>💳 Deudores</h2><div class="muted small">Cargando…</div>', true);
    const pintar = async () => {
      const d = await API.rpc('deudores').catch((e) => { toast(e.message, true); return null; });
      if (!d || !dlg.open) return;
      const cuerpo = d.clientes.length ? d.clientes.map((c) => `
        <div class="deu-cli">
          <div class="deu-cli-h"><div><b>${esc(c.cliente)}</b>
            <div class="small muted">${c.telefono ? `<a href="tel:${tel(c.telefono)}">📞 ${esc(c.telefono)}</a> · ` : ''}debe ${hace(c.desde)}</div></div>
            <div class="deu-debe">${money0(c.debe)}</div></div>
          ${c.ventas.map((x) => `<div class="deu-v">
            <div class="deu-v-i"><span>${folio(x.id)} · ${fecha(x.fecha)}${x.vendedor ? ` · ${esc(x.vendedor)}` : ''}</span>
              <small>${esc(x.productos || '')}</small>
              ${x.nota ? `<small class="muted">📝 ${esc(x.nota)}</small>` : ''}
              <small>Total ${money0(x.total)}${+x.pagado > 0 ? ` · ya pagó ${money0(x.pagado)}` : ''} · <b>falta ${money0(x.por_cobrar)}</b></small></div>
            <button type="button" class="btn btn-sm btn-primary" data-cobrar="${x.id}" data-falta="${x.por_cobrar}" data-cli="${esc(c.cliente)}">Cobrar</button>
          </div>`).join('')}
        </div>`).join('') : '<div class="empty">Nadie te debe. 🎉</div>';
      const cobrados = d.cobrados.length ? `<details class="ajuste" style="margin-top:14px"><summary>Últimos cobros</summary>
        <div class="deu-hist">${d.cobrados.map((m) => `<div><span>${fecha(m.fecha)} · ${esc(m.cliente)} ${folio(m.venta)}</span><b>${+m.monto < 0 ? '−' : '+'}${money0(Math.abs(m.monto))} ${m.cuenta === 'caja' ? '💵' : '🏦'}</b></div>`).join('')}</div></details>` : '';
      dlg.querySelector('.modal-body').innerHTML = `<button type="button" class="modal-x" data-close aria-label="Cerrar">✕</button>
        <h2>💳 Deudores</h2>
        <div class="muted small" style="margin-bottom:12px">${d.clientes.length ? `Te deben <b>${money0(d.total)}</b> entre ${d.clientes.length} cliente${d.clientes.length === 1 ? '' : 's'}. Cuando te paguen, toca <b>Cobrar</b> y el dinero entra al banco o a tu efectivo.` : 'Las ventas a crédito aparecen aquí hasta que se cobran.'}</div>
        ${cuerpo}${cobrados}`;
      $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
      $$('[data-cobrar]', dlg).forEach((b) => b.addEventListener('click', () => formCobro(b)));
    };

    function formCobro(b) {
      const fila = b.closest('.deu-v');
      if (fila.nextElementSibling?.classList.contains('deu-form')) { fila.nextElementSibling.remove(); return; }
      $$('.deu-form', dlg).forEach((f) => f.remove());
      const falta = +b.dataset.falta;
      let cta = 'banco';
      fila.insertAdjacentHTML('afterend', `<form class="deu-form">
        <label class="field"><span>¿Cuánto pagó ${esc(b.dataset.cli)}?</span><input name="m" type="number" min="1" max="${falta}" step="any" inputmode="decimal" value="${falta}" required></label>
        <div class="field"><span>¿Cómo pagó?</span><div class="seg seg-sm" data-cta><button type="button" data-c="banco" class="on">🏦 Transferencia</button><button type="button" data-c="caja">💵 Efectivo</button></div></div>
        <div class="deu-form-a"><span class="small muted" data-resto></span><button class="btn btn-primary" type="submit">Ya lo cobré</button></div></form>`);
      const f = fila.nextElementSibling;
      const resto = () => { const m = +f.m.value || 0; $('[data-resto]', f).textContent = m >= falta ? 'Queda pagada' : m > 0 ? `Seguirá debiendo ${money0(falta - m)}` : ''; };
      resto(); f.m.addEventListener('input', resto); f.m.focus(); f.m.select();
      $$('[data-cta] [data-c]', f).forEach((x) => x.addEventListener('click', () => { cta = x.dataset.c; $$('[data-cta] [data-c]', f).forEach((y) => y.classList.toggle('on', y === x)); FX.tap(); }));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const monto = +f.m.value;
        if (!(monto > 0)) return toast('Escribe cuánto pagó', true);
        if (monto > falta + 0.005) return toast(`Solo debe ${money0(falta)}`, true);
        let r = null;
        await run($('button[type=submit]', f), async () => {
          r = await API.rpc('cobrar_credito', { p_venta: +b.dataset.cobrar, p_monto: monto, p_cuenta: cta });
        });
        if (!r) return;
        FX.exito();
        toast(+r.por_cobrar > 0 ? `Cobrado ${money0(monto)} · aún debe ${money0(r.por_cobrar)}` : `Cobrado ${money0(monto)} · ¡${b.dataset.cli} ya no debe nada!`);
        await pintar();
        alCambiar?.();
      });
    }
    await pintar();
  }

  window.Deudores = { aviso, abrir };
})();
