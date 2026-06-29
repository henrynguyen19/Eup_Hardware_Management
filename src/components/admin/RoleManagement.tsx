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

const PERMISSION_GROUPS = [
  {
    label: 'Kho thiet bi',
    perms: [
      { key: 'kho:read',        label: 'Xem danh sach thiet bi' },
      { key: 'kho:write',       label: 'Them / sua thiet bi' },
    ],
  },
  {
    label: 'Kho Daily',
    perms: [
      { key: 'kho_daily:read',  label: 'Xem bao cao kho hang ngay' },
      { key: 'kho_daily:write', label: 'Nhap lieu kho hang ngay' },
    ],
  },
  {
    label: 'Ho tro ky thuat',
    perms: [
      { key: 'ho_tro:read',     label: 'Xem yeu cau ho tro (cua minh)' },
      { key: 'ho_tro:write',    label: 'Dong bo CRM (cua minh)' },
      { key: 'ho_tro:admin',    label: 'Truong nhom — xem & dong bo toan bo nhom' },
    ],
  },
  {
    label: 'Sua chua',
    perms: [
      { key: 'sua_chua:read',   label: 'Xem thong ke sua chua' },
      { key: 'sua_chua:write',  label: 'Nhap lieu sua chua' },
    ],
  },
  {
    label: 'Chat luong',
    perms: [
      { key: 'chat_luong:read', label: 'Xem chat luong' },
    ],
  },
  {
    label: 'Giay chung nhan',
    perms: [
      { key: 'chung_nhan:read', label: 'Xem giay chung nhan' },
    ],
  },
  {
    label: 'Quan tri he thong',
    perms: [
      { key: 'admin:users',     label: 'Quan ly nguoi dung & phong ban' },
      { key: 'admin:roles',     label: 'Quan ly vai tro & phan quyen' },
    ],
  },
]

const ALL_PERMS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key))

function PermCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={
        'w-5 h-5 rounded border-2 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ' +
        (checked
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'border-gray-300 hover:border-blue-400 bg-white')
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

export default function RoleManagement({ roles: initialRoles, currentUserEmail }: Props) {
  const [roleList, setRoleList] = useState<RoleRecord[]>(initialRoles)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const refetch = useCallback(async () => {
    const res = await fetch('/api/admin/roles').then(r => r.json())
    if (res.roles) setRoleList(res.roles)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  function toggle(roleId: string, perm: string) {
    setRoleList(prev => prev.map(r => {
      if (r.id !== roleId) return r
      const has = r.permissions.includes(perm)
      return {
        ...r,
        permissions: has ? r.permissions.filter(p => p !== perm) : [...r.permissions, perm],
      }
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
      if (!res.ok) throw new Error(data.error ?? 'Loi luu')
      showToast('Da luu vai tro "' + role.name + '"')
    } catch (e) {
      showToast((e as Error).message, false)
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(role: RoleRecord) {
    if (!confirm('Xoa vai tro "' + role.name + '"? Cac tai khoan dang dung role nay se mat quyen.')) return
    setDeleting(role.id)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: role.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Loi xoa')
      showToast('Da xoa vai tro "' + role.name + '"')
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
      if (!res.ok) throw new Error(data.error ?? 'Loi tao')
      showToast('Da tao vai tro "' + data.name + '"')
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

  function selectAll(roleId: string) {
    setRoleList(prev => prev.map(r => r.id !== roleId ? r : { ...r, permissions: [...ALL_PERMS] }))
  }
  function clearAll(roleId: string) {
    setRoleList(prev => prev.map(r => r.id !== roleId ? r : { ...r, permissions: [] }))
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/users"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
              {String.fromCharCode(8592)} Nguoi dung
            </Link>
            <span className="text-gray-200">|</span>
            <h1 className="text-lg font-bold text-gray-900">Quan ly vai tro &amp; quyen</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">{currentUserEmail}</span>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
              + Tao vai tro moi
            </button>
          </div>
        </div>
      </header>

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
        <div className="max-w-4xl mx-auto space-y-4">

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3.5 text-sm text-blue-800">
            <strong>Cach dung:</strong> Chon vai tro {String.fromCharCode(8594)} tick quyen can cap {String.fromCharCode(8594)} nhan <strong>Luu</strong>.
            Sau do vao <Link href="/admin/users" className="underline">Nguoi dung</Link> de gan vai tro cho tung tai khoan.
          </div>

          {roleList.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
              <p className="text-sm">Chua co vai tro nao. Nhan "+ Tao vai tro moi" de bat dau.</p>
            </div>
          )}

          {roleList.map(role => {
            const isExpanded = expanded === role.id
            const permCount = role.permissions.filter(p => !p.startsWith('admin:')).length
            const adminCount = role.permissions.filter(p => p.startsWith('admin:')).length

            return (
              <div key={role.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpanded(isExpanded ? null : role.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-gray-400">{isExpanded ? String.fromCharCode(9660) : String.fromCharCode(9654)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-bold text-gray-800">{role.name}</h2>
                        {role.is_system && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">He thong</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {permCount > 0 ? permCount + ' quyen module' : 'Chua co quyen'}
                        {adminCount > 0 && ' · ' + adminCount + ' quyen admin'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {isExpanded && (
                      <>
                        <button onClick={() => clearAll(role.id)}
                          className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">
                          Bo tat ca
                        </button>
                        <button onClick={() => selectAll(role.id)}
                          className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">
                          Chon tat ca
                        </button>
                        <button
                          onClick={() => handleSave(role)}
                          disabled={saving === role.id}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                          {saving === role.id ? 'Dang luu...' : 'Luu'}
                        </button>
                        {!role.is_system && (
                          <button
                            onClick={() => handleDelete(role)}
                            disabled={deleting === role.id}
                            className="px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 rounded-lg text-sm transition">
                            {deleting === role.id ? '...' : 'Xoa'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {PERMISSION_GROUPS.map(group => (
                      <div key={group.label} className="border-b border-gray-50 last:border-0">
                        <div className="px-5 py-2 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.label}</p>
                        </div>
                        <div className="px-5 py-2 space-y-2">
                          {group.perms.map(({ key, label }) => {
                            const checked = role.permissions.includes(key)
                            return (
                              <label key={key}
                                className="flex items-center gap-3 py-1 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition">
                                <PermCheckbox checked={checked} onChange={() => toggle(role.id, key)} />
                                <span className="text-sm text-gray-700">{label}</span>
                                <code className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded ml-auto">{key}</code>
                              </label>
                            )
                          })}
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

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-gray-800 mb-4">Tao vai tro moi</h3>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Ten vai tro (vd: Nhan vien kho)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-2">Sau khi tao, mo rong vai tro de tick cac quyen can thiet.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={handleCreate} disabled={creating || !newName.trim()}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-60">
                {creating ? 'Dang tao...' : 'Tao'}
              </button>
              <button onClick={() => { setShowCreate(false); setNewName('') }}
                className="flex-1 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition">
                Huy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
