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

interface DupDevice { imei: string; product_name: string; count: number; last_received: string }
interface DupProductGroup { product_name: string; deviceCount: number; totalRepairs: number; devices: DupDevice[] }
interface StatsData {
  total: number; completed: number; inRepair: number; waiting: number
  oldDevice: number; scrap: number; supplier: number
  uniqueDevices: number; repeatedDeviceCount: number
  completionRate: number; successRate: number; scrapRate: number; supplierRate: number
  duplicatesByProduct: DupProductGroup[]
  byProduct: { product_name: string; total: number; completed: number; oldDevice: number; scrap: number; supplier: number; inRepair: number; waiting: number; successRate: number; scrapRate: number; supplierRate: number }[]
  byWarehouse: { warehouse: string; total: number; completed: number; scrap: number; supplier: number }[]
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
  const [result, setResult]   = useState<{ ok: boolean; total: number; upserted: number; inserted?: number; updated?: number; errors?: string[] } | null>(null)
  const [err, setErr]         = useState('')

  async function doSync(payload: object) {
    setLoading(true); setErr(''); setResult(null)
    try {
      const res = await fetch('/api/repair-tracking/sync-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      if (!text) { setErr(`Server trả về response rỗng (HTTP ${res.status})`); return }
      let d: Record<string, unknown>
      try { d = JSON.parse(text) } catch { setErr(`Lỗi parse response: ${text.substring(0, 120)}`); return }
      if (!res.ok) { setErr((d.error as string) || 'Lỗi sync'); return }
      setResult(d as { ok: boolean; total: number; upserted: number; inserted?: number; updated?: number; errors?: string[] })
      if (d.ok) onSynced()
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
      {/* Nút incremental — sync mặc định */}
      <div className="flex items-center gap-3">
        <button onClick={() => doSync({})} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm">
          {loading ? <><span className="animate-spin">⟳</span> Đang tải...</> : <>⚡ Sync dữ liệu mới</>}
        </button>
        <p className="text-xs text-blue-600">Tự động lấy từ record mới nhất trong DB</p>
      </div>

      {/* Sync theo khoảng thời gian */}
      <details className="group">
        <summary className="text-xs text-blue-500 cursor-pointer hover:underline list-none">
          ▸ Sync theo khoảng thời gian cụ thể
        </summary>
        <div className="flex flex-wrap items-end gap-3 mt-2">
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
          <button onClick={() => doSync({ startTime: `${from} 00:00:00`, endTime: `${to} 23:59:59` })} disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-gray-600 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-50">
            🔄 Đồng bộ theo ngày
          </button>
        </div>
      </details>

      {err && <p className="text-xs text-red-600 mt-2">⚠ {err}</p>}

      {result && (
        <div className={`mt-2 text-sm rounded-lg px-3 py-2 ${result.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {result.ok
            ? `✅ Đồng bộ xong: ${result.total} records từ CRM → thêm mới ${result.inserted ?? 0}, cập nhật ${result.updated ?? 0}`
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
interface StatusCounts {
  cho_gui: number; da_gui: number; da_sua_xong: number
  old_device: number; scrap: number; supplier: number
}
function StatsBar({ counts }: { counts: StatusCounts }) {
  const stats = [
    { label: 'Chờ gửi sửa', value: counts.cho_gui,     color: 'bg-amber-50 border-amber-200 text-amber-800' },
    { label: 'Đang sửa',    value: counts.da_gui,      color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: 'Hoàn thành',  value: counts.da_sua_xong, color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    { label: 'Old Device',  value: counts.old_device,  color: 'bg-gray-50 border-gray-200 text-gray-700' },
    { label: 'Scrap',       value: counts.scrap,       color: 'bg-red-50 border-red-200 text-red-700' },
    { label: 'Supplier',    value: counts.supplier,    color: 'bg-purple-50 border-purple-200 text-purple-700' },
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

// ── Rate bar ─────────────────────────────────────────────────
function RateBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className="text-xs font-medium w-9 text-right">{rate}%</span>
    </div>
  )
}

// ── Stats Tab ─────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats]   = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    const res = await fetch('/api/repair-tracking/stats?' + params.toString())
    const d = await res.json()
    setStats(d)
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Đang tải thống kê...</div>
  if (!stats)  return <div className="py-12 text-center text-sm text-red-400">Lỗi tải dữ liệu</div>

  return (
    <div className="space-y-6">
      {/* Bộ lọc thời gian */}
      <div className="flex flex-wrap gap-3 items-end bg-gray-50 border border-gray-200 rounded-xl p-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Từ ngày nhận</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Đến ngày</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <button onClick={load} className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 bg-white">
          🔄 Cập nhật
        </button>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo('') }} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600">
            Xoá lọc
          </button>
        )}
      </div>

      {/* Tổng quan rates */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Tổng lượt sửa', value: stats.total, sub: `${stats.uniqueDevices} thiết bị riêng`, color: 'text-gray-800', bg: 'bg-gray-50 border-gray-200' },
          { label: 'Hoàn thành',    value: `${stats.completionRate}%`, sub: `${stats.completed}/${stats.total}`, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'TB lặp lại',    value: stats.repeatedDeviceCount, sub: 'thiết bị sửa ≥ 2 lần', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
          { label: 'Gửi Supplier',  value: `${stats.supplierRate}%`, sub: `${stats.supplier} thiết bị`, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tỉ lệ kết quả (trong số đã hoàn thành) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Tỉ lệ kết quả (trong {stats.completed} thiết bị đã hoàn thành)</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>✅ Sửa chữa thành công (Old Device)</span>
              <span className="font-medium text-emerald-600">{stats.oldDevice} thiết bị</span>
            </div>
            <RateBar rate={stats.successRate} color="bg-emerald-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>🗑 Báo phế (Scrap)</span>
              <span className="font-medium text-red-600">{stats.scrap} thiết bị</span>
            </div>
            <RateBar rate={stats.scrapRate} color="bg-red-400" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>🏭 Gửi bảo hành (Supplier)</span>
              <span className="font-medium text-purple-600">{stats.supplier} thiết bị</span>
            </div>
            <RateBar rate={stats.supplierRate} color="bg-purple-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Thiết bị sửa nhiều lần — gom theo loại */}
        <div className="bg-white border border-orange-200 rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Thiết bị sửa nhiều lần</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.repeatedDeviceCount} thiết bị · {stats.duplicatesByProduct.length} loại
            </p>
          </div>
          {stats.duplicatesByProduct.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Không có thiết bị nào sửa nhiều lần</p>
          ) : (
            <div className="space-y-1">
              {stats.duplicatesByProduct.map(g => (
                <div key={g.product_name} className="border border-gray-100 rounded-xl overflow-hidden">
                  {/* Header loại thiết bị */}
                  <button
                    onClick={() => setExpandedProduct(expandedProduct === g.product_name ? null : g.product_name)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-orange-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-800">{g.product_name}</span>
                      <span className="text-xs text-gray-400">{g.deviceCount} thiết bị</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                        {g.totalRepairs} lượt
                      </span>
                      <span className="text-gray-400 text-xs">{expandedProduct === g.product_name ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {/* Danh sách thiết bị trong loại */}
                  {expandedProduct === g.product_name && (
                    <div className="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100">
                      {g.devices.map(d => (
                        <div key={d.imei} className="flex items-center justify-between px-5 py-2">
                          <div>
                            <p className="text-xs font-mono text-gray-600">{d.imei}</p>
                            <p className="text-xs text-gray-400">Lần cuối: {fmtDate(d.last_received)}</p>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                            {d.count}x
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theo kho sửa */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Theo kho sửa chữa</h3>
          {stats.byWarehouse.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {stats.byWarehouse.map(w => (
                <div key={w.warehouse}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{w.warehouse}</span>
                    <span className="text-gray-400">{w.total} thiết bị</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="bg-emerald-500 h-2 rounded-l" style={{ width: `${w.total > 0 ? w.completed/w.total*100 : 0}%` }} title={`Hoàn thành: ${w.completed}`} />
                    <div className="bg-red-400 h-2" style={{ width: `${w.total > 0 ? w.scrap/w.total*100 : 0}%` }} title={`Scrap: ${w.scrap}`} />
                    <div className="bg-purple-400 h-2 rounded-r" style={{ width: `${w.total > 0 ? w.supplier/w.total*100 : 0}%` }} title={`Supplier: ${w.supplier}`} />
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                    <span className="text-emerald-600">{w.completed} hoàn thành</span>
                    <span className="text-red-500">{w.scrap} scrap</span>
                    <span className="text-purple-500">{w.supplier} supplier</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Theo loại thiết bị */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Thống kê theo loại thiết bị</h3>
          <p className="text-xs text-gray-400 mt-0.5">{stats.byProduct.length} loại</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Loại thiết bị</th>
                <th className="px-4 py-2 text-right">Tổng</th>
                <th className="px-4 py-2 text-right">Đang sửa</th>
                <th className="px-4 py-2 text-right">Old Device</th>
                <th className="px-4 py-2 text-right">Scrap</th>
                <th className="px-4 py-2 text-right">Supplier</th>
                <th className="px-4 py-2 text-left w-40">Tỉ lệ thành công</th>
              </tr>
            </thead>
            <tbody>
              {stats.byProduct.map(p => (
                <tr key={p.product_name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">{p.product_name}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{p.total}</td>
                  <td className="px-4 py-2 text-right text-blue-600">{p.inRepair}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{p.oldDevice}</td>
                  <td className="px-4 py-2 text-right text-red-500">{p.scrap}</td>
                  <td className="px-4 py-2 text-right text-purple-600">{p.supplier}</td>
                  <td className="px-4 py-2">
                    <RateBar rate={p.successRate} color="bg-emerald-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function RepairTrackingDashboard() {
  const [activeTab, setActiveTab]   = useState<'list' | 'stats'>('list')
  const [items, setItems]           = useState<RepairItem[]>([])
  const [total, setTotal]           = useState(0)
  const [counts, setCounts]         = useState<StatusCounts>({ cho_gui: 0, da_gui: 0, da_sua_xong: 0, old_device: 0, scrap: 0, supplier: 0 })
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilter]   = useState<string>('')
  const [filterProduct, setFilterP] = useState('')
  const [modal, setModal]           = useState<{ type: 'send' | 'complete'; item: RepairItem } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus)  params.set('status', filterStatus)
    if (filterProduct) params.set('product', filterProduct)
    params.set('limit', '200')
    const res = await fetch('/api/repair-tracking?' + params.toString())
    const d = await res.json()
    setItems(d.items ?? [])
    setTotal(d.total ?? 0)
    if (d.statusCounts) setCounts(d.statusCounts)
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

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['list', '📋 Danh sách'], ['stats', '📊 Thống kê']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors font-medium ${
              activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'list' ? (
        <>
          {/* Sync CRM Panel */}
          <SyncCRMPanel onSynced={load} />

          {/* Stats */}
          <StatsBar counts={counts} />

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
        </>
      ) : (
        <StatsTab />
      )}

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
