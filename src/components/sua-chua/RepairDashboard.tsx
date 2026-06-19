'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ── Constants ─────────────────────────────────────────────────
const DEVICE_TYPES = [
  '4G', '4GH', 'GO', 'SBOX', 'MT99', 'Temp sensor',
  'FS100', 'SOJI', 'SW sensor', 'SINET sensor', 'Collision sensor',
  'DVR88', 'C43', 'H5', 'Bewin', 'Camera'
]

const DEVICE_COLORS: Record<string, string> = {
  '4G': '#A70A0A', '4GH': '#c0392b', 'GO': '#e67e22', 'SBOX': '#f39c12',
  'MT99': '#27ae60', 'Temp sensor': '#16a085', 'FS100': '#2980b9',
  'SOJI': '#8e44ad', 'SW sensor': '#2c3e50', 'SINET sensor': '#7f8c8d',
  'Collision sensor': '#d35400', 'DVR88': '#1abc9c', 'C43': '#3498db',
  'H5': '#9b59b6', 'Bewin': '#e91e63', 'Camera': '#607d8b'
}

const STATUS_TYPES = [
  { key: 'da_sua',       label: 'Đã sửa',        color: '#00AF50' },
  { key: 'gui_bao_hanh', label: 'Gửi bảo hành',  color: '#f59e0b' },
  { key: 'khong_loi',    label: 'Không lỗi',      color: '#3b82f6' },
  { key: 'hong_han',     label: 'Hỏng hẳn',       color: '#ef4444' },
  { key: 'cho_sua',      label: 'Chờ sửa',        color: '#8b5cf6' },
]

const FAULT_TYPES = [
  'POWER', 'POWER connector', 'GSM', 'GPS', 'RFID',
  'Flash', 'SIM', 'Firmware', 'Khác'
]

// ── Types ─────────────────────────────────────────────────────
interface RepairWeek {
  id: string
  year: number
  week_number: number
  week_label: string
  date_start: string | null
  date_end: string | null
}

interface RepairStat {
  week_id: string
  status_type: string
  fault_type: string
  device_type: string
  quantity: number
}

interface RepairTotal {
  week_id: string
  device_type: string
  total_received: number
}

