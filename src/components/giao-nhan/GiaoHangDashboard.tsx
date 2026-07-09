"use client"

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Equipment { equipment_id: string; name: string; device_type?: string; category?: string }
interface CartItem  { device_name: string; quantity: number }
interface DonItem   { id: string; device_name: string; quantity: number; sheet_row?: number }
interface DonHang {
  id: string; order_code: string; orderer_email: string; orderer_name: string
  office: string; expected_date?: string; recipient_info?: string; notes?: string
  status: string; created_at: string; giao_hang_don_items: DonItem[]
}
interface SheetOrder {
  id: string; sheet_row: number; stt: string; order_time: string
  office: string; orderer: string; device_type: string; quantity: string
  expected_date: string; recipient_info: string; synced_at: string
}

// ─── Device type config ───────────────────────────────────────────────────────
const TYPE_ALL    = '__all__'
const DEVICE_TYPES = [
  { key: 'GPS Tracker', label: 'GPS Tracker', icon: '📡', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'MDVR',        label: 'MDVR',        icon: '🎥', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'Camera',      label: 'Camera',      icon: '📷', color: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'Sensor',      label: 'Cảm biến',    icon: '🌡️', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { key: 'Accessory',   label: 'Phụ kiện',    icon: '🔌', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: 'Simcard',     label: 'Sim',         icon: '📶', color: 'bg-pink-100 text-pink-700 border-pink-300' },
  { key: 'Storage',     label: 'Bộ nhớ',      icon: '💾', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
]
const TYPE_MAP = Object.fromEntries(DEVICE_TYPES.map(t => [t.key, t]))
function typeStyle(dt?: string) {
  return TYPE_MAP[dt ?? ''] ?? { icon: '📦', color: 'bg-gray-100 text-gray-600 border-gray-200', label: dt ?? 'Khác' }
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  cho_xu_ly: 'Chờ xử lý', dang_xu_ly: 'Đang xử lý',
  da_gui: 'Đã gửi', hoan_thanh: 'Hoàn thành', da_huy: 'Đã hủy',
}
const STATUS_COLOR: Record<string, string> = {
  cho_xu_ly: 'bg-yellow-100 text-yellow-700', dang_xu_ly: 'bg-blue-100 text-blue-700',
  da_gui: 'bg-purple-100 text-purple-700', hoan_thanh: 'bg-green-100 text-green-700',
  da_huy: 'bg-gray-100 text-gray-500',
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE PICKER
// ══════════════════════════════════════════════════════════════════════════════
function DevicePicker({ cart, onChange }: { cart: CartItem[]; onChange: (c: CartItem[]) => void }) {
  const [devices, setDevices]       = useState<Equipment[]>([])
  const [popular, setPopular]       = useState<Record<string, number>>({})
  const [loading, setLoading]       = useState(true)
  const [activeType, setActiveType] = useState<string>(TYPE_ALL)
  const [search, setSearch]         = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/kho/equipment').then(r => r.json()).then(d => setDevices(d.data ?? [])),
      fetch('/api/giao-hang/popular').then(r => r.json()).then(d => setPopular(d.data ?? {})),
    ]).finally(() => setLoading(false))
  }, [])

  const presentTypes    = [...new Set(devices.map(d => d.device_type ?? 'Khác'))]
  const tabs = [
    { key: TYPE_ALL, label: 'Tất cả', icon: '🔍' },
    ...DEVICE_TYPES.filter(t => presentTypes.includes(t.key)),
  ]
  // Show ALL popular names from sheet (no limit), sorted by count desc
  const popularNames = Object.entries(popular).sort((a, b) => b[1] - a[1]).map(([n]) => n)

  function filtered() {
    let list = devices
    if (activeType !== TYPE_ALL) list = list.filter(d => d.device_type === activeType)
    if (search) { const q = search.toLowerCase(); list = list.filter(d => d.name.toLowerCase().includes(q)) }
    return list
  }
  function inCart(name: string) { return cart.find(c => c.device_name === name) }
  function toggle(dev: Equipment) {
    if (inCart(dev.name)) onChange(cart.filter(c => c.device_name !== dev.name))
    else onChange([...cart, { device_name: dev.name, quantity: 1 }])
  }
  function updateQty(name: string, qty: number) {
    if (qty < 1) return
    onChange(cart.map(c => c.device_name === name ? { ...c, quantity: qty } : c))
  }

  const list = filtered()
  const grouped: Record<string, Equipment[]> = {}
  for (const d of list) {
    const t = d.device_type ?? 'Khác'; if (!grouped[t]) grouped[t] = []; grouped[t].push(d)
  }
  const groupKeys = [...DEVICE_TYPES.map(t => t.key).filter(k => grouped[k]?.length), ...(grouped['Khác']?.length ? ['Khác'] : [])]

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
      <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      Đang tải...
    </div>
  )

  return (
    <div>
      {/* Popular */}
      {popularNames.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">⭐ Thường đặt (từ lịch sử sheet)</p>
          <div className="flex flex-wrap gap-2">
            {popularNames.map(name => {
              const dev    = devices.find(d => d.name === name)
              const active = !!inCart(name)
              const ts     = typeStyle(dev?.device_type)
              // Allow adding any name from sheet history — even if not in equipment_cards
              function toggleByName() {
                if (active) onChange(cart.filter(c => c.device_name !== name))
                else onChange([...cart, { device_name: name, quantity: 1 }])
              }
              return (
                <button key={name} onClick={toggleByName}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}
                >
                  <span>{name}</span>
                  {active && <span>✓</span>}
                  <span className="text-[10px] opacity-50">×{popular[name]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-3">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveType(tab.key); setSearch('') }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition flex-shrink-0 ${
              activeType === tab.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <input type="text" placeholder="Tìm tên thiết bị..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />

      {/* Grid */}
      {list.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Không tìm thấy thiết bị</div>
      ) : activeType === TYPE_ALL && !search ? (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {groupKeys.map(typeKey => (
            <div key={typeKey}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <span>{typeStyle(typeKey).icon}</span> {typeStyle(typeKey).label}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {grouped[typeKey].map(dev => {
                  const active = !!inCart(dev.name)
                  const ts = typeStyle(dev.device_type)
                  return (
                    <button key={dev.equipment_id} onClick={() => toggle(dev)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition ${active ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                      <span className="text-base">{ts.icon}</span>
                      <span className="truncate flex-1 text-xs">{dev.name}</span>
                      {active && <span className="text-blue-500 flex-shrink-0">✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
          {list.map(dev => {
            const active = !!inCart(dev.name)
            const ts = typeStyle(dev.device_type)
            return (
              <button key={dev.equipment_id} onClick={() => toggle(dev)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition ${active ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                <span className="text-base">{ts.icon}</span>
                <span className="truncate flex-1 text-xs">{dev.name}</span>
                {active && <span className="text-blue-500 flex-shrink-0">✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Cart */}
      {cart.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Đã chọn ({cart.length} loại)</p>
          <div className="space-y-1.5">
            {cart.map((item, idx) => {
              const dev = devices.find(d => d.name === item.device_name)
              const ts = typeStyle(dev?.device_type)
              return (
                <div key={idx} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5">
                  <span className="text-sm">{ts.icon}</span>
                  <span className="flex-1 text-xs text-gray-800 truncate">{item.device_name}</span>
                  <input type="number" min={1} value={item.quantity}
                    onChange={e => updateQty(item.device_name, parseInt(e.target.value) || 1)}
                    className="w-14 border border-blue-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none" />
                  <button onClick={() => onChange(cart.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DAT HANG FORM
// ══════════════════════════════════════════════════════════════════════════════
function DatHangForm({ userEmail, onSuccess }: { userEmail: string; onSuccess: () => void }) {
  const [cart, setCart]                   = useState<CartItem[]>([])
  const [ordererName, setOrdererName]     = useState('')
  const [office, setOffice]               = useState('')
  const [expectedDate, setExpectedDate]   = useState('')
  const [recipientInfo, setRecipientInfo] = useState('')
  const [notes, setNotes]                 = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [submitMsg, setSubmitMsg]         = useState('')

  async function handleSubmit() {
    if (!ordererName.trim()) { setSubmitMsg('⚠ Vui lòng nhập tên người đặt'); return }
    if (!office.trim())       { setSubmitMsg('⚠ Vui lòng nhập văn phòng'); return }
    if (cart.length === 0)    { setSubmitMsg('⚠ Chưa chọn thiết bị nào'); return }
    setSubmitting(true); setSubmitMsg('')
    try {
      const res = await fetch('/api/giao-hang/dat-hang', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderer_name: ordererName, office, expected_date: expectedDate || undefined, recipient_info: recipientInfo || undefined, notes: notes || undefined, items: cart }),
      })
      const d = await res.json()
      if (!d.ok) { setSubmitMsg('❌ ' + (d.error ?? 'Lỗi không xác định')); return }
      setSubmitMsg(`✅ Đặt hàng thành công — Mã đơn: ${d.order_code}`)
      setCart([]); setExpectedDate(''); setRecipientInfo(''); setNotes('')
      onSuccess()
    } catch (e) { setSubmitMsg('❌ ' + String(e)) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6">
      <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-100">
        <h3 className="font-semibold text-gray-700 mb-4">Chọn thiết bị</h3>
        <DevicePicker cart={cart} onChange={setCart} />
      </div>
      <div className="p-6">
        <h3 className="font-semibold text-gray-700 mb-4">Thông tin đặt hàng</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input value={userEmail} disabled className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tên người đặt <span className="text-red-500">*</span></label>
            <input placeholder="Nhập tên đầy đủ" value={ordererName} onChange={e => setOrdererName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Văn phòng <span className="text-red-500">*</span></label>
            <input placeholder="VD: Hà Nội, HCM, Đà Nẵng..." value={office} onChange={e => setOffice(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">TG dự kiến lắp đặt</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Địa chỉ / SĐT người nhận</label>
            <textarea rows={2} placeholder="Địa chỉ giao hàng, SĐT..." value={recipientInfo} onChange={e => setRecipientInfo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ghi chú</label>
            <textarea rows={2} placeholder="Yêu cầu đặc biệt..." value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        {submitMsg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${submitMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {submitMsg}
          </div>
        )}
        <button onClick={handleSubmit} disabled={submitting || cart.length === 0}
          className="mt-4 w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition"
          style={{ background: submitting || cart.length === 0 ? '#9ca3af' : '#1d6fba' }}>
          {submitting ? '⏳ Đang xử lý...' : cart.length === 0 ? 'Chưa chọn thiết bị' : `🛒 Đặt hàng (${cart.length} loại · ${cart.reduce((s,c)=>s+c.quantity,0)} sp)`}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ORDER LIST (đơn web)
// ══════════════════════════════════════════════════════════════════════════════
function OrderList({ mine, isAdmin }: { mine: boolean; isAdmin: boolean }) {
  const [orders, setOrders]       = useState<DonHang[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [statusFilter, setFilter] = useState('')
  const [updating, setUpdating]   = useState<string | null>(null)
  const LIMIT = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ mine: mine ? '1' : '0', page: String(p), limit: String(LIMIT), ...(statusFilter ? { status: statusFilter } : {}) })
      const res = await fetch(`/api/giao-hang/don-hang?${params}`)
      const d   = await res.json()
      setOrders(d.orders ?? []); setTotal(d.total ?? 0)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [mine, statusFilter])

  useEffect(() => { setPage(1); load(1) }, [mine, statusFilter]) // eslint-disable-line
  useEffect(() => { load(page) }, [page])                         // eslint-disable-line

  async function changeStatus(id: string, status: string) {
    setUpdating(id)
    await fetch('/api/giao-hang/don-hang', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    load(page); setUpdating(null)
  }

  const totalPages = Math.ceil(total / LIMIT)

  if (loading) return <div className="flex items-center justify-center h-40 gap-2 text-gray-400"><span className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" /><span className="text-sm">Đang tải...</span></div>
  if (orders.length === 0) return <div className="flex flex-col items-center justify-center h-40 text-gray-400"><span className="text-4xl mb-2">📦</span><p className="text-sm">Chưa có đơn hàng nào</p></div>

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={statusFilter} onChange={e => setFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-xs text-gray-400">{total} đơn</span>
      </div>
      <div className="space-y-3">
        {orders.map(order => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-blue-700 text-sm">{order.order_code}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{order.orderer_name} · {order.office} · {new Date(order.created_at).toLocaleDateString('vi-VN')}</p>
              </div>
              {isAdmin && (
                <select value={order.status} disabled={updating === order.id} onChange={e => changeStatus(order.id, e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {order.giao_hang_don_items?.map(item => (
                <span key={item.id} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1 text-xs text-gray-700">
                  <span className="font-medium">{item.device_name}</span><span className="text-gray-400">×{item.quantity}</span>
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              {order.expected_date && <span>📅 {order.expected_date}</span>}
              {order.recipient_info && <span>📍 {order.recipient_info}</span>}
              {order.notes && <span>📝 {order.notes}</span>}
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">← Trước</button>
          <span className="text-sm text-gray-500">Trang {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Tiếp →</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LICH SU SHEET — đồng bộ + bảng dữ liệu gốc từ Google Sheet
// ══════════════════════════════════════════════════════════════════════════════
function EditSheetModal({ order, onClose, onSaved }: { order: SheetOrder; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    stt: order.stt, order_time: order.order_time, office: order.office,
    orderer: order.orderer, device_type: order.device_type,
    quantity: order.quantity, expected_date: order.expected_date, recipient_info: order.recipient_info,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function field(k: keyof typeof form, label: string, type = 'text') {
    return (
      <div key={k}>
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <input type={type} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    )
  }

  async function save() {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/giao-hang/orders', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, sheet_row: order.sheet_row, ...form }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); return }
      onSaved(); onClose()
    } catch (e) { setErr(String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-sm">Sửa hàng #{order.sheet_row} — ghi ngược vào Sheet</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          {field('stt', 'STT')}
          {field('order_time', 'Thời gian đặt')}
          {field('office', 'Văn phòng')}
          {field('orderer', 'Người đặt')}
          {field('device_type', 'Loại TB')}
          {field('quantity', 'Số lượng')}
          {field('expected_date', 'TG dự kiến')}
          {field('recipient_info', 'Người nhận')}
        </div>
        {err && <p className="px-5 pb-2 text-xs text-red-600">❌ {err}</p>}
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: '#1d6fba' }}>
            {saving ? '⏳ Đang lưu...' : '💾 Lưu + Ghi Sheet'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LichSuSheet() {
  const [orders, setOrders]       = useState<SheetOrder[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState('')
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [officeFilter, setOffice] = useState('')
  const [editing, setEditing]     = useState<SheetOrder | null>(null)
  const LIMIT = 50

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT), ...(search ? { search } : {}), ...(officeFilter ? { office: officeFilter } : {}) })
      const res = await fetch(`/api/giao-hang/orders?${params}`)
      const d   = await res.json()
      setOrders(d.orders ?? []); setTotal(d.total ?? 0)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [search, officeFilter])

  useEffect(() => { setPage(1); load(1) }, [search, officeFilter]) // eslint-disable-line
  useEffect(() => { load(page) }, [page])                           // eslint-disable-line

  async function sync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/giao-hang/sync', { method: 'POST' })
      const d   = await res.json()
      if (d.error) { setSyncMsg('❌ ' + d.error); return }
      setSyncMsg(`✅ Đồng bộ xong: ${d.upserted ?? 0} hàng từ Google Sheet`)
      load(1)
    } catch (e) { setSyncMsg('❌ ' + String(e)) }
    finally { setSyncing(false) }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const offices    = [...new Set(orders.map(o => o.office).filter(Boolean))]

  return (
    <div className="p-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={sync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition"
          style={{ background: syncing ? '#9ca3af' : '#16a34a' }}>
          {syncing
            ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Đang đồng bộ...</>
            : <>🔄 Đồng bộ từ Google Sheet</>}
        </button>
        <input type="text" placeholder="Tìm kiếm..." value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={officeFilter} onChange={e => setOffice(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="">Tất cả VP</option>
          {offices.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="text-xs text-gray-400">{total} đơn</span>
      </div>

      {syncMsg && (
        <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${syncMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {syncMsg}
        </div>
      )}

      {/* Note */}
      <div className="mb-3 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
        <span className="text-base">📋</span>
        <p>Dữ liệu lịch sử đặt hàng đọc từ <strong>Google Sheet "Order hàng VP- Kho"</strong>. Bấm <em>Đồng bộ</em> để tải dữ liệu mới nhất. Bấm ✏️ để sửa và ghi ngược vào sheet.</p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32 gap-2 text-gray-400">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
          <span className="text-4xl mb-2">📭</span>
          <p className="text-sm">Chưa có dữ liệu. Bấm &quot;Đồng bộ từ Google Sheet&quot; để tải.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#Row', 'STT', 'Thời gian', 'VP', 'Người đặt', 'Loại TB', 'SL', 'TG dự kiến', 'Người nhận', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 transition">
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{o.sheet_row}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{o.stt || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{o.order_time || '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-medium text-gray-800">{o.office || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700">{o.orderer || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700">{o.device_type || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-center font-medium text-gray-800">{o.quantity || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{o.expected_date || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">{o.recipient_info || '—'}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setEditing(o)}
                      className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition">✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">← Trước</button>
          <span className="text-sm text-gray-500">Trang {page} / {totalPages} · {total} đơn</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Tiếp →</button>
        </div>
      )}

      {editing && <EditSheetModal order={editing} onClose={() => setEditing(null)} onSaved={() => load(page)} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export default function GiaoHangDashboard({
  userEmail = '',
  isAdmin   = false,
}: {
  userEmail?: string
  isAdmin?: boolean
}) {
  const [tab, setTab]         = useState<'dat-hang' | 'don-toi' | 'tat-ca' | 'sheet'>('dat-hang')
  const [refresh, setRefresh] = useState(0)

  const TABS = [
    { key: 'dat-hang' as const, label: '🛒 Đặt hàng' },
    { key: 'don-toi'  as const, label: '📋 Đơn của tôi' },
    ...(isAdmin ? [{ key: 'tat-ca' as const, label: '📊 Tất cả đơn' }] : []),
    { key: 'sheet'    as const, label: '📋 Lịch sử Sheet' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🚚 Đặt hàng thiết bị</h1>
        <p className="text-xs text-gray-400 mt-0.5">Đặt hàng qua web · Lịch sử đồng bộ Google Sheet</p>
      </div>

      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dat-hang' && (
        <DatHangForm userEmail={userEmail}
          onSuccess={() => { setRefresh(r => r+1); setTimeout(() => setTab('don-toi'), 1800) }} />
      )}
      {tab === 'don-toi' && <OrderList key={`mine-${refresh}`} mine={true} isAdmin={isAdmin} />}
      {tab === 'ta