'use client'
/**
 * CrmOverviewTab — Báo cáo tổng hợp từ dữ liệu CRM sync (repair_items)
 * Hiển thị KPI giống Overview nhưng lấy từ finish_reason tự động
 * + danh sách thiết bị không có hashtag
 * + so sánh với số liệu nhập tay
 */
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

type T = (vi: string, en: string) => string

interface KPIs {
  total:      number
  delivered:  number
  da_sua:     number
  khong_loi:  number
  gui_bh:     number
  hong_han:   number
  pending:    number
  no_hashtag: number
}

interface DeviceRow {
  product_name: string
  da_sua:    number
  khong_loi: number
  gui_bh:    number
  hong_han:  number
  pending:   number
  total:     number
}

interface NoHashtagItem {
  id:           number
  imei:         string
  product_name: string
  received_at:  string | null
  finish_reason: string | null
  notes:        string | null
}

interface ComparisonRow {
  week_label: string
  manual: { da_sua: number; khong_loi: number; gui_bh: number; hong_han: number; total: number }
  crm:    { da_sua: number; khong_loi: number; gui_bh: number; hong_han: number; total: number }
  diff:   { da_sua: number; khong_loi: number; gui_bh: number; hong_han: number; total: number }
}

interface ApiData {
  from:       string
  to:         string
  kpis:       KPIs
  byDevice:   DeviceRow[]
  noHashtag:  NoHashtagItem[]
  comparison: ComparisonRow[]
}

type Mode = 'week' | 'month' | 'range'

const OUTCOMES = [
  { key: 'da_sua',    label: 'Đã sửa',    labelEn: 'Repaired',   color: '#00AF50' },
  { key: 'gui_bh',    label: 'Gửi BH',    labelEn: 'Warranty',   color: '#f59e0b' },
  { key: 'khong_loi', label: 'Không lỗi', labelEn: 'No Fault',   color: '#3b82f6' },
  { key: 'hong_han',  label: 'Hỏng hẳn',  labelEn: 'Broken',     color: '#ef4444' },
]

function pct(n: number, total: number) {
  if (!total) return '—'
  return Math.round(n / total * 100) + '%'
}

function diffCell(v: number) {
  if (v === 0) return <td className="px-3 py-2 text-center text-gray-400">—</td>
  return (
    <td className={`px-3 py-2 text-center font-mono text-sm ${v > 0 ? 'text-blue-600' : 'text-red-500'}`}>
      {v > 0 ? '+' : ''}{v}
    </td>
  )
}

