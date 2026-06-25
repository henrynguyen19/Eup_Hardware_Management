'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

interface Mapping {
  user_id:        string
  crm_staff_id:   number
  crm_staff_name: string | null
  crm_nick_name:  string | null
  crm_account:    string | null
  updated_at:     string
  email:          string
}

interface AppUser {
  user_id:    string
  user_email: string
}

export default function CrmMappingPage() {
  const [mappings, setMappings]   = useState<Mapping[]>([])
  const [users, setUsers]         = useState<AppUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')

  // Form state
  const [selUserId, setSelUserId] = useState('')
  const [inputId, setInputId]     = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [mapRes, userRes] = await Promise.all([
      fetch('/api/admin/crm-mapping'),
      fetch('/api/admin/users'),
    ])
    if (mapRes.ok) {
      const j = await mapRes.json()
      setMappings(j.mappings ?? [])
    }
    if (userRes.ok) {
      const j = await userRes.json()
      setUsers(j.users ?? [])
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!selUserId || !inputId) return setMsg('⚠ Chọn user và nhập CRM Staff ID')
    setSaving(true); setMsg('')
    const res = await fetch('/api/admin/crm-mapping', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: selUserId, crm_staff_id: Number(inputId) }),
    })
    const j = await res.json()
    if (!res.ok) { setMsg(`❌ ${j.error}`); setSaving(false); return }
    const name = j.staff?.Staff_NickName ?? j.staff?.Staff_Name ?? `ID ${inputId}`
    setMsg(`✅ Đã lưu: ${name}`)
    setSelUserId(''); setInputId('')
    await loadData()
    setSaving(false)
  }

  async function handleDelete(userId: string) {
    if (!confirm('Xoá mapping này?')) return
    await fetch(`/api/admin/crm-mapping?user_id=${userId}`, { method: 'DELETE' })
    await loadData()
  }

  // Users not yet mapped
  const mappedIds  = new Set(mappings.map(m => m.user_id))
  const unmapped   = users.filter(u => !mappedIds.has(u.user_id))

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</a>
        <h1 className="text-xl font-semibold text-gray-800">CRM Staff ID Mapping</h1>
      </div>

      {/* Add mapping form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Thêm / Cập nhật mapping</h2>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">User (email)</label>
            <select
              value={selUserId}
              onChange={e => setSelUserId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">-- Chọn user --</option>
              {users.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.user_email}
                  {mappedIds.has(u.user_id) ? ' (đã có)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="block text-xs text-gray-500 mb-1">CRM Staff ID</label>
            <input
              type="number"
              value={inputId}
              onChange={e => setInputId(e.target.value)}
              placeholder="vd: 2894"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu & Lookup CRM'}
          </button>
        </div>
        {msg && <p className="text-sm mt-3 text-gray-600">{msg}</p>}
        <p className="text-xs text-gray-400 mt-2">
          Sau khi lưu, hệ thống tự gọi CRM để xác nhận tên nhân viên.
        </p>
      </div>

      {/* Mapping table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Danh sách mapping hiện tại</h2>
          <span className="text-xs text-gray-400">{mappings.length} users</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : mappings.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chưa có mapping nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">User</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">CRM Staff ID</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Tên CRM</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">NickName</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.user_id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{m.email}</td>
                  <td className="px-4 py-2.5 font-mono text-blue-600">{m.crm_staff_id}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.crm_staff_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.crm_nick_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(m.user_id)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Unmapped users hint */}
      {unmapped.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-700">
            <strong>{unmapped.length} user chưa có CRM mapping:</strong>{' '}
            {unmapped.map(u => u.user_email.split('@')[0]).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
