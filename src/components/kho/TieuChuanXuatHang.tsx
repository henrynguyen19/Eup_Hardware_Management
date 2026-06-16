'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { ShippingStandardItem } from '@/types/kho'

interface Props {
  standards: ShippingStandardItem[]
  userEmail: string
}

export default function TieuChuanXuatHang({ standards, userEmail }: Props) {
  const [search, setSearch] = useState('')

  // Nhóm theo thiết bị
  const grouped = useMemo(() => {
    const filtered = standards.filter(item => {
      const q = search.toLowerCase()
      return !q ||
        item.device_name.toLowerCase().includes(q) ||
        item.equipment_id.toLowerCase().includes(q) ||
        item.accessory_name.toLowerCase().includes(q)
    })

    const map: Record<string, ShippingStandardItem[]> = {}
    filtered.forEach(item => {
      if (!map[item.equipment_id]) map[item.equipment_id] = []
      map[item.equipment_id].push(item)
    })
    return map
  }, [standards, search])

  const handlePrint = () => window.print()

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header — ẩn khi in */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/kho" className="text-gray-400 hover:text-gray-600 transition">← Kho</Link>
            <h1 className="text-xl font-bold text-gray-900">📦 Tiêu chuẩn xuất hàng</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition"
            >
              🖨️ In
            </button>
            <span className="text-sm text-gray-400">{userEmail}</span>
          </div>
        </div>
      </header>

      {/* Tìm kiếm — ẩn khi in */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 print:hidden">
        <div className="max-w-5xl mx-auto">
          <input
            type="text"
            placeholder="🔍 Tìm thiết bị hoặc phụ kiện..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Nội dung */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Tiêu đề in */}
          <div className="hidden print:block text-center mb-6">
            <h1 className="text-2xl font-bold">EUP Hardware — Tiêu chuẩn xuất hàng</h1>
            <p className="text-sm text-gray-500 mt-1">
              In ngày {new Date().toLocaleDateString('vi-VN')}
            </p>
          </div>

          {Object.entries(grouped).map(([equipmentId, items]) => (
            <div key={equipmentId} className="bg-white rounded-xl border border-gray-200 overflow-hidden print:break-inside-avoid">
              {/* Device header */}
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
                <div>
                  <p className="font-bold text-gray-900">{items[0].device_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{equipmentId}</p>
                </div>
                {items[0].device_category && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                    {items[0].device_category}
                  </span>
                )}
              </div>

              {/* Danh sách phụ kiện kèm theo */}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Phụ kiện</th>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Mã</th>
                    <th className="text-center px-4 py-2.5 text-gray-600 font-medium">SL</th>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-medium">ĐVT</th>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.accessory_id} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{item.accessory_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{item.accessory_code ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg">Chưa có tiêu chuẩn xuất hàng nào</p>
              <p className="text-sm mt-1">
                Thêm phụ kiện kèm theo thiết bị tại trang Phụ kiện
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
