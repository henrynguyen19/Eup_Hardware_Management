'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type Lang = 'vi' | 'en'
function useLang() {
  const [lang, setLang] = useState<Lang>('vi')
  useEffect(() => {
    try { const s = localStorage.getItem('repair_lang') as Lang; if (s==='en'||s==='vi') setLang(s) } catch {/**/}
  }, [])
  function toggle() {
    setLang(l => {
      const next = l === 'vi' ? 'en' : 'vi'
      try { localStorage.setItem('repair_lang', next) } catch { /**/ }
      return next
    })
  }
  const t = (vi: string, en: string) => lang === 'vi' ? vi : en
  return { lang, toggle, t }
}

type RepairStatus = 'cho_gui' | 'da_gui' | 'da_sua_xong'
type FinishReason = 'sua_xong' | 'khong_loi_bt' | 'loai_bo' | 'loai_bo_bo_mach' | 'send_supplier'
type Destination  = 'old_device' | 'scrap' | 'supplier'

interface RepairItem {
  id: string; imei: string; product_name: string; notes: string | null
  status: RepairStatus; repair_warehouse: string | null
  finish_reason: FinishReason | null; destination: Destination | null
  received_at: string; sent_at: string | null; completed_at: string | null
  receiver_name: string | null; sender_name: string | null; completer_name: string | null
  crm_repair_id: number | null
}
interface RepairHistoryEntry {
  id: string; received_at: string; sent_at: string | null; completed_at: string | null
  status: string; destination: string | null; finish_reason: string | null
  notes: string | null; repair_warehouse: string | null
  receiver_name: string | null; sender_name: string | null; completer_name: string | null
}
interface DupDevice { imei: string; product_name: string; count: number; last_received: string; repairs: RepairHistoryEntry[] }
interface DupProductGroup { product_name: string; deviceCount: number; totalRepairs: number; devices: DupDevice[] }
interface StatsData {
  total: number; completed: number; inRepair: number; waiting: number
  oldDevice: number; scrap: number; supplier: number
  repaired: number; noFault: number
  uniqueDevices: number; repeatedDeviceCount: number
  completionRate: number; successRate: number; scrapRate: number; supplierRate: number
  repairedRate: number; noFaultRate: number
  duplicatesByProduct: DupProductGroup[]
  allRepeatedDevices: DupDevice[]
  byProduct: { product_name: string; total: number; completed: number; oldDevice: number; scrap: number; supplier: number; repaired: number; noFault: number; inRepair: number; waiting: number; successRate: number; scrapRate: number; supplierRate: number; repairedRate: number; noFaultRate: number }[]
  byWarehouse: { warehouse: string; total: number; completed: number; scrap: number; supplier: number }[]
  faultTypeByCategory?: { repaired: {tag:string;count:number}[]; warranty: {tag:string;count:number}[]; noFault: {tag:string;count:number}[]; broken: {tag:string;count:number}[] }
}
interface InventoryStats {
  totalImported: number; totalUniqImei: number; totalRepaired: number; overallRepairRate: number
  byProduct: { product_name: string; total_imported: number; total_repaired: number; total_supplier: number; total_scrap: number; repair_rate: number; supplier_rate: number; scrap_rate: number }[]
  message?: string
}
interface HashtagEntry {
  tag: string; count: number; deviceCount: number
  statuses: Record<string, number>
  topProducts: { product_name: string; count: number }[]
}
interface HashtagData {
  tags: HashtagEntry[]
  totalWithNotes: number
  topTags: string[]
  topDevices: string[]
  weeklyTrends: Record<string, string | number>[]
  monthlyTrends: Record<string, string | number>[]
  weeklyDeviceTrends: Record<string, string | number>[]
  monthlyDeviceTrends: Record<string, string | number>[]
  deviceWeeklyTagTrends: Record<string, Array<Record<string, string | number>>>
  deviceMonthlyTagTrends: Record<string, Array<Record<string, string | number>>>
}

const TAG_PALETTE = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6',
  '#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899',
]
const DEV_PALETTE = [
  '#0ea5e9','#f43f5e','#a3e635','#fb923c','#818cf8','#34d399',
]
interface StatusCounts { cho_gui: number; da_gui: number; da_sua_xong: number; old_device: number; scrap: number; supplier: number }

const STATUS_LABEL_VI: Record<RepairStatus, string> = { cho_gui:'Chờ gửi sửa', da_gui:'Đã gửi sửa', da_sua_xong:'Đã sửa xong' }
const STATUS_LABEL_EN: Record<RepairStatus, string> = { cho_gui:'Pending Send', da_gui:'In Repair',   da_sua_xong:'Completed' }
const STATUS_COLOR: Record<RepairStatus, string> = {
  cho_gui:'bg-amber-100 text-amber-800 border-amber-300',
  da_gui:'bg-blue-100 text-blue-800 border-blue-300',
  da_sua_xong:'bg-emerald-100 text-emerald-800 border-emerald-300',
}
const FINISH_REASON_LABEL: Record<FinishReason, string> = {
  sua_xong:'Repaired', khong_loi_bt:'No fault found', loai_bo:'Disposed',
  loai_bo_bo_mach:'Board replaced', send_supplier:'Send to Supplier',
}
const DEST_COLOR: Record<Destination, string> = { old_device:'text-emerald-600', scrap:'text-red-600', supplier:'text-purple-600' }
const DEST_LABEL: Record<Destination, string>  = { old_device:'Old Device', scrap:'Scrap', supplier:'Supplier' }
const REPAIR_WAREHOUSES = ['Repair_Hardware','Repair_Streamax','Repair_Sunell','Repair_Vietmap']
const FINISH_REASON_DEST: Record<FinishReason, string> = {
  sua_xong:'→ Old Device', khong_loi_bt:'→ Old Device', loai_bo:'→ Scrap',
  loai_bo_bo_mach:'→ Scrap', send_supplier:'→ Supplier',
}
const HIDDEN_KEY = 'failure_hidden_products'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
}
function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return null
  return Math.round(((new Date(b).getTime()-new Date(a).getTime())/86400000)*10)/10
}
function todayStr()    { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function monthAgoStr() { const d=new Date(); d.setDate(d.getDate()-30); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

function RateBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width:`${Math.min(rate,100)}%` }} />
      </div>
      <span className="text-xs font-medium w-12 text-right">{rate}%</span>
    </div>
  )
}

interface SyncResult {
  ok: boolean
  total: number
  inserted?: number
  updated?: number
  skipped?: number
  upserted?: number
  imeiChecked?: number
  startTime?: string
  errors?: string[]
  message?: string
}

