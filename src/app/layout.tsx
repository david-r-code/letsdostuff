import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/supabase/auth-context'
import { TopNav } from '@/components/nav/top-nav'
import { Toaster } from '@/components/ui/sonner'
import { FlaskConical } from 'lucide-react'

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'letsdostuff',
  description: 'Find people nearby doing things you love',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>
          {process.env.NEXT_PUBLIC_TEST_MODE === 'true' && (
            <div className="sticky top-0 z-[60] bg-amber-400 text-amber-900 text-xs font-semibold text-center py-1 px-4 flex items-center justify-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" />
              TEST MODE — auth is bypassed, do not use real data
            </div>
          )}
          <TopNav />
          <main className="flex-1">
            {children}
          </main>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}
