'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

interface RoleData {
  id: string
  name: string
  is_system: boolean
  dept_group: string | null
  level: string | null
  permissions: string[]
  assignable_role_names?: string[] | null
}

interface Props {
  initialRoles: RoleData[]
  currentUserRoleName?: string
}

const PERM_LABELS: Record<string, string> = {
  // 可見性
  read_all_cards:             '看Tất cả thiết bị（含非現役）',
  read_active_only:           '只看現役Thiết bị',
  // Thiết bị列表
  use_bookmarks:              'Theo dõi (只有個人看得到內容)',
  // Thiết bị列表Lọc
  filter_all_statuses:        'Trạng tháiLọc（Tất cảTrạng thái/現役/停產）',
  filter_no_photo:            'Chưa có ảnhLọc',
  // Thiết bị細節
  read_documents:             '看Tài liệu/Datasheet',
  read_notes:                 '看Ghi chú',
  read_vendor:                '看Nhà cung cấp',
  read_updated_by:            '看Cập nhật人員',
  read_updated_content:       '看Cập nhật內容',
  read_tags:                  '看Tags',
  read_weight:                '看Khối lượng tịnh',
  read_created_at:            '看Thêm mới時間',
  // Thiết bịquản lý
  create_delete_cards:        'Thêm mới/Xóa thiết bị',
  // Thiết bịquản lý > Chỉnh sửa欄位
  edit_card_equipment_id:     'Mã thiết bị',
  edit_card_name:             'Tên thiết bị',
  edit_card_category:         'Danh mục',
  edit_card_status:           'Trạng thái',
  edit_card_vendor:           'Nhà cung cấp',
  edit_card_tags:             'Tags',
  edit_card_notes:            'Ghi chú',
  edit_card_weight:           'Khối lượng tịnh／Ảnh khối lượng',
  edit_card_documents:        'Liên kết tài liệu',
  edit_card_is_new:           'Mới標記',
  edit_card_main_photo:       'Ảnh chính',
  edit_card_detail_photos:    'Ảnh chi tiết',
  // Quản lý tài khoản
  manage_users:               'Quản lý tài khoản/Phân côngvai trò',
  manage_roles:               'vai trò與quyềncài đặt',
  // 追蹤板
  view_tracker:               '可看Nhiệm vụ (只有同一bộ phận能看到彼此任務)',
  view_my_tasks:              '我的任務',
  create_issues:              '可Thêm mớiVấn đề',
  tracker_edit_issue:         '可Chỉnh sửaVấn đề',
}

const VISIBILITY_PERMS = ['read_all_cards', 'read_active_only'] as const

const LIST_PERMS = ['use_bookmarks', 'filter_all_statuses', 'filter_no_photo'] as const

const DETAIL_PERMS = [
  'read_documents',
  'read_notes',
  'read_vendor',
  'read_updated_by',
  'read_updated_content',
  'read_tags',
  'read_weight',
  'read_created_at',
] as const

// 「Chỉnh sửa thiết bị」父tùy chọn的子 key 清單
const EDIT_CARD_CHILD_PERMS = [
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
] as const

// Thiết bịquản lý分組（不含子 edit_card_* 欄位）
const CARD_MGMT_PERMS = ['create_delete_cards'] as const

const ACCOUNT_PERMS = ['manage_users', 'manage_roles'] as const

const TRACKER_PERMS = [
  'view_tracker',
  'view_my_tasks',
] as const

const DEPT_GROUP_LABELS: Record<string, string> = {
  admin:        'quản lý',
  tech:         'Kỹ sư',
  purchasing:   'Mua hàng',
  supply_chain: 'Chuỗi cung ứng',
  engineering:  'Kỹ thuật',
  sales:        'Kinh doanh',
}

