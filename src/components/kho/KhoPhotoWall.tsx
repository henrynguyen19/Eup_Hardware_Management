'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'
import KhoDeviceCard from './KhoDeviceCard'

interface Props {
  initialCards: EquipmentCard[]
  latestFirmware: Record<string, FirmwareVersion>
  userEmail: string
}

export default function KhoPhotoWall({ initialCards, latestFirmware, userEmail }: Props) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Danh sách danh mục duy nhất
  const categories = useMemo(() => {
    const cats = new Set(initialCards.map(c => c.category).filter(Boolean))
    return Array.from(cats).sort() as string[]
  }, [initialCards])

  // Lọc danh sách
  const filtered = useMemo(() => {
    return initialCards.filter(card => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        card.name.toLowerCase().includes(q) ||
        card.equipment_id.toLowerCase().includes(q) ||
        (card.vendor ?? '').toLowerCase().includes(q) ||
        card.tags.some(t => t.toLowerCase().includes(q))
      const matchCat = !filterCategory || card.category === filterCategory
      const matchStatus = !filterStatus || card.status === filterStatus
      return matchSearch && matchCat && matchStatus
    })
  }, [initialCards, search, filterCategory, filterStatus])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🗄️ Bộ phận Kho</h1>
            <p className="text-sm text-gray-500 mt-0.5">EUP Hardware Management</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/kho/phu-kien"
              className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
            >
              Phụ kiện
            </Link>
            <Link
              href="/kho/firmware"
              className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
            >
              Firmware
            </Link>
            <Link
              href="/kho/tieu-chuan"
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
            >
              Tiêu chuẩn xuất hàng
            </Link>
            <span className="text-sm text-gray-400">{userEmail}</span>
          </div>
        </div>
      </header>

      {/* Thanh tìm kiếm & lọc */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="🔍 Tìm thiết bị, mã, nhà cung cấp, tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="Hiện hành">Hiện hành</option>
            <option value="Ngừng SX">Ngừng sản xuất</option>
          </select>
          <span className="self-center text-sm text-gray-400">
            {filtered.length} / {initialCards.length} thiết bị
          </span>
        </div>
      </div>

      {/* Grid thiết bị */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg">Không tìm thấy thiết bị nào</p>
              <p className="text-sm mt-1">Thử thay đổi từ khóa hoặc bộ lọc</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filtered.map(card => (
                <KhoDeviceCard
                  key={card.equipment_id}
                  card={card}
                  latestFirmware={latestFirmware[card.equipment_id]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
