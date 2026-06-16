'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Issue, IssueUpdate } from '@/app/tracker/page'
import EditIssueDialog from '@/components/EditIssueDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Props {
  open: boolean
  issue: Issue
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  onClose: () => void
  onUpdated: (updated: Issue) => void
  onDeleted: (issueId: string) => void
}

const PRIORITY_PILL: Record<string, { label: string; cls: string }> = {
  high:   { label: 'Khẩn cấp', cls: 'bg-red-50 text-red-600 border border-red-200' },
  medium: { label: '重要', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  low:    { label: '普通', cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border border-[rgba(122,82,48,.15)]' },
}

const STATUS_BADGE: Record<string, string> = {
  'Chờ xử lý': 'bg-gray-100 text-gray-600 border-gray-200',
  'Đang thực hiện': 'bg-blue-50 text-blue-700 border-blue-200',
  '等待Trung bình': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Hoàn thành': 'bg-green-50 text-green-700 border-green-200',
}

function formatDatetime(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const mo = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${mo}/${day} ${h}:${mi}`
}

export default function IssueDetailDialog({
  open, issue, permissions, userEmail, allowedEmails,
  issueTypes, issueTags, onClose, onUpdated, onDeleted,
}: Props) {
  const [localIssue, setLocalIssue] = useState<Issue>(issue)
  const [updates, setUpdates] = useState<IssueUpdate[]>(issue.issue_updates ?? [])
  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [updateContent, setUpdateContent] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canCreateIssues = permissions.includes('create_issues')
  const canEditIssue = permissions.includes('tracker_edit_issue')
  const canViewTracker = permissions.includes('view_tracker')
  const isAuthor = localIssue.created_by === userEmail
  const canFullEdit = (isAuthor && canCreateIssues) || canEditIssue
  const canDelete = isAuthor || canCreateIssues

  const [deletingUpdateId,     setDeletingUpdateId]     = useState<string | null>(null)

  // 每次 open 時同步最新 issue 並載入 updates
  useEffect(() => {
    if (!open) return
    setLocalIssue(issue)
    setError(null)
    setUpdateContent('')

    const hasInitialData = Array.isArray(issue.issue_updates)
    if (hasInitialData) {
      setUpdates(issue.issue_updates!)
    }

    const fetchUpdates = async () => {
      if (!hasInitialData) setLoadingUpdates(true)
      try {
        const res = await fetch(`/api/issues/${issue.id}`)
        if (res.ok) {
          const data = await res.json()
          setUpdates(data.issue_updates ?? [])
          const emails: string[] = (data.issue_assignees ?? []).map(
            (a: { user_email: string }) => a.user_email,
          )
          setLocalIssue({
            ...issue,
            ...data,
            issue_updates: undefined,
            issue_assignees: undefined,
            assignee_emails: emails,
            assignees: emails.map((e: string) => e.split('@')[0]),
          })
        }
      } catch {
        // silent
      } finally {
        setLoadingUpdates(false)
      }
    }
    fetchUpdates()
  }, [open, issue.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitUpdate = useCallback(async () => {
    const content = updateContent.trim()
    if (!content) return
    const pendingId = `pending-${Date.now()}`
    const optimistic: IssueUpdate = {
      id: pendingId,
      content,
      created_by: userEmail,
      created_at: new Date().toISOString(),
    }
    setUpdates((prev) => [optimistic, ...prev])
    setUpdateContent('')
    setError(null)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Thêm mớiCập nhật紀錄thất bại')
        setUpdates((prev) => prev.filter((u) => u.id !== pendingId))
        setUpdateContent(content)
        return
      }
      const real: IssueUpdate = await res.json()
      setUpdates((prev) => prev.map((u) => u.id === pendingId ? real : u))
    } catch {
      setError('Thêm mớiCập nhật紀錄thất bại，vui lòng thử lại')
      setUpdates((prev) => prev.filter((u) => u.id !== pendingId))
      setUpdateContent(content)
    }
  }, [updateContent, localIssue.id, userEmail])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Xóathất bại')
        return
      }
      onDeleted(localIssue.id)
    } catch {
      setError('Xóa thất bại, vui lòng thử lại')
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }, [localIssue.id, onDeleted])

  const handleEditUpdated = useCallback((updated: Issue) => {
    setLocalIssue(updated)
    setEditOpen(false)
    onUpdated(updated)
  }, [onUpdated])

  const handleDeleteUpdate = useCallback(async (updateId: string) => {
    setDeletingUpdateId(updateId)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}/updates/${updateId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { setError('Xóathất bại'); return }
      setUpdates(prev => prev.filter(u => u.id !== updateId))
    } catch {
      setError('Xóa thất bại, vui lòng thử lại')
    } finally {
      setDeletingUpdateId(null)
    }
  }, [localIssue.id])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6"
        onClick={onClose}
      >
        <div
          className="bg-[#fff9f4] rounded-2xl shadow-[0_0_40px_rgba(122,82,48,.18),0_20px_60px_rgba(0,0,0,.22)] border border-[rgba(122,82,48,.18)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[rgba(122,82,48,.1)]">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-[#2c1e12] leading-snug">
                {localIssue.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {localIssue.status}
              </span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Vấn đề資訊 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-[#a08060] mb-1">Ưu tiên度</p>
                {PRIORITY_PILL[localIssue.priority] ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[localIssue.priority].cls}`}>
                    {PRIORITY_PILL[localIssue.priority].label}
                  </span>
                ) : (
                  <span className="text-sm text-[#4a3422]">{localIssue.priority}</span>
                )}
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">Loại</p>
                <span className="text-xs px-1.5 py-0.5 rounded border border-[rgba(122,82,48,.2)] bg-[rgba(122,82,48,.05)] text-[#7a5230] font-medium">
                  {localIssue.type}
                </span>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">預計ngày</p>
                <p className="text-sm text-[#4a3422]">
                  {localIssue.due_date
                    ? new Date(localIssue.due_date).toLocaleDateString('zh-TW')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">Người phụ trách</p>
                <p className="text-sm text-[#4a3422]">
                  {localIssue.assignees.length > 0 ? localIssue.assignees.join('、') : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">Tạo者</p>
                <p className="text-sm text-[#4a3422]">{localIssue.created_by.split('@')[0]}</p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">Tạongày</p>
                <p className="text-sm text-[#4a3422]">{formatDatetime(localIssue.created_at)}</p>
              </div>
            </div>

            {/* Tags */}
            {localIssue.tags.length > 0 && (
              <div>
                <p className="text-xs text-[#a08060] mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {localIssue.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 說明 */}
            {localIssue.description && (
              <div>
                <p className="text-xs text-[#a08060] mb-1.5">說明</p>
                <p className="text-sm text-[#4a3422] leading-relaxed whitespace-pre-wrap bg-[rgba(122,82,48,.03)] rounded-lg px-3 py-2.5 border border-[rgba(122,82,48,.08)]">
                  {localIssue.description}
                </p>
              </div>
            )}

            {/* Cập nhật紀錄 */}
            <div>
              <p className="text-xs font-semibold text-[#6b4f38] mb-2">Cập nhật紀錄</p>
              {loadingUpdates && (
                <div className="space-y-2 animate-pulse">
                  {([48, 36, 48] as number[]).map((w, i) => (
                    <div key={i} className="rounded-lg bg-[rgba(122,82,48,.07)] px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-3 rounded bg-[rgba(122,82,48,.12)]" style={{ width: '60px' }} />
                        <div className="h-3 rounded bg-[rgba(122,82,48,.07)]" style={{ width: '80px' }} />
                      </div>
                      <div className="h-3 rounded bg-[rgba(122,82,48,.1)]" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              )}
              {!loadingUpdates && updates.length === 0 && (
                <p className="text-xs text-[#c0a882] py-2">尚無Cập nhật紀錄</p>
              )}
              {!loadingUpdates && updates.length > 0 && (
                <div className="space-y-2">
                  {updates.map((upd) => {
                    const canDeleteThis = upd.created_by === userEmail || canCreateIssues
                    const isDeleting = deletingUpdateId === upd.id
                    return (
                      <div
                        key={upd.id}
                        className="rounded-lg bg-white border border-[rgba(122,82,48,.1)] px-3 py-2.5 group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#7a5230]">
                            {upd.created_by.split('@')[0]}
                          </span>
                          <span className="text-xs text-[#c0a882]">
                            {formatDatetime(upd.created_at)}
                          </span>
                          {canDeleteThis && (
                            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleDeleteUpdate(upd.id)}
                                disabled={isDeleting}
                                className="p-1 rounded text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.06)] transition-colors disabled:opacity-50"
                                title="Xóa"
                              >
                                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-[#4a3422] leading-relaxed whitespace-pre-wrap">
                          {upd.content}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Thêm mớiCập nhật紀錄 */}
            {canViewTracker && (
              <div>
                <textarea
                  ref={textareaRef}
                  value={updateContent}
                  onChange={(e) => setUpdateContent(e.target.value)}
                  onBlur={() => {
                    if (updateContent.trim()) handleSubmitUpdate()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.currentTarget.blur()
                    }
                  }}
                  placeholder="Thêm mớiCập nhật紀錄… （離開欄位自動Lưu）"
                  rows={2}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          {(canFullEdit || canDelete) && (
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[rgba(122,82,48,.1)] bg-[#faf6f0]">
              {canFullEdit && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Chỉnh sửa
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#b5451b] border border-[rgba(181,69,27,.25)] rounded-lg hover:bg-[rgba(181,69,27,.06)] disabled:opacity-50 transition-colors"
                >
                  {deleting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Xóa
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chỉnh sửa Dialog */}
      {editOpen && (
        <EditIssueDialog
          open={editOpen}
          issue={localIssue}
          issueTypes={issueTypes}
          issueTags={issueTags}
          allowedEmails={allowedEmails}
          onClose={() => setEditOpen(false)}
          onUpdated={handleEditUpdated}
        />
      )}

      {/* Xóaxác nhận */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Xóa任務「${localIssue.title}」？`}
        message="Xóa後無法復原，包含所有Cập nhật紀錄。"
        confirmLabel="Xóa"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  )
}
