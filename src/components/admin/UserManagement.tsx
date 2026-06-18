'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────
interface UserRecord {
  user_id: string
  user_email: string
  role_name: string
  role_id: string
  permissions: string[]
}

interface Role {
  id: string
  name: string
}

interface Group {
  id: string
  name: string
  description: string
  permissions: string[]
  color: string
  member_count: number
  member_emails: string[]
}

interface Props {
  users: UserRecord[]
  roles: Role[]
  currentUserEmail: string
}

// ── Permission Matrix Definition ──────────────────────────────
const FEATURES = [
  { id: 'kho',      label: 'Quản lý thiết bị', icon: '📦', actions: ['read','write','edit','delete'] },
  { id: 'ho_tro',   label: 'Hỗ trợ kỹ thuật',  icon: '🛠️', actions: ['read','write','edit','delete'] },
  { id: 'sua_chua', label: 'Thống kê sửa chữa', icon: '📊', actions: ['read','write','edit','delete'] },
  { id: 'gui_hang', label: 'Giao nhận',          icon: '🚚', actions: ['read','write','edit','delete'] },
  { id: 'admin',    label: 'Phân quyền & User',  icon: '👥', actions: ['users'] },
]

const ACTION_LABELS: Record<string, string> = {
  read: 'Xem', write: 'Thêm', edit: 'Sửa', delete: 'Xóa', users: 'Quản lý',
}

// Build flat permission key: "kho:read", "admin:users" …
function permKey(featureId: string, action: string) {
  return `${featureId}:${action}`
}

// All permission keys (for display / checking)
const ALL_PERM_KEYS = FEATURES.flatMap(f => f.actions.map(a => permKey(f.id, a)))

function permLabel(key: string): string {
  const [feat, act] = key.split(':')
  const f = FEATURES.find(x => x.id === feat)
  return f ? `${f.icon} ${f.label} › ${ACTION_LABELS[act] ?? act}` : key
}

