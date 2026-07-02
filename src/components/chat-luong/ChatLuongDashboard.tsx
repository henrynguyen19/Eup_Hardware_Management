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
  ten_khach: string
  loai_san_pham: string
  ky_thuat_vien: string
  so_xe: string
  ngay_hoan_thanh: string
  fetched_at?: string
}

interface ThongKeStats {
  total: number
  ok: number
  ng: number
  pending: number
  byRegion: Record<string, { total: number; ok: number; ng: number; pending: number }>
  byNguyen: Record<string, { total: number; ng: number }>
  byKTV: Record<string, { region: string; total: number; ok: number; ng: number }>
  byWeek: Record<string, { total: number; ng: number }>
  byLoaiLoi: Record<string, number>
  byLoaiLoiPerRegion: Record<string, Record<string, number>>
  byLoaiLoiPerKTV: Record<string, Record<string, number>>
}

// ── Months ──────────────────────────────────────────────────────
function getAvailableMonths() {
  const result = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({ label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`, month: d.getMonth() + 1, year: d.getFullYear() })
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
  const mon = new Date(w1mon); mon.setUTCDate(w1mon.getUTCDate() + (week - 1) * 7)
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

// ── Helpers ──────────────────────────────────────────────────────
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0 }
function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item); if (!acc[k]) acc[k] = []; acc[k].push(item); return acc
  }, {} as Record<string, T[]>)
}

// ── Sub-components ───────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color = '#3b82f6', bgColor = '#eff6ff' }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string; bgColor?: string
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
    OK:    { label: 'OK', bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
    NG:    { label: 'NG', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    blank: { label: '—',  bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  }[key]
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  )
}

const CHART_COLORS = ['#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16']
const REGION_COLORS: Record<string,string> = { HN:'#3b82f6', HP:'#8b5cf6', DN:'#22c55e', HCM:'#f59e0b', BD:'#ec4899', OTHER:'#6b7280' }

// ── Main ─────────────────────────────────────────────────────────
interface Props { userEmail: string; isAdmin: boolean }

export default function ChatLuongDashboard({ userEmail, isAdmin }: Props) {
  // ── State ─────────────────────────────────────────────────────
  const [selectedRegion, setSelectedRegion] = useState<RegionConfig>(QUALITY_REGIONS[0])
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0)
  const [periodMode, setPeriodMode] = useState<'thang' | 'tuan'>('thang')
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null)
  const [mainTab, setMainTab] = useState<'chitiet' | 'ktv' | 'thongke'>('chitiet')

  const [records, setRecords] = useState<QualityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const [tkStats, setTkStats] = useState<ThongKeStats | null>(null)
  const [tkLoading, setTkLoading] = useState(false)
  const [tkError, setTkError] = useState<string | null>(null)

  const [filterNG, setFilterNG] = useState(false)
  const [filterNguyen, setFilterNguyen] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [ktvSearch, setKtvSearch] = useState('')

  const selectedMonth = MONTHS[selectedMonthIdx]

  // ── Fetch region data ─────────────────────────────────────────
  const fetchData = useCallback(async (region: string, month: number, year: number, refresh = false) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ region, month: String(month), year: String(year) })
      if (refresh) params.set('refresh', 'true')
      const res = await fetch(`/api/chat-luong/records?${params}`)
      const json = await res.json()
      if (json.error) { setError(json.error); setRecords([]) }
      else {
        setRecords(json.records ?? [])
        setIsCached(json.cached === true)
        setFetchedAt(json.fetched_at ?? null)
      }
    } catch (e) { setError(String(e)); setRecords([]) }
    finally { setLoading(false) }
  }, [])

  // ── Fetch thống kê tổng hợp ───────────────────────────────────
  const fetchThongKe = useCallback(async (month: number, year: number) => {
    setTkLoading(true); setTkError(null)
    try {
      const params = new URLSearchParams({ month: String(month), year: String(year) })
      const res = await fetch(`/api/chat-luong/thongke?${params}`)
      const json = await res.json()
      if (json.error) { setTkError(json.error); setTkStats(null) }
      else setTkStats(json.stats ?? null)
    } catch (e) { setTkError(String(e)); setTkStats(null) }
    finally { setTkLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(selectedRegion.code, selectedMonth.month, selectedMonth.year)
    setSelectedWeekKey(null)
  }, [selectedRegion, selectedMonthIdx, fetchData, selectedMonth.month, selectedMonth.year])

  useEffect(() => {
    if (mainTab === 'thongke') {
      fetchThongKe(selectedMonth.month, selectedMonth.year)
    }
  }, [mainTab, selectedMonthIdx, fetchThongKe, selectedMonth.month, selectedMonth.year])

  // ── Week nav ──────────────────────────────────────────────────
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
    setSelectedWeekKey(allWeekKeys[Math.max(0, Math.min(allWeekKeys.length - 1, idx + delta))])
  }

  // ── Filtered records ─────────────────────────────────────────
  const periodRecords = useMemo(() => {
    if (periodMode === 'tuan' && selectedWeekKey)
      return records.filter(r => getISOWeekKey(r.sort_key) === selectedWeekKey)
    return records
  }, [records, periodMode, selectedWeekKey])

  const displayRecords = useMemo(() => {
    let f = periodRecords
    if (filterNG) f = f.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG')
    if (filterNguyen !== 'all') f = f.filter(r => r.nguyen_nhan === filterNguyen)
    if (searchText) {
      const q = searchText.toLowerCase()
      f = f.filter(r =>
        r.ten_khach.toLowerCase().includes(q) || r.so_xe.toLowerCase().includes(q) ||
        r.ky_thuat_vien.toLowerCase().includes(q) || r.loai_san_pham.toLowerCase().includes(q)
      )
    }
    return f
  }, [periodRecords, filterNG, filterNguyen, searchText])

  // ── KPIs ─────────────────────────────────────────────────────
  const total   = periodRecords.length
  const okCount = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'OK').length
  const ngCount = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length
  const pending = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'blank').length
  const ngRate  = pct(ngCount, okCount + ngCount)

  // ── Charts ────────────────────────────────────────────────────
  const nguyen_chart = useMemo(() => {
    const grp = groupBy(periodRecords, r => r.nguyen_nhan || 'Chưa phân loại')
    return Object.entries(grp).map(([name, recs]) => ({
      name, 'Tổng': recs.length,
      'NG': recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length,
    })).sort((a, b) => b['Tổng'] - a['Tổng'])
  }, [periodRecords])

  const weekly_chart = useMemo(() => {
    const grp = groupBy(records, r => getISOWeekKey(r.sort_key))
    return Object.entries(grp).sort(([a],[b]) => a.localeCompare(b)).map(([key, recs]) => {
      const checked = recs.filter(r => getTinhTrangKey(r.tinh_trang) !== 'blank')
      const ng = recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG')
      return {
        week: `W${key.split('-W')[1]}`, label: isoWeekLabel(key),
        'Tổng': recs.length, 'NG': ng.length,
        '% NG': checked.length > 0 ? Math.round(ng.length / checked.length * 100) : 0,
      }
    })
  }, [records])

  const product_chart = useMemo(() => {
    const grp = groupBy(periodRecords, r => r.loai_san_pham || 'Khác')
    return Object.entries(grp).map(([name, recs]) => ({
      name, 'Tổng': recs.length,
      'NG': recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length,
    })).sort((a, b) => b['Tổng'] - a['Tổng']).slice(0, 10)
  }, [periodRecords])

  // ── Loại lỗi charts ──────────────────────────────────────────
  const loai_loi_chart = useMemo(() => {
    const grp = groupBy(periodRecords.filter(r => r.loai_loi), r => r.loai_loi)
    return Object.entries(grp).map(([name, recs]) => ({
      name, 'Tổng': recs.length,
      'NG': recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length,
    })).sort((a, b) => b['Tổng'] - a['Tổng'])
  }, [periodRecords])

  const ktv_loai_loi = useMemo(() => {
    const ngRecs = periodRecords.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG' && r.loai_loi)
    const grp = groupBy(ngRecs, r => r.ky_thuat_vien || 'Chưa xác định')
    return Object.entries(grp).map(([ktv, recs]) => {
      const loaiMap: Record<string, number> = {}
      recs.forEach(r => { loaiMap[r.loai_loi] = (loaiMap[r.loai_loi] ?? 0) + 1 })
      const topLoai = Object.entries(loaiMap).sort((a,b)=>b[1]-a[1])
      return { ktv, total: recs.length, topLoai }
    }).sort((a, b) => b.total - a.total)
  }, [periodRecords])

  // ── Thống kê loại lỗi charts ─────────────────────────────────
  const tk_loai_loi_chart = useMemo(() => {
    if (!tkStats?.byLoaiLoi) return []
    return Object.entries(tkStats.byLoaiLoi)
      .filter(([name]) => name !== 'Không xác định' && name !== '')
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
  }, [tkStats])

  const tk_loai_loi_ktv = useMemo(() => {
    if (!tkStats?.byLoaiLoiPerKTV) return []
    return Object.entries(tkStats.byLoaiLoiPerKTV).map(([ktv, loaiMap]) => {
      const topLoai = Object.entries(loaiMap).sort((a,b)=>b[1]-a[1])
      const total = topLoai.reduce((s,[,v])=>s+v,0)
      return { ktv, total, topLoai }
    }).sort((a,b)=>b.total-a.total)
  }, [tkStats])

  // ── KTV stats (from region records) ───────────────────────────
  const ktvStats = useMemo(() => {
    const grp = groupBy(periodRecords, r => r.ky_thuat_vien || 'Chưa xác định')
    return Object.entries(grp).map(([name, recs]) => {
      const ok = recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'OK').length
      const ng = recs.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length
      const checked = ok + ng
      return { name, total: recs.length, ok, ng, checked, ngRate: pct(ng, checked) }
    }).sort((a, b) => b.total - a.total)
  }, [periodRecords])

  const filteredKtvStats = useMemo(() => {
    if (!ktvSearch) return ktvStats
    return ktvStats.filter(k => k.name.toLowerCase().includes(ktvSearch.toLowerCase()))
  }, [ktvStats, ktvSearch])

  // ── Thống kê charts ───────────────────────────────────────────
  const tk_region_chart = useMemo(() => {
    if (!tkStats) return []
    return QUALITY_REGIONS.map(r => ({
      name: r.name,
      code: r.code,
      'Tổng': tkStats.byRegion[r.code]?.total ?? 0,
      'OK':   tkStats.byRegion[r.code]?.ok    ?? 0,
      'NG':   tkStats.byRegion[r.code]?.ng    ?? 0,
    })).filter(r => r['Tổng'] > 0)
  }, [tkStats])

  const tk_nguyen_chart = useMemo(() => {
    if (!tkStats) return []
    return Object.entries(tkStats.byNguyen)
      .map(([name, v]) => ({ name, 'Tổng': v.total, 'NG': v.ng }))
      .sort((a, b) => b['Tổng'] - a['Tổng'])
  }, [tkStats])

  const tk_ktv_chart = useMemo(() => {
    if (!tkStats) return []
    return Object.entries(tkStats.byKTV)
      .map(([name, v]) => ({ name, region: v.region, total: v.total, ok: v.ok, ng: v.ng, ngRate: pct(v.ng, v.ok + v.ng) }))
      .sort((a, b) => b.total - a.total)
  }, [tkStats])

  const tk_ktv_filtered = useMemo(() => {
    if (!ktvSearch) return tk_ktv_chart
    return tk_ktv_chart.filter(k => k.name.toLowerCase().includes(ktvSearch.toLowerCase()))
  }, [tk_ktv_chart, ktvSearch])

  // ── Helpers ───────────────────────────────────────────────────
  const periodLabel = periodMode === 'tuan' && selectedWeekKey ? isoWeekLabel(selectedWeekKey) : selectedMonth.label
  function fmtFetchedAt(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  }

  // ── Unique nguyên nhân from actual data ───────────────────────
  const uniqueNguyenNhan = useMemo(() => {
    const vals = new Set(records.map(r => r.nguyen_nhan).filter(Boolean))
    return Array.from(vals).sort()
  }, [records])

  async function handleLogout() {
    const sb = createSupabaseBrowserClient()
    await sb.auth.signOut(); window.location.href = '/login'
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-14 md:top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/kho" className="text-sm text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">&larr; Kho</a>
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
            {/* Main tab switcher */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([['chitiet','Chi tiết'],['ktv','KTV'],['thongke','Thống kê tổng hợp']] as const).map(([t, label]) => (
                <button key={t} onClick={() => setMainTab(t)}
                  className={`px-3 py-2 font-medium transition ${mainTab === t ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Period toggle - only Chi tiết */}
            {mainTab === 'chitiet' && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {(['thang','tuan'] as const).map(m => (
                  <button key={m} onClick={() => setPeriodMode(m)}
                    className={`px-3 py-2 font-medium transition ${periodMode === m ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {m === 'thang' ? 'Tháng' : 'Tuần'}
                  </button>
                ))}
              </div>
            )}

            {/* Month selector */}
            <select value={selectedMonthIdx} onChange={e => setSelectedMonthIdx(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
            </select>

            {/* Week nav */}
            {mainTab === 'chitiet' && periodMode === 'tuan' && (
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
            {mainTab !== 'thongke' && (
              <div className="flex items-center gap-1.5">
                {isCached && fetchedAt && <span className="text-[10px] text-gray-400">⚡ {fmtFetchedAt(fetchedAt)}</span>}
                <button onClick={() => fetchData(selectedRegion.code, selectedMonth.month, selectedMonth.year, true)}
                  disabled={loading} title="Làm mới từ Google Sheets"
                  className="px-2.5 py-2 text-sm text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-gray-200 transition disabled:opacity-40">
                  🔄
                </button>
              </div>
            )}
            {mainTab === 'thongke' && (
              <button onClick={() => fetchThongKe(selectedMonth.month, selectedMonth.year)}
                disabled={tkLoading} title="Làm mới từ Google Sheets"
                className="px-2.5 py-2 text-sm text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-gray-200 transition disabled:opacity-40">
                🔄
              </button>
            )}

            {isAdmin && <a href="/admin/users" className="px-3 py-2 text-sm border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition">Admin</a>}
            <button onClick={handleLogout} className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition" title="Đăng xuất">🚪</button>
          </div>
        </div>
      </header>

      {/* ── Region tabs — only for Chi tiết + KTV ── */}
      {mainTab !== 'thongke' && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 py-2 overflow-x-auto">
              {QUALITY_REGIONS.map(region => (
                <button key={region.code} onClick={() => setSelectedRegion(region)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${selectedRegion.code === region.code ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  style={selectedRegion.code === region.code ? { background: region.color } : {}}>
                  {region.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">

        {/* ══ TAB: CHI TIẾT ══ */}
        {mainTab === 'chitiet' && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-20 gap-2 text-emerald-600">
                <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Đang tải {selectedRegion.name}...</span>
              </div>
            )}
            {error && !loading && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700 mb-5">{error}</div>
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

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <KpiCard icon="📋" label="Tổng đơn"  value={total}     color="#3b82f6" bgColor="#eff6ff" />
                  <KpiCard icon="✅" label="Đạt (OK)"  value={okCount}   sub={`${pct(okCount,total)}% tổng`} color="#16a34a" bgColor="#f0fdf4" />
                  <KpiCard icon="❌" label="Lỗi (NG)"  value={ngCount}   sub="cần KT lại" color="#dc2626" bgColor="#fef2f2" />
                  <KpiCard icon="⏳" label="Chưa KT"  value={pending}   sub={`${pct(pending,total)}% tổng`} color="#6b7280" bgColor="#f9fafb" />
                  <KpiCard icon="📊" label="Tỷ lệ NG"  value={`${ngRate}%`} sub="trong số đã KT"
                    color={ngRate>=5?'#dc2626':ngRate>=2?'#f59e0b':'#16a34a'}
                    bgColor={ngRate>=5?'#fef2f2':ngRate>=2?'#fffbeb':'#f0fdf4'} />
                </div>

                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Theo nguyên nhân điều phối</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={nguyen_chart} margin={{ top:0, right:10, left:-20, bottom:50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize:9 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize:9 }} />
                        <Tooltip />
                        <Bar dataKey="Tổng" fill="#3b82f6" radius={[3,3,0,0]} />
                        <Bar dataKey="NG"   fill="#ef4444" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Xu hướng NG theo tuần</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={weekly_chart} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="week" tick={{ fontSize:9 }} />
                        <YAxis yAxisId="left" tick={{ fontSize:9 }} />
                        <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize:9 }} />
                        <Tooltip formatter={(val,name) => name==='% NG'?`${val}%`:val} />
                        <Legend wrapperStyle={{ fontSize:10 }} />
                        <Line yAxisId="left"  type="monotone" dataKey="Tổng" stroke="#3b82f6" dot={{ r:3 }} strokeWidth={2} />
                        <Line yAxisId="left"  type="monotone" dataKey="NG"   stroke="#ef4444" dot={{ r:3 }} strokeWidth={2} />
                        <Line yAxisId="right" type="monotone" dataKey="% NG" stroke="#f59e0b" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Theo loại sản phẩm (top 10)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={product_chart} layout="vertical" margin={{ top:0, right:30, left:60, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize:9 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize:9 }} width={60} />
                        <Tooltip />
                        <Bar dataKey="Tổng" fill="#3b82f6" radius={[0,3,3,0]}>
                          {product_chart.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                        </Bar>
                        <Bar dataKey="NG" fill="#ef4444" radius={[0,3,3,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {loai_loi_chart.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Loại lỗi phổ biến</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={loai_loi_chart} layout="vertical" margin={{ top:0, right:40, left:90, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" tick={{ fontSize:9 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize:9 }} width={90} />
                          <Tooltip />
                          <Bar dataKey="Tổng" fill="#3b82f6" radius={[0,3,3,0]} />
                          <Bar dataKey="NG"   fill="#ef4444" radius={[0,3,3,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {ngCount > 0 && (() => {
                    const ktvNG = Object.entries(groupBy(periodRecords.filter(r=>getTinhTrangKey(r.tinh_trang)==='NG'), r=>r.ky_thuat_vien||'Chưa rõ'))
                      .map(([name,recs])=>({name,'NG':recs.length})).sort((a,b)=>b.NG-a.NG).slice(0,8)
                    return (
                      <div className="bg-white rounded-xl border border-red-100 p-4">
                        <h3 className="text-sm font-semibold text-red-700 mb-3">KTV có đơn NG</h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={ktvNG} layout="vertical" margin={{ top:0, right:30, left:80, bottom:0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tick={{ fontSize:9 }} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize:9 }} width={80} />
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
                      <input value={searchText} onChange={e=>setSearchText(e.target.value)}
                        placeholder="Tìm khách hàng / xe / KTV..."
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-52 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <select value={filterNguyen} onChange={e=>setFilterNguyen(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                        <option value="all">Tất cả nguyên nhân</option>
                        {uniqueNguyenNhan.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button onClick={()=>setFilterNG(v=>!v)}
                        className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${filterNG?'bg-red-600 text-white border-red-600':'border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700'}`}>
                        {filterNG ? '❌ Chỉ NG' : '❌ Lọc NG'}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Ngày','Tuần','KQ','Loại lỗi','Nguyên nhân','Khách hàng','Sản phẩm','Số xe','Kỹ thuật viên','Hoàn thành'].map(h=>(
                            <th key={h} className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayRecords.slice(0,200).map((r,i) => {
                          const isNG = getTinhTrangKey(r.tinh_trang) === 'NG'
                          return (
                            <tr key={`${r.sort_key}-${r.so_xe}-${i}`}
                              className={`border-b border-gray-100 last:border-0 transition ${isNG?'bg-red-50/60 hover:bg-red-50':(i%2===1?'bg-gray-50/30 hover:bg-gray-50':'hover:bg-gray-50/60')}`}>
                              <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-700">{r.sort_key}</td>
                              <td className="px-3 py-2 text-gray-500">{r.tuan}</td>
                              <td className="px-3 py-2 text-center"><TinhTrangBadge value={r.tinh_trang} /></td>
                              <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={r.loai_loi}>
                                {isNG && r.loai_loi ? <span className="text-red-600 font-medium">{r.loai_loi}</span> : r.loai_loi || '—'}
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
                      <p className="text-center text-xs text-gray-400 py-3">Hiển thị 200/{displayRecords.length} đơn — dùng bộ lọc để thu hẹp</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ TAB: KTV ══ */}
        {mainTab === 'ktv' && (
          <div className="space-y-6">
            {loading && (
              <div className="flex items-center justify-center py-20 gap-2 text-emerald-600">
                <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Đang tải...</span>
              </div>
            )}
            {!loading && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-gray-800 text-lg">Thống kê kỹ thuật viên</h2>
                    <p className="text-sm text-gray-400">{selectedRegion.name} · {selectedMonth.label} · {ktvStats.length} KTV</p>
                  </div>
                </div>

                {/* KTV bar chart top NG */}
                {ktvStats.filter(k=>k.ng>0).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">KTV có tỷ lệ NG cao nhất (top 10)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ktvStats.filter(k=>k.ng>0).slice(0,10)} layout="vertical" margin={{ top:0, right:50, left:120, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize:9 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize:9 }} width={120} />
                        <Tooltip formatter={(val,name) => name==='% NG'?`${val}%`:val} />
                        <Legend wrapperStyle={{ fontSize:10 }} />
                        <Bar dataKey="total" name="Tổng" fill="#3b82f6" radius={[0,3,3,0]} />
                        <Bar dataKey="ng"    name="NG"   fill="#ef4444" radius={[0,3,3,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* KTV table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Danh sách KTV
                      <span className="ml-2 text-xs font-normal text-gray-400">{filteredKtvStats.length} người</span>
                    </h3>
                    <input value={ktvSearch} onChange={e=>setKtvSearch(e.target.value)}
                      placeholder="Tìm tên KTV..."
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium">Kỹ thuật viên</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Tổng đơn</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">OK</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">NG</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Chưa KT</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Tỷ lệ NG</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredKtvStats.map((k, i) => (
                          <tr key={k.name} className={`border-b border-gray-100 last:border-0 ${k.ng > 0 ? 'hover:bg-red-50/40' : (i%2===1?'bg-gray-50/30 hover:bg-gray-50':'hover:bg-gray-50/60')}`}>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{k.name}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-700">{k.total}</td>
                            <td className="px-4 py-2.5 text-right text-green-600 font-medium">{k.ok}</td>
                            <td className="px-4 py-2.5 text-right">
                              {k.ng > 0 ? <span className="font-bold text-red-600">{k.ng}</span> : <span className="text-gray-400">0</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-400">{k.total - k.checked}</td>
                            <td className="px-4 py-2.5 text-right">
                              {k.checked > 0 ? (
                                <span className={`font-bold ${k.ngRate>=10?'text-red-600':k.ngRate>=5?'text-orange-500':k.ngRate>0?'text-yellow-600':'text-green-600'}`}>
                                  {k.ngRate}%
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {k.ng > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                                  {k.ng} NG
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredKtvStats.length === 0 && (
                          <tr><td colSpan={7} className="text-center py-8 text-gray-400">Không tìm thấy KTV</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* KTV loại lỗi breakdown */}
                {ktv_loai_loi.length > 0 && (
                  <div className="bg-white rounded-xl border border-red-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-red-700">Phân tích lỗi NG theo KTV</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Chỉ hiện KTV có đơn NG — loại lỗi được ghi trong cột Loại lỗi</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Kỹ thuật viên</th>
                            <th className="text-right px-4 py-3 text-gray-500 font-medium">Tổng NG</th>
                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Loại lỗi (số lần)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ktv_loai_loi.slice(0, 30).map((k, i) => (
                            <tr key={k.ktv} className={`border-b border-gray-100 last:border-0 ${i%2===1?'bg-gray-50/30':''}`}>
                              <td className="px-4 py-2.5 font-medium text-gray-800">{k.ktv}</td>
                              <td className="px-4 py-2.5 text-right font-bold text-red-600">{k.total}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {k.topLoai.slice(0, 5).map(([loai, cnt]) => (
                                    <span key={loai} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 border border-orange-200 text-orange-700">
                                      {loai} <span className="font-bold">×{cnt}</span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ TAB: THỐNG KÊ TỔNG HỢP ══ */}
        {mainTab === 'thongke' && (
          <div className="space-y-6">
            {tkLoading && (
              <div className="flex items-center justify-center py-20 gap-2 text-emerald-600">
                <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Đang tải dữ liệu tổng hợp từ Google Sheets...</span>
              </div>
            )}
            {tkError && !tkLoading && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700">{tkError}</div>
            )}
            {!tkLoading && !tkStats && !tkError && (
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg font-medium text-gray-500">Chọn tháng để xem thống kê tổng hợp</p>
                <button onClick={() => fetchThongKe(selectedMonth.month, selectedMonth.year)}
                  className="mt-4 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
                  Tải dữ liệu
                </button>
              </div>
            )}

            {!tkLoading && tkStats && (
              <>
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">Tổng hợp tất cả khu vực</h2>
                  <p className="text-sm text-gray-400">{selectedMonth.label} · {tkStats.total} đơn</p>
                </div>

                {/* Overall KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard icon="📋" label="Tổng đơn"  value={tkStats.total}   color="#3b82f6" bgColor="#eff6ff" />
                  <KpiCard icon="✅" label="Đạt (OK)"  value={tkStats.ok}     sub={`${pct(tkStats.ok,tkStats.total)}% tổng`} color="#16a34a" bgColor="#f0fdf4" />
                  <KpiCard icon="❌" label="Lỗi (NG)"  value={tkStats.ng}     sub="cần KT lại" color="#dc2626" bgColor="#fef2f2" />
                  <KpiCard icon="📊" label="Tỷ lệ NG" value={`${pct(tkStats.ng,tkStats.ok+tkStats.ng)}%`} sub="trong số đã KT"
                    color={pct(tkStats.ng,tkStats.ok+tkStats.ng)>=5?'#dc2626':'#16a34a'}
                    bgColor={pct(tkStats.ng,tkStats.ok+tkStats.ng)>=5?'#fef2f2':'#f0fdf4'} />
                </div>

                {/* Charts row */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* So sánh khu vực */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">So sánh theo khu vực</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={tk_region_chart} margin={{ top:0, right:10, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize:10 }} />
                        <YAxis tick={{ fontSize:9 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize:10 }} />
                        <Bar dataKey="Tổng" fill="#3b82f6" radius={[3,3,0,0]}>
                          {tk_region_chart.map(r => <Cell key={r.code} fill={REGION_COLORS[r.code]??'#3b82f6'} />)}
                        </Bar>
                        <Bar dataKey="NG" fill="#ef4444" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Nguyên nhân tổng hợp */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Nguyên nhân điều phối (tất cả khu vực)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={tk_nguyen_chart} margin={{ top:0, right:10, left:-20, bottom:50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize:9 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize:9 }} />
                        <Tooltip />
                        <Bar dataKey="Tổng" fill="#3b82f6" radius={[3,3,0,0]} />
                        <Bar dataKey="NG"   fill="#ef4444" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Loại lỗi phổ biến toàn quốc */}
                {tk_loai_loi_chart.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Loại lỗi phổ biến (tất cả khu vực)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={tk_loai_loi_chart} layout="vertical" margin={{ top:0, right:50, left:100, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" tick={{ fontSize:9 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize:9 }} width={100} />
                          <Tooltip />
                          <Bar dataKey="total" name="Số lần" fill="#f97316" radius={[0,3,3,0]}>
                            {tk_loai_loi_chart.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Loại lỗi per region table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-700">Loại lỗi theo khu vực</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-3 py-2 text-gray-500 font-medium">Khu vực</th>
                              {tk_loai_loi_chart.slice(0,5).map(l=>(
                                <th key={l.name} className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{l.name}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {QUALITY_REGIONS.map(r => {
                              const regionData = tkStats?.byLoaiLoiPerRegion?.[r.code] ?? {}
                              const hasData = Object.values(regionData).some(v=>v>0)
                              if (!hasData) return null
                              return (
                                <tr key={r.code} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full" style={{background:r.color}}/>
                                      <span className="font-medium text-gray-700">{r.name}</span>
                                    </div>
                                  </td>
                                  {tk_loai_loi_chart.slice(0,5).map(l=>(
                                    <td key={l.name} className="px-3 py-2 text-right">
                                      {regionData[l.name] ? <span className="font-medium text-orange-600">{regionData[l.name]}</span> : <span className="text-gray-300">—</span>}
                                    </td>
                                  ))}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* KTV loại lỗi (toàn quốc) */}
                {tk_loai_loi_ktv.length > 0 && (
                  <div className="bg-white rounded-xl border border-red-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-red-700">Loại lỗi theo kỹ thuật viên (tất cả khu vực)</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Kỹ thuật viên</th>
                            <th className="text-right px-4 py-3 text-gray-500 font-medium">Tổng lỗi</th>
                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Loại lỗi (số lần)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tk_loai_loi_ktv.slice(0,50).map((k,i) => (
                            <tr key={k.ktv} className={`border-b border-gray-100 last:border-0 ${i%2===1?'bg-gray-50/30':''}`}>
                              <td className="px-4 py-2.5 font-medium text-gray-800">{k.ktv}</td>
                              <td className="px-4 py-2.5 text-right font-bold text-orange-600">{k.total}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {k.topLoai.slice(0,5).map(([loai,cnt]) => (
                                    <span key={loai} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 border border-orange-200 text-orange-700">
                                      {loai} <span className="font-bold">×{cnt}</span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Region breakdown table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700">Chi tiết theo khu vực</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium">Khu vực</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Tổng đơn</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">OK</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">NG</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Chưa KT</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Tỷ lệ NG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {QUALITY_REGIONS.map(r => {
                          const d = tkStats.byRegion[r.code]
                          if (!d || d.total === 0) return null
                          const rate = pct(d.ng, d.ok + d.ng)
                          return (
                            <tr key={r.code} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ background: r.color }} />
                                  <span className="font-medium text-gray-800">{r.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-gray-700">{d.total}</td>
                              <td className="px-4 py-3 text-right text-green-600 font-medium">{d.ok}</td>
                              <td className="px-4 py-3 text-right">
                                {d.ng>0 ? <span className="font-bold text-red-600">{d.ng}</span> : <span className="text-gray-400">0</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-400">{d.pending}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-bold ${rate>=5?'text-red-600':rate>=2?'text-orange-500':rate>0?'text-yellow-600':'text-green-600'}`}>
                                  {rate}%
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                        {/* Tổng cộng */}
                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                          <td className="px-4 py-3 text-gray-800">Tổng cộng</td>
                          <td className="px-4 py-3 text-right text-gray-800">{tkStats.total}</td>
                          <td className="px-4 py-3 text-right text-green-600">{tkStats.ok}</td>
                          <td className="px-4 py-3 text-right text-red-600">{tkStats.ng}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{tkStats.pending}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{pct(tkStats.ng,tkStats.ok+tkStats.ng)}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* KTV tổng hợp table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Kỹ thuật viên toàn quốc
                      <span className="ml-2 text-xs font-normal text-gray-400">{tk_ktv_chart.length} KTV</span>
                    </h3>
                    <input value={ktvSearch} onChange={e=>setKtvSearch(e.target.value)}
                      placeholder="Tìm tên KTV..."
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium">Kỹ thuật viên</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium">Khu vực</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Tổng</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">OK</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">NG</th>
                          <th className="text-right px-4 py-3 text-gray-500 font-medium">Tỷ lệ NG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tk_ktv_filtered.slice(0,100).map((k, i) => (
                          <tr key={k.name} className={`border-b border-gray-100 last:border-0 ${k.ng>0?'hover:bg-red-50/40':(i%2===1?'bg-gray-50/30 hover:bg-gray-50':'hover:bg-gray-50/60')}`}>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{k.name}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ background: REGION_COLORS[k.region]??'#6b7280' }}>
                                {k.region}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-700">{k.total}</td>
                            <td className="px-4 py-2.5 text-right text-green-600">{k.ok}</td>
                            <td className="px-4 py-2.5 text-right">{k.ng>0?<span className="font-bold text-red-600">{k.ng}</span>:<span className="text-gray-400">0</span>}</td>
                            <td className="px-4 py-2.5 text-right">
                              {k.ok+k.ng>0 ? (
                                <span className={`font-bold ${k.ngRate>=10?'text-red-600':k.ngRate>=5?'text-orange-500':k.ngRate>0?'text-yellow-600':'text-green-600'}`}>
                                  {k.ngRate}%
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
