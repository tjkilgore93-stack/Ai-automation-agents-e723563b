'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(formData: FormData) {
  const displayName = String(formData.get('display_name') || '').trim().slice(0, 120)
  const supabase = await createClient()
  const { data, error: claimsError } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (claimsError || !userId) redirect('/login')
  const { error } = await supabase.from('profiles').upsert({ id: userId, display_name: displayName }, { onConflict: 'id' })
  if (error) redirect('/dashboard?error=profile')
  redirect('/dashboard?message=saved')
}
