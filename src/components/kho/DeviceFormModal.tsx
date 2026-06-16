'use client'

import { useState } from 'react'
import type { EquipmentCard, DeviceType } from '@/types/equipment'
import { DEVICE_TYPES, DEVICE_TYPE_LABELS, DEVICE_TYPE_ICONS } from '@/types/equipment'

interface Props {
  card?: EquipmentCard
  onClose: () => void
  onCreated: (card: EquipmentCard) => void
  onUpdated: (card: EquipmentCard) => void
}

const STATUSES = ['Hiện hành', 'Ngừng sản xuất']

export default function DeviceFormModal({ card, onClose, onCreated, onUpdated }: Props) {
  const isEdit = !!card
  const [form, setForm] = useState({
    equipment_id: card?.equipment_id ?? '',
    name: card?.name ?? '',
    device_type: (card?.device_type ?? 'GPS Tracker') as DeviceType,
    vendor: card?.vendor ?? '',
    status: card?.status ?? 'Hiện hành',
    notes: card?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.equipment_id.trim() || !form.name.trim()) {
      setError('Vui lòng nhập Mã thiết bị và Tên')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body = {
        ...form,
        vendor: form.vendor.trim() || null,
        notes: form.notes.trim() || null,
      }
      let res: Response
      if (isEdit) {
        res = await fetch(`/api/kho/equipment/${card!.equipment_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/kho/equipment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Lỗi lưu')
      if (isEdit) onUpdated(json.data)
      else onCreated(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? '✏️ Sửa thiết bị' : '+ Thêm thiết bị mới'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Loại thiết bị */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Loại thiết bị *</label>
            <div className="grid grid-cols-4 gap-2">
              {DEVICE_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('device_type', type)}
                  className={'rounded-xl p-2 border-2 text-center transition-all text-sm ' + (
                    form.device_type === type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300'
                  )}
                >
                  <div className="text-xl mb-0.5">{DEVICE_TYPE_ICONS[type]}</div>
                  <div className="text-xs font-medium">{DEVICE_TYPE_LABELS[type]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mã thiết bị */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã thiết bị *</label>
            <input
              type="text"
              value={form.equipment_id}
              onChange={e => set('equipment_id', e.target.value)}
              disabled={isEdit}
              placeholder="vd: VN88-4G"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {isEdit && <p className="text-xs text-gray-400 mt-1">Mã thiết bị không thể thay đổi</p>}
          </div>

          {/* Tên */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên thiết bị *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="vd: VN88-4G & VN88-4GH"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Vendor + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nhà cung cấp</label>
              <input
                type="text"
                value={form.vendor}
                onChange={e => set('vendor', e.target.value)}
                placeholder="vd: EUP, Streamax..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Trạng thái</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô tả / Ghi chú</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Mô tả tính năng, phụ kiện đi kèm..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              ⚠️ {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition">
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition"
          >
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm thiết bị'}
          </button>
        </div>
      </div>
    </div>
  )
}
