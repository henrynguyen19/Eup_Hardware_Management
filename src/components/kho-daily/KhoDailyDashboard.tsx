'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface DeviceQty { device: string; qty: number }
interface ThuHoiItem { loai: string; device: string; qty: number }
interface OtherTask { task: string; device: string; qty: number }

interface KhoRecord {
  id: number
  person_name: string
  entry_date: string
  week_label: string
  thanh_pham_total: number
  hang_gui_vp_total: number
  xuat_kho_total: number
  thu_hoi_total: number
  other_total: number
  thanh_pham_devices?: DeviceQty[]
  hang_gui_vp_devices?: DeviceQty[]
  xuat_kho_devices?: DeviceQty[]
  thu_hoi_details?: ThuHoiItem[]
  other_tasks?: OtherTask[]
}

type DateRange = '7d' | '30d' | 'month' | 'custom'
const PERSONS = ['Kai', 'Thor', 'Nick', 'Bop', 'Peter']
const CATEGORY_COLORS = {
  'UP Thành Phẩm': '#3b82f6',
  'Hàng Gửi VP': '#10b981',
  'Thu Hồi': '#ef4444',
  'Other': '#f59e0b',
}

function dateRangeFor(range: DateRange, customFrom?: string, customTo?: string): { from: string; to: string } {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const to = fmt(today)

  if (range === '7d') {
    const from = new Date(today); from.setDate(from.getDate() - 6)
    return { from: fmt(from), to }
  }
  if (range === '30d') {
    const from = new Date(today); from.setDate(from.getDate() - 29)
    return { from: fmt(from), to }
  }
  if (range === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: fmt(from), to }
  }
  return { from: customFrom || to, to: customTo || to }
}

