// Configuración de credenciales de Supabase
const SUPABASE_URL = 'https://cgyuemfyzpqwgyvxkbmq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3UCGUuUDhugdtpHcZ1cnFg_bt7czoaL';

// Inicializar cliente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);