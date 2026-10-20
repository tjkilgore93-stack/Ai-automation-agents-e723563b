import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const allowedTypes = new Set<EmailOtpType>(['signup', 'email', 'magiclink', 'recovery', 'invite', 'email_change'])
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const rawType = request.nextUrl.searchParams.get('type')
  if (!tokenHash || !rawType || !allowedTypes.has(rawType as EmailOtpType)) return NextResponse.redirect(new URL('/login?error=confirmation', request.url))
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: rawType as EmailOtpType })
  if (error) return NextResponse.redirect(new URL('/login?error=confirmation', request.url))
  return NextResponse.redirect(new URL('/dashboard', request.url))
}
