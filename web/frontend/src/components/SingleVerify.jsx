import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || ''

function extractCompanyFromDomain(domain) {
  if (!domain) return ''
  const parts = domain.split('.')
  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  }
  return domain
}

export default function SingleVerify({ onVerified }) {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Step 2: enrichment form
  const [showEnrich, setShowEnrich] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setShowEnrich(false)
    setSaved(false)

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

      // If valid, show enrichment form
      if (data.status === 'valid' || data.status === 'catch-all') {
        setShowEnrich(true)
        setCompany(extractCompanyFromDomain(data.domain))
        // Try to guess first/last from username
        const parts = (data.username || '').split(/[._-]/)
        if (parts.length >= 2) {
          setFirstName(parts[0].charAt(0).toUpperCase() + parts[0].slice(1))
          setLastName(parts[1].charAt(0).toUpperCase() + parts[1].slice(1))
        } else if (parts.length === 1 && parts[0]) {
          setFirstName(parts[0].charAt(0).toUpperCase() + parts[0].slice(1))
        }
      }

      // Save verification to history (non-blocking)
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

  const handleSaveProspect = async (e) => {
    e.preventDefault()
    setSaving(true)

    await supabase.from('prospects').insert({
      user_id: session.user.id,
      email: result.email,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      company: company.trim(),
      role: role.trim(),
      domain: result.domain,
      status: result.status,
      smtp_provider: result.smtp_provider,
      mx_record: result.mx_record,
      catch_all: result.catch_all,
      deliverable: result.deliverable,
      free_email: result.free_email,
    })

    setSaving(false)
    setSaved(true)
    setShowEnrich(false)
  }

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
                  {result.reachable === 'yes' && (
                    <span className="text-xs text-green-600 font-medium">Will not bounce</span>
                  )}
                  {result.reachable === 'unknown' && result.catch_all && (
                    <span className="text-xs text-amber-600 font-medium">Catch-all domain</span>
                  )}
                  {result.reachable === 'no' && (
                    <span className="text-xs text-red-600 font-medium">Will bounce</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-gray-100">
            <ResultCell label="Status" value={result.status} highlight />
            <ResultCell label="Reachable" value={
              result.reachable === 'yes' ? 'Yes - Safe to send' :
              result.reachable === 'no' ? 'No - Will bounce' :
              'Unknown'
            } good={result.reachable === 'yes'} warn={result.reachable === 'no'} />
            <ResultCell label="Domain" value={result.domain || '-'} />
            <ResultCell label="SMTP Provider" value={result.smtp_provider || '-'} />
            <ResultCell label="MX Record" value={result.mx_record || '-'} />
            <ResultCell label="MX Found" value={result.mx_found ? 'Yes' : 'No'} />
            <ResultCell label="Deliverable" value={result.deliverable ? 'Yes' : 'No'} good={result.deliverable} />
            <ResultCell label="Catch-All" value={result.catch_all ? 'Yes' : 'No'} />
            <ResultCell label="Host Exists" value={result.host_exists ? 'Yes' : 'No'} />
            <ResultCell label="Free Email" value={result.free_email ? 'Yes' : 'No'} />
            <ResultCell label="Disposable" value={result.disposable ? 'Yes' : 'No'} warn={result.disposable} />
            <ResultCell label="Role Account" value={result.role_account ? 'Yes' : 'No'} />
          </div>

          {saved && (
            <div className="p-4 bg-green-50 border-t border-green-100 text-green-700 text-sm font-medium text-center">
              Prospect saved to database
            </div>
          )}
        </div>
      )}

      {/* Step 2: Enrichment Form */}
      {showEnrich && !saved && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1a2e1a]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1a2e1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Save Prospect</h3>
                <p className="text-sm text-gray-500">Add contact details to your prospecting database</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleSaveProspect} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Inc"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role / Title</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Marketing Manager"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2e1a] focus:border-[#1a2e1a] outline-none text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-[#1a2e1a] text-white rounded-lg font-medium hover:bg-[#243d24] disabled:opacity-50 transition-all text-sm"
              >
                {saving ? 'Saving...' : 'Save Prospect'}
              </button>
              <button
                type="button"
                onClick={() => setShowEnrich(false)}
                className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-all text-sm"
              >
                Skip
              </button>
            </div>
          </form>
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
