'use client'

import { useState, useEffect, useMemo } from 'react'
import type { JiraBug } from '@/app/api/jira/bugs/route'

const REPORTER_COLORS: Record<string, string> = {
  Shiro: '#3b82f6', Stefan: '#8b5cf6', Kane: '#22c55e',
  Kyo: '#f59e0b', Irene: '#ec4899', Smoke: '#06b6d4', blue: '#6b7280',
}

function StatusBadge({ status, color }: { status: string; color: string }) {
  const cfg = {
    green: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
    blue:  { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
    gray:  { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  }[color] ?? { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
      {status || '—'}
    </span>
  )
}

function DueDateBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-300">—</span>
  const date = new Date(dateStr)
  const now  = new Date()
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000)
  const label = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (diff < 0)  return <span className="font-bold text-red-600 text-xs">⚠ {label}</span>
  if (diff <= 3) return <span className="font-bold text-orange-500 text-xs">⏰ {label}</span>
  return <span className="text-xs text-gray-700">{label}</span>
}

interface Props { userEmail: string; isAdmin: boolean }

export default function JiraBugsDashboard({ userEmail, isAdmin }: Props) {
  const [bugs, setBugs]       = useState<JiraBug[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [filterReporter, setFilterReporter] = useState('all')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [search, setSearch]                 = useState('')

  async function load() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/jira/bugs')
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setBugs(json.bugs ?? [])
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const reporters = useMemo(() => Array.from(new Set(bugs.map(b => b.reporter).filter(Boolean))).sort(), [bugs])
  const statuses  = useMemo(() => Array.from(new Set(bugs.map(b => b.status).filter(Boolean))).sort(), [bugs])

  const displayed = useMemo(() => bugs.filter(b => {
    if (filterReporter !== 'all' && b.reporter !== filterReporter) return false
    if (filterStatus   !== 'all' && b.status   !== filterStatus)   return false
    if (search) {
      const q = search.toLowerCase()
      return b.issue_key.toLowerCase().includes(q) ||
             b.summary.toLowerCase().includes(q) ||
             b.bug_type.toLowerCase().includes(q) ||
             b.reporter.toLowerCase().includes(q)
    }
    return true
  }), [bugs, filterReporter, filterStatus, search])

  const overdue = bugs.filter(b => {
    if (!b.due_date_jira) return false
    return new Date(b.due_date_jira) < new Date() && b.status_color !== 'green'
  }).length

  const noDueDate = bugs.filter(b => !b.due_date_jira).length

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center text-lg">🐛</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none">Jira Bug Tracker</h1>
              <p className="text-xs text-gray-400">{userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="px-3 py-2 text-sm border border-gray-200 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-40">
              {loading ? '⏳' : '🔄'} {loading ? 'Đang tải...' : 'Làm mới'}
            </button>
            {isAdmin && <a href="/admin/users" className="px-3 py-2 text-sm border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition">Admin</a>}
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-5">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-2 text-blue-600">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Đang tải dữ liệu từ Jira & Google Sheets...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700">{error}</div>
        )}

        {!loading && bugs.length > 0 && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 font-medium mb-1">Tổng Issues</p>
                <p className="text-2xl font-bold text-blue-600">{bugs.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-red-200 p-4" style={{ background: overdue > 0 ? '#fef2f2' : undefined }}>
                <p className="text-xs text-gray-500 font-medium mb-1">Quá hạn</p>
                <p className={`text-2xl font-bold ${overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{overdue}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 font-medium mb-1">Chưa có Due Date</p>
                <p className="text-2xl font-bold text-orange-500">{noDueDate}</p>
              </div>
              <div className="bg-white rounded-xl border border-green-200 p-4" style={{ background: '#f0fdf4' }}>
                <p className="text-xs text-gray-500 font-medium mb-1">Đã Done</p>
                <p className="text-2xl font-bold text-green-600">{bugs.filter(b => b.status_color === 'green').length}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm issue / summary / bug type..."
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={filterReporter} onChange={e => setFilterReporter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="all">Tất cả Reporter</option>
                {reporters.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="all">Tất cả Status</option>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-xs text-gray-400">{displayed.length}/{bugs.length} issues</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['#','Issue','Summary','Reporter','Loại Bug','Ngày tạo','Due Date (Sheet)','Due Date (Jira)','Done Date','Status Jira'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((bug, i) => {
                      const isOverdue = bug.due_date_jira && new Date(bug.due_date_jira) < new Date() && bug.status_color !== 'green'
                      return (
                        <tr key={bug.issue_key}
                          className={`border-b border-gray-100 last:border-0 ${isOverdue ? 'bg-red-50/50' : i % 2 === 1 ? 'bg-gray-50/30' : ''} hover:bg-blue-50/30 transition`}>
                          <td className="px-3 py-2.5 text-gray-400 font-mono">{bug.stt}</td>
                          <td className="px-3 py-2.5">
                            <a href={bug.link} target="_blank" rel="noopener noreferrer"
                              className="font-bold text-blue-600 hover:underline whitespace-nowrap">
                              {bug.issue_key}
                            </a>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 max-w-[260px]">
                            <span className="line-clamp-2" title={bug.summary}>{bug.summary || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-medium px-2 py-0.5 rounded-full text-white text-[10px]"
                              style={{ background: REPORTER_COLORS[bug.reporter] ?? '#6b7280' }}>
                              {bug.reporter || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{bug.bug_type || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{bug.ngay_tao || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{bug.due_date_sheet || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap"><DueDateBadge dateStr={bug.due_date_jira} /></td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{bug.done_date || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={bug.status} color={bug.status_color} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && !error && bugs.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🐛</div>
            <p>Không có dữ liệu — bấm Làm mới để tải</p>
          </div>
        )}
      </div>
    </div>
  )
}