export default function KhoDailyDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'import'>('overview')
  const [records, setRecords] = useState<KhoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [personFilter, setPersonFilter] = useState<string>('All')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // Import tab state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [clearFirst, setClearFirst] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ person: string; inserted: number; errors: string[] }[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = dateRangeFor(dateRange, customFrom, customTo)
      const params = new URLSearchParams({ from, to })
      if (personFilter !== 'All') params.set('person', personFilter)
      const res = await fetch(`/api/kho-daily/stats?${params}`)
      const data = await res.json()
      setRecords(data.records || [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [dateRange, customFrom, customTo, personFilter])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const totalsByCategory = {
    'UP Thành Phẩm': records.reduce((s, r) => s + (r.thanh_pham_total || 0), 0),
    'Hàng Gửi VP': records.reduce((s, r) => s + (r.hang_gui_vp_total || 0), 0),
    'Thu Hồi': records.reduce((s, r) => s + (r.thu_hoi_total || 0), 0),
    'Other': records.reduce((s, r) => s + (r.other_total || 0), 0),
  }

  const chartData = PERSONS.map(person => {
    const personRecords = records.filter(r => r.person_name === person)
    return {
      name: person,
      'UP Thành Phẩm': personRecords.reduce((s, r) => s + (r.thanh_pham_total || 0), 0),
      'Hàng Gửi VP': personRecords.reduce((s, r) => s + (r.hang_gui_vp_total || 0), 0),
      'Thu Hồi': personRecords.reduce((s, r) => s + (r.thu_hoi_total || 0), 0),
      'Other': personRecords.reduce((s, r) => s + (r.other_total || 0), 0),
    }
  })

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('clearFirst', String(clearFirst))
      const res = await fetch('/api/kho-daily/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportResult(data.results)
      fetchRecords()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  const sortedRecords = [...records].sort((a, b) => b.entry_date.localeCompare(a.entry_date))

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['overview', 'import'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'overview' ? 'Tổng quan' : 'Nhập liệu & Lịch sử'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Khoảng thời gian</label>
              <select
                value={dateRange}
                onChange={e => setDateRange(e.target.value as DateRange)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="7d">7 ngày qua</option>
                <option value="30d">30 ngày qua</option>
                <option value="month">Tháng này</option>
                <option value="custom">Tùy chọn</option>
              </select>
            </div>
            {dateRange === 'custom' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nhân viên</label>
              <select
                value={personFilter}
                onChange={e => setPersonFilter(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="All">Tất cả</option>
                {PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(totalsByCategory).map(([label, total]) => (
              <div key={label} className="bg-white rounded-lg shadow p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Stacked Bar Chart */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-3">Thống kê theo nhân viên</h3>
            {loading ? (
              <div className="text-center text-gray-400 py-8">Đang tải...</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Activity Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Hoạt động gần đây</h3>
            </div>
            {loading ? (
              <div className="text-center text-gray-400 py-8">Đang tải...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Ngày', 'Tuần', 'Người', 'UP TP', 'Hàng Gửi', 'Thu Hồi', 'Other', 'Tổng'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRecords.map(rec => (
                      <React.Fragment key={rec.id}>
                        <tr
                          onClick={() => setExpandedRow(expandedRow === rec.id ? null : rec.id)}
                          className="hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2 text-gray-700">{rec.entry_date}</td>
                          <td className="px-3 py-2 text-gray-500">{rec.week_label}</td>
                          <td className="px-3 py-2 font-medium text-blue-600">{rec.person_name}</td>
                          <td className="px-3 py-2">{rec.thanh_pham_total || 0}</td>
                          <td className="px-3 py-2">{rec.hang_gui_vp_total || 0}</td>
                          <td className="px-3 py-2">{rec.thu_hoi_total || 0}</td>
                          <td className="px-3 py-2">{rec.other_total || 0}</td>
                          <td className="px-3 py-2 font-semibold">
                            {(rec.thanh_pham_total || 0) + (rec.hang_gui_vp_total || 0) + (rec.thu_hoi_total || 0) + (rec.other_total || 0)}
                          </td>
                        </tr>
                        {expandedRow === rec.id && (
                          <tr>
                            <td colSpan={8} className="px-4 py-3 bg-blue-50">
                              <DetailPanel record={rec} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {sortedRecords.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-gray-400">Không có dữ liệu</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-700 mb-4">Nhập dữ liệu từ file Excel</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Chọn file Excel (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearFirst}
                  onChange={e => setClearFirst(e.target.checked)}
                  className="rounded"
                />
                Xóa dữ liệu cũ trước khi nhập
              </label>
              <button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="px-5 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Đang nhập...' : 'Nhập dữ liệu'}
              </button>
            </div>

            {importError && (
              <div className="mt-3 p-3 bg-red-50 text-red-700 rounded text-sm">{importError}</div>
            )}

            {importResult && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-700 mb-2">Kết quả nhập</h4>
                <table className="w-full text-sm border border-gray-200 rounded overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nhân viên</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Đã nhập</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importResult.map(r => (
                      <tr key={r.person}>
                        <td className="px-3 py-2 font-medium">{r.person}</td>
                        <td className="px-3 py-2 text-green-600">{r.inserted}</td>
                        <td className="px-3 py-2 text-red-600">{r.errors.join(', ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History table with device expansion */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Lịch sử dữ liệu</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Ngày', 'Tuần', 'Người', 'UP TP', 'Hàng Gửi', 'Thu Hồi', 'Other', 'Tổng'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRecords.slice(0, 50).map(rec => (
                    <React.Fragment key={rec.id}>
                      <tr
                        onClick={() => setExpandedRow(expandedRow === rec.id ? null : rec.id)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-700">{rec.entry_date}</td>
                        <td className="px-3 py-2 text-gray-500">{rec.week_label}</td>
                        <td className="px-3 py-2 font-medium text-blue-600">{rec.person_name}</td>
                        <td className="px-3 py-2">{rec.thanh_pham_total || 0}</td>
                        <td className="px-3 py-2">{rec.hang_gui_vp_total || 0}</td>
                        <td className="px-3 py-2">{rec.thu_hoi_total || 0}</td>
                        <td className="px-3 py-2">{rec.other_total || 0}</td>
                        <td className="px-3 py-2 font-semibold">
                          {(rec.thanh_pham_total || 0) + (rec.hang_gui_vp_total || 0) + (rec.thu_hoi_total || 0) + (rec.other_total || 0)}
                        </td>
                      </tr>
                      {expandedRow === rec.id && (
                        <tr>
                          <td colSpan={8} className="px-4 py-3 bg-blue-50">
                            <DetailPanel record={rec} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailPanel({ record }: { record: KhoRecord }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {record.thanh_pham_devices && record.thanh_pham_devices.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-blue-700 uppercase mb-2">UP Thành Phẩm</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.thanh_pham_devices.map((d, i) => (
                <tr key={i}><td className="py-0.5 text-gray-700">{d.device}</td><td className="py-0.5 text-right font-medium">{d.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.hang_gui_vp_devices && record.hang_gui_vp_devices.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-700 uppercase mb-2">Hàng Gửi VP</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.hang_gui_vp_devices.map((d, i) => (
                <tr key={i}><td className="py-0.5 text-gray-700">{d.device}</td><td className="py-0.5 text-right font-medium">{d.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.thu_hoi_details && record.thu_hoi_details.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-700 uppercase mb-2">Thu Hồi Thiết Bị</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Loại</th><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.thu_hoi_details.map((d, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      d.loai.toLowerCase().includes('dung duoc') || d.loai.toLowerCase().includes('dùng được')
                        ? 'bg-green-100 text-green-700'
                        : d.loai.toLowerCase().includes('khong') || d.loai.toLowerCase().includes('không')
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {d.loai || '—'}
                    </span>
                  </td>
                  <td className="py-0.5 text-gray-700">{d.device}</td>
                  <td className="py-0.5 text-right font-medium">{d.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.other_tasks && record.other_tasks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-700 uppercase mb-2">Công Việc Khác</h4>
          <table className="w-full text-xs">
            <thead><tr><th className="text-left pb-1 text-gray-500">Công việc</th><th className="text-left pb-1 text-gray-500">Thiết bị</th><th className="text-right pb-1 text-gray-500">SL</th></tr></thead>
            <tbody>
              {record.other_tasks.map((t, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-gray-700">{t.task}</td>
                  <td className="py-0.5 text-gray-500">{t.device}</td>
                  <td className="py-0.5 text-right font-medium">{t.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!record.thanh_pham_devices?.length && !record.hang_gui_vp_devices?.length &&
       !record.thu_hoi_details?.length && !record.other_tasks?.length && (
        <p className="text-xs text-gray-400 col-span-2">Không có chi tiết thiết bị</p>
      )}
    </div>
  )
}
