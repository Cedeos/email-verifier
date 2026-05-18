import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import ResultModal from './ResultModal'

export default function History() {
  const { user } = useAuth()
  const [verifications, setVerifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedResult, setSelectedResult] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchHistory()
  }, [filter])

  const fetchHistory = async () => {
    setLoading(true)
    let query = supabase
      .from('verifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query

    if (!error) {
      setVerifications(data || [])
    }
    setLoading(false)
  }

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'valid', label: 'Valid' },
    { id: 'invalid', label: 'Invalid' },
    { id: 'catch-all', label: 'Catch-All' },
    { id: 'unknown', label: 'Unknown' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Verification History</h2>
                <p className="text-sm text-gray-500">{verifications.length} results found</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {filters.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
              <p className="text-sm text-gray-500 mt-3">Loading history...</p>
            </div>
          ) : verifications.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <p className="text-sm text-gray-500">No verifications yet. Start by validating an email.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Domain</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Provider</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Free</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Disposable</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {verifications.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedResult(v)}
                  >
                    <td className="py-3 px-4 text-gray-900 font-medium">{v.email}</td>
                    <td className="py-3 px-4"><StatusPill status={v.status} /></td>
                    <td className="py-3 px-4 text-gray-600">{v.domain || '-'}</td>
                    <td className="py-3 px-4 text-gray-600">{v.smtp_provider || '-'}</td>
                    <td className="py-3 px-4">{v.free_email ? '✓' : '-'}</td>
                    <td className="py-3 px-4">{v.disposable ? '⚠️' : '-'}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Result Modal */}
      {selectedResult && (
        <ResultModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const colors = {
    valid: 'bg-green-100 text-green-800',
    invalid: 'bg-red-100 text-red-800',
    'catch-all': 'bg-amber-100 text-amber-800',
    unknown: 'bg-gray-100 text-gray-800',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[status] || colors.unknown}`}>
      {status}
    </span>
  )
}
