'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { QUALITY_REGIONS, NGUYEN_NHAN_TYPES, getTinhTrangKey, type RegionConfig } from '@/lib/chat-luong-config'

// ── Types ──────────────────────────────────────────────────────
interface QualityRecord {
  region: string
  sort_key: string
  tuan: string | null
  thang: number | null
  tinh_trang: string
  loai_loi: string
  nguyen_nhan: string
  ly_do: string
  ngay_dieu_phoi: string
  nguoi_dieu_phoi: string
  ma_khach: string
  ten_khach: string
  nv_kinh_doanh: string
  loai_san_pham: string
  ky_thuat_vien: string
  so_xe: string
  ngay_hen: string
  ngay_hoan_thanh: string
  phi: string
  ghi_chu: string
  ten_lien_he: string
  so_dien_thoai: string
  dia_chi: string
  fetched_at?: string
}

// ── Months ──────────────────────────────────────────────────────
function getAvailableMonths() {
  const result = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({
      label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`,
      month: d.getMonth() + 1,
      year:  d.getFullYear(),
    })
  }
  return result
}

const MONTHS = getAvailableMonths()

// ── ISO week helpers ────────────────────────────────────────────
function getISOWeekKey(sortKey: string): string {
  const [y, m, d] = sortKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function isoWeekLabel(key: string): string {
  const [yearStr, wStr] = key.split('-W')
  const year = parseInt(yearStr), week = parseInt(wStr)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const w1mon = new Date(jan4)
  w1mon.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1)
  const mon = new Date(w1mon)
  mon.setUTCDate(w1mon.getUTCDate() + (week - 1) * 7)
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

// ── Helpers ──────────────────────────────────────────────────────
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0 }

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ── Sub-components ───────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color = '#3b82f6', bgColor = '#eff6ff' }: {
  icon: string; label: string; value: string | number; sub?: string
  color?: string; bgColor?: string
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: bgColor, borderColor: color + '40' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <span className="text-xl">{icon}</span>
      </div>
    </div>
  )
}

function TinhTrangBadge({ value }: { value: string }) {
  const key = getTinhTrangKey(value)
  const cfg = {
    OK:    { label: 'OK',   bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
    NG:    { label: 'NG',   bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    blank: { label: '—',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  }[key]
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  )
}

// ── Main Component ───────────────────────────────────────────────
interface Props {
  userEmail: string
  isAdmin: boolean
}

export default function ChatLuongDashboard({ userEmail, isAdmin }: Props) {
  const [selectedRegion, setSelectedRegion] = useState<RegionConfig>(QUALITY_REGIONS[0])
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0)
  const [periodMode, setPeriodMode] = useState<'thang' | 'tuan'>('thang')
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null)

  const [records, setRecords] = useState<QualityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  // Filter / detail state
  const [filterNG, setFilterNG] = useState(false)
  const [filterNguyen, setFilterNguyen] = useState<string>('all')
  const [searchText, setSearchText] = useState('')

  const selectedMonth = MONTHS[selectedMonthIdx]

  // ── Fetch data ────────────────────────────────────────────────
  const fetchData = useCallback(async (region: string, month: number, year: number, refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ region, month: String(month), year: String(year) })
      if (refresh) params.set('refresh', 'true')
      const res  = await fetch(`/api/chat-luong/records?${params}`)
      const json = await res.json()
      if (json.error) { setError(json.error); setRecords([]) }
      else {
        setRecords(json.records ?? [])
        setIsCached(json.cached === true)
        setFetchedAt(json.fetched_at ?? null)
      }
    } catch (e) {
      setError(String(e)); setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedRegion.code, selectedMonth.month, selectedMonth.year)
    setSelectedWeekKey(null)
  }, [selectedRegion, selectedMonthIdx, fetchData, selectedMonth.month, selectedMonth.year])

  // ── Week navigation ───────────────────────────────────────────
  const allWeekKeys = useMemo(() => {
    const keys = new Set(records.map(r => getISOWeekKey(r.sort_key)))
    return Array.from(keys).sort()
  }, [records])

  useEffect(() => {
    if (periodMode === 'tuan' && allWeekKeys.length > 0) {
      if (!selectedWeekKey || !allWeekKeys.includes(selectedWeekKey)) {
        setSelectedWeekKey(allWeekKeys[allWeekKeys.length - 1])
      }
    }
  }, [periodMode, allWeekKeys, selectedWeekKey])

  function navWeek(delta: -1 | 1) {
    const idx = allWeekKeys.indexOf(selectedWeekKey ?? '')
    const next = Math.max(0, Math.min(allWeekKeys.length - 1, idx + delta))
    setSelectedWeekKey(allWeekKeys[next])
  }

  // ── Filtered records ─────────────────────────────────────────
  const periodRecords = useMemo(() => {
    if (periodMode === 'tuan' && selectedWeekKey) {
      return records.filter(r => getISOWeekKey(r.sort_key) === selectedWeekKey)
    }
    return records
  }, [records, periodMode, selectedWeekKey])

  const displayRecords = useMemo(() => {
    let filtered = periodRecords
    if (filterNG) filtered = filtered.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG')
    if (filterNguyen !== 'all') filtered = filtered.filter(r => r.nguyen_nhan === filterNguyen)
    if (searchText) {
      const q = searchText.toLowerCase()
      filtered = filtered.filter(r =>
        r.ten_khach.toLowerCase().includes(q) ||
        r.so_xe.toLowerCase().includes(q) ||
        r.ky_thuat_vien.toLowerCase().includes(q) ||
        r.loai_san_pham.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [periodRecords, filterNG, filterNguyen, searchText])

  // ── KPIs ─────────────────────────────────────────────────────
  const total   = periodRecords.length
  const okCount = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'OK').length
  const ngCount = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length
  const pending = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'blank').length
  const ngRate  = pct(ngCount, okCount + ngCount)  // % trong số đã kiểm tra

  // ── Charts ───────────────────────────────────────────────────
  // Breakdown by Nguyên nhân
  const nguyen_chart = useMemo(() => {
    const grp = groupBy(periodRecords, r => r.nguyen_nhan || 'Khác')
    return Object.entries(grp)
      .map(([name, recs]) => ({
        name,
        'Tổng': recs.length,
        'NG':   recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length,
      }))
      .sort((a, b) => b['Tổng'] - a['Tổng'])
  }, [periodRecords])

  // Weekly NG trend
  const weekly_chart = useMemo(() => {
    const grp = groupBy(records, r => getISOWeekKey(r.sort_key))
    return Object.entries(grp)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, recs]) => {
        const checked = recs.filter(r => getTinhTrangKey(r.tinh_trang) !== 'blank')
        const ng      = recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG')
        return {
          week:  key.split('-W')[1] ? `W${key.split('-W')[1]}` : key,
          label: isoWeekLabel(key),
          'Tổng': recs.length,
          'NG':   ng.length,
          '% NG': checked.length > 0 ? Math.round(ng.length / checked.length * 100) : 0,
        }
      })
  }, [records])

  // Breakdown by Loại sản phẩm
  const product_chart = useMemo(() => {
    const grp = groupBy(periodRecords, r => r.loai_san_pham || 'Khác')
    return Object.entries(grp)
      .map(([name, recs]) => ({
        name,
        'Tổng': recs.length,
        'NG':   recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length,
      }))
      .sort((a, b) => b['Tổng'] - a['Tổng'])
      .slice(0, 10)
  }, [periodRecords])

  // ── Period label ──────────────────────────────────────────────
  const periodLabel = periodMode === 'tuan' && selectedWeekKey
    ? isoWeekLabel(selectedWeekKey)
    : selectedMonth.label

  function fmtFetchedAt(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  }

  async function handleLogout() {
    const sb = createSupabaseBrowserClient()
    await sb.auth.signOut()
    window.location.href = '/login'
  }

  const CHART_COLORS = ['#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316']

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/kho" className="text-sm text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
              &larr; Kho
            </a>
            <span className="text-gray-200">|</span>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-lg">✅</div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-none">Quản lý chất lượng</h1>
                <p className="text-xs text-gray-400">{userEmail}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button onClick={() => setPeriodMode('thang')}
                className={`px-3 py-2 font-medium transition ${periodMode === 'thang' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                Tháng
              </button>
              <button onClick={() => setPeriodMode('tuan')}
                className={`px-3 py-2 font-medium transition ${periodMode === 'tuan' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                Tuần
              </button>
            </div>

            {/* Month selector */}
            <select value={selectedMonthIdx} onChange={e => setSelectedMonthIdx(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
            </select>

            {/* Week nav */}
            {periodMode === 'tuan' && (
              <div className="flex items-center gap-1">
                <button onClick={() => navWeek(-1)} disabled={!selectedWeekKey || allWeekKeys.indexOf(selectedWeekKey) <= 0}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-sm">‹</button>
                <span className="text-sm font-semibold text-gray-800 min-w-[110px] text-center">
                  {selectedWeekKey ? isoWeekLabel(selectedWeekKey) : '—'}
                </span>
                <button onClick={() => navWeek(1)} disabled={!selectedWeekKey || allWeekKeys.indexOf(selectedWeekKey) >= allWeekKeys.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-sm">›</button>
              </div>
            )}

            {/* Cache + refresh */}
            <div className="flex items-center gap-1.5">
              {isCached && fetchedAt && (
                <span className="text-[10px] text-gray-400">⚡ {fmtFetchedAt(fetchedAt)}</span>
              )}
              <button onClick={() => fetchData(selectedRegion.code, selectedMonth.month, selectedMonth.year, true)}
                disabled={loading}
                title="Làm mới từ Google Sheets"
                className="px-2.5 py-2 text-sm text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-gray-200 transition disabled:opacity-40">
                🔄
              </button>
            </div>

            {isAdmin && (
              <a href="/admin/users" className="px-3 py-2 text-sm border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition">
                Admin
              </a>
            )}
            <button onClick={handleLogout} className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition" title="Đăng xuất">
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* ── Region tabs ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 py-2 overflow-x-auto">
            {QUALITY_REGIONS.map(region => (
              <button key={region.code}
                onClick={() => setSelectedRegion(region)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  selectedRegion.code === region.code
                    ? 'text-white ring-2 ring-offset-1'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={selectedRegion.code === region.code ? { background: region.color, ringColor: region.color } : {}}>
                {region.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-2 text-emerald-600">
            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Đang tải dữ liệu {selectedRegion.name}...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700 mb-5">
            {error}
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium text-gray-500">Không có dữ liệu</p>
            <p className="text-sm mt-1">{selectedMonth.label} — {selectedRegion.name}</p>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div className="space-y-6">
            {/* Period title */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">{selectedRegion.name}</h2>
                <p className="text-sm text-gray-400">{periodLabel} · {total} đơn</p>
              </div>
              {ngCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-red-600 font-bold text-sm">⚠ {ngCount} đơn NG</span>
                  <span className="text-red-400 text-xs">cần kiểm tra lại</span>
                </div>
              )}
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard icon="📋" label="Tổng đơn" value={total} color="#3b82f6" bgColor="#eff6ff" />
              <KpiCard icon="✅" label="Đạt (OK)" value={okCount} sub={`${pct(okCount, total)}% tổng`} color="#16a34a" bgColor="#f0fdf4" />
              <KpiCard icon="❌" label="Lỗi (NG)" value={ngCount} sub="cần kiểm tra lại" color="#dc2626" bgColor="#fef2f2" />
              <KpiCard icon="⏳" label="Chưa KT" value={pending} sub={`${pct(pending, total)}% tổng`} color="#6b7280" bgColor="#f9fafb" />
              <KpiCard icon="📊" label="Tỷ lệ NG" value={`${ngRate}%`} sub="trong số đã KT" color={ngRate >= 5 ? '#dc2626' : ngRate >= 2 ? '#f59e0b' : '#16a34a'} bgColor={ngRate >= 5 ? '#fef2f2' : ngRate >= 2 ? '#fffbeb' : '#f0fdf4'} />
            </div>

            {/* Charts row */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Breakdown by Nguyên nhân */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Theo nguyên nhân điều phối</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={nguyen_chart} margin={{ top: 0, right: 10, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="Tổng" fill="#3b82f6" radius={[3,3,0,0]} />
                    <Bar dataKey="NG"   fill="#ef4444" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Weekly NG trend */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Xu hướng NG theo tuần ({selectedMonth.label})</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={weekly_chart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(val, name) => name === '% NG' ? `${val}%` : val} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line yAxisId="left" type="monotone" dataKey="Tổng" stroke="#3b82f6" dot={{ r: 3 }} strokeWidth={2} />
                    <Line yAxisId="left" type="monotone" dataKey="NG"   stroke="#ef4444" dot={{ r: 3 }} strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="% NG" stroke="#f59e0b" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Breakdown by Loại sản phẩm */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Theo loại sản phẩm (top 10)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={product_chart} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 9 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={60} />
                    <Tooltip />
                    <Bar dataKey="Tổng" fill="#3b82f6" radius={[0,3,3,0]}>
                      {product_chart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                    <Bar dataKey="NG" fill="#ef4444" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Breakdown by Kỹ thuật viên (NG only) */}
              {ngCount > 0 && (() => {
                const ktvData = Object.entries(
                  groupBy(periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG'), r => r.ky_thuat_vien || 'Chưa rõ')
                ).map(([name, recs]) => ({ name, 'NG': recs.length })).sort((a,b) => b.NG - a.NG).slice(0,8)
                return (
                  <div className="bg-white rounded-xl border border-red-100 p-4">
                    <h3 className="text-sm font-semibold text-red-700 mb-3">Kỹ thuật viên có đơn NG</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={ktvData} layout="vertical" margin={{ top: 0, right: 30, left: 80, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 9 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="NG" fill="#ef4444" radius={[0,3,3,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}
            </div>

            {/* Records table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Danh sách đơn {filterNG ? '(chỉ NG)' : ''}
                  <span className="ml-2 text-xs font-normal text-gray-400">{displayRecords.length} đơn</span>
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search */}
                  <input value={searchText} onChange={e => setSearchText(e.target.value)}
                    placeholder="Tìm khách hàng / xe / KTV..."
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-52 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  {/* Filter by nguyên nhân */}
                  <select value={filterNguyen} onChange={e => setFilterNguyen(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                    <option value="all">Tất cả nguyên nhân</option>
                    {NGUYEN_NHAN_TYPES.map(n => <option key={n} value={n}>{n}</option>)}
                    <option value="">Chưa phân loại</option>
                  </select>
                  {/* NG filter toggle */}
                  <button onClick={() => setFilterNG(v => !v)}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${
                      filterNG ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                    }`}>
                    {filterNG ? '❌ Chỉ NG' : '❌ Lọc NG'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap">Ngày</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Tuần</th>
                      <th className="text-center px-3 py-3 text-gray-500 font-medium">KQ</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Loại lỗi</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Nguyên nhân</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Khách hàng</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Sản phẩm</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Số xe</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium">Kỹ thuật viên</th>
                      <th className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap">Hoàn thành</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRecords.slice(0, 200).map((r, i) => {
                      const isNG = getTinhTrangKey(r.tinh_trang) === 'NG'
                      return (
                        <tr key={`${r.sort_key}-${r.so_xe}-${i}`}
                          className={`border-b border-gray-100 last:border-0 transition ${
                            isNG ? 'bg-red-50/60 hover:bg-red-50' : (i % 2 === 1 ? 'bg-gray-50/30 hover:bg-gray-50' : 'hover:bg-gray-50/60')
                          }`}>
                          <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-700">{r.sort_key}</td>
                          <td className="px-3 py-2 text-gray-500">{r.tuan}</td>
                          <td className="px-3 py-2 text-center">
                            <TinhTrangBadge value={r.tinh_trang} />
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={r.loai_loi}>
                            {isNG && r.loai_loi ? (
                              <span className="text-red-600 font-medium">{r.loai_loi}</span>
                            ) : r.loai_loi || '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.nguyen_nhan || '—'}</td>
                          <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate" title={r.ten_khach}>{r.ten_khach}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.loai_san_pham}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={r.so_xe}>{r.so_xe}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.ky_thuat_vien}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.ngay_hoan_thanh || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {displayRecords.length > 200 && (
                  <p className="text-center text-xs text-gray-400 py-3">
                    Hiển thị 200/{displayRecords.length} đơn — hãy dùng bộ lọc để thu hẹp kết quả
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
