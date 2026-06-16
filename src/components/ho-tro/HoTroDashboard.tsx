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
  staffConfig: StaffConfig | null
  allStaff: StaffConfig[]
}

const MONTHS = getAvailableMonths()

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
  let best: [string, number] = ['--', 0]
  for (const [k, v] of Object.entries(obj)) {
    if (v > best[1]) best = [k, v]
  }
  return best
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function BarChart({ data, total, color = 'bg-blue-500', maxBars = 6 }: {
  data: Record<string, number>
  total: number
  color?: string
  maxBars?: number
}) {
  const sorted = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBars)

  if (!sorted.length) {
    return <p className="text-xs text-gray-400">Khong co du lieu</p>
  }

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

function StatCard({ icon, label, value, sub, color = 'blue' }: {
  icon: string
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200',
    green:  'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    purple: 'bg-purple-50 border-purple-200',
    red:    'bg-red-50 border-red-200',
  }
  const textMap: Record<string, string> = {
    blue:   'text-blue-700',
    green:  'text-green-700',
    orange: 'text-orange-700',
    purple: 'text-purple-700',
    red:    'text-red-700',
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

export default function HoTroDashboard({ userEmail, isAdmin, canWrite, staffConfig, allStaff }: Props) {
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0)
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
      const res = await fetch(`/api/ho-tro/sheets?sheetId=${sheetId}&month=${month}&year=${year}`)
      const json = await res.json()
      setSheetName(json.sheetName ?? '')

      if (json.error) {
        setError(json.error)
        setRecords([])
      } else if (!json.rows?.length) {
        setError(`Chua co du lieu cho "${json.sheetName}"`)
        setRecords([])
      } else {
        setRecords(json.rows)
        setError(null)
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

  const dataRows = records.filter(r => r.total_requests > 0)
  const totalRequests = dataRows.reduce((s, r) => s + r.total_requests, 0)
  const totalDays = dataRows.length
  const avgTime = totalDays
    ? Math.round(dataRows.reduce((s, r) => s + r.avg_time, 0) / totalDays)
    : 0
  const totalResolved = dataRows.reduce((s, r) => s + (r.resolution['Ngay 1'] ?? r.resolution['Ngày 1'] ?? 0), 0)
  const totalPending = dataRows.reduce((s, r) => s + (r.resolution['Chua xu ly'] ?? r.resolution['Chưa xử lý'] ?? 0), 0)
  const deviceSum = sumObj(dataRows, 'devices')
  const locationSum = sumObj(dataRows, 'locations')
  const channelSum = sumObj(dataRows, 'channels')
  const errorSum = sumObj(dataRows, 'errors')
  const resolveRate = pct(totalResolved, totalRequests)

  const viewingStaff = isAdmin
    ? allStaff.find(s => s.sheetId === selectedSheetId) ?? null
    : staffConfig

  return (
    <div className="flex flex-col min-h-screen">
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
                <h1 className="text-lg font-bold text-gray-900 leading-none">Ho tro ky thuat</h1>
                <p className="text-xs text-gray-400">{userEmail}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              <a href="/admin/users" className="flex items-center gap-1.5 px-3 py-2 text-sm border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition">
                Admin
              </a>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
              title="Dang xuat"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

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
                  {staff.name}
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
                Tong quan
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">
              {viewingStaff ? viewingStaff.name : selectedSheetId === SUMMARY_SHEET_ID ? 'Tong quan nhom' : 'Bao cao cua ban'}
            </h2>
            <p className="text-sm text-gray-400">
              {sheetName || `bao cao thang ${selectedMonth.month}/${selectedMonth.yearShort}`}
              {totalDays > 0 && ` · ${totalDays} ngay lam viec`}
            </p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-teal-600">
              <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              Dang tai...
            </div>
          )}
        </div>

        {error && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700 mb-5">
            {error}
          </div>
        )}

        {!loading && dataRows.length > 0 && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon="📞" label="Tong yeu cau" value={totalRequests.toLocaleString()} sub={`${totalDays} ngay lam viec`} color="blue" />
              <StatCard icon="⏱️" label="TG xu ly TB" value={`${avgTime} phut`} sub="Trung binh/ngay" color="purple" />
              <StatCard icon="✅" label="Xu ly ngay" value={`${resolveRate}%`} sub={`${totalResolved} yeu cau`} color="green" />
              <StatCard icon="🔴" label="Con ton dong" value={totalPending} sub="Chua xu ly" color="red" />
            </div>

            <div className="grid md:grid-cols-2 gap-5 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4">Thiet bi (top 6)</h3>
                <BarChart data={deviceSum} total={totalRequests} color="bg-blue-500" maxBars={6} />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4">Dia diem</h3>
                <BarChart data={locationSum} total={totalRequests} color="bg-teal-500" maxBars={6} />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4">Kenh tiep nhan</h3>
                <BarChart data={channelSum} total={totalRequests} color="bg-indigo-500" maxBars={3} />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-700 mb-4">Loai loi (top 6)</h3>
                <BarChart data={errorSum} total={totalRequests} color="bg-orange-400" maxBars={6} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Chi tiet theo ngay</h3>
                <span className="text-xs text-gray-400">{dataRows.length} ngay</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Ngay</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">YC</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">TG TB</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium whitespace-nowrap">Xu ly ngay</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Ton</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">HN</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">HP</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">DN</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">HCM</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">BD</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Zalo</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium">Hotline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((r, i) => {
                      const resolveDay1 = r.resolution['Ngay 1'] ?? r.resolution['Ngày 1'] ?? 0
                      const pending = r.resolution['Chua xu ly'] ?? r.resolution['Chưa xử lý'] ?? 0
                      return (
                        <tr key={r.sortKey} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/70 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-blue-700">{r.total_requests}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.avg_time}p</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={pct(resolveDay1, r.total_requests) >= 90 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                              {pct(resolveDay1, r.total_requests)}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {pending > 0 ? <span className="text-red-600 font-medium">{pending}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Ha Noi'] || r.locations['Hà Nội'] || '-'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Hai Phong'] || r.locations['Hải Phòng'] || '-'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Da Nang'] || r.locations['Đà Nẵng'] || '-'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['HCM'] || '-'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.locations['Binh Duong'] || r.locations['Bình Dương'] || '-'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.channels['Zalo'] || '-'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{r.channels['Hotline'] || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300 bg-blue-50">
                    <tr>
                      <td className="px-4 py-3 font-bold text-gray-800">Tong thang</td>
                      <td className="px-3 py-3 text-right font-bold text-blue-800">{totalRequests}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{avgTime}p</td>
                      <td className="px-3 py-3 text-right font-bold">
                        <span className={resolveRate >= 90 ? 'text-green-700' : 'text-amber-700'}>{resolveRate}%</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {totalPending > 0 ? <span className="text-red-700 font-bold">{totalPending}</span> : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Ha Noi'] || locationSum['Hà Nội'] || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Hai Phong'] || locationSum['Hải Phòng'] || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Da Nang'] || locationSum['Đà Nẵng'] || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['HCM'] || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium">{locationSum['Binh Duong'] || locationSum['Bình Dương'] || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium">{channelSum['Zalo'] || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium">{channelSum['Hotline'] || '-'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && dataRows.length === 0 && !error && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium text-gray-500">Khong co du lieu</p>
            <p className="text-sm mt-1">Chua co bao cao cho {selectedMonth.label.toLowerCase()}</p>
          </div>
        )}

        {!isAdmin && !staffConfig && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🔗</div>
            <p className="text-lg font-medium text-gray-500">Chua duoc lien ket</p>
            <p className="text-sm mt-1">Tai khoan chua duoc gan sheet bao cao. Lien he Admin.</p>
          </div>
        )}
      </div>
    </div>
  )
}
