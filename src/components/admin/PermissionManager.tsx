'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────
interface Department  { id: string; name: string; code: string; color: string; member_count: number }
interface SubPage     { id: string; name: string; code: string; sort_order: number }
interface FeaturePage { id: string; name: string; code: string; icon: string; sort_order: number; feature_sub_pages: SubPage[] }
interface UserRecord  { user_id: string; user_email: string }
interface UserPerm    { user_id: string; user_email: string; can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }

type PermMap = Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }>

const ACTIONS = ['can_read', 'can_create', 'can_update', 'can_delete'] as const
type Action = typeof ACTIONS[number]
const ACTION_LABEL: Record<Action, string>  = { can_read: 'Xem', can_create: 'Thêm', can_update: 'Sửa', can_delete: 'Xóa' }
const ACTION_COLOR: Record<Action, string>  = { can_read: '#2563eb', can_create: '#16a34a', can_update: '#d97706', can_delete: '#dc2626' }
const ACTION_BG:    Record<Action, string>  = { can_read: '#dbeafe', can_create: '#dcfce7', can_update: '#fef3c7', can_delete: '#fee2e2' }
const DEPT_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ec4899','#06b6d4','#6b7280']

// ── PermCheck cell ───────────────────────────────────────────────
function Check({ checked, onChange, action }: { checked: boolean; onChange: (v: boolean) => void; action: Action }) {
  return (
    <button onClick={() => onChange(!checked)}
      className="w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all"
      style={checked
        ? { borderColor: ACTION_COLOR[action], background: ACTION_BG[action], color: ACTION_COLOR[action] }
        : { borderColor: '#e5e7eb', background: 'white', color: '#e5e7eb' }}>
      {checked && <span className="text-xs font-bold">✓</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function PermissionManager() {
  const [depts, setDepts]   = useState<Department[]>([])
  const [pages, setPages]   = useState<FeaturePage[]>([])
  const [allUsers, setAllUsers] = useState<UserRecord[]>([])
  const [mainTab, setMainTab] = useState<'dept' | 'user'>('dept')

  // Dept-level state
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [deptPerms, setDeptPerms] = useState<PermMap>({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  // User-level state
  const [selectedSubPage, setSelectedSubPage] = useState<SubPage | null>(null)
  const [userPerms, setUserPerms] = useState<UserPerm[]>([])
  const [loadingUP, setLoadingUP] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUserId,   setNewUserId]   = useState('')
  const [newPerms,    setNewPerms]    = useState<PermMap['x']>({ can_read: true, can_create: false, can_update: false, can_delete: false })
  const [editingUser, setEditingUser] = useState<string | null>(null)

  // Add dept modal
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDept, setNewDept] = useState({ name: '', code: '', color: '#3b82f6' })

  // ── Load initial data ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/departments').then(r => r.json()),
      fetch('/api/admin/feature-pages').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
    ]).then(([d, p, u]) => {
      const deptList = d.departments ?? []
      setDepts(deptList)
      setPages(p.pages ?? [])
      setAllUsers(u.users ?? [])
      if (deptList.length > 0) setSelectedDept(deptList[0].id)
    })
  }, [])

  // ── Load dept permissions ──────────────────────────────────────
  const loadDeptPerms = useCallback(async (deptId: string) => {
    const res = await fetch(`/api/admin/departments/${deptId}/permissions`).then(r => r.json())
    setDeptPerms(res.permissions ?? {})
  }, [])

  useEffect(() => {
    if (selectedDept) loadDeptPerms(selectedDept)
  }, [selectedDept, loadDeptPerms])

  // ── Load sub-page user permissions ────────────────────────────
  const loadUserPerms = useCallback(async (subPageId: string) => {
    setLoadingUP(true)
    const res = await fetch(`/api/admin/sub-pages/${subPageId}/user-permissions`).then(r => r.json())
    setUserPerms(res.users ?? [])
    setLoadingUP(false)
  }, [])

  useEffect(() => {
    if (selectedSubPage) loadUserPerms(selectedSubPage.id)
  }, [selectedSubPage, loadUserPerms])

  // ── Dept permissions helpers ───────────────────────────────────
  function toggleDeptPerm(subPageId: string, action: Action, value: boolean) {
    setDeptPerms(prev => ({
      ...prev,
      [subPageId]: { ...(prev[subPageId] ?? { can_read:false,can_create:false,can_update:false,can_delete:false }), [action]: value }
    }))
    setSaved(false)
  }
  function toggleSubPageAll(subPageId: string, on: boolean) {
    setDeptPerms(prev => ({ ...prev, [subPageId]: { can_read:on, can_create:on, can_update:on, can_delete:on } }))
    setSaved(false)
  }
  function togglePageAll(page: FeaturePage, on: boolean) {
    setDeptPerms(prev => {
      const next = { ...prev }
      for (const sp of page.feature_sub_pages) next[sp.id] = { can_read:on, can_create:on, can_update:on, can_delete:on }
      return next
    })
    setSaved(false)
  }
  async function saveDeptPerms() {
    if (!selectedDept) return
    setSaving(true)
    await fetch(`/api/admin/departments/${selectedDept}/permissions`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: deptPerms }),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── User permissions helpers ───────────────────────────────────
  async function saveUserPerm(userId: string, perms: PermMap['x']) {
    if (!selectedSubPage) return
    await fetch(`/api/admin/sub-pages/${selectedSubPage.id}/user-permissions`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...perms }),
    })
    loadUserPerms(selectedSubPage.id)
    setEditingUser(null)
  }

  async function removeUserPerm(userId: string) {
    if (!selectedSubPage) return
    await fetch(`/api/admin/sub-pages/${selectedSubPage.id}/user-permissions`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    loadUserPerms(selectedSubPage.id)
  }

  async function addUserPerm() {
    if (!newUserId || !selectedSubPage) return
    await fetch(`/api/admin/sub-pages/${selectedSubPage.id}/user-permissions`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: newUserId, ...newPerms }),
    })
    setShowAddUser(false)
    setNewUserId('')
    setNewPerms({ can_read: true, can_create: false, can_update: false, can_delete: false })
    loadUserPerms(selectedSubPage.id)
  }

  async function createDept() {
    if (!newDept.name || !newDept.code) return
    const res = await fetch('/api/admin/departments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
  const usersNotYetAdded = allUsers.filter(u => !userPerms.find(p => p.user_id === u.user_id))

  // ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-screen bg-gray-50">

      {/* ── Sidebar ── */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-sm">Phòng ban</h2>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {depts.map(d => (
            <button key={d.id} onClick={() => { setSelectedDept(d.id); setMainTab('dept') }}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                selectedDept === d.id && mainTab === 'dept' ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-50'
              }`}>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${selectedDept === d.id && mainTab === 'dept' ? 'text-blue-700' : 'text-gray-700'}`}>{d.name}</p>
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

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentDept && mainTab === 'dept' && (
              <>
                <div className="w-4 h-4 rounded-full" style={{ background: currentDept.color }} />
                <h1 className="font-bold text-gray-800 text-lg">{currentDept.name}</h1>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{currentDept.code}</span>
              </>
            )}
            {mainTab === 'user' && (
              <h1 className="font-bold text-gray-800 text-lg">Phân quyền cá nhân</h1>
            )}
          </div>
          {mainTab === 'dept' && (
            <button onClick={saveDeptPerms} disabled={saving}
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
            <button onClick={() => setMainTab('dept')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${mainTab === 'dept' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              🏢 Phân quyền phòng ban
            </button>
            <button onClick={() => setMainTab('user')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${mainTab === 'user' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              👤 Phân quyền cá nhân
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">

          {/* ══ TAB: Dept-level permissions ══ */}
          {mainTab === 'dept' && (
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex items-center gap-4">
                {ACTIONS.map(a => (
                  <span key={a} className="flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: ACTION_COLOR[a] }}>
                    <span className="w-5 h-5 rounded border-2 border-current flex items-center justify-center text-[10px] font-bold"
                      style={{ background: ACTION_BG[a] }}>✓</span>
                    {ACTION_LABEL[a]}
                  </span>
                ))}
              </div>

              {pages.map(page => {
                const allPageOn = page.feature_sub_pages.every(sp => ACTIONS.every(a => deptPerms[sp.id]?.[a]))
                return (
                  <div key={page.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{page.icon}</span>
                        <span className="font-semibold text-gray-700">{page.name}</span>
                      </div>
                      <button onClick={() => togglePageAll(page, !allPageOn)}
                        className={`text-xs px-3 py-1 rounded-full border transition ${allPageOn
                          ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'
                        }`}>
                        {allPageOn ? '✓ Tất cả' : 'Bật tất cả'}
                      </button>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium w-48">Trang con</th>
                          {ACTIONS.map(a => (
                            <th key={a} className="text-center px-3 py-2 text-xs font-semibold w-20"
                              style={{ color: ACTION_COLOR[a] }}>{ACTION_LABEL[a]}</th>
                          ))}
                          <th className="px-3 py-2 w-24 text-xs text-gray-400 font-medium text-center">Tất cả</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.feature_sub_pages.map((sp, i) => {
                          const allSpOn = ACTIONS.every(a => deptPerms[sp.id]?.[a])
                          return (
                            <tr key={sp.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                              <td className="px-4 py-3 text-sm text-gray-700">{sp.name}</td>
                              {ACTIONS.map(a => (
                                <td key={a} className="px-3 py-3 text-center">
                                  <div className="flex justify-center">
                                    <Check checked={deptPerms[sp.id]?.[a] ?? false}
                                      onChange={v => toggleDeptPerm(sp.id, a, v)} action={a} />
                                  </div>
                                </td>
                              ))}
                              <td className="px-3 py-3 text-center">
                                <button onClick={() => toggleSubPageAll(sp.id, !allSpOn)}
                                  className={`text-xs px-2 py-1 rounded border transition ${
                                    allSpOn ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:bg-gray-100'
                                  }`}>
                                  {allSpOn ? '✓ All' : 'All'}
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

          {/* ══ TAB: Individual user permissions ══ */}
          {mainTab === 'user' && (
            <div className="flex gap-5 h-full">

              {/* Sub-page selector */}
              <div className="w-56 flex-shrink-0">
                <p className="text-xs text-gray-500 font-medium mb-2 px-1">Chọn trang con</p>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {pages.map(page => (
                    <div key={page.id}>
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                        <span>{page.icon}</span>{page.name}
                      </div>
                      {page.feature_sub_pages.map(sp => (
                        <button key={sp.id} onClick={() => setSelectedSubPage(sp)}
                          className={`w-full text-left px-4 py-2.5 text-sm transition border-b border-gray-50 last:border-0 ${
                            selectedSubPage?.id === sp.id ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                          }`}>
                          {sp.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* User permission table */}
              <div className="flex-1">
                {!selectedSubPage ? (
                  <div className="flex items-center justify-center h-64 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                    ← Chọn một trang con để xem phân quyền cá nhân
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-800">{selectedSubPage.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Phân quyền cá nhân — ghi đè hoặc mở rộng quyền phòng ban
                        </p>
                      </div>
                      <button onClick={() => setShowAddUser(true)}
                        className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition font-medium">
                        + Thêm người dùng
                      </button>
                    </div>

                    {/* Info note */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
                      💡 Quyền thực tế = <strong>phòng ban OR cá nhân</strong>. Dùng để cấp thêm quyền Thêm/Sửa/Xóa cho một vài người cụ thể mà không ảnh hưởng toàn phòng.
                    </div>

                    {loadingUP ? (
                      <div className="flex items-center gap-2 text-sm text-blue-600 py-8 justify-center">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Đang tải...
                      </div>
                    ) : userPerms.length === 0 ? (
                      <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                        <p className="text-4xl mb-3">👤</p>
                        <p className="text-sm">Chưa có phân quyền cá nhân nào</p>
                        <p className="text-xs mt-1">Tất cả người dùng dùng quyền phòng ban mặc định</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Người dùng</th>
                              {ACTIONS.map(a => (
                                <th key={a} className="text-center px-3 py-3 text-xs font-semibold w-16"
                                  style={{ color: ACTION_COLOR[a] }}>{ACTION_LABEL[a]}</th>
                              ))}
                              <th className="px-3 py-3 w-24" />
                            </tr>
                          </thead>
                          <tbody>
                            {userPerms.map((u, i) => (
                              <tr key={u.user_id} className={`border-b border-gray-50 last:border-0 ${i%2===1?'bg-gray-50/30':''}`}>
                                <td className="px-4 py-3 text-gray-700">{u.user_email}</td>
                                {ACTIONS.map(a => (
                                  <td key={a} className="px-3 py-3 text-center">
                                    {editingUser === u.user_id ? (
                                      <div className="flex justify-center">
                                        <Check checked={u[a]} action={a}
                                          onChange={v => setUserPerms(prev => prev.map(p =>
                                            p.user_id === u.user_id ? { ...p, [a]: v } : p
                                          ))} />
                                      </div>
                                    ) : (
                                      <span className={`inline-flex w-5 h-5 rounded items-center justify-center text-xs font-bold ${
                                        u[a] ? 'text-current' : 'text-gray-300'
                                      }`} style={u[a] ? { color: ACTION_COLOR[a] } : {}}>
                                        {u[a] ? '✓' : '✗'}
                                      </span>
                                    )}
                                  </td>
                                ))}
                                <td className="px-3 py-3">
                                  <div className="flex gap-1 justify-end">
                                    {editingUser === u.user_id ? (
                                      <>
                                        <button onClick={() => saveUserPerm(u.user_id, u)}
                                          className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition">
                                          Lưu
                                        </button>
                                        <button onClick={() => { setEditingUser(null); loadUserPerms(selectedSubPage.id) }}
                                          className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-100 transition">
                                          Hủy
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={() => setEditingUser(u.user_id)}
                                          className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-100 transition">
                                          Sửa
                                        </button>
                                        <button onClick={() => removeUserPerm(u.user_id)}
                                          className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50 transition">
                                          Xóa
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal: Add user permission ── */}
      {showAddUser && selectedSubPage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-gray-800 mb-1">Thêm phân quyền cá nhân</h3>
            <p className="text-sm text-gray-400 mb-4">{selectedSubPage.name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-medium">Người dùng</label>
                <select value={newUserId} onChange={e => setNewUserId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Chọn người dùng...</option>
                  {usersNotYetAdded.map(u => (
                    <option key={u.user_id} value={u.user_id}>{u.user_email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-2 block">Quyền</label>
                <div className="grid grid-cols-4 gap-2">
                  {ACTIONS.map(a => (
                    <label key={a} className="flex flex-col items-center gap-1 cursor-pointer">
                      <Check checked={newPerms[a]} action={a}
                        onChange={v => setNewPerms(p => ({ ...p, [a]: v }))} />
                      <span className="text-[10px] font-medium" style={{ color: ACTION_COLOR[a] }}>
                        {ACTION_LABEL[a]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={addUserPerm} disabled={!newUserId}
                className="flex-1 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-60">
                Thêm
              </button>
              <button onClick={() => { setShowAddUser(false); setNewUserId('') }}
                className="flex-1 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add dept ── */}
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
                <label className="text-xs text-gray-500 font-medium">Code (không dấu, không khoảng trắng)</label>
                <input value={newDept.code} onChange={e => setNewDept(p => ({ ...p, code: e.target.value.toLowerCase().replace(/\s+/g,'_') }))}
                  placeholder="hardware"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-2 block">Màu</label>
                <div className="flex gap-2 flex-wrap">
                  {DEPT_COLORS.map(c => (
                    <button key={c} onClick={() => setNewDept(p => ({ ...p, color: c }))}
                      className={`w-7 h-7 rounded-full transition ${newDept.color === c ? 'ring-2 ring-offset-2 ring-gray-500' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={createDept}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium">
                Tạo
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
