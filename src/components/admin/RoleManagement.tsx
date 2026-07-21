'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

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

// ─── Cấu trúc phân quyền chuẩn ────────────────────────────────────────────
// Mỗi module có tối đa 3 cấp: Xem (read) → Thêm/Sửa (write) → Quản lý (admin)
// Cấp cao hơn bao gồm cấp thấp hơn (logic ở UI, không ép ở DB)

type Level = 'read' | 'write' | 'admin'
interface PermLevel { key: string; label: string; level: Level }
interface Module { id: string; label: string; desc: string; levels: PermLevel[] }
interface ModuleGroup { group: string; items: Module[] }

const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: 'Kho & Thiết bị',
    items: [
      {
        id: 'kho',
        label: 'Kho thiết bị',
        desc: 'Danh sách, tính năng, loại xe',
        levels: [
          { key: 'kho:read',  label: 'Xem',        level: 'read' },
          { key: 'kho:write', label: 'Thêm / Sửa', level: 'write' },
        ],
      },
      {
        id: 'kho_daily',
        label: 'Kho Daily',
        desc: 'Báo cáo nhập/xuất hàng ngày',
        levels: [
          { key: 'kho_daily:read',  label: 'Xem',       level: 'read' },
          { key: 'kho_daily:write', label: 'Nhập liệu', level: 'write' },
        ],
      },
    ],
  },
  {
    group: 'Vận hành',
    items: [
      {
        id: 'ho_tro',
        label: 'Hỗ trợ kỹ thuật',
        desc: 'Yêu cầu hỗ trợ từ CRM',
        levels: [
          { key: 'ho_tro:read',  label: 'Xem (của mình)',          level: 'read' },
          { key: 'ho_tro:write', label: 'Đồng bộ CRM',             level: 'write' },
          { key: 'ho_tro:admin', label: 'Trưởng nhóm (toàn bộ)',   level: 'admin' },
        ],
      },
      {
        id: 'sua_chua',
        label: 'Sửa chữa',
        desc: 'Thống kê và tracking sửa chữa',
        levels: [
          { key: 'sua_chua:read',  label: 'Xem',       level: 'read' },
          { key: 'sua_chua:write', label: 'Nhập liệu', level: 'write' },
        ],
      },
      {
        id: 'gui_hang',
        label: 'Giao nhận',
        desc: 'Đơn hàng và thông tin giao nhận',
        levels: [
          { key: 'gui_hang:read',  label: 'Xem',            level: 'read' },
          { key: 'gui_hang:write', label: 'Tạo / Cập nhật', level: 'write' },
        ],
      },
    ],
  },
  {
    group: 'Chất lượng & Chứng nhận',
    items: [
      {
        id: 'chat_luong',
        label: 'Chất lượng',
        desc: 'Quản lý chất lượng thiết bị',
        levels: [
          { key: 'chat_luong:read',  label: 'Xem',      level: 'read' },
          { key: 'chat_luong:write', label: 'Cập nhật', level: 'write' },
        ],
      },
      {
        id: 'chung_nhan',
        label: 'Chứng nhận',
        desc: 'Giấy chứng nhận & tài liệu kỹ thuật',
        levels: [
          { key: 'chung_nhan:read',  label: 'Xem',                  level: 'read' },
          { key: 'chung_nhan:write', label: 'Upload / Tạo folder',   level: 'write' },
        ],
      },
    ],
  },
  {
    group: 'Tài liệu',
    items: [
      {
        id: 'tai_lieu',
        label: 'Tài liệu kỹ thuật',
        desc: 'Tài liệu nội bộ, thông số kỹ thuật',
        levels: [
          { key: 'tai_lieu:read', label: 'Xem', level: 'read' },
        ],
      },
      {
        id: 'huong_dan',
        label: 'Hướng dẫn lắp đặt',
        desc: 'Hướng dẫn sử dụng và lắp đặt',
        levels: [
          { key: 'huong_dan:read', label: 'Xem', level: 'read' },
        ],
      },
    ],
  },
  {
    group: 'Quản trị hệ thống',
    items: [
      {
        id: 'admin',
        label: 'Người dùng & Phòng ban',
        desc: 'Thêm, sửa tài khoản — gán phòng ban & vai trò',
        levels: [
          { key: 'admin:users', label: 'Quản lý toàn bộ', level: 'admin' },
        ],
      },
    ],
  },
]

