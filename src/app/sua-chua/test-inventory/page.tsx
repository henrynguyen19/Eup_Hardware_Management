'use client'
import { useState } from 'react'

interface ChunkResult { from: string; to: string; count: number; elapsed_ms: number; error?: string }
interface ByType { name: string; count: number }
interface RawResult {
  mode: 'single' | 'chunked'
  from: string; to: string
  total?: number
  total_raw?: number
  total_deduped?: number
  elapsed_ms: number
  chunks?: ChunkResult[]
  by_type: ByType[]
  sample: Record<string, unknown>[]
  error?: string
}

export default function TestInventoryPage() {
  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  const defaultTo   = now.toISOString().slice(0,10)

  const [from, setFrom]       = useState(defaultFrom)
  const [to, setTo]           = useState(defaultTo)
  const [useChunk, setUseChunk] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<RawResult | null>(null)
  const [err, setErr]         = useState('')
  const [showSample, setShowSample] = useState(false)

  async function run() {
    setLoading(true); setErr(''); setResult(null)
    try {
      const p = new URLSearchParams({ from, to, chunk: useChunk ? 'true' : 'false' })
      const res = await fetch(`/api/device-inventory/raw-test?${p}`)
      const d   = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Lỗi'); return }
      setResult(d)
    } catch(e) { setErr(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-800">🔬 Test Raw CRM Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Gọi thẳng GetDeviceMaintenance, xem số lượng raw trả về — Admin only</p>
        </div>

        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Từ ngày</label>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Đến ngày</label>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={useChunk} onChange={e=>setUseChunk(e.target.checked)}
                className="w-4 h-4 accent-indigo-600" />
              Chia chunks 7 ngày
            </label>
            <button onClick={run} disabled={loading}
              className="px-5 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {loading ? '⏳ Đang tải...' : '▶ Chạy'}
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'].map(ym => (
              <button key={ym} onClick={()=>{
                const [y,m] = ym.split('-').map(Number)
                const last = new Date(y, m, 0).getDate()
                setFrom(`${ym}-01`); setTo(`${ym}-${String(last).padStart(2,'0')}`)
              }} className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                {ym}
              </button>
            ))}
            <button onClick={()=>{
              const y = new Date().getFullYear()
              setFrom(`${y}-01-01`); setTo(new Date().toISOString().slice(0,10))
            }} className="px-2.5 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg font-medium">
              All 2026
            </button>
          </div>
        </div>

        {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">❌ {err}</div>}

        {result && (
          <div className="space-y-4">

            {/* Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">📊 Tổng quan</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-indigo-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">
                    {result.mode === 'chunked' ? result.total_deduped : result.total}
                  </div>
                  <div className="text-xs text-indigo-500 mt-0.5">Records (sau dedupe)</div>
                </div>
                {result.mode === 'chunked' && (
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-amber-700">{result.total_raw}</div>
                    <div className="text-xs text-amber-500 mt-0.5">Records raw (trước dedupe)</div>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-700">{(result.elapsed_ms/1000).toFixed(1)}s</div>
                  <div className="text-xs text-gray-500 mt-0.5">Thời gian</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{result.by_type.length}</div>
                  <div className="text-xs text-green-500 mt-0.5">Loại thiết bị</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400 font-mono">{result.from} → {result.to} · mode: {result.mode}</div>
            </div>

            {/* Chunks breakdown (chunked mode) */}
            {result.mode === 'chunked' && result.chunks && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">📦 Chi tiết từng chunk</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Từ</th>
                        <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Đến</th>
                        <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Records</th>
                        <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Thời gian</th>
                        <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Lỗi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.chunks.map((c, i) => (
                        <tr key={i} className={`border-b border-gray-50 ${c.error ? 'bg-red-50' : i%2===0?'':'bg-gray-50/40'}`}>
                          <td className="px-2 py-1.5 font-mono text-gray-600">{c.from.slice(0,10)}</td>
                          <td className="px-2 py-1.5 font-mono text-gray-600">{c.to.slice(0,10)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${c.count >= 1000 ? 'text-red-600' : c.count > 500 ? 'text-amber-600' : 'text-gray-800'}`}>
                            {c.count}
                            {c.count >= 1000 && <span className="ml-1 text-red-500 font-normal">⚠ có thể bị cắt</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-400">{(c.elapsed_ms/1000).toFixed(1)}s</td>
                          <td className="px-2 py-1.5 text-red-500">{c.error ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td colSpan={2} className="px-2 py-1.5 font-semibold text-gray-700">Tổng</td>
                        <td className="px-2 py-1.5 text-right font-bold text-indigo-700">{result.total_raw}</td>
                        <td className="px-2 py-1.5 text-right text-gray-400">{(result.elapsed_ms/1000).toFixed(1)}s</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* By device type */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">📱 Theo loại thiết bị</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">#</th>
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Tên thiết bị (Device_TypeName)</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Số lượng</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.by_type.map((bt, i) => {
                      const total = result.mode === 'chunked' ? (result.total_deduped??0) : (result.total??0)
                      const pct = total > 0 ? bt.count/total : 0
                      return (
                        <tr key={i} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/40'}`}>
                          <td className="px-2 py-1.5 text-gray-400">{i+1}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-700">{bt.name}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-indigo-700">{bt.count.toLocaleString()}</td>
                          <td className="px-2 py-1.5 w-32">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-400 rounded-full" style={{width:`${Math.round(pct*100)}%`}} />
                              </div>
                              <span className="text-gray-400 text-[10px] w-8 text-right">{Math.round(pct*100)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sample records */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <button onClick={()=>setShowSample(s=>!s)} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <span>{showSample ? '▾' : '▸'}</span>
                🧪 Sample records ({result.sample.length} dòng đầu)
              </button>
              {showSample && (
                <pre className="mt-3 text-[10px] bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-600 max-h-96">
                  {JSON.stringify(result.sample, null, 2)}
                </pre>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
