'use client'

import { useState, useEffect, useMemo } from 'react'
import type { JiraBug } from '@/app/api/jira/bugs/route'

const REPORTER_COLORS: Record<string, string> = {
  Shiro: '#3b82f6', Stefan: '#8b5cf6', Kane: '#22c55e',
  Kyo: '#f59e0b', Irene: '#ec4899', Smoke: '#06b6d4',
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

function DueDateBadge({ dateStr, source }: { dateStr: string | null; source?: string }) {
  if (!dateStr) return <span className="text-gray-300 text-xs">—</span>
  const date = new Date(dateStr)
  const now  = new Date()
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000)
  const label = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const fromLinked = source && source.startsWith('linked:')
  const linkedKey  = fromLinked ? source!.replace('linked:', '') : null

  const badge = diff < 0
    ? <span className="font-bold text-red-600 text-xs">⚠ {label}</span>
    : diff <= 3
      ? <span className="font-bold text-orange-500 text-xs">⏰ {label}</span>
      : <span className="text-xs text-gray-700">{label}</span>

  return (
    <div className="flex flex-col gap-0.5">
      {badge}
      {linkedKey && (
        <span className="text-[10px] text-blue-400" title={`Due date lấy từ linked issue ${linkedKey}`}>
          ↗ {linkedKey}
        </span>
      )}
    </div>
  )
}

function AssigneeBadge({ name, source }: { name: string | null; source?: string }) {
  if (!name) return <span className="text-gray-300 text-xs">—</span>
  const fromLinked = source && source.startsWith('linked:')
  const linkedKey  = fromLinked ? source!.replace('linked:', '') : null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-700 font-medium">{name}</span>
      {linkedKey && (
        <span className="text-[10px] text-blue-400" title={`Assignee lấy từ linked issue ${linkedKey}`}>
          ↗ {linkedKey}
        </span>
      )}
    </div>
  )
}

