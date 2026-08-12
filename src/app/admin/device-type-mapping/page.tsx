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
}

interface CrmType {
  id: number
  name: string
}

export default function DeviceTypeMappingPage() {
  const [mappings, setMappings]     = useState<Mapping[]>([])
  const [crmTypes, setCrmTypes]     = useState<CrmType[]>([])
  const [orderNames, setOrderNames] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)

  // Selection state
  const [selOrder, setSelOrder]   = useState<string | null>(null)
  const [selCrm, setSelCrm]       = useState<CrmType | null>(null)
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Search filters
  const [searchOrder, setSearchOrder] = useState('')
  const [searchCrm, setSearchCrm]     = useState('')
  const [searchMap, setSearchMap]     = useState('')

  // Show all or only unmapped
  const [onlyUnmapped, setOnlyUnmapped] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/device-type-mapping')
    if (res.ok) {
      const j = await res.json()
      setMappings(j.mappings ?? [])
      setCrmTypes(j.crmTypes ?? [])
      setOrderNames(j.orderNames ?? [])
    }
    setLoading(false)
  }

  // Set của order_name đã được map
  const mappedOrders  = useMemo(() => new Set(mappings.map(m => m.order_name)), [mappings])
  const mappedCrmIds  = useMemo(() => new Set(mappings.map(m => m.crm_device_type_id).filter(Boolean)), [mappings])
  const mappedCrmNames = useMemo(() => new Set(mappings.map(m => m.crm_name)), [mappings])

  // Lọc danh sách trái (order names)
  const filteredOrders = useMemo(() => {
    let list = orderNames
    if (onlyUnmapped) list = list.filter(n => !mappedOrders.has(n))
    if (searchOrder.trim()) list = list.filter(n => n.toLowerCase().includes(searchOrder.toLowerCase()))
    return list
  }, [orderNames, onlyUnmapped, searchOrder, mappedOrders])

  // Lọc danh sách phải (CRM types)
  const filteredCrm = useMemo(() => {
    let list = crmTypes
    if (searchCrm.trim()) list = list.filter(t => t.name.toLowerCase().includes(searchCrm.toLowerCase()))
    return list
  }, [crmTypes, searchCrm])

  // Lọc bảng mapping bên dưới
  const filteredMap = useMemo(() => {
    if (!searchMap.trim()) return mappings
    return mappings.filter(m =>
      m.order_name.toLowerCase().includes(searchMap.toLowerCase()) ||
      m.crm_name.toLowerCase().includes(searchMap.toLowerCase())
    )
  }, [mappings, searchMap])

  async function handleMap() {
    if (!selOrder || !selCrm) return
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/device-type-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_name: selOrder,
        crm_name: selCrm.name,
        crm_device_type_id: selCrm.id,
        notes: notes.trim() || null,
      }),
    })
    const j = await res.json()
    if (!res.ok) {
      setMsg({ type: 'err', text: j.error })
      setSaving(false); return
    }
    setMsg({ type: 'ok', text: `✅ "${selOrder}" → "${selCrm.name}"` })
    setSelOrder(null); setSelCrm(null); setNotes('')
    await load()
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xoá mapping "${name}"?`)) return
    await fetch(`/api/admin/device-type-mapping?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function handleToggle(m: Mapping) {
    await fetch('/api/admin/device-type-mapping', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
    })
    await load()
  }

  const unmappedCount = orderNames.filter(n => !mappedOrders.has(n)).length

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</a>
        <h1 className="text-xl font-semibold text-gray-800">Device Type Mapping</h1>
        <span className="ml-auto text-xs text-gray-400">
          {mappings.length} đã map · {unmappedCount} chưa map · {crmTypes.length} loại CRM
        </span>
      </div>

      {/* ── 2 cột chọn ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">
            Chọn 1 tên từ mỗi cột → nhấn <strong>Tạo mapping</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 divide-x divide-gray-100">

          {/* ── Cột TRÁI: Order names ── */}
          <div className="flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Tên trong đơn hàng
                </span>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={onlyUnmapped}
                    onChange={e => setOnlyUnmapped(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-600" />
                  Chỉ chưa map
                </label>
              </div>
              <input value={searchOrder} onChange={e => setSearchOrder(e.target.value)}
                placeholder="Tìm tên đơn..."
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              {loading ? (
                <div className="p-6 text-center text-xs text-gray-400">Đang tải...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  {orderNames.length === 0 ? 'Chưa có đơn nào trong hệ thống' : 'Không có kết quả'}
                </div>
              ) : filteredOrders.map(name => {
                const isMapped   = mappedOrders.has(name)
                const isSelected = selOrder === name
                return (
                  <button key={name} onClick={() => setSelOrder(isSelected ? null : name)}
                    className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 flex items-center justify-between gap-2 transition-colors
                      ${isSelected ? 'bg-indigo-600 text-white' : isMapped ? 'bg-green-50 hover:bg-green-100 text-gray-600' : 'hover:bg-gray-50 text-gray-800'}`}>
                    <span className="truncate">{name}</span>
                    {isMapped && !isSelected && (
                      <span className="shrink-0 text-[10px] bg-green-200 text-green-700 px-1.5 py-0.5 rounded-full">mapped</span>
                    )}
                    {isSelected && <span className="shrink-0 text-xs">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Cột PHẢI: CRM device types (từ GetDeviceType SOAP) ── */}
          <div className="flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Loại thiết bị CRM
                </span>
                {crmTypes.length > 0 && (
                  <span className="ml-2 text-[10px] text-gray-400">{crmTypes.length} loại</span>
                )}
              </div>
              <input value={searchCrm} onChange={e => setSearchCrm(e.target.value)}
                placeholder="Tìm tên CRM..."
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              {loading ? (
                <div className="p-6 text-center text-xs text-gray-400">Đang tải từ CRM...</div>
              ) : filteredCrm.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  {crmTypes.length === 0 ? 'Không lấy được dữ liệu CRM' : 'Không có kết quả'}
                </div>
              ) : filteredCrm.map(type => {
                const isMapped   = mappedCrmIds.has(type.id) || mappedCrmNames.has(type.name)
                const isSelected = selCrm?.id === type.id
                return (
                  <button key={type.id} onClick={() => setSelCrm(isSelected ? null : type)}
                    className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 flex items-center justify-between gap-2 transition-colors
                      ${isSelected ? 'bg-indigo-600 text-white' : isMapped ? 'bg-green-50 hover:bg-green-100 text-gray-600' : 'hover:bg-gray-50 text-gray-800'}`}>
                    <span className="truncate">{type.name}</span>
                    <span className={`shrink-0 text-[10px] font-mono ${isSelected ? 'text-indigo-200' : 'text-gray-300'}`}>#{type.id}</span>
                    {isMapped && !isSelected && (
                      <span className="shrink-0 text-[10px] bg-green-200 text-green-700 px-1.5 py-0.5 rounded-full">mapped</span>
                    )}
                    {isSelected && <span className="shrink-0 text-xs">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3">
          {/* Preview selection */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`truncate max-w-[200px] text-sm font-medium px-3 py-1 rounded-lg ${selOrder ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
              {selOrder ?? 'Chưa chọn đơn'}
            </span>
            <span className="text-gray-400 font-bold">→</span>
            <span className={`truncate max-w-[200px] text-sm font-medium px-3 py-1 rounded-lg ${selCrm ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
              {selCrm ? selCrm.name : 'Chưa chọn CRM'}
            </span>
            {selCrm && (
              <span className="text-[10px] text-gray-400 font-mono">#{selCrm.id}</span>
            )}
          </div>

          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú (tuỳ chọn)"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-200" />

          <button onClick={handleMap} disabled={!selOrder || !selCrm || saving}
            className="px-5 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 shrink-0">
            {saving ? 'Đang lưu...' : '+ Tạo mapping'}
          </button>

          {msg && (
            <span className={`text-xs ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Bảng mapping đã tạo ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Mapping đã tạo</h2>
          <span className="text-xs text-gray-400">({mappings.length})</span>
          <input value={searchMap} onChange={e => setSearchMap(e.target.value)}
            placeholder="Tìm kiếm..."
            className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Đang tải...</div>
        ) : filteredMap.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {mappings.length === 0 ? 'Chưa có mapping nào.' : 'Không tìm thấy.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium w-8">#</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Tên đơn hàng</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Tên CRM</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium hidden md:table-cell">Ghi chú</th>
                <th className="text-center px-4 py-2.5 text-xs text-gray-500 font-medium">Active</th>
                <th className="px-4 py-2.5 text-xs text-gray-500 font-medium text-right">Xoá</th>
              </tr>
            </thead>
            <tbody>
              {filteredMap.map((m, i) => (
                <tr key={m.id} className={`border-b border-gray-50 ${!m.is_active ? 'opacity-50' : ''} ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{m.order_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                      {m.crm_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs hidden md:table-cell">{m.notes ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => handleToggle(m)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                      {m.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => handleDelete(m.id, m.order_name)}
                      className="text-red-400 hover:text-red-600 text-xs">Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
