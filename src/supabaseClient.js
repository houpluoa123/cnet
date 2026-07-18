import { createClient } from "@supabase/supabase-js";

// ====== SUPABASE CONFIGURATION ======
// Replace the values below with your actual Supabase Project URL and Public API Key (anon key)
const SUPABASE_URL = "https://dmcmkflzrqqfkhogqyfh.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_d8hToE7WaPqehvpYw_cU3g_vjlb0qXf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
