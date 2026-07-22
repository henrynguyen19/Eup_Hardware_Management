'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Plus, X, Loader2, Users, Shield, UserPlus, Pencil } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Role { id: string; name: string; permissions: string[] }
interface Department {
  id: string; name: string; code: string; color: string
  role_id: string | null; member_count: number
}
interface Member { user_id: string; user_email: string }

// ─── Permission display config (mirrors RoleManagement MODULE_GROUPS) ─────────
const MODULES: { id: string; label: string; levels: { key: string; label: string; color: string }[] }[] = [
  { id: 'kho', label: 'Kho thiết bị', levels: [
    { key: 'kho:read',   label: 'Xem',      color: 'blue' },
    { key: 'kho:write',  label: 'Thêm/Sửa', color: 'amber' },
    { key: 'kho:delete', label: 'Xóa',       color: 'purple' },
  ]},
  { id: 'kho_daily', label: 'Kho Daily', levels: [
    { key: 'kho_daily:read',  label: 'Xem',       color: 'blue' },
    { key: 'kho_daily:write', label: 'Nhập liệu', color: 'amber' },
  ]},
  { id: 'gui_hang', label: 'Giao nhận', levels: [
    { key: 'gui_hang:read',   label: 'Xem',      color: 'blue' },
    { key: 'gui_hang:write',  label: 'Tạo đơn',  color: 'amber' },
    { key: 'gui_hang:delete', label: 'Xóa',       color: 'purple' },
  ]},
  { id: 'ho_tro', label: 'Hỗ trợ kỹ thuật', levels: [
    { key: 'ho_tro:read',   label: 'Xem',        color: 'blue' },
    { key: 'ho_tro:write',  label: 'Đồng bộ',   color: 'amber' },
    { key: 'ho_tro:admin',  label: 'Trưởng nhóm', color: 'red' },
    { key: 'ho_tro:delete', label: 'Xóa',         color: 'purple' },
  ]},
  { id: 'sua_chua', label: 'Sửa chữa', levels: [
    { key: 'sua_chua:read',   label: 'Xem',       color: 'blue' },
    { key: 'sua_chua:write',  label: 'Nhập liệu', color: 'amber' },
    { key: 'sua_chua:delete', label: 'Xóa',        color: 'purple' },
  ]},
  { id: 'chat_luong', label: 'Chất lượng', levels: [
    { key: 'chat_luong:read',  label: 'Xem',      color: 'blue' },
    { key: 'chat_luong:write', label: 'Cập nhật', color: 'amber' },
  ]},
  { id: 'tai_lieu_group', label: 'Tài liệu / Chứng nhận / Hướng dẫn', levels: [
    { key: 'tai_lieu:read',   label: 'TL: Xem',  color: 'blue' },
    { key: 'tai_lieu:write',  label: 'TL: Sửa',  color: 'amber' },
    { key: 'chung_nhan:read',  label: 'CN: Xem', color: 'blue' },
    { key: 'chung_nhan:write', label: 'CN: Sửa', color: 'amber' },
    { key: 'huong_dan:read',   label: 'HD: Xem', color: 'blue' },
    { key: 'huong_dan:write',  label: 'HD: Sửa', color: 'amber' },
  ]},
  { id: 'admin', label: 'Quản trị', levels: [
    { key: 'admin:users', label: 'Quản lý tài khoản', color: 'red' },
  ]},
]

const COLOR_CLS: Record<string, { badge: string; check: string }> = {
  blue:   { badge: 'bg-blue-50 text-blue-700 border-blue-200',     check: 'bg-blue-500 border-blue-500' },
  amber:  { badge: 'bg-amber-50 text-amber-700 border-amber-200',  check: 'bg-amber-500 border-amber-500' },
  purple: { badge: 'bg-purple-50 text-purple-700 border-purple-200', check: 'bg-purple-500 border-purple-500' },
  red:    { badge: 'bg-red-50 text-red-700 border-red-200',        check: 'bg-red-500 border-red-500' },
}