// ISO week of a date
function dateToWeek(d: Date): string {
  const tmp = new Date(d)
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7)
  const w1 = new Date(tmp.getFullYear(), 0, 4)
  const wn = 1 + Math.round(((tmp.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)
  return `${tmp.getFullYear()}-W${String(wn).padStart(2, '0')}`
}

export default function CrmOverviewTab({ t }: { t: T }) {
  const [mode, setMode]   = useState<Mode>('week')
  const [week, setWeek]   = useState(() => dateToWeek(new Date()))
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [from, setFrom]   = useState(() => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0, 10) })
  const [to, setTo]       = useState(() => new Date().toISOString().slice(0, 10))

  const [data, setData]   = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [subTab, setSubTab]   = useState<'kpi' | 'no-tag' | 'compare'>('kpi')

  function buildUrl() {
    if (mode === 'week')  return `/api/repair-tracking/crm-overview?week=${week}`
    if (mode === 'month') return `/api/repair-tracking/crm-overview?month=${month}`
    return `/api/repair-tracking/crm-overview?from=${from}&to=${to}`
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(buildUrl())
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }

  // Auto-load on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const kpis = data?.kpis

  const pieData = kpis ? OUTCOMES.map(o => ({
    name:  t(o.label, o.labelEn),
    value: kpis[o.key as keyof KPIs] as number,
    color: o.color,
  })).filter(d => d.value > 0) : []

  return (
    <div className="space-y-5">
      {/* ── Date filter ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-2 items-end flex-wrap">
          {/* Mode selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['week','month','range'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${mode===m?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {m === 'week'  ? t('Tuần','Week')  :
                 m === 'month' ? t('Tháng','Month') :
                                 t('Khoảng','Range')}
              </button>
            ))}
          </div>

          {mode === 'week' && (
            <input type="week" value={week.replace('W', 'W')}
              onChange={e => setWeek(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" />
          )}
          {mode === 'month' && (
            <input type="month" value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" />
          )}
          {mode === 'range' && (
            <>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" />
              <span className="text-gray-400 text-sm">→</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" />
            </>
          )}

          <button onClick={load} disabled={loading}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? t('Đang tải...','Loading...') : t('Xem','View')}
          </button>

          {data && (
            <span className="text-xs text-gray-400 ml-2">
              {data.from} → {data.to}
            </span>
          )}
        </div>
      </div>

      {!data && !loading && (
        <div className="text-center py-10 text-gray-400 text-sm">{t('Chọn kỳ và nhấn Xem','Select period and click View')}</div>
      )}
      {loading && (
        <div className="text-center py-10 text-gray-400 text-sm">{t('Đang tải dữ liệu CRM...','Loading CRM data...')}</div>
      )}

      {data && !loading && (
        <>
          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{t('Tổng nhận','Total In')}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{kpis!.total.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{t('thiết bị','devices')}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{t('Bàn giao','Delivered')}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{kpis!.delivered.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{pct(kpis!.delivered, kpis!.total)}</p>
            </div>
            {OUTCOMES.map(o => (
              <div key={o.key} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{t(o.label, o.labelEn)}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: o.color }}>
                  {(kpis![o.key as keyof KPIs] as number).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">{pct(kpis![o.key as keyof KPIs] as number, kpis!.delivered)}</p>
              </div>
            ))}
          </div>

          {/* No-hashtag warning */}
          {kpis!.no_hashtag > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-amber-500 text-lg">⚠️</span>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {kpis!.no_hashtag} {t('thiết bị đã xử lý nhưng không có hashtag phân loại lỗi','completed devices have no error hashtag')}
                </p>
                <button onClick={() => setSubTab('no-tag')} className="text-xs text-amber-600 underline mt-0.5">
                  {t('Xem danh sách','View list')}
                </button>
              </div>
            </div>
          )}

          {/* ── Sub-tabs ── */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {([['kpi', t('📊 Phân tích','📊 Analysis')],
               ['no-tag', t(`⚠️ Thiếu hashtag (${kpis!.no_hashtag})`,`⚠️ No hashtag (${kpis!.no_hashtag})`)],
               ['compare', t('🔄 So sánh tay','🔄 Compare Manual')]] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setSubTab(id as typeof subTab)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${subTab===id?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Analysis tab ── */}
          {subTab === 'kpi' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Pie chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('Kết quả xử lý','Outcome Distribution')}</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v.toLocaleString(), '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* By device bar */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('Theo thiết bị','By Device')}</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.byDevice.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="product_name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {OUTCOMES.map(o => (
                      <Bar key={o.key} dataKey={o.key} name={t(o.label, o.labelEn)} fill={o.color} stackId="a" />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Device table */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">{t('Chi tiết theo thiết bị','Device Breakdown')}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">{t('Thiết bị','Device')}</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">{t('Tổng','Total')}</th>
                        {OUTCOMES.map(o => (
                          <th key={o.key} className="text-right px-3 py-2.5 text-xs font-medium" style={{ color: o.color }}>
                            {t(o.label, o.labelEn)}
                          </th>
                        ))}
                        <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">{t('Chờ','Pending')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDevice.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-700">{row.product_name}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{row.total}</td>
                          {OUTCOMES.map(o => (
                            <td key={o.key} className="px-3 py-2.5 text-right text-gray-600">
                              {(row[o.key as keyof DeviceRow] as number) || '—'}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-right text-gray-400">{row.pending || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── No hashtag tab ── */}
          {subTab === 'no-tag' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    {t('Thiết bị đã xử lý nhưng không có hashtag','Completed devices without hashtag')}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('Những thiết bị này đã có kết quả nhưng thiếu phân loại lỗi (#gsm, #rfid...)','These devices have outcomes but no error classification hashtag')}
                  </p>
                </div>
                <span className="text-sm font-semibold text-amber-600">{data.noHashtag.length}</span>
              </div>
              {data.noHashtag.length === 0 ? (
                <div className="px-5 py-8 text-center text-green-600 text-sm">
                  ✅ {t('Tất cả thiết bị đều có hashtag phân loại','All devices have classification hashtags')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">IMEI</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">{t('Thiết bị','Device')}</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">{t('Ngày nhận','Received')}</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">{t('Kết quả','Outcome')}</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">{t('Ghi chú','Notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.noHashtag.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-amber-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{item.imei}</td>
                          <td className="px-3 py-2.5 text-gray-700">{item.product_name}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">{item.received_at?.slice(0, 10) ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {item.finish_reason ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">{item.notes || <span className="italic text-gray-300">(trống)</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Comparison tab ── */}
          {subTab === 'compare' && (
            <div className="space-y-4">
              {data.comparison.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                  {t('Không có dữ liệu nhập tay cho kỳ này (chưa tạo tuần trong Repair Dashboard)','No manual data for this period')}
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                    <strong>{t('Giải thích:','Note:')}</strong> {t(
                      'CRM = dữ liệu tự động từ repair_items (finish_reason). Tay = số liệu nhập trong Repair Dashboard. Chênh lệch dương (+) = CRM nhiều hơn tay.',
                      'CRM = auto data from repair_items (finish_reason). Manual = data entered in Repair Dashboard. Positive diff (+) = CRM higher than manual.'
                    )}
                  </div>
                  {data.comparison.map((row, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <span className="text-sm font-semibold text-gray-700">{row.week_label}</span>
                        <span className={`ml-3 text-xs font-medium px-2 py-0.5 rounded-full ${row.diff.total === 0 ? 'bg-green-100 text-green-700' : Math.abs(row.diff.total) <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {row.diff.total === 0 ? t('✅ Khớp','✅ Match') : `Δ ${row.diff.total > 0 ? '+' : ''}${row.diff.total}`}
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('Nguồn','Source')}</th>
                            <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: '#00AF50' }}>{t('Đã sửa','Repaired')}</th>
                            <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: '#3b82f6' }}>{t('Không lỗi','No Fault')}</th>
                            <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: '#f59e0b' }}>{t('Gửi BH','Warranty')}</th>
                            <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: '#ef4444' }}>{t('Hỏng hẳn','Broken')}</th>
                            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">{t('Tổng','Total')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600 font-medium">{t('📝 Nhập tay','📝 Manual')}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.manual.da_sua || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.manual.khong_loi || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.manual.gui_bh || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.manual.hong_han || '—'}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{row.manual.total || '—'}</td>
                          </tr>
                          <tr className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-blue-600 font-medium">{t('🔄 CRM auto','🔄 CRM auto')}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.crm.da_sua || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.crm.khong_loi || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.crm.gui_bh || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-700">{row.crm.hong_han || '—'}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-blue-600">{row.crm.total || '—'}</td>
                          </tr>
                          <tr className="bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{t('Chênh lệch (CRM − Tay)','Diff (CRM − Manual)')}</td>
                            {diffCell(row.diff.da_sua)}
                            {diffCell(row.diff.khong_loi)}
                            {diffCell(row.diff.gui_bh)}
                            {diffCell(row.diff.hong_han)}
                            {diffCell(row.diff.total)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
