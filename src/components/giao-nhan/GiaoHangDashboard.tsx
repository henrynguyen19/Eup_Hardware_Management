"use client"

import { useEffect, useState, useCallback, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Equipment   { equipment_id: string; name: string; device_type?: string; category?: string }
interface ComboItem   { device_name: string; quantity: number; notes?: string; sort_order?: number }
interface Combo       { id: string; name: string; description?: string; device_combo_items: ComboItem[] }
interface Recipient   { id: string; name: string; type: string; office?: string; address?: string; phone?: string; contact_name?: string; notes?: string }
interface CartItem    { device_name: string; quantity: number; customer_codes: string[]; expected_receipt: string }
interface DonItem     { id: string; device_name: string; quantity: number; customer_codes?: string[]; expected_receipt?: string; sheet_row?: number; device_serials?: string[] }
interface DonHang {
  id: string; order_code: string; orderer_email: string; orderer_name: string
  office: string; expected_date?: string; expected_ship_date?: string; recipient_info?: string; notes?: string
  status: string; created_at: string; giao_hang_don_items: DonItem[]
  status_updated_by?: string; status_updated_at?: string
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
// DEVICE PICKER (manual)
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

  function qty(name: string, delta: number) {
    onChange(cart.map(c => c.device_name === name ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c))
  }

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Đang tải thiết bị…</div>

  return (
    <div className="space-y-3">
      {/* Popular chips */}
      {popularNames.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1.5">⭐ Thường đặt</div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {popularNames.map(name => {
              const active = cart.some(c => c.device_name === name)
              const toggleByName = () => {
                if (active) onChange(cart.filter(c => c.device_name !== name))
                else onChange([...cart, { device_name: name, quantity: 1, customer_codes: [], expected_receipt: '' }])
              }
              return (
                <button key={name} onClick={toggleByName}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                  }`}>
                  {name}
                  {active && <span className="ml-1 opacity-70">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              activeType === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        placeholder="Tìm thiết bị…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Device grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
        {filtered().map(dev => {
          const active = cart.some(c => c.device_name === dev.name)
          const ts = typeStyle(dev.device_type)
          return (
            <button key={dev.equipment_id} onClick={() => toggle(dev.name)}
              className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                active ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-300'
              }`}>
              <span className="text-base mb-1">{ts.icon}</span>
              <span className="text-xs font-medium leading-tight">{dev.name}</span>
              {dev.device_type && (
                <span className={`mt-1 px-1.5 py-0.5 rounded-full text-[10px] border ${ts.color}`}>{ts.label}</span>
              )}
              {active && <span className="mt-1 text-[10px] text-indigo-600 font-semibold">✓ Đã chọn</span>}
            </button>
          )
        })}
        {filtered().length === 0 && (
          <div className="col-span-3 text-center py-6 text-gray-400 text-sm">Không có thiết bị phù hợp</div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COMBO PICKER — quick-add preset packages
// ══════════════════════════════════════════════════════════════════════════════
function ComboPicker({ cart, onChange }: { cart: CartItem[]; onChange: (c: CartItem[]) => void }) {
  const [combos, setCombos]   = useState<Combo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/giao-hang/combos').then(r => r.json())
      .then(d => setCombos(d.combos ?? []))
      .finally(() => setLoading(false))
  }, [])

  function addCombo(combo: Combo) {
    let updated = [...cart]
    for (const item of combo.device_combo_items) {
      const idx = updated.findIndex(c => c.device_name === item.device_name)
      if (idx >= 0) updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + item.quantity }
      else updated.push({ device_name: item.device_name, quantity: item.quantity, customer_codes: [], expected_receipt: '' })
    }
    onChange(updated)
  }

  if (loading) return <div className="text-xs text-gray-400 py-2">Đang tải gói…</div>
  if (combos.length === 0) return <div className="text-xs text-gray-400 py-2">Chưa có gói combo nào</div>

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-500 mb-1">📦 Gói combo</div>
      <div className="flex flex-wrap gap-2">
        {combos.map(combo => (
          <button key={combo.id} onClick={() => addCombo(combo)}
            className="group flex flex-col items-start p-2.5 bg-white border border-amber-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 text-left transition-all min-w-[140px] max-w-[200px]">
            <div className="font-medium text-sm text-amber-800">📦 {combo.name}</div>
            {combo.description && <div className="text-xs text-gray-500 mt-0.5">{combo.description}</div>}
            <div className="mt-1 flex flex-wrap gap-1">
              {combo.device_combo_items.map((item, i) => (
                <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-[10px]">
                  {item.device_name} ×{item.quantity}
                </span>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-amber-600 group-hover:text-amber-800 font-medium">+ Thêm vào đơn</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CART — list of selected items with qty, codes, receipt date
// ══════════════════════════════════════════════════════════════════════════════
function CartList({ cart, onChange }: { cart: CartItem[]; onChange: (c: CartItem[]) => void }) {
  if (cart.length === 0) return (
    <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
      Chưa chọn thiết bị nào
    </div>
  )

  function update(idx: number, patch: Partial<CartItem>) {
    const next = cart.map((item, i) => i === idx ? { ...item, ...patch } : item)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {cart.map((item, idx) => (
        <div key={item.device_name} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm text-gray-800 flex items-center gap-1.5">
              <span>{typeStyle(undefined).icon}</span>
              {item.device_name}
            </div>
            <div className="flex items-center gap-2">
              {/* Qty */}
              <div className="flex items-center gap-1 bg-gray-50 rounded-lg border px-1">
                <button onClick={() => update(idx, { quantity: Math.max(1, item.quantity - 1) })}
                  className="w-6 h-6 text-gray-500 hover:text-gray-800 text-sm font-bold">−</button>
                <input type="number" min={1}
                  className="w-10 text-center text-sm bg-transparent focus:outline-none"
                  value={item.quantity}
                  onChange={e => update(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                />
                <button onClick={() => update(idx, { quantity: item.quantity + 1 })}
                  className="w-6 h-6 text-gray-500 hover:text-gray-800 text-sm font-bold">+</button>
              </div>
              <button onClick={() => onChange(cart.filter((_, i) => i !== idx))}
                className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
            </div>
          </div>

          {/* Mã KH */}
          <div>
            <div className="text-xs text-gray-500 font-medium">🏷️ Mã khách hàng</div>
            <CustomerCodeInput codes={item.customer_codes} onChange={c => update(idx, { customer_codes: c })} />
          </div>

          {/* Expected receipt */}
          <div>
            <label className="text-xs text-gray-500 font-medium">📅 Ngày dự kiến nhận</label>
            <input type="date"
              className="mt-0.5 block w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
              value={item.expected_receipt}
              onChange={e => update(idx, { expected_receipt: e.target.value })}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — ĐẶT HÀNG
// ══════════════════════════════════════════════════════════════════════════════
function TabDatHang({ userEmail }: { userEmail: string }) {
  const [cart, setCart]               = useState<CartItem[]>([])
  const [devices, setDevices]         = useState<Equipment[]>([])
  const [popular, setPopular]         = useState<Record<string, number>>({})
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [recipients, setRecipients]   = useState<Recipient[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [recipientInfo, setRecipientInfo] = useState('')
  const [ordererName, setOrdererName] = useState('')
  const [office, setOffice]           = useState('')
  const [expectedDate, setExpectedDate]     = useState('')
  const [expectedShipDate, setExpectedShipDate] = useState('')
  const [notes, setNotes]             = useState('')
  const [step, setStep]               = useState<'combo'|'device'|'cart'>('combo')
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    // Load all data on mount — don't wait for user to click
    Promise.all([
      fetch('/api/kho/equipment').then(r => r.json()).then(d => setDevices(d.data ?? [])),
      fetch('/api/giao-hang/popular').then(r => r.json()).then(d => setPopular(d.data ?? {})),
      fetch('/api/giao-hang/recipients').then(r => r.json()).then(d => setRecipients(d.recipients ?? [])),
    ]).finally(() => setLoadingDevices(false))
  }, [])

  function handleRecipientChange(id: string) {
    setRecipientId(id)
    if (!id) { setRecipientInfo(''); return }
    const r = recipients.find(x => x.id === id)
    if (r) {
      const parts = [r.name]
      if (r.address) parts.push(r.address)
      if (r.phone)   parts.push(r.phone)
      setRecipientInfo(parts.join(' — '))
    }
  }

  async function submit() {
    if (cart.length === 0) { setResult({ ok: false, msg: 'Chưa chọn thiết bị nào' }); return }
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
          items: cart.map(c => ({
            device_name:      c.device_name,
            quantity:         c.quantity,
            customer_codes:   c.customer_codes,
            expected_receipt: c.expected_receipt || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, msg: `Đặt hàng thành công! Mã: ${data.order_code}` })
        setCart([]); setOrdererName(''); setOffice(''); setExpectedDate(''); setExpectedShipDate('')
        setNotes(''); setRecipientId(''); setRecipientInfo(''); setStep('combo')
      } else {
        setResult({ ok: false, msg: data.error ?? 'Lỗi đặt hàng' })
      }
    } finally { setSubmitting(false) }
  }

  const offices = [...new Set(recipients.filter(r => r.type === 'office').map(r => r.office ?? r.name))]

  return (
    <div className="space-y-4">
      {/* Step tabs */}
      <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border">
        {([['combo','📦 Gói combo'],['device','🔍 Chọn thiết bị'],['cart','🛒 Giỏ hàng']] as const).map(([s, label]) => (
          <button key={s} onClick={() => setStep(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              step === s ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {label} {s === 'cart' && cart.length > 0 && <span className="ml-1 bg-indigo-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">{cart.length}</span>}
          </button>
        ))}
      </div>

      {step === 'combo'  && <ComboPicker cart={cart} onChange={setCart} />}
      {step === 'device' && <DevicePicker cart={cart} onChange={setCart} devices={devices} popular={popular} loading={loadingDevices} />}
      {step === 'cart'   && <CartList cart={cart} onChange={setCart} />}

      {/* SIM warning */}
      <SimWarning cart={cart} devices={devices} />

      {/* Order details */}
      <div className="bg-gray-50 rounded-xl border p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">📋 Thông tin đơn hàng</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Orderer name */}
          <div>
            <label className="text-xs text-gray-600 font-medium">Người đặt</label>
            <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
              placeholder="Tên người đặt hàng"
              value={ordererName} onChange={e => setOrdererName(e.target.value)} />
          </div>

          {/* Office */}
          <div>
            <label className="text-xs text-gray-600 font-medium">Văn phòng</label>
            <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
              placeholder="VD: Hà Nội, HCM…"
              list="office-list"
              value={office} onChange={e => setOffice(e.target.value)} />
            <datalist id="office-list">
              {offices.map(o => <option key={o} value={o} />)}
            </datalist>
          </div>

          {/* Expected delivery date */}
          <div>
            <label className="text-xs text-gray-600 font-medium">📅 Ngày giao dự kiến</label>
            <input type="date" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
              value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </div>

          {/* Expected ship date */}
          <div>
            <label className="text-xs text-gray-600 font-medium">🚚 Ngày gửi dự kiến</label>
            <input type="date" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
              value={expectedShipDate} onChange={e => setExpectedShipDate(e.target.value)} />
          </div>
        </div>

        {/* Recipient selector */}
        <div>
          <label className="text-xs text-gray-600 font-medium">👤 Người nhận</label>
          <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
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
          {/* Manual override */}
          <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300 text-gray-600"
            placeholder="Hoặc nhập thủ công: tên — địa chỉ — SĐT"
            value={recipientInfo} onChange={e => setRecipientInfo(e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-gray-600 font-medium">Ghi chú</label>
          <textarea rows={2}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
            placeholder="Ghi chú thêm…"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      {result && (
        <div className={`p-3 rounded-xl text-sm ${result.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {result.msg}
        </div>
      )}

      <button onClick={submit} disabled={submitting || cart.length === 0}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
        {submitting ? 'Đang gửi…' : `🛒 Đặt hàng (${cart.length} loại)`}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — ĐƠN CỦA TÔI
// ══════════════════════════════════════════════════════════════════════════════
function TabMyOrders({ userEmail }: { userEmail: string }) {
  const [orders, setOrders]   = useState<DonHang[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/giao-hang/don-hang').then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

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
              {o.giao_hang_don_items.map(item => (
                <div key={item.id} className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{item.device_name}</div>
                    {item.customer_codes && item.customer_codes.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {item.customer_codes.map(c => (
                          <span key={c} className="bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-1.5 py-0.5 text-[10px]">{c}</span>
                        ))}
                      </div>
                    )}
                    {item.expected_receipt && (
                      <div className="text-xs text-gray-500 mt-0.5">Nhận: {item.expected_receipt}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-gray-700">×{item.quantity}</div>
                </div>
              ))}
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
            </div>
          )}
        </div>
      ))}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// SERIAL INPUT MODAL — nhập mã thiết bị khi chuyển trạng thái Đã gửi
// ══════════════════════════════════════════════════════════════════════════════
interface CrmCheckResult {
  stock?: { status: string; productName: string; sourceStock: string; destStock: string; updateMan: string; updateTime: string } | null
  components?: { Device_Code: string; Device_TypeName: string; QP_ProductKindName: string }[]
  grouped?: Record<string, { Device_Code: string; Device_TypeName: string }[]>
  stock_error?: string; car_error?: string
}

function SerialInputModal({ order, onConfirm, onCancel }: {
  order: DonHang
  onConfirm: (serials: { item_id: string; serials: string[] }[]) => void
  onCancel: () => void
}) {
  const [itemSerials, setItemSerials] = useState<Record<string, string[]>>(
    Object.fromEntries(order.giao_hang_don_items.map(i => [i.id, i.device_serials ?? []]))
  )
  const [noSerial, setNoSerial] = useState<Record<string, boolean>>(
    Object.fromEntries(order.giao_hang_don_items.map(i => [i.id, (i.device_serials ?? []).length === 0]))
  )
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(order.giao_hang_don_items.map(i => [i.id, '']))
  )
  // CRM check state
  const [crmUnicode, setCrmUnicode] = useState('')
  const [crmResult, setCrmResult]   = useState<CrmCheckResult | null>(null)
  const [crmLoading, setCrmLoading] = useState(false)
  const [crmError, setCrmError]     = useState('')

  async function checkCRM() {
    const u = crmUnicode.trim()
    if (!u) return
    setCrmLoading(true); setCrmResult(null); setCrmError('')
    try {
      const res = await fetch(`/api/giao-hang/crm-check?unicode=${encodeURIComponent(u)}`)
      const d = await res.json()
      if (d.ok) setCrmResult(d)
      else setCrmError(d.error ?? 'Lỗi kiểm tra CRM')
    } catch { setCrmError('Lỗi kết nối') }
    finally { setCrmLoading(false) }
  }

  // Auto-fill serials from CRM result
  function fillFromCRM(itemId: string) {
    if (!crmResult?.components) return
    const codes = crmResult.components.map(c => c.Device_Code).filter(Boolean)
    setItemSerials(s => ({ ...s, [itemId]: codes }))
    setNoSerial(n => ({ ...n, [itemId]: false }))
  }

  function addSerial(itemId: string) {
    const v = drafts[itemId]?.trim()
    if (!v) return
    if (!itemSerials[itemId]?.includes(v)) {
      setItemSerials(s => ({ ...s, [itemId]: [...(s[itemId] ?? []), v] }))
    }
    setDrafts(d => ({ ...d, [itemId]: '' }))
  }

  function removeSerial(itemId: string, serial: string) {
    setItemSerials(s => ({ ...s, [itemId]: s[itemId].filter(x => x !== serial) }))
  }

  function toggleNoSerial(itemId: string, checked: boolean) {
    setNoSerial(n => ({ ...n, [itemId]: checked }))
    if (checked) setItemSerials(s => ({ ...s, [itemId]: [] }))
  }

  function confirm() {
    const result = order.giao_hang_don_items.map(item => ({
      item_id: item.id,
      serials: noSerial[item.id] ? [] : (itemSerials[item.id] ?? []),
    }))
    onConfirm(result)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <div className="font-semibold text-gray-800 text-base">📦 Nhập mã thiết bị — {order.order_code}</div>
        <div className="text-xs text-gray-500">Nhập mã serial/IMEI cho từng loại thiết bị trước khi gửi</div>

        {/* CRM check panel */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-600">🔍 Kiểm tra CRM theo Unicode</div>
          <div className="flex gap-1">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Nhập unicode thiết bị (VD: 30052739)"
              value={crmUnicode}
              onChange={e => setCrmUnicode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkCRM() } }}
            />
            <button onClick={checkCRM} disabled={crmLoading}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50">
              {crmLoading ? '…' : 'Kiểm tra'}
            </button>
          </div>
          {crmError && <div className="text-xs text-red-500">{crmError}</div>}
          {crmResult && (
            <div className="space-y-1.5">
              {crmResult.stock && (
                <div className="text-xs bg-white border rounded-lg p-2 space-y-0.5">
                  <div className="font-medium text-gray-700">{crmResult.stock.productName}</div>
                  <div className="text-gray-500">
                    Kho: <span className="font-medium text-gray-700">{crmResult.stock.sourceStock || crmResult.stock.destStock || '—'}</span>
                    {' · '}Trạng thái: <span className={`font-medium ${crmResult.stock.status === 'HAVE' ? 'text-green-600' : 'text-red-500'}`}>{crmResult.stock.status}</span>
                    {crmResult.stock.updateMan && <>{' · '}{crmResult.stock.updateMan} · {crmResult.stock.updateTime}</>}
                  </div>
                </div>
              )}
              {crmResult.grouped && Object.keys(crmResult.grouped).length > 0 && (
                <div className="bg-white border rounded-lg p-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">Linh kiện đi kèm:</div>
                  <div className="space-y-0.5">
                    {Object.entries(crmResult.grouped).map(([kind, items]) => (
                      <div key={kind} className="flex items-start gap-2 text-xs">
                        <span className="text-gray-400 min-w-[80px] shrink-0">{kind}</span>
                        <div className="flex flex-wrap gap-1">
                          {items.map(item => (
                            <span key={item.Device_Code} className="bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5">
                              {item.Device_Code}
                              {item.Device_TypeName && <span className="text-gray-400 ml-1">({item.Device_TypeName})</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => order.giao_hang_don_items.forEach(i => fillFromCRM(i.id))}
                    className="mt-2 w-full py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs hover:bg-indigo-100">
                    📋 Điền tất cả mã vào đơn
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {order.giao_hang_don_items.map(item => (
          <div key={item.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm text-gray-800">{item.device_name} <span className="text-gray-400 font-normal">×{item.quantity}</span></div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" className="rounded"
                  checked={noSerial[item.id] ?? false}
                  onChange={e => toggleNoSerial(item.id, e.target.checked)} />
                Không có mã
              </label>
            </div>

            {!noSerial[item.id] && (
              <>
                <div className="flex flex-wrap gap-1">
                  {(itemSerials[item.id] ?? []).map(s => (
                    <span key={s} className="inline-flex items-center gap-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 text-xs">
                      {s}
                      <button onClick={() => removeSerial(item.id, s)} className="ml-0.5 text-violet-400 hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="Nhập mã serial/IMEI rồi nhấn Enter"
                    value={drafts[item.id] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSerial(item.id) } }}
                  />
                  <button onClick={() => addSerial(item.id)}
                    className="px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-xs hover:bg-violet-100">+</button>
                </div>
              </>
            )}
          </div>
        ))}

        <div className="flex gap-2 pt-1">
          <button onClick={confirm}
            className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold">
            ✅ Xác nhận gửi hàng
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
function printLabel(order: DonHang) {
  const items = order.giao_hang_don_items
  const dateStr = new Date().toLocaleDateString('vi-VN')
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Nhãn đơn hàng ${order.order_code}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 20px; }
  .label { border: 2px solid #111; padding: 16px; max-width: 420px; }
  .header { text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 10px; }
  .order-code { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .meta { font-size: 11px; color: #555; margin-top: 4px; }
  .section { margin-bottom: 10px; }
  .section-title { font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 4px; border-bottom: 1px dashed #ddd; padding-bottom: 2px; }
  .recipient-name { font-size: 16px; font-weight: bold; }
  .recipient-info { font-size: 12px; color: #333; margin-top: 3px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f5f5f5; text-align: left; padding: 4px 6px; font-weight: 600; border: 1px solid #ddd; }
  td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; }
  .serials { font-size: 10px; color: #555; margin-top: 2px; }
  .footer { margin-top: 10px; font-size: 10px; color: #999; text-align: right; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="label">
  <div class="header">
    <div class="order-code">${order.order_code}</div>
    <div class="meta">Ngày in: ${dateStr} · Người đặt: ${order.orderer_name || order.orderer_email} · VP: ${order.office}</div>
  </div>

  <div class="section">
    <div class="section-title">Người nhận</div>
    ${order.recipient_info
      ? `<div class="recipient-name">${order.recipient_info.split('—')[0]?.trim() ?? ''}</div>
         <div class="recipient-info">${order.recipient_info.split('—').slice(1).join(' · ').trim()}</div>`
      : '<div class="recipient-info" style="color:#999">Chưa có thông tin người nhận</div>'
    }
  </div>

  <div class="section">
    <div class="section-title">Danh sách thiết bị</div>
    <table>
      <thead>
        <tr><th>Thiết bị</th><th>SL</th><th>Mã serial/IMEI</th></tr>
      </thead>
      <tbody>
        ${items.map(item => `
        <tr>
          <td>${item.device_name}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td>${
            item.device_serials && item.device_serials.length > 0
              ? item.device_serials.join('<br>')
              : '<span style="color:#999;font-size:10px">Không có mã</span>'
          }</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  ${order.expected_date ? `<div class="section"><div class="section-title">Ngày giao dự kiến</div><div>${order.expected_date}</div></div>` : ''}
  ${order.notes ? `<div class="section"><div class="section-title">Ghi chú</div><div>${order.notes}</div></div>` : ''}

  <div class="footer">In từ Eup Hardware Management · ${dateStr}</div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=500,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — TẤT CẢ ĐƠN (admin)
// ══════════════════════════════════════════════════════════════════════════════
function TabAllOrders() {
  const [orders, setOrders]   = useState<DonHang[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [serialModal, setSerialModal] = useState<DonHang | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ mine: '0' })
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    fetch(`/api/giao-hang/don-hang?${params}`).then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false))
  }, [search, statusFilter])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string, itemSerials?: { item_id: string; serials: string[] }[]) {
    await fetch('/api/giao-hang/don-hang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, item_serials: itemSerials }),
    })
    load()
  }

  function handleStatusClick(order: DonHang, status: string) {
    if (status === 'da_gui') {
      setSerialModal(order)
    } else {
      updateStatus(order.id, status)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="Tìm theo người đặt, mã đơn…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Tất cả TT</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Không có đơn hàng</div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50"
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                <div>
                  <div className="font-mono text-sm font-semibold text-indigo-700">{o.order_code}</div>
                  <div className="text-xs text-gray-500">
                    {o.orderer_name || o.orderer_email} · {o.office} · {new Date(o.created_at).toLocaleDateString('vi-VN')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={o.status} />
                  <span className="text-gray-400 text-sm">{expanded === o.id ? '▲' : '▼'}</span>
                </div>
              </button>
              {expanded === o.id && (
                <div className="border-t p-3 space-y-2">
                  {o.giao_hang_don_items.map(item => (
                    <div key={item.id} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium">{item.device_name}</div>
                        {item.customer_codes && item.customer_codes.length > 0 && (
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {item.customer_codes.map(c => (
                              <span key={c} className="bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-1.5 py-0.5 text-[10px]">{c}</span>
                            ))}
                          </div>
                        )}
                        {item.expected_receipt && <div className="text-xs text-gray-500">Nhận: {item.expected_receipt}</div>}
                      </div>
                      <div className="text-sm font-semibold">×{item.quantity}</div>
                    </div>
                  ))}
                  {o.recipient_info && <div className="text-xs text-gray-500">👤 {o.recipient_info}</div>}
                  {o.expected_ship_date && <div className="text-xs text-amber-600">🚚 Gửi: {o.expected_ship_date}</div>}
                  {o.notes && <div className="text-xs italic text-gray-500">📝 {o.notes}</div>}
                  {o.status_updated_by && (
                    <div className="text-xs text-gray-400 border-t border-gray-100 pt-1">
                      Cập nhật bởi <span className="font-medium text-gray-500">{o.status_updated_by}</span>
                      {o.status_updated_at && <> lúc {new Date(o.status_updated_at).toLocaleString('vi-VN')}</>}
                    </div>
                  )}
                  <div className="flex gap-1 flex-wrap pt-1 border-t border-gray-100">
                    <span className="text-[10px] text-gray-400 w-full mb-0.5">Cập nhật trạng thái:</span>
                    {VALID_STATUSES_UI.map(k => {
                      const cfg = STATUS_CONFIG[k]
                      const active = o.status === k
                      return (
                        <button key={k} onClick={() => handleStatusClick(o, k)} disabled={active}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            active ? `${cfg.badge} cursor-default opacity-80 ring-1 ring-offset-1 ring-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </button>
                      )
                    })}
                    <button onClick={() => printLabel(o)}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400">
                      🖨️ In đơn
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Serial input modal */}
      {serialModal && (
        <SerialInputModal
          order={serialModal}
          onConfirm={serials => {
            updateStatus(serialModal.id, 'da_gui', serials)
            setSerialModal(null)
          }}
          onCancel={() => setSerialModal(null)}
        />
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

function TabCombos() {
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
        <button onClick={openCreate}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors">
          + Tạo combo
        </button>
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
                <div className="flex gap-1 ml-2">
                  <button onClick={() => openEdit(combo)}
                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Sửa</button>
                  <button onClick={() => del(combo.id)}
                    className="px-2 py-1 text-xs border border-red-200 rounded-lg hover:bg-red-50 text-red-500">Xóa</button>
                </div>
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
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
type Tab = 'dat_hang' | 'my_orders' | 'all_orders' | 'lich_su' | 'combos' | 'recipients'

export default function GiaoHangDashboard({ userEmail, isAdmin }: { userEmail: string; isAdmin: boolean }) {
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
    <div className="max-w-3xl mx-auto p-4 space-y-4">
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

      {/* Tab content */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 min-h-[400px]">
        {tab === 'dat_hang'   && <TabDatHang userEmail={userEmail} />}
        {tab === 'my_orders'  && <TabMyOrders userEmail={userEmail} />}
        {tab === 'all_orders' && <TabAllOrders />}
        {tab === 'lich_su'    && <TabLichSuSheet />}
        {tab === 'combos'     && <TabCombos />}
        {tab === 'recipients' && <TabRecipients />}
      </div>
    </div>
  )
}
