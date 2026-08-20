"use client"

import { useEffect, useState, useCallback, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Equipment   { equipment_id: string; name: string; device_type?: string; category?: string }
interface ComboItem   { device_name: string; quantity: number; notes?: string; sort_order?: number }
interface Combo       { id: string; name: string; description?: string; device_combo_items: ComboItem[] }
interface Recipient   { id: string; name: string; type: string; office?: string; address?: string; phone?: string; contact_name?: string; notes?: string }
interface CartItem    { device_name: string; quantity: number; customer_codes: string[]; expected_receipt: string }
interface DonItem     { id: string; device_name: string; quantity: number; customer_codes?: string[]; expected_receipt?: string; sheet_row?: number; device_serials?: string[]; combo_name?: string }
interface SerialCRMResult {
  serial: string; ok: boolean; transferred: boolean
  crmStatus: string   // 'HAVE' | 'TRANS' | ''
  productName: string; sourceStock: string; destStock: string
  updateTime: string; updateMan: string; error?: string
}
interface DonHang {
  id: string; order_code: string; orderer_email: string; orderer_name: string
  office: string; expected_date?: string; expected_ship_date?: string; recipient_info?: string; notes?: string
  status: string; created_at: string; giao_hang_don_items: DonItem[]
  status_updated_by?: string; status_updated_at?: string; tracking_code?: string
}
interface SheetOrder {
  id: string; sheet_row: number; stt: string; order_time: string
  office: string; orderer: string; device_type: string; quantity: string
  expected_date: string; recipient_info: string; synced_at: string
}

// ─── Device type config ─────────────────────────────────────────────────────
const TYPE_ALL = '__all__'
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

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  cho_xu_ly:  { label: 'Chờ xử lý', dot: 'bg-orange-400',  badge: 'bg-orange-50  text-orange-700  border border-orange-300'  },
  dang_xu_ly: { label: 'Đang xử lý', dot: 'bg-blue-500',   badge: 'bg-blue-50    text-blue-700    border border-blue-300'    },
  da_gui:     { label: 'Đã gửi',     dot: 'bg-violet-500', badge: 'bg-violet-50  text-violet-700  border border-violet-300'  },
  da_nhan:    { label: 'Đã nhận',    dot: 'bg-green-500',  badge: 'bg-green-50   text-green-700   border border-green-300'   },
  da_huy:     { label: 'Hủy',        dot: 'bg-red-400',    badge: 'bg-red-50     text-red-600     border border-red-300'     },
}
// keep legacy aliases
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])
)
const VALID_STATUSES_UI = ['cho_xu_ly', 'dang_xu_ly', 'da_gui', 'da_nhan', 'da_huy']
// Left-border màu theo trạng thái cho card đơn hàng
const STATUS_BORDER_STYLE: Record<string, string> = {
  cho_xu_ly:  'border-l-4 border-l-orange-400',
  dang_xu_ly: 'border-l-4 border-l-blue-500',
  da_gui:     'border-l-4 border-l-violet-500',
  da_nhan:    'border-l-4 border-l-green-500',
  da_huy:     'border-l-4 border-l-red-400',
}

