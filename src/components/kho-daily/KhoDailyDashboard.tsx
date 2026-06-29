'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface KhoRecord {
  id: string
  person_name: string
  entry_date: string
  week_label: string | null
  thanh_pham_total: number
  hang_gui_vp_total: number
  xuat_kho_total: number
  thu_hoi_total: number
  other_total: number
  thu_hoi_details: Array<{ loai: string; device: string; qty: number }>
  other_tasks: Array<{ task: string; device: string; qty: number }>
  created_at: string
  updated_at: string
}

interface ImportResult {
  person: string
  status: string
  rows?: number
}

interface Props {
  userEmail: string
  permissions: string[]
}

const PERSONS = ['Kai', 'Thor', 'Nick', 'Bop', 'Peter']

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getDateRange(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days + 1)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function KhoDailyDashboard({ userEmail: _userEmail, permissions }: Props) {
  const canWrite = permissions.includes('kho_daily:write') || permissions.includes('admin:users')

  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview')
  const [records, setRecords] = useState<KhoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Date filter
  const [rangeMode, setRangeMode] = useState<'7' | '30' | 'custom'>('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // History filter
  const [filterPerson, setFilterPerson] = useState('')

  // Import state
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null)
  const [clearFirst, setClearFirst] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let from = ''
      let to = ''
      if (rangeMode === '7') {
        const r = getDateRange(7)
        from = r.from; to = r.to
      } else if (rangeMode === '30') {
        const r = getDateRange(30)
        from = r.from; to = r.to
      } else {
        from = customFrom; to = customTo
      }

      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const res = await fetch(`/api/kho-daily/stats?${params}`)
      if (!res.ok) throw new Error('Lỗi tải dữ liệu')
      const json = await res.json()
      setRecords(json.records ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [rangeMode, customFrom, customTo])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  async function handleImport() {
    setImporting(true)
    setImportResults(null)
    try {
      const res = await fetch('/api/kho-daily/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_first: clearFirst }),
      })
      const json = await res.json()
      setImportResults(json.results ?? [])
      await fetchRecords()
    } catch (e) {
      setImportResults([{ person: 'system', status: 'error: ' + String(e) }])
    } finally {
      setImporting(false)
    }
  }

  // Compute KPI totals
  const totalThanhPham = records.reduce((s, r) => s + r.thanh_pham_total, 0)
  const totalHangGui   = records.reduce((s, r) => s + r.hang_gui_vp_total, 0)
  const totalThuHoi    = records.reduce((s, r) => s + r.thu_hoi_total, 0)
  const totalOther     = records.reduce((s, r) => s + r.other_total, 0)
  const grandTotal     = totalThanhPham + totalHangGui + totalThuHoi + totalOther

  // Per-person aggregates for chart
  const personAgg = PERSONS.map(p => {
    const pr = records.filter(r => r.person_name === p)
    return {
      name: p,
      'UP Thành Phẩm': pr.reduce((s, r) => s + r.thanh_pham_total, 0),
      'Hàng Gửi VP': pr.reduce((s, r) => s + r.hang_gui_vp_total, 0),
      'Thu Hồi': pr.reduce((s, r) => s + r.thu_hoi_total, 0),
      'Other': pr.reduce((s, r) => s + r.other_total, 0),
    }
  }).filter(p => p['UP Thành Phẩm'] + p['Hàng Gửi VP'] + p['Thu Hồi'] + p['Other'] > 0)

  // Filtered records for history tab
  const historyRecords = filterPerson
    ? records.filter(r => r.person_name === filterPerson)
    : records

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">📋 Công việc Kho hàng ngày</h1>
            <p className="text-sm text-gray-500 mt-0.5">Theo dõi hoạt động UP Thành Phẩm, Thu Hồi và các việc khác</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchRecords}
              disabled={loading}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
              Làm mới
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-100 -mb-4">
          {([
            { key: 'overview', label: 'Tổng quan' },
            { key: 'history',  label: 'Nhập liệu / Lịch sử' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">

        {/* Date range filter */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-600">Khoảng thời gian:</span>
          {(['7', '30'] as const).map(d => (
            <button
              key={d}
              onClick={() => setRangeMode(d)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors font-medium ${
                rangeMode === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d === '7' ? '7 ngày' : '30 ngày'}
            </button>
          ))}
          <button
            onClick={() => setRangeMode('custom')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors font-medium ${
              rangeMode === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tuỳ chọn
          </button>
          {rangeMode === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <span className="text-gray-400 text-sm">→</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <button
                onClick={fetchRecords}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                Lọc
              </button>
            </div>
          )}
          <span className="text-xs text-gray-400 ml-auto">{records.length} bản ghi</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* ── TAB: OVERVIEW ── */}
        {activeTab === 'overview' && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Tổng cộng',     value: grandTotal,     color: 'bg-blue-600',   text: 'text-blue-600',   bg: 'bg-blue-50' },
                { label: 'UP Thành Phẩm', value: totalThanhPham, color: 'bg-green-600',  text: 'text-green-600',  bg: 'bg-green-50' },
                { label: 'Hàng Gửi VP',   value: totalHangGui,   color: 'bg-purple-600', text: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Thu Hồi',       value: totalThuHoi,    color: 'bg-orange-500', text: 'text-orange-600', bg: 'bg-orange-50' },
                { label: 'Other',         value: totalOther,     color: 'bg-gray-500',   text: 'text-gray-600',   bg: 'bg-gray-50' },
              ].map(kpi => (
                <div key={kpi.label} className={`rounded-xl border border-gray-200 p-4 ${kpi.bg}`}>
                  <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${kpi.text}`}>{kpi.value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Stacked Bar Chart */}
            {personAgg.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Hoạt động theo người</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={personAgg} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="UP Thành Phẩm" stackId="a" fill="#16a34a" radius={[0,0,0,0]} />
                    <Bar dataKey="Hàng Gửi VP"   stackId="a" fill="#9333ea" radius={[0,0,0,0]} />
                    <Bar dataKey="Thu Hồi"        stackId="a" fill="#ea580c" radius={[0,0,0,0]} />
                    <Bar dataKey="Other"          stackId="a" fill="#6b7280" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent records table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Bản ghi gần đây</h2>
              </div>
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">Đang tải...</div>
                ) : records.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">Không có dữ liệu</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Ngày</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Người</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">UP Thành Phẩm</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Hàng Gửi VP</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Thu Hồi</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Other</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Tổng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {records.slice(0, 50).map(r => {
                        const total = r.thanh_pham_total + r.hang_gui_vp_total + r.thu_hoi_total + r.other_total
                        return (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                {r.person_name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.thanh_pham_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.hang_gui_vp_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.thu_hoi_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.other_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{total || '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── TAB: HISTORY / IMPORT ── */}
        {activeTab === 'history' && (
          <>
            {/* Import section (write only) */}
            {canWrite && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-700">Nhập dữ liệu từ Google Sheets</h2>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={clearFirst}
                      onChange={e => setClearFirst(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    Xóa toàn bộ dữ liệu cũ trước khi nhập
                  </label>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {importing ? (
                      <>
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        Đang nhập...
                      </>
                    ) : (
                      <>📥 Nhập từ Sheets</>
                    )}
                  </button>
                </div>

                {importResults && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Người</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Trạng thái</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Số dòng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importResults.map(r => (
                          <tr key={r.person} className={r.status.startsWith('error') ? 'bg-red-50' : ''}>
                            <td className="px-4 py-2 font-medium text-gray-700">{r.person}</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs font-medium ${r.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                                {r.status === 'ok' ? '✓ Thành công' : r.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">{r.rows ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* History filter + table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-700">Lịch sử bản ghi</h2>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <span className="text-xs text-gray-500">Lọc người:</span>
                  <select
                    value={filterPerson}
                    onChange={e => setFilterPerson(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">Tất cả</option>
                    {PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">Đang tải...</div>
                ) : historyRecords.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">Không có dữ liệu</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Ngày</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Tuần</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Người</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">UP Thành Phẩm</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Hàng Gửi VP</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Thu Hồi</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Other</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 text-xs text-right">Tổng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {historyRecords.map(r => {
                        const total = r.thanh_pham_total + r.hang_gui_vp_total + r.thu_hoi_total + r.other_total
                        return (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{r.week_label || '-'}</td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                {r.person_name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.thanh_pham_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.hang_gui_vp_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.thu_hoi_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{r.other_total || '-'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{total || '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
