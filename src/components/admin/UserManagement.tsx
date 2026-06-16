'use client'

import { useState } from 'react'
import Link from 'next/link'

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

interface Props {
  users: UserRecord[]
  roles: Role[]
  currentUserEmail: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  kho: 'Kho',
  ky_thuat: 'Kỹ thuật',
  van_phong: 'Văn phòng',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  kho: 'bg-blue-100 text-blue-700',
  ky_thuat: 'bg-purple-100 text-purple-700',
  van_phong: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600',
}

export default function UserManagement({ users, roles, currentUserEmail }: Props) {
  const [userList, setUserList] = useState<UserRecord[]>(users)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState(roles[0]?.id ?? '')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), roleId: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi không xác định')
      setMessage({ type: 'ok', text: `Đã thêm ${inviteEmail}` })
      setInviteEmail('')
      // Reload list
      const updated = await fetch('/api/admin/users').then(r => r.json())
      setUserList(updated.users ?? [])
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Lỗi' })
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
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600">← Trang chủ</Link>
            <h1 className="text-xl font-bold text-gray-900">👥 Quản lý người dùng</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/roles" className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition">
              ⚙️ Quản lý phân quyền
            </Link>
            <span className="text-sm text-gray-400">{currentUserEmail}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Thêm người dùng */}
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
                  <option key={r.id} value={r.id}>
                    {ROLE_LABELS[r.name] ?? r.name}
                  </option>
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
            {message && (
              <p className={`mt-3 text-sm ${message.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {message.text}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400">
              * Người dùng cần đăng nhập bằng Google với email này để truy cập hệ thống.
            </p>
          </div>

          {/* Danh sách người dùng */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">
                Danh sách người dùng ({userList.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Email</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Vai trò</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Quyền</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {userList.map(u => (
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
                          <option key={r.id} value={r.id}>
                            {ROLE_LABELS[r.name] ?? r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.permissions ?? []).slice(0, 5).map(p => (
                          <span key={p} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                            {p}
                          </span>
                        ))}
                        {(u.permissions ?? []).length > 5 && (
                          <span className="text-[10px] text-gray-400">+{u.permissions.length - 5}</span>
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
                {userList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-gray-400">
                      Chưa có người dùng nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