// ── Main component ─────────────────────────────────────────────
export default function UserManagement({ users: initUsers, roles, currentUserEmail }: Props) {
  const [tab, setTab] = useState<'groups' | 'users'>('groups')
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [userList] = useState(initUsers)

  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true)
    const res = await fetch('/api/admin/groups')
    const data = await res.json()
    setGroups(data.groups ?? [])
    setLoadingGroups(false)
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  // Map user → group(s) for the Users tab
  const userGroupMap: Record<string, string[]> = {}
  for (const g of groups) {
    for (const email of g.member_emails) {
      if (!userGroupMap[email]) userGroupMap[email] = []
      userGroupMap[email].push(g.name)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">👥</span>
            <h1 className="text-lg font-bold text-gray-900">Phân quyền & User</h1>
          </div>
          <span className="text-xs text-gray-400">{currentUserEmail}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-6xl mx-auto flex">
          {([
            ['groups', '🏢 Nhóm / Phòng ban'],
            ['users',  '👤 Danh sách người dùng'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
                tab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {tab === 'groups' && (
            <GroupsTab
              groups={groups}
              loading={loadingGroups}
              allUsers={userList}
              onRefresh={fetchGroups}
            />
          )}
          {tab === 'users' && (
            <UsersTab
              users={userList}
              roles={roles}
              groups={groups}
              userGroupMap={userGroupMap}
              currentUserEmail={currentUserEmail}
              onRefresh={fetchGroups}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Nhóm ─────────────────────────────────────────────────
function GroupsTab({
  groups, loading, allUsers, onRefresh,
}: {
  groups: Group[]
  loading: boolean
  allUsers: UserRecord[]
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(groups[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true); setMsg(null)
    const res = await fetch('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setMsg({ type: 'err', text: data.error }); setCreating(false); return }
    setNewName('')
    setMsg({ type: 'ok', text: `Đã tạo nhóm "${data.group?.name}"` })
    await onRefresh()
    setCreating(false)
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Đang tải...</div>

  return (
    <div className="space-y-4">
      {/* Tạo nhóm mới */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
        <input
          placeholder="Tên nhóm mới (VD: R&D Phần mềm)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
        >
          {creating ? 'Đang tạo...' : '+ Tạo nhóm'}
        </button>
        {msg && <span className={`text-sm ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>}
      </div>

      {/* Danh sách nhóm */}
      {groups.map(g => (
        <GroupCard
          key={g.id}
          group={g}
          expanded={expanded === g.id}
          onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
          allUsers={allUsers}
          onRefresh={onRefresh}
        />
      ))}

      {groups.length === 0 && (
        <div className="text-center py-20 text-gray-400">Chưa có nhóm nào</div>
      )}
    </div>
  )
}

// ── Group Card với Permission Matrix ──────────────────────────
function GroupCard({
  group, expanded, onToggle, allUsers, onRefresh,
}: {
  group: Group
  expanded: boolean
  onToggle: () => void
  allUsers: UserRecord[]
  onRefresh: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [memberTab, setMemberTab] = useState<'matrix' | 'members'>('matrix')

  const perms = new Set(group.permissions)
  const nonMembers = allUsers.filter(u => !group.member_emails.includes(u.user_email))

  async function togglePerm(key: string) {
    setSaving(true)
    const newPerms = perms.has(key)
      ? group.permissions.filter(p => p !== key)
      : [...group.permissions, key]
    await fetch(`/api/admin/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: newPerms }),
    })
    await onRefresh()
    setSaving(false)
  }

  async function toggleFeatureRead(featureId: string, actions: string[]) {
    // Toggle toàn bộ feature (all actions on/off)
    const featurePerms = actions.map(a => permKey(featureId, a))
    const allOn = featurePerms.every(k => perms.has(k))
    setSaving(true)
    const newPerms = allOn
      ? group.permissions.filter(p => !featurePerms.includes(p))
      : [...new Set([...group.permissions, ...featurePerms])]
    await fetch(`/api/admin/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: newPerms }),
    })
    await onRefresh()
    setSaving(false)
  }

  async function handleAddMember() {
    if (!addEmail) return
    await fetch(`/api/admin/groups/${group.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addMember', userEmail: addEmail }),
    })
    setAddEmail('')
    await onRefresh()
  }

  async function handleRemoveMember(email: string) {
    await fetch(`/api/admin/groups/${group.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeMember', userEmail: email }),
    })
    await onRefresh()
  }

  async function handleDelete() {
    if (!confirm(`Xóa nhóm "${group.name}"?`)) return
    await fetch(`/api/admin/groups/${group.id}`, { method: 'DELETE' })
    await onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ background: group.color ?? '#6B7280' }} />
          <div>
            <span className="font-semibold text-gray-900">{group.name}</span>
            {group.description && (
              <span className="ml-3 text-xs text-gray-400">{group.description}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Tóm tắt quyền */}
          <div className="hidden sm:flex gap-1 flex-wrap max-w-sm justify-end">
            {FEATURES.map(f => {
              const hasAny = f.actions.some(a => perms.has(permKey(f.id, a)))
              const hasAll = f.actions.every(a => perms.has(permKey(f.id, a)))
              if (!hasAny) return null
              return (
                <span
                  key={f.id}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    hasAll ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f.icon} {f.label}{hasAll ? '' : ' (một phần)'}
                </span>
              )
            })}
          </div>
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
            {group.member_count} thành viên
          </span>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Sub-tabs */}
          <div className="flex border-b border-gray-100 px-5">
            {([['matrix','🔐 Phân quyền'], ['members','👤 Thành viên']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMemberTab(key)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                  memberTab === key ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'
                }`}
              >
                {label} {key === 'members' && `(${group.member_count})`}
              </button>
            ))}
            {saving && <span className="ml-auto self-center text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>

          {/* Permission Matrix */}
          {memberTab === 'matrix' && (
            <div className="p-5">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 w-48">Tính năng</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-16">Xem</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-16">Thêm</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-16">Sửa</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-16">Xóa</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-20">Tất cả</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map(f => {
                    const featurePerms = f.actions.map(a => permKey(f.id, a))
                    const allOn = featurePerms.every(k => perms.has(k))
                    const standardActions = ['read', 'write', 'edit', 'delete']
                    return (
                      <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                        <td className="py-3 pr-4">
                          <span className="font-medium text-gray-800">
                            {f.icon} {f.label}
                          </span>
                        </td>
                        {standardActions.map(act => {
                          const key = permKey(f.id, act)
                          const supported = f.actions.includes(act)
                          const checked = perms.has(key)
                          return (
                            <td key={act} className="text-center py-3 px-3">
                              {supported ? (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePerm(key)}
                                  disabled={saving}
                                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                                />
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="text-center py-3 px-3">
                          <button
                            onClick={() => toggleFeatureRead(f.id, f.actions)}
                            disabled={saving}
                            className={`text-[10px] px-2 py-1 rounded-full font-medium transition ${
                              allOn
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {allOn ? 'Bỏ hết' : 'Chọn hết'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-gray-400">
                Quyền của nhóm áp dụng cho tất cả thành viên. Quyền cá nhân (từ vai trò) được gộp thêm vào.
              </p>
            </div>
          )}

          {/* Members */}
          {memberTab === 'members' && (
            <div className="p-5 space-y-4">
              {/* Thêm thành viên */}
              <div className="flex gap-2">
                <select
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Chọn user để thêm vào nhóm --</option>
                  {nonMembers.map(u => (
                    <option key={u.user_id} value={u.user_email}>{u.user_email}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!addEmail}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition"
                >
                  Thêm
                </button>
              </div>

              {/* Danh sách thành viên */}
              <div className="flex flex-wrap gap-2">
                {group.member_emails.map(email => (
                  <div
                    key={email}
                    className="flex items-center gap-1.5 bg-gray-100 rounded-full pl-3 pr-1 py-1 text-sm text-gray-700"
                  >
                    <span>{email}</span>
                    <button
                      onClick={() => handleRemoveMember(email)}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600 text-gray-400 transition text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {group.member_emails.length === 0 && (
                  <p className="text-sm text-gray-400 italic">Chưa có thành viên</p>
                )}
              </div>

              {/* Xóa nhóm */}
              <div className="pt-3 border-t border-gray-100 flex justify-end">
                <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">
                  Xóa nhóm này
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: Người dùng (phân tầng theo nhóm) ─────────────────────
function UsersTab({
  users, roles, groups, userGroupMap, currentUserEmail, onRefresh,
}: {
  users: UserRecord[]
  roles: Role[]
  groups: Group[]
  userGroupMap: Record<string, string[]>
  currentUserEmail: string
  onRefresh: () => void
}) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState(roles[0]?.id ?? '')
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>('__none__')
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [resetting, setResetting]       = useState<string | null>(null)
  const [resetMsg, setResetMsg]         = useState<{ userId: string; ok: boolean } | null>(null)

  const filtered = users.filter(u =>
    u.user_email.toLowerCase().includes(search.toLowerCase())
  )

  // Group users
  const grouped: { label: string; color: string; id: string; members: UserRecord[] }[] = []

  for (const g of groups) {
    const members = filtered.filter(u => g.member_emails.includes(u.user_email))
    grouped.push({ id: g.id, label: g.name, color: g.color ?? '#6B7280', members })
  }

  const ungrouped = filtered.filter(u =>
    !groups.some(g => g.member_emails.includes(u.user_email))
  )
  grouped.push({ id: '__none__', label: 'Không thuộc nhóm', color: '#9CA3AF', members: ungrouped })

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), roleId: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ type: 'ok', text: `Đã thêm ${inviteEmail}` })
      setInviteEmail('')
    } catch (err: unknown) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Lỗi' })
    } finally {
      setInviting(false)
    }
  }

  async function handleChangeRole(userId: string, roleId: string) {
    setChangingRole(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId }),
    })
    setChangingRole(null)
  }

  async function handleResetPassword(userId: string) {
    if (!confirm('Reset mật khẩu về "eupvn123"?')) return
    setResetting(userId); setResetMsg(null)
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setResetting(null)
    setResetMsg({ userId, ok: res.ok })
    setTimeout(() => setResetMsg(null), 3000)
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Xóa quyền truy cập của ${email}?`)) return
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  }

  return (
    <div className="space-y-5">
      {/* Thêm user */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-3">
          <input
            type="email"
            placeholder="email@eup.net.vn"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {inviting ? 'Đang thêm...' : 'Thêm'}
          </button>
        </div>
        {msg && <p className={`mt-2 text-sm ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
      </div>

      {/* Search */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Tổng cộng {users.length} người dùng</p>
        <input
          placeholder="Tìm email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Grouped list */}
      <div className="space-y-3">
        {grouped.map(g => (
          <div key={g.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Group header */}
            <div
              className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
              onClick={() => setExpandedGroup(expandedGroup === g.id ? null : g.id)}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
                <span className="font-semibold text-sm text-gray-800">{g.label}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {g.members.length} người
                </span>
              </div>
              <span className="text-gray-400 text-xs">{expandedGroup === g.id ? '▲' : '▼'}</span>
            </div>

            {/* User rows */}
            {expandedGroup === g.id && (
              <table className="w-full text-sm border-t border-gray-100">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="text-left px-5 py-2 text-xs text-gray-400 font-medium">Email</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Vai trò</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Quyền hiệu lực</th>
                    <th className="px-4 py-2 text-xs text-gray-400 font-medium text-center">Mật khẩu</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-gray-300 text-sm italic">
                        Chưa có thành viên
                      </td>
                    </tr>
                  )}
                  {g.members.map(u => (
                    <tr key={u.user_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-800">{u.user_email}</span>
                        {u.user_email === currentUserEmail && (
                          <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">bạn</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          defaultValue={u.role_id}
                          onChange={e => handleChangeRole(u.user_id, e.target.value)}
                          disabled={changingRole === u.user_id || u.user_email === currentUserEmail}
                          className="text-xs px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none"
                        >
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <PermSummary permissions={u.permissions} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {resetMsg?.userId === u.user_id ? (
                          <span className={`text-[10px] font-medium ${resetMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                            {resetMsg.ok ? '✓ Đã reset' : '✗ Lỗi'}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResetPassword(u.user_id)}
                            disabled={resetting === u.user_id}
                            title="Reset về eupvn123"
                            className="text-[11px] px-2 py-1 rounded border border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-400 transition disabled:opacity-40 font-medium"
                          >
                            {resetting === u.user_id ? '...' : '🔑 Reset MK'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.user_email !== currentUserEmail && (
                          <button
                            onClick={() => handleRemove(u.user_id, u.user_email)}
                            className="text-xs text-red-400 hover:text-red-600 transition"
                          >
                            Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Permission Summary chips ───────────────────────────────────
function PermSummary({ permissions }: { permissions: string[] }) {
  const perms = new Set(permissions)
  return (
    <div className="flex flex-wrap gap-1">
      {FEATURES.map(f => {
        const hasRead  = perms.has(permKey(f.id, f.actions[0]))
        const hasWrite = f.actions.length > 1 && perms.has(permKey(f.id, 'write'))
        const hasEdit  = f.actions.length > 1 && perms.has(permKey(f.id, 'edit'))
        const hasDel   = f.actions.length > 1 && perms.has(permKey(f.id, 'delete'))
        if (!hasRead) return null
        const parts = ['Xem', hasWrite && 'Thêm', hasEdit && 'Sửa', hasDel && 'Xóa'].filter(Boolean)
        return (
          <span key={f.id} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
            {f.icon} {parts.join('·')}
          </span>
        )
      })}
      {permissions.length === 0 && <span className="text-[10px] text-gray-300 italic">Chưa có quyền</span>}
    </div>
  )
}
