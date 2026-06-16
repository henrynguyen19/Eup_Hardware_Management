'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { FirmwareVersion } from '@/types/kho'
import type { EquipmentCard } from '@/types/equipment'

interface Props {
  firmware: FirmwareVersion[]
  devices: Record<string, EquipmentCard>
  userEmail: string
}

export default function FirmwareList({ firmware, devices, userEmail }: Props) {
  const [search, setSearch] = useState('')
  const [showLatestOnly, setShowLatestOnly] = useState(true)

  const filtered = useMemo(() => {
    return firmware.filter(fw => {
      const device = devices[fw.equipment_id]
      const q = search.toLowerCase()
      const matchSearch = !q ||
        fw.equipment_id.toLowerCase().includes(q) ||
        fw.version.toLowerCase().includes(q) ||
        (device?.name ?? '').toLowerCase().includes(q)
      const matchLatest = !showLatestOnly || fw.is_latest
      return matchSearch && matchLatest
    })
  }, [firmware, devices, search, showLatestOnly])

  // Nhóm theo thiết bị
  const grouped = useMemo(() => {
    const map: Record<string, FirmwareVersion[]> = {}
    filtered.forEach(fw => {
      if (!map[fw.equipment_id]) map[fw.equipment_id] = []
      map[fw.equipment_id].push(fw)
    })
    return map
  }, [filtered])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/kho" className="text-gray-400 hover:text-gray-600 transition">← Kho</Link>
            <h1 className="text-xl font-bold text-gray-900">💾 Phiên bản Firmware</h1>
          </div>
          <span className="text-sm text-gray-400">{userEmail}</span>
        </div>
      </header>

      {/* Bộ lọc */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="🔍 Tìm thiết bị, phiên bản..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showLatestOnly}
              onChange={e => setShowLatestOnly(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            Chỉ hiện phiên bản mới nhất
          </label>
          <span className="text-sm text-gray-400">
            {Object.keys(grouped).length} thiết bị
          </span>
        </div>
      </div>

      {/* Danh sách */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {Object.entries(grouped).map(([equipmentId, versions]) => {
            const device = devices[equipmentId]
            const latest = versions.find(v => v.is_latest)
            return (
              <div key={equipmentId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Device header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div>
                    <p className="font-semibold text-gray-800">{device?.name ?? equipmentId}</p>
                    <p className="text-xs text-gray-400 font-mono">{equipmentId}</p>
                  </div>
                  {latest && (
                    <span className="ml-auto bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full font-mono font-semibold">
                      Mới nhất: {latest.version}
                    </span>
                  )}
                </div>

                {/* Firmware versions */}
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Phiên bản</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Ngày phát hành</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Thay đổi</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map(fw => (
                      <tr key={fw.id} className="border-t border-gray-100">
                        <td className="px-4 py-3">
                          <span className={`font-mono font-semibold ${fw.is_latest ? 'text-blue-600' : 'text-gray-600'}`}>
                            {fw.version}
                          </span>
                          {fw.is_latest && (
                            <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                              LATEST
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {fw.release_date
                            ? new Date(fw.release_date).toLocaleDateString('vi-VN')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                          {fw.changelog ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {fw.download_url ? (
                            <a
                              href={fw.download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Tải xuống ↗
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-20 text-gray-400">
              Chưa có dữ liệu firmware
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
