'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { X, Upload, Trash2, Plus, Loader2, AlertCircle, CheckSquare, Square, ChevronDown, Link2 } from 'lucide-react'
import { EquipmentCard, DetailPhoto, AppSettings, Document as EquipmentDocument } from '@/types/equipment'
import SettingsPopover from '@/components/SettingsPopover'

interface Props {
  mode: 'create' | 'edit'
  card?: EquipmentCard
  open: boolean
  onClose: () => void
  settings: AppSettings
  permissions?: string[]
}

interface FormState {
  equipment_id: string
  name: string
  category: string
  vendor: string
  status: string
  tags: string
  notes: string
  net_weight: string
}

interface PendingDetail {
  file: File
  preview: string
}

// 自訂下拉元件（供Danh mục、Trạng tháiTổng cộng用）
function FieldSelect({
  value, options, placeholder = '— Chưa chọn —', onChange, disabled,
}: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm bg-[#faf6f0] text-[#2c1e12] transition-all focus:outline-none disabled:opacity-50 ${
          open
            ? 'border-[#c49a72] shadow-[0_0_8px_rgba(122,82,48,.25)]'
            : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.35)]'
        }`}
      >
        <span className={value ? 'text-[#2c1e12]' : 'text-[#a08060]'}>
          {value || placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#a08060] transition-transform duration-150 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden z-50 max-h-52 overflow-y-auto">
          {placeholder && (
            <button type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                !value ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]' : 'text-[#a08060] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
              }`}>
              {placeholder}
            </button>
          )}
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false) }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                value === o
                  ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                  : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
              }`}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Tổng cộng用 input class
const inputCls = 'w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all'

export default function CardFormDialog({ mode, card, open, onClose, settings, permissions = [] }: Props) {
  const router = useRouter()
  const isEditMode = mode === 'edit'
  const canEdit = (key: string) => !isEditMode || permissions.includes(key)
  const mainFileRef   = useRef<HTMLInputElement>(null)
  const detailFileRef = useRef<HTMLInputElement>(null)
  const weightFileRef = useRef<HTMLInputElement>(null)

  const defaultStatus = settings.statuses[0] ?? 'Hiện hành'

  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)

  const [form, setForm] = useState<FormState>({
    equipment_id: card?.equipment_id ?? '',
    name:         card?.name ?? '',
    category:     card?.category ?? '',
    vendor:       card?.vendor ?? '',
    status:       card?.status ?? defaultStatus,
    tags:         card?.tags.join(', ') ?? '',
    notes:        card?.notes ?? '',
    net_weight:   card?.net_weight?.toString() ?? '',
  })

  const [isNew, setIsNew] = useState<boolean>(card?.is_new ?? true)

  const [mainPhoto, setMainPhoto]               = useState<string | null>(card?.main_photo ?? null)
  const [mainPhotoId, setMainPhotoId]           = useState<string | null>(card?.main_photo_public_id ?? null)
  const [detailPhotos, setDetailPhotos]         = useState<DetailPhoto[]>(card?.detail_photos ?? [])
  const [mainPhotoFile, setMainPhotoFile]       = useState<File | null>(null)
  const [mainPhotoPreview, setMainPhotoPreview] = useState<string | null>(null)
  const [pendingDetails, setPendingDetails]     = useState<PendingDetail[]>([])
  const [detailCaptions, setDetailCaptions]     = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    card?.detail_photos.forEach(p => { if (p.caption) m[p.public_id] = p.caption })
    return m
  })
  const [deleteMainPending, setDeleteMainPending]   = useState(false)
  const [deleteDetailIds, setDeleteDetailIds]       = useState<Set<string>>(new Set())

  const [existingWeightPhotos, setExistingWeightPhotos]           = useState<DetailPhoto[]>(card?.weight_photos ?? [])
  const [pendingWeightPhotos, setPendingWeightPhotos]             = useState<PendingDetail[]>([])
  const [deleteWeightPhotoIds, setDeleteWeightPhotoIds]           = useState<Set<string>>(new Set())
  const [selectWeightMode, setSelectWeightMode]                   = useState(false)
  const [selectedWeightIds, setSelectedWeightIds]                 = useState<Set<string>>(new Set())
  const [selectedPendingWeightIdxs, setSelectedPendingWeightIdxs] = useState<Set<number>>(new Set())

  const [documents, setDocuments] = useState<EquipmentDocument[]>(card?.documents ?? [])

  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [photoError, setPhotoError]   = useState<string | null>(null)
  const [selectMode, setSelectMode]               = useState(false)
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<string>>(new Set())
  const [selectedPendingIdxs, setSelectedPendingIdxs] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLocalSettings(settings)
    setForm({
      equipment_id: card?.equipment_id ?? '',
      name:         card?.name ?? '',
      category:     card?.category ?? '',
      vendor:       card?.vendor ?? '',
      status:       card?.status ?? defaultStatus,
      tags:         card?.tags.join(', ') ?? '',
      notes:        card?.notes ?? '',
      net_weight:   card?.net_weight?.toString() ?? '',
    })
    setIsNew(card?.is_new ?? true)
    setMainPhoto(card?.main_photo ?? null)
    setMainPhotoId(card?.main_photo_public_id ?? null)
    setDetailPhotos(card?.detail_photos ?? [])
    setMainPhotoFile(null)
    setMainPhotoPreview(null)
    setPendingDetails([])
    setDeleteMainPending(false)
    setDeleteDetailIds(new Set())
    setExistingWeightPhotos(card?.weight_photos ?? [])
    setPendingWeightPhotos([])
    setDeleteWeightPhotoIds(new Set())
    setSelectWeightMode(false)
    setSelectedWeightIds(new Set())
    setSelectedPendingWeightIdxs(new Set())
    setError(null)
    setPhotoError(null)
    setSelectMode(false)
    setSelectedDetailIds(new Set())
    setSelectedPendingIdxs(new Set())
    const captionInit: Record<string, string> = {}
    card?.detail_photos.forEach(p => { if (p.caption) captionInit[p.public_id] = p.caption })
    setDetailCaptions(captionInit)
    setDocuments(card?.documents ?? [])
  }, [card, open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function parseTags(raw: string): string[] {
    return raw.split(/[,，]/).map(t => t.trim()).filter(Boolean)
  }

  function handleClose() {
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    pendingDetails.forEach(p => URL.revokeObjectURL(p.preview))
    pendingWeightPhotos.forEach(p => URL.revokeObjectURL(p.preview))
    onClose()
  }

  async function uploadPhoto(file: File, equipmentId: string, type: string) {
    const sigRes = await fetch('/api/upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ equipment_id: equipmentId, type }),
    })
    if (!sigRes.ok) throw new Error('Không lấy được chữ ký upload')
    const { signature, timestamp, public_id, folder, api_key, cloud_name } = await sigRes.json()

    const formData = new FormData()
    formData.append('file',      file)
    formData.append('api_key',   api_key)
    formData.append('timestamp', String(timestamp))
    formData.append('signature', signature)
    formData.append('public_id', public_id)
    formData.append('folder',    folder)

    const cdnRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
      { method: 'POST', body: formData },
    )
    if (!cdnRes.ok) throw new Error('Upload Cloudinary thất bại')
    const { secure_url } = await cdnRes.json()

    const patchRes = await fetch('/api/upload', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ equipment_id: equipmentId, type, public_id, url: secure_url }),
    })
    if (!patchRes.ok) throw new Error('無法Lưuảnh紀錄')

    return { public_id, url: secure_url }
  }

  async function handleCreate() {
    if (!form.equipment_id.trim() || !form.name.trim()) {
      setError('Mã thiết bị và tên là bắt buộc')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/cards', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tags: parseTags(form.tags),
          is_new: isNew,
          documents,
          net_weight: form.net_weight !== '' ? parseFloat(form.net_weight) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Tạothất bại'); return }

      const equipId = form.equipment_id.trim()

      if (mainPhotoFile) {
        setUploading(true)
        try { await uploadPhoto(mainPhotoFile, equipId, 'main') }
        catch (e) { setError(`Thiết bị已Tạo，但Ảnh chínhuploadthất bại：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingDetails.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingDetails.length; i++) {
            await uploadPhoto(pendingDetails[i].file, equipId, `detail_${base}_${i}`)
          }
        } catch (e) { setError(`Thiết bị已Tạo，但Ảnh chi tiếtuploadthất bại：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingWeightPhotos.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingWeightPhotos.length; i++) {
            await uploadPhoto(pendingWeightPhotos[i].file, equipId, `weight_${base}_${i}`)
          }
        } catch (e) { setError(`Thiết bị已Tạo，但Ảnh khối lượnguploadthất bại：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      router.refresh()
      onClose()
    } catch {
      setError('Tạothất bại，vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!form.name.trim()) { setError('Tên thiết bị là bắt buộc'); return }
    if (!form.equipment_id.trim()) { setError('Mã thiết bị là bắt buộc'); return }
    setSaving(true)
    setError(null)
    try {
      // Compute what changed for the audit trail
      const changedFields: string[] = []
      const orig = card!
      const newTags = parseTags(form.tags)
      const newNetWeight = form.net_weight !== '' ? parseFloat(form.net_weight) : null
      if (form.equipment_id.trim() !== orig.equipment_id) changedFields.push('Mã thiết bị')
      if (form.name.trim() !== orig.name) changedFields.push('Tên thiết bị')
      if ((form.category || null) !== orig.category) changedFields.push('Danh mục')
      if ((form.vendor?.trim() || null) !== orig.vendor) changedFields.push('Nhà cung cấp')
      if (form.status !== orig.status) changedFields.push('Trạng thái')
      if (JSON.stringify([...newTags].sort()) !== JSON.stringify([...orig.tags].sort())) changedFields.push('Tags')
      if ((form.notes?.trim() || null) !== orig.notes) changedFields.push('Ghi chú')
      if (JSON.stringify(documents) !== JSON.stringify(orig.documents ?? [])) changedFields.push('Tài liệu')
      if (newNetWeight !== orig.net_weight) changedFields.push('Khối lượng tịnh')
      if (isNew !== !!orig.is_new) changedFields.push('Mới標記')
      if (deleteMainPending || mainPhotoFile) changedFields.push('主圖')
      if (deleteDetailIds.size > 0 || pendingDetails.length > 0) changedFields.push('Ảnh chi tiết')
      if (deleteWeightPhotoIds.size > 0 || pendingWeightPhotos.length > 0) changedFields.push('Ảnh khối lượng')

      const res = await fetch(`/api/cards/${card!.equipment_id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, tags: parseTags(form.tags), is_new: isNew,
          detail_photo_captions: detailCaptions,
          documents,
          net_weight: form.net_weight !== '' ? parseFloat(form.net_weight) : null,
          updated_fields: changedFields,
        }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Cập nhậtthất bại'); return }

      const equipId = form.equipment_id.trim()

      if (deleteMainPending && mainPhotoId && !mainPhotoFile) {
        setUploading(true)
        try { await fetch(`/api/upload/${encodeURIComponent(mainPhotoId)}?equipment_id=${equipId}&type=main`, { method: 'DELETE' }) }
        catch { /* non-fatal */ } finally { setUploading(false) }
      }

      if (mainPhotoFile) {
        setUploading(true)
        try { await uploadPhoto(mainPhotoFile, equipId, 'main') }
        catch (e) { setError(`Ảnh chínhuploadthất bại：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (deleteDetailIds.size > 0) {
        setUploading(true)
        try {
          for (const publicId of Array.from(deleteDetailIds)) {
            await fetch(`/api/upload/${encodeURIComponent(publicId)}?equipment_id=${equipId}&type=detail`, { method: 'DELETE' })
          }
        } catch { /* non-fatal */ } finally { setUploading(false) }
      }

      if (pendingDetails.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingDetails.length; i++) {
            await uploadPhoto(pendingDetails[i].file, equipId, `detail_${base}_${i}`)
          }
        } catch (e) { setError(`Ảnh chi tiếtuploadthất bại：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      // Xóa已標記的Ảnh khối lượng
      if (deleteWeightPhotoIds.size > 0) {
        setUploading(true)
        try {
          for (const publicId of Array.from(deleteWeightPhotoIds)) {
            await fetch(`/api/upload/${encodeURIComponent(publicId)}?equipment_id=${equipId}&type=weight`, { method: 'DELETE' })
          }
        } catch { /* non-fatal */ } finally { setUploading(false) }
      }

      // upload新Ảnh khối lượng
      if (pendingWeightPhotos.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingWeightPhotos.length; i++) {
            await uploadPhoto(pendingWeightPhotos[i].file, equipId, `weight_${base}_${i}`)
          }
        } catch (e) { setError(`Ảnh khối lượnguploadthất bại：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      router.refresh()
      onClose()
    } catch {
      setError('Cập nhậtthất bại，vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  function handleMainPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    setMainPhotoFile(file)
    setMainPhotoPreview(URL.createObjectURL(file))
    setDeleteMainPending(false)
  }

  function handleDeleteMain() {
    if (mainPhotoPreview) {
      URL.revokeObjectURL(mainPhotoPreview)
      setMainPhotoFile(null)
      setMainPhotoPreview(null)
    } else {
      setDeleteMainPending(true)
    }
  }

  function handleAddDetail(e: React.ChangeEvent<HTMLInputElement>) {
    const fileArray = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!fileArray.length) return
    if (mode === 'create') {
      const equipId = form.equipment_id.trim()
      if (!equipId) { setPhotoError('Vui lòng nhập mã thiết bị trước'); return }
    }
    const newItems: PendingDetail[] = fileArray.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPendingDetails(prev => [...prev, ...newItems])
  }

  function handleDeletePendingDetail(index: number) {
    setPendingDetails(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index) })
  }

  function handleDeleteDetail(publicId: string) {
    setDeleteDetailIds(prev => new Set([...Array.from(prev), publicId]))
  }

  function handleAddWeightPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fileArray = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!fileArray.length) return
    if (mode === 'create') {
      const equipId = form.equipment_id.trim()
      if (!equipId) { setPhotoError('Vui lòng nhập mã thiết bị trước'); return }
    }
    const newItems: PendingDetail[] = fileArray.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPendingWeightPhotos(prev => [...prev, ...newItems])
  }

  function handleDeleteExistingWeight(publicId: string) {
    setDeleteWeightPhotoIds(prev => new Set([...Array.from(prev), publicId]))
  }

  function handleDeletePendingWeight(index: number) {
    setPendingWeightPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function toggleSelectWeight(publicId: string) {
    setSelectedWeightIds(prev => {
      const n = new Set(prev)
      if (n.has(publicId)) n.delete(publicId); else n.add(publicId)
      return n
    })
  }

  function toggleSelectPendingWeight(idx: number) {
    setSelectedPendingWeightIdxs(prev => {
      const n = new Set(prev)
      if (n.has(idx)) n.delete(idx); else n.add(idx)
      return n
    })
  }

  function handleBatchDeleteWeight() {
    selectedWeightIds.forEach(id => handleDeleteExistingWeight(id))
    Array.from(selectedPendingWeightIdxs).sort((a, b) => b - a).forEach(idx => handleDeletePendingWeight(idx))
    setSelectedWeightIds(new Set())
    setSelectedPendingWeightIdxs(new Set())
    setSelectWeightMode(false)
  }

  function toggleSelectDetail(publicId: string) {
    setSelectedDetailIds(prev => { const n = new Set(prev); if (n.has(publicId)) { n.delete(publicId) } else { n.add(publicId) }; return n })
  }

  function toggleSelectPending(idx: number) {
    setSelectedPendingIdxs(prev => { const n = new Set(prev); if (n.has(idx)) { n.delete(idx) } else { n.add(idx) }; return n })
  }

  function handleBatchDelete() {
    selectedDetailIds.forEach(id => handleDeleteDetail(id))
    Array.from(selectedPendingIdxs).sort((a, b) => b - a).forEach(idx => handleDeletePendingDetail(idx))
    setSelectedDetailIds(new Set())
    setSelectedPendingIdxs(new Set())
    setSelectMode(false)
  }

  const totalSelected = selectedDetailIds.size + selectedPendingIdxs.size
  const isBusy = saving || uploading
  const currentMainPhoto = mainPhotoPreview ?? (deleteMainPending ? null : mainPhoto)
  const visibleDetails = detailPhotos.filter(p => !deleteDetailIds.has(p.public_id))
  const visibleWeightPhotos = existingWeightPhotos.filter(p => !deleteWeightPhotoIds.has(p.public_id))
  const totalSelectedWeight = selectedWeightIds.size + selectedPendingWeightIdxs.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[#fff9f4] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[rgba(122,82,48,.18)]"
        style={{ boxShadow: '0 0 30px rgba(122,82,48,.15), 0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(122,82,48,.15)]">
          <h2 className="text-lg font-semibold text-[#7a5230]">
            {mode === 'create' ? 'Thêm thiết bị' : 'Chỉnh sửa thiết bị'}
          </h2>
          <button onClick={handleClose} disabled={isBusy}
            className="text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {error && (
            <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Mã thiết bị */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">
              Mã thiết bị <span className="text-[#b5451b]">*</span>
            </label>
            <input type="text" value={form.equipment_id}
              onChange={e => set('equipment_id', e.target.value)}
              placeholder="例：1000003"
              disabled={!canEdit('edit_card_equipment_id')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* Tên thiết bị */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">
              Tên thiết bị <span className="text-[#b5451b]">*</span>
            </label>
            <input type="text" value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="例：S168-4G衛星定位器"
              disabled={!canEdit('edit_card_name')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* Danh mục + Trạng thái */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-[#6b4f38] mb-1">
                Danh mục
                <SettingsPopover
                  settingKey="categories"
                  items={localSettings.categories}
                  onConfirm={cats => setLocalSettings(prev => ({ ...prev, categories: cats }))}
                  disabled={isBusy}
                />
              </label>
              <FieldSelect
                value={form.category}
                options={localSettings.categories}
                placeholder="— 未Danh mục —"
                onChange={v => set('category', v)}
                disabled={isBusy || !canEdit('edit_card_category')}
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-[#6b4f38] mb-1">
                Trạng thái
                <SettingsPopover
                  settingKey="statuses"
                  items={localSettings.statuses}
                  onConfirm={stats => setLocalSettings(prev => ({ ...prev, statuses: stats }))}
                  disabled={isBusy}
                />
              </label>
              <FieldSelect
                value={form.status}
                options={localSettings.statuses}
                onChange={v => set('status', v)}
                disabled={isBusy || !canEdit('edit_card_status')}
              />
            </div>
          </div>

          {/* Nhà cung cấp */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">Nhà cung cấp</label>
            <input type="text" value={form.vendor}
              onChange={e => set('vendor', e.target.value)} placeholder="例：格瑪車機"
              disabled={!canEdit('edit_card_vendor')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">
              Tags <span className="text-[#a08060] font-normal ml-1">（Phân cách bằng dấu phẩy）</span>
            </label>
            <input type="text" value={form.tags}
              onChange={e => set('tags', e.target.value)} placeholder="例：HS昇銳, RFID, 4G"
              disabled={!canEdit('edit_card_tags')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">Ghi chú</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={5} placeholder="Thông tin bổ sung..."
              disabled={!canEdit('edit_card_notes')}
              className={`${inputCls} resize-none disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* Khối lượng tịnh (kg) */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">Khối lượng tịnh (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              value={form.net_weight}
              onChange={e => set('net_weight', e.target.value)}
              placeholder="例：1.25"
              disabled={isBusy || !canEdit('edit_card_weight')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* Ảnh khối lượng */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#6b4f38]">Ảnh khối lượng</label>
              {(visibleWeightPhotos.length > 0 || pendingWeightPhotos.length > 0) && canEdit('edit_card_weight') && (
                <button type="button" onClick={() => {
                  setSelectWeightMode(v => !v)
                  setSelectedWeightIds(new Set())
                  setSelectedPendingWeightIdxs(new Set())
                }} disabled={isBusy}
                  className="text-xs text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors">
                  {selectWeightMode ? 'HủyChọn' : 'Chọn'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleWeightPhotos.map(photo => {
                const isSelected = selectedWeightIds.has(photo.public_id)
                return (
                  <div
                    key={photo.public_id}
                    className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      selectWeightMode
                        ? isSelected
                          ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                          : 'border-[#e8ddd0] cursor-pointer'
                        : 'border-[rgba(122,82,48,.15)]'
                    } bg-[#e8ddd0]`}
                    onClick={selectWeightMode ? () => toggleSelectWeight(photo.public_id) : undefined}
                  >
                    <Image src={photo.url} alt="Ảnh khối lượng" fill className="object-cover" />
                    {selectWeightMode ? (
                      <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                          : <Square className="h-5 w-5 text-white drop-shadow" />
                        }
                      </div>
                    ) : canEdit('edit_card_weight') ? (
                      <button type="button" onClick={() => handleDeleteExistingWeight(photo.public_id)}
                        disabled={isBusy}
                        className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {pendingWeightPhotos.map((item, idx) => {
                const isSelected = selectedPendingWeightIdxs.has(idx)
                return (
                  <div
                    key={idx}
                    className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      selectWeightMode
                        ? isSelected
                          ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                          : 'border-[#c49a72] cursor-pointer'
                        : 'border-[#c49a72]'
                    } bg-[#f2ebe0]`}
                    onClick={selectWeightMode ? () => toggleSelectPendingWeight(idx) : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.preview} alt="Ảnh khối lượng預覽" className="w-full h-full object-cover" />
                    {selectWeightMode ? (
                      <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                          : <Square className="h-5 w-5 text-white drop-shadow" />
                        }
                      </div>
                    ) : canEdit('edit_card_weight') ? (
                      <button type="button" onClick={() => handleDeletePendingWeight(idx)}
                        disabled={isBusy}
                        className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {!selectWeightMode && canEdit('edit_card_weight') && (
                <button type="button" onClick={() => weightFileRef.current?.click()} disabled={isBusy}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-[#e8ddd0] flex items-center justify-center text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.2)] transition-all disabled:opacity-40">
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>

            {selectWeightMode && (
              <div className="mt-3 flex items-center justify-between bg-[rgba(122,82,48,.05)] border border-[rgba(122,82,48,.18)] rounded-lg px-3 py-2">
                <span className="text-sm text-[#6b4f38]">
                  Đã chọn <span className="font-semibold text-[#7a5230]">{totalSelectedWeight}</span> ảnh
                </span>
                <button type="button" onClick={handleBatchDeleteWeight}
                  disabled={isBusy || totalSelectedWeight === 0}
                  className="text-sm font-medium text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  XóaChọn
                </button>
              </div>
            )}

            <input ref={weightFileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleAddWeightPhoto} />
          </div>

          {/* Liên kết tài liệu */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-1 text-sm font-medium text-[#6b4f38]">
                Liên kết tài liệu
                <SettingsPopover
                  settingKey="documentTypes"
                  items={localSettings.documentTypes}
                  onConfirm={types => setLocalSettings(prev => ({ ...prev, documentTypes: types }))}
                  disabled={isBusy}
                />
              </label>
              <button type="button"
                onClick={() => setDocuments(prev => [...prev, { name: '', url: '', type: localSettings.documentTypes[0] ?? 'Datasheet' }])}
                disabled={isBusy || !canEdit('edit_card_documents')}
                className="flex items-center gap-1 text-xs text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
                <Plus className="h-3.5 w-3.5" />
                Thêm mới
              </button>
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-[#b0967a]">尚無Liên kết tài liệu</p>
            ) : (
              <div className="flex flex-col gap-2">
                {documents.map((doc, i) => (
                  <div key={i} className="flex flex-col gap-1.5 p-2.5 bg-[rgba(122,82,48,.04)] border border-[rgba(122,82,48,.12)] rounded-lg">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={doc.name}
                        onChange={e => setDocuments(prev => prev.map((d, idx) => idx === i ? { ...d, name: e.target.value } : d))}
                        placeholder="Tên tài liệu"
                        disabled={isBusy || !canEdit('edit_card_documents')}
                        className={`${inputCls} flex-1 text-xs py-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}
                      />
                      <select
                        value={doc.type}
                        onChange={e => setDocuments(prev => prev.map((d, idx) => idx === i ? { ...d, type: e.target.value } : d))}
                        disabled={isBusy || !canEdit('edit_card_documents')}
                        className="border border-[#e8ddd0] rounded-lg px-2 py-1.5 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {localSettings.documentTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button type="button"
                        onClick={() => setDocuments(prev => prev.filter((_, idx) => idx !== i))}
                        disabled={isBusy || !canEdit('edit_card_documents')}
                        className="text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors flex-shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                      <input
                        type="url"
                        value={doc.url}
                        onChange={e => setDocuments(prev => prev.map((d, idx) => idx === i ? { ...d, url: e.target.value } : d))}
                        placeholder="https://drive.google.com/..."
                        disabled={isBusy || !canEdit('edit_card_documents')}
                        className={`${inputCls} text-xs py-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* NEW 標記 */}
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm font-medium text-[#6b4f38]">Đánh dấu là mới</span>
              <span className="badge-new-pulse ml-2 text-[10px] font-bold tracking-widest text-white bg-[#b5451b] px-1.5 py-0.5 rounded shadow-sm">
                NEW
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsNew(v => !v)}
              disabled={isBusy || !canEdit('edit_card_is_new')}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                isNew
                  ? 'bg-[#b5451b] shadow-[0_0_8px_rgba(181,69,27,.4)]'
                  : 'bg-[#e8ddd0]'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isNew ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* ảnh錯誤 */}
          {photoError && (
            <div className="flex items-start gap-2 text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{photoError}</span>
            </div>
          )}

          {/* Ảnh chính */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-2">Ảnh chính</label>
            {currentMainPhoto ? (
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-[rgba(122,82,48,.2)] bg-[#e8ddd0] flex-shrink-0">
                  <Image src={currentMainPhoto} alt="Ảnh chính" fill className="object-cover" />
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => mainFileRef.current?.click()} disabled={isBusy || !canEdit('edit_card_main_photo')}
                    className="text-sm text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Đổi ảnh
                  </button>
                  <button type="button" onClick={handleDeleteMain} disabled={isBusy || !canEdit('edit_card_main_photo')}
                    className="text-sm text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Xóaảnh
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => mainFileRef.current?.click()} disabled={isBusy || !canEdit('edit_card_main_photo')}
                className="flex items-center gap-2 border-2 border-dashed border-[#e8ddd0] rounded-lg px-4 py-3 text-sm text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Upload className="h-4 w-4" />
                uploadẢnh chính
              </button>
            )}
            <input ref={mainFileRef} type="file" accept="image/*" className="hidden"
              onChange={handleMainPhotoChange} />
          </div>

          {/* Ảnh chi tiết */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#6b4f38]">Ảnh chi tiết</label>
              {(visibleDetails.length > 0 || pendingDetails.length > 0) && canEdit('edit_card_detail_photos') && (
                <button type="button" onClick={() => {
                  setSelectMode(v => !v)
                  setSelectedDetailIds(new Set())
                  setSelectedPendingIdxs(new Set())
                }} disabled={isBusy}
                  className="text-xs text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors">
                  {selectMode ? 'HủyChọn' : 'Chọn'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleDetails.map(photo => {
                const isSelected = selectedDetailIds.has(photo.public_id)
                return (
                  <div key={photo.public_id} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div
                      className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        selectMode
                          ? isSelected
                            ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                            : 'border-[#e8ddd0] cursor-pointer'
                          : 'border-[rgba(122,82,48,.15)]'
                      } bg-[#e8ddd0]`}
                      onClick={selectMode ? () => toggleSelectDetail(photo.public_id) : undefined}
                    >
                      <Image src={photo.url} alt="Ảnh chi tiết" fill className="object-cover" />
                      {selectMode ? (
                        <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                            : <Square className="h-5 w-5 text-white drop-shadow" />
                          }
                        </div>
                      ) : canEdit('edit_card_detail_photos') ? (
                        <button type="button" onClick={() => handleDeleteDetail(photo.public_id)}
                          disabled={isBusy}
                          className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {!selectMode && (
                      <input
                        type="text"
                        value={detailCaptions[photo.public_id] ?? ''}
                        onChange={e => setDetailCaptions(prev => ({ ...prev, [photo.public_id]: e.target.value }))}
                        placeholder="說明"
                        disabled={isBusy}
                        className="w-20 text-[10px] border border-[#e8ddd0] rounded px-1.5 py-0.5 text-[#4a3422] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] placeholder:text-[#c0a890] disabled:opacity-40"
                      />
                    )}
                  </div>
                )
              })}

              {pendingDetails.map((item, idx) => {
                const isSelected = selectedPendingIdxs.has(idx)
                return (
                  <div key={idx} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div
                      className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        selectMode
                          ? isSelected
                            ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                            : 'border-[#c49a72] cursor-pointer'
                          : 'border-[#c49a72]'
                      } bg-[#f2ebe0]`}
                      onClick={selectMode ? () => toggleSelectPending(idx) : undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.preview} alt="Ảnh chi tiết預覽" className="w-full h-full object-cover" />
                      {selectMode ? (
                        <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                            : <Square className="h-5 w-5 text-white drop-shadow" />
                          }
                        </div>
                      ) : canEdit('edit_card_detail_photos') ? (
                        <button type="button" onClick={() => handleDeletePendingDetail(idx)}
                          disabled={isBusy}
                          className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {!selectMode && (
                      <input
                        type="text"
                        placeholder="說明"
                        disabled={isBusy}
                        className="w-20 text-[10px] border border-[#c49a72] rounded px-1.5 py-0.5 text-[#4a3422] bg-[#faf6f0] focus:outline-none focus:border-[#7a5230] placeholder:text-[#c0a890] disabled:opacity-40"
                      />
                    )}
                  </div>
                )
              })}

              {!selectMode && canEdit('edit_card_detail_photos') && (
                <button type="button" onClick={() => detailFileRef.current?.click()} disabled={isBusy}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-[#e8ddd0] flex items-center justify-center text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.2)] transition-all disabled:opacity-40">
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>

            {selectMode && (
              <div className="mt-3 flex items-center justify-between bg-[rgba(122,82,48,.05)] border border-[rgba(122,82,48,.18)] rounded-lg px-3 py-2">
                <span className="text-sm text-[#6b4f38]">
                  Đã chọn <span className="font-semibold text-[#7a5230]">{totalSelected}</span> ảnh
                </span>
                <button type="button" onClick={handleBatchDelete}
                  disabled={isBusy || totalSelected === 0}
                  className="text-sm font-medium text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  XóaChọn
                </button>
              </div>
            )}

            <input ref={detailFileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleAddDetail} />
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-[#7a5230]">
              <Loader2 className="h-4 w-4 animate-spin" />
              ảnh處理Trung bình…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[rgba(122,82,48,.15)]">
          <button onClick={handleClose} disabled={isBusy}
            className="px-4 py-2 text-sm text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors">
            Hủy
          </button>
          <button onClick={mode === 'create' ? handleCreate : handleUpdate} disabled={isBusy}
            className="flex items-center gap-2 px-5 py-2 bg-[#7a5230] text-white text-sm font-medium rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-all shadow-[0_0_10px_rgba(122,82,48,.4)] hover:shadow-[0_0_14px_rgba(122,82,48,.55)]">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Tạo' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
