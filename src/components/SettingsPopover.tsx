'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, X, Plus, Loader2 } from 'lucide-react'

interface Props {
  settingKey: 'categories' | 'statuses' | 'documentTypes' | 'issueTypes'
  items: string[]
  /** 按「xác nhận」後回傳最新清單（已寫入 DB） */
  onConfirm: (newItems: string[]) => void
  disabled?: boolean
}

export default function SettingsPopover({ settingKey, items, onConfirm, disabled }: Props) {
  const [open, setOpen]     = useState(false)
  const [draft, setDraft]   = useState<string[]>([])
  const [input, setInput]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const btnRef   = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  function openPopover() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left })
    }
    setDraft([...items])
    setInput('')
    setError(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleAdd() {
    const val = input.trim()
    if (!val || draft.includes(val)) return
    setDraft(prev => [...prev, val])
    setInput('')
  }

  function handleDelete(item: string) {
    setDraft(prev => prev.filter(i => i !== item))
  }

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: settingKey, value: draft }),
      })
      if (!res.ok) { setError('Lưuthất bại'); return }
      onConfirm(draft)
      setOpen(false)
    } catch {
      setError('Lưuthất bại')
    } finally {
      setSaving(false)
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(items)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        disabled={disabled}
        className="text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors"
        title="quản lýtùy chọn"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-52 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-xl shadow-[0_8px_30px_rgba(122,82,48,.18)] p-3 flex flex-col gap-2"
        >
          <p className="text-xs font-semibold text-[#7a5230]">
            {settingKey === 'categories' ? 'Tùy chọn danh mục' : settingKey === 'statuses' ? 'Tùy chọn trạng thái' : settingKey === 'issueTypes' ? 'Loạitùy chọn' : 'Tài liệuLoại'}
          </p>

          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {draft.map((item, idx) => (
              <li key={item} className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[rgba(122,82,48,.04)] transition-colors">
                <span className="text-sm text-[#2c1e12] truncate flex-1">{item}</span>
                {!(settingKey === 'statuses' && idx === 0) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="text-[#c49a72] hover:text-[#b5451b] transition-colors flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="flex gap-1 pt-1.5 border-t border-[rgba(122,82,48,.12)]">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              placeholder="Thêm mớitùy chọn…"
              className="flex-1 min-w-0 text-xs border border-[rgba(122,82,48,.2)] rounded-md px-2 py-1.5 bg-[#faf6f0] text-[#2c1e12] placeholder:text-[#a08060] focus:outline-none focus:ring-1 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!input.trim()}
              className="p-1.5 rounded-md bg-[rgba(122,82,48,.07)] hover:bg-[rgba(122,82,48,.14)] disabled:opacity-40 transition-colors flex-shrink-0"
              title="Thêm vào清單"
            >
              <Plus className="h-3.5 w-3.5 text-[#6b4f38]" />
            </button>
          </div>

          {error && <p className="text-xs text-[#b5451b]">{error}</p>}

          <div className="flex gap-2 pt-1.5 border-t border-[rgba(122,82,48,.12)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="flex-1 text-xs text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 py-1.5 rounded-md hover:bg-[rgba(122,82,48,.05)] transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || !dirty}
              className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold bg-[#7a5230] text-white rounded-md py-1.5 hover:bg-[#9c6b42] disabled:opacity-40 transition-colors shadow-[0_0_8px_rgba(122,82,48,.3)]"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              xác nhận
            </button>
          </div>
        </div>
      )}
    </>
  )
}