// ─── Perm chip (mini badge) ───────────────────────────────────────────────────
function PermChip({ label, color }: { label: string; color: string }) {
  const cls = COLOR_CLS[color]?.badge ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ─── Toggle checkbox ──────────────────────────────────────────────────────────
function PermToggle({
  permKey, label, color, checked, disabled, onChange
}: { permKey: string; label: string; color: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  const cls = COLOR_CLS[color] ?? COLOR_CLS.blue
  return (
    <label
      className={[
        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition text-xs font-medium',
        disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
        checked && !disabled
          ? cls.badge + ' border ' + cls.badge.split(' ')[2]
          : 'bg-white border-gray-200 hover:border-gray-300',
      ].join(' ')}
      onClick={disabled ? undefined : onChange}
    >
      <span
        className={[
          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
          checked && !disabled ? cls.check + ' text-white' : 'border-gray-300 bg-white',
        ].join(' ')}
      >
        {checked && !disabled && (
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DepartmentsManager() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDept, setExpandedDept] = useState<string | null>(null)
  const [members, setMembers] = useState<Record<string, Member[]>>({})
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null)

  // Role assignment
  const [editRoleDept, setEditRoleDept] = useState<string | null>(null)
  const [savingRole, setSavingRole] = useState<string | null>(null)

  // Add member
  const [addingToDept, setAddingToDept] = useState<string | null>(null)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [allUsers, setAllUsers] = useState<{ id: string; email: string }[]>([])

  // Permission modal
  const [permModal, setPermModal] = useState<{
    deptId: string; userId: string; email: string; ceilingPerms: string[]
  } | null>(null)
  const [userPerms, setUserPerms] = useState<string[]>([])
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)

  // Create dept
  const [showCreateDept, setShowCreateDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [creatingDept, setCreatingDept] = useState(false)

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch initial data ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/departments').then(r => r.json())
    setDepartments(res.departments ?? [])
    setRoles(res.roles ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Fetch members when dept expanded ────────────────────────────────────────
  async function loadMembers(deptId: string) {
    if (members[deptId]) return
    setLoadingMembers(deptId)
    const res = await fetch(`/api/admin/departments/${deptId}/members`).then(r => r.json())
    setMembers(prev => ({ ...prev, [deptId]: res.members ?? [] }))
    setLoadingMembers(null)
  }

  function toggleExpand(deptId: string) {
    if (expandedDept === deptId) {
      setExpandedDept(null)
    } else {
      setExpandedDept(deptId)
      loadMembers(deptId)
    }
    setEditRoleDept(null)
    setAddingToDept(null)
  }

  // ── Assign role to dept ─────────────────────────────────────────────────────
  async function assignRole(deptId: string, roleId: string | null) {
    setSavingRole(deptId)
    const res = await fetch(`/api/admin/departments/${deptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    })
    if (res.ok) {
      setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, role_id: roleId } : d))
      showToast('Đã cập nhật vai trò phòng')
    } else {
      showToast('Lỗi cập nhật vai trò', false)
    }
    setSavingRole(null)
    setEditRoleDept(null)
  }

  // ── Load all users (for add-member search) ───────────────────────────────────
  async function loadAllUsers() {
    if (allUsers.length > 0) return
    const res = await fetch('/api/admin/users').then(r => r.json()).catch(() => ({ users: [] }))
    setAllUsers((res.users ?? []).map((u: { id: string; email: string }) => ({ id: u.id, email: u.email })))
  }

  // ── Add member to dept ───────────────────────────────────────────────────────
  async function addMember(deptId: string) {
    const email = newMemberEmail.trim()
    if (!email) return
    const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!user) { showToast('Không tìm thấy email này', false); return }

    setAddingMember(true)
    const res = await fetch(`/api/admin/departments/${deptId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    if (res.ok) {
      setMembers(prev => ({
        ...prev,
        [deptId]: [...(prev[deptId] ?? []), { user_id: user.id, user_email: user.email }]
      }))
      setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, member_count: d.member_count + 1 } : d))
      setNewMemberEmail('')
      showToast('Đã thêm thành viên')
    } else {
      showToast('Lỗi thêm thành viên', false)
    }
    setAddingMember(false)
  }

  // ── Remove member from dept ──────────────────────────────────────────────────
  async function removeMember(deptId: string, userId: string) {
    if (!confirm('Xóa nhân viên này khỏi phòng?')) return
    const res = await fetch(`/api/admin/departments/${deptId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      setMembers(prev => ({ ...prev, [deptId]: (prev[deptId] ?? []).filter(m => m.user_id !== userId) }))
      setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, member_count: Math.max(0, d.member_count - 1) } : d))
      showToast('Đã xóa thành viên')
    } else {
      showToast('Lỗi xóa thành viên', false)
    }
  }

  // ── Open permission modal ────────────────────────────────────────────────────
  async function openPermModal(dept: Department, member: Member) {
    const role = roles.find(r => r.id === dept.role_id)
    const ceiling = role?.permissions ?? []
    setPermModal({ deptId: dept.id, userId: member.user_id, email: member.user_email, ceilingPerms: ceiling })
    setLoadingPerms(true)
    const res = await fetch(
      `/api/admin/departments/${dept.id}/user-dept-permissions?userId=${member.user_id}`
    ).then(r => r.json())
    const saved: string[] = res.permissions ?? []
    // Chưa có setting → mặc định full quyền của phòng
    setUserPerms(saved.length > 0 ? saved : ceiling)
    setLoadingPerms(false)
  }

  function togglePerm(key: string) {
    setUserPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function savePerms() {
    if (!permModal) return
    setSavingPerms(true)
    const res = await fetch(
      `/api/admin/departments/${permModal.deptId}/user-dept-permissions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: permModal.userId, permissions: userPerms }),
      }
    )
    if (res.ok) {
      showToast('Đã lưu quyền nhân viên')
      setPermModal(null)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Lỗi lưu quyền', false)
    }
    setSavingPerms(false)
  }

  // ── Create department ────────────────────────────────────────────────────────
  async function createDept() {
    if (!newDeptName.trim() || !newDeptCode.trim()) return
    setCreatingDept(true)
    const res = await fetch('/api/admin/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeptName.trim(), code: newDeptCode.trim().toLowerCase() }),
    })
    if (res.ok) {
      await fetchData()
      setNewDeptName(''); setNewDeptCode('')
      setShowCreateDept(false)
      showToast('Đã tạo phòng ban')
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Lỗi tạo phòng', false)
    }
    setCreatingDept(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#a08060]">
        <Loader2 className="animate-spin h-5 w-5 mr-2" /> Đang tải...
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#a08060]">
          {departments.length} phòng ban · Nhấn vào phòng để quản lý nhân viên và phân quyền
        </p>
        <button
          onClick={() => setShowCreateDept(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7a5230] text-white text-sm rounded-lg hover:bg-[#5a3820] transition font-medium"
        >
          <Plus className="h-4 w-4" /> Thêm phòng
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={[
          'px-4 py-2.5 rounded-lg text-sm font-medium',
          toast.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        ].join(' ')}>
          {toast.msg}
        </div>
      )}

      {/* Department list */}
      {departments.map(dept => {
        const isExpanded = expandedDept === dept.id
        const role = roles.find(r => r.id === dept.role_id)
        const deptMembers = members[dept.id] ?? []

        return (
          <div
            key={dept.id}
            className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden"
          >
            {/* Dept header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[rgba(122,82,48,.02)] transition select-none"
              onClick={() => toggleExpand(dept.id)}
            >
              <span className="text-[#a08060] flex-shrink-0">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>

              {/* Color dot */}
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: dept.color ?? '#6b7280' }} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[#2c1e12]">{dept.name}</span>
                  <span className="text-xs text-[#a08060] font-mono">{dept.code}</span>
                  {role ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)] font-medium">
                      <Shield className="h-2.5 w-2.5 inline mr-1" />
                      {role.name}
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200 italic">
                      Chưa gán vai trò
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[#a08060] flex-shrink-0">
                <Users className="h-3.5 w-3.5" />
                {dept.member_count} thành viên
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-[rgba(122,82,48,.1)]">

                {/* Role assignment bar */}
                <div className="px-5 py-3 bg-[rgba(122,82,48,.02)] flex items-center gap-3 flex-wrap border-b border-[rgba(122,82,48,.06)]">
                  <span className="text-xs font-medium text-[#6b4f38]">Vai trò phòng:</span>
                  {editRoleDept === dept.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="border border-[#c49a72] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none"
                        defaultValue={dept.role_id ?? ''}
                        onChange={e => assignRole(dept.id, e.target.value || null)}
                        disabled={savingRole === dept.id}
                      >
                        <option value="">— Không gán —</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      {savingRole === dept.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />}
                      <button
                        onClick={() => setEditRoleDept(null)}
                        className="text-[#a08060] hover:text-[#7a5230] p-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-[#2c1e12] font-medium">{role?.name ?? 'Chưa gán'}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setEditRoleDept(dept.id) }}
                        className="text-[10px] text-[#a08060] hover:text-[#7a5230] flex items-center gap-0.5 px-1.5 py-0.5 border border-transparent hover:border-[rgba(122,82,48,.2)] rounded transition"
                      >
                        <Pencil className="h-2.5 w-2.5" /> Thay đổi
                      </button>
                    </>
                  )}

                  {/* Role permissions preview */}
                  {role && role.permissions.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-2">
                      {MODULES.flatMap(m => m.levels)
                        .filter(l => role.permissions.includes(l.key))
                        .slice(0, 8)
                        .map(l => <PermChip key={l.key} label={l.label} color={l.color} />)}
                      {role.permissions.length > 8 && (
                        <span className="text-[10px] text-[#a08060]">+{role.permissions.length - 8}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Members */}
                <div className="divide-y divide-[rgba(122,82,48,.06)]">
                  {loadingMembers === dept.id ? (
                    <div className="py-6 flex justify-center text-[#a08060]">
                      <Loader2 className="animate-spin h-4 w-4" />
                    </div>
                  ) : deptMembers.length === 0 ? (
                    <div className="py-5 text-center text-sm text-[#a08060] italic">Chưa có thành viên</div>
                  ) : (
                    deptMembers.map(member => (
                      <div key={member.user_id} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(122,82,48,.02)] transition">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-[#2c1e12]">{member.user_email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {role && (
                            <button
                              onClick={() => openPermModal(dept, member)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-[rgba(122,82,48,.2)] text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition font-medium flex items-center gap-1"
                            >
                              <Shield className="h-3 w-3" /> Phân quyền
                            </button>
                          )}
                          <button
                            onClick={() => removeMember(dept.id, member.user_id)}
                            className="p-1 rounded text-[#c8b8a6] hover:text-red-500 hover:bg-red-50 transition"
                            title="Xóa khỏi phòng"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Add member row */}
                  {addingToDept === dept.id ? (
                    <div className="px-5 py-3 flex items-center gap-2 bg-[rgba(122,82,48,.02)]">
                      <UserPlus className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                      <input
                        type="email"
                        list="all-users-list"
                        value={newMemberEmail}
                        onChange={e => setNewMemberEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addMember(dept.id)}
                        placeholder="Nhập email nhân viên..."
                        autoFocus
                        className="flex-1 border border-[#c49a72] rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a72] bg-[#faf6f0]"
                      />
                      <datalist id="all-users-list">
                        {allUsers.map(u => <option key={u.id} value={u.email} />)}
                      </datalist>
                      <button
                        onClick={() => addMember(dept.id)}
                        disabled={addingMember || !newMemberEmail.trim()}
                        className="px-3 py-1 bg-[#7a5230] text-white text-xs rounded-lg hover:bg-[#5a3820] disabled:opacity-50 transition font-medium"
                      >
                        {addingMember ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Thêm'}
                      </button>
                      <button
                        onClick={() => { setAddingToDept(null); setNewMemberEmail('') }}
                        className="text-[#a08060] hover:text-[#7a5230] p-0.5"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="px-5 py-2.5">
                      <button
                        onClick={() => { setAddingToDept(dept.id); loadAllUsers() }}
                        className="text-xs text-[#a08060] hover:text-[#7a5230] flex items-center gap-1 transition"
                      >
                        <Plus className="h-3.5 w-3.5" /> Thêm thành viên
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {departments.length === 0 && (
        <div className="text-center py-16 text-[#a08060] text-sm italic">
          Chưa có phòng ban nào. Nhấn &quot;Thêm phòng&quot; để bắt đầu.
        </div>
      )}

      {/* Create dept modal */}
      {showCreateDept && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-96 p-6">
            <h3 className="font-bold text-[#2c1e12] mb-4">Tạo phòng ban mới</h3>
            <div className="space-y-3">
              <input
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder="Tên phòng ban (vd: Phòng Kho)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a72]"
                autoFocus
              />
              <input
                value={newDeptCode}
                onChange={e => setNewDeptCode(e.target.value)}
                placeholder="Mã code (vd: phong_kho)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a72] font-mono"
                onKeyDown={e => e.key === 'Enter' && createDept()}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={createDept}
                disabled={creatingDept || !newDeptName.trim() || !newDeptCode.trim()}
                className="flex-1 py-2 bg-[#7a5230] text-white text-sm rounded-lg hover:bg-[#5a3820] transition font-medium disabled:opacity-60"
              >
                {creatingDept ? 'Đang tạo...' : 'Tạo'}
              </button>
              <button
                onClick={() => { setShowCreateDept(false); setNewDeptName(''); setNewDeptCode('') }}
                className="flex-1 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission modal */}
      {permModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-[#2c1e12]">Phân quyền nhân viên</h3>
                <p className="text-xs text-[#a08060] mt-0.5">{permModal.email}</p>
              </div>
              <button onClick={() => setPermModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Notice */}
            <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
              <Shield className="h-3 w-3 inline mr-1" />
              Quyền bị giới hạn bởi vai trò phòng ban. Các mục mờ = phòng chưa được phân quyền đó.
            </div>

            {/* Permission matrix */}
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {loadingPerms ? (
                <div className="py-10 flex justify-center text-gray-400">
                  <Loader2 className="animate-spin h-5 w-5" />
                </div>
              ) : (
                MODULES.map(mod => {
                  const hasAnyInCeiling = mod.levels.some(l => permModal.ceilingPerms.includes(l.key))
                  return (
                    <div key={mod.id} className={hasAnyInCeiling ? '' : 'opacity-40'}>
                      <div className="px-6 py-2 bg-gray-50">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          {mod.label}
                        </p>
                      </div>
                      <div className="px-6 py-2.5 flex flex-wrap gap-2">
                        {mod.levels.map(({ key, label, color }) => {
                          const inCeiling = permModal.ceilingPerms.includes(key)
                          const checked = userPerms.includes(key)
                          return (
                            <PermToggle
                              key={key}
                              permKey={key}
                              label={label}
                              color={color}
                              checked={checked}
                              disabled={!inCeiling}
                              onChange={() => inCeiling && togglePerm(key)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setUserPerms([])}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition"
              >
                Bỏ tất cả
              </button>
              <button
                onClick={() => setUserPerms(permModal.ceilingPerms)}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition"
              >
                Chọn tất cả (theo phòng)
              </button>
              <div className="flex gap-2">
                <button onClick={() => setPermModal(null)} className="px-4 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition">
                  Hủy
                </button>
                <button
                  onClick={savePerms}
                  disabled={savingPerms}
                  className="px-4 py-1.5 bg-[#7a5230] text-white rounded-lg text-sm font-medium hover:bg-[#5a3820] disabled:opacity-50 transition"
                >
                  {savingPerms ? 'Đang lưu...' : 'Lưu quyền'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
