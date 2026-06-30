'use client'
import { useEffect, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────
type RepairStatus = 'cho_gui' | 'da_gui' | 'da_sua_xong'
type FinishReason = 'sua_xong' | 'khong_loi_bt' | 'loai_bo' | 'loai_bo_bo_mach' | 'send_supplier'
type Destination  = 'old_device' | 'scrap' | 'supplier'

interface RepairItem {
  id:               string
  imei:             string
  product_name:     string
  notes:            string | null
  status:           RepairStatus
  repair_warehouse: string | null
  finish_reason:    FinishReason | null
  destination:      Destination | null
  received_at:      string
  sent_at:          string | null
  completed_at:     string | null
  receiver_name:    string | null
  sender_name:      string | null
  completer_name:   string | null
  crm_repair_id:    number | null
}

// ── Constants ─────────────────────────────────────────────────
const STATUS_LABEL: Record<RepairStatus, string> = {
  cho_gui:     'Chờ gửi sửa',
  da_gui:      'Đã gửi sửa',
  da_sua_xong: 'Đã sửa xong',
}
const STATUS_COLOR: Record<RepairStatus, string> = {
  cho_gui:     'bg-amber-100 text-amber-800 border-amber-300',
  da_gui:      'bg-blue-100 text-blue-800 border-blue-300',
  da_sua_xong: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}
const FINISH_REASON_LABEL: Record<FinishReason, string> = {
  sua_xong:        'Sửa chữa xong',
  khong_loi_bt:    'Không cần bảo trì (bình thường)',
  loai_bo:         'Không cần bảo trì (cần loại bỏ)',
  loai_bo_bo_mach: 'Không cần bảo trì (NSX thay bo mạch)',
  send_supplier:   'Send to Supplier',
}
const DEST_COLOR: Record<Destination, string> = {
  old_device: 'text-emerald-600',
  scrap:      'text-red-600',
  supplier:   'text-purple-600',
}
const DEST_LABEL: Record<Destination, string> = {
  old_device: 'Old Device',
  scrap:      'Scrap',
  supplier:   'Supplier',
}
const REPAIR_WAREHOUSES = [
  'Repair_Hardware', 'Repair_Streamax', 'Repair_Sunell', 'Repair_Vietmap',
]
const FINISH_REASON_DEST: Record<FinishReason, string> = {
  sua_xong:        '→ Old Device',
  khong_loi_bt:    '→ Old Device',
  loai_bo:         '→ Scrap',
  loai_bo_bo_mach: '→ Scrap',
  send_supplier:   '→ Supplier',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
}
function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return null
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 86400000) * 10) / 10
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function monthAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Sync CRM Panel ────────────────────────────────────────────
function SyncCRMPanel({ onSynced }: { onSynced: () => void }) {
  const [from, setFrom]       = useState(monthAgoStr())
  const [to, setTo]           = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; total: number; upserted: number; errors?: string[] } | null>(null)
  const [err, setErr]         = useState('')

  async function handleSync() {
    setLoading(true); setErr(''); setResult(null)
    try {
      const res = await fetch('/api/repair-tracking/sync-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: `${from} 00:00:00`,
          endTime:   `${to} 23:59:59`,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Lỗi sync'); return }
      setResult(d)
      if (d.ok) onSynced()
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-blue-700 mb-1">Từ ngày</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-blue-700 mb-1">Đến ngày</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <button onClick={handleSync} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm">
          {loading
            ? <><span className="animate-spin">⟳</span> Đang tải...</>
            : <>🔄 Đồng bộ từ CRM</>
          }
        </button>
      </div>

      {err && <p className="text-xs text-red-600 mt-2">⚠ {err}</p>}

      {result && (
        <div className={`mt-2 text-sm rounded-lg px-3 py-2 ${result.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {result.ok
            ? `✅ Đồng bộ xong: ${result.total} records từ CRM → lưu ${result.upserted} vào DB`
            : `⚠ Hoàn thành có lỗi: ${result.upserted}/${result.total} records`
          }
          {result.errors && result.errors.length > 0 && (
            <p className="text-xs mt-1 text-red-600">{result.errors[0]}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal: Gửi sửa ────────────────────────────────────────────
function SendModal({ item, onClose, onSaved }: { item: RepairItem; onClose: () => void; onSaved: () => void }) {
  const [warehouse, setWarehouse] = useState(REPAIR_WAREHOUSES[0])
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch(`/api/repair-tracking/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', repair_warehouse: warehouse }),
    })
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setErr(d.error || 'Lỗi'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Gửi sửa chữa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-700">{item.product_name}</p>
            <p className="text-gray-500 font-mono text-xs mt-0.5">{item.imei}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kho sửa chữa *</label>
            <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              {REPAIR_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Đang gửi...' : 'Xác nhận gửi sửa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Hoàn thành ─────────────────────────────────────────
function CompleteModal({ item, onClose, onSaved }: { item: RepairItem; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason]   = useState<FinishReason>('sua_xong')
  const [notes, setNotes]     = useState(item.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch(`/api/repair-tracking/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete', finish_reason: reason, notes }),
    })
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setErr(d.error || 'Lỗi'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Đã sửa chữa & Nhận về</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-700">{item.product_name}</p>
            <p className="text-gray-500 font-mono text-xs mt-0.5">{item.imei}</p>
            {item.repair_warehouse && <p className="text-xs text-blue-600 mt-0.5">📦 {item.repair_warehouse}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lý do hoàn thành sửa chữa *</label>
            <select value={reason} onChange={e => setReason(e.target.value as FinishReason)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
              {(Object.keys(FINISH_REASON_LABEL) as FinishReason[]).map(r => (
                <option key={r} value={r}>{FINISH_REASON_LABEL[r]}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">{FINISH_REASON_DEST[reason]}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {loading ? 'Đang lưu...' : 'Xác nhận hoàn thành'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────
function StatsBar({ items }: { items: RepairItem[] }) {
  const stats = [
    { label: 'Chờ gửi sửa', value: items.filter(i => i.status === 'cho_gui').length,        color: 'bg-amber-50 border-amber-200 text-amber-800' },
    { label: 'Đang sửa',    value: items.filter(i => i.status === 'da_gui').length,         color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: 'Hoàn thành',  value: items.filter(i => i.status === 'da_sua_xong').length,    color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    { label: 'Old Device',  value: items.filter(i => i.destination === 'old_device').length, color: 'bg-gray-50 border-gray-200 text-gray-700' },
    { label: 'Scrap',       value: items.filter(i => i.destination === 'scrap').length,      color: 'bg-red-50 border-red-200 text-red-700' },
    { label: 'Supplier',    value: items.filter(i => i.destination === 'supplier').length,   color: 'bg-purple-50 border-purple-200 text-purple-700' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {stats.map(s => (
        <div key={s.label} className={`rounded-xl border px-3 py-2 text-center ${s.color}`}>
          <p className="text-xl font-bold">{s.value}</p>
          <p className="text-xs mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Table Row ─────────────────────────────────────────────────
function RepairRow({ item, onAction }: {
  item: RepairItem
  onAction: (item: RepairItem, act: 'send' | 'complete') => void
}) {
  const repairDays = daysBetween(item.sent_at, item.completed_at)
  const waitDays   = daysBetween(item.received_at, item.sent_at)

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
        <p className="text-xs font-mono text-gray-400">{item.imei}</p>
        {item.crm_repair_id && <p className="text-xs text-blue-400">CRM#{item.crm_repair_id}</p>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        <div>{fmtDate(item.received_at)}</div>
        {item.receiver_name && <div className="text-gray-400">{item.receiver_name}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.sent_at ? (
          <>
            <div>{fmtDate(item.sent_at)}</div>
            {item.sender_name && <div className="text-gray-400">{item.sender_name}</div>}
            {item.repair_warehouse && <div className="text-blue-500">{item.repair_warehouse}</div>}
            {waitDays !== null && <div className="text-amber-500">{waitDays}d chờ</div>}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.completed_at ? (
          <>
            <div>{fmtDate(item.completed_at)}</div>
            {item.completer_name && <div className="text-gray-400">{item.completer_name}</div>}
            {repairDays !== null && <div className="text-purple-500">{repairDays}d sửa</div>}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs">
        {item.finish_reason && (
          <>
            <p className="text-gray-700">{FINISH_REASON_LABEL[item.finish_reason]}</p>
            {item.destination && (
              <p className={`font-medium ${DEST_COLOR[item.destination]}`}>{DEST_LABEL[item.destination]}</p>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px]">
        <p className="truncate" title={item.notes ?? ''}>{item.notes || '—'}</p>
      </td>
      <td className="px-4 py-3">
        {item.status === 'cho_gui' && (
          <button onClick={() => onAction(item, 'send')}
            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 whitespace-nowrap">
            Gửi sửa
          </button>
        )}
        {item.status === 'da_gui' && (
          <button onClick={() => onAction(item, 'complete')}
            className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap">
            Nhận về
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function RepairTrackingDashboard() {
  const [items, setItems]           = useState<RepairItem[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilter]   = useState<string>('')
  const [filterProduct, setFilterP] = useState('')
  const [modal, setModal]           = useState<{ type: 'send' | 'complete'; item: RepairItem } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus)  params.set('status', filterStatus)
    if (filterProduct) params.set('product', filterProduct)
    params.set('limit', '500')
    const res = await fetch('/api/repair-tracking?' + params.toString())
    const d = await res.json()
    setItems(d.items ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [filterStatus, filterProduct])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Theo dõi sửa chữa</h1>
          <p className="text-xs text-gray-500 mt-0.5">{total} thiết bị</p>
        </div>
      </div>

      {/* Sync CRM Panel */}
      <SyncCRMPanel onSynced={load} />

      {/* Stats */}
      <StatsBar items={items} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterStatus} onChange={e => setFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
          <option value="">Tất cả trạng thái</option>
          <option value="cho_gui">Chờ gửi sửa</option>
          <option value="da_gui">Đã gửi sửa</option>
          <option value="da_sua_xong">Đã sửa xong</option>
        </select>
        <input value={filterProduct} onChange={e => setFilterP(e.target.value)}
          placeholder="Lọc loại thiết bị..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 w-48" />
        <button onClick={load} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          🔄 Làm mới
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Thiết bị / IMEI</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Nhận về kho</th>
                <th className="px-4 py-3">Gửi sửa</th>
                <th className="px-4 py-3">Hoàn thành</th>
                <th className="px-4 py-3">Kết quả</th>
                <th className="px-4 py-3">Ghi chú</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Đang tải...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Chưa có dữ liệu — Đồng bộ từ CRM để bắt đầu</td></tr>
              ) : (
                items.map(item => (
                  <RepairRow key={item.id} item={item} onAction={(i, a) => setModal({ type: a, item: i })} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modal?.type === 'send' && (
        <SendModal item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'complete' && (
        <CompleteModal item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
    </div>
  )
}
