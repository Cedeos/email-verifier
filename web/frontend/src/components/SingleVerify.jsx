import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function SingleVerify({ onVerified }) {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`${API_URL}/api/verify/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Verification failed')
      }

      const data = await res.json()
      setResult(data)

      // Save to Supabase history
      await supabase.from('verifications').insert({
        user_id: session.user.id,
        email: data.email,
        status: data.status,
        sub_status: data.sub_status,
        free_email: data.free_email,
        disposable: data.disposable,
        role_account: data.role_account,
        domain: data.domain,
        username: data.username,
        mx_found: data.mx_found,
        mx_record: data.mx_record,
        smtp_provider: data.smtp_provider,
        suggestion: data.suggestion,
        has_gravatar: data.has_gravatar,
        reachable: data.reachable,
        catch_all: data.catch_all,
        deliverable: data.deliverable,
        full_inbox: data.full_inbox,
        host_exists: data.host_exists,
        disabled: data.disabled,
      })

      onVerified?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Verify Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Single Email Validation</h2>
              <p className="text-sm text-gray-500">Verify deliverability and get detailed information</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <form onSubmit={handleVerify} className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="darshna.patel@mayfair.co.ke"
                className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900 placeholder:text-gray-400 text-sm"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="px-8 py-3.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Verifying
                </>
              ) : (
                'Go'
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Result Display - ZeroBounce style */}
      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Result Header */}
          <div className="p-6 border-b border-gray-100 text-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${getStatusBg(result.status)}`}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-900">{result.email}</p>
            <StatusBadge status={result.status} className="mt-2" />
          </div>

          {/* Result Grid - matching ZeroBounce layout */}
          <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-gray-100">
            <ResultCell label="STATUS" value={result.status} highlight />
            <ResultCell label="SUB-STATUS" value={result.sub_status || 'None'} />
            <ResultCell label="FREE EMAIL" value={result.free_email ? 'Yes' : 'No'} />
            <ResultCell label="DID YOU MEAN" value={result.suggestion || 'Unknown'} />
            <ResultCell label="ACCOUNT" value={result.username || '-'} />
            <ResultCell label="DOMAIN" value={result.domain || '-'} />
            <ResultCell label="SMTP PROVIDER" value={result.smtp_provider || '-'} />
            <ResultCell label="MX FOUND" value={result.mx_found ? 'Yes' : 'No'} />
            <ResultCell label="MX RECORD" value={result.mx_record || '-'} />
            <ResultCell label="CATCH-ALL" value={result.catch_all ? 'Yes' : 'No'} />
            <ResultCell label="DELIVERABLE" value={result.deliverable ? 'Yes' : 'No'} />
            <ResultCell label="DISPOSABLE" value={result.disposable ? 'Yes' : 'No'} warn={result.disposable} />
            <ResultCell label="ROLE ACCOUNT" value={result.role_account ? 'Yes' : 'No'} />
            <ResultCell label="HOST EXISTS" value={result.host_exists ? 'Yes' : 'No'} />
            <ResultCell label="REACHABLE" value={result.reachable || 'unknown'} />
            <ResultCell label="HAS GRAVATAR" value={result.has_gravatar ? 'Yes' : 'No'} />
            <ResultCell label="FULL INBOX" value={result.full_inbox ? 'Yes' : 'No'} warn={result.full_inbox} />
            <ResultCell label="DISABLED" value={result.disabled ? 'Yes' : 'No'} warn={result.disabled} />
          </div>
        </div>
      )}
    </div>
  )
}

function ResultCell({ label, value, highlight, warn }) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-medium ${
        warn ? 'text-red-600' :
        highlight ? 'text-indigo-600' :
        'text-gray-900'
      }`}>
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ status, className = '' }) {
  const styles = {
    valid: 'bg-green-100 text-green-800 ring-green-600/20',
    invalid: 'bg-red-100 text-red-800 ring-red-600/20',
    'catch-all': 'bg-amber-100 text-amber-800 ring-amber-600/20',
    unknown: 'bg-gray-100 text-gray-800 ring-gray-600/20',
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${styles[status] || styles.unknown} ${className}`}>
      {status}
    </span>
  )
}

function getStatusBg(status) {
  switch (status) {
    case 'valid': return 'bg-green-500'
    case 'invalid': return 'bg-red-500'
    case 'catch-all': return 'bg-amber-500'
    default: return 'bg-gray-500'
  }
}
