import { redirect } from 'next/navigation'
import { logout } from '@/app/auth/actions'
import { updateProfile } from './actions'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const supabase = await createClient()
  const { data, error: claimsError } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (claimsError || !userId) redirect('/login')
  const email = typeof data.claims.email === 'string' ? data.claims.email : 'Signed-in user'
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  const params = await searchParams
  return <main><section className="panel"><h1>Your protected dashboard</h1><p>You are signed in as <strong>{email}</strong>.</p>{params.message === 'saved' && <p className="notice" role="status">Profile saved.</p>}{params.error === 'profile' && <p className="notice error" role="alert">Profile could not be saved.</p>}<h2>Profile</h2><form action={updateProfile}><label>Display name<input name="display_name" defaultValue={profile?.display_name || ''} maxLength={120} /></label><button type="submit">Save profile</button></form><form action={logout} className="actions"><button type="submit">Log out</button></form></section></main>
}
