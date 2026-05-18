export default function ResultModal({ result, onClose }) {
  if (!result) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center ${getStatusBg(result.status)}`}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{result.email}</h3>
                <StatusBadge status={result.status} />
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-3">
          <DetailRow label="Status" value={result.status} highlight />
          <DetailRow label="Sub-Status" value={result.sub_status || 'None'} />
          <DetailRow label="Free Email" value={result.free_email ? 'Yes' : 'No'} />
          <DetailRow label="Disposable" value={result.disposable ? 'Yes' : 'No'} warn={result.disposable} />
          <DetailRow label="Role Account" value={result.role_account ? 'Yes' : 'No'} />
          <DetailRow label="Account" value={result.username || '-'} />
          <DetailRow label="Domain" value={result.domain || '-'} />
          <DetailRow label="SMTP Provider" value={result.smtp_provider || '-'} />
          <DetailRow label="MX Found" value={result.mx_found ? 'Yes' : 'No'} />
          <DetailRow label="MX Record" value={result.mx_record || '-'} />
          <DetailRow label="Catch-All" value={result.catch_all ? 'Yes' : 'No'} />
          <DetailRow label="Deliverable" value={result.deliverable ? 'Yes' : 'No'} />
          <DetailRow label="Host Exists" value={result.host_exists ? 'Yes' : 'No'} />
          <DetailRow label="Full Inbox" value={result.full_inbox ? 'Yes' : 'No'} warn={result.full_inbox} />
          <DetailRow label="Disabled" value={result.disabled ? 'Yes' : 'No'} warn={result.disabled} />
          <DetailRow label="Reachable" value={result.reachable || 'unknown'} />
          <DetailRow label="Has Gravatar" value={result.has_gravatar ? 'Yes' : 'No'} />
          {result.suggestion && (
            <DetailRow label="Did You Mean" value={result.suggestion} highlight />
          )}
          {result.created_at && (
            <DetailRow label="Verified At" value={new Date(result.created_at).toLocaleString()} />
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, highlight, warn }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${
        warn ? 'text-red-600' :
        highlight ? 'text-indigo-600' :
        'text-gray-900'
      }`}>
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = {
    valid: 'bg-green-100 text-green-800',
    invalid: 'bg-red-100 text-red-800',
    'catch-all': 'bg-amber-100 text-amber-800',
    unknown: 'bg-gray-100 text-gray-800',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.unknown}`}>
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
