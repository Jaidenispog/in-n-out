import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseReady } from '../lib/supabase'
import type { StaffUser } from '../lib/types'

interface AuthState {
  ready: boolean // supabase env configured
  loading: boolean
  session: Session | null
  profile: StaffUser | null
  staffId: string
  staffName: string
  signIn: (email: string, password: string) => Promise<string | null> // returns error message or null
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffUser | null>(null)

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('staff_users').select('*').eq('id', userId).maybeSingle()
    setProfile(data ?? null)
  }

  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user.id).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      loadProfile(s?.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    ready: supabaseReady,
    loading,
    session,
    profile,
    staffId: session?.user.id ?? '',
    staffName: profile?.full_name || session?.user.email || 'Staff',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return error ? error.message : null
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
    refreshProfile: () => loadProfile(session?.user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
