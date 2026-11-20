import { createClient } from '@supabase/supabase-js'

// Sin variables se usa producción, como antes. Un build de staging define ambas (se leen al compilar).
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bvgrhvmrkorycrqvynjk.supabase.co'
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_NANX5ETkfw26Gq78BoMb4Q_NLh_m6wb'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
