'use client'

import { useState, useCallback } from 'react'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Issue, IssueUpdate } from '@/app/tracker/page'
import EditIssueDialog from '@/components/EditIssueDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Props {
  issue: Issue
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  onUpdated: (updated: Issue) => void
  onDeleted: (issueId: string) => void
}

const PRIORITY_PILL: Record<string, { label: string; cls: string }> = {
  high:   { label: 'Khẩn cấp', cls: 'bg-red-50 text-red-600 border border-red-200' },
  medium: { label: '重要', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  low:    { label: '普通', cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border border-[rgba(122,82,48,.15)]' },
}
const STATUS_OPTIONS = ['Chờ xử lý', 'Đang thực hiện', '等待Trung bình', 'Hoàn thành']
const STATUS_BADGE: Record<string, string> = {
  'Chờ xử lý': 'bg-gray-100 text-gray-600 border-gray-200',
  'Đang thực hiện': 'bg-blue-50 text-blue-700 border-blue-200',
  '等待Trung bình': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Hoàn thành': 'bg-green-50 text-green-700 border-green-200',
}

function fmt(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function IssueExpandedContent({
  issue, permissions, userEmail, allowedEmails, issueTypes, issueTags, onUpdated, onDeleted,
}: Props) {
  const [localIssue, setLocalIssue] = useState<Issue>(issue)
  const [updates, setUpdates] = useState<IssueUpdate[]>(issue.issue_updates ?? [])
  const [updateContent, setUpdateContent] = useState('')
  const [changingStatus, setChangingStatus] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreateIssues = permissions.includes('create_issues')
  const canEditIssue = permissions.includes('tracker_edit_issue')
  const canViewTracker = permissions.includes('view_tracker')
  const isAuthor = localIssue.created_by === userEmail
  const isAssignee = localIssue.assignee_emails.includes(userEmail)
  const canFullEdit = canCreateIssues || canEditIssue
  const canChangeStatus = isAuthor || isAssignee || canCreateIssues
  const canDelete = isAuthor || canCreateIssues

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (newStatus === localIssue.status) return
    const prev = localIssue.status
    setLocalIssue((c) => ({ ...c, status: newStatus }))
    setChangingStatus(true)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) { setLocalIssue((c) => ({ ...c, status: prev })); return }
      const data = await res.json()
      const emails: string[] = (data.issue_assignees ?? []).map((a: { user_email: string }) => a.user_email)
      const merged: Issue = {
        ...data, issue_updates: undefined, issue_assignees: undefined,
        assignee_emails: emails, assignees: emails.map((e: string) => e.split('@')[0]),
      }
      setLocalIssue(merged)
      onUpdated(merged)
    } catch { setLocalIssue((c) => ({ ...c, status: prev })) }
    finally { setChangingStatus(false) }
  }, [localIssue, onUpdated])

  const handleSubmitUpdate = useCallback(async () => {
    const content = updateContent.trim()
    if (!content) return
    const pendingId = `pending-${Date.now()}`
    const optimistic: IssueUpdate = { id: pendingId, content, created_by: userEmail, created_at: new Date().toISOString() }
    setUpdates((p) => [optimistic, ...p])
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
        setUpdates((p) => p.filter((u) => u.id !== pendingId))
        setUpdateContent(content)
        return
      }
      const real: IssueUpdate = await res.json()
      setUpdates((p) => p.map((u) => u.id === pendingId ? real : u))
    } catch {
      setUpdates((p) => p.filter((u) => u.id !== pendingId))
      setUpdateContent(content)
    }
  }, [updateContent, localIssue.id, userEmail])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Xóathất bại'); return }
      onDeleted(localIssue.id)
    } catch { setError('Xóa thất bại, vui lòng thử lại') }
    finally { setDeleting(false); setConfirmDeleteOpen(false) }
  }, [localIssue.id, onDeleted])

  const handleEditUpdated = useCallback((updated: Issue) => {
    setLocalIssue(updated)
    setEditOpen(false)
    onUpdated(updated)
  }, [onUpdated])

  return (
    <>
      <div className="px-4 pb-4 pt-3 bg-[rgba(122,82,48,.025)] border-t border-[rgba(122,82,48,.08)] space-y-3">

        {/* Trạng thái + Chỉnh sửa/Xóa */}
        <div className="flex items-center justify-between">
          {canChangeStatus ? (
            <div className="relative">
              <select
                value={localIssue.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={changingStatus}
                className={`text-xs px-2 py-1 rounded-full border font-medium appearance-none cursor-pointer pr-5 focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-60 ${STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {changingStatus && (
                <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-[#a08060]" />
              )}
            </div>
          ) : (
            <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {localIssue.status}
            </span>
          )}

          {(canFullEdit || canDelete) && (
            <div className="flex items-center gap-1.5">
              {canFullEdit && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  <Pencil className="h-3 w-3" />Chỉnh sửa
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deleting}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-[#b5451b] border border-[rgba(181,69,27,.25)] rounded-lg hover:bg-[rgba(181,69,27,.06)] disabled:opacity-50 transition-colors"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Xóa
                </button>
              )}
            </div>
          )}
        </div>

        {/* 基本資訊 grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div>
            <p className="text-[10px] text-[#a08060] mb-0.5">Ưu tiên度</p>
            {PRIORITY_PILL[localIssue.priority] ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[localIssue.priority].cls}`}>
                {PRIORITY_PILL[localIssue.priority].label}
              </span>
            ) : (
              <span className="text-xs text-[#4a3422]">{localIssue.priority}</span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-[#a08060] mb-0.5">Loại</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(122,82,48,.2)] bg-[rgba(122,82,48,.05)] text-[#7a5230] font-medium">{localIssue.type}</span>
          </div>
          <div>
            <p className="text-[10px] text-[#a08060] mb-0.5">預計ngày</p>
            <p className="text-xs text-[#4a3422]">{localIssue.due_date ? new Date(localIssue.due_date).toLocaleDateString('zh-TW') : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#a08060] mb-0.5">Người phụ trách</p>
            <p className="text-xs text-[#4a3422]">{localIssue.assignees.length > 0 ? localIssue.assignees.join('、') : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#a08060] mb-0.5">Tạo者</p>
            <p className="text-xs text-[#4a3422]">{localIssue.created_by.split('@')[0]}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#a08060] mb-0.5">Tạongày</p>
            <p className="text-xs text-[#4a3422]">{fmt(localIssue.created_at)}</p>
          </div>
        </div>

        {/* Tags */}
        {localIssue.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {localIssue.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]">{tag}</span>
            ))}
          </div>
        )}

        {/* 說明 */}
        {localIssue.description && (
          <p className="text-xs text-[#4a3422] leading-relaxed whitespace-pre-wrap bg-white rounded-lg px-3 py-2 border border-[rgba(122,82,48,.08)]">
            {localIssue.description}
          </p>
        )}

        {/* Cập nhật紀錄 */}
        <div>
          <p className="text-xs font-semibold text-[#6b4f38] mb-2">Cập nhật紀錄</p>
          {updates.length === 0 && (
            <p className="text-xs text-[#c0a882]">尚無Cập nhật紀錄</p>
          )}
          {updates.length > 0 && (
            <div className="space-y-1.5">
              {updates.map((upd) => (
                <div key={upd.id} className="rounded-lg bg-white border border-[rgba(122,82,48,.1)] px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[#7a5230]">{upd.created_by.split('@')[0]}</span>
                    <span className="text-[10px] text-[#c0a882]">{fmt(upd.created_at)}</span>
                  </div>
                  <p className="text-xs text-[#4a3422] leading-relaxed whitespace-pre-wrap">{upd.content}</p>
                </div>
              ))}
            </div>
          )}
          {canViewTracker && (
            <textarea
              value={updateContent}
              onChange={(e) => setUpdateContent(e.target.value)}
              onBlur={() => { if (updateContent.trim()) handleSubmitUpdate() }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur() }}
              placeholder="Thêm mớiCập nhật紀錄… （離開欄位自動Lưu）"
              rows={2}
              className="mt-2 w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
            />
          )}
        </div>

        {error && (
          <p className="text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

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
