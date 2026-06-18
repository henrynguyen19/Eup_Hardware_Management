'use client'

import React, { useEffect, useState } from 'react'

interface DeviceInfo {
  equipment_id: string
  name: string
  status: string
  device_type: string
}

interface MatrixData {
  devices: DeviceInfo[]
  featureKeys: string[]
  matrix: Record<string, Record<string, { value: string; notes: string | null }>>
}

// Nhóm tính năng theo prefix/keyword
const FEATURE_GROUPS: { label: string; icon: string; keys: (k: string) => boolean }[] = [
  {
    label: 'Tiêu chuẩn pháp lý',
    icon: '📜',
    keys: k => /^(qcvn|nd10|nghidinh|phap|legal)/i.test(k),
  },
  {
    label: 'RFID & Tốc độ',
    icon: '📡',
    keys: k => /^(rfid|speed|toc_do|maxspeed)/i.test(k),
  },
  {
    label: 'Camera & Cảm biến',
    icon: '📷',
    keys: k => /^(cam|camera|sensor|cb_|nhiet|dau|fuel|temp)/i.test(k),
  },
  {
    label: 'Telematics & IoT',
    icon: '🌐',
    keys: k => /^(can|j1939|obdii|obd|iot|smart|4g|wifi|bt|bluetooth)/i.test(k),
  },
]

function getGroup(key: string): string {
  for (const g of FEATURE_GROUPS) {
    if (g.keys(key)) return g.label
  }
  return 'Khác'
}

function getGroupIcon(label: string): string {
  return FEATURE_GROUPS.find(g => g.label === label)?.icon ?? '⚙️'
}

function cellDisplay(value: string) {
  const v = value.trim()
  if (v === '✔' || v.toLowerCase() === 'co' || v.toLowerCase() === 'có') {
    return <span className="text-green-600 font-bold text-base">✔</span>
  }
  if (v === '✗' || v.toLowerCase() === 'khong' || v.toLowerCase() === 'không') {
    return <span className="text-gray-300 text-base">✗</span>
  }
  return <span className="text-blue-700 text-xs font-medium">{v}</span>
}

export default function FeatureMatrixView() {
  const [data, setData]     = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/kho/features-matrix')
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
      Đang tải bảng tính năng...
    </div>
  )

  if (error) return (
    <div className="text-red-500 text-sm bg-red-50 rounded-xl p-4 m-4">{error}</div>
  )

  if (!data || data.devices.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <span className="text-4xl">⚙️</span>
      Chưa có dữ liệu tính năng. Hãy thêm tính năng trong chi tiết từng thiết bị.
    </div>
  )

  // Nhóm tất cả featureKeys
  const grouped = new Map<string, string[]>()
  for (const key of data.featureKeys) {
    const g = getGroup(key)
    if (!grouped.has(g)) grouped.set(g, [])
    grouped.get(g)!.push(key)
  }

  return (
    <div className="px-4 pb-6 overflow-x-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Bảng so sánh tính năng</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.devices.length} thiết bị · {data.featureKeys.length} tính năng
          </p>
        </div>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="text-green-600 font-bold">✔</span> Có</span>
          <span className="flex items-center gap-1"><span className="text-gray-300">✗</span> Không</span>
          <span className="flex items-center gap-1"><span className="text-blue-700 font-medium">Giá trị</span> Tuỳ chọn</span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          {/* Header */}
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-3 font-semibold text-gray-600 w-44 min-w-[160px] sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                Tính năng
              </th>
              {data.devices.map(dev => (
                <th
                  key={dev.equipment_id}
                  className="text-center px-2 py-3 font-semibold text-gray-700 min-w-[80px]"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{dev.name}</span>
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

          {/* Body */}
          <tbody>
            {Array.from(grouped.entries()).map(([groupLabel, keys]) => (
              <React.Fragment key={`grp-${groupLabel}`}>
                {/* Group header */}
                <tr className="bg-gradient-to-r from-blue-50 to-transparent">
                  <td
                    colSpan={data.devices.length + 1}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 tracking-wide sticky left-0"
                  >
                    {getGroupIcon(groupLabel)} {groupLabel}
                  </td>
                </tr>

                {/* Feature rows */}
                {keys.map((key, ki) => (
                  <tr
                    key={key}
                    className={
                      'border-b border-gray-100 hover:bg-blue-50/30 transition-colors ' +
                      (ki % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')
                    }
                  >
                    {/* Feature name */}
                    <td className="px-3 py-2.5 font-medium text-gray-700 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                      <span className="break-words leading-snug">{key}</span>
                    </td>

                    {/* Values per device */}
                    {data.devices.map(dev => {
                      const cell = data.matrix[dev.equipment_id]?.[key]
                      return (
                        <td
                          key={dev.equipment_id}
                          className="text-center px-2 py-2.5"
                          title={cell?.notes ?? undefined}
                        >
                          {cell ? cellDisplay(cell.value) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Hover vào ô có giá trị để xem ghi chú chi tiết. Chỉnh sửa trong phần chi tiết từng thiết bị.
      </p>
    </div>
  )
}
