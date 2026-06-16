'use client'

import { useState, useRef, useMemo } from 'react'
import Image from 'next/image'
import type { EquipmentCard, DeviceType } from '@/types/equipment'
import { DEVICE_TYPES, DEVICE_TYPE_LABELS, DEVICE_TYPE_COLORS, DEVICE_TYPE_ICONS } from '@/types/equipment'
import DeviceFormModal from './DeviceFormModal'
import DeviceDetailModal from './DeviceDetailModal'
import * as XLSX from 'xlsx'

interface Props {
  initialCards: EquipmentCard[]
  userEmail: string
  canWrite?: boolean
}

const TYPE_TAB_ALL = 'Tất cả'

export default function KhoPhotoWall({ initialCards, userEmail, canWrite = true }: Props) {
  const [cards, setCards] = useState<EquipmentCard[]>(initialCards)
  const [activeType, setActiveType] = useState<string>(TYPE_TAB_ALL)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [formModal, setFormModal] = useState<{ open: boolean; card?: EquipmentCard }>({ open: false })
  const [detailCard, setDetailCard] = useState<EquipmentCard | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    let list = cards
    if (activeType !== TYPE_TAB_ALL) list = list.filter(c => c.device_type === activeType)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.equipment_id.toLowerCase().includes(q) ||
        (c.vendor ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [cards, activeType, search])

  const countByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of cards) {
      const t = c.device_type ?? 'GPS Tracker'
      m[t] = (m[t] ?? 0) + 1
    }
    return m
  }, [cards])

  function handleCreated(card: EquipmentCard) {
    setCards(prev => [...prev, card])
    setFormModal({ open: false })
  }

  function handleUpdated(card: EquipmentCard) {
    setCards(prev => prev.map(c => c.equipment_id === card.equipment_id ? card : c))
    setFormModal({ open: false })
    setDetailCard(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa thiết bị này?')) return
    const res = await fetch(`/api/kho/equipment/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCards(prev => prev.filter(c => c.equipment_id !== id))
      setDetailCard(null)
    } else {
      alert('Xóa thất bại')
    }
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
      const rows = raw.map(r => ({
        equipment_id: String(r['equipment_id'] ?? r['Mã thiết bị'] ?? '').trim(),
        name: String(r['name'] ?? r['Tên thiết bị'] ?? r['Thiết bị'] ?? '').trim(),
        device_type: String(r['device_type'] ?? r['Loại'] ?? 'GPS Tracker').trim(),
        vendor: String(r['vendor'] ?? r['Nhà cung cấp'] ?? '').trim() || null,
        status: String(r['status'] ?? r['Trạng thái'] ?? 'Hiện hành').trim(),
        notes: String(r['notes'] ?? r['Mô tả'] ?? '').trim() || null,
      })).filter(r => r.equipment_id && r.name)

      const res = await fetch('/api/kho/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setImportMsg('✅ Đã import ' + json.imported + ' thiết bị')
      const listRes = await fetch('/api/kho/equipment')
      const listJson = await listRes.json()
      if (listJson.data) setCards(listJson.data)
    } catch (err: unknown) {
      setImportMsg('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Không xác định'))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-lg">📦</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Quản lý thiết bị</h1>
                <p className="text-xs text-gray-400">{cards.length} thiết bị · {userEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setViewMode('grid')} className={'px-3 py-2 text-sm ' + (viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>⊞</button>
                <button onClick={() => setViewMode('list')} className={'px-3 py-2 text-sm ' + (viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>☰</button>
              </div>
              {canWrite && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 rounded-xl transition"
                  >
                    <span>📥</span> {importing ? 'Đang import...' : 'Import Excel'}
                  </button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
                  <button
                    onClick={() => setFormModal({ open: true })}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium"
                  >
                    + Thêm mới
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {importMsg && (
        <div className={'text-center py-2 text-sm font-medium ' + (importMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {importMsg}
          <button onClick={() => setImportMsg(null)} className="ml-3 text-xs underline">Đóng</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 pt-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mb-4">
          {DEVICE_TYPES.map(type => {
            const colors = DEVICE_TYPE_COLORS[type]
            const count = countByType[type] ?? 0
            const active = activeType === type
            return (
              <button
                key={type}
                onClick={() => setActiveType(active ? TYPE_TAB_ALL : type)}
                className={'rounded-2xl p-3 border-2 text-center transition-all ' + (
                  active
                    ? colors.bg + ' ' + colors.border + ' ' + colors.text + ' shadow-md scale-105'
                    : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200 hover:shadow-sm'
                )}
              >
                <div className="text-2xl mb-1">{DEVICE_TYPE_ICONS[type]}</div>
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs leading-tight mt-0.5">{DEVICE_TYPE_LABELS[type]}</div>
              </button>
            )
          })}
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setActiveType(TYPE_TAB_ALL)}
            className={'px-4 py-1.5 rounded-full text-sm font-medium transition ' + (activeType === TYPE_TAB_ALL ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}
          >
            Tất cả ({cards.length})
          </button>
          {DEVICE_TYPES.filter(t => (countByType[t] ?? 0) > 0).map(type => {
            const colors = DEVICE_TYPE_COLORS[type]
            const active = activeType === type
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={'px-3 py-1.5 rounded-full text-sm font-medium border transition ' + (
                  active
                    ? colors.bg + ' ' + colors.border + ' ' + colors.text
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
              >
                {DEVICE_TYPE_ICONS[type]} {DEVICE_TYPE_LABELS[type]} ({countByType[type] ?? 0})
              </button>
            )
          })}
          <span className="ml-auto text-sm text-gray-400">{filtered.length} thiết bị</span>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-lg font-medium text-gray-500">Không có thiết bị nào</p>
            <p className="text-sm mt-1">Thêm thiết bị mới hoặc thay đổi bộ lọc</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-8">
            {filtered.map(card => (
              <DeviceCard
                key={card.equipment_id}
                card={card}
                canWrite={canWrite}
                onClick={() => setDetailCard(card)}
                onEdit={() => setFormModal({ open: true, card })}
                onDelete={() => handleDelete(card.equipment_id)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">Ảnh</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Mã / Tên</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Loại</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nhà cung cấp</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                  {canWrite && <th className="px-4 py-3 w-24"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((card, i) => {
                  const dt = (card.device_type ?? 'GPS Tracker') as DeviceType
                  const colors = DEVICE_TYPE_COLORS[dt]
                  return (
                    <tr
                      key={card.equipment_id}
                      className={'border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer ' + (i % 2 === 0 ? '' : 'bg-gray-50/30')}
                      onClick={() => setDetailCard(card)}
                    >
                      <td className="px-4 py-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                          {card.main_photo ? (
                            <Image src={card.main_photo} alt={card.name} width={48} height={48} className="object-cover w-full h-full" />
                          ) : (
                            <span className="text-xl">{DEVICE_TYPE_ICONS[dt]}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{card.name}</div>
                        <div className="text-xs text-gray-400">{card.equipment_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ' + colors.bg + ' ' + colors.text + ' ' + colors.border}>
                          {DEVICE_TYPE_ICONS[dt]} {DEVICE_TYPE_LABELS[dt]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{card.vendor ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (card.status === 'Hiện hành' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {card.status}
                        </span>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button onClick={() => setFormModal({ open: true, card })} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg">Sửa</button>
                            <button onClick={() => handleDelete(card.equipment_id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg">Xóa</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formModal.open && (
        <DeviceFormModal
          card={formModal.card}
          onClose={() => setFormModal({ open: false })}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}
      {detailCard && (
        <DeviceDetailModal
          card={detailCard}
          canWrite={canWrite}
          onClose={() => setDetailCard(null)}
          onEdit={() => { setFormModal({ open: true, card: detailCard }); setDetailCard(null) }}
          onDelete={() => handleDelete(detailCard.equipment_id)}
        />
      )}
    </div>
  )
}

function DeviceCard({ card, canWrite, onClick, onEdit, onDelete }: {
  card: EquipmentCard
  canWrite: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const dt = (card.device_type ?? 'GPS Tracker') as DeviceType
  const colors = DEVICE_TYPE_COLORS[dt]

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100">
        {card.main_photo ? (
          <Image
            src={card.main_photo}
            alt={card.name}
            fill
            className="object-contain p-2"
            sizes="200px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl opacity-20">{DEVICE_TYPE_ICONS[dt]}</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className={'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium border ' + colors.bg + ' ' + colors.text + ' ' + colors.border}>
            {DEVICE_TYPE_ICONS[dt]} {DEVICE_TYPE_LABELS[dt]}
          </span>
        </div>
        {card.status !== 'Hiện hành' && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-white">Ngừng SX</span>
          </div>
        )}
        {canWrite && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent py-2 px-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="flex-1 py-1 text-xs bg-white/90 hover:bg-white text-gray-800 rounded-lg font-medium">✏️ Sửa</button>
            <button onClick={onDelete} className="flex-1 py-1 text-xs bg-red-500/90 hover:bg-red-500 text-white rounded-lg font-medium">🗑️ Xóa</button>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{card.name}</p>
        <p className="text-xs text-gray-400 mt-1">{card.equipment_id}</p>
        {card.vendor && <p className="text-xs text-gray-500 mt-0.5 truncate">{card.vendor}</p>}
      </div>
    </div>
  )
}
