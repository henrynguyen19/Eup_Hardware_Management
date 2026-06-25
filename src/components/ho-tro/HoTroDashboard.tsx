'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  LineChart,
  PieChart,
  Bar,
  Line,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { SUMMARY_SHEET_ID, getAvailableMonths } from '@/lib/staff-sheets'
import type { StaffConfig } from '@/lib/staff-sheets'
import type { DailyRecord } from '@/types/ho-tro'

const AddTicketForm  = dynamic(() => import('./AddTicketForm'),  { ssr: false })
const JiraBugsTab    = dynamic(() => import('@/components/jira/JiraBugsTab'), { ssr: false })
const TicketTable    = dynamic(() => import('./TicketTable'), { ssr: false })

interface Props {
  userEmail: string
  isAdmin: boolean
  canWrite: boolean
  staffConfig: StaffConfig | null
  allStaff: StaffConfig[]
}

const MONTHS = getAvailableMonths()

// ── Colours ──────────────────────────────────────────────────────
const STAFF_COLORS: Record<string, string> = {
  Kane:   '#3b82f6',
  Stefan: '#a855f7',
  Shiro:  '#22c55e',
  Irene:  '#ec4899',
  Blue:   '#f97316',
}
const DEVICE_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#10b981','#f97316','#6366f1','#14b8a6']
const ERROR_COLORS  = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#10b981','#f97316','#6366f1','#14b8a6','#e11d48','#84cc16']

// ── Helpers ───────────────────────────────────────────────────────
function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0
}

function sumObj(records: DailyRecord[], key: keyof DailyRecord) {
  const result: Record<string, number> = {}
  for (const r of records) {
    const obj = r[key] as Record<string, number>
    for (const [k, v] of Object.entries(obj)) result[k] = (result[k] ?? 0) + v
  }
  return result
}

/** "01/06/2026" → "01/6" for axis labels */
function shortDate(d: string) {
  const [dd, mm] = d.split('/')
  return `${dd}/${parseInt(mm)}`
}

