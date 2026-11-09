// Capa de datos: habla con Supabase en producción o con el servidor local en pruebas.
(function () {
  const C = window.APP_CONFIG;
  const enPruebas = location.port === '8787' && !/[?&]nube\b/.test(location.search);
  const usarSupabase = !!(C.supabaseUrl && C.supabaseKey) && !enPruebas;
  let sb = null;
  if (usarSupabase) {
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
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

    async rpc(fn, params = {}) {
      try {
        if (sb) {
          const { data, error } = await sb.rpc(fn, params);
          if (error) throw new Error(error.message);
          return data;
        }
        const r = await fetch('/dev/rpc/' + fn, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (store.get() || '') },
          body: JSON.stringify(params),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.message);
        return j.data;
      } catch (e) {
        throw new Error(traducir(e.message));
      }
    },
  };
})();
