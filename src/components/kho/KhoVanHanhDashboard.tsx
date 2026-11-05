'use client'

import { useState, useRef } from 'react'

type TabId = 'thu-hoi' | 'the-rfid' | 'sim-card' | 'tra-cuu' | 'ton-kho' | 'gui-sc'

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
  { id: 'sim-card', icon: '📱', label: 'Báo cáo SIM',   write: false, desc: 'GetSimCard — tra cứu nhà mạng, SĐT, gói data theo barcode SIM' },
  { id: 'thu-hoi',  icon: '🔄', label: 'Thu hồi TB',    write: true,  desc: 'UpdateBackFactory (TransStock=303) — thu hồi hàng loạt về kho KT [Chỉ Admin]' },
  { id: 'the-rfid', icon: '📡', label: 'Gửi thẻ RFID',  write: true,  desc: 'TransferWareHouse (WH=267) — chuyển thẻ quẹt vào kho [Chỉ Admin]' },
  { id: 'gui-sc',   icon: '🔧', label: 'Gửi đi SC',     write: true,  desc: 'GetDeviceRepair → UpdateDeviceRepair (WH=3, Repairing) — gửi hàng loạt đi sửa [Chỉ Admin]' },
]

// ── Main ──────────────────────────────────────────────────────────────────────
export default function KhoVanHanhDashboard() {
  const [tab, setTab]           = useState<TabId>('tra-cuu')
  const [imeiText, setImeiText] = useState('')
  const [whText, setWhText]     = useState('')     // warehouse IDs cho ton-kho
  const [stockupKind, setStockupKind] = useState('')
  const [loading, setLoading]   = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult]     = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentTab = TABS.find(t => t.id === tab)!
  const isTonKho   = tab === 'ton-kho'
  const listText   = isTonKho ? whText : imeiText
  const setListText = isTonKho ? setWhText : setImeiText
  const listCount  = parseList(listText).length

  // ── Upload Excel ────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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
  }

  // ── Gọi API ─────────────────────────────────────────────────────────────
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

  // ── Render results ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderResults(r: any) {
    if (!r) return null
    if (!r.ok || r.error) {
      return <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">❌ {r.error}</div>
    }

    const rows = r.results ?? []

    // Summary bar cho write ops
    const summary = r.success !== undefined ? (
      <div className="mb-3 flex gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✓ Thành công: {r.success}</span>
        {r.fail > 0 && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">✗ Lỗi: {r.fail}</span>}
      </div>
    ) : null

    // ── TRA CỨU TB ──────────────────────────────────────────────────────
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

    // ── TỒN KHO ─────────────────────────────────────────────────────────
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

    // ── SIM CARD ─────────────────────────────────────────────────────────
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

    // ── THU HỒI + GỬI THẺ RFID ──────────────────────────────────────────
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

    // ── GỬI ĐI SC ───────────────────────────────────────────────────────
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

        {/* Input */}
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

          {/* StockupKind selector cho tồn kho */}
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
      </div>
    </div>
  )
}
