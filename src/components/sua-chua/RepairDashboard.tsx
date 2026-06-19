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

// 5 trạng thái — Bàn giao = tổng tất cả
const STATUS_TYPES = [
  { key: 'da_sua',       label: 'Đã sửa',       color: '#00AF50' },
  { key: 'gui_bao_hanh', label: 'Gửi bảo hành', color: '#f59e0b' },
  { key: 'khong_loi',    label: 'Không lỗi',     color: '#3b82f6' },
  { key: 'hong_han',     label: 'Hỏng hẳn',      color: '#ef4444' },
  { key: 'cho_sua',      label: 'Chờ sửa',       color: '#8b5cf6' },
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

// Tính tổng bàn giao = sum 4 trạng thái (không dùng repair_totals vì có thể thiếu)
function calcBanGiao(stats: RepairStat[], weekId: string, deviceType?: string): number {
  return stats
    .filter(s => s.week_id === weekId && (deviceType ? s.device_type === deviceType : true))
    .reduce((a, s) => a + s.quantity, 0)
}

// ── Tab: Dashboard ────────────────────────────────────────────
function DashboardTab({ year }: { year: number }) {
  const [data, setData] = useState<{ weeks: RepairWeek[]; stats: RepairStat[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDevices, setSelectedDevices] = useState<string[]>(['4G', '4GH', 'GO', 'SBOX'])
  const [chartMode, setChartMode] = useState<'table' | 'line' | 'bar'>('table')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sua-chua/stats?year=${year}`)
      .then(r => r.json())
      .then(d => setData({ weeks: d.weeks ?? [], stats: d.stats ?? [] }))
      .finally(() => setLoading(false))
  }, [year])

  if (loading) return <LoadingSpinner />
  if (!data || data.weeks.length === 0) return <EmptyState msg="Chưa có dữ liệu năm này" />

  const { weeks, stats } = data

  // Build totals per week per device (sum of all 4 statuses)
  const weekDeviceTotals = weeks.map(week => {
    const row: Record<string, number> = { total: 0 }
    DEVICE_TYPES.forEach(dt => {
      const qty = calcBanGiao(stats, week.id, dt)
      row[dt] = qty
      row.total += qty
    })
    return { week, ...row }
  })

  // Chart data
  const lineChartData = weekDeviceTotals.map(r => ({
    name: `T${r.week.week_number}`,
    ...Object.fromEntries(selectedDevices.map(dt => [dt, r[dt] ?? 0]))
  }))

  const barChartData = weeks.map(week => {
    const entry: Record<string, unknown> = { name: `T${week.week_number}` }
    STATUS_TYPES.forEach(st => {
      entry[st.label] = stats
        .filter(s => s.week_id === week.id && s.status_type === st.key)
        .reduce((a, s) => a + s.quantity, 0)
    })
    return entry
  })

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'table', label: '📋 Bảng thiết bị' },
          { key: 'line',  label: '📈 Biểu đồ đường' },
          { key: 'bar',   label: '📊 Kết quả sửa chữa' },
        ] as const).map(m => (
          <button key={m.key} onClick={() => setChartMode(m.key)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition ${chartMode === m.key ? 'bg-[#A70A0A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >{m.label}</button>
        ))}
      </div>

      {/* === TABLE VIEW (giống Google Sheets) === */}
      {chartMode === 'table' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Thiết bị bàn giao theo tuần × loại</h3>
            <span className="text-xs text-gray-400">(= Đã sửa + Gửi bảo hành + Không lỗi + Hỏng hẳn + Chờ sửa)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[120px]">Tuần</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-800 border-r border-gray-200">Tổng</th>
                  {DEVICE_TYPES.map(dt => (
                    <th key={dt} className="px-2 py-2 text-right font-medium text-gray-500 min-w-[52px]"
                      style={{ borderBottom: `2px solid ${DEVICE_COLORS[dt]}22` }}
                    >{dt}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekDeviceTotals.map(({ week, total, ...deviceCounts }, i) => (
                  <tr key={week.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'} hover:bg-blue-50/30 transition`}>
                    <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-inherit z-10">{week.week_label}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900 border-r border-gray-100">
                      {total > 0 ? total : <span className="text-gray-300">—</span>}
                    </td>
                    {DEVICE_TYPES.map(dt => {
                      const qty = (deviceCounts as Record<string, number>)[dt] ?? 0
                      return (
                        <td key={dt} className="px-2 py-2 text-right">
                          {qty > 0
                            ? <span className="font-medium" style={{ color: DEVICE_COLORS[dt] }}>{qty}</span>
                            : <span className="text-gray-200">—</span>
                          }
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50 z-10">Tổng năm</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900 border-r border-gray-100">
                    {weekDeviceTotals.reduce((a, r) => a + (r.total as number), 0)}
                  </td>
                  {DEVICE_TYPES.map(dt => {
                    const sum = weekDeviceTotals.reduce((a, r) => a + ((r[dt] as number) ?? 0), 0)
                    return (
                      <td key={dt} className="px-2 py-2 text-right font-semibold" style={{ color: sum > 0 ? DEVICE_COLORS[dt] : '#d1d5db' }}>
                        {sum > 0 ? sum : '—'}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* === LINE CHART === */}
      {chartMode === 'line' && (
        <>
          <div className="flex flex-wrap gap-2">
            {DEVICE_TYPES.map(dt => (
              <button key={dt}
                onClick={() => setSelectedDevices(prev => prev.includes(dt) ? prev.filter(d => d !== dt) : [...prev, dt])}
                className={`px-2.5 py-1 text-xs rounded-full border transition ${selectedDevices.includes(dt) ? 'border-transparent text-white' : 'bg-white text-gray-500 border-gray-200'}`}
                style={selectedDevices.includes(dt) ? { background: DEVICE_COLORS[dt] } : {}}
              >{dt}</button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Thiết bị bàn giao mỗi tuần</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedDevices.map(dt => (
                  <Line key={dt} type="monotone" dataKey={dt} stroke={DEVICE_COLORS[dt]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* === BAR CHART (outcomes) === */}
      {chartMode === 'bar' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Kết quả sửa chữa theo tuần</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barChartData}>
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

      {/* Summary row */}
      {chartMode !== 'table' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATUS_TYPES.map(st => {
            const total = stats.filter(s => s.status_type === st.key).reduce((a, s) => a + s.quantity, 0)
            return (
              <div key={st.key} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">{st.label}</p>
                <p className="text-2xl font-bold" style={{ color: st.color }}>{total.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-1">cả năm {year}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab: Nhập liệu ─────────────────────────────────────────────
function EntryTab({ onSaved }: { onSaved: () => void }) {
  const now = new Date()
  // Default date_start = thứ Hai của tuần hiện tại, date_end = thứ Sáu
  function getMondayOfWeek(d: Date) {
    const day = d.getDay() || 7
    const mon = new Date(d)
    mon.setDate(d.getDate() - day + 1)
    return mon
  }
  function toDateInput(d: Date) {
    return d.toISOString().split('T')[0]
  }
  const defaultMonday = getMondayOfWeek(now)
  const defaultFriday = new Date(defaultMonday)
  defaultFriday.setDate(defaultMonday.getDate() + 4)

  const [dateStart, setDateStart] = useState(toDateInput(defaultMonday))
  const [dateEnd, setDateEnd]     = useState(toDateInput(defaultFriday))

  // Derive week_number, year, week_label from dateStart
  const derivedInfo = (() => {
    if (!dateStart) return { year: now.getFullYear(), week_number: getWeekNumber(now), week_label: '' }
    const d = new Date(dateStart)
    const y = d.getFullYear()
    const wn = getWeekNumber(d)
    return { year: y, week_number: wn, week_label: `Tuan ${wn} - ${y}` }
  })()

  function formatDate(s: string) {
    if (!s) return ''
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }

  const displayLabel = dateStart && dateEnd
    ? `${formatDate(dateStart)} – ${formatDate(dateEnd)}`
    : derivedInfo.week_label

  const [stats, setStats] = useState<Record<string, Record<string, Record<string, number>>>>(() => {
    const s: Record<string, Record<string, Record<string, number>>> = {}
    STATUS_TYPES.forEach(st => {
      s[st.key] = {}
      FAULT_TYPES.forEach(ft => { s[st.key][ft] = {}; DEVICE_TYPES.forEach(dt => { s[st.key][ft][dt] = 0 }) })
    })
    return s
  })

  const [activeStatus, setActiveStatus] = useState('da_sua')
  const [mode, setMode] = useState<'entry' | 'preview'>('entry')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  function setCellValue(statusKey: string, fault: string, device: string, val: number) {
    setStats(prev => ({ ...prev, [statusKey]: { ...prev[statusKey], [fault]: { ...prev[statusKey][fault], [device]: val } } }))
  }

  // Tính tổng theo status × device cho preview
  function getStatusDeviceTotal(statusKey: string, deviceType: string): number {
    return FAULT_TYPES.reduce((a, ft) => a + (stats[statusKey][ft][deviceType] || 0), 0)
  }
  function getStatusTotal(statusKey: string): number {
    return DEVICE_TYPES.reduce((a, dt) => a + getStatusDeviceTotal(statusKey, dt), 0)
  }
  function getDeviceTotal(deviceType: string): number {
    return STATUS_TYPES.reduce((a, st) => a + getStatusDeviceTotal(st.key, deviceType), 0)
  }
  function getGrandTotal(): number {
    return STATUS_TYPES.reduce((a, st) => a + getStatusTotal(st.key), 0)
  }

  async function handleSave() {
    setSaving(true); setMsg('')
    try {
      const form = {
        year: derivedInfo.year,
        week_number: derivedInfo.week_number,
        week_label: derivedInfo.week_label,
        date_start: dateStart || null,
        date_end: dateEnd || null,
      }
      const weekRes = await fetch('/api/sua-chua/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const weekData = await weekRes.json()
      if (!weekRes.ok) throw new Error(weekData.error)
      const week_id = weekData.week.id

      const statsFlat: Array<{ status_type: string; fault_type: string; device_type: string; quantity: number }> = []
      STATUS_TYPES.forEach(st => {
        FAULT_TYPES.forEach(ft => {
          DEVICE_TYPES.forEach(dt => {
            statsFlat.push({ status_type: st.key, fault_type: ft, device_type: dt, quantity: stats[st.key][ft][dt] || 0 })
          })
        })
      })

      const statsRes = await fetch('/api/sua-chua/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id, stats: statsFlat, totals: [] }),
      })
      const statsData = await statsRes.json()
      if (!statsRes.ok) throw new Error(statsData.error)
      setMsg('✅ Đã lưu!'); setMode('entry'); onSaved()
    } catch (e) { setMsg('❌ ' + (e instanceof Error ? e.message : String(e))) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      {/* Week date range */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Thời gian tuần</h3>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Từ ngày</label>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Đến ngày</label>
            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Tuần: <strong className="text-gray-700">
            {derivedInfo.week_label} {displayLabel !== derivedInfo.week_label ? `(${displayLabel})` : ''}
          </strong>
        </p>
      </div>

      {/* Entry table (hidden in preview mode) */}
      {mode === 'entry' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {STATUS_TYPES.map(st => (
                <button key={st.key} onClick={() => setActiveStatus(st.key)}
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition ${activeStatus === st.key ? 'border-b-2' : 'text-gray-500 hover:text-gray-700'}`}
                  style={activeStatus === st.key ? { borderColor: st.color, background: st.color + '15', color: st.color } : {}}
                >{st.label}</button>
              ))}
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 bg-gray-50 sticky left-0 z-10 min-w-[120px]">Loại lỗi</th>
                    {DEVICE_TYPES.map(dt => <th key={dt} className="px-2 py-2 text-center font-medium text-gray-500 bg-gray-50 min-w-[55px]">{dt}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FAULT_TYPES.map((fault, fi) => (
                    <tr key={fault} className={fi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-3 py-1.5 font-medium text-gray-700 sticky left-0 bg-inherit">{fault}</td>
                      {DEVICE_TYPES.map(dt => (
                        <td key={dt} className="px-1 py-1">
                          <input type="number" min={0}
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

          <div className="flex items-center gap-3">
            <button onClick={() => setMode('preview')}
              className="px-6 py-2 text-sm font-semibold text-white rounded-xl transition"
              style={{ background: '#164d81' }}
            >📊 Xem thống kê</button>
            {msg && <p className="text-sm">{msg}</p>}
          </div>
        </>
      )}

      {/* Preview mode */}
      {mode === 'preview' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Xem lại thống kê trước khi lưu</h3>
                <p className="text-xs text-gray-400 mt-0.5">{derivedInfo.week_label} — {displayLabel}</p>
              </div>
              <span className="text-xs font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
                Tổng bàn giao: {getGrandTotal()}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[110px]">Trạng thái</th>
                    {DEVICE_TYPES.map(dt => (
                      <th key={dt} className="px-2 py-2 text-right font-medium text-gray-500 min-w-[48px]">{dt}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-l border-gray-200">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_TYPES.map((st, i) => (
                    <tr key={st.key} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-3 py-2 font-medium sticky left-0 bg-inherit" style={{ color: st.color }}>{st.label}</td>
                      {DEVICE_TYPES.map(dt => {
                        const qty = getStatusDeviceTotal(st.key, dt)
                        return (
                          <td key={dt} className="px-2 py-2 text-right">
                            {qty > 0 ? <span className="font-medium" style={{ color: st.color }}>{qty}</span> : <span className="text-gray-200">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right font-bold border-l border-gray-100" style={{ color: st.color }}>
                        {getStatusTotal(st.key) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50">Bàn giao</td>
                    {DEVICE_TYPES.map(dt => {
                      const qty = getDeviceTotal(dt)
                      return (
                        <td key={dt} className="px-2 py-2 text-right font-semibold text-gray-700">
                          {qty > 0 ? qty : <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-bold text-gray-900 border-l border-gray-200">{getGrandTotal()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => { setMode('entry'); setMsg('') }}
              className="px-5 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
            >← Quay lại chỉnh sửa</button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50"
              style={{ background: '#A70A0A' }}
            >{saving ? 'Đang lưu...' : '💾 Xác nhận & Lưu'}</button>
            {msg && <p className="text-sm">{msg}</p>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab: Lịch sử + Import ──────────────────────────────────────
function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const [weeks, setWeeks] = useState<RepairWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<RepairWeek | null>(null)
  const [weekData, setWeekData] = useState<{ stats: RepairStat[]; totals: RepairTotal[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')

  const loadWeeks = useCallback(async () => {
    setLoading(true)
    const d = await fetch('/api/sua-chua/weeks').then(r => r.json())
    setWeeks(d.weeks ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadWeeks() }, [loadWeeks, refreshKey])

  async function loadWeekDetail(week: RepairWeek) {
    setSelectedWeek(week)
    const d = await fetch(`/api/sua-chua/stats?week_id=${week.id}`).then(r => r.json())
    setWeekData(d)
  }

  async function handleImport() {
    if (!confirm('Xóa toàn bộ data cũ và import lại từ Google Sheets (từ tuần 40/2025)?')) return
    setImporting(true); setImportResult('')
    const res = await fetch('/api/sua-chua/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_year: 2025, from_week: 40, clear_first: true })
    })
    const d = await res.json()
    if (d.error) { setImportResult('❌ ' + d.error) }
    else {
      const ok = d.results.filter((r: { status: string }) => r.status === 'ok').length
      setImportResult(`✅ Import xong: ${ok}/${d.results.length} tuần`)
      loadWeeks()
    }
    setImporting(false)
  }

  async function handleDelete(weekId: string) {
    if (!confirm('Xóa dữ liệu tuần này?')) return
    await fetch('/api/sua-chua/weeks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_id: weekId }) })
    setSelectedWeek(null); setWeekData(null); loadWeeks()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-amber-800">Import lịch sử từ Google Sheets</p>
          <p className="text-xs text-amber-600 mt-0.5">Import từ tuần 40/2025 trở đi. Sẽ xóa và ghi đè toàn bộ data cũ.</p>
        </div>
        <div className="flex items-center gap-3">
          {importResult && <p className="text-xs">{importResult}</p>}
          <button onClick={handleImport} disabled={importing}
            className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition disabled:opacity-50"
            style={{ background: '#164d81' }}
          >{importing ? 'Đang import...' : '⬇ Import từ Sheets'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Danh sách tuần ({weeks.length})</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
            {weeks.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu</p>}
            {weeks.map(week => (
              <button key={week.id} onClick={() => loadWeekDetail(week)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition ${selectedWeek?.id === week.id ? 'bg-red-50' : ''}`}
              >
                <p className={`text-sm font-medium ${selectedWeek?.id === week.id ? 'text-[#A70A0A]' : 'text-gray-800'}`}>{week.week_label}</p>
                {week.date_start && <p className="text-[11px] text-gray-400 mt-0.5">{new Date(week.date_start).toLocaleDateString('vi-VN')}</p>}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!selectedWeek ? (
            <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm">Chọn một tuần để xem chi tiết</div>
          ) : !weekData ? (
            <LoadingSpinner />
          ) : (
            <div>
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{selectedWeek.week_label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Bàn giao: <strong className="text-gray-700">{calcBanGiao(weekData.stats, selectedWeek.id)}</strong> thiết bị
                  </p>
                </div>
                <button onClick={() => handleDelete(selectedWeek.id)} className="text-xs text-red-500 hover:text-red-700">🗑 Xóa</button>
              </div>

              {/* Breakdown by device */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Theo loại thiết bị</p>
                <div className="flex flex-wrap gap-2">
                  {DEVICE_TYPES.map(dt => {
                    const qty = calcBanGiao(weekData.stats, selectedWeek.id, dt)
                    if (qty === 0) return null
                    return (
                      <span key={dt} className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: DEVICE_COLORS[dt] }}>
                        {dt}: {qty}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Breakdown by status */}
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">Kết quả sửa chữa</p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_TYPES.map(st => {
                    const sum = weekData.stats.filter(s => s.week_id === selectedWeek.id && s.status_type === st.key).reduce((a, s) => a + s.quantity, 0)
                    return (
                      <div key={st.key} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: st.color + '12' }}>
                        <span className="text-xs font-medium" style={{ color: st.color }}>{st.label}</span>
                        <span className="text-sm font-bold text-gray-800">{sum || '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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

// ── Main ───────────────────────────────────────────────────────
export default function RepairDashboard({ userEmail = '', permissions = [] }: { userEmail?: string; permissions?: string[] }) {
  const canWrite = permissions.includes('sua_chua:write') || permissions.includes('admin:users')
  const [tab, setTab] = useState<'dashboard' | 'entry' | 'history'>('dashboard')
  const [year, setYear] = useState(currentYear())
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs: Array<{ key: 'dashboard' | 'entry' | 'history'; label: string }> = [
    { key: 'dashboard', label: '📊 Biểu đồ' },
    ...(canWrite ? [{ key: 'entry' as const, label: '✏️ Nhập liệu' }] : []),
    { key: 'history',   label: '🗂 Lịch sử' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🔧 Thống kê Sửa chữa</h1>
            <p className="text-xs text-gray-400 mt-0.5">Theo dõi tình trạng sửa chữa thiết bị hàng tuần</p>
          </div>
          {tab === 'dashboard' && (
            <select value={year} onChange={e => setYear(+e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700"
            >
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-1 mt-3 border-b border-gray-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${tab === t.key ? 'bg-white text-[#A70A0A] border border-b-white border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        {tab === 'dashboard' && <DashboardTab year={year} />}
        {tab === 'entry'     && <EntryTab onSaved={() => setRefreshKey(k => k + 1)} />}
        {tab === 'history'   && <HistoryTab refreshKey={refreshKey} />}
      </div>
    </div>
  )
}
