'use client'
import { useEffect, useState, useMemo } from 'react'

interface Mapping {
  id: string
  order_name: string
  crm_name: string
  crm_device_type_id: number | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export default function DeviceTypeMappingPage() {
  const [mappings, setMappings]   = useState<Mapping[]>([])
  const [crmNames, setCrmNames]   = useState<string[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Form thêm mới
  const [newOrder, setNewOrder]   = useState('')
  const [newCrm, setNewCrm]       = useState('')
  const [newNotes, setNewNotes]   = useState('')
  const [crmSearch, setCrmSearch] = useState('')

  // Filter / search bảng
  const [search, setSearch]       = useState('')

  // Edit inline
  const [editId, setEditId]       = useState<string | null>(null)
  const [editOrder, setEditOrder] = useState('')
  const [editCrm, setEditCrm]     = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSearch, setEditSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/device-type-mapping')
    if (res.ok) {
      const j = await res.json()
      setMappings(j.mappings ?? [])
      setCrmNames(j.crmNames ?? [])
    }
    setLoading(false)
  }

  async function handleAdd() {
    if (!newOrder.trim() || !newCrm.trim()) {
      setMsg({ type: 'err', text: 'Nhập tên đơn hàng và chọn loại CRM' })
      return
    }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/device-type-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_name: newOrder.trim(), crm_name: newCrm.trim(), notes: newNotes.trim() || null }),
    })
    const j = await res.json()
    if (!res.ok) { setMsg({ type: 'err', text: j.error }); setSaving(false); return }
    setMsg({ type: 'ok', text: `✅ Đã thêm mapping "${newOrder.trim()}" → "${newCrm.trim()}"` })
    setNewOrder(''); setNewCrm(''); setNewNotes(''); setCrmSearch('')
    await load()
    setSaving(false)
  }

  async function handleEdit(id: string) {
    if (!editOrder.trim() || !editCrm.trim()) return
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/device-type-mapping', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, order_name: editOrder.trim(), crm_name: editCrm.trim(), notes: editNotes.trim() || null }),
    })
    const j = await res.json()
    if (!res.ok) { setMsg({ type: 'err', text: j.error }); setSaving(false); return }
    setEditId(null)
    await load()
    setSaving(false)
  }

  async function handleToggle(m: Mapping) {
    await fetch('/api/admin/device-type-mapping', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
    })
    await load()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xoá mapping "${name}"?`)) return
    await fetch(`/api/admin/device-type-mapping?id=${id}`, { method: 'DELETE' })
    await load()
  }

  function startEdit(m: Mapping) {
    setEditId(m.id)
    setEditOrder(m.order_name)
    setEditCrm(m.crm_name)
    setEditNotes(m.notes ?? '')
    setEditSearch('')
  }

  // Lọc CRM names theo search (form thêm mới)
  const filteredCrmNew = useMemo(() =>
    crmSearch.trim()
      ? crmNames.filter(n => n.toLowerCase().includes(crmSearch.toLowerCase()))
      : crmNames
  , [crmNames, crmSearch])

  // Lọc CRM names theo search (edit)
  const filteredCrmEdit = useMemo(() =>
    editSearch.trim()
      ? crmNames.filter(n => n.toLowerCase().includes(editSearch.toLowerCase()))
      : crmNames
  , [crmNames, editSearch])

  // Lọc bảng mapping theo search
  const filtered = useMemo(() =>
    search.trim()
      ? mappings.filter(m =>
          m.order_name.toLowerCase().includes(search.toLowerCase()) ||
          m.crm_name.toLowerCase().includes(search.toLowerCase())
        )
      : mappings
  , [mappings, search])

  const activeCount   = mappings.filter(m => m.is_active).length
  const inactiveCount = mappings.length - activeCount

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</a>
        <h1 className="text-xl font-semibold text-gray-800">Device Type Mapping</h1>
        <span className="ml-auto text-xs text-gray-400">
          {activeCount} active · {inactiveCount} inactive · {crmNames.length} loại CRM
        </span>
      </div>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Mục đích:</strong> Mapping tên thiết bị trong đơn hàng (Order name) sang tên chính xác trong CRM
        (CRM name = <code className="bg-blue-100 px-1 rounded text-xs">product_name</code> trong bảng device_inventory).
        Dùng để hệ thống tự nhận diện số lượng tồn kho khi xử lý đơn.
      </div>

      {/* Form thêm mới */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Thêm mapping mới</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Order name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tên trong đơn hàng (Order name)</label>
            <input
              value={newOrder}
              onChange={e => setNewOrder(e.target.value)}
              placeholder="vd: GO-168 V3, Router WiFi 6..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* CRM name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tên CRM (từ device_inventory)</label>
            <div className="flex gap-2">
              <input
                value={crmSearch}
                onChange={e => { setCrmSearch(e.target.value); setNewCrm('') }}
                placeholder="Tìm loại CRM..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            {/* Dropdown kết quả tìm kiếm */}
            {crmSearch.trim() && (
              <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
                {filteredCrmNew.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Không tìm thấy</div>
                ) : filteredCrmNew.map(n => (
                  <button key={n} onClick={() => { setNewCrm(n); setCrmSearch(n) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${newCrm === n ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {newCrm && (
              <p className="text-xs text-green-600 mt-1">✓ Đã chọn: <strong>{newCrm}</strong></p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Ghi chú (tuỳ chọn)</label>
          <input
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="Ghi chú thêm..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleAdd} disabled={saving || !newOrder.trim() || !newCrm.trim()}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            {saving ? 'Đang lưu...' : '+ Thêm mapping'}
          </button>
          {msg && (
            <span className={`text-sm ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>

      {/* Bảng mapping */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Danh sách mapping</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 w-48"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {mappings.length === 0 ? 'Chưa có mapping nào. Thêm mới ở trên.' : 'Không tìm thấy kết quả.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium w-8">#</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Tên trong đơn (Order name)</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Tên CRM</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium hidden md:table-cell">Ghi chú</th>
                <th className="text-center px-4 py-2.5 text-xs text-gray-500 font-medium">Trạng thái</th>
                <th className="px-4 py-2.5 text-xs text-gray-500 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={m.id} className={`border-b border-gray-50 ${!m.is_active ? 'opacity-50' : ''} ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>

                  {editId === m.id ? (
                    // ── Edit mode ──
                    <>
                      <td className="px-4 py-2">
                        <input value={editOrder} onChange={e => setEditOrder(e.target.value)}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editSearch} onChange={e => { setEditSearch(e.target.value); setEditCrm('') }}
                          placeholder="Tìm CRM name..."
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none mb-1" />
                        {editSearch.trim() && (
                          <div className="border border-gray-200 rounded bg-white shadow-sm max-h-32 overflow-y-auto">
                            {filteredCrmEdit.map(n => (
                              <button key={n} onClick={() => { setEditCrm(n); setEditSearch(n) }}
                                className={`w-full text-left px-2 py-1 text-xs hover:bg-blue-50 ${editCrm === n ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>
                                {n}
                              </button>
                            ))}
                          </div>
                        )}
                        {editCrm && !editSearch.trim() && (
                          <span className="text-xs text-gray-600">{editCrm}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none" />
                      </td>
                      <td className="px-4 py-2 text-center">—</td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <button onClick={() => handleEdit(m.id)} disabled={saving}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium">Lưu</button>
                        <button onClick={() => setEditId(null)}
                          className="text-gray-400 hover:text-gray-600 text-xs">Huỷ</button>
                      </td>
                    </>
                  ) : (
                    // ── View mode ──
                    <>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-gray-800">{m.order_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          {m.crm_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs hidden md:table-cell">
                        {m.notes ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => handleToggle(m)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {m.is_active ? 'Active' : 'Tắt'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-3">
                        <button onClick={() => startEdit(m)}
                          className="text-blue-500 hover:text-blue-700 text-xs">Sửa</button>
                        <button onClick={() => handleDelete(m.id, m.order_name)}
                          className="text-red-400 hover:text-red-600 text-xs">Xoá</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Thống kê */}
      {mappings.length > 0 && (
        <div className="text-xs text-gray-400 text-right">
          Tổng {mappings.length} mapping · {crmNames.length} loại thiết bị CRM trong database
        </div>
      )}
    </div>
  )
}
