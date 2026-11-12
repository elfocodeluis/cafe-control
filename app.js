/* =====================================================================
   Café · Control — núcleo: utilidades, efectos, avatares, navegación
   Las pantallas viven en v-*.js
   ===================================================================== */
const C = window.APP_CONFIG;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const money = (n) => MXN.format(Number(n) || 0);
const money0 = (n) => MXN.format(Math.round(Number(n) || 0)).replace(/\.00$/, '');
const fnum = (n, d = 0) => (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: d });
const cant = (v, modo) => {
  v = Number(v) || 0;
  if (modo === 'piezas') return `${fnum(v)} pz`;
  return Math.abs(v) >= 1000 ? `${fnum(v / 1000, 3)} kg` : `${fnum(v, 1)} g`;
};
const fecha = (iso) => new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const hora = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const fechaDia = (iso) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const folio = (id) => '#' + String(id).padStart(4, '0');
const GRAMOS_14 = 500 / 35;
const es14 = (g) => g && Math.abs(Number(g) - GRAMOS_14) < 0.001;
const CAT_ICO = { cafe: '☕', premium: '✨', capsula: '🟤', capsula_vps: '🟣', filtro: '📄', alimentos: '🍫', otro: '📦' };
const CAT = { cafe: 'Café', premium: 'Premium', capsula: 'Cápsulas PRE', capsula_vps: 'Cápsulas VPS', filtro: 'Filtros LSB', alimentos: 'Alimentos', otro: 'Otro' };
const TIPOS_VENTA = { tienda: 'Tienda', local: 'Envío local', paqueteria: 'Paquetería' };
const ROLES = { admin: 'Administrador', produccion: 'Producción', vendedor: 'Vendedor' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let ME = null;
const app = $('#app');

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
const ES_SESION = /sesi[oó]n|jwt|no autenticad/i;

/* ---------- toasts, modales ---------- */
function toast(msg, err = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = `<span class="toast-i">${err ? '!' : '✓'}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  if (err) FX.error();
  const quitar = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  t.addEventListener('click', quitar);
  setTimeout(quitar, err ? 6000 : 3500);
}

async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message, true); }
  finally { if (btn) btn.disabled = false; }
}

const dlg = $('#modal');
// cierre con animación: dlg.close() espera a que termine la salida
const cerrarYa = HTMLDialogElement.prototype.close;
let cierreT = null;
dlg.close = function (rv) {
  if (!dlg.open || cierreT) return;
  if (REDUCE.matches) return cerrarYa.call(dlg, rv);
  dlg.classList.add('cerrando');
  FX.cerrar();
  cierreT = setTimeout(() => { cierreT = null; dlg.classList.remove('cerrando'); cerrarYa.call(dlg, rv); }, 180);
};
function modal(html, ancho = false) {
  if (cierreT) { clearTimeout(cierreT); cierreT = null; dlg.classList.remove('cerrando'); cerrarYa.call(dlg); }
  if (dlg.open) cerrarYa.call(dlg);
  dlg.classList.toggle('wide', ancho);
  dlg.innerHTML = `<div class="modal-body"><button type="button" class="modal-x" data-close aria-label="Cerrar">✕</button>${html}</div>`;
  dlg.showModal();
  FX.abrir();
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  return dlg;
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close(); });
function confirmar(titulo, texto, ok = 'Confirmar', peligro = false) {
  return new Promise((resolve) => {
    modal(`<h2>${esc(titulo)}</h2><div class="muted" style="margin:8px 0 18px;white-space:pre-line">${esc(texto)}</div>
      <div class="modal-actions"><button class="btn" data-no>Regresar</button>
      <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-si>${esc(ok)}</button></div>`);
    let fin = false;
    const done = (v) => { if (fin) return; fin = true; dlg.close(); resolve(v); };
    $('[data-si]', dlg).onclick = () => done(true);
    $('[data-no]', dlg).onclick = () => done(false);
    dlg.addEventListener('close', () => done(false), { once: true });
  });
}

/* ---------- efectos: sonido, confeti, botones ---------- */
const FX = (() => {
  let ctx = null, master = null, wet = null;
  const on = () => store.get('sonido', true);
  // mezcla: compresor suave + un eco corto y apagado que da "cuerpo" sin ensuciar
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp).connect(ctx.destination);
    const dl = ctx.createDelay(); dl.delayTime.value = 0.11;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    wet = ctx.createGain(); wet.gain.value = 0.2;
    wet.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
    return ctx;
  }
  function nota(freq, { dur = 0.12, type = 'sine', vol = 0.05, delay = 0, attack = 0.006, glide = 0, send = true } = {}) {
    if (!on()) return;
    try {
      if (!init()) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + delay + 0.005;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      if (send && wet) g.connect(wet);
      o.start(t); o.stop(t + dur + 0.05);
    } catch {}
  }
  // "pluck": seno + octava muy baja en triángulo → suena a marimba suave
  const pluck = (f, delay = 0, vol = 0.05, dur = 0.2) => { nota(f, { delay, vol, dur }); nota(f * 2, { delay, vol: vol * 0.22, dur: dur * 0.55, type: 'triangle' }); };
  function ruido(dur = 0.18, vol = 0.02, f0 = 600, f1 = 2400) {
    if (!on()) return;
    try {
      if (!init()) return;
      const t = ctx.currentTime + 0.005, n = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((i / n) * Math.PI);
      const s = ctx.createBufferSource(); s.buffer = b;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); g.gain.value = vol;
      s.connect(bp).connect(g).connect(master); s.start(t);
    } catch {}
  }
  function confeti(n = 140) {
    if (REDUCE.matches) return;
    const cv = document.createElement('canvas');
    cv.className = 'confeti';
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    const cols = ['#6b4430', '#b5772f', '#e0a35c', '#2f7d4f', '#f3e6d8', '#c98f62', '#285e8e'];
    const ps = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
      col: cols[(Math.random() * cols.length) | 0], bean: Math.random() < 0.25,
    }));
    const t0 = performance.now();
    (function frame(t) {
      const k = (t - t0) / 1800;
      c.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.globalAlpha = Math.max(0, 1 - k);
        c.fillStyle = p.bean ? '#6b4430' : p.col;
        if (p.bean) { c.beginPath(); c.ellipse(0, 0, p.r * 0.8, p.r * 1.1, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#f3e6d8'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -p.r); c.quadraticCurveTo(-2, 0, 0, p.r); c.stroke(); }
        else c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        c.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }
  return {
    on,
    toggle() { store.set('sonido', !on()); if (on()) { pluck(660); pluck(990, 0.08); } },
    tap: () => nota(1250, { dur: 0.035, vol: 0.016, type: 'triangle', send: false }),
    nav: () => { pluck(587, 0, 0.026, 0.14); pluck(880, 0.055, 0.022, 0.18); },
    add: () => { pluck(784, 0, 0.045); pluck(1175, 0.06, 0.04); },
    quitar: () => { pluck(659, 0, 0.032); pluck(494, 0.06, 0.028); },
    error: () => { nota(330, { dur: 0.16, type: 'triangle', vol: 0.05 }); nota(247, { dur: 0.26, type: 'triangle', vol: 0.05, delay: 0.12 }); },
    exito() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => pluck(f, i * 0.07, 0.05, 0.4)); nota(2093, { delay: 0.3, vol: 0.014, dur: 0.6 }); },
    caja() { nota(1568, { dur: 0.08, vol: 0.04, type: 'triangle' }); nota(2093, { dur: 0.4, vol: 0.045, delay: 0.07 }); nota(2637, { dur: 0.45, vol: 0.02, delay: 0.13 }); },
    cesta() { pluck(523, 0, 0.05); pluck(784, 0.06, 0.045); pluck(1047, 0.12, 0.04, 0.35); },
    abrir: () => ruido(0.16, 0.016, 500, 2200),
    cerrar: () => ruido(0.12, 0.01, 1800, 500),
    swOn: () => { nota(880, { dur: 0.06, vol: 0.03 }); nota(1320, { dur: 0.09, vol: 0.03, delay: 0.05 }); },
    swOff: () => { nota(660, { dur: 0.06, vol: 0.03 }); nota(440, { dur: 0.09, vol: 0.03, delay: 0.05 }); },
    hola() { nota(523, { dur: 0.1, vol: 0.04, glide: 1.5 }); nota(988, { dur: 0.16, vol: 0.035, delay: 0.1, glide: 1.25 }); },
    confeti,
    fiesta(n) { this.exito(); confeti(n); },
  };
})();

// efecto "hundir" + onda + clic en todo lo que se puede tocar
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .tile, .chip, .seg button, .ava-pick, .kpi.click, .op, .pick, .tabs button, .nav a, .icon-btn');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'ripple';
  const d = Math.max(r.width, r.height) * 1.2;
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s);
  setTimeout(() => s.remove(), 600);
  FX.tap();
});
// los interruptores suenan distinto al prender y al apagar
document.addEventListener('change', (e) => {
  if (e.target.matches?.('.sw input, .chk input[type=checkbox]')) (e.target.checked ? FX.swOn : FX.swOff)();
});

/* ---------- avatares 3D vivos ----------
   Cada personaje está armado en capas (torso → cabeza → cara → pupilas) con degradados
   que le dan volumen. Las capas se mueven distinto según el puntero (paralaje), respiran,
   parpadean y hacen gestos. Vicente le da tragos a su cola y Rola mordidas a su hamburguesa. */
const AVA_DEFS = `<svg class="ava-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <radialGradient id="g-gloss" cx="32%" cy="18%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="g-vig" cx="50%" cy="45%" r="62%"><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
  <radialGradient id="g-beard" cx="45%" cy="30%" r="80%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ecece7"/><stop offset="1" stop-color="#cfcfc8"/></radialGradient>
  <radialGradient id="gv-bg" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="#f2f8fd"/><stop offset="1" stop-color="#bcd3e6"/></radialGradient>
  <radialGradient id="gv-skin" cx="40%" cy="32%" r="78%"><stop offset="0" stop-color="#fff3e8"/><stop offset=".55" stop-color="#f8dcc6"/><stop offset="1" stop-color="#e6b797"/></radialGradient>
  <radialGradient id="gv-beard" cx="45%" cy="30%" r="80%"><stop offset="0" stop-color="#3b3330"/><stop offset=".6" stop-color="#231c1a"/><stop offset="1" stop-color="#120e0d"/></radialGradient>
  <linearGradient id="gv-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5287b0"/><stop offset="1" stop-color="#25496a"/></linearGradient>
  <linearGradient id="gv-cap" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#e5584a"/><stop offset="1" stop-color="#a32d1d"/></linearGradient>
  <linearGradient id="gv-brim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b2382a"/><stop offset="1" stop-color="#741f14"/></linearGradient>
  <linearGradient id="gv-can" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9e1418"/><stop offset=".35" stop-color="#e3262c"/><stop offset=".6" stop-color="#f04a4f"/><stop offset="1" stop-color="#8f1115"/></linearGradient>
  <radialGradient id="gr-bg" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="#f5f7ef"/><stop offset="1" stop-color="#cbd8bf"/></radialGradient>
  <linearGradient id="gr-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8459"/><stop offset="1" stop-color="#3d4d30"/></linearGradient>
  <radialGradient id="gr-skin" cx="40%" cy="32%" r="78%"><stop offset="0" stop-color="#e8b88f"/><stop offset=".6" stop-color="#cd9367"/><stop offset="1" stop-color="#a66c45"/></radialGradient>
  <linearGradient id="gr-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9c4be"/><stop offset=".5" stop-color="#8d8680"/><stop offset="1" stop-color="#57504b"/></linearGradient>
  <radialGradient id="gp-bg" cx="35%" cy="28%" r="90%"><stop offset="0" stop-color="#3a4a78"/><stop offset=".6" stop-color="#1c2445"/><stop offset="1" stop-color="#0c1026"/></radialGradient>
  <radialGradient id="gp-skin" cx="40%" cy="32%" r="78%"><stop offset="0" stop-color="#f6d2b3"/><stop offset=".6" stop-color="#e2ad86"/><stop offset="1" stop-color="#c08560"/></radialGradient>
  <linearGradient id="gp-robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a36"/><stop offset="1" stop-color="#4a2c17"/></linearGradient>
  <linearGradient id="gp-tunic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e6cf"/><stop offset="1" stop-color="#cdbb98"/></linearGradient>
  <linearGradient id="gp-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5a33"/><stop offset="1" stop-color="#4d2e17"/></linearGradient>
  <linearGradient id="gp-hilt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f757c"/><stop offset=".45" stop-color="#e9edf1"/><stop offset="1" stop-color="#5d6268"/></linearGradient>
  <radialGradient id="gr-bun"cx="40%" cy="25%" r="80%"><stop offset="0" stop-color="#f2be72"/><stop offset=".7" stop-color="#d98f3c"/><stop offset="1" stop-color="#b06d26"/></radialGradient>
</defs></svg>`;

const ojo = (x, y, r = 2.6) => `<g class="ava-ojo"><ellipse cx="${x}" cy="${y}" rx="${r + 1.7}" ry="${r + 2}" fill="#fff"/><g class="ava-pupil"><circle cx="${x}" cy="${y + 0.4}" r="${r}" fill="#2a1f18"/><circle cx="${x + 0.9}" cy="${y - 0.6}" r=".9" fill="#fff"/></g></g>`;

const AVATARES = {
  // Vicente: piel clara, cabello y barba negros, lentes, gorra roja y su cola de lata
  vicente: `<svg viewBox="0 0 120 120" class="ava ava-v" aria-hidden="true">
    <circle cx="60" cy="60" r="60" fill="url(#gv-bg)"/>
    <g class="ava-rig">
      <g class="ava-torso">
        <path d="M16 124c4-24 22-31 44-31s40 7 44 31z" fill="url(#gv-shirt)"/>
        <path d="M47 93l13 13 13-13z" fill="#1f4060"/><path d="M60 106v18" stroke="#1f4060" stroke-width="1.4"/>
        <circle cx="60" cy="112" r="1.3" fill="#9fc0dc"/><circle cx="60" cy="119" r="1.3" fill="#9fc0dc"/>
      </g>
      <g class="ava-head"><g class="ava-hidle">
        <ellipse cx="60" cy="92" rx="15" ry="4" fill="#000" opacity=".14"/>
        <ellipse cx="34" cy="64" rx="5.5" ry="7.5" fill="url(#gv-skin)"/><ellipse cx="86" cy="64" rx="5.5" ry="7.5" fill="url(#gv-skin)"/>
        <path d="M33 61q2 3 0 6M87 61q-2 3 0 6" stroke="#d9a07c" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <ellipse cx="60" cy="63" rx="26" ry="29" fill="url(#gv-skin)"/>
        <path d="M34.5 50q-2 9 0 17l4-1q-1.5-8 0-15zM85.5 50q2 9 0 17l-4-1q1.5-8 0-15z" fill="#1a1413"/>
        <path d="M34 64q0 38 26 40q26-2 26-40q-5 12-14 12q-6-5-12-5t-12 5q-9 0-14-12z" fill="url(#gv-beard)"/>
        <g class="ava-face">
          <path class="ava-cejas" d="M43.5 53.5q6.5-4.5 13-.5M63.5 53q6.5-4 13 .5" stroke="#1a1413" stroke-width="3.6" fill="none" stroke-linecap="round"/>
          <g class="ava-eyes">${ojo(50, 61.5)}${ojo(70, 61.5)}</g>
          <g fill="none" stroke="#1a1413" stroke-width="2.1"><rect x="41.5" y="55" width="17" height="13" rx="5"/><rect x="61.5" y="55" width="17" height="13" rx="5"/><path d="M58.5 60.5q1.5-1.6 3 0M41.5 59l-6-1.5M78.5 59l6-1.5"/></g>
          <path d="M44 58.5q3-2 6-1.4M64 58.5q3-2 6-1.4" stroke="#fff" stroke-opacity=".6" stroke-width="1.3" fill="none" stroke-linecap="round"/>
          <path d="M59 64q-3.5 7 1 9.5q3 .5 4.5-1.5" stroke="#d29a78" stroke-width="2" fill="none" stroke-linecap="round"/>
          <circle cx="44" cy="72" r="4.2" fill="#f2a28a" opacity=".38"/><circle cx="76" cy="72" r="4.2" fill="#f2a28a" opacity=".38"/>
          <path d="M46.5 77.5q13.5-7.5 27 0q-13.5 5.5-27 0z" fill="#1a1413"/>
          <path class="ava-boca" d="M54 83q6 4.5 12 0" stroke="#e8b4a0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          <path class="ava-risa" d="M53 82q7 1 14 0q-1 7-7 7t-7-7z" fill="#7a2f1d"/>
        </g>
        <path d="M32 52q0-28 28-28t28 28z" fill="url(#gv-cap)"/>
        <path d="M60 24.5v27M46 27q-4 12-4 25M74 27q4 12 4 25" stroke="#8a2517" stroke-width=".9" fill="none" opacity=".45"/>
        <ellipse cx="60" cy="41" rx="4" ry="5.6" fill="#f6e3cf"/><path d="M60 35.8c-2 3.2 2 7.2 0 10.4" stroke="#a8301f" stroke-width="1.3" fill="none"/>
        <path d="M30 52q30-9 60 0q9 2 19 5.5q-3 5.5-19 2.5q-30-6-60 0z" fill="url(#gv-brim)"/>
        <path d="M41 35q9-8 21-7.5" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="60" cy="25" r="3" fill="#8a2517"/>
      </g></g>
      <g class="ava-cup">
        <g class="ava-burbujas" fill="#fff"><circle cx="86" cy="86" r="1.2"/><circle cx="89.5" cy="85" r=".9"/><circle cx="87.5" cy="85.5" r=".7"/></g>
        <rect x="80" y="89.5" width="15" height="21.5" rx="2.6" fill="url(#gv-can)"/>
        <path d="M80 99.5q4-3 7.5 0t7.5 0v3.2q-4-3-7.5 0t-7.5 0z" fill="#fff" opacity=".92"/>
        <rect x="82.2" y="92" width="1.8" height="17" rx=".9" fill="#fff" opacity=".35"/>
        <ellipse cx="87.5" cy="89.6" rx="7.5" ry="2" fill="#dfe3e7"/><ellipse cx="87.5" cy="89.4" rx="5.4" ry="1.2" fill="#a8aeb4"/>
        <path d="M86 88.9h3.2" stroke="#7d848a" stroke-width="1.2" stroke-linecap="round"/>
        <ellipse cx="88" cy="111" rx="8" ry="5.5" fill="url(#gv-skin)"/>
        <path d="M82 109.5q6 2 12 0" stroke="#d9a07c" stroke-width="1" fill="none"/>
      </g>
    </g>
    <circle cx="60" cy="60" r="60" fill="url(#g-vig)"/>
    <circle class="ava-gloss" cx="60" cy="60" r="60" fill="url(#g-gloss)"/>
  </svg>`,
  // Rola: moreno claro, cejas gruesas, cabello peinado hacia atrás con canas, candado blanco y su hamburguesa
  rola: `<svg viewBox="0 0 120 120" class="ava ava-r" aria-hidden="true">
    <circle cx="60" cy="60" r="60" fill="url(#gr-bg)"/>
    <g class="ava-rig">
      <g class="ava-torso">
        <path d="M16 124c4-24 22-31 44-31s40 7 44 31z" fill="url(#gr-top)"/>
        <path d="M50 93l10 10 10-10z" fill="url(#gr-skin)"/>
        <path d="M46 93.5l14 11-3.5 4.5L44 97zM74 93.5l-14 11 3.5 4.5L76 97z" fill="#55693f"/>
        <circle cx="60" cy="114" r="1.3" fill="#c5d3b4"/><circle cx="60" cy="120" r="1.3" fill="#c5d3b4"/>
      </g>
      <g class="ava-head"><g class="ava-hidle">
        <ellipse cx="60" cy="92" rx="15" ry="4" fill="#000" opacity=".16"/>
        <ellipse cx="35" cy="65" rx="5.5" ry="7.5" fill="url(#gr-skin)"/><ellipse cx="85" cy="65" rx="5.5" ry="7.5" fill="url(#gr-skin)"/>
        <path d="M34 62q2 3 0 6M86 62q-2 3 0 6" stroke="#9a6140" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <ellipse cx="60" cy="65" rx="25" ry="28" fill="url(#gr-skin)"/>
        <path d="M34.5 62q-4-34 25.5-35q29.5 1 25.5 35q-2-11-6-16q-8-5-19.5-5t-19.5 5q-4 5-6 16z" fill="url(#gr-hair)"/>
        <path d="M43 40q8-6 18-6.5M49 37.5q9-4.5 20-2M63 34.5q10 1.5 15 8M40 46q5-6 13-9" stroke="#efedea" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".85"/>
        <path d="M35 62q-1.5-8 1.5-14l3.5 1.5q-2 6-1 12.5zM85 62q1.5-8-1.5-14l-3.5 1.5q2 6 1 12.5z" fill="#e3e0dc"/>
        <g class="ava-face">
          <path class="ava-cejas" d="M42.5 56q7-5 14-.8M63.5 55.2q7-4.2 14 .8" stroke="#2b2420" stroke-width="4.6" fill="none" stroke-linecap="round"/>
          <g class="ava-eyes">${ojo(50, 63.5, 2.5)}${ojo(70, 63.5, 2.5)}</g>
          <path d="M59.5 66q-3 6.5 .5 8.5q2.6.4 4-1.3" stroke="#8c5434" stroke-width="2" fill="none" stroke-linecap="round"/>
          <circle cx="44" cy="74" r="4.3" fill="#c96a52" opacity=".3"/><circle cx="76" cy="74" r="4.3" fill="#c96a52" opacity=".3"/>
          <path fill-rule="evenodd" fill="url(#g-beard)" d="M46.5 79q13.5-7 27 0q0 4.5-3.5 5q-.5 9.5-10 10.5q-9.5-1-10-10.5q-3.5-.5-3.5-5zM53.5 82.5q6.5 2.5 13 0q-1 5.5-6.5 5.5t-6.5-5.5z"/>
          <path class="ava-boca" d="M54.5 84q5.5 3 11 0" stroke="#6b2f1c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <path class="ava-risa" d="M53.8 83q6.2 1 12.4 0q-1 5.5-6.2 5.5t-6.2-5.5z" fill="#4a1c0c"/>
        </g>
      </g></g>
      <g class="ava-burger">
        <path d="M21 104h22q0 5.5-3 6.5H24q-3-1-3-6.5z" fill="#d48a3a"/>
        <rect x="20" y="99.6" width="24" height="4.8" rx="2.3" fill="#5b2e18"/>
        <path d="M21 99.6h22l-2.6 3.2-3-2.2-3 3-3-3-3 2.6-3-2.6-2.8 2.2z" fill="#f6c431"/>
        <path d="M20 98.2q3-2.2 6 0t6 0 6 0 6 0v1.8H20z" fill="#79b544"/>
        <path d="M20.5 98.4q0-10.4 11.5-10.4t11.5 10.4z" fill="url(#gr-bun)"/>
        <g fill="#fff4da"><ellipse cx="27" cy="93" rx="1.1" ry=".6"/><ellipse cx="32" cy="91" rx="1.1" ry=".6"/><ellipse cx="37" cy="93.4" rx="1.1" ry=".6"/><ellipse cx="31" cy="95.4" rx="1.1" ry=".6"/></g>
        <path d="M24.5 92q3-3 7-3.4" stroke="#fff" stroke-opacity=".45" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <ellipse cx="32" cy="111.5" rx="8" ry="5.5" fill="url(#gr-skin)"/>
        <path d="M26 110q6 2 12 0" stroke="#9a6140" stroke-width="1" fill="none"/>
      </g>
    </g>
    <circle cx="60" cy="60" r="60" fill="url(#g-vig)"/>
    <circle class="ava-gloss" cx="60" cy="60" r="60" fill="url(#g-gloss)"/>
  </svg>`,
  // Padawan: aprendiz jedi con túnica, capucha caída, trencita de aprendiz y su sable de luz verde
  padawan: `<svg viewBox="0 0 120 120" class="ava ava-p" aria-hidden="true">
    <circle cx="60" cy="60" r="60" fill="url(#gp-bg)"/>
    <g class="ava-estrellas" fill="#fff"><circle cx="18" cy="30" r=".9"/><circle cx="28" cy="16" r=".6"/><circle cx="96" cy="22" r=".8"/><circle cx="106" cy="44" r=".6"/><circle cx="14" cy="54" r=".6"/><circle cx="84" cy="10" r=".5"/><circle cx="40" cy="9" r=".5"/></g>
    <g class="ava-rig">
      <g class="ava-torso">
        <path d="M14 124c4-25 23-33 46-33s42 8 46 33z" fill="url(#gp-robe)"/>
        <path d="M30 98q30-14 60 0q-6 7-30 7t-30-7z" fill="#6b4226"/>
        <path d="M46 93l14 31 14-31q-7 3-14 3t-14-3z" fill="url(#gp-tunic)"/>
        <path d="M46 93l14 18M74 93l-14 18" stroke="#b9a37c" stroke-width="1.3" fill="none"/>
        <rect x="47" y="116" width="26" height="5" rx="1.5" fill="#5a3a22"/>
      </g>
      <g class="ava-head"><g class="ava-hidle">
        <ellipse cx="60" cy="92" rx="15" ry="4" fill="#000" opacity=".22"/>
        <ellipse cx="35" cy="64" rx="5.5" ry="7.5" fill="url(#gp-skin)"/><ellipse cx="85" cy="64" rx="5.5" ry="7.5" fill="url(#gp-skin)"/>
        <path d="M34 61q2 3 0 6M86 61q-2 3 0 6" stroke="#b77a55" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M84 66q4 10 1 22" stroke="#6b4223" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <path d="M83.6 70l2.6 1.4M84.6 75l2.6 1.4M85 80l2.6 1.4M84.6 85l2.6 1.2" stroke="#3e2410" stroke-width="1" stroke-linecap="round"/>
        <ellipse cx="60" cy="64" rx="25" ry="28" fill="url(#gp-skin)"/>
        <path d="M35 60q-3-31 25-32q28 1 25 32q-3-10-8-14q-3 4-9 4q-6-1-8-5q-3 5-10 5q-5 0-7-4q-5 4-8 14z" fill="url(#gp-hair)"/>
        <path d="M45 36q8-5 18-5" stroke="#b07a4c" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
        <g class="ava-face">
          <path class="ava-cejas" d="M43.5 55q6-3.5 12-.6M64.5 54.4q6-2.9 12 .6" stroke="#5a361b" stroke-width="2.8" fill="none" stroke-linecap="round"/>
          <g class="ava-eyes">${ojo(50, 62.5)}${ojo(70, 62.5)}</g>
          <path d="M59.5 65q-3 6 .5 8q2.6.4 4-1.2" stroke="#c48a64" stroke-width="2" fill="none" stroke-linecap="round"/>
          <circle cx="44" cy="73" r="4.3" fill="#f0927a" opacity=".38"/><circle cx="76" cy="73" r="4.3" fill="#f0927a" opacity=".38"/>
          <path class="ava-boca" d="M53.5 80q6.5 4.5 13 0" stroke="#a5523e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          <path class="ava-risa" d="M53 79.5q7 1 14 0q-1 7-7 7t-7-7z" fill="#7a2f1d"/>
        </g>
      </g></g>
      <g class="ava-sable">
        <g class="ava-hoja">
          <rect x="85.2" y="44" width="7.6" height="54" rx="3.8" fill="#5dff7a" opacity=".22"/>
          <rect x="86.6" y="45" width="4.8" height="53" rx="2.4" fill="#57f46f" opacity=".75"/>
          <rect x="87.8" y="46" width="2.4" height="52" rx="1.2" fill="#f2fff3"/>
        </g>
        <rect x="85.5" y="97" width="7" height="15" rx="1.4" fill="url(#gp-hilt)"/>
        <path d="M85.5 101h7M85.5 104h7M85.5 107h7" stroke="#3b3f44" stroke-width="1"/>
        <rect x="84.6" y="96" width="8.8" height="2.6" rx="1" fill="#2f3337"/>
        <circle cx="91.2" cy="99.6" r=".9" fill="#e5463b"/>
        <ellipse cx="89" cy="109" rx="7.5" ry="5.5" fill="url(#gp-skin)"/>
        <path d="M83.5 107.5q5.5 2 11 0" stroke="#b77a55" stroke-width="1" fill="none"/>
      </g>
    </g>
    <circle cx="60" cy="60" r="60" fill="url(#g-vig)"/>
    <circle class="ava-gloss" cx="60" cy="60" r="60" fill="url(#g-gloss)"/>
  </svg>`,
};
const COLORES_AVA = [['#8a5a3c', '#5b3a26'], ['#3d77a8', '#244a6b'], ['#3f8a5e', '#25563a'], ['#c08a3e', '#7f5718'], ['#a24c7c', '#66294b']];
function avatar(p) {
  const key = (p.usuario || p.nombre || '').toLowerCase().split(/\s/)[0];
  if (AVATARES[key]) return AVATARES[key];
  const ini = esc(((p.nombre || '?').trim()[0] || '?').toUpperCase());
  const [c1, c2] = COLORES_AVA[[...String(p.nombre || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES_AVA.length];
  return `<svg viewBox="0 0 120 120" class="ava" aria-hidden="true" style="background:radial-gradient(circle at 35% 28%, ${c1}, ${c2})">
    <g class="ava-rig"><g class="ava-head"><text x="60" y="77" text-anchor="middle" font-size="50" font-weight="700" fill="#fff" font-family="Inter,system-ui">${ini}</text></g></g>
    <circle class="ava-gloss" cx="60" cy="60" r="60" fill="url(#g-gloss)"/></svg>`;
}

// Motor de los avatares vivos: miran hacia el puntero; si no hay puntero, miran alrededor solos
const AVA_VIVO = '.ava-wrap, .hola-ava, .lado-ava, .cmp-ava, .who-ava, .side-ava, .dash-ava';
const AvaVivo = (() => {
  let px = innerWidth / 2, py = innerHeight / 3, raf = 0, quieto = 0;
  function mirar() {
    raf = 0;
    $$(AVA_VIVO).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
      const dx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (innerWidth * 0.42)));
      const dy = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / (innerHeight * 0.42)));
      el.style.setProperty('--px', dx.toFixed(3));
      el.style.setProperty('--py', dy.toFixed(3));
    });
  }
  const pedir = () => { if (!raf) raf = requestAnimationFrame(mirar); };
  addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; px = e.clientX; py = e.clientY; quieto = performance.now(); pedir(); }, { passive: true });
  addEventListener('scroll', pedir, { passive: true });
  // sin puntero (celular o mouse quieto): echan un vistazo a otro lado cada tanto
  setInterval(() => {
    if (document.hidden || REDUCE.matches || performance.now() - quieto < 3500) return;
    px = innerWidth * (0.15 + Math.random() * 0.7); py = innerHeight * (0.1 + Math.random() * 0.6); pedir();
  }, 2200);
  // gestos al azar: guiño, cejas, sonrisa
  setInterval(() => {
    if (document.hidden || REDUCE.matches) return;
    const vis = $$(AVA_VIVO).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 26 && r.bottom > 0 && r.top < innerHeight; });
    if (!vis.length) return;
    const el = vis[(Math.random() * vis.length) | 0];
    const g = ['guino', 'cejas', 'sonrie'][(Math.random() * 3) | 0];
    el.classList.add(g); setTimeout(() => el.classList.remove(g), 1100);
  }, 4200);
  // al tocar un avatar: brinca, sonríe y saluda
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.(AVA_VIVO);
    if (!el) return;
    el.classList.remove('salta'); void el.offsetWidth; el.classList.add('salta');
    FX.hola(); setTimeout(() => el.classList.remove('salta'), 900);
  });
  return { mirar: pedir };
})();

const logo = (size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="32" rx="18" ry="25" fill="#f3e6d8"/><path d="M32 9c-8 13 8 33 0 46" stroke="#6b4430" stroke-width="4" fill="none"/></svg>`;

// Fechas siempre en hora de Ciudad de México (UTC−6, sin horario de verano desde 2022),
// igual que el servidor, aunque el teléfono tenga otra zona horaria.
const TZ = 'America/Mexico_City';
const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const diaMX = (d = new Date()) => FMT_DIA.format(d);                       // 'AAAA-MM-DD'
const masDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoMX = (dia) => new Date(dia + 'T00:00:00-06:00').toISOString();    // inicio de ese día en México
const dowMX = (dia) => (new Date(dia + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = lunes
const rangoHoy = () => { const h = diaMX(); return { clave: 'hoy', desde: isoMX(h), hasta: isoMX(masDias(h, 1)), etiqueta: 'Hoy', hoy: true }; };
const diaLocal = diaMX;

/* ---------- rangos de fechas (siempre empiezan en Hoy) ---------- */
const RANGOS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['sem_ant', 'Semana pasada'], ['mes', 'Este mes'], ['mes_ant', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo'], ['custom', 'Elegir fechas']];
// Para analítica (días que ya pasaron + acumulados): sin "hoy"
const RAPIDOS_ANA = [['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']];
function rangoHTML(def = 'hoy', rapidos = true, opts = {}) {
  const hoy = diaLocal();
  const quick = opts.quick || [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['mes', 'Mes']];
  const lista = opts.analitica ? RANGOS.filter(([k]) => k !== 'hoy') : RANGOS;
  return `<div class="rango" data-rango>
    ${rapidos ? `<div class="seg seg-sm" data-r="quick">${quick.map(([k, l]) => `<button type="button" data-q="${k}" class="${k === def ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <select data-r="sel" aria-label="Periodo">${lista.map(([k, l]) => `<option value="${k}" ${k === def ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input type="date" data-r="d1" value="${hoy}" class="hidden">
    <input type="date" data-r="d2" value="${hoy}" class="hidden">
  </div>`;
}
function leerRango(root) {
  const sel = $('[data-r=sel]', root).value;
  const hoy = diaMX();
  const [y, m] = hoy.split('-').map(Number);
  const mes = (yy, mm) => { const d = new Date(Date.UTC(yy, mm - 1, 1)); return d.toISOString().slice(0, 10); };
  let a, b;
  switch (sel) {
    case 'ayer': a = masDias(hoy, -1); b = hoy; break;
    case 'semana': a = masDias(hoy, -dowMX(hoy)); b = masDias(a, 7); break;
    case 'sem_ant': b = masDias(hoy, -dowMX(hoy)); a = masDias(b, -7); break;
    case 'mes': a = mes(y, m); b = mes(y, m + 1); break;
    case 'mes_ant': a = mes(y, m - 1); b = mes(y, m); break;
    case 'anio': a = `${y}-01-01`; b = `${y + 1}-01-01`; break;
    case 'todo': a = '2000-01-01'; b = '2100-01-01'; break;
    case 'custom': {
      const ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
      let d1 = $('[data-r=d1]', root).value, d2 = $('[data-r=d2]', root).value;
      if (!ok(d1)) d1 = hoy; if (!ok(d2)) d2 = d1;
      if (d2 < d1) [d1, d2] = [d2, d1];
      a = d1; b = masDias(d2, 1); break;
    }
    default: a = hoy; b = masDias(hoy, 1);
  }
  const et = RANGOS.find((r) => r[0] === sel)[1];
  return { clave: sel, desde: isoMX(a), hasta: isoMX(b), etiqueta: et, hoy: sel === 'hoy' };
}
function bindRango(root, cb) {
  const box = root.matches?.('[data-rango]') ? root : $('[data-rango]', root);
  const sel = $('[data-r=sel]', box);
  const sync = () => {
    $$('input', box).forEach((i) => i.classList.toggle('hidden', sel.value !== 'custom'));
    $$('[data-q]', box).forEach((b) => b.classList.toggle('on', b.dataset.q === sel.value));
  };
  sel.addEventListener('change', () => { sync(); cb(leerRango(box)); });
  $$('[data-q]', box).forEach((b) => b.addEventListener('click', () => { sel.value = b.dataset.q; sync(); cb(leerRango(box)); }));
  $$('input', box).forEach((i) => i.addEventListener('change', () => cb(leerRango(box))));
  return () => leerRango(box);
}

/* ---------- arranque / login ---------- */
async function boot() {
  document.title = C.nombre;
  let s = null;
  try { s = await API.session(); } catch {}
  if (!s) return renderLogin();
  try { ME = await API.rpc('mi_perfil'); }
  catch (e) {
    // solo se cierra la sesión si el problema es la sesión; sin internet se reintenta
    if (ES_SESION.test(e.message) || /permiso|perfil|desactiv/i.test(e.message)) { await API.logout(); return renderLogin(e.message); }
    app.innerHTML = `<div class="login"><div class="login-card pop"><h1>Sin conexión</h1><div class="muted" style="margin:8px 0 16px">${esc(e.message)}</div><button type="button" class="btn btn-primary btn-block" onclick="boot()">Reintentar</button></div></div>`;
    return;
  }
  renderShell();
  route();
}

// Si en otra pestaña del mismo navegador se entra con otra cuenta, la sesión guardada cambia
// y esta pestaña mandaría las ventas con la cuenta equivocada: se recarga para mostrar quién es.
window.addEventListener('storage', async (e) => {
  if (!ME || !e.key || !/auth-token|cafe_dev_token/.test(e.key)) return;
  const id = await API.usuarioId().catch(() => null);
  if (id !== ME.id) location.reload();
});

function renderLogin(error) {
  app.innerHTML = `<div class="login"><div class="login-fondo" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="login-card pop">
    <div class="login-logo">${logo(30)}</div>
    <h1>${esc(C.nombre)}</h1>
    <div class="muted">Entra con tu usuario y contraseña</div>
    ${error ? `<div class="alert alert-err" style="margin-top:14px">${esc(error)}</div>` : ''}
    ${API.modo === 'local' ? `<div class="alert alert-info small" style="margin-top:14px">Modo de prueba local. Usuarios: <b>admin</b>, <b>almacen</b>, <b>vicente</b>, <b>rola</b> (ver dev/usuarios-prueba.json).</div>` : ''}
    <form id="flogin">
      <label class="field"><span>Usuario</span><input name="u" autocomplete="username" autocapitalize="none" required></label>
      <label class="field"><span>Contraseña</span><input name="p" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Entrar</button>
    </form></div></div>`;
  $('#flogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await run($('button', f), async () => {
      await API.login(f.u.value, f.p.value);
      FX.exito();
      await boot();
    });
  });
  $('#flogin input').focus();
}

const ICON = {
  finanzas: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />',
  caja: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  ventas: '<path d="M6 7h12l-1 12H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  producir: '<path d="M12 3c-4 6 4 12 0 18"/><ellipse cx="12" cy="12" rx="7" ry="9"/>',
  almacen: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M8 20v-6h8v6"/>',
  precios: '<path d="M3 12l9-9h9v9l-9 9z"/><circle cx="16" cy="8" r="1.5"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-4 4-6 7-6s6 2 7 6M16 4a3 3 0 0 1 0 6M18 14c2 1 3 3 4 6"/>',
  panel: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  pedir: '<path d="M12 5v14M5 12h14"/>',
  inv: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 4v16"/>',
};
const ico = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;

const NAV_ADMIN = [['resumen', 'Finanzas', 'finanzas'], ['caja', 'Caja y banco', 'caja'], ['ventas', 'Ventas', 'ventas'], ['entregar', 'Producir y entregar', 'producir'], ['almacen', 'Almacén', 'almacen'], ['catalogo', 'Precios', 'precios'], ['usuarios', 'Usuarios', 'usuarios']];
const NAV_PROD = [['entregar', 'Producir y entregar', 'producir'], ['almacen', 'Almacén', 'almacen'], ['vendedores', 'Inventario de vendedores', 'inv']];
const NAV_VEND = [['ventas', 'Vender', 'ventas'], ['inicio', 'Mi panel', 'panel'], ['pedir', 'Pedir producto', 'pedir']];
const nav = () => ({ admin: NAV_ADMIN, produccion: NAV_PROD }[ME.rol] || NAV_VEND);

/* ---------- tema: auto / claro / oscuro ---------- */
const TEMAS = [['auto', '◐', 'Tema automático'], ['light', '☀︎', 'Tema claro'], ['dark', '☾', 'Tema oscuro']];
function aplicarTema(t = store.get('tema', 'auto')) {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const oscuro = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]')?.setAttribute('content', oscuro ? '#15110e' : '#f7f3ee');
}
aplicarTema();

function renderShell() {
  const links = nav().map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${ico(i, 18)}<span>${l}</span></a>`).join('');
  app.innerHTML = `${AVA_DEFS}
    <aside class="side">
      <div class="side-brand"><span class="brand-dot">${logo(18)}</span><div><b>${esc(C.nombre)}</b><small>${ROLES[ME.rol]}</small></div></div>
      <nav class="nav nav-side">${links}</nav>
      <div class="side-foot">
        <div class="side-user"><span class="side-ava">${avatar(ME)}</span><div><b>${esc(ME.nombre)}</b><small>@${esc(ME.usuario || '')}</small></div></div>
        <div class="side-tools">
          <button type="button" class="icon-btn" data-snd title="Sonidos" aria-label="Sonidos"></button>
          <button type="button" class="icon-btn" data-tema title="Tema" aria-label="Cambiar tema"></button>
          <button type="button" class="btn btn-sm btn-ghost" data-salir>Salir</button>
        </div>
      </div>
    </aside>
    <header class="top">
      <div class="brand"><span class="brand-dot">${logo(16)}</span><span>${esc(C.nombre)}</span></div>
      <div class="who">
        <button type="button" class="icon-btn" data-snd title="Sonidos" aria-label="Sonidos"></button>
        <button type="button" class="icon-btn" data-tema title="Tema" aria-label="Cambiar tema"></button>
        <span class="who-ava">${avatar(ME)}</span>
        <button type="button" class="btn btn-sm btn-ghost" data-salir>Salir</button>
      </div>
    </header>
    <main id="view"></main>
    <nav class="nav tabbar">${links}</nav>`;
  const pinta = () => {
    $$('[data-snd]').forEach((b) => { b.textContent = FX.on() ? '🔊' : '🔇'; });
    const t = TEMAS.find((x) => x[0] === store.get('tema', 'auto')) || TEMAS[0];
    $$('[data-tema]').forEach((b) => { b.textContent = t[1]; b.title = t[2]; });
  };
  pinta();
  $$('[data-snd]').forEach((b) => { b.onclick = () => { FX.toggle(); pinta(); }; });
  $$('[data-tema]').forEach((b) => { b.onclick = () => {
    const i = TEMAS.findIndex((x) => x[0] === store.get('tema', 'auto'));
    const t = TEMAS[(i + 1) % TEMAS.length][0];
    store.set('tema', t); aplicarTema(t); pinta(); FX.nav(); toast(TEMAS.find((x) => x[0] === t)[2]);
  }; });
  $$('[data-salir]').forEach((b) => { b.onclick = async () => { await API.logout(); ME = null; location.hash = ''; renderLogin(); }; });
}

const VIEWS = {};
const esqueleto = () => `<div class="skel" aria-busy="true" aria-label="Cargando">
  <div class="sk sk-h"></div><div class="sk sk-s"></div>
  <div class="sk-row"><div class="sk sk-c"></div><div class="sk sk-c"></div><div class="sk sk-c"></div><div class="sk sk-c"></div></div>
  <div class="sk sk-b"></div><div class="sk-row"><div class="sk sk-b2"></div><div class="sk sk-b2"></div></div></div>`;
// Cada vista se arma aparte y se cambia de golpe: si el usuario brinca de pantalla rápido,
// una respuesta vieja ya no pisa a la nueva.
let rutaN = 0, rutaPrev = '';
async function route() {
  if (!ME) return;
  const n = ++rutaN;
  const [rawName, qs] = (location.hash.replace(/^#\/?/, '') || '').split('?');
  const allowed = nav().map((x) => x[0]);
  const name = allowed.includes(rawName) ? rawName : allowed[0];
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  $$('a[data-k]').forEach((a) => a.classList.toggle('on', a.dataset.k === name));
  $('.tabbar a.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (rutaPrev && rutaPrev !== name) FX.nav();
  const cambia = rutaPrev !== name;
  rutaPrev = name;
  const view = $('#view');
  if (cambia) view.classList.add('saliendo');
  const tSk = setTimeout(() => { if (n === rutaN && cambia) { view.innerHTML = esqueleto(); view.classList.remove('saliendo'); } }, 180);
  const v = document.createElement('div');
  v.className = 'vista';
  try { await VIEWS[name](v, q); }
  catch (e) {
    if (n !== rutaN) return;
    if (ES_SESION.test(e.message)) { clearTimeout(tSk); await API.logout(); return renderLogin(e.message); }
    v.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`;
  }
  clearTimeout(tSk);
  if (n !== rutaN) return;
  view.classList.remove('saliendo');
  view.replaceChildren(v);
  if (cambia) { window.scrollTo({ top: 0 }); v.classList.add('entra'); revelar(v); }
  AvaVivo.mirar();
  v.dispatchEvent(new Event('vista-lista'));
}
window.addEventListener('hashchange', route);

/* ---------- entrada escalonada de tarjetas al aparecer en pantalla ---------- */
const obsRevelar = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((en) => {
  if (!en.isIntersecting) return;
  const el = en.target; obsRevelar.unobserve(el);
  el.classList.add('rv-in');
  setTimeout(() => el.classList.remove('rv', 'rv-in'), 900 + (parseInt(el.style.getPropertyValue('--d')) || 0));
}), { rootMargin: '0px 0px -6% 0px' }) : null;
function revelar(root) {
  if (!obsRevelar || REDUCE.matches) return;
  $$('.card, .kpi, .pcard, .stk-w, .cfg, .cmp-i, .dk-i, .hero-k, .pend-i', root).forEach((el, i) => {
    if (el.closest('.rv')) return;
    el.style.setProperty('--d', `${Math.min(i, 10) * 40}ms`);
    el.classList.add('rv'); obsRevelar.observe(el);
  });
}

/* ---------- pestañas: organizan cada pantalla en segmentos ---------- */
// items: [[clave, etiqueta, contador?]]. Los paneles llevan data-panel="id:clave".
function tabsHTML(id, items, act) {
  return `<div class="tabs" data-tabs="${id}" role="tablist">${items.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" class="${k === act ? 'on' : ''}">${l}${n ? ` <span class="tab-n">${n}</span>` : ''}</button>`).join('')}<i class="tabs-ind" aria-hidden="true"></i></div>`;
}
function bindTabs(root, id, { recordar = true, alCambiar } = {}) {
  const box = $(`[data-tabs="${id}"]`, root);
  if (!box) return () => {};
  const mover = () => {
    const b = $('[data-tab].on', box), ind = $('.tabs-ind', box);
    if (!b || !ind || !b.offsetWidth) return;
    ind.style.width = `${b.offsetWidth}px`; ind.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  const set = (k, anim = true) => {
    if (!$(`[data-tab="${k}"]`, box)) k = $('[data-tab]', box).dataset.tab;
    $$('[data-tab]', box).forEach((b) => { const on = b.dataset.tab === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $$(`[data-panel^="${id}:"]`, root).forEach((p) => {
      const on = p.dataset.panel === `${id}:${k}`;
      p.hidden = !on;
      if (on && anim) { p.classList.remove('panel-in'); void p.offsetWidth; p.classList.add('panel-in'); }
    });
    mover();
    if (recordar) store.set('tab.' + id, k);
    alCambiar?.(k);
    AvaVivo.mirar();
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && !b.classList.contains('on')) { FX.nav(); set(b.dataset.tab); } });
  set(recordar ? store.get('tab.' + id, $('[data-tab].on', box)?.dataset.tab) : $('[data-tab].on', box)?.dataset.tab, false);
  if ('ResizeObserver' in window) new ResizeObserver(mover).observe(box);
  return set;
}

/* ---------- componentes compartidos ---------- */
// tarjeta de número: lbl, valor, sub (html), opciones { cls, href, info, det }
function kpi(lbl, val, sub = '', o = {}) {
  if (typeof o === 'string') o = { cls: o };
  const tag = o.href ? 'a' : o.click ? 'button' : 'div';
  const attrs = o.href ? `href="${o.href}"` : o.click ? `type="button" data-kpi="${o.click}"` : '';
  return `<${tag} class="kpi ${o.cls || ''} ${o.href || o.click ? 'click' : ''}" ${attrs}>
    <div class="lbl">${lbl}${o.info ? ` <span class="info" title="${esc(o.info)}">?</span>` : ''}</div>
    <div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}
    ${o.det ? `<div class="det">${o.det}</div>` : ''}
    ${o.href || o.click ? '<span class="go">›</span>' : ''}</${tag}>`;
}
// desglose por vendedor con mini avatar: [{nombre, usuario, monto}]
const desglose = (filas, fmt = money0) => filas.length ? `<div class="desg">${filas.map((f) =>
  `<span class="desg-i"><span class="mini-ava">${avatar(f)}</span>${esc(f.nombre)} <b>${fmt(f.monto)}</b></span>`).join('')}</div>` : '';
// barra dividida (ej. efectivo vs transferencia)
const barra2 = (a, b, la = 'Efectivo', lb = 'Transferencia') => {
  const t = (+a || 0) + (+b || 0);
  const pa = t ? (a / t) * 100 : 50;
  return `<div class="bar2" title="${la} ${money(a)} · ${lb} ${money(b)}"><i style="width:${pa}%"></i></div>
    <div class="bar2-l"><span><i class="dot dot-a"></i>${la} ${money0(a)}</span><span><i class="dot dot-b"></i>${lb} ${money0(b)}</span></div>`;
};
// número que cuenta hacia arriba
function animarNumeros(root) {
  if (REDUCE.matches) return;
  $$('[data-count]', root).forEach((el) => {
    const fin = +el.dataset.count, fmt = el.dataset.fmt === 'n' ? (x) => fnum(x) : money0;
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(fin * (k === 1 ? 1 : 1 - Math.pow(2, -10 * k))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = fmt(fin); }, dur + 150); // por si la pestaña está en segundo plano
  });
}
const cuenta = (n, fmt = 'm') => `<span data-count="${+n || 0}" data-fmt="${fmt}">${fmt === 'n' ? fnum(n) : money0(n)}</span>`;

/* ---------- pago: efectivo / transferencia / mixto + extra (propina por transferencia) ---------- */
const pagoTr = (v) => (+v.pago_transfer || 0) + (+v.extra || 0);       // lo que se verifica en el banco
const retenido = (v) => Math.min(+v.comision || 0, +v.pago_efectivo || 0); // comisión que el vendedor se queda del efectivo
function pagoBadges(v, largo) {
  if (v.anulada) return '<span class="badge b-err">Cancelada</span>';
  const m = v.metodo;
  const lbl = m === 'mixto' ? (largo ? `Mixto · 💵 ${money0(v.pago_efectivo)} + 🏦 ${money0(v.pago_transfer)}` : 'Mixto')
    : m === 'transferencia' ? (largo ? 'Transferencia' : 'Transf.') : 'Efectivo';
  const cls = m === 'mixto' ? 'b-brand' : m === 'transferencia' ? 'b-info' : 'b-ok';
  const tit = m === 'mixto' ? ` title="Efectivo ${money0(v.pago_efectivo)} + transferencia ${money0(v.pago_transfer)}"` : '';
  return `<span class="badge ${cls}"${tit}>${lbl}</span>`
    + (+v.extra ? ` <span class="badge b-extra" title="Propina / servicio extra por transferencia: es del vendedor">+${money0(v.extra)} extra</span>` : '')
    + (pagoTr(v) > 0 ? (v.verificada ? ` <span class="badge b-ok">${largo ? '✓ Verificada' : '✓'}</span>` : ` <span class="badge b-warn">${largo ? 'Por verificar' : 'por verificar'}</span>`) : '')
    + (v.metodo_original ? ` <span class="badge" title="Se registró como ${esc(v.metodo_original)} y luego se cambió">✎ cambiado</span>` : '');
}
// el vendedor cambia el pago de sus ventas mientras el admin no haya confirmado la transferencia; el admin, siempre
const puedeCambiarPago = (v, admin) => !v.anulada && (admin || !(v.verificada && pagoTr(v) > 0));

function bindCambiarPago(root, ventas, admin, recargar) {
  $$('[data-cpago]', root).forEach((b) => b.addEventListener('click', () => {
    const v = ventas.find((x) => x.id === +b.dataset.cpago);
    if (!v) return;
    let met = v.metodo;
    const paq = v.tipo === 'paqueteria';
    const tot = +v.total;
    modal(`<h2>Cambiar pago · ${folio(v.id)}</h2>
      <div class="muted small">${esc(v.cliente)} · total <b>${money(tot)}</b>. Solo cambia <b>cómo</b> pagó: los productos y el total no se tocan.</div>
      <div class="tiles tiles-3" id="cpm" style="margin-top:14px">
        ${[['efectivo', '💵', 'Efectivo'], ['transferencia', '🏦', 'Transferencia'], ['mixto', '🔀', 'Mixto']].map(([k, e, t]) =>
          `<button type="button" class="tile ${met === k ? 'on' : ''}" data-m="${k}" ${paq && k !== 'transferencia' ? 'disabled' : ''}><span class="tile-e">${e}</span><span class="tile-t">${t}</span></button>`).join('')}
      </div>
      <label class="field" id="cp-ef" style="margin-top:12px"><span>¿Cuánto pagó en efectivo?</span><input type="number" min="1" step="any" inputmode="decimal" id="cp-efv" value="${met === 'mixto' ? +v.pago_efectivo : ''}" placeholder="Ej. 200"></label>
      <label class="field" id="cp-ex" style="margin-top:12px"><span>Extra / propina por transferencia <i class="muted">(es del vendedor)</i></span><input type="number" min="0" step="any" inputmode="decimal" id="cp-exv" value="${+v.extra || ''}" placeholder="0"></label>
      <div class="alert" id="cp-res" style="margin-top:12px"></div>
      ${v.verificada && pagoTr(v) > 0 ? '<div class="alert alert-warn small">Ya estaba verificada: el monto sale del banco y vuelve a quedar <b>por verificar</b>.</div>' : ''}
      <div class="modal-actions"><button type="button" class="btn" data-close>Regresar</button><button class="btn btn-primary" id="cp-ok">Guardar cambio</button></div>`);
    const pinta = () => {
      $$('#cpm .tile', dlg).forEach((x) => x.classList.toggle('on', x.dataset.m === met));
      $('#cp-ef', dlg).classList.toggle('hidden', met !== 'mixto');
      $('#cp-ex', dlg).classList.toggle('hidden', met === 'efectivo');
      const ef = met === 'efectivo' ? tot : met === 'mixto' ? Math.max(0, +$('#cp-efv', dlg).value || 0) : 0;
      const ex = met === 'efectivo' ? 0 : Math.max(0, +$('#cp-exv', dlg).value || 0);
      const tr = tot - ef + ex;
      $('#cp-res', dlg).innerHTML = met === 'mixto' && (ef <= 0 || ef >= tot) ? `<span style="color:var(--warn)">El efectivo debe ser mayor a $0 y menor a ${money0(tot)}</span>`
        : `💵 Efectivo <b>${money0(ef)}</b> · 🏦 Al banco <b>${money0(tr)}</b>${ex ? ` (incluye ${money0(ex)} de extra)` : ''}`;
    };
    $$('#cpm .tile', dlg).forEach((x) => x.addEventListener('click', () => { met = x.dataset.m; pinta(); if (met === 'mixto') $('#cp-efv', dlg).focus(); }));
    $('#cp-efv', dlg).addEventListener('input', pinta);
    $('#cp-exv', dlg).addEventListener('input', pinta);
    pinta();
    $('#cp-ok', dlg).addEventListener('click', async (e) => {
      await run(e.currentTarget, async () => {
        const r = await API.rpc('cambiar_pago', { p_venta: v.id, p_metodo: met,
          p_efectivo: met === 'mixto' ? +$('#cp-efv', dlg).value || null : null,
          p_extra: met === 'efectivo' ? 0 : +$('#cp-exv', dlg).value || 0 });
        dlg.close();
        toast(r.sin_cambios ? 'Sin cambios' : `Pago de ${folio(v.id)} actualizado${+r.por_verificar ? ` · ${money0(r.por_verificar)} por verificar en el banco` : ''}`);
        recargar();
      });
    });
  }));
}

function ventaHTML(v, admin) {
  const items = (v.items || []).map((i) => {
    const det = i.promo ? ` <span class="badge b-brand">3x2: ${i.piezas} pz, ${i.piezas_gratis} gratis</span>`
      : (i.piezas !== i.cantidad ? ` <span class="small">(${i.piezas} pz)</span>` : '');
    return `<li>${i.cantidad}× ${esc(i.descripcion.replace(' · 3x2', ''))}${det} — ${money(i.subtotal)}</li>`;
  }).join('');
  const esTr = pagoTr(v) > 0;
  return `<div class="venta ${v.anulada ? 'anulada' : ''} ${esTr && !v.verificada && !v.anulada ? 'pend' : ''}">
    <div class="venta-top">
      <span class="muted small">${folio(v.id)}</span>
      <b>${esc(v.cliente)}</b>
      ${v.anulada ? '' : pagoBadges(v, true)}
      ${v.tipo && v.tipo !== 'tienda' ? `<span class="badge b-brand">${TIPOS_VENTA[v.tipo]}</span>` : ''}
      ${admin ? `<span class="badge">${esc(v.vendedor)}</span>` : ''}
      <span class="muted small">${fecha(v.fecha)}</span>
      ${v.anulada ? '<span class="badge b-err">Cancelada</span>' : ''}
      <span class="total">${money(v.total)}</span>
    </div>
    <ul>${items}${+v.envio_cobro ? `<li>Envío — ${money(v.envio_cobro)}</li>` : ''}${+v.descuento ? `<li>Descuento — −${money(v.descuento)}</li>` : ''}</ul>
    <div class="small muted">${[
      +v.comision && !v.anulada ? `Comisión vendedor: ${money(v.comision)}${retenido(v) && retenido(v) < +v.comision ? ` (se quedó ${money0(retenido(v))} del efectivo)` : ''}` : '',
      +v.extra && !v.anulada ? `<b>Extra para el vendedor: ${money(v.extra)}</b> (cliente transfirió ${money(pagoTr(v))})` : '',
      v.metodo_original ? `Se registró como ${esc(v.metodo_original)}` : '',
      admin && +v.envio_costo ? `Paquetería: ${money(v.envio_costo)}` : '',
      admin && !v.anulada ? `<b>Queda: ${money(v.total - (+v.comision || 0) - (+v.envio_costo || 0))}</b>` : '',
      v.telefono ? `Tel: ${esc(v.telefono)}` : '',
      v.referencia ? `Ref: ${esc(v.referencia)}` : '',
      v.nota ? `Nota: ${esc(v.nota)}` : '',
    ].filter(Boolean).join(' · ')}</div>
    ${v.anulada && v.motivo_anulacion ? `<div class="small muted">Motivo de cancelación: ${esc(v.motivo_anulacion)}</div>` : ''}
    ${!v.anulada && (admin || puedeCambiarPago(v, admin)) ? `<div class="venta-acts">
      ${admin && esTr ? `<label class="chk"><input type="checkbox" data-verif="${v.id}" ${v.verificada ? 'checked' : ''}> Transferencia de ${money0(pagoTr(v))} verificada en el banco</label>` : '<span></span>'}
      <span class="inline">${puedeCambiarPago(v, admin) ? `<button class="btn btn-sm" data-cpago="${v.id}">💱 Cambiar pago</button>` : ''}
      ${admin ? `<button class="btn btn-sm btn-danger" data-anular="${v.id}">Cancelar venta</button>` : ''}</span></div>` : ''}
  </div>`;
}

function bindVerificar(root, recargar) {
  $$('[data-verif]', root).forEach((c) => c.addEventListener('change', async () => {
    const ok = c.checked;
    if (!ok && !(await confirmar('Quitar verificación', 'El monto saldrá del saldo del banco hasta que la vuelvas a verificar.', 'Quitar', true))) { c.checked = true; return; }
    const hecho = await run(c, async () => {
      await API.rpc('verificar_transferencia', { p_venta: +c.dataset.verif, p_verificada: ok });
      if (ok) FX.caja();
      toast(ok ? 'Transferencia verificada: ya cuenta en el banco' : 'Verificación quitada');
      return true;
    });
    if (!hecho) { c.checked = !ok; return; } // el servidor no cambió: regresa el interruptor
    recargar();
  }));
}

function bindAnular(root, recargar) {
  $$('[data-anular]', root).forEach((b) => b.addEventListener('click', () => {
    modal(`<h2>Cancelar venta ${folio(b.dataset.anular)}</h2><div class="muted">Las piezas regresan al inventario del vendedor y el dinero sale de caja o banco.</div>
      <form id="fan"><label class="field"><span>Motivo</span><input name="m" required placeholder="Ej. se capturó dos veces"></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Regresar</button><button class="btn btn-danger">Cancelar venta</button></div></form>`);
    $('#fan', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      await run($('.btn-danger', dlg), async () => {
        await API.rpc('anular_venta', { p_venta: +b.dataset.anular, p_motivo: e.target.m.value });
        dlg.close(); toast('Venta cancelada'); recargar();
      });
    });
  }));
}

function totalesVentas(ventas) {
  const t = { total: 0, efectivo: 0, transferencia: 0, extra: 0, extraNum: 0, pendiente: 0, comision: 0, entregar: 0, num: 0, piezas: 0, gratis: 0, porProd: {} };
  ventas.filter((v) => !v.anulada).forEach((v) => {
    t.total += +v.total; t.num++; t.comision += +v.comision || 0;
    t.efectivo += +v.pago_efectivo || 0; t.transferencia += +v.pago_transfer || 0;
    if (+v.extra) { t.extra += +v.extra; t.extraNum++; }
    t.entregar += (+v.pago_efectivo || 0) - retenido(v);
    if (pagoTr(v) > 0 && !v.verificada) t.pendiente += pagoTr(v);
    (v.items || []).forEach((i) => {
      t.piezas += i.piezas; t.gratis += i.piezas_gratis;
      const k = i.presentacion_id;
      const p = (t.porProd[k] ||= { descripcion: i.descripcion.split(' · ')[0], piezas: 0, gratis: 0, total: 0 });
      p.piezas += i.piezas; p.gratis += i.piezas_gratis; p.total += +i.subtotal;
    });
  });
  t.lista = Object.values(t.porProd).sort((a, b) => b.total - a.total);
  return t;
}

function tablaPorProducto(lista) {
  if (!lista.length) return '<div class="empty">Sin ventas en este periodo</div>';
  const max = Math.max(...lista.map((p) => +p.total), 1);
  return `<div class="rank">${lista.map((p, i) => `<div class="rank-i">
      <span class="rank-n">${i + 1}</span>
      <div class="rank-b"><div class="rank-t"><span>${esc(p.descripcion)}${+p.gratis ? ` <span class="badge b-brand">${p.gratis} gratis</span>` : ''}</span><b>${money0(p.total)}</b></div>
      <div class="bar"><i style="width:${(p.total / max) * 100}%"></i></div><div class="small muted">${fnum(p.piezas)} piezas</div></div></div>`).join('')}</div>`;
}

function tablaInventario(inv, { admin = false, devolver = false } = {}) {
  if (!inv.length) return '<div class="empty">No hay piezas asignadas</div>';
  const tp = inv.reduce((s, i) => s + i.piezas, 0);
  const tv = inv.reduce((s, i) => s + +i.valor_publico, 0);
  const tc = inv.reduce((s, i) => s + +(i.costo || 0), 0);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="num">Piezas</th><th class="num">Precio</th><th class="num">Valor al público</th>${admin ? '<th class="num">Costo</th>' : ''}${devolver ? '<th></th>' : ''}</tr></thead><tbody>
    ${inv.map((i) => `<tr><td><b>${esc(i.descripcion)}</b>${i.promo_3x2 ? ' <span class="badge b-brand">3x2 fin de semana</span>' : ''}</td>
      <td class="num">${fnum(i.piezas)}</td><td class="num">${money(i.precio_pieza)}</td><td class="num">${money(i.valor_publico)}</td>
      ${admin ? `<td class="num">${money(i.costo)}</td>` : ''}
      ${devolver ? `<td class="actions"><button class="btn btn-sm" data-dev="${i.presentacion_id}" data-max="${i.piezas}" data-d="${esc(i.descripcion)}">Regresar al almacén</button></td>` : ''}</tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="num">${fnum(tp)}</td><td></td><td class="num">${money(tv)}</td>${admin ? `<td class="num">${money(tc)}</td>` : ''}${devolver ? '<td></td>' : ''}</tr></tfoot></table></div>`;
}

function bindDevolver(root, vendId, nombre, recargar) {
  $$('[data-dev]', root).forEach((b) => b.addEventListener('click', () => {
    modal(`<h2>Regresar al almacén</h2><div class="muted">${esc(b.dataset.d)} · ${esc(nombre)} tiene ${b.dataset.max} pz</div>
      <form id="fdev"><label class="field"><span>Piezas a regresar</span><input name="c" type="number" min="1" max="${b.dataset.max}" step="1" value="${b.dataset.max}" required></label>
      <label class="field"><span>Nota (opcional)</span><input name="n"></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-primary">Regresar</button></div></form>`);
    $('#fdev', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      await run($('.btn-primary', dlg), async () => {
        await API.rpc('devolver', { p_vendedor: vendId, p_presentacion: +b.dataset.dev, p_piezas: +e.target.c.value, p_nota: e.target.n.value || null });
        dlg.close(); toast('Piezas regresadas al almacén'); recargar();
      });
    });
  }));
}

document.addEventListener('DOMContentLoaded', boot);

/* ---------- aviso de versión nueva ----------
   Cada publicación escribe version.txt y la versión en <meta name="app-v">.
   Si el navegador trae una versión vieja, se muestra un aviso para actualizar. */
(() => {
  const mia = document.querySelector('meta[name="app-v"]')?.content;
  if (!mia || mia === 'dev') return;
  let avisado = false;
  const revisar = async () => {
    if (avisado) return;
    try {
      const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const nueva = (await r.text()).trim();
      if (!nueva || nueva === mia) return;
      avisado = true;
      const b = document.createElement('div');
      b.className = 'upd-bar';
      b.innerHTML = '<span>✨ Hay una versión nueva de la app</span><button type="button">Actualizar</button>';
      b.querySelector('button').addEventListener('click', () => location.replace(location.pathname + '?v=' + encodeURIComponent(nueva) + location.hash));
      document.body.appendChild(b);
    } catch { /* sin red: se reintenta luego */ }
  };
  setTimeout(revisar, 4000);
  setInterval(revisar, 2 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
})();
