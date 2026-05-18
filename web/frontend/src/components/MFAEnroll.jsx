import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function MFAEnroll() {
  const { completeMFA, signOut } = useAuth()
  const [factorId, setFactorId] = useState('')
  const [qr, setQR] = useState('')
  const [secret, setSecret] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)

  useEffect(() => {
    enroll()
  }, [])

  const enroll = async () => {
    setEnrolling(true)
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'CEDEOS Email Verifier',
      friendlyName: 'CEDEOS Authenticator',
    })
    if (error) {
      setError(error.message)
      setEnrolling(false)
      return
    }
    setFactorId(data.id)
    setQR(data.totp.qr_code)
    setSecret(data.totp.secret)
    setEnrolling(false)
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!verifyCode.trim()) return

    setLoading(true)
    setError('')

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) throw challenge.error

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode.trim(),
      })
      if (verify.error) throw verify.error

      completeMFA()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Set Up Two-Factor Authentication</h2>
          <p className="text-sm text-gray-500 mt-2">
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
        </div>

        {enrolling ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {qr && (
              <div className="flex justify-center mb-6">
                <div className="p-3 bg-white border border-gray-200 rounded-xl">
                  <img src={qr} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>
            )}

            {secret && (
              <div className="mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Manual entry key:</p>
                <p className="text-xs font-mono text-gray-700 break-all select-all">{secret}</p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900 text-center text-lg tracking-widest font-mono"
                  disabled={loading}
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading || verifyCode.length < 6}
                className="w-full px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Verifying...' : 'Enable 2FA'}
              </button>
            </form>
          </>
        )}

        <button
          onClick={signOut}
          className="w-full mt-4 px-6 py-2.5 text-gray-500 text-sm hover:text-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
