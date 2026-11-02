'use client'
import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, ComposedChart, LineChart, PieChart, Pie, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface WeeklySummary {
  from: string; to: string; total: number
  repaired: number; repairedPct: number
  warranty: number; warrantyPct: number
  noFault:  number; noFaultPct:  number
  broken:   number; brokenPct:   number
  byProduct: { product: string; delivered: number; repaired: number; warranty: number; noFault: number; broken: number }[]
}

interface ErrorMatrix {
  errors: string[]; devices: string[]
  matrix: Record<string, Record<string, number>>
  totalByError: Record<string, number>; totalByDevice: Record<string, number>
}

interface HotroDetail {
  from: string; to: string
  days: { date: string; total: number; fast: number; normal: number; slow: number; scheduled: number; followup: number; staff: Record<string, number> }[]
  staffNames: string[]
  totals: { total: number; fast: number; normal: number; slow: number; scheduled: number; followup: number; fastPct: number; byStaff: Record<string, number> }
  errMatrix: ErrorMatrix
  byZone:       { zone: string; count: number }[]
  byType:       { type: string; count: number }[]
  byDirection:  { direction: string; count: number }[]
  byChannel:    { channel: string; count: number }[]
  byHashtagErr: { error: string; count: number }[]
}

interface SheetsKV { key: string; count: number }
interface SheetsSummary {
  from: string; to: string; totalRequests: number; daysFound: number
  resolution: SheetsKV[]
  channels:   SheetsKV[]
  errors:     SheetsKV[]
  devices:    SheetsKV[]
  locations:  SheetsKV[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const OUTCOME_COLORS  = ['#22c55e','#f59e0b','#3b82f6','#ef4444']
const DEVICE_COLORS   = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#10b981','#f97316','#6366f1','#14b8a6']
const ERROR_PIE_COLORS= ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#10b981','#f97316','#6366f1','#14b8a6','#e11d48','#84cc16']
const PIE_COLORS      = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316']
// Speed colors matching HoTro: Fast=green, Normal=amber, Low=red, Hẹn=purple, MBL=pink
const SPEED_STACK_COLORS = ['#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899']

const STAFF_COLORS: Record<string, string> = {
  Kane: '#3b82f6', Stefan: '#a855f7', Shiro: '#22c55e', Irene: '#ec4899', Blue: '#f97316',
}

const DIRECTION_LABEL_MAP: Record<string, string> = {
  i: 'Inbound (Khách gọi vào)',
  o: 'Outbound (NV gọi ra)',
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG → base64 PNG (hi-res)
// ─────────────────────────────────────────────────────────────────────────────
async function svgToBase64(svgEl: SVGSVGElement): Promise<string> {
  return new Promise(resolve => {
    const w = svgEl.clientWidth  || 800
    const h = svgEl.clientHeight || 300
    const scale = 2 // hi-res
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width',  String(w * scale))
    clone.setAttribute('height', String(h * scale))
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect')
    rect.setAttribute('width','100%'); rect.setAttribute('height','100%'); rect.setAttribute('fill','white')
    clone.insertBefore(rect, clone.firstChild)
    const svgStr = new XMLSerializer().serializeToString(clone)
    const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url    = URL.createObjectURL(blob)
    const img    = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w * scale; canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height)
      ctx.drawImage(img,0,0,canvas.width,canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
      <span className="text-lg">{icon}</span>
      <h3 className="font-bold text-gray-800 text-sm uppercase tracking-widest">{title}</h3>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm mt-0.5 opacity-80">{label}</div>
      {sub && <div className="text-lg font-semibold mt-1 opacity-90">{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function WeeklyReportTab() {
  function defaultWeek() {
    const now = new Date(); const day = now.getDay()
    const offset = day === 0 ? -6 : 1 - day
    const mon = new Date(now); mon.setDate(now.getDate() + offset)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return { from: fmt(mon), to: fmt(new Date()) }
  }
  const dw = defaultWeek()
  const [from, setFrom]             = useState(dw.from)
  const [to,   setTo]               = useState(dw.to)
  const [repairData,  setRepairData]  = useState<WeeklySummary | null>(null)
  const [repairErr,   setRepairErr]   = useState<ErrorMatrix | null>(null)
  const [hotroData,   setHotroData]   = useState<HotroDetail | null>(null)
  const [sheetsData,  setSheetsData]  = useState<SheetsSummary | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genStatus,  setGenStatus]  = useState('')

  // Chart refs for screenshot
  const refs = {
    repairOutcome:    useRef<HTMLDivElement>(null),
    repairByDevice:   useRef<HTMLDivElement>(null),
    hotroDaily:       useRef<HTMLDivElement>(null),
    hotroStaff:       useRef<HTMLDivElement>(null),
    hotroZone:        useRef<HTMLDivElement>(null),
    hotroSpeed:       useRef<HTMLDivElement>(null),
    hotroChannel:     useRef<HTMLDivElement>(null),
    hotroDirection:   useRef<HTMLDivElement>(null),
    hotroError:       useRef<HTMLDivElement>(null),
  }

  async function load() {
    setLoading(true)
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`/api/repair-tracking/weekly-summary?from=${from}&to=${to}`).then(r => r.json()),
        fetch(`/api/repair-tracking/weekly-error-matrix?from=${from}&to=${to}`).then(r => r.json()),
        fetch(`/api/ho-tro/weekly-detail?from=${from}&to=${to}`).then(r => r.json()),
        fetch(`/api/ho-tro/weekly-sheets-summary?from=${from}&to=${to}`).then(r => r.json()),
      ])
      if (!r1.error) setRepairData(r1)
      if (!r2.error) setRepairErr(r2)
      if (!r3.error) setHotroData(r3)
      if (!r4.error) setSheetsData(r4)
    } catch (e) {
      console.error('WeeklyReportTab load error:', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function captureCharts() {
    const images: { id: string; base64: string }[] = []
    for (const [id, ref] of Object.entries(refs)) {
      const svg = ref.current?.querySelector('svg')
      if (!svg) continue
      const base64 = await svgToBase64(svg as SVGSVGElement)
      if (base64) images.push({ id, base64 })
    }
    return images
  }

  async function handleGenerateWord() {
    if (!repairData || !hotroData) return
    setGenLoading(true)
    setGenStatus('Đang chụp biểu đồ...')
    try {
      const allChartImages = await captureCharts()
      setGenStatus('Đang tạo file Word...')
      const weekLabel = `${from.split('-').reverse().join('/')} – ${to.split('-').reverse().join('/')}`
      const res = await fetch('/api/reports/weekly-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekLabel,
          hotro: {
            days:        hotroData.days,
            errMatrix:   hotroData.errMatrix,
            staffNames:  hotroData.staffNames,
            totals:      hotroData.totals,
            byZone:      hotroData.byZone      ?? [],
            byType:      hotroData.byType      ?? [],
            byDirection: hotroData.byDirection ?? [],
            chartImages: allChartImages.filter(i => i.id.startsWith('hotro')),
          },
          repair: {
            summary: {
              total:       repairData.total,
              repaired:    repairData.repaired,    repairedPct: repairData.repairedPct,
              warranty:    repairData.warranty,    warrantyPct: repairData.warrantyPct,
              noFault:     repairData.noFault,     noFaultPct:  repairData.noFaultPct,
              broken:      repairData.broken,      brokenPct:   repairData.brokenPct,
            },
            byProduct:   repairData.byProduct,
            errorMatrix: repairErr ?? { errors:[], devices:[], matrix:{}, totalByError:{}, totalByDevice:{} },
            chartImages: allChartImages.filter(i => i.id.startsWith('repair')),
          },
        }),
      })
      if (!res.ok) { alert('Lỗi tạo file báo cáo'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `Bao_cao_tuan_${from.replace(/-/g,'')}_${to.replace(/-/g,'')}.docx`; a.click()
      URL.revokeObjectURL(url)
      setGenStatus('')
    } catch (e) {
      console.error(e)
      alert('Lỗi khi tạo file')
      setGenStatus('')
    } finally {
      setGenLoading(false)
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const outcomeData = repairData ? [
    { name: 'Đã sửa',   value: repairData.repaired, pct: repairData.repairedPct },
    { name: 'Bảo hành', value: repairData.warranty, pct: repairData.warrantyPct },
    { name: 'Không lỗi',value: repairData.noFault,  pct: repairData.noFaultPct  },
    { name: 'Báo phế',  value: repairData.broken,   pct: repairData.brokenPct   },
  ] : []

  // Chart 1: ComposedChart daily — Bar(Tổng YC) + Line(Hẹn & MB lại)
  const dailyComposedData = (hotroData?.days ?? []).map(d => ({
    date: d.date.slice(5).replace('-','/'),
    'Tổng YC': d.total,
    'Hẹn & MB lại': (d.scheduled ?? 0) + (d.followup ?? 0),
  }))

  // Chart 2: Stacked resolution bars per day (matching HoTro exactly)
  const resolutionData = (hotroData?.days ?? []).map(d => ({
    date: d.date.slice(5).replace('-','/'),
    '#f Fast': d.fast,
    '#n Normal': d.normal,
    '#l Low': d.slow,
    'Hẹn': d.scheduled ?? 0,
    'Mai báo lại': d.followup ?? 0,
  }))

  // Chart 3: % Cần theo dõi per day
  const pendingPctData = (hotroData?.days ?? []).map(d => ({
    date: d.date.slice(5).replace('-','/'),
    'Cần theo dõi (%)': d.total > 0 ? Math.round(((d.scheduled ?? 0) + (d.followup ?? 0)) / d.total * 100) : 0,
  }))

  // Chart 5: Device pie from errMatrix.totalByDevice
  const devicePieData = hotroData
    ? Object.entries(hotroData.errMatrix.totalByDevice).sort((a,b) => b[1]-a[1]).map(([name,value]) => ({ name, value }))
    : []

  // Chart 6: Zone vertical bar
  const locationBarData = (hotroData?.byZone ?? []).slice(0,10).map(z => ({
    name: z.zone || '(trống)',
    value: z.count,
  }))

  // Chart 7: Channel pie (aggregate — no per-day channel data available)
  const channelPieData = (hotroData?.byChannel ?? []).map((c, i) => ({
    name: c.channel,
    value: c.count,
    color: ['#6366f1','#22c55e','#f97316'][i] ?? PIE_COLORS[i],
  }))

  // Chart 8: Error donut from hashtag errors
  const errorDonutData = (hotroData?.byHashtagErr ?? [])
    .filter(e => e.error && e.count > 0).slice(0, 12)
    .map(e => ({ name: e.error, value: e.count }))

  // Direction với label đẹp
  const directionData = (hotroData?.byDirection ?? []).map(d => ({
    name:  DIRECTION_LABEL_MAP[d.direction] ?? (d.direction || 'Khác'),
    value: d.count,
  }))

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Báo cáo tuần</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tổng hợp Sửa chữa & Hỗ trợ kỹ thuật — preview trước khi xuất Word</p>
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {loading ? 'Đang tải...' : '🔍 Xem báo cáo'}
        </button>
        <button onClick={handleGenerateWord} disabled={!repairData || !hotroData || genLoading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium flex items-center gap-2 shadow-sm ml-auto">
          📄 {genLoading ? (genStatus || 'Đang tạo...') : 'Xuất báo cáo tuần (.docx)'}
        </button>
      </div>

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3 animate-pulse">📊</div>
          <p>Đang tải dữ liệu từ dashboard...</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION A — PHẦN SỬA CHỮA
      ══════════════════════════════════════════════════════════════════ */}
      {repairData && !loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
          <SectionHeader icon="🔧" title={`Tổng hợp sửa chữa — ${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`} />

          {/* Outcome cards */}
          <div>
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-widest">OUTCOME SUMMARY — {repairData.total} thiết bị hoàn thành</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Đã sửa xong" value={repairData.repaired} sub={`${repairData.repairedPct}%`} color="bg-emerald-50 border border-emerald-200 text-emerald-700" />
              <StatCard label="Gửi bảo hành" value={repairData.warranty} sub={`${repairData.warrantyPct}%`} color="bg-amber-50 border border-amber-200 text-amber-700" />
              <StatCard label="Không lỗi" value={repairData.noFault} sub={`${repairData.noFaultPct}%`} color="bg-blue-50 border border-blue-200 text-blue-700" />
              <StatCard label="Báo phế" value={repairData.broken} sub={`${repairData.brokenPct}%`} color="bg-red-50 border border-red-200 text-red-700" />
            </div>
            {repairData.total > 0 && (
              <div className="mt-3 flex rounded-full overflow-hidden h-2.5 gap-px">
                <div className="bg-emerald-500 transition-all" style={{ width: `${repairData.repairedPct}%` }} />
                <div className="bg-amber-500   transition-all" style={{ width: `${repairData.warrantyPct}%` }} />
                <div className="bg-blue-500    transition-all" style={{ width: `${repairData.noFaultPct}%` }} />
                <div className="bg-red-500     transition-all" style={{ width: `${repairData.brokenPct}%` }} />
              </div>
            )}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div ref={refs.repairOutcome} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Phân bổ kết quả</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={outcomeData} dataKey="value" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, pct }) => `${name} ${pct}%`} labelLine={false}>
                    {outcomeData.map((_, i) => <Cell key={i} fill={OUTCOME_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div ref={refs.repairByDevice} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Kết quả theo thiết bị</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={repairData.byProduct} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="product" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="repaired" stackId="a" fill="#22c55e" name="Sửa xong" />
                  <Bar dataKey="warranty" stackId="a" fill="#f59e0b" name="Bảo hành" />
                  <Bar dataKey="noFault"  stackId="a" fill="#3b82f6" name="Không lỗi" />
                  <Bar dataKey="broken"   stackId="a" fill="#ef4444" name="Báo phế" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By Device table */}
          {repairData.byProduct.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">BẢNG CHI TIẾT THEO THIẾT BỊ</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs">
                      <th className="text-left px-4 py-3 font-semibold uppercase">Thiết bị</th>
                      <th className="text-right px-4 py-3 font-semibold uppercase">Hoàn thành</th>
                      <th className="text-right px-4 py-3 font-semibold text-emerald-300 uppercase">Sửa xong</th>
                      <th className="text-right px-4 py-3 font-semibold text-amber-300 uppercase">Bảo hành</th>
                      <th className="text-right px-4 py-3 font-semibold text-blue-300 uppercase">Không lỗi</th>
                      <th className="text-right px-4 py-3 font-semibold text-red-300 uppercase">Báo phế</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repairData.byProduct.map((row, i) => (
                      <tr key={row.product} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-700">{row.product}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{row.delivered}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">{row.repaired || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{row.warranty || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-blue-600 font-medium">{row.noFault || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 font-medium">{row.broken || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t-2 border-gray-300 text-sm">
                      <td className="px-4 py-2.5 text-gray-800">Tổng cộng</td>
                      <td className="px-4 py-2.5 text-right text-gray-800">{repairData.total}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">{repairData.repaired}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700">{repairData.warranty}</td>
                      <td className="px-4 py-2.5 text-right text-blue-700">{repairData.noFault}</td>
                      <td className="px-4 py-2.5 text-right text-red-700">{repairData.broken}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Repair Error matrix */}
          {repairErr && repairErr.errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">LỖI THEO THIẾT BỊ (ghi chú #hashtag)</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left px-3 py-2 font-semibold">Lỗi</th>
                      {repairErr.devices.map(d => <th key={d} className="px-3 py-2 font-semibold text-center">{d}</th>)}
                      <th className="px-3 py-2 font-semibold text-center">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repairErr.errors.map((err, ri) => (
                      <tr key={err} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 font-medium text-gray-700">{err}</td>
                        {repairErr.devices.map(dev => (
                          <td key={dev} className="px-3 py-2 text-center text-gray-600">
                            {repairErr.matrix[err]?.[dev] || '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-semibold text-gray-800">{repairErr.totalByError[err] || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50 font-semibold border-t border-blue-200">
                      <td className="px-3 py-2 text-gray-800">Tổng</td>
                      {repairErr.devices.map(dev => (
                        <td key={dev} className="px-3 py-2 text-center text-gray-800">{repairErr.totalByDevice[dev] || '—'}</td>
                      ))}
                      <td className="px-3 py-2 text-center text-gray-800">
                        {Object.values(repairErr.totalByError).reduce((s,v) => s+v, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {repairData.total === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              Không có thiết bị nào hoàn thành trong khoảng thời gian này.
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION B — HỖ TRỢ KỸ THUẬT
      ══════════════════════════════════════════════════════════════════ */}
      {hotroData && !loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
          <SectionHeader icon="🎧" title={`Tổng hợp Hỗ trợ kỹ thuật — ${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`} />

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Tổng yêu cầu"  value={hotroData.totals.total}   color="bg-blue-50 border border-blue-200 text-blue-700" />
            <StatCard label="Tỉ lệ nhanh"   value={`${hotroData.totals.fastPct}%`} color="bg-emerald-50 border border-emerald-200 text-emerald-700" />
            <StatCard label="Nhanh"          value={hotroData.totals.fast}    color="bg-emerald-50 border border-emerald-100 text-emerald-600" />
            <StatCard label="Hẹn lịch"       value={hotroData.totals.scheduled ?? 0} color="bg-violet-50 border border-violet-200 text-violet-700" />
            <StatCard label="Nhân viên"      value={hotroData.staffNames.length} color="bg-slate-50 border border-slate-200 text-slate-700" />
          </div>

          {/* Chart 1 (full width): ComposedChart — Tổng YC/ngày + Hẹn & MB lại line */}
          <div ref={refs.hotroDaily} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tổng số yêu cầu theo ngày</p>
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={dailyComposedData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="Tổng YC" fill="#3b82f6" />
                <Line type="monotone" dataKey="Hẹn & MB lại" stroke="#ef4444" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 + 3: Stacked resolution + Pending % */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Thời gian xử lý theo ngày</p>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={resolutionData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar dataKey="#f Fast"     stackId="a" fill={SPEED_STACK_COLORS[0]} />
                  <Bar dataKey="#n Normal"   stackId="a" fill={SPEED_STACK_COLORS[1]} />
                  <Bar dataKey="#l Low"      stackId="a" fill={SPEED_STACK_COLORS[2]} />
                  <Bar dataKey="Hẹn"        stackId="a" fill={SPEED_STACK_COLORS[3]} />
                  <Bar dataKey="Mai báo lại" stackId="a" fill={SPEED_STACK_COLORS[4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">% Cần theo dõi theo ngày</p>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={pendingPctData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="Cần theo dõi (%)" stroke="#ef4444" dot={{ r: 2 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4 + 6: Staff bar + Zone/Office vertical bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div ref={refs.hotroStaff} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Yêu cầu theo nhân viên</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={hotroData.staffNames.map(s => ({ name: s, value: hotroData.totals.byStaff[s] ?? 0 }))}
                  margin={{ top: 20, right: 20, bottom: 10, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Yêu cầu" radius={[5,5,0,0]}>
                    {hotroData.staffNames.map((s, i) => (
                      <Cell key={i} fill={STAFF_COLORS[s] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                    <LabelList dataKey="value" position="top" style={{ fontSize: 13, fill: '#1e293b', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {locationBarData.length > 0 && (
              <div ref={refs.hotroZone} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Yêu cầu theo văn phòng</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={locationBarData} margin={{ top: 20, right: 20, bottom: 10, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={45} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Số yêu cầu" radius={[5,5,0,0]}>
                      {locationBarData.map((_, i) => (
                        <Cell key={i} fill="#0891b2" />
                      ))}
                      <LabelList dataKey="value" position="top" style={{ fontSize: 13, fill: '#1e293b', fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Chart 5 + 8: Device pie + Error donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {devicePieData.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tỷ lệ lỗi theo thiết bị</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={devicePieData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                      label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine>
                      {devicePieData.map((_, i) => (
                        <Cell key={i} fill={DEVICE_COLORS[i % DEVICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {errorDonutData.length > 0 && (
              <div ref={refs.hotroError} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tỷ lệ loại lỗi trong tuần</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={errorDonutData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false} fontSize={9}>
                      {errorDonutData.map((_, i) => (
                        <Cell key={i} fill={ERROR_PIE_COLORS[i % ERROR_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Chart 7: Kênh tiếp nhận (aggregate pie) */}
          {channelPieData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div ref={refs.hotroChannel} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Kênh tiếp nhận yêu cầu</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={channelPieData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine>
                      {channelPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {directionData.length > 0 && (
                <div ref={refs.hotroDirection} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Nguồn tiếp nhận yêu cầu</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={directionData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {directionData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Daily detail table */}
          {hotroData.days.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">CHI TIẾT THEO NGÀY</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left px-3 py-2 font-semibold">Ngày</th>
                      <th className="px-3 py-2 text-center font-semibold">Tổng</th>
                      <th className="px-3 py-2 text-center text-emerald-300 font-semibold">Nhanh</th>
                      <th className="px-3 py-2 text-center text-blue-300 font-semibold">Thường</th>
                      <th className="px-3 py-2 text-center text-orange-300 font-semibold">Thấp</th>
                      <th className="px-3 py-2 text-center text-violet-300 font-semibold">Hẹn</th>
                      {hotroData.staffNames.map(s => <th key={s} className="px-3 py-2 text-center font-semibold">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {hotroData.days.map((d, i) => (
                      <tr key={d.date} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 font-medium text-gray-700">{d.date.slice(5).replace('-','/')}</td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-800">{d.total}</td>
                        <td className="px-3 py-2 text-center text-emerald-600">{d.fast || '—'}</td>
                        <td className="px-3 py-2 text-center text-blue-600">{d.normal || '—'}</td>
                        <td className="px-3 py-2 text-center text-orange-600">{d.slow || '—'}</td>
                        <td className="px-3 py-2 text-center text-violet-600">{d.scheduled || '—'}</td>
                        {hotroData.staffNames.map(s => (
                          <td key={s} className="px-3 py-2 text-center text-gray-600">{d.staff[s] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
                      <td className="px-3 py-2 text-gray-800">Tổng</td>
                      <td className="px-3 py-2 text-center text-gray-800">{hotroData.totals.total}</td>
                      <td className="px-3 py-2 text-center text-emerald-700">{hotroData.totals.fast}</td>
                      <td className="px-3 py-2 text-center text-blue-700">{hotroData.days.reduce((s,d) => s+d.normal,0)}</td>
                      <td className="px-3 py-2 text-center text-orange-700">{hotroData.days.reduce((s,d) => s+d.slow,0)}</td>
                      <td className="px-3 py-2 text-center text-violet-700">{hotroData.days.reduce((s,d) => s+(d.scheduled||0),0)}</td>
                      {hotroData.staffNames.map(s => (
                        <td key={s} className="px-3 py-2 text-center text-gray-800">{hotroData.totals.byStaff[s] ?? '—'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error × Device matrix */}
          {hotroData.errMatrix.errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">BẢNG LỖI × THIẾT BỊ</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left px-3 py-2 font-semibold">Lỗi</th>
                      {hotroData.errMatrix.devices.map(d => <th key={d} className="px-3 py-2 text-center font-semibold">{d}</th>)}
                      <th className="px-3 py-2 text-center font-semibold">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotroData.errMatrix.errors.map((err, ri) => (
                      <tr key={err} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 font-medium text-gray-700">{err}</td>
                        {hotroData.errMatrix.devices.map(dev => (
                          <td key={dev} className="px-3 py-2 text-center text-gray-600">
                            {hotroData.errMatrix.matrix[err]?.[dev] || '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-semibold text-gray-800">{hotroData.errMatrix.totalByError[err]}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50 font-semibold border-t border-blue-200">
                      <td className="px-3 py-2 text-gray-800">Tổng</td>
                      {hotroData.errMatrix.devices.map(dev => (
                        <td key={dev} className="px-3 py-2 text-center text-gray-800">{hotroData.errMatrix.totalByDevice[dev] || '—'}</td>
                      ))}
                      <td className="px-3 py-2 text-center text-gray-800">
                        {Object.values(hotroData.errMatrix.totalByError).reduce((s,v) => s+v,0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prompt to load */}
      {!loading && !repairData && !hotroData && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-sm">Chọn khoảng thời gian và nhấn <strong>Xem báo cáo</strong> để tải dữ liệu</p>
        </div>
      )}
    </div>
  )
}
