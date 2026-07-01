'use client'
import { useEffect, useState, useCallback } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import RepairTrackingDashboard from '@/components/sua-chua/RepairTrackingDashboard'
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
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
// Helper to get translated status label
function getStatusLabel(key: string, t: { suaChua: { statusDaSua: string; statusGuiBaoHanh: string; statusKhongLoi: string; statusHongHan: string; statusChoSua: string } }): string {
  const map: Record<string, string> = {
    da_sua: t.suaChua.statusDaSua,
    gui_bao_hanh: t.suaChua.statusGuiBaoHanh,
    khong_loi: t.suaChua.statusKhongLoi,
    hong_han: t.suaChua.statusHongHan,
    cho_sua: t.suaChua.statusChoSua,
  }
  return map[key] ?? key
}
// Per-status fault types — canonical defaults matching Google Sheets
const DEFAULT_FAULT_TYPES_BY_STATUS: Record<string, string[]> = {
  da_sua: [
    'POWER', 'POWER connector', 'GSM', 'GPS', 'RFID', 'BUZZER', 'ACC',
    'RS232', 'I/O', 'UPDATE', 'Lỗi cấu hình', 'Lỗi Sim', 'Lỗi audio',
    'Lỗi IR', 'Lỗi thấu kính', 'Lỗi video cable', 'Lỗi thẻ nhớ',
    'Lỗi màn hình hiển thị', 'Lost camera signal',
  ],
  gui_bao_hanh: [
    'POWER', 'GSM', 'GPS', 'RFID', 'BUZZER', 'ACC', 'RS232', 'I/O',
    'UPDATE', 'Lỗi cấu hình', 'Lỗi Sim', 'Lỗi audio', 'Lỗi IR',
    'Lỗi thấu kính', 'Lỗi video cable', 'Lỗi thẻ nhớ',
    'Lỗi màn hình hiển thị', 'Lost camera signal', 'Lỗi Loa', 'không xác định',
  ],
  khong_loi: [
    'Installation (lắp đặt)', 'Power', 'Unuse (xóa xe)', 'RS232', 'Buzzer',
    'Change vehicles', 'ACC', 'RFID', 'GSM', 'GPS', 'Roaming', 'Temperature',
    'Config', 'Sim-card', 'audio', 'IR', 'Lens', 'video cable', 'SD card',
    'Lỗi màn hình hiển thị', 'Lost camera signal',
  ],
  hong_han: [
    'burnt components', 'RS232', 'POWER', 'Không nhận thẻ',
    'Oxidation', 'Broken', 'Lỗi nhiệt',
  ],
  cho_sua: [
    'POWER', 'POWER connector', 'GSM', 'GPS', 'RFID', 'BUZZER', 'ACC',
    'RS232', 'I/O', 'UPDATE', 'Lỗi cấu hình', 'Lỗi Sim', 'Lỗi audio',
    'Lỗi IR', 'Lỗi thấu kính', 'Lỗi video cable', 'Lỗi thẻ nhớ',
    'Lỗi màn hình hiển thị', 'Lost camera signal', 'Không xác định',
  ],
}
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
  submitted_by?: string | null
  submitted_at?: string | null
}
interface RepairTotal {
  week_id: string
  device_type: string
  total_received: number
}
// ── Helpers ───────────────────────────────────────────────────
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
// ── Period helpers ────────────────────────────────────────────
type PeriodMode = 'tuan' | 'thang' | 'range' | 'nam'
function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}
function dashMondayOfWeek(d: Date): Date {
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day + 1)
  mon.setHours(0, 0, 0, 0)
  return mon
}
function getISOWeekYear(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const isoYear = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { week, year: isoYear }
}
function navigateWeek(year: number, week: number, delta: number): { year: number; week: number } {
  // Jan 4 is always in ISO week 1; offset to target week then apply delta
  const jan4 = new Date(year, 0, 4)
  jan4.setDate(jan4.getDate() + (week - 1) * 7 + delta * 7)
  return getISOWeekYear(jan4)
}
function navigateMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta, y = year
  if (m > 12) { m -= 12; y++ }
  if (m < 1)  { m += 12; y-- }
  return { year: y, month: m }
}
function fmtDateStr(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
// ── Single-week breakdown view ─────────────────────────────────
function SingleWeekView({
  week, stats, deviceFilter = 'all'
}: {
  week: RepairWeek
  stats: RepairStat[]
  deviceFilter?: string
}) {
  const { t } = useLanguage()
  const devStats = deviceFilter === 'all' ? stats : stats.filter(s => s.device_type === deviceFilter)
  const banGiao = calcBanGiao(devStats, week.id)
  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">{t.suaChua.kpiBanGiao}</p>
          <p className="text-2xl font-bold text-gray-900">{banGiao || '—'}</p>
          <p className="text-[10px] text-gray-400 mt-1">{t.suaChua.kpiDevices}</p>
        </div>
        {STATUS_TYPES.map(st => {
          const total = devStats.filter(s => s.week_id === week.id && s.status_type === st.key).reduce((a, s) => a + s.quantity, 0)
          return (
            <div key={st.key} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{getStatusLabel(st.key, t)}</p>
              <p className="text-2xl font-bold" style={{ color: st.color }}>{total || '—'}</p>
              {banGiao > 0 && total > 0 && (
                <p className="text-[10px] text-gray-400 mt-1">{Math.round(total / banGiao * 100)}%</p>
              )}
            </div>
          )
        })}
      </div>
      {/* Status × Device table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">{t.suaChua.resultByDevice}</h3>
            {week.date_start && (
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtDateStr(week.date_start)}{week.date_end ? ` – ${fmtDateStr(week.date_end)}` : ''}
              </p>
            )}
          </div>
          <span className="text-xs font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
            {week.week_label}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[110px]">{t.suaChua.colStatus}</th>
                {DEVICE_TYPES.map(dt => {
                  const active = deviceFilter === 'all' || deviceFilter === dt
                  return (
                    <th key={dt} className="px-2 py-2 text-right font-medium min-w-[48px] transition"
                      style={{ color: active ? DEVICE_COLORS[dt] : '#d1d5db', borderBottom: `2px solid ${active ? DEVICE_COLORS[dt] + '55' : '#f3f4f6'}` }}
                    >{dt}</th>
                  )
                })}
                <th className="px-3 py-2 text-right font-semibold text-gray-700 border-l border-gray-200">{t.suaChua.colTotal}</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_TYPES.map((st, i) => {
                const stStats = stats.filter(s => s.week_id === week.id && s.status_type === st.key)
                const stDevStats = devStats.filter(s => s.week_id === week.id && s.status_type === st.key)
                const stTotal = stDevStats.reduce((a, s) => a + s.quantity, 0)
                return (
                  <tr key={st.key} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-3 py-2 font-medium sticky left-0 bg-inherit z-10" style={{ color: st.color }}>{getStatusLabel(st.key, t)}</td>
                    {DEVICE_TYPES.map(dt => {
                      const qty = stStats.filter(s => s.device_type === dt).reduce((a, s) => a + s.quantity, 0)
                      const dimmed = deviceFilter !== 'all' && deviceFilter !== dt
                      return (
                        <td key={dt} className="px-2 py-2 text-right">
                          {qty > 0
                            ? <span className="font-medium" style={{ color: dimmed ? '#d1d5db' : st.color }}>{qty}</span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-bold border-l border-gray-100" style={{ color: st.color }}>
                      {stTotal > 0 ? stTotal : <span className="text-gray-200">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50 z-10">{t.suaChua.kpiBanGiao}</td>
                {DEVICE_TYPES.map(dt => {
                  const qty = calcBanGiao(stats, week.id, dt)
                  const dimmed = deviceFilter !== 'all' && deviceFilter !== dt
                  return (
                    <td key={dt} className="px-2 py-2 text-right font-semibold" style={{ color: dimmed ? '#d1d5db' : '#374151' }}>
                      {qty > 0 ? qty : <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-bold text-gray-900 border-l border-gray-200">{banGiao}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {/* Status bar chart */}
      {banGiao > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.suaChua.repairChartTitle}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={STATUS_TYPES.map(st => ({
                name: st.label,
                'Số lượng': devStats.filter(s => s.week_id === week.id && s.status_type === st.key).reduce((a, s) => a + s.quantity, 0),
              }))}
              margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="Số lượng" radius={4}>
                {STATUS_TYPES.map((st, i) => <Cell key={i} fill={st.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
// ── Analytics: status breakdown by device & fault type ────────
function AnalyticsSection({
  stats,
  selectedDevice,
}: {
  stats: RepairStat[]
  selectedDevice: string
}) {
  const { t } = useLanguage()
  const [tab, setTab] = useState('da_sua')
  // Apply device filter
  const devStats = selectedDevice === 'all' ? stats : stats.filter(s => s.device_type === selectedDevice)
  const grandTotal = devStats.reduce((a, s) => a + s.quantity, 0)
  const stInfo = STATUS_TYPES.find(s => s.key === tab) ?? STATUS_TYPES[0]
  const tabStats  = devStats.filter(s => s.status_type === tab)
  const tabTotal  = tabStats.reduce((a, s) => a + s.quantity, 0)
  // By device (meaningful only when showing all)
  const byDevice = DEVICE_TYPES
    .map(dt => ({ name: dt, qty: tabStats.filter(s => s.device_type === dt).reduce((a, s) => a + s.quantity, 0), color: DEVICE_COLORS[dt] }))
    .filter(d => d.qty > 0)
    .sort((a, b) => b.qty - a.qty)
  // By fault type — derived from actual data so all real fault types appear
  const byFault = Object.entries(
    tabStats.reduce((acc, s) => {
      acc[s.fault_type] = (acc[s.fault_type] || 0) + s.quantity
      return acc
    }, {} as Record<string, number>)
  )
    .filter(([, qty]) => qty > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, qty]) => ({ name, qty }))
  // Hỏng hẳn matrix
  const hhStats   = devStats.filter(s => s.status_type === 'hong_han')
  const hhTotal   = hhStats.reduce((a, s) => a + s.quantity, 0)
  const hhDevices = DEVICE_TYPES.filter(dt => hhStats.some(s => s.device_type === dt && s.quantity > 0))
  // Derive hỏng hẳn fault types from actual data
  const hhFaults  = [...new Set(hhStats.filter(s => s.quantity > 0).map(s => s.fault_type))]
  const pct = (n: number) => grandTotal > 0 ? `${Math.round(n / grandTotal * 100)}%` : '0%'
  const pctOf = (n: number, base: number) => base > 0 ? `${Math.round(n / base * 100)}%` : '—'
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">{t.suaChua.detailAnalysis}</h3>
        {selectedDevice !== 'all' && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
            style={{ background: DEVICE_COLORS[selectedDevice] ?? '#6b7280' }}>
            {selectedDevice}
          </span>
        )}
      </div>
      {/* Status tabs */}
      <div className="flex border-b border-gray-100 overflow-x-auto">
        {STATUS_TYPES.map(st => {
          const cnt = devStats.filter(s => s.status_type === st.key).reduce((a, s) => a + s.quantity, 0)
          return (
            <button key={st.key} onClick={() => setTab(st.key)}
              className={`px-4 py-2.5 text-xs whitespace-nowrap transition border-b-2 shrink-0 ${tab === st.key ? '' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              style={tab === st.key ? { borderColor: st.color, color: st.color, background: st.color + '12' } : {}}
            >
              <span className="font-medium">{getStatusLabel(st.key, t)}</span>
              <span className="ml-1.5 font-normal opacity-70">{cnt > 0 ? `${cnt} · ${pct(cnt)}` : '0'}</span>
            </button>
          )
        })}
      </div>
      <div className="p-4">
        {/* Đã sửa / Gửi BH / Không lỗi / Chờ sửa → device + fault breakdown */}
        {tab !== 'hong_han' && (
          <>
            {tabTotal === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t.suaChua.noData}</p>
            ) : (
              <div className={`grid gap-6 ${selectedDevice === 'all' && byDevice.length > 0 ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
                {/* By device (only when viewing all) */}
                {selectedDevice === 'all' && byDevice.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                      {t.suaChua.byDeviceType} <span className="font-normal normal-case text-gray-400">({tabTotal} {t.suaChua.kpiDevices})</span>
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(160, byDevice.length * 28)}>
                      <BarChart data={byDevice} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 52 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={48} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(v: unknown) => {
                            const n = Number(v)
                            return [`${n} (${pctOf(n, tabTotal)})`, stInfo.label]
                          }}
                        />
                        <Bar dataKey="qty" radius={3} label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: (v: number) => pctOf(v, tabTotal) }}>
                          {byDevice.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {/* By fault type */}
                {byFault.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                      {t.suaChua.byFaultType} <span className="font-normal normal-case text-gray-400">({tabTotal} {t.suaChua.cases})</span>
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(160, byFault.length * 28)}>
                      <BarChart data={byFault} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 62 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={58} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(v: unknown) => {
                            const n = Number(v)
                            return [`${n} (${pctOf(n, tabTotal)})`, 'Số lượng']
                          }}
                        />
                        <Bar dataKey="qty" fill={stInfo.color} radius={3}
                          label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: (v: number) => pctOf(v, tabTotal) }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {/* Hỏng hẳn → fault × device matrix */}
        {tab === 'hong_han' && (
          hhTotal === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t.suaChua.noBrokenDevices}</p>
          ) : (
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-500 mb-3">Tổng <strong className="text-red-600">{hhTotal}</strong> thiết bị hỏng hẳn</p>
              <table className="text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[110px]">{t.suaChua.colFaultType}</th>
                    {hhDevices.map(dt => (
                      <th key={dt} className="px-2 py-2 text-right font-medium min-w-[44px]" style={{ color: DEVICE_COLORS[dt] }}>{dt}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-red-600 border-l border-gray-200">{t.suaChua.colTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {hhFaults.map((ft, i) => {
                    const fTotal = hhStats.filter(s => s.fault_type === ft).reduce((a, s) => a + s.quantity, 0)
                    return (
                      <tr key={ft} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                        <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-inherit">{ft}</td>
                        {hhDevices.map(dt => {
                          const qty = hhStats.filter(s => s.device_type === dt && s.fault_type === ft).reduce((a, s) => a + s.quantity, 0)
                          return (
                            <td key={dt} className="px-2 py-2 text-right">
                              {qty > 0 ? <span className="font-bold text-red-600">{qty}</span> : <span className="text-gray-200">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-bold text-red-600 border-l border-gray-100">{fTotal}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50">{t.suaChua.colTotal}</td>
                    {hhDevices.map(dt => {
                      const dtTotal = hhStats.filter(s => s.device_type === dt).reduce((a, s) => a + s.quantity, 0)
                      return (
                        <td key={dt} className="px-2 py-2 text-right font-semibold text-red-600">
                          {dtTotal > 0 ? dtTotal : <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-bold text-red-700 border-l border-gray-200">{hhTotal}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
// ── Tab: Dashboard ────────────────────────────────────────────
function DashboardTab() {
  const { t } = useLanguage()
  const now = new Date()
  const todayISO = getISOWeekYear(now)
  // ── Period state ──
  const [periodMode, setPeriodMode] = useState<PeriodMode>('tuan')
  const [weekYear, setWeekYear] = useState(todayISO.year)
  const [weekNum, setWeekNum]   = useState(todayISO.week)
  const [monthYear, setMonthYear] = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth() + 1)
  const [rangeStart, setRangeStart] = useState(toISODate(dashMondayOfWeek(now)))
  const [rangeEnd, setRangeEnd]     = useState(toISODate(now))
  const [nam, setNam] = useState(now.getFullYear())
  // ── Device filter ──
  const [selectedDevice, setSelectedDevice] = useState<string>('all')
  // ── Chart state (multi-week) ──
  const [chartMode, setChartMode] = useState<'table' | 'line' | 'bar'>('table')
  const [selectedDevices, setSelectedDevices] = useState<string[]>(['4G', '4GH', 'GO', 'SBOX'])
  // ── Data cache ──
  const [cache, setCache] = useState<Record<number, { weeks: RepairWeek[]; stats: RepairStat[] }>>({})
  const [loading, setLoading] = useState(true)
  // Determine years to fetch
  // Luôn load năm hiện tại + năm trước để navigation có đủ tuần
  const baseYears = Array.from(new Set([now.getFullYear(), now.getFullYear() - 1]))
  const yearsNeeded: number[] = (() => {
    switch (periodMode) {
      case 'tuan':  return Array.from(new Set([...baseYears, weekYear]))
      case 'thang': return Array.from(new Set([...baseYears, monthYear]))
      case 'range': {
        if (!rangeStart || !rangeEnd) return [now.getFullYear()]
        const sy = new Date(rangeStart).getFullYear()
        const ey = new Date(rangeEnd).getFullYear()
        return sy === ey ? [sy] : [sy, ey]
      }
      case 'nam': return [nam]
    }
  })()
  const yearsKey = [...yearsNeeded].sort().join(',')
  useEffect(() => {
    const missing = yearsNeeded.filter(y => !(y in cache))
    if (missing.length === 0) { setLoading(false); return }
    setLoading(true)
    Promise.all(
      missing.map(y =>
        fetch(`/api/sua-chua/stats?year=${y}`)
          .then(r => r.json())
          .then(d => ({ y, weeks: d.weeks ?? [], stats: d.stats ?? [] }))
      )
    ).then(results => {
      setCache(prev => {
        const next = { ...prev }
        results.forEach(({ y, weeks, stats }) => { next[y] = { weeks, stats } })
        return next
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsKey])
  // Combine from cache
  const allWeeks  = yearsNeeded.flatMap(y => cache[y]?.weeks ?? [])
  const allStats  = yearsNeeded.flatMap(y => cache[y]?.stats ?? [])
  const dataReady = yearsNeeded.every(y => y in cache)
  // Khi data load lần đầu và tuần hiện tại không có data,
  // tự động nhảy đến tuần gần nhất có data trong DB
  const [autoNavigated, setAutoNavigated] = useState(false)
  useEffect(() => {
    if (!dataReady || autoNavigated || periodMode !== 'tuan') return
    // Kiểm tra xem tuần hiện tại có data không
    const currentHasData = allWeeks.some(
      w => w.year === weekYear && w.week_number === weekNum
    )
    if (!currentHasData && allWeeks.length > 0) {
      // Tìm tuần có week_number lớn nhất (mới nhất)
      const sorted = [...allWeeks].sort((a, b) =>
        a.year !== b.year ? b.year - a.year : b.week_number - a.week_number
      )
      const latest = sorted[0]
      setWeekYear(latest.year)
      setWeekNum(latest.week_number)
    }
    setAutoNavigated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady])
  // Helper: get Mon–Sun bounds of an ISO week
  const isoWeekBounds = (year: number, week: number): [Date, Date] => {
    // Jan 4 is always in ISO week 1
    const jan4 = new Date(Date.UTC(year, 0, 4))
    // Monday of week 1
    const w1mon = new Date(jan4)
    w1mon.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1)
    const monday = new Date(w1mon)
    monday.setUTCDate(w1mon.getUTCDate() + (week - 1) * 7)
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)
    return [monday, sunday]
  }
  // Filter weeks to selected period
  const filteredWeeks: RepairWeek[] = dataReady ? (() => {
    switch (periodMode) {
      case 'tuan': {
        // Primary match: exact week_number + year
        const primaryWeek = allWeeks.find(w => w.year === weekYear && w.week_number === weekNum)
        // Only include additional overlapping weeks if we don't have a clear primary match with dates
        if (primaryWeek) return [primaryWeek]
        // Fallback: no exact match → find by date overlap using ISO bounds
        const [mon, sun] = isoWeekBounds(weekYear, weekNum)
        return allWeeks.filter(w => {
          if (w.date_start) {
            const ds = new Date(w.date_start + 'T00:00:00Z')
            const de = w.date_end ? new Date(w.date_end + 'T00:00:00Z') : ds
            return ds <= sun && de >= mon
          }
          return false
        })
      }
      case 'thang':
        return allWeeks.filter(w => {
          if (!w.date_start) return w.year === monthYear
          const d = new Date(w.date_start)
          return d.getFullYear() === monthYear && (d.getMonth() + 1) === month
        })
      case 'range': {
        if (!rangeStart || !rangeEnd) return []
        const s = new Date(rangeStart), e = new Date(rangeEnd)
        return allWeeks.filter(w => {
          if (!w.date_start) return false
          const ws = new Date(w.date_start)
          const we = w.date_end ? new Date(w.date_end) : ws
          return ws <= e && we >= s
        })
      }
      case 'nam':
        return allWeeks.filter(w => w.year === nam)
    }
  })() : []
  const filteredWeekIds = new Set(filteredWeeks.map(w => w.id))
  const filteredStats   = allStats.filter(s => filteredWeekIds.has(s.week_id))
  // Tất cả tuần từ cache (mọi năm), sắp xếp tăng dần theo thời gian
  const allKnownWeeks = Object.values(cache)
    .flatMap(c => c.weeks)
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week_number - b.week_number)
  // Navigation tuần: nhảy theo danh sách tuần thực sự có trong DB
  function navToStoredWeek(delta: -1 | 1) {
    if (allKnownWeeks.length === 0) return
    const idx = allKnownWeeks.findIndex(w => w.year === weekYear && w.week_number === weekNum)
    const nextIdx = idx === -1
      ? (delta === -1 ? allKnownWeeks.length - 1 : 0)
      : Math.max(0, Math.min(allKnownWeeks.length - 1, idx + delta))
    const target = allKnownWeeks[nextIdx]
    setWeekYear(target.year); setWeekNum(target.week_number)
  }
  function goToLatestWeek() {
    if (allKnownWeeks.length === 0) return
    const latest = allKnownWeeks[allKnownWeeks.length - 1]
    setWeekYear(latest.year); setWeekNum(latest.week_number)
  }
  // Format date_start / date_end thành "dd/mm"
  function fmtShortDate(s: string | null | undefined): string {
    if (!s) return ''
    const [, m, d] = s.split('-')
    return `${d}/${m}`
  }
  // Period label
  const periodLabel = (() => {
    switch (periodMode) {
      case 'tuan': {
        // Use the SELECTED week's dates, not filteredWeeks[0] (which may be a different week)
        const selectedWeek = allWeeks.find(w => w.year === weekYear && w.week_number === weekNum)
          ?? filteredWeeks[0]
        if (selectedWeek?.date_start) {
          const range = selectedWeek.date_end
            ? `${fmtShortDate(selectedWeek.date_start)} – ${fmtShortDate(selectedWeek.date_end)}`
            : fmtShortDate(selectedWeek.date_start)
          return range
        }
        // Fallback nếu chưa có date_start
        return selectedWeek?.week_label ?? `Tuần ${weekNum} / ${weekYear}`
      }
      case 'thang': return `Tháng ${month} / ${monthYear}`
      case 'range': return rangeStart && rangeEnd ? `${fmtDateStr(rangeStart)} → ${fmtDateStr(rangeEnd)}` : 'Chọn khoảng ngày'
      case 'nam':   return `Năm ${nam}`
    }
  })()
  // Multi-week chart data
  const weekDeviceTotals: Array<{ week: RepairWeek } & Record<string, number>> = filteredWeeks.map(week => {
    const row: Record<string, number> = { total: 0 }
    DEVICE_TYPES.forEach(dt => {
      const qty = calcBanGiao(filteredStats, week.id, dt)
      row[dt] = qty; row.total += qty
    })
    return { week, ...row } as { week: RepairWeek } & Record<string, number>
  })
  const lineChartData = weekDeviceTotals.map(r => ({
    name: `T${r.week.week_number}`,
    ...Object.fromEntries(selectedDevices.map(dt => [dt, (r as Record<string, unknown>)[dt] as number ?? 0]))
  }))
  const barChartData = filteredWeeks.map(week => {
    const entry: Record<string, unknown> = { name: `T${week.week_number}` }
    STATUS_TYPES.forEach(st => {
      entry[st.label] = filteredStats
        .filter(s => s.week_id === week.id && s.status_type === st.key)
        .reduce((a, s) => a + s.quantity, 0)
    })
    return entry
  })
  // Nav button style
  const navBtn = 'w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 text-sm font-bold'
  return (
    <div className="space-y-5">
      {/* ── Period selector ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl shrink-0">
            {([
              { key: 'tuan',  label: t.suaChua.periodWeek  },
              { key: 'thang', label: t.suaChua.periodMonth },
              { key: 'range', label: t.suaChua.periodRange },
              { key: 'nam',   label: t.suaChua.periodYear  },
            ] as { key: PeriodMode; label: string }[]).map(m => (
              <button key={m.key} onClick={() => setPeriodMode(m.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${periodMode === m.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >{m.label}</button>
            ))}
          </div>
          {/* Navigator */}
          <div className="flex items-center gap-2 flex-wrap">
            {periodMode === 'tuan' && (
              <>
                <button className={navBtn} onClick={() => navToStoredWeek(-1)}
                  disabled={allKnownWeeks.length === 0}>‹</button>
                <span className="text-sm font-semibold text-gray-800 min-w-[140px] text-center">{periodLabel}</span>
                <button className={navBtn} onClick={() => navToStoredWeek(1)}
                  disabled={allKnownWeeks.length === 0}>›</button>
                <button onClick={goToLatestWeek}
                  className="text-xs text-[#164d81] hover:underline ml-1">{t.suaChua.goLatest}</button>
              </>
            )}
            {periodMode === 'thang' && (
              <>
                <button className={navBtn}
                  onClick={() => { const n = navigateMonth(monthYear, month, -1); setMonthYear(n.year); setMonth(n.month) }}>‹</button>
                <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">{periodLabel}</span>
                <button className={navBtn}
                  onClick={() => { const n = navigateMonth(monthYear, month, 1); setMonthYear(n.year); setMonth(n.month) }}>›</button>
              </>
            )}
            {periodMode === 'range' && (
              <>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700" />
                <span className="text-gray-400 text-sm">→</span>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700" />
              </>
            )}
            {periodMode === 'nam' && (
              <>
                <button className={navBtn} onClick={() => setNam(y => y - 1)}>‹</button>
                <span className="text-sm font-semibold text-gray-800 min-w-[70px] text-center">{periodLabel}</span>
                <button className={navBtn} onClick={() => setNam(y => y + 1)}>›</button>
              </>
            )}
          </div>
        </div>
        {/* Device filter pills */}
        <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500 shrink-0">{t.suaChua.deviceLabel}</span>
          <button
            onClick={() => setSelectedDevice('all')}
            className={`px-3 py-1 text-xs rounded-full border transition ${selectedDevice === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
          >{t.suaChua.deviceAll}</button>
          {DEVICE_TYPES.map(dt => (
            <button key={dt}
              onClick={() => setSelectedDevice(selectedDevice === dt ? 'all' : dt)}
              className={`px-2.5 py-1 text-xs rounded-full border transition ${selectedDevice === dt ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
              style={selectedDevice === dt ? { background: DEVICE_COLORS[dt] } : {}}
            >{dt}</button>
          ))}
        </div>
      </div>
      {/* ── Loading ── */}
      {(loading || !dataReady) && <LoadingSpinner />}
      {/* ── Empty ── */}
      {!loading && dataReady && filteredWeeks.length === 0 && (
        <EmptyState msg={`${t.suaChua.noDataFor} ${periodLabel}`} />
      )}
      {/* ── Single-week view ── */}
      {!loading && dataReady && filteredWeeks.length === 1 && (
        <SingleWeekView week={filteredWeeks[0]} stats={filteredStats} deviceFilter={selectedDevice} />
      )}
      {/* ── Multi-week view ── */}
      {!loading && dataReady && filteredWeeks.length > 1 && (
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'table', label: t.suaChua.chartModeTable },
              { key: 'line',  label: t.suaChua.chartModeLine  },
              { key: 'bar',   label: t.suaChua.chartModeBar   },
            ] as { key: 'table' | 'line' | 'bar'; label: string }[]).map(m => (
              <button key={m.key} onClick={() => setChartMode(m.key)}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition ${chartMode === m.key ? 'bg-[#A70A0A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >{m.label}</button>
            ))}
          </div>
          {/* TABLE */}
          {chartMode === 'table' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{t.suaChua.deviceByWeekTitle}</h3>
                <span className="text-xs text-gray-400">{filteredWeeks.length} tuần</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[120px]">{t.suaChua.colWeek}</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-800 border-r border-gray-200">{t.suaChua.colTotal}</th>
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
                                : <span className="text-gray-200">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50 z-10">{t.suaChua.colTotal}</td>
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
          {/* LINE CHART */}
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
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.suaChua.lineChartTitle}</h3>
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
          {/* BAR CHART */}
          {chartMode === 'bar' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.suaChua.barChartTitle}</h3>
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
          {/* Summary KPI cards */}
          {(() => {
            const devFilteredStats = selectedDevice === 'all' ? filteredStats : filteredStats.filter(s => s.device_type === selectedDevice)
            const totalBanGiao = devFilteredStats.reduce((a, s) => a + s.quantity, 0)
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">{t.suaChua.kpiBanGiao}</p>
                  <p className="text-2xl font-bold text-gray-900">{totalBanGiao.toLocaleString() || '—'}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{periodLabel}</p>
                </div>
                {STATUS_TYPES.map(st => {
                  const total = devFilteredStats.filter(s => s.status_type === st.key).reduce((a, s) => a + s.quantity, 0)
                  const pct = totalBanGiao > 0 ? Math.round(total / totalBanGiao * 100) : 0
                  return (
                    <div key={st.key} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 mb-1">{getStatusLabel(st.key, t)}</p>
                      <p className="text-2xl font-bold" style={{ color: st.color }}>{total.toLocaleString() || '—'}</p>
                      {totalBanGiao > 0 && total > 0 && <p className="text-[10px] text-gray-400 mt-1">{pct}%</p>}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
      {/* ── Analytics section (always shown when data exists) ── */}
      {!loading && dataReady && filteredWeeks.length > 0 && (
        <AnalyticsSection stats={filteredStats} selectedDevice={selectedDevice} />
      )}
    </div>
  )
}
// ── Fault config management panel ────────────────────────────
// ── Hashtag Mini Panel (dùng trong tab Cập nhật) ──────────────
interface HashtagEntry { tag: string; count: number; deviceCount: number; topProducts: { product_name: string; count: number }[] }
function HashtagMiniPanel() {
  const [data, setData]       = useState<{ tags: HashtagEntry[]; totalWithNotes: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/repair-tracking/hashtags')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  if (loading) return <div className="py-6 text-center text-sm text-gray-400">Đang tải hashtag...</div>
  if (!data || data.tags.length === 0) return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
      <p className="text-2xl mb-1">🏷</p>
      <p>Chưa có hashtag nào</p>
      <p className="text-xs mt-1 text-gray-300">Kỹ thuật ghi #tag vào ghi chú khi hoàn thành sửa chữa tại tab Theo dõi</p>
    </div>
  )
  const maxCount = data.tags[0]?.count ?? 1
  const selectedEntry = selected ? data.tags.find(x => x.tag === selected) : null
  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-indigo-800">🏷 Phân tích lỗi theo Hashtag</h4>
            <p className="text-xs text-indigo-500 mt-0.5">{data.tags.length} loại lỗi · {data.totalWithNotes.toLocaleString()} thiết bị có ghi chú</p>
          </div>
          {selected && <button onClick={() => setSelected(null)} className="text-xs text-indigo-400 hover:text-indigo-600">✕ Bỏ chọn</button>}
        </div>
        <div className="flex flex-wrap gap-2">
          {data.tags.map(entry => {
            const size = 0.75 + (entry.count / maxCount) * 0.45
            const isActive = selected === entry.tag
            return (
              <button key={entry.tag} onClick={() => setSelected(isActive ? null : entry.tag)}
                style={{ fontSize: `${size}rem` }}
                className={`px-2 py-0.5 rounded-lg border transition-all ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
                #{entry.tag}<span className="ml-1 text-xs opacity-60">{entry.count}</span>
              </button>
            )
          })}
        </div>
        {selectedEntry && (
          <div className="mt-4 pt-4 border-t border-indigo-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-2">Thiết bị hay gặp</p>
              {selectedEntry.topProducts.map(p => (
                <div key={p.product_name} className="flex justify-between text-xs py-0.5">
                  <span className="text-gray-700 truncate">{p.product_name}</span>
                  <span className="text-indigo-600 font-medium ml-2">{p.count}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-2">Tổng quan</p>
              <p className="text-xs text-gray-600">{selectedEntry.count} lần xuất hiện</p>
              <p className="text-xs text-gray-600">{selectedEntry.deviceCount} thiết bị khác nhau</p>
            </div>
          </div>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top 10 lỗi phổ biến</h4>
        <div className="space-y-2">
          {data.tags.slice(0, 10).map(entry => (
            <div key={entry.tag} className="flex items-center gap-3">
              <span className="text-xs text-indigo-600 font-mono w-32 truncate">#{entry.tag}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${entry.count / maxCount * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-10 text-right">{entry.count}×</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
// ── Hashtag Standard Table ─────────────────────────────────────
function toHashtagStr(name: string): string {
  const map: Record<string,string> = {
    'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ắ':'a','ằ':'a','ặ':'a','ẳ':'a','ẵ':'a',
    'â':'a','ấ':'a','ầ':'a','ậ':'a','ẩ':'a','ẫ':'a','è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
    'ê':'e','ế':'e','ề':'e','ệ':'e','ể':'e','ễ':'e','ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
    'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ố':'o','ồ':'o','ộ':'o','ổ':'o','ỗ':'o',
    'ơ':'o','ớ':'o','ờ':'o','ợ':'o','ở':'o','ỡ':'o','ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
    'ư':'u','ứ':'u','ừ':'u','ự':'u','ử':'u','ữ':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y',
    'đ':'d','Đ':'D',
  }
  return '#' + name.split('').map(c => map[c] ?? c).join('')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function HashtagStandardTable({ faultConfigs }: { faultConfigs: Record<string, string[]> }) {
  const [activeStatus, setActiveStatus] = useState('da_sua')
  const STATUS_LABELS: Record<string, string> = {
    da_sua: 'Đã sửa', gui_bao_hanh: 'Gửi bảo hành',
    khong_loi: 'Không lỗi', hong_han: 'Hỏng hẳn', cho_sua: 'Chờ sửa',
  }
  // Unique fault types for active status
  const faults = faultConfigs[activeStatus] ?? []
  const allUniq = Array.from(new Set(Object.values(faultConfigs).flat()))
  function copyAll() {
    const text = faults.map(f => toHashtagStr(f)).join(' ')
    navigator.clipboard.writeText(text).catch(()=>{})
  }
  return (
    <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-indigo-800">📋 Bảng hashtag chuẩn</h4>
          <p className="text-xs text-indigo-500 mt-0.5">Kỹ thuật dùng hashtag này khi ghi chú hoàn thành sửa chữa</p>
        </div>
        <button onClick={copyAll} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          📋 Copy tất cả
        </button>
      </div>
      <div className="flex gap-0 border-b border-indigo-100 overflow-x-auto">
        {Object.keys(STATUS_LABELS).filter(k => faultConfigs[k]?.length > 0).map(k => (
          <button key={k} onClick={() => setActiveStatus(k)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeStatus===k?'border-indigo-600 text-indigo-700 bg-indigo-50':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {STATUS_LABELS[k]}
          </button>
        ))}
        <button onClick={() => setActiveStatus('all')}
          className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeStatus==='all'?'border-indigo-600 text-indigo-700 bg-indigo-50':'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Tất cả ({allUniq.length})
        </button>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {(activeStatus === 'all' ? allUniq : faults).map(fault => (
          <div key={fault} className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2 group">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 truncate">{fault}</p>
              <p className="text-xs font-mono text-indigo-600 font-medium">{toHashtagStr(fault)}</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(toHashtagStr(fault)).catch(()=>{})}
              className="ml-2 text-indigo-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
              📋
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
function FaultConfigPanel({
  faultConfigs,
  onAdd,
  onDelete,
}: {
  faultConfigs: Record<string, string[]>
  onAdd: (status: string, fault: string) => Promise<void>
  onDelete: (status: string, fault: string) => Promise<void>
}) {
  const { t } = useLanguage()
  const [activeStatus, setActiveStatus] = useState('da_sua')
  const [newFault, setNewFault] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  async function handleAdd() {
    if (!newFault.trim()) return
    setSaving(true)
    try {
      await onAdd(activeStatus, newFault.trim())
      setNewFault('')
      setMsg('Đã thêm!')
    } catch { setMsg('Lỗi khi thêm') }
    setSaving(false)
    setTimeout(() => setMsg(''), 2000)
  }
  async function handleDelete(fault: string) {
    if (!confirm(`Xóa "${fault}" khỏi "${STATUS_TYPES.find(s => s.key === activeStatus)?.label}"?`)) return
    try {
      await onDelete(activeStatus, fault)
      setMsg('Đã xóa!')
    } catch { setMsg('Lỗi khi xóa') }
    setTimeout(() => setMsg(''), 2000)
  }
  const faults = faultConfigs[activeStatus] ?? []
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">{t.suaChua.faultConfigTitle}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t.suaChua.faultConfigDesc}</p>
        </div>
        {/* Status tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {STATUS_TYPES.map(st => (
            <button key={st.key} onClick={() => setActiveStatus(st.key)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition ${activeStatus === st.key ? 'border-b-2' : 'text-gray-500 hover:text-gray-700'}`}
              style={activeStatus === st.key ? { borderColor: st.color, background: st.color + '15', color: st.color } : {}}
            >
              {getStatusLabel(st.key, t)}
              <span className="ml-1 font-normal opacity-60">({(faultConfigs[st.key] ?? []).length})</span>
            </button>
          ))}
        </div>
        <div className="p-4">
          {/* Fault list */}
          <div className="space-y-1 mb-4 max-h-96 overflow-y-auto">
            {faults.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">{t.suaChua.noFaultTypes}</p>
            )}
            {faults.map((fault, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 group">
                <span className="text-xs text-gray-700 font-medium">{fault}</span>
                <button onClick={() => handleDelete(fault)}
                  className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition font-bold ml-2"
                  title="Xóa"
                >✕</button>
              </div>
            ))}
          </div>
          {/* Add new */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            <input
              type="text"
              value={newFault}
              onChange={e => setNewFault(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !saving && handleAdd()}
              placeholder={t.suaChua.newFaultPlaceholder}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-400"
            />
            <button onClick={handleAdd} disabled={saving || !newFault.trim()}
              className="px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition disabled:opacity-50"
              style={{ background: '#164d81' }}
            >{saving ? '...' : t.suaChua.addFaultBtn}</button>
            {msg && <span className="text-xs text-green-600 shrink-0">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
// ── Tab: Nhập liệu ─────────────────────────────────────────────
function EntryTab({ onSaved, faultConfigs }: { onSaved: () => void; faultConfigs: Record<string, string[]> }) {
  const { t } = useLanguage()
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
  // Sparse state — keys are created on demand when user types
  const [stats, setStats] = useState<Record<string, Record<string, Record<string, number>>>>({})
  // Dữ liệu hiện có trong DB (để hiển thị "ai đã nhập")
  const [existingStats, setExistingStats] = useState<RepairStat[]>([])
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [activeStatus, setActiveStatus] = useState('da_sua')
  const [mode, setMode] = useState<'entry' | 'preview'>('entry')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // Tải dữ liệu hiện có mỗi khi tuần thay đổi
  useEffect(() => {
    const wn = derivedInfo.week_number
    const yr = derivedInfo.year
    if (!wn || !yr) return
    setLoadingExisting(true)
    fetch(`/api/sua-chua/stats?year=${yr}`)
      .then(r => r.json())
      .then(d => {
        const weeks: Array<{ id: string; week_number: number; year: number }> = d.weeks ?? []
        const week = weeks.find(w => w.week_number === wn && w.year === yr)
        if (!week) { setExistingStats([]); setLoadingExisting(false); return }
        return fetch(`/api/sua-chua/stats?week_id=${week.id}`)
          .then(r => r.json())
          .then(d2 => {
            const existingRows: RepairStat[] = d2.stats ?? []
            setExistingStats(existingRows)
            // Pre-populate stats state với giá trị hiện có
            setStats(prev => {
              const next = { ...prev }
              existingRows.forEach(s => {
                if (!next[s.status_type]) next[s.status_type] = {}
                if (!next[s.status_type][s.fault_type]) next[s.status_type][s.fault_type] = {}
                // Chỉ điền nếu chưa có (không ghi đè giá trị đang nhập)
                if (!next[s.status_type][s.fault_type][s.device_type]) {
                  next[s.status_type][s.fault_type][s.device_type] = s.quantity
                }
              })
              return next
            })
          })
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedInfo.week_number, derivedInfo.year])
  // Helper: lấy thông tin người đã nhập ô này từ DB
  function getExistingStat(status: string, fault: string, device: string): RepairStat | undefined {
    return existingStats.find(
      s => s.status_type === status && s.fault_type === fault && s.device_type === device && s.quantity > 0
    )
  }
  // Rút gọn tên người nhập để hiển thị nhỏ (lấy phần trước @ hoặc tên đầu)
  function shortName(name: string | null | undefined): string {
    if (!name) return '?'
    const n = name.split('@')[0] // nếu là email, lấy phần trước @
    return n.length > 8 ? n.substring(0, 8) : n
  }
  function setCellValue(statusKey: string, fault: string, device: string, val: number) {
    setStats(prev => ({
      ...prev,
      [statusKey]: {
        ...(prev[statusKey] ?? {}),
        [fault]: { ...(prev[statusKey]?.[fault] ?? {}), [device]: val }
      }
    }))
  }
  // Tính tổng theo status × device cho preview
  function getStatusDeviceTotal(statusKey: string, deviceType: string): number {
    return (faultConfigs[statusKey] ?? []).reduce(
      (a, ft) => a + (stats[statusKey]?.[ft]?.[deviceType] || 0), 0
    )
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
        ;(faultConfigs[st.key] ?? []).forEach(ft => {
          DEVICE_TYPES.forEach(dt => {
            statsFlat.push({ status_type: st.key, fault_type: ft, device_type: dt, quantity: stats[st.key]?.[ft]?.[dt] || 0 })
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
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.suaChua.weekPeriod}</h3>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t.suaChua.fromDate}</label>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t.suaChua.toDate}</label>
            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {t.suaChua.weekPrefix} <strong className="text-gray-700">
            {derivedInfo.week_label} {displayLabel !== derivedInfo.week_label ? `(${displayLabel})` : ''}
          </strong>
        </p>
      </div>
      {/* Entry table (hidden in preview mode) */}
      {mode === 'entry' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto items-center">
              {STATUS_TYPES.map(st => (
                <button key={st.key} onClick={() => setActiveStatus(st.key)}
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition ${activeStatus === st.key ? 'border-b-2' : 'text-gray-500 hover:text-gray-700'}`}
                  style={activeStatus === st.key ? { borderColor: st.color, background: st.color + '15', color: st.color } : {}}
                >{getStatusLabel(st.key, t)}</button>
              ))}
              {loadingExisting && (
                <span className="ml-auto px-3 text-xs text-blue-400 animate-pulse">Đang tải dữ liệu tuần...</span>
              )}
              {!loadingExisting && existingStats.length > 0 && (
                <span className="ml-auto px-3 text-xs text-gray-400">
                  🔵 = đã có dữ liệu (hover để xem ai nhập)
                </span>
              )}
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 bg-gray-50 sticky left-0 z-10 min-w-[120px]">{t.suaChua.colFaultType}</th>
                    {DEVICE_TYPES.map(dt => <th key={dt} className="px-2 py-2 text-center font-medium text-gray-500 bg-gray-50 min-w-[55px]">{dt}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(faultConfigs[activeStatus] ?? []).map((fault, fi) => (
                    <tr key={fault} className={fi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-3 py-1.5 font-medium text-gray-700 sticky left-0 bg-inherit">{fault}</td>
                      {DEVICE_TYPES.map(dt => {
                        const existing = getExistingStat(activeStatus, fault, dt)
                        const hasExisting = !!existing
                        return (
                          <td key={dt} className="px-1 py-1">
                            <div className="relative">
                              <input type="number" min={0}
                                value={stats[activeStatus]?.[fault]?.[dt] || ''}
                                onChange={e => setCellValue(activeStatus, fault, dt, +e.target.value)}
                                className={`w-full border rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:border-blue-400 ${hasExisting ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}
                                placeholder="0"
                                title={hasExisting ? `Đã nhập bởi: ${existing.submitted_by || '?'}` : ''}
                              />
                              {hasExisting && existing.submitted_by && (
                                <span
                                  className="absolute -top-1.5 -right-1 text-[8px] font-bold px-1 rounded-full leading-none"
                                  style={{ background: '#3b82f6', color: '#fff' }}
                                  title={`Nhập bởi: ${existing.submitted_by}`}
                                >
                                  {shortName(existing.submitted_by)}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      })}
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
            >{t.suaChua.viewStats}</button>
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
                <h3 className="text-sm font-semibold text-gray-700">{t.suaChua.reviewTitle}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{derivedInfo.week_label} — {displayLabel}</p>
              </div>
              <span className="text-xs font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
                {t.suaChua.banGiaoTotal} {getGrandTotal()}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[110px]">{t.suaChua.colStatus}</th>
                    {DEVICE_TYPES.map(dt => (
                      <th key={dt} className="px-2 py-2 text-right font-medium text-gray-500 min-w-[48px]">{dt}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-l border-gray-200">{t.suaChua.colTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_TYPES.map((st, i) => (
                    <tr key={st.key} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-3 py-2 font-medium sticky left-0 bg-inherit" style={{ color: st.color }}>{getStatusLabel(st.key, t)}</td>
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
                    <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50">{t.suaChua.kpiBanGiao}</td>
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
            >{t.suaChua.backToEdit}</button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50"
              style={{ background: '#A70A0A' }}
            >{saving ? (t.common.saving ?? 'Đang lưu...') : t.suaChua.confirmSave}</button>
            {msg && <p className="text-sm">{msg}</p>}
          </div>
        </>
      )}
    </div>
  )
}
// ── Tab: Lịch sử + Import ──────────────────────────────────────
function HistoryTab({ refreshKey, canWrite }: { refreshKey: number; canWrite: boolean }) {
  const { t } = useLanguage()
  const [weeks, setWeeks] = useState<RepairWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<RepairWeek | null>(null)
  const [weekData, setWeekData] = useState<{ stats: RepairStat[]; totals: RepairTotal[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [editingDates, setEditingDates] = useState(false)
  const [editDateStart, setEditDateStart] = useState('')
  const [editDateEnd, setEditDateEnd] = useState('')
  const [savingDates, setSavingDates] = useState(false)
  const loadWeeks = useCallback(async () => {
    setLoading(true)
    const d = await fetch('/api/sua-chua/weeks').then(r => r.json())
    setWeeks(d.weeks ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { loadWeeks() }, [loadWeeks, refreshKey])
  async function loadWeekDetail(week: RepairWeek) {
    setSelectedWeek(week)
    setEditingDates(false)
    setEditDateStart(week.date_start ?? '')
    setEditDateEnd(week.date_end ?? '')
    const d = await fetch(`/api/sua-chua/stats?week_id=${week.id}`).then(r => r.json())
    setWeekData(d)
  }
  async function handleSaveDates() {
    if (!selectedWeek) return
    setSavingDates(true)
    const res = await fetch('/api/sua-chua/weeks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_id: selectedWeek.id, date_start: editDateStart || null, date_end: editDateEnd || null }),
    })
    const d = await res.json()
    if (!res.ok) { alert('Lỗi: ' + d.error); setSavingDates(false); return }
    // Update local state
    const updated = { ...selectedWeek, date_start: editDateStart || null, date_end: editDateEnd || null }
    setSelectedWeek(updated)
    setWeeks(prev => prev.map(w => w.id === updated.id ? updated : w))
    setEditingDates(false)
    setSavingDates(false)
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
      {canWrite && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-amber-800">{t.suaChua.historyImportTitle}</p>
            <p className="text-xs text-amber-600 mt-0.5">{t.suaChua.historyImportDesc}</p>
          </div>
          <div className="flex items-center gap-3">
            {importResult && <p className="text-xs">{importResult}</p>}
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition disabled:opacity-50"
              style={{ background: '#164d81' }}
            >{importing ? (t.common.loading ?? 'Đang import...') : t.suaChua.importFromSheets}</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">{t.suaChua.weekList} ({weeks.length})</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
            {weeks.length === 0 && <p className="text-xs text-gray-400 text-center py-8">{t.suaChua.noData}</p>}
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
            <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm">{t.suaChua.chooseWeek}</div>
          ) : !weekData ? (
            <LoadingSpinner />
          ) : (
            <div>
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{selectedWeek.week_label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.suaChua.kpiBanGiao}: <strong className="text-gray-700">{calcBanGiao(weekData.stats, selectedWeek.id)}</strong> {t.suaChua.kpiDevices}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2 items-center">
                      <button onClick={() => setEditingDates(e => !e)} className="text-xs text-blue-500 hover:underline">📅 Sửa ngày</button>
                      <button onClick={() => handleDelete(selectedWeek.id)} className="text-xs text-red-500 hover:text-red-700">🗑 Xóa</button>
                    </div>
                  )}
                </div>
                {editingDates && (
                  <div className="mt-3 flex gap-2 items-end flex-wrap">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">{t.suaChua.fromDate}</label>
                      <input type="date" value={editDateStart} onChange={e => setEditDateStart(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">{t.suaChua.toDate}</label>
                      <input type="date" value={editDateEnd} onChange={e => setEditDateEnd(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs" />
                    </div>
                    <button onClick={handleSaveDates} disabled={savingDates}
                      className="px-3 py-1 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
                      style={{ background: '#164d81' }}
                    >{savingDates ? 'Đang lưu...' : '✓ Lưu ngày'}</button>
                    <button onClick={() => setEditingDates(false)} className="text-xs text-gray-400 hover:text-gray-600">Huỷ</button>
                  </div>
                )}
                {selectedWeek.date_start && !editingDates && (
                  <p className="text-xs text-blue-500 mt-1">
                    📅 {fmtDateStr(selectedWeek.date_start)}{selectedWeek.date_end ? ` – ${fmtDateStr(selectedWeek.date_end)}` : ''}
                  </p>
                )}
              </div>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">{t.suaChua.byDeviceType}</p>
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
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">{t.suaChua.repairResults}</p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_TYPES.map(st => {
                    const sum = weekData.stats.filter(s => s.week_id === selectedWeek.id && s.status_type === st.key).reduce((a, s) => a + s.quantity, 0)
                    return (
                      <div key={st.key} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: st.color + '12' }}>
                        <span className="text-xs font-medium" style={{ color: st.color }}>{getStatusLabel(st.key, t)}</span>
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
  const { t } = useLanguage()
  return (
    <div className="flex items-center justify-center h-48 gap-2 text-gray-400">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin" />
      <span className="text-sm">{t.common.loading}</span>
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
  const { t, lang } = useLanguage()
  const canWrite = permissions.includes('sua_chua:write') || permissions.includes('admin:users')
  const [tab, setTab] = useState<'dashboard' | 'entry' | 'history' | 'config' | 'tracking'>('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)
  const [faultConfigs, setFaultConfigs] = useState<Record<string, string[]>>(DEFAULT_FAULT_TYPES_BY_STATUS)
  useEffect(() => {
    fetch('/api/sua-chua/fault-configs')
      .then(r => r.json())
      .then(d => { if (d.configs) setFaultConfigs(d.configs) })
      .catch(() => {})
  }, [])
  async function handleAddFault(status: string, fault: string) {
    await fetch('/api/sua-chua/fault-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_type: status, fault_type: fault }),
    })
    setFaultConfigs(prev => ({
      ...prev,
      [status]: [...(prev[status] ?? []), fault],
    }))
  }
  async function handleDeleteFault(status: string, fault: string) {
    await fetch('/api/sua-chua/fault-configs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_type: status, fault_type: fault }),
    })
    setFaultConfigs(prev => ({
      ...prev,
      [status]: (prev[status] ?? []).filter(f => f !== fault),
    }))
  }
  const tabs: Array<{ key: 'dashboard' | 'entry' | 'history' | 'config' | 'tracking'; label: string }> = [
    { key: 'dashboard', label: `📊 ${t.suaChua.tabDashboard}` },
    ...(canWrite ? [{ key: 'entry' as const, label: `✏️ ${t.suaChua.tabEntry}` }] : []),
    { key: 'history',   label: `🗂 ${t.suaChua.tabHistory}` },
    { key: 'tracking',  label: lang === 'vi' ? '📋 Thống kê sửa chữa' : '📋 Repair Tracking' },
    ...(canWrite ? [{ key: 'config' as const, label: `⚙️ ${t.common.update}` }] : []),
  ]
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🔧 {t.suaChua.title}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t.suaChua.tabDashboard}</p>
          </div>
          {userEmail && (
            <span className="text-xs text-gray-400">{userEmail}</span>
          )}
        </div>
        <div className="flex gap-1 mt-3 border-b border-gray-100">
          {tabs.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${tab === tb.key ? 'bg-white text-[#A70A0A] border border-b-white border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
            >{tb.label}</button>
          ))}
        </div>
      </div>
      <div className="px-6 py-5">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'entry'     && <EntryTab onSaved={() => setRefreshKey(k => k + 1)} faultConfigs={faultConfigs} />}
        {tab === 'history'   && <HistoryTab refreshKey={refreshKey} canWrite={canWrite} />}
        {tab === 'tracking'  && <RepairTrackingDashboard externalLang={lang} />}
        {tab === 'config'    && (
          <div className="space-y-8">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">{lang === 'vi' ? '📋 Bảng hashtag chuẩn' : '📋 Hashtag Standard'}</h2>
              <HashtagStandardTable faultConfigs={faultConfigs} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">📊 {lang === 'vi' ? 'Phân tích lỗi theo Hashtag' : 'Hashtag Fault Analysis'}</h2>
              <HashtagMiniPanel />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">⚙️ {lang === 'vi' ? 'Cấu hình loại lỗi' : 'Fault Type Config'}</h2>
              <FaultConfigPanel
                faultConfigs={faultConfigs}
                onAdd={handleAddFault}
                onDelete={handleDeleteFault}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
        )}
      </div>
    </div>
  )
}
            