function getDefaultAssignable(role: RoleData, allRoles: RoleData[]): string[] {
  if (role.level === 'super_admin') {
    return allRoles.map(r => r.name)
  }
  if (role.level === 'dept_admin' && role.dept_group) {
    return allRoles
      .filter(r => r.dept_group === role.dept_group && ['member', 'viewer'].includes(r.level ?? ''))
      .map(r => r.name)
  }
  return []
}

function DeptBadge({ deptGroup, level }: { deptGroup: string | null; level: string | null }) {
  if (level === 'super_admin') {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(181,69,27,.1)] text-[#b5451b] border border-[rgba(181,69,27,.2)]">
        全域
      </span>
    )
  }
  if (!deptGroup) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.07)] text-[#a08060] border border-[rgba(122,82,48,.15)]">
        無Nhóm
      </span>
    )
  }
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
      {DEPT_GROUP_LABELS[deptGroup] ?? deptGroup}
    </span>
  )
}

export default function RolesManager({ initialRoles, currentUserRoleName }: Props) {
  const router = useRouter()
  const [roles, setRoles] = useState<RoleData[]>(initialRoles)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingNameId, setSavingNameId] = useState<string | null>(null)

  const [newRoleOpen, setNewRoleOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePerms, setNewRolePerms] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [savingPermId, setSavingPermId] = useState<string | null>(null)
  const [permError, setPermError] = useState<string | null>(null)
  const [draftPerms, setDraftPerms] = useState<Record<string, string[]>>({})

  const [draftAssignable, setDraftAssignable] = useState<Record<string, string[] | null>>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<RoleData | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function toggleExpand(id: string, role: RoleData) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        setDraftPerms(d => ({ ...d, [id]: [...role.permissions] }))
        setDraftAssignable(d => ({
          ...d,
          [id]: role.assignable_role_names ?? getDefaultAssignable(role, roles),
        }))
      }
      return next
    })
  }

  function startRename(role: RoleData) {
    setEditingId(role.id)
    setEditingName(role.name)
  }

  async function saveRename(role: RoleData) {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === role.name) {
      setEditingId(null)
      return
    }
    setSavingNameId(role.id)
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? '重命名thất bại')
      } else {
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, name: trimmed } : r))
        setEditingId(null)
      }
    } catch {
      alert('重命名thất bại，vui lòng thử lại')
    } finally {
      setSavingNameId(null)
    }
  }

  async function saveAssignableOnly(role: RoleData) {
    const draft = draftAssignable[role.id]
    const res = await fetch(`/api/roles/${role.id}/assignable`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignable_role_names: draft ?? [] }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? 'Lưuthất bại')
    }
    setRoles(prev => prev.map(r => r.id === role.id
      ? { ...r, assignable_role_names: draft && draft.length > 0 ? draft : null }
      : r
    ))
  }

  async function saveAll(role: RoleData) {
    setSavingPermId(role.id)
    setSaveError(null)
    setPermError(null)
    try {
      // 同時呼叫兩個 API
      await Promise.all([
        (async () => {
          const draft = getDraft(role)
          let safePerms = draft
          if (role.name === currentUserRoleName) {
            const locked = ['manage_users', 'manage_roles']
            for (const p of locked) {
              if (!safePerms.includes(p)) safePerms = [...safePerms, p]
            }
          }
          const res = await fetch(`/api/roles/${role.id}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: safePerms }),
          })
          if (!res.ok) {
            const d = await res.json()
            throw new Error(d.error ?? 'quyềnCập nhậtthất bại')
          }
          setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: safePerms } : r))
        })(),
        saveAssignableOnly(role),
      ])
      router.refresh()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lưuthất bại，vui lòng thử lại')
    } finally {
      setSavingPermId(null)
    }
  }

  function getDraft(role: RoleData): string[] {
    return draftPerms[role.id] ?? role.permissions
  }

  function handleVisibilityChange(role: RoleData, selected: 'read_all_cards' | 'read_active_only') {
    const removed = selected === 'read_all_cards' ? 'read_active_only' : 'read_all_cards'
    const cur = getDraft(role).filter(p => p !== removed)
    const result = cur.includes(selected) ? cur : [...cur, selected]
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function handleDetailToggle(role: RoleData, key: string) {
    const cur = getDraft(role)
    const result = cur.includes(key) ? cur.filter(p => p !== key) : [...cur, key]
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  // 「Chỉnh sửa thiết bị」父tùy chọn連動：indeterminate / checked / unchecked
  function getEditCardParentState(draft: string[]): 'all' | 'some' | 'none' {
    const checkedCount = EDIT_CARD_CHILD_PERMS.filter(k => draft.includes(k)).length
    if (checkedCount === 0) return 'none'
    if (checkedCount === EDIT_CARD_CHILD_PERMS.length) return 'all'
    return 'some'
  }

  function handleEditCardParentToggle(role: RoleData) {
    const draft = getDraft(role)
    const state = getEditCardParentState(draft)
    let result: string[]
    if (state === 'none') {
      // 全勾
      result = [...draft, ...EDIT_CARD_CHILD_PERMS.filter(k => !draft.includes(k))]
    } else {
      // 已勾或 indeterminate → 全Hủy
      result = draft.filter(p => !(EDIT_CARD_CHILD_PERMS as readonly string[]).includes(p))
    }
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function discardDraft(role: RoleData) {
    setDraftPerms(d => ({ ...d, [role.id]: [...role.permissions] }))
    setDraftAssignable(d => ({
      ...d,
      [role.id]: role.assignable_role_names ?? getDefaultAssignable(role, roles),
    }))
    setPermError(null)
    setSaveError(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newRoleName.trim()
    if (!trimmed) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, permissions: newRolePerms }),
      })
      const d = await res.json()
      if (!res.ok) {
        setCreateError(d.error ?? 'Thêm mớithất bại')
        return
      }
      const newRole: RoleData = {
        id: d.id ?? d.role?.id ?? String(Date.now()),
        name: trimmed,
        is_system: false,
        dept_group: d.dept_group ?? null,
        level: d.level ?? null,
        permissions: newRolePerms,
      }
      setRoles(prev => [...prev, newRole])
      setNewRoleName('')
      setNewRolePerms([])
      setNewRoleOpen(false)
    } catch {
      setCreateError('Thêm mớithất bại，vui lòng thử lại')
    } finally {
      setCreating(false)
    }
  }

  function askDelete(role: RoleData) {
    setPendingDelete(role)
    setDeleteError(null)
    setConfirmOpen(true)
  }

  async function doDelete(role: RoleData) {
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const d = await res.json()
        setDeleteError(d.error ?? '此vai trò仍有người dùng，無法Xóa')
        return
      }
      if (!res.ok) {
        const d = await res.json()
        setDeleteError(d.error ?? 'Xóathất bại')
        return
      }
      setRoles(prev => prev.filter(r => r.id !== role.id))
    } catch {
      setDeleteError('Xóa thất bại, vui lòng thử lại')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#6b4f38]">vai trò清單</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/departments"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors"
          >
            Quản lý bộ phận
          </Link>
          <button
            onClick={() => setNewRoleOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.35)]"
          >
            <Plus className="h-4 w-4" />
            Thêm mớivai trò
          </button>
        </div>
      </div>

      {/* Thêm mớivai trò inline form */}
      {newRoleOpen && (
        <div className="bg-white rounded-xl border border-[rgba(122,82,48,.2)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#6b4f38] mb-3">Thêm mớivai trò</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              placeholder="vai tròtên（如：倉管人員）"
              required
              disabled={creating}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
            />
            <p className="text-xs text-[#a08060]">初始quyền（可Thêm mới後再調整）</p>
            {/* Thêm mớivai trò：扁平列出所有 perm（除 edit_card_* 子tùy chọn展開在父下方） */}
            <div className="space-y-3">
              {[
                { label: '可見性', keys: VISIBILITY_PERMS, radio: true },
                { label: 'Thiết bị列表', keys: LIST_PERMS, radio: false },
                { label: 'Thiết bị細節', keys: DETAIL_PERMS, radio: false },
                { label: 'Quản lý tài khoản', keys: ACCOUNT_PERMS, radio: false },
                { label: '追蹤板', keys: TRACKER_PERMS, radio: false },
              ].map(section => (
                <div key={section.label}>
                  <p className="text-[11px] font-semibold text-[#a08060] mb-1">{section.label}</p>
                  <div className="space-y-1 pl-1">
                    {section.keys.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type={section.radio ? 'radio' : 'checkbox'}
                          name={section.radio ? 'new-role-visibility' : undefined}
                          checked={newRolePerms.includes(key)}
                          onChange={() => {
                            if (section.radio) {
                              const other = key === 'read_all_cards' ? 'read_active_only' : 'read_all_cards'
                              setNewRolePerms(prev => [...prev.filter(p => p !== other && p !== key), key])
                            } else {
                              setNewRolePerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
                            }
                          }}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-xs text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                    {/* 追蹤板：合併 checkbox */}
                    {section.label === '追蹤板' && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newRolePerms.includes('create_issues') || newRolePerms.includes('tracker_edit_issue')}
                          onChange={() => {
                            const hasAny = newRolePerms.includes('create_issues') || newRolePerms.includes('tracker_edit_issue')
                            if (hasAny) {
                              setNewRolePerms(prev => prev.filter(p => p !== 'create_issues' && p !== 'tracker_edit_issue'))
                            } else {
                              setNewRolePerms(prev => [...prev, 'create_issues', 'tracker_edit_issue'])
                            }
                          }}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-xs text-[#4a3422]">可Thêm mới/Chỉnh sửa任務</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
              {/* Thiết bịquản lý */}
              <div>
                <p className="text-[11px] font-semibold text-[#a08060] mb-1">Thiết bịquản lý</p>
                <div className="space-y-1 pl-1">
                  {CARD_MGMT_PERMS.map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newRolePerms.includes(key)}
                        onChange={() => setNewRolePerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">{PERM_LABELS[key]}</span>
                    </label>
                  ))}
                  {/* Chỉnh sửa thiết bị父tùy chọn */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={EDIT_CARD_CHILD_PERMS.some(k => newRolePerms.includes(k))}
                        onChange={() => {
                          const anyChecked = EDIT_CARD_CHILD_PERMS.some(k => newRolePerms.includes(k))
                          if (anyChecked) {
                            setNewRolePerms(prev => prev.filter(p => !(EDIT_CARD_CHILD_PERMS as readonly string[]).includes(p)))
                          } else {
                            setNewRolePerms(prev => [...prev, ...EDIT_CARD_CHILD_PERMS.filter(k => !prev.includes(k))])
                          }
                        }}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">Chỉnh sửa thiết bị</span>
                    </label>
                    <div className="pl-5 mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
                      {EDIT_CARD_CHILD_PERMS.map(fkey => (
                        <label key={fkey} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newRolePerms.includes(fkey)}
                            onChange={() => setNewRolePerms(prev => prev.includes(fkey) ? prev.filter(p => p !== fkey) : [...prev, fkey])}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-xs text-[#4a3422]">{PERM_LABELS[fkey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {createError && <p className="text-xs text-[#b5451b]">{createError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setNewRoleOpen(false); setNewRoleName(''); setNewRolePerms([]); setCreateError(null) }}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={creating || !newRoleName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Thêm mới
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {deleteError}
        </div>
      )}

      {permError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {permError}
        </div>
      )}

      {/* vai trò卡片清單 */}
      {roles.length === 0 && (
        <p className="text-sm text-[#a08060] py-8 text-center">尚無vai tròdữ liệu（請先執行 SQL migration）</p>
      )}

      {roles.map(role => {
        const isExpanded = expandedIds.has(role.id)
        const isRenamingThis = editingId === role.id
        const isSavingPerm = savingPermId === role.id
        const isSavingName = savingNameId === role.id
        const draft = getDraft(role)
        const visibility = draft.includes('read_all_cards') ? 'read_all_cards' : draft.includes('read_active_only') ? 'read_active_only' : null

        return (
          <div key={role.id} className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden">
            {/* 卡片 Header */}
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {isRenamingThis ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(role)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => saveRename(role)}
                      autoFocus
                      disabled={isSavingName}
                      className="border border-[#c49a72] rounded-lg px-2 py-1 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50 w-40"
                    />
                    {isSavingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />}
                    <button
                      type="button"
                      onClick={() => saveRename(role)}
                      disabled={isSavingName}
                      className="text-[#7a5230] hover:text-[#5a3820] disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[#a08060] hover:text-[#6b4f38]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#2c1e12] text-sm">{role.name}</span>
                    {role.is_system && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                        hệ thống
                      </span>
                    )}
                    <DeptBadge deptGroup={role.dept_group} level={role.level} />
                  </div>
                )}
                <p className="text-xs text-[#a08060] mt-0.5">
                  {visibility === 'read_all_cards'
                    ? '可見性：看Tất cả thiết bị'
                    : visibility === 'read_active_only'
                    ? '可見性：只看現役Thiết bị'
                    : '可見性：未cài đặt'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!role.is_system && (
                  <>
                    <button
                      onClick={() => startRename(role)}
                      title="重命名"
                      className="p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => askDelete(role)}
                      title="Xóavai trò"
                      className="p-1.5 rounded-lg text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.08)] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => toggleExpand(role.id, role)}
                  title={isExpanded ? '收合' : '展開'}
                  className="p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 展開的quyềnChỉnh sửa區 */}
            {isExpanded && (
              <div className="border-t border-[rgba(122,82,48,.1)] px-5 py-4 space-y-4 bg-[#faf6f0]">
                {isSavingPerm && (
                  <div className="flex items-center gap-2 text-xs text-[#a08060]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    LưuTrung bình…
                  </div>
                )}

                {/* 可見性：Radio */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">可見性</p>
                  <div className="space-y-1.5">
                    {VISIBILITY_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`visibility-${role.id}`}
                          checked={draft.includes(key)}
                          onChange={() => handleVisibilityChange(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Thiết bị列表 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">Thiết bị列表</p>
                  <div className="space-y-1.5">
                    {LIST_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Thiết bị細節 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">Thiết bị細節</p>
                  <div className="space-y-1.5">
                    {DETAIL_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Thiết bịquản lý */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">Thiết bịquản lý</p>
                  <div className="space-y-1.5">
                    {CARD_MGMT_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                    {/* Chỉnh sửa thiết bị：父子連動 */}
                    {(() => {
                      const parentState = getEditCardParentState(draft)
                      return (
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              ref={el => {
                                if (el) el.indeterminate = parentState === 'some'
                              }}
                              checked={parentState === 'all'}
                              onChange={() => handleEditCardParentToggle(role)}
                              disabled={isSavingPerm}
                              className="accent-[#7a5230]"
                            />
                            <span className="text-sm text-[#4a3422]">Chỉnh sửa thiết bị</span>
                          </label>
                          <div className="pl-5 mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
                            {EDIT_CARD_CHILD_PERMS.map(fkey => (
                              <label key={fkey} className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={draft.includes(fkey)}
                                  onChange={() => handleDetailToggle(role, fkey)}
                                  disabled={isSavingPerm}
                                  className="accent-[#7a5230]"
                                />
                                <span className="text-sm text-[#4a3422]">{PERM_LABELS[fkey]}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 追蹤板 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">追蹤板</p>
                  <div className="space-y-1.5">
                    {TRACKER_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                    {/* 合併 checkbox：可Thêm mới/Chỉnh sửa任務 */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={draft.includes('create_issues') || draft.includes('tracker_edit_issue')}
                        onChange={() => {
                          const hasAny = draft.includes('create_issues') || draft.includes('tracker_edit_issue')
                          if (hasAny) {
                            setDraftPerms(d => ({
                              ...d,
                              [role.id]: draft.filter(p => p !== 'create_issues' && p !== 'tracker_edit_issue'),
                            }))
                          } else {
                            const toAdd = ['create_issues', 'tracker_edit_issue'].filter(p => !draft.includes(p))
                            setDraftPerms(d => ({ ...d, [role.id]: [...draft, ...toAdd] }))
                          }
                        }}
                        disabled={isSavingPerm}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-sm text-[#4a3422]">可Thêm mới/Chỉnh sửa任務</span>
                    </label>
                  </div>
                </div>

                {/* Quản lý tài khoản */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">Quản lý tài khoản</p>
                  <div className="space-y-1.5">
                    {ACCOUNT_PERMS.map(key => {
                      const isCurrentUserRole = role.name === currentUserRoleName
                      const isLocked = isCurrentUserRole
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 select-none ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                          title={isLocked ? '當前tài khoản所屬vai trò，不可移除此quyền' : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={isLocked ? true : draft.includes(key)}
                            disabled={isLocked || isSavingPerm}
                            onChange={() => { if (!isLocked) handleDetailToggle(role, key) }}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-sm text-[#4a3422]">
                            {PERM_LABELS[key]}
                            {isLocked && <span className="ml-1 text-[10px] text-[#a08060]">（鎖定）</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* 可Phân côngvai trò */}
                <div className="mt-4 pt-4 border-t border-[rgba(122,82,48,.08)]">
                  <p className="text-xs font-semibold text-[#6b4f38] mb-1">可Phân côngvai trò</p>
                  <p className="text-[10px] text-[#a08060] mb-2">
                    cài đặt此vai trò在Quản lý tài khoản頁可Phân công給他人的vai trò清單。
                  </p>
                  <div className="space-y-1.5">
                    {roles.map(r => {
                      const assignableDraft = draftAssignable[role.id]
                      const isChecked = Array.isArray(assignableDraft)
                        ? assignableDraft.includes(r.name)
                        : false
                      return (
                        <label key={r.id} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setDraftAssignable(d => {
                                const cur: string[] = Array.isArray(d[role.id]) ? (d[role.id] as string[]) : []
                                const next = isChecked
                                  ? cur.filter(n => n !== r.name)
                                  : [...cur, r.name]
                                return { ...d, [role.id]: next }
                              })
                            }}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-xs text-[#4a3422]">{r.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* 錯誤訊息 */}
                {saveError && (
                  <p className="text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">{saveError}</p>
                )}

                {/* 常駐 footer：Lưu變更 / 恢復預設 / Hủy */}
                <div className="flex items-center gap-2 pt-2 border-t border-[rgba(122,82,48,.1)]">
                  <button
                    onClick={() => saveAll(role)}
                    disabled={isSavingPerm}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
                  >
                    {isSavingPerm ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Lưu變更
                  </button>
                  <button
                    onClick={() => setDraftAssignable(d => ({ ...d, [role.id]: getDefaultAssignable(role, roles) }))}
                    disabled={isSavingPerm}
                    className="px-3 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-50 transition-colors"
                    title="重設可Phân côngvai trò為hệ thống預設值"
                  >
                    恢復預設
                  </button>
                  <button
                    onClick={() => discardDraft(role)}
                    disabled={isSavingPerm}
                    className="px-3 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-50 transition-colors"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={confirmOpen}
        title={`Xóavai trò「${pendingDelete?.name}」？`}
        message="Xóa後無法復原。若仍有người dùng套用此vai trò，將無法Xóa。"
        confirmLabel="Xóa"
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          if (pendingDelete) doDelete(pendingDelete)
        }}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
