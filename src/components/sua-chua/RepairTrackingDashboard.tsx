'use client'
import { useEffect, useState, useCallback, useRef } from 'react'

// ── Language ──────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────
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
interface DupDevice { imei: string; product_name: string; count: number; last_received: string }
interface DupProductGroup { product_name: string; deviceCount: number; totalRepairs: number; devices: DupDevice[] }
interface StatsData {
  total: number; completed: number; inRepair: number; waiting: number
  oldDevice: number; scrap: number; supplier: number
  uniqueDevices: number; repeatedDeviceCount: number
  completionRate: number; successRate: number; scrapRate: number; supplierRate: number
  duplicatesByProduct: DupProductGroup[]
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

// ── Constants ─────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
}
function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return null
  return Math.round(((new Date(b).getTime()-new Date(a).getTime())/86400000)*10)/10
}
function todayStr()     { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function monthAgoStr()  { const d=new Date(); d.setDate(d.getDate()-30); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// ── Rate Bar ──────────────────────────────────────────────────
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

// ── Sync CRM Panel ────────────────────────────────────────────
function SyncCRMPanel({ onSynced, t }: { onSynced: () => void; t: (vi:string,en:string)=>string }) {
  const [from, setFrom]       = useState(monthAgoStr())
  const [to, setTo]           = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ ok:boolean; total:number; upserted:number; errors?:string[] }|null>(null)
  const [err, setErr]         = useState('')

  async function doSync(payload: object) {
    setLoading(true); setErr(''); setResult(null)
    try {
      const res  = await fetch('/api/repair-tracking/sync-crm', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
      const text = await res.text()
      if (!text) { setErr(`Empty response (HTTP ${res.status})`); return }
      let d: Record<string,unknown>
      try { d = JSON.parse(text) } catch { setErr(`Parse error: ${text.substring(0,120)}`); return }
      if (!res.ok) { setErr((d.error as string)||'Sync error'); return }
      setResult(d as { ok:boolean; total:number; upserted:number; errors?:string[] })
      if (d.ok) onSynced()
    } catch(e) { setErr(String(e)) } finally { setLoading(false) }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => doSync({})} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm">
          {loading ? <><span className="animate-spin">⟳</span> {t('Đang tải...','Loading...')}</> : <>⚡ {t('Sync dữ liệu mới','Sync new data')}</>}
        </button>
        <p className="text-xs text-blue-600">{t('Tự động lấy từ record mới nhất trong DB','Auto-sync from latest DB record')}</p>
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
          <button onClick={() => doSync({ startTime:`${from} 00:00:00`, endTime:`${to} 23:59:59` })} disabled={loading}
            className="px-4 py-1.5 bg-gray-600 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-50">
            🔄 {t('Đồng bộ theo ngày','Sync by date')}
          </button>
        </div>
      </details>
      {err && <p className="text-xs text-red-600">⚠ {err}</p>}
      {result && (
        <div className={`text-sm rounded-lg px-3 py-2 ${result.ok?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {result.ok ? `✅ ${t('Đồng bộ xong','Sync complete')}: ${result.total} records → ${t('thêm mới','new')} ${result.upserted}` : `⚠ ${result.upserted}/${result.total} records`}
          {result.errors && <p className="text-xs mt-1 text-red-600">{result.errors[0]}</p>}
        </div>
      )}
    </div>
  )
}

// ── Modal: Send for repair ────────────────────────────────────
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

// ── Modal: Complete ───────────────────────────────────────────
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
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="#man_hinh #pin_yeu #camera_loi ..."
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

// ── Stats Bar ─────────────────────────────────────────────────
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

// ── Repair Table Row ──────────────────────────────────────────
function RepairRow({ item, onAction, t }: { item:RepairItem; onAction:(item:RepairItem,act:'send'|'complete')=>void; t:(vi:string,en:string)=>string }) {
  const repairDays = daysBetween(item.sent_at, item.completed_at)
  const waitDays   = daysBetween(item.received_at, item.sent_at)
  const statusLabel = t(STATUS_LABEL_VI[item.status], STATUS_LABEL_EN[item.status])

  // Extract hashtags from notes for display
  const tags = item.notes?.match(/#([^\s#,;.!?()[\]{}"']+)/g) ?? []

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
        <p className="text-xs font-mono text-gray-400">{item.imei}</p>
        {item.crm_repair_id && <p className="text-xs text-blue-400">CRM#{item.crm_repair_id}</p>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[item.status]}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        <div>{fmtDate(item.received_at)}</div>
        {item.receiver_name && <div className="text-gray-400">{item.receiver_name}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.sent_at ? (
          <><div>{fmtDate(item.sent_at)}</div>
            {item.sender_name && <div className="text-gray-400">{item.sender_name}</div>}
            {item.repair_warehouse && <div className="text-blue-500">{item.repair_warehouse}</div>}
            {waitDays!==null && <div className="text-amber-500">{waitDays}d {t('chờ','wait')}</div>}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {item.completed_at ? (
          <><div>{fmtDate(item.completed_at)}</div>
            {item.completer_name && <div className="text-gray-400">{item.completer_name}</div>}
            {repairDays!==null && <div className="text-purple-500">{repairDays}d {t('sửa','repair')}</div>}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs">
        {item.finish_reason && (
          <><p className="text-gray-700">{FINISH_REASON_LABEL[item.finish_reason]}</p>
            {item.destination && <p className={`font-medium ${DEST_COLOR[item.destination]}`}>{DEST_LABEL[item.destination]}</p>}
          </>
        )}
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

// ── Hashtag Section ───────────────────────────────────────────
function HashtagSection({ t, onFilterByTag }: { t:(vi:string,en:string)=>string; onFilterByTag:(tag:string)=>void }) {
  const [data, setData]       = useState<{ tags: HashtagEntry[]; totalWithNotes: number }|null>(null)
  const [loading, setLoading] = useState(true)
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
  const selectedEntry = selected ? data.tags.find(t=>t.tag===selected) : null

  return (
    <div className="space-y-4">
      <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">🏷 {t('Phân tích lỗi theo hashtag','Error Analysis by Hashtag')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.tags.length} {t('loại lỗi','error types')} · {data.totalWithNotes.toLocaleString()} {t('thiết bị có ghi chú','records with notes')}
          </p>
        </div>

        {/* Tag cloud */}
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {data.tags.map(entry => {
              const size = 0.75 + (entry.count / maxCount) * 0.5
              const isActive = selected === entry.tag
              return (
                <button key={entry.tag}
                  onClick={() => { setSelected(isActive ? null : entry.tag) }}
                  style={{ fontSize: `${size}rem` }}
                  className={`px-2 py-0.5 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  }`}>
                  #{entry.tag}
                  <span className="ml-1 text-xs opacity-70">{entry.count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected tag detail */}
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

      {/* Top hashtags bar chart */}
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

// ── Failure Product Table ─────────────────────────────────────
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
            <p className="text-xs text-gray-400 mt-0.5">{t('Chỉ tính thiết bị có trong kho CRM','Only devices tracked in CRM inventory')} · {t('hiển thị','showing')} {filtered.length}/{products.length} {t('loại','types')}</p>
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
                <tr key={p.product_name} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isHidden?'opacity-40':''}`}>
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
                    <button onClick={()=>toggleHide(p.product_name)} title={isHidden?t('Bỏ ẩn','Show'):t('Ẩn','Hide')} className="text-gray-300 hover:text-gray-500 transition-colors text-base leading-none">
                      {isHidden?'👁':'✕'}
                    </button>
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

// ── Inventory Sync Panel ──────────────────────────────────────
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
        const text = await res.text()
