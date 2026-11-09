// =========================================================
//  CONFIGURACIÓN — lo único que hay que editar para producción
// =========================================================
window.APP_CONFIG = {
  // Nombre que aparece arriba en la app
  nombre: 'Café · Control',

  // Datos de tu proyecto de Supabase (Project Settings → API).
  // En el servidor de pruebas (localhost:8787) se usa la base local;
  // para probar contra la nube desde ahí, abre http://localhost:8787/?nube
  supabaseUrl: 'https://rrmmrukwissojrulefya.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJybW1ydWt3aXNzb2pydWxlZnlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNDQwNjMsImV4cCI6MjEwOTgyMDA2M30.OW26_5uTz37i-5lfnYaxoXZqJ2B49yrUpDn2CaOsrAM', // la "anon public key" (es pública, no es secreta)

  // Los usuarios entran solo con su nombre (ej. "vicente").
  // Internamente se convierte en vicente@<dominio>. Usa el mismo dominio
  // al crear los usuarios en Supabase.
  dominioUsuarios: 'cafe.local',
};
