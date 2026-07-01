'use client'
import { useEffect, useState, useCallback, useRef } from 'react'

type Lang = 'vi' | 'en'
function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem('repair_lang') as Lang) || 'vi' } catch { return 'vi' }
  })
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
  uniqueDevices: number; repeatedDeviceCount: number
  completionRate: number; successRate: number; scrapRate: number; supplierRate: number
  duplicatesByProduct: DupProductGroup[]
  allRepeatedDevices: DupDevice[]
  byProduct: { product_name: string; total: number; completed: number; oldDevice: number; scrap: number; supplier: number; inRepair: number; waiting: number; successRate: number; scrapRate: number; supplierRate: number }[]
  byWarehouse: { warehouse: string; total: number; completed: number; scrap: number; supplier: number }[]
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
  const [loading, setLoading] = useState<false | 'new' | 'stale' | 'date'>(false)
  const [result, setResult]   = useState<SyncResult | null>(null)
  const [err, setErr]         = useState('')

  async function doSync(payload: object, kind: 'new' | 'stale' | 'date') {
    setLoading(kind); setErr(''); setResult(null)
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
        <button onClick={() => doSync({ mode: 'refresh_in_repair' }, 'stale')} disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm rounded-xl hover:bg-amber-600 disabled:opacity-50 shadow-sm">
          {loading === 'stale' ? <><span className="animate-spin inline-block">⟳</span> {t('Đang cập nhật...','Updating...')}</> : <>🔄 {t('Cập nhật thiết bị >7 ngày','Refresh stale >7d')}</>}
        </button>
        <p className="text-xs text-blue-500">{t('Sync mới: 14 ngày gần nhất • Cập nhật: thiết bị chờ/sửa quá 7 ngày','New: last 14 days • Refresh: stale devices >7 days')}</p>
      </div>
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
                      <tr key={item.id} className="border-b border-amber-50 hover:bg-amber-50">
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
                            onClick={() => refreshImeis([item.imei], item.imei)}
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

function RepairRow({ item, onAction, t }: { item:RepairItem; onAction:(item:RepairItem,act:'send'|'complete')=>void; t:(vi:string,en:string)=>string }) {
  const repairDays = daysBetween(item.sent_at, item.completed_at)
  const waitDays   = daysBetween(item.received_at, item.sent_at)
  const statusLabel = t(STATUS_LABEL_VI[item.status], STATUS_LABEL_EN[item.status])
  const tags = item.notes?.match(/#([^\s#,;.!?()[\]{}"']+)/g) ?? []
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
        <p className="text-xs font-mono text-gray-400">{item.imei}</p>
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
        {item.status==='cho_gui' && <button onClick={()=>onAction(item,'send')} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 whitespace-nowrap">{t('Gửi sửa','Send')}</button>}
        {item.status==='da_gui'  && <button onClick={()=>onAction(item,'complete')} className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap">{t('Nhận về','Return')}</button>}
      </td>
    </tr>
  )
}

function HashtagSection({ t, onFilterByTag }: { t:(vi:string,en:string)=>string; onFilterByTag:(tag:string)=>void }) {
  const [data, setData]         = useState<{ tags: HashtagEntry[]; totalWithNotes: number }|null>(null)
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<string|null>(null)

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

  return (
    <div className="space-y-4">
      <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">🏷 {t('Phân tích lỗi theo hashtag','Error Analysis by Hashtag')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.tags.length} {t('loại lỗi','error types')} · {data.totalWithNotes.toLocaleString()} {t('thiết bị có ghi chú','records with notes')}
          </p>
        </div>
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
      </div>
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
    </div>
  )
}

function FailureProductTable({ products, t }: { products: InventoryStats['byProduct']; t:(vi:string,en:string)=>string }) {
  const [search, setSearch]       = useState('')
  const [minImport, setMinImport] = useState(0)
  const [hidden, setHidden]       = useState<Set<string>>(() => {
    try { const s=localStorage.getItem(HIDDEN_KEY); return s?new Set(JSON.parse(s)):new Set() } catch { return new Set() }
  })
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
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mb-2">
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

function InventorySyncPanel({ t, onDone }: { t:(vi:string,en:string)=>string; onDone:()=>void }) {
  const [syncing, setSyncing]   = useState(false)
  const [syncLog, setSyncLog]   = useState<string[]>([])
  const [syncDone, setSyncDone] = useState(false)
  const abortRef = useRef(false)

  async function startSync() {
    setSyncing(true); setSyncDone(false); setSyncLog([]); abortRef.current = false
    let fromDate: string|null = null; let finalDone = false
    while (true) {
      if (abortRef.current) { setSyncLog(p=>[...p,'⛔ '+t('Đã dừng','Stopped')]); break }
      try {
        const body: Record<string,string> = {}
        if (fromDate) body.fromDate = fromDate
        const res  = await fetch('/api/device-inventory/sync-crm', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        const txt = await res.text()
        let d: Record<string,unknown>
        try { d=JSON.parse(txt) } catch { setSyncLog(p=>[...p,`❌ ${txt.substring(0,80)}`]); break }
        if (!res.ok||d.error) { setSyncLog(p=>[...p,`❌ ${d.error}`]); break }
        if (d.done&&!d.month) { setSyncLog(p=>[...p,`✅ ${d.message}`]); finalDone=true; break }
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

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-800">{t('Sync kho thiết bị từ CRM','Sync Device Inventory from CRM')}</p>
          <p className="text-xs text-indigo-600 mt-0.5">{t('Tự động tải từng tháng từ 01/2024 → hiện tại','Auto-load month by month from 01/2024 → present')}</p>
        </div>
        <div className="flex gap-2">
          {syncing
            ? <button onClick={()=>{abortRef.current=true}} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">⛔ {t('Dừng','Stop')}</button>
            : <button onClick={startSync} className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">🔄 {syncDone?t('Sync lại','Re-sync'):t('Bắt đầu Sync','Start Sync')}</button>}
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

function StatsTab({ t, onFilterByTag }: { t:(vi:string,en:string)=>string; onFilterByTag:(tag:string)=>void }) {
  const [section, setSection] = useState<'repair'|'failure'|'hashtag'>('repair')
  const [stats, setStats]     = useState<StatsData|null>(null)
  const [loadingS, setLoadingS] = useState(true)
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const loadStats = useCallback(async()=>{
    setLoadingS(true)
    const params = new URLSearchParams()
    if (from) params.set('from',from)
    if (to)   params.set('to',to)
    const res = await fetch('/api/repair-tracking/stats?'+params.toString())
    const d   = await res.json()
    setStats(d); setLoadingS(false)
  },[from,to])
  useEffect(()=>{loadStats()},[loadStats])

  const [invStats, setInvStats]   = useState<InventoryStats|null>(null)
  const [loadingI, setLoadingI]   = useState(true)
  const [invErr, setInvErr]       = useState('')
  const [invLoaded, setInvLoaded] = useState(false)

  async function loadInv() {
    setLoadingI(true); setInvErr('')
    try {
      const res  = await fetch('/api/device-inventory/stats')
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
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">{t(`Tỉ lệ kết quả (${stats.completed} hoàn thành)`,`Result rates (${stats.completed} completed)`)}</h3>
              <div className="space-y-3">
                {[
                  { label:`✅ ${t('Sửa thành công (Old Device)','Repaired (Old Device)')}`, count:stats.oldDevice, rate:stats.successRate, color:'bg-emerald-500', tc:'text-emerald-600' },
                  { label:`🗑 ${t('Báo phế (Scrap)','Scrapped')}`, count:stats.scrap, rate:stats.scrapRate, color:'bg-red-400', tc:'text-red-600' },
                  { label:`🏭 ${t('Gửi bảo hành (Supplier)','Sent to Supplier')}`, count:stats.supplier, rate:stats.supplierRate, color:'bg-purple-400', tc:'text-purple-600' },
                ].map(r=>(
                  <div key={r.label}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{r.label}</span><span className={`font-medium ${r.tc}`}>{r.count} {t('thiết bị','devices')}</span>
                    </div>
                    <RateBar rate={r.rate} color={r.color} />
                  </div>
                ))}
              </div>
            </div>
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
                    <th className="px-4 py-2 text-left">{t('Loại thiết bị','Device Type')}</th>
                    <th className="px-4 py-2 text-right">{t('Tổng','Total')}</th>
                    <th className="px-4 py-2 text-right">{t('Đang sửa','In Repair')}</th>
                    <th className="px-4 py-2 text-right">Old Device</th>
                    <th className="px-4 py-2 text-right">Scrap</th>
                    <th className="px-4 py-2 text-right">Supplier</th>
                    <th className="px-4 py-2 text-left w-40">{t('Tỉ lệ thành công','Success rate')}</th>
                  </tr></thead>
                  <tbody>
                    {stats.byProduct.map(p=>(
                      <tr key={p.product_name} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700">{p.product_name}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{p.total}</td>
                        <td className="px-4 py-2 text-right text-blue-600">{p.inRepair}</td>
                        <td className="px-4 py-2 text-right text-emerald-600">{p.oldDevice}</td>
                        <td className="px-4 py-2 text-right text-red-500">{p.scrap}</td>
                        <td className="px-4 py-2 text-right text-purple-600">{p.supplier}</td>
                        <td className="px-4 py-2"><RateBar rate={p.successRate} color="bg-emerald-500" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {section==='failure' && (
        <div className="space-y-5">
          <InventorySyncPanel t={t} onDone={loadInv} />
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
  const [activeTab, setActiveTab]   = useState<'list'|'stats'>('list')
  const [items, setItems]           = useState<RepairItem[]>([])
  const [total, setTotal]           = useState(0)
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
    params.set('limit','200')
    const res = await fetch('/api/repair-tracking?'+params.toString())
    const d   = await res.json()
    setItems(d.items??[]); setTotal(d.total??0)
    if (d.statusCounts) setCounts(d.statusCounts)
    setLoading(false)
  },[filterStatus,filterProduct,filterImei])

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
                          <RepairRow key={item.id} item={item} onAction={(i,a)=>setModal({type:a,item:i})} t={t} />
                        ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <StatsTab t={t} onFilterByTag={handleFilterByTag} />
      )}

      {modal?.type==='send'     && <SendModal    item={modal.item} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load()}} t={t} />}
      {modal?.type==='complete' && <CompleteModal item={modal.item} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load()}} t={t} />}
    </div>
  )
}
