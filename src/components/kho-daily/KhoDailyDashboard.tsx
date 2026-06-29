'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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
  item, onChange, onRemove,
}: { item: DeviceQty; onChange: (v: DeviceQty) => void; onRemove: () => void }) {
  return (
    <div className="flex gap-2 items-center">
      <DeviceSelect value={item.device} onChange={d => onChange({ ...item, device: d })} />
      <input
        type="number" min="0" placeholder="SL"
        value={item.qty || ''}
        onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 0 })}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right"
      />
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
    </div>
  )
}

/** One row in Thu Hồi section */
function ThuHoiRow({
  item, onChange, onRemove,
}: { item: ThuHoiItem; onChange: (v: ThuHoiItem) => void; onRemove: () => void }) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <select
        value={item.loai}
        onChange={e => onChange({ ...item, loai: e.target.value })}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
      >
        <option value="">-- Loại --</option>
        {THU_HOI_LOAI.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <DeviceSelect value={item.device} onChange={d => onChange({ ...item, device: d })} />
      <input
        type="number" min="0" placeholder="SL"
        value={item.qty || ''}
        onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 0 })}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right"
      />
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
    </div>
  )
}

/** One row in Công việc khác section */
function OtherRow({
  item, onChange, onRemove,
}: { item: OtherTask; onChange: (v: OtherTask) => void; onRemove: () => void }) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <input
        type="text" placeholder="Công việc"
        value={item.task}
        onChange={e => onChange({ ...item, task: e.target.value })}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
      />
      <DeviceSelect value={item.device} onChange={d => onChange({ ...item, device: d })} />
      <input
        type="number" min="0" placeholder="SL"
        value={item.qty || ''}
        onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 0 })}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right"
      />
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
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
  const [activeTab, setActiveTab] = useState<'overview' | 'entry' | 'sync'>('overview')

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

  const sortedRecords = [...records].sort((a, b) => b.entry_date.localeCompare(a.entry_date))

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
        </div>
      )}

      {/* ── TAB: NHẬP LIỆU ────────────────────────────────────────────────── */}
      {activeTab === 'entry' && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-white rounded-lg shadow p-6 space-y-5">
            <h3 className="font-semibold text-gray-700 text-lg">Nhập liệu hàng ngày</h3>

            {/* Person + Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên</label>
                <select value={entryPerson} onChange={e => setEntryPerson(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full">
                  {PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nhãn tuần</label>
              <input type="text" value={entryWeek} onChange={e => setEntryWeek(e.target.value)}
                placeholder="Tự động tính hoặc nhập tay"
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full" />
            </div>

            {/* UP Thành Phẩm */}
            <SectionCard title="UP Thành Phẩm" color="blue">
              <div className="space-y-2">
                {entryThanhPham.map((item, i) => (
                  <DeviceRow key={i} item={item}
                    onChange={v => setEntryThanhPham(arr => arr.map((x, j) => j === i ? v : x))}
                    onRemove={() => setEntryThanhPham(arr => arr.filter((_, j) => j !== i))}
                  />
                ))}
                <button onClick={() => setEntryThanhPham(arr => [...arr, { device: '', qty: 0 }])}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium">+ Thêm thiết bị</button>
              </div>
            </SectionCard>

            {/* Hàng Gửi VP */}
            <SectionCard title="Hàng Gửi Các Văn Phòng" color="emerald">
              <div className="space-y-2">
                {entryHangGui.map((item, i) => (
                  <DeviceRow key={i} item={item}
                    onChange={v => setEntryHangGui(arr => arr.map((x, j) => j === i ? v : x))}
                    onRemove={() => setEntryHangGui(arr => arr.filter((_, j) => j !== i))}
                  />
                ))}
                <button onClick={() => setEntryHangGui(arr => [...arr, { device: '', qty: 0 }])}
                  className="text-emerald-600 hover:text-emerald-800 text-sm font-medium">+ Thêm thiết bị</button>
              </div>
            </SectionCard>

            {/* Thu Hồi */}
            <SectionCard title="Thu Hồi Thiết Bị Lỗi" color="red">
              <div className="space-y-2">
                {entryThuHoi.map((item, i) => (
                  <ThuHoiRow key={i} item={item}
                    onChange={v => setEntryThuHoi(arr => arr.map((x, j) => j === i ? v : x))}
                    onRemove={() => setEntryThuHoi(arr => arr.filter((_, j) => j !== i))}
                  />
                ))}
                <button onClick={() => setEntryThuHoi(arr => [...arr, { loai: 'Dùng được', device: '', qty: 0 }])}
                  className="text-red-600 hover:text-red-800 text-sm font-medium">+ Thêm thiết bị thu hồi</button>
              </div>
            </SectionCard>

            {/* Công việc khác */}
            <SectionCard title="Công Việc Khác" color="amber">
              <div className="space-y-2">
                {entryOther.map((item, i) => (
                  <OtherRow key={i} item={item}
                    onChange={v => setEntryOther(arr => arr.map((x, j) => j === i ? v : x))}
                    onRemove={() => setEntryOther(arr => arr.filter((_, j) => j !== i))}
                  />
                ))}
                <button onClick={() => setEntryOther(arr => [...arr, { task: '', device: '', qty: 0 }])}
                  className="text-amber-600 hover:text-amber-800 text-sm font-medium">+ Thêm công việc</button>
              </div>
            </SectionCard>

            {/* Submit */}
            {entrySuccess && (
              <div className="p-3 bg-green-50 text-green-700 rounded text-sm">{entrySuccess}</div>
            )}
            {entryError && (
              <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{entryError}</div>
            )}
            <button
              onClick={handleEntrySubmit}
              disabled={entrySubmitting}
              className="w-full py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {entrySubmitting ? 'Đang lưu...' : 'Lưu dữ liệu'}
            </button>
          </div>
        </div>
      )}

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
