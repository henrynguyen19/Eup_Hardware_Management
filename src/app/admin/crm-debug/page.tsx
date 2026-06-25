'use client'
import { useState } from 'react'

interface TicketRow {
  cs_id: number
  cs_date: string
  cust_name: string
  cust_id: number
  direction: string
  handler: string | null   // null = không detect được tên nào từ CS_Memo
  memo_short: string       // 200 ký tự đầu
  zone: string
}

interface StaffResult {
  staffName: string
  staffId: number
  totalRaw: number
  withHandler: number
  noHandler: number
  handlerBreakdown: Record<string, number>
  sample: TicketRow[]
  error?: string
}

interface DebugResponse {
  ok: boolean
  data: StaffResult[]
}

interface SessionInfo {
  staffId: number
  name: string
  status: string
  isExpired?: boolean
  sessionId?: string
  expiresAt?: string
  updatedAt?: string
}

interface SessionCheckResponse {
  ok: boolean
  now: string
  sessions: SessionInfo[]
}

interface ReloginResult {
  name: string
  staffId: number
  ok: boolean
  ms?: number
  error?: string
  sessionPreview?: string
}

const STAFF_LIST = ['Tất cả', 'Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']
type Filter = 'rejected' | 'ok' | 'all'

export default function CRMDebugPage() {
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState<DebugResponse | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [staff, setStaff]             = useState('Tất cả')
  const [filter, setFilter]           = useState<Filter>('rejected')
  const [limit, setLimit]             = useState(300)
  const [expandMemo, setExpandMemo]   = useState<Set<number>>(new Set())

  // Session panel
  const [sessLoading, setSessLoading] = useState(false)
  const [sessions, setSessions]       = useState<SessionInfo[] | null>(null)
  const [reloginLoading, setReloginLoading] = useState(false)
  const [reloginResults, setReloginResults] = useState<ReloginResult[] | null>(null)
  const [sessError, setSessError]     = useState<string | null>(null)

  async function fetchDebug() {
    setLoading(true); setError(null); setResult(null)
    try {
      const params = new URLSearchParams({ limit: String(limit) })
      if (staff !== 'Tất cả') params.set('staff', staff)
      const res  = await fetch(`/api/crm/debug?${params}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Unknown error')
      setResult(json)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  async function checkSessions() {
    setSessLoading(true); setSessError(null); setSessions(null); setReloginResults(null)
    try {
      const res  = await fetch('/api/crm/session-check')
      const json: SessionCheckResponse = await res.json()
      if (!json.ok) throw new Error('Lỗi khi check session')
      setSessions(json.sessions)
    } catch (e) { setSessError(String(e)) }
    finally { setSessLoading(false) }
  }

  async function forceRelogin(staffId?: number) {
    setReloginLoading(true); setSessError(null); setReloginResults(null)
    try {
      const body = staffId ? { staffId } : {}
      const res  = await fetch('/api/crm/session-check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Lỗi re-login')
      setReloginResults(json.reloginResults)
      // Refresh session list sau khi re-login
      await checkSessions()
    } catch (e) { setSessError(String(e)) }
    finally { setReloginLoading(false) }
  }

  function toggleMemo(id: number) {
    setExpandMemo(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const totalRejected = result?.data.reduce((s, d) => s + (d.noHandler ?? 0), 0) ?? 0
  const totalRaw      = result?.data.reduce((s, d) => s + (d.totalRaw   ?? 0), 0) ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-5">
          <a href="/ho-tro" className="text-sm text-gray-400 hover:text-blue-600">← Hỗ trợ kỹ thuật</a>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">🔍 CRM Reject Analyzer</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Debug ticket bị reject + kiểm tra session CRM. Dùng khi sync bị timeout liên tục.
          </p>
        </div>

        {/* ── SESSION PANEL ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">🔐 Trạng thái Session CRM</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Nếu sync bị timeout → check session trước. Session hết hạn → Force Re-login.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={checkSessions} disabled={sessLoading}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition disabled:opacity-40">
                {sessLoading ? '⏳ Đang check...' : '🔍 Check Sessions'}
              </button>
              <button onClick={() => forceRelogin()} disabled={reloginLoading || sessLoading}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition disabled:opacity-40">
                {reloginLoading ? '⏳ Đang re-login...' : '🔄 Force Re-login Tất Cả'}
              </button>
            </div>
          </div>

          {sessError && (
            <div className="text-red-600 text-xs bg-red-50 rounded-lg p-2">{sessError}</div>
          )}

          {sessions && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-2">
              {sessions.map(s => (
                <div key={s.staffId}
                  className={`rounded-lg border p-2.5 text-xs ${
                    s.status === 'no_cache'  ? 'border-gray-200 bg-gray-50' :
                    s.isExpired              ? 'border-red-200 bg-red-50' :
                                               'border-green-200 bg-green-50'
                  }`}>
                  <div className="font-semibold text-gray-800 mb-1">{s.name}</div>
                  <div className={`font-medium ${
                    s.status === 'no_cache' ? 'text-gray-400' :
                    s.isExpired             ? 'text-red-600'  : 'text-green-600'
                  }`}>
                    {s.status === 'no_cache' ? '⚪ Chưa có cache' :
                     s.isExpired             ? `🔴 ${s.status}` :
                                               `🟢 ${s.status}`}
                  </div>
                  {s.updatedAt && (
                    <div className="text-gray-400 mt-1">
                      Login lúc: {new Date(s.updatedAt).toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' })}
                    </div>
                  )}
                  <button onClick={() => forceRelogin(s.staffId)} disabled={reloginLoading}
                    className="mt-1.5 text-[10px] text-orange-500 hover:text-orange-700 underline disabled:opacity-40">
                    Re-login riêng
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Re-login results */}
          {reloginResults && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {reloginResults.map((r, i) => (
                <div key={i} className={`rounded-lg border p-2.5 text-xs ${r.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="font-semibold text-gray-800">{r.name}</div>
                  {r.ok
                    ? <><div className="text-green-600 font-medium">✅ OK ({r.ms}ms)</div>
                        <div className="text-gray-400 font-mono">{r.sessionPreview}</div></>
                    : <div className="text-red-600 break-all">{r.error}</div>
                  }
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── TICKET DEBUG PANEL ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Nhân viên</label>
            <select value={staff} onChange={e => setStaff(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {STAFF_LIST.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Hiển thị tối đa</label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {[100, 200, 300, 500].map(n => <option key={n} value={n}>{n} ticket/người</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Lọc</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {([['rejected','❌ Bị reject'],['ok','✅ OK'],['all','Tất cả']] as [Filter,string][]).map(([v,l]) => (
                <button key={v} onClick={() => setFilter(v)}
                  className={`px-3 py-2 transition ${filter===v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={fetchDebug} disabled={loading}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 self-end">
            {loading ? '⏳ Đang tải CRM...' : '🔍 Fetch & Phân tích'}
          </button>
          {loading && (
            <div className="text-xs text-gray-400 self-end pb-2">
              Đang gọi CRM SOAP... (~10-20s, nếu quá 30s là CRM timeout)
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
            <strong>Lỗi:</strong> {error}
            {error.includes('timeout') || error.includes('Timeout') ? (
              <div className="mt-2 text-xs text-red-500">
                💡 CRM bị timeout → Thử <strong>Force Re-login</strong> ở panel trên rồi fetch lại.
                Nếu re-login cũng timeout thì CRM SOAP server đang có vấn đề (không phải lỗi code).
              </div>
            ) : null}
          </div>
        )}

        {/* Summary */}
        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
              <div className="md:col-span-1 bg-white rounded-xl border border-gray-200 p-3">
                <div className="text-xs text-gray-500 mb-1">Tổng cộng</div>
                <div className="text-2xl font-bold text-gray-800">{totalRaw}</div>
                <div className="text-xs text-red-500 mt-1">❌ Reject: {totalRejected}</div>
                <div className="text-xs text-green-500">✅ OK: {totalRaw - totalRejected}</div>
              </div>
              {result.data.map(s => (
                <div key={s.staffName}
                  className={`bg-white rounded-xl border p-3 ${s.error ? 'border-red-300' : s.noHandler > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
                  <div className="font-bold text-gray-800 text-sm">{s.staffName}</div>
                  {s.error
                    ? <div className="text-xs text-red-500 mt-1 break-all">{s.error}</div>
                    : <>
                        <div className="text-xl font-bold mt-1">{s.totalRaw}</div>
                        <div className="text-xs text-green-600">✅ {s.withHandler} có tên</div>
                        <div className={`text-xs ${s.noHandler > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          ❌ {s.noHandler} không tên
                        </div>
                        {Object.keys(s.handlerBreakdown).length > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
                            {Object.entries(s.handlerBreakdown)
                              .sort(([,a],[,b]) => b-a)
                              .map(([name, cnt]) => (
                                <div key={name} className={name === s.staffName ? 'text-green-600 font-medium' : 'text-orange-500'}>
                                  {name}: {cnt}{name !== s.staffName ? ' ⚠️' : ''}
                                </div>
                              ))}
                          </div>
                        )}
                      </>
                  }
                </div>
              ))}
            </div>

            {/* Ticket tables */}
            {result.data.map(s => {
              if (s.error) return null
              const rows = s.sample.filter(t =>
                filter === 'rejected' ? t.handler === null :
                filter === 'ok'       ? t.handler !== null :
                true
              )
              if (rows.length === 0) return (
                <div key={s.staffName} className="mb-4 bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2">
                  <span className="font-semibold text-gray-700">{s.staffName}</span>
                  <span className="text-sm text-green-600">
                    {filter === 'rejected' ? '✅ Không có ticket bị reject!' : '— không có dữ liệu'}
                  </span>
                </div>
              )

              return (
                <div key={s.staffName} className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-bold text-gray-800 text-base">{s.staffName}</h2>
                    <span className="text-sm text-gray-400">
                      {filter === 'rejected'
                        ? `${s.noHandler} ticket không có tên trong CS_Memo`
                        : filter === 'ok'
                        ? `${s.withHandler} ticket OK`
                        : `${s.totalRaw} ticket tổng`}
                    </span>
                    {filter === 'rejected' && s.noHandler > rows.length && (
                      <span className="text-xs text-orange-500">(chỉ hiển thị {rows.length}/{s.noHandler} — tăng limit)</span>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                          <th className="px-3 py-2 text-left w-20">CS_ID</th>
                          <th className="px-3 py-2 text-left w-24">Ngày</th>
                          <th className="px-3 py-2 text-left w-32">Khách hàng</th>
                          <th className="px-3 py-2 text-left w-16">IO</th>
                          <th className="px-3 py-2 text-left w-28">Handler detect</th>
                          <th className="px-3 py-2 text-left">CS_Memo <span className="font-normal text-gray-400">(click để xem đầy đủ)</span></th>
                          <th className="px-3 py-2 text-left w-40">Lý do reject</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map(t => {
                          const rejected = t.handler === null
                          const expanded = expandMemo.has(t.cs_id)
                          return (
                            <tr key={t.cs_id} className={rejected ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2 font-mono text-xs text-gray-500">{t.cs_id}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">{t.cs_date}</td>
                              <td className="px-3 py-2 text-xs">
                                <div className="font-medium text-gray-800 truncate max-w-[120px]">{t.cust_name || '—'}</div>
                                <div className="text-gray-400">KH {t.cust_id || '—'}</div>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-500">{t.direction || '—'}</td>
                              <td className="px-3 py-2 text-xs">
                                {t.handler
                                  ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${t.handler === s.staffName ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                      {t.handler}{t.handler !== s.staffName ? ' ⚠️' : ''}
                                    </span>
                                  : <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium text-[11px]">không detect</span>
                                }
                              </td>
                              <td className="px-3 py-2 text-xs font-mono text-gray-700 cursor-pointer"
                                  onClick={() => toggleMemo(t.cs_id)}>
                                {t.memo_short
                                  ? <span className={`break-all whitespace-pre-wrap ${!expanded ? 'line-clamp-2' : ''}`}>
                                      {t.memo_short}
                                      {!expanded && t.memo_short.length >= 119 && <span className="text-indigo-400"> [xem thêm]</span>}
                                    </span>
                                  : <span className="text-gray-300 italic">( trống )</span>
                                }
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {rejected
                                  ? <span className="text-red-600">
                                      {!t.memo_short
                                        ? 'CS_Memo trống'
                                        : 'CS_Memo không mention Kane/Stefan/Shiro/Irene/Blue'}
                                    </span>
                                  : <span className="text-green-600">✓ OK</span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
