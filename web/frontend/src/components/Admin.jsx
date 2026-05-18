import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function Admin() {
  const { session } = useAuth()
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null)
  const [logFilter, setLogFilter] = useState('all')

  useEffect(() => {
    if (activeTab === 'users') fetchUsers()
    if (activeTab === 'logs') fetchLogs()
  }, [activeTab, logFilter])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      // ignore
    }
    setLoadingUsers(false)
  }

  const fetchLogs = async () => {
    setLoadingLogs(true)
    try {
      const url = logFilter === 'all'
        ? `${API_URL}/api/admin/logs`
        : `${API_URL}/api/admin/logs?action=${logFilter}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch (err) {
      // ignore
    }
    setLoadingLogs(false)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setInviteLoading(true)
    setInviteMsg(null)

    try {
      const res = await fetch(`${API_URL}/api/admin/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setInviteMsg({ type: 'success', text: `Invited ${inviteEmail.trim()} successfully` })
        setInviteEmail('')
        fetchUsers()
      } else {
        setInviteMsg({ type: 'error', text: data.error || 'Failed to invite user' })
      }
    } catch (err) {
      setInviteMsg({ type: 'error', text: err.message })
    }
    setInviteLoading(false)
  }

  const tabs = [
    { id: 'users', label: 'Team Members' },
    { id: 'logs', label: 'Activity Logs' },
  ]

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Invite Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
                  <p className="text-sm text-gray-500">Add a new CEDEOS team member to the platform</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <form onSubmit={handleInvite} className="flex gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@cedeos.co.ke"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900 placeholder:text-gray-400 text-sm"
                  disabled={inviteLoading}
                />
                <button
                  type="submit"
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {inviteLoading ? 'Inviting...' : 'Invite'}
                </button>
              </form>
              {inviteMsg && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  inviteMsg.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {inviteMsg.text}
                </div>
              )}
            </div>
          </div>

          {/* Users List */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
              <p className="text-sm text-gray-500">{users.length} members</p>
            </div>
            <div className="overflow-x-auto">
              {loadingUsers ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">No team members yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Last Sign In</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">MFA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900 font-medium">{u.email}</td>
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            u.mfa_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {u.mfa_enabled ? 'Enabled' : 'Not set'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Activity Logs</h3>
                <p className="text-sm text-gray-500">Track who verified what and when</p>
              </div>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {['all', 'single_verify', 'bulk_verify', 'login'].map(f => (
                  <button
                    key={f}
                    onClick={() => setLogFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      logFilter === f
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'single_verify' ? 'Single' : f === 'bulk_verify' ? 'Bulk' : 'Login'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loadingLogs ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No activity logs yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Action</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Details</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Result</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900 text-xs">{log.user_email || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.action === 'single_verify' ? 'bg-indigo-100 text-indigo-800' :
                          log.action === 'bulk_verify' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs max-w-[200px] truncate">{log.details || '-'}</td>
                      <td className="py-3 px-4 text-gray-600 text-xs">{log.result || '-'}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
