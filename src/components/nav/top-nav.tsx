'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/supabase/auth-context'
import { useInboxCount } from '@/lib/supabase/use-inbox-count'
import { Button, buttonVariants } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MapPin, Plus, User, LogOut, CalendarDays, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TopNav() {
  const { user, profileComplete, signOut } = useAuth()
  const pathname = usePathname()
  const inboxCount = useInboxCount()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          <span>letsdostuff</span>
        </Link>

        <div className="flex-1" />

        {user ? (
          <div className="flex items-center gap-2">
            {/* Inbox with notification badge */}
            {pathname !== '/inbox' && (
              <Link
                href="/inbox"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex relative gap-1.5')}
              >
                <Inbox className="h-4 w-4" />
                Inbox
                {inboxCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {inboxCount > 9 ? '9+' : inboxCount}
                  </span>
                )}
              </Link>
            )}

            {/* My Events — hidden on the page itself */}
            {pathname !== '/my-events' && (
              <Link
                href="/my-events"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                My Events
              </Link>
            )}

            {profileComplete && pathname !== '/listings/new' && (
              <Link
                href="/listings/new"
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.user_metadata?.avatar_url} />
                      <AvatarFallback>
                        {(user.email?.[0] ?? '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href="/profile" />}>
                  <User className="mr-2 h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/inbox" />} className="sm:hidden">
                  <Inbox className="mr-2 h-4 w-4" />
                  Inbox
                  {inboxCount > 0 && (
                    <span className="ml-auto h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {inboxCount > 9 ? '9+' : inboxCount}
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/my-events" />} className="sm:hidden">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  My Events
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : pathname !== '/' && (
          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              Log in
            </Link>
            <Link
              href="/auth/signup"
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
