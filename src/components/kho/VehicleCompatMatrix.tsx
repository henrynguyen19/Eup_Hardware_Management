'use client'

import React, { useEffect, useState } from 'react'

interface VehicleType { id: string; name: string; category: string; sort_order: number }
interface DeviceInfo  { equipment_id: string; name: string; status: string }
interface Cell        { requirement: 'mandatory' | 'optional'; group_note: string | null; notes: string | null }
interface MatrixData  { vehicles: VehicleType[]; devices: DeviceInfo[]; matrix: Record<string, Record<string, Cell>> }
interface Props       { isAdmin: boolean }

const CATEGORY_ORDER = ['Kinh doanh van tai', 'Xe cong trinh', 'Ca nhan & Noi bo']

const CATEGORY_STYLE: Record<string, { bg: string; border: string; text: string; dot: string; hdr: string }> = {
  'Kinh doanh van tai': { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-800',   dot: 'bg-blue-500',   hdr: 'bg-blue-50/80' },
  'Xe cong trinh':      { bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500', hdr: 'bg-orange-50/80' },
  'Ca nhan & Noi bo':   { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-800',dot: 'bg-emerald-500',hdr: 'bg-emerald-50/80' },
}

function catKey(cat: string): string {
  const map: Record<string,string> = {
    'Kinh doanh vận tải': 'Kinh doanh van tai',
    'Xe công trình':      'Xe cong trinh',
    'Cá nhân & Nội bộ':  'Ca nhan & Noi bo',
  }
  return map[cat] ?? cat
}

function catLabel(key: string): string {
  const map: Record<string,string> = {
    'Kinh doanh van tai': 'Kinh doanh vận tải',
    'Xe cong trinh':      'Xe công trình',
    'Ca nhan & Noi bo':   'Cá nhân & Nội bộ',
  }
  return map[key] ?? key
}

function getVehicleEmoji(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('container'))              return '🚢'
  if (n.includes('dau keo') || n.includes('đầu kéo'))  return '🚜'
  if (n.includes('bon') || n.includes('bồn'))           return '⛽'
  if (n.includes('ben'))                                return '🚛'
  if (n.includes('tai') || n.includes('tải'))           return '🚚'
  if (n.includes('buyt') || n.includes('buýt'))         return '🚌'
  if (n.includes('khach') || n.includes('khách'))       return '🚌'
  if (n.includes('tron') || n.includes('trộn'))         return '🏗️'
  if (n.includes('cau') || n.includes('cẩu'))           return '🏗️'
  if (n.includes('xuc') || n.includes('xúc'))           return '🚜'
  if (n.includes('ui') || n.includes('ủi'))             return '🚜'
  if (n.includes('cuu thuong'))                         return '🚑'
  if (n.includes('cuu hoa') || n.includes('pccc'))      return '🚒'
  if (n.includes('pickup') || n.includes('ban tai'))    return '🛻'
  if (n.includes('van') || n.includes('minibus'))       return '🚐'
  if (n.includes('moto'))                               return '🏍️'
  return '🚗'
}

function CellChip({ cell }: { cell: Cell | undefined }) {
  if (!cell) return <span className="text-gray-200 text-lg leading-none select-none">·</span>
  const tip = [cell.group_note, cell.notes].filter(Boolean).join(' | ') || undefined
  if (cell.requirement === 'mandatory') return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white text-[11px] font-bold shadow-sm" title={tip}>P</span>
  )
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 text-[11px] font-bold" title={tip}>✓</span>
  )
}

export default function VehicleCompatMatrix({ isAdmin: _isAdmin }: Props) {
  const [data, setData]       = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/kho/vehicle-compat-matrix')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Dang tai bang xe &amp; thiet bi...
    </div>
  )
  if (error) return <div className="text-red-500 text-sm bg-red-50 rounded-xl p-4 m-4">{error}</div>
  if (!data || data.vehicles.length === 0 || data.devices.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <span className="text-4xl">🚗</span>
      Chua co du lieu. Them trong chi tiet tung thiet bi (tab Xe phu hop).
    </div>
  )

  const { devices, vehicles, matrix } = data

  // Group vehicles by normalized category key
  const grouped = new Map<string, VehicleType[]>()
  for (const cat of CATEGORY_ORDER) grouped.set(cat, [])
  for (const v of vehicles) {
    const key = catKey(v.category ?? '')
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(v)
  }

  return (
    <div className="overflow-x-auto">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">P</span>
          Bat buoc (Phap ly / ky thuat)
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center text-[10px] font-bold">✓</span>
          Tuy chon (Nang cao)
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="text-gray-300 text-lg leading-none">·</span>
          Khong lap
        </div>
        <span className="ml-auto text-[11px] text-gray-400">Hover vao o de xem ghi chu</span>
      </div>

      {/* Table */}
      <table className="w-full text-xs border-collapse" style={{ minWidth: `${280 + devices.length * 90}px` }}>
        <thead>
          <tr className="border-b-2 border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 border-r border-gray-200" style={{ width: 240, minWidth: 200 }}>
              Loai xe
            </th>
            {devices.map(dev => (
              <th key={dev.equipment_id} className="text-center px-2 py-3 font-semibold text-gray-800 border-l border-gray-100" style={{ minWidth: 84 }}>
                <div className="flex flex-col items-center gap-1">
                  <span>{dev.name}</span>
                  <span className={'text-[10px] font-normal px-2 py-0.5 rounded-full ' + (dev.status === 'Hien hanh' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')}>
                    {dev.status}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from(grouped.entries()).map(([catKey2, catVehicles]) => {
            if (catVehicles.length === 0) return null
            const style = CATEGORY_STYLE[catKey2] ?? CATEGORY_STYLE['Ca nhan & Noi bo']
            return (
              <React.Fragment key={catKey2}>
                {/* Category header */}
                <tr className={'border-b border-t ' + style.border + ' ' + style.hdr}>
                  <td colSpan={devices.length + 1} className={'px-4 py-2 font-semibold text-[11px] tracking-widest uppercase ' + style.text + ' sticky left-0 ' + style.hdr}>
                    <span className={'inline-block w-2 h-2 rounded-full mr-2 ' + style.dot} />
                    {catLabel(catKey2)}
                    <span className="ml-2 font-normal opacity-60">({catVehicles.length} loai)</span>
                  </td>
                </tr>
                {/* Vehicle rows */}
                {catVehicles.map((v, vi) => (
                  <tr key={v.id} className={'border-b border-gray-100 hover:bg-yellow-50/40 transition-colors group ' + (vi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
                    <td className="px-4 py-2.5 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className={'w-10 h-10 rounded-xl flex-shrink-0 ' + style.bg + ' border ' + style.border + ' flex items-center justify-center text-xl'}>
                          {getVehicleEmoji(v.name)}
                        </div>
                        <span className="font-medium text-gray-700 leading-snug">{v.name}</span>
                      </div>
                    </td>
                    {devices.map(dev => (
                      <td key={dev.equipment_id} className="text-center py-2.5 px-2 border-l border-gray-100 align-middle">
                        <CellChip cell={matrix[v.id]?.[dev.equipment_id]} />
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
  )
}
