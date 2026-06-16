'use client'

import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { ImageOff, Pencil, Trash2, CheckSquare, Square, Star, ArrowLeftRight, Minus, FolderPlus } from 'lucide-react'

interface Props {
  card: EquipmentCard
  onClick: () => void
  isAdmin?: boolean
  onEdit?: () => void
  onDelete?: () => void
  activeStatus: string
  selectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  isNew?: boolean
  isBookmarked?: boolean
  onToggleBookmark?: () => void
  onReplace?: () => void
  onRemoveFromGroup?: () => void
  onAddToGroup?: (rect: DOMRect) => void
}

export default function EquipmentCardItem({ card, onClick, isAdmin, onEdit, onDelete, activeStatus, selectMode, isSelected, onSelect, isNew, isBookmarked, onToggleBookmark, onReplace, onRemoveFromGroup, onAddToGroup }: Props) {
  const isInactive = card.status !== activeStatus && card.status !== 'active'

  function handleClick() {
    if (selectMode) { onSelect?.(); return }
    onClick()
  }

  return (
    <div className="group relative">
      {/* 外層改用 div[role=button]，讓 FolderPlus 可直接放入圖片 div 內，與 +N 完全同層 */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-all duration-200 text-left w-full h-full cursor-pointer focus:outline-none ${
          selectMode && isSelected
            ? 'border-[#7a5230] ring-2 ring-[#c49a72] shadow-[0_0_10px_rgba(122,82,48,.3)]'
            : 'border-[rgba(122,82,48,.12)] hover:border-[#c49a72] hover:shadow-[0_0_10px_rgba(122,82,48,.25),0_4px_16px_rgba(122,82,48,.08)]'
        }`}
      >
        {/* 縮圖區 */}
        <div className="relative aspect-square bg-[#e8ddd0] overflow-hidden">
          {card.main_photo ? (
            <Image
              src={card.main_photo}
              alt={card.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#c49a72]">
              <ImageOff className="h-8 w-8" />
            </div>
          )}
          {isInactive && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-[#8a7060] px-2 py-0.5 rounded">
                {card.status}
              </span>
            </div>
          )}
          {isNew && !isInactive && (
            <span className="badge-new-pulse absolute top-2 left-2 z-[5] text-[10px] font-bold tracking-widest text-white bg-[#b5451b] px-1.5 py-0.5 rounded shadow-sm">
              NEW
            </span>
          )}
          {card.detail_photos.length > 0 && (
            <span className="absolute bottom-1.5 right-1.5 bg-[rgba(255,249,244,.88)] text-[#7a5230] border border-[rgba(122,82,48,.25)] text-[10px] px-1.5 py-0.5 rounded-full">
              +{card.detail_photos.length}
            </span>
          )}
          {/* Thêm vàoNhóm：與 +N 同在圖片 div 內，位置完全對稱 */}
          {onAddToGroup && !selectMode && (
            <button
              onClick={e => { e.stopPropagation(); onAddToGroup((e.currentTarget as HTMLButtonElement).getBoundingClientRect()) }}
              className="absolute bottom-1.5 left-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-[#a08060] hover:text-[#7a5230] hover:bg-white transition-colors z-10"
              title="Thêm vàoNhóm"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 資訊區 */}
        <div className="p-2.5">
          <p className="text-[11px] text-[#a08060] font-mono truncate">{card.equipment_id}</p>
          <p className="text-sm font-medium text-[#2c1e12] mt-0.5 line-clamp-2 leading-tight">{card.name}</p>
        </div>
      </div>

      {/* 替換按鈕：Nhóm視圖，ảnh左上角 */}
      {onReplace && !selectMode && (
        <div className="absolute top-0 left-0 w-full aspect-square pointer-events-none">
          <button
            onClick={e => { e.stopPropagation(); onReplace() }}
            style={{ pointerEvents: 'auto' }}
            className="absolute top-1.5 left-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-[#a08060] hover:text-[#7a5230] hover:bg-white transition-colors z-10"
            title="替換Thiết bị"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 收藏星號：資訊區右下角，避免與圖片區按鈕及 NEW badge 衝突 */}
      {onToggleBookmark && !selectMode && (
        <button
          onClick={e => { e.stopPropagation(); onToggleBookmark() }}
          className={`absolute bottom-1.5 right-1.5 z-10 p-1 rounded-md transition-colors ${
            isBookmarked
              ? 'flex text-amber-400'
              : 'hidden group-hover:flex [@media(hover:none)]:flex text-[#c49a72] hover:text-amber-400'
          }`}
          title={isBookmarked ? '移除Theo dõi' : 'Thêm vàoTheo dõi'}
        >
          <Star className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
        </button>
      )}

      {/* Chọn模式：右上角 checkbox */}
      {selectMode && (
        <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
          {isSelected
            ? <CheckSquare className="h-5 w-5 text-red-500 drop-shadow" />
            : <Square className="h-5 w-5 text-white drop-shadow" />
          }
        </div>
      )}

      {/* Quản trị viên：Chỉnh sửa（左上）、Xóa thiết bị（右上，Nhóm內不Hiển thị以免誤刪） */}
      {isAdmin && !selectMode && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onEdit?.() }}
            className="absolute top-1.5 left-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-[#a08060] hover:text-[#7a5230] hover:bg-white transition-colors z-10"
            title="Chỉnh sửa"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!onRemoveFromGroup && (
            <button
              onClick={e => { e.stopPropagation(); onDelete?.() }}
              className="absolute top-1.5 right-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-[#a08060] hover:text-[#b5451b] hover:bg-white transition-colors z-10"
              title="Xóa thiết bị"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}

      {/* 從Nhóm移除（右上），對所有người dùngHiển thị，與Xóa按鈕位置相同但語義不同 */}
      {onRemoveFromGroup && !selectMode && (
        <button
          onClick={e => { e.stopPropagation(); onRemoveFromGroup() }}
          className="absolute top-1.5 right-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-[#a08060] hover:text-[#b5451b] hover:bg-white transition-colors z-10"
          title="從Nhóm移除"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