const ALL_PERM_KEYS = MODULE_GROUPS.flatMap(g => g.items.flatMap(m => m.levels.map(l => l.key)))

const LEVEL_STYLE: Record<Level, { badge: string; check: string; dot: string }> = {
  read:  { badge: 'bg-blue-50 text-blue-700 border-blue-200',   check: 'bg-blue-500 border-blue-500',   dot: 'bg-blue-400' },
  write: { badge: 'bg-amber-50 text-amber-700 border-amber-200', check: 'bg-amber-500 border-amber-500', dot: 'bg-amber-400' },
  admin: { badge: 'bg-red-50 text-red-700 border-red-200',       check: 'bg-red-500 border-red-500',     dot: 'bg-red-400' },
}

// ─── Checkbox component ────────────────────────────────────────────────────
function Checkbox({ checked, onChange, level }: { checked: boolean; onChange: () => void; level: Level }) {
  const s = LEVEL_STYLE[level]
  return (
    <button
      onClick={onChange}
      className={
        'w-5 h-5 rounded border-2 transition-all flex items-center justify-center flex-shrink-0 ' +
        (checked ? s.check + ' text-white' : 'border-gray-300 bg-white hover:border-gray-400')
      }
    >
      {checked && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

// ─── Role summary dots ─────────────────────────────────────────────────────
function PermSummary({ permissions }: { permissions: string[] }) {
  const modules = MODULE_GROUPS.flatMap(g => g.items)
  const active = modules.filter(m => m.levels.some(l => permissions.includes(l.key)))
  if (active.length === 0) return <span className="text-xs text-gray-400 italic">Chưa có quyền nào</span>

  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map(m => {
        const topLevel = [...m.levels].reverse().find(l => permissions.includes(l.key))!
        const s = LEVEL_STYLE[topLevel.level]
        return (
          <span key={m.id} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${s.badge}`}>
            {m.label}
          </span>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export default function RoleManagement({ roles: initialRoles, currentUserEmail }: Props) {
  const [roleList, setRoleList]   = useState<RoleRecord[]>(initialRoles)
  const [saving, setSaving]       = useState<string | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]     = useState('')
  const [creating, setCreating]   = useState(false)
  const [expanded, setExpanded]   = useState<string | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const refetch = useCallback(async () => {
    const res = await fetch('/api/admin/roles').then(r => r.json())
    if (res.roles) setRoleList(res.roles)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  function toggle(roleId: string, key: string) {
    setRoleList(prev => prev.map(r => {
      if (r.id !== roleId) return r
      const has = r.permissions.includes(key)
      return { ...r, permissions: has ? r.permissions.filter(p => p !== key) : [...r.permissions, key] }
    }))
  }

  async function handleSave(role: RoleRecord) {
    setSaving(role.id)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: role.id, permissions: role.permissions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi lưu')
      showToast(`Đã lưu vai trò "${role.name}"`)
    } catch (e) {
      showToast((e as Error).message, false)
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(role: RoleRecord) {
    if (!confirm(`Xóa vai trò "${role.name}"? Các tài khoản đang dùng vai trò này sẽ mất quyền.`)) return
    setDeleting(role.id)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: role.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi xóa')
      showToast(`Đã xóa vai trò "${role.name}"`)
      setRoleList(prev => prev.filter(r => r.id !== role.id))
      if (expanded === role.id) setExpanded(null)
    } catch (e) {
      showToast((e as Error).message, false)
    } finally {
      setDeleting(null)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), permissions: [] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi tạo')
      showToast(`Đã tạo vai trò "${data.name}"`)
      setRoleList(prev => [...prev, { id: data.id, name: data.name, is_system: false, permissions: [] }])
      setExpanded(data.id)
      setNewName('')
      setShowCreate(false)
    } catch (e) {
      showToast((e as Error).message, false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-14 md:top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/users"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
              ← Người dùng
            </Link>
            <span className="text-gray-200">|</span>
            <h1 className="text-lg font-bold text-gray-900">Vai trò &amp; Phân quyền</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">{currentUserEmail}</span>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
              + Tạo vai trò mới
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className={
          'sticky top-[65px] z-10 px-6 py-2.5 text-sm text-center font-medium ' +
          (toast.ok
            ? 'bg-green-50 border-b border-green-200 text-green-700'
            : 'bg-red-50 border-b border-red-200 text-red-700')
        }>
          {toast.msg}
        </div>
      )}

      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-3">

          {/* Legend */}
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Cấp quyền:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /> Xem — chỉ đọc
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Thêm / Sửa — thao tác dữ liệu
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Quản lý — quyền cao nhất của module
            </span>
          </div>

          {roleList.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200 text-sm">
              Chưa có vai trò nào. Nhấn &quot;+ Tạo vai trò mới&quot; để bắt đầu.
            </div>
          )}

          {roleList.map(role => {
            const isExpanded = expanded === role.id

            return (
              <div key={role.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

                {/* Role header row */}
                <div
                  className="flex items-start justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition gap-4"
                  onClick={() => setExpanded(isExpanded ? null : role.id)}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="text-gray-400 mt-0.5 flex-shrink-0 text-xs">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h2 className="font-bold text-gray-800">{role.name}</h2>
                        {role.is_system && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">
                            Hệ thống
                          </span>
                        )}
                      </div>
                      <PermSummary permissions={role.permissions} />
                    </div>
                  </div>

                  {/* Action buttons — only when expanded */}
                  {isExpanded && (
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setRoleList(prev => prev.map(r => r.id !== role.id ? r : { ...r, permissions: [] }))}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">
                        Bỏ tất cả
                      </button>
                      <button
                        onClick={() => setRoleList(prev => prev.map(r => r.id !== role.id ? r : { ...r, permissions: [...ALL_PERM_KEYS] }))}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">
                        Chọn tất cả
                      </button>
                      <button
                        onClick={() => handleSave(role)}
                        disabled={saving === role.id}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                        {saving === role.id ? 'Đang lưu...' : 'Lưu'}
                      </button>
                      {!role.is_system && (
                        <button
                          onClick={() => handleDelete(role)}
                          disabled={deleting === role.id}
                          className="px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 rounded-lg text-sm transition">
                          {deleting === role.id ? '...' : 'Xóa'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Permission matrix */}
                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {MODULE_GROUPS.map(group => (
                      <div key={group.group}>
                        {/* Group header */}
                        <div className="px-5 py-2 bg-gray-50">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            {group.group}
                          </p>
                        </div>

                        {/* Module rows */}
                        <div className="divide-y divide-gray-50">
                          {group.items.map(mod => (
                            <div key={mod.id} className="flex items-start gap-4 px-5 py-3 hover:bg-gray-50/50 transition">

                              {/* Module info */}
                              <div className="w-44 flex-shrink-0">
                                <p className="text-sm font-medium text-gray-800">{mod.label}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{mod.desc}</p>
                              </div>

                              {/* Permission checkboxes */}
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                {mod.levels.map(({ key, label, level }) => {
                                  const checked = role.permissions.includes(key)
                                  const s = LEVEL_STYLE[level]
                                  return (
                                    <label
                                      key={key}
                                      className={
                                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition select-none ' +
                                        (checked
                                          ? s.badge + ' border ' + s.badge.split(' ')[2]
                                          : 'bg-white border-gray-200 hover:border-gray-300')
                                      }
                                      onClick={() => toggle(role.id, key)}
                                    >
                                      <Checkbox checked={checked} onChange={() => toggle(role.id, key)} level={level} />
                                      <span className="text-xs font-medium">{label}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Create role modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-gray-800 mb-1">Tạo vai trò mới</h3>
            <p className="text-xs text-gray-400 mb-4">
              Sau khi tạo, mở rộng vai trò để tích các quyền cần thiết.
            </p>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Tên vai trò (vd: Nhân viên kho)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-60">
                {creating ? 'Đang tạo...' : 'Tạo'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName('') }}
                className="flex-1 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
