'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'

interface Props {
  card: EquipmentCard
  latestFirmware?: FirmwareVersion
}

export default function KhoDeviceCard({ card, latestFirmware }: Props) {
  const isDiscontinued = card.status === 'Ngừng SX'

  return (
    <Link href={`/kho/${card.equipment_id}`}>
      <div className={`
        group relative bg-white rounded-xl border border-gray-200
        hover:border-blue-400 hover:shadow-md transition-all duration-200
        overflow-hidden cursor-pointer
        ${isDiscontinued ? 'opacity-60' : ''}
      `}>
        {/* Ảnh */}
        <div className="relative aspect-square bg-gray-50">
          {card.main_photo ? (
            <Image
              src={card.main_photo}
              alt={card.name}
              fill
              className="object-contain p-2"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-4xl">
              📷
            </div>
          )}

          {/* Badge trạng thái */}
          {isDiscontinued && (
            <div className="absolute top-1.5 left-1.5 bg-gray-600 text-white text-[10px] px-1.5 py-0.5 rounded">
              Ngừng SX
            </div>
          )}

          {/* Badge firmware mới */}
          {latestFirmware && (
            <div className="absolute top-1.5 right-1.5 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
              {latestFirmware.version}
            </div>
          )}
        </div>

        {/* Thông tin */}
        <div className="p-2.5">
          <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">
            {card.name}
          </p>
          <p className="text-[11px] text-gray-400 mt-1 font-mono">
            {card.equipment_id}
          </p>
          {card.category && (
            <span className="inline-block mt-1.5 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
              {card.category}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
