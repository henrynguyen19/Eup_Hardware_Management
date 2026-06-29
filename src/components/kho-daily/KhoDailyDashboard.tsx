'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────
interface DeviceQty  { device: string; qty: number }
interface ThuHoiItem { loai: string; device: string; qty: number }
interface OtherTask  { task: string; device: string; qty: number }

interface KhoRecord {
  id: number
  person_name: string
  entry_date: string
  week_label: string
  thanh_pham_total: number
  hang_gui_vp_total: number
  xuat_kho_total: number
  thu_hoi_total: number
  other_total: number
  thanh_pham_devices?: DeviceQty[]
  hang_gui_vp_devices?: DeviceQty[]
  xuat_kho_devices?: DeviceQty[]
  thu_hoi_details?: ThuHoiItem[]
  other_tasks?: OtherTask[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
type DateRange = '7d' | '30d' | 'month' | 'custom'
const PERSONS = ['Kai', 'Thor', 'Nick', 'Bop', 'Peter']
const DEVICES  = ['VN88-4G', 'Go Track', 'DVR-88', 'C43', 'H5', 'Bewin', 'MT99']
const THU_HOI_LOAI = ['Dùng được', 'Không dùng được', 'Đang kiểm tra']
const CATEGORY_COLORS = {
  'UP Thành Phẩm': '#3b82f6',
  'Hàng Gửi VP':   '#10b981',
  'Thu Hồi':       '#ef4444',
  'Other':         '#f59e0b',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dateRangeFor(range: DateRange, customFrom?: string, customTo?: string): { from: string; to: string } {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const to = fmt(today)
  if (range === '7d')   { const f = new Date(today); f.setDate(f.getDate() - 6);  return { from: fmt(f), to } }
  if (range === '30d')  { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: fmt(f), to } }
  if (range === 'month') return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to }
  return { from: customFrom || to, to: customTo || to }
}

function weekLabel(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}/tuần ${week}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Dropdown for device name with "Khác" free-text option */
function DeviceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = value !== '' && !DEVICES.includes(value)
  const [custom, setCustom] = useState(isCustom ? value : '')
  const [showCustom, setShowCustom] = useState(isCustom)

  const handleSelect = (v: string) => {
    if (v === '__custom__') { setShowCustom(true); onChange(custom) }
    else { setShowCustom(false); onChange(v) }
  }

  return (
    <div className="flex gap-1 flex-1">
      <select
        value={showCustom ? '__custom__' : value}
        onChange={e => handleSelect(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-0"
      >
        <option value="">-- Chọn thiết bị --</option>
        {DEVICES.map(d => <option key={d} value={d}>{d}</option>)}
        <option value="__custom__">Khác...</option>
      </select>
      {showCustom && (
        <input
          type="text"
          placeholder="Tên thiết bị"
          value={custom}
          onChange={e => { setCustom(e.target.value); onChange(e.target.value) }}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
        />
      )}
    </div>
  )
}

/** One row in UP Thành Phẩm or Hàng Gửi sections */
function DeviceRow({
  item, onChange, onRemove, accentColor = 'blue',
}: { item: DeviceQty; onChange: (v: DeviceQty) => void; onRemove: () => void; accentColor?: string }) {
  const adj = (delta: number) => onChange({ ...item, qty: Math.max(0, (item.qty || 0) + delta) })
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm hover:border-gray-300 transition group">
      <DeviceSelect value={item.device} onChange={d => onChange({ ...item, device: d })} />
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <button onClick={() => adj(-1)}
          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-base leading-none transition">−</button>
        <input
          type="number" min="0"
          value={item.qty || ''}
          onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 0 })}
          className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button onClick={() => adj(1)}
          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-base leading-none transition">+</button>
      </div>
      <button onClick={onRemove}
        className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-lg leading-none transition ml-1">×</button>
    </div>
  )
}

/** One row in Thu Hồi section */
function ThuHoiRow({
  item, onChange, onRemove,
}: { item: ThuHoiItem; onChange: (v: ThuHoiItem) => void; onRemove: () => void }) {
  const adj = (delta: number) => onChange({ ...item, qty: Math.max(0, (item.qty || 0) + delta) })
  const loaiBadge = item.loai === 'Dùng được'
    ? 'bg-green-100 text-green-700 border-green-200'
    : item.loai === 'Không dùng được'
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-amber-100 text-amber-700 border-amber-200'
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm hover:border-gray-300 transition space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={item.loai}
          onChange={e => onChange({ ...item, loai: e.target.value })}
          className={'border rounded-lg px-2 py-1 text-xs font-medium ' + loaiBadge}
        >
          <option value="">-- Trạng thái --</option>
          {THU_HOI_LOAI.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <DeviceSelect value={item.device} onChange={d => onChange({ ...item, device: d })} />
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => adj(-1)}
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-base leading-none transition">−</button>
          <input
            type="number" min="0"
            value={item.qty || ''}
            onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 0 })}
            className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <button onClick={() => adj(1)}
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-base leading-none transition">+</button>
        </div>
        <button onClick={onRemove}
          className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-lg leading-none transition">×</button>
      </div>
    </div>
  )
}

