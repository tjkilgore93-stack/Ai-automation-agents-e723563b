import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const path = request.nextUrl.pathname
  if (!url || !key) {
    if (path.startsWith('/dashboard')) return NextResponse.redirect(new URL('/login?error=configuration', request.url))
    return response
  }
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })
  const { data, error } = await supabase.auth.getClaims()
  const hasUser = !error && Boolean(data?.claims?.sub)
  const isPublic = path === '/' || path === '/login' || path === '/signup' || path.startsWith('/auth/') || path.startsWith('/_next/') || path === '/favicon.ico' || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(path)
  if (!hasUser && !isPublic) {
    const destination = new URL('/login', request.url)
    if (path.startsWith('/dashboard')) destination.searchParams.set('next', path)
    return NextResponse.redirect(destination)
  }
  if (hasUser && (path === '/login' || path === '/signup')) return NextResponse.redirect(new URL('/dashboard', request.url))
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}
