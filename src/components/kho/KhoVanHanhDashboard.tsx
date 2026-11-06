'use client'

import { useState, useRef, useCallback } from 'react'

type TabId = 'thu-hoi' | 'the-rfid' | 'sim-card' | 'tra-cuu' | 'ton-kho' | 'gui-sc' | 'bao-cao'

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseList(raw: string): string[] {
  return raw.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean)
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}>
      {ok ? '✓' : '✗'} {label ?? (ok ? 'OK' : 'Lỗi')}
    </span>
  )
}

function Cell({ v }: { v: unknown }) {
  const s = v == null || v === '' ? '—' : String(v)
  return <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{s}</td>
}

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS: { id: TabId; icon: string; label: string; write: boolean; desc: string }[] = [
  { id: 'tra-cuu',  icon: '🔍', label: 'Tra cứu TB',    write: false, desc: 'GetStockupDetail (kind 0→2→3) + GetCarList — xem kho, trạng thái, SIM, thẻ nhớ' },
  { id: 'ton-kho',  icon: '📦', label: 'Tồn kho',       write: false, desc: 'GetStockupList — xem tồn kho theo kho (Wait/Use/NotUse) theo mã sản phẩm' },
  { id: 'bao-cao',  icon: '📊', label: 'Báo cáo tháng', write: false, desc: 'Tổng hợp tồn kho 3 kho (Admin/Old Device/Repair) theo nhóm kho — xuất Excel' },
  { id: 'sim-card', icon: '📱', label: 'Báo cáo SIM',   write: false, desc: 'GetSimCard — tra cứu nhà mạng, SĐT, gói data theo barcode SIM' },
  { id: 'thu-hoi',  icon: '🔄', label: 'Thu hồi TB',    write: true,  desc: 'UpdateBackFactory (TransStock=303) — thu hồi hàng loạt về kho KT [Chỉ Admin]' },
  { id: 'the-rfid', icon: '📡', label: 'Gửi thẻ RFID',  write: true,  desc: 'TransferWareHouse (WH=267) — chuyển thẻ quẹt vào kho [Chỉ Admin]' },
  { id: 'gui-sc',   icon: '🔧', label: 'Gửi đi SC',     write: true,  desc: 'GetDeviceRepair → UpdateDeviceRepair (WH=3, Repairing) — gửi hàng loạt đi sửa [Chỉ Admin]' },
]

// ── Types cho báo cáo ─────────────────────────────────────────────────────────
type WareHouseItem = {
  WH_ID: number
  WH_Name: string
  WH_WHCID: number
  WHC_Name: string
  WHC_FreeMovable?: boolean
  WH_Sort?: number
}

type KhoGroup = { whcId: string; label: string }

type ReportData = {
  products: string[]
  productNames: Record<string, string>
  khoList: KhoGroup[]
  data: Record<string, Record<string, { name: string; wait: number; use: number; notUse: number }>>
}

