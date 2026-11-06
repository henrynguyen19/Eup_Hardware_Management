'use client'

import { useState, useRef, useCallback } from 'react'

type TabId = 'thu-hoi' | 'the-rfid' | 'sim-card' | 'tra-cuu' | 'ton-kho' | 'gui-sc'
type TonKhoMode = 'tra-cuu' | 'bao-cao' | 'thanh-pham'

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

// ── Types ─────────────────────────────────────────────────────────────────────
type WareHouseItem = {
  WH_ID: number | string
  WH_Name: string
  WH_WHCID: number
  WHC_Name: string
}

// ── Báo cáo tháng component ───────────────────────────────────────────────────
function BaoCaoTonKho() {
  const [loading, setLoading]           = useState(false)
  const [warehouses, setWarehouses]     = useState<WareHouseItem[]>([])
  const [loaded, setLoaded]             = useState(false)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [report, setReport]             = useState<null | {
    whIds: string[]
    whNames: Record<string, string>
    products: string[]
    productNames: Record<string, string>
    data: Record<string, Record<string, { wait: number; use: number; notUse: number }>>
  }>(null)
  const [error, setError]               = useState('')

  // Nhóm warehouses theo WHC_Name
  const groups = warehouses.reduce<Record<string, { whcId: number; items: WareHouseItem[] }>>((acc, wh) => {
    const key = wh.WHC_Name || `Nhóm ${wh.WH_WHCID}`
    if (!acc[key]) acc[key] = { whcId: wh.WH_WHCID, items: [] }
    acc[key].items.push(wh)
    return acc
  }, {})

  async function loadWarehouses() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ds-kho' }),
      })
      const json = await r.json()
      if (!json.ok || !Array.isArray(json.warehouses)) {
        setError('Không tải được danh sách kho: ' + (json.error ?? JSON.stringify(json._debug_keys ?? '')))
      } else {
        setWarehouses(json.warehouses as WareHouseItem[])
        setLoaded(true)
      }
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  function toggleWh(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleGroup(items: WareHouseItem[], check: boolean) {
    setSelected(prev => {
      const s = new Set(prev)
      items.forEach(w => check ? s.add(String(w.WH_ID)) : s.delete(String(w.WH_ID)))
      return s
    })
  }

  async function runReport() {
    if (!selected.size) { alert('Chọn ít nhất 1 kho'); return }
    setLoading(true); setReport(null); setError('')

    // Build whNames map for fallback display
    const whNames: Record<string, string> = {}
    warehouses.forEach(w => { whNames[String(w.WH_ID)] = w.WH_Name })

    try {
      const r = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ton-kho-bao-cao',
          whIds: Array.from(selected),
          whNames,
        }),
      })
      const json = await r.json()
      if (!json.ok) setError(json.error ?? 'Lỗi không xác định')
      else setReport(json)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  async function exportExcel(r: NonNullable<typeof report>) {
    const { utils, writeFile } = await import('xlsx')
    const khoLabels = r.whIds.map(id => r.whNames[id] || id)

    const header = ['Mã SP', 'Tên sản phẩm',
      ...r.whIds.flatMap(id => {
        const lbl = r.whNames[id] || id
        return [`${lbl} Chờ`, `${lbl} Dùng được`, `${lbl} Hỏng`, `${lbl} Tổng`]
      }),
      'Tổng toàn bộ',
    ]
    const rows: (string | number)[][] = [header]

    const activeProducts = r.products.filter(code =>
      r.whIds.some(id => { const v = r.data[id]?.[code]; return v && (v.wait + v.use + v.notUse) > 0 })
    )

    for (const code of activeProducts) {
      const cells: (string | number)[] = [code, r.productNames[code] ?? code]
      let grand = 0
      for (const id of r.whIds) {
        const v = r.data[id]?.[code] ?? { wait: 0, use: 0, notUse: 0 }
        const t = v.wait + v.use + v.notUse
        grand += t
        cells.push(v.wait, v.use, v.notUse, t)
      }
      cells.push(grand)
      rows.push(cells)
    }

    const ws = utils.aoa_to_sheet(rows)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Tồn kho')
    const now = new Date()
    writeFile(wb, `TonKho_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}.xlsx`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Load + select */}
      {!loaded ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500 mb-4">Tải danh sách kho từ CRM để chọn kho cần xuất báo cáo</p>
          <button onClick={loadWarehouses} disabled={loading}
            className="px-5 py-2 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
            style={{ background: '#A70A0A' }}>
            {loading ? '⏳ Đang tải...' : '🏭 Tải danh sách kho'}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          {/* Warehouse selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="font-semibold text-gray-800 text-sm">
                Chọn kho cần xuất báo cáo
                {selected.size > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{selected.size} kho đã chọn</span>
                )}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set(warehouses.map(w => String(w.WH_ID))))}
                  className="px-3 py-1 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 text-gray-600">Chọn tất cả</button>
                <button onClick={() => setSelected(new Set())}
                  className="px-3 py-1 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 text-gray-600">Bỏ chọn</button>
                <button onClick={() => { setLoaded(false); setWarehouses([]); setSelected(new Set()); setReport(null) }}
                  className="px-3 py-1 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 text-gray-500">↺ Tải lại</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {Object.entries(groups).sort(([, a], [, b]) => a.whcId - b.whcId).map(([groupName, grp]) => {
                const ids = grp.items.map(w => String(w.WH_ID))
                const allChecked = ids.every(id => selected.has(id))
                const someChecked = ids.some(id => selected.has(id))
                return (
                  <div key={groupName} className="border border-gray-100 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-gray-100">
                      <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                        onChange={e => toggleGroup(grp.items, e.target.checked)}
                        className="rounded" />
                      <span className="text-xs font-bold text-gray-700">{groupName}</span>
                      <span className="text-xs text-gray-400 ml-auto">{grp.items.length} kho</span>
                    </div>
                    <div className="space-y-0.5">
                      {grp.items.map(wh => {
                        const id = String(wh.WH_ID)
                        return (
                          <label key={id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selected.has(id)} onChange={() => toggleWh(id)} className="rounded" />
                            <span className="text-xs text-gray-700">{wh.WH_Name}</span>
                            <span className="text-xs text-gray-400 ml-auto font-mono">#{id}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Run button */}
          <div className="flex gap-3 items-center">
            <button onClick={runReport} disabled={loading || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: '#A70A0A' }}>
              {loading ? '⏳ Đang lấy dữ liệu...' : `📊 Xuất báo cáo (${selected.size} kho)`}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </>
      )}

      {/* Report table */}
      {report && (() => {
        const activeProducts = report.products.filter(code =>
          report.whIds.some(id => { const v = report.data[id]?.[code]; return v && (v.wait + v.use + v.notUse) > 0 })
        )
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-gray-600">{activeProducts.length} sản phẩm, {report.whIds.length} kho</span>
              <button onClick={() => exportExcel(report)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ background: '#217346' }}>
                📥 Xuất Excel
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50" rowSpan={2}>Mã SP</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap" rowSpan={2}>Tên sản phẩm</th>
                    {report.whIds.map((id, ki) => (
                      <th key={id} colSpan={4} className="px-2 py-2 text-center font-semibold border-l border-gray-200 text-blue-700 whitespace-nowrap">
                        {report.whNames[id] || id}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 border-l border-gray-200" rowSpan={2}>Tổng</th>
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {report.whIds.map(id => (
                      ['Chờ', 'Dùng', 'Hỏng', 'Tổng'].map(col => (
                        <th key={`${id}-${col}`} className={`px-2 py-1 font-medium text-center border-l border-gray-100 ${col === 'Tổng' ? 'font-bold text-gray-700' : 'text-gray-500'}`}>
                          {col}
                        </th>
                      ))
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeProducts.map((code, ri) => {
                    let grand = 0
                    return (
                      <tr key={code} className={`border-b border-gray-100 ${ri % 2 === 0 ? '' : 'bg-gray-50/40'} hover:bg-blue-50/20`}>
                        <td className="px-3 py-1.5 font-mono text-gray-500 sticky left-0 bg-inherit">{code}</td>
                        <td className="px-3 py-1.5 text-gray-700 font-medium whitespace-nowrap">{report.productNames[code] || code}</td>
                        {report.whIds.map(id => {
                          const v = report.data[id]?.[code] ?? { wait: 0, use: 0, notUse: 0 }
                          const t = v.wait + v.use + v.notUse
                          grand += t
                          return (
                            <>
                              <td key={`${id}-w`} className={`px-2 py-1.5 text-center border-l border-gray-100 ${v.wait > 0 ? 'text-amber-700 font-semibold' : 'text-gray-200'}`}>{v.wait || '—'}</td>
                              <td key={`${id}-u`} className={`px-2 py-1.5 text-center ${v.use > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-200'}`}>{v.use || '—'}</td>
                              <td key={`${id}-n`} className={`px-2 py-1.5 text-center ${v.notUse > 0 ? 'text-red-600 font-semibold' : 'text-gray-200'}`}>{v.notUse || '—'}</td>
                              <td key={`${id}-t`} className={`px-2 py-1.5 text-center font-bold border-r border-gray-100 ${t > 0 ? 'text-gray-800' : 'text-gray-200'}`}>{t || '—'}</td>
                            </>
                          )
                        })}
                        <td className="px-3 py-1.5 text-center font-bold text-gray-900 border-l border-gray-200">{grand || '—'}</td>
                      </tr>
                    )
                  })}
                  {/* Totals */}
                  <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">
                    <td className="px-3 py-2 text-gray-800 sticky left-0 bg-gray-100" colSpan={2}>TỔNG</td>
                    {(() => {
                      let grand = 0
                      return report.whIds.map((id, ki) => {
                        const wait = activeProducts.reduce((s, c) => s + (report.data[id]?.[c]?.wait ?? 0), 0)
                        const use  = activeProducts.reduce((s, c) => s + (report.data[id]?.[c]?.use  ?? 0), 0)
                        const notUse = activeProducts.reduce((s, c) => s + (report.data[id]?.[c]?.notUse ?? 0), 0)
                        const t = wait + use + notUse
                        grand += t
                        return (
                          <>
                            <td key={`tot-${id}-w`} className="px-2 py-2 text-center text-amber-800 border-l border-gray-200">{wait}</td>
                            <td key={`tot-${id}-u`} className="px-2 py-2 text-center text-emerald-800">{use}</td>
                            <td key={`tot-${id}-n`} className="px-2 py-2 text-center text-red-800">{notUse}</td>
                            <td key={`tot-${id}-t`} className="px-2 py-2 text-center text-gray-900 border-r border-gray-200">{t}</td>
                            {ki === report.whIds.length - 1 && (
                              <td className="px-3 py-2 text-center text-gray-900 border-l border-gray-200">{grand}</td>
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
      })()}
    </div>
  )
}

// ── Báo cáo thành phẩm WH Admin ──────────────────────────────────────────────
type WH2 = { WH_ID: number | string; WH_Name: string; WH_WHCID: number; WHC_Name: string }

// Thiết bị hiển thị mặc định — khớp theo ProductName (case-insensitive, includes)
// Dùng tên/từ khóa thực từ CRM
const DEFAULT_PRODUCT_KEYWORDS = [
  // VN88 family
  'VN88',       // VN88-4G, VN88-4G(H)
  'SM-F6N',     // SM-F6N 4G-DVR(VN_HM) = VN88-4G(H) variant

  // GoTrack / Go-168 / S400
  'GoTrack',    // GoTrack S400, GoTrack S400E, GoTrack 168, ...
  'Go-168',
  'S400',       // dự phòng nếu không dùng GoTrack prefix

  // MT99
  'MT99',

  // Streamax
  'MDVR-C43',   // Streamax MDVR-C43, Streamax MDVR-C43-CAT1
  'MDVR-H5',    // Streamax MDVR-H5

  // VR-88
  'VR-88',
  'VR88',

  // DSM / ADAS
  'DSM',        // DSM Camera
  'ADAS',       // ADAS Camera

  // Smartbox
  'Smartbox',   // Smartbox H, SmarboxN

  // Temperature
  'Temperature', // One-Wire Temperature

  // Bewin / Fuel / SmarboxN
  'Bewin',
  'bewin',
  'Fuel',
  'fuel',
]

function matchesDefault(name: string): boolean {
  const n = name.toLowerCase()
  return DEFAULT_PRODUCT_KEYWORDS.some(kw => n.includes(kw.toLowerCase()))
}

// Auto-assign kho theo quy tắc mặc định
function defaultAssign(wh: WH2): 'main' | 'broken' | 'skip' {
  const name = (wh.WH_Name ?? '').toLowerCase()
  const isRepairGroup = wh.WH_WHCID === -2 ||
    (wh.WHC_Name ?? '').toLowerCase().includes('repair') && !(wh.WHC_Name ?? '').toLowerCase().includes('company')

  if (isRepairGroup) return 'broken' // TẤT CẢ kho Repair group → KDĐ

  // Company group — chỉ 3 kho xanh + 2 kho vàng; còn lại bỏ qua
  if (name.includes('hardware-machine') || name.includes('hardware machine')) return 'main'
  if (name.includes('warehouse-admin')  || name.includes('warehouse admin'))  return 'main'
  if (name.includes('old device'))                                            return 'main'
  if (name.includes('waiting scrap'))                                         return 'broken'
  if (name.includes('repair eup'))                                            return 'broken'
  return 'skip' // admin-hcm, da nang-office, binh duong-office, v.v. → không chọn
}

function BaoCaoThanhPhamWH() {
  const [loading, setLoading]       = useState(false)
  const [warehouses, setWarehouses] = useState<WH2[]>([])
  const [loaded, setLoaded]         = useState(false)
  const [mainSet, setMainSet]       = useState<Set<string>>(new Set())
  const [brokenSet, setBrokenSet]   = useState<Set<string>>(new Set())
  const [report, setReport]         = useState<null | {
    products: string[]
    data: Record<string, { chuaTP: number; thanhPham: number; khongDung: number; name: string }>
  }>(null)
  // Sản phẩm đang hiển thị: set các ProductNumber code đang được tick
  const [visibleProducts, setVisibleProducts] = useState<Set<string>>(new Set())
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [error, setError]           = useState('')

  const relevantWhs = warehouses.filter(w =>
    defaultAssign(w) !== 'skip' ||
    // Vẫn hiển thị để user có thể chọn thủ công, nhưng không default-select
    (w.WHC_Name ?? '').toLowerCase().includes('company') || w.WH_WHCID === 1 ||
    (w.WHC_Name ?? '').toLowerCase().includes('repair')  || w.WH_WHCID === -2
  )

  async function loadWarehouses() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ds-kho' }),
      })
      const json = await r.json()
      if (!json.ok || !Array.isArray(json.warehouses)) {
        setError('Không tải được danh sách kho: ' + (json.error ?? JSON.stringify(json._debug_keys ?? '')))
      } else {
        const all = json.warehouses as WH2[]
        setWarehouses(all)
        setLoaded(true)
        const main = new Set<string>()
        const broken = new Set<string>()
        all.forEach(w => {
          const id = String(w.WH_ID)
          const assign = defaultAssign(w)
          if (assign === 'main')   main.add(id)
          if (assign === 'broken') broken.add(id)
        })
        setMainSet(main)
        setBrokenSet(broken)
      }
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  function toggleMain(id: string) {
    setMainSet(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
    setBrokenSet(prev => { const s = new Set(prev); s.delete(id); return s })
  }
  function toggleBroken(id: string) {
    setBrokenSet(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
    setMainSet(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function runReport() {
    if (!mainSet.size && !brokenSet.size) { alert('Chọn ít nhất 1 kho'); return }
    setLoading(true); setReport(null); setError('')
    const whNames: Record<string, string> = {}
    warehouses.forEach(w => { whNames[String(w.WH_ID)] = w.WH_Name })
    try {
      const r = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bao-cao-thanh-pham',
          mainWhIds: Array.from(mainSet),
          brokenWhIds: Array.from(brokenSet),
          whNames,
        }),
      })
      const json = await r.json()
      if (!json.ok) {
        setError(json.error ?? 'Lỗi không xác định')
      } else {
        setReport(json)
        // Mặc định chỉ hiện các sản phẩm khớp keyword
        const defaults = new Set<string>(
          (json.products as string[]).filter(c => matchesDefault(json.data[c]?.name ?? c))
        )
        setVisibleProducts(defaults)
        setShowAllProducts(false)
      }
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  async function exportExcel() {
    if (!report) return
    const { utils, writeFile } = await import('xlsx')
    const products = report.products.filter(c => visibleProducts.has(c))
    const header = ['Loại', ...products.map(c => report.data[c]?.name || c), 'Tổng']
    const makeRow = (label: string, getter: (c: string) => number) => {
      let total = 0
      const cells: (string | number)[] = [label]
      products.forEach(c => { const v = getter(c); cells.push(v); total += v })
      cells.push(total)
      return cells
    }
    const rows = [
      header,
      makeRow('Chưa thành phẩm (半成品)', c => report.data[c]?.chuaTP ?? 0),
      makeRow('Thành phẩm (成品)', c => report.data[c]?.thanhPham ?? 0),
      makeRow('Không dùng được (不可使用)', c => report.data[c]?.khongDung ?? 0),
      makeRow('Tổng 合計', c => (report.data[c]?.chuaTP ?? 0) + (report.data[c]?.thanhPham ?? 0) + (report.data[c]?.khongDung ?? 0)),
    ]
    const ws = utils.aoa_to_sheet(rows)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'BC Thành phẩm')
    const now = new Date()
    writeFile(wb, `BCThanhPham_WH_Admin_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}.xlsx`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="mb-3 text-sm font-semibold text-gray-700">📋 Báo cáo thành phẩm — Warehouse Admin / Hardware Machine</div>
        <p className="text-xs text-gray-500 mb-4">3 kho xanh (Company) + 2 kho vàng (Company) + toàn bộ Repair → tự động gán khi tải</p>
        <button onClick={loadWarehouses} disabled={loading}
          className="px-5 py-2 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
          style={{ background: '#A70A0A' }}>
          {loading ? '⏳ Đang tải...' : '🏭 Tải danh sách kho'}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  // Group by WHC_Name — only show Company and Repair
  const groups: Record<string, WH2[]> = {}
  warehouses
    .filter(w => {
      const whc = (w.WHC_Name ?? '').toLowerCase()
      return whc.includes('company') || whc.includes('repair') || w.WH_WHCID === 1 || w.WH_WHCID === -2
    })
    .forEach(w => {
      const key = w.WHC_Name || `Nhóm ${w.WH_WHCID}`
      if (!groups[key]) groups[key] = []
      groups[key].push(w)
    })

  return (
    <div className="space-y-4">
      {/* Warehouse panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className="font-semibold text-gray-800 text-sm">Phân loại kho cho báo cáo</span>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block"/>Kho chính (Thành phẩm + Chưa TP)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-orange-400 inline-block"/>Kho hỏng (Không dùng được)</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName} className="border border-gray-100 rounded-lg p-2">
              <div className="text-xs font-bold text-gray-700 pb-1.5 mb-1 border-b border-gray-100 flex items-center justify-between">
                <span>{groupName}</span>
                <span className="text-gray-400 font-normal">{items.filter(w => mainSet.has(String(w.WH_ID))).length}TP / {items.filter(w => brokenSet.has(String(w.WH_ID))).length}KDĐ</span>
              </div>
              <div className="space-y-0.5">
                {items.map(wh => {
                  const id = String(wh.WH_ID)
                  const inMain   = mainSet.has(id)
                  const inBroken = brokenSet.has(id)
                  return (
                    <div key={id} className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs transition ${inBroken ? 'bg-orange-50' : inMain ? 'bg-blue-50' : ''}`}>
                      <span className="flex-1 text-gray-700">{wh.WH_Name}</span>
                      <span className="text-gray-300 font-mono text-[10px]">#{id}</span>
                      <button onClick={() => toggleMain(id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${inMain ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-500 border-blue-200 hover:border-blue-400'}`}>TP</button>
                      <button onClick={() => toggleBroken(id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${inBroken ? 'bg-orange-400 text-white border-orange-400' : 'bg-white text-orange-400 border-orange-200 hover:border-orange-400'}`}>KDĐ</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-gray-400">
          Mặc định: Hardware-Machine, WareHouse-Admin, Old Device → TP (xanh) &nbsp;|&nbsp; Waiting Scrap, Repair Eup + toàn bộ Repair → KDĐ (vàng)
        </div>
      </div>

      {/* Run button */}
      <div className="flex gap-3 items-center flex-wrap">
        <button onClick={runReport} disabled={loading || (!mainSet.size && !brokenSet.size)}
          className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
          style={{ background: '#A70A0A' }}>
          {loading ? '⏳ Đang lấy dữ liệu...' : `📊 Xuất báo cáo (${mainSet.size}TP + ${brokenSet.size}KDĐ)`}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Product selector + Report */}
      {report && (() => {
        const displayProducts = report.products.filter(c => visibleProducts.has(c))
        const hiddenCount = report.products.length - visibleProducts.size

        const rowDef = [
          { key: 'chuaTP'    as const, label: 'Chưa thành phẩm', sub: '半成品 (linh kiện mới/零配件)', bg: 'bg-amber-50',   text: 'text-amber-800' },
          { key: 'thanhPham' as const, label: 'Thành phẩm',       sub: '成品',                         bg: 'bg-emerald-50', text: 'text-emerald-800' },
          { key: 'khongDung' as const, label: 'Không dùng được',  sub: '不可使用',                     bg: 'bg-red-50',     text: 'text-red-800' },
        ]

        return (
          <div className="space-y-3">
            {/* Product selector */}
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">
                  Chọn thiết bị hiển thị
                  <span className="ml-2 text-xs text-gray-400 font-normal">{visibleProducts.size}/{report.products.length} đang hiện</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setVisibleProducts(new Set(report.products))} className="text-xs text-blue-600 hover:underline">Chọn tất cả</button>
                  <button onClick={() => setVisibleProducts(new Set(report.products.filter(c => matchesDefault(report.data[c]?.name ?? c))))} className="text-xs text-gray-500 hover:underline">Mặc định</button>
                  <button onClick={() => setShowAllProducts(v => !v)} className="text-xs text-gray-500 hover:underline">
                    {showAllProducts ? '▲ Thu gọn' : `▼ Xem thêm ${hiddenCount} SP`}
                  </button>
                </div>
              </div>
              <div className={`flex flex-wrap gap-1.5 ${showAllProducts ? '' : 'max-h-24 overflow-hidden'}`}>
                {report.products.map(c => {
                  const isVisible = visibleProducts.has(c)
                  const name = report.data[c]?.name || c
                  const isDefault = matchesDefault(name)
                  return (
                    <button key={c} onClick={() => setVisibleProducts(prev => {
                      const s = new Set(prev); s.has(c) ? s.delete(c) : s.add(c); return s
                    })}
                      className={`px-2 py-0.5 rounded-full text-xs border transition ${
                        isVisible
                          ? isDefault ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-700 text-white border-gray-700'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                      }`}
                      title={c}>
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Table toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-gray-500">{displayProducts.length} thiết bị</span>
              <button onClick={exportExcel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ background: '#217346' }}>
                📥 Xuất Excel
              </button>
            </div>

            {/* Pivot table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    <th className="px-4 py-2.5 text-left font-bold text-gray-700 whitespace-nowrap sticky left-0 bg-gray-100 min-w-[180px]">Phân loại</th>
                    {displayProducts.map(c => (
                      <th key={c} className="px-2 py-2 text-center font-semibold text-blue-700 border-l border-gray-200 whitespace-nowrap">
                        <div className="max-w-[90px] truncate" title={report.data[c]?.name || c}>
                          {report.data[c]?.name || c}
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-bold text-gray-700 border-l-2 border-gray-400">Tổng<br/>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {rowDef.map(row => {
                    let rowTotal = 0
                    return (
                      <tr key={row.key} className={`border-b border-gray-200 ${row.bg}`}>
                        <td className={`px-4 py-2.5 sticky left-0 ${row.bg}`}>
                          <div className={`font-bold ${row.text}`}>{row.label}</div>
                          <div className="text-gray-400 text-[10px]">{row.sub}</div>
                        </td>
                        {displayProducts.map(c => {
                          const v = report.data[c]?.[row.key] ?? 0
                          rowTotal += v
                          return (
                            <td key={c} className={`px-2 py-2.5 text-center border-l border-gray-100 ${v > 0 ? `${row.text} font-bold` : 'text-gray-200'}`}>
                              {v || '—'}
                            </td>
                          )
                        })}
                        <td className={`px-3 py-2.5 text-center font-bold border-l-2 border-gray-400 ${row.text}`}>{rowTotal || '—'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-100 border-t-2 border-gray-400">
                    <td className="px-4 py-2.5 sticky left-0 bg-gray-100">
                      <div className="font-bold text-gray-900">Tổng</div>
                      <div className="text-gray-400 text-[10px]">合計</div>
                    </td>
                    {displayProducts.map(c => {
                      const v = (report.data[c]?.chuaTP ?? 0) + (report.data[c]?.thanhPham ?? 0) + (report.data[c]?.khongDung ?? 0)
                      return (
                        <td key={c} className={`px-2 py-2.5 text-center border-l border-gray-200 font-bold ${v > 0 ? 'text-gray-900' : 'text-gray-200'}`}>
                          {v || '—'}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-center font-bold text-gray-900 border-l-2 border-gray-400">
                      {displayProducts.reduce((s, c) => s + (report.data[c]?.chuaTP ?? 0) + (report.data[c]?.thanhPham ?? 0) + (report.data[c]?.khongDung ?? 0), 0) || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS: { id: TabId; icon: string; label: string; write: boolean; desc: string }[] = [
  { id: 'tra-cuu',  icon: '🔍', label: 'Tra cứu TB',    write: false, desc: 'GetStockupDetail (kind 0→2→3) + GetCarList — xem kho, trạng thái, SIM, thẻ nhớ' },
  { id: 'ton-kho',  icon: '📦', label: 'Tồn kho',       write: false, desc: 'GetStockupList — tra cứu tồn kho theo WH_ID và xuất báo cáo cuối tháng' },
  { id: 'sim-card', icon: '📱', label: 'Báo cáo SIM',   write: false, desc: 'GetSimCard — tra cứu nhà mạng, SĐT, gói data theo barcode SIM' },
  { id: 'thu-hoi',  icon: '🔄', label: 'Thu hồi TB',    write: true,  desc: 'UpdateBackFactory (TransStock=303) — thu hồi hàng loạt về kho KT [Chỉ Admin]' },
  { id: 'the-rfid', icon: '📡', label: 'Gửi thẻ RFID',  write: true,  desc: 'TransferWareHouse (WH=267) — chuyển thẻ quẹt vào kho [Chỉ Admin]' },
  { id: 'gui-sc',   icon: '🔧', label: 'Gửi đi SC',     write: true,  desc: 'GetDeviceRepair → UpdateDeviceRepair (WH=3, Repairing) — gửi hàng loạt đi sửa [Chỉ Admin]' },
]

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function KhoVanHanhDashboard() {
  const [tab, setTab]           = useState<TabId>('tra-cuu')
  const [tonKhoMode, setTonKhoMode] = useState<TonKhoMode>('tra-cuu')
  const [imeiText, setImeiText] = useState('')
  const [whText, setWhText]     = useState('')
  const [stockupKind, setStockupKind] = useState('')
  const [loading, setLoading]   = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult]     = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentTab  = TABS.find(t => t.id === tab)!
  const isTonKho    = tab === 'ton-kho'
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
      <div className="px-6 py-5 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-800">🏭 Vận hành Kho</h1>
        <p className="text-sm text-gray-500 mt-0.5">Thao tác hàng loạt: tra cứu, tồn kho, thu hồi, chuyển thẻ, gửi SC</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Main Tabs */}
        <div className="flex gap-1.5 flex-wrap mb-5">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => { setTab(t.id); setResult(null) }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                tab === t.id
                  ? 'text-white border-transparent shadow'
                  : t.write
                    ? 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              style={tab === t.id ? { background: t.write ? '#b45309' : '#A70A0A' } : {}}>
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

        {/* Tồn kho: sub-tabs */}
        {isTonKho && (
          <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1 w-fit">
            <button onClick={() => setTonKhoMode('tra-cuu')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tonKhoMode === 'tra-cuu' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              🔎 Tra cứu
            </button>
            <button onClick={() => setTonKhoMode('bao-cao')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tonKhoMode === 'bao-cao' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              📊 Báo cáo tháng
            </button>
            <button onClick={() => setTonKhoMode('thanh-pham')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tonKhoMode === 'thanh-pham' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              📋 BC Thành phẩm
            </button>
          </div>
        )}

        {/* Sub-tab: Báo cáo tháng */}
        {isTonKho && tonKhoMode === 'bao-cao' ? (
          <BaoCaoTonKho />
        ) : isTonKho && tonKhoMode === 'thanh-pham' ? (
          <BaoCaoThanhPhamWH />
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
                    <button key={val} onClick={() => setStockupKind(val)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                        stockupKind === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}>{lbl}</button>
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
            {renderResults(result)}
          </>
        )}
      </div>
    </div>
  )
}