/** Merge per-staff DailyRecord[] into one combined record per date */
function mergeStaffRecords(staffMap: Record<string, DailyRecord[]>): DailyRecord[] {
  const byDate = new Map<string, DailyRecord>()
  for (const records of Object.values(staffMap)) {
    for (const r of records) {
      if (!byDate.has(r.sortKey)) {
        byDate.set(r.sortKey, {
          ...r,
          devices:    { ...r.devices },
          resolution: { ...r.resolution },
          locations:  { ...r.locations },
          channels:   { ...r.channels },
          errors:     { ...r.errors },
          pm_types:          { ...(r.pm_types ?? {}) },
          device_error_pairs: { ...(r.device_error_pairs ?? {}) },
        })
      } else {
        const ex = byDate.get(r.sortKey)!
        ex.total_requests += r.total_requests
        ex.avg_time = Math.round((ex.avg_time + r.avg_time) / 2)
        ex.max_time = Math.max(ex.max_time, r.max_time)
        for (const [k, v] of Object.entries(r.devices))    ex.devices[k]    = (ex.devices[k] ?? 0) + v
        for (const [k, v] of Object.entries(r.resolution)) ex.resolution[k] = (ex.resolution[k] ?? 0) + v
        for (const [k, v] of Object.entries(r.locations))  ex.locations[k]  = (ex.locations[k] ?? 0) + v
        for (const [k, v] of Object.entries(r.channels))   ex.channels[k]   = (ex.channels[k] ?? 0) + v
        for (const [k, v] of Object.entries(r.errors))     ex.errors[k]     = (ex.errors[k] ?? 0) + v
        for (const [k, v] of Object.entries(r.pm_types ?? {}))            ex.pm_types[k]            = (ex.pm_types[k] ?? 0) + v
        for (const [k, v] of Object.entries(r.device_error_pairs ?? {})) ex.device_error_pairs[k]  = (ex.device_error_pairs[k] ?? 0) + v
      }
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

/** Group each staff's records into weekly buckets */
function buildWeeklyStaff(staffMap: Record<string, DailyRecord[]>, names: string[]) {
  const weekMap = new Map<string, Record<string, number>>()
  for (const name of names) {
    for (const r of staffMap[name] ?? []) {
      if (!r.total_requests) continue
      const [d] = r.date.split('/').map(Number)
      const week = `T${Math.ceil(d / 7)}`
      if (!weekMap.has(week)) weekMap.set(week, {})
      const wk = weekMap.get(week)!
      wk[name] = (wk[name] ?? 0) + r.total_requests
    }
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
    .map(([week, vals]) => ({ week, ...vals }))
}

// ── Shared UI components ──────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = 'blue', onClick }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string; onClick?: () => void
}) {
  const bg: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200',   green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200', purple: 'bg-purple-50 border-purple-200',
    red:    'bg-red-50 border-red-200',     teal: 'bg-teal-50 border-teal-200',
  }
  const tx: Record<string, string> = {
    blue: 'text-blue-700', green: 'text-green-700', orange: 'text-orange-700',
    purple: 'text-purple-700', red: 'text-red-700', teal: 'text-teal-700',
  }
  const cls = `rounded-xl border p-4 ${bg[color] ?? bg.blue}${onClick ? ' cursor-pointer hover:shadow-md transition-shadow' : ''}`
  return (
    <div className={cls} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
          <p className={`text-2xl font-bold ${tx[color] ?? tx.blue}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          {onClick && <p className="text-xs text-red-400 mt-1">Bam de xem chi tiet</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

function HorizBar({ data, total, color = 'bg-blue-500', maxBars = 6 }: {
  data: Record<string, number>; total: number; color?: string; maxBars?: number
}) {
  const sorted = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, maxBars)
  if (!sorted.length) return <p className="text-xs text-gray-400">Không có dữ liệu</p>
  const max = sorted[0][1]
  return (
    <div className="space-y-2">
      {sorted.map(([label, val]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-gray-600 truncate flex-shrink-0">{label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div className={`h-4 rounded-full ${color} transition-all`} style={{ width: `${(val / max) * 100}%` }} />
          </div>
          <span className="w-16 text-right text-gray-700 font-medium">
            {val} <span className="text-gray-400 font-normal">({pct(val, total)}%)</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Summary Dashboard (Tổng quan) ─────────────────────────────────
function SummaryView({
  staffMap, allStaff, month, yearShort, loading,
}: {
  staffMap: Record<string, DailyRecord[]>
  allStaff: StaffConfig[]
  month: number
  yearShort: string
  loading: boolean
}) {
  const staffNames = allStaff.map(s => s.name)
  const combined = useMemo(() => mergeStaffRecords(staffMap), [staffMap])

  const [showPendingPanel, setShowPendingPanel] = useState(false)
  const [pendingTickets, setPendingTickets] = useState<Record<string, unknown>[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)

  async function fetchPendingTickets() {
    setPendingLoading(true)
    try {
      const res = await fetch(`/api/ho-tro/tickets?pendingOnly=true&month=${month}&year=${yearShort}&limit=200`)
      const json = await res.json()
      setPendingTickets(json.tickets ?? [])
    } catch (_e) { /* ignore */ }
    finally { setPendingLoading(false) }
  }

  function handlePendingClick() { setShowPendingPanel(true); fetchPendingTickets() }

  const dataRows = combined.filter(r => r.total_requests > 0)

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-teal-600">
      <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Đang tải dữ liệu tất cả nhân viên...</span>
    </div>
  )

  if (!dataRows.length) return (
    <div className="text-center py-20 text-gray-400">
      <div className="text-5xl mb-4">📊</div>
      <p>Không có dữ liệu tổng quan cho tháng {month}/{yearShort}</p>
    </div>
  )

  const totalRequests = dataRows.reduce((s, r) => s + r.total_requests, 0)
  const deviceSum    = sumObj(dataRows, 'devices')
  const locationSum  = sumObj(dataRows, 'locations')
  const channelSum   = sumObj(dataRows, 'channels')
  const errorSum     = sumObj(dataRows, 'errors')
  const pmTypeSum    = sumObj(dataRows, 'pm_types')
  const pairSum      = sumObj(dataRows, 'device_error_pairs')
  const avgResolution = Math.round(dataRows.reduce((s, r) => s + r.avg_time, 0) / dataRows.length) || 0
  const totalPending  = dataRows.reduce((s, r) => s + (r.resolution['Hen'] ?? 0) + (r.resolution['Mai bao lai'] ?? 0), 0)
  const resolveFast   = dataRows.reduce((s, r) => s + (r.resolution['Fast'] ?? 0), 0)
  const activeStaff   = staffNames.filter(n => (staffMap[n] ?? []).some(r => r.total_requests > 0)).length

  // Chart data
  const dailyData = dataRows.map(r => ({
    date:            shortDate(r.date),
    'Tổng YC':       r.total_requests,
    'Hẹn & MB lại':  (r.resolution['Hen'] ?? 0) + (r.resolution['Mai bao lai'] ?? 0),
  }))

  const resolutionData = dataRows.map(r => ({
    date:           shortDate(r.date),
    '#f Fast':      r.resolution['Fast'] ?? 0,
    '#n Normal':    r.resolution['Normal'] ?? 0,
    '#l Low':       r.resolution['Low'] ?? 0,
    'Hẹn':         r.resolution['Hen'] ?? 0,
    'Mai báo lại':  r.resolution['Mai bao lai'] ?? 0,
  }))

  const pendingPctData = dataRows.map(r => ({
    date: shortDate(r.date),
    'Cần theo dõi (%)': r.total_requests
      ? Math.round((((r.resolution['Hen'] ?? 0) + (r.resolution['Mai bao lai'] ?? 0)) / r.total_requests) * 100)
      : 0,
  }))

  const weeklyStaffData = buildWeeklyStaff(staffMap, staffNames)

  const devicePie   = Object.entries(deviceSum).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))
  const locationData = Object.entries(locationSum).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))
  const errorPie    = Object.entries(errorSum).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))

  const channelData = dataRows.map(r => {
    const zalo    = r.channels['Zalo']    ?? 0
    const hotline = r.channels['Hotline'] ?? 0
    const troLy   = Math.max(0, r.total_requests - zalo - hotline)
    return {
      date:          shortDate(r.date),
      'Trợ lý (%)': r.total_requests ? Math.round((troLy   / r.total_requests) * 100) : 0,
      'Zalo (%)':    r.total_requests ? Math.round((zalo    / r.total_requests) * 100) : 0,
      'Hotline (%)': r.total_requests ? Math.round((hotline / r.total_requests) * 100) : 0,
    }
  })

  const C = 'bg-white rounded-xl border border-gray-200 p-4'
  const xProps = { tick: { fontSize: 9 }, interval: 'preserveStartEnd' as const }
  const yProps = { tick: { fontSize: 9 } }

  return (
    <div>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard icon="📞" label="Tổng yêu cầu"        value={totalRequests.toLocaleString()} color="blue" />
        <StatCard icon="⏱️" label="TG xử lý TB"         value={`${avgResolution} ph`} color="purple" />
        <StatCard icon="⚡" label="Xử lý nhanh (#f)"    value={`${pct(resolveFast, totalRequests)}%`} color="green" />
        <StatCard icon="🔴" label="Cần theo dõi (hẹn)"  value={totalPending} color="red" onClick={handlePendingClick} />
        <StatCard icon="👥" label="Nhân viên hoạt động" value={activeStaff} color="teal" />
      </div>

      {showPendingPanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end" onClick={() => setShowPendingPanel(false)}>
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">Yeu cau can theo doi</h2>
                <p className="text-xs text-gray-400">Hen / mai bao lai - thang {month}/{yearShort}</p>
              </div>
              <button onClick={() => setShowPendingPanel(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5">
              {pendingLoading ? (
                <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : !pendingTickets.length ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-2xl mb-2">OK</p>
                  <p className="text-sm">Khong co yeu cau can theo doi</p>
                  <p className="text-xs mt-1">Bam Lam moi truoc de dong bo du lieu</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 mb-3">{pendingTickets.length} yeu cau</p>
                  {pendingTickets.map((t, i) => (
                    <div key={String(t.id ?? i)} className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{String(t.code || '-')}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${t.speed_tag === 'mai_bao_lai' ? 'bg-pink-100 text-pink-700' : 'bg-purple-100 text-purple-700'}`}>
                            {t.speed_tag === 'mai_bao_lai' ? 'Mai bao lai' : 'Hen'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{String(t.ticket_date ?? '')}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mb-1">{String(t.company || 'KH khong ro')}</p>
                      {!!t.content && <p className="text-xs text-gray-600 mb-1 line-clamp-2">{String(t.content)}</p>}
                      {!!t.reply && <p className="text-xs text-gray-500 italic line-clamp-2">{String(t.reply)}</p>}
                      {!!t.staff_name && <p className="text-xs text-teal-600 mt-1">{String(t.staff_name)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Row 1 — 4 small charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 1. Daily total + over-3-days line */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Tổng số yêu cầu theo ngày</h3>
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} />
              <Tooltip />
              <Bar dataKey="Tổng YC" fill="#3b82f6" />
              <Line type="monotone" dataKey="Hẹn & MB lại" stroke="#ef4444" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Resolution speed stacked bars */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Thời gian xử lý theo ngày</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={resolutionData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Bar dataKey="#f Fast"     stackId="a" fill="#22c55e" />
              <Bar dataKey="#n Normal"   stackId="a" fill="#f59e0b" />
              <Bar dataKey="#l Low"      stackId="a" fill="#ef4444" />
              <Bar dataKey="Hẹn"        stackId="a" fill="#8b5cf6" />
              <Bar dataKey="Mai báo lại" stackId="a" fill="#ec4899" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 3. % Pending per day */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">% Cần theo dõi (hẹn/mai báo lại) theo ngày</h3>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={pendingPctData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="Cần theo dõi (%)" stroke="#ef4444" dot={{ r: 2 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Weekly per-staff comparison */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Tiến độ theo tuần — từng người</h3>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={weeklyStaffData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} />
              <YAxis {...yProps} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              {staffNames.map(name => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={STAFF_COLORS[name] ?? '#999'}
                  dot={{ r: 3 }}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2 — 4 small charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 5. Device pie */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Tỷ lệ thiết bị lỗi trong tuần</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={devicePie}
                cx="50%" cy="50%"
                outerRadius={72}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={8}
              >
                {devicePie.map((_, i) => <Cell key={i} fill={DEVICE_COLORS[i % DEVICE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 6. Location bar */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Số yêu cầu theo văn phòng</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={locationData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis {...yProps} />
              <Tooltip />
              <Bar dataKey="value" name="Yêu cầu" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 7. Channel % per day */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">% Kênh tiếp nhận theo ngày</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={channelData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} unit="%" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Line type="monotone" dataKey="Trợ lý (%)" stroke="#6366f1" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Zalo (%)"   stroke="#22c55e" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Hotline (%)" stroke="#f97316" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 8. Error donut */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Tỷ lệ loại lỗi trong tuần</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={errorPie}
                cx="50%" cy="50%"
                innerRadius={38} outerRadius={72}
                dataKey="value"
                label={({ name, percent }) => percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                labelLine={false}
                fontSize={8}
              >
                {errorPie.map((_, i) => <Cell key={i} fill={ERROR_COLORS[i % ERROR_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3 — full-width line chart */}
      <div className={C}>
        <h3 className="text-xs font-semibold text-gray-600 mb-2">
          Số yêu cầu cần theo dõi (hẹn/mai báo lại) — toàn tháng {month}/{yearShort}
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={dailyData} margin={{ top: 5, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={1} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Tổng YC"      stroke="#3b82f6" dot={{ r: 3 }} strokeWidth={2} />
            <Line type="monotone" dataKey="Hẹn & MB lại" stroke="#ef4444" dot={{ r: 3 }} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Row 4 — Error trend + HW vs SW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Error trend over days */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Xu hướng lỗi theo ngày (top 5)</h3>
          {(() => {
            const topErrors = Object.entries(errorSum).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k]) => k)
            const errTrendData = dataRows.map(r => {
              const pt: Record<string, string | number> = { date: shortDate(r.date) }
              for (const e of topErrors) pt[e] = r.errors[e] ?? 0
              return pt
            })
            const ERR_COLORS = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#06b6d4']
            return (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={errTrendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  {topErrors.map((e, i) => (
                    <Line key={e} type="monotone" dataKey={e} stroke={ERR_COLORS[i % ERR_COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )
          })()}
        </div>

        {/* HW vs SW breakdown */}
        <div className={C}>
          <h3 className="text-xs font-semibold text-gray-600 mb-3">Phần cứng vs Phần mềm</h3>
          {(() => {
            const swCount  = deviceSum['PM'] ?? 0
            const hwCount  = Object.entries(deviceSum).filter(([k]) => k !== 'PM').reduce((s,[,v]) => s+v, 0)
            const total    = hwCount + swCount
            const hwPct    = total ? Math.round((hwCount/total)*100) : 0
            const swPct    = total ? Math.round((swCount/total)*100) : 0
            const pmEntries = Object.entries(pmTypeSum).filter(([,v]) => v > 0)
            return (
              <div className="space-y-3">
                {/* HW/SW bar */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex-1 h-6 rounded-lg overflow-hidden flex">
                    <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium transition-all" style={{ width: `${hwPct}%` }}>
                      {hwPct > 15 ? `HW ${hwPct}%` : ''}
                    </div>
                    <div className="bg-purple-500 flex items-center justify-center text-white text-xs font-medium transition-all" style={{ width: `${swPct}%` }}>
                      {swPct > 8 ? `SW ${swPct}%` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block"/>Phần cứng: <b>{hwCount}</b></span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block"/>Phần mềm: <b>{swCount}</b></span>
                </div>
                {pmEntries.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-2">PM breakdown:</p>
                    <div className="space-y-1.5">
                      {pmEntries.map(([label, val]) => (
                        <div key={label} className="flex items-center gap-2 text-xs">
                          <span className="w-16 text-gray-600">{label}</span>
                          <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                            <div className="bg-purple-400 h-3 rounded" style={{ width: `${(val/swCount)*100}%` }} />
                          </div>
                          <span className="w-10 text-right text-gray-700">{val} <span className="text-gray-400">({Math.round((val/swCount)*100)}%)</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Row 5 — Device × Error matrix */}
      {Object.keys(pairSum).length > 0 && (() => {
        // Get top devices and errors from pair data
        const devSet = new Set<string>()
        const errSet = new Set<string>()
        Object.keys(pairSum).forEach(k => { const [d,e] = k.split('×'); devSet.add(d); errSet.add(e) })
        // Sort by total count
        const devs = Array.from(devSet).sort((a,b) =>
          Object.entries(pairSum).filter(([k]) => k.startsWith(b+'×')).reduce((s,[,v])=>s+v,0) -
          Object.entries(pairSum).filter(([k]) => k.startsWith(a+'×')).reduce((s,[,v])=>s+v,0)
        ).slice(0, 8)
        const errs = Array.from(errSet).sort((a,b) =>
          Object.entries(pairSum).filter(([k]) => k.endsWith('×'+b)).reduce((s,[,v])=>s+v,0) -
          Object.entries(pairSum).filter(([k]) => k.endsWith('×'+a)).reduce((s,[,v])=>s+v,0)
        ).slice(0, 8)
        const maxVal = Math.max(...Object.values(pairSum), 1)
        return (
          <div className={C}>
            <h3 className="text-xs font-semibold text-gray-600 mb-3">Ma trận Thiết bị × Lỗi</h3>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 text-gray-400 w-20">Thiết bị</th>
                    {errs.map(e => <th key={e} className="text-center px-1 py-1 text-gray-500 font-medium w-10">{e}</th>)}
                    <th className="text-right px-2 py-1 text-gray-400">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {devs.map(d => {
                    const rowTotal = Object.entries(pairSum).filter(([k]) => k.startsWith(d+'×')).reduce((s,[,v])=>s+v,0)
                    return (
                      <tr key={d} className="border-t border-gray-50">
                        <td className="px-2 py-1 text-gray-700 font-medium whitespace-nowrap">{d}</td>
                        {errs.map(e => {
                          const v = pairSum[`${d}×${e}`] ?? 0
                          const intensity = Math.round((v / maxVal) * 100)
                          return (
                            <td key={e} className="text-center px-1 py-1">
                              {v > 0 ? (
                                <span
                                  className="inline-block rounded px-1 font-medium"
                                  style={{ backgroundColor: `rgba(239,68,68,${intensity/100*0.7+0.05})`, color: intensity > 50 ? '#fff' : '#991b1b' }}
                                >{v}</span>
                              ) : <span className="text-gray-200">·</span>}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1 text-right font-bold text-gray-600">{rowTotal}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-300 mt-2">Màu đậm = xuất hiện nhiều hơn. Dữ liệu mới sau khi làm mới.</p>
          </div>
        )
      })()}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────
export default function HoTroDashboard({ userEmail, isAdmin, canWrite, staffConfig, allStaff }: Props) {
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0)
  const [activeTab, setActiveTab] = useState<'tickets' | 'stats' | 'jira'>('tickets')
  // Legacy — kept for stats tab internals
  const [isSummaryMode, setIsSummaryMode]   = useState(false)
  const [isJiraBugsMode, setIsJiraBugsMode] = useState(false)
  const [isTicketMode, setIsTicketMode]     = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [selectedSheetId, setSelectedSheetId] = useState<string>(
    staffConfig?.sheetId ?? (allStaff[0]?.sheetId ?? '')
  )

  // Individual staff view state
  const [records, setRecords]     = useState<DailyRecord[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [sheetName, setSheetName] = useState('')

  // Summary view state
  const [staffDataMap, setStaffDataMap]       = useState<Record<string, DailyRecord[]>>({})
  const [summaryLoading, setSummaryLoading]   = useState(false)

  // Week mode state
  const [periodMode, setPeriodMode]           = useState<'thang' | 'tuan'>('tuan')
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(() => {
    // Khởi tạo bằng tuần hiện tại ngay khi mount
    const now = new Date()
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
  }) // "YYYY-Www"

  const selectedMonth = MONTHS[selectedMonthIdx]

  // ── ISO week helpers ──
  function getISOWeekKey(sortKey: string): string {
    const [y, m, d] = sortKey.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
  }

  function isoWeekBounds(key: string): { mon: Date; sun: Date; label: string } {
    const [yearStr, wStr] = key.split('-W')
    const year = parseInt(yearStr), week = parseInt(wStr)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const w1mon = new Date(jan4)
    w1mon.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1)
    const mon = new Date(w1mon)
    mon.setUTCDate(w1mon.getUTCDate() + (week - 1) * 7)
    const sun = new Date(mon)
    sun.setUTCDate(mon.getUTCDate() + 6)
    const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    return { mon, sun, label: `${fmt(mon)} – ${fmt(sun)}` }
  }

  /** Tính dateFrom/dateTo từ periodMode + selectedWeekKey/selectedMonth để filter ticket list */
  function getTicketDateRange(): { dateFrom: string; dateTo: string } | null {
    const toISO = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    if (periodMode === 'tuan' && selectedWeekKey) {
      const { mon, sun } = isoWeekBounds(selectedWeekKey)
      return { dateFrom: toISO(mon), dateTo: toISO(sun) }
    } else if (periodMode === 'thang') {
      const y = `20${selectedMonth.yearShort}`
      const m = selectedMonth.month
      const lastDay = new Date(parseInt(y), m, 0).getDate()
      const mStr = String(m).padStart(2, '0')
      return {
        dateFrom: `${y}-${mStr}-01`,
        dateTo:   `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    return null
  }

  // Derive sorted list of ISO week keys from current records
  const allWeekKeys = useMemo(() => {
    const source = (activeTab === 'stats' && isAdmin)
      ? Object.values(staffDataMap).flat()
      : records
    const keys = new Set(source.filter(r => r.total_requests > 0).map(r => getISOWeekKey(r.sortKey)))
    return Array.from(keys).sort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, staffDataMap, activeTab, isAdmin])

  // Auto-select latest week when entering week mode or data changes
  useEffect(() => {
    if (periodMode === 'tuan' && allWeekKeys.length > 0) {
      if (!selectedWeekKey || !allWeekKeys.includes(selectedWeekKey)) {
        setSelectedWeekKey(allWeekKeys[allWeekKeys.length - 1])
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, allWeekKeys])

  function navWeek(delta: -1 | 1) {
    const idx = allWeekKeys.indexOf(selectedWeekKey ?? '')
    const next = Math.max(0, Math.min(allWeekKeys.length - 1, idx + delta))
    setSelectedWeekKey(allWeekKeys[next])
  }

  // Filter records to selected week
  const filterByWeek = useCallback((recs: DailyRecord[]): DailyRecord[] => {
    if (periodMode !== 'tuan' || !selectedWeekKey) return recs
    return recs.filter(r => getISOWeekKey(r.sortKey) === selectedWeekKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, selectedWeekKey])

  const filteredStaffMap: Record<string, DailyRecord[]> = useMemo(() => {
    if (periodMode !== 'tuan') return staffDataMap
    return Object.fromEntries(
      Object.entries(staffDataMap).map(([k, v]) => [k, filterByWeek(v)])
    )
  }, [staffDataMap, periodMode, filterByWeek])

  // Cache info state
  const [isCached, setIsCached]       = useState(false)
  const [fetchedAt, setFetchedAt]     = useState<string | null>(null)

  // ── Fetch single staff ──
  const fetchData = useCallback(async (sheetId: string, month: number, year: number, forceRefresh = false) => {
    if (!sheetId) return
    setLoading(true)
    setError(null)
    const staffName = allStaff.find(s => s.sheetId === sheetId)?.name ?? null
    try {
      const params = new URLSearchParams({ sheetId, month: String(month), year: String(year) })
      if (staffName) params.set('staffName', staffName)
      if (forceRefresh) params.set('refresh', 'true')
      const res  = await fetch(`/api/ho-tro/sheets?${params}`)
      const json = await res.json()
      setSheetName(json.sheetName ?? '')
      setIsCached(json.cached === true)
      setFetchedAt(json.fetched_at ?? null)
      if (json.error) {
        setError(json.error); setRecords([])
      } else if (!json.rows?.length) {
        setError(`Chưa có dữ liệu cho "${json.sheetName}"`); setRecords([])
      } else {
        setRecords(json.rows); setError(null)
        // Debug: log ticket save result to browser console
        if (json.debug) {
          if (json.debug.ticketSaveError) {
            console.error('[ho-tro] ticket save FAILED:', json.debug.ticketSaveError)
          } else {
            console.log(`[ho-tro] parsed=${json.debug.ticketsParsed} saved=${json.debug.ticketsSaved} pending=${json.debug.pendingCount} cacheErr=${json.debug.cacheError}`)
          }
        }
      }
    } catch (e) {
      setError(String(e)); setRecords([])
    } finally {
      setLoading(false)
    }
  }, [allStaff])

  // ── Fetch all staff in parallel (summary) ──
  const fetchAllStaff = useCallback(async (month: number, year: number, forceRefresh = false) => {
    setSummaryLoading(true)
    try {
      const results = await Promise.all(
        allStaff.map(async s => {
          const params = new URLSearchParams({
            sheetId: s.sheetId, month: String(month), year: String(year), staffName: s.name,
          })
          if (forceRefresh) params.set('refresh', 'true')
          const res  = await fetch(`/api/ho-tro/sheets?${params}`)
          const json = await res.json()
          return [s.name, json.rows ?? []] as [string, DailyRecord[]]
        })
      )
      setStaffDataMap(Object.fromEntries(results))
    } catch (e) {
      console.error('[summary fetch]', e)
      setStaffDataMap({})
    } finally {
      setSummaryLoading(false)
    }
  }, [allStaff])

  // Dùng activeTab + isAdmin thay vì isSummaryMode để quyết định fetch gì
  const needsSummary = activeTab === 'stats' && isAdmin

  useEffect(() => {
    if (needsSummary) {
      fetchAllStaff(selectedMonth.month, selectedMonth.year)
    } else {
      fetchData(selectedSheetId, selectedMonth.month, selectedMonth.year)
    }
  }, [needsSummary, selectedSheetId, selectedMonthIdx, fetchData, fetchAllStaff,
      selectedMonth.month, selectedMonth.year])

  // ── Force refresh from Google Sheets ──
  function handleRefresh() {
    if (needsSummary) {
      fetchAllStaff(selectedMonth.month, selectedMonth.year, true)
    } else {
      fetchData(selectedSheetId, selectedMonth.month, selectedMonth.year, true)
    }
  }

  // ── Sync from CRM ──
  const [crmSyncing, setCrmSyncing] = useState(false)
  const [crmResult, setCrmResult] = useState<string | null>(null)

  async function handleSyncCRM(mode: 'self' | 'full' = 'self') {
    setCrmSyncing(true)
    setCrmResult(null)
    try {
      const res = await fetch('/api/crm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Lỗi sync CRM')
      const parts = [
        mode === 'full' ? `🏢 Full sync` : `🔄 Sync`,
        `+${json.newCount} mới`,
        `↑${json.updatedCount} cập nhật`,
        json.skippedCount > 0 ? `=${json.skippedCount} giữ nguyên` : null,
      ].filter(Boolean).join(' · ')
      setCrmResult(`✅ ${parts}`)
      // Refresh ticket list + unread
      fetchCRMTickets(1)
      fetchUnreadUpdates()
    } catch (err) {
      setCrmResult(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCrmSyncing(false)
    }
  }

  // ── Unread CRM updates ──
  interface UnreadTicket {
    id: number; code: string; ticket_date: string; company: string | null
    content: string | null; reply: string | null; staff_name: string
    speed_tag: string | null; cs_update_time: string | null
  }
  const [showUnread, setShowUnread] = useState(false)
  const [unreadTickets, setUnreadTickets] = useState<UnreadTicket[]>([])
  const [unreadLoading, setUnreadLoading] = useState(false)
  const [markingIds, setMarkingIds] = useState<Set<number>>(new Set())

  async function fetchUnreadUpdates() {
    setUnreadLoading(true)
    try {
      const res = await fetch('/api/ho-tro/mark-read?limit=100')
      const json = await res.json()
      setUnreadTickets(json.tickets ?? [])
    } catch (_e) { /* ignore */ }
    finally { setUnreadLoading(false) }
  }

  // Load unread + auto-sync khi mở trang
  useEffect(() => {
    fetchUnreadUpdates()
    // Tự động đồng bộ dữ liệu CRM khi mở trang (silent)
    handleSyncCRM(isAdmin ? 'full' : 'self')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch ticket list khi thay đổi kỳ lọc (tuần/tháng) — chạy cả lần đầu
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCRMTickets(1) }, [periodMode, selectedWeekKey, selectedMonthIdx])

  // Re-fetch stats khi tab Thống kê được mở hoặc kỳ thay đổi
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'stats') fetchStatsData() }, [activeTab, periodMode, selectedWeekKey, selectedMonthIdx])

  // ── CRM Ticket List (Tab Yêu cầu) ────────────────────────────
  interface CRMTicketRow {
    id: number; code: string; ticket_date: string; cs_update_time: string | null
    company: string | null; contact: string | null; ticket_type: string | null
    content: string | null; reply: string | null; staff_name: string
    speed_tag: string | null; has_unread_update: boolean; direction: string | null
  }
  const [crmTickets, setCrmTickets]         = useState<CRMTicketRow[]>([])
  const [crmTicketsLoading, setCrmTicketsLoading] = useState(false)
  const [crmTotal, setCrmTotal]             = useState(0)
  const [crmPage, setCrmPage]               = useState(1)
  const [crmStaffFilter, setCrmStaffFilter] = useState('')
  const [crmSearch, setCrmSearch]           = useState('')
  const [crmPendingOnly, setCrmPendingOnly] = useState(false)
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null)
  const CRM_PAGE_SIZE = 50

  async function fetchCRMTickets(page = 1, staffF = crmStaffFilter, searchF = crmSearch, pendingF = crmPendingOnly) {
    setCrmTicketsLoading(true)
    try {
      const dateRange = getTicketDateRange()
      const p = new URLSearchParams({
        page: String(page), limit: String(CRM_PAGE_SIZE),
        sortBy: 'cs_update_time', crmOnly: 'true',
      })
      if (staffF)        p.set('staffName', staffF)
      if (searchF)       p.set('search', searchF)
      if (pendingF)      p.set('pendingOnly', 'true')
      if (dateRange) {
        p.set('dateFrom', dateRange.dateFrom)
        p.set('dateTo',   dateRange.dateTo)
      }
      const res  = await fetch(`/api/ho-tro/tickets?${p}`)
      const json = await res.json()
      setCrmTickets(json.tickets ?? [])
      setCrmTotal(json.total ?? 0)
      setCrmPage(page)
    } catch (_e) { /* ignore */ }
    finally { setCrmTicketsLoading(false) }
  }

  // ── Stats from CRM ──
  const [statsTickets, setStatsTickets] = useState<CRMTicketRow[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  async function fetchStatsData() {
    setStatsLoading(true)
    try {
      const dateRange = getTicketDateRange()
      const p = new URLSearchParams({ limit: '2000', crmOnly: 'true', sortBy: 'ticket_date' })
      if (dateRange) { p.set('dateFrom', dateRange.dateFrom); p.set('dateTo', dateRange.dateTo) }
      const res  = await fetch(`/api/ho-tro/tickets?${p}`)
      const json = await res.json()
      setStatsTickets(json.tickets ?? [])
    } catch (_e) { /* ignore */ }
    finally { setStatsLoading(false) }
  }

  // Helpers
  function fmtDate(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }
  const STAFF_COLORS: Record<string, string> = {
    Kane: 'bg-blue-100 text-blue-700', Stefan: 'bg-purple-100 text-purple-700',
    Shiro: 'bg-teal-100 text-teal-700', Irene: 'bg-pink-100 text-pink-700',
    Blue: 'bg-indigo-100 text-indigo-700',
  }
  const SPEED_LABELS: Record<string, string> = {
    fast: '⚡ Nhanh', normal: '• Thường', low: '↓ Thấp',
    hen: '📅 Hẹn', mai_bao_lai: '🔁 Mai báo lại',
  }
  const SPEED_COLORS: Record<string, string> = {
    fast: 'bg-green-100 text-green-700', normal: 'bg-gray-100 text-gray-600',
    low: 'bg-gray-100 text-gray-500', hen: 'bg-purple-100 text-purple-700',
    mai_bao_lai: 'bg-pink-100 text-pink-700',
  }

  async function markAsRead(ids: number[]) {
    setMarkingIds(prev => new Set([...Array.from(prev), ...ids]))
    try {
      await fetch('/api/ho-tro/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setUnreadTickets(prev => prev.filter(t => !ids.includes(t.id)))
    } catch (_e) { /* ignore */ }
    finally {
      setMarkingIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
    }
  }

  // Format fetched_at thành "HH:mm DD/MM"
  function fmtFetchedAt(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    return `${hh}:${mm} ${dd}/${mo}`
  }

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const [showStaffPending, setShowStaffPending] = useState(false)
  const [staffPendingTickets, setStaffPendingTickets] = useState<Record<string, unknown>[]>([])
  const [staffPendingLoading, setStaffPendingLoading] = useState(false)

  async function fetchStaffPending(staffName: string | undefined) {
    setStaffPendingLoading(true)
    try {
      const params = new URLSearchParams({ pendingOnly: 'true', month: String(selectedMonth.month), year: String(selectedMonth.yearShort), limit: '200' })
      if (staffName) params.set('staffName', staffName)
      const res = await fetch(`/api/ho-tro/tickets?${params}`)
      const json = await res.json()
      setStaffPendingTickets(json.tickets ?? [])
    } catch (_e) { /* ignore */ }
    finally { setStaffPendingLoading(false) }
  }

  // Individual view aggregates
  const dataRows       = filterByWeek(records).filter(r => r.total_requests > 0)
  const totalRequests  = dataRows.reduce((s, r) => s + r.total_requests, 0)
  const totalDays      = dataRows.length
  const avgTime        = totalDays ? Math.round(dataRows.reduce((s, r) => s + r.avg_time, 0) / totalDays) : 0
  const totalFast      = dataRows.reduce((s, r) => s + (r.resolution['Fast'] ?? 0), 0)
  const totalPending   = dataRows.reduce((s, r) => s + (r.resolution['Hen'] ?? 0) + (r.resolution['Mai bao lai'] ?? 0), 0)
  const deviceSum      = sumObj(dataRows, 'devices')
  const locationSum    = sumObj(dataRows, 'locations')
  const channelSumRaw  = sumObj(dataRows, 'channels')
  const errorSum       = sumObj(dataRows, 'errors')
  const resolveRate    = pct(totalFast, totalRequests)
  // "Trợ lý" = requests without #zalo or #hotline hashtag
  const channelSum = {
    'Trợ lý':  Math.max(0, totalRequests - (channelSumRaw['Zalo'] ?? 0) - (channelSumRaw['Hotline'] ?? 0)),
    'Zalo':    channelSumRaw['Zalo'] ?? 0,
    'Hotline': channelSumRaw['Hotline'] ?? 0,
  }

  const viewingStaff = isAdmin
    ? allStaff.find(s => s.sheetId === selectedSheetId) ?? null
    : staffConfig

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/kho" className="text-sm text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
              &larr; Kho
            </a>
            <span className="text-gray-200">|</span>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center text-lg">📋</div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-none">Hỗ trợ kỹ thuật</h1>
                <p className="text-xs text-gray-400">{userEmail}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period mode toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setPeriodMode('thang')}
                className={`px-3 py-2 font-medium transition ${periodMode === 'thang' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >Tháng</button>
              <button
                onClick={() => { setPeriodMode('tuan'); }}
                className={`px-3 py-2 font-medium transition ${periodMode === 'tuan' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >Tuần</button>
            </div>

            {/* Month selector */}
            <select
              value={selectedMonthIdx}
              onChange={e => setSelectedMonthIdx(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i}>{m.label}</option>
              ))}
            </select>

            {/* Week navigator (only in tuần mode) */}
            {periodMode === 'tuan' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navWeek(-1)}
                  disabled={!selectedWeekKey || allWeekKeys.indexOf(selectedWeekKey) <= 0}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-sm"
                >‹</button>
                <span className="text-sm font-semibold text-gray-800 min-w-[110px] text-center">
                  {selectedWeekKey ? isoWeekBounds(selectedWeekKey).label : '—'}
                </span>
                <button
                  onClick={() => navWeek(1)}
                  disabled={!selectedWeekKey || allWeekKeys.indexOf(selectedWeekKey) >= allWeekKeys.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-sm"
                >›</button>
              </div>
            )}
            {/* Sync buttons + notifications */}
            <div className="flex items-center gap-1.5">
              {crmResult && (
                <span className="text-[10px] text-gray-500 whitespace-nowrap max-w-[200px] truncate" title={crmResult}>
                  {crmResult}
                </span>
              )}
              {unreadTickets.length > 0 && (
                <button
                  onClick={() => setShowUnread(true)}
                  className="relative px-2.5 py-2 text-sm text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg border border-orange-200 transition whitespace-nowrap"
                  title="Xem các yêu cầu có cập nhật mới từ CRM"
                >
                  🔔 {unreadTickets.length}
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => handleSyncCRM('full')}
                  disabled={crmSyncing}
                  title="Full Sync: đồng bộ tất cả 5 nhân viên từ CRM"
                  className="px-2.5 py-2 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg border border-purple-200 transition disabled:opacity-40 whitespace-nowrap"
                >
                  {crmSyncing ? '⏳' : '🏢'} Full Sync
                </button>
              )}
              <button
                onClick={() => handleSyncCRM('self')}
                disabled={crmSyncing}
                title="Đồng bộ dữ liệu của bạn từ CRM"
                className="px-2.5 py-2 text-sm text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-gray-200 transition disabled:opacity-40 whitespace-nowrap"
              >
                {crmSyncing ? '⏳' : '🔄'} Đồng bộ
              </button>
            </div>

            {/* Nhập liệu thủ công đã bỏ — dữ liệu lấy từ CRM */}
            {isAdmin && (
              <a href="/admin/users" className="flex items-center gap-1.5 px-3 py-2 text-sm border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition">
                Admin
              </a>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
              title="Đăng xuất"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* ── Main tabs ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 py-2">
            {[
              { key: 'tickets', label: '📋 Yêu cầu' },
              { key: 'stats',   label: '📊 Thống kê' },
              { key: 'jira',    label: '🐛 Jira Bugs' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as 'tickets' | 'stats' | 'jira')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  activeTab === key
                    ? key === 'tickets' ? 'bg-blue-600 text-white'
                    : key === 'stats'   ? 'bg-gray-800 text-white'
                    :                     'bg-red-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
                {key === 'tickets' && unreadTickets.length > 0 && (
                  <span className="ml-1.5 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {unreadTickets.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">

        {/* ── Tab: Jira Bugs ── */}
        {activeTab === 'jira' ? (
          <JiraBugsTab />

        ) : activeTab === 'tickets' ? (
          /* ── Tab: Yêu cầu (CRM) ── */
          <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Label kỳ hiện tại */}
              <span className="text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                {periodMode === 'tuan' && selectedWeekKey
                  ? `📅 Tuần ${isoWeekBounds(selectedWeekKey).label}`
                  : `📅 Tháng ${selectedMonth.month}/${selectedMonth.yearShort}`
                }
              </span>
              {isAdmin && (
                <select
                  value={crmStaffFilter}
                  onChange={e => { setCrmStaffFilter(e.target.value); fetchCRMTickets(1, e.target.value, crmSearch, crmPendingOnly) }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">Tất cả nhân viên</option>
                  {['Kane','Stefan','Shiro','Irene','Blue'].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={crmSearch}
                onChange={e => setCrmSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fetchCRMTickets(1, crmStaffFilter, crmSearch, crmPendingOnly) }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 w-48"
              />
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crmPendingOnly}
                  onChange={e => { setCrmPendingOnly(e.target.checked); fetchCRMTickets(1, crmStaffFilter, crmSearch, e.target.checked) }}
                  className="rounded"
                />
                Cần theo dõi
              </label>
              <button
                onClick={() => fetchCRMTickets(1, crmStaffFilter, crmSearch, crmPendingOnly)}
                className="text-sm text-blue-500 hover:text-blue-700 px-3 py-2 border border-gray-200 rounded-lg hover:bg-blue-50 transition"
              >
                🔍 Tìm
              </button>
              <span className="ml-auto text-xs text-gray-400">
                {crmTotal > 0 && `${crmTotal} yêu cầu`}
              </span>
            </div>

            {/* Ticket list */}
            {crmTicketsLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : crmTickets.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-lg font-medium text-gray-500">Chưa có yêu cầu nào</p>
                <p className="text-sm mt-1">Nhấn &ldquo;Đồng bộ&rdquo; để tải dữ liệu từ CRM</p>
              </div>
            ) : (
              <div className="space-y-2">
                {crmTickets.map(t => (
                  <div
                    key={t.id}
                    className={`bg-white border rounded-xl overflow-hidden transition-all ${
                      t.has_unread_update ? 'border-orange-200 shadow-sm shadow-orange-100' : 'border-gray-200'
                    }`}
                  >
                    {/* Card header — always visible */}
                    <button
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
                      onClick={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
                    >
                      {t.has_unread_update && (
                        <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" title="Có cập nhật mới" />
                      )}
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
                        #{t.code}
                      </span>
                      {isAdmin && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${STAFF_COLORS[t.staff_name] ?? 'bg-gray-100 text-gray-600'}`}>
                          {t.staff_name}
                        </span>
                      )}
                      {t.speed_tag && (
                        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${SPEED_COLORS[t.speed_tag] ?? 'bg-gray-100 text-gray-500'}`}>
                          {SPEED_LABELS[t.speed_tag] ?? t.speed_tag}
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-800 truncate flex-1">
                        {t.company || 'KH không rõ'}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {t.cs_update_time ? fmtDate(t.cs_update_time) : t.ticket_date}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0">{expandedTicket === t.id ? '▲' : '▼'}</span>
                    </button>

                    {/* Expanded detail */}
                    {expandedTicket === t.id && (
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3 text-sm space-y-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                          {t.ticket_type && <div><span className="font-medium">Loại:</span> {t.ticket_type}</div>}
                          {t.contact     && <div><span className="font-medium">Liên hệ:</span> {t.contact}</div>}
                          {t.direction   && <div><span className="font-medium">Chiều:</span> {t.direction}</div>}
                          <div><span className="font-medium">Ngày tạo:</span> {t.ticket_date}</div>
                        </div>
                        {!!t.content && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1 font-medium">Nội dung:</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{t.content}</p>
                          </div>
                        )}
                        {!!t.reply && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1 font-medium">Memo / Reply:</p>
                            <p className="text-sm text-gray-600 italic whitespace-pre-wrap bg-blue-50 rounded-lg p-3">{t.reply}</p>
                          </div>
                        )}
                        {t.has_unread_update && (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-orange-500">
                              🔔 Có cập nhật mới · {t.cs_update_time ? new Date(t.cs_update_time).toLocaleString('vi-VN') : ''}
                            </span>
                            <button
                              onClick={() => markAsRead([t.id]).then(() => fetchCRMTickets(crmPage))}
                              className="text-xs px-3 py-1 bg-orange-50 border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-100 transition"
                            >
                              ✓ Đã đọc
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {crmTotal > CRM_PAGE_SIZE && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => fetchCRMTickets(crmPage - 1)}
                  disabled={crmPage <= 1 || crmTicketsLoading}
                  className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >‹</button>
                <span className="text-sm text-gray-600">
                  Trang {crmPage} / {Math.ceil(crmTotal / CRM_PAGE_SIZE)}
                </span>
                <button
                  onClick={() => fetchCRMTickets(crmPage + 1)}
                  disabled={crmPage >= Math.ceil(crmTotal / CRM_PAGE_SIZE) || crmTicketsLoading}
                  className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >›</button>
              </div>
            )}
          </div>

        ) : /* activeTab === 'stats' */ (
          /* ── Tab: Thống kê — CRM data, UI cũ ── */
          (() => {
            // ── Tổng hợp CRM tickets thành daily records giả ──
            // Group theo ngày để dùng lại UI bảng + biểu đồ cũ
            type CRMDay = {
              date: string           // DD/MM/YYYY
              sortKey: string        // YYYY-MM-DD
              total: number
              fast: number; normal: number; low: number
              hen: number; maiBoLai: number
              byStaff: Record<string, number>
              byType: Record<string, number>
            }
            const dayMap = new Map<string, CRMDay>()
            for (const t of statsTickets) {
              const sk = t.ticket_date?.slice(0, 10) ?? ''
              if (!sk) continue
              const [y, m, d] = sk.split('-')
              const dateLabel = `${d}/${m}/${y}`
              if (!dayMap.has(sk)) dayMap.set(sk, {
                date: dateLabel, sortKey: sk,
                total: 0, fast: 0, normal: 0, low: 0, hen: 0, maiBoLai: 0,
                byStaff: {}, byType: {},
              })
              const day = dayMap.get(sk)!
              day.total++
              if      (t.speed_tag === 'fast')        day.fast++
              else if (t.speed_tag === 'normal')      day.normal++
              else if (t.speed_tag === 'low')         day.low++
              else if (t.speed_tag === 'hen')         day.hen++
              else if (t.speed_tag === 'mai_bao_lai') day.maiBoLai++
              day.byStaff[t.staff_name] = (day.byStaff[t.staff_name] ?? 0) + 1
              if (t.ticket_type) day.byType[t.ticket_type] = (day.byType[t.ticket_type] ?? 0) + 1
            }
            const days = Array.from(dayMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))

            const totalReq  = days.reduce((s, d) => s + d.total, 0)
            const totalFastC  = days.reduce((s, d) => s + d.fast, 0)
            const totalPendC  = days.reduce((s, d) => s + d.hen + d.maiBoLai, 0)
            const fastPct   = totalReq ? Math.round((totalFastC / totalReq) * 100) : 0

            // Tổng theo nhân viên
            const byStaffTotal: Record<string, number> = {}
            for (const t of statsTickets)
              byStaffTotal[t.staff_name] = (byStaffTotal[t.staff_name] ?? 0) + 1

            // Tổng loại yêu cầu
            const byTypeTotal: Record<string, number> = {}
            for (const t of statsTickets)
              if (t.ticket_type) byTypeTotal[t.ticket_type] = (byTypeTotal[t.ticket_type] ?? 0) + 1

            const activeStaffCount = Object.keys(byStaffTotal).length
            const periodLabel = periodMode === 'tuan' && selectedWeekKey
              ? `Tuần ${isoWeekBounds(selectedWeekKey).label}`
              : `Tháng ${selectedMonth.month}/${selectedMonth.yearShort}`

            if (statsLoading) return (
              <div className="flex items-center justify-center py-20 gap-2 text-teal-600">
                <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Đang tải thống kê...</span>
              </div>
            )
            if (!totalReq) return (
              <div className="text-center py-20 text-gray-400">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-lg font-medium text-gray-500">Không có dữ liệu</p>
                <p className="text-sm mt-1">Chưa có yêu cầu nào trong {periodLabel}. Hãy đồng bộ CRM trước.</p>
              </div>
            )

            return (
              <div>
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-gray-800 text-lg">
                      {isAdmin ? 'Tổng quan nhóm' : 'Thống kê của bạn'}
                    </h2>
                    <p className="text-sm text-gray-400">{periodLabel} · {totalReq} yêu cầu từ CRM</p>
                  </div>
                </div>

                {/* KPI */}
                <div className={`grid gap-3 mb-6 ${isAdmin ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
                  <StatCard icon="📞" label="Tổng yêu cầu"    value={totalReq.toLocaleString()} sub={`${days.length} ngày`} color="blue" />
                  <StatCard icon="⚡" label="Xử lý nhanh (#f)" value={`${fastPct}%`} sub={`${totalFastC} yêu cầu`} color="green" />
                  <StatCard icon="📅" label="Cần theo dõi"    value={totalPendC} sub="Hẹn + Mai báo lại" color="red" />
                  {isAdmin && <StatCard icon="👥" label="Nhân viên" value={activeStaffCount} color="teal" />}
                </div>

                {/* HorizBar charts */}
                <div className="grid md:grid-cols-2 gap-5 mb-6">
                  {isAdmin && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-700 mb-4">Nhân viên</h3>
                      <HorizBar data={byStaffTotal} total={totalReq} color="bg-blue-500" maxBars={6} />
                    </div>
                  )}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-700 mb-4">Phân loại xử lý</h3>
                    <HorizBar data={{
                      '⚡ Nhanh (#f)':       days.reduce((s,d)=>s+d.fast,0),
                      '• Thường (#n)':       days.reduce((s,d)=>s+d.normal,0),
                      '↓ Thấp (#l)':         days.reduce((s,d)=>s+d.low,0),
                      '📅 Hẹn':             days.reduce((s,d)=>s+d.hen,0),
                      '🔁 Mai báo lại':      days.reduce((s,d)=>s+d.maiBoLai,0),
                    }} total={totalReq} color="bg-teal-500" maxBars={5} />
                  </div>
                  {Object.keys(byTypeTotal).length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-700 mb-4">Loại yêu cầu (top 6)</h3>
                      <HorizBar data={byTypeTotal} total={totalReq} color="bg-orange-400" maxBars={6} />
                    </div>
                  )}
                </div>

                {/* Recharts: Xu hướng theo ngày */}
                {days.length > 1 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                    <h3 className="font-semibold text-gray-700 mb-3">Xu hướng theo ngày</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={days.map(d => ({
                        date: `${d.date.slice(0,2)}/${d.date.slice(3,5)}`,
                        'Tổng YC': d.total,
                        'Cần theo dõi': d.hen + d.maiBoLai,
                      }))} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Tổng YC" fill="#60a5fa" radius={[3,3,0,0]} />
                        <Line type="monotone" dataKey="Cần theo dõi" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recharts: Phân loại xử lý theo ngày */}
                {days.length > 1 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                    <h3 className="font-semibold text-gray-700 mb-3">Phân loại xử lý theo ngày</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={days.map(d => ({
                        date: `${d.date.slice(0,2)}/${d.date.slice(3,5)}`,
                        '#f Nhanh': d.fast,
                        '#n Thường': d.normal,
                        '#l Thấp': d.low,
                        'Hẹn': d.hen,
                        'MBL': d.maiBoLai,
                      }))} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="#f Nhanh"  stackId="a" fill="#34d399" />
                        <Bar dataKey="#n Thường" stackId="a" fill="#60a5fa" />
                        <Bar dataKey="#l Thấp"   stackId="a" fill="#fb923c" />
                        <Bar dataKey="Hẹn"       stackId="a" fill="#c084fc" />
                        <Bar dataKey="MBL"        stackId="a" fill="#f472b6" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Daily table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">Chi tiết theo ngày</h3>
                    <span className="text-xs text-gray-400">{days.length} ngày</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Ngày</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium">YC</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium text-green-600">#f</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium text-amber-600">#n</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium text-red-500">#l</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium text-purple-600">Hẹn</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium text-pink-500">MBL</th>
                          {isAdmin && Object.keys(byStaffTotal).sort().map(n => (
                            <th key={n} className="text-right px-3 py-3 text-gray-500 font-medium">{n}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((d, i) => (
                          <tr key={d.sortKey} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                            <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{d.date}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-blue-700">{d.total}</td>
                            <td className="px-3 py-2.5 text-right text-green-600">{d.fast || <span className="text-gray-300">-</span>}</td>
                            <td className="px-3 py-2.5 text-right text-amber-600">{d.normal || <span className="text-gray-300">-</span>}</td>
                            <td className="px-3 py-2.5 text-right text-red-500">{d.low || <span className="text-gray-300">-</span>}</td>
                            <td className="px-3 py-2.5 text-right">
                              {d.hen > 0 ? <span className="text-purple-600 font-medium">{d.hen}</span> : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {d.maiBoLai > 0 ? <span className="text-pink-600 font-medium">{d.maiBoLai}</span> : <span className="text-gray-300">-</span>}
                            </td>
                            {isAdmin && Object.keys(byStaffTotal).sort().map(n => (
                              <td key={n} className="px-3 py-2.5 text-right text-gray-600">
                                {d.byStaff[n] || <span className="text-gray-300">-</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-300 bg-blue-50">
                        <tr>
                          <td className="px-4 py-3 font-bold text-gray-800">
                            {periodMode === 'tuan' ? 'Tổng tuần' : 'Tổng tháng'}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-blue-800">{totalReq}</td>
                          <td className="px-3 py-3 text-right font-bold text-green-700">{totalFastC || '-'}</td>
                          <td className="px-3 py-3 text-right font-medium text-amber-600">{days.reduce((s,d)=>s+d.normal,0) || '-'}</td>
                          <td className="px-3 py-3 text-right font-medium text-red-500">{days.reduce((s,d)=>s+d.low,0) || '-'}</td>
                          <td className="px-3 py-3 text-right">
                            {totalPendC > 0 ? <span className="text-purple-700 font-bold">{days.reduce((s,d)=>s+d.hen,0)}</span> : '-'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {days.reduce((s,d)=>s+d.maiBoLai,0) > 0 ? <span className="text-pink-700 font-bold">{days.reduce((s,d)=>s+d.maiBoLai,0)}</span> : '-'}
                          </td>
                          {isAdmin && Object.keys(byStaffTotal).sort().map(n => (
                            <td key={n} className="px-3 py-3 text-right font-medium">{byStaffTotal[n] || '-'}</td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()
        )}
      </div>
      {/* ── Success toast ── */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-teal-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          ✅ {successMsg}
        </div>
      )}

      {/* ── Panel: Cần theo dõi ── */}
      {showStaffPending && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end" onClick={() => setShowStaffPending(false)}>
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">Yêu cầu cần theo dõi</h2>
                <p className="text-xs text-gray-400">{viewingStaff?.name}</p>
              </div>
              <button onClick={() => setShowStaffPending(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5">
              {staffPendingLoading ? (
                <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : !staffPendingTickets.length ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-sm">Không có yêu cầu cần theo dõi</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 mb-3">{staffPendingTickets.length} yêu cầu</p>
                  {staffPendingTickets.map((t, i) => (
                    <div key={String(t.id ?? i)} className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{String(t.code || '-')}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${t.speed_tag === 'mai_bao_lai' ? 'bg-pink-100 text-pink-700' : 'bg-purple-100 text-purple-700'}`}>
                            {t.speed_tag === 'mai_bao_lai' ? 'Mai báo lại' : 'Hẹn'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{String(t.ticket_date ?? '')}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mb-1">{String(t.company || 'KH không rõ')}</p>
                      {!!t.content && <p className="text-xs text-gray-600 mb-1 line-clamp-2">{String(t.content)}</p>}
                      {!!t.reply   && <p className="text-xs text-gray-500 italic line-clamp-2">{String(t.reply)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Panel: Cập nhật mới từ CRM ── */}
      {showUnread && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end" onClick={() => setShowUnread(false)}>
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-orange-50 border-b border-orange-200 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-orange-800 text-lg">🔔 Cập nhật mới từ CRM</h2>
                <p className="text-xs text-orange-600">{unreadTickets.length} yêu cầu có thay đổi</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadTickets.length > 0 && (
                  <button
                    onClick={() => markAsRead(unreadTickets.map(t => t.id))}
                    className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-medium"
                  >
                    Đánh dấu tất cả đã đọc
                  </button>
                )}
                <button onClick={() => setShowUnread(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
              </div>
            </div>
            <div className="p-5">
              {unreadLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !unreadTickets.length ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-sm">Tất cả đã đọc</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unreadTickets.map(t => (
                    <div key={t.id} className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded`}>
                            #{t.code}
                          </span>
                          {isAdmin && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${STAFF_COLORS[t.staff_name] ?? 'bg-gray-100 text-gray-600'}`}>
                              {t.staff_name}
                            </span>
                          )}
                          <span className="text-sm font-medium text-gray-800">{t.company || 'KH không rõ'}</span>
                        </div>
                        <button
                          onClick={() => markAsRead([t.id])}
                          disabled={markingIds.has(t.id)}
                          className="shrink-0 text-xs px-3 py-1 bg-orange-100 border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-200 transition disabled:opacity-40"
                        >
                          {markingIds.has(t.id) ? '...' : '✓ Đã đọc'}
                        </button>
                      </div>
                      {!!t.content && (
                        <p className="text-xs text-gray-600 bg-white rounded-lg p-2 mb-2 line-clamp-2">{t.content}</p>
                      )}
                      <p className="text-xs text-orange-500">
                        🕐 Cập nhật: {t.cs_update_time ? new Date(t.cs_update_time).toLocaleString('vi-VN') : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