// ─── Phân quyền kho ─────────────────────────────────────────────────────────
const KHO_EMAILS = ['admin', 'julie', 'kai', 'thor', 'nick', 'bob'].map(n => `${n}@eup.net.vn`)
function isKhoUser(email: string) {
  return KHO_EMAILS.includes(email.toLowerCase())
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">{status}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── CustomerCodeInput — add/remove codes per cart item ────────────────────
function CustomerCodeInput({ codes, onChange }: { codes: string[]; onChange: (c: string[]) => void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (v && !codes.includes(v)) { onChange([...codes, v]); setDraft('') }
  }
  return (
    <div className="mt-1">
      <div className="flex gap-1 mb-1 flex-wrap">
        {codes.map(c => (
          <span key={c} className="inline-flex items-center gap-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 text-xs">
            {c}
            <button onClick={() => onChange(codes.filter(x => x !== c))} className="ml-0.5 text-indigo-400 hover:text-red-500">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Thêm mã KH (Enter)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <button onClick={add} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs hover:bg-indigo-100 border border-indigo-200">+</button>
      </div>
    </div>
  )
}


// ─── SimWarning — cảnh báo khi GPS Tracker / MDVR chưa có SIM ────────────
const SIM_REQUIRED_TYPES = ['GPS Tracker', 'MDVR']

function SimWarning({ cart, devices }: { cart: CartItem[]; devices: { name: string; device_type?: string }[] }) {
  const deviceTypeMap = Object.fromEntries(devices.map(d => [d.name, d.device_type ?? '']))
  const needsSim = cart.some(c => SIM_REQUIRED_TYPES.includes(deviceTypeMap[c.device_name] ?? ''))
  const hasSim   = cart.some(c => (deviceTypeMap[c.device_name] ?? '').toLowerCase() === 'simcard'
    || c.device_name.toLowerCase().includes('sim'))
  if (!needsSim || hasSim) return null
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-sm text-amber-800">
      <span className="text-lg leading-none mt-0.5">⚠️</span>
      <div>
        <div className="font-semibold">Thiếu SIM!</div>
        <div className="text-xs mt-0.5">GPS Tracker và MDVR bắt buộc đi kèm SIM card. Vui lòng thêm Simcard vào đơn.</div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE PICKER (manual) — inline qty on selected
// ══════════════════════════════════════════════════════════════════════════════
function DevicePicker({ cart, onChange, devices, popular, loading }: {
  cart: CartItem[]; onChange: (c: CartItem[]) => void
  devices: Equipment[]; popular: Record<string, number>; loading: boolean
}) {
  const [activeType, setActiveType] = useState<string>(TYPE_ALL)
  const [search, setSearch]         = useState('')

  const presentTypes = [...new Set(devices.map(d => d.device_type ?? 'Khác'))]
  const tabs = [
    { key: TYPE_ALL, label: 'Tất cả', icon: '🔍' },
    ...DEVICE_TYPES.filter(t => presentTypes.includes(t.key)),
  ]
  const popularNames = Object.entries(popular).sort((a, b) => b[1] - a[1]).map(([n]) => n)

  function filtered() {
    let list = devices
    if (activeType !== TYPE_ALL) list = list.filter(d => d.device_type === activeType)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q))
    }
    return list
  }

  function toggle(name: string) {
    const active = cart.some(c => c.device_name === name)
    if (active) onChange(cart.filter(c => c.device_name !== name))
    else onChange([...cart, { device_name: name, quantity: 1, customer_codes: [], expected_receipt: '' }])
  }

  function adjustQty(e: React.MouseEvent, name: string, delta: number) {
    e.stopPropagation()
    onChange(cart.map(c => c.device_name === name ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c))
  }

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Đang tải thiết bị…</div>

  return (
    <div className="space-y-2">
      {/* Search — always at top */}
      <input
        className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        placeholder="🔍 Tìm thiết bị…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus={false}
      />

      {/* Type filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)}
            className={`px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${
              activeType === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Popular chips */}
      {popularNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {popularNames.map(name => {
            const active = cart.some(c => c.device_name === name)
            return (
              <button key={name} onClick={() => toggle(name)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                }`}>
                ⭐ {name}{active && ' ✓'}
              </button>
            )
          })}
        </div>
      )}

      {/* Device list — simple flat chips for fast render */}
      <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1">
        {filtered().map(dev => {
          const active = cart.some(c => c.device_name === dev.name)
          const cartItem = cart.find(c => c.device_name === dev.name)
          const ts = typeStyle(dev.device_type)
          return (
            <div key={dev.equipment_id}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                active ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-150 hover:border-indigo-200 hover:bg-gray-50'
              }`}
              onClick={() => toggle(dev.name)}>
              <span className="text-xs text-gray-800 flex-1 min-w-0 truncate">{ts.icon} {dev.name}</span>
              {active ? (
                <div className="flex items-center gap-0.5 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                  <button onClick={e => adjustQty(e, dev.name, -1)}
                    className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 font-bold text-xs hover:bg-indigo-200 flex items-center justify-center">−</button>
                  <span className="w-5 text-center text-xs font-semibold text-indigo-700">{cartItem?.quantity}</span>
                  <button onClick={e => adjustQty(e, dev.name, 1)}
                    className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 font-bold text-xs hover:bg-indigo-200 flex items-center justify-center">+</button>
                </div>
              ) : (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-2 shrink-0 ${ts.color}`}>{ts.label}</span>
              )}
            </div>
          )
        })}
        {filtered().length === 0 && (
          <div className="text-center py-6 text-gray-400 text-sm">Không có thiết bị phù hợp</div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COMBO PICKER — chips with qty control, combos stay as units
// ══════════════════════════════════════════════════════════════════════════════
interface CartCombo { combo: Combo; quantity: number }

function ComboPicker({ cartCombos, onChange }: {
  cartCombos: CartCombo[]
  onChange: (cc: CartCombo[]) => void
}) {
  const [combos, setCombos]   = useState<Combo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    fetch('/api/giao-hang/combos').then(r => r.json())
      .then(d => setCombos(d.combos ?? []))
      .finally(() => setLoading(false))
  }, [])

  function toggleCombo(combo: Combo) {
    const exists = cartCombos.find(cc => cc.combo.id === combo.id)
    if (exists) onChange(cartCombos.filter(cc => cc.combo.id !== combo.id))
    else onChange([...cartCombos, { combo, quantity: 1 }])
  }

  function adjustQty(e: React.MouseEvent, comboId: string, delta: number) {
    e.stopPropagation()
    onChange(cartCombos.map(cc =>
      cc.combo.id === comboId ? { ...cc, quantity: Math.max(1, cc.quantity + delta) } : cc
    ))
  }

  if (loading || combos.length === 0) return null

  const filteredCombos = search
    ? combos.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : combos

  return (
    <div>
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">📦 Gói combo nhanh</div>
      <input
        className="w-full border border-amber-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 mb-2"
        placeholder="🔍 Tìm combo…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {filteredCombos.map(combo => {
          const cc = cartCombos.find(c => c.combo.id === combo.id)
          const active = !!cc
          return (
            <button key={combo.id} onClick={() => toggleCombo(combo)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
              }`}>
              📦 {combo.name}
              {active && (
                <span className="flex items-center gap-0.5 ml-0.5" onClick={e => e.stopPropagation()}>
                  <span onClick={e => adjustQty(e, combo.id, -1)}
                    className="w-4 h-4 rounded bg-white/30 hover:bg-white/50 flex items-center justify-center font-bold">−</span>
                  <span className="font-bold min-w-[14px] text-center">{cc.quantity}</span>
                  <span onClick={e => adjustQty(e, combo.id, 1)}
                    className="w-4 h-4 rounded bg-white/30 hover:bg-white/50 flex items-center justify-center font-bold">+</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COMBO CART LIST — shows combos as units, click to expand components
// ══════════════════════════════════════════════════════════════════════════════
function ComboCartList({ cartCombos, onChange }: {
  cartCombos: CartCombo[]
  onChange: (cc: CartCombo[]) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (cartCombos.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">📦 Combo đã chọn</div>
      {cartCombos.map(({ combo, quantity }) => (
        <div key={combo.id} className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2">
            {/* Name — click to expand */}
            <button
              onClick={() => setExpanded(expanded === combo.id ? null : combo.id)}
              className="flex-1 text-sm font-medium text-amber-900 text-left truncate hover:underline">
              📦 {combo.name}
            </button>
            {/* Qty stepper */}
            <div className="flex items-center gap-0.5 bg-white border border-amber-200 rounded-lg px-1 shrink-0">
              <button onClick={() => onChange(cartCombos.map(cc => cc.combo.id === combo.id ? { ...cc, quantity: Math.max(1, cc.quantity - 1) } : cc))}
                className="w-6 h-6 text-amber-700 hover:text-amber-900 text-sm font-bold">−</button>
              <span className="w-6 text-center text-sm font-semibold text-amber-800">{quantity}</span>
              <button onClick={() => onChange(cartCombos.map(cc => cc.combo.id === combo.id ? { ...cc, quantity: cc.quantity + 1 } : cc))}
                className="w-6 h-6 text-amber-700 hover:text-amber-900 text-sm font-bold">+</button>
            </div>
            <button onClick={() => onChange(cartCombos.filter(cc => cc.combo.id !== combo.id))}
              className="text-amber-300 hover:text-red-500 text-lg leading-none">×</button>
          </div>
          {/* Expanded: components */}
          {expanded === combo.id && (
            <div className="border-t border-amber-200 px-3 py-2 bg-white">
              <div className="text-[10px] text-gray-400 uppercase mb-1">Thành phần mỗi combo:</div>
              {combo.device_combo_items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600 py-0.5 border-b border-gray-50 last:border-0">
                  <span>{item.device_name}</span>
                  <span className="text-gray-400">×{item.quantity} → <span className="text-amber-700 font-medium">×{item.quantity * quantity}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CART — compact list, collapsible per-item details
// ══════════════════════════════════════════════════════════════════════════════
function CartList({ cart, onChange }: { cart: CartItem[]; onChange: (c: CartItem[]) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  function update(idx: number, patch: Partial<CartItem>) {
    onChange(cart.map((item, i) => i === idx ? { ...item, ...patch } : item))
  }

  if (cart.length === 0) return (
    <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
      Chọn thiết bị bên trái để thêm vào đơn
    </div>
  )

  return (
    <div className="space-y-1.5">
      {cart.map((item, idx) => {
        const hasExtra = (item.customer_codes.length > 0) || !!item.expected_receipt
        const isOpen = expanded === item.device_name
        return (
          <div key={item.device_name} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Compact row */}
            <div className="flex items-center gap-2 px-2.5 py-2">
              <span className="flex-1 text-sm font-medium text-gray-800 truncate">{item.device_name}</span>
              {/* Qty stepper */}
              <div className="flex items-center gap-0.5 bg-gray-50 border rounded-lg px-1 shrink-0">
                <button onClick={() => update(idx, { quantity: Math.max(1, item.quantity - 1) })}
                  className="w-6 h-6 text-gray-500 hover:text-gray-900 text-sm font-bold">−</button>
                <input type="number" min={1}
                  className="w-8 text-center text-sm bg-transparent focus:outline-none"
                  value={item.quantity}
                  onChange={e => update(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                />
                <button onClick={() => update(idx, { quantity: item.quantity + 1 })}
                  className="w-6 h-6 text-gray-500 hover:text-gray-900 text-sm font-bold">+</button>
              </div>
              {/* Detail toggle */}
              <button onClick={() => setExpanded(isOpen ? null : item.device_name)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  hasExtra ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'
                }`}
                title="Mã KH / Ngày nhận">
                {hasExtra ? '🏷️' : '…'}{isOpen ? ' ▲' : ' ▼'}
              </button>
              <button onClick={() => onChange(cart.filter((_, i) => i !== idx))}
                className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
            </div>
            {/* Collapsible details */}
            {isOpen && (
              <div className="border-t border-gray-100 px-3 py-2 bg-gray-50 space-y-2">
                <div>
                  <div className="text-xs text-gray-500 font-medium mb-0.5">🏷️ Mã khách hàng</div>
                  <CustomerCodeInput codes={item.customer_codes} onChange={c => update(idx, { customer_codes: c })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">📅 Ngày dự kiến nhận</label>
                  <input type="date"
                    className="mt-0.5 block w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    value={item.expected_receipt}
                    onChange={e => update(idx, { expected_receipt: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — ĐẶT HÀNG (2-column: device picker | cart + form)
// ══════════════════════════════════════════════════════════════════════════════
function TabDatHang({ userEmail }: { userEmail: string }) {
  const [cart, setCart]               = useState<CartItem[]>([])
  const [cartCombos, setCartCombos]   = useState<CartCombo[]>([])
  const [devices, setDevices]         = useState<Equipment[]>([])
  const [popular, setPopular]         = useState<Record<string, number>>({})
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [recipients, setRecipients]   = useState<Recipient[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [recipientInfo, setRecipientInfo] = useState('')
  const [ordererName, setOrdererName] = useState('')
  const [office, setOffice]           = useState('')
  const [expectedDate, setExpectedDate]     = useState('')
  const [expectedShipDate, setExpectedShipDate] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    // Equipment + recipients load together → unblock UI fast (minimal=1 skips photos/docs)
    Promise.all([
      fetch('/api/kho/equipment?minimal=1').then(r => r.json()).then(d => {
        // GPS Tracker và MDVR chỉ đặt qua combo, không hiện trong thiết bị lẻ
        const COMBO_ONLY_TYPES = ['GPS Tracker', 'MDVR']
        setDevices((d.data ?? []).filter((dev: Equipment) => !COMBO_ONLY_TYPES.includes(dev.device_type ?? '')))
      }),
      fetch('/api/giao-hang/recipients').then(r => r.json()).then(d => setRecipients(d.recipients ?? [])),
    ]).finally(() => setLoadingDevices(false))
    // Popular loads in background (calls Google Sheets — slow on cold start)
    fetch('/api/giao-hang/popular').then(r => r.json()).then(d => setPopular(d.data ?? {})).catch(() => {})
  }, [])

  function handleRecipientChange(id: string) {
    setRecipientId(id)
    if (!id) { setRecipientInfo(''); return }
    const r = recipients.find(x => x.id === id)
    if (r) {
      setRecipientInfo([r.name, r.address, r.phone].filter(Boolean).join(' — '))
    }
  }

  async function submit() {
    if (cart.length === 0 && cartCombos.length === 0) { setResult({ ok: false, msg: 'Chưa chọn thiết bị hoặc combo' }); return }
    setSubmitting(true); setResult(null)
    try {
      const res = await fetch('/api/giao-hang/dat-hang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderer_email: userEmail,
          orderer_name:  ordererName,
          office,
          expected_date:      expectedDate,
          expected_ship_date: expectedShipDate,
          recipient_id:   recipientId || undefined,
          recipient_info: recipientInfo,
          notes,
          items: (() => {
            // Standalone items (no combo)
            const allItems: { device_name: string; quantity: number; customer_codes: string[]; expected_receipt?: string; combo_name?: string }[] = cart.map(c => ({
              device_name:      c.device_name,
              quantity:         c.quantity,
              customer_codes:   c.customer_codes,
              expected_receipt: c.expected_receipt || undefined,
            }))
            // Combo items — keep combo_name to group later
            for (const { combo, quantity: comboQty } of cartCombos) {
              for (const ci of combo.device_combo_items) {
                allItems.push({
                  device_name:  ci.device_name,
                  quantity:     ci.quantity * comboQty,
                  customer_codes: [],
                  combo_name:   combo.name,
                })
              }
            }
            return allItems
          })(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, msg: `✅ Đặt hàng thành công! Mã: ${data.order_code}` })
        setCart([]); setCartCombos([]); setOrdererName(''); setOffice(''); setExpectedDate(''); setExpectedShipDate(new Date().toISOString().split('T')[0])
        setNotes(''); setRecipientId(''); setRecipientInfo('')
      } else {
        setResult({ ok: false, msg: data.error ?? 'Lỗi đặt hàng' })
      }
    } finally { setSubmitting(false) }
  }

  const offices = [...new Set(recipients.filter(r => r.type === 'office').map(r => r.office ?? r.name))]

  const totalDevices = cart.reduce((s, c) => s + c.quantity, 0)
    + cartCombos.reduce((s, cc) => s + cc.combo.device_combo_items.reduce((a, ci) => a + ci.quantity, 0) * cc.quantity, 0)

  // Panel height: full viewport minus header/tabs
  const panelCls = "flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden min-h-0"
  const bodyScroll = "flex-1 overflow-y-auto p-4"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3" style={{ height: 'calc(100vh - 160px)', minHeight: 520 }}>

      {/* ── 1. CHỌN COMBO ─────────────────────────────────────────── */}
      <div className={panelCls}>
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-amber-800">🎁 Combo</span>
          {cartCombos.length > 0 && (
            <span className="bg-amber-500 text-white rounded-full px-2 py-0.5 text-[10px] font-bold">
              {cartCombos.length} đã chọn
            </span>
          )}
        </div>
        <div className={bodyScroll}>
          <ComboPicker cartCombos={cartCombos} onChange={setCartCombos} />
        </div>
      </div>

      {/* ── 2. CHỌN THIẾT BỊ LẺ ──────────────────────────────────── */}
      <div className={panelCls}>
        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-blue-800">📦 Thiết bị lẻ</span>
          {cart.length > 0 && (
            <span className="bg-blue-500 text-white rounded-full px-2 py-0.5 text-[10px] font-bold">
              {cart.reduce((s, c) => s + c.quantity, 0)} thiết bị
            </span>
          )}
        </div>
        <div className={bodyScroll}>
          <DevicePicker
            cart={cart} onChange={setCart}
            devices={devices} popular={popular} loading={loadingDevices}
          />
        </div>
      </div>

      {/* ── 3. GIỎ HÀNG ──────────────────────────────────────────── */}
      <div className={panelCls}>
        <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-violet-800">🛒 Đã chọn</span>
          {totalDevices > 0 && (
            <span className="bg-violet-600 text-white rounded-full px-2 py-0.5 text-[10px] font-bold">
              {totalDevices} thiết bị
            </span>
          )}
        </div>
        <div className={bodyScroll}>
          {cartCombos.length === 0 && cart.length === 0 ? (
            <p className="text-sm text-gray-400 text-center pt-12">Chưa chọn gì</p>
          ) : (
            <>
              <ComboCartList cartCombos={cartCombos} onChange={setCartCombos} />
              <CartList cart={cart} onChange={setCart} />
            </>
          )}
        </div>
      </div>

      {/* ── 4. THÔNG TIN ĐƠN ─────────────────────────────────────── */}
      <div className={panelCls}>
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0">
          <span className="text-sm font-semibold text-gray-700">📋 Thông tin đơn</span>
        </div>
        <div className={`${bodyScroll} space-y-3`}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 font-medium">Người đặt</label>
              <input className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Tên người đặt"
                value={ordererName} onChange={e => setOrdererName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Văn phòng</label>
              <input className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Hà Nội, HCM…"
                list="office-list"
                value={office} onChange={e => setOffice(e.target.value)} />
              <datalist id="office-list">
                {offices.map(o => <option key={o} value={o} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-medium">👤 Người nhận</label>
            <select className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              value={recipientId} onChange={e => handleRecipientChange(e.target.value)}>
              <option value="">— Chọn người nhận —</option>
              {['office','person'].map(type => {
                const group = recipients.filter(r => r.type === type)
                if (group.length === 0) return null
                return (
                  <optgroup key={type} label={type === 'office' ? '🏢 Văn phòng' : '👤 Cá nhân'}>
                    {group.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.office ? ` (${r.office})` : ''}{r.phone ? ` — ${r.phone}` : ''}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <input className="mt-1.5 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-600"
              placeholder="Hoặc nhập tên — địa chỉ — SĐT"
              value={recipientInfo} onChange={e => setRecipientInfo(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 font-medium">🚚 Ngày gửi</label>
              <input type="date" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={expectedShipDate} onChange={e => setExpectedShipDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">📅 Ngày giao</label>
              <input type="date" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-medium">Ghi chú</label>
            <textarea rows={2}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              placeholder="Ghi chú thêm…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {result && (
            <div className={`p-3 rounded-xl text-sm ${result.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.msg}
            </div>
          )}

          <button onClick={submit} disabled={submitting || (cart.length === 0 && cartCombos.length === 0)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors">
            {submitting ? 'Đang gửi…' : (cart.length + cartCombos.length) === 0
              ? '🛒 Đặt hàng'
              : `🛒 Đặt hàng${cartCombos.length > 0 ? ` — ${cartCombos.length} combo` : ''}${cart.length > 0 ? ` + ${cart.length} loại lẻ` : ''}`}
          </button>
        </div>
      </div>

    </div>
  )
}


function TabMyOrders({ userEmail, isKho }: { userEmail: string; isKho: boolean }) {
  const [orders, setOrders]   = useState<DonHang[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [serialOnlyModal, setSerialOnlyModal] = useState<DonHang | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/giao-hang/don-hang').then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function updateSerials(id: string, itemSerials: { item_id: string; serials: string[] }[]) {
    await fetch('/api/giao-hang/don-hang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, item_serials: itemSerials }),
    })
    load()
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Đang tải đơn hàng…</div>
  if (orders.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-2">📭</div>
      <div>Bạn chưa có đơn hàng nào</div>
    </div>
  )

  return (
    <div className="space-y-2">
      {orders.map(o => (
        <div key={o.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50"
            onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
            <div>
              <div className="font-mono text-sm font-semibold text-indigo-700">{o.order_code}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {o.office} · {new Date(o.created_at).toLocaleDateString('vi-VN')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={o.status} />
              <span className="text-gray-400 text-sm">{expanded === o.id ? '▲' : '▼'}</span>
            </div>
          </button>
          {expanded === o.id && (
            <div className="border-t border-gray-100 p-3 space-y-2">
              {(() => {
                return <DeviceIMEIList items={o.giao_hang_don_items} />
              })()}
              {o.recipient_info && (
                <div className="text-xs text-gray-500">👤 {o.recipient_info}</div>
              )}
              {o.notes && <div className="text-xs text-gray-500 italic">📝 {o.notes}</div>}
              {o.expected_ship_date && (
                <div className="text-xs text-amber-600">🚚 Gửi dự kiến: {o.expected_ship_date}</div>
              )}
              {o.status_updated_by && (
                <div className="text-xs text-gray-400 border-t border-gray-100 pt-1 mt-1">
                  Cập nhật bởi <span className="font-medium text-gray-500">{o.status_updated_by}</span>
                  {o.status_updated_at && <> lúc {new Date(o.status_updated_at).toLocaleString('vi-VN')}</>}
                </div>
              )}
              <div className="flex gap-2 pt-1 border-t border-gray-100 mt-1">
                {isKho && (
                  <button onClick={() => setSerialOnlyModal(o)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-violet-200 text-violet-600 hover:bg-violet-50">
                    📝 Nhập mã thiết bị
                  </button>
                )}
                <button onClick={() => printLabel(o)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">
                  🏷️ In nhãn
                </button>
                <button onClick={() => { void printHandover(o) }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50">
                  📋 Biên bản bàn giao
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {serialOnlyModal && (
        <SerialInputModal
          order={serialOnlyModal}
          serialsOnly
          onConfirm={serials => {
            updateSerials(serialOnlyModal.id, serials)
            setSerialOnlyModal(null)
          }}
          onCancel={() => setSerialOnlyModal(null)}
        />
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ─── Helper: hiển thị thiết bị + IMEI trong expanded order ───
function DeviceIMEIList({ items }: { items: DonItem[] }) {
  // Ẩn phụ kiện không có IMEI (cáp, thẻ nhớ, SIM) — chỉ hiện thiết bị cần tracking
  const visibleItems = items.filter(i => !isNoImeiAccessory(i.device_name))

  const comboMap = new Map<string, DonItem[]>()
  const standalone: DonItem[] = []
  for (const item of visibleItems) {
    if (item.combo_name) {
      if (!comboMap.has(item.combo_name)) comboMap.set(item.combo_name, [])
      comboMap.get(item.combo_name)!.push(item)
    } else { standalone.push(item) }
  }

  function renderItemSerials(item: DonItem) {
    const serials = item.device_serials ?? []
    const hasAny  = serials.some(Boolean)
    if (item.quantity === 1) {
      return hasAny
        ? <div className="ml-3 mt-0.5"><span className="font-mono bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5 text-[10px]">{serials[0]}</span></div>
        : <div className="ml-3 mt-0.5"><span className="text-[10px] text-gray-300 italic">chưa nhập mã</span></div>
    }
    return (
      <div className="ml-3 mt-0.5 space-y-0.5">
        {Array.from({ length: item.quantity }, (_, si) => {
          const sn = serials[si]
          return (
            <div key={si} className="flex items-center gap-1 text-[10px]">
              <span className="text-gray-400 w-6 shrink-0">#{si+1}</span>
              {sn
                ? <span className="font-mono bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5">{sn}</span>
                : <span className="text-gray-300 italic">chưa nhập</span>
              }
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {Array.from(comboMap.entries()).map(([cname, citems]) => (
        <div key={cname} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <div className="text-xs font-semibold text-amber-700 mb-1.5">🎁 {cname}</div>
          <div className="space-y-1.5">
            {citems.map(ci => (
              <div key={ci.id}>
                <div className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span className="font-medium">{ci.device_name}</span>
                  <span className="text-gray-400">×{ci.quantity}</span>
                  {(ci.device_serials ?? []).filter(Boolean).length > 0 && (
                    <span className="text-[10px] text-green-600 font-medium">
                      ✓ {(ci.device_serials ?? []).filter(Boolean).length}/{ci.quantity}
                    </span>
                  )}
                </div>
                {renderItemSerials(ci)}
              </div>
            ))}
          </div>
        </div>
      ))}
      {standalone.length > 0 && (
        <div className="space-y-1.5">
          {standalone.map(item => (
            <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-700">
                <span className="font-medium">{item.device_name}</span>
                <span className="text-gray-400">×{item.quantity}</span>
                {(item.device_serials ?? []).filter(Boolean).length > 0 && (
                  <span className="text-[10px] text-green-600 font-medium">
                    ✓ {(item.device_serials ?? []).filter(Boolean).length}/{item.quantity}
                  </span>
                )}
              </div>
              {renderItemSerials(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// SERIAL INPUT MODAL — GPS/MDVR: CRM check per item; others: manual serial
// ══════════════════════════════════════════════════════════════════════════════
const GPS_NEEDS_SERIAL    = ['GPS Tracker'] // chỉ GPS Tracker mới cần CRM scan + IMEI
const COMBO_SIM_HIDE_TYPES = ['GPS Tracker', 'MDVR'] // nếu combo có loại này → ẩn SIM/Storage đi kèm

interface CrmCheckResult {
  stock?: {
    status: string; productName: string; productBarcode: string
    sourceStock: string; destStock: string; updateMan: string; updateTime: string
    updateAction: string; isAtCompany: boolean
  } | null
  components?: { Device_Code: string; Device_TypeName: string; QP_ProductKindName: string }[]
  grouped?: Record<string, unknown>
  unicode?: string | null
  suggested_status?: string | null
  stock_error?: string; car_error?: string
  matchResult?: 'match' | 'mismatch' | 'fuzzy' | null
  orderName?: string | null
}

function SerialInputModal({ order, onConfirm, onCancel, serialsOnly = false }: {
  order: DonHang
  onConfirm: (serials: { item_id: string; serials: string[] }[]) => void
  onCancel: () => void
  serialsOnly?: boolean
}) {
  const [itemSerials, setItemSerials] = useState<Record<string, string[]>>(
    Object.fromEntries(order.giao_hang_don_items.map(i => [i.id, i.device_serials ?? []]))
  )
  const [noSerial, setNoSerial] = useState<Record<string, boolean>>(
    // Chỉ auto-tick "Không có mã" nếu đã từng lưu trạng thái "không có mã" rõ ràng
    // (device_serials = [] mà không phải giá trị mặc định null)
    // → Mặc định false, tránh auto-tick hết toàn bộ thiết bị
    Object.fromEntries(order.giao_hang_don_items.map(i => [i.id, false]))
  )
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(order.giao_hang_don_items.map(i => [i.id, '']))
  )
  // Device type map (loaded once)
  const [deviceTypes, setDeviceTypes] = useState<Record<string, string>>({})
  // Per-item CRM state (only for GPS/MDVR)
  const [crmInput,   setCrmInput]   = useState<Record<string, string>>({})
  const [crmResult,  setCrmResult]  = useState<Record<string, CrmCheckResult | null>>({})
  const [crmLoading, setCrmLoading] = useState<Record<string, boolean>>({})
  const [crmError,   setCrmError]   = useState<Record<string, string>>({})
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/kho/equipment').then(r => r.json()).then(d => {
      const map: Record<string, string> = {}
      for (const eq of d.data ?? []) map[eq.name] = eq.device_type ?? ''
      setDeviceTypes(map)
    }).catch(() => {})
  }, [])

  // Khi deviceTypes load: force GPS/MDVR → noSerial=false (luôn cần mã)
  // Không cần set noSerial cho accessories vì modal đã ẩn chúng luôn
  useEffect(() => {
    if (Object.keys(deviceTypes).length === 0) return
    const items = order.giao_hang_don_items
    setNoSerial(prev => {
      const next = { ...prev }
      for (const item of items) {
        const dtype = deviceTypes[item.device_name] ?? ''
        if (GPS_NEEDS_SERIAL.includes(dtype)) next[item.id] = false
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceTypes])

  async function checkCRM(itemId: string, slotIdx: number, deviceName?: string) {
    const slotKey = `${itemId}:${slotIdx}`
    const barcode = crmInput[slotKey]?.trim()
    if (!barcode) return
    setCrmLoading(l => ({ ...l, [slotKey]: true }))
    setCrmResult(r  => ({ ...r,  [slotKey]: null }))
    setCrmError(e   => ({ ...e,  [slotKey]: '' }))
    try {
      const params = new URLSearchParams({ barcode })
      if (deviceName) params.set('orderName', deviceName)
      const res = await fetch(`/api/giao-hang/crm-check?${params}`)
      const d = await res.json()
      if (d.ok) {
        setCrmResult(r => ({ ...r, [slotKey]: d }))
        setItemSerials(s => {
          const arr = [...(s[itemId] ?? [])]
          arr[slotIdx] = barcode
          return { ...s, [itemId]: arr }
        })
        setNoSerial(n => ({ ...n, [itemId]: false }))
      } else {
        setCrmError(e => ({ ...e, [slotKey]: d.error ?? 'Lỗi CRM' }))
      }
    } catch { setCrmError(e => ({ ...e, [slotKey]: 'Lỗi kết nối' })) }
    finally { setCrmLoading(l => ({ ...l, [slotKey]: false })) }
  }

  function addSerial(itemId: string, slotIdx: number) {
    const slotKey = `${itemId}:${slotIdx}`
    const v = drafts[slotKey]?.trim()
    if (!v) return
    setItemSerials(s => {
      const arr = [...(s[itemId] ?? [])]
      arr[slotIdx] = v
      return { ...s, [itemId]: arr }
    })
    setNoSerial(n => ({ ...n, [itemId]: false }))
    setDrafts(d => ({ ...d, [slotKey]: '' }))
  }

  function clearSlot(itemId: string, slotIdx: number) {
    setItemSerials(s => {
      const arr = [...(s[itemId] ?? [])]
      arr[slotIdx] = ''
      return { ...s, [itemId]: arr }
    })
  }

  function toggleNoSerial(itemId: string, checked: boolean) {
    setNoSerial(n => ({ ...n, [itemId]: checked }))
    if (checked) setItemSerials(s => ({ ...s, [itemId]: [] }))
  }

  function confirm() {
    if (!serialsOnly) {
      // IMEI không còn bắt buộc nhập tay — có thể load từ CRM qua tab Kiểm tra kho
      // Nếu có nhập thì kiểm tra cảnh báo (không chặn)
      const partial: string[] = []
      for (const item of order.giao_hang_don_items) {
        const dtype = deviceTypes[item.device_name] ?? ''
        if (GPS_NEEDS_SERIAL.includes(dtype)) {
          const filled = (itemSerials[item.id] ?? []).filter(Boolean).length
          if (filled > 0 && filled < item.quantity) {
            partial.push(`${item.device_name} (${filled}/${item.quantity})`)
          }
        }
      }
      if (partial.length > 0) {
        setValidationError(`Mới nhập một phần IMEI: ${partial.join(' · ')} — vẫn tiếp tục?`)
        // Không return — cho phép confirm luôn (IMEI bổ sung qua tab Kiểm tra kho)
      }
    }
    setValidationError(null)
    onConfirm(order.giao_hang_don_items.map(item => ({
      item_id: item.id,
      serials: noSerial[item.id] ? [] : (itemSerials[item.id] ?? []).filter(Boolean),
    })))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <div className="font-semibold text-gray-800 text-base">📦 Nhập mã thiết bị — {order.order_code}</div>
        <div className="text-xs text-gray-500">
          {serialsOnly
            ? 'Lưu mã serial/IMEI (không đổi trạng thái)'
            : 'GPS Tracker / MDVR: quét barcode để kiểm tra CRM. Thiết bị khác: nhập mã thủ công.'}
        </div>

        {(() => {
          const items2 = order.giao_hang_don_items
          // Combo nào chứa GPS/MDVR để biết SIM/Storage trong combo đó có thể ẩn
          const comboHasGpsMdvr = new Map<string, boolean>()
          for (const it of items2) {
            if (it.combo_name && COMBO_SIM_HIDE_TYPES.includes(deviceTypes[it.device_name] ?? '')) {
              comboHasGpsMdvr.set(it.combo_name, true)
            }
          }
          return items2.map(item => {
          const dtype     = deviceTypes[item.device_name] ?? ''
          const isGpsMdvr = GPS_NEEDS_SERIAL.includes(dtype)
          const isInCombo = !!item.combo_name
          const thisComboHasGps = isInCombo ? (comboHasGpsMdvr.get(item.combo_name!) ?? false) : false
          const nameLower = item.device_name.toLowerCase()

          // Luôn ẩn: accessory thuần (dây, nguồn, phụ kiện không cần serial)
          if (dtype === 'Power' || dtype === 'Cable'
            || nameLower.includes('dây nguồn') || nameLower.includes('dây kết nối')
            || nameLower.includes('dây cáp') || nameLower.includes('bộ phụ kiện'))
            return null

          // Ẩn SIM và thẻ nhớ CHỈ KHI nằm trong combo có GPS Tracker hoặc MDVR
          // Thiết bị lẻ (standalone): giữ nguyên, người dùng tự tick "Không có mã"
          if (isInCombo && thisComboHasGps && (dtype === 'Simcard' || dtype === 'Storage')) return null

          const effectiveNoSerial = isGpsMdvr ? false : (noSerial[item.id] ?? false)
          const qty = item.quantity
          const isFirstVisible = items2.find(i => {
            const dt = deviceTypes[i.device_name] ?? ''
            const inC = !!i.combo_name
            const cHasGps = inC ? (comboHasGpsMdvr.get(i.combo_name!) ?? false) : false
            const nl = i.device_name.toLowerCase()
            if (dt === 'Power' || dt === 'Cable' || nl.includes('dây nguồn') || nl.includes('dây kết nối') || nl.includes('dây cáp') || nl.includes('bộ phụ kiện')) return false
            if (inC && cHasGps && (dt === 'Simcard' || dt === 'Storage')) return false
            return true
          }) === item

          return (
            <div key={item.id} className={`border rounded-xl overflow-hidden ${isGpsMdvr ? 'border-blue-200' : 'border-gray-200'}`}>
              {/* Item header */}
              <div className={`flex items-center justify-between px-3 py-2 ${isGpsMdvr ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <div className="font-medium text-sm text-gray-800 flex items-center gap-1.5 flex-wrap">
                  <span>{isGpsMdvr ? '📡' : '📦'} {item.device_name}</span>
                  <span className="text-gray-400 font-normal text-xs">×{qty}</span>
                  {isGpsMdvr && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">GPS/MDVR</span>}
                  <span className="text-[10px] text-gray-400">
                    ({(itemSerials[item.id] ?? []).filter(Boolean).length}/{qty} mã)
                  </span>
                </div>
                {!isGpsMdvr && (
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none shrink-0">
                    <input type="checkbox" className="rounded"
                      checked={effectiveNoSerial}
                      onChange={e => toggleNoSerial(item.id, e.target.checked)} />
                    Không có mã
                  </label>
                )}
              </div>

              {/* Per-unit slots */}
              {!effectiveNoSerial && (
                <div className="px-3 py-2 space-y-2">
                  {Array.from({ length: qty }, (_, si) => {
                    const slotKey = `${item.id}:${si}`
                    const savedSerial = (itemSerials[item.id] ?? [])[si] ?? ''
                    const cr = crmResult[slotKey] ?? null
                    return (
                      <div key={si} className={qty > 1 ? 'border border-gray-100 rounded-lg p-2 space-y-1.5 bg-gray-50/50' : 'space-y-1.5'}>
                        {qty > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Thiết bị #{si + 1}</span>
                            {savedSerial && <span className="text-[10px] text-green-600 font-medium">✓ Đã nhập</span>}
                          </div>
                        )}
                        {isGpsMdvr && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 space-y-1.5">
                            <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">🔍 Quét barcode — kiểm tra CRM</div>
                            <div className="flex gap-1">
                              <input
                                className="flex-1 border border-blue-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Quét hoặc nhập barcode/IMEI"
                                value={crmInput[slotKey] ?? ''}
                                onChange={e => setCrmInput(i => ({ ...i, [slotKey]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkCRM(item.id, si, item.device_name) } }}
                                autoFocus={si === 0 && isFirstVisible}
                              />
                              <button onClick={() => checkCRM(item.id, si, item.device_name)} disabled={crmLoading[slotKey]}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                                {crmLoading[slotKey] ? '…' : 'Kiểm tra'}
                              </button>
                            </div>
                            {crmError[slotKey] && <div className="text-xs text-red-500">{crmError[slotKey]}</div>}
                            {cr?.stock && (
                              <div className={`text-xs border rounded-lg p-2 space-y-0.5 ${cr.stock.isAtCompany ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-gray-800">{cr.stock.productName}</span>
                                  {cr.matchResult === 'match' && (
                                    <span className="text-[10px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full font-medium">✓ Đúng loại</span>
                                  )}
                                  {cr.matchResult === 'fuzzy' && (
                                    <span className="text-[10px] bg-yellow-100 text-yellow-700 border border-yellow-300 px-1.5 py-0.5 rounded-full font-medium">~ Có thể khớp</span>
                                  )}
                                  {cr.matchResult === 'mismatch' && (
                                    <span className="text-[10px] bg-red-100 text-red-700 border border-red-300 px-1.5 py-0.5 rounded-full font-medium">⚠ Sai loại</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 text-gray-600">
                                  <span>📦 Kho: <span className="font-medium">{cr.stock.sourceStock || '—'}</span></span>
                                  <span className={`font-medium ${cr.stock.status === 'HAVE' ? 'text-green-600' : 'text-orange-500'}`}>{cr.stock.status}</span>
                                </div>
                                {cr.suggested_status === 'da_nhan'
                                  ? <div className="text-green-700 text-[11px]">✅ Thiết bị đã ở kho người nhận</div>
                                  : <div className="text-orange-600 text-[11px]">⏳ Vẫn ở kho công ty</div>
                                }
                              </div>
                            )}
                            {cr?.grouped && Object.keys(cr.grouped).length > 0 && (
                              <div className="bg-white border border-blue-100 rounded-lg p-2">
                                <div className="text-[10px] font-medium text-gray-500 mb-1">🔧 Linh kiện đi kèm:</div>
                                {Object.entries(cr.grouped).map(([kind, gitems]) => (
                                  <div key={kind} className="flex items-start gap-2 text-xs mb-0.5">
                                    <span className="text-gray-400 min-w-[80px] shrink-0">{kind}</span>
                                    <div className="flex flex-wrap gap-1">
                                      {(gitems as {Device_Code:string; Device_TypeName:string}[]).map(it => (
                                        <span key={it.Device_Code} className="bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5">
                                          {it.Device_Code}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Serial display + input */}
                        {savedSerial ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 text-xs font-mono">
                              {savedSerial}
                              <button onClick={() => clearSlot(item.id, si)} className="ml-0.5 text-violet-400 hover:text-red-500">×</button>
                            </span>
                          </div>
                        ) : (
                          !isGpsMdvr && (
                            <div className="flex gap-1">
                              <input
                                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                                placeholder="Nhập mã serial/IMEI (Enter)"
                                value={drafts[slotKey] ?? ''}
                                onChange={e => setDrafts(d => ({ ...d, [slotKey]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSerial(item.id, si) } }}
                              />
                              <button onClick={() => addSerial(item.id, si)}
                                className="px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-xs hover:bg-violet-100">+</button>
                            </div>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      })()}

        {validationError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <div>
              <div className="font-semibold">Chưa đủ mã thiết bị</div>
              <div className="text-xs mt-0.5">{validationError}</div>
              <div className="text-xs text-red-500 mt-1">GPS Tracker bắt buộc nhập mã IMEI trước khi xác nhận gửi hàng.</div>
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={confirm}
            className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold">
            {serialsOnly ? '💾 Lưu mã thiết bị' : '✅ Xác nhận gửi hàng'}
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Hủy</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PRINT LABEL — in nhãn đơn hàng
// ══════════════════════════════════════════════════════════════════════════════
// ── Nhãn dán thùng (compact) ──────────────────────────────────────────────
function printLabel(order: DonHang) {
  const items   = order.giao_hang_don_items
  const dateStr = new Date().toLocaleDateString('vi-VN')
  const recipParts = (order.recipient_info ?? '').split('—').map(s => s.trim())
  const recipName  = recipParts[1] ?? recipParts[0] ?? ''
  const recipPhone = recipParts[2] ?? ''
  const recipAddr  = recipParts.slice(3).join(', ').trim()

  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>Nhãn – ${order.order_code}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:16px}
  .label{border:2px solid #111;padding:14px;max-width:400px}
  .code{font-size:20px;font-weight:bold;letter-spacing:1px;text-align:center}
  .meta{font-size:10px;color:#666;text-align:center;margin-top:2px}
  hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
  .section-title{font-size:10px;font-weight:bold;text-transform:uppercase;color:#666;margin-bottom:3px}
  .name{font-size:15px;font-weight:bold}
  .info{font-size:11px;color:#333;line-height:1.6;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
  th{background:#f5f5f5;padding:3px 5px;border:1px solid #ccc;text-align:left}
  td{padding:3px 5px;border:1px solid #ddd;vertical-align:top}
  .serial{font-family:monospace;font-size:10px;color:#444}
  .footer{margin-top:8px;font-size:9px;color:#aaa;text-align:right}
  @media print{body{padding:0}@page{margin:5mm}}
</style></head><body>
<div class="label">
  <div class="code">${order.order_code}</div>
  <div class="meta">Người đặt: ${order.orderer_name || order.orderer_email} · VP: ${order.office} · ${dateStr}</div>
  <hr>
  <div class="section-title">Người nhận</div>
  <div class="name">${recipName || '—'}</div>
  <div class="info">${[recipPhone, recipAddr, order.office].filter(Boolean).join(' · ')}</div>
  <hr>
  <div class="section-title">Thiết bị</div>
  <table>
    <thead><tr><th>Tên thiết bị</th><th>SL</th><th>Serial/IMEI</th></tr></thead>
    <tbody>
      ${items.map(i => `<tr>
        <td>${i.device_name}</td>
        <td style="text-align:center">${i.quantity}</td>
        <td class="serial">${(i.device_serials ?? []).filter(Boolean).join('<br>') || '<span style="color:#ccc">—</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${order.notes ? `<hr><div class="info" style="font-style:italic">📝 ${order.notes}</div>` : ''}
  ${order.expected_date ? `<div class="info" style="margin-top:6px">🚚 Ngày giao: ${new Date(order.expected_date).toLocaleDateString('vi-VN')}</div>` : ''}
  <div class="footer">EUP Hardware · ${dateStr}</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`

  const win = window.open('', '_blank', 'width=480,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

// ── Biên bản bàn giao A4 (có chữ ký) ─────────────────────────────────────
async function printHandover(order: DonHang) {
  const items = order.giao_hang_don_items
  const now = new Date()
  const dateStr  = now.toLocaleDateString('vi-VN')
  const dateISO  = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Parse recipient_info: "VP — Tên — SĐT — Địa chỉ"
  const recipParts  = (order.recipient_info ?? '').split('—').map(s => s.trim())
  const recipOffice = recipParts[0] ?? ''
  const recipName   = recipParts[1] ?? ''
  const recipPhone  = recipParts[2] ?? ''
  const recipAddr   = recipParts.slice(3).join(', ').trim()

  // Tất cả items — combo phụ kiện xếp sau device chính
  const mainItems   = items.filter(i => !i.combo_name)
  const comboItems  = items.filter(i =>  i.combo_name)
  const allRows     = [...mainItems, ...comboItems]

  // ── Tự động lấy SIM/thẻ nhớ serials từ GetCarList nếu chưa có ──────────
  // Tìm main device items có serials (GPS/MDVR)
  const mainDeviceItems = mainItems.filter(i =>
    !isNoImeiAccessory(i.device_name) &&
    Array.isArray(i.device_serials) && i.device_serials.length > 0
  )
  // Tìm combo items thiếu serials (SIM, thẻ nhớ, ổ cứng)
  const missingAccessories = comboItems.filter(i =>
    isCrmBarcodedOptional(i.device_name) &&
    (!i.device_serials || i.device_serials.filter(Boolean).length === 0)
  )

  // Bản đồ bổ sung: itemId → serials lấy từ GetCarList
  const extraSerials: Record<string, string[]> = {}

  if (mainDeviceItems.length > 0 && missingAccessories.length > 0) {
    try {
      // Gộp tất cả GPS/MDVR barcodes để gọi 1 lần
      const allBarcodes = mainDeviceItems.flatMap(i => (i.device_serials ?? []).filter(Boolean))
      if (allBarcodes.length > 0) {
        const res = await fetch('/api/giao-hang/car-accessories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcodes: allBarcodes, stockupKind: '0' }),
        })
        if (res.ok) {
          const data = await res.json() as { ok: boolean; results: Array<{ barcode: string; byKind: Record<number, Array<{ code: string }>> }> }
          if (data.ok) {
            // Với mỗi GPS barcode[i], gán SIM byKind[3][i] vào missingAccessory SIM item
            for (const acc of missingAccessories) {
              const isSimItem  = /viettel|vinaphone|sim|m2m|3mbipts|data_\d|gps_m2m/.test(acc.device_name.toLowerCase())
              const isMemItem  = /thẻ nhớ|microsd|sd card|đầu đọc|ổ cứng|hdd|ssd/.test(acc.device_name.toLowerCase())
              const kind       = isSimItem ? 3 : isMemItem ? 2 : -1
              if (kind === -1) continue

              const codes: string[] = []
              for (const r of data.results) {
                const entries = r.byKind[kind] ?? []
                if (entries.length > 0) codes.push(entries[0].code)
              }
              if (codes.length > 0) extraSerials[acc.id] = codes
            }
          }
        }
      }
    } catch { /* in bình thường nếu lỗi */ }
  }

  // Kho chuyển = "Kho EUP Hardware", Kho nhận = văn phòng/người nhận
  const khoNhan = recipName ? `${recipName}${recipOffice ? ` (${recipOffice})` : ''}` : (recipOffice || order.office || '')

  // Hàm lấy serials của 1 item (saved hoặc extraSerials)
  const getSerials = (item: DonItem) => {
    const saved = (item.device_serials ?? []).filter(Boolean)
    return saved.length > 0 ? saved : (extraSerials[item.id] ?? [])
  }

  // Helper tạo 1 row
  const makeRow = (stt: number, item: DonItem, si: number) => {
    const serials = getSerials(item)
    return `<tr>
      <td style="text-align:center">${stt}</td>
      <td>${item.device_name}${item.combo_name ? ` <span style="font-size:10px;color:#777">[${item.combo_name}]</span>` : ''}</td>
      <td class="mono" style="color:${serials[si] ? '#000' : '#bbb'}">${serials[si] ?? ''}</td>
      <td>Kho EUP Hardware</td>
      <td>${khoNhan}</td>
      <td style="text-align:center">1</td>
    </tr>`
  }

  // Tạo rows — interleave theo combo group:
  // Với mỗi unit vị trí i: GPS[i] → SIM[i] → thẻ nhớ[i] → phụ kiện khác[i]
  // Sắp xếp trong combo: main device (không phải accessory) trước, rồi crmBarcoded, rồi physical
  const sortComboItems = (its: DonItem[]) => [
    ...its.filter(i => !isNoImeiAccessory(i.device_name)),
    ...its.filter(i => isCrmBarcodedOptional(i.device_name)),
    ...its.filter(i => isPhysicalOnlyAccessory(i.device_name)),
  ]

  let stt = 0
  const rowLines: string[] = []

  // Nhóm combo
  const comboNames = [...new Set(comboItems.map(i => i.combo_name).filter(Boolean))]
  const standaloneMain = mainItems.filter(i => !i.combo_name)

  // Standalone items (no combo_name)
  for (const item of standaloneMain) {
    stt++
    const s = stt
    const qty = item.quantity
    for (let si = 0; si < qty; si++) rowLines.push(makeRow(s, item, si))
  }

  // Combo groups: interleave by position
  for (const cn of comboNames) {
    const groupRaw = items.filter(i => i.combo_name === cn)
    const group    = sortComboItems(groupRaw)
    const maxQty   = Math.max(...group.map(i => i.quantity))
    const itemStts: Record<string, number> = {}
    for (const item of group) { stt++; itemStts[item.id] = stt }

    for (let si = 0; si < maxQty; si++) {
      for (const item of group) {
        if (si < item.quantity) rowLines.push(makeRow(itemStts[item.id], item, si))
      }
    }
  }

  const rows = rowLines.join('')
  const totalQty = allRows.reduce((a, i) => a + i.quantity, 0)
  const handoverDate = order.expected_date
    ? new Date(order.expected_date).toLocaleDateString('vi-VN')
    : dateStr

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Biên bản bàn giao – ${order.order_code}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 15mm 15mm; }
  .header-state { text-align: center; line-height: 1.6; margin-bottom: 4px; }
  .header-state .bold { font-weight: bold; font-size: 13px; }
  .header-state .italic { font-style: italic; font-size: 11.5px; }
  .title-wrap { display: flex; justify-content: space-between; align-items: flex-start; margin: 10px 0 6px; }
  .title-center { flex: 1; text-align: center; }
  .title { font-size: 15px; font-weight: bold; text-transform: uppercase; }
  .subtitle { font-size: 11.5px; }
  .date-right { font-size: 11px; white-space: nowrap; }
  .parties { margin: 8px 0 6px; font-size: 12px; line-height: 1.8; }
  .parties b { font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  th { border: 1px solid #333; padding: 5px 4px; text-align: center; font-weight: bold; background: #f5f5f5; }
  td { border: 1px solid #555; padding: 4px 4px; vertical-align: middle; }
  .mono { font-family: 'Courier New', monospace; font-size: 10px; }
  .footer-note { font-size: 10.5px; margin-top: 10px; line-height: 1.7; }
  .footer-note li { margin-left: 16px; }
  .sign-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; text-align: center; font-size: 12px; }
  .sign-title { font-weight: bold; }
  .sign-space { height: 55px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 8mm 12mm 10mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Quốc hiệu -->
  <div class="header-state">
    <div class="bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
    <div class="italic">Độc lập – Tự do – Hạnh phúc</div>
    <div style="font-size:10px;margin-top:1px">───────────────</div>
  </div>

  <!-- Tiêu đề + ngày -->
  <div class="title-wrap">
    <div style="width:80px"></div>
    <div class="title-center">
      <div class="title">Biên bản bàn giao thiết bị</div>
      <div class="subtitle">(Nội bộ)</div>
    </div>
    <div class="date-right">${handoverDate}</div>
  </div>

  <!-- Bên giao / Bên nhận -->
  <div class="parties">
    <div><b>BÊN GIAO:</b> ${order.orderer_name || order.orderer_email || 'Nhân viên kho EUP'}</div>
    <div><b>BÊN NHẬN:</b> ${khoNhan || recipName || '...................................'}</div>
  </div>

  <!-- Bảng thiết bị -->
  <table>
    <thead>
      <tr>
        <th style="width:32px">STT</th>
        <th style="text-align:left">Tên thiết bị</th>
        <th style="width:140px">Mã thiết bị</th>
        <th style="width:100px">Kho Chuyển</th>
        <th style="width:130px">Kho Nhận</th>
        <th style="width:38px">Số lượng</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      ${Array.from({ length: Math.max(0, 20 - totalQty) }, () =>
        `<tr><td>&nbsp;</td><td></td><td class="mono"></td><td></td><td></td><td></td></tr>`
      ).join('')}
    </tbody>
  </table>

  <!-- Ghi chú pháp lý -->
  <div class="footer-note">
    Người nhận bàn giao có trách nhiệm quản lý, sử dụng thiết bị đúng mục đích:
    <ul>
      <li>Thiết bị dự phòng quá 2 tháng không sử dụng cần gửi trả công ty.</li>
      <li>Thiết bị cũ sau khi bảo hành cần gửi về công ty trong vòng 14 ngày kể từ ngày tháo xuống.</li>
      <li>Nếu xảy ra mất thiết bị thì phải bồi thường tổn thất cho công ty tương ứng với mức sau:</li>
      <li>Nhân viên kinh doanh, kỹ thuật của công ty bồi thường ½ giá bán tiêu chuẩn.</li>
      <li>Kỹ thuật thuê ngoài bồi thường 100% giá bán tiêu chuẩn.</li>
    </ul>
    Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản.
  </div>

  <!-- Ký tên -->
  <div class="sign-wrap">
    <div>
      <div class="sign-title">BÊN BÀN GIAO</div>
      <div class="sign-space"></div>
      <div>${order.orderer_name || ''}</div>
    </div>
    <div>
      <div class="sign-title">BÊN NHẬN</div>
      <div class="sign-space"></div>
      <div>${recipName || ''}</div>
    </div>
  </div>

  <div style="margin-top:10px;font-size:8px;color:#bbb;text-align:center">
    Biên bản được tạo tự động từ hệ thống EUP Hardware Management · ${dateStr} · ${order.order_code}
  </div>
</div>
<script>window.onload = () => window.print()</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=850,height=1100')
  if (win) { win.document.write(html); win.document.close() }
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — TẤT CẢ ĐƠN (admin)
// ══════════════════════════════════════════════════════════════════════════════
function TabAllOrders({ isKho }: { isKho: boolean }) {
  const [orders, setOrders]   = useState<DonHang[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [crmResults, setCrmResults]   = useState<Record<string, SerialCRMResult[]>>({})
  const [crmChecking, setCrmChecking] = useState<Set<string>>(new Set())
  const [checkingAll, setCheckingAll] = useState(false)
  const [daRightWarning, setDaRightWarning] = useState<DonHang | null>(null)
  const [crmWarningResults, setCrmWarningResults] = useState<SerialCRMResult[]>([])
  const autoCheckedRef = useRef(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ mine: '0' })
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    return fetch(`/api/giao-hang/don-hang?${params}`).then(r => r.json())
      .then(d => { setOrders(d.orders ?? []); return d.orders ?? [] as DonHang[] })
      .finally(() => setLoading(false))
  }, [search, statusFilter])

  // Auto-check đơn đã gửi khi tab mở lần đầu
  useEffect(() => {
    load().then((orderList: DonHang[]) => {
      if (autoCheckedRef.current) return
      autoCheckedRef.current = true
      autoCheckSentOrders(orderList)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload khi filter thay đổi (không auto-check lại)
  useEffect(() => {
    if (!autoCheckedRef.current) return  // bỏ qua lần mount đầu (đã handle ở trên)
    load()
  }, [load])

  async function updateStatus(id: string, status: string, itemSerials?: { item_id: string; serials: string[] }[]) {
    await fetch('/api/giao-hang/don-hang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, item_serials: itemSerials }),
    })
    load()
  }

  async function updateSerials(id: string, itemSerials: { item_id: string; serials: string[] }[]) {
    await fetch('/api/giao-hang/don-hang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, item_serials: itemSerials }),
    })
    load()
  }

  /** Batch-check một đơn, hiển thị kết quả, auto-update da_nhan nếu tất cả đã chuyển */
  async function checkCRMOrder(order: DonHang, autoUpdate = false) {
    const serials = order.giao_hang_don_items.flatMap(i => i.device_serials ?? []).filter(Boolean)
    if (serials.length === 0) {
      if (autoUpdate) await updateStatus(order.id, 'da_nhan')
      return
    }
    setCrmChecking(prev => new Set([...prev, order.id]))
    try {
      const res = await fetch('/api/giao-hang/batch-crm-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serials }),
      })
      const d = await res.json()
      if (d.ok) {
        const results = d.results as SerialCRMResult[]
        setCrmResults(prev => ({ ...prev, [order.id]: results }))
        if (autoUpdate) {
          const checked = results.filter(r => r.ok)
          if (checked.length > 0 && checked.every(r => r.transferred)) {
            await updateStatus(order.id, 'da_nhan')
          }
        }
      }
    } finally {
      setCrmChecking(prev => { const n = new Set(prev); n.delete(order.id); return n })
    }
  }

  /** Auto-check toàn bộ đơn da_gui khi tải trang */
  async function autoCheckSentOrders(orderList: DonHang[]) {
    const sentOrders = orderList.filter(o => o.status === 'da_gui' &&
      o.giao_hang_don_items.some(i => (i.device_serials ?? []).length > 0))
    if (sentOrders.length === 0) return
    // Chạy song song
    await Promise.all(sentOrders.map(o => checkCRMOrder(o, true)))
  }

  /** Manual: check tất cả đơn đã gửi */
  async function checkAllSent() {
    setCheckingAll(true)
    const sentOrders = orders.filter(o => o.status === 'da_gui' &&
      o.giao_hang_don_items.some(i => (i.device_serials ?? []).length > 0))
    await Promise.all(sentOrders.map(o => checkCRMOrder(o, true)))
    setCheckingAll(false)
  }

  async function checkCRMAndWarn(order: DonHang) {
    const serials = order.giao_hang_don_items.flatMap(i => i.device_serials ?? []).filter(Boolean)
    if (serials.length === 0) { updateStatus(order.id, 'da_nhan'); return }
    setCrmChecking(prev => new Set([...prev, order.id]))
    try {
      const res = await fetch('/api/giao-hang/batch-crm-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serials }),
      })
      const d = await res.json()
      if (d.ok) {
        const results = d.results as SerialCRMResult[]
        setCrmResults(prev => ({ ...prev, [order.id]: results }))
        const notTransferred = results.filter(r => r.ok && !r.transferred)
        if (notTransferred.length > 0) {
          setCrmWarningResults(notTransferred)
          setDaRightWarning(order)
          return
        }
      }
      updateStatus(order.id, 'da_nhan')
    } catch { updateStatus(order.id, 'da_nhan') }
    finally {
      setCrmChecking(prev => { const n = new Set(prev); n.delete(order.id); return n })
    }
  }

  function handleStatusClick(order: DonHang, status: string) {
    if (status === 'da_nhan') {
      checkCRMAndWarn(order)
    } else {
      // da_gui và các trạng thái khác: update trực tiếp (IMEI đã lưu từ bước kiểm kho)
      updateStatus(order.id, status)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="🔍 Tìm theo người đặt, mã đơn, văn phòng…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {isKho && (
            <button onClick={checkAllSent} disabled={checkingAll}
              title="Kiểm tra CRM tất cả đơn Đã gửi, tự động cập nhật Đã nhận nếu đã chuyển kho"
              className="flex-shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors whitespace-nowrap">
              {checkingAll ? '⏳ Đang check…' : '📡 Check tất cả đơn đã gửi'}
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!statusFilter ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'}`}>
            Tất cả
          </button>
          {VALID_STATUSES_UI.map(k => {
            const cfg = STATUS_CONFIG[k]
            const active = statusFilter === k
            return (
              <button key={k} onClick={() => setStatusFilter(active ? '' : k)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${active ? cfg.badge + ' ring-1 ring-offset-1 ring-current shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'}`}>
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Không có đơn hàng</div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${STATUS_BORDER_STYLE[o.status] ?? ''}`}>
              <button className="w-full grid grid-cols-[auto_1fr_1fr_1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                {/* Mã đơn */}
                <div className="font-mono text-sm font-semibold text-indigo-700 whitespace-nowrap">{o.order_code}</div>
                {/* Người đặt + VP */}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{o.orderer_name || o.orderer_email}</div>
                  <div className="text-xs text-gray-400 truncate">{o.office}</div>
                </div>
                {/* Ngày tạo + ngày gửi */}
                <div className="min-w-0">
                  <div className="text-xs text-gray-500 whitespace-nowrap">📅 {new Date(o.created_at).toLocaleDateString('vi-VN')}</div>
                  {o.expected_ship_date && <div className="text-xs text-amber-600 whitespace-nowrap">🚚 {o.expected_ship_date}</div>}
                </div>
                {/* Nội dung đơn — tóm tắt */}
                <div className="min-w-0">
                  {(() => {
                    const comboNames = [...new Set(o.giao_hang_don_items.filter(i => i.combo_name).map(i => i.combo_name!))]
                    const standalone = o.giao_hang_don_items.filter(i => !i.combo_name)
                    return (
                      <div className="flex flex-wrap gap-1">
                        {comboNames.map(cn => (
                          <span key={cn} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5 truncate max-w-[120px]">📦 {cn}</span>
                        ))}
                        {standalone.length > 0 && (
                          <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{standalone.reduce((s,i)=>s+i.quantity,0)} thiết bị lẻ</span>
                        )}
                      </div>
                    )
                  })()}
                  {o.recipient_info && <div className="text-[10px] text-gray-400 mt-0.5 truncate">👤 {o.recipient_info.split('—')[0].trim()}</div>}
                </div>
                {/* Status badge */}
                <StatusBadge status={o.status} />
                {/* Expand */}
                <span className="text-gray-400 text-xs">{expanded === o.id ? '▲' : '▼'}</span>
              </button>
              {expanded === o.id && (
                <div className="border-t p-3 space-y-2">
                  {(() => {
                    return <DeviceIMEIList items={o.giao_hang_don_items} />
                  })()}
                  {o.recipient_info && <div className="text-xs text-gray-500">👤 {o.recipient_info}</div>}
                  {o.expected_ship_date && <div className="text-xs text-amber-600">🚚 Gửi: {o.expected_ship_date}</div>}
                  {o.tracking_code && <div className="text-xs text-violet-700 font-medium">📦 Mã vận đơn: <span className="font-mono">{o.tracking_code}</span></div>}
                  {o.notes && <div className="text-xs italic text-gray-500">📝 {o.notes}</div>}
                  {o.status_updated_by && (
                    <div className="text-xs text-gray-400 border-t border-gray-100 pt-1">
                      Cập nhật bởi <span className="font-medium text-gray-500">{o.status_updated_by}</span>
                      {o.status_updated_at && <> lúc {new Date(o.status_updated_at).toLocaleString('vi-VN')}</>}
                    </div>
                  )}
                  {/* CRM kết quả kiểm tra chuyển kho */}
                  {crmResults[o.id] && (
                    <div className="border border-blue-100 bg-blue-50 rounded-xl p-2 space-y-1">
                      <div className="text-[10px] font-medium text-blue-600 mb-1">📡 Kết quả kiểm tra CRM</div>
                      {crmResults[o.id].map(r => (
                        <div key={r.serial} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-gray-700 shrink-0">{r.serial}</span>
                          {r.ok ? (
                            r.transferred ? (
                              <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                ✅ Đã chuyển kho → {r.destStock || r.productName}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                                ⏳ Chưa chuyển ({r.sourceStock})
                              </span>
                            )
                          ) : (
                            <span className="text-red-500">❌ {r.error}</span>
                          )}
                          {r.ok && r.updateTime && (
                            <span className="text-gray-400 text-[10px]">{r.updateMan} · {r.updateTime}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isKho ? (
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                      {/* Kiểm tra kho inline — chỉ hiện cho đơn Chờ xử lý */}
                      {o.status === 'cho_xu_ly' && (
                        <InlineWarehouseCheck order={o} onConfirmed={load} />
                      )}
                      {/* Status buttons — large & clear */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cập nhật trạng thái</div>
                        <div className="flex gap-2 flex-wrap">
                          {VALID_STATUSES_UI.map(k => {
                            const cfg = STATUS_CONFIG[k]
                            const active = o.status === k
                            return (
                              <button key={k} onClick={() => handleStatusClick(o, k)} disabled={active}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all shadow-sm ${
                                  active
                                    ? `${cfg.badge} border-current cursor-default ring-2 ring-offset-1 ring-current/30`
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-800'
                                }`}>
                                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
                                {cfg.label}
                                {active && <span className="text-xs opacity-60">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-2 flex-wrap items-center">
                        {/* Kiểm tra trạng thái kho — hiện cho đơn da_gui có IMEI */}
                        {o.status === 'da_gui' && o.giao_hang_don_items.some(i => (i.device_serials ?? []).length > 0) && (
                          <button onClick={() => checkCRMOrder(o, true)} disabled={crmChecking.has(o.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 transition-all">
                            {crmChecking.has(o.id) ? '⏳ Đang kiểm tra…' : '📡 Kiểm tra trạng thái kho'}
                          </button>
                        )}
                        {/* CRM check cho đơn đang/đã xử lý (xem IMEI status) */}
                        {o.status !== 'da_gui' && o.status !== 'cho_xu_ly' && o.giao_hang_don_items.some(i => (i.device_serials ?? []).length > 0) && (
                          <button onClick={() => checkCRMOrder(o, false)} disabled={crmChecking.has(o.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 transition-all">
                            {crmChecking.has(o.id) ? '⏳ Đang check…' : '📡 Kiểm tra CRM'}
                          </button>
                        )}
                        <button onClick={() => printLabel(o)}
                          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all">
                          🏷️ In nhãn
                        </button>
                        <button onClick={() => { void printHandover(o) }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 transition-all">
                          📋 Biên bản bàn giao
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      {o.giao_hang_don_items.some(i => (i.device_serials ?? []).length > 0) && (
                        <button onClick={() => checkCRMOrder(o, false)} disabled={crmChecking.has(o.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                          {crmChecking.has(o.id) ? '⏳ Đang check…' : '📡 Kiểm tra CRM'}
                        </button>
                      )}
                      <button onClick={() => printLabel(o)}
                        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">
                        🏷️ In nhãn
                      </button>
                      <button onClick={() => { void printHandover(o) }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50">
                        📋 Biên bản bàn giao
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cảnh báo chưa chuyển kho khi bấm Đã nhận */}
      {daRightWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none mt-0.5">⚠️</span>
              <div>
                <div className="font-semibold text-gray-800 text-base">Thiết bị chưa hoàn tất chuyển kho</div>
                <div className="text-sm text-gray-500 mt-0.5">Các thiết bị sau chưa sẵn sàng để xác nhận đã nhận:</div>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              {crmWarningResults.map(r => {
                const isInTransit = r.crmStatus === 'TRANS'
                return (
                  <div key={r.serial} className="text-xs space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-white border border-orange-200 rounded px-1.5 py-0.5 text-orange-800">{r.serial}</span>
                      {r.productName && <span className="text-gray-500 truncate">{r.productName}</span>}
                    </div>
                    <div className="pl-0.5">
                      {isInTransit ? (
                        <span className="text-blue-600">🔄 Đang chuyển kho — người nhận chưa nhận ({r.sourceStock} → {r.destStock || '?'})</span>
                      ) : (
                        <span className="text-orange-600">🏭 Vẫn ở kho công ty: {r.sourceStock}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="text-sm text-gray-600">Bạn vẫn muốn chuyển sang <span className="font-semibold text-green-700">Đã nhận</span>?</div>
            <div className="flex gap-2">
              <button
                onClick={() => { updateStatus(daRightWarning.id, 'da_nhan'); setDaRightWarning(null) }}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors">
                Vẫn chuyển Đã nhận
              </button>
              <button
                onClick={() => setDaRightWarning(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — LỊCH SỬ SHEET
// ══════════════════════════════════════════════════════════════════════════════
function TabLichSuSheet() {
  const [orders, setOrders]     = useState<SheetOrder[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState('')
  const [search, setSearch]     = useState('')
  const [hasDevice, setHasDevice] = useState(true)
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const LIMIT = 100
  const [editing, setEditing]   = useState<Partial<SheetOrder> | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (search)    p.set('search', search)
    if (hasDevice) p.set('has_device', '1')
    fetch(`/api/giao-hang/orders?${p}`).then(r => r.json())
      .then(d => { setOrders(d.orders ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, search, hasDevice])

  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/giao-hang/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await res.json()
      setSyncMsg(d.ok ? `✅ Đồng bộ ${d.upserted} dòng (${d.source})` : `❌ ${d.error}`)
      if (d.ok) load()
    } catch (e) {
      setSyncMsg('❌ Lỗi kết nối')
    } finally { setSyncing(false) }
  }

  async function saveEdit() {
    if (!editing?.id) return
    const res = await fetch('/api/giao-hang/orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    const d = await res.json()
    if (d.ok) { setEditing(null); load() }
    else alert(d.error)
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={sync} disabled={syncing}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
          {syncing ? '⏳ Đang đồng bộ…' : '🔄 Đồng bộ Sheet'}
        </button>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" className="rounded" checked={hasDevice} onChange={e => { setHasDevice(e.target.checked); setPage(1) }} />
          Có Loại TB
        </label>
        <input className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="Tìm kiếm…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <span className="text-xs text-gray-400">{total} dòng</span>
      </div>
      {syncMsg && <div className="text-sm px-3 py-2 bg-gray-50 rounded-xl border">{syncMsg}</div>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {['STT','Thời gian','Office','Người đặt','Loại TB','SL','Ngày DK','Người nhận',''].map(h => (
                <th key={h} className="px-2 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Đang tải…</td></tr>
            ) : orders.map(o => (
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1.5 text-gray-400">{o.stt}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{o.order_time}</td>
                <td className="px-2 py-1.5 font-medium">{o.office}</td>
                <td className="px-2 py-1.5">{o.orderer}</td>
                <td className="px-2 py-1.5 max-w-[160px]">
                  <span className="bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 text-[11px] break-words">{o.device_type}</span>
                </td>
                <td className="px-2 py-1.5 text-center font-semibold">{o.quantity}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{o.expected_date}</td>
                <td className="px-2 py-1.5 max-w-[140px] truncate text-gray-600">{o.recipient_info}</td>
                <td className="px-2 py-1.5">
                  <button onClick={() => setEditing({ ...o })}
                    className="text-indigo-500 hover:text-indigo-700 text-xs border border-indigo-200 rounded px-1.5 py-0.5">
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-gray-50">◀</button>
          <span className="text-xs text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-gray-50">▶</button>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
            <div className="font-semibold text-gray-800">Chỉnh sửa dòng #{editing.sheet_row}</div>
            {[
              ['order_time','Thời gian'],['office','Office'],['orderer','Người đặt'],
              ['device_type','Loại TB'],['quantity','Số lượng'],
              ['expected_date','Ngày dự kiến'],['recipient_info','Người nhận'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="text-xs text-gray-500">{label}</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  value={String((editing as Record<string, unknown>)[k] ?? '')}
                  onChange={e => setEditing({ ...editing, [k]: e.target.value })} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium">Lưu</button>
              <button onClick={() => setEditing(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — GÓI COMBO (CRUD)
// ══════════════════════════════════════════════════════════════════════════════
function DeviceComboItemRow({ item, devices, onUpdate, onRemove }: {
  item: { device_name: string; quantity: number; notes: string }
  devices: Equipment[]
  onUpdate: (patch: Partial<typeof item>) => void
  onRemove: () => void
}) {
  const [search, setSearch] = useState(item.device_name)
  const [open, setOpen]     = useState(false)

  const filtered = search.trim()
    ? devices.filter(d => d.name.toLowerCase().includes(search.toLowerCase())).slice(0, 12)
    : devices.slice(0, 12)

  function select(name: string) {
    setSearch(name); onUpdate({ device_name: name }); setOpen(false)
  }

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 relative">
        <input
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
          placeholder="Tìm và chọn thiết bị…"
          value={search}
          onChange={e => { setSearch(e.target.value); onUpdate({ device_name: e.target.value }); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(d => (
              <button key={d.equipment_id} onMouseDown={() => select(d.name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2">
                <span className="text-base">{typeStyle(d.device_type).icon}</span>
                <span className="flex-1">{d.name}</span>
                {d.device_type && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${typeStyle(d.device_type).color}`}>
                    {typeStyle(d.device_type).label}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="number" min={1}
        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-300"
        value={item.quantity}
        onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 1 })} />
      <input
        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
        placeholder="Ghi chú"
        value={item.notes}
        onChange={e => onUpdate({ notes: e.target.value })} />
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg font-bold mt-0.5">×</button>
    </div>
  )
}

function TabCombos({ isKho }: { isKho: boolean }) {
  const [combos, setCombos]     = useState<Combo[]>([])
  const [devices, setDevices]   = useState<Equipment[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Combo | null>(null)
  const [form, setForm]         = useState({ name: '', description: '', items: [{ device_name: '', quantity: 1, notes: '' }] })
  const [saving, setSaving]     = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/giao-hang/combos').then(r => r.json()).then(d => setCombos(d.combos ?? [])),
      fetch('/api/kho/equipment').then(r => r.json()).then(d => setDevices(d.data ?? [])),
    ]).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', items: [{ device_name: '', quantity: 1, notes: '' }] })
    setShowForm(true)
  }

  function openEdit(combo: Combo) {
    setEditing(combo)
    setForm({
      name: combo.name,
      description: combo.description ?? '',
      items: combo.device_combo_items.length > 0
        ? combo.device_combo_items.map(i => ({ device_name: i.device_name, quantity: i.quantity, notes: i.notes ?? '' }))
        : [{ device_name: '', quantity: 1, notes: '' }],
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const body = { name: form.name, description: form.description, items: form.items.filter(i => i.device_name.trim()) }
    const res = await fetch('/api/giao-hang/combos', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...body } : body),
    })
    const d = await res.json()
    setSaving(false)
    if (d.ok || d.combo) { setShowForm(false); load() }
    else alert(d.error)
  }

  async function del(id: string) {
    if (!confirm('Xóa combo này?')) return
    await fetch('/api/giao-hang/combos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  function updateItem(idx: number, patch: Partial<typeof form.items[0]>) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }))
  }
  function addItem()    { setForm(f => ({ ...f, items: [...f.items, { device_name: '', quantity: 1, notes: '' }] })) }
  function removeItem(idx: number) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })) }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold text-gray-700">📦 Quản lý gói combo</div>
        {isKho && (
          <button onClick={openCreate}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors">
            + Tạo combo
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Đang tải…</div>
      ) : combos.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Chưa có combo nào
        </div>
      ) : (
        <div className="space-y-2">
          {combos.map(combo => (
            <div key={combo.id} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-sm text-amber-800">📦 {combo.name}</div>
                  {combo.description && <div className="text-xs text-gray-500 mt-0.5">{combo.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {combo.device_combo_items.map((item, i) => (
                      <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2 py-0.5 text-xs">
                        {item.device_name} ×{item.quantity}
                        {item.notes && <span className="text-gray-400 ml-1">({item.notes})</span>}
                      </span>
                    ))}
                  </div>
                </div>
                {isKho && (
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => openEdit(combo)}
                      className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Sửa</button>
                    <button onClick={() => del(combo.id)}
                      className="px-2 py-1 text-xs border border-red-200 rounded-lg hover:bg-red-50 text-red-500">Xóa</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3 overflow-y-auto max-h-[90vh]">
            <div className="font-semibold text-gray-800">{editing ? 'Sửa combo' : 'Tạo combo mới'}</div>
            <div>
              <label className="text-xs text-gray-500">Tên combo *</label>
              <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="VD: C43 Full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Mô tả</label>
              <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="Mô tả combo" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Thiết bị trong combo</label>
              <div className="space-y-2 mt-1">
                {form.items.map((item, idx) => (
                  <DeviceComboItemRow
                    key={idx}
                    item={item}
                    devices={devices}
                    onUpdate={patch => updateItem(idx, patch)}
                    onRemove={() => removeItem(idx)}
                  />
                ))}
                <button onClick={addItem}
                  className="w-full py-1.5 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
                  + Thêm thiết bị
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={saving}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                {saving ? 'Đang lưu…' : 'Lưu combo'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6 — NGƯỜI NHẬN (CRUD)
// ══════════════════════════════════════════════════════════════════════════════
function TabRecipients() {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<Recipient | null>(null)
  const [form, setForm]             = useState({ name: '', type: 'office', office: '', address: '', phone: '', contact_name: '', notes: '' })
  const [saving, setSaving]         = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/giao-hang/recipients').then(r => r.json())
      .then(d => setRecipients(d.recipients ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', type: 'office', office: '', address: '', phone: '', contact_name: '', notes: '' })
    setShowForm(true)
  }

  function openEdit(r: Recipient) {
    setEditing(r)
    setForm({ name: r.name, type: r.type, office: r.office ?? '', address: r.address ?? '', phone: r.phone ?? '', contact_name: r.contact_name ?? '', notes: r.notes ?? '' })
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/giao-hang/recipients', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
    })
    const d = await res.json()
    setSaving(false)
    if (d.ok || d.recipient) { setShowForm(false); load() }
    else alert(d.error)
  }

  async function del(id: string) {
    if (!confirm('Xóa người nhận này?')) return
    await fetch('/api/giao-hang/recipients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  const offices = recipients.filter(r => r.type === 'office')
  const persons = recipients.filter(r => r.type === 'person')

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold text-gray-700">👤 Quản lý người nhận</div>
        <button onClick={openCreate}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors">
          + Thêm người nhận
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Đang tải…</div>
      ) : (
        <>
          {offices.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">🏢 Văn phòng <span className="bg-gray-100 rounded-full px-1.5">{offices.length}</span></div>
              <div className="space-y-1.5">
                {offices.map(r => (
                  <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      {r.office && <div className="text-xs text-indigo-600">{r.office}</div>}
                      {r.address && <div className="text-xs text-gray-500 mt-0.5">📍 {r.address}</div>}
                      {r.phone && <div className="text-xs text-gray-500">📞 {r.phone}</div>}
                      {r.contact_name && <div className="text-xs text-gray-500">👤 Liên hệ: {r.contact_name}</div>}
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => openEdit(r)}
                        className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Sửa</button>
                      <button onClick={() => del(r.id)}
                        className="px-2 py-1 text-xs border border-red-200 rounded-lg hover:bg-red-50 text-red-500">Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {persons.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">👤 Cá nhân <span className="bg-gray-100 rounded-full px-1.5">{persons.length}</span></div>
              <div className="space-y-1.5">
                {persons.map(r => (
                  <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      {r.office && <div className="text-xs text-gray-500">{r.office}</div>}
                      {r.address && <div className="text-xs text-gray-500 mt-0.5">📍 {r.address}</div>}
                      {r.phone && <div className="text-xs text-gray-500">📞 {r.phone}</div>}
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => openEdit(r)}
                        className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Sửa</button>
                      <button onClick={() => del(r.id)}
                        className="px-2 py-1 text-xs border border-red-200 rounded-lg hover:bg-red-50 text-red-500">Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {offices.length === 0 && persons.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
              Chưa có người nhận nào
            </div>
          )}
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3 overflow-y-auto max-h-[90vh]">
            <div className="font-semibold text-gray-800">{editing ? 'Sửa người nhận' : 'Thêm người nhận'}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Tên *</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="Tên người nhận hoặc văn phòng"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Loại</label>
                <select className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="office">🏢 Văn phòng</option>
                  <option value="person">👤 Cá nhân</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Mã VP/Nhóm</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="VD: HN, HCM" value={form.office}
                  onChange={e => setForm(f => ({ ...f, office: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Địa chỉ</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="Địa chỉ giao hàng" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Số điện thoại</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="SĐT liên hệ" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Người liên hệ</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="Tên người nhận" value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Ghi chú</label>
                <input className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="Ghi chú thêm" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={saving}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB — KIỂM TRA HÀNG CHỜ KHO · WAREHOUSE QUEUE CHECK
// ══════════════════════════════════════════════════════════════════════════════

const WHC_LIST = [
  { id:  2, label: 'HN technical' },
  { id:  3, label: 'HCM technical' },
  { id:  4, label: 'Binh Duong technical' },
  { id:  5, label: 'Hai Phong technical' },
  { id:  6, label: 'Đà nẵng technical' },
  { id:  7, label: 'Quảng ninh technical' },
  { id:  1, label: 'Company' },
  { id: -1, label: 'Other' },
]

const KIND_LABEL: Record<number, string> = {
  [-1]: 'Tracker / GPS',
  0:    'Thiết bị · Device barcode',
  2:    'Phụ kiện · Accessories',
  3:    'Sim Card',
}

interface WhItem   { whId: number; whName: string; whSort: number }
interface WqProd   { productName: string; productNumber: string; stockupKind: number; waitCount: number; transCount: number; whName: string }
interface WqDevice { barcode: string; productName: string; carUnicode: string; sourceStock: string; destStock: string; status: string; updateMan: string; stockupKind: number; productNumber: string }

// Kết quả so khớp từng item của đơn với thiết bị CRM
interface OrderItemMatch {
  itemId:      string
  deviceName:  string
  quantity:    number
  assigned:    string[]      // barcodes auto-gợi ý (slice đầu tiên)
  allBarcodes: string[]      // TẤT CẢ barcodes khớp (để nhân viên chọn khi dư)
  available:   number        // tổng CRM devices khớp
  matched:     boolean       // assigned.length === quantity
  stockupKind: number | null // -1=GPS, 0=Device, 2=Phụ kiện, 3=SIM; null=không tìm thấy
}
interface OrderMatch {
  order:      DonHang
  items:      OrderItemMatch[]
  allMatched: boolean
}

/**
 * Phụ kiện đi kèm thiết bị — KHÔNG cần kiểm tra IMEI riêng lẻ.
 * Những item này bị loại khỏi bước matching CRM để tránh nhầm lẫn
 * (VD: "Dây nguồn C43" chứa "C43" nhưng không phải camera C43).
 */
/** Phụ kiện vật lý thuần (dây nguồn, cáp) — không có barcode trong CRM → auto-skip hoàn toàn */
function isPhysicalOnlyAccessory(name: string): boolean {
  const n = name.toLowerCase()
  return /dây nguồn|cáp nguồn|power cable/.test(n)
}

/** SIM/thẻ nhớ/đầu đọc — CRM có barcode, cần assign nhưng optional (không block confirm) */
function isCrmBarcodedOptional(name: string): boolean {
  const n = name.toLowerCase()
  return (
    /thẻ nhớ|microsd|sd card/.test(n) ||
    /đầu đọc/.test(n) ||
    /viettel|vinaphone|m2m|3mbipts|data_\d|gps_m2m/.test(n)
  )
}

/** Backward-compat alias — chỉ còn dùng ở bộ phận kho preview */
function isNoImeiAccessory(name: string): boolean {
  return isPhysicalOnlyAccessory(name) || isCrmBarcodedOptional(name)
}

/** So sánh tên device (order) với productName (CRM) — case-insensitive, flexible */
function deviceNamesMatch(orderName: string, crmName: string): boolean {
  const a = orderName.toLowerCase().trim()
  const b = crmName.toLowerCase().trim()
  if (a === b || b.includes(a) || a.includes(b)) return true

  // Word-level: min 2 ký tự (để match "H5", "C4", v.v.)
  const aWords = a.split(/[\s\-_()/,]+/).filter(w => w.length >= 2)
  if (aWords.some(w => b.includes(w))) return true
  const bWords = b.split(/[\s\-_()/,]+/).filter(w => w.length >= 2)
  if (bWords.some(w => a.includes(w))) return true

  // Cross-language pairs (CRM English ↔ order Vietnamese)
  const PAIRS: Array<[string, string]> = [
    ['temperature sensor', 'cảm biến nhiệt'],
    ['sensor wire',        'cảm biến'],
    ['fuel sensor',        'cảm biến dầu'],
    ['smartbox',           'mở rộng cảm biến'],
    ['smart box',          'smartbox'],
    ['power cable',        'dây nguồn'],
    ['sim card',           'sim'],
    ['memory',             'thẻ nhớ'],
    ['card reader',        'đầu đọc'],
  ]
  for (const [en, vi] of PAIRS) {
    if (a.includes(vi) && b.includes(en)) return true
    if (b.includes(vi) && a.includes(en)) return true
  }

  return false
}

// ── Kiểm tra kho inline — hiện trong card đơn Chờ xử lý ─────────────────────
// ── Types cho 2-panel matching ─────────────────────────────────────────────
interface CrmProduct { productName: string; stockupKind: number; barcodes: string[] }
interface CRMComponent { Device_Code: string; QP_ProductKind: number; QP_ProductKindName: string; Device_TypeName: string }

function InlineWarehouseCheck({ order, onConfirmed }: { order: DonHang; onConfirmed: () => void }) {
  const [whcId,      setWhcId]      = useState<number>(2)
  const [whList,     setWhList]     = useState<WhItem[]>([])
  const [whId,       setWhId]       = useState<number | null>(null)
  const [loadingWh,  setLoadingWh]  = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [confirmed,  setConfirmed]  = useState(false)
  const [confirming, setConfirming] = useState(false)

  // CRM data sau khi load
  const [crmProducts, setCrmProducts] = useState<CrmProduct[]>([])
  const [crmSearch,   setCrmSearch]   = useState('')
  const [loaded,      setLoaded]      = useState(false)

  // Panel trái: item nào đang được focus để nhận barcode
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  // assignments: itemId → barcode[]
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  // barcode → carUnicode (để gọi GetCarList khi assign main device)
  const [barcodeUnicodeMap, setBarcodeUnicodeMap] = useState<Record<string, string>>({})
  // trạng thái auto-fill accessories
  const [autoFilling, setAutoFilling] = useState<string | null>(null) // barcode đang xử lý

  const sortLabels: Record<number, string> = { 1: 'Kho chính', 2: 'Kỹ thuật viên', 3: 'Sales / Customer' }
  const groupedWh = whList.reduce<Record<number, WhItem[]>>((acc, w) => {
    ;(acc[w.whSort] ??= []).push(w); return acc
  }, {})

  const loadWarehouses = useCallback(async (wid: number) => {
    setLoadingWh(true); setWhList([]); setWhId(null); setLoaded(false); setError(null)
    try {
      const r = await fetch(`/api/giao-hang/warehouse-list?whc_id=${wid}`)
      const d = await r.json()
      if (d.ok && Array.isArray(d.warehouses)) {
        const list: WhItem[] = d.warehouses
        setWhList(list)
        const first = list.find(w => w.whSort === 1) ?? list[0]
        if (first) setWhId(first.whId)
      } else { setError(d.error ?? 'Không lấy được kho') }
    } catch (e) { setError(String(e)) }
    finally { setLoadingWh(false) }
  }, [])

  useEffect(() => { loadWarehouses(whcId) }, [whcId, loadWarehouses])

  // Tất cả barcodes đã được gán (dùng để block ở bảng CRM)
  const usedBarcodes = new Set(Object.values(assignments).flat())

  // Lấy tên kho đang chọn
  const selectedWhName = whList.find(w => w.whId === whId)?.whName ?? ''

  async function doLoad() {
    if (!whId) { setError('Chọn kho trước'); return }
    setLoading(true); setError(null); setCrmProducts([]); setAssignments({}); setFocusedItemId(null); setBarcodeUnicodeMap({})
    try {
      const r = await fetch(`/api/giao-hang/warehouse-queue?whc_id=${whcId}&wh_id=${whId}`)
      const d = await r.json()
      if (!d.ok) { setError(d.error ?? 'Lỗi CRM'); return }

      // Gộp theo productName + lưu barcode→carUnicode map
      const map: Record<string, CrmProduct> = {}
      const unicodeMap: Record<string, string> = {}
      for (const dev of (d.devices ?? []) as WqDevice[]) {
        const bc = dev.barcode || dev.carUnicode
        if (!bc) continue
        const key = dev.productName
        if (!map[key]) map[key] = { productName: key, stockupKind: dev.stockupKind, barcodes: [] }
        map[key].barcodes.push(bc)
        if (dev.carUnicode) unicodeMap[bc] = dev.carUnicode
      }
      setCrmProducts(Object.values(map).sort((a, b) => a.productName.localeCompare(b.productName)))
      setBarcodeUnicodeMap(unicodeMap)
      setLoaded(true)

      // Auto-focus item đầu tiên cần assign (bỏ qua dây nguồn/cáp)
      const first = order.giao_hang_don_items.find(i => !isPhysicalOnlyAccessory(i.device_name))
      if (first) setFocusedItemId(first.id)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  // Sau khi assign main device, tự động lấy accessories từ GetCarList
  async function autoFillAccessories(mainBarcode: string, carUnicode: string) {
    if (!carUnicode) return
    setAutoFilling(mainBarcode)
    try {
      const r = await fetch(`/api/giao-hang/crm-check?unicode=${encodeURIComponent(carUnicode)}`)
      const d = await r.json()
      if (!d.ok || !Array.isArray(d.components)) return

      const components = d.components as CRMComponent[]
      setAssignments(prev => {
        const updated = { ...prev }
        for (const comp of components) {
          if (!comp.Device_Code) continue
          const kind = comp.QP_ProductKind
          // Chỉ lấy SIM (3) và accessories (2) — thiết bị chính (0/-1) đã assign thủ công
          if (kind !== 2 && kind !== 3) continue

          // Tìm order item phù hợp còn chỗ trống
          const matchItem = order.giao_hang_don_items.find(item => {
            if (!isCrmBarcodedOptional(item.device_name)) return false
            const slots = updated[item.id] ?? []
            if (slots.length >= item.quantity) return false
            if (slots.includes(comp.Device_Code)) return false
            const n = item.device_name.toLowerCase()
            if (kind === 3) return /viettel|vinaphone|sim|m2m|3mbipts|data_\d|gps_m2m/.test(n)
            if (kind === 2) return /thẻ nhớ|microsd|sd card|đầu đọc|ổ cứng|hdd|ssd/.test(n)
            return false
          })

          if (matchItem) {
            const current = updated[matchItem.id] ?? []
            if (!current.includes(comp.Device_Code) && current.length < matchItem.quantity) {
              updated[matchItem.id] = [...current, comp.Device_Code]
            }
          }
        }
        return updated
      })
    } catch (e) { console.error('autoFillAccessories error:', e) }
    finally { setAutoFilling(null) }
  }

  // Click barcode ở bảng CRM → gán vào focused item
  function toggleBarcode(bc: string) {
    if (!focusedItemId) return
    const item = order.giao_hang_don_items.find(i => i.id === focusedItemId)
    if (!item) return
    const current = assignments[focusedItemId] ?? []

    if (current.includes(bc)) {
      // Bỏ gán
      setAssignments(prev => ({ ...prev, [focusedItemId]: current.filter(b => b !== bc) }))
    } else {
      if (current.length >= item.quantity) return // đã đủ
      const next = [...current, bc]
      setAssignments(prev => ({ ...prev, [focusedItemId]: next }))

      // Nếu là main device (GPS/MDVR/camera), tự động fill accessories từ GetCarList
      const isMainDevice = !isPhysicalOnlyAccessory(item.device_name) && !isCrmBarcodedOptional(item.device_name)
      if (isMainDevice) {
        const carUnicode = barcodeUnicodeMap[bc]
        if (carUnicode) autoFillAccessories(bc, carUnicode)
      }

      // Auto-advance khi đủ số lượng
      if (next.length === item.quantity) {
        const assignableItems = order.giao_hang_don_items.filter(i => !isPhysicalOnlyAccessory(i.device_name))
        const idx = assignableItems.findIndex(i => i.id === focusedItemId)
        const nextItem = assignableItems.slice(idx + 1).find(i =>
          (assignments[i.id]?.length ?? 0) < i.quantity
        )
        if (nextItem) setFocusedItemId(nextItem.id)
      }
    }
  }

  // Tìm barcode đang gán cho item nào (để hiện label ở bảng CRM)
  function barcodeAssignedTo(bc: string): string | null {
    for (const [iid, bcs] of Object.entries(assignments)) {
      if (bcs.includes(bc)) return iid
    }
    return null
  }

  // Confirm được khi tất cả thiết bị chính (GPS, camera, MDVR…) đã đủ serial
  // SIM/thẻ nhớ là optional — assign được nhưng không block confirm
  const requiredItems = order.giao_hang_don_items.filter(
    i => !isPhysicalOnlyAccessory(i.device_name) && !isCrmBarcodedOptional(i.device_name)
  )
  const allDone = requiredItems.every(i => (assignments[i.id]?.length ?? 0) >= i.quantity)

  async function confirmInline() {
    setConfirming(true)
    try {
      const item_serials = order.giao_hang_don_items.map(i => ({
        item_id: i.id,
        serials: assignments[i.id] ?? [],
      }))
      const res = await fetch('/api/giao-hang/don-hang', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: 'dang_xu_ly', item_serials }),
      })
      if (res.ok) { setConfirmed(true); onConfirmed() }
      else { const d = await res.json(); setError(d.error ?? 'Lỗi xác nhận') }
    } catch (e) { setError(String(e)) }
    finally { setConfirming(false) }
  }

  if (confirmed) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-medium">
        ✅ Đã xác nhận IMEI → Đang xử lý
      </div>
    )
  }

  const filteredCrm = crmSearch
    ? crmProducts.filter(p => p.productName.toLowerCase().includes(crmSearch.toLowerCase()))
    : crmProducts

  return (
    <div className="border border-indigo-200 rounded-xl overflow-hidden">
      {/* ── Header: chọn kho + load ── */}
      <div className="bg-indigo-50 px-3 py-2.5 flex flex-wrap items-end gap-2 border-b border-indigo-100">
        <div className="text-xs font-semibold text-indigo-700 shrink-0 self-center">🏭 Ghép IMEI từ kho CRM</div>
        <div className="flex items-end gap-2 flex-wrap ml-auto">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Kho tổng · WHC</label>
            <select value={whcId} onChange={e => { setWhcId(Number(e.target.value)); setLoaded(false) }}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              {WHC_LIST.map(c => <option key={c.id} value={c.id}>[{c.id}] {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Kho con{loadingWh && ' (đang tải…)'}</label>
            <select value={whId ?? ''} onChange={e => { setWhId(Number(e.target.value)); setLoaded(false) }}
              disabled={loadingWh || whList.length === 0}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-50">
              {whList.length === 0 && <option value="">—</option>}
              {Object.entries(groupedWh).sort(([a],[b]) => Number(a)-Number(b)).map(([sort, wItems]) => (
                <optgroup key={sort} label={sortLabels[Number(sort)] ?? `Nhóm ${sort}`}>
                  {wItems.map(w => <option key={w.whId} value={w.whId}>[{w.whId}] {w.whName}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button onClick={doLoad} disabled={loading || loadingWh || !whId}
            className="py-1 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
            {loading ? '⏳' : loaded ? '🔄 Tải lại' : '📦 Tải kho'}
          </button>
        </div>
      </div>

      {error && <div className="px-3 py-2 text-xs text-red-600 bg-red-50">⚠️ {error}</div>}

      {!loaded && !loading && (
        <div className="px-3 py-4 text-xs text-gray-400 text-center">
          Chọn kho rồi nhấn <strong>Tải kho</strong> để xem danh sách thiết bị đang chờ bàn giao
        </div>
      )}

      {loaded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

          {/* ══ BẢNG TRÁI: Đơn hàng cần bàn giao ══ */}
          <div className="p-3 space-y-1">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              📋 Đơn hàng — click vào thiết bị cần ghép IMEI
            </div>
            {order.giao_hang_don_items.map(item => {
              const isPhysical  = isPhysicalOnlyAccessory(item.device_name) // dây nguồn/cáp — không barcode
              const isOptional  = isCrmBarcodedOptional(item.device_name)   // SIM/thẻ nhớ — optional
              const assigned    = assignments[item.id] ?? []
              const needed      = item.quantity
              const isFocused   = focusedItemId === item.id
              const isDone      = isPhysical || assigned.length >= needed
              const isAutoFill  = autoFilling !== null && isOptional && !isDone

              return (
                <div
                  key={item.id}
                  onClick={() => !isPhysical && setFocusedItemId(item.id)}
                  className={`rounded-lg border px-2.5 py-2 transition-all text-xs ${
                    isPhysical
                      ? 'border-gray-100 bg-gray-50 cursor-default opacity-60'
                      : isFocused
                        ? 'border-indigo-400 bg-indigo-50 cursor-pointer ring-2 ring-indigo-200'
                        : isDone
                          ? 'border-green-200 bg-green-50 cursor-pointer'
                          : isOptional
                            ? 'border-amber-200 bg-amber-50/40 cursor-pointer hover:border-amber-300'
                            : 'border-gray-200 bg-white cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm shrink-0">
                      {isPhysical ? '📦' : isDone ? '✅' : isAutoFill ? '⏳' : isFocused ? '👉' : isOptional ? '🔖' : '⬜'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{item.device_name}</div>
                      {item.combo_name && (
                        <div className="text-[10px] text-gray-400">[{item.combo_name}]</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {isPhysical ? (
                        <span className="text-gray-400">× {needed}</span>
                      ) : (
                        <div className="text-right">
                          <span className={`font-bold ${isDone ? 'text-green-600' : isFocused ? 'text-indigo-600' : isOptional ? 'text-amber-600' : 'text-gray-500'}`}>
                            {assigned.length}/{needed}
                          </span>
                          {isAutoFill && (
                            <div className="text-[9px] text-blue-400 leading-tight animate-pulse">đang lấy…</div>
                          )}
                          {isOptional && !isDone && !isAutoFill && (
                            <div className="text-[9px] text-amber-500 leading-tight">tùy chọn</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Barcodes đã gán */}
                  {assigned.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pl-6">
                      {assigned.map(bc => (
                        <span key={bc}
                          onClick={e => { e.stopPropagation(); toggleBarcode(bc) }}
                          className="font-mono bg-green-100 border border-green-300 text-green-800 rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                          title="Click để bỏ gán">
                          {bc} ×
                        </span>
                      ))}
                    </div>
                  )}
                  {isFocused && !isDone && (
                    <div className="mt-1 pl-6 text-[10px] text-indigo-500">
                      → Chọn {needed - assigned.length} mã từ bảng kho bên phải
                    </div>
                  )}
                </div>
              )
            })}

            {/* Nút xác nhận */}
            {allDone && (
              <button onClick={confirmInline} disabled={confirming}
                className="w-full mt-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                {confirming ? '⏳ Đang xử lý…' : '✅ Xác nhận → Chuyển sang Đang xử lý'}
              </button>
            )}
          </div>

          {/* ══ BẢNG PHẢI: Thiết bị trong kho CRM ══ */}
          <div className="p-3 space-y-2">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              🏭 Kho CRM — {selectedWhName} ({crmProducts.reduce((a, p) => a + p.barcodes.length, 0)} thiết bị)
            </div>
            <input
              value={crmSearch} onChange={e => setCrmSearch(e.target.value)}
              placeholder="🔍 Lọc theo tên sản phẩm CRM…"
              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            {filteredCrm.length === 0 && (
              <div className="text-xs text-gray-400 text-center py-4">Không có thiết bị trong kho</div>
            )}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filteredCrm.map(product => {
                const kindLabel = product.stockupKind === -1 ? 'GPS/Tracker'
                  : product.stockupKind === 0 ? 'Thiết bị'
                  : product.stockupKind === 2 ? 'Phụ kiện'
                  : product.stockupKind === 3 ? 'SIM' : `Kind ${product.stockupKind}`
                const kindColor = product.stockupKind === -1 ? 'bg-blue-100 text-blue-700'
                  : product.stockupKind === 0 ? 'bg-purple-100 text-purple-700'
                  : product.stockupKind === 2 ? 'bg-orange-100 text-orange-700'
                  : product.stockupKind === 3 ? 'bg-pink-100 text-pink-700'
                  : 'bg-gray-100 text-gray-600'

                return (
                  <div key={product.productName} className="bg-white border border-gray-200 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${kindColor}`}>{kindLabel}</span>
                      <span className="text-xs font-semibold text-gray-700 flex-1">{product.productName}</span>
                      <span className="text-[10px] text-gray-400">{product.barcodes.length} cái</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {product.barcodes.map(bc => {
                        const assignedTo  = barcodeAssignedTo(bc)
                        const isAssigned  = !!assignedTo
                        const isMine      = assignedTo === focusedItemId
                        const focusedItem = focusedItemId ? order.giao_hang_don_items.find(i => i.id === focusedItemId) : null
                        const canPick     = !isAssigned && !!focusedItemId && !isPhysicalOnlyAccessory(focusedItem?.device_name ?? '')
                          && (assignments[focusedItemId ?? '']?.length ?? 0) < (focusedItem?.quantity ?? 0)

                        // Tên item đang chiếm barcode này (hiện tooltip)
                        const ownerName = isAssigned
                          ? order.giao_hang_don_items.find(i => i.id === assignedTo)?.device_name ?? ''
                          : ''

                        return (
                          <button key={bc}
                            onClick={() => canPick || isMine ? toggleBarcode(bc) : undefined}
                            disabled={isAssigned && !isMine}
                            title={isMine ? 'Click để bỏ gán' : isAssigned ? `Đã gán cho: ${ownerName}` : focusedItemId ? 'Click để gán' : 'Chọn thiết bị bên trái trước'}
                            className={`font-mono rounded px-1.5 py-0.5 border text-[10px] transition-all ${
                              isMine
                                ? 'bg-indigo-100 border-indigo-400 text-indigo-800 font-bold cursor-pointer hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                                : isAssigned
                                  ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed line-through'
                                  : canPick
                                    ? 'bg-white border-gray-300 text-gray-700 cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700'
                                    : 'bg-white border-gray-200 text-gray-500 cursor-default'
                            }`}>
                            {bc}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

function TabWarehouseQueue() {
  const [whcId,        setWhcId]        = useState<number>(2)
  const [whList,       setWhList]       = useState<WhItem[]>([])
  const [whId,         setWhId]         = useState<number | null>(null)
  const [loadingWh,    setLoadingWh]    = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [products,     setProducts]     = useState<WqProd[]>([])
  const [devices,      setDevices]      = useState<WqDevice[]>([])
  const [pendingOrders,setPendingOrders]= useState<DonHang[]>([])
  const [checkedAt,    setCheckedAt]    = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [openKinds,    setOpenKinds]    = useState<Set<number>>(new Set([-1, 0, 2, 3]))
  const [confirming,   setConfirming]   = useState<string | null>(null)   // orderId
  const [confirmed,    setConfirmed]    = useState<Set<string>>(new Set())

  // Load danh sách kho khi đổi WHC
  const loadWarehouses = useCallback(async (wid: number) => {
    setLoadingWh(true); setWhList([]); setWhId(null)
    setProducts([]); setDevices([]); setCheckedAt(null); setError(null)
    try {
      const r = await fetch(`/api/giao-hang/warehouse-list?whc_id=${wid}`)
      const d = await r.json()
      if (d.ok && Array.isArray(d.warehouses)) {
        const list: WhItem[] = d.warehouses
        setWhList(list)
        const first = list.find(w => w.whSort === 1) ?? list[0]
        if (first) setWhId(first.whId)
      } else {
        setError(d.error ?? 'Không lấy được danh sách kho')
      }
    } catch (e) { setError(String(e)) }
    finally { setLoadingWh(false) }
  }, [])

  useEffect(() => { loadWarehouses(whcId) }, [whcId, loadWarehouses])

  async function doCheck() {
    if (!whId) { setError('Chọn kho trước'); return }
    setLoading(true); setError(null); setProducts([]); setDevices([])
    try {
      // Load CRM queue + pending orders song song
      const [qRes, ordRes] = await Promise.all([
        fetch(`/api/giao-hang/warehouse-queue?whc_id=${whcId}&wh_id=${whId}`).then(r => r.json()),
        fetch('/api/giao-hang/don-hang?mine=0&limit=100').then(r => r.json()),
      ])
      if (!qRes.ok) { setError(qRes.error ?? 'Lỗi CRM'); return }
      setProducts(qRes.products ?? [])
      setDevices(qRes.devices   ?? [])
      // Chỉ lấy đơn chưa gửi / đang xử lý
      const pending = (ordRes.orders ?? []).filter((o: DonHang) =>
        o.status === 'cho_xu_ly' || o.status === 'dang_xu_ly'
      )
      setPendingOrders(pending)
      setCheckedAt(new Date().toLocaleTimeString('vi-VN'))
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  function toggleKind(k: number) {
    setOpenKinds(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s })
  }

  // ── So khớp CRM devices với đơn hàng ──────────────────────────────────────
  const orderMatches: OrderMatch[] = (() => {
    if (!devices.length || !pendingOrders.length) return []
    // Tạo pool: productName (lower) → [barcodes] (có thể dùng)
    const pool: Record<string, string[]> = {}
    for (const dev of devices) {
      const bc = dev.barcode || dev.carUnicode
      if (!bc) continue
      const key = dev.productName.toLowerCase()
      ;(pool[key] ??= []).push(bc)
    }
    const usedBarcodes = new Set<string>()

    return pendingOrders.map(order => {
      const items: OrderItemMatch[] = order.giao_hang_don_items.map(item => {
        // Tìm key trong pool khớp với device_name
        const matchKey = Object.keys(pool).find(k => deviceNamesMatch(item.device_name, k))
        const available = matchKey ? pool[matchKey].filter(b => !usedBarcodes.has(b)).length : 0
        // Gán barcodes chưa dùng
        let assigned: string[] = []
        if (matchKey) {
          assigned = pool[matchKey]
            .filter(b => !usedBarcodes.has(b))
            .slice(0, item.quantity)
          assigned.forEach(b => usedBarcodes.add(b))
        }
        return { itemId: item.id, deviceName: item.device_name, quantity: item.quantity, assigned, available, matched: assigned.length === item.quantity }
      })
      return { order, items, allMatched: items.every(i => i.matched || i.available === 0) }
    }).filter(m => m.items.some(i => i.available > 0))
  })()

  // ── Xác nhận gửi đơn — tự điền IMEI từ CRM ───────────────────────────────
  async function confirmOrder(match: OrderMatch) {
    setConfirming(match.order.id)
    try {
      const item_serials = match.items.map(i => ({ item_id: i.itemId, serials: i.assigned }))
      // Xác nhận IMEI → chuyển sang Đang xử lý (da_gui là bước tiếp theo khi thực sự gửi hàng)
      const res = await fetch('/api/giao-hang/don-hang', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: match.order.id, status: 'dang_xu_ly', item_serials }),
      })
      if (res.ok) setConfirmed(prev => new Set([...prev, match.order.id]))
      else {
        const d = await res.json()
        setError(d.error ?? 'Lỗi khi xác nhận')
      }
    } catch (e) { setError(String(e)) }
    finally { setConfirming(null) }
  }

  const totalWait = products.reduce((a, p) => a + p.waitCount, 0)
  const devByKind: Record<number, WqDevice[]> = {}
  const prodByKind: Record<number, WqProd[]>  = {}
  for (const d of devices)  { (devByKind[d.stockupKind]  ??= []).push(d) }
  for (const p of products) { (prodByKind[p.stockupKind] ??= []).push(p) }
  const usedKinds = [...new Set(products.map(p => p.stockupKind))].sort((a,b) => a - b)

  const whcName = WHC_LIST.find(w => w.id === whcId)?.label ?? `WHC ${whcId}`
  const whName  = whList.find(w => w.whId === whId)?.whName ?? (whId ? `WH ${whId}` : '—')

  const sortLabels: Record<number, string> = { 1: 'Kho chính', 2: 'Kỹ thuật viên', 3: 'Sales / Customer' }
  const groupedWh = whList.reduce<Record<number, WhItem[]>>((acc, w) => {
    (acc[w.whSort] ??= []).push(w); return acc
  }, {})

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-gray-700">Kiểm tra hàng chờ · Warehouse Queue</div>
        <div className="text-xs text-gray-400 mt-0.5">Xem IMEI thiết bị chờ nhận, so sánh với đơn hàng và xác nhận gửi</div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Kho tổng · WHC</label>
            <select value={whcId} onChange={e => setWhcId(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none">
              {WHC_LIST.map(c => (
                <option key={c.id} value={c.id}>[{c.id}] {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Kho con · Warehouse {loadingWh && <span className="text-gray-400">(đang tải…)</span>}
            </label>
            <select value={whId ?? ''} onChange={e => setWhId(Number(e.target.value))}
              disabled={loadingWh || whList.length === 0}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none disabled:opacity-50">
              {whList.length === 0 && <option value="">—</option>}
              {Object.entries(groupedWh).sort(([a],[b]) => Number(a)-Number(b)).map(([sort, items]) => (
                <optgroup key={sort} label={sortLabels[Number(sort)] ?? `Nhóm ${sort}`}>
                  {items.map(w => <option key={w.whId} value={w.whId}>[{w.whId}] {w.whName}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button onClick={doCheck} disabled={loading || loadingWh || !whId}
            className="py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
            {loading ? '⏳ Đang kiểm tra…' : '🔍 Kiểm tra'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>}

      {checkedAt && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-bold text-indigo-700 text-lg">{totalWait}</span>
              <span className="text-indigo-500 ml-1">thiết bị chờ · waiting</span>
            </div>
            {orderMatches.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm">
                <span className="font-bold text-green-700 text-lg">{orderMatches.length}</span>
                <span className="text-green-500 ml-1">đơn có thể khớp · matched orders</span>
              </div>
            )}
            <div className="text-xs text-gray-400">
              {whcName} · <span className="font-medium text-gray-600">{whName}</span> · {checkedAt}
            </div>
            <button onClick={doCheck} disabled={loading}
              className="ml-auto px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
              🔄 Làm mới
            </button>
          </div>

          {/* ── SECTION 1: So khớp với đơn hàng ────────────────────────────── */}
          {orderMatches.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                So sánh với đơn hàng đang xử lý · Order Matching
              </div>
              {orderMatches.map(match => {
                const isDone = confirmed.has(match.order.id)
                const isConfirming = confirming === match.order.id
                return (
                  <div key={match.order.id}
                    className={`bg-white border rounded-xl p-4 space-y-3 ${isDone ? 'border-green-300 opacity-60' : 'border-gray-200'}`}>
                    {/* Order header */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="font-semibold text-gray-800 text-sm">{match.order.order_code}</span>
                        <span className="ml-2 text-xs text-gray-400">{match.order.office}</span>
                        {match.order.recipient_info && (
                          <span className="ml-2 text-xs text-gray-400">→ {match.order.recipient_info}</span>
                        )}
                      </div>
                      {isDone ? (
                        <span className="text-green-600 text-xs font-semibold">✅ Đã xác nhận gửi</span>
                      ) : (
                        <button
                          onClick={() => confirmOrder(match)}
                          disabled={isConfirming || !match.items.some(i => i.assigned.length > 0)}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
                          {isConfirming ? '⏳ Đang xử lý…' : '✅ Xác nhận IMEI → Đang xử lý'}
                        </button>
                      )}
                    </div>

                    {/* Item matches */}
                    <div className="space-y-2">
                      {match.items.map(item => (
                        <div key={item.itemId} className="text-xs space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-700">{item.deviceName}</span>
                            <span className="text-gray-400">× {item.quantity}</span>
                            {item.assigned.length === item.quantity ? (
                              <span className="text-green-600 font-semibold">✅ Đủ {item.quantity} IMEI</span>
                            ) : item.assigned.length > 0 ? (
                              <span className="text-amber-600 font-semibold">⚠️ {item.assigned.length}/{item.quantity} IMEI</span>
                            ) : (
                              <span className="text-gray-400 italic">Không tìm thấy trong kho</span>
                            )}
                          </div>
                          {item.assigned.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-2">
                              {item.assigned.map(bc => (
                                <span key={bc}
                                  className="font-mono bg-green-50 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                                  {bc}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── SECTION 2: Danh sách đầy đủ từ CRM ─────────────────────────── */}
          {totalWait > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Danh sách IMEI từ CRM · All Waiting Devices
              </div>
              {usedKinds.map(kind => {
                const kProds = prodByKind[kind] ?? []
                const kDevs  = devByKind[kind]  ?? []
                const kWait  = kProds.reduce((a, p) => a + p.waitCount, 0)
                const isOpen = openKinds.has(kind)
                return (
                  <div key={kind} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button onClick={() => toggleKind(kind)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{KIND_LABEL[kind] ?? `Kind ${kind}`}</span>
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{kWait} chờ</span>
                      </div>
                      <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {kProds.map(prod => {
                          const pDevs = kDevs.filter(d => d.productNumber === prod.productNumber)
                          return (
                            <div key={prod.productNumber} className="px-4 py-3 space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                  <span className="text-sm font-semibold text-gray-800">{prod.productName}</span>
                                  <span className="ml-1.5 text-xs text-gray-400">#{prod.productNumber}</span>
                                </div>
                                <div className="flex gap-1.5 text-xs">
                                  <span className="bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">⏳ {prod.waitCount}</span>
                                  {prod.transCount > 0 && <span className="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">🔄 {prod.transCount}</span>}
                                </div>
                              </div>
                              {pDevs.length > 0 ? (
                                <div className="space-y-1">
                                  {pDevs.map((dev, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5 flex-wrap">
                                      <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-800 font-semibold select-all">
                                        {dev.barcode || dev.carUnicode || '—'}
                                      </span>
                                      {dev.status === 'TRANS'
                                        ? <span className="text-blue-600">🔄 Đang chuyển</span>
                                        : <span className="text-amber-600">⏳ Chờ nhận</span>}
                                      {dev.sourceStock && <span className="text-gray-400">{dev.sourceStock} → {dev.destStock || '?'}</span>}
                                      {dev.updateMan && <span className="text-gray-400 ml-auto">{dev.updateMan}</span>}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400 italic pl-1">Không lấy được barcode chi tiết</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {totalWait === 0 && (
            <div className="text-center text-gray-400 py-12 text-sm">✅ Không có thiết bị chờ nhận · No items waiting</div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
type Tab = 'dat_hang' | 'my_orders' | 'all_orders' | 'lich_su' | 'combos' | 'recipients'

export default function GiaoHangDashboard({ userEmail, isAdmin }: { userEmail: string; isAdmin: boolean }) {
  const isKho = isKhoUser(userEmail)
  const [tab, setTab] = useState<Tab>('dat_hang')

  const TABS = [
    { key: 'dat_hang',   label: '🛒 Đặt hàng' },
    { key: 'my_orders',  label: '📋 Đơn của tôi' },
    { key: 'all_orders', label: '📊 Tất cả đơn' },
    { key: 'lich_su',    label: '📋 Lịch sử Sheet' },
    { key: 'combos',     label: '📦 Gói combo' },
    { key: 'recipients', label: '👤 Người nhận' },
  ]

  return (
    <div className="w-full px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">🚚 Giao nhận thiết bị</h1>
        <div className="text-xs text-gray-400">{userEmail}</div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — dat_hang dùng full width, tab khác giữ max-w */}
      {tab === 'dat_hang' ? (
        <TabDatHang userEmail={userEmail} />
      ) : (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 min-h-[400px] w-full">
          {tab === 'my_orders'  && <TabMyOrders userEmail={userEmail} isKho={isKho} />}
          {tab === 'all_orders' && <TabAllOrders isKho={isKho} />}
          {tab === 'lich_su'    && <TabLichSuSheet />}
          {tab === 'combos'     && <TabCombos isKho={isKho} />}
          {tab === 'recipients' && <TabRecipients />}
        </div>
      )}
    </div>
  )
}