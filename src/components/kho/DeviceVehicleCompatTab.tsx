'use client'

import { useEffect, useState } from 'react'

interface VehicleType {
  id: string
  name: string
  category: string
  sort_order: number
}

interface CompatRow {
  requirement: 'mandatory' | 'optional'
  group_note: string | null
  notes: string | null
  vehicle_types: VehicleType
}

const CATEGORY_ICONS: Record<string, string> = {
  'Kinh doanh vận tải': '🚛',
  'Xe công trình':      '🏗️',
  'Cá nhân & Nội bộ':  '🚗',
}

const REQ_OPTIONS = [
  { value: 'mandatory', label: 'Bắt buộc', cls: 'bg-red-100 text-red-600 border-red-200' },
  { value: 'optional',  label: 'Tuỳ chọn', cls: 'bg-green-100 text-green-700 border-green-200' },
]

interface EditState {
  vehicle_type_id: string
  requirement: string
  group_note: string
  notes: string
}

interface Props {
  equipmentId: string
  canWrite: boolean
}

export default function DeviceVehicleCompatTab({ equipmentId, canWrite }: Props) {
  const [compat, setCompat]           = useState<CompatRow[]>([])
  const [allVehicles, setAllVehicles] = useState<VehicleType[]>([])
  const [loading, setLoading]         = useState(true)
  const [editing, setEditing]         = useState<EditState | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [newRow, setNewRow]           = useState({ vehicle_type_id: '', requirement: 'mandatory', group_note: '', notes: '' })
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch(`/api/kho/equipment/${encodeURIComponent(equipmentId)}/vehicle-compat`).then(r => r.json()),
      fetch('/api/kho/vehicle-types').then(r => r.json()),
    ]).then(([cData, vData]) => {
      setCompat(cData.compat ?? [])
      setAllVehicles(vData.vehicleTypes ?? [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [equipmentId])

  // IDs xe đã có compat
  const existingIds = new Set(compat.map(c => c.vehicle_types.id))

  async function apiCall(method: string, body: object) {
    setSaving(true); setError(null)
    const res = await fetch(`/api/kho/equipment/${encodeURIComponent(equipmentId)}/vehicle-compat`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Lỗi không xác định'); return false }
    return true
  }

  async function saveEdit() {
    if (!editing) return
    const ok = await apiCall('PATCH', {
      vehicle_type_id: editing.vehicle_type_id,
      requirement: editing.requirement,
      group_note: editing.group_note || null,
      notes: editing.notes || null,
    })
    if (ok) { setEditing(null); load() }
  }

  async function saveNew() {
    if (!newRow.vehicle_type_id) { setError('Chọn loại xe'); return }
    const ok = await apiCall('POST', {
      vehicle_type_id: newRow.vehicle_type_id,
      requirement: newRow.requirement,
      group_note: newRow.group_note || null,
      notes: newRow.notes || null,
    })
    if (ok) {
      setShowAdd(false)
      setNewRow({ vehicle_type_id: '', requirement: 'mandatory', group_note: '', notes: '' })
      load()
    }
  }

  async function del(vehicleTypeId: string, vehicleName: string) {
    if (!confirm(`Xoá tương thích với "${vehicleName}"?`)) return
    const ok = await apiCall('DELETE', { vehicle_type_id: vehicleTypeId })
    if (ok) load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
      Đang tải dữ liệu tương thích xe...
    </div>
  )

  const mandatory = compat.filter(c => c.requirement === 'mandatory')
  const optional  = compat.filter(c => c.requirement === 'optional')

  function groupByCategory(rows: CompatRow[]) {
    const groups: Record<string, CompatRow[]> = {}
    for (const row of rows) {
      const cat = row.vehicle_types.category ?? 'Khác'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(row)
    }
    return groups
  }

  function renderRows(rows: CompatRow[], badge: { label: string; cls: string }) {
    return Object.entries(groupByCategory(rows)).map(([cat, catRows]) => (
      <div key={cat}>
        <p className="text-xs font-medium text-gray-400 mb-1.5">
          {CATEGORY_ICONS[cat] ?? '🚙'} {cat}
        </p>
        <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50 mb-3">
          {catRows.map(row => {
            const isEditing = editing?.vehicle_type_id === row.vehicle_types.id
            if (isEditing && canWrite) {
              return (
                <div key={row.vehicle_types.id} className="bg-blue-50 px-3 py-2.5 space-y-2">
                  <p className="text-sm font-medium text-gray-700">{row.vehicle_types.name}</p>
                  <div className="flex gap-2">
                    <select
                      value={editing.requirement}
                      onChange={e => setEditing({ ...editing, requirement: e.target.value })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                    >
                      {REQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input
                      type="text"
                      placeholder="Ghi chú nhóm..."
                      value={editing.group_note}
                      onChange={e => setEditing({ ...editing, group_note: e.target.value })}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Ghi chú thêm..."
                      value={editing.notes}
                      onChange={e => setEditing({ ...editing, notes: e.target.value })}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg">Huỷ</button>
                    <button onClick={saveEdit} disabled={saving} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
                  </div>
                </div>
              )
            }

            const reqOpt = REQ_OPTIONS.find(o => o.value === row.requirement)
            return (
              <div key={row.vehicle_types.id} className="flex items-center px-3 py-2 gap-2 group hover:bg-gray-50/80">
                <span className="text-sm text-gray-700 flex-1">{row.vehicle_types.name}</span>
                <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ' + (reqOpt?.cls ?? badge.cls)}>
                  {reqOpt?.label ?? badge.label}
                </span>
                {(row.group_note || row.notes) && (
                  <span className="text-xs text-gray-400 max-w-[160px] truncate" title={row.group_note ?? row.notes ?? ''}>
                    {row.group_note ?? row.notes}
                  </span>
                )}
                {canWrite && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                    <button
                      onClick={() => setEditing({
                        vehicle_type_id: row.vehicle_types.id,
                        requirement: row.requirement,
                        group_note: row.group_note ?? '',
                        notes: row.notes ?? '',
                      })}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                      title="Sửa"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => del(row.vehicle_types.id, row.vehicle_types.name)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"
                      title="Xoá"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    ))
  }

  return (
    <div className="space-y-4 pb-4">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {compat.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
          <span className="text-3xl">🚗</span>
          Chưa có dữ liệu tương thích xe.
        </div>
      ) : (
        <>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Bắt buộc
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              Tuỳ chọn
            </span>
          </div>

          {mandatory.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">
                🔴 Bắt buộc ({mandatory.length} loại xe)
              </p>
              {renderRows(mandatory, { label: 'Bắt buộc', cls: 'bg-red-100 text-red-600 border-red-200' })}
            </div>
          )}

          {optional.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">
                🟢 Tuỳ chọn ({optional.length} loại xe)
              </p>
              {renderRows(optional, { label: 'Tuỳ chọn', cls: 'bg-green-100 text-green-700 border-green-200' })}
            </div>
          )}
        </>
      )}

      {/* Form thêm mới */}
      {canWrite && (
        <div>
          {showAdd ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700">Thêm loại xe tương thích</p>
              <div className="flex gap-2">
                <select
                  value={newRow.vehicle_type_id}
                  onChange={e => setNewRow({ ...newRow, vehicle_type_id: e.target.value })}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                >
                  <option value="">— Chọn loại xe —</option>
                  {['Kinh doanh vận tải', 'Xe công trình', 'Cá nhân & Nội bộ'].map(cat => {
                    const catVehicles = allVehicles.filter(v => v.category === cat && !existingIds.has(v.id))
                    if (catVehicles.length === 0) return null
                    return (
                      <optgroup key={cat} label={`${CATEGORY_ICONS[cat] ?? ''} ${cat}`}>
                        {catVehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
                <select
                  value={newRow.requirement}
                  onChange={e => setNewRow({ ...newRow, requirement: e.target.value })}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                >
                  {REQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ghi chú nhóm (vd: Chọn 1 trong: ...)"
                  value={newRow.group_note}
                  onChange={e => setNewRow({ ...newRow, group_note: e.target.value })}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                />
                <input
                  type="text"
                  placeholder="Ghi chú thêm..."
                  value={newRow.notes}
                  onChange={e => setNewRow({ ...newRow, notes: e.target.value })}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAdd(false); setError(null) }}
                  className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  onClick={saveNew}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : '+ Thêm'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowAdd(true); setEditing(null) }}
              className="w-full text-xs py-2.5 border border-dashed border-gray-300 text-gray-500 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Thêm loại xe tương thích
            </button>
          )}
        </div>
      )}
    </div>
  )
}
