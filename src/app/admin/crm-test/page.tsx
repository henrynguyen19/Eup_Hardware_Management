'use client'
import { useState } from 'react'

interface TestResult {
  staffId:       string
  method:        string
  fetchMs:       number
  crmStatus:     number
  crmError:      string | null
  total:         number
  dateRange:     { from: string | null; to: string | null }
  byStaffInMemo: Record<string, number>
  fields:        string[]
  preview:       Record<string, unknown>[]
  parseError?:   string
  rawPreview?:   string
  error?:        string
}

interface LoginResult {
  ok:                boolean
  rawResponse:       Record<string, unknown>
  detectedSessionId: string | null
  error?:            string
}

const KNOWN_IDS = [
  { label: 'Henry',  id: '2894' },
  { label: 'Kane',   id: '9141' },
  { label: 'Stefan', id: '9090' },
  { label: 'Shiro',  id: '9146' },
  { label: 'Irene',  id: '9168' },
  { label: 'Blue',   id: '9268' },
  { label: 'Bob',    id: '9267' },
  { label: 'Kai',    id: '8869' },
]

export default function CrmTestPage() {
  const [staffId,      setStaffId]      = useState('2894')
  const [method,       setMethod]       = useState('GetCustServiceByStaff')
  const [preview,      setPreview]      = useState('3')
  const [loading,      setLoading]      = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginResult,  setLoginResult]  = useState<LoginResult | null>(null)
  const [results,      setResults]      = useState<TestResult[]>([])
  const [selRow,       setSelRow]       = useState<Record<string, unknown> | null>(null)

  async function runTest(sid?: string) {
    const id = sid ?? staffId
    if (!id) return
    setLoading(true)
    const params = new URLSearchParams({ staffId: id, method, preview })
    const res = await fetch(`/api/crm/test?${params}`)
    const json = await res.json()
    setResults(prev => [{ ...json, staffId: id }, ...prev.filter(r => r.staffId !== id)])
    setLoading(false)
  }

  async function testLogin() {
    setLoginLoading(true)
    setLoginResult(null)
    const res = await fetch('/api/crm/test', { method: 'POST' })
    const json = await res.json()
    setLoginResult(json)
    setLoginLoading(false)
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</a>
        <h1 className="text-xl font-semibold text-gray-800">CRM SOAP Test</h1>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Chỉ để nghiên cứu dữ liệu thô</span>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Staff ID</label>
            <input
              type="number"
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:border-blue-400"
              placeholder="2894"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SOAP Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="GetCustServiceByStaff">GetCustServiceByStaff</option>
              <option value="GetStaffInfo">GetStaffInfo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Preview rows</label>
            <select
              value={preview}
              onChange={e => setPreview(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            >
              {['1','3','5','10','20'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <button
            onClick={() => runTest()}
            disabled={loading || !staffId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '⏳ Đang gọi...' : '🔍 Test'}
          </button>
        </div>

        {/* Quick test buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-gray-400 self-center">Thử nhanh:</span>
          {KNOWN_IDS.map(s => (
            <button
              key={s.label}
              disabled={loading}
              onClick={() => { setStaffId(s.id); runTest(s.id) }}
              title={`Staff ID: ${s.id}`}
              className="px-3 py-1 text-xs rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 transition"
            >
              {s.label} ({s.id})
            </button>
          ))}
        </div>
      </div>

      {/* Login Test Panel */}
      <div className="bg-white rounded-xl border border-amber-200 p-5 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-semibold text-amber-800">🔑 Test Login (Auto-refresh session)</span>
          <span className="text-xs text-amber-600">Gọi MethodName=Login để xem response và phát hiện SESSION_ID field</span>
          <button
            onClick={testLogin}
            disabled={loginLoading}
            className="ml-auto px-4 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
          >
            {loginLoading ? '⏳ Đang login...' : '🔑 Test Login'}
          </button>
        </div>

        {loginResult && (
          <div className={`rounded-lg border p-4 text-sm ${loginResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={loginResult.ok ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                {loginResult.ok ? '✅ Login OK' : '❌ Login Thất bại'}
              </span>
              {loginResult.detectedSessionId
                ? <span className="text-green-700 text-xs">SESSION_ID tìm thấy ✓</span>
                : <span className="text-amber-700 text-xs">⚠ Không tìm thấy SESSION_ID trong response</span>
              }
              {loginResult.error && <span className="text-red-600 text-xs">{loginResult.error}</span>}
            </div>
            {loginResult.detectedSessionId && (
              <div className="mb-2">
                <span className="text-xs font-mono text-gray-500">detectedSessionId: </span>
                <code className="text-xs text-green-800 break-all">{loginResult.detectedSessionId.slice(0, 60)}…</code>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Raw response (để xác định field chứa session):</p>
              <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-3 overflow-auto max-h-64">
                {JSON.stringify(loginResult.rawResponse, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results.map((r, idx) => (
        <div key={`${r.staffId}-${idx}`} className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          {/* Header */}
          <div className={`px-5 py-3 flex items-center gap-3 border-b ${r.error || r.crmError ? 'bg-red-50' : 'bg-gray-50'}`}>
            <span className="font-mono text-sm font-bold text-blue-700">Staff ID: {r.staffId}</span>
            <span className="text-xs text-gray-500">{r.method}</span>
            <span className="text-xs text-gray-400">{r.fetchMs}ms</span>
            {r.error   && <span className="text-xs text-red-600 ml-auto">❌ {r.error}</span>}
            {r.crmError && <span className="text-xs text-red-600 ml-auto">CRM: {r.crmError}</span>}
            {!r.error && !r.crmError && (
              <span className="text-xs text-green-600 ml-auto">✅ {r.total} records</span>
            )}
          </div>

          {r.parseError && (
            <div className="p-4 text-sm text-red-600">
              {r.parseError}: <code className="text-xs">{r.rawPreview}</code>
            </div>
          )}

          {!r.error && !r.parseError && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Stats */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">TỔNG QUAN</p>
                <p className="text-sm text-gray-700">📅 {r.dateRange.from} → {r.dateRange.to}</p>
                <p className="text-sm text-gray-700 mt-1">📊 {r.total} records</p>
                <p className="text-xs text-gray-400 mt-2">Fields: {r.fields.join(', ')}</p>
              </div>

              {/* By staff in memo */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">PHÂN TÍCH CS_MEMO (nhân viên)</p>
                <div className="space-y-1">
                  {Object.entries(r.byStaffInMemo)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-xs w-16 text-gray-600">{name}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-blue-400 h-2 rounded-full"
                            style={{ width: r.total > 0 ? `${(count / r.total) * 100}%` : '0%' }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Preview records */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">PREVIEW ({r.preview.length} records)</p>
                <div className="space-y-2">
                  {r.preview.map((row, i) => (
                    <button
                      key={i}
                      onClick={() => setSelRow(selRow === row ? null : row)}
                      className="w-full text-left p-2 bg-gray-50 hover:bg-blue-50 rounded-lg border border-gray-100 text-xs transition"
                    >
                      <div className="font-mono text-blue-600">#{row.CS_ID as string}</div>
                      <div className="text-gray-600 truncate">{row.CS_Date as string} · {row.Cust_Name as string}</div>
                      <div className="text-gray-400 truncate">{String(row.CS_Memo ?? '').slice(0, 60)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {results.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-16">
          Nhập Staff ID và bấm Test để xem dữ liệu thô từ CRM
        </div>
      )}

      {/* Detail modal */}
      {selRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelRow(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-gray-800">Chi tiết record #{selRow.CS_ID as string}</h2>
              <button onClick={() => setSelRow(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-2">
              {Object.entries(selRow).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-sm border-b border-gray-50 pb-1">
                  <span className="font-mono text-blue-600 w-36 shrink-0 text-xs">{k}</span>
                  <span className="text-gray-700 break-all">{String(v ?? '')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