export default function JiraBugsTab() {
  const [bugs, setBugs]       = useState<JiraBug[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [filterReporter, setFilterReporter] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [search, setSearch]                 = useState('')
  const [showClosed, setShowClosed]         = useState(false)
  const [expandedKey, setExpandedKey]       = useState<string | null>(null)

  // Status names considered "closed"
  const CLOSED_STATUSES = ['done', 'closed', 'resolved', 'cancelled', 'canceled', 'won\'t fix', 'duplicate']
  const isClosed = (status: string) => CLOSED_STATUSES.some(s => status.toLowerCase().includes(s))

  async function load() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/jira/bugs')
      const json = await res.json()
      if (json.error) { setError(json.error + (json.debug ? '\n' + JSON.stringify(json.debug, null, 2) : '')); return }
      setBugs(json.bugs ?? [])
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const reporters = useMemo(() => Array.from(new Set(bugs.map(b => b.reporter).filter(Boolean))).sort(), [bugs])
  const statuses  = useMemo(() => Array.from(new Set(bugs.map(b => b.status).filter(Boolean))).sort(), [bugs])
  const assignees = useMemo(() => Array.from(new Set(bugs.map(b => b.assignee).filter(Boolean))).sort(), [bugs])

  const displayed = useMemo(() => bugs.filter(b => {
    if (!showClosed && isClosed(b.status))             return false
    if (filterReporter !== 'all' && b.reporter !== filterReporter) return false
    if (filterAssignee !== 'all' && b.assignee  !== filterAssignee) return false
    if (search) {
      const q = search.toLowerCase()
      return b.issue_key.toLowerCase().includes(q) ||
             b.summary.toLowerCase().includes(q) ||
             b.bug_type.toLowerCase().includes(q) ||
             (b.assignee ?? '').toLowerCase().includes(q)
    }
    return true
  }), [bugs, filterReporter, filterAssignee, search, showClosed])

  const openBugs  = useMemo(() => bugs.filter(b => !isClosed(b.status)), [bugs])
  const overdue   = openBugs.filter(b => b.due_date_jira && new Date(b.due_date_jira) < new Date()).length
  const noDueDate = openBugs.filter(b => !b.due_date_jira).length
  const closedCount = bugs.length - openBugs.length

  return (
    <div className="space-y-5">
      {loading && (
        <div className="flex items-center justify-center py-20 gap-2 text-blue-600">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Đang tải dữ liệu từ Jira & Google Sheets...</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700 whitespace-pre-wrap">{error}</div>
      )}

      {!loading && bugs.length > 0 && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800 text-lg">🐛 Jira Bug Tracker</h2>
              <p className="text-xs text-gray-400">{bugs.length} issues — duedate & assignee lấy từ parent hoặc linked work item</p>
            </div>
            <button onClick={load} disabled={loading}
              className="px-3 py-2 text-sm border border-gray-200 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-40">
              🔄 Làm mới
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Đang mở</p>
              <p className="text-2xl font-bold text-blue-600">{openBugs.length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4" style={{ background: overdue > 0 ? '#fef2f2' : undefined, borderColor: overdue > 0 ? '#fecaca' : '#e5e7eb' }}>
              <p className="text-xs text-gray-500 font-medium mb-1">Quá hạn</p>
              <p className={`text-2xl font-bold ${overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{overdue}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Chưa có Due Date</p>
              <p className="text-2xl font-bold text-orange-500">{noDueDate}</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 p-4" style={{ background: '#f0fdf4' }}>
              <p className="text-xs text-gray-500 font-medium mb-1">Đã đóng</p>
              <p className="text-2xl font-bold text-green-600">{closedCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Tổng</p>
              <p className="text-2xl font-bold text-gray-500">{bugs.length}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm issue / summary / assignee..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={filterReporter} onChange={e => setFilterReporter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="all">Tất cả Reporter</option>
              {reporters.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="all">Tất cả Assignee</option>
              {assignees.map(a => <option key={a!} value={a!}>{a}</option>)}
            </select>
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer select-none transition ${
              showClosed ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-500'
            }`}>
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="accent-green-600" />
              Hiện đã đóng ({closedCount})
            </label>
            <span className="text-xs text-gray-400">{displayed.length} issues</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['#','Issue','Summary','Reporter','Assignee','Loại Bug','Ngày tạo','Due Date (Sheet)','Due Date (Jira)','Done Date','Status','Links'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((bug, i) => {
                    const isOverdue = bug.due_date_jira && new Date(bug.due_date_jira) < new Date() && bug.status_color !== 'green'
                    const isExpanded = expandedKey === bug.issue_key
                    return (
                      <>
                        <tr key={bug.issue_key}
                          className={`border-b border-gray-100 ${isOverdue ? 'bg-red-50/50' : i % 2 === 1 ? 'bg-gray-50/30' : ''} hover:bg-blue-50/30 transition`}>
                          <td className="px-3 py-2.5 text-gray-400 font-mono">{bug.stt}</td>
                          <td className="px-3 py-2.5">
                            <a href={bug.link} target="_blank" rel="noopener noreferrer"
                              className="font-bold text-blue-600 hover:underline whitespace-nowrap">
                              {bug.issue_key}
                            </a>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 max-w-[220px]">
                            <span className="line-clamp-2" title={bug.summary}>{bug.summary || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-medium px-2 py-0.5 rounded-full text-white text-[10px]"
                              style={{ background: REPORTER_COLORS[bug.reporter] ?? '#6b7280' }}>
                              {bug.reporter || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <AssigneeBadge name={bug.assignee} source={bug.assignee_source} />
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{bug.bug_type || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{bug.ngay_tao || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{bug.due_date_sheet || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <DueDateBadge dateStr={bug.due_date_jira} source={bug.due_date_source} />
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{bug.done_date || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={bug.status} color={bug.status_color} /></td>
                          <td className="px-3 py-2.5">
                            {bug.linked_issues.length > 0 && (
                              <button onClick={() => setExpandedKey(isExpanded ? null : bug.issue_key)}
                                className="text-blue-500 hover:text-blue-700 text-[10px] whitespace-nowrap">
                                {isExpanded ? '▲' : '▼'} {bug.linked_issues.length} links
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && bug.linked_issues.map(li => (
                          <tr key={li.key} className="bg-blue-50/40 border-b border-blue-100">
                            <td className="px-3 py-2 pl-8 text-blue-300">↗</td>
                            <td className="px-3 py-2">
                              <a href={`https://euptw.atlassian.net/browse/${li.key}`} target="_blank" rel="noopener noreferrer"
                                className="text-blue-500 hover:underline font-mono text-[11px]">{li.key}</a>
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-[220px]" colSpan={2}>
                              <span className="line-clamp-1" title={li.summary}>{li.summary}</span>
                            </td>
                            <td className="px-3 py-2">
                              {li.assignee
                                ? <span className="text-xs text-gray-700">{li.assignee}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td colSpan={3} />
                            <td className="px-3 py-2">
                              <DueDateBadge dateStr={li.duedate} />
                            </td>
                            <td colSpan={2} />
                            <td className="px-3 py-2">
                              <StatusBadge status={li.status} color={
                                li.status.toLowerCase().includes('done') || li.status.toLowerCase().includes('closed') ? 'green'
                                : li.status.toLowerCase().includes('progress') ? 'blue' : 'gray'
                              } />
                            </td>
                          </tr>
                        ))}
                      </>
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
          <button onClick={load} className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">
            Tải dữ liệu
          </button>
        </div>
      )}
    </div>
  )
}
