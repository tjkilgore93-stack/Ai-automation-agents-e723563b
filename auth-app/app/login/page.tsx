import Link from 'next/link'
import { login } from '@/app/auth/actions'

const messages: Record<string, string> = { invalid: 'Email or password was not accepted.', missing: 'Enter your email and password.', configuration: 'Authentication is not configured yet.', confirmation: 'The confirmation link is invalid or expired.' }
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const params = await searchParams
  const message = params.error ? messages[params.error] || 'Unable to log in.' : params.message === 'signed-out' ? 'You have signed out.' : null
  const next = (params.next || '/dashboard').startsWith('/') && !(params.next || '').startsWith('//') ? (params.next || '/dashboard') : '/dashboard'
  return <main><section className="panel"><h1>Log in</h1><p>Use your email and password to continue.</p>{message && <p className="notice error" role="alert">{message}</p>}<form action={login}><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><input type="hidden" name="next" value={next} /><button type="submit">Log in</button></form><p>New here? <Link href="/signup">Create an account</Link></p><p><Link href="/">Back home</Link></p></section></main>
}
