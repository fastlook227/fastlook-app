import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bvgrhvmrkorycrqvynjk.supabase.co'
const supabaseAnonKey = 'sb_publishable_NANX5ETkfw26Gq78BoMb4Q_NLh_m6wb'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)