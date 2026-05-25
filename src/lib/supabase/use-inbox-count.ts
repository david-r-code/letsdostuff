'use client'

import { useEffect, useState } from 'react'
import { createClient } from './client'
import { useAuth } from './auth-context'

export function useInboxCount() {
  const { user } = useAuth()
  const supabase = createClient()
  const [count, setCount] = useState(0)

  const fetchCount = async () => {
    if (!user) { setCount(0); return }

    // Get listing IDs the user organises
    const { data: listings } = await supabase
      .from('listings')
      .select('id')
      .eq('creator_id', user.id)

    if (!listings || listings.length === 0) { setCount(0); return }

    const { count: n } = await supabase
      .from('listing_applicants')
      .select('id', { count: 'exact', head: true })
      .in('listing_id', listings.map((l: any) => l.id))
      .eq('status', 'pending')

    setCount(n ?? 0)
  }

  useEffect(() => {
    fetchCount()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time: re-count when any application changes
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('inbox-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'listing_applicants',
      }, fetchCount)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return count
}