// ── Helpers ───────────────────────────────────────────────────
function currentYear() { return new Date().getFullYear() }

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// ── Tab: Dashboard (biểu đồ) ──────────────────────────────────
function DashboardTab({ year }: { year: number }) {
  const [data, setData] = useState<{ weeks: RepairWeek[]; totals: RepairTotal[]; stats: RepairStat[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDevices, setSelectedDevices] = useState<string[]>(['4G', '4GH', 'GO'])
  const [chartMode, setChartMode] = useState<'totals' | 'outcomes'>('totals')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sua-chua/stats?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year])

  if (loading) return <LoadingSpinner />
  if (!data || data.weeks.length === 0) return <EmptyState msg="Chưa có dữ liệu năm này" />

  // Build chart data for totals
  const totalsChartData = data.weeks.map(week => {
    const entry: Record<string, unknown> = { name: `T${week.week_number}` }
    DEVICE_TYPES.forEach(dt => {
      const t = data.totals.find(t => t.week_id === week.id && t.device_type === dt)
      entry[dt] = t?.total_received ?? 0
    })
    return entry
  })

  // Build chart data for outcomes (da_sua, gui_bao_hanh, etc.) per week, summed across devices
  const outcomesChartData = data.weeks.map(week => {
    const entry: Record<string, unknown> = { name: `T${week.week_number}` }
    STATUS_TYPES.forEach(st => {
      const sum = data.stats
        .filter(s => s.week_id === week.id && s.status_type === st.key)
        .reduce((a, s) => a + s.quantity, 0)
      entry[st.label] = sum
    })
    return entry
  })

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setChartMode('totals')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition ${chartMode === 'totals' ? 'bg-[#A70A0A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >📦 Thiết bị bàn giao</button>
        <button
          onClick={() => setChartMode('outcomes')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition ${chartMode === 'outcomes' ? 'bg-[#A70A0A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >🔧 Kết quả sửa chữa</button>
      </div>

      {chartMode === 'totals' && (
        <>
          {/* Device filter */}
          <div className="flex flex-wrap gap-2">
            {DEVICE_TYPES.map(dt => (
              <button
                key={dt}
                onClick={() => setSelectedDevices(prev =>
                  prev.includes(dt) ? prev.filter(d => d !== dt) : [...prev, dt]
                )}
                className={`px-2.5 py-1 text-xs rounded-full border transition ${
                  selectedDevices.includes(dt)
                    ? 'border-transparent text-white'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}
                style={selectedDevices.includes(dt) ? { background: DEVICE_COLORS[dt] } : {}}
              >{dt}</button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Tổng thiết bị bàn giao theo tuần</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={totalsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedDevices.map(dt => (
                  <Line key={dt} type="monotone" dataKey={dt}
                    stroke={DEVICE_COLORS[dt]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {chartMode === 'outcomes' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Kết quả sửa chữa theo tuần</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={outcomesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {STATUS_TYPES.map(st => (
                <Bar key={st.key} dataKey={st.label} stackId="a" fill={st.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Tổng hợp theo tuần</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-500">Tuần</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">Bàn giao</th>
                {STATUS_TYPES.map(st => (
                  <th key={st.key} className="px-3 py-2 text-right font-medium text-gray-500">{st.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.weeks.map(week => {
                const totalReceived = data.totals
                  .filter(t => t.week_id === week.id)
                  .reduce((a, t) => a + t.total_received, 0)
                return (
                  <tr key={week.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-700">{week.week_label}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{totalReceived || '—'}</td>
                    {STATUS_TYPES.map(st => {
                      const sum = data.stats
                        .filter(s => s.week_id === week.id && s.status_type === st.key)
                        .reduce((a, s) => a + s.quantity, 0)
                      return <td key={st.key} className="px-3 py-2 text-right text-gray-600">{sum || '—'}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Nhập liệu tuần mới ───────────────────────────────────
function EntryTab({ onSaved }: { onSaved: () => void }) {
  const now = new Date()
  const weekNum = getWeekNumber(now)
  const year = now.getFullYear()

  const [form, setForm] = useState({
    year: year,
    week_number: weekNum,
    week_label: `Tuan ${weekNum} - ${year}`,
    date_start: '',
    date_end: '',
  })

  // stats[statusType][faultType][deviceType] = quantity
  const [stats, setStats] = useState<Record<string, Record<string, Record<string, number>>>>(() => {
    const s: Record<string, Record<string, Record<string, number>>> = {}
    STATUS_TYPES.forEach(st => {
      s[st.key] = {}
      FAULT_TYPES.forEach(ft => {
        s[st.key][ft] = {}
        DEVICE_TYPES.forEach(dt => { s[st.key][ft][dt] = 0 })
      })
    })
    return s
  })

  const [totals, setTotals] = useState<Record<string, number>>(() => {
    const t: Record<string, number> = {}
    DEVICE_TYPES.forEach(dt => { t[dt] = 0 })
    return t
  })

  const [activeStatus, setActiveStatus] = useState('da_sua')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  function setCellValue(statusKey: string, fault: string, device: string, val: number) {
    setStats(prev => ({
      ...prev,
      [statusKey]: {
        ...prev[statusKey],
        [fault]: { ...prev[statusKey][fault], [device]: val }
      }
    }))
  }

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      // 1. Create/upsert the week
      const weekRes = await fetch('/api/sua-chua/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const weekData = await weekRes.json()
      if (!weekRes.ok) throw new Error(weekData.error)
      const week_id = weekData.week.id

      // 2. Save stats & totals
      const statsFlat: Array<{ status_type: string; fault_type: string; device_type: string; quantity: number }> = []
      STATUS_TYPES.forEach(st => {
        FAULT_TYPES.forEach(ft => {
          DEVICE_TYPES.forEach(dt => {
            const qty = stats[st.key][ft][dt] || 0
            statsFlat.push({ status_type: st.key, fault_type: ft, device_type: dt, quantity: qty })
          })
        })
      })

      const totalsFlat = DEVICE_TYPES.map(dt => ({ device_type: dt, total_received: totals[dt] || 0 }))

      const statsRes = await fetch('/api/sua-chua/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id, stats: statsFlat, totals: totalsFlat })
      })
      const statsData = await statsRes.json()
      if (!statsRes.ok) throw new Error(statsData.error)

      setMsg('✅ Đã lưu thành công!')
      onSaved()
    } catch (e) {
      setMsg('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const activeStatusInfo = STATUS_TYPES.find(s => s.key === activeStatus)!

  return (
    <div className="space-y-5">
      {/* Week info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Thông tin tuần</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Năm</label>
            <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: +e.target.value, week_label: `Tuan ${f.week_number} - ${e.target.value}` }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tuần số</label>
            <input type="number" value={form.week_number} onChange={e => setForm(f => ({ ...f, week_number: +e.target.value, week_label: `Tuan ${e.target.value} - ${f.year}` }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Từ ngày</label>
            <input type="date" value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Đến ngày</label>
            <input type="date" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>
        <div className="mt-2">
          <p className="text-xs text-gray-400">Nhãn: <strong className="text-gray-700">{form.week_label}</strong></p>
        </div>
      </div>

      {/* Totals row */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Tổng thiết bị bàn giao</h3>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                {DEVICE_TYPES.map(dt => (
                  <th key={dt} className="px-2 py-1 text-center font-medium text-gray-500 min-w-[60px]">{dt}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {DEVICE_TYPES.map(dt => (
                  <td key={dt} className="px-1 py-1">
                    <input
                      type="number" min={0} value={totals[dt] || ''}
                      onChange={e => setTotals(prev => ({ ...prev, [dt]: +e.target.value }))}
                      className="w-full border border-gray-200 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:border-blue-400"
                      placeholder="0"
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Status tabs + matrix */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Status tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {STATUS_TYPES.map(st => (
            <button
              key={st.key}
              onClick={() => setActiveStatus(st.key)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition ${
                activeStatus === st.key
                  ? 'border-b-2 text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeStatus === st.key ? { borderColor: st.color, background: st.color + '15', color: st.color } : {}}
            >{st.label}</button>
          ))}
        </div>

        {/* Matrix */}
        <div className="p-4 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 bg-gray-50 rounded-tl-lg sticky left-0 z-10 min-w-[120px]">Loại lỗi</th>
                {DEVICE_TYPES.map(dt => (
                  <th key={dt} className="px-2 py-2 text-center font-medium text-gray-500 bg-gray-50 min-w-[55px]">{dt}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FAULT_TYPES.map((fault, fi) => (
                <tr key={fault} className={fi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-1.5 font-medium text-gray-700 sticky left-0 bg-inherit">{fault}</td>
                  {DEVICE_TYPES.map(dt => (
                    <td key={dt} className="px-1 py-1">
                      <input
                        type="number" min={0}
                        value={stats[activeStatus][fault][dt] || ''}
                        onChange={e => setCellValue(activeStatus, fault, dt, +e.target.value)}
                        className="w-full border border-gray-200 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:border-blue-400"
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50"
          style={{ background: '#A70A0A' }}
        >{saving ? 'Đang lưu...' : '💾 Lưu dữ liệu'}</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  )
}

// ── Tab: Lịch sử + Import ─────────────────────────────────────
function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const [weeks, setWeeks] = useState<RepairWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<RepairWeek | null>(null)
  const [weekData, setWeekData] = useState<{ stats: RepairStat[]; totals: RepairTotal[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')

  const loadWeeks = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/sua-chua/weeks')
    const d = await res.json()
    setWeeks(d.weeks ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadWeeks() }, [loadWeeks, refreshKey])

  async function loadWeekDetail(week: RepairWeek) {
    setSelectedWeek(week)
    const res = await fetch(`/api/sua-chua/stats?week_id=${week.id}`)
    const d = await res.json()
    setWeekData(d)
  }

  async function handleImport() {
    if (!confirm('Import toàn bộ lịch sử từ Google Sheets? Thao tác này có thể mất 1-2 phút.')) return
    setImporting(true)
    setImportResult('')
    const res = await fetch('/api/sua-chua/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const d = await res.json()
    if (d.error) {
      setImportResult('❌ ' + d.error)
    } else {
      const ok = d.results.filter((r: { status: string }) => r.status === 'ok').length
      setImportResult(`✅ Import xong: ${ok}/${d.results.length} sheet`)
      loadWeeks()
    }
    setImporting(false)
  }

  async function handleDelete(weekId: string) {
    if (!confirm('Xóa dữ liệu tuần này?')) return
    await fetch('/api/sua-chua/weeks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_id: weekId }) })
    setSelectedWeek(null)
    setWeekData(null)
    loadWeeks()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {/* Import button */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-amber-800">Import lịch sử từ Google Sheets</p>
          <p className="text-xs text-amber-600 mt-0.5">Chạy 1 lần để đồng bộ dữ liệu cũ. Cần share Sheets với service account trước.</p>
        </div>
        <div className="flex items-center gap-3">
          {importResult && <p className="text-xs">{importResult}</p>}
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition disabled:opacity-50"
            style={{ background: '#164d81' }}
          >{importing ? 'Đang import...' : '⬇ Import từ Sheets'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Week list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Danh sách tuần ({weeks.length})</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
            {weeks.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu</p>
            )}
            {weeks.map(week => (
              <button
                key={week.id}
                onClick={() => loadWeekDetail(week)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition ${selectedWeek?.id === week.id ? 'bg-red-50' : ''}`}
              >
                <p className={`text-sm font-medium ${selectedWeek?.id === week.id ? 'text-[#A70A0A]' : 'text-gray-800'}`}>{week.week_label}</p>
                {week.date_start && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(week.date_start).toLocaleDateString('vi-VN')}
                    {week.date_end ? ` – ${new Date(week.date_end).toLocaleDateString('vi-VN')}` : ''}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Week detail */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!selectedWeek ? (
            <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm">
              Chọn một tuần để xem chi tiết
            </div>
          ) : !weekData ? (
            <LoadingSpinner />
          ) : (
            <div>
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-semibold text-gray-700">{selectedWeek.week_label}</p>
                <button onClick={() => handleDelete(selectedWeek.id)} className="text-xs text-red-500 hover:text-red-700">🗑 Xóa</button>
              </div>

              {/* Totals */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Tổng bàn giao</p>
                <div className="flex flex-wrap gap-2">
                  {weekData.totals.filter(t => t.total_received > 0).map(t => (
                    <span key={t.device_type} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      {t.device_type}: <strong>{t.total_received}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats breakdown */}
              <div className="px-4 py-3 overflow-x-auto">
                <p className="text-xs font-semibold text-gray-500 mb-2">Kết quả sửa chữa</p>
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1 pr-3 text-gray-500 font-medium">Trạng thái</th>
                      <th className="text-left py-1 pr-3 text-gray-500 font-medium">Loại thiết bị</th>
                      <th className="text-right py-1 text-gray-500 font-medium">SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STATUS_TYPES.map(st => {
                      const stRows = weekData.stats.filter(s => s.status_type === st.key)
                      if (stRows.length === 0) return null
                      // Group by device_type
                      const byDevice: Record<string, number> = {}
                      stRows.forEach(r => { byDevice[r.device_type] = (byDevice[r.device_type] || 0) + r.quantity })
                      return Object.entries(byDevice).map(([dt, qty], i) => (
                        <tr key={`${st.key}-${dt}`} className="border-b border-gray-50">
                          {i === 0 && (
                            <td rowSpan={Object.keys(byDevice).length} className="py-1 pr-3 font-medium align-top" style={{ color: st.color }}>
                              {st.label}
                            </td>
                          )}
                          <td className="py-1 pr-3 text-gray-600">{dt}</td>
                          <td className="py-1 text-right font-semibold text-gray-800">{qty}</td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-48 gap-2 text-gray-400">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin" />
      <span className="text-sm">Đang tải...</span>
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
      <span className="text-3xl mb-2">📊</span>
      <p className="text-sm">{msg}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function RepairDashboard() {
  const [tab, setTab] = useState<'dashboard' | 'entry' | 'history'>('dashboard')
  const [year, setYear] = useState(currentYear())
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs = [
    { key: 'dashboard', label: '📊 Biểu đồ' },
    { key: 'entry',     label: '✏️ Nhập liệu' },
    { key: 'history',   label: '🗂 Lịch sử' },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🔧 Thống kê Sửa chữa</h1>
            <p className="text-xs text-gray-400 mt-0.5">Theo dõi tình trạng sửa chữa thiết bị hàng tuần</p>
          </div>
          {tab === 'dashboard' && (
            <select
              value={year}
              onChange={e => setYear(+e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 border-b border-gray-100">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${
                tab === t.key
                  ? 'bg-white text-[#A70A0A] border border-b-white border-gray-200 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {tab === 'dashboard' && <DashboardTab year={year} />}
        {tab === 'entry'     && <EntryTab onSaved={() => setRefreshKey(k => k + 1)} />}
        {tab === 'history'   && <HistoryTab refreshKey={refreshKey} />}
      </div>
    </div>
  )
}
