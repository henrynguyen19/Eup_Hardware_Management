'use client'

import { useState, useEffect, useCallback } from 'react'

interface UserRecord { user_id: string; user_email: string }
interface Department  { id: string; name: string; code: string; color: string }
interface Props        { currentUserEmail: string }

export default function UserManagement({ currentUserEmail }: Props) {
  const [depts, setDepts]         = useState<Department[]>([])
  const [allUsers, setAllUsers]   = useState<UserRecord[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, UserRecord[]>>({})
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  // Add user modal
  const [showAddUser, setShowAddUser] = useState(false)
  const [addEmail, setAddEmail]   = useState('')
  const [addDeptId, setAddDeptId] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError]   = useState('')

  // Move user modal
  const [movingUser, setMovingUser] = useState<UserRecord | null>(null)
  const [moveToDept, setMoveToDept] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [deptsRes, usersRes] = await Promise.all([
      fetch('/api/admin/departments').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
    ])
    const deptList: Department[] = deptsRes.departments ?? []
    const userList: UserRecord[] = usersRes.users ?? []
    setDepts(deptList)
    setAllUsers(userList)
    if (deptList.length > 0) setSelectedDept(prev => prev ?? deptList[0].id)

    const map: Record<string, UserRecord[]> = {}
    await Promise.all(deptList.map(async d => {
      const res = await fetch(`/api/admin/departments/${d.id}/members`).then(r => r.json())
      map[d.id] = res.members ?? []
    }))
    setMemberMap(map)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const assignedIds    = new Set(Object.values(memberMap).flat().map(u => u.user_id))
  const unassigned     = allUsers.filter(u => !assignedIds.has(u.user_id))
  const currentDept    = depts.find(d => d.id === selectedDept)
  const currentMembers = selectedDept && selectedDept !== '__none__'
    ? (memberMap[selectedDept] ?? [])
    : unassigned
  const filtered = currentMembers.filter(m =>
    !search || m.user_email.toLowerCase().includes(search.toLowerCase())
  )

  async function addUserToSystem() {
    if (!addEmail) return
    setAddSaving(true); setAddError('')
    const rolesRes = await fetch('/api/admin/roles').then(r => r.json()).catch(() => ({}))
    const defaultRoleId = (rolesRes.roles ?? rolesRes.data ?? [])[0]?.id ?? ''
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail, roleId: defaultRoleId }),
    })
    const data = await res.json()
    if (data.error) { setAddError(data.error); setAddSaving(false); return }
    if (addDeptId) {
      await new Promise(r => setTimeout(r, 600))
      const usersRes = await fetch('/api/admin/users').then(r => r.json())
      const newUser = (usersRes.users ?? []).find((u: UserRecord) => u.user_email === addEmail)
      if (newUser) {
        await fetch(`/api/admin/departments/${addDeptId}/members`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: newUser.user_id }),
        })
      }
    }
    setShowAddUser(false); setAddEmail(''); setAddDeptId(''); setAddSaving(false)
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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">👥 Quản lý người dùng</h1>
          <p className="text-xs text-gray-400">{allUsers.length} tài khoản · {currentUserEmail}</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/permissions"
            className="px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition">
            🔐 Phân quyền
          </a>
          <button onClick={() => { setShowAddUser(true); setAddDeptId(selectedDept && selectedDept !== '__none__' ? selectedDept : '') }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            + Thêm người dùng
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Dept sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-2 flex-shrink-0">
          {depts.map(d => {
            const count = memberMap[d.id]?.length ?? 0
            return (
              <button key={d.id} onClick={() => { setSelectedDept(d.id); setSearch('') }}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                  selectedDept === d.id ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-50'
                }`}>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${selectedDept === d.id ? 'text-blue-700' : 'text-gray-700'}`}>{d.name}</p>
                  <p className="text-xs text-gray-400">{count} người</p>
                </div>
              </button>
            )
          })}
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
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm email..."
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                  <p className="text-4xl mb-3">{search ? '🔍' : '👥'}</p>
                  <p className="text-sm">{search ? 'Không tìm thấy kết quả' : 'Chưa có thành viên'}</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Email</th>
                        <th className="px-4 py-3 text-xs text-gray-500 font-medium text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m, i) => (
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Modal: Add user ── */}
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
              <button onClick={addUserToSystem} disabled={addSaving || !addEmail}
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

      {/* ── Modal: Move user ── */}
      {movingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-80 p-6">
            <h3 className="font-bold text-gray-800 mb-1">Chuyển phòng ban</h3>
            <p className="text-sm text-gray-500 mb-4">{movingUser.user_email}</p>
            <select value={moveToDept} onChange={e => setMoveToDept(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Chọn phòng ban mới...</option>
              {depts.filter(d => d.id !== selectedDept).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button onClick={moveUser} disabled={!moveToDept}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                Chuyển
              </button>
              <button onClick={() => setMovingUser(null)}
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
