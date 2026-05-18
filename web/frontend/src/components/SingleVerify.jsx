import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || ''

function extractCompanyFromDomain(domain) {
  if (!domain) return null
  const parts = domain.split('.')
  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  }
  return domain
}

function guessRole(username) {
  if (!username) return null
  const lower = username.toLowerCase()
  const roleMap = {
    'info': 'General Inquiries',
    'support': 'Support',
    'sales': 'Sales',
    'admin': 'Administrator',
    'hr': 'Human Resources',
    'finance': 'Finance',
    'marketing': 'Marketing',
    'ceo': 'CEO',
    'cto': 'CTO',
    'cfo': 'CFO',
    'coo': 'COO',
    'contact': 'Contact',
    'hello': 'General',
    'team': 'Team',
    'billing': 'Billing',
    'accounts': 'Accounts',
    'noreply': 'No Reply',
    'no-reply': 'No Reply',
  }
  if (roleMap[lower]) return roleMap[lower]
  return null
}

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

      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Server temporarily unavailable. Please try again.')
      }

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      setResult(data)

      // Save to Supabase history (non-blocking)
      supabase.from('verifications').insert({
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
      }).then(() => onVerified?.())

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const company = result ? extractCompanyFromDomain(result.domain) : null
  const role = result ? guessRole(result.username) : null

  return (
    <div className="space-y-6">
      {/* Verify Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <form onSubmit={handleVerify} className="flex gap-3">
            <div className="flex-1">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-gray-900 placeholder:text-gray-400 text-sm"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="px-8 py-3.5 bg-[#1a2e1a] text-white rounded-xl font-medium hover:bg-[#243d24] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Verifying
                </>
              ) : (
                'Verify'
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getStatusBg(result.status)}`}>
                {result.status === 'valid' ? (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : result.status === 'invalid' ? (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">{result.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={result.status} />
                  {company && !result.free_email && (
                    <span className="text-xs text-gray-500">{company}</span>
                  )}
                  {role && (
                    <span className="text-xs text-gray-400">/ {role}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-gray-100">
            <ResultCell label="Status" value={result.status} highlight />
            <ResultCell label="Sub-Status" value={result.sub_status || 'None'} />
            <ResultCell label="Domain" value={result.domain || '-'} />
            <ResultCell label="SMTP Provider" value={result.smtp_provider || '-'} />
            <ResultCell label="MX Record" value={result.mx_record || '-'} />
            <ResultCell label="MX Found" value={result.mx_found ? 'Yes' : 'No'} />
            <ResultCell label="Deliverable" value={result.deliverable ? 'Yes' : 'No'} good={result.deliverable} />
            <ResultCell label="Catch-All" value={result.catch_all ? 'Yes' : 'No'} />
            <ResultCell label="Reachable" value={result.reachable || 'unknown'} />
            <ResultCell label="Free Email" value={result.free_email ? 'Yes' : 'No'} />
            <ResultCell label="Disposable" value={result.disposable ? 'Yes' : 'No'} warn={result.disposable} />
            <ResultCell label="Role Account" value={result.role_account ? 'Yes' : 'No'} />
            {result.suggestion && (
              <ResultCell label="Did You Mean" value={result.suggestion} highlight />
            )}
            {company && !result.free_email && (
              <ResultCell label="Company" value={company} />
            )}
            {role && (
              <ResultCell label="Role" value={role} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultCell({ label, value, highlight, warn, good }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-medium ${
        warn ? 'text-red-600' :
        good ? 'text-green-600' :
        highlight ? 'text-[#1a2e1a]' :
        'text-gray-900'
      }`}>
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    valid: 'bg-green-100 text-green-800',
    invalid: 'bg-red-100 text-red-800',
    'catch-all': 'bg-amber-100 text-amber-800',
    unknown: 'bg-gray-100 text-gray-800',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || styles.unknown}`}>
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
