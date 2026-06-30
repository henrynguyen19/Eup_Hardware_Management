'use client'

import { useState } from 'react'

interface AnalysisItem { name: string; count: number }
interface Analysis {
  total:       number
  byProduct:   AnalysisItem[]
  byStatus:    AnalysisItem[]
  byRepairMan: AnalysisItem[]
  byFinishMan: AnalysisItem[]
  byWarehouse: AnalysisItem[]
  topDesc:     { word: string; count: number }[]
  avgRepairDays: number | null
  fields:      string[]
}

interface RepairRecord {
  Repair_ID:            number
  Device_Code:          string
  ProductName:          string
  Repair_Description:   string
  RepairMan:            string
  RepairFinishMan:      string
  Repair_Status_String: string
  Repair_InDate:        string
  Repair_OutDate:       string
  WareHouseName:        string
  [key: string]: unknown
}

export default function RepairCrmTestPage() {
  const today = new Date()
  const ago30 = new Date(today.getTime() - 30 * 86400000)
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(fmtDate(ago30))
  const [endDate,   setEndDate]   = useState(fmtDate(today))
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<{ analysis: Analysis; sample: RepairRecord[]; total: number; startTime: string; endTime: string } | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [showRaw,   setShowRaw]   = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'fields' | 'records'>('summary')

  async function fetchData() {
    setLoading(true); setError(null); setResult(null)
    try {
      const resp = await fetch('/api/sua-chua/crm-fetch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: `${startDate} 00:00:00`,
          endTime:   `${endDate} 23:59:59`,
          raw:       showRaw,
        }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) { setError(data.error || 'Lỗi không xác định'); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === t
      ? 'border-blue-500 text-blue-600'
      : 'border-transparent text-gray-500 hover:text-gray-700'}`

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Test: GetDeviceRepair từ CRM</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gọi trực tiếp CRM SOAP <code className="bg-gray-100 px-1 rounded">GetDeviceRepair</code> và phân tích dữ liệu trả về.
      </p>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-1">
            <input type="checkbox" checked={showRaw} onChange={e => setShowRaw(e.target.checked)} />
            Trả về toàn bộ records
          </label>
          <button
            onClick={fetchData} disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? '⏳ Đang tải...' : '🔄 Tải dữ liệu CRM'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          <strong>Lỗi:</strong> {error}
        </div>
      )}

      {result && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Tổng records', value: result.total, color: 'blue' },
              { label: 'Loại thiết bị', value: result.analysis.byProduct.length, color: 'emerald' },
              { label: 'Kỹ thuật viên', value: result.analysis.byRepairMan.length, color: 'violet' },
              { label: 'TB ngày sửa', value: result.analysis.avgRepairDays != null ? `${result.analysis.avgRepairDays}d` : '—', color: 'amber' },
            ].map(s => (
              <div key={s.label} className={`bg-white border border-gray-200 rounded-xl p-4 shadow-sm`}>
                <div className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-200 px-4">
              <button className={tabClass('summary')} onClick={() => setActiveTab('summary')}>📊 Phân tích</button>
              <button className={tabClass('fields')}  onClick={() => setActiveTab('fields')}>🔍 Cấu trúc fields</button>
              <button className={tabClass('records')} onClick={() => setActiveTab('records')}>📋 Sample records</button>
            </div>

            <div className="p-5">

              {/* ── Tab: Phân tích ── */}
              {activeTab === 'summary' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnalysisTable title="Theo thiết bị (ProductName)" data={result.analysis.byProduct} colorClass="bg-blue-100 text-blue-800" />
                  <AnalysisTable title="Theo trạng thái" data={result.analysis.byStatus} colorClass="bg-emerald-100 text-emerald-800" />
                  <AnalysisTable title="Kỹ thuật sửa (RepairMan)" data={result.analysis.byRepairMan} colorClass="bg-violet-100 text-violet-800" />
                  <AnalysisTable title="Người hoàn thành (FinishMan)" data={result.analysis.byFinishMan} colorClass="bg-pink-100 text-pink-800" />
                  <AnalysisTable title="Kho (WareHouseName)" data={result.analysis.byWarehouse} colorClass="bg-amber-100 text-amber-800" />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Từ khóa mô tả lỗi phổ biến</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.topDesc.map(d => (
                        <span key={d.word} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">
                          {d.word} <span className="font-bold">×{d.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Cấu trúc fields ── */}
              {activeTab === 'fields' && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">
                    Các field có trong response từ CRM ({result.analysis.fields.length} fields).
                    Dùng để lên kế hoạch mapping vào DB.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {result.analysis.fields.map(f => {
                      const sample = result.sample[0]?.[f as keyof typeof result.sample[0]]
                      return (
                        <div key={f} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div className="font-mono text-sm text-blue-700 font-semibold">{f}</div>
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            Ví dụ: <span className="text-gray-700">{String(sample ?? '—')}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Raw JSON record đầu tiên */}
                  {result.sample.length > 0 && (
                    <details className="mt-4">
                      <summary className="text-sm text-blue-600 cursor-pointer hover:underline">Xem raw JSON record đầu tiên</summary>
                      <pre className="mt-2 bg-gray-900 text-green-300 rounded-lg p-4 text-xs overflow-auto max-h-96">
                        {JSON.stringify(result.sample[0], null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* ── Tab: Sample records ── */}
              {activeTab === 'records' && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">
                    Hiển thị {result.sample.length}/{result.total} records. Khoảng thời gian: {result.startTime} → {result.endTime}
                  </p>
                  <div className="overflow-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {['Repair_ID','ProductName','Device_Code','RepairMan','RepairFinishMan','Repair_Description','Repair_Status_String','Repair_InDate','Repair_OutDate','WareHouseName'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.sample.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-1.5 font-mono text-gray-500">{r.Repair_ID}</td>
                            <td className="px-3 py-1.5 font-medium">{r.ProductName}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{r.Device_Code}</td>
                            <td className="px-3 py-1.5">{r.RepairMan}</td>
                            <td className="px-3 py-1.5">{r.RepairFinishMan}</td>
                            <td className="px-3 py-1.5 max-w-[200px] truncate" title={r.Repair_Description}>{r.Repair_Description}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                r.Repair_Status_String === 'Repaired' ? 'bg-green-100 text-green-700' :
                                r.Repair_Status_String === 'Repairing' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{r.Repair_Status_String}</span>
                            </td>
                            <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.Repair_InDate?.slice(0, 10)}</td>
                            <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.Repair_OutDate?.slice(0, 10)}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.WareHouseName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AnalysisTable({ title, data, colorClass }: {
  title: string
  data: AnalysisItem[]
  colorClass: string
}) {
  const max = data[0]?.count ?? 1
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="space-y-1.5">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-xs mb-0.5">
                <span className="truncate text-gray-700" title={d.name}>{d.name}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded-full font-semibold text-xs ${colorClass}`}>{d.count}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full bg-current opacity-40 ${colorClass.split(' ')[1]}`}
                  style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        {data.length === 0 && <p className="text-xs text-gray-400">Không có dữ liệu</p>}
      </div>
    </div>
  )
}
