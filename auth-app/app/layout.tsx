import type { Metadata } from 'next'
import './styles.css'

export const metadata: Metadata = { title: 'Hyperfya Auth', description: 'Secure account access powered by Supabase.' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
