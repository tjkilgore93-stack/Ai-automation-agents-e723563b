'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeNextPath(value: FormDataEntryValue | null) {
  const path = typeof value === 'string' ? value : ''
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/dashboard'
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const next = safeNextPath(formData.get('next'))
  if (!email || !password) redirect('/login?error=missing')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=invalid')
  redirect(next)
}

export async function signup(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const displayName = String(formData.get('display_name') || '').trim().slice(0, 120)
  if (!email || password.length < 12) redirect('/signup?error=invalid')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) redirect('/signup?error=configuration')
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL('/auth/confirm', siteUrl).toString(), data: { display_name: displayName } } })
  if (error) redirect('/signup?error=signup')
  redirect('/signup?message=check-email')
}

export async function logout() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (!error && data?.claims?.sub) await supabase.auth.signOut()
  redirect('/login?message=signed-out')
}
