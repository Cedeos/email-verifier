import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function BulkVerify({ onComplete }) {
  const { session } = useAuth()
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/api/verify/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      setJob(data)
      startPolling(data.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const startPolling = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/verify/bulk/status/${jobId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setJob(data)
          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(pollRef.current)
            onComplete?.()
          }
        }
      } catch (err) {
        // ignore polling errors
      }
    }, 2000)
  }

  const handleDownload = () => {
    if (!job) return
    window.open(`${API_URL}/api/verify/bulk/download/${job.id}?token=${session.access_token}`, '_blank')
  }

  const handleReset = () => {
    setFile(null)
    setJob(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Validate New List</h2>
              <p className="text-sm text-gray-500">Upload a CSV file with email addresses to validate them all at once</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {!job && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group"
                onClick={() => fileRef.current?.click()}
              >
                <svg className="w-12 h-12 text-gray-300 group-hover:text-indigo-400 mx-auto mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-400 mt-1">CSV file with emails in the first column</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </div>

              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
              >
                {uploading ? 'Uploading...' : 'Validate New List'}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Job Progress */}
      {job && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {job.status === 'completed' ? 'Validation Complete' : 'Processing...'}
              </h3>
              <StatusPill status={job.status} />
            </div>
          </div>

          <div className="p-6">
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{job.processed || 0} of {job.total} emails processed</span>
                <span className="font-medium">{job.total > 0 ? Math.round(((job.processed || 0) / job.total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${job.total > 0 ? ((job.processed || 0) / job.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* Summary Cards */}
            {job.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <SummaryCard label="Valid" value={job.summary.valid} color="green" />
                <SummaryCard label="Invalid" value={job.summary.invalid} color="red" />
                <SummaryCard label="Catch-All" value={job.summary.catch_all} color="amber" />
                <SummaryCard label="Unknown" value={job.summary.unknown} color="gray" />
                <SummaryCard label="Disposable" value={job.summary.disposable} color="orange" />
                <SummaryCard label="Role Account" value={job.summary.role_account} color="purple" />
                <SummaryCard label="Free" value={job.summary.free} color="blue" />
                <SummaryCard label="Total" value={job.summary.total} color="indigo" />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {job.status === 'completed' && (
                <button
                  onClick={handleDownload}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CSV
                </button>
              )}
              <button
                onClick={handleReset}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                New Validation
              </button>
            </div>

            {/* Results Table */}
            {job.status === 'completed' && job.results && job.results.length > 0 && (
              <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Domain</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Provider</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Free</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Disposable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {job.results.slice(0, 50).map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-2.5 px-4 text-gray-900 font-mono text-xs">{r.email}</td>
                          <td className="py-2.5 px-4"><StatusPill status={r.status} small /></td>
                          <td className="py-2.5 px-4 text-gray-600">{r.domain || '-'}</td>
                          <td className="py-2.5 px-4 text-gray-600">{r.smtp_provider || '-'}</td>
                          <td className="py-2.5 px-4">{r.free_email ? '✓' : '-'}</td>
                          <td className="py-2.5 px-4">{r.disposable ? '⚠️' : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {job.results.length > 50 && (
                  <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                    <p className="text-xs text-gray-500">
                      Showing first 50 of {job.results.length} results. Download CSV for full data.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  const colorMap = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  }

  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] || colorMap.gray}`}>
      <p className="text-xs opacity-75 font-medium">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value ?? 0}</p>
    </div>
  )
}

function StatusPill({ status, small }) {
  const colors = {
    valid: 'bg-green-100 text-green-800',
    invalid: 'bg-red-100 text-red-800',
    'catch-all': 'bg-amber-100 text-amber-800',
    unknown: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  }

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colors[status] || colors.unknown} ${
      small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
    }`}>
      {status}
    </span>
  )
}
