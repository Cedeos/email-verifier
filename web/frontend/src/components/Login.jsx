import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

const ALLOWED_DOMAIN = 'cedeos'

function isCedeosDomain(email) {
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const domain = parts[1].toLowerCase()
  return domain === ALLOWED_DOMAIN || domain.startsWith(`${ALLOWED_DOMAIN}.`)
}

export default function Login() {
  const { signInWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }

    if (!isCedeosDomain(email.trim())) {
      setError('Access restricted. Use your company email.')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await signInWithPassword(email.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a2e1a] flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="#1a2e1a"/>
              <path d="M10 16.5L14 20.5L22 12.5" stroke="#d4a843" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xl font-bold text-[#1a2e1a] tracking-tight">
              Cede<span className="text-[#d4a843]">OS</span>
            </span>
          </div>
          <h1 className="text-lg font-semibold text-[#1a2e1a]">Verify</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cedeos.co.ke"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-gray-900 placeholder:text-gray-400 text-sm"
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-gray-900 placeholder:text-gray-400 text-sm"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3.5 bg-[#1a2e1a] text-white rounded-xl font-medium hover:bg-[#243d24] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
