'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────
interface Department {
  id: string; name: string; code: string; color: string; member_count: number
}
interface SubPage {
  id: string; name: string; code: string; sort_order: number
}
interface FeaturePage {
  id: string; name: string; code: string; icon: string; sort_order: number
  feature_sub_pages: SubPage[]
}
interface UserRecord {
  user_id: string; user_email: string
}
type PermMap = Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }>

const ACTION_KEYS = ['can_read', 'can_create', 'can_update', 'can_delete'] as const
const ACTION_LABELS: Record<string, string> = { can_read: 'Xem', can_create: 'Thêm', can_update: 'Sửa', can_delete: 'Xóa' }
const ACTION_COLORS: Record<string, string> = {
  can_read: 'text-blue-600', can_create: 'text-green-600', can_update: 'text-amber-600', can_delete: 'text-red-600'
}

const DEPT_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ec4899','#06b6d4','#6b7280']

// ── Checkbox cell ────────────────────────────────────────────────
function PermCheck({ checked, onChange, colorClass }: { checked: boolean; onChange: (v: boolean) => void; colorClass: string }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition ${
        checked ? `border-current bg-current/10 ${colorClass}` : 'border-gray-200 text-gray-200 hover:border-gray-400'
      }`}>
      {checked && <span className="text-sm font-bold">✓</span>}
    </button>
  )
}

export default function PermissionManager() {
  const [depts, setDepts]             = useState<Department[]>([])
  const [pages, setPages]             = useState<FeaturePage[]>([])
  const [allUsers, setAllUsers]       = useState<UserRecord[]>([])
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [perms, setPerms]             = useState<PermMap>({})
  const [members, setMembers]         = useState<UserRecord[]>([])
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [tab, setTab]                 = useState<'permissions' | 'members'>('permissions')
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDept, setNewDept]         = useState({ name: '', code: '', color: '#3b82f6' })

  // Load departments + pages
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/departments').then(r => r.json()),
      fetch('/api/admin/feature-pages').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
    ]).then(([d, p, u]) => {
      setDepts(d.departments ?? [])
      setPages(p.pages ?? [])
      setAllUsers(u.users ?? [])
      if (d.departments?.length > 0) setSelectedDept(d.departments[0].id)
    })
  }, [])

  // Load permissions + members when department changes
  const loadDept = useCallback(async (deptId: string) => {
    const [p, m] = await Promise.all([
      fetch(`/api/admin/departments/${deptId}/permissions`).then(r => r.json()),
      fetch(`/api/admin/departments/${deptId}/members`).then(r => r.json()),
    ])
    setPerms(p.permissions ?? {})
    setMembers(m.members ?? [])
  }, [])

  useEffect(() => {
    if (selectedDept) loadDept(selectedDept)
  }, [selectedDept, loadDept])

  function togglePerm(subPageId: string, action: typeof ACTION_KEYS[number], value: boolean) {
    setPerms(prev => ({
      ...prev,
      [subPageId]: {
        can_read:   prev[subPageId]?.can_read   ?? false,
        can_create: prev[subPageId]?.can_create ?? false,
        can_update: prev[subPageId]?.can_update ?? false,
        can_delete: prev[subPageId]?.can_delete ?? false,
        [action]: value,
      }
    }))
    setSaved(false)
  }

  // Toggle all actions for a sub-page
  function toggleSubPage(subPageId: string, allOn: boolean) {
    setPerms(prev => ({
      ...prev,
      [subPageId]: { can_read: allOn, can_create: allOn, can_update: allOn, can_delete: allOn }
    }))
    setSaved(false)
  }

  // Toggle entire feature page
  function togglePage(page: FeaturePage, allOn: boolean) {
    setPerms(prev => {
      const next = { ...prev }
      for (const sp of page.feature_sub_pages) {
        next[sp.id] = { can_read: allOn, can_create: allOn, can_update: allOn, can_delete: allOn }
      }
      return next
    })
    setSaved(false)
  }

  async function savePerms() {
    if (!selectedDept) return
    setSaving(true)
    await fetch(`/api/admin/departments/${selectedDept}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: perms }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addMember(userId: string) {
    if (!selectedDept) return
    await fetch(`/api/admin/departments/${selectedDept}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    loadDept(selectedDept)
    setShowAddMember(false)
  }

  async function removeMember(userId: string) {
    if (!selectedDept) return
    await fetch(`/api/admin/departments/${selectedDept}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    loadDept(selectedDept)
  }

  async function createDept() {
    if (!newDept.name || !newDept.code) return
    const res = await fetch('/api/admin/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDept),
    })
    const data = await res.json()
    if (data.department) {
      setDepts(prev => [...prev, { ...data.department, member_count: 0 }])
      setSelectedDept(data.department.id)
    }
    setShowAddDept(false)
    setNewDept({ name: '', code: '', color: '#3b82f6' })
  }

  const currentDept = depts.find(d => d.id === selectedDept)
  const membersNotInDept = allUsers.filter(u => !members.find(m => m.user_id === u.user_id))

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* ── Sidebar: Departments ── */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-sm">Phòng ban</h2>
          <p className="text-xs text-gray-400 mt-0.5">Chọn phòng ban để phân quyền</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {depts.map(d => (
            <button key={d.id} onClick={() => setSelectedDept(d.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                selectedDept === d.id ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-50'
              }`}>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${selectedDept === d.id ? 'text-blue-700' : 'text-gray-700'}`}>{d.name}</p>
                <p className="text-xs text-gray-400">{d.member_count} thành viên</p>
              </div>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={() => setShowAddDept(true)}
            className="w-full px-3 py-2 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
            + Thêm phòng ban
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        {!currentDept ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Chọn phòng ban để bắt đầu</div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ background: currentDept.color }} />
                <h1 className="font-bold text-gray-800 text-lg">{currentDept.name}</h1>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{currentDept.code}</span>
              </div>
              {tab === 'permissions' && (
                <button onClick={savePerms} disabled={saving}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
                  }`}>
                  {saving ? '⏳ Đang lưu...' : saved ? '✓ Đã lưu' : '💾 Lưu thay đổi'}
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-200 px-6">
              <div className="flex gap-1">
                {(['permissions', 'members'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                      tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {t === 'permissions' ? '🔐 Phân quyền' : `👥 Thành viên (${members.length})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {/* ── Permissions tab ── */}
              {tab === 'permissions' && (
                <div className="space-y-4">
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs">
                    {ACTION_KEYS.map(a => (
                      <span key={a} className={`flex items-center gap-1 font-medium ${ACTION_COLORS[a]}`}>
                        <span className="w-5 h-5 rounded border-2 border-current flex items-center justify-center text-xs">✓</span>
                        {ACTION_LABELS[a]}
                      </span>
                    ))}
                  </div>

                  {pages.map(page => {
                    const allPageOn = page.feature_sub_pages.every(sp =>
                      ACTION_KEYS.every(a => perms[sp.id]?.[a])
                    )
                    return (
                      <div key={page.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Page header */}
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{page.icon}</span>
                            <span className="font-semibold text-gray-700">{page.name}</span>
                          </div>
                          <button onClick={() => togglePage(page, !allPageOn)}
                            className={`text-xs px-3 py-1 rounded-full border transition ${
                              allPageOn
                                ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'
                            }`}>
                            {allPageOn ? '✓ Bật tất cả' : 'Bật tất cả'}
                          </button>
                        </div>

                        {/* Sub-pages */}
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium w-48">Trang con</th>
                              {ACTION_KEYS.map(a => (
                                <th key={a} className={`text-center px-3 py-2 text-xs font-medium w-20 ${ACTION_COLORS[a]}`}>
                                  {ACTION_LABELS[a]}
                                </th>
                              ))}
                              <th className="px-3 py-2 w-24 text-xs text-gray-400 font-medium text-center">Tất cả</th>
                            </tr>
                          </thead>
                          <tbody>
                            {page.feature_sub_pages.map((sp, i) => {
                              const allSpOn = ACTION_KEYS.every(a => perms[sp.id]?.[a])
                              return (
                                <tr key={sp.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                                  <td className="px-4 py-3 text-sm text-gray-700">{sp.name}</td>
                                  {ACTION_KEYS.map(a => (
                                    <td key={a} className="px-3 py-3 text-center">
                                      <div className="flex justify-center">
                                        <PermCheck
                                          checked={perms[sp.id]?.[a] ?? false}
                                          onChange={v => togglePerm(sp.id, a, v)}
                                          colorClass={ACTION_COLORS[a]}
                                        />
                                      </div>
                                    </td>
                                  ))}
                                  <td className="px-3 py-3 text-center">
                                    <button onClick={() => toggleSubPage(sp.id, !allSpOn)}
                                      className={`text-xs px-2 py-1 rounded border transition ${
                                        allSpOn ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:bg-gray-100'
                                      }`}>
                                      {allSpOn ? '✓ Tất cả' : 'Tất cả'}
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Members tab ── */}
              {tab === 'members' && (
                <div className="space-y-4 max-w-2xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{members.length} thành viên trong phòng này</p>
                    <button onClick={() => setShowAddMember(true)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">
                      + Thêm thành viên
                    </button>
                  </div>

                  {members.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                      <p className="text-4xl mb-3">👥</p>
                      <p className="text-sm">Chưa có thành viên</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      {members.map((m, i) => (
                        <div key={m.user_id}
                          className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ background: currentDept.color }}>
                              {m.user_email[0].toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-700">{m.user_email}</span>
                          </div>
                          <button onClick={() => removeMember(m.user_id)}
                            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition">
                            Xóa
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Modal: Add member ── */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-gray-800 mb-4">Thêm thành viên vào {currentDept?.name}</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {membersNotInDept.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Tất cả user đã là thành viên</p>
              ) : membersNotInDept.map(u => (
                <button key={u.user_id} onClick={() => addMember(u.user_id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-sm transition">
                  {u.user_email}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddMember(false)}
              className="mt-4 w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Add department ── */}
      {showAddDept && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-gray-800 mb-4">Thêm phòng ban mới</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Tên phòng ban</label>
                <input value={newDept.name} onChange={e => setNewDept(p => ({ ...p, name: e.target.value }))}
                  placeholder="Phòng Hardware"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Mã code (không dấu, không khoảng trắng)</label>
                <input value={newDept.code} onChange={e => setNewDept(p => ({ ...p, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder="hardware"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Màu</label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {DEPT_COLORS.map(c => (
                    <button key={c} onClick={() => setNewDept(p => ({ ...p, color: c }))}
                      className={`w-7 h-7 rounded-full transition ${newDept.color === c ? 'ring-2 ring-offset-2 ring-gray-600' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={createDept}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium">
                Tạo phòng ban
              </button>
              <button onClick={() => setShowAddDept(false)}
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
