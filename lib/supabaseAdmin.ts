import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrl } from '@/lib/supabase'

let clienteAdmin: SupabaseClient | null = null

export function obtenerSupabaseAdmin() {
  if (clienteAdmin) return clienteAdmin
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.')
  }
  clienteAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return clienteAdmin
}
