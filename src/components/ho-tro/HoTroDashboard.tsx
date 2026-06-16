'use client'

import { useState, useEffect, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { SUMMARY_SHEET_ID, getAvailableMonths } from '@/lib/staff-sheets'
import type { StaffConfig } from '@/lib/staff-sheets'
import type { DailyRecord } from '@/types/ho-tro'

interface Props {
  userEmail: string
  isAdmin: boolean
  canWrite: boolean
  staffConfig: StaffConfig | null   // null if user is not a staff member
  allStaff: StaffConfig[]
}

const MONTHS = getAvailableMonths()

// ── Tiện ích ─────────────────────────────────────────────────
function sumObj(records: DailyRecord[], key: keyof DailyRecord) {
  const result: Record<string, number> = {}
  for (const r of records) {
    const obj = r[key] as Record<string, number>
    for (const [k, v] of Object.entries(obj)) {
      result[k] = (result[k] ?? 0) + v
    }
  }
  return result
}

function topEntry(obj: Record<string, number>): [string, number] {
  let best: [string, number] = ['—', 0]
  for (const [k, v] of Object.entries(obj)) {
    if (v > best[1]) best = [k, v]
  }
  return best
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

// ── Mini bar chart (CSS) ─────────────────────────────────────
function BarChart({
  data, total, color = 'bg-blue-500', maxBars = 6,
}: {
  data: Record<string, number>
  total: number
  color?: string
  maxBars?: number
}) {
  const sorted = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBars)

  if (!sorted.length) return <p className="text-xs text-gray-400">Không có dữ liệu</p>

  const max = sorted[0][1]
  return (
    <div className="space-y-2">
      {sorted.map(([label, val]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-gray-600 truncate flex-shrink-0">{label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className={`h-4 rounded-full ${color} transition-all duration-500`}
              style={{ width: `${(val / max) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right text-gray-700 font-medium">
            {val} <span className="text-gray-400 font-normal">({pct(val, total)}%)</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Summary card ─────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, color = 'blue',
}: {
  icon: string
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    purple: 'bg-purple-50 border-purple-200',
    red: 'bg-red-50 border-red-200',
  }
  const textMap: Record<string, string> = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    orange: 'text-orange-700',
    purple: 'text-purple-700',
    red: 'text-red-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] ?? colorMap.blue}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
          <p className={`text-2xl font-bold ${textMap[color] ?? textMap.blue}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
export default function HoTroDashboard({
  userEmail, isAdmin, canWrite, staffConfig, allStaff,
}: Props) {
  // Default: current month
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0)
  // Admin: which staff tab is active. '' = tổng quan (summary sheet)
  // Non-admin staff: always their own sheet
  const [selectedSheetId, setSelectedSheetId] = useState<string>(
    isAdmin ? (allStaff[0]?.sheetId ?? SUMMARY_SHEET_ID) : (staffConfig?.sheetId ?? '')
  )
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetName, setSheetName] = useState('')

  const selectedMonth = MONTHS[selectedMonthIdx]

  const fetchData = useCallback(async (sheetId: string, month: number, year: number) => {
    if (!sheetId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/ho-tro/sheets?sheetId=${sheetId}&month=${month}&year=${year}`
      )
      const json = await res.json()
      if (json.error && !json.rows?.length) {
        setError(json.error)
        setRecords([])
      } else {
        setRecords(json.rows ?? [])
        setSheetName(json.sheetName ?? '')
        if (json.rows?.length === 0) {
          setError('Không có dữ liệu cho tháng này')
        }
      }
    } catch (e) {
      setError(String(e))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedSheetId, selectedMonth.month, selectedMonth.year)
  }, [selectedSheetId, selectedMonthIdx, fetchData, selectedMonth.month, selectedMonth.year])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ── Computed stats ─────────────────────────────────────────
  const dataRows = records.filter(r => r.total_requests > 0)
  const totalRequests = dataRows.reduce((s, r) => s + r.total_requests, 0)
  const totalDays = dataRows.length
  const avgTime = totalDays
    ? Math.round(dataRows.reduce((s, r) => s + r.avg_time, 0) / totalDays)
    : 0
  const totalResolved = dataRows.reduce((s, r) => s + (r.resolution['Ngày 1'] ?? 0), 0)
  const totalPending = dataRows.reduce((s, r) => s + (r.resolution['Chưa xử lý'] ?? 0), 0)
  const deviceSum = sumObj(dataRows, 'devices')
  const locationSum = sumObj(dataRows, 'locations')
  const channelSum = sumObj(dataRows, 'channels')
  const errorSum = sumObj(dataRows, 'errors')
  const [topDevice] = topEntry(deviceSum)
  const [topLocation] = topEntry(locationSum)
  const resolveRate = pct(totalResolved, totalRequests)

  // Which staff member are we viewing?
  const viewingStaff = isAdmin
    ? allStaff.find(s => s.sheetId === selectedSheetId) ?? null
    : staffConfig

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href="/kho"
              className="text-sm text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition"
            >
              ← Kho
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

          <div className="flex items-center gap-2">
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

            {isAdmin && (
              <a
                href="/admin/users"
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition"
              >
                ⚙️ Admin
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

      {/* ── Staff tabs (Admin only) ──────────────────────────── */}
      {isAdmin && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 py-2 overflow-x-auto">
              {allStaff.map(staff => (
                <button
                  key={staff.sheetId}
                  onClick={() => setSelectedSheetId(staff.sheetId)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    selectedSheetId === staff.sheetId
                      ? `${staff.bgClass} ring-2 ring-offset-1 ring-current`
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  👤 {staff.name}
                </button>
              ))}
              <button
                onClick={() => setSelectedSheetId(SUMMARY_SHEET_ID)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  selectedSheetId === SUMMARY_SHEET_ID
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                📊 Tổng quan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">

        {/* Context bar */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">
              {viewingStaff ? `📋 ${viewingStaff.name}` : selectedSheetId === SUMMARY_SHEET_ID ? '📊 Tổng quan nhóm' : '📋 Báo cáo của bạn'}
            </h2>
            <p className="text-sm text-gray-400">
              {sheetName || `báo cáo tháng ${selectedMonth.month}/${selectedMonth.yearShort}`}
              {totalDays > 0 && ` · ${totalDays} ngày làm việc`}
            </p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-teal-600">
              <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              Đang tải...
            </div>
          )}
        </div>

        {/* Error state */}
        {error && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700 mb-5">
            ⚠️ {error}
          </div>
        )}

        {!loading && dataRows.length > 0 && (
          <>
            {/* ── Summary cards ────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon="📞"
                label="Tổng yêu cầu"
                value={totalRequests.toLocaleString()}
                sub={`${totalDays} ngày làm việc`}
                color="blue"
              />
              <StatCard
                icon="⏱️"
                label="TG xử lý TB"
                value={`${avgTime} phút`}
                sub="Trung bình/ngày"
                color="purple"
              />
              <StatCard
                icon="✅"
                label="Xử lý ngay"
                value={`${resolveRate}%`}
                sub={`${totalResolved} yêu cầu`}
                color="green"
              />
              <StatCard
                icon="🔴"
                label="Còn tồn đọng"
                value={totalPending}
                sub="Tiếp nhận chưa xử lý"
                color="red"
              />
            </div>

            {/* ── Breakdown charts ─────────────────────────── */}
            <div className="grid md:grid-cols-2 gap-5 mb-6">
              {/* Device breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  📡 Phân loại thiết bị
                  <span className="text-xs text-gray-400 font-normal">(top 6)</span>
                </h3>
                <BarChart
                  data={deviceSum}
                  total={totalRequests}
                  color="bg-blue-500"
                  maxBars={6}
                />
              </div>

              {/* Location breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  📍 Phân loại địa điểm
                </h3>
                <BarChart
                  data={locationSum}
                  total={totalRequests}
                  color="bg-teal-500"
                  maxBars={6}
                />
              </div>

              {/* Channel breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4">📲 Kênh tiếp nhận</h3>
                <BarChart
                  data={channelSum}
                  total={totalRequests}
                  color="bg-indigo-500"
                  maxBars={3}
                />
              </div>

              {/* Error types */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  🔧 Loại lỗi
                  <span className="text-xs text-gray-400 font-normal">(top 6)</span>
                </h3>
                <BarChart
                  data={errorSum}
                  total={totalRequests}
                  color="bg-orange-400"
                  maxBars={6}
                />
              </div>
            </div>

            {/* ── Daily table ──────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">📅 Chi tiết theo ngày</h3>
                <span className="text-xs text-gray-400">{dataRows.length} ngày</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Ngày</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Yêu cầu</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">TG TB</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium whitespace-nowrap">Xử lý ngay</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Tồn</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">HN</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">HP</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">ĐN</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">HCM</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">BD</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Zalo</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Hotline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((r, i) => {
                      const resolveDay1 = r.resolution['Ngày 1'] ?? 0
                      const pending = r.resolution['Chưa xử lý'] ?? 0
                      return (
                        <tr
                          key={r.sortKey}
                          className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/70 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                        >
                          <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-blue-700">{r.total_requests}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.avg_time}p</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`${pct(resolveDay1, r.total_requests) >= 90 ? 'text-green-600' : 'text-amber-600'} font-medium`}>
                              {pct(resolveDay1, r.total_requests)}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {pending > 0 ? (
                              <span className="text-red-600 font-medium">{pending}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Hà Nội'] || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Hải Phòng'] || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Đà Nẵng'] || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['HCM'] || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Bình Dương'] || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.channels['Zalo'] || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.channels['Hotline'] || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Monthly totals */}
                  <tfoot className="border-t-2 border-gray-300 bg-blue-50">
                    <tr>
                      <td className="px-4 py-3 font-bold text-gray-800">Tổng tháng</td>
                      <td className="px-3 py-3 text-right font-bold text-blue-800">{totalRequests}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{avgTime}p</td>
                      <td className="px-3 py-3 text-right font-bold">
                        <span className={resolveRate >= 90 ? 'text-green-700' : 'text-amber-700'}>
                          {resolveRate}%
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {totalPending > 0 ? (
                          <span className="text-red-700 font-bold">{totalPending}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Hà Nội'] || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Hải Phòng'] || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Đà Nẵng'] || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['HCM'] || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Bình Dương'] || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium">{channelSum['Zalo'] || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium">{channelSum['Hotline'] || '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && dataRows.length === 0 && !error && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium text-gray-500">Không có dữ liệu</p>
            <p className="text-sm mt-1">Chưa có báo cáo cho {selectedMonth.label.toLowerCase()}</p>
          </div>
        )}

        {/* No sheet assigned */}
        {!isAdmin && !staffConfig && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🔗</div>
            <p className="text-lg font-medium text-gray-500">Chưa được liên kết</p>
            <p className="text-sm mt-1">Tài khoản của bạn chưa được gán sheet báo cáo.<br />Liên hệ Admin để được cấu hình.</p>
          </div>
        )}
      </div>
    </div>
  )
}