// ── BáoCáo Tab Component ──────────────────────────────────────────────────────
function BaoCaoTab() {
  const [step, setStep] = useState<'load' | 'select' | 'report'>('load')
  const [loading, setLoading] = useState(false)
  const [warehouses, setWarehouses] = useState<WareHouseItem[]>([])
  // 3 slots: Admin, Old Device, Repair — user assigns WH_WHCID groups
  const [slots, setSlots] = useState<{ label: string; whcIds: Set<number> }[]>([
    { label: 'Kho Admin',      whcIds: new Set() },
    { label: 'Kho Old Device', whcIds: new Set() },
    { label: 'Kho Repair',     whcIds: new Set() },
  ])
  const [report, setReport] = useState<ReportData | null>(null)
  const [reportError, setReportError] = useState('')

  // Nhóm warehouses theo WH_WHCID
  const groups = warehouses.reduce<Record<number, { name: string; whs: WareHouseItem[] }>>((acc, wh) => {
    if (!acc[wh.WH_WHCID]) acc[wh.WH_WHCID] = { name: wh.WHC_Name || `Nhóm ${wh.WH_WHCID}`, whs: [] }
    acc[wh.WH_WHCID].whs.push(wh)
    return acc
  }, {})

  async function loadWarehouses() {
    setLoading(true)
    try {
      const r = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ds-kho' }),
      })
      const json = await r.json()
      if (!json.ok || !Array.isArray(json.warehouses)) {
        alert('Không tải được danh sách kho: ' + (json.error ?? ''))
      } else {
        setWarehouses(json.warehouses as WareHouseItem[])
        setStep('select')
      }
    } catch (e) { alert(String(e)) }
    setLoading(false)
  }

  function toggleSlotWhcId(slotIdx: number, whcId: number) {
    setSlots(prev => prev.map((s, i) => {
      if (i !== slotIdx) return s
      const next = new Set(s.whcIds)
      if (next.has(whcId)) next.delete(whcId); else next.add(whcId)
      return { ...s, whcIds: next }
    }))
  }

  async function runReport() {
    // Build khoList from slots
    const khoList: KhoGroup[] = slots
      .filter(s => s.whcIds.size > 0)
      .flatMap(s =>
        Array.from(s.whcIds).map(id => ({ whcId: String(id), label: s.label }))
      )

    // Merge multiple whcIds into single group per slot
    const mergedKhoList: KhoGroup[] = slots
      .filter(s => s.whcIds.size > 0)
      .map(s => ({
        label: s.label,
        whcId: Array.from(s.whcIds).join(','), // comma-separated for display only
      }))

    // Need to call API once per whcId, then merge by label
    const perWhcId = slots
      .filter(s => s.whcIds.size > 0)
      .flatMap(s => Array.from(s.whcIds).map(id => ({ whcId: String(id), label: s.label })))

    if (!perWhcId.length) { alert('Chọn ít nhất 1 nhóm kho cho mỗi slot'); return }

    setLoading(true); setReport(null); setReportError('')
    try {
      const r = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ton-kho-bao-cao', khoList: perWhcId }),
      })
      const json = await r.json()
      if (!json.ok) {
        setReportError(json.error ?? 'Lỗi không xác định')
      } else {
        // Merge data by label (combine multiple whcIds into same slot label)
        const merged: ReportData['data'] = {}
        const labelOrder: string[] = []
        for (const kho of perWhcId) {
          if (!labelOrder.includes(kho.label)) labelOrder.push(kho.label)
          if (!merged[kho.label]) merged[kho.label] = {}
          const src = (json.data as ReportData['data'])[kho.whcId] ?? {}
          for (const [code, v] of Object.entries(src)) {
            if (!merged[kho.label][code]) merged[kho.label][code] = { name: v.name, wait: 0, use: 0, notUse: 0 }
            merged[kho.label][code].wait    += v.wait
            merged[kho.label][code].use     += v.use
            merged[kho.label][code].notUse  += v.notUse
          }
        }
        setReport({
          products: json.products as string[],
          productNames: json.productNames as Record<string, string>,
          khoList: labelOrder.map(l => ({ whcId: l, label: l })),
          data: merged,
        })
        setStep('report')
      }
    } catch (e) { setReportError(String(e)) }
    setLoading(false)
  }

  async function exportExcel(r: ReportData) {
    const { utils, writeFile } = await import('xlsx')
    const khos = r.khoList.map(k => k.label)

    // Header row
    const header = ['Mã SP', 'Tên sản phẩm', ...khos.flatMap(k => [`${k} - Chờ`, `${k} - Dùng được`, `${k} - Hỏng`, `${k} - Tổng`])]
    const rows: (string | number)[][] = [header]

    for (const code of r.products) {
      const name = r.productNames[code] ?? code
      const cells: (string | number)[] = [code, name]
      let hasData = false
      for (const kho of khos) {
        const v = r.data[kho]?.[code] ?? { wait: 0, use: 0, notUse: 0 }
        const total = v.wait + v.use + v.notUse
        if (total > 0) hasData = true
        cells.push(v.wait, v.use, v.notUse, total)
      }
      if (hasData) rows.push(cells)
    }

    // Totals row
    const totalRow: (string | number)[] = ['', 'TỔNG CỘNG']
    for (const kho of khos) {
      const wait = r.products.reduce((s, c) => s + (r.data[kho]?.[c]?.wait ?? 0), 0)
      const use  = r.products.reduce((s, c) => s + (r.data[kho]?.[c]?.use  ?? 0), 0)
      const notUse = r.products.reduce((s, c) => s + (r.data[kho]?.[c]?.notUse ?? 0), 0)
      totalRow.push(wait, use, notUse, wait + use + notUse)
    }
    rows.push(totalRow)

    const ws = utils.aoa_to_sheet(rows)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Tồn kho')
    const now = new Date()
    const fname = `BaoCaoTonKho_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}.xlsx`
    writeFile(wb, fname)
  }

  // ── STEP: LOAD ────────────────────────────────────────────────────────────
  if (step === 'load') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Báo cáo tồn kho cuối tháng</h2>
        <p className="text-sm text-gray-500 mb-6">
          Tổng hợp số liệu từ CRM cho 3 kho: <strong>Admin, Old Device, Repair</strong><br/>
          Gộp cả 3 loại stockup (-1 thành phẩm, 0 IMEI, 2 phụ kiện)
        </p>
        <button onClick={loadWarehouses} disabled={loading}
          className="px-6 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
          style={{ background: '#A70A0A' }}>
          {loading ? '⏳ Đang tải...' : '🏭 Tải danh sách kho'}
        </button>
      </div>
    )
  }

  // ── STEP: SELECT ─────────────────────────────────────────────────────────
  if (step === 'select') {
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))

    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          <strong>Bước 2:</strong> Phân loại từng nhóm kho CRM vào 3 slot báo cáo. Mỗi slot có thể gộp nhiều nhóm.
        </div>

        {/* 3 slots */}
        {slots.map((slot, si) => (
          <div key={si} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-3 h-3 rounded-full ${si === 0 ? 'bg-blue-500' : si === 1 ? 'bg-amber-500' : 'bg-red-500'}`}/>
              <span className="font-semibold text-gray-800">{slot.label}</span>
              {slot.whcIds.size > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {slot.whcIds.size} nhóm đã chọn
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {sortedGroups.map(([whcIdStr, grp]) => {
                const whcId = Number(whcIdStr)
                const selected = slot.whcIds.has(whcId)
                return (
                  <button key={whcId}
                    onClick={() => toggleSlotWhcId(si, whcId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {grp.name} <span className="opacity-60">(ID:{whcId}, {grp.whs.length} kho)</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Preview: total selected */}
        <div className="flex gap-3 items-center">
          <button onClick={runReport}
            disabled={loading || slots.every(s => s.whcIds.size === 0)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
            style={{ background: '#A70A0A' }}>
            {loading ? '⏳ Đang lấy dữ liệu CRM...' : '📊 Chạy báo cáo'}
          </button>
          <button onClick={() => setStep('load')}
            className="px-4 py-2.5 rounded-xl text-gray-600 text-sm border border-gray-200 hover:bg-gray-50">
            ← Quay lại
          </button>
        </div>

        {reportError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">❌ {reportError}</div>
        )}
      </div>
    )
  }

  // ── STEP: REPORT ──────────────────────────────────────────────────────────
  if (step === 'report' && report) {
    const khos = report.khoList.map(k => k.label)
    // Filter products that have at least some data
    const activeProducts = report.products.filter(code =>
      khos.some(kho => {
        const v = report.data[kho]?.[code]
        return v && (v.wait + v.use + v.notUse) > 0
      })
    )

    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setStep('select')}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 text-gray-600">
              ← Điều chỉnh kho
            </button>
            <span className="text-sm text-gray-500">{activeProducts.length} sản phẩm, {khos.length} kho</span>
          </div>
          <button onClick={() => exportExcel(report)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ background: '#217346' }}>
            📥 Xuất Excel
          </button>
        </div>

        {/* Report table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="text-xs border-collapse w-full">
            {/* Header */}
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-left whitespace-nowrap" rowSpan={2}>Mã SP</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-left whitespace-nowrap" rowSpan={2}>Tên sản phẩm</th>
                {khos.map((kho, ki) => (
                  <th key={ki} colSpan={4} className={`px-3 py-2 font-semibold text-center border-l border-gray-200 ${
                    ki === 0 ? 'text-blue-700' : ki === 1 ? 'text-amber-700' : 'text-red-700'
                  }`}>{kho}</th>
                ))}
                <th className="px-3 py-2 font-semibold text-gray-700 text-center border-l border-gray-200" rowSpan={2}>Tổng<br/>toàn bộ</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                {khos.map((_, ki) => (
                  ['Chờ', 'Dùng được', 'Hỏng', 'Tổng'].map(col => (
                    <th key={`${ki}-${col}`} className={`px-2 py-1 font-medium text-gray-500 text-center border-l border-gray-100 ${col === 'Tổng' ? 'font-semibold text-gray-700' : ''}`}>
                      {col}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {activeProducts.map((code, ri) => {
                let grandTotal = 0
                return (
                  <tr key={code} className={`border-b border-gray-100 ${ri % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
                    <td className="px-3 py-2 font-mono text-gray-600">{code}</td>
                    <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{report.productNames[code] || code}</td>
                    {khos.map((kho, ki) => {
                      const v = report.data[kho]?.[code] ?? { wait: 0, use: 0, notUse: 0 }
                      const total = v.wait + v.use + v.notUse
                      grandTotal += total
                      return (
                        <>
                          <td key={`${ki}-w`} className={`px-2 py-2 text-center border-l border-gray-100 ${v.wait > 0 ? 'text-amber-700 font-semibold' : 'text-gray-300'}`}>{v.wait || '—'}</td>
                          <td key={`${ki}-u`} className={`px-2 py-2 text-center ${v.use > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-300'}`}>{v.use || '—'}</td>
                          <td key={`${ki}-n`} className={`px-2 py-2 text-center ${v.notUse > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>{v.notUse || '—'}</td>
                          <td key={`${ki}-t`} className={`px-2 py-2 text-center font-bold border-r border-gray-100 ${total > 0 ? 'text-gray-800' : 'text-gray-200'}`}>{total || '—'}</td>
                        </>
                      )
                    })}
                    <td className="px-3 py-2 text-center font-bold text-gray-900 border-l border-gray-200">{grandTotal || '—'}</td>
                  </tr>
                )
              })}
              {/* Totals */}
              <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                <td className="px-3 py-2 text-gray-800" colSpan={2}>TỔNG CỘNG</td>
                {(() => {
                  let grandTotal = 0
                  return khos.map((kho, ki) => {
                    const wait    = activeProducts.reduce((s, c) => s + (report.data[kho]?.[c]?.wait    ?? 0), 0)
                    const use     = activeProducts.reduce((s, c) => s + (report.data[kho]?.[c]?.use     ?? 0), 0)
                    const notUse  = activeProducts.reduce((s, c) => s + (report.data[kho]?.[c]?.notUse  ?? 0), 0)
                    const total   = wait + use + notUse
                    grandTotal += total
                    return (
                      <>
                        <td key={`tot-${ki}-w`} className="px-2 py-2 text-center text-amber-800 border-l border-gray-200">{wait}</td>
                        <td key={`tot-${ki}-u`} className="px-2 py-2 text-center text-emerald-800">{use}</td>
                        <td key={`tot-${ki}-n`} className="px-2 py-2 text-center text-red-800">{notUse}</td>
                        <td key={`tot-${ki}-t`} className="px-2 py-2 text-center text-gray-900 border-r border-gray-200">{total}</td>
                        {ki === khos.length - 1 && (
                          <td className="px-3 py-2 text-center text-gray-900 border-l border-gray-200">{grandTotal}</td>
                        )}
                      </>
                    )
                  })
                })()}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return null
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function KhoVanHanhDashboard() {
  const [tab, setTab]           = useState<TabId>('tra-cuu')
  const [imeiText, setImeiText] = useState('')
  const [whText, setWhText]     = useState('')
  const [stockupKind, setStockupKind] = useState('')
  const [loading, setLoading]   = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult]     = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentTab  = TABS.find(t => t.id === tab)!
  const isTonKho    = tab === 'ton-kho'
  const isBaoCao    = tab === 'bao-cao'
  const listText    = isTonKho ? whText : imeiText
  const setListText = isTonKho ? setWhText : setImeiText
  const listCount   = parseList(listText).length

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { read, utils } = await import('xlsx')
      const wb = read(await file.arrayBuffer())
      const rows = utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][]
      const vals = rows.map(r => String(r[0] ?? '').trim()).filter(v => v.length >= 3)
      setListText(prev => {
        const existing = parseList(prev)
        return [...new Set([...existing, ...vals])].join('\n')
      })
    } catch { alert('Không đọc được file. Hãy dùng .xlsx hoặc .xls') }
    if (fileRef.current) fileRef.current.value = ''
  }, [setListText])

  async function handleRun() {
    const list = parseList(listText)
    if (!list.length) { alert(`Nhập ít nhất 1 ${isTonKho ? 'Warehouse ID' : 'IMEI/barcode'}`); return }
    if (list.length > 200) { alert('Tối đa 200 mã mỗi lần'); return }

    setLoading(true); setResult(null)
    try {
      const payload: Record<string, unknown> = { action: tab }
      if (isTonKho) {
        payload.warehouseIds = list
        if (stockupKind !== '') payload.stockupKind = stockupKind
      } else {
        payload.imeis = list
      }
      const resp = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setResult(await resp.json())
    } catch (e) { setResult({ ok: false, error: String(e) }) }
    setLoading(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderResults(r: any) {
    if (!r) return null
    if (!r.ok || r.error) {
      return <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">❌ {r.error}</div>
    }

    const rows = r.results ?? []

    const summary = r.success !== undefined ? (
      <div className="mb-3 flex gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✓ Thành công: {r.success}</span>
        {r.fail > 0 && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">✗ Lỗi: {r.fail}</span>}
      </div>
    ) : null

    if (tab === 'tra-cuu') {
      return (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
              {['IMEI', 'Tên thiết bị', 'Kho hiện tại', 'Trạng thái', 'Cập nhật', 'Người CN', 'SIM barcode', 'Thẻ nhớ/HDD', 'Loại thẻ', ''].map(h =>
                <th key={h} className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap text-xs">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {rows.map((row: Record<string, unknown>, i: number) => (
                <tr key={i} className={`border-b border-gray-100 ${row.ok ? 'hover:bg-gray-50' : 'bg-red-50'}`}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-800">{String(row.imei)}</td>
                  <Cell v={row.productName} /><Cell v={row.sourceStock} /><Cell v={row.status} />
                  <Cell v={row.updateTime} /><Cell v={row.updateMan} />
                  <td className="px-3 py-2 text-xs font-mono text-blue-700">{String(row.simBarcode ?? '—')}</td>
                  <td className="px-3 py-2 text-xs font-mono text-purple-700">{String(row.hddBarcode ?? '—')}</td>
                  <Cell v={row.hddTypeName} />
                  <td className="px-3 py-2">
                    {row.ok ? <StatusBadge ok /> : <span className="text-xs text-red-500">{String(row.error ?? '')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (tab === 'ton-kho') {
      return (
        <div className="mt-4 space-y-4">
          {rows.map((wh: Record<string, unknown>, i: number) => (
            <div key={i} className={`rounded-xl border p-4 ${wh.ok ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="font-bold text-gray-800">📦 {String(wh.whName ?? wh.whId)}</span>
                <span className="text-xs text-gray-400">ID: {String(wh.whId)}</span>
                {wh.ok && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{(wh.products as unknown[])?.length ?? 0} loại SP</span>}
                <StatusBadge ok={!!wh.ok} />
              </div>
              {wh.ok && Array.isArray(wh.products) && wh.products.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="bg-gray-50 border-b text-left">
                      {['Mã SP', 'Tên', 'Chờ (Wait)', 'Dùng được (Use)', 'Hỏng (NotUse)'].map(h =>
                        <th key={h} className="px-3 py-1.5 font-semibold text-gray-600">{h}</th>
                      )}
                    </tr></thead>
                    <tbody>
                      {(wh.products as Record<string, unknown>[]).map((p: Record<string, unknown>, j: number) => (
                        <tr key={j} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono text-gray-700">{String(p.code)}</td>
                          <td className="px-3 py-1.5 text-gray-700">{String(p.productName || '—')}</td>
                          <td className="px-3 py-1.5 text-amber-700 font-semibold">{String(p.wait ?? 0)}</td>
                          <td className="px-3 py-1.5 text-emerald-700 font-semibold">{String(p.use ?? 0)}</td>
                          <td className="px-3 py-1.5 text-red-700 font-semibold">{String(p.notUse ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !wh.ok ? (
                <p className="text-sm text-red-600">{String(wh.error ?? 'Lỗi không xác định')}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">Không có dữ liệu</p>
              )}
            </div>
          ))}
        </div>
      )
    }

    if (tab === 'sim-card') {
      return (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
              {['IMEI/Barcode', 'SĐT', 'Nhà mạng', 'Loại SIM', 'Trạng thái', 'Gói data', ''].map(h =>
                <th key={h} className="px-3 py-2.5 font-semibold text-gray-600 text-xs">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {rows.map((row: Record<string, unknown>, i: number) => (
                <tr key={i} className={`border-b border-gray-100 ${row.ok ? 'hover:bg-gray-50' : 'bg-red-50'}`}>
                  <td className="px-3 py-2 font-mono text-xs">{String(row.imei)}</td>
                  <Cell v={row.phone} /><Cell v={row.carrier} /><Cell v={row.simKind} />
                  <Cell v={row.simStatus} /><Cell v={row.dataPackage} />
                  <td className="px-3 py-2">
                    {row.ok ? <StatusBadge ok /> : <span className="text-xs text-red-500">{String(row.error ?? '')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (tab === 'thu-hoi' || tab === 'the-rfid') {
      return (
        <div className="mt-4">
          {summary}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-xs">IMEI / Barcode</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-xs">{tab === 'thu-hoi' ? 'Trạng thái CRM' : 'Update Result'}</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-xs">Kết quả</th>
              </tr></thead>
              <tbody>
                {rows.map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} className={`border-b border-gray-100 ${row.ok ? 'hover:bg-gray-50' : 'bg-red-50'}`}>
                    <td className="px-3 py-2 font-mono text-xs">{String(row.imei)}</td>
                    <td className="px-3 py-2 text-sm">{String(row.status ?? row.updateResult ?? '—')}</td>
                    <td className="px-3 py-2">
                      {row.ok ? <StatusBadge ok /> : <span className="text-xs text-red-500">{String(row.error ?? '')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (tab === 'gui-sc') {
      return (
        <div className="mt-4">
          {summary}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
                {['IMEI', 'Repair ID', 'Device ID', 'Update Result', 'Kết quả'].map(h =>
                  <th key={h} className="px-3 py-2.5 font-semibold text-gray-600 text-xs">{h}</th>
                )}
              </tr></thead>
              <tbody>
                {rows.map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} className={`border-b border-gray-100 ${row.ok ? 'hover:bg-gray-50' : 'bg-red-50'}`}>
                    <td className="px-3 py-2 font-mono text-xs">{String(row.imei)}</td>
                    <Cell v={row.repairId} /><Cell v={row.deviceId} /><Cell v={row.updateResult} />
                    <td className="px-3 py-2">
                      {row.ok ? <StatusBadge ok /> : <span className="text-xs text-red-500">{String(row.error ?? '')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-800">🏭 Vận hành Kho</h1>
        <p className="text-sm text-gray-500 mt-0.5">Thao tác hàng loạt: tra cứu, tồn kho, thu hồi, chuyển thẻ, gửi SC</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Tabs */}
        <div className="flex gap-1.5 flex-wrap mb-5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setResult(null) }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                tab === t.id
                  ? 'text-white border-transparent shadow'
                  : t.write
                    ? 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              style={tab === t.id ? { background: t.write ? '#b45309' : '#A70A0A' } : {}}
            >
              {t.icon} {t.label}
              {t.write && tab !== t.id && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 font-bold">Admin</span>}
            </button>
          ))}
        </div>

        {/* Tab description */}
        <div className={`mb-4 text-sm rounded-xl px-4 py-2.5 border ${currentTab.write ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-500'}`}>
          {currentTab.write && <span className="font-bold text-amber-700">⚠ Write operation — </span>}
          <span className="font-semibold text-gray-700">{currentTab.icon} {currentTab.label}:</span> {currentTab.desc}
        </div>

        {/* Báo cáo tháng — tách riêng component */}
        {isBaoCao ? (
          <BaoCaoTab />
        ) : (
          <>
            {/* Input panel */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-700">
                  {isTonKho ? 'Danh sách Warehouse ID' : 'Danh sách IMEI / Barcode'}
                  {listCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{listCount} mục</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">
                    📂 Upload Excel
                  </button>
                  {listText && <button onClick={() => { setListText(''); setResult(null) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200">
                    Xóa
                  </button>}
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              <textarea
                value={listText}
                onChange={e => setListText(e.target.value)}
                placeholder={isTonKho
                  ? 'Nhập Warehouse ID, mỗi dòng 1 ID\nVD:\n10001\n10002\n10003'
                  : 'Paste danh sách IMEI vào đây, mỗi dòng 1 mã\nVD:\n003200BE04\n003200BE05'}
                rows={6}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none resize-y"
                onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.08)' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
              />

              {isTonKho && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs font-semibold text-gray-600">Loại kho:</label>
                  {[['', 'Tất cả'], ['-1', 'Loại -1'], ['0', 'Loại 0'], ['2', 'Loại 2']].map(([val, lbl]) => (
                    <button key={val}
                      onClick={() => setStockupKind(val)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                        stockupKind === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button onClick={handleRun} disabled={loading || !listText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                  style={{ background: currentTab.write ? '#b45309' : '#A70A0A' }}>
                  {loading ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>Đang xử lý...</>
                  ) : <>{currentTab.icon} Chạy {currentTab.label}</>}
                </button>
                <span className="text-xs text-gray-400">Tối đa 200 mục / lần</span>
              </div>
            </div>

            {/* Results */}
            {renderResults(result)}
          </>
        )}
      </div>
    </div>
  )
}
