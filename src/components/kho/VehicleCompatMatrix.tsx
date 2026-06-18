'use client'

import React, { useEffect, useState } from 'react'

interface VehicleType {
  id: string
  name: string
  category: string
  sort_order: number
}

interface DeviceInfo {
  equipment_id: string
  name: string
  status: string
}

interface Cell {
  requirement: 'mandatory' | 'optional'
  group_note: string | null
  notes: string | null
}

interface MatrixData {
  vehicles: VehicleType[]
  devices: DeviceInfo[]
  matrix: Record<string, Record<string, Cell>>
}

const CATEGORY_ICONS: Record<string, string> = {
  'Kinh doanh vận tải': '🚛',
  'Xe công trình':      '🏗️',
  'Cá nhân & Nội bộ':  '🚗',
}

const CATEGORY_ORDER = ['Kinh doanh vận tải', 'Xe công trình', 'Cá nhân & Nội bộ']

function CellChip({ cell }: { cell: Cell | undefined }) {
  if (!cell) return <span className="text-gray-200 text-sm">—</span>
  if (cell.requirement === 'mandatory') {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-[10px] font-bold"
        title={cell.group_note ?? cell.notes ?? 'Bắt buộc'}
      >
        P
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600 text-[10px] font-bold"
      title={cell.group_note ?? cell.notes ?? 'Tuỳ chọn'}
    >
      ok
    </span>
  )
}

export default function VehicleCompatMatrix() {
  const [data, setData]       = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/kho/vehicle-compat-matrix')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Đang tải bảng xe & thiết bị...
    </div>
  )

  if (error) return (
    <div className="text-red-500 text-sm bg-red-50 rounded-xl p-4 m-4">{error}</div>
  )

  if (!data || data.vehicles.length === 0 || data.devices.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <span className="text-4xl">🚗</span>
      Chưa có dữ liệu tương thích xe. Hãy thêm trong phần chi tiết từng thiết bị.
    </div>
  )

  // Group vehicles by category (maintain order)
  const vehiclesByCategory = new Map<string, VehicleType[]>()
  for (const cat of CATEGORY_ORDER) vehiclesByCategory.set(cat, [])
  for (const v of data.vehicles) {
    const cat = v.category ?? 'Khác'
    if (!vehiclesByCategory.has(cat)) vehiclesByCategory.set(cat, [])
    vehiclesByCategory.get(cat)!.push(v)
  }

  return (
    <div className="px-4 pb-6 overflow-x-auto">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Bảng tổng quan Xe × Thiết bị</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.vehicles.length} loại xe · {data.devices.length} thiết bị
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">P</span>
            <span className="text-gray-600">Bắt buộc</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 text-[9px] font-bold">ok</span>
            <span className="text-gray-600">Tuỳ chọn</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-gray-300 text-sm">—</span>
            <span className="text-gray-600">Không lắp</span>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-xs border-collapse min-w-[500px]">
          {/* Header: device names */}
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-3 font-semibold text-gray-600 w-48 min-w-[180px] sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                Loại xe
              </th>
              {data.devices.map(dev => (
                <th
                  key={dev.equipment_id}
                  className="text-center px-2 py-3 font-semibold text-gray-700 min-w-[72px]"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="leading-tight">{dev.name}</span>
                    <span className={
                      'px-1.5 py-0.5 rounded-full text-[10px] font-normal ' +
                      (dev.status === 'Hiện hành'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-400')
                    }>
                      {dev.status}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body: vehicles grouped by category */}
          <tbody>
            {Array.from(vehiclesByCategory.entries()).map(([cat, vehicles]) => {
              if (vehicles.length === 0) return null
              return (
                <React.Fragment key={`cat-${cat}`}>
                  {/* Category header */}
                  <tr className="bg-gradient-to-r from-indigo-50 to-transparent">
                    <td
                      colSpan={data.devices.length + 1}
                      className="px-3 py-1.5 text-xs font-semibold text-indigo-700 tracking-wide sticky left-0"
                    >
                      {CATEGORY_ICONS[cat] ?? '🚙'} {cat}
                    </td>
                  </tr>

                  {/* Vehicle rows */}
                  {vehicles.map((v, vi) => (
                    <tr
                      key={v.id}
                      className={
                        'border-b border-gray-100 hover:bg-indigo-50/30 transition-colors ' +
                        (vi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')
                      }
                    >
                      <td className="px-3 py-2.5 text-gray-700 sticky left-0 bg-inherit z-10 border-r border-gray-100 font-medium">
                        {v.name}
                      </td>
                      {data.devices.map(dev => (
                        <td key={dev.equipment_id} className="text-center px-2 py-2.5">
                          <CellChip cell={data.matrix[v.id]?.[dev.equipment_id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Hover vào ô để xem ghi chú. Chỉnh sửa trong phần chi tiết từng thiết bị (tab Xe phù hợp).
      </p>
    </div>
  )
}
