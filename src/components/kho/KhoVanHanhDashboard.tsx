'use client'

import { useState, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
type TabId = 'thu-hoi' | 'the-rfid' | 'sim-card' | 'tra-cuu' | 'ton-kho' | 'gui-sc'

interface BatchResult {
  imei: string
  ok: boolean
  error?: string
  [key: string]: unknown
}

interface ApiResponse {
  ok: boolean
  action?: string
  results?: BatchResult[]
  success?: number
  fail?: number
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseImeiList(raw: string): string[] {
  return raw
    .split(/[\n,;\t]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}>
      {ok ? '✓ OK' : '✗ Lỗi'}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function KhoVanHanhDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('thu-hoi')
  const [imeiText, setImeiText]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<ApiResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const tabs: { id: TabId; label: string; icon: string; desc: string }[] = [
    { id: 'thu-hoi',  icon: '🔄', label: 'Thu hồi TB',     desc: 'Thu hồi thiết bị về kho 303 (UpdateBackFactory)' },
    { id: 'the-rfid', icon: '📡', label: 'Gửi thẻ RFID',   desc: 'Chuyển thẻ quẹt vào kho (TransferWareHouse WH 267)' },
    { id: 'sim-card', icon: '📱', label: 'Báo cáo SIM',     desc: 'Tra cứu thông tin SIM theo barcode (GetSimCard)' },
    { id: 'tra-cuu',  icon: '🔍', label: 'Tra cứu TB',      desc: 'Xem thông tin thiết bị theo IMEI (GetStockupDetail)' },
    { id: 'ton-kho',  icon: '📦', label: 'Tồn kho',         desc: 'Kiểm tra tồn kho thiết bị (GetWarehouseQueue)' },
    { id: 'gui-sc',   icon: '🔧', label: 'Gửi đi SC',       desc: 'Xem trạng thái sửa chữa thiết bị (GetDeviceRepair)' },
  ]

  // ── Upload Excel ──────────────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { read, utils } = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]
      // Lấy cột đầu tiên có dữ liệu dạng số/barcode
      const imeis: string[] = []
      for (const row of rows) {
        const val = String(row[0] ?? '').trim()
        if (val && val.length >= 6) imeis.push(val)
      }
      setImeiText(prev => {
        const existing = parseImeiList(prev)
        const all = [...new Set([...existing, ...imeis])]
        return all.join('\n')
      })
    } catch {
      alert('Không đọc được file Excel. Hãy dùng định dạng .xlsx hoặc .xls')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Gọi API ───────────────────────────────────────────────────────────────
  async function handleRun() {
    const imeis = parseImeiList(imeiText)
    if (!imeis.length) { alert('Nhập ít nhất 1 IMEI/barcode'); return }

    // Với gui-sc dùng action GetDeviceRepair khác endpoint
    const action = activeTab === 'gui-sc' ? 'gui-sc-query' : activeTab

    setLoading(true)
    setResult(null)
    try {
      const resp = await fetch('/api/kho/van-hanh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: activeTab === 'gui-sc' ? 'tra-cuu' : activeTab, imeis }),
      })
      const data: ApiResponse = await resp.json()
      setResult(data)
    } catch (e) {
      setResult({ ok: false, error: String(e) })
    } finally {
      setLoading(false)
    }
    void action
  }

  const imeiCount = parseImeiList(imeiText).length
  const currentTab = tabs.find(t => t.id === activeTab)!

  // ── Render kết quả theo từng tab ──────────────────────────────────────────
  function renderResults() {
    if (!result) return null
    if (!result.ok || result.error) {
      return (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          ❌ {result.error}
        </div>
      )
    }
    const rows = result.results ?? []

    // Summary bar
    const summary = result.success !== undefined ? (
      <div className="mb-3 flex gap-3">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✓ Thành công: {result.success}</span>
        {(result.fail ?? 0) > 0 && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">✗ Lỗi: {result.fail}</span>}
      </div>
    ) : null

    // ── Thu hồi / Thẻ RFID ───────────────────────────────────────────────
    if (activeTab === 'thu-hoi' || activeTab === 'the-rfid') {
      return (
        <div className="mt-4">
          {summary}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">IMEI / Barcode</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Kết quả</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Ghi chú</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${r.ok ? '' : 'bg-red-50'}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{r.imei}</td>
                    <td className="px-4 py-2.5"><StatusBadge ok={r.ok} /></td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    // ── SIM Card ─────────────────────────────────────────────────────────
    if (activeTab === 'sim-card') {
      return (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              {['IMEI', 'SĐT', 'Nhà mạng', 'Loại SIM', 'Trạng thái', 'Gói data', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-gray-100 ${r.ok ? '' : 'bg-red-50'}`}>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.imei}</td>
                  <td className="px-3 py-2.5">{String(r.phone ?? '—')}</td>
                  <td className="px-3 py-2.5">{String(r.carrier ?? '—')}</td>
                  <td className="px-3 py-2.5">{String(r.simKind ?? '—')}</td>
                  <td className="px-3 py-2.5">{String(r.simStatus ?? '—')}</td>
                  <td className="px-3 py-2.5">{String(r.dataPackage ?? '—')}</td>
                  <td className="px-3 py-2.5"><StatusBadge ok={r.ok} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    // ── Tra cứu TB / Gửi SC (dùng tra-cuu data) ──────────────────────────
    if (activeTab === 'tra-cuu' || activeTab === 'gui-sc') {
      return (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              {['IMEI', 'Tên thiết bị', 'Kho hiện tại', 'Kho đích', 'Trạng thái', 'Cập nhật', 'Người cập nhật', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-gray-100 ${r.ok ? '' : 'bg-red-50'}`}>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.imei}</td>
                  <td className="px-3 py-2.5 font-medium">{String(r.productName ?? '—')}</td>
                  <td className="px-3 py-2.5 text-blue-700">{String(r.sourceStock ?? '—')}</td>
                  <td className="px-3 py-2.5 text-gray-500">{String(r.destStock ?? '—')}</td>
                  <td className="px-3 py-2.5">
                    {r.status ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{String(r.status)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{String(r.updateTime ?? '—')}</td>
                  <td className="px-3 py-2.5 text-xs">{String(r.updateMan ?? '—')}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? <StatusBadge ok /> : <span className="text-xs text-red-500">{String(r.error ?? '')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    // ── Tồn kho — raw JSON display ────────────────────────────────────────
    if (activeTab === 'ton-kho') {
      return (
        <div className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-xl border p-4 ${r.ok ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold">{r.imei}</span>
                <StatusBadge ok={r.ok} />
              </div>
              {r.ok && r.data ? (
                <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700">
                  {JSON.stringify(r.data, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-red-600">{String(r.error ?? '')}</p>
              )}
            </div>
          ))}
        </div>
      )
    }

    return null
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200" style={{ background: '#fff' }}>
        <h1 className="text-xl font-bold text-gray-800">🏭 Vận hành Kho</h1>
        <p className="text-sm text-gray-500 mt-0.5">Thao tác hàng loạt: thu hồi, chuyển kho, tra cứu thiết bị từ CRM</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1.5 flex-wrap mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setResult(null) }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'text-white shadow'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
              style={activeTab === tab.id ? { background: '#A70A0A' } : {}}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab description */}
        <div className="mb-4 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <span className="font-semibold text-gray-700">{currentTab.icon} {currentTab.label}:</span> {currentTab.desc}
        </div>

        {/* Input panel */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-gray-700">
              Danh sách IMEI / Barcode
              {imeiCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{imeiCount} thiết bị</span>
              )}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                📂 Upload Excel
              </button>
              {imeiText && (
                <button
                  onClick={() => { setImeiText(''); setResult(null) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          <textarea
            value={imeiText}
            onChange={e => setImeiText(e.target.value)}
            placeholder={`Paste danh sách IMEI vào đây, mỗi dòng 1 mã\nVD:\n003200BE04\n003200BE05\n003200BE06`}
            rows={6}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none resize-y transition"
            onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.08)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={loading || !imeiText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
              style={{ background: '#A70A0A' }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Đang xử lý...
                </>
              ) : (
                <>{currentTab.icon} Chạy {currentTab.label}</>
              )}
            </button>
            <span className="text-xs text-gray-400">
              {activeTab === 'thu-hoi' && '⚠ Thao tác này sẽ thu hồi TB về kho 303'}
              {activeTab === 'the-rfid' && '⚠ Thao tác này sẽ chuyển thẻ vào kho 267'}
              {(activeTab === 'sim-card' || activeTab === 'tra-cuu' || activeTab === 'ton-kho' || activeTab === 'gui-sc') && 'Chỉ đọc — không thay đổi dữ liệu CRM'}
            </span>
          </div>
        </div>

        {/* Results */}
        {renderResults()}
      </div>
    </div>
  )
}
