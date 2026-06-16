'use client'

import { Trash2 } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message?: string
  detail?: string      // 可捲動的長文字（如批次Xóa清單）
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean     // true = xác nhận按鈕為磚紅色
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, message, detail,
  confirmLabel = 'Xác nhận', cancelLabel = 'Hủy',
  danger = false,
  onConfirm, onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
      <div
        className="bg-[#fff9f4] rounded-2xl shadow-[0_0_30px_rgba(122,82,48,.18),0_20px_60px_rgba(0,0,0,.22)] border border-[rgba(122,82,48,.18)] w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          {danger && (
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-[rgba(181,69,27,.1)] mb-4 mx-auto">
              <Trash2 className="h-5 w-5 text-[#b5451b]" />
            </div>
          )}
          <h3 className="text-base font-semibold text-[#2c1e12] text-center leading-snug">
            {title}
          </h3>
          {message && (
            <p className="text-sm text-[#6b4f38] text-center mt-2 leading-relaxed">
              {message}
            </p>
          )}
        </div>

        {/* 可捲動清單（批次Xóa用）*/}
        {detail && (
          <div className="mx-6 mb-4 max-h-44 overflow-y-auto rounded-lg bg-[rgba(122,82,48,.04)] border border-[rgba(122,82,48,.12)] px-3 py-2">
            <p className="text-xs text-[#6b4f38] leading-relaxed whitespace-pre-wrap">{detail}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex border-t border-[rgba(122,82,48,.12)]">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 text-sm font-medium text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.04)] transition-colors border-r border-[rgba(122,82,48,.12)]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
              danger
                ? 'text-[#b5451b] hover:bg-[rgba(181,69,27,.06)]'
                : 'text-[#7a5230] hover:bg-[rgba(122,82,48,.06)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