function SyncCRMPanel({ onSynced, t }: { onSynced: () => void; t: (vi:string,en:string)=>string }) {
  const [from, setFrom]       = useState(monthAgoStr())
  const [to, setTo]           = useState(todayStr())
  const [loading, setLoading] = useState<false | 'new' | 'stale' | 'date' | 'fix_imei'>(false)
  const [result, setResult]   = useState<SyncResult | null>(null)
  const [err, setErr]         = useState('')
  const [staleLog, setStaleLog] = useState<string[]>([])

  async function doSync(payload: object, kind: 'new' | 'date') {
    setLoading(kind); setErr(''); setResult(null); setStaleLog([])
    try {
      const res = await fetch('/api/repair-tracking/sync-crm', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
      const txt = await res.text()
      if (!txt) { setErr(`Empty response (HTTP ${res.status})`); return }
      let d: Record<string,unknown>
      try { d = JSON.parse(txt) } catch { setErr(`Parse error: ${txt.substring(0,120)}`); return }
      if (!res.ok) { setErr((d.error as string)||'Sync error'); return }
      setResult(d as SyncResult)
      if (d.ok) onSynced()
    } catch(e) { setErr(String(e)) } finally { setLoading(false) }
  }

  // Chunked stale sync — tránh timeout khi có nhiều thiết bị
  // Sửa IMEI sai bằng date-range CRM sync + match theo crm_repair_id
  async function doFixBadImeis() {
    setLoading('fix_imei'); setErr(''); setResult(null)
    setStaleLog([t('Đang tìm và sửa IMEI sai từ CRM...','Scanning and fixing bad IMEIs from CRM...')])
    try {
      const res = await fetch('/api/repair-tracking/sync-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fix_bad_imeis' }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setErr(d.error ?? 'Lỗi sửa IMEI'); setLoading(false); return }
      if (d.fixed > 0) onSynced()
      setResult({
        ok: d.ok, total: d.total, upserted: d.fixed,
        message: t(
          `Đã sửa ${d.fixed}/${d.total} IMEI sai${d.notFound > 0 ? ` (${d.notFound} không tìm thấy trong CRM)` : ''}`,
          `Fixed ${d.fixed}/${d.total} bad IMEIs${d.notFound > 0 ? ` (${d.notFound} not found in CRM)` : ''}`,
        ),
      })
      setStaleLog(p => [...p, `✅ ${t('Hoàn tất. Khoảng ngày','Done. Date range')}: ${d.dateRange ?? ''}`])
    } catch(e) { setErr(String(e)) } finally { setLoading(false) }
  }

  async function doChunkedStaleSync(mode: 'stale') {
    setLoading(mode); setErr(''); setResult(null); setStaleLog([])
    try {
      // 1. Lấy danh sách IMEI cần sync
      const res0  = await fetch('/api/repair-tracking/stale-devices')
      const data0 = await res0.json()
      const imeis = [...new Set((data0.items as {imei:string}[] ?? []).map(i => i.imei).filter(Boolean))]
      if (imeis.length === 0) {
        setResult({ ok: true, total: 0, upserted: 0, message: t('Không có thiết bị nào quá 7 ngày','No stale devices') })
        setLoading(false); return
      }
      setStaleLog([t(`Tìm thấy ${imeis.length} thiết bị cần cập nhật...`, `Found ${imeis.length} devices to update...`)])

      // 2. Chunk 10 IMEIs mỗi lần, delay 600ms giữa các batch
      const CHUNK = 10
      let totalUpserted = 0, totalChecked = 0
      const allErrors: string[] = []

      for (let i = 0; i < imeis.length; i += CHUNK) {
        const chunk = imeis.slice(i, i + CHUNK)
        const batchNum = Math.floor(i / CHUNK) + 1
        const totalBatches = Math.ceil(imeis.length / CHUNK)
        try {
          const r = await fetch('/api/repair-tracking/sync-crm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'refresh_selected', imeis: chunk }),
          })
          const d = await r.json()
          totalUpserted += (d.upserted ?? 0)
          totalChecked += chunk.length
          if (d.errors?.length) allErrors.push(...d.errors)
          setStaleLog(p => [...p, `[${batchNum}/${totalBatches}] ✅ ${chunk.length} IMEI → cập nhật ${d.updated??0}, thêm ${d.inserted??0}`])
        } catch (e) {
          allErrors.push(String(e))
          setStaleLog(p => [...p, `[${batchNum}/${totalBatches}] ❌ ${String(e).substring(0,60)}`])
        }
        if (i + CHUNK < imeis.length) await new Promise(r => setTimeout(r, 600))
      }

      setResult({
        ok: allErrors.length === 0,
        total: imeis.length, upserted: totalUpserted, imeiChecked: totalChecked,
        errors: allErrors.length > 0 ? allErrors.slice(0, 5) : undefined,
        message: t(`Hoàn tất ${totalChecked}/${imeis.length} thiết bị`, `Done ${totalChecked}/${imeis.length} devices`),
      })
      onSynced()
    } catch(e) { setErr(String(e)) } finally { setLoading(false) }
  }

  function ResultBadge({ r }: { r: SyncResult }) {
    const inserted = r.inserted ?? 0
    const updated  = r.updated  ?? 0
    const skipped  = r.skipped  ?? 0
    const isStale  = r.imeiChecked != null
    return (
      <div className={`rounded-xl px-4 py-3 space-y-1 ${r.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
        <p className={`text-sm font-medium ${r.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
          {r.ok ? '✅' : '⚠'} {isStale
            ? t(`Cập nhật ${r.imeiChecked} thiết bị từ CRM`, `Updated ${r.imeiChecked} devices from CRM`)
            : t(`Đã tải ${r.total} records từ CRM`, `Loaded ${r.total} records from CRM`)}
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-emerald-600">
            ➕ {t('Thêm mới','New')}: <strong>{inserted}</strong>
          </span>
          <span className="text-blue-600">
            🔄 {t('Cập nhật','Updated')}: <strong>{updated}</strong>
          </span>
          <span className="text-gray-400">
            ⏭ {t('Không đổi','Unchanged')}: <strong>{skipped}</strong>
          </span>
          {r.startTime && (
            <span className="text-gray-400">
              📅 {t('Từ','From')}: {r.startTime.substring(0, 10)}
            </span>
          )}
        </div>
        {r.message && <p className="text-xs text-gray-500">{r.message}</p>}
        {r.errors   && <p className="text-xs text-red-600 mt-1">⚠ {r.errors[0]}</p>}
      </div>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => doSync({}, 'new')} disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm">
          {loading === 'new' ? <><span className="animate-spin inline-block">⟳</span> {t('Đang tải...','Loading...')}</> : <>⚡ {t('Sync dữ liệu mới','Sync new data')}</>}
        </button>
        <button onClick={() => doChunkedStaleSync('stale')} disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm rounded-xl hover:bg-amber-600 disabled:opacity-50 shadow-sm">
          {loading === 'stale' ? <><span className="animate-spin inline-block">⟳</span> {t('Đang cập nhật...','Updating...')}</> : <>🔄 {t('Cập nhật thiết bị >7 ngày','Refresh stale >7d')}</>}
        </button>
        <button onClick={() => doFixBadImeis()} disabled={!!loading}
          title={t('Sửa thiết bị có IMEI sai (số serial 9 chữ số, bắt đầu bằng 9999...)','Fix devices with bad IMEI (9-digit serials)')}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white text-sm rounded-xl hover:bg-rose-600 disabled:opacity-50 shadow-sm">
          {loading === 'fix_imei' ? <><span className="animate-spin inline-block">⟳</span> {t('Đang sửa IMEI...','Fixing IMEIs...')}</> : <>🔧 {t('Sửa IMEI sai','Fix Bad IMEIs')}</>}
        </button>
        <p className="text-xs text-blue-500">{t('Sync mới: 14 ngày gần nhất • Cập nhật: thiết bị chờ/sửa quá 7 ngày','New: last 14 days • Refresh: stale devices >7 days')}</p>
      </div>
      {staleLog.length > 0 && (
        <div className="bg-white border border-blue-100 rounded-lg p-2 max-h-28 overflow-y-auto">
          {staleLog.map((line,i) => <p key={i} className="text-xs font-mono text-gray-600">{line}</p>)}
          {!!loading && <p className="text-xs font-mono text-blue-500 animate-pulse">⏳ {t('Đang xử lý...','Processing...')}</p>}
        </div>
      )}
      <details className="group">
        <summary className="text-xs text-blue-500 cursor-pointer hover:underline list-none">▸ {t('Sync theo khoảng thời gian cụ thể','Sync by date range')}</summary>
        <div className="flex flex-wrap items-end gap-3 mt-2">
          <div><label className="block text-xs font-medium text-blue-700 mb-1">{t('Từ ngày','From')}</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div><label className="block text-xs font-medium text-blue-700 mb-1">{t('Đến ngày','To')}</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <button onClick={() => doSync({ startTime:`${from} 00:00:00`, endTime:`${to} 23:59:59` }, 'date')} disabled={!!loading}
            className="px-4 py-1.5 bg-gray-600 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-50">
            {loading === 'date' ? <span className="animate-spin inline-block">⟳</span> : '🔄'} {t('Đồng bộ theo ngày','Sync by date')}
          </button>
          <p className="text-xs text-gray-500 mt-1">{t('💡 Sync theo ngày sẽ tự sửa IMEI sai trong khoảng đó','💡 Date-range sync also fixes bad IMEIs in that period')}</p>
        </div>
      </details>
      {err    && <p className="text-xs text-red-600">⚠ {err}</p>}
      {result && <ResultBadge r={result} />}
    </div>
  )
}

// ── Stale Devices Panel ──────────────────────────────────────
interface StaleDevice { id: string; imei: string; product_name: string; status: string; received_at: string|null; sent_at: string|null; repair_warehouse: string|null; notes: string|null }

function StaleDevicesPanel({ onRefreshed, t }: { onRefreshed: () => void; t: (vi:string,en:string)=>string }) {
  const [items, setItems]        = useState<StaleDevice[]>([])
  const [loading, setLoading]    = useState(false)
  const [refreshing, setRefresh] = useState<string|null>(null)
  const [loaded, setLoaded]      = useState(false)
  const [result, setResult]      = useState<string>('')
  const [err, setErr]            = useState('')
  const [exporting, setExporting]  = useState(false)
  const [detailImei, setDetailImei] = useState<string|null>(null)
  // Filters
  const [fStatus,    setFStatus]    = useState('')
  const [fProduct,   setFProduct]   = useState('')
  const [fWarehouse, setFWarehouse] = useState('')
  const [fRepairWh,  setFRepairWh]  = useState('')
  const [fMinDays,   setFMinDays]   = useState('')

  async function loadStale() {
    setLoading(true); setErr(''); setResult('')
    try {
      const res = await fetch('/api/repair-tracking/stale-devices')
      const d   = await res.json()
      if (!res.ok) { setErr(d.error||'Lỗi tải dữ liệu'); return }
      setItems(d.items ?? [])
      setLoaded(true)
    } catch(e) { setErr(String(e)) } finally { setLoading(false) }
  }

  async function refreshImeis(imeis: string[], label: string) {
    setRefresh(label); setErr(''); setResult('')
    try {
      const res = await fetch('/api/repair-tracking/sync-crm', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ mode: 'refresh_selected', imeis }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error||'Sync lỗi'); return }
      setResult(t(
        `✅ CRM: ${d.total} record → cập nhật ${d.updated ?? 0}, thêm mới ${d.inserted ?? 0}, bỏ qua ${d.skipped ?? 0}`,
        `✅ CRM: ${d.total} records → updated ${d.updated ?? 0}, new ${d.inserted ?? 0}, skip ${d.skipped ?? 0}`,
      ))
      await loadStale()
      onRefreshed()
    } catch(e) { setErr(String(e)) } finally { setRefresh(null) }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ stale: 'true' })
      if (fProduct)   params.set('product', fProduct)
      if (fStatus)    params.set('status', fStatus)
      if (fMinDays)   params.set('minDays', fMinDays)
      const res  = await fetch('/api/repair-tracking/export?' + params.toString())
      if (!res.ok) { setErr(t('Lỗi xuất file','Export error')); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `thiet-bi-cho-sua-tre-${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) { setErr(String(e)) } finally { setExporting(false) }
  }

  const daysSince = (iso: string|null) => {
    if (!iso) return null
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  }

  // Derived filter options from loaded data
  const products   = [...new Set(items.map(i => i.product_name).filter(Boolean))].sort()
  const warehouses = [...new Set(items.map(i => i.repair_warehouse).filter(Boolean))].sort() as string[]

  // Apply filters
  const displayed = items.filter(item => {
    const refDate = item.status === 'da_gui' ? item.sent_at : item.received_at
    const days    = daysSince(refDate) ?? 0
    if (fStatus    && item.status !== fStatus)                              return false
    if (fProduct   && item.product_name !== fProduct)                       return false
    if (fWarehouse && (item.repair_warehouse ?? '') !== fWarehouse)         return false
    if (fRepairWh  && (item.repair_warehouse ?? '').toLowerCase().indexOf(fRepairWh.toLowerCase()) < 0) return false
    if (fMinDays   && days < Number(fMinDays))                              return false
    return true
  })

  const hasFilter = !!(fStatus || fProduct || fWarehouse || fRepairWh || fMinDays)

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => { if (!loaded) loadStale(); else setLoaded(l => !l as unknown as boolean) }}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
      >
        <span>⚠️ {t('Thiết bị chờ/sửa quá 7 ngày','Devices pending/in-repair >7 days')}
          {loaded && items.length > 0 && (
            <span className="ml-2 bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded-full">
              {hasFilter ? `${displayed.length}/${items.length}` : items.length}
            </span>
          )}
        </span>
        <span className="text-amber-500">{loading ? '⟳' : loaded ? '▾' : '▸'}</span>
      </button>

      {loaded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={loadStale} disabled={loading}
              className="px-3 py-1.5 text-xs border border-amber-300 rounded-lg text-amber-700 hover:bg-amber-100 disabled:opacity-50">
              🔄 {t('Tải lại','Reload')}
            </button>
            {displayed.length > 0 && (
              <button
                onClick={() => refreshImeis(displayed.map(i => i.imei).filter(Boolean), 'all')}
                disabled={!!refreshing}
                className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
                {refreshing === 'all'
                  ? <><span className="animate-spin inline-block">⟳</span> {t('Đang cập nhật...','Updating...')}</>
                  : `⚡ ${t(`Cập nhật ${displayed.length} thiết bị từ CRM`, `Refresh ${displayed.length} devices from CRM`)}`}
              </button>
            )}
            {hasFilter && (
              <button onClick={() => { setFStatus(''); setFProduct(''); setFWarehouse(''); setFRepairWh(''); setFMinDays('') }}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                ✕ {t('Xoá lọc','Clear filters')}
              </button>
            )}
            <button onClick={handleExport} disabled={exporting || displayed.length === 0}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {exporting
                ? <><span className="animate-spin inline-block">⟳</span> {t('Đang xuất...','Exporting...')}</>
                : <>⬇ {t(`Xuất Excel (${displayed.length})`, `Export Excel (${displayed.length})`)}</>}
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Trạng thái */}
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}
              className="border border-amber-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300">
              <option value="">{t('Tất cả trạng thái','All statuses')}</option>
              <option value="cho_gui">{t('Chờ gửi sửa','Pending Send')}</option>
              <option value="da_gui">{t('Đang sửa','In Repair')}</option>
            </select>
            {/* Loại thiết bị */}
            <select value={fProduct} onChange={e => setFProduct(e.target.value)}
              className="border border-amber-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 max-w-[160px]">
              <option value="">{t('Tất cả loại TB','All devices')}</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {/* Kho sửa */}
            <select value={fWarehouse} onChange={e => setFWarehouse(e.target.value)}
              className="border border-amber-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 max-w-[160px]">
              <option value="">{t('Tất cả kho sửa','All repair wh.')}</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            {/* Số ngày tối thiểu */}
            <select value={fMinDays} onChange={e => setFMinDays(e.target.value)}
              className="border border-amber-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300">
              <option value="">{t('Mọi số ngày','Any days')}</option>
              <option value="7">{t('> 7 ngày','> 7 days')}</option>
              <option value="14">{t('> 14 ngày','> 14 days')}</option>
              <option value="30">{t('> 30 ngày','> 30 days')}</option>
              <option value="60">{t('> 60 ngày','> 60 days')}</option>
            </select>
          </div>

          {err    && <p className="text-xs text-red-600">⚠ {err}</p>}
          {result && <p className="text-xs text-emerald-700">{result}</p>}

          {displayed.length === 0 ? (
            <p className="text-xs text-amber-600 py-2">
              {hasFilter
                ? t('Không có thiết bị nào khớp bộ lọc','No devices match the filters')
                : t('Không có thiết bị nào chờ/sửa quá 7 ngày 👍','No devices pending/in-repair for over 7 days 👍')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-amber-100 bg-amber-50 text-amber-700 uppercase tracking-wide">
                    <th className="px-3 py-2">{t('IMEI','IMEI')}</th>
                    <th className="px-3 py-2">{t('Thiết bị','Device')}</th>
                    <th className="px-3 py-2">{t('Trạng thái','Status')}</th>
                    <th className="px-3 py-2">{t('Ngày tham chiếu','Ref. Date')}</th>
                    <th className="px-3 py-2">{t('Số ngày','Days')}</th>
                    <th className="px-3 py-2">{t('Kho sửa','Repair Wh.')}</th>
                    <th className="px-3 py-2">{t('CRM','CRM')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(item => {
                    const refDate      = item.status === 'da_gui' ? item.sent_at : item.received_at
                    const days         = daysSince(refDate)
                    const isRefreshing = refreshing === item.imei
                    return (
                      <tr key={item.id} onClick={() => setDetailImei(item.imei)}
                        className="border-b border-amber-50 hover:bg-amber-100 cursor-pointer">
                        <td className="px-3 py-2 font-mono text-gray-700">{item.imei}</td>
                        <td className="px-3 py-2 text-gray-600">{item.product_name}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${
                            item.status === 'cho_gui'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}>
                            {item.status === 'cho_gui' ? t('Chờ gửi','Pending') : t('Đang sửa','In Repair')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          <span className="text-gray-400 text-xs mr-1">
                            {item.status === 'da_gui' ? t('Gửi:','Sent:') : t('Nhận:','Rcv:')}
                          </span>
                          {refDate ? new Date(refDate).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-semibold ${(days??0) > 30 ? 'text-red-600' : (days??0) > 14 ? 'text-orange-500' : 'text-amber-700'}`}>
                            {days != null ? `${days}d` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{item.repair_warehouse ?? '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={e => { e.stopPropagation(); refreshImeis([item.imei], item.imei) }}
                            disabled={!!refreshing}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 disabled:opacity-50 flex items-center gap-1">
                            {isRefreshing ? <span className="animate-spin inline-block">⟳</span> : '🔄'}
                            Sync
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {detailImei && (
        <StaleDeviceDetailModal imei={detailImei} onClose={() => setDetailImei(null)} t={t} />
      )}
    </div>
  )
}

