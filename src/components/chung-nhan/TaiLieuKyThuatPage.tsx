'use client'

import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import CertificatesPage from './CertificatesPage'
import HuongDanLapDatPage from './HuongDanLapDatPage'

// Google Drive folder IDs — cấu hình theo từng loại tài liệu
// Giấy chứng nhận: dùng folder gốc hiện có
const FOLDER_CHUNG_NHAN   = '1wmuGM092uFqujUj_UUVDW0MZxRe15TZd'
// Tài liệu kỹ thuật & Hướng dẫn lắp đặt: cần điền folder ID của bạn vào đây
const FOLDER_TAI_LIEU_KT  = ''   // ← điền Google Drive folder ID
const FOLDER_HUONG_DAN    = ''   // ← điền Google Drive folder ID

type SubTab = 'certificates' | 'technical' | 'installation'

export default function TaiLieuKyThuatPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const { lang } = useLanguage()
  const [activeTab, setActiveTab] = useState<SubTab>('certificates')

  const vi = lang === 'vi'

  const tabs: { key: SubTab; label: string; icon: string }[] = [
    { key: 'certificates',  icon: '📜', label: vi ? 'Giấy chứng nhận'     : 'Certificates'       },
    { key: 'technical',     icon: '📋', label: vi ? 'Tài liệu kỹ thuật'   : 'Technical Docs'     },
    { key: 'installation',  icon: '🔧', label: vi ? 'Hướng dẫn lắp đặt'   : 'Installation Guide' },
  ]

  function renderContent() {
    if (activeTab === 'certificates') {
      return (
        <CertificatesPage
          rootFolderId={FOLDER_CHUNG_NHAN}
          title={vi ? 'Giấy chứng nhận' : 'Certificates'}
        />
      )
    }

    const folderId = activeTab === 'technical' ? FOLDER_TAI_LIEU_KT : FOLDER_HUONG_DAN
    const title    = activeTab === 'technical'
      ? (vi ? 'Tài liệu kỹ thuật' : 'Technical Documents')
      : (vi ? 'Hướng dẫn lắp đặt' : 'Installation Guide')

    // Hướng dẫn lắp đặt — dùng HuongDanLapDatPage
    if (activeTab === 'installation') {
      return <HuongDanLapDatPage isAdmin={isAdmin} />
    }

    if (!folderId) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 space-y-3">
          <span className="text-5xl">📋</span>
          <p className="text-base font-medium text-gray-500">{title}</p>
          <p className="text-sm">
            {vi
              ? 'Chưa cấu hình Google Drive folder. Vui lòng điền Folder ID vào TaiLieuKyThuatPage.tsx'
              : 'Google Drive folder not configured. Please set the Folder ID in TaiLieuKyThuatPage.tsx'}
          </p>
        </div>
      )
    }

    return <CertificatesPage rootFolderId={folderId} title={title} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4">
        <h1 className="text-lg md:text-xl font-bold text-gray-900">
          {vi ? '📁 Tài liệu kỹ thuật' : '📁 Technical Documents'}
        </h1>
        <p className="text-xs md:text-sm text-gray-500 mt-0.5">
          {vi ? 'Giấy chứng nhận, tài liệu kỹ thuật và hướng dẫn lắp đặt thiết bị'
               : 'Certificates, technical documents and device installation guides'}
        </p>
      </div>

      {/* Subtabs — scrollable on mobile */}
      <div className="bg-white border-b border-gray-200 px-2 md:px-6">
        <div className="flex gap-0 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* C