/** One row in Công việc khác section */
function OtherRow({
  item, onChange, onRemove,
}: { item: OtherTask; onChange: (v: OtherTask) => void; onRemove: () => void }) {
  const adj = (delta: number) => onChange({ ...item, qty: Math.max(0, (item.qty || 0) + delta) })
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm hover:border-gray-300 transition flex-wrap">
      <input
        type="text" placeholder="Tên công việc..."
        value={item.task}
        onChange={e => onChange({ ...item, task: e.target.value })}
        className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
      <DeviceSelect value={item.device} onChange={d => onChange({ ...item, device: d })} />
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={() => adj(-1)}
          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-base leading-none transition">−</button>
        <input
          type="number" min="0"
          value={item.qty || ''}
          onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 0 })}
          className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <button onClick={() => adj(1)}
          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-base leading-none transition">+</button>
      </div>
      <button onClick={onRemove}
        className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-lg leading-none transition">×</button>
    </div>
  )
}

/** Expanded detail view for a record row */
function DetailPanel({ record }: { record: KhoRecord }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {record.thanh_pham_devices && record.thanh_pham_devices.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-blue-700 uppercase mb-2">UP Thành Phẩm</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.thanh_pham_devices.map((d, i) => (
                <tr key={i}><td className="py-0.5 text-gray-700">{d.device}</td><td className="py-0.5 text-right font-medium">{d.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.hang_gui_vp_devices && record.hang_gui_vp_devices.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-700 uppercase mb-2">Hàng Gửi VP</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.hang_gui_vp_devices.map((d, i) => (
                <tr key={i}><td className="py-0.5 text-gray-700">{d.device}</td><td className="py-0.5 text-right font-medium">{d.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.thu_hoi_details && record.thu_hoi_details.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-700 uppercase mb-2">Thu Hồi Thiết Bị</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Loại</th><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.thu_hoi_details.map((d, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      (d.loai || '').toLowerCase().includes('dung duoc') || (d.loai || '').toLowerCase().includes('dùng được')
                        ? 'bg-green-100 text-green-700'
                        : (d.loai || '').toLowerCase().includes('khong') || (d.loai || '').toLowerCase().includes('không')
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>{d.loai || '—'}</span>
                  </td>
                  <td className="py-0.5 text-gray-700">{d.device}</td>
                  <td className="py-0.5 text-right font-medium">{d.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.other_tasks && record.other_tasks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-700 uppercase mb-2">Công Việc Khác</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Công việc</th><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.other_tasks.map((t, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-gray-700">{t.task}</td>
                  <td className="py-0.5 text-gray-500">{t.device}</td>
                  <td className="py-0.5 text-right font-medium">{t.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!record.thanh_pham_devices?.length && !record.hang_gui_vp_devices?.length &&
       !record.thu_hoi_details?.length && !record.other_tasks?.length && (
        <p className="text-xs text-gray-400 col-span-2">Không có chi tiết thiết bị</p>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface KhoDailyProps { userEmail?: string; permissions?: string[] }
export default function KhoDailyDashboard(_props: KhoDailyProps = {}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'stats' | 'entry' | 'sync'>('overview')

  // Overview state
  const [records, setRecords]       = useState<KhoRecord[]>([])
  const [loading, setLoading]       = useState(false)
  const [dateRange, setDateRange]   = useState<DateRange>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [personFilter, setPersonFilter] = useState<string>('All')
  const [expandedRow, setExpandedRow]   = useState<number | null>(null)

  // Manual entry state
  const [entryPerson, setEntryPerson]   = useState<string>(PERSONS[0])
  const [entryDate, setEntryDate]       = useState<string>(new Date().toISOString().slice(0, 10))
  const [entryWeek, setEntryWeek]       = useState<string>('')
  const [entryThanhPham, setEntryThanhPham] = useState<DeviceQty[]>([])
  const [entryHangGui, setEntryHangGui]     = useState<DeviceQty[]>([])
  const [entryThuHoi, setEntryThuHoi]       = useState<ThuHoiItem[]>([])
  const [entryOther, setEntryOther]         = useState<OtherTask[]>([])
  const [entrySubmitting, setEntrySubmitting] = useState(false)
  const [entrySuccess, setEntrySuccess]       = useState<string | null>(null)
  const [entryError, setEntryError]           = useState<string | null>(null)

  // Sync (Google Sheets import) state
  const [clearFirst, setClearFirst]     = useState(false)
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<{ person: string; status: string; rows: number; errors: string[] }[] | null>(null)
  const [importError, setImportError]   = useState<string | null>(null)

  // Auto-fill week label when date changes
  useEffect(() => {
    setEntryWeek(weekLabel(entryDate))
  }, [entryDate])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = dateRangeFor(dateRange, customFrom, customTo)
      const params = new URLSearchParams({ from, to })
      if (personFilter !== 'All') params.set('person', personFilter)
      const res = await fetch(`/api/kho-daily/stats?${params}`)
      const data = await res.json()
      setRecords(data.records || [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [dateRange, customFrom, customTo, personFilter])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // ── Computed ──────────────────────────────────────────────────────────────
  const totalsByCategory = {
    'UP Thành Phẩm': records.reduce((s, r) => s + (r.thanh_pham_total || 0), 0),
    'Hàng Gửi VP':   records.reduce((s, r) => s + (r.hang_gui_vp_total || 0), 0),
    'Thu Hồi':       records.reduce((s, r) => s + (r.thu_hoi_total || 0), 0),
    'Other':         records.reduce((s, r) => s + (r.other_total || 0), 0),
  }

  const chartData = PERSONS.map(person => {
    const pr = records.filter(r => r.person_name === person)
    return {
      name:           person,
      'UP Thành Phẩm': pr.reduce((s, r) => s + (r.thanh_pham_total || 0), 0),
      'Hàng Gửi VP':   pr.reduce((s, r) => s + (r.hang_gui_vp_total || 0), 0),
      'Thu Hồi':       pr.reduce((s, r) => s + (r.thu_hoi_total || 0), 0),
      'Other':         pr.reduce((s, r) => s + (r.other_total || 0), 0),
    }
  })

  // Aggregate by device type
  const deviceStats: Record<string, { thanh_pham: number; hang_gui: number; thu_hoi: number }> = {}
  for (const rec of records) {
    for (const d of (rec.thanh_pham_devices ?? [])) {
      if (!d.device) continue
      if (!deviceStats[d.device]) deviceStats[d.device] = { thanh_pham: 0, hang_gui: 0, thu_hoi: 0 }
      deviceStats[d.device].thanh_pham += d.qty || 0
    }
    for (const d of (rec.hang_gui_vp_devices ?? [])) {
      if (!d.device) continue
      if (!deviceStats[d.device]) deviceStats[d.device] = { thanh_pham: 0, hang_gui: 0, thu_hoi: 0 }
      deviceStats[d.device].hang_gui += d.qty || 0
    }
    for (const d of (rec.thu_hoi_details ?? [])) {
      if (!d.device) continue
      if (!deviceStats[d.device]) deviceStats[d.device] = { thanh_pham: 0, hang_gui: 0, thu_hoi: 0 }
      deviceStats[d.device].thu_hoi += d.qty || 0
    }
  }
  const deviceRows = Object.entries(deviceStats)
    .map(([device, v]) => ({ device, ...v, total: v.thanh_pham + v.hang_gui + v.thu_hoi }))
    .sort((a, b) => b.total - a.total)

  const sortedRecords = [...records].sort((a, b) => b.entry_date.localeCompare(a.entry_date))

  // ── Stats tab computations ──────────────────────────────────────────────────
  const weeklyTrend = (() => {
    const byW: Record<string, { period: string; 'UP Thành Phẩm': number; 'Hàng Gửi VP': number; 'Thu Hồi': number; Other: number }> = {}
    for (const rec of records) {
      const key = rec.week_label || weekLabel(rec.entry_date)
      if (!byW[key]) byW[key] = { period: key, 'UP Thành Phẩm': 0, 'Hàng Gửi VP': 0, 'Thu Hồi': 0, Other: 0 }
      byW[key]['UP Thành Phẩm'] += rec.thanh_pham_total || 0
      byW[key]['Hàng Gửi VP']   += rec.hang_gui_vp_total || 0
      byW[key]['Thu Hồi']        += rec.thu_hoi_total || 0
      byW[key].Other             += rec.other_total || 0
    }
    return Object.values(byW).sort((a, b) => a.period.localeCompare(b.period))
  })()

  const deviceThanhPhamChart = Object.entries(
    records.flatMap(r => r.thanh_pham_devices ?? [])
      .filter(d => d.device)
      .reduce((acc, d) => { acc[d.device] = (acc[d.device] || 0) + (d.qty || 0); return acc }, {} as Record<string, number>)
  ).map(([device, qty]) => ({ device, qty })).sort((a, b) => b.qty - a.qty)

  const deviceHangGuiChart = Object.entries(
    records.flatMap(r => r.hang_gui_vp_devices ?? [])
      .filter(d => d.device)
      .reduce((acc, d) => { acc[d.device] = (acc[d.device] || 0) + (d.qty || 0); return acc }, {} as Record<string, number>)
  ).map(([device, qty]) => ({ device, qty })).sort((a, b) => b.qty - a.qty)

  const deviceThuHoiChart = (() => {
    const raw: Record<string, { 'Dùng được': number; 'Không dùng được': number; 'Đang kiểm tra': number }> = {}
    for (const rec of records) {
      for (const d of (rec.thu_hoi_details ?? [])) {
        if (!d.device) continue
        if (!raw[d.device]) raw[d.device] = { 'Dùng được': 0, 'Không dùng được': 0, 'Đang kiểm tra': 0 }
        const loai = d.loai || 'Đang kiểm tra'
        if (loai in raw[d.device]) (raw[d.device] as Record<string, number>)[loai] += d.qty || 0
        else raw[d.device]['Đang kiểm tra'] += d.qty || 0
      }
    }
    return Object.entries(raw)
      .map(([device, v]) => ({ device, ...v, total: v['Dùng được'] + v['Không dùng được'] + v['Đang kiểm tra'] }))
      .sort((a, b) => b.total - a.total)
  })()

  const otherTaskChart = Object.entries(
    records.flatMap(r => r.other_tasks ?? [])
      .filter(t => t.task)
      .reduce((acc, t) => { acc[t.task] = (acc[t.task] || 0) + (t.qty || 0); return acc }, {} as Record<string, number>)
  ).map(([task, qty]) => ({ task, qty })).sort((a, b) => b.qty - a.qty)

  const DEVICE_COLORS: Record<string, string> = {
    'VN88-4G': '#3b82f6', 'Go Track': '#ef4444', 'DVR-88': '#f59e0b',
    'C43': '#10b981', 'H5': '#8b5cf6', 'Bewin': '#06b6d4', 'MT99': '#f97316',
  }
  const getDeviceColor = (device: string, idx: number) =>
    DEVICE_COLORS[device] || ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#06b6d4','#f97316','#ec4899'][idx % 8]

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleEntrySubmit = async () => {
    setEntrySubmitting(true)
    setEntrySuccess(null)
    setEntryError(null)
    try {
      const res = await fetch('/api/kho-daily/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_name:         entryPerson,
          entry_date:          entryDate,
          week_label:          entryWeek,
          thanh_pham_devices:  entryThanhPham.filter(x => x.device && x.qty > 0),
          hang_gui_vp_devices: entryHangGui.filter(x => x.device && x.qty > 0),
          xuat_kho_devices:    [],
          thu_hoi_details:     entryThuHoi.filter(x => (x.loai || x.device) && x.qty > 0),
          other_tasks:         entryOther.filter(x => x.task && x.qty > 0),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định')
      setEntrySuccess(`Đã lưu dữ liệu cho ${entryPerson} ngày ${entryDate}`)
      // Reset form items
      setEntryThanhPham([])
      setEntryHangGui([])
      setEntryThuHoi([])
      setEntryOther([])
      fetchRecords()
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : String(e))
    } finally {
      setEntrySubmitting(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const res = await fetch('/api/kho-daily/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_first: clearFirst }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import thất bại')
      setImportResult(data.results)
      fetchRecords()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'stats',    label: 'Thống kê chi tiết' },
    { id: 'entry',    label: 'Nhập liệu' },
    { id: 'sync',     label: 'Đồng bộ GG Sheet' },
  ] as const

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: TỔNG QUAN ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Khoảng thời gian</label>
              <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                <option value="7d">7 ngày qua</option>
                <option value="30d">30 ngày qua</option>
                <option value="month">Tháng này</option>
                <option value="custom">Tùy chọn</option>
              </select>
            </div>
            {dateRange === 'custom' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nhân viên</label>
              <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                <option value="All">Tất cả</option>
                {PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(totalsByCategory).map(([label, total]) => (
              <div key={label} className="bg-white rounded-lg shadow p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-3">Thống kê theo nhân viên</h3>
            {loading ? <div className="text-center text-gray-400 py-8">Đang tải...</div> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Hoạt động gần đây</h3>
            </div>
            {loading ? <div className="text-center text-gray-400 py-8">Đang tải...</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Ngày', 'Tuần', 'Người', 'UP TP', 'Hàng Gửi', 'Thu Hồi', 'Other', 'Tổng'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRecords.map(rec => (
                      <React.Fragment key={rec.id}>
                        <tr onClick={() => setExpandedRow(expandedRow === rec.id ? null : rec.id)}
                          className="hover:bg-blue-50 cursor-pointer transition-colors">
                          <td className="px-3 py-2 text-gray-700">{rec.entry_date}</td>
                          <td className="px-3 py-2 text-gray-500">{rec.week_label}</td>
                          <td className="px-3 py-2 font-medium text-blue-600">{rec.person_name}</td>
                          <td className="px-3 py-2">{rec.thanh_pham_total || 0}</td>
                          <td className="px-3 py-2">{rec.hang_gui_vp_total || 0}</td>
                          <td className="px-3 py-2">{rec.thu_hoi_total || 0}</td>
                          <td className="px-3 py-2">{rec.other_total || 0}</td>
                          <td className="px-3 py-2 font-semibold">
                            {(rec.thanh_pham_total||0)+(rec.hang_gui_vp_total||0)+(rec.thu_hoi_total||0)+(rec.other_total||0)}
                          </td>
                        </tr>
                        {expandedRow === rec.id && (
                          <tr><td colSpan={8} className="px-4 py-3 bg-blue-50"><DetailPanel record={rec} /></td></tr>
                        )}
                      </React.Fragment>
                    ))}
                    {sortedRecords.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Không có dữ liệu</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Device breakdown table */}
          {deviceRows.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Thong ke theo loai thiet bi</h3>
                <span className="text-xs text-gray-400">{deviceRows.length} loai thiet bi</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Thiet bi</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-blue-600 uppercase">UP Thanh Pham</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-emerald-600 uppercase">Hang Gui VP</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-red-600 uppercase">Thu Hoi</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">Tong</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deviceRows.map(row => (
                      <tr key={row.device} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800">{row.device}</td>
                        <td className="px-4 py-2 text-right text-blue-700">{row.thanh_pham > 0 ? row.thanh_pham : '—'}</td>
                        <td className="px-4 py-2 text-right text-emerald-700">{row.hang_gui > 0 ? row.hang_gui : '—'}</td>
                        <td className="px-4 py-2 text-right text-red-600">{row.thu_hoi > 0 ? row.thu_hoi : '—'}</td>
                        <td className="px-4 py-2 text-right font-bold text-gray-900">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-xs font-semibold text-gray-500">TONG CONG</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-blue-700">{deviceRows.reduce((s,r)=>s+r.thanh_pham,0)}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700">{deviceRows.reduce((s,r)=>s+r.hang_gui,0)}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-red-600">{deviceRows.reduce((s,r)=>s+r.thu_hoi,0)}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">{deviceRows.reduce((s,r)=>s+r.total,0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: THỐNG KÊ CHI TIẾT ──────────────────────────────────────── */}
      {activeTab === 'stats' && (
        <div className="space-y-5">

          {/* Xu hướng theo tuần */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-1">Xu hướng theo tuần</h3>
            <p className="text-xs text-gray-400 mb-3">Tổng công việc mỗi tuần theo loại</p>
            {loading ? <div className="text-center text-gray-400 py-8">Đang tải...</div> :
             weeklyTrend.length === 0 ? <div className="text-center text-gray-400 py-8">Không có dữ liệu</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={weeklyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="UP Thành Phẩm" stroke="#3b82f6" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Hàng Gửi VP"   stroke="#10b981" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Thu Hồi"        stroke="#ef4444" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Other"          stroke="#f59e0b" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Row: Thành Phẩm + Hàng Gửi VP by device */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* UP Thành Phẩm theo thiết bị */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-700 mb-1">UP Thành Phẩm theo thiết bị</h3>
              <p className="text-xs text-gray-400 mb-3">Số lượng thiết bị đã lên thành phẩm</p>
              {deviceThanhPhamChart.length === 0 ? <div className="text-center text-gray-400 py-8 text-sm">Không có dữ liệu</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deviceThanhPhamChart} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="device" tick={{ fontSize: 11 }} width={60} />
                    <Tooltip />
                    <Bar dataKey="qty" name="Số lượng" radius={[0, 4, 4, 0]}>
                      {deviceThanhPhamChart.map((entry, index) => (
                        <rect key={index} fill={getDeviceColor(entry.device, index)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {/* Table */}
              {deviceThanhPhamChart.length > 0 && (
                <table className="w-full text-xs mt-3 border-t border-gray-100 pt-2">
                  <thead><tr><th className="text-left py-1 text-gray-500">Thiết bị</th><th className="text-right py-1 text-gray-500">SL</th><th className="text-right py-1 text-gray-500">%</th></tr></thead>
                  <tbody>
                    {deviceThanhPhamChart.map(r => {
                      const total = deviceThanhPhamChart.reduce((s, x) => s + x.qty, 0)
                      return (
                        <tr key={r.device} className="border-t border-gray-50">
                          <td className="py-1 font-medium text-gray-700">{r.device}</td>
                          <td className="py-1 text-right text-blue-700 font-semibold">{r.qty}</td>
                          <td className="py-1 text-right text-gray-400">{total > 0 ? Math.round(r.qty / total * 100) : 0}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Hàng Gửi VP theo thiết bị */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-700 mb-1">Hàng Gửi VP theo thiết bị</h3>
              <p className="text-xs text-gray-400 mb-3">Số lượng thiết bị đã gửi văn phòng</p>
              {deviceHangGuiChart.length === 0 ? <div className="text-center text-gray-400 py-8 text-sm">Không có dữ liệu</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deviceHangGuiChart} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="device" tick={{ fontSize: 11 }} width={60} />
                    <Tooltip />
                    <Bar dataKey="qty" name="Số lượng" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {deviceHangGuiChart.length > 0 && (
                <table className="w-full text-xs mt-3 border-t border-gray-100 pt-2">
                  <thead><tr><th className="text-left py-1 text-gray-500">Thiết bị</th><th className="text-right py-1 text-gray-500">SL</th><th className="text-right py-1 text-gray-500">%</th></tr></thead>
                  <tbody>
                    {deviceHangGuiChart.map(r => {
                      const total = deviceHangGuiChart.reduce((s, x) => s + x.qty, 0)
                      return (
                        <tr key={r.device} className="border-t border-gray-50">
                          <td className="py-1 font-medium text-gray-700">{r.device}</td>
                          <td className="py-1 text-right text-emerald-700 font-semibold">{r.qty}</td>
                          <td className="py-1 text-right text-gray-400">{total > 0 ? Math.round(r.qty / total * 100) : 0}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Thu Hồi theo thiết bị & trạng thái */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-1">Thu Hồi theo thiết bị & trạng thái</h3>
            <p className="text-xs text-gray-400 mb-3">Phân loại thiết bị thu hồi: dùng được / không dùng được / đang kiểm tra</p>
            {deviceThuHoiChart.length === 0 ? <div className="text-center text-gray-400 py-8 text-sm">Không có dữ liệu</div> : (
              <ResponsiveContainer width="100%" height={Math.max(180, deviceThuHoiChart.length * 44)}>
                <BarChart data={deviceThuHoiChart} layout="vertical" margin={{ top: 0, right: 30, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="device" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Dùng được"        stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Không dùng được"  stackId="a" fill="#ef4444" />
                  <Bar dataKey="Đang kiểm tra"    stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Row: Performance nhân viên + Công việc khác */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Performance nhân viên */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-700 mb-1">Performance nhân viên</h3>
              <p className="text-xs text-gray-400 mb-3">Tổng đóng góp mỗi nhân viên theo khoảng thời gian đã chọn</p>
              {loading ? <div className="text-center text-gray-400 py-8">Đang tải...</div> : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                        <Bar key={cat} dataKey={cat} stackId="a" fill={color} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  <table className="w-full text-xs mt-3 border-t border-gray-100">
                    <thead><tr>
                      <th className="text-left py-1 text-gray-500">NV</th>
                      <th className="text-right py-1 text-blue-500">UP TP</th>
                      <th className="text-right py-1 text-emerald-500">Gửi VP</th>
                      <th className="text-right py-1 text-red-500">Thu Hồi</th>
                      <th className="text-right py-1 text-gray-700 font-bold">Tổng</th>
                    </tr></thead>
                    <tbody>
                      {chartData.filter(r => r['UP Thành Phẩm'] + r['Hàng Gửi VP'] + r['Thu Hồi'] + r.Other > 0).map(r => (
                        <tr key={r.name} className="border-t border-gray-50">
                          <td className="py-1 font-semibold text-gray-800">{r.name}</td>
                          <td className="py-1 text-right text-blue-700">{r['UP Thành Phẩm']}</td>
                          <td className="py-1 text-right text-emerald-700">{r['Hàng Gửi VP']}</td>
                          <td className="py-1 text-right text-red-600">{r['Thu Hồi']}</td>
                          <td className="py-1 text-right font-bold text-gray-900">
                            {r['UP Thành Phẩm'] + r['Hàng Gửi VP'] + r['Thu Hồi'] + r.Other}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* Công việc khác */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-700 mb-1">Công việc khác</h3>
              <p className="text-xs text-gray-400 mb-3">Phân loại các công việc phát sinh ngoài nhập kho</p>
              {otherTaskChart.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">Không có công việc khác trong kỳ này</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={otherTaskChart} layout="vertical" margin={{ top: 0, right: 30, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="task" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="qty" name="Số lượng" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <table className="w-full text-xs mt-3 border-t border-gray-100">
                    <thead><tr><th className="text-left py-1 text-gray-500">Công việc</th><th className="text-right py-1 text-gray-500">SL</th><th className="text-right py-1 text-gray-500">%</th></tr></thead>
                    <tbody>
                      {otherTaskChart.map(r => {
                        const total = otherTaskChart.reduce((s, x) => s + x.qty, 0)
                        return (
                          <tr key={r.task} className="border-t border-gray-50">
                            <td className="py-1 text-gray-700">{r.task}</td>
                            <td className="py-1 text-right text-amber-700 font-semibold">{r.qty}</td>
                            <td className="py-1 text-right text-gray-400">{total > 0 ? Math.round(r.qty / total * 100) : 0}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>

          {/* Ghi chú về văn phòng */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
            <strong>Lưu ý:</strong> Thống kê "Hàng Gửi VP theo văn phòng" chưa có do dữ liệu nhập hiện tại không lưu tên văn phòng nhận hàng. 
            Để bổ sung, cần thêm trường "Văn phòng" vào phần nhập liệu Hàng Gửi VP.
          </div>

        </div>
      )}

            {/* ── TAB: NHAP LIEU ────────────────────────────────────────────────── */}
      {activeTab === 'entry' && (() => {
        const tpTotal  = entryThanhPham.reduce((s, x) => s + (x.qty || 0), 0)
        const guiTotal = entryHangGui.reduce((s, x) => s + (x.qty || 0), 0)
        const hoiTotal = entryThuHoi.reduce((s, x) => s + (x.qty || 0), 0)
        const otherTotal = entryOther.reduce((s, x) => s + (x.qty || 0), 0)
        const grandTotal = tpTotal + guiTotal + hoiTotal + otherTotal
        return (
        <div className="space-y-3 max-w-2xl">

          {/* ── Header: person + date ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Thông tin nhập liệu</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nhân viên</label>
                <select value={entryPerson} onChange={e => setEntryPerson(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50">
                  {PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ngày nhập</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400">Nhãn tuần:</span>
              <input type="text" value={entryWeek} onChange={e => setEntryWeek(e.target.value)}
                className="flex-1 border-0 border-b border-dashed border-gray-200 text-xs text-gray-600 py-0.5 focus:outline-none focus:border-blue-400 bg-transparent" />
            </div>
          </div>

          {/* ── UP Thành Phẩm ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
                <span className="font-semibold text-blue-800 text-sm">UP Thành Phẩm</span>
              </div>
              <div className="flex items-center gap-2">
                {entryThanhPham.length > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {entryThanhPham.length} loại · <strong>{tpTotal}</strong> chiếc
                  </span>
                )}
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              {entryThanhPham.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Chưa có thiết bị nào. Nhấn nút bên dưới để thêm.</p>
              )}
              {entryThanhPham.map((item, i) => (
                <DeviceRow key={i} item={item} accentColor="blue"
                  onChange={v => setEntryThanhPham(arr => arr.map((x, j) => j === i ? v : x))}
                  onRemove={() => setEntryThanhPham(arr => arr.filter((_, j) => j !== i))}
                />
              ))}
              <button onClick={() => setEntryThanhPham(arr => [...arr, { device: '', qty: 0 }])}
                className="w-full mt-1 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition">
                + Thêm thiết bị
              </button>
            </div>
          </div>

          {/* ── Hàng Gửi VP ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                <span className="font-semibold text-emerald-800 text-sm">Hàng Gửi Các Văn Phòng</span>
              </div>
              {entryHangGui.length > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {entryHangGui.length} loại · <strong>{guiTotal}</strong> chiếc
                </span>
              )}
            </div>
            <div className="px-4 py-3 space-y-2">
              {entryHangGui.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Chưa có thiết bị nào.</p>
              )}
              {entryHangGui.map((item, i) => (
                <DeviceRow key={i} item={item} accentColor="emerald"
                  onChange={v => setEntryHangGui(arr => arr.map((x, j) => j === i ? v : x))}
                  onRemove={() => setEntryHangGui(arr => arr.filter((_, j) => j !== i))}
                />
              ))}
              <button onClick={() => setEntryHangGui(arr => [...arr, { device: '', qty: 0 }])}
                className="w-full mt-1 py-2 text-sm text-emerald-600 hover:text-emerald-800 font-medium border border-dashed border-emerald-200 rounded-xl hover:bg-emerald-50 transition">
                + Thêm thiết bị
              </button>
            </div>
          </div>

          {/* ── Thu Hồi ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                <span className="font-semibold text-red-800 text-sm">Thu Hồi Thiết Bị Lỗi</span>
              </div>
              {entryThuHoi.length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {entryThuHoi.length} mục · <strong>{hoiTotal}</strong> chiếc
                </span>
              )}
            </div>
            <div className="px-4 py-3 space-y-2">
              {entryThuHoi.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Chưa có thiết bị nào.</p>
              )}
              {entryThuHoi.map((item, i) => (
                <ThuHoiRow key={i} item={item}
                  onChange={v => setEntryThuHoi(arr => arr.map((x, j) => j === i ? v : x))}
                  onRemove={() => setEntryThuHoi(arr => arr.filter((_, j) => j !== i))}
                />
              ))}
              <button onClick={() => setEntryThuHoi(arr => [...arr, { loai: 'Dùng được', device: '', qty: 0 }])}
                className="w-full mt-1 py-2 text-sm text-red-600 hover:text-red-800 font-medium border border-dashed border-red-200 rounded-xl hover:bg-red-50 transition">
                + Thêm thiết bị thu hồi
              </button>
            </div>
          </div>

          {/* ── Công việc khác ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
                <span className="font-semibold text-amber-800 text-sm">Công Việc Khác</span>
              </div>
              {entryOther.length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {entryOther.length} việc · <strong>{otherTotal}</strong>
                </span>
              )}
            </div>
            <div className="px-4 py-3 space-y-2">
              {entryOther.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Không có công việc phát sinh.</p>
              )}
              {entryOther.map((item, i) => (
                <OtherRow key={i} item={item}
                  onChange={v => setEntryOther(arr => arr.map((x, j) => j === i ? v : x))}
                  onRemove={() => setEntryOther(arr => arr.filter((_, j) => j !== i))}
                />
              ))}
              <button onClick={() => setEntryOther(arr => [...arr, { task: '', device: '', qty: 0 }])}
                className="w-full mt-1 py-2 text-sm text-amber-600 hover:text-amber-800 font-medium border border-dashed border-amber-200 rounded-xl hover:bg-amber-50 transition">
                + Thêm công việc
              </button>
            </div>
          </div>

          {/* ── Summary + Save ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {grandTotal > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-2 font-medium">Tóm tắt lần nhập này</p>
                <div className="flex flex-wrap gap-3">
                  {tpTotal > 0 && (
                    <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-3 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      <span className="text-xs text-blue-700">UP TP</span>
                      <span className="text-sm font-bold text-blue-800">{tpTotal}</span>
                    </div>
                  )}
                  {guiTotal > 0 && (
                    <div className="flex items-center gap-1.5 bg-emerald-50 rounded-lg px-3 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span className="text-xs text-emerald-700">Gửi VP</span>
                      <span className="text-sm font-bold text-emerald-800">{guiTotal}</span>
                    </div>
                  )}
                  {hoiTotal > 0 && (
                    <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-3 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      <span className="text-xs text-red-700">Thu Hồi</span>
                      <span className="text-sm font-bold text-red-800">{hoiTotal}</span>
                    </div>
                  )}
                  {otherTotal > 0 && (
                    <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <span className="text-xs text-amber-700">Khác</span>
                      <span className="text-sm font-bold text-amber-800">{otherTotal}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 ml-auto">
                    <span className="text-xs text-gray-500">Tổng</span>
                    <span className="text-sm font-bold text-gray-800">{grandTotal}</span>
                  </div>
                </div>
              </div>
            )}
            <div className="px-4 py-3 space-y-2">
              {entrySuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-xl text-sm border border-green-100">
                  <span className="text-base">✓</span> {entrySuccess}
                </div>
              )}
              {entryError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">{entryError}</div>
              )}
              <button
                onClick={handleEntrySubmit}
                disabled={entrySubmitting || grandTotal === 0}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md active:scale-[0.99]"
              >
                {entrySubmitting ? 'Đang lưu...' : grandTotal === 0 ? 'Nhập dữ liệu để lưu' : 'Lưu dữ liệu cho ' + entryPerson}
              </button>
            </div>
          </div>

        </div>
        )
      })()}

      {/* ── TAB: ĐỒNG BỘ GG SHEET ────────────────────────────────────────── */}
      {activeTab === 'sync' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6 max-w-lg">
            <h3 className="font-semibold text-gray-700 mb-1">Đồng bộ từ Google Sheets</h3>
            <p className="text-sm text-gray-500 mb-4">
              Đọc dữ liệu từ các sheet Kai, Thor, Nick, Bop, Peter và cập nhật vào hệ thống.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={clearFirst} onChange={e => setClearFirst(e.target.checked)}
                  className="rounded" />
                Xóa toàn bộ dữ liệu cũ trước khi đồng bộ
              </label>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-6 py-2 bg-green-600 text-white rounded font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? '⏳ Đang đồng bộ...' : '🔄 Đồng bộ ngay'}
              </button>
            </div>

            {importError && (
              <div className="mt-3 p-3 bg-red-50 text-red-700 rounded text-sm">{importError}</div>
            )}

            {importResult && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-700 mb-2">Kết quả</h4>
                <table className="w-full text-sm border border-gray-200 rounded overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nhân viên</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Đã nhập</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importResult.map(r => (
                      <tr key={r.person}>
                        <td className="px-3 py-2 font-medium">{r.person}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === 'ok' ? 'bg-green-100 text-green-700' :
                            r.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-3 py-2 text-green-600">{r.rows}</td>
                        <td className="px-3 py-2 text-red-600 text-xs">{r.errors.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Lịch sử dữ liệu (50 gần nhất)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Ngày', 'Tuần', 'Người', 'UP TP', 'Hàng Gửi', 'Thu Hồi', 'Other'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRecords.slice(0, 50).map(rec => (
                    <React.Fragment key={rec.id}>
                      <tr onClick={() => setExpandedRow(expandedRow === rec.id ? null : rec.id)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-3 py-2 text-gray-700">{rec.entry_date}</td>
                        <td className="px-3 py-2 text-gray-500">{rec.week_label}</td>
                        <td className="px-3 py-2 font-medium text-blue-600">{rec.person_name}</td>
                        <td className="px-3 py-2">{rec.thanh_pham_total || 0}</td>
                        <td className="px-3 py-2">{rec.hang_gui_vp_total || 0}</td>
                        <td className="px-3 py-2">{rec.thu_hoi_total || 0}</td>
                        <td className="px-3 py-2">{rec.other_total || 0}</td>
                      </tr>
                      {expandedRow === rec.id && (
                        <tr><td colSpan={7} className="px-4 py-3 bg-blue-50"><DetailPanel record={rec} /></td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SectionCard helper ───────────────────────────────────────────────────────
function SectionCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const borderMap: Record<string, string> = {
    blue: 'border-blue-200', emerald: 'border-emerald-200', red: 'border-red-200', amber: 'border-amber-200',
  }
  const textMap: Record<string, string> = {
    blue: 'text-blue-700', emerald: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700',
  }
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50', emerald: 'bg-emerald-50', red: 'bg-red-50', amber: 'bg-amber-50',
  }
  return (
    <div className={`border ${borderMap[color] || 'border-gray-200'} rounded-lg overflow-hidden`}>
      <div className={`${bgMap[color] || 'bg-gray-50'} px-4 py-2`}>
        <h4 className={`font-semibold text-sm ${textMap[color] || 'text-gray-700'}`}>{title}</h4>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}
