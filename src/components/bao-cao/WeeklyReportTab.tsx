'use client'
import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
  totals: { total: number; fast: number; fastPct: number; byStaff: Record<string, number> }
  errMatrix: ErrorMatrix
}

const OUTCOME_COLORS = ['#22c55e','#f59e0b','#3b82f6','#ef4444']

// ─────────────────────────────────────────────────────────────────────────────
// SVG → base64 PNG helper
// ─────────────────────────────────────────────────────────────────────────────
async function svgToBase64(svgEl: SVGSVGElement): Promise<string> {
  return new Promise(resolve => {
    const w = svgEl.clientWidth || 800
    const h = svgEl.clientHeight || 300
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(w * 2))
    clone.setAttribute('height', String(h * 2))
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect')
    rect.setAttribute('width', '100%'); rect.setAttribute('height','100%'); rect.setAttribute('fill','white')
    clone.insertBefore(rect, clone.firstChild)
    const svgStr = new XMLSerializer().serializeToString(clone)
    const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url    = URL.createObjectURL(blob)
    const img    = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w * 2; canvas.height = h * 2
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function WeeklyReportTab() {
  // i18n
  const [lang, setLang] = useState<'vi'|'en'>('vi')
  useEffect(() => {
    try { const s = localStorage.getItem('repair_lang') as 'vi'|'en'; if (s==='en'||s==='vi') setLang(s) } catch {/**/}
  }, [])
  const t = (vi: string, en: string) => lang === 'vi' ? vi : en

  function defaultWeek() {
    const now = new Date(); const day = now.getDay()
    const offset = day === 0 ? -6 : 1 - day
    const mon = new Date(now); mon.setDate(now.getDate() + offset)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return { from: fmt(mon), to: fmt(now) }
  }
  const dw = defaultWeek()
  const [from, setFrom]             = useState(dw.from)
  const [to, setTo]                 = useState(dw.to)
  const [repairData, setRepairData] = useState<WeeklySummary | null>(null)
  const [repairErr,  setRepairErr]  = useState<ErrorMatrix | null>(null)
  const [hotroData,  setHotroData]  = useState<HotroDetail | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genStatus,  setGenStatus]  = useState('')

  const chartRepairRef  = useRef<HTMLDivElement>(null)
  const chartRepairRef2 = useRef<HTMLDivElement>(null)
  const chartHotroRef   = useRef<HTMLDivElement>(null)
  const chartHotroRef2  = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true)
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/repair-tracking/weekly-summary?from=${from}&to=${to}`).then(r => r.json()),
      fetch(`/api/repair-tracking/weekly-error-matrix?from=${from}&to=${to}`).then(r => r.json()),
      fetch(`/api/ho-tro/weekly-detail?from=${from}&to=${to}`).then(r => r.json()),
    ])
    setRepairData(r1); setRepairErr(r2); setHotroData(r3)
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function captureCharts() {
    const images: { id: string; base64: string }[] = []
    for (const { id, ref } of [
      { id: 'repair_outcome',   ref: chartRepairRef  },
      { id: 'repair_by_device', ref: chartRepairRef2 },
      { id: 'hotro_daily',      ref: chartHotroRef   },
      { id: 'hotro_staff',      ref: chartHotroRef2  },
    ]) {
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
    setGenStatus(t('Đang chụp biểu đồ...', 'Capturing charts...'))
    try {
      const allChartImages = await captureCharts()
      setGenStatus(t('Đang tạo file Word...', 'Generating Word file...'))
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
      if (!res.ok) { alert(t('Lỗi tạo file báo cáo', 'Error generating report')); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `Bao_cao_tuan_${from.replace(/-/g,'')}_${to.replace(/-/g,'')}.docx`; a.click()
      URL.revokeObjectURL(url)
      setGenStatus('')
    } catch (e) {
      console.error(e)
      alert(t('Lỗi khi tạo file', 'Error generating file'))
      setGenStatus('')
    } finally {
      setGenLoading(false)
    }
  }

  const outcomeData = repairData ? [
    { name: t('Đã sửa','Repaired'),   value: repairData.repaired, pct: repairData.repairedPct },
    { name: t('Bảo hành','Warranty'), value: repairData.warranty, pct: repairData.warrantyPct },
    { name: t('Không lỗi','No Fault'),value: repairData.noFault,  pct: repairData.noFaultPct  },
    { name: t('Báo phế','Broken'),    value: repairData.broken,   pct: repairData.brokenPct   },
  ] : []

  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-200'   },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-200'    },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200'     },
  }
  const outcomeCards = repairData ? [
    { label: t('Đã sửa xong','Repaired'), count: repairData.repaired, pct: repairData.repairedPct, color: 'emerald' },
    { label: t('Gửi bảo hành','Warranty'),count: repairData.warranty, pct: repairData.warrantyPct, color: 'amber'   },
    { label: t('Không lỗi','No Fault'),   count: repairData.noFault,  pct: repairData.noFaultPct,  color: 'blue'    },
    { label: t('Báo phế','Broken'),       count: repairData.broken,   pct: repairData.brokenPct,   color: 'red'     },
  ] : []

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('Báo cáo tuần','Weekly Report')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('Tổng hợp Sửa chữa & Hỗ trợ kỹ thuật','Repair & Tech Support Summary')}</p>
        </div>
        <button onClick={() => { setLang(l => l === 'vi' ? 'en' : 'vi'); try { localStorage.setItem('repair_lang', lang === 'vi' ? 'en' : 'vi') } catch {/**/} }}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          {lang === 'vi' ? 'EN' : 'VI'}
        </button>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('Từ ngày','From')}</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('Đến ngày','To')}</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {loading ? t('Đang tải...','Loading...') : t('Xem','View')}
        </button>
        <button onClick={handleGenerateWord} disabled={!repairData || !hotroData || genLoading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium flex items-center gap-2 shadow-sm">
          📄 {genLoading ? (genStatus || t('Đang tạo...','Generating...')) : t('Tải báo cáo tuần (.docx)','Download Weekly Report (.docx)')}
        </button>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">{t('Đang tải dữ liệu...','Loading...')}</div>}

      {repairData && !loading && (
        <>
          {/* ══ PHẦN SỬA CHỮA ══════════════════════════════════════════════ */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
            <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
              🔧 {t('Tổng hợp sửa chữa','Repair Summary')}
            </h3>

            {/* Outcome Cards */}
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                {t('OUTCOME SUMMARY','OUTCOME SUMMARY')} — {repairData.total.toLocaleString()} {t('HOÀN THÀNH','DELIVERED')}
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {outcomeCards.map(c => {
                  const col = colorMap[c.color]
                  return (
                    <div key={c.color} className={`rounded-xl border p-4 ${col.bg} ${col.border}`}>
                      <div className={`text-3xl font-bold ${col.text}`}>{c.count}</div>
                      <div className="text-sm text-gray-600 mt-0.5">{c.label}</div>
                      <div className={`text-xl font-semibold ${col.text} mt-1`}>{c.pct}%</div>
                    </div>
                  )
                })}
              </div>
              {repairData.total > 0 && (
                <div className="mt-3 flex rounded-full overflow-hidden h-2 gap-px">
                  <div className="bg-emerald-500" style={{ width: `${repairData.repairedPct}%` }} />
                  <div className="bg-amber-500"   style={{ width: `${repairData.warrantyPct}%` }} />
                  <div className="bg-blue-500"    style={{ width: `${repairData.noFaultPct}%` }} />
                  <div className="bg-red-500"     style={{ width: `${repairData.brokenPct}%` }} />
                </div>
              )}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div ref={chartRepairRef} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase">{t('Kết quả','Outcome')}</p>
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
              <div ref={chartRepairRef2} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase">{t('Theo thiết bị','By Device')}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={repairData.byProduct} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="product" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="repaired" stackId="a" fill="#22c55e" name={t('Sửa xong','Repaired')} />
                    <Bar dataKey="warranty" stackId="a" fill="#f59e0b" name={t('Bảo hành','Warranty')} />
                    <Bar dataKey="noFault"  stackId="a" fill="#3b82f6" name={t('Không lỗi','No Fault')} />
                    <Bar dataKey="broken"   stackId="a" fill="#ef4444" name={t('Báo phế','Broken')} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* By Device Table */}
            {repairData.byProduct.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{t('THEO LOẠI THIẾT BỊ','BY DEVICE TYPE')}</p>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Thiết bị','Device')}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Hoàn thành','Delivered')}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-600 uppercase">{t('Sửa xong','Repaired')}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600 uppercase">{t('Bảo hành','Warranty')}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase">{t('Không lỗi','No Fault')}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-red-600 uppercase">{t('Báo phế','Broken')}</th>
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
                      <tr className="bg-gray-100 font-semibold border-t-2 border-gray-200">
                        <td className="px-4 py-2.5 text-gray-800">{t('Tổng cộng','Total')}</td>
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

            {/* Error × Device matrix (repair hashtags) */}
            {repairErr && repairErr.errors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  {t('LỖI THEO THIẾT BỊ (từ ghi chú #hashtag)','ERRORS BY DEVICE (from #hashtag notes)')}
                </p>
                <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="text-left px-3 py-2 font-semibold">{t('Lỗi','Error')}</th>
                        {repairErr.devices.map(d => <th key={d} className="px-3 py-2 font-semibold text-center">{d}</th>)}
                        <th className="px-3 py-2 font-semibold text-center">{t('Tổng','Total')}</th>
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
                          <td className="px-3 py-2 text-center font-semibold text-gray-800">
                            {repairErr.totalByError[err] || '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-semibold border-t border-blue-200">
                        <td className="px-3 py-2 text-gray-800">{t('Tổng','Total')}</td>
                        {repairErr.devices.map(dev => (
                          <td key={dev} className="px-3 py-2 text-center text-gray-800">
                            {repairErr.totalByDevice[dev] || '—'}
                          </td>
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
                {t('Không có thiết bị nào hoàn thành trong khoảng thời gian này.','No completed devices in this date range.')}
              </div>
            )}
          </div>

          {/* ══ PHẦN HỖ TRỢ KỸ THUẬT ═════════════════════════════════════ */}
          {hotroData && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
              <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
                🎧 {t('Tổng hợp Hỗ trợ kỹ thuật','Technical Support Summary')}
              </h3>

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{hotroData.totals.total}</div>
                  <div className="text-xs text-blue-600 mt-0.5">{t('Tổng yêu cầu','Total Requests')}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{hotroData.totals.fastPct}%</div>
                  <div className="text-xs text-emerald-600 mt-0.5">{t('Tỉ lệ nhanh','Fast Rate')}</div>
                </div>
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-center">
                  <div className="text-2xl font-bold text-violet-700">{hotroData.staffNames.length}</div>
                  <div className="text-xs text-violet-600 mt-0.5">{t('Nhân viên','Staff')}</div>
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div ref={chartHotroRef} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase">{t('Yêu cầu theo ngày','Daily Requests')}</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={hotroData.days} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tickFormatter={d => d.slice(5).replace('-','/')} tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={d => `Ngày ${d}`} />
                      <Bar dataKey="fast"      stackId="a" fill="#34d399" name={t('Nhanh','Fast')} />
                      <Bar dataKey="normal"    stackId="a" fill="#60a5fa" name={t('Thường','Normal')} />
                      <Bar dataKey="slow"      stackId="a" fill="#fb923c" name={t('Thấp','Slow')} />
                      <Bar dataKey="scheduled" stackId="a" fill="#c084fc" name={t('Hẹn','Scheduled')} radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div ref={chartHotroRef2} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase">{t('Yêu cầu theo nhân viên','Requests by Staff')}</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={hotroData.staffNames.map(s => ({ name: s, count: hotroData.totals.byStaff[s] ?? 0 }))}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name={t('Yêu cầu','Requests')} fill="#6366f1" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily detail table */}
              {hotroData.days.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{t('CHI TIẾT THEO NGÀY','DAILY DETAIL')}</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="text-left px-3 py-2">{t('Ngày','Date')}</th>
                          <th className="px-3 py-2 text-center">{t('Tổng','Total')}</th>
                          <th className="px-3 py-2 text-center text-emerald-300">{t('Nhanh','Fast')}</th>
                          <th className="px-3 py-2 text-center text-blue-300">{t('Thường','Normal')}</th>
                          <th className="px-3 py-2 text-center text-orange-300">{t('Thấp','Slow')}</th>
                          {hotroData.staffNames.map(s => <th key={s} className="px-3 py-2 text-center">{s}</th>)}
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
                            {hotroData.staffNames.map(s => (
                              <td key={s} className="px-3 py-2 text-center text-gray-600">{d.staff[s] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                        <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
                          <td className="px-3 py-2 text-gray-800">{t('Tổng','Total')}</td>
                          <td className="px-3 py-2 text-center text-gray-800">{hotroData.totals.total}</td>
                          <td className="px-3 py-2 text-center text-emerald-700">{hotroData.totals.fast}</td>
                          <td className="px-3 py-2 text-center text-blue-700">{hotroData.days.reduce((s,d) => s+d.normal,0)}</td>
                          <td className="px-3 py-2 text-center text-orange-700">{hotroData.days.reduce((s,d) => s+d.slow,0)}</td>
                          {hotroData.staffNames.map(s => (
                            <td key={s} className="px-3 py-2 text-center text-gray-800">{hotroData.totals.byStaff[s] ?? '—'}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error × Device matrix (ho tro) */}
              {hotroData.errMatrix.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{t('LỖI × THIẾT BỊ','ERROR × DEVICE')}</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="text-left px-3 py-2">{t('Lỗi','Error')}</th>
                          {hotroData.errMatrix.devices.map(d => <th key={d} className="px-3 py-2 text-center">{d}</th>)}
                          <th className="px-3 py-2 text-center">{t('Tổng','Total')}</th>
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
                            <td className="px-3 py-2 text-center font-semibold text-gray-800">
                              {hotroData.errMatrix.totalByError[err]}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-blue-50 font-semibold border-t border-blue-200">
                          <td className="px-3 py-2 text-gray-800">{t('Tổng','Total')}</td>
                          {hotroData.errMatrix.devices.map(dev => (
                            <td key={dev} className="px-3 py-2 text-center text-gray-800">
                              {hotroData.errMatrix.totalByDevice[dev] || '—'}
                            </td>
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
        </>
      )}
    </div>
  )
}
