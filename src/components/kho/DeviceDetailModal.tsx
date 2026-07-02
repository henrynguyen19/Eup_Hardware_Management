'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { EquipmentCard, DeviceType } from '@/types/equipment'
import { DEVICE_TYPE_LABELS, DEVICE_TYPE_COLORS, DEVICE_TYPE_ICONS } from '@/types/equipment'
import DeviceFeaturesTab from './DeviceFeaturesTab'
import DeviceVehicleCompatTab from './DeviceVehicleCompatTab'

type TabId = 'info' | 'features' | 'vehicle'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'info',     label: 'Tổng quan',  icon: '📋' },
  { id: 'features', label: 'Tính năng',  icon: '⚙️' },
  { id: 'vehicle',  label: 'Xe phù hợp', icon: '🚗' },
]

interface Props {
  card: EquipmentCard
  canWrite: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function DeviceDetailModal({ card, canWrite, onClose, onEdit, onDelete }: Props) {
  const dt = (card.device_type ?? 'GPS Tracker') as DeviceType
  const colors = DEVICE_TYPE_COLORS[dt]
  const [activeTab, setActiveTab] = useState<TabId>('info')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className={'px-3 py-1 rounded-full text-sm font-medium border ' + colors.bg + ' ' + colors.text + ' ' + colors.border}>
              {DEVICE_TYPE_ICONS[dt]} {DEVICE_TYPE_LABELS[dt]}
            </span>
            <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (card.status === 'Hiện hành' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {card.status}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-4 gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ' +
                (activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')
              }
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab: Tổng quan */}
          {activeTab === 'info' && (
            <>
              <div className="flex flex-col sm:flex-row gap-0">
                {/* Image */}
                <div className="w-full sm:w-52 flex-shrink-0 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4 min-h-40 sm:min-h-52">
                  {card.main_photo ? (
                    <div className="relative w-44 h-44">
                      <Image src={card.main_photo} alt={card.name} fill className="object-contain" />
                    </div>
                  ) : (
                    <div className="text-7xl opacity-20">{DEVICE_TYPE_ICONS[dt]}</div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 px-5 py-4 space-y-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{card.name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">Mã: {card.equipment_id}</p>
                  </div>
                  {card.vendor && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Nhà cung cấp</p>
                      <p className="text-sm text-gray-800">{card.vendor}</p>
                    </div>
                  )}
                  {card.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Mô tả</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{card.notes}</p>
                    </div>
                  )}
                  {card.tags && card.tags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {card.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs text-gray-400">
                    <div>Tạo: {new Date(card.created_at).toLocaleDateString('vi-VN')}</div>
                    <div>Cập nhật: {new Date(card.updated_at).toLocaleDateString('vi-VN')}</div>
                    {card.updated_by && <div className="col-span-2">Bởi: {card.updated_by}</div>}
                  </div>
                </div>
              </div>
              {card.detail_photos && card.detail_photos.length > 0 && (
                <div className="px-5 pb-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Ảnh chi tiết</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {card.detail_photos.map((photo, i) => (
                      <div key={i} className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-gray-100">
                        <Image src={photo.url} alt={photo.caption ?? `Ảnh ${i+1}`} fill className="object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tab: Tính năng */}
          {activeTab === 'features' && (
            <div className="px-5 pt-4">
              <DeviceFeaturesTab equipmentId={card.equipment_id} canWrite={canWrite} />
            </div>
          )}

          {/* Tab: Xe phù hợp */}
          {activeTab === 'vehicle' && (
            <div className="px-5 pt-4">
              <DeviceVehicleCompatTab equipmentId={card.equipment_id} canWrite={canWrite} />
            </div>
          )}

        </div>

        {/* Footer */}
        {canWrite && (
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onDelete}
              className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50 transition"
            >
              🗑️ Xóa
            </button>
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition">
              Đóng
            </button>
            <button
              onClick={onEdit}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition"
            >
              ✏️ Chỉnh sửa
            </button>
          </div>
   