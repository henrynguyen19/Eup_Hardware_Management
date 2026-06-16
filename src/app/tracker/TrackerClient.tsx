'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, AlertTriangle, ArrowUpDown, Trash2 } from 'lucide-react'
import type { Issue } from './page'
import IssueDetailDialog from '@/components/IssueDetailDialog'
import NewIssueDialog from '@/components/NewIssueDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Props {
  initialIssues: Issue[]
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  onMyTasksCountChange?: (count: number) => void
}

const PRIORITY_PILL: Record<string, { label: string; cls: string }> = {
  high:   { label: 'Khẩn cấp', cls: 'bg-red-50 text-red-600 border border-red-200' },
  medium: { label: '重要', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  low:    { label: '普通', cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border border-[rgba(122,82,48,.15)]' },
}

const COLUMNS = [
  { key: 'Chờ xử lý', label: 'Chờ xử lý' },
  { key: 'Đang thực hiện', label: 'Đang thực hiện' },
  { key: '等待Trung bình', label: '等待Trung bình' },
  { key: 'Hoàn thành', label: 'Hoàn thành' },
] as const

const P_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueDateChip(due: string | null): { label: string; cls: string } | null {
  if (!due) return null
  const today = todayStr()
  const [, m, day] = due.split('-')
  const label = `${m}/${day}`
  if (due < today) return { label: `⚠ ${label}`, cls: 'bg-red-50 text-red-600 border-red-200' }
  if (due === today) return { label: '今天', cls: 'bg-amber-50 text-amber-600 border-amber-200' }
  return { label, cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border-[rgba(122,82,48,.15)]' }
}

function sortByPriorityThenDue(a: Issue, b: Issue) {
  const pd = (P_ORDER[a.priority] ?? 2) - (P_ORDER[b.priority] ?? 2)
  if (pd !== 0) return pd
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

export default function TrackerClient({
  initialIssues,
  permissions,
  userEmail,
  allowedEmails,
  issueTypes,
  issueTags,
  onMyTasksCountChange,
}: Props) {
  const searchParams = useSearchParams()

  const canCreateIssues = permissions.includes('create_issues')
  const canViewMyTasks  = permissions.includes('view_my_tasks')

  const [issues,               setIssues]               = useState<Issue[]>(initialIssues)
  const [myTasksOnly,          setMyTasksOnly]          = useState(() => searchParams.get('tab') === 'my')
  const [filterPriority,       setFilterPriority]       = useState<'' | 'high' | 'medium' | 'low'>('')
  const [selectedIssue,        setSelectedIssue]        = useState<Issue | null>(null)
  const [newIssueOpen,         setNewIssueOpen]         = useState(false)
  const [newIssueStatus,       setNewIssueStatus]       = useState('Chờ xử lý')
  const [draggingId,           setDraggingId]           = useState<string | null>(null)
  const [dragOverCol,          setDragOverCol]          = useState<string | null>(null)
  const [dragOverIssueId,      setDragOverIssueId]      = useState<string | null>(null)
  const [confirmClearOpen,     setConfirmClearOpen]     = useState(false)
  const [confirmDeleteIssueId, setConfirmDeleteIssueId] = useState<string | null>(null)
  const [clearingCompleted,    setClearingCompleted]    = useState(false)
  const [deletingIssueId,      setDeletingIssueId]      = useState<string | null>(null)

  const myPendingCount = useMemo(() =>
    issues.filter(i => i.status !== 'Hoàn thành' && i.assignee_emails.includes(userEmail)).length,
  [issues, userEmail])

  useEffect(() => {
    onMyTasksCountChange?.(myPendingCount)
  }, [myPendingCount, onMyTasksCountChange])

  // 依Lọc後的 base list
  const baseIssues = useMemo(() => {
    let list = issues
    if (myTasksOnly)    list = list.filter(i => i.assignee_emails.includes(userEmail))
    if (filterPriority) list = list.filter(i => i.priority === filterPriority)
    return list
  }, [issues, myTasksOnly, filterPriority, userEmail])

  // 分欄（依 sort_order sắp xếp，null 排最後）
  const columnIssues = useMemo(() => {
    const map: Record<string, Issue[]> = {}
    for (const col of COLUMNS) {
      map[col.key] = baseIssues
        .filter(i => i.status === col.key)
        .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
    }
    return map
  }, [baseIssues])

  // Ưu tiên級計數（未Hoàn thành、不受 priority filter 影響）
  const priCounts = useMemo(() => {
    const base = (myTasksOnly
      ? issues.filter(i => i.status !== 'Hoàn thành' && i.assignee_emails.includes(userEmail))
      : issues.filter(i => i.status !== 'Hoàn thành'))
    return {
      all:    base.length,
      high:   base.filter(i => i.priority === 'high').length,
      medium: base.filter(i => i.priority === 'medium').length,
      low:    base.filter(i => i.priority === 'low').length,
    }
  }, [issues, myTasksOnly, userEmail])

  // 提醒：逾期 + 今日（未Hoàn thành）
  const today = todayStr()
  const reminders = useMemo(() => {
    const base = (myTasksOnly
      ? issues.filter(i => i.status !== 'Hoàn thành' && i.assignee_emails.includes(userEmail))
      : issues.filter(i => i.status !== 'Hoàn thành'))
    return {
      overdue: base.filter(i => i.due_date && i.due_date < today),
      today:   base.filter(i => i.due_date === today),
    }
  }, [issues, myTasksOnly, userEmail, today])

  const handleIssueCreated = useCallback((newIssue: Issue) => {
    setIssues(prev => [newIssue, ...prev])
    setNewIssueOpen(false)
  }, [])

  const handleIssueUpdated = useCallback((updated: Issue) => {
    setIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelectedIssue(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  const handleIssueDeleted = useCallback((id: string) => {
    setIssues(prev => prev.filter(i => i.id !== id))
    setSelectedIssue(null)
  }, [])

  const handleSort = useCallback(() => {
    setIssues(prev => {
      const colOrder = COLUMNS.reduce((acc, c, i) => ({ ...acc, [c.key]: i }), {} as Record<string, number>)
      return [...prev].sort((a, b) => {
        const cd = (colOrder[a.status] ?? 0) - (colOrder[b.status] ?? 0)
        return cd !== 0 ? cd : sortByPriorityThenDue(a, b)
      })
    })
  }, [])

  const openNewIssue = useCallback((status = 'Chờ xử lý') => {
    setNewIssueStatus(status)
    setNewIssueOpen(true)
  }, [])

  const handleClearCompleted = useCallback(async () => {
    const completedIssues = issues.filter(i => i.status === 'Hoàn thành')
    setClearingCompleted(true)
    try {
      await Promise.all(
        completedIssues.map(issue =>
          fetch(`/api/issues/${issue.id}`, { method: 'DELETE' })
        )
      )
      setIssues(prev => prev.filter(i => i.status !== 'Hoàn thành'))
    } finally {
      setClearingCompleted(false)
      setConfirmClearOpen(false)
    }
  }, [issues])

  const handleDeleteIssue = useCallback(async (id: string) => {
    setDeletingIssueId(id)
    try {
      await fetch(`/api/issues/${id}`, { method: 'DELETE' })
      setIssues(prev => prev.filter(i => i.id !== id))
    } finally {
      setDeletingIssueId(null)
      setConfirmDeleteIssueId(null)
    }
  }, [])

  const handleDrop = useCallback(async (targetStatus: string) => {
    if (!draggingId) return
    const issue = issues.find(i => i.id === draggingId)
    if (!issue) {
      setDraggingId(null); setDragOverCol(null); setDragOverIssueId(null)
      return
    }

    const id = draggingId
    const hoverId = dragOverIssueId
    setDraggingId(null)
    setDragOverCol(null)
    setDragOverIssueId(null)

    // ── 跨欄拖曳（原有邏輯）──
    if (issue.status !== targetStatus) {
      const originalStatus = issue.status
      setIssues(prev => prev.map(i => i.id === id ? { ...i, status: targetStatus } : i))
      try {
        const res = await fetch(`/api/issues/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus }),
        })
        if (!res.ok) throw new Error('Failed')
      } catch {
        setIssues(prev => prev.map(i => i.id === id ? { ...i, status: originalStatus } : i))
      }
      return
    }

    // ── 同欄sắp xếp（Thêm mới邏輯）──
    if (hoverId && hoverId !== id) {
      const colItems = issues
        .filter(i => i.status === targetStatus)
        .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
      const draggingIdx = colItems.findIndex(i => i.id === id)
      const hoverIdx = colItems.findIndex(i => i.id === hoverId)
      if (draggingIdx === -1 || hoverIdx === -1) return

      // 移除被拖曳的項目，插入到 hover 目標之前
      const reordered = [...colItems]
      const [dragged] = reordered.splice(draggingIdx, 1)
      const insertIdx = reordered.findIndex(i => i.id === hoverId)
      reordered.splice(insertIdx, 0, dragged)

      // 重新分配 sort_order（等差 1000，留空間之後插入）
      const orders = reordered.map((item, idx) => ({ id: item.id, sort_order: (idx + 1) * 1000 }))
      const sortMap = Object.fromEntries(orders.map(o => [o.id, o.sort_order]))
      const originalSortMap = Object.fromEntries(colItems.map(i => [i.id, i.sort_order ?? null]))

      // 樂觀Cập nhật
      setIssues(prev => prev.map(i =>
        sortMap[i.id] !== undefined ? { ...i, sort_order: sortMap[i.id] } : i
      ))

      // 持久化
      try {
        const res = await fetch('/api/issues/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders }),
        })
        if (!res.ok) throw new Error('Failed')
      } catch {
        // Rollback
        setIssues(prev => prev.map(i =>
          originalSortMap[i.id] !== undefined
            ? { ...i, sort_order: originalSortMap[i.id] ?? undefined }
            : i
        ))
      }
    }
  }, [draggingId, dragOverIssueId, issues])

  const hasReminders = reminders.overdue.length > 0 || reminders.today.length > 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">

      {/* ── 頂部控制列 ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Tất cả / 我的任務 toggle */}
        <div className="flex items-center gap-1 bg-white border border-[rgba(122,82,48,.15)] rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setMyTasksOnly(false)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              !myTasksOnly ? 'bg-[#7a5230] text-white font-medium' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
            }`}
          >
            Tất cả
          </button>
          {canViewMyTasks && (
            <button
              onClick={() => setMyTasksOnly(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                myTasksOnly ? 'bg-[#7a5230] text-white font-medium' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
              }`}
            >
              我的任務
              {myPendingCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full font-semibold ${
                  myTasksOnly ? 'bg-white/20 text-white' : 'bg-[#7a5230] text-white'
                }`}>
                  {myPendingCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* sắp xếp + Thêm mới（右側） */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleSort}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#6b4f38] border border-[rgba(122,82,48,.2)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors bg-white"
            title="依Ưu tiên級＋ngàysắp xếp各欄（一次性）"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            sắp xếp
          </button>
          {canCreateIssues && (
            <button
              onClick={() => openNewIssue()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.25)]"
            >
              <Plus className="h-4 w-4" />
              Thêm mới任務
            </button>
          )}
        </div>
      </div>

      {/* ── Ưu tiên級Lọc chips ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-[#a08060]">Ưu tiên級：</span>
        {(
          [
            { key: '' as const,        label: 'Tất cả',  count: priCounts.all    },
            { key: 'high' as const,    label: 'Khẩn cấp',  count: priCounts.high   },
            { key: 'medium' as const,  label: '重要',  count: priCounts.medium },
            { key: 'low' as const,     label: '普通',  count: priCounts.low    },
          ] as const
        ).map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilterPriority(chip.key)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-all ${
              filterPriority === chip.key
                ? chip.key === 'high'   ? 'bg-[rgba(181,69,27,.18)] border-[rgba(181,69,27,.35)] text-[#b5451b] font-medium'
                : chip.key === 'medium' ? 'bg-[rgba(156,107,66,.18)] border-[rgba(156,107,66,.35)] text-[#7a5230] font-medium'
                : chip.key === 'low'    ? 'bg-[rgba(122,82,48,.14)] border-[rgba(122,82,48,.3)] text-[#a08060] font-medium'
                :                         'bg-[#7a5230] border-[#7a5230] text-white font-medium'
                : 'bg-white border-[rgba(122,82,48,.2)] text-[#6b4f38] hover:border-[rgba(122,82,48,.4)]'
            }`}
          >
            {chip.label}
            <span className="opacity-70 ml-0.5">{chip.count}</span>
          </button>
        ))}
      </div>

      {/* ── 提醒橫幅 ── */}
      {hasReminders && (
        <div className="mb-4 bg-[#fdf4f0] border border-[rgba(201,74,46,.3)] rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-[#c94a2e] shrink-0" />
            <span className="text-xs font-semibold text-[#c94a2e] tracking-wider">待Hoàn thành提醒</span>
          </div>
          <ul className="space-y-1">
            {reminders.today.map(i => (
              <li key={i.id} className="text-xs text-[#4a3422] flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-3 w-3 text-[#c94a2e] shrink-0" />
                <span>[今日] {i.title}</span>
                {i.assignees.length > 0 && <span className="text-[#a08060]">@ {i.assignees.join('、')}</span>}
              </li>
            ))}
            {reminders.overdue.map(i => {
              const days = Math.round((new Date(today).getTime() - new Date(i.due_date!).getTime()) / 86400000)
              return (
                <li key={i.id} className="text-xs text-[#4a3422] flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="h-3 w-3 text-[#c94a2e] shrink-0" />
                  <span>[逾期 +{days}天] {i.title}</span>
                  {i.assignees.length > 0 && <span className="text-[#a08060]">@ {i.assignees.join('、')}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Kanban 看板 ── */}
      <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
      <div className="grid grid-cols-4 gap-3 min-w-[700px]">
        {COLUMNS.map(col => {
          const colItems = columnIssues[col.key] ?? []
          return (
            <div
              key={col.key}
              className={`bg-[#fdf5ec] rounded-xl border shadow-sm flex flex-col transition-colors ${dragOverCol === col.key ? 'border-2 border-[#c49a72]' : 'border border-[rgba(122,82,48,.12)]'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); setDragOverIssueId(null) }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null)
              }}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.key) }}
            >
              {/* 欄Tiêu đề */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(122,82,48,.08)]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#4a3422]">{col.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] bg-[rgba(122,82,48,.07)] text-[#a08060] px-2 py-0.5 rounded-full border border-[rgba(122,82,48,.12)]">
                    {colItems.length}
                  </span>
                  {col.key === 'Hoàn thành' && colItems.length > 0 && (
                    <button
                      onClick={() => setConfirmClearOpen(true)}
                      className="text-[10px] text-[#a08060] hover:text-[#b5451b] transition-colors px-1.5 py-0.5 rounded hover:bg-[rgba(181,69,27,.06)]"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {/* 卡片列表 */}
              <div className="flex-1 p-2 space-y-2 min-h-[100px]">
                {colItems.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-[#c0a882] text-xs">
                    無項目
                  </div>
                ) : (
                  colItems.map(issue => {
                    const due = dueDateChip(issue.due_date)
                    // 拖曳Trung bình、同欄、懸停在此卡上 → Hiển thị插入指示條
                    const draggedIssue = draggingId ? issues.find(i => i.id === draggingId) : null
                    const isSameColDrag = draggedIssue?.status === col.key
                    const isInsertTarget = isSameColDrag && dragOverIssueId === issue.id && draggingId !== issue.id
                    return (
                      <div key={issue.id}>
                        {/* 插入位置指示條 */}
                        {isInsertTarget && (
                          <div className="h-0.5 bg-[#c49a72] rounded-full mb-1 mx-0.5" />
                        )}
                        {col.key === 'Hoàn thành' ? (
                          /* 已Hoàn thành欄：改用 div（避免 button 巢狀 button） */
                          <div
                            onClick={() => setSelectedIssue(issue)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedIssue(issue) } }}
                            draggable={true}
                            onDragStart={() => setDraggingId(issue.id)}
                            onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIssueId(null) }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDragOverCol(col.key)
                              if (draggingId) {
                                const dragged = issues.find(i => i.id === draggingId)
                                if (dragged?.status === col.key) {
                                  setDragOverIssueId(issue.id)
                                }
                              }
                            }}
                            className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all cursor-pointer group bg-[rgba(122,82,48,.03)] border-[rgba(122,82,48,.08)] opacity-75 hover:opacity-100 ${draggingId === issue.id ? 'opacity-50 cursor-grabbing' : ''}`}
                          >
                            {/* Tiêu đề行 */}
                            <div className="flex items-start gap-1.5 mb-1.5">
                              <span className="flex-1 text-xs font-medium leading-snug break-words line-through text-[#a08060]">
                                {issue.title}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteIssueId(issue.id) }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-[#c0a882] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.06)]"
                                title="Xóa"
                                disabled={deletingIssueId === issue.id}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            {/* meta 行 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {PRIORITY_PILL[issue.priority] && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[issue.priority].cls}`}>
                                  {PRIORITY_PILL[issue.priority].label}
                                </span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]">
                                {issue.type}
                              </span>
                              {due && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${due.cls}`}>
                                  {due.label}
                                </span>
                              )}
                              {issue.assignees.length > 0 && (
                                <span className="text-[10px] text-[#a08060] truncate max-w-[90px]" title={issue.assignees.join('、')}>
                                  @ {issue.assignees.join('、')}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Khác欄：維持原本 button 結構 */
                          <button
                            onClick={() => setSelectedIssue(issue)}
                            draggable={true}
                            onDragStart={() => setDraggingId(issue.id)}
                            onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIssueId(null) }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDragOverCol(col.key)
                              if (draggingId) {
                                const dragged = issues.find(i => i.id === draggingId)
                                if (dragged?.status === col.key) {
                                  setDragOverIssueId(issue.id)
                                }
                              }
                            }}
                            className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all cursor-pointer group bg-[#faf6f0] border-[rgba(122,82,48,.12)] hover:border-[rgba(122,82,48,.35)] hover:shadow-[2px_2px_0_rgba(122,82,48,.1)] hover:-translate-x-px hover:-translate-y-px ${draggingId === issue.id ? 'opacity-50 cursor-grabbing' : ''}`}
                          >
                            {/* Tiêu đề行 */}
                            <div className="flex items-start gap-1.5 mb-1.5">
                              <span className="flex-1 text-xs font-medium leading-snug break-words text-[#2c1e12]">
                                {issue.title}
                              </span>
                            </div>
                            {/* meta 行 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {PRIORITY_PILL[issue.priority] && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[issue.priority].cls}`}>
                                  {PRIORITY_PILL[issue.priority].label}
                                </span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]">
                                {issue.type}
                              </span>
                              {due && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${due.cls}`}>
                                  {due.label}
                                </span>
                              )}
                              {issue.assignees.length > 0 && (
                                <span className="text-[10px] text-[#a08060] truncate max-w-[90px]" title={issue.assignees.join('、')}>
                                  @ {issue.assignees.join('、')}
                                </span>
                              )}
                            </div>
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Thêm mới到此欄 */}
              {canCreateIssues && (
                <button
                  onClick={() => openNewIssue(col.key)}
                  className="mx-2 mb-2 py-1.5 text-[11px] text-[#a08060] border border-dashed border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] hover:bg-[rgba(122,82,48,.03)] transition-all"
                >
                  + Thêm mới到此欄
                </button>
              )}
            </div>
          )
        })}
      </div>
      </div>

      {/* ── Issue 詳細 Dialog ── */}
      {selectedIssue && (
        <IssueDetailDialog
          open={!!selectedIssue}
          issue={selectedIssue}
          permissions={permissions}
          userEmail={userEmail}
          allowedEmails={allowedEmails}
          issueTypes={issueTypes}
          issueTags={issueTags}
          onClose={() => setSelectedIssue(null)}
          onUpdated={handleIssueUpdated}
          onDeleted={handleIssueDeleted}
        />
      )}

      {/* ── Thêm mới Dialog ── */}
      {canCreateIssues && (
        <NewIssueDialog
          open={newIssueOpen}
          onClose={() => setNewIssueOpen(false)}
          onCreated={handleIssueCreated}
          issueTypes={issueTypes}
          issueTags={issueTags}
          allowedEmails={allowedEmails}
          userEmail={userEmail}
          defaultStatus={newIssueStatus}
        />
      )}

      {/* ── 清空已Hoàn thành ConfirmDialog ── */}
      <ConfirmDialog
        open={confirmClearOpen}
        title="清空已Hoàn thành任務"
        message={`Xác nhận要XóaTất cả ${issues.filter(i => i.status === 'Hoàn thành').length} mục已Hoàn thành任務嗎？此thao tác無法復原。`}
        danger={true}
        confirmLabel={clearingCompleted ? 'XóaTrung bình…' : 'Xác nhậnXóa'}
        onConfirm={handleClearCompleted}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {/* ── 個別Xóa ConfirmDialog ── */}
      {confirmDeleteIssueId && (() => {
        const targetIssue = issues.find(i => i.id === confirmDeleteIssueId)
        return (
          <ConfirmDialog
            open={true}
            title="Xóa任務"
            message={`Xác nhận要Xóa「${targetIssue?.title ?? ''}」嗎？`}
            danger={true}
            confirmLabel={deletingIssueId === confirmDeleteIssueId ? 'XóaTrung bình…' : 'Xác nhậnXóa'}
            onConfirm={() => { void handleDeleteIssue(confirmDeleteIssueId) }}
            onCancel={() => setConfirmDeleteIssueId(null)}
          />
        )
      })()}
    </div>
  )
}