function StaleDeviceDetailModal({ imei, onClose, t }: { imei: string; onClose: () => void; t: (vi:string,en:string)=>string }) {
  const [records, setRecords] = useState<RepairItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')

  useEffect(() => {
    fetch(`/api/repair-tracking?imei=${encodeURIComponent(imei)}&limit=50`)
      .then(r => r.json())
      .then(d => { setRecords(d.items ?? []); setLoading(false) })
      .catch(e => { setErr(String(e)); setLoading(false) })
  }, [imei])

  const fmtDate = (iso: string|null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  }

  const STATUS_LABEL: Record<string,string> = {
    cho_gui: t('Chờ gửi','Pending'), da_gui: t('Đang sửa','In Repair'), da_sua_xong: t('Đã sửa xong','Completed')
  }
  const STATUS_COLOR: Record<string,string> = {
    cho_gui: 'bg-amber-100 text-amber-800 border-amber-300',
    da_gui: 'bg-blue-100 text-blue-800 border-blue-300',
    da_sua_xong: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              🔧 {t('Lịch sử sửa chữa','Repair History')}
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{imei}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && <p className="text-sm text-gray-400 text-center py-8">{t('Đang tải...','Loading...')}</p>}
          {err     && <p className="text-sm text-red-500 text-center py-8">⚠ {err}</p>}
          {!loading && records.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">{t('Không có lịch sử','No history found')}</p>
          )}
          {records.length > 0 && (
            <div className="space-y-3">
              {records.map((r, idx) => (
                <div key={r.id} className="border border-gray-100 rounded-xl p-4 space-y-2 hover:border-gray-200 transition-colors">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {t('Lần','Repair')} #{records.length - idx}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-gray-400">{t('Nhận về kho','Received')}: </span><span className="text-gray-700">{fmtDate(r.received_at)}</span></div>
                    <div><span className="text-gray-400">{t('Gửi sửa','Sent')}: </span><span className="text-gray-700">{fmtDate(r.sent_at)}</span></div>
                    <div><span className="text-gray-400">{t('Hoàn thành','Completed')}: </span><span className="text-gray-700">{fmtDate(r.completed_at)}</span></div>
                    <div><span className="text-gray-400">{t('Kho sửa','Warehouse')}: </span><span className="text-gray-700">{r.repair_warehouse ?? '—'}</span></div>
                    {r.sender_name    && <div><span className="text-gray-400">{t('Người gửi','Sent by')}: </span><span className="text-gray-700">{r.sender_name}</span></div>}
                    {r.completer_name && <div><span className="text-gray-400">{t('Người hoàn thành','Completed by')}: </span><span className="text-gray-700">{r.completer_name}</span></div>}
                    {r.finish_reason  && <div className="col-span-2"><span className="text-gray-400">{t('Kết quả','Result')}: </span><span className="text-gray-700">{r.finish_reason}</span></div>}
                  </div>
                  {r.notes && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      📝 {r.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SendModal({ item, onClose, onSaved, t }: { item:RepairItem; onClose:()=>void; onSaved:()=>void; t:(vi:string,en:string)=>string }) {
  const [warehouse, setWarehouse] = useState(REPAIR_WAREHOUSES[0])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr('')
    const res = await fetch(`/api/repair-tracking/${item.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'send', repair_warehouse:warehouse }) })
    const d = await res.json(); setLoading(false)
    if (!res.ok) { setErr(d.error||'Error'); return }
    onSaved()
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{t('Gửi sửa chữa','Send for Repair')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-700">{item.product_name}</p>
            <p className="text-gray-500 font-mono text-xs mt-0.5">{item.imei}</p>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('Kho sửa chữa *','Repair Warehouse *')}</label>
            <select value={warehouse} onChange={e=>setWarehouse(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              {REPAIR_WAREHOUSES.map(w=><option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Hủy','Cancel')}</button>
            <button type="submit" disabled={loading} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? t('Đang gửi...','Sending...') : t('Xác nhận gửi sửa','Confirm Send')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CompleteModal({ item, onClose, onSaved, t }: { item:RepairItem; onClose:()=>void; onSaved:()=>void; t:(vi:string,en:string)=>string }) {
  const [reason, setReason] = useState<FinishReason>('sua_xong')
  const [notes, setNotes]   = useState(item.notes??'')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr('')
    const res = await fetch(`/api/repair-tracking/${item.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'complete', finish_reason:reason, notes }) })
    const d = await res.json(); setLoading(false)
    if (!res.ok) { setErr(d.error||'Error'); return }
    onSaved()
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{t('Đã sửa chữa & Nhận về','Repair Complete & Return')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-700">{item.product_name}</p>
            <p className="text-gray-500 font-mono text-xs mt-0.5">{item.imei}</p>
            {item.repair_warehouse && <p className="text-xs text-blue-600 mt-0.5">📦 {item.repair_warehouse}</p>}
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('Lý do hoàn thành *','Completion reason *')}</label>
            <select value={reason} onChange={e=>setReason(e.target.value as FinishReason)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
              {(Object.keys(FINISH_REASON_LABEL) as FinishReason[]).map(r=><option key={r} value={r}>{FINISH_REASON_LABEL[r]}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">{FINISH_REASON_DEST[reason]}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('Ghi chú (dùng #hashtag để phân loại lỗi)','Notes (use #hashtag to categorize errors)')}
            </label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
              placeholder="#gsm #power #config ..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Hủy','Cancel')}</button>
            <button type="submit" disabled={loading} className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {loading ? t('Đang lưu...','Saving...') : t('Xác nhận hoàn thành','Confirm Complete')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatsBar({ counts, t }: { counts: StatusCounts; t:(vi:string,en:string)=>string }) {
  const stats = [
    { label: t('Chờ gửi sửa','Pending'),   value: counts.cho_gui,     color:'bg-amber-50 border-amber-200 text-amber-800' },
    { label: t('Đang sửa','In Repair'),     value: counts.da_gui,      color:'bg-blue-50 border-blue-200 text-blue-800' },
    { label: t('Hoàn thành','Completed'),   value: counts.da_sua_xong, color:'bg-emerald-50 border-emerald-200 text-emerald-800' },
    { label: 'Old Device',                  value: counts.old_device,  color:'bg-gray-50 border-gray-200 text-gray-700' },
    { label: 'Scrap',                       value: counts.scrap,       color:'bg-red-50 border-red-200 text-red-700' },
    { label: 'Supplier',                    value: counts.supplier,    color:'bg-purple-50 border-purple-200 text-purple-700' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {stats.map(s=>(
        <div key={s.label} className={`rounded-xl border px-3 py-2 text-center ${s.color}`}>
          <p className="text-xl font-bold">{s.value}</p>
          <p className="text-xs mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function RepairRow({ item, onAction, onSynced, t }: { item:RepairItem; onAction:(item:RepairItem,act:'send'|'complete')=>void; onSynced:()=>void; t:(vi:string,en:string)=>string }) {
  const repairDays = daysBetween(item.sent_at, item.completed_at)
  const waitDays   = daysBetween(item.received_at, item.sent_at)
  const statusLabel = t(STATUS_LABEL_VI[item.status], STATUS_LABEL_EN[item.status])
  const tags = item.notes?.match(/#([^\s#,;.!?()[\]{}"']+)/g) ?? []
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState('')
  const [editingImei, setEditingImei] = useState(false)
  const [imeiInput, setImeiInput]   = useState('')
  const [savingImei, setSavingImei] = useState(false)
  const [imeiMsg, setImeiMsg]       = useState('')
  const isBadImei = item.imei && /^9{5,}/.test(item.imei)

  async function handleSyncCRM() {
    setSyncing(true); setSyncMsg('')
    try {
      // Khi IMEI sai (999999xxx): tra CRM theo crm_repair_id để lấy đúng mã thiết bị
      const mode = /^9{5,}/.test(item.imei ?? '') ? 'fix_bad_imeis' : 'refresh_selected'
      const body = mode === 'fix_bad_imeis'
        ? { mode }
        : { mode, imeis: [item.imei] }
      const res = await fetch('/api/repair-tracking/sync-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.ok || d.fixed > 0) { setSyncMsg(t('✅ Đã cập nhật','✅ Updated')); onSynced() }
      else setSyncMsg(`⚠ ${d.error ?? t('Lỗi sync','Sync error')}`)
    } catch(e) { setSyncMsg(`❌ ${String(e)}`) } finally { setSyncing(false) }
    setTimeout(() => setSyncMsg(''), 3000)
  }

  async function handleSaveImei() {
    const v = imeiInput.trim()
    if (v.length < 4) { setImeiMsg(t('⚠ Mã thiết bị phải ít nhất 4 ký tự','⚠ Device code must be at least 4 chars')); return }
    setSavingImei(true); setImeiMsg('')
    try {
      const res = await fetch(`/api/repair-tracking/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imei: v }),
      })
      const d = await res.json()
      if (res.ok) { setImeiMsg('✅'); setEditingImei(false); onSynced() }
      else setImeiMsg(`⚠ ${d.error ?? 'Lỗi lưu'}`)
    } catch(e) { setImeiMsg(`❌ ${String(e)}`) } finally { setSavingImei(false) }
    setTimeout(() => setImeiMsg(''), 3000)
  }

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${isBadImei ? 'bg-rose-50' : ''}`}>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
        {editingImei ? (
          <div className="flex flex-col gap-1 mt-1">
            <input autoFocus value={imeiInput} onChange={e=>setImeiInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') handleSaveImei(); if(e.key==='Escape') setEditingImei(false) }}
              placeholder="Nhập IMEI (14-16 số)" maxLength={16}
              className="text-xs font-mono border border-rose-300 rounded px-1 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-rose-400" />
            <div className="flex gap-1">
              <button onClick={handleSaveImei} disabled={savingImei}
                className="px-1.5 py-0.5 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50">
                {savingImei ? '…' : '✓'}
              </button>
              <button onClick={()=>setEditingImei(false)}
                className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
            </div>
            {imeiMsg && <span className="text-xs text-rose-600">{imeiMsg}</span>}
          </div>
        ) : (
          <p className={`text-xs font-mono ${isBadImei ? 'text-rose-500 font-semibold' : 'text-gray-400'}`}>
            {item.imei}
            {isBadImei && (
              <button onClick={()=>{ setImeiInput(item.imei||''); setEditingImei(true) }}
                className="ml-1 text-rose-400 hover:text-rose-600" title={t('Sửa IMEI thủ công','Edit IMEI manually')}>✏️</button>
            )}
          </p>
        )}
        {item.crm_repair_id && <p className="text-xs text-blue-400">CRM#{item.crm_repair_id}</p>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[item.status]}`}>{statusLabel}</span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        <div>{fmtDate(item.received_at)}</div>
        {item.receiver_name && <div className="text-gray-400">{item.receiver_name}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.sent_at ? (<><div>{fmtDate(item.sent_at)}</div>
          {item.sender_name && <div className="text-gray-400">{item.sender_name}</div>}
          {item.repair_warehouse && <div className="text-blue-500">{item.repair_warehouse}</div>}
          {waitDays!==null && <div className="text-amber-500">{waitDays}d {t('chờ','wait')}</div>}
        </>) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.completed_at ? (<><div>{fmtDate(item.completed_at)}</div>
          {item.completer_name && <div className="text-gray-400">{item.completer_name}</div>}
          {repairDays!==null && <div className="text-purple-500">{repairDays}d {t('sửa','repair')}</div>}
        </>) : '—'}
      </td>
      <td className="px-4 py-3 text-xs">
        {item.finish_reason && (<><p className="text-gray-700">{FINISH_REASON_LABEL[item.finish_reason]}</p>
          {item.destination && <p className={`font-medium ${DEST_COLOR[item.destination]}`}>{DEST_LABEL[item.destination]}</p>}
        </>)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px]">
        {tags.length > 0 ? (
          <div className="space-y-0.5">
            {tags.slice(0,3).map(tag=>(
              <span key={tag} className="inline-block bg-indigo-50 text-indigo-600 rounded px-1 mr-0.5 text-xs">{tag}</span>
            ))}
            {tags.length > 3 && <span className="text-gray-400">+{tags.length-3}</span>}
          </div>
        ) : <span className="text-gray-300 italic text-xs">{item.notes?.substring(0,40) || '—'}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1 items-start">
          {item.status==='cho_gui' && <button onClick={()=>onAction(item,'send')} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 whitespace-nowrap">{t('Gửi sửa','Send')}</button>}
          {item.status==='da_gui'  && <button onClick={()=>onAction(item,'complete')} className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap">{t('Nhận về','Return')}</button>}
          {item.crm_repair_id && (
            <button onClick={handleSyncCRM} disabled={syncing}
              className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 border border-indigo-200 whitespace-nowrap disabled:opacity-50">
              {syncing ? <span className="animate-spin inline-block">⟳</span> : '🔄'} {t('Đồng bộ CRM','Sync CRM')}
            </button>
          )}
          {syncMsg && <span className="text-xs text-emerald-600">{syncMsg}</span>}
        </div>
      </td>
    </tr>
  )
}

type TrendView = 'cloud' | 'weekly_tag' | 'monthly_tag' | 'weekly_device' | 'monthly_device' | 'device_week' | 'device_month'

function HashtagSection({ t, onFilterByTag }: { t:(vi:string,en:string)=>string; onFilterByTag:(tag:string)=>void }) {
  const [data, setData]           = useState<HashtagData|null>(null)
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<string|null>(null)
  const [view, setView]           = useState<TrendView>('cloud')
  const [selDevice, setSelDevice] = useState<string>('')

  useEffect(() => {
    fetch('/api/repair-tracking/hashtags').then(r=>r.json()).then(d=>{setData(d);setLoading(false)}).catch(()=>setLoading(false))
  }, [])

  if (loading) return <div className="py-6 text-center text-sm text-gray-400">{t('Đang tải hashtag...','Loading hashtags...')}</div>
  if (!data || data.tags.length === 0) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-400">
      <p className="text-2xl mb-2">🏷</p>
      <p>{t('Chưa có hashtag nào','No hashtags found')}</p>
      <p className="text-xs mt-1 text-gray-300">{t('Kỹ thuật ghi #tag vào ghi chú khi sửa chữa','Technicians add #tags to notes when completing repairs')}</p>
    </div>
  )

  const maxCount = data.tags[0]?.count ?? 1
  const selectedEntry = selected ? data.tags.find(x=>x.tag===selected) : null

  const VIEWS: { key: TrendView; label: string }[] = [
    { key: 'cloud',          label: t('Tổng quan','Overview') },
    { key: 'weekly_tag',     label: t('Tuần / Lỗi','Week / Lỗi') },
    { key: 'monthly_tag',    label: t('Tháng / Lỗi','Month / Lỗi') },
    { key: 'device_week',    label: t('TB / Tuần','TB / Tuần') },
    { key: 'device_month',   label: t('TB / Tháng','TB / Tháng') },
    { key: 'weekly_device',  label: t('Tổng TB / Tuần','TB tổng / Tuần') },
    { key: 'monthly_device', label: t('Tổng TB / Tháng','TB tổng / Tháng') },
  ]

  // Device×tag views use a selected device
  const isDeviceTagView = view === 'device_week' || view === 'device_month'
  const activeDevice = selDevice || (data.topDevices[0] ?? '')

  const trendData = view === 'weekly_tag'     ? data.weeklyTrends
                  : view === 'monthly_tag'    ? data.monthlyTrends
                  : view === 'weekly_device'  ? data.weeklyDeviceTrends
                  : view === 'monthly_device' ? data.monthlyDeviceTrends
                  : view === 'device_week'    ? (data.deviceWeeklyTagTrends[activeDevice] ?? [])
                  : view === 'device_month'   ? (data.deviceMonthlyTagTrends[activeDevice] ?? [])
                  : null

  const trendKeys = (view === 'weekly_device' || view === 'monthly_device')
    ? data.topDevices
    : data.topTags
  const palette = (view === 'weekly_device' || view === 'monthly_device')
    ? DEV_PALETTE : TAG_PALETTE

  // Format X-axis label: "2026-W35" → "W35", "2026-08" → "T8"
  const fmtPeriod = (p: string) => {
    if (/W\d+$/.test(p)) return p.split('-')[1]          // W35
    const [, m] = p.split('-')
    return `T${parseInt(m)}`                              // T8
  }

  return (
    <div className="space-y-4">
      {/* Header + view tabs */}
      <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">🏷 {t('Phân tích lỗi theo hashtag','Error Analysis by Hashtag')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {data.tags.length} {t('loại lỗi','error types')} · {data.totalWithNotes.toLocaleString()} {t('thiết bị có ghi chú','records with notes')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => { setView(v.key); setSelected(null) }}
                className={`text-xs px-3 py-1 rounded-lg border transition-all ${view===v.key?'bg-indigo-600 text-white border-indigo-600':'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tag cloud view */}
        {view === 'cloud' && (
          <>
            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                {data.tags.map(entry => {
                  const size = 0.75 + (entry.count / maxCount) * 0.5
                  const isActive = selected === entry.tag
                  return (
                    <button key={entry.tag} onClick={() => { setSelected(isActive ? null : entry.tag) }}
                      style={{ fontSize: `${size}rem` }}
                      className={`px-2 py-0.5 rounded-lg border transition-all ${isActive?'bg-indigo-600 text-white border-indigo-600 shadow-md':'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
                      #{entry.tag}<span className="ml-1 text-xs opacity-70">{entry.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {selectedEntry && (
              <div className="border-t border-gray-100 bg-indigo-50 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-bold text-indigo-800">#{selectedEntry.tag}</span>
                    <span className="text-xs text-indigo-600 ml-2">{selectedEntry.count} {t('lần','occurrences')} · {selectedEntry.deviceCount} {t('thiết bị','devices')}</span>
                  </div>
                  <button onClick={() => { onFilterByTag(selectedEntry.tag); setSelected(null) }}
                    className="text-xs px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    🔍 {t('Lọc danh sách','Filter list')}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">{t('Thiết bị hay gặp','Devices most affected')}</p>
                    <div className="space-y-1">
                      {selectedEntry.topProducts.map(p=>(
                        <div key={p.product_name} className="flex justify-between text-xs">
                          <span className="text-gray-700 truncate">{p.product_name}</span>
                          <span className="text-indigo-600 font-medium ml-2">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">{t('Trạng thái sửa chữa','Repair Status')}</p>
                    <div className="space-y-1">
                      {Object.entries(selectedEntry.statuses).map(([s, cnt])=>(
                        <div key={s} className="flex justify-between text-xs">
                          <span className="text-gray-700">{STATUS_LABEL_VI[s as RepairStatus] ?? s}</span>
                          <span className="text-gray-600 font-medium">{cnt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Trend chart views */}
        {trendData && trendData.length > 0 && (
          <div className="p-5">
            {/* Device selector for device×tag views */}
            {isDeviceTagView && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">{t('Thiết bị:','Device:')}</span>
                <div className="flex flex-wrap gap-1">
                  {data.topDevices.map(dev => (
                    <button key={dev}
                      onClick={() => setSelDevice(dev)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all truncate max-w-[160px] ${
                        (selDevice || data.topDevices[0]) === dev
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}>
                      {dev}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 mb-3">
              {isDeviceTagView
                ? <><strong className="text-indigo-600">{activeDevice}</strong>{' — '}{view === 'device_week' ? t('lỗi theo tuần','errors by week') : t('lỗi theo tháng','errors by month')}</>
                : <>
                    {(view === 'weekly_tag' || view === 'weekly_device') ? t('Theo tuần','By week') : t('Theo tháng','By month')}
                    {' — '}
                    {(view === 'weekly_tag' || view === 'monthly_tag') ? t('phân theo loại lỗi','by error tag') : t('phân theo thiết bị','by device')}
                  </>
              }
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tickFormatter={fmtPeriod} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: number, name: string) => [val, `#${name}`]}
                  labelFormatter={(l: string) => (view === 'weekly_tag' || view === 'weekly_device' || view === 'device_week') ? `Tuần ${l}` : `Tháng ${l}`}
                />
                <Legend formatter={(v: string) => `#${v}`} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {trendKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key}
                    stroke={palette[i % palette.length]}
                    dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {trendData && trendData.length === 0 && (
          <div className="p-5 text-center text-sm text-gray-400">{t('Chưa có dữ liệu xu hướng','No trend data yet')}</div>
        )}
      </div>

      {/* Top 10 bar chart (always shown) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">{t('Top 10 lỗi phổ biến','Top 10 Common Errors')}</h4>
        <div className="space-y-2">
          {data.tags.slice(0,10).map(entry=>(
            <div key={entry.tag} className="flex items-center gap-3">
              <span className="text-xs text-indigo-600 font-mono w-36 truncate">#{entry.tag}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full" style={{ width:`${entry.count/maxCount*100}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{entry.count} {t('lần','×')}</span>
              <span className="text-xs text-gray-400 w-20 text-right">{entry.deviceCount} {t('TB','devices')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly bar chart for top devices */}
      {data.monthlyDeviceTrends.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h4 className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">{t('Lỗi theo thiết bị từng tháng','Errors by Device per Month')}</h4>
          <p className="text-xs text-gray-400 mb-3">{t('Top 6 thiết bị hay gặp lỗi nhất','Top 6 most error-prone devices')}</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthlyDeviceTrends} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tickFormatter={fmtPeriod} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(l: string) => `Tháng ${l}`} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              {data.topDevices.map((dev, i) => (
                <Bar key={dev} dataKey={dev} stackId="a"
                  fill={DEV_PALETTE[i % DEV_PALETTE.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function FailureProductTable({ products, t }: { products: InventoryStats['byProduct']; t:(vi:string,en:string)=>string }) {
  const [search, setSearch]       = useState('')
  const [minImport, setMinImport] = useState(0)
  const [hidden, setHidden]       = useState<Set<string>>(new Set())
  useEffect(() => {
    try { const s=localStorage.getItem(HIDDEN_KEY); if (s) setHidden(new Set(JSON.parse(s))) } catch {/**/}
  }, [])
  const [showHidden, setShowHidden] = useState(false)

  function toggleHide(name: string) {
    setHidden(prev=>{
      const next=new Set(prev); if(next.has(name)) next.delete(name); else next.add(name)
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])) } catch {/**/}
      return next
    })
  }
  function clearHidden() { setHidden(new Set()); try { localStorage.removeItem(HIDDEN_KEY) } catch {/**/} }

  const filtered = products.filter(p=>{
    if (!showHidden && hidden.has(p.product_name)) return false
    if (search && !p.product_name.toLowerCase().includes(search.toLowerCase())) return false
    if (minImport>0 && p.total_imported<minImport) return false
    return true
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">{t('Tỉ lệ lỗi theo loại thiết bị','Failure Rate by Device Type')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('hiển thị','showing')} {filtered.length}/{products.length} {t('loại','types')}</p>
          </div>
          {hidden.size>0 && (
            <div className="flex items-center gap-2">
              <button onClick={()=>setShowHidden(s=>!s)} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
                {showHidden ? t('Ẩn đã ẩn','Hide hidden') : `👁 ${t('Xem','View')} ${hidden.size} ${t('đã ẩn','hidden')}`}
              </button>
              <button onClick={clearHidden} className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-2 py-1">{t('Bỏ ẩn tất cả','Show all')}</button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`🔍 ${t('Tìm loại thiết bị...','Search device type...')}`}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>{t('Tổng nhập ≥','Min imported ≥')}</span>
            <input type="number" min={0} step={100} value={minImport||''} onChange={e=>setMinImport(Number(e.target.value)||0)} placeholder="0"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          {(search||minImport>0) && <button onClick={()=>{setSearch('');setMinImport(0)}} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 border border-gray-200 rounded-lg">{t('Xóa lọc','Clear')}</button>}
          <div className="flex gap-1 ml-auto">
            {[500,1000,5000].map(n=>(
              <button key={n} onClick={()=>setMinImport(minImport===n?0:n)}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors ${minImport===n?'bg-blue-600 text-white border-blue-600':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                &gt;{n>=1000?`${n/1000}k`:n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">{t('Loại thiết bị','Device Type')}</th>
              <th className="px-4 py-2.5 text-right">{t('Tổng nhập','Imported')}</th>
              <th className="px-4 py-2.5 text-right">{t('Đã sửa','Repaired')}</th>
              <th className="px-4 py-2.5 text-right">{t('Gửi hãng','Supplier')}</th>
              <th className="px-4 py-2.5 text-right">{t('Báo phế','Scrap')}</th>
              <th className="px-4 py-2.5 text-left w-44">{t('Tỉ lệ lỗi','Failure Rate')}</th>
              <th className="px-4 py-2.5 text-left w-40">{t('Gửi hãng %','Supplier %')}</th>
              <th className="px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{t('Không có kết quả','No results')}</td></tr>
            : filtered.map(p=>{
              const isHidden = hidden.has(p.product_name)
              return (
                <tr key={p.product_name} className={`border-b border-gray-50 hover:bg-gray-50 ${isHidden?'opacity-40':''}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-700">{p.product_name}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{p.total_imported.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={p.repair_rate>20?'text-red-600 font-semibold':p.repair_rate>10?'text-amber-600':'text-gray-600'}>{p.total_repaired.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-purple-600">{p.total_supplier.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-red-500">{p.total_scrap.toLocaleString()}</td>
                  <td className="px-4 py-2.5"><RateBar rate={p.repair_rate} color={p.repair_rate>20?'bg-red-500':p.repair_rate>10?'bg-amber-400':'bg-emerald-500'} /></td>
                  <td className="px-4 py-2.5"><RateBar rate={p.supplier_rate} color="bg-purple-400" /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={()=>toggleHide(p.product_name)} className="text-gray-300 hover:text-gray-500 text-base leading-none">{isHidden?'👁':'✕'}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Repeat Devices Panel ──────────────────────────────────────
const DEST_LABEL_S: Record<string, string> = { old_device:'Old Device', scrap:'Scrap', supplier:'Supplier' }
const DEST_COLOR_S: Record<string, string> = { old_device:'text-emerald-600', scrap:'text-red-500', supplier:'text-purple-600' }
const FINISH_LABEL_S: Record<string, string> = {
  sua_xong:'Sửa xong', khong_loi_bt:'Không lỗi', loai_bo:'Loại bỏ',
  loai_bo_bo_mach:'Loại bỏ bo mạch', send_supplier:'Gửi hãng',
}

function toHashtag(name: string): string {
  const map: Record<string,string> = {
    'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ắ':'a','ằ':'a','ặ':'a','ẳ':'a','ẵ':'a',
    'â':'a','ấ':'a','ầ':'a','ậ':'a','ẩ':'a','ẫ':'a','è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
    'ê':'e','ế':'e','ề':'e','ệ':'e','ể':'e','ễ':'e','ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
    'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ố':'o','ồ':'o','ộ':'o','ổ':'o','ỗ':'o',
    'ơ':'o','ớ':'o','ờ':'o','ợ':'o','ở':'o','ỡ':'o','ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
    'ư':'u','ứ':'u','ừ':'u','ự':'u','ử':'u','ữ':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y',
    'đ':'d','Đ':'d',
  }
  return '#' + name.split('').map(c=>map[c.toLowerCase()]??c.toLowerCase()).join('')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
}

function RepeatDevicesPanel({ devices, t }: { devices: DupDevice[]; t:(vi:string,en:string)=>string }) {
  const [search, setSearch]       = useState('')
  const [minCount, setMinCount]   = useState(2)
  const [expandedImei, setExpanded] = useState<string|null>(null)

  const filtered = devices.filter(d => {
    if (d.count < minCount) return false
    if (search) {
      const q = search.toLowerCase()
      return d.imei.toLowerCase().includes(q) || d.product_name.toLowerCase().includes(q)
    }
    return true
  })

  function exportCSV() {
    const header = 'IMEI,Loại thiết bị,Số lần sửa,Lần cuối,Lần,Nhận về,Gửi sửa,Hoàn thành,Kho sửa,Kết quả,Đích đến,Ghi chú'
    const rows: string[] = [header]
    for (const d of filtered) {
      for (const [i, r] of d.repairs.entries()) {
        rows.push([
          d.imei, d.product_name, d.count, fmtDate(d.last_received),
          i+1, fmtDate(r.received_at), fmtDate(r.sent_at), fmtDate(r.completed_at),
          r.repair_warehouse??'', FINISH_LABEL_S[r.finish_reason??'']??r.finish_reason??'',
          DEST_LABEL_S[r.destination??'']??r.destination??'',
          (r.notes??'').replace(/,/g,' ')
        ].map(v=>`"${v}"`).join(','))
      }
    }
    const blob = new Blob(['﻿'+rows.join('\n')], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href=url; a.download=`thiet-bi-sua-nhieu-lan-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white border border-orange-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-orange-100 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">🔁 {t('Thiết bị sửa nhiều lần','Repeat Repair Devices')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length}/{devices.length} {t('thiết bị','devices')}</p>
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            ⬇ CSV
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder={t('🔍 Tìm IMEI hoặc loại thiết bị...','🔍 Search IMEI or device type...')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-60 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">{t('Sửa ≥','Repairs ≥')}</span>
            {[2,3,4,5,10].map(n=>(
              <button key={n} onClick={()=>setMinCount(minCount===n?2:n)}
                className={`px-2 py-1 rounded-lg border transition-colors ${minCount===n?'bg-orange-500 text-white border-orange-500':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {n}
              </button>
            ))}
          </div>
          {search && <button onClick={()=>setSearch('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>}
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {filtered.length===0
          ? <p className="text-xs text-gray-400 text-center py-8">{t('Không có kết quả','No results')}</p>
          : filtered.map(d=>(
            <div key={d.imei}>
              <button onClick={()=>setExpanded(expandedImei===d.imei?null:d.imei)}
                className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-orange-50 text-left transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono text-gray-700 truncate">{d.imei}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{d.product_name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">{t('Cuối','Last')}: {fmtDate(d.last_received)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${d.count>=5?'bg-red-100 text-red-700':d.count>=3?'bg-orange-100 text-orange-700':'bg-amber-100 text-amber-700'}`}>
                    {d.count}×
                  </span>
                  <span className="text-gray-400 text-xs">{expandedImei===d.imei?'▲':'▼'}</span>
                </div>
              </button>
              {expandedImei===d.imei && (
                <div className="bg-orange-50 border-t border-orange-100 px-5 py-3 space-y-2">
                  {d.repairs.map((r,i)=>{
                    const tags = r.notes?.match(/#([^\s#,;.!?()[\]{}"']+)/g)??[]
                    return (
                      <div key={r.id} className="bg-white rounded-xl border border-orange-100 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-orange-700">#{d.repairs.length-i} · {fmtDate(r.received_at)}</span>
                          <div className="flex items-center gap-2">
                            {r.destination && <span className={`text-xs font-semibold ${DEST_COLOR_S[r.destination]??'text-gray-600'}`}>{DEST_LABEL_S[r.destination]??r.destination}</span>}
                            {r.repair_warehouse && <span className="text-xs text-blue-500">{r.repair_warehouse}</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-500 mb-2">
                          <div><span className="text-gray-400">Nhận: </span>{fmtDate(r.received_at)}{r.receiver_name && <span className="text-gray-400"> · {r.receiver_name}</span>}</div>
                          <div><span className="text-gray-400">Gửi: </span>{r.sent_at?fmtDate(r.sent_at):'—'}{r.sender_name && <span className="text-gray-400"> · {r.sender_name}</span>}</div>
                          <div><span className="text-gray-400">Xong: </span>{r.completed_at?fmtDate(r.completed_at):'—'}{r.completer_name && <span className="text-gray-400"> · {r.completer_name}</span>}</div>
                        </div>
                        {r.finish_reason && <p className="text-xs text-gray-500 mb-1">📋 {FINISH_LABEL_S[r.finish_reason]??r.finish_reason}</p>}
                        {r.notes && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tags.length>0 ? tags.map(tag=>(
                              <span key={tag} className="bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5 text-xs">{tag}</span>
                            )) : <span className="text-xs text-gray-400 italic">{r.notes.substring(0,80)}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

interface SyncStatus { totalMonths: number; syncedMonths: number; missing: string[]; latestSynced: string | null }

function InventorySyncPanel({ t, onDone }: { t:(vi:string,en:string)=>string; onDone:()=>void }) {
  const [syncing, setSyncing]       = useState(false)
  const [syncLog, setSyncLog]       = useState<string[]>([])
  const [syncDone, setSyncDone]     = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    fetch('/api/device-inventory/sync-crm')
      .then(r => r.json())
      .then((d: Record<string, unknown>) => {
        const rows = (d.log as { month: string }[] | null) ?? []
        const sorted = rows.map(r => r.month).sort()
        setSyncStatus({
          totalMonths:  Number(d.totalMonths ?? 0),
          syncedMonths: Number(d.syncedMonths ?? 0),
          missing:      (d.missing as string[]) ?? [],
          latestSynced: sorted.length > 0 ? sorted[sorted.length - 1] : null,
        })
      })
      .catch(() => {})
  }, [syncDone])

  async function runSyncLoop(firstBody: Record<string, string> = {}) {
    setSyncing(true); setSyncDone(false); setSyncLog([]); abortRef.current = false
    let fromDate: string|null = null; let finalDone = false; let isFirst = true
    while (true) {
      if (abortRef.current) { setSyncLog(p=>[...p,'⛔ '+t('Đã dừng','Stopped')]); break }
      try {
        const body: Record<string,string> = isFirst ? { ...firstBody } : {}
        if (!isFirst && fromDate) body.fromDate = fromDate
        isFirst = false
        const res  = await fetch('/api/device-inventory/sync-crm', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        const txt = await res.text()
        let d: Record<string,unknown>
        try { d=JSON.parse(txt) } catch { setSyncLog(p=>[...p,`❌ ${txt.substring(0,80)}`]); break }
        if (!res.ok||d.error) { setSyncLog(p=>[...p,`❌ ${d.error}`]); break }
        if (d.done&&!d.month) { setSyncLog(p=>[...p,`✅ ${d.message??t('Hoàn thành','Done')}`]); finalDone=true; break }
        const progress = (d.syncedMonths&&d.totalMonths) ? ` [${d.syncedMonths}/${d.totalMonths}]` : ''
        setSyncLog(p=>[...p,`${d.ok?'✅':'⚠'} ${t('Tháng','Month')} ${d.month}: ${d.total} ${t('thiết bị → lưu','devices → saved')} ${d.upserted}${progress}`])
        if (d.done) { finalDone=true; break }
        fromDate = d.nextFromDate as string|null
        if (!fromDate) { finalDone=true; break }
        await new Promise(r=>setTimeout(r,300))
      } catch(e) { setSyncLog(p=>[...p,`❌ ${String(e)}`]); break }
    }
    setSyncing(false); setSyncDone(finalDone)
    if (finalDone) onDone()
  }

  async function startSync() { await runSyncLoop() }

  async function forceResync2026() {
    const year = new Date().getFullYear()
    setSyncLog([`🗑 ${t('Đang xóa log','Clearing log')} ${year}...`])
    await runSyncLoop({ forceFrom: `${year}-01` })
  }

  const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}` }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-indigo-800">{t('Sync kho thiết bị từ CRM','Sync Device Inventory from CRM')}</p>
          {syncStatus ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              <span className="text-xs text-indigo-700">
                ✅ {t('Đã sync','Synced')}: <strong>{syncStatus.syncedMonths}/{syncStatus.totalMonths}</strong> {t('tháng (01/2023 → hiện tại)','months (01/2023 → present)')}
                {syncStatus.latestSynced && <> · {t('mới nhất','latest')}: <strong>{fmtMonth(syncStatus.latestSynced)}</strong></>}
              </span>
              {syncStatus.missing.length > 0 && (
                <span className="text-xs text-amber-600">
                  ⚠ {t('Chưa sync','Missing')}: {syncStatus.missing.length} {t('tháng','months')}
                  {syncStatus.missing.length <= 4 && <> ({syncStatus.missing.map(fmtMonth).join(', ')})</>}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-indigo-500 mt-0.5">{t('Tải từng tháng từ 01/2023 → hiện tại','Load month by month from 01/2023 → present')}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {syncing
            ? <button onClick={()=>{abortRef.current=true}} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">⛔ {t('Dừng','Stop')}</button>
            : <>
                <button onClick={startSync} className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">🔄 {syncDone?t('Sync lại','Re-sync'):t('Bắt đầu Sync','Start Sync')}</button>
                <button onClick={forceResync2026} title={t(`Xóa log & sync lại toàn bộ năm ${new Date().getFullYear()}`,`Clear log & re-sync all of ${new Date().getFullYear()}`)} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">⚡ {t(`Sync lại ${new Date().getFullYear()}`,`Re-sync ${new Date().getFullYear()}`)}</button>
              </>
          }
        </div>
      </div>
      {syncLog.length>0 && (
        <div className="bg-white border border-indigo-100 rounded-lg p-3 max-h-36 overflow-y-auto">
          {syncLog.map((line,i)=><p key={i} className="text-xs font-mono text-gray-600">{line}</p>)}
          {syncing && <p className="text-xs font-mono text-indigo-500 animate-pulse">⏳ {t('Đang xử lý...','Processing...')}</p>}
        </div>
      )}
    </div>
  )
}



// ─── Detailed Analysis Panel — 2 cột: theo thiết bị + theo loại lỗi ──────────
type CatKey2 = 'repaired'|'warranty'|'noFault'|'broken'

function DetailedAnalysisPanel({ stats, t }: { stats: StatsData; t:(vi:string,en:string)=>string }) {
  const [active, setActive] = useState<CatKey2>('repaired')

  const cats: { key: CatKey2; label: string; count: number; emerald?: boolean; amber?: boolean; blue?: boolean; red?: boolean; dotCls: string; tabActive: string; tabInactive: string }[] = [
    { key:'repaired', label:t('Đã sửa','Repaired'),         count:stats.repaired,  dotCls:'bg-emerald-500', tabActive:'border-b-2 border-emerald-500 text-emerald-700 font-bold', tabInactive:'text-gray-500 hover:text-gray-700' },
    { key:'warranty', label:t('Gửi bảo hành','Warranty'),   count:stats.supplier,  dotCls:'bg-amber-400',   tabActive:'border-b-2 border-amber-400   text-amber-700   font-bold', tabInactive:'text-gray-500 hover:text-gray-700' },
    { key:'noFault',  label:t('Không lỗi','No Fault'),      count:stats.noFault,   dotCls:'bg-blue-500',    tabActive:'border-b-2 border-blue-500    text-blue-700    font-bold', tabInactive:'text-gray-500 hover:text-gray-700' },
    { key:'broken',   label:t('Báo phế','Written Off'),     count:stats.scrap,     dotCls:'bg-red-400',     tabActive:'border-b-2 border-red-400     text-red-700     font-bold', tabInactive:'text-gray-500 hover:text-gray-700' },
  ]

  const completedTotal = stats.repaired + stats.supplier + stats.noFault + stats.scrap

  // Device rows for active category
  const fieldMap: Record<CatKey2, 'repaired'|'supplier'|'noFault'|'scrap'> = {
    repaired:'repaired', warranty:'supplier', noFault:'noFault', broken:'scrap',
  }
  const devField = fieldMap[active]
  const devRows = stats.byProduct
    .map(p => ({ name: p.product_name, val: p[devField] as number }))
    .filter(r => r.val > 0)
    .sort((a,b) => b.val-a.val)
  const devTotal = devRows.reduce((s,r) => s+r.val, 0)
  const maxDev   = devRows[0]?.val ?? 1

  // Fault rows for active category
  const faultRows = (stats.faultTypeByCategory?.[active] ?? [])
  const faultTotal = faultRows.reduce((s,r) => s+r.count, 0)
  const maxFault   = faultRows[0]?.count ?? 1

  const activeCat = cats.find(c=>c.key===active)!

  // bar color per category
  const barColor: Record<CatKey2, string> = {
    repaired:'bg-emerald-500', warranty:'bg-amber-400', noFault:'bg-blue-500', broken:'bg-red-400'
  }

  function HBar({ val, max, total, color, label }: { val:number; max:number; total:number; color:string; label:string }) {
    const pct = total>0 ? Math.round(val/total*100) : 0
    const w   = max>0   ? val/max*100               : 0
    return (
      <div className="flex items-center gap-3 group">
        <span className="text-xs text-gray-600 w-28 shrink-0 text-right truncate" title={label}>{label}</span>
        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
          <div className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all duration-300 flex items-center justify-end`}
               style={{width:`${Math.max(w,4)}%`}}>
            {pct >= 8 && <span className="text-white text-[10px] font-bold pr-1.5">{pct}%</span>}
          </div>
        </div>
        {pct < 8 && <span className="text-[10px] font-semibold text-gray-500 w-6">{pct}%</span>}
        <span className="text-xs font-bold text-gray-700 w-5 text-right">{val}</span>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-0">
        <h3 className="text-sm font-bold text-gray-800 mb-3">{t('Phân tích chi tiết','Detailed Analysis')}</h3>
        {/* Tab row */}
        <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
          {cats.map(c=>{
            const pct = completedTotal>0 ? Math.round(c.count/completedTotal*100) : 0
            return (
              <button key={c.key} onClick={()=>setActive(c.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors -mb-px ${active===c.key ? c.tabActive : c.tabInactive}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${c.dotCls} shrink-0`}/>
                {c.label}
                <span className="font-bold">{c.count}</span>
                <span className="text-xs opacity-60">· {pct}%</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Body — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 p-5 gap-6">
        {/* Left: BY DEVICE TYPE */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            {t('Theo loại thiết bị','By Device Type')} ({devTotal} {t('thiết bị','devices')})
          </p>
          {devRows.length === 0
            ? <p className="text-xs text-gray-400 py-6 text-center">{t('Chưa có dữ liệu','No data')}</p>
            : <div className="space-y-2">
                {devRows.map(r=>(
                  <HBar key={r.name} val={r.val} max={maxDev} total={devTotal}
                        color={barColor[active]} label={r.name} />
                ))}
              </div>
          }
        </div>

        {/* Right: BY FAULT TYPE */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            {t('Theo loại lỗi','By Fault Type')} ({faultTotal} {t('trường hợp','cases')})
          </p>
          {faultRows.length === 0
            ? <p className="text-xs text-gray-400 py-6 text-center">
                {t('Chưa có dữ liệu — lỗi được ghi qua hashtag (#GSM, #RFID...) trong phần ghi chú','No data — log faults via hashtag (#GSM, #RFID...) in notes')}
              </p>
            : <div className="space-y-2">
                {faultRows.map(r=>(
                  <HBar key={r.tag} val={r.count} max={maxFault} total={faultTotal}
                        color="bg-emerald-500" label={r.tag} />
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  )
}


function StatsTab({ t, onFilterByTag, active }: { t:(vi:string,en:string)=>string; onFilterByTag:(tag:string)=>void; active: boolean }) {
  const [section, setSection] = useState<'repair'|'failure'|'hashtag'>('repair')
  const [stats, setStats]     = useState<StatsData|null>(null)
  const [loadingS, setLoadingS] = useState(true)
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [statsLoaded, setStatsLoaded] = useState(false)
  const loadStats = useCallback(async()=>{
    setLoadingS(true)
    const params = new URLSearchParams()
    if (from) params.set('from',from)
    if (to)   params.set('to',to)
    const res = await fetch('/api/repair-tracking/stats?'+params.toString())
    const d   = await res.json()
    setStats(d); setLoadingS(false)
  },[from,to])
  // Lazy load: only fetch when tab becomes active for the first time
  useEffect(()=>{
    if (active && !statsLoaded) { setStatsLoaded(true); loadStats() }
  },[active, statsLoaded, loadStats])

  const [invStats, setInvStats]   = useState<InventoryStats|null>(null)
  const [loadingI, setLoadingI]   = useState(true)
  const [invErr, setInvErr]       = useState('')
  const [invLoaded, setInvLoaded] = useState(false)

  async function loadInv(forceRefresh = false) {
    setLoadingI(true); setInvErr('')
    try {
      const url  = forceRefresh ? '/api/device-inventory/stats?refresh=1' : '/api/device-inventory/stats'
      const res  = await fetch(url)
      const txt  = await res.text()
      let d: Record<string,unknown>
      try { d=JSON.parse(txt) } catch { setInvErr(`Parse error: ${txt.substring(0,120)}`); setLoadingI(false); return }
      if (!res.ok||d.error) { setInvErr(String(d.error??'Error')); setInvStats(null) }
      else { setInvStats(d as unknown as InventoryStats) }
    } catch(e) { setInvErr(String(e)) }
    setLoadingI(false)
  }

  useEffect(()=>{
    if (section==='failure'&&!invLoaded) { setInvLoaded(true); loadInv() }
  },[section])

  const sections = [
    { id:'repair',  label: t('📊 Sửa chữa','📊 Repairs') },
    { id:'failure', label: t('⚠️ Tỉ lệ lỗi','⚠️ Failure Rate') },
    { id:'hashtag', label: t('🏷 Phân tích lỗi','🏷 Error Tags') },
  ] as const

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-gray-200">
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${section===s.id?'border-blue-600 text-blue-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {section==='repair' && (
        loadingS ? <div className="py-12 text-center text-sm text-gray-400">{t('Đang tải...','Loading...')}</div>
        : !stats  ? <div className="py-12 text-center text-sm text-red-400">{t('Lỗi tải dữ liệu','Load error')}</div>
        : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3 items-end bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('Từ ngày nhận','From date')}</label>
                <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('Đến ngày','To date')}</label>
                <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" /></div>
              <button onClick={loadStats} className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 bg-white">🔄 {t('Cập nhật','Update')}</button>
              {(from||to) && <button onClick={()=>{setFrom('');setTo('')}} className="px-3 py-1.5 text-xs text-gray-400">{t('Xoá lọc','Clear')}</button>}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label:t('Tổng lượt sửa','Total repairs'), value:stats.total, sub:`${stats.uniqueDevices} ${t('thiết bị riêng','unique')}`, color:'text-gray-800', bg:'bg-gray-50 border-gray-200' },
                { label:t('Hoàn thành','Completed'), value:`${stats.completionRate}%`, sub:`${stats.completed}/${stats.total}`, color:'text-emerald-700', bg:'bg-emerald-50 border-emerald-200' },
                { label:t('TB lặp lại','Repeat devices'), value:stats.repeatedDeviceCount, sub:t('sửa ≥ 2 lần','repaired ≥2x'), color:'text-orange-700', bg:'bg-orange-50 border-orange-200' },
                { label:t('Gửi Supplier','Sent to Supplier'), value:`${stats.supplierRate}%`, sub:`${stats.supplier} ${t('thiết bị','devices')}`, color:'text-purple-700', bg:'bg-purple-50 border-purple-200' },
              ].map(s=>(
                <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
            {/* ── Kết quả 4 loại ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">{t(`Kết quả sửa chữa (${stats.completed} hoàn thành)`,`Repair results (${stats.completed} completed)`)}</h3>
              <p className="text-xs text-gray-400 mb-4">{t('Tính trên tổng số lượt tiếp nhận','As % of total received')}: {stats.total}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 mb-5">
                {[
                  { label:t('Đã sửa','Repaired'),       count:stats.repaired,  rate:stats.repairedRate,  color:'bg-emerald-500', tc:'text-emerald-600', bg:'bg-emerald-50 border-emerald-200' },
                  { label:t('Gửi bảo hành','Warranty'), count:stats.supplier,  rate:stats.supplierRate,  color:'bg-amber-400',   tc:'text-amber-700',   bg:'bg-amber-50 border-amber-200'   },
                  { label:t('Không lỗi','No Fault'),    count:stats.noFault,   rate:stats.noFaultRate,   color:'bg-blue-500',    tc:'text-blue-700',    bg:'bg-blue-50 border-blue-200'     },
                  { label:t('Báo phế','Written Off'),   count:stats.scrap,     rate:stats.scrapRate,     color:'bg-red-400',     tc:'text-red-600',     bg:'bg-red-50 border-red-200'       },
                ].map(r=>(
                  <div key={r.label} className={`rounded-xl border p-3 ${r.bg}`}>
                    <p className={`text-xl font-bold ${r.tc}`}>{r.count}</p>
                    <p className="text-xs font-semibold text-gray-600 mt-0.5">{r.label}</p>
                    <div className="mt-2"><RateBar rate={r.rate} color={r.color} /></div>
                  </div>
                ))}
              </div>
              {/* mini stacked bar */}
              <div className="h-3 rounded-full overflow-hidden flex gap-px bg-gray-100">
                <div className="bg-emerald-500 h-full transition-all" style={{width:`${stats.repairedRate}%`}} title={t('Đã sửa','Repaired')} />
                <div className="bg-amber-400 h-full transition-all"   style={{width:`${stats.supplierRate}%`}} title={t('Bảo hành','Warranty')} />
                <div className="bg-blue-500 h-full transition-all"    style={{width:`${stats.noFaultRate}%`}} title={t('Không lỗi','No Fault')} />
                <div className="bg-red-400 h-full transition-all"     style={{width:`${stats.scrapRate}%`}} title={t('Báo phế','Written Off')} />
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-500">
                <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"/>Đã sửa</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"/>Bảo hành</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1"/>Không lỗi</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"/>Báo phế</span>
              </div>
            </div>
            {/* ── Phân tích chi tiết ── */}
            <DetailedAnalysisPanel stats={stats} t={t} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            </div>
            <RepeatDevicesPanel devices={stats.allRepeatedDevices??[]} t={t} />
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('Theo kho sửa chữa','By Repair Warehouse')}</h3>
              {stats.byWarehouse.length===0 ? <p className="text-xs text-gray-400 py-4 text-center">{t('Chưa có dữ liệu','No data')}</p>
              : <div className="space-y-3">
                  {stats.byWarehouse.map(w=>(
                    <div key={w.warehouse}>
                      <div className="flex justify-between text-xs mb-1"><span className="font-medium text-gray-700">{w.warehouse}</span><span className="text-gray-400">{w.total}</span></div>
                      <div className="flex gap-1 h-2">
                        <div className="bg-emerald-500 h-2 rounded-l" style={{width:`${w.total>0?w.completed/w.total*100:0}%`}} />
                        <div className="bg-red-400 h-2" style={{width:`${w.total>0?w.scrap/w.total*100:0}%`}} />
                        <div className="bg-purple-400 h-2 rounded-r" style={{width:`${w.total>0?w.supplier/w.total*100:0}%`}} />
                      </div>
                      <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                        <span className="text-emerald-600">{w.completed} {t('hoàn thành','done')}</span>
                        <span className="text-red-500">{w.scrap} scrap</span>
                        <span className="text-purple-500">{w.supplier} supplier</span>
                      </div>
                    </div>
                  ))}
                </div>}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">{t('Thống kê theo loại thiết bị','Statistics by Device Type')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">{t('Loại thiết bị','Device Type')}</th>
                    <th className="px-3 py-2.5 text-right text-gray-500">{t('Tổng','Total')}</th>
                    <th className="px-3 py-2.5 text-right text-blue-500">{t('Đang sửa','In Repair')}</th>
                    <th className="px-3 py-2.5 text-right text-emerald-600">{t('Đã sửa','Repaired')}</th>
                    <th className="px-3 py-2.5 text-right text-amber-600">{t('Bảo hành','Warranty')}</th>
                    <th className="px-3 py-2.5 text-right text-indigo-500">{t('Không lỗi','No Fault')}</th>
                    <th className="px-3 py-2.5 text-right text-red-500">{t('Báo phế','Written Off')}</th>
                    <th className="px-4 py-2.5 text-left w-32">{t('Phân bổ','Breakdown')}</th>
                  </tr></thead>
                  <tbody>
                    {stats.byProduct.filter(p=>p.total>0).map(p=>{
                      const done = p.repaired+p.supplier+p.noFault+p.scrap
                      return (
                      <tr key={p.product_name} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700 sticky left-0 bg-white">{p.product_name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-700">{p.total}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{p.inRepair||'—'}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{p.repaired||'—'}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{p.supplier||'—'}</td>
                        <td className="px-3 py-2 text-right text-indigo-500">{p.noFault||'—'}</td>
                        <td className="px-3 py-2 text-right text-red-500">{p.scrap||'—'}</td>
                        <td className="px-3 py-2">
                          {done>0 && (
                            <div className="flex h-2 rounded-full overflow-hidden gap-px bg-gray-100 w-28">
                              <div className="bg-emerald-500" style={{width:`${p.repaired/done*100}%`}} title="Đã sửa" />
                              <div className="bg-amber-400"   style={{width:`${p.supplier/done*100}%`}} title="Bảo hành" />
                              <div className="bg-blue-400"    style={{width:`${p.noFault/done*100}%`}} title="Không lỗi" />
                              <div className="bg-red-400"     style={{width:`${p.scrap/done*100}%`}} title="Báo phế" />
                            </div>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {section==='failure' && (
        <div className="space-y-5">
          <InventorySyncPanel t={t} onDone={() => loadInv(true)} />
          {loadingI ? <div className="py-8 text-center text-sm text-gray-400">{t('Đang tải...','Loading...')}</div>
          : invErr ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">⚠ {t('Lỗi tải thống kê','Stats load error')}</p>
              <p className="text-xs font-mono mt-1">{invErr}</p>
              {invErr.includes('RPC') && <p className="text-xs mt-2">👉 {t('Cần chạy migration','Run migration')} <strong>device_inventory_stats_fn.sql</strong></p>}
            </div>
          ) : !invStats||invStats.totalImported===0 ? (
            <div className="py-8 text-center text-sm text-gray-400">{invStats?.message??t('Chưa có dữ liệu. Nhấn Sync để tải từ CRM.','No data. Click Sync to load from CRM.')}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label:t('Tổng thiết bị nhập','Total Imported'), value:invStats.totalImported.toLocaleString(), color:'text-gray-800', bg:'bg-gray-50 border-gray-200' },
                  { label:t('Mã thiết bị riêng','Unique Devices'), value:invStats.totalUniqImei.toLocaleString(), color:'text-blue-700', bg:'bg-blue-50 border-blue-200' },
                  { label:t('Đã có sửa chữa','Had Repairs'), value:invStats.totalRepaired.toLocaleString(), color:'text-orange-700', bg:'bg-orange-50 border-orange-200' },
                  { label:t('Tỉ lệ lỗi tổng','Overall Failure Rate'), value:`${invStats.overallRepairRate}%`,
                    color:invStats.overallRepairRate>20?'text-red-700':invStats.overallRepairRate>10?'text-amber-700':'text-emerald-700',
                    bg:invStats.overallRepairRate>20?'bg-red-50 border-red-200':invStats.overallRepairRate>10?'bg-amber-50 border-amber-200':'bg-emerald-50 border-emerald-200' },
                ].map(s=>(
                  <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <FailureProductTable products={invStats.byProduct} t={t} />
            </>
          )}
        </div>
      )}

      {section==='hashtag' && <HashtagSection t={t} onFilterByTag={onFilterByTag} />}
    </div>
  )
}

export default function RepairTrackingDashboard({ externalLang }: { externalLang?: 'vi' | 'en' }) {
  const internal = useLang()
  const lang  = externalLang ?? internal.lang
  const toggle = internal.toggle
  const t = (vi: string, en: string) => lang === 'vi' ? vi : en
  const PAGE_SIZE = 50
  const [activeTab, setActiveTab]   = useState<'list'|'stats'>('list')
  const [items, setItems]           = useState<RepairItem[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [counts, setCounts]         = useState<StatusCounts>({ cho_gui:0, da_gui:0, da_sua_xong:0, old_device:0, scrap:0, supplier:0 })
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilter]   = useState<string>('')
  const [filterProduct, setFilterP] = useState('')
  const [filterImei, setFilterImei] = useState('')
  const [imeiInput, setImeiInput]   = useState('')
  const [filterTag, setFilterTag]   = useState('')
  const [modal, setModal]           = useState<{ type:'send'|'complete'; item:RepairItem }|null>(null)
  const [exporting, setExporting]   = useState(false)

  const load = useCallback(async()=>{
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus)  params.set('status',filterStatus)
    if (filterProduct) params.set('product',filterProduct)
    if (filterImei)    params.set('imei',filterImei)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))
    const res = await fetch('/api/repair-tracking?'+params.toString())
    const d   = await res.json()
    setItems(d.items??[]); setTotal(d.total??0)
    if (d.statusCounts) setCounts(d.statusCounts)
    setLoading(false)
  },[filterStatus,filterProduct,filterImei,page])

  // Reset page when filters change
  useEffect(()=>{ setPage(0) },[filterStatus,filterProduct,filterImei])
  useEffect(()=>{ load() },[load])

  const displayItems = filterTag
    ? items.filter(i => i.notes?.toLowerCase().includes(`#${filterTag.toLowerCase()}`))
    : items

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (filterImei)    params.set('imei',filterImei)
      if (filterProduct) params.set('product',filterProduct)
      if (filterStatus)  params.set('status',filterStatus)
      const res  = await fetch('/api/repair-tracking/export?'+params.toString())
      if (!res.ok) { alert(t('Lỗi xuất file','Export error')); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href=url; a.download=`repair-history-${new Date().toISOString().split('T')[0]}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  function handleFilterByTag(tag: string) { setFilterTag(tag); setActiveTab('list') }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">{t('Theo dõi sửa chữa','Repair Tracking')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString()} {t('thiết bị','devices')}</p>
        </div>
        {!externalLang && (
          <button onClick={toggle} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
            🌐 {lang === 'vi' ? 'VI | EN' : 'EN | VI'}
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['list', t('📋 Danh sách','📋 List')], ['stats', t('📊 Thống kê','📊 Statistics')]] as const).map(([tab,label])=>(
          <button key={tab} onClick={()=>setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeTab===tab?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab==='list' ? (
        <>
          <SyncCRMPanel onSynced={load} t={t} />
          <StaleDevicesPanel onRefreshed={load} t={t} />
          <StatsBar counts={counts} t={t} />
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1">
              <input value={imeiInput} onChange={e=>setImeiInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') setFilterImei(imeiInput.trim()) }}
                placeholder={t('Tìm mã thiết bị (IMEI)...','Search IMEI...')}
                className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-52 bg-blue-50" />
              <button onClick={()=>setFilterImei(imeiInput.trim())} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">🔍</button>
              {filterImei && <button onClick={()=>{setImeiInput('');setFilterImei('')}} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600">✕</button>}
            </div>
            <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">{t('Tất cả trạng thái','All statuses')}</option>
              <option value="cho_gui">{t('Chờ gửi sửa','Pending Send')}</option>
              <option value="da_gui">{t('Đã gửi sửa','In Repair')}</option>
              <option value="da_sua_xong">{t('Đã sửa xong','Completed')}</option>
            </select>
            <input value={filterProduct} onChange={e=>setFilterP(e.target.value)}
              placeholder={t('Lọc loại thiết bị...','Filter device type...')}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 w-44" />
            <button onClick={load} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">🔄</button>
            <button onClick={handleExport} disabled={exporting}
              className="ml-auto flex items-center gap-2 px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {exporting ? t('Đang xuất...','Exporting...') : `⬇ ${t('Xuất Excel','Export Excel')}`}
            </button>
          </div>
          {(filterImei || filterTag) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {filterImei && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono">🔍 IMEI: {filterImei}</span>}
              {filterTag  && (
                <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  🏷 #{filterTag}
                  <button onClick={()=>setFilterTag('')} className="text-indigo-400 hover:text-indigo-700 ml-0.5">✕</button>
                </span>
              )}
              <span className="text-gray-400">{displayItems.length} {t('kết quả','results')}</span>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">{t('Thiết bị / IMEI','Device / IMEI')}</th>
                    <th className="px-4 py-3">{t('Trạng thái','Status')}</th>
                    <th className="px-4 py-3">{t('Nhận về kho','Received')}</th>
                    <th className="px-4 py-3">{t('Gửi sửa','Sent')}</th>
                    <th className="px-4 py-3">{t('Hoàn thành','Completed')}</th>
                    <th className="px-4 py-3">{t('Kết quả','Result')}</th>
                    <th className="px-4 py-3">{t('Ghi chú / Tags','Notes / Tags')}</th>
                    <th className="px-4 py-3">{t('Thao tác','Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">{t('Đang tải...','Loading...')}</td></tr>
                    : displayItems.length===0
                      ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                          {filterImei ? t(`Không tìm thấy IMEI "${filterImei}"`,`No device with IMEI "${filterImei}"`)
                           : filterTag ? t(`Không có ghi chú chứa #${filterTag}`,`No notes with #${filterTag}`)
                           : t('Chưa có dữ liệu','No data')}
                        </td></tr>
                      : displayItems.map(item=>(
                          <RepairRow key={item.id} item={item} onAction={(i,a)=>setModal({type:a,item:i})} onSynced={load} t={t} />
                        ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-2 py-3">
              <p className="text-xs text-gray-500">
                {t(`Hiển thị ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE, total)} / ${total} thiết bị`,
                   `Showing ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE, total)} of ${total} devices`)}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={()=>setPage(0)} disabled={page===0 || loading}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">«</button>
                <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0 || loading}
                  className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">‹ {t('Trước','Prev')}</button>
                <span className="px-3 py-1 text-xs text-gray-600 font-medium">
                  {t(`Trang ${page+1} / ${Math.ceil(total/PAGE_SIZE)}`, `Page ${page+1} / ${Math.ceil(total/PAGE_SIZE)}`)}
                </span>
                <button onClick={()=>setPage(p=>p+1)} disabled={(page+1)*PAGE_SIZE>=total || loading}
                  className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">{t('Tiếp','Next')} ›</button>
                <button onClick={()=>setPage(Math.ceil(total/PAGE_SIZE)-1)} disabled={(page+1)*PAGE_SIZE>=total || loading}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">»</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <StatsTab t={t} onFilterByTag={handleFilterByTag} active={activeTab==='stats'} />
      )}

      {modal?.type==='send'     && <SendModal    item={modal.item} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load()}} t={t} />}
      {modal?.type==='complete' && <CompleteModal item={modal.item} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load()}} t={t} />}
    </div>
  )
}
