'use client'

import { useState } from 'react'
import KhoPhotoWall from './KhoPhotoWall'
import FeatureMatrixView from './FeatureMatrixView'
import VehicleCompatMatrix from './VehicleCompatMatrix'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'

type PageTab = 'devices' | 'features' | 'vehicles'

interface TabDef {
  id: PageTab
  icon: string
  label: string
  desc: string
  activeColor: string
  activeBg: string
}

const PAGE_TABS: TabDef[] = [
  { id: 'devices',  icon: '📦', label: 'Thiết bị',      desc: 'Danh sách thiết bị & phụ kiện',  activeColor: 'text-blue-700',   activeBg: 'bg-blue-50 border-blue-200' },
  { id: 'features', icon: '⚙️', label: 'Bảng tính năng', desc: 'So sánh tính năng các thiết bị', activeColor: 'text-violet-700', activeBg: 'bg-violet-50 border-violet-200' },
  { id: 'vehicles', icon: '🚗', label: 'Xe & Thiết bị',  desc: 'Loại xe và thiết bị cần lắp',    activeColor: 'text-emerald-700', activeBg: 'bg-emerald-50 border-emerald-200' },
]

interface Props {
  initialCards: EquipmentCard[]
  latestFirmware: Record<string, FirmwareVersion>
  userEmail: string
  canWrite: boolean
  isAdmin: boolean
  canHoTro: boolean
}

export default function KhoPageTabs({ initialCards, latestFirmware, userEmail, canWrite, isAdmin, canHoTro }: Props) {
  const [activeTab, setActiveTab] = useState<PageTab>('devices')

  return (
    <div className="min-h-screen bg-gray-50/60">

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2">
          {PAGE_TABS.map(tab => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={
                  'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-left transition-all ' +
                  (isActive
                    ? tab.activeBg + ' ' + tab.activeColor + ' shadow-sm'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700')
                }
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span className="hidden sm:flex flex-col">
                  <span className={'text-sm font-semibold leading-tight ' + (isActive ? tab.activeColor : '')}>
                    {tab.label}
                  </span>
                  <span className={'text-[11px] leading-tight ' + (isActive ? 'opacity-70' : 'text-gray-400')}>
                    {tab.desc}
                  </span>
                </span>
                <span className="sm:hidden text-xs font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">

        {activeTab === 'devices' && (
          <KhoPhotoWall
            initialCards={initialCards}
            latestFirmware={latestFirmware}
            userEmail={userEmail}
            canWrite={canWrite}
            isAdmin={isAdmin}
            canHoTro={canHoTro}
          />
        )}

        {activeTab === 'features' && (
          <div className="p-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white flex items-center gap-3">
                <span className="text-2xl">⚙️</span>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Bảng so sánh tính năng</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Tổng hợp tính năng kỹ thuật của từng thiết bị</p>
                </div>
                {isAdmin && (
                  <span className="ml-auto text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-medium">
                    ✏️ Admin: kéo thả để sắp xếp · click để sửa tên
                  </span>
                )}
              </div>
              <FeatureMatrixView isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {activeTab === 'vehicles' && (
          <div className="p-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white flex items-center gap-3">
                <span className="text-2xl">🚗</span>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Xe & Thiết bị cần lắp</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Tổng quan thiết bị bắt buộc và tuỳ chọn theo từng loại xe</p>
                </div>
              </div>
              <VehicleCompatMatrix isAdmin={isAdmin} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
