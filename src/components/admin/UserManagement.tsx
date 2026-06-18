'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────
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

// ── Permission labels ────────────────────────────────────────
const PERM_LABELS: Record<string, string> = {
  'admin:users':   '👑 Quản lý user',
  'ho_tro:read':   '🛠 Xem Hỗ trợ KT',
  'ho_tro:write':  '✏️ Ghi Hỗ trợ KT',
  'kho:read':      '📦 Xem Kho',
  'thong_ke:read': '📊 Thống kê',
  'giao_nhan:read':'🚚 Giao nhận',
}

const ALL_PERMISSIONS = Object.keys(PERM_LABELS)

const ROLE_COLORS: Record<string, string> = {
  admin:     'bg-red-100 text-red-700',
  ky_thuat:  'bg-blue-100 text-blue-700',
  van_phong: 'bg-green-100 text-green-700',
  viewer:    'bg-gray-100 text-gray-600',
}

// ── Main component ───────────────────────────────────────────
export default function UserManagement({ users: initUsers, roles, currentUserEmail }: Props) {
  const [tab, setTab] = useState<'users' | 'groups'>('users')

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">👥</span>
            <h1 className="text-lg font-bold text-gray-900">Phân quyền & User</h1>
          </div>
          <span className="text-xs text-gray-400">{currentUserEmail}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-5xl mx-auto flex gap-0">
          {([['users', '👤 Người dùng'], ['groups', '🏢 Nhóm / Phòng ban']] as const).map(([key, label]) => (
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
        <div className="max-w-5xl mx-auto">
          {tab === 'users' && (
            <UsersTab initUsers={initUsers} roles={roles} currentUserEmail={currentUserEmail} />
          )}
          {tab === 'groups' && (
            <GroupsTab allUsers={initUsers} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Người dùng ──────────────────────────────────────────
function UsersTab({ initUsers, roles, currentUserEmail }: {
  initUsers: UserRecord[]
  roles: Role[]
  currentUserEmail: string
}) {
  const [userList, setUserList] = useState(initUsers)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState(roles[0]?.id ?? '')
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = userList.filter(u =>
    u.user_email.toLowerCase().includes(search.toLowerCase())
  )

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
      if (!res.ok) throw new Error(data.error ?? 'Lỗi không xác định')
      setMsg({ type: 'ok', text: `Đã thêm ${inviteEmail}` })
      setInviteEmail('')
      const updated = await fetch('/api/admin/users').then(r => r.json())
      setUserList(updated.users ?? [])
    } catch (err: unknown) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Lỗi' })
    } finally {
      setInviting(false)
    }
  }

  async function handleChangeRole(userId: string, newRoleId: string) {
    setChangingRole(userId)
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleId: newRoleId }),
      })
      setUserList(prev =>
        prev.map(u => {
          if (u.user_id !== userId) return u
          const role = roles.find(r => r.id === newRoleId)
          return { ...u, role_id: newRoleId, role_name: role?.name ?? u.role_name }
        })
      )
    } finally {
      setChangingRole(null)
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Xóa quyền truy cập của ${email}?`)) return
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setUserList(prev => prev.filter(u => u.user_id !== userId))
  }

  return (
    <div className="space-y-5">
      {/* Thêm user */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Thêm người dùng mới</h2>
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {inviting ? 'Đang thêm...' : 'Thêm'}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          * Dùng nút "Nhóm" để import hàng loạt theo phòng ban. Script: <code className="bg-gray-100 px-1 rounded">node scripts/import-users.mjs</code>
        </p>
      </div>

      {/* Danh sách */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Danh sách người dùng ({userList.length})</h2>
          <input
            placeholder="Tìm email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50/50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Email</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Vai trò</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Quyền hiệu lực</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.user_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                <td className="px-5 py-3">
                  <span className="font-medium text-gray-800">{u.user_email}</span>
                  {u.user_email === currentUserEmail && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">bạn</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <select
                    value={u.role_id}
                    onChange={e => handleChangeRole(u.user_id, e.target.value)}
                    disabled={changingRole === u.user_id || u.user_email === currentUserEmail}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border-0 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${ROLE_COLORS[u.role_name] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(u.permissions ?? []).map(p => (
                      <span key={p} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                        {PERM_LABELS[p] ?? p}
                      </span>
                    ))}
                    {(u.permissions ?? []).length === 0 && (
                      <span className="text-[10px] text-gray-300 italic">Chưa có quyền đặc biệt</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  {u.user_email !== currentUserEmail && (
                    <button
                      onClick={() => handleRemove(u.user_id, u.user_email)}
                      className="text-xs text-red-500 hover:text-red-700 transition"
                    >
                      Xóa
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-gray-400">
                  {search ? 'Không tìm thấy email phù hợp' : 'Chưa có người dùng nào'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Nhóm ────────────────────────────────────────────────
function GroupsTab({ allUsers }: { allUsers: UserRecord[] }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/groups')
    const data = await res.json()
    setGroups(data.groups ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  async function handleCreate() {
    if (!newGroupName.trim()) return
    setCreating(true); setMsg(null)
    const res = await fetch('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc }),
    })
    const data = await res.json()
    if (!res.ok) { setMsg({ type: 'err', text: data.error }); setCreating(false); return }
    setNewGroupName(''); setNewGroupDesc('')
    setMsg({ type: 'ok', text: `Đã tạo nhóm "${data.group?.name}"` })
    await fetchGroups()
    setCreating(false)
  }

  async function handleDeleteGroup(g: Group) {
    if (!confirm(`Xóa nhóm "${g.name}"? Sẽ xóa tất cả thành viên khỏi nhóm này.`)) return
    await fetch(`/api/admin/groups/${g.id}`, { method: 'DELETE' })
    await fetchGroups()
  }

  async function handleUpdatePermissions(groupId: string, newPerms: string[]) {
    await fetch(`/api/admin/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: newPerms }),
    })
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, permissions: newPerms } : g))
  }

  async function handleAddMember(groupId: string, email: string) {
    const res = await fetch(`/api/admin/groups/${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addMember', userEmail: email }),
    })
    if (res.ok) await fetchGroups()
  }

  async function handleRemoveMember(groupId: string, email: string) {
    await fetch(`/api/admin/groups/${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeMember', userEmail: email }),
    })
    await fetchGroups()
  }

  return (
    <div className="space-y-5">
      {/* Tạo nhóm mới */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Tạo nhóm mới</h2>
        <div className="flex gap-3">
          <input
            placeholder="Tên nhóm (VD: R&D Phần cứng)"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            placeholder="Mô tả (tuỳ chọn)"
            value={newGroupDesc}
            onChange={e => setNewGroupDesc(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newGroupName.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {creating ? 'Đang tạo...' : '+ Tạo nhóm'}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
        )}
      </div>

      {/* Danh sách nhóm */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              expanded={expandedId === g.id}
              onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)}
              allUsers={allUsers}
              onUpdatePermissions={handleUpdatePermissions}
              onAddMember={handleAddMember}
              onRemoveMember={handleRemoveMember}
              onDelete={handleDeleteGroup}
            />
          ))}
          {groups.length === 0 && (
            <div className="text-center py-12 text-gray-400">Chưa có nhóm nào</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Group Card ───────────────────────────────────────────────
function GroupCard({
  group, expanded, onToggle, allUsers,
  onUpdatePermissions, onAddMember, onRemoveMember, onDelete,
}: {
  group: Group
  expanded: boolean
  onToggle: () => void
  allUsers: UserRecord[]
  onUpdatePermissions: (id: string, perms: string[]) => Promise<void>
  onAddMember: (id: string, email: string) => Promise<void>
  onRemoveMember: (id: string, email: string) => Promise<void>
  onDelete: (g: Group) => Promise<void>
}) {
  const [addEmail, setAddEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const nonMembers = allUsers.filter(u => !group.member_emails.includes(u.user_email))

  async function togglePerm(perm: string) {
    setSaving(true)
    const newPerms = group.permissions.includes(perm)
      ? group.permissions.filter(p => p !== perm)
      : [...group.permissions, perm]
    await onUpdatePermissions(group.id, newPerms)
    setSaving(false)
  }

  async function handleAddMember() {
    if (!addEmail) return
    await onAddMember(group.id, addEmail)
    setAddEmail('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: group.color ?? '#6B7280' }}
          />
          <div>
            <p className="font-semibold text-gray-900">{group.name}</p>
            {group.description && (
              <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-wrap gap-1 max-w-sm justify-end">
            {group.permissions.length === 0 ? (
              <span className="text-xs text-gray-300 italic">Chưa có quyền</span>
            ) : group.permissions.map(p => (
              <span key={p} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                {PERM_LABELS[p] ?? p}
              </span>
            ))}
          </div>
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
            {group.member_count} thành viên
          </span>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
          {/* Phân quyền */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quyền truy cập của nhóm {saving && <span className="text-blue-500 ml-2">Đang lưu...</span>}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_PERMISSIONS.map(perm => {
                const active = group.permissions.includes(perm)
                return (
                  <label
                    key={perm}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition text-sm ${
                      active
                        ? 'border-blue-400 bg-blue-50 text-blue-800'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => togglePerm(perm)}
                      className="w-3.5 h-3.5 accent-blue-600"
                    />
                    <span className="text-xs">{PERM_LABELS[perm]}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Thành viên */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Thành viên ({group.member_count})
            </p>

            {/* Thêm thành viên */}
            <div className="flex gap-2 mb-3">
              <select
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn user để thêm --</option>
                {nonMembers.map(u => (
                  <option key={u.user_id} value={u.user_email}>{u.user_email}</option>
                ))}
              </select>
              <button
                onClick={handleAddMember}
                disabled={!addEmail}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition"
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
                    onClick={() => onRemoveMember(group.id, email)}
                    className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600 text-gray-400 transition text-xs"
                    title="Xóa khỏi nhóm"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {group.member_emails.length === 0 && (
                <p className="text-sm text-gray-400 italic">Chưa có thành viên</p>
              )}
            </div>
          </div>

          {/* Xóa nhóm */}
          <div className="pt-2 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => onDelete(group)}
              className="text-xs text-red-500 hover:text-red-700 transition"
            >
              Xóa nhóm này
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
