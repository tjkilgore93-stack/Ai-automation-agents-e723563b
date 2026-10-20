import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  return <main><section className="panel"><h1>Hyperfya account access</h1><p>Sign in securely to access your protected workspace.</p><div className="actions">{signedIn ? <Link className="button" href="/dashboard">Open dashboard</Link> : <><Link className="button" href="/login">Log in</Link><Link href="/signup">Create account</Link></>}</div></section></main>
}
