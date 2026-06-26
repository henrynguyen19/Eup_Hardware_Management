'use client'
import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ticket {
  cs_id:       number
  cs_date:     string
  update_time: string
  cust_name:   string
  cust_id:     number
  direction:   string
  ticket_type: string
  contact:     string
  zone:        string
  handler:     string | null
  memo:        string
  reject_reason?: string
}

interface StaffCache {
  staffName:     string
  totalRaw:      number
  acceptedCount: number
  rejectedCount: number
  crmAccount:   string    // account thực sự được dùng để login CRM
  identity:     string    // IDENTITY từ login response
  accepted: Map<number, Ticket>
  rejected: Map<number, Ticket>
  loadedAt: string
}

type StaffName = 'Kane' | 'Stefan' | 'Shiro' | 'Irene' | 'Blue'
const STAFF_LIST: StaffName[] = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']

const STAFF_COLORS: Record<StaffName, string> = {
  Kane:   'bg-blue-100 text-blue-700 border-blue-300',
  Stefan: 'bg-purple-100 text-purple-700 border-purple-300',
  Shiro:  'bg-green-100 text-green-700 border-green-300',
  Irene:  'bg-pink-100 text-pink-700 border-pink-300',
  Blue:   'bg-cyan-100 text-cyan-700 border-cyan-300',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CRMDebugPage() {
  const [selected, setSelected]     = useState<StaffName>('Kane')
  const [loading, setLoading]       = useState(false)
  const [loadError, setLoadError]   = useState<string | null>(null)
  // Cache: staffName -> StaffCache
  const [cache, setCache]           = useState<Map<StaffName, StaffCache>>(new Map())
  // Mở rộng memo
  const [expandMemo, setExpandMemo] = useState<Set<number>>(new Set())
  // Tab trong bảng kết quả
  const [activeTab, setActiveTab]   = useState<'accepted' | 'rejected'>('accepted')

  const current = cache.get(selected)

  // ── Load data cho staff đang chọn ──────────────────────────────────────────
  async function loadStaff() {
    setLoading(true)
    setLoadError(null)
    try {
      const res  = await fetch(`/api/crm/debug?staff=${selected}`)
      // Đọc text trước để tránh SyntaxError khi body rỗng
      const text = await res.text()
      if (!text || text.trim() === '') throw new Error('Server trả về response rỗng. Kiểm tra Vercel logs.')
      let json: Record<string, unknown>
      try { json = JSON.parse(text) }
      catch { throw new Error(`Response không hợp lệ: ${text.substring(0, 200)}`) }
      if (!json.ok) {
        const detail = [
          json.error as string ?? 'Lỗi không xác định',
          json.rawText   ? `\nCRM raw: ${json.rawText}` : '',
          json.soapRequest ? `\nSOAP params gửi đi: ${JSON.stringify(json.soapRequest, null, 2)}` : '',
        ].join('')
        throw new Error(detail)
      }

      // Build maps (dedup by CS_ID — lấy bản mới nhất nếu load lại)
      const prev        = cache.get(selected)
      const acceptedMap = prev ? new Map(prev.accepted) : new Map<number, Ticket>()
      const rejectedMap = prev ? new Map(prev.rejected) : new Map<number, Ticket>()

      for (const t of (json.accepted as Ticket[])) {
        const ex = acceptedMap.get(t.cs_id)
        if (!ex || t.update_time > ex.update_time) acceptedMap.set(t.cs_id, t)
        rejectedMap.delete(t.cs_id) // nếu trước bị reject nhưng nay OK
      }
      for (const t of (json.rejected as Ticket[])) {
        if (!acceptedMap.has(t.cs_id)) {
          const ex = rejectedMap.get(t.cs_id)
          if (!ex || t.update_time > ex.update_time) rejectedMap.set(t.cs_id, t)
        }
      }

      const newCache: StaffCache = {
        staffName:     json.staffName as string,
        totalRaw:      json.totalRaw as number,
        acceptedCount: acceptedMap.size,
        rejectedCount: rejectedMap.size,
        crmAccount:    json.crmAccount as string ?? '—',
        identity:      json.identity as string ?? '—',
        accepted:      acceptedMap,
        rejected:      rejectedMap,
        loadedAt:      new Date().toLocaleTimeString('vi-VN'),
      }

      setCache(prev => new Map(prev).set(selected, newCache))
    } catch (e) { setLoadError(String(e)) }
    finally { setLoading(false) }
  }

  function toggleMemo(id: number) {
    setExpandMemo(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const acceptedRows = current ? Array.from(current.accepted.values()) : []
  const rejectedRows = current ? Array.from(current.rejected.values()) : []

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Sidebar chọn staff ───────────────────────────────────────────── */}
      <aside className="w-48 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <a href="/ho-tro" className="text-xs text-gray-400 hover:text-blue-600 block mb-1">← Hỗ trợ</a>
          <div className="font-bold text-gray-800 text-sm">CRM Debug</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Load thủ công từng người</div>
        </div>

        <nav className="flex-1 py-3 space-y-1 px-2">
          {STAFF_LIST.map(name => {
            const c       = cache.get(name)
            const isActive = name === selected
            return (
              <button
                key={name}
                onClick={() => { setSelected(name); setLoadError(null) }}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition text-sm ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="font-semibold">{name}</div>
                {c ? (
                  <div className={`text-[10px] mt-0.5 ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {c.totalRaw} ticket • {c.loadedAt}
                  </div>
                ) : (
                  <div className={`text-[10px] mt-0.5 ${isActive ? 'text-indigo-300' : 'text-gray-300'}`}>
                    Chưa load
                  </div>
                )}
              </button>
            )
          })}
        </nav>

        {/* Tổng hợp tất cả */}
        {cache.size > 0 && (
          <div className="px-3 py-3 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
            <div className="font-semibold text-gray-500 text-xs mb-1">Đã load ({cache.size}/5)</div>
            {STAFF_LIST.filter(n => cache.has(n)).map(n => {
              const c = cache.get(n)!
              return (
                <div key={n} className="flex justify-between">
                  <span>{n}</span>
                  <span>
                    <span className="text-green-600">{c.acceptedCount}</span>
                    {' / '}
                    <span className="text-red-500">{c.rejectedCount}</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 px-6 py-5">

        {/* Header + nút Load */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              <span className={`inline-block px-2 py-0.5 rounded-md border text-sm mr-2 ${STAFF_COLORS[selected]}`}>
                {selected}
              </span>
              Dữ liệu từ CRM
            </h1>
            {current && (
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-gray-400">
                  Tổng: <strong>{current.totalRaw}</strong> •
                  ✅ <strong className="text-green-600">{current.acceptedCount}</strong> •
                  ❌ <strong className="text-red-500">{current.rejectedCount}</strong> •
                  Load lúc {current.loadedAt}
                </p>
                {/* Hiển thị để verify đúng account được dùng */}
                <p className="text-[11px] font-mono text-indigo-500">
                  🔑 Account: <strong>{current.crmAccount}</strong>
                  {' · '}IDENTITY: <strong>{current.identity}</strong>
                </p>
              </div>
            )}
          </div>
          <button
            onClick={loadStaff}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition disabled:opacity-40 shadow-sm"
          >
            {loading
              ? <><span className="animate-spin">⏳</span> Đang tải CRM...</>
              : <>🔄 Load tất cả dữ liệu — {selected}</>
            }
          </button>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
            <strong>Lỗi:</strong> {loadError}
            {(loadError.includes('timeout') || loadError.includes('Timeout')) && (
              <div className="text-xs mt-1 text-red-500">
                💡 Thử <a href="/admin/crm-debug" className="underline">Force Re-login</a> trước rồi load lại.
              </div>
            )}
          </div>
        )}

        {!current && !loading && !loadError && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-base font-medium">Nhấn &ldquo;Load tất cả dữ liệu&rdquo; để bắt đầu</div>
            <div className="text-sm mt-1">Dữ liệu sẽ được giữ khi bạn chuyển sang nhân viên khác</div>
          </div>
        )}

        {current && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setActiveTab('accepted')}
                className={`px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition ${
                  activeTab === 'accepted'
                    ? 'border-green-500 text-green-700 bg-green-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                ✅ Dữ liệu gốc
                <span className="ml-1.5 bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full">
                  {current.acceptedCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('rejected')}
                className={`px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition ${
                  activeTab === 'rejected'
                    ? 'border-red-500 text-red-700 bg-red-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                ❌ Bị loại bỏ
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  current.rejectedCount > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {current.rejectedCount}
                </span>
              </button>
            </div>

            {/* ── Bảng Dữ liệu gốc ── */}
            {activeTab === 'accepted' && (
              <TicketTable
                rows={acceptedRows}
                expandMemo={expandMemo}
                toggleMemo={toggleMemo}
                mode="accepted"
                staffName={selected}
              />
            )}

            {/* ── Bảng Bị loại bỏ ── */}
            {activeTab === 'rejected' && (
              rejectedRows.length === 0
                ? <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-6 text-center text-sm">
                    🎉 Không có ticket nào bị loại! Tất cả CS_Memo của {selected} đều có tên nhân viên.
                  </div>
                : <TicketTable
                    rows={rejectedRows}
                    expandMemo={expandMemo}
                    toggleMemo={toggleMemo}
                    mode="rejected"
                    staffName={selected}
                  />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ── Sub-component: bảng ticket ────────────────────────────────────────────────
function TicketTable({
  rows, expandMemo, toggleMemo, mode, staffName,
}: {
  rows:       Ticket[]
  expandMemo: Set<number>
  toggleMemo: (id: number) => void
  mode:       'accepted' | 'rejected'
  staffName:  string
}) {
  const [search, setSearch] = useState('')

  const filtered = search
    ? rows.filter(r =>
        String(r.cs_id).includes(search) ||
        (r.cust_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.memo ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.handler ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : rows

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Search bar */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <input
          type="text"
          placeholder="Tìm kiếm CS_ID, tên KH, CS_Memo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {search && (
          <span className="text-xs text-gray-400">{filtered.length}/{rows.length}</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left w-20">CS_ID</th>
              <th className="px-3 py-2.5 text-left w-24">Ngày</th>
              <th className="px-3 py-2.5 text-left w-36">Khách hàng</th>
              <th className="px-3 py-2.5 text-left w-14">IO</th>
              <th className="px-3 py-2.5 text-left w-24">Loại</th>
              <th className="px-3 py-2.5 text-left w-24">Handler</th>
              <th className="px-3 py-2.5 text-left">
                CS_Memo
                <span className="ml-1 font-normal text-gray-400 normal-case">(click để mở)</span>
              </th>
              {mode === 'rejected' && (
                <th className="px-3 py-2.5 text-left w-44 text-red-500">Lý do loại</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(t => {
              const expanded = expandMemo.has(t.cs_id)
              const handlerBadge = t.handler
                ? t.handler === staffName
                  ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-medium">{t.handler}</span>
                  : <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-medium">{t.handler} ⚠️</span>
                : <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-500 text-[11px]">—</span>

              return (
                <tr
                  key={t.cs_id}
                  className={mode === 'rejected' ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}
                >
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{t.cs_id}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{t.cs_date}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium text-gray-800 truncate max-w-[130px]" title={t.cust_name}>
                      {t.cust_name || '—'}
                    </div>
                    <div className="text-gray-400">ID {t.cust_id || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{t.direction || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[90px]" title={t.ticket_type}>
                    {t.ticket_type || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{handlerBadge}</td>
                  <td
                    className="px-3 py-2 text-xs font-mono text-gray-700 cursor-pointer max-w-[340px]"
                    onClick={() => toggleMemo(t.cs_id)}
                  >
                    {t.memo
                      ? <span className={`break-all whitespace-pre-wrap leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                          {t.memo}
                          {!expanded && t.memo.length > 120 && (
                            <span className="text-indigo-400 not-italic"> [xem thêm]</span>
                          )}
                        </span>
                      : <span className="text-gray-300 italic">( trống )</span>
                    }
                  </td>
                  {mode === 'rejected' && (
                    <td className="px-3 py-2 text-xs text-red-600">
                      {t.reject_reason}
                    </td>
                  )}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={mode === 'rejected' ? 8 : 7} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Không tìm thấy kết quả
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
        Hiển thị {filtered.length} / {rows.length} ticket
      </div>
    </div>
  )
}
