'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
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

  // Ảnh
  const [photoUrl, setPhotoUrl] = useState<string | null>(card?.main_photo ?? null)
  const [photoPublicId, setPhotoPublicId] = useState<string | null>(card?.main_photo_public_id ?? null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleFileUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      setUploadError('Chỉ chấp nhận file ảnh (JPG, PNG, WEBP...)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File ảnh tối đa 5MB')
      return
    }

    // Preview ngay lập tức
    const reader = new FileReader()
    reader.onload = e => setPhotoPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (form.equipment_id) fd.append('equipment_id', form.equipment_id)

      const res = await fetch('/api/kho/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload thất bại')
      setPhotoUrl(json.secure_url)
      setPhotoPublicId(json.public_id)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload thất bại')
      setPhotoPreview(null)
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  function removePhoto() {
    setPhotoUrl(null)
    setPhotoPublicId(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const displayPhoto = photoPreview ?? photoUrl

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
        main_photo: photoUrl ?? null,
        main_photo_public_id: photoPublicId ?? null,
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

          {/* === ẢNH THIẾT BỊ === */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh thiết bị</label>

            {displayPhoto ? (
              <div className="relative group w-full h-44 rounded-xl overflow-hidden border-2 border-gray-200">
                <Image src={displayPhoto} alt="Ảnh thiết bị" fill className="object-contain bg-gray-50" />
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-white text-sm font-medium animate-pulse">Đang upload...</div>
                  </div>
                )}
                {!uploading && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg shadow hover:bg-gray-50"
                    >
                      📷 Đổi ảnh
                    </button>
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow hover:bg-red-600"
                    >
                      🗑 Xóa
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all
                  ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <div className="text-blue-500 text-sm font-medium animate-pulse">⏳ Đang upload...</div>
                ) : (
                  <>
                    <div className="text-3xl mb-2">📷</div>
                    <p className="text-sm text-gray-500 font-medium">Kéo thả hoặc click để chọn ảnh</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — tối đa 5MB</p>
                  </>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {uploadError && (
              <p className="text-xs text-red-500 mt-1.5">⚠️ {uploadError}</p>
            )}
          </div>

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
            disabled={saving || uploading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition"
          >
            {saving ? 'Đang lưu...' : uploading ? 'Chờ upload ảnh...' : isEdit ? 'Lưu thay đổi' : 'Thêm thiết bị'}
          </button>
        </div>
      </div>
    </div>
  )
}
