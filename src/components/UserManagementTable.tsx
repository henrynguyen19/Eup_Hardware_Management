'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Shield, Trash2, UserPlus, ChevronDown, ShieldCheck } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

interface UserRow {
  email: string
  role: string
  created_at: string
}

interface Props {
  initialUsers: UserRow[]
  currentUserEmail: string
  availableRoles: string[]
  permissions?: string[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UserManagementTable({ initialUsers, currentUserEmail, availableRoles, permissions = [] }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<UserRow | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<string>(availableRoles[0] ?? 'viewer')
  const [roleOpen, setRoleOpen] = useState(false)
  const roleRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // 每行的vai trò下拉：改用 fixed 定位避免被 overflow-hidden 截斷
  const [openRoleEmail, setOpenRoleEmail] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; triggerTop?: number }>({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!roleOpen) return
    const close = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [roleOpen])

  useEffect(() => {
    if (!openRoleEmail) return
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return
      setOpenRoleEmail(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openRoleEmail])

  // 下拉清đơn vị置修正：底部超出視窗時往上翻
  useEffect(() => {
    if (!openRoleEmail || !dropdownRef.current) return
    const dd = dropdownRef.current.getBoundingClientRect()
    const vh = window.innerHeight
    if (dd.bottom > vh - 8) {
      const triggerTop = dropdownPos.triggerTop ?? (dropdownPos.top - dd.height - 8)
      setDropdownPos(prev => ({
        ...prev,
        top: Math.max(8, triggerTop - dd.height - 4),
      }))
    }
  }, [openRoleEmail])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? 'Thêm mớithất bại'); return }
      setUsers(prev => [...prev, {
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        created_at: new Date().toISOString(),
      }])
      setNewEmail('')
      setNewRole(availableRoles[0] ?? 'viewer')
    } catch {
      setAddError('Thêm mớithất bại，vui lòng thử lại')
    } finally {
      setAdding(false)
    }
  }

  async function changeRole(user: UserRow, nextRole: string) {
    setLoadingEmail(user.email)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, role: nextRole }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Cập nhậtthất bại'); return }
      setUsers(prev => prev.map(u => u.email === user.email ? { ...u, role: nextRole } : u))
    } catch {
      setError('Cập nhậtthất bại，vui lòng thử lại')
    } finally {
      setLoadingEmail(null)
    }
  }

  function handleRemove(user: UserRow) {
    setPendingRemove(user)
    setConfirmOpen(true)
  }

  async function doRemove(user: UserRow) {
    setLoadingEmail(user.email)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '移除thất bại'); return }
      setUsers(prev => prev.filter(u => u.email !== user.email))
    } catch {
      setError('移除thất bại，vui lòng thử lại')
    } finally {
      setLoadingEmail(null)
    }
  }

  return (
    <div className="space-y-6">

      {/* Thêm mới Email 表單 */}
      <div className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#6b4f38] mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#7a5230]" />
          Phân côngvai trò
        </h2>
        <p className="text-xs text-[#a08060] mb-3">所有公司tài khoản皆可đăng nhập；在此Thêm vào的 Email 可指定為Quản trị viên。vai trò變更將於對方重新整理頁面後生效。</p>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="輸入公司 Email 地址"
            required
            disabled={adding}
            className="flex-1 border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
          />

          {/* 自訂vai trò下拉 */}
          <div ref={roleRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => !adding && setRoleOpen(v => !v)}
              disabled={adding}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm bg-[#faf6f0] text-[#6b4f38] cursor-pointer transition-all focus:outline-none disabled:opacity-50 whitespace-nowrap ${
                roleOpen
                  ? 'border-[#c49a72] shadow-[0_0_8px_rgba(122,82,48,.25)]'
                  : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.35)] hover:shadow-[0_0_6px_rgba(122,82,48,.18)]'
              }`}
            >
              {newRole}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${roleOpen ? 'rotate-180' : ''}`} />
            </button>
            {roleOpen && (
              <div className="absolute top-full mt-1 left-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden z-50 min-w-full">
                {availableRoles.map(role => (
                  <button key={role} type="button"
                    onClick={() => { setNewRole(role); setRoleOpen(false) }}
                    className={`w-full text-left px-3.5 py-2 text-sm transition-colors whitespace-nowrap ${
                      newRole === role
                        ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                        : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                    }`}>
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7a5230] text-white text-sm font-medium rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-all shadow-[0_0_8px_rgba(122,82,48,.35)] hover:shadow-[0_0_12px_rgba(122,82,48,.5)]"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Thêm mới
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-sm text-[#b5451b]">{addError}</p>
        )}
      </div>

      {/* người dùng清單 */}
      <div>
        {error && (
          <div className="mb-4 text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="mb-3 text-sm text-[#a08060]">
          Tổng cộng {users.length} 位người dùng
        </div>

        <div className="overflow-hidden rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
          {users.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#a08060]">尚未Thêm vào任何người dùng</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.12)]">
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38]">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38]">
                    <span className="flex items-center gap-2">
                      vai trò
                      {permissions.includes('manage_roles') && (
                        <Link href="/admin/roles" className="flex items-center gap-1 text-[10px] font-normal text-[#a08060] hover:text-[#7a5230] transition-colors border border-[rgba(122,82,48,.2)] rounded px-1.5 py-0.5 hover:border-[rgba(122,82,48,.4)]">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          vai tròquản lý
                        </Link>
                      )}
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] hidden sm:table-cell">Thêm vàongày</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(122,82,48,.08)]">
                {users.map(user => {
                  const isSelf = user.email === currentUserEmail
                  const isLoading = loadingEmail === user.email
                  const isRowRoleOpen = openRoleEmail === user.email
                  return (
                    <tr key={user.email} className="hover:bg-[rgba(122,82,48,.03)] transition-colors">
                      <td className="px-4 py-3 text-[#2c1e12]">
                        {user.email}
                        {isSelf && <span className="ml-2 text-xs text-[#a08060]">（你）</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={isLoading || isSelf}
                          onClick={e => {
                            if (isSelf) return
                            if (isRowRoleOpen) { setOpenRoleEmail(null); return }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                            setDropdownPos({ top: rect.bottom + 4, left: rect.left, triggerTop: rect.top })
                            setOpenRoleEmail(user.email)
                          }}
                          className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-all disabled:cursor-not-allowed ${
                            isSelf
                              ? 'bg-[rgba(122,82,48,.05)] text-[#a08060] border-[rgba(122,82,48,.15)] opacity-60'
                              : 'bg-[rgba(122,82,48,.07)] text-[#6b4f38] border-[rgba(122,82,48,.2)] hover:bg-[rgba(122,82,48,.14)] hover:text-[#7a5230]'
                          }`}
                        >
                          {isLoading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Shield className="h-3 w-3" />
                          }
                          {user.role}
                          {!isSelf && <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${isRowRoleOpen ? 'rotate-180' : ''}`} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[#a08060] hidden sm:table-cell">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRemove(user)}
                            disabled={isLoading || isSelf}
                            title={isSelf ? '無法移除自己' : '移除người dùng'}
                            className="p-1.5 rounded-lg text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.08)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* vai trò下拉：fixed 定位，不受 overflow-hidden 截斷 */}
      {openRoleEmail && (
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: Math.min(dropdownPos.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 200 - 8), zIndex: 9999 }}
          className="bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-y-auto max-h-[min(60vh,320px)] max-w-[200px] min-w-[8rem]"
        >
          {availableRoles.map(role => {
            const currentRole = users.find(u => u.email === openRoleEmail)?.role
            return (
              <button
                key={role}
                type="button"
                onClick={() => {
                  const user = users.find(u => u.email === openRoleEmail)
                  setOpenRoleEmail(null)
                  if (user && role !== user.role) changeRole(user, role)
                }}
                className={`w-full text-left px-3.5 py-2 text-sm transition-colors break-words ${
                  role === currentRole
                    ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                    : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                }`}
              >
                {role}
              </button>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`移除 ${pendingRemove?.email}？`}
        message="移除後該tài khoản將失去Quản trị viênquyền，但仍可用公司tài khoảnđăng nhập。"
        confirmLabel="移除"
        danger
        onConfirm={() => { setConfirmOpen(false); if (pendingRemove) doRemove(pendingRemove) }}
        onCancel={() => { setConfirmOpen(false); setPendingRemove(null) }}
      />
    </div>
  )
}
