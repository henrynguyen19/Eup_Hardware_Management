'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Minimize2, Pencil, FileText, ExternalLink } from 'lucide-react'

interface Props {
  card: EquipmentCard
  open: boolean
  onClose: () => void
  activeStatus: string
  isAdmin?: boolean
  onEdit?: () => void
  permissions?: string[]
  bookmarkNotes?: string
  onBookmarkNotesChange?: (notes: string) => void
}

const SWIPE_THRESHOLD = 50

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { return false }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function emailPrefix(email: string) {
  return email.split('@')[0]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CardDetailDialog({ card, open, onClose, activeStatus, isAdmin, onEdit, permissions = [], bookmarkNotes, onBookmarkNotesChange }: Props) {
  const canEditCard = permissions.includes('create_delete_cards')
    || permissions.some(p => p.startsWith('edit_card_'))
  const allPhotos = [
    ...(card.main_photo ? [{ url: card.main_photo, label: '主圖', caption: undefined as string | undefined }] : []),
    ...card.detail_photos.filter(Boolean).map((p, i) => ({ url: p.url, label: `細節 ${i + 1}`, caption: p.caption })),
    ...(card.weight_photos ?? []).filter(Boolean).map((p, i) => ({ url: p.url, label: `Khối lượng tịnh ${i + 1}`, caption: undefined as string | undefined })),
  ]
  const [photoIndex, setPhotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const prev = () => setPhotoIndex(i => (i - 1 + allPhotos.length) % allPhotos.length)
  const next = () => setPhotoIndex(i => (i + 1) % allPhotos.length)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || allPhotos.length <= 1) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) next(); else prev()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  /* ── ảnh內容（Tổng cộng用） ── */
  function PhotoContent({ sizes }: { sizes: string }) {
    if (allPhotos.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[#c49a72]">
          <ImageOff className="h-12 w-12" />
        </div>
      )
    }
    return (
      <>
        <Image
          key={allPhotos[photoIndex].url}
          src={allPhotos[photoIndex].url}
          alt={card.name}
          fill
          sizes={sizes}
          className="object-contain"
          priority
        />
        {allPhotos.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.45)] hover:bg-[rgba(44,30,18,.7)] text-white rounded-full p-2 transition-colors shadow">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.45)] hover:bg-[rgba(44,30,18,.7)] text-white rounded-full p-2 transition-colors shadow">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <span className="absolute top-3 left-3 bg-[rgba(44,30,18,.55)] text-[#f2ebe0] text-xs px-2 py-0.5 rounded-full pointer-events-none">
          {allPhotos[photoIndex].label}（{photoIndex + 1}/{allPhotos.length}）
        </span>
      </>
    )
  }

  /* ── 手機ảnh區：padding-bottom 自適應比例 ── */
  function MobilePhotoArea() {
    return (
      <div
        className="bg-[#f2ebe0] w-full relative"
        style={{ paddingBottom: '80%', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <PhotoContent sizes="100vw" />
      </div>
    )
  }

  /* ── 桌機ảnh區：flex-1 填滿 ── */
  function DesktopPhotoArea() {
    return (
      <div
        className="relative flex-1"
        style={{ minHeight: '200px', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <PhotoContent sizes="(max-width: 768px) 100vw, 500px" />
      </div>
    )
  }

  /* ── 縮圖列：左(上一ảnh)、Trung bình(當前)、右(下一ảnh)，跟隨主圖連動 ── */
  function ThumbnailStrip() {
    if (allPhotos.length <= 1) return null
    const len = allPhotos.length
    const indices = len === 2
      ? [0, 1]
      : [(photoIndex - 1 + len) % len, photoIndex, (photoIndex + 1) % len]
    return (
      <div className="flex justify-center gap-2 px-3 py-1.5 bg-[#e8ddd0] flex-shrink-0 border-t border-[rgba(122,82,48,.15)]">
        {indices.map(idx => (
          <button key={idx} onClick={() => setPhotoIndex(idx)}
            className={`relative h-14 w-14 rounded overflow-hidden border-2 transition-all flex-shrink-0 ${
              idx === photoIndex
                ? 'border-[#c49a72] shadow-[0_0_8px_rgba(196,154,114,.6)] scale-[1.05]'
                : 'border-transparent opacity-55 hover:opacity-85'
            }`}>
            <Image src={allPhotos[idx].url} alt="" fill sizes="56px" className="object-cover" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      {/* 手機：overflow-y-auto 可上下捲動；桌機：overflow-hidden 固定Cao */}
      <DialogContent className={`w-full p-0 transition-all duration-200 ${
        expanded
          ? 'max-w-[min(90vh,90vw)] overflow-hidden'
          : 'max-w-5xl overflow-x-hidden overflow-y-auto max-h-[92vh] md:overflow-hidden md:max-h-none'
      }`}>

        {/* Chỉnh sửa按鈕（有Chỉnh sửaquyền） */}
        {canEditCard && onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-3 right-[4.75rem] z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
            aria-label="Chỉnh sửa thiết bị"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}

        {/* 放大／縮小按鈕 */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="absolute top-3 right-11 z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
          aria-label={expanded ? '縮小視窗' : '放大視窗'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {expanded ? (
          /* ── 放大模式 ── */
          <div className="bg-[#f2ebe0] flex flex-col" style={{ height: 'min(90vh, 90vw)' }}>
            <DesktopPhotoArea />
            <div className="bg-[#e8ddd0] px-4 py-3 border-t border-[rgba(122,82,48,.2)] text-center flex-shrink-0">
              <p className="text-xs text-[#a08060] font-mono leading-none">{card.equipment_id}</p>
              <p className="text-base font-bold text-[#5a3820] mt-1 leading-snug">{card.name}</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── 手機版：上下流動 ── */}
            <div className="md:hidden flex flex-col">
              <MobilePhotoArea />
              <div className="px-4 pt-3 pb-2 border-b border-[rgba(122,82,48,.12)]">
                <p className="text-xs text-[#a08060] font-mono">{card.equipment_id}</p>
                <p className="text-sm font-bold text-[#5a3820] mt-0.5 leading-snug">{card.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.12)] text-[#7a5230] border border-[rgba(122,82,48,.25)]">
                    {card.status}
                  </span>
                  {card.category && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                      {card.category}
                    </span>
                  )}
                  {permissions.includes('read_vendor') && card.vendor && (
                    <span className="text-xs text-[#a08060]">{card.vendor}</span>
                  )}
                </div>
              </div>
              <div className="px-4 py-2 space-y-2">
                {allPhotos[photoIndex]?.caption && (
                  <div className="bg-[rgba(44,30,18,.38)] text-[#f2ebe0] text-xs px-3 py-2 rounded-lg leading-relaxed">
                    <span className="opacity-70 mr-1">{allPhotos[photoIndex].label} 說明：</span>
                    {allPhotos[photoIndex].caption}
                  </div>
                )}
                {permissions.includes('read_tags') && card.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {card.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {onBookmarkNotesChange && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">⭐ 個人Ghi chú <span className="text-[10px]">（只有你看得到）</span></p>
                    <textarea
                      value={bookmarkNotes ?? ''}
                      onChange={e => onBookmarkNotesChange(e.target.value)}
                      rows={6}
                      placeholder="記錄你的私人備忘…"
                      className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
                    />
                  </div>
                )}
                {permissions.includes('read_notes') && card.notes && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">Ghi chú</p>
                    <p className="text-xs text-[#4a3422] whitespace-pre-wrap leading-relaxed">{card.notes}</p>
                  </div>
                )}
                {permissions.includes('read_weight') && card.net_weight != null && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">Khối lượng tịnh</p>
                    <p className="text-sm text-[#4a3422]">{card.net_weight} kg</p>
                  </div>
                )}
                {permissions.includes('read_documents') && card.documents?.length > 0 && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">Tài liệu</p>
                    <div className="flex flex-col gap-1.5">
                      {card.documents.map((doc, i) => (
                        <a key={i} href={isSafeUrl(doc.url) ? doc.url : '#'} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-[#5a3820] hover:text-[#7a5230] group">
                          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060] group-hover:text-[#7a5230]" />
                          <span className="flex-1 leading-snug">{doc.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                            doc.type === 'spec' || doc.type === 'Datasheet' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                            : doc.type === 'contract' || doc.type === 'Hợp đồng' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                            : 'bg-[rgba(156,107,66,.08)] text-[#9c6b42] border border-[rgba(156,107,66,.25)]'
                          }`}>
                            {doc.type === 'spec' ? 'Datasheet' : doc.type === 'contract' ? 'Hợp đồng' : doc.type === 'other' ? 'Khác' : doc.type}
                          </span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-1 border-t border-[rgba(122,82,48,.1)] space-y-0.5">
                  {permissions.includes('read_created_at') && (
                    <p className="text-xs text-[#b0967a]">Thêm mới時間：{fmtDate(card.created_at)}</p>
                  )}
                  <p className="text-xs text-[#b0967a]">最後Cập nhật：{fmtDate(card.updated_at)}</p>
                  {permissions.includes('read_updated_by') && card.updated_by && (
                    <p className="text-xs text-[#b0967a]">Cập nhật人員：{emailPrefix(card.updated_by)}</p>
                  )}
                  {permissions.includes('read_updated_content') && card.updated_fields && card.updated_fields.length > 0 && (
                    <p className="text-xs text-[#b0967a]">Cập nhật內容：{card.updated_fields.join('、')}</p>
                  )}
                </div>
              </div>
              <ThumbnailStrip />
            </div>

            {/* ── 桌機版：左右並排 ── */}
            <div className="hidden md:flex flex-row h-[min(85vh,680px)]">
              <div className="bg-[#f2ebe0] w-3/5 flex-shrink-0 flex flex-col">
                <DesktopPhotoArea />
              </div>
              <div className="flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto">
                  <DialogHeader className="px-5 pt-5 pb-3 border-b border-[rgba(122,82,48,.12)] pr-14">
                    <p className="text-xs text-[#a08060] font-mono">{card.equipment_id}</p>
                    <DialogTitle className="text-base font-bold text-[#5a3820] mt-0.5 leading-snug">
                      {card.name}
                    </DialogTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.12)] text-[#7a5230] border border-[rgba(122,82,48,.25)]">
                        {card.status}
                      </span>
                      {card.category && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                          {card.category}
                        </span>
                      )}
                      {permissions.includes('read_vendor') && card.vendor && (
                        <span className="text-xs text-[#a08060]">{card.vendor}</span>
                      )}
                    </div>
                  </DialogHeader>
                  <div className="px-5 py-4 space-y-4">
                    {allPhotos[photoIndex]?.caption && (
                      <div className="bg-[rgba(44,30,18,.38)] text-[#f2ebe0] text-xs px-3 py-2 rounded-lg leading-relaxed">
                        <span className="opacity-70 mr-1">{allPhotos[photoIndex].label} 說明：</span>
                        {allPhotos[photoIndex].caption}
                      </div>
                    )}
                    {permissions.includes('read_tags') && card.tags.length > 0 && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1.5">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {card.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {onBookmarkNotesChange && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">⭐ 個人Ghi chú <span className="text-[10px]">（只有你看得到）</span></p>
                        <textarea
                          value={bookmarkNotes ?? ''}
                          onChange={e => onBookmarkNotesChange(e.target.value)}
                          rows={6}
                          placeholder="記錄你的私人備忘…"
                          className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
                        />
                      </div>
                    )}
                    {permissions.includes('read_notes') && card.notes && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">Ghi chú</p>
                        <p className="text-sm text-[#4a3422] whitespace-pre-wrap leading-relaxed">{card.notes}</p>
                      </div>
                    )}
                    {permissions.includes('read_weight') && card.net_weight != null && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">Khối lượng tịnh</p>
                        <p className="text-sm text-[#4a3422]">{card.net_weight} kg</p>
                      </div>
                    )}
                    {permissions.includes('read_documents') && card.documents?.length > 0 && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">Tài liệu</p>
                        <div className="flex flex-col gap-2">
                          {card.documents.map((doc, i) => (
                            <a key={i} href={isSafeUrl(doc.url) ? doc.url : '#'} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[#5a3820] hover:text-[#7a5230] group">
                              <FileText className="h-4 w-4 flex-shrink-0 text-[#a08060] group-hover:text-[#7a5230]" />
                              <span className="flex-1 leading-snug">{doc.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                                doc.type === 'spec' || doc.type === 'Datasheet' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                                : doc.type === 'contract' || doc.type === 'Hợp đồng' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                                : 'bg-[rgba(156,107,66,.08)] text-[#9c6b42] border border-[rgba(156,107,66,.25)]'
                              }`}>
                                {doc.type === 'spec' ? 'Datasheet' : doc.type === 'contract' ? 'Hợp đồng' : doc.type === 'other' ? 'Khác' : doc.type}
                              </span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[rgba(122,82,48,.1)] space-y-0.5">
                      {permissions.includes('read_created_at') && (
                        <p className="text-xs text-[#b0967a]">Thêm mới時間：{fmtDate(card.created_at)}</p>
                      )}
                      <p className="text-xs text-[#b0967a]">最後Cập nhật：{fmtDate(card.updated_at)}</p>
                      {permissions.includes('read_updated_by') && card.updated_by && (
                        <p className="text-xs text-[#b0967a]">Cập nhật人員：{emailPrefix(card.updated_by)}</p>
                      )}
                      {permissions.includes('read_updated_content') && card.updated_fields && card.updated_fields.length > 0 && (
                        <p className="text-xs text-[#b0967a]">Cập nhật內容：{card.updated_fields.join('、')}</p>
                      )}
                    </div>
                  </div>
                </div>
                <ThumbnailStrip />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
