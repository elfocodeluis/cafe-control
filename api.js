// Capa de datos: habla con Supabase en producción o con el servidor local en pruebas.
(function () {
  const C = window.APP_CONFIG;
  const enPruebas = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]nube\b/.test(location.search);
  const usarSupabase = !!(C.supabaseUrl && C.supabaseKey) && !enPruebas;
  let sb = null;
  if (usarSupabase) {
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  // Presentaciones siempre de menor a mayor (3.5 g, 14 g, 28 g, 125 g, 500 g, 1 kg…) en todos los paneles.
  const gramosDe = (x) => {
    if (x && x.gramos != null && !isNaN(+x.gramos)) return +x.gramos;
    const t = String((x && (x.presentacion || x.nombre || x.descripcion)) || '').toLowerCase().replace(',', '.');
    if (/medio\s*kilo|½\s*kg/.test(t)) return 500;
    const promo = t.match(/(\d+)\s*[×x]\s*\d+\s*de\s*(\d+(?:\.\d+)?)\s*g\b/); // «3×2 de 14 g» = 3 piezas de 14 g
    if (promo) return +promo[1] * +promo[2];
    const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|g)\b/);
    return m ? +m[1] * (m[2] === 'g' ? 1 : 1000) : Infinity;
  };
  const ordenar = (arr) => {
    const grupos = new Map();
    const llave = (x) => x.sku ?? x.producto_id ?? x.producto ?? '';
    arr.forEach((x) => { const k = llave(x); if (!grupos.has(k)) grupos.set(k, grupos.size); });
    return arr.map((x, i) => [x, i]).sort(([a, i], [b, j]) =>
      grupos.get(llave(a)) - grupos.get(llave(b)) || gramosDe(a) - gramosDe(b) || i - j).map(([x]) => x);
  };
  function ordenarPres(d) {
    if (Array.isArray(d)) {
      d.forEach(ordenarPres);
      const o = d[0];
      // listas de inventario/catálogo (no movimientos ni solicitudes, que van por fecha)
      if (o && typeof o === 'object' && 'presentacion_id' in o && !('id' in o) && !('fecha' in o)) {
        const s = ordenar(d); s.forEach((x, i) => { d[i] = x; });
      }
    } else if (d && typeof d === 'object') {
      for (const k in d) {
        if (k === 'presentaciones' && Array.isArray(d[k])) d[k].sort((a, b) => gramosDe(a) - gramosDe(b));
        ordenarPres(d[k]);
      }
    }
    return d;
  }
  window.gramosDe = gramosDe;

  const TOKEN_KEY = 'cafe_dev_token';
  const store = {
    get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch {} },
  };

  const emailDe = (usuario) => {
    const u = String(usuario || '').trim().toLowerCase();
    return u.includes('@') ? u : `${u}@${C.dominioUsuarios}`;
  };

  function traducir(msg) {
    if (!msg) return 'Ocurrió un error';
    if (/Invalid login credentials/i.test(msg)) return 'Usuario o contraseña incorrectos';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    if (/JWT expired/i.test(msg)) return 'Tu sesión expiró, vuelve a entrar';
    return msg;
  }

  window.API = {
    modo: usarSupabase ? 'supabase' : 'local',

    async session() {
      if (sb) {
        const { data } = await sb.auth.getSession();
        return data.session;
      }
      return store.get();
    },

    // id del usuario de la sesión guardada en este navegador (puede cambiar desde otra pestaña)
    async usuarioId() {
      if (sb) { const { data } = await sb.auth.getSession(); return data.session?.user?.id || null; }
      return store.get();
    },

    async login(usuario, password) {
      if (sb) {
        const { error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password });
        if (error) throw new Error(traducir(error.message));
        return;
      }
      const r = await fetch('/dev/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: emailDe(usuario), password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      store.set(j.token);
    },

    async logout() {
      if (sb) await sb.auth.signOut();
      store.set(null);
    },

    // Canal en tiempo real de Supabase (solo en producción; en pruebas locales devuelve null)
    canal(nombre, opciones) { return sb ? sb.channel(nombre, opciones) : null; },
    quitarCanal(ch) { if (sb && ch) sb.removeChannel(ch); },

    async rpc(fn, params = {}) {
      try {
        if (sb) {
          const { data, error } = await sb.rpc(fn, params);
          if (error) throw new Error(error.message);
          return ordenarPres(data);
        }
        const r = await fetch('/dev/rpc/' + fn, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (store.get() || '') },
          body: JSON.stringify(params),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.message);
        return ordenarPres(j.data);
      } catch (e) {
        throw new Error(traducir(e.message));
      }
    },
  };
})();
