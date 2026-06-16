'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Accessory } from '@/types/kho'
import { ACCESSORY_CATEGORIES } from '@/types/kho'

interface Props {
  initialAccessories: Accessory[]
  userEmail: string
}

export default function PhuKienList({ initialAccessories, userEmail }: Props) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')

  const filtered = useMemo(() => {
    return initialAccessories.filter(acc => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        acc.name.toLowerCase().includes(q) ||
        (acc.code ?? '').toLowerCase().includes(q) ||
        (acc.vendor ?? '').toLowerCase().includes(q)
      const matchCat = !filterCategory || acc.category === filterCategory
      const matchActive =
        filterActive === 'all' ||
        (filterActive === 'active' && acc.is_active) ||
        (filterActive === 'inactive' && !acc.is_active)
      return matchSearch && matchCat && matchActive
    })
  }, [initialAccessories, search, filterCategory, filterActive])

  // Nhóm theo category
  const grouped = useMemo(() => {
    const map: Record<string, Accessory[]> = {}
    filtered.forEach(acc => {
      const cat = acc.category ?? 'Khác'
      if (!map[cat]) map[cat] = []
      map[cat].push(acc)
    })
    return map
  }, [filtered])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/kho" className="text-gray-400 hover:text-gray-600 transition">← Kho</Link>
            <h1 className="text-xl font-bold text-gray-900">🔧 Quản lý Phụ kiện</h1>
          </div>
          <span className="text-sm text-gray-400">{userEmail}</span>
        </div>
      </header>

      {/* Bộ lọc */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="🔍 Tìm tên, mã, nhà cung cấp..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả loại</option>
            {ACCESSORY_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Đang dùng</option>
            <option value="inactive">Ngừng dùng</option>
            <option value="all">Tất cả</option>
          </select>
          <span className="text-sm text-gray-400">{filtered.length} phụ kiện</span>
        </div>
      </div>

      {/* Danh sách */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {category} ({items.length})
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Mã</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Tên phụ kiện</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Nhà cung cấp</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Đơn vị</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((acc, i) => (
                      <tr
                        key={acc.id}
                        className={`border-b border-gray-100 last:border-0 ${
                          !acc.is_active ? 'opacity-50' : ''
                        } ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{acc.code ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{acc.name}</td>
                        <td className="px-4 py-3 text-gray-500">{acc.vendor ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{acc.unit}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{acc.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              Không tìm thấy phụ kiện nào
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
