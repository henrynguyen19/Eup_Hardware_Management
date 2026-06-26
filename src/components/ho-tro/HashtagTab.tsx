'use client'

import { useState, useEffect, useCallback } from 'react'

interface HashtagDef {
  id: number; tag: string; meaning: string; category: string
  description: string; example: string; sort_order: number; count?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  device:   '🔧 Thiết bị',
  error:    '❌ Lỗi',
  time:     '⏱️ Thời gian',
  update:   '🔄 Cập nhật',
  software: '💻 Phần mềm',
  other:    '📌 Khác',
}
const CATEGORY_COLORS: Record<string, string> = {
  device:   'bg-blue-100 text-blue-700 border-blue-200',
  error:    'bg-red-100 text-red-700 border-red-200',
  time:     'bg-green-100 text-green-700 border-green-200',
  update:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  software: 'bg-purple-100 text-purple-700 border-purple-200',
  other:    'bg-gray-100 text-gray-600 border-gray-200',
}

interface Props {
  isAdmin: boolean
  onFilterByHashtag?: (tag: string) => void
}

export default function HashtagTab({ isAdmin, onFilterByHashtag }: Props) {
  const [hashtags, setHashtags] = useState<HashtagDef[]>([])
  const [stats, setStats]       = useState<Record<string, number>>({})
  const [loading, setLoading]   = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [filterCat, setFilterCat]       = useState('')
  const [search, setSearch]             = useState('')
  const [editingId, setEditingId]       = useState<number | null>(null)
  const [showAddForm, setShowAddForm]   = useState(false)
  const [form, setForm]                 = useState({ tag: '', meaning: '', category: 'other', description: '', example: '' })
  const [saving, setSaving]             = useState(false)
  const [msg, setMsg]                   = useState<string | null>(null)

  const fetchHashtags = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/crm/hashtags')
      const json = await res.json()
      setHashtags(json.hashtags ?? [])
    } finally { setLoading(false) }
  }, [])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res  = await fetch('/api/crm/hashtag-stats')
      const json = await res.json()
      const map: Record<string, number> = {}
      for (const s of (json.stats ?? [])) map[s.tag] = s.count
      setStats(map)
    } finally { setStatsLoading(false) }
  }, [])

  useEffect(() => { fetchHashtags(); fetchStats() }, [fetchHashtags, fetchStats])

  const categories = Array.from(new Set(hashtags.map(h => h.category)))

  const filtered = hashtags.filter(h => {
    if (filterCat && h.category !== filterCat) return false
    if (search && !h.tag.toLowerCase().includes(search.toLowerCase()) && !h.meaning.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group by category
  const grouped: Record<string, HashtagDef[]> = {}
  for (const h of filtered) {
    if (!grouped[h.category]) grouped[h.category] = []
    grouped[h.category].push(h)
  }

  async function handleSave() {
    if (!form.tag || !form.meaning) { setMsg('❌ Cần điền Tag và Ý nghĩa'); return }
    setSaving(true)
    try {
      const url    = editingId ? `/api/crm/hashtags/${editingId}` : '/api/crm/hashtags'
      const method = editingId ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const json   = await res.json()
      if (!res.ok) { setMsg(`❌ ${json.error}`); return }
      setMsg('✅ Đã lưu')
      setShowAddForm(false); setEditingId(null)
      setForm({ tag: '', meaning: '', category: 'other', description: '', example: '' })
      fetchHashtags()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: number, tag: string) {
    if (!confirm(`Xóa hashtag "${tag}"?`)) return
    const res = await fetch(`/api/crm/hashtags/${id}`, { method: 'DELETE' })
    if (res.ok) { setMsg('✅ Đã xóa'); fetchHashtags() }
  }

  function startEdit(h: HashtagDef) {
    setEditingId(h.id)
    setForm({ tag: h.tag, meaning: h.meaning, category: h.category, description: h.description ?? '', example: h.example ?? '' })
    setShowAddForm(true)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-800">🏷️ Danh sách Hashtag</h2>
        <button onClick={() => fetchStats()} disabled={statsLoading}
          className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition disabled:opacity-40">
          {statsLoading ? '⏳' : '🔄'} Tính lại số lượng
        </button>
        {isAdmin && (
          <button onClick={() => { setShowAddForm(true); setEditingId(null); setForm({ tag:'',meaning:'',category:'other',description:'',example:'' }) }}
            className="text-xs px-2.5 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition ml-auto">
            + Thêm hashtag
          </button>
        )}
        {msg && <span className="text-xs text-gray-500 ml-2">{msg}</span>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text" placeholder="Tìm hashtag..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterCat('')}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${!filterCat ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Tất cả
          </button>
          {categories.map(c => (
            <button key={c} onClick={() => setFilterCat(c === filterCat ? '' : c)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${filterCat === c ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && isAdmin && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-teal-800 mb-3">{editingId ? 'Chỉnh sửa' : 'Thêm hashtag mới'}</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tag *</label>
              <input value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                placeholder="#go168" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ý nghĩa *</label>
              <input value={form.meaning} onChange={e => setForm(f => ({ ...f, meaning: e.target.value }))}
                placeholder="Lỗi Go168" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Phân loại</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Mô tả</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả thêm..." className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-40">
              {saving ? '⏳' : '💾'} Lưu
            </button>
            <button onClick={() => { setShowAddForm(false); setEditingId(null) }}
              className="text-sm px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Hashtag table grouped by category */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{CATEGORY_LABELS[cat] ?? cat}</span>
                <span className="text-xs text-gray-400">{items.length} tag</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left px-4 py-2 w-28">Hashtag</th>
                    <th className="text-left px-4 py-2">Ý nghĩa</th>
                    <th className="text-left px-4 py-2 hidden md:table-cell">Mô tả</th>
                    <th className="text-right px-4 py-2 w-24">Số ticket</th>
                    {isAdmin && <th className="px-4 py-2 w-20"/>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(h => (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onFilterByHashtag?.(h.tag)}
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded border cursor-pointer hover:opacity-80 transition ${CATEGORY_COLORS[h.category] ?? CATEGORY_COLORS.other}`}
                            title={`Lọc ticket có ${h.tag}`}
                          >
                            {h.tag}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{h.meaning}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs hidden md:table-cell">{h.description}</td>
                      <td className="px-4 py-2.5 text-right">
                        {statsLoading ? (
                          <span className="text-gray-300 text-xs">...</span>
                        ) : (stats[h.tag] ?? 0) > 0 ? (
                          <button
                            onClick={() => onFilterByHashtag?.(h.tag)}
                            className="text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline transition"
                          >
                            {(stats[h.tag] ?? 0).toLocaleString()}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">0</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => startEdit(h)}
                              className="text-xs px-2 py-1 text-blue-500 hover:bg-blue-50 rounded transition">✏️</button>
                            <button onClick={() => handleDelete(h.id, h.tag)}
                              className="text-xs px-2 py-1 text-red-400 hover:bg-red-50 rounded transition">🗑️</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
