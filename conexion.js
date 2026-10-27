// Credenciales de Supabase (Project Settings -> API)
const SUPABASE_URL = 'https://cgyuemfyzpqwgyvxkbmq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3UCGUuUDhugdtpHcZ1cnFg_bt7czoaL';

// Cliente global que usa app.js
let db = null;

if (!window.supabase) {
  console.error('No se cargó la librería de Supabase. Revisá el <script> del CDN en index.html.');
} else {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}
