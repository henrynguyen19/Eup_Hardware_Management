'use client'

import { useState } from 'react'
import { Loader2, Check, X, Pencil, ChevronDown } from 'lucide-react'
import type { RoleBasic } from '@/app/admin/departments/page'

interface Props {
  initialRoles: RoleBasic[]
}

const LEVEL_BADGE: Record<string, { label: string; className: string }> = {
  super_admin: {
    label: 'Quản trị viên',
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
  dept_admin: {
    label: 'bộ phậnQuản trị viên',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  member: {
    label: '成員',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  viewer: {
    label: '一般',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
  },
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return null
  const cfg = LEVEL_BADGE[level]
  if (!cfg) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
        {level}
      </span>
    )
  }
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

interface EditingState {
  roleId: string
  value: string
  isNew: boolean
}

export default function DepartmentsManager({ initialRoles }: Props) {
  const [roles, setRoles] = useState<RoleBasic[]>(initialRoles)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 從現有vai trò動態取唯一的 dept_group 值（排除 null）
  const existingGroups = Array.from(
    new Set(roles.map(r => r.dept_group).filter((g): g is string => g !== null))
  ).sort()

  // Nhóm化
  const groupMap = new Map<string | null, RoleBasic[]>()
  for (const role of roles) {
    const key = role.dept_group
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(role)
  }

  // sắp xếpNhóm：有值的 dept_group 先按字母，null 最後
  const sortedGroups: Array<{ key: string | null; label: string; members: RoleBasic[] }> = []
  Array.from(groupMap.entries()).forEach(([key, members]) => {
    if (key !== null) {
      sortedGroups.push({ key, label: key, members })
    }
  })
  sortedGroups.sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
  if (groupMap.has(null)) {
    sortedGroups.push({ key: null, label: '未分配', members: groupMap.get(null)! })
  }

  function startEdit(role: RoleBasic) {
    setEditing({ roleId: role.id, value: role.dept_group ?? '', isNew: false })
    setError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setError(null)
  }

  async function saveEdit(roleId: string, newValue: string) {
    const trimmed = newValue.trim()
    const deptGroup = trimmed === '' ? null : trimmed

    // 找出原始vai trò，若值沒變則直接關閉
    const original = roles.find(r => r.id === roleId)
    if (original && original.dept_group === deptGroup) {
      setEditing(null)
      return
    }

    setSaving(roleId)
    setError(null)
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept_group: deptGroup }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Lưuthất bại')
        return
      }
      // optimistic update
      setRoles(prev => prev.map(r => r.id === roleId ? { ...r, dept_group: deptGroup } : r))
      setEditing(null)
    } catch {
      setError('Lưuthất bại，vui lòng thử lại')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#6b4f38]">bộ phậnNhóm</h2>
        <p className="text-xs text-[#a08060]">點選vai trò的Nhóm欄位可直接Chỉnh sửa</p>
      </div>

      {error && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {roles.length === 0 && (
        <p className="text-sm text-[#a08060] py-8 text-center">尚無vai tròdữ liệu</p>
      )}

      {sortedGroups.map(({ key, label, members }) => (
        <div
          key={key ?? '__unassigned__'}
          className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden"
        >
          {/* Nhóm header */}
          <div className="px-5 py-3 border-b border-[rgba(122,82,48,.1)] bg-[rgba(122,82,48,.03)]">
            <div className="flex items-center gap-2">
              {key === null ? (
                <span className="text-sm font-semibold text-[#a08060] italic">未分配</span>
              ) : (
                <span className="text-sm font-semibold text-[#7a5230]">{label}</span>
              )}
              <span className="text-xs text-[#a08060]">（{members.length} 個vai trò）</span>
            </div>
          </div>

          {/* vai trò列表 */}
          <div className="divide-y divide-[rgba(122,82,48,.08)]">
            {members.map(role => {
              const isEditing = editing?.roleId === role.id
              const isSavingThis = saving === role.id

              return (
                <div key={role.id} className="px-5 py-3 flex items-center gap-3">
                  {/* vai tròtên */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#2c1e12]">{role.name}</span>
                      {role.is_system && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                          hệ thống
                        </span>
                      )}
                      <LevelBadge level={role.level} />
                    </div>
                  </div>

                  {/* dept_group 欄位 — 可 inline Chỉnh sửa */}
                  <div className="shrink-0 flex items-center gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        {/* 下拉選現有值 or 輸入新值 */}
                        <div className="relative">
                          <input
                            type="text"
                            list={`dept-groups-${role.id}`}
                            value={editing.value}
                            onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit(role.id, editing.value)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            placeholder="輸入或選擇Nhóm（留空清除）"
                            disabled={isSavingThis}
                            autoFocus
                            className="border border-[#c49a72] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50 w-48"
                          />
                          <datalist id={`dept-groups-${role.id}`}>
                            {existingGroups.map(g => (
                              <option key={g} value={g} />
                            ))}
                          </datalist>
                        </div>
                        {isSavingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(role.id, editing.value)}
                              className="p-1 rounded text-[#7a5230] hover:text-[#5a3820] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                              title="Lưu"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="p-1 rounded text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                              title="Hủy"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(role)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] border border-transparent hover:border-[rgba(122,82,48,.2)] transition-all group"
                        title="Chỉnh sửabộ phậnNhóm"
                      >
                        <span className="font-mono">
                          {role.dept_group ?? <span className="italic text-[#c8b8a6]">無</span>}
                        </span>
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
