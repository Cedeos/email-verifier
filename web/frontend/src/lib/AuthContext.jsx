import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaEnrollRequired, setMfaEnrollRequired] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        checkMFA()
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          checkMFA()
        } else {
          setMfaRequired(false)
          setMfaEnrollRequired(false)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const checkMFA = async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      setLoading(false)
      return
    }

    if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      setMfaRequired(true)
      setMfaEnrollRequired(false)
    } else if (data.nextLevel === 'aal1' && data.currentLevel === 'aal1') {
      // User has no MFA factors enrolled - require enrollment
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (!factors?.totp || factors.totp.length === 0) {
        setMfaEnrollRequired(true)
        setMfaRequired(false)
      } else {
        setMfaRequired(false)
        setMfaEnrollRequired(false)
      }
    } else {
      setMfaRequired(false)
      setMfaEnrollRequired(false)
    }
    setLoading(false)
  }

  const signInWithPassword = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    // Log the sign-in
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s) {
      fetch('/api/auth/log', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.access_token}` },
      }).catch(() => {})
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const completeMFA = () => {
    setMfaRequired(false)
    setMfaEnrollRequired(false)
  }

  const isAdmin = user?.email === 'alvin@cedeos.co.ke'

  const value = {
    user,
    session,
    loading,
    mfaRequired,
    mfaEnrollRequired,
    isAdmin,
    signInWithPassword,
    signOut,
    completeMFA,
    checkMFA,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
