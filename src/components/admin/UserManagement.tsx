'use client'

import { useState, useEffect, useCallback } from 'react'

interface UserRecord { user_id: string; user_email: string }
interface Department  { id: string; name: string; code: string; color: string }
interface Role        { id: string; name: string }
interface UserRole    { user_id: string; role_id: string | null; role_name: string | null }
interface Props        { currentUserEmail: string }

const ROLE_LABELS: Record<string, string> = {
  admin:        '🔴 Admin',
  ky_thuat:     '🔧 Kỹ thuật',
  kho:          '📦 Kho',
  van_phong:    '🏢 Văn phòng',
  viewer:       '👁️ Viewer',
  kinh_doanh:   '💼 Kinh doanh',
}

export default function UserManagement({ currentUserEmail }: Props) {
  const [depts, setDepts]         = useState<Department[]>([])
  const [allUsers, setAllUsers]   = useState<UserRecord[]>([])
  const [roles, setRoles]         = useState<Role[]>([])
  const [userRoleMap, setUserRoleMap] = useState<Record<string, UserRole>>({})
  const [memberMap, setMemberMap] = useState<Record<string, UserRecord[]>>({})
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  // Add NEW user modal
  const [showAddUser, setShowAddUser] = useState(false)
  const [addEmail, setAddEmail]   = useState('')
  const [addDeptId, setAddDeptId] = useState('')
  const [addRoleId, setAddRoleId] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError]   = useState('')

  // Change role inline
  const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null)

  // Add EXISTING user to dept modal
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberSearch, setMemberSearch]   = useState('')
  const [addingMember, setAddingMember]   = useState<string | null>(null)

  // Move user modal
  const [movingUser, setMovingUser] = useState<UserRecord | null>(null)
  const [moveToDept, setMoveToDept] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [deptsRes, usersRes, rolesRes] = await Promise.all([
      fetch('/api/admin/departments').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/roles').then(r => r.json()),
    ])
    const deptList: Department[] = deptsRes.departments ?? []
    const userList: UserRecord[] = usersRes.users ?? []
    const roleList: Role[]       = rolesRes.roles ?? []
    setDepts(deptList)
    setAllUsers(userList)
    setRoles(roleList)
    if (deptList.length > 0) setSelectedDept(prev => prev ?? deptList[0].id)

    // Fetch user_roles info for all users via permissions view
    const permRes = await fetch('/api/admin/permissions/user-roles').then(r => r.json()).catch(() => ({}))
    const roleMap: Record<string, UserRole> = {}
    for (const ur of (permRes.userRoles ?? [])) {
      roleMap[ur.user_id] = ur
    }
    setUserRoleMap(roleMap)

    const map: Record<string, UserRecord[]> = {}
    await Promise.all(deptList.map(async d => {
      const res = await fetch(`/api/admin/departments/${d.id}/members`).then(r => r.json())
      map[d.id] = res.members ?? []
    }))
    setMemberMap(map)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Dept grouping: VP* are sub-departments of Kinh doanh ──
  const isVP = (d: Department) => d.name.startsWith('VP ')
  const isKinhDoanh = (d: Department) => d.name.toLowerCase().includes('kinh doanh')
  const mainDepts = depts.filter(d => !isVP(d))
  const vpDepts   = depts.filter(d => isVP(d)).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  const assignedIds    = new Set(Object.values(memberMap).flat().map(u => u.user_id))
  const unassigned     = allUsers.filter(u => !assignedIds.has(u.user_id))
  const currentDept    = depts.find(d => d.id === selectedDept)
  const currentMembers = selectedDept && selectedDept !== '__none__'
    ? (memberMap[selectedDept] ?? [])
    : unassigned
  const filtered = currentMembers.filter(m =>
    !search || m.user_email.toLowerCase().includes(search.toLowerCase())
  )

  // Users not yet in current dept (for "Thêm thành viên" modal)
  const currentMemberIds = new Set((selectedDept && selectedDept !== '__none__')
    ? (memberMap[selectedDept] ?? []).map(u => u.user_id)
    : []
  )
  const notInDept = allUsers.filter(u =>
    !currentMemberIds.has(u.user_id) &&
    (!memberSearch || u.user_email.toLowerCase().includes(memberSearch.toLowerCase()))
  )

  async function addUserToSystem() {
    if (!addEmail) return
    setAddSaving(true); setAddError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: addEmail,
        roleId: addRoleId || null,
        departmentId: addDeptId || null,
      }),
    })
    const data = await res.json()
    if (data.error) { setAddError(data.error); setAddSaving(false); return }
    setShowAddUser(false); setAddEmail(''); setAddDeptId(''); setAddRoleId(''); setAddSaving(false)
    fetchAll()
  }

  async function changeUserRole(userId: string, newRoleId: string) {
    setChangingRoleFor(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId: newRoleId || null }),
    })
    setChangingRoleFor(null)
    fetchAll()
  }

  async function addExistingMember(userId: string) {
    if (!selectedDept || selectedDept === '__none__') return
    setAddingMember(userId)
    await fetch(`/api/admin/departments/${selectedDept}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setAddingMember(null)
    fetchAll()
  }

  async function removeFromDept(userId: string, deptId: string) {
    await fetch(`/api/admin/departments/${deptId}/members`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    fetchAll()
  }

  async function moveUser() {
    if (!movingUser || !moveToDept) return
    for (const [deptId, members] of Object.entries(memberMap)) {
      if (members.find(m => m.user_id === movingUser.user_id)) {
        await fetch(`/api/admin/departments/${deptId}/members`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: movingUser.user_id }),
        })
      }
    }
    await fetch(`/api/admin/departments/${moveToDept}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: movingUser.user_id }),
    })
    setMovingUser(null); setMoveToDept(''); fetchAll()
  }

  async function resetPassword(userId: string) {
    await fetch('/api/admin/users', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    alert('Đã reset mật khẩu về: eupvn123')
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Xóa tài khoản ${email}?`)) return
    await fetch('/api/admin/users', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    fetchAll()
  }

  // ── Sidebar dept button ──
  function DeptButton({ d, indent = false }: { d: Department; indent?: boolean }) {
    const count = memberMap[d.id]?.length ?? 0
    const isSelected = selectedDept === d.id
    return (
      <button key={d.id} onClick={() => { setSelectedDept(d.id); setSearch('') }}
        className={`w-full text-left flex items-center gap-3 transition ${
          indent ? 'pl-8 pr-4 py-2' : 'px-4 py-3'
        } ${isSelected ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-50'}`}>
        <div className={`rounded-full flex-shrink-0 ${indent ? 'w-2 h-2' : 'w-3 h-3'}`}
          style={{ background: d.color }} />
        <div className="min-w-0 flex-1">
          <p className={`truncate ${indent ? 'text-xs' : 'text-sm'} font-medium ${
            isSelected ? 'text-blue-700' : indent ? 'text-gray-600' : 'text-gray-700'
          }`}>{d.name}</p>
          <p className="text-xs text-gray-400">{count} người</p>
        </div>
      </button>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">👥 Quản lý người dùng</h1>
          <p className="text-xs text-gray-400">{allUsers.length} tài khoản · {currentUserEmail}</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/roles"
            className="px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition">
            🔐 Vai trò & quyền
          </a>
          <button onClick={() => { setShowAddUser(true); setAddDeptId(selectedDept && selectedDept !== '__none__' ? selectedDept : '') }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            + Thêm người dùng
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Dept sidebar */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col py-2 flex-shrink-0 overflow-y-auto">
          {mainDepts.map(d => (
            <div key={d.id}>
              <DeptButton d={d} />
              {/* VP sub-depts nested under Phòng Kinh doanh */}
              {isKinhDoanh(d) && vpDepts.length > 0 && (
                <div className="border-l-2 border-gray-100 ml-4">
                  {vpDepts.map(vp => <DeptButton key={vp.id} d={vp} indent />)}
                </div>
              )}
            </div>
          ))}
          <div className="mt-auto border-t border-gray-100 pt-1">
            <button onClick={() => { setSelectedDept('__none__'); setSearch('') }}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                selectedDept === '__none__' ? 'bg-gray-100 border-r-2 border-gray-400' : 'hover:bg-gray-50'
              }`}>
              <div className="w-3 h-3 rounded-full bg-gray-300" />
              <div>
                <p className={`text-sm font-medium ${selectedDept === '__none__' ? 'text-gray-700' : 'text-gray-500'}`}>Chưa phân phòng</p>
                <p className="text-xs text-gray-400">{unassigned.length} người</p>
              </div>
            </button>
          </div>
        </aside>

        {/* Member list */}
        <main className="flex-1 p-6 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-blue-600">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Đang tải...</span>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentDept && <div className="w-3 h-3 rounded-full" style={{ background: currentDept.color }} />}
                  <h2 className="font-bold text-gray-800">
                    {selectedDept === '__none__' ? 'Chưa phân phòng ban' : (currentDept?.name ?? '')}
                  </h2>
                  <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{filtered.length} người</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedDept && selectedDept !== '__none__' && (
                    <button
                      onClick={() => { setShowAddMember(true); setMemberSearch('') }}
                      className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
                      + Thêm thành viên
                    </button>
                  )}
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Tìm email..."
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                  <p className="text-4xl mb-3">{search ? '🔍' : '👥'}</p>
                  <p className="text-sm">{search ? 'Không tìm thấy kết quả' : 'Chưa có thành viên'}</p>
                  {!search && selectedDept && selectedDept !== '__none__' && (
                    <button
                      onClick={() => { setShowAddMember(true); setMemberSearch('') }}
                      className="mt-3 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                      + Thêm thành viên
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Email</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Nhóm quyền</th>
                        <th className="px-4 py-3 text-xs text-gray-500 font-medium text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m, i) => {
                        const ur = userRoleMap[m.user_id]
                        return (
                        <tr key={m.user_id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ background: currentDept?.color ?? '#9ca3af' }}>
                                {m.user_email[0].toUpperCase()}
                              </div>
                              <span className="text-gray-700">{m.user_email}</span>
                              {m.user_email === currentUserEmail && (
                                <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Bạn</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={ur?.role_id ?? ''}
                              disabled={changingRoleFor === m.user_id}
                              onChange={e => changeUserRole(m.user_id, e.target.value)}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                            >
                              <option value="">— Chưa có role —</option>
                              {roles.map(r => (
                                <option key={r.id} value={r.id}>
                                  {ROLE_LABELS[r.name] ?? r.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              {selectedDept !== '__none__' && (
                                <button onClick={() => { setMovingUser(m); setMoveToDept('') }}
                                  className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-100 transition">
                                  Chuyển phòng
                                </button>
                              )}
                              {selectedDept === '__none__' && (
                                <select onChange={async e => {
                                  if (!e.target.value) return
                                  await fetch(`/api/admin/departments/${e.target.value}/members`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: m.user_id }),
                                  })
                                  fetchAll()
                                }} defaultValue="" className="text-xs border border-gray-300 rounded px-2 py-1 bg-white">
                                  <option value="">Phân vào phòng...</option>
                                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                              )}
                              <button onClick={() => resetPassword(m.user_id)}
                                className="text-xs px-2 py-1 border border-amber-200 text-amber-600 rounded hover:bg-amber-50 transition">
                                Reset PW
                              </button>
                              {m.user_email !== currentUserEmail && selectedDept !== '__none__' && (
                                <button onClick={() => removeFromDept(m.user_id, selectedDept!)}
                                  className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50 transition">
                                  Xóa
                                </button>
                              )}
                              {m.user_email !== currentUserEmail && selectedDept === '__none__' && (
                                <button onClick={() => deleteUser(m.user_id, m.user_email)}
                                  className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50 transition">
                                  Xóa tài khoản
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Modal: Add NEW user ── */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-gray-800 mb-4">Thêm người dùng mới</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Email</label>
                <input value={addEmail} onChange={e => setAddEmail(e.target.value)}
                  placeholder="name@eup.net.vn"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Nhóm quyền <span className="text-red-500">*</span></label>
                <select value={addRoleId} onChange={e => setAddRoleId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Chọn nhóm quyền —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{ROLE_LABELS[r.name] ?? r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Phòng ban</label>
                <select value={addDeptId} onChange={e => setAddDeptId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Chưa phân phòng</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {addError && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{addError}</p>}
              <p className="text-xs text-gray-400">Mật khẩu mặc định: <strong>eupvn123</strong></p>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={addUserToSystem} disabled={addSaving || !addEmail || !addRoleId}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-60">
                {addSaving ? 'Đang thêm...' : 'Thêm'}
              </button>
              <button onClick={() => { setShowAddUser(false); setAddError('') }}
                className="flex-1 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add EXISTING user to dept ── */}
      {showAddMember && selectedDept && selectedDept !== '__none__' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-[480px] p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Thêm thành viên</h3>
                <p className="text-xs text-gray-500">vào {currentDept?.name}</p>
              </div>
              <button onClick={() => setShowAddMember(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Tìm theo email..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            <div className="overflow-y-auto flex-1 -mx-1 px-1">
              {notInDept.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  {memberSearch ? 'Không tìm thấy' : 'Tất cả người dùng đã trong phòng này'}
                </p>
              ) : (
                <div className="space-y-1">
                  {notInDept.map(u => {
                    // show which dept(s) the user is currently in
                    const userDepts = depts.filter(d => (memberMap[d.id] ?? []).some(m => m.user_id === u.user_id))
                    return (
                      <div key={u.user_id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 cursor-pointer transition-all"
                        onClick={() => addExistingMember(u.user_id)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{u.user_email}</p>
                          {userDepts.length > 0 && (
                            <p className="text-xs text-gray-400 truncate">Đang ở: {userDepts.map(d => d.name).join(', ')}</p>
                          )}
                        </div>
                        <span className="text-xs text-green-600 font-medium ml-2 shrink-0">+ Thêm</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
