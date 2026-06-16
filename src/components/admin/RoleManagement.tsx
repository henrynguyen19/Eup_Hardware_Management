'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MODULES, ACTIONS, MODULE_LABELS, ACTION_LABELS } from '@/lib/permissions'
import type { Module, Action } from '@/lib/permissions'

interface RoleRecord {
  id: string
  name: string
  is_system: boolean
  permissions: string[]
}

interface Props {
  roles: RoleRecord[]
  currentUserEmail: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  kho: 'Kho',
  ky_thuat: 'Kỹ thuật',
  van_phong: 'Văn phòng',
  viewer: 'Viewer',
}

export default function RoleManagement({ roles, currentUserEmail }: Props) {
  const [roleList, setRoleList] = useState<RoleRecord[]>(roles)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  function hasPermission(role: RoleRecord, module: Module, action: Action): boolean {
    return role.permissions.includes(`${module}:${action}`)
  }

  function togglePermission(roleId: string, module: Module, action: Action) {
    const perm = `${module}:${action}`
    setRoleList(prev =>
      prev.map(r => {
        if (r.id !== roleId) return r
        const has = r.permissions.includes(perm)
        return {
          ...r,
          permissions: has
            ? r.permissions.filter(p => p !== perm)
            : [...r.permissions, perm],
        }
      })
    )
  }

  async function handleSave(role: RoleRecord) {
    setSaving(role.id)
    setSavedMsg(null)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: role.id, permissions: role.permissions }),
      })
      if (!res.ok) throw new Error('Lỗi lưu')
      setSavedMsg(`Đã lưu vai trò ${ROLE_LABELS[role.name] ?? role.name}`)
      setTimeout(() => setSavedMsg(null), 3000)
    } catch {
      setSavedMsg('Lỗi khi lưu, vui lòng thử lại')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/users" className="text-gray-400 hover:text-gray-600">← Người dùng</Link>
            <h1 className="text-xl font-bold text-gray-900">⚙️ Quản lý phân quyền</h1>
          </div>
          <span className="text-sm text-gray-400">{currentUserEmail}</span>
        </div>
      </header>

      {savedMsg && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-2 text-sm text-green-700 text-center">
          ✅ {savedMsg}
        </div>
      )}

      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Chú thích */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800">
            <strong>Hướng dẫn:</strong> Tick vào ô để cấp quyền cho vai trò đó trên từng module. Nhấn <strong>Lưu</strong> sau khi thay đổi.
          </div>

          {/* Bảng phân quyền từng role */}
          {roleList.map(role => (
            <div key={role.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Role header */}
              <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">
                    {ROLE_LABELS[role.name] ?? role.name}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {role.permissions.filter(p => !p.startsWith('admin:')).length} quyền được cấp
                  </p>
                </div>
                <button
                  onClick={() => handleSave(role)}
                  disabled={saving === role.id}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                >
                  {saving === role.id ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>

              {/* Permission matrix */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-gray-500 font-medium w-48">Module</th>
                      {ACTIONS.map(action => (
                        <th key={action} className="text-center px-4 py-3 text-gray-500 font-medium">
                          {ACTION_LABELS[action]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((module, i) => (
                      <tr key={module} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-5 py-3.5 font-medium text-gray-700">
                          {MODULE_LABELS[module]}
                        </td>
                        {ACTIONS.map(action => {
                          const checked = hasPermission(role, module, action)
                          return (
                            <td key={action} className="px-4 py-3.5 text-center">
                              <button
                                onClick={() => togglePermission(role.id, module, action)}
                                className={`w-6 h-6 rounded border-2 transition-all flex items-center justify-center mx-auto
                                  ${checked
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-gray-300 hover:border-blue-400'
                                  }`}
                              >
                                {checked && (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Admin permissions */}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-6">
                <span className="text-xs text-gray-500 font-medium">Quyền quản trị:</span>
                {(['admin:users', 'admin:roles'] as const).map(perm => {
                  const checked = role.permissions.includes(perm)
                  const label = perm === 'admin:users' ? 'Quản lý user' : 'Quản lý phân quyền'
                  return (
                    <label key={perm} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <button
                        onClick={() => {
                          setRoleList(prev =>
                            prev.map(r => {
                              if (r.id !== role.id) return r
                              return {
                                ...r,
                                permissions: checked
                                  ? r.permissions.filter(p => p !== perm)
                                  : [...r.permissions, perm],
                              }
                            })
                          )
                        }}
                        className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center flex-shrink-0
                          ${checked ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 hover:border-orange-400'}`}
                      >
                        {checked && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      {label}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
