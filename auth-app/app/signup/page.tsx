import Link from 'next/link'
import { signup } from '@/app/auth/actions'

const errors: Record<string, string> = { invalid: 'Enter a valid email and a password of at least 12 characters.', configuration: 'The site URL is not configured. Contact the site administrator.', signup: 'We could not create the account. The email may already be registered.' }
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  return <main><section className="panel"><h1>Create your account</h1><p>Use at least 12 characters for your password.</p>{params.error && <p className="notice error" role="alert">{errors[params.error] || 'Unable to sign up.'}</p>}{params.message === 'check-email' && <p className="notice" role="status">Check your email for a confirmation link before logging in.</p>}<form action={signup}><label>Name (optional)<input name="display_name" type="text" autoComplete="name" maxLength={120} /></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><button type="submit">Create account</button></form><p>Already registered? <Link href="/login">Log in</Link></p><p><Link href="/">Back home</Link></p></section></main>
}
