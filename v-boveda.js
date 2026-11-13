/* =====================================================================
   LA BÓVEDA (solo admin): la cuenta del banco en su propio lugar.
   Cerrada muestra el saldo y si está cuadrada; abierta, el libro con saldo corrido,
   las transferencias por verificar y los cuadres.
   ===================================================================== */
const leerSesion = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const guardarSesion = (k, val) => { try { sessionStorage.setItem(k, val); } catch { /* sin almacenamiento */ } };

// "hace 2 h" / "hace 3 días"
const haceTxt = (iso) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 6e4));
  if (min < 60) return min <= 1 ? 'hace un momento' : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

// Sello de la puerta: cuadrado en las últimas 24 h, o desde cuándo no se cuadra
function selloBoveda(u) {
  if (!u) return { ok: false, txt: 'Nunca cuadrado', sub: 'Compara el saldo con tu banca en línea' };
  const horas = (Date.now() - new Date(u.fecha)) / 36e5;
  if (horas <= 24) return { ok: true, txt: '✓ Cuadrado', sub: `${haceTxt(u.fecha)}${u.por ? ` · ${u.por}` : ''}` };
  return { ok: false, txt: 'Sin cuadrar', sub: `último cuadre ${haceTxt(u.fecha)}` };
}

VIEWS['boveda'] = async (v) => {
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const yaAbierta = leerSesion('boveda_abierta') === '1';
  let rango = hoyRango(), d = null, t = null;

  v.innerHTML = `<div class="page-head"><div><h1>Bóveda</h1><div class="muted small">${hoyTxt()} · dónde está el dinero del negocio ahora: en el banco y en efectivo</div></div></div>
    <div class="bv-total" id="bv-total"><div><span class="bv-total-l">Dinero del negocio ahora</span><b id="bv-tot-n">…</b></div><span class="bv-total-eq" id="bv-tot-eq"></span></div>
    <div class="bv-parte-t">🏦 Banco · electrónico</div>
    <section class="bv ${yaAbierta || reducir ? 'abierta sin-anim' : ''}" id="bv" aria-label="Bóveda del banco">
      <div class="bv-caja">
        <div class="bv-marco" aria-hidden="true"></div>
        <div class="bv-dentro"><span class="bv-l">Saldo en el banco</span><b class="bv-n" id="bv-n">…</b><span class="bv-s" id="bv-s"></span></div>
        <button type="button" class="bv-puerta" id="bv-p" aria-controls="bv-in" aria-expanded="false" aria-label="Abrir la bóveda">
          <span class="bv-sello" id="bv-sello"></span>
          <span class="bv-disco" aria-hidden="true"><i></i></span>
          <span class="bv-tag">Bóveda<b id="bv-tn">…</b></span>
        </button>
      </div>
      <div class="bv-lado">
        <div class="bv-res" id="bv-res"></div>
        <div class="bv-acts">
          <button type="button" class="btn btn-primary" id="bv-abrir">Abrir la bóveda</button>
          <button type="button" class="btn" id="bv-cuadrar">🧮 Cuadrar banco</button>
          <a class="btn" href="#/caja?op=ajuste">⚖️ Ajuste</a>
        </div>
      </div>
    </section>
    <div class="bv-parte-t">💵 Efectivo · lo traen los vendedores</div>
    <div class="card bv-efectivo" id="bv-ef"><div class="empty">Cargando…</div></div>
    <div class="bv-in" id="bv-in">
      ${tabsHTML('boveda', [['verif', 'Transferencias'], ['libro', 'Libro del banco'], ['periodo', 'Banco por periodo'], ['cuadres', 'Cuadres']], 'verif')}
      <div data-panel="boveda:libro">
        <div class="card bv-libro">
          <div class="card-head bv-libro-h"><h2>Libro del banco <span class="muted small" id="bv-per"></span></h2>
            <div class="tools">${rangoHTML('hoy', true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']], cal: true })}</div></div>
          <div id="bv-libro"></div>
        </div>
      </div>
      <div data-panel="boveda:verif"><div class="card" id="bv-verif"></div>
        <div class="card bv-conf"><div class="card-head bv-conf-h"><h2>Transferencias confirmadas <span class="muted small" id="bv-conf-per"></span></h2>
          <div class="tools">${rangoHTML('semana', true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']], cal: true })}</div></div>
          <div id="bv-conf"></div></div></div>
      <div data-panel="boveda:periodo"><div class="card"><div class="card-head bv-per-h"><h2>Banco por periodo <span class="muted small" id="bv-per2"></span></h2>
          <div class="tools">${rangoHTML('semana', true, { quick: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']], cal: true })}</div></div>
          <div id="bv-periodo"></div></div></div>
      <div data-panel="boveda:cuadres"><div class="card" id="bv-cuadres"></div></div>
    </div>`;

  const bv = $('#bv', v), puerta = $('#bv-p', v), btnAbrir = $('#bv-abrir', v);
  const pintaPuerta = () => {
    const abierta = bv.classList.contains('abierta');
    puerta.setAttribute('aria-expanded', abierta);
    puerta.setAttribute('aria-label', abierta ? 'Cerrar la bóveda' : 'Abrir la bóveda');
    btnAbrir.textContent = abierta ? 'Cerrar la bóveda' : 'Abrir la bóveda';
    $('#bv-in', v).classList.toggle('visible', abierta);
  };
  const alternar = () => {
    bv.classList.remove('sin-anim');
    const abierta = !bv.classList.contains('abierta');
    bv.classList.toggle('abierta', abierta);
    if (abierta) { guardarSesion('boveda_abierta', '1'); FX.caja(); }
    pintaPuerta();
    if (abierta) setTimeout(() => $('#bv-in', v).scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' }), reducir ? 0 : 700);
  };
  puerta.addEventListener('click', alternar);
  btnAbrir.addEventListener('click', alternar);
  pintaPuerta();
  bindTabs(v, 'boveda', { recordar: true });

  /* ---------- pintar ---------- */
  const pintaArriba = () => {
    const s = selloBoveda(d.ultimo_cuadre);
    $('#bv-n', v).innerHTML = cuenta(d.saldo); animarNumeros($('#bv-n', v));
    $('#bv-tn', v).textContent = money0(d.saldo);
    $('#bv-s', v).textContent = s.ok ? `Cuadrado con tu banca ${s.sub}` : s.sub;
    const sello = $('#bv-sello', v);
    sello.textContent = s.txt; sello.classList.toggle('ok', s.ok);
    const pend = d.por_verificar, totPend = pend.reduce((x, p) => x + +p.monto, 0);
    const hoy = d.hoy;
    $('#bv-res', v).innerHTML = `
      <div class="bv-k"><span>Entró hoy</span><b class="in-t">+${money0(hoy.entro)}</b></div>
      <div class="bv-k"><span>Salió hoy</span><b class="out-t">−${money0(hoy.salio)}</b></div>
      <button type="button" class="bv-k bv-k-btn ${pend.length ? 'warn' : ''}" data-ir-verif><span>Por verificar</span><b>${pend.length ? `${pend.length} · ${money0(totPend)}` : '✓ nada'}</b></button>
      <div class="bv-k ${s.ok ? '' : 'warn'}"><span>Cuadre</span><b>${s.ok ? s.sub : s.txt}</b></div>`;
    $('[data-ir-verif]', v).addEventListener('click', () => {
      if (!bv.classList.contains('abierta')) alternar();
      $('[data-tabs="boveda"] [data-tab="verif"]', v).click();
    });
    const tv = $('[data-tabs="boveda"] [data-tab="verif"]', v);
    tv.innerHTML = `Transferencias${pend.length ? ` <span class="tab-n">${pend.length}</span>` : ''}`;
  };

  const pintaLibro = () => {
    const movs = d.movs; // del más nuevo al más viejo
    const entro = movs.filter((m) => +m.monto > 0).reduce((x, m) => x + +m.monto, 0);
    const salio = movs.filter((m) => +m.monto < 0).reduce((x, m) => x - +m.monto, 0);
    const fin = +d.inicial + entro - salio;
    $('#bv-per', v).textContent = `· ${rango.etiqueta}`;
    const unDia = !!(rango.hoy || rango.dia);
    // agrupado por día de operación (lo de madrugada queda con su noche)
    const dias = [];
    movs.forEach((m) => {
      const k = diaMX(new Date(m.fecha));
      let g = dias[dias.length - 1];
      if (!g || g.k !== k) { g = { k, movs: [], entro: 0, salio: 0 }; dias.push(g); }
      g.movs.push(m); if (+m.monto > 0) g.entro += +m.monto; else g.salio -= +m.monto;
    });
    const diaTxt = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' });
    const fila = (m) => {
      const pos = +m.monto > 0;
      const quien = m.vendedor && !/^Cuadre/.test(m.concepto || '') ? `<small class="muted"> · ${esc(m.vendedor)}</small>` : '';
      return `<tr><td class="bv-h">${hora(m.fecha)}</td>
        <td><b>${esc(tipoDin({ ...m, cuenta: 'banco' }))}</b>${quien}<div class="small muted">${esc(m.concepto || '')}</div></td>
        <td class="num ${pos ? 'in-t' : 'out-t'}">${pos ? '+' : '−'}${money0(Math.abs(+m.monto))}</td>
        <td class="num bv-sal ${+m.saldo < 0 ? 'neg-t' : ''}">${money0(m.saldo)}</td></tr>`;
    };
    $('#bv-libro', v).innerHTML = `
      <div class="bv-sum">
        <div><span>Había al empezar</span><b class="num">${money0(d.inicial)}</b></div>
        <div><span>Entró</span><b class="num in-t">+${money0(entro)}</b></div>
        <div><span>Salió</span><b class="num out-t">−${money0(salio)}</b></div>
        <div><span>${rango.hoy ? 'Ahora' : 'Al cierre'}</span><b class="num ${fin < 0 ? 'neg-t' : ''}">${money0(fin)}</b></div>
      </div>
      ${movs.length ? `<div class="tbl-wrap"><table class="tbl bv-tab">
        <thead><tr><th>Hora</th><th>Movimiento</th><th class="num">Monto</th><th class="num">Saldo</th></tr></thead>
        <tbody>${dias.map((g) => `${unDia ? '' : `<tr class="bv-dia"><td colspan="4"><b>${diaTxt(g.k)}</b><span>entró <b class="in-t">+${money0(g.entro)}</b> · salió <b class="out-t">−${money0(g.salio)}</b></span></td></tr>`}${g.movs.map(fila).join('')}`).join('')}</tbody>
      </table></div>` : `<div class="empty">No hubo movimientos en el banco ${rango.hoy ? 'hoy' : 'en este periodo'}</div>`}
      <div class="small muted bv-nota">El saldo de cada renglón es lo que había en el banco justo después de ese movimiento. ${CORTE_H ? `Lo registrado antes de las ${CORTE_H}:00 a.m. (🌙) cuenta para la noche anterior.` : ''}</div>`;
  };

  const pintaVerif = () => {
    const pend = d.por_verificar;
    $('#bv-verif', v).innerHTML = `<div class="card-head"><h2>Transferencias por verificar</h2><span class="muted small">confírmalas con lo que de verdad llegó a tu banca</span></div>
      ${pend.length ? `<div class="bv-pend">${pend.map((p) => `<div class="bv-pi">
        <div><b>${esc(p.cliente)}</b><div class="small muted">${folio(p.id)} · ${esc(p.vendedor)} · ${fecha(p.fecha)}${p.referencia ? ` · ref ${esc(p.referencia)}` : ''}${+p.extra ? ` · incluye ${money0(p.extra)} de propina` : ''}</div></div>
        <b class="num">${money0(p.monto)}</b>
        <button type="button" class="btn btn-sm btn-primary" data-verif-bv="${p.id}">Verificar</button></div>`).join('')}</div>`
        : '<div class="empty">✓ Todas las transferencias están verificadas</div>'}`;
    $$('[data-verif-bv]', v).forEach((b) => b.addEventListener('click', async () => {
      const p = pend.find((x) => String(x.id) === b.dataset.verifBv);
      if (await verificarRecibido(p.id, +p.monto, p.cliente)) load();
    }));
  };

  const pintaCuadres = () => {
    const cs = d.cuadres;
    $('#bv-cuadres', v).innerHTML = `<div class="card-head"><h2>Cuadres</h2><button type="button" class="btn btn-sm btn-primary" data-cuadrar>🧮 Cuadrar ahora</button></div>
      ${cs.length ? `<div class="bv-cl">${cs.map((c) => {
        const cero = Math.abs(+c.diferencia) < 0.005;
        return `<div class="bv-ci"><span class="bv-ci-e ${cero ? 'ok' : 'dif'}">${cero ? '✓' : '±'}</span>
          <div><b>${cero ? 'Cuadró exacto' : `Ajuste de ${+c.diferencia > 0 ? '+' : '−'}${money0(Math.abs(+c.diferencia))}`}</b>
            <div class="small muted">${fecha(c.fecha)}${c.por ? ` · ${esc(c.por)}` : ''}${+c.saldo ? ` · banca ${money0(c.saldo)}` : ''}</div>
            ${c.concepto ? `<div class="small muted">${esc(c.concepto.replace(/^Cuadre de banco · /, ''))}</div>` : ''}</div></div>`;
      }).join('')}</div>` : '<div class="empty">Todavía no se ha cuadrado el banco. Abre tu banca en línea y compara.</div>'}`;
    $('[data-cuadrar]', v).addEventListener('click', cuadrar);
  };

  // Efectivo: lo que traen los vendedores (no se guarda en oficina) y el total del negocio
  const pintaEfectivo = () => {
    const vs = (t?.vendedores || []).slice().sort((a, b) => +b.en_poder - +a.en_poder);
    const caja = +(t?.caja || 0);
    const resto = caja - vs.reduce((s, x) => s + +x.en_poder, 0);
    $('#bv-tot-n', v).innerHTML = cuenta(+d.saldo + caja);
    $('#bv-tot-eq', v).innerHTML = `🏦 Banco <b>${money0(d.saldo)}</b> &nbsp;+&nbsp; 💵 Efectivo <b>${money0(caja)}</b>`;
    $('#bv-ef', v).innerHTML = `<div class="bv-ef-h"><div><span class="bv-l">Efectivo con vendedores</span><b class="bv-ef-n">${cuenta(caja)}</b></div>
        <span class="small muted">No se guarda en oficina: cada vendedor lo trae hasta que lo deposita al banco.</span></div>
      ${vs.length ? `<div class="holders">${vs.map((x) => `<div class="holder"><span class="mini-ava">${avatar(x)}</span><span>${esc(x.nombre)}${+x.depositado ? `<small class="muted"> · depositó ${money0(x.depositado)} hoy</small>` : ''}</span><b>${money0(x.en_poder)}</b>
        ${+x.en_poder > 0 ? `<a class="btn btn-sm btn-primary" href="#/caja?op=deposito&v=${esc(x.vendedor_id)}">🏧 Depositó</a>` : '<span class="small muted">✓</span>'}</div>`).join('')}
        ${Math.abs(resto) > 0.5 ? `<div class="holder"><span class="mini-ava">?</span><span>Sin vendedor activo<small class="muted"> · efectivo de alguien que ya no vende o sin asignar</small></span><b>${money0(resto)}</b><span></span></div>` : ''}</div>`
        : '<div class="empty">No hay vendedores activos</div>'}
      ${(t?.movimientos || []).some((m) => m.cuenta === 'caja') ? `<details class="cb-box bv-ef-movs"><summary>💵 Movimientos del efectivo de hoy</summary>
        ${tablaMovs(t.movimientos.filter((m) => m.cuenta === 'caja'), hoyRango(), 'hoy')}</details>` : ''}`;
    animarNumeros(v);
  };

  // Transferencias de ventas que ya se confirmaron con la banca
  let rConf = null, nConf = 0;
  const cargarConf = async (r) => {
    rConf = r; const yo = ++nConf;
    $('#bv-conf-per', v).textContent = `· ${r.etiqueta}`;
    const box = $('#bv-conf', v);
    box.classList.add('cargando');
    try {
      const vs = (await API.rpc('ventas_de', { p_desde: r.desde, p_hasta: r.hasta }))
        .filter((x) => !x.anulada && x.verificada && +x.pago_transfer + +x.extra > 0);
      if (yo !== nConf) return;
      const tot = vs.reduce((s, x) => s + +x.pago_transfer + +x.extra, 0);
      box.innerHTML = vs.length ? `<div class="bv-sum bv-sum-2"><div><span>Confirmadas</span><b class="num">${vs.length}</b></div><div><span>Total</span><b class="num in-t">+${money0(tot)}</b></div></div>
        <div class="bv-pend">${vs.map((x) => `<div class="bv-pi">
          <div><b>${esc(x.cliente || 'Sin nombre')}</b><div class="small muted">${folio(x.id)} · ${esc(x.vendedor)} · ${fecha(x.fecha)}${x.referencia ? ` · ref ${esc(x.referencia)}` : ''}${x.verificada_fecha ? ` · ✓ ${fecha(x.verificada_fecha)}` : ''}</div></div>
          <b class="num in-t">${money0(+x.pago_transfer + +x.extra)}</b><span class="badge b-ok">✓</span></div>`).join('')}</div>`
        : `<div class="empty">No hay transferencias confirmadas ${r.hoy ? 'hoy' : 'en este periodo'}</div>`;
    } catch (e) { if (yo === nConf) box.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
    finally { if (yo === nConf) box.classList.remove('cargando'); }
  };

  // El banco en un periodo: con cuánto empezó, qué entró, qué salió y con cuánto cerró
  let nPer = 0;
  const cargarPeriodo = async (r) => {
    const yo = ++nPer;
    $('#bv-per2', v).textContent = `· ${r.etiqueta}`;
    const box = $('#bv-periodo', v);
    box.classList.add('cargando');
    try {
      const h = await API.rpc('tesoreria', { p_desde: r.desde, p_hasta: r.hasta });
      if (yo !== nPer) return;
      box.innerHTML = bancoCuadre(h.banco_periodo, r, true);
    } catch (e) { if (yo === nPer) box.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
    finally { if (yo === nPer) box.classList.remove('cargando'); }
  };

  const cuadrar = () => formCuadreBanco(+d.saldo, { alListo: load });
  $('#bv-cuadrar', v).addEventListener('click', cuadrar);

  /* ---------- datos ---------- */
  async function load() {
    const h = hoyRango();
    const [b, bh, tt] = await Promise.all([
      API.rpc('boveda', { p_desde: rango.desde, p_hasta: rango.hasta }),
      rango.hoy ? null : API.rpc('boveda', { p_desde: h.desde, p_hasta: h.hasta }),
      API.rpc('tesoreria', { p_desde: h.desde, p_hasta: h.hasta }).catch(() => null),
    ]);
    d = b; t = tt;
    const mh = (bh || b).movs;
    d.hoy = { entro: mh.filter((m) => +m.monto > 0).reduce((x, m) => x + +m.monto, 0), salio: mh.filter((m) => +m.monto < 0).reduce((x, m) => x - +m.monto, 0) };
    pintaArriba(); pintaEfectivo(); pintaLibro(); pintaVerif(); pintaCuadres();
    if (rConf) cargarConf(rConf);
  }
  bindRango($('.bv-libro-h', v), (r) => { rango = r; $('#bv-libro', v).classList.add('cargando'); load().finally(() => $('#bv-libro', v).classList.remove('cargando')); });
  await load();
  const leerConf = bindRango($('.bv-conf-h', v), cargarConf);
  cargarConf(leerConf());
  const leerPer = bindRango($('.bv-per-h', v), cargarPeriodo);
  cargarPeriodo(leerPer());
};
