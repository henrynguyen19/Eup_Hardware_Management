'use client'

import { useState } from 'react'
import KhoPhotoWall from './KhoPhotoWall'
import FeatureMatrixView from './FeatureMatrixView'
import VehicleCompatMatrix from './VehicleCompatMatrix'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'
import { useLanguage } from '@/contexts/LanguageContext'

type PageTab = 'devices' | 'features' | 'vehicles'

// EUP brand colors
const EUP_RED   = '#A70A0A'
const EUP_GREEN = '#00AF50'
const EUP_NAVY  = '#164d81'

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
  const { t } = useLanguage()

  const PAGE_TABS = [
    {
      id: 'devices'  as PageTab,
      icon: '📦',
      label: t.kho.tabDevices,
      desc: t.kho.tabDescDevices,
      activeStyle: { background: EUP_RED, color: '#fff', boxShadow: '0 2px 8px rgba(167,10,10,0.25)', borderColor: EUP_RED },
      indicatorColor: EUP_RED,
    },
    {
      id: 'features' as PageTab,
      icon: '⚙️',
      label: t.kho.tabFeatures,
      desc: t.kho.tabDescFeatures,
      activeStyle: { background: EUP_NAVY, color: '#fff', boxShadow: '0 2px 8px rgba(22,77,129,0.25)', borderColor: EUP_NAVY },
      indicatorColor: EUP_NAVY,
    },
    {
      id: 'vehicles' as PageTab,
      icon: '🚗',
      label: t.kho.tabVehicle,
      desc: t.kho.tabDescVehicles,
      activeStyle: { background: EUP_GREEN, color: '#fff', boxShadow: '0 2px 8px rgba(0,175,80,0.25)', borderColor: EUP_GREEN },
      indicatorColor: EUP_GREEN,
    },
  ]

  const activeTabDef = PAGE_TABS.find(tab => tab.id === activeTab)!

  return (
    <div className="min-h-screen" style={{ background: '#f5f6f8' }}>

      {/* Page header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        {/* Top color stripe */}
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${EUP_RED} 0%, ${activeTabDef.indicatorColor} 100%)`, transition: 'all 0.3s' }} />

        <div className="max-w-7xl mx-auto px-4">
          {/* Breadcrumb row */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold" style={{ color: EUP_RED }}>EUP</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-600 font-medium">{t.kho.title}</span>
              <span className="text-gray-300">/</span>
              <span className="font-semibold text-gray-800">{activeTabDef.label}</span>
            </div>
            {isAdmin && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: 'rgba(167,10,10,0.08)', color: EUP_RED, border: `1px solid rgba(167,10,10,0.15)` }}>
                ⚙️ Admin
              </span>
            )}
          </div>

          {/* Tab row */}
          <div className="flex gap-1 pb-0">
            {PAGE_TABS.map(tab => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative flex items-center gap-2 px-4 pt-2 pb-3 transition-all duration-200 text-left rounded-t-xl"
                  style={isActive
                    ? { ...tab.activeStyle, border: 'none', borderBottom: 'none' }
                    : { color: '#6b7280', background: 'transparent' }
                  }
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f3f4f6' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span className="text-lg leading-none">{tab.icon}</span>
                  <span className="hidden sm:flex flex-col">
                    <span className="text-sm font-bold leading-tight">{tab.label}</span>
                    <span className="text-[11px] leading-tight opacity-70">{tab.desc}</span>
                  </span>
                  <span className="sm:hidden text-xs font-semibold">{tab.label}</span>

                  {/* Active bottom indicator */}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                          style={{ background: 'rgba(255,255,255,0.5)' }} />
                  )}
                </button>
              )
            })}
          </div>
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
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3"
                   style={{ background: `linear-gradient(90deg, ${EUP_NAVY}10, transparent)` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0"
                     style={{ background: EUP_NAVY }}>
                  ⚙️
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">{t.kho.featureMatrixTitle}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{t.kho.featureMatrixDesc}</p>
                </div>
                {isAdmin && (
                  <span className="ml-auto text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: `${EUP_NAVY}15`, color: EUP_NAVY, border: `1px solid ${EUP_NAVY}25` }}>
                    ✏️ {t.kho.featureMatrixHint}
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
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3"
                   style={{ background: `linear-gradient(90deg, ${EUP_GREEN}10, transparent)` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0"
                     style={{ background: EUP_GREEN }}>
                  🚗
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">{t.kho.vehicleTitle}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{t.kho.vehicleDesc}</p>
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
