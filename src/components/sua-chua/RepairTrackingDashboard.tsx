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
const FINISH_REASON_DEST: Record<FinishReason, string> = {
  sua_xong:        '→ Old Device',
  khong_loi_bt:    '→ Old Device',
  loai_bo:         '→ Scrap',
  loai_bo_bo_mach: '→ Scrap',
  send_supplier:   '→ Supplier',
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
  'Repair_Hardware',
  'Repair_Streamax',
  'Repair_Sunell',
  'Repair_Vietmap',
]

const PRODUCT_NAMES = [
  'MDVR Streamax H5', 'VN88-4G', 'VN88-4GH', 'VN88', 'Go 168',
  'MT99 GPS tracker', 'DVR-88(V5-3)', 'MDVR Streamax C43',
  'BW-A5204-G6(4G-DVR)', 'LF USB IR Camera 720P', 'AS USB N-IR Camera 720P',
  'Streamax-Internal-IR-A6610CW', 'Streamax-External-IR-WF-30F',
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
}
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}
function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return null
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  return Math.round(diff * 10) / 10
}

// ── Modal: Thêm mới ───────────────────────────────────────────
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [imei, setImei]           = useState('')
  const [product, setProduct]     = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!imei.trim() || !product.trim()) { setErr('Nhập IMEI và loại thiết bị'); return }
    setLoading(true); setErr('')
    const res = await fetch('/api/repair-tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imei: imei.trim(), product_name: product.trim(), notes: notes.trim() }),
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
          <h2 className="text-base font-semibold text-gray-800">Thêm thiết bị vào kho sửa chữa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">IMEI *</label>
            <input value={imei} onChange={e => setImei(e.target.value)}
              placeholder="Nhập IMEI thiết bị"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Loại thiết bị *</label>
            <select value={product} onChange={e => setProduct(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">-- Chọn thiết bị --</option>
              {PRODUCT_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú lỗi</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Mô tả lỗi thiết bị..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Đang lưu...' : 'Thêm vào kho'}
            </button>
          </div>
        </form>
      </div>
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
            {item.repair_warehouse && (
              <p className="text-xs text-blue-600 mt-0.5">📦 {item.repair_warehouse}</p>
            )}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú lỗi / kết quả</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Mô tả chi tiết..."
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

// ── Row ───────────────────────────────────────────────────────
function RepairRow({ item, onAction }: { item: RepairItem; onAction: (item: RepairItem, act: 'send' | 'complete' | 'delete') => void }) {
  const repairDays = daysBetween(item.sent_at, item.completed_at)
  const waitDays   = daysBetween(item.received_at, item.sent_at)

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
        <p className="text-xs font-mono text-gray-400">{item.imei}</p>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        <div>{fmtDate(item.received_at)}</div>
        <div className="text-gray-400">{item.receiver_name}</div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.sent_at ? (
          <>
            <div>{fmtDate(item.sent_at)}</div>
            <div className="text-gray-400">{item.sender_name}</div>
            <div className="text-blue-500">{item.repair_warehouse}</div>
            {waitDays !== null && <div className="text-amber-500">{waitDays}d chờ</div>}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.completed_at ? (
          <>
            <div>{fmtDate(item.completed_at)}</div>
            <div className="text-gray-400">{item.completer_name}</div>
            {repairDays !== null && <div className="text-purple-500">{repairDays}d sửa</div>}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs">
        {item.finish_reason && (
          <div>
            <p className="text-gray-700">{FINISH_REASON_LABEL[item.finish_reason]}</p>
            {item.destination && (
              <p className={`font-medium ${DEST_COLOR[item.destination]}`}>{DEST_LABEL[item.destination]}</p>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px]">
        <p className="truncate" title={item.notes ?? ''}>{item.notes || '—'}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {item.status === 'cho_gui' && (
            <>
              <button onClick={() => onAction(item, 'send')}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 whitespace-nowrap">
                Gửi sửa
              </button>
              <button onClick={() => onAction(item, 'delete')}
                className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200">
                Xóa
              </button>
            </>
          )}
          {item.status === 'da_gui' && (
            <button onClick={() => onAction(item, 'complete')}
              className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap">
              Nhận về
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Stats bar ─────────────────────────────────────────────────
function StatsBar({ items }: { items: RepairItem[] }) {
  const choGui    = items.filter(i => i.status === 'cho_gui').length
  const daGui     = items.filter(i => i.status === 'da_gui').length
  const done      = items.filter(i => i.status === 'da_sua_xong').length
  const oldDev    = items.filter(i => i.destination === 'old_device').length
  const scrap     = items.filter(i => i.destination === 'scrap').length
  const supplier  = items.filter(i => i.destination === 'supplier').length

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {[
        { label: 'Chờ gửi sửa', value: choGui,   color: 'bg-amber-50 border-amber-200 text-amber-800' },
        { label: 'Đang sửa',    value: daGui,    color: 'bg-blue-50 border-blue-200 text-blue-800' },
        { label: 'Hoàn thành',  value: done,     color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
        { label: 'Old Device',  value: oldDev,   color: 'bg-gray-50 border-gray-200 text-gray-700' },
        { label: 'Scrap',       value: scrap,    color: 'bg-red-50 border-red-200 text-red-700' },
        { label: 'Supplier',    value: supplier, color: 'bg-purple-50 border-purple-200 text-purple-700' },
      ].map(s => (
        <div key={s.label} className={`rounded-xl border px-3 py-2 text-center ${s.color}`}>
          <p className="text-xl font-bold">{s.value}</p>
          <p className="text-xs mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function RepairTrackingDashboard() {
  const [items, setItems]         = useState<RepairItem[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [filterStatus, setFilter] = useState<string>('')
  const [filterProduct, setFilterP] = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [modal, setModal]         = useState<{ type: 'send' | 'complete'; item: RepairItem } | null>(null)
  const [err, setErr]             = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus)  params.set('status', filterStatus)
    if (filterProduct) params.set('product', filterProduct)
    params.set('limit', '300')
    const res = await fetch('/api/repair-tracking?' + params.toString())
    const d = await res.json()
    setItems(d.items ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [filterStatus, filterProduct])

  useEffect(() => { load() }, [load])

  async function handleDelete(item: RepairItem) {
    if (!confirm(`Xóa thiết bị ${item.imei}?`)) return
    const res = await fetch(`/api/repair-tracking/${item.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setErr(d.error || 'Lỗi'); return }
    load()
  }

  function handleAction(item: RepairItem, act: 'send' | 'complete' | 'delete') {
    if (act === 'delete') { handleDelete(item); return }
    setModal({ type: act, item })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Theo dõi sửa chữa</h1>
          <p className="text-xs text-gray-500 mt-0.5">{total} thiết bị</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 shadow-sm">
          <span className="text-base leading-none">+</span> Thêm thiết bị
        </button>
      </div>

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

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex justify-between">
          {err}
          <button onClick={() => setErr('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Chưa có dữ liệu</td></tr>
              ) : (
                items.map(item => (
                  <RepairRow key={item.id} item={item} onAction={handleAction} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAdd && (
        <AddModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />
      )}
      {modal?.type === 'send' && (
        <SendModal item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'complete' && (
        <CompleteModal item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
    </div>
  )
}
