'use client'

import { useState } from 'react'
import KhoPhotoWall from './KhoPhotoWall'
import FeatureMatrixView from './FeatureMatrixView'
import VehicleCompatMatrix from './VehicleCompatMatrix'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'

type PageTab = 'devices' | 'features' | 'vehicles'

const PAGE_TABS: { id: PageTab; label: string; icon: string }[] = [
  { id: 'devices',  label: 'Thiết bị',          icon: '📦' },
  { id: 'features', label: 'Bảng tính năng',     icon: '⚙️' },
  { id: 'vehicles', label: 'Xe & Thiết bị',      icon: '🚗' },
]

interface Props {
  initialCards: EquipmentCard[]
  latestFirmware: Record<string, FirmwareVersion>
  userEmail: string
  canWrite: boolean
  isAdmin: boolean
  canHoTro: boolean
}

export default function KhoPageTabs({
  initialCards,
  latestFirmware,
  userEmail,
  canWrite,
  isAdmin,
  canHoTro,
}: Props) {
  const [activeTab, setActiveTab] = useState<PageTab>('devices')

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab bar */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                'flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ' +
                (activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300')
              }
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
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
          <div className="py-6">
            <FeatureMatrixView />
          </div>
        )}

        {activeTab === 'vehicles' && (
          <div className="py-6">
            <VehicleCompatMatrix />
          </div>
        )}
      </div>
    </div>
  )
}
