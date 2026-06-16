'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react'

interface Props {
  title: string
  description?: string
  settingsKey: 'categories' | 'statuses'
  initialItems: string[]
}

export default function OptionsEditor({ title, description, settingsKey, initialItems }: Props) {
  const [items, setItems]     = useState<string[]>(initialItems)
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)

  async function save(updated: string[]) {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: settingsKey, value: updated }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Lưuthất bại'); return }
      setItems(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Lưuthất bại，vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newItem.trim()
    if (!trimmed || items.includes(trimmed)) return
    setNewItem('')
    save([...items, trimmed])
  }

  function handleRemove(item: string) {
    if (items.length <= 1) { setError('至少保留一個tùy chọn'); return }
    save(items.filter(i => i !== item))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>

      {/* 現有tùy chọn */}
      <div className="space-y-1.5 mb-4">
        {items.map((item, idx) => (
          <div key={item} className="flex items-center gap-2 group">
            <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              {item}
              {idx === 0 && settingsKey === 'statuses' && (
                <span className="ml-2 text-[10px] text-blue-500 font-medium">預設</span>
              )}
            </span>
            <button
              onClick={() => handleRemove(item)}
              disabled={saving}
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
              title="Xóa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Thêm mới輸入 */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Thêm mớitùy chọn…"
          disabled={saving}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={saving || !newItem.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Thêm mới
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs text-green-600">已Lưu</p>}
    </div>
  )
}
