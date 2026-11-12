// Chat del equipo: quién tiene la app abierta y mensajes en tiempo real.
// Producción: Supabase Realtime (presencia + aviso de mensaje nuevo); los mensajes siempre se leen
// y se guardan con funciones protegidas (chat_estado / chat_enviar). Pruebas locales: consulta cada 3 s.
window.Chat = (() => {
  const RT = API.modo === 'supabase';
  let yo = null, ch = null, rtOk = false, timer = null, abierto = false;
  let usuarios = [], mensajes = [], ultimo = 0, ahoraSrv = Date.now(), ahoraLocal = Date.now();
  let enLinea = new Set(), noLeidos = 0, cargando = false, pendiente = false, primera = true;

  const KEY = () => 'chat_leido_' + (yo?.id || '');
  const leido = () => +store.get(KEY(), 0) || 0;
  const marcarLeido = () => { if (ultimo) store.set(KEY(), ultimo); noLeidos = 0; pintarBadge(); };
  const nombreDe = (id) => usuarios.find((u) => u.id === id) || { nombre: '¿?', usuario: '' };
  const hora = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const dia = (f) => {
    const d = new Date(f), h = new Date();
    const ayer = new Date(); ayer.setDate(h.getDate() - 1);
    if (d.toDateString() === h.toDateString()) return 'Hoy';
    if (d.toDateString() === ayer.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  // segundos desde la última señal de un usuario, medidos con el reloj del servidor
  const haceSeg = (u) => !u.visto ? Infinity : ((ahoraSrv + (Date.now() - ahoraLocal)) - new Date(u.visto)) / 1000;
  const conectado = (u) => u.id === yo?.id || (rtOk ? enLinea.has(u.id) : haceSeg(u) < (RT ? 75 : 12));
  const haceTxt = (u) => {
    const s = haceSeg(u);
    if (!isFinite(s)) return 'sin conectarse';
    if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  };
  const ordenados = () => [...usuarios].sort((a, b) => (conectado(b) - conectado(a)) || (b.id === yo.id) - (a.id === yo.id) || a.nombre.localeCompare(b.nombre, 'es'));

  /* ---------- datos ---------- */
  async function cargar() {
    if (!yo) return;
    if (cargando) { pendiente = true; return; }
    cargando = true;
    try {
      const r = await API.rpc('chat_estado', { p_desde: ultimo });
      ahoraSrv = new Date(r.ahora).getTime(); ahoraLocal = Date.now();
      usuarios = r.usuarios || [];
      const nuevos = (r.mensajes || []).filter((m) => m.id > ultimo);
      if (nuevos.length) {
        mensajes = mensajes.concat(nuevos).slice(-300);
        ultimo = mensajes[mensajes.length - 1].id;
        const ajenos = nuevos.filter((m) => m.autor_id !== yo.id && m.id > leido());
        if (abierto && !document.hidden) marcarLeido();
        else if (ajenos.length) {
          noLeidos = mensajes.filter((m) => m.autor_id !== yo.id && m.id > leido()).length;
          if (!primera) FX.hola();
        }
      }
      primera = false;
      pintar(nuevos.length > 0);
    } catch { /* sin internet: se reintenta en la siguiente vuelta */ }
    finally {
      cargando = false;
      if (pendiente) { pendiente = false; cargar(); }
    }
  }

  function programar() {
    clearInterval(timer);
    // con tiempo real solo hace falta un latido; sin él (o en pruebas) se consulta seguido
    const ms = RT && rtOk ? 25000 : (abierto ? 3000 : (RT ? 10000 : 4000));
    timer = setInterval(() => { if (!document.hidden || abierto) cargar(); }, ms);
  }

  function conectarRT() {
    if (!RT) return;
    ch = API.canal('cafe-chat', { config: { presence: { key: yo.id }, broadcast: { self: false } } });
    if (!ch) return;
    ch.on('presence', { event: 'sync' }, () => { enLinea = new Set(Object.keys(ch.presenceState())); pintar(false); })
      .on('broadcast', { event: 'nuevo' }, () => cargar())
      .subscribe(async (st) => {
        const antes = rtOk;
        rtOk = st === 'SUBSCRIBED';
        if (rtOk) { try { await ch.track({ en: Date.now() }); } catch {} cargar(); }
        if (antes !== rtOk) { programar(); pintar(false); }
      });
  }

  async function enviar(txt) {
    const m = await API.rpc('chat_enviar', { p_texto: txt });
    FX.add();
    if (m && m.id > ultimo) { mensajes.push(m); ultimo = m.id; marcarLeido(); pintar(true); }
    if (ch && rtOk) ch.send({ type: 'broadcast', event: 'nuevo', payload: { id: m?.id } }).catch(() => {});
    cargar();
  }

  /* ---------- interfaz ---------- */
  const ava = (u, cls = '') => `<span class="chat-ava ${cls}">${avatar(u)}${cls.includes('con-punto') ? `<i class="chat-dot ${conectado(u) ? 'on' : ''}"></i>` : ''}</span>`;

  function pintarBadge() {
    $$('[data-chat-badge]').forEach((b) => { b.textContent = noLeidos > 9 ? '9+' : noLeidos; b.hidden = !noLeidos; });
    document.title = (noLeidos ? `(${noLeidos}) ` : '') + C.nombre;
  }

  function pintarLado() {
    const box = $('[data-chat-side]');
    if (!box || !yo) return;
    const on = usuarios.filter(conectado);
    box.innerHTML = `<button type="button" class="side-chat-btn" data-chat-abrir>
      <div class="side-chat-h"><span>💬 Chat del equipo</span><b class="chat-badge" data-chat-badge hidden></b></div>
      <div class="side-chat-s"><i class="chat-dot on"></i>${on.length} en línea</div>
      <div class="side-chat-avas">${on.slice(0, 6).map((u) => `<span title="${esc(u.nombre)}">${ava(u)}</span>`).join('')}${on.length > 6 ? `<span class="chat-mas">+${on.length - 6}</span>` : ''}</div>
    </button>`;
    $('[data-chat-abrir]', box).onclick = () => abrir();
  }

  function pintarMensajes(bajar) {
    const lista = $('#chat-lista');
    if (!lista) return;
    const pegado = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    if (!mensajes.length) {
      lista.innerHTML = `<div class="chat-vacio">Todavía no hay mensajes.<br>Escribe el primero 👋</div>`;
      return;
    }
    let html = '', diaPrev = '', autorPrev = '', tPrev = 0;
    for (const m of mensajes) {
      const d = dia(m.fecha);
      if (d !== diaPrev) { html += `<div class="chat-dia"><span>${esc(d)}</span></div>`; diaPrev = d; autorPrev = ''; }
      const mio = m.autor_id === yo.id, t = new Date(m.fecha).getTime();
      const sigue = autorPrev === m.autor_id && t - tPrev < 5 * 60000;
      const u = nombreDe(m.autor_id);
      html += `<div class="chat-m ${mio ? 'mio' : ''} ${sigue ? 'sigue' : ''}">
        ${!mio ? (sigue ? '<span class="chat-ava-esp"></span>' : ava(u)) : ''}
        <div class="chat-b">${!mio && !sigue ? `<div class="chat-autor">${esc(u.nombre)}</div>` : ''}<div class="chat-t">${esc(m.texto)}</div><div class="chat-h">${hora(m.fecha)}</div></div>
      </div>`;
      autorPrev = m.autor_id; tPrev = t;
    }
    lista.innerHTML = html;
    if (bajar || pegado) lista.scrollTop = lista.scrollHeight;
  }

  function pintarGente() {
    const g = $('#chat-gente');
    if (!g) return;
    const on = usuarios.filter(conectado).length;
    $('#chat-sub').textContent = `${on} en línea${rtOk || !RT ? '' : ' · reconectando…'}`;
    g.innerHTML = ordenados().map((u) => `<div class="chat-u ${conectado(u) ? 'on' : ''}" title="${esc(u.nombre)} · ${conectado(u) ? 'en línea' : haceTxt(u)}">
      ${ava(u, 'con-punto')}<span>${u.id === yo.id ? 'Tú' : esc(u.nombre.split(' ')[0])}</span></div>`).join('');
  }

  function pintar(bajar) {
    pintarLado(); pintarBadge();
    if (abierto) { pintarGente(); pintarMensajes(bajar); }
  }

  function abrir() {
    if (abierto) return $('#chat-txt')?.focus();
    abierto = true;
    const w = document.createElement('section');
    w.className = 'chat-win'; w.id = 'chat-win';
    w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Chat del equipo');
    w.innerHTML = `<header class="chat-top">
        <div><b>Chat del equipo</b><small id="chat-sub"></small></div>
        <button type="button" class="icon-btn" data-chat-cerrar aria-label="Cerrar chat">✕</button>
      </header>
      <div class="chat-gente" id="chat-gente"></div>
      <div class="chat-lista" id="chat-lista" aria-live="polite"></div>
      <form class="chat-form" id="chat-form">
        <textarea id="chat-txt" rows="1" maxlength="1000" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>
        <button class="btn btn-primary" type="submit" aria-label="Enviar">Enviar</button>
      </form>`;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('on'));
    FX.abrir();
    const txt = $('#chat-txt', w), form = $('#chat-form', w);
    const crecer = () => { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 120) + 'px'; };
    txt.addEventListener('input', crecer);
    txt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
      if (e.key === 'Escape') cerrar();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = txt.value.trim();
      if (!t) return;
      const btn = $('button', form);
      btn.disabled = true;
      try { await enviar(t); txt.value = ''; crecer(); }
      catch (err) { toast(err.message, true); }
      finally { btn.disabled = false; txt.focus(); }
    });
    $('[data-chat-cerrar]', w).onclick = cerrar;
    marcarLeido();
    pintar(true);
    programar();
    cargar();
    if (matchMedia('(min-width: 1024px)').matches) txt.focus();
  }

  function cerrar() {
    const w = $('#chat-win');
    abierto = false;
    if (w) { w.classList.remove('on'); setTimeout(() => w.remove(), 200); FX.cerrar(); }
    programar();
  }

  document.addEventListener('visibilitychange', () => {
    if (!yo) return;
    if (!document.hidden) { cargar(); if (abierto) marcarLeido(); }
  });

  return {
    // se llama cada vez que se dibuja el armazón de la app
    montar() {
      if (!ME) return;
      if (yo && yo.id !== ME.id) this.parar();
      $$('[data-chat-top]').forEach((b) => { b.onclick = () => abrir(); });
      if (!yo) {
        yo = ME; mensajes = []; ultimo = 0; primera = true;
        conectarRT();
        programar();
        cargar();
      }
      pintar(false);
    },
    parar() {
      clearInterval(timer); timer = null;
      if (ch) { API.quitarCanal(ch); ch = null; }
      rtOk = false; enLinea = new Set();
      $('#chat-win')?.remove(); abierto = false;
      yo = null; usuarios = []; mensajes = []; ultimo = 0; noLeidos = 0;
      document.title = C.nombre;
    },
  };
})();
