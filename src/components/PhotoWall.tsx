'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Fuse from 'fuse.js'
import { EquipmentCard, AppSettings, UserGroup } from '@/types/equipment'
import { Input } from '@/components/ui/input'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import CardDetailDialog from '@/components/CardDetailDialog'
import CardFormDialog from '@/components/CardFormDialog'
import UserMenu from '@/components/UserMenu'
import BatchImportDialog from '@/components/BatchImportDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import GroupsPanel from '@/components/GroupsPanel'
import { Search, X, ArrowUp, ArrowDown, Plus, Trash2, Loader2, CheckSquare, FileUp, Users, ChevronDown, SlidersHorizontal, AlertTriangle, Star, Folder, Check, ClipboardList } from 'lucide-react'
import TrackerClient from '@/app/tracker/TrackerClient'
import type { Issue } from '@/app/tracker/page'

interface TrackerData {
  initialIssues: Issue[]
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
}

interface Props {
  initialCards: EquipmentCard[]
  isAdmin: boolean
  settings: AppSettings
  userEmail: string
  initialGroups?: UserGroup[]
  initialBookmarkNotes?: Record<string, string>
  permissions?: string[]
  userRole?: string
  trackerData?: TrackerData
}

const SORT_OPTIONS = [
  { value: 'id',   label: 'Sắp theo mã' },
  { value: 'name', label: 'Sắp theo tên' },
  { value: 'date', label: 'Ngày thêm' },
]

export default function PhotoWall({ initialCards, isAdmin, settings, userEmail, initialGroups, initialBookmarkNotes, permissions = [], userRole, trackerData }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const canManage   = permissions.includes('manage_users')
  const canEditCard = permissions.includes('create_delete_cards') || permissions.some(p => p.startsWith('edit_card_'))

  const activeStatus = settings.statuses[0] ?? 'Hiện hành'

  const [query,        setQuery]        = useState(() => searchParams.get('q')      ?? '')
  const [selectedCats, setSelectedCats] = useState<Set<string>>(() => {
    const cat = searchParams.get('cat')
    return cat ? new Set(cat.split(',').filter(Boolean)) : new Set()
  })
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => {
    const s = searchParams.get('status')
    return s ? new Set(s.split(',').filter(Boolean)) : new Set()
  })
  const [sortBy,   setSortBy]   = useState(() => searchParams.get('sort')   ?? 'id')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>(() => (searchParams.get('dir') ?? 'asc') as 'asc' | 'desc')
  const [isNewFilter, setIsNewFilter] = useState(() => searchParams.get('new') === '1')
  const [noPhotoFilter, setNoPhotoFilter] = useState(false)
  const [selected, setSelected] = useState<EquipmentCard | null>(null)

  const [formMode,    setFormMode]    = useState<'create' | 'edit'>('create')
  const [formOpen,    setFormOpen]    = useState(false)
  const [editingCard, setEditingCard] = useState<EquipmentCard | undefined>(undefined)

  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string; message?: string; detail?: string; onConfirm: () => void
  }>({ title: '', onConfirm: () => {} })

  // Nhóm state
  const [groups, setGroups] = useState<UserGroup[]>(initialGroups ?? [])
  const [activeTab, setActiveTab] = useState<'all' | 'bookmarks' | 'tracker'>('all')
  // Lần đầu chuyển sang「Theo dõi」mới mount GroupsPanel，sau đó giữ nguyên（CSS hide/show）
  const [groupsMounted, setGroupsMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'bookmarks') setGroupsMounted(true)
  }, [activeTab])
  // Lần đầu chuyển sang「Nhiệm vụ」mới mount TrackerClient，sau đó giữ nguyên（CSS hide/show）giữ state
  const [trackerMounted, setTrackerMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'tracker') setTrackerMounted(true)
  }, [activeTab])
  // Nếu quyền use_bookmarks bị xóa, quay vềTất cả thiết bị
  useEffect(() => {
    if (activeTab === 'bookmarks' && !permissions.includes('use_bookmarks')) {
      setActiveTab('all')
    }
  }, [permissions, activeTab])

  // Nếu quyền filter_all_statuses bị xóa, xóaTrạng tháiLọc
  useEffect(() => {
    if (!permissions.includes('filter_all_statuses') && selectedStatuses.size > 0) {
      setSelectedStatuses(new Set())
    }
  }, [permissions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Thêm vàoNhóm popup
  const [addToGroupPopup, setAddToGroupPopup] = useState<{ card: EquipmentCard; rect: DOMRect } | null>(null)
  const addToGroupPopupRef = useRef<HTMLDivElement>(null)
  const [popupPendingIds, setPopupPendingIds] = useState<Set<string>>(new Set())

  // 個人Ghi chú state（chỉ bản thân xem được, lưu tại user_bookmarks.notes）
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>(initialBookmarkNotes ?? {})
  const bookmarkSaveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Đếm nhiệm vụ chờ xử lý（tính theo vấn đề được giao chưa hoàn thành）
  const [trackerPendingCount, setTrackerPendingCount] = useState(() =>
    trackerData
      ? trackerData.initialIssues.filter(
          (i) => i.status !== 'Hoàn thành' && i.assignee_emails.includes(userEmail),
        ).length
      : 0,
  )

  // Tính toán bookmark IDs của defaultGroup
  const defaultGroup = groups.find(g => g.is_default)
  const bookmarkedIds = useMemo(() =>
    new Set(defaultGroup?.group_items.map(i => i.equipment_id) ?? []),
  [defaultGroup])

  // Không phải mặc địnhNhóm（用於Thêm vàoNhóm popup）
  const nonDefaultGroups = useMemo(() => groups.filter(g => !g.is_default), [groups])

  function askConfirm(cfg: typeof confirmConfig) {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  useEffect(() => {
    if (!sortOpen) return
    const close = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [sortOpen])

  useEffect(() => {
    const params = new URLSearchParams()
    if (query)                params.set('q',      query)
    if (selectedCats.size > 0)     params.set('cat',    Array.from(selectedCats).join(','))
    if (selectedStatuses.size > 0) params.set('status', Array.from(selectedStatuses).join(','))
    if (sortBy   !== 'id')         params.set('sort',   sortBy)
    if (sortDir  !== 'asc')        params.set('dir',    sortDir)
    if (isNewFilter)               params.set('new',    '1')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [query, selectedCats, selectedStatuses, sortBy, sortDir, isNewFilter, router])

  const fuse = useMemo(() => new Fuse(initialCards, {
    keys: [
      { name: 'equipment_id',   weight: 2 },
      { name: 'name',           weight: 2 },
      { name: 'vendor',         weight: 1 },
      { name: 'tags',           weight: 1 },
      { name: 'notes',          weight: 0.5 },
      { name: 'category',          weight: 0.5 },
      { name: 'documents.name', weight: 0.5 },
    ],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 2,
  }), [initialCards])

  const filtered = useMemo(() => {
    const q = query.trim()
    let result: EquipmentCard[]
    if (!q) {
      result = [...initialCards]
    } else if (/^\d+$/.test(q)) {
      // Truy vấn số thuần: dùng so khớp chính xác
      result = initialCards.filter(c =>
        c.equipment_id.includes(q) ||
        c.name.includes(q)
      )
    } else {
      result = fuse.search(q).map(r => r.item)
    }

    if (selectedCats.size > 0)     result = result.filter(c => selectedCats.has(c.category ?? ''))
    if (selectedStatuses.size > 0) result = result.filter(c => selectedStatuses.has(c.status ?? ''))
    if (isNewFilter)               result = result.filter(c => c.is_new)
    if (noPhotoFilter)             result = result.filter(c => !c.main_photo)

    if (!q) {
      result.sort((a, b) => {
        let cmp = 0
        if (sortBy === 'name') {
          cmp = a.name.localeCompare(b.name, 'zh-TW')
        } else if (sortBy === 'date') {
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        } else {
          cmp = a.equipment_id.localeCompare(b.equipment_id)
        }
        return sortDir === 'desc' ? -cmp : cmp
      })
    }
    return result
  }, [initialCards, query, selectedCats, selectedStatuses, sortBy, sortDir, isNewFilter, noPhotoFilter, fuse])

  const hasActiveFilters = !!(query || selectedCats.size > 0 || selectedStatuses.size > 0 || isNewFilter || noPhotoFilter)

  function toggleCat(cat: string) {
    if (cat === 'Tất cả') { setSelectedCats(new Set()); return }
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function toggleStatus(s: string) {
    if (s === 'all') { setSelectedStatuses(new Set()); return }
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  // toggleDefaultGroup：Optimistic Update thao tác bookmark nhóm mặc định
  const toggleDefaultGroup = useCallback(async (card: EquipmentCard) => {
    const dg = groups.find(g => g.is_default)
    if (!dg) {
      // Nếu chưa có defaultGroup, lấy từ API（sẽ trigger lazy migration）
      const res = await fetch('/api/groups')
      if (res.ok) {
        const fresh = await res.json()
        setGroups(fresh)
      }
      return
    }

    const isBookmarked = dg.group_items.some(i => i.equipment_id === card.equipment_id)

    if (isBookmarked) {
      // Optimistic remove
      setGroups(prev => prev.map(g =>
        g.id === dg.id
          ? { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
          : g
      ))
      const res = await fetch(`/api/groups/${dg.id}/items/${card.equipment_id}`, { method: 'DELETE' })
      if (!res.ok) {
        // Rollback
        setGroups(prev => prev.map(g =>
          g.id === dg.id
            ? { ...g, group_items: [...g.group_items, { equipment_id: card.equipment_id, added_at: new Date().toISOString() }] }
            : g
        ))
      }
    } else {
      // Optimistic add
      const tempItem = { equipment_id: card.equipment_id, added_at: new Date().toISOString() }
      setGroups(prev => prev.map(g =>
        g.id === dg.id
          ? { ...g, group_items: [tempItem, ...g.group_items] }
          : g
      ))
      const res = await fetch(`/api/groups/${dg.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: card.equipment_id }),
      })
      if (!res.ok) {
        // Rollback
        setGroups(prev => prev.map(g =>
          g.id === dg.id
            ? { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
            : g
        ))
      }
    }
  }, [groups])

  useEffect(() => {
    if (!addToGroupPopup) return
    const close = (e: MouseEvent) => {
      if (addToGroupPopupRef.current && !addToGroupPopupRef.current.contains(e.target as Node)) {
        setAddToGroupPopup(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [addToGroupPopup])

  const handleOpenAddToGroupPopup = useCallback((card: EquipmentCard, rect: DOMRect) => {
    setAddToGroupPopup(prev => {
      if (prev?.card.equipment_id === card.equipment_id) return null
      return { card, rect }
    })
    setPopupPendingIds(
      new Set(nonDefaultGroups
        .filter(g => g.group_items.some(i => i.equipment_id === card.equipment_id))
        .map(g => g.id))
    )
  }, [nonDefaultGroups])

  const handleConfirmAddToGroups = useCallback(async () => {
    if (!addToGroupPopup) return
    const { card } = addToGroupPopup
    const currentIds = new Set(
      nonDefaultGroups
        .filter(g => g.group_items.some(i => i.equipment_id === card.equipment_id))
        .map(g => g.id)
    )
    const toAdd = Array.from(popupPendingIds).filter(id => !currentIds.has(id))
    const toRemove = Array.from(currentIds).filter(id => !popupPendingIds.has(id))
    setAddToGroupPopup(null)
    if (toAdd.length === 0 && toRemove.length === 0) return
    const now = new Date().toISOString()
    setGroups(prev => prev.map(g => {
      if (toAdd.includes(g.id)) return { ...g, group_items: [{ equipment_id: card.equipment_id, added_at: now }, ...g.group_items] }
      if (toRemove.includes(g.id)) return { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
      return g
    }))
    await Promise.allSettled([
      ...toAdd.map(id => fetch(`/api/groups/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: card.equipment_id }),
      })),
      ...toRemove.map(id => fetch(`/api/groups/${id}/items/${card.equipment_id}`, { method: 'DELETE' })),
    ])
  }, [addToGroupPopup, nonDefaultGroups, popupPendingIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateBookmarkNotes = useCallback((card: EquipmentCard, notes: string) => {
    setBookmarkNotes(prev => ({ ...prev, [card.equipment_id]: notes }))
    if (bookmarkSaveTimerRef.current[card.equipment_id]) {
      clearTimeout(bookmarkSaveTimerRef.current[card.equipment_id])
    }
    bookmarkSaveTimerRef.current[card.equipment_id] = setTimeout(async () => {
      await fetch('/api/bookmarks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: card.equipment_id, notes }),
      })
    }, 800)
  }, [])

  const clearFilters = () => { setQuery(''); setSelectedCats(new Set()); setSelectedStatuses(new Set()); setSortBy('id'); setSortDir('asc'); setIsNewFilter(false); setNoPhotoFilter(false) }

  function openCreate() { setEditingCard(undefined); setFormMode('create'); setFormOpen(true) }
  function openEdit(card: EquipmentCard) { setEditingCard(card); setFormMode('edit'); setFormOpen(true) }

  const handleDelete = useCallback((card: EquipmentCard) => {
    askConfirm({
      title: `Xóa「${card.name}」？`,
      message: 'Thao tác này không thể hoàn tác，Ảnh Cloudinary cũng sẽ bị xóa。',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/cards/${card.equipment_id}`, { method: 'DELETE' })
          if (!res.ok) { alert('Xóa thất bại, vui lòng thử lại'); return }
          router.refresh()
        } catch {
          alert('Xóa thất bại, vui lòng thử lại')
        }
      },
    })
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(c => c.equipment_id)))
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleBatchDelete = useCallback(() => {
    const count = selectedIds.size
    const names = filtered
      .filter(c => selectedIds.has(c.equipment_id))
      .map(c => `${c.equipment_id} ${c.name}`)
      .join('\n')
    askConfirm({
      title: `Xác nhậnXóa ${count} mụcThiết bị？`,
      message: 'Thao tác này không thể hoàn tác.',
      detail: names,
      onConfirm: async () => {
        setBatchDeleting(true)
        try {
          const results = await Promise.allSettled(
            Array.from(selectedIds).map(id =>
              fetch(`/api/cards/${id}`, { method: 'DELETE' })
            )
          )
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
          if (failed > 0) alert(`${count - failed} mục xóa thành công，${failed} mục thất bại`)
          exitSelectMode()
          router.refresh()
        } catch {
          alert('Xóa thất bại, vui lòng thử lại')
        } finally {
          setBatchDeleting(false)
        }
      },
    })
  }, [selectedIds, filtered, router]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = ['Tất cả', ...settings.categories]
  const statusOptions = [
    { value: 'all', label: 'Tất cảTrạng thái' },
    ...settings.statuses.map(s => ({ value: s, label: s })),
  ]

  // 孤兒Danh mục：存在於Thiết bịdữ liệu，但不在cài đặt清單內
  const orphanCategories = useMemo(() => {
    const official = new Set(settings.categories)
    const found = new Set<string>()
    for (const c of initialCards) {
      if (c.category && !official.has(c.category)) found.add(c.category)
    }
    return Array.from(found).sort()
  }, [initialCards, settings.categories])

  // 孤兒Trạng thái：存在於Thiết bịdữ liệu，但不在cài đặt清單內
  const orphanStatuses = useMemo(() => {
    const official = new Set(settings.statuses)
    const found = new Set<string>()
    for (const c of initialCards) {
      if (c.status && !official.has(c.status)) found.add(c.status)
    }
    return Array.from(found).sort()
  }, [initialCards, settings.statuses])

  const mainPhotosCount = initialCards.filter(c => c.main_photo).length
  const detailPhotosCount = initialCards.reduce((sum, c) => sum + c.detail_photos.length, 0)

  return (
    <>
      {/* 單一凍結列：Tiêu đề列 + Tìm kiếm + Lọc */}
      <div className="sticky top-14 md:top-0 z-40 bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] shadow-sm">
        {/* Tiêu đề列 */}
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#7a5230]">Quản lý Hardware EUP</h1>
            <p className="text-sm text-[#a08060] mt-0.5 leading-snug">
              Tổng cộng {mainPhotosCount} ảnh chính<br />và {detailPhotosCount} ảnh chi tiết
            </p>
          </div>
          <div className="flex items-center gap-3">
            {canManage ? (
              <Link href="/admin/users" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <span className="badge-admin-pulse text-xs font-bold tracking-wider border border-[rgba(122,82,48,.35)] text-[#7a5230] bg-[rgba(122,82,48,.07)] px-2.5 py-0.5 rounded">
                  {userRole ?? 'Quản trị viên'}
                </span>
                <Users className="h-4 w-4 text-[#a08060]" />
                <span className="hidden sm:inline text-xs text-[#a08060]">Quản lý tài khoản</span>
              </Link>
            ) : userRole ? (
              <span className={`text-xs font-medium border px-2.5 py-0.5 rounded ${
                isAdmin
                  ? 'badge-admin-pulse font-bold tracking-wider border-[rgba(122,82,48,.35)] text-[#7a5230] bg-[rgba(122,82,48,.07)]'
                  : 'border-[rgba(122,82,48,.2)] text-[#a08060] bg-[rgba(122,82,48,.04)]'
              }`}>
                {userRole}
              </span>
            ) : null}
            {userEmail && <UserMenu email={userEmail} />}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-0 pb-2">
          {/* Tab 切換 */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                activeTab === 'all'
                  ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                  : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
              }`}
            >
              Tất cả thiết bị
            </button>
            {permissions.includes('use_bookmarks') && (
              <button
                onClick={() => setActiveTab('bookmarks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                  activeTab === 'bookmarks'
                    ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                    : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${activeTab === 'bookmarks' ? 'fill-white text-white' : bookmarkedIds.size > 0 ? 'fill-amber-400 text-amber-400' : ''}`} />
                Theo dõi
                {bookmarkedIds.size > 0 && (
                  <span className="text-xs">{bookmarkedIds.size}</span>
                )}
              </button>
            )}
            {permissions.includes('view_tracker') && (
              <button
                onClick={() => { setActiveTab('tracker'); router.refresh() }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                  activeTab === 'tracker'
                    ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                    : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Nhiệm vụ
                {trackerPendingCount > 0 && (
                  <span className="text-xs">{trackerPendingCount}</span>
                )}
              </button>
            )}
          </div>

          {/* Tìm kiếm列 + Lọc列 */}
          <div className={activeTab === 'tracker' ? 'hidden' : ''}>
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9 pr-9" placeholder="Tìm mã, tên thiết bị, nhà cung cấp, ghi chú..."
                value={query} onChange={e => setQuery(e.target.value)} />
              {query && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setQuery('')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* 手機Lọc切換按鈕 */}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`md:hidden relative flex items-center justify-center w-9 h-9 border rounded-md bg-white transition-colors focus:outline-none ${
                  showFilters || hasActiveFilters
                    ? 'border-[#c49a72] text-[#7a5230] glow-wood'
                    : 'border-[#e8ddd0] text-[#a08060] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                }`}
                title="Lọc"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              {/* 自訂sắp xếp下拉 */}
              <div ref={sortRef} className="relative">
                <button
                  onClick={() => setSortOpen(v => !v)}
                  className={`flex items-center gap-2 pl-3 pr-2.5 py-2 border rounded-md text-sm bg-white text-[#6b4f38] cursor-pointer transition-colors focus:outline-none whitespace-nowrap ${
                    sortOpen
                      ? 'border-[#c49a72] text-[#7a5230] glow-wood'
                      : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                  }`}
                >
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${sortOpen ? 'rotate-180' : ''}`} />
                </button>
                {sortOpen && (
                  <div className="absolute top-full mt-1 left-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-[8px] shadow-md overflow-hidden z-50 min-w-full">
                    {SORT_OPTIONS.map(o => (
                      <button key={o.value}
                        onClick={() => { setSortBy(o.value); setSortOpen(false) }}
                        className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                          sortBy === o.value
                            ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                            : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? 'Tăng dần (nhấn để đổi)' : 'Giảm dần (nhấn để đổi)'}
                className="flex items-center justify-center w-9 h-9 border border-[#e8ddd0] rounded-md bg-white text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors focus:outline-none"
              >
                {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Lọc列：桌面永遠Hiển thị，手機按按鈕展開 */}
          <div className={`${showFilters ? 'flex' : 'hidden'} md:flex gap-2 flex-wrap items-center pb-1`}>
            {categories.map(cat => {
              const isActive = cat === 'Tất cả' ? selectedCats.size === 0 : selectedCats.has(cat)
              return (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                    isActive
                      ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                      : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                  }`}>
                  {cat}
                </button>
              )
            })}
            {/* 孤兒Danh mục */}
            {orphanCategories.map(cat => {
              const isActive = selectedCats.has(cat)
              const count = initialCards.filter(c => c.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  title={`Danh mục này đã bị xóa khỏi danh sách, còn ${count} thiết bị đang dùng`}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all duration-200 ${
                    isActive
                      ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230] border-[#c49a72]'
                      : 'bg-transparent text-[#a08060] border-[rgba(122,82,48,.3)] hover:border-[rgba(122,82,48,.5)] hover:text-[#7a5230]'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  {cat}
                  <span className="opacity-70">({count})</span>
                </button>
              )
            })}
            {permissions.includes('filter_all_statuses') && (
              <>
                <span className="w-px h-5 bg-[#e8ddd0] mx-1" />
                {statusOptions.map(opt => {
                  const isActive = opt.value === 'all' ? selectedStatuses.size === 0 : selectedStatuses.has(opt.value)
                  return (
                    <button key={opt.value} onClick={() => toggleStatus(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                        isActive
                          ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                          : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                      }`}>
                      {opt.label}
                    </button>
                  )
                })}
                {/* 孤兒Trạng thái：已從清單移除但仍有Thiết bị使用 */}
                {orphanStatuses.length > 0 && (
                  <>
                    <span className="w-px h-5 bg-[rgba(122,82,48,.2)] mx-1" />
                    {orphanStatuses.map(s => {
                      const isActive = selectedStatuses.has(s)
                      const count = initialCards.filter(c => c.status === s).length
                      return (
                        <button
                          key={s}
                          onClick={() => toggleStatus(s)}
                          title={`Trạng thái này đã bị xóa khỏi danh sách, còn ${count} thiết bị đang dùng`}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all duration-200 ${
                            isActive
                              ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230] border-[#c49a72]'
                              : 'bg-transparent text-[#a08060] border-[rgba(122,82,48,.3)] hover:border-[rgba(122,82,48,.5)] hover:text-[#7a5230]'
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                          {s}
                          <span className="opacity-70">({count})</span>
                        </button>
                      )
                    })}
                  </>
                )}
              </>
            )}
            <span className="w-px h-5 bg-[#e8ddd0] mx-1" />
            <button onClick={() => setIsNewFilter(v => !v)}
              className={`badge-new-pulse px-3 py-1.5 rounded-full text-sm font-bold tracking-widest border transition-all duration-200 ${
                isNewFilter
                  ? 'bg-[#b5451b] text-white border-[#b5451b] shadow-[0_0_10px_rgba(181,69,27,.5),0_0_20px_rgba(181,69,27,.18)]'
                  : 'bg-white text-[#b5451b] border-[rgba(181,69,27,.35)] hover:border-[#b5451b] hover:shadow-[0_0_8px_rgba(181,69,27,.3)]'
              }`}>
              NEW
            </button>
            {permissions.includes('filter_no_photo') && (
              <button
                onClick={() => setNoPhotoFilter(v => !v)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                  noPhotoFilter
                    ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                    : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                }`}
              >
                Chưa có ảnh
              </button>
            )}
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-[#a08060] border border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.18)] transition-all duration-200">
                <X className="h-3 w-3" />
                Xóa bộ lọc
              </button>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* 主內容區：兩個 view 皆常駐 DOM，以 hidden 切換，避免重複 mount 的延遲 */}

      {/* Tất cả thiết bị網格 */}
      <div className={activeTab !== 'all' ? 'hidden' : ''}>
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
          {/* 結果số lượng */}
          <p className="text-sm text-[#a08060] mb-4">
            Hiển thị {filtered.length} / {initialCards.length} mục
            {query && <span className="ml-1.5 text-[#7a5230]">— Tìm kiếm「{query}」</span>}
          </p>

          {/* 網格 */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg">Không tìm thấy thiết bị phù hợp</p>
              <p className="text-sm mt-1">Thử thay đổi từ khóa hoặc điều kiện lọc</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="mt-3 text-[#7a5230] text-sm underline hover:text-[#9c6b42]">
                  Xóa tất cả bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filtered.map(card => (
                <EquipmentCardItem
                  key={card.equipment_id}
                  card={card}
                  onClick={() => setSelected(card)}
                  isAdmin={isAdmin}
                  onEdit={() => openEdit(card)}
                  onDelete={() => handleDelete(card)}
                  activeStatus={activeStatus}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(card.equipment_id)}
                  onSelect={() => toggleSelect(card.equipment_id)}
                  isNew={card.is_new}
                  isBookmarked={bookmarkedIds.has(card.equipment_id)}
                  onToggleBookmark={() => toggleDefaultGroup(card)}
                  onAddToGroup={nonDefaultGroups.length > 0 ? (rect) => handleOpenAddToGroupPopup(card, rect) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Theo dõi：首次切入mới mount，之後 CSS hide/show 不 unmount */}
      {groupsMounted && (
        <div className={activeTab !== 'bookmarks' ? 'hidden' : ''}>
          <GroupsPanel
            initialGroups={groups}
            allCards={initialCards}
            onCardClick={(card) => setSelected(card)}
            onGroupsChange={setGroups}
            activeStatus={activeStatus}
            onDelete={handleDelete}
            filteredCards={filtered}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={toggleDefaultGroup}
          />
        </div>
      )}

      {/* Nhiệm vụ：首次進入後保持常駐（CSS hide/show），避免切 tab 時 state 重置 */}
      {trackerMounted && trackerData && (
        <div className={activeTab !== 'tracker' ? 'hidden' : ''}>
          <TrackerClient
            initialIssues={trackerData.initialIssues}
            permissions={permissions}
            userEmail={userEmail}
            allowedEmails={trackerData.allowedEmails}
            issueTypes={trackerData.issueTypes}
            issueTags={trackerData.issueTags}
            onMyTasksCountChange={setTrackerPendingCount}
          />
        </div>
      )}

      {/* 細節 Dialog（在兩個 view 都可開啟） */}
      {selected && (
        <CardDetailDialog
          card={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          activeStatus={activeStatus}
          isAdmin={isAdmin}
          onEdit={canEditCard ? () => { openEdit(selected); setSelected(null) } : undefined}
          permissions={permissions}
          bookmarkNotes={activeTab === 'bookmarks' ? (bookmarkNotes[selected.equipment_id] ?? '') : undefined}
          onBookmarkNotesChange={activeTab === 'bookmarks' ? (notes) => updateBookmarkNotes(selected, notes) : undefined}
        />
      )}

      {/* Quản trị viên浮動按鈕區 */}
      {isAdmin && (
        <>
          {/* Chọn hàng loạt action bar：全寬固定底部 */}
          {selectMode && (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#faf6f0] border-t border-[rgba(122,82,48,.2)] shadow-[0_-4px_16px_rgba(122,82,48,.1)] px-4 py-3 flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-sm text-[#6b4f38] hover:text-[#7a5230] transition-colors whitespace-nowrap shrink-0"
              >
                {selectedIds.size === filtered.length
                  ? <CheckSquare className="h-4 w-4 text-[#7a5230]" />
                  : <CheckSquare className="h-4 w-4 opacity-50" />
                }
                <span className="hidden sm:inline">{selectedIds.size === filtered.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</span>
              </button>
              <span className="flex-1 text-sm font-semibold text-[#7a5230] text-center">
                Đã chọn {selectedIds.size} ảnh
              </span>
              <button
                onClick={exitSelectMode}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.25)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors shrink-0"
              >
                Hủy
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting || selectedIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#b5451b] hover:bg-[#9a3a16] text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
              >
                {batchDeleting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />
                }
                Xóa（{selectedIds.size}）
              </button>
            </div>
          )}

          {/* Chọn hàng loạt + Nhập hàng loạt + Thêm thiết bị */}
          <div className={`fixed ${selectMode ? 'bottom-20' : 'bottom-6'} right-4 sm:right-6 flex items-center gap-2 sm:gap-3 z-40 transition-all duration-200`}>
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title={selectMode ? 'Bỏ chọn' : 'Chọn hàng loạt'}
              className={`flex items-center gap-2 font-medium px-3 py-3 sm:px-4 rounded-full shadow-lg transition-all duration-200 focus:outline-none ${
                selectMode
                  ? 'bg-[#7a5230] hover:bg-[#9c6b42] text-white shadow-[0_0_10px_rgba(122,82,48,.45)]'
                  : 'bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] hover:shadow-[0_0_10px_rgba(122,82,48,.3)]'
              }`}
            >
              <CheckSquare className="h-5 w-5" />
              <span className="hidden sm:inline">{selectMode ? 'Bỏ chọn' : 'Chọn hàng loạt'}</span>
            </button>
            <button onClick={() => setImportOpen(true)}
              title="Nhập hàng loạt"
              className="flex items-center gap-2 bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] font-medium px-3 py-3 sm:px-4 rounded-full shadow-lg transition-all duration-200 focus:outline-none hover:shadow-[0_0_10px_rgba(122,82,48,.3)]">
              <FileUp className="h-5 w-5" />
              <span className="hidden sm:inline">Nhập hàng loạt</span>
            </button>
            <button onClick={openCreate}
              title="Thêm thiết bị"
              className="flex items-center gap-2 bg-[#7a5230] hover:bg-[#9c6b42] text-white font-medium px-3 py-3 sm:px-4 rounded-full shadow-lg transition-all duration-200 focus:outline-none shadow-[0_0_10px_rgba(122,82,48,.45)] hover:shadow-[0_0_16px_rgba(122,82,48,.6)]">
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Thêm thiết bị</span>
            </button>
          </div>

          <CardFormDialog
            mode={formMode}
            card={editingCard}
            open={formOpen}
            onClose={() => setFormOpen(false)}
            settings={settings}
            permissions={permissions}
          />
          <BatchImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            settings={settings}
          />
        </>
      )}

      {/* Thêm vàoNhóm popup（fixed，定位在按鈕上方） */}
      {addToGroupPopup && (
        <div
          ref={addToGroupPopupRef}
          style={{
            position: 'fixed',
            top: addToGroupPopup.rect.top - 6,
            left: addToGroupPopup.rect.left,
            zIndex: 9999,
            transform: 'translateY(-100%)',
          }}
          className="bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-xl shadow-xl overflow-hidden min-w-[11rem] max-w-[15rem]"
        >
          <div className="px-3 py-2 border-b border-[rgba(122,82,48,.08)]">
            <p className="text-[10px] font-semibold text-[#a08060] uppercase tracking-wider">Thêm vàoNhóm</p>
          </div>
          {nonDefaultGroups.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[#a08060]">Chưa có nhóm, vào tab Theo dõi để tạo</p>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto">
                {nonDefaultGroups.map(group => {
                  const isPending = popupPendingIds.has(group.id)
                  return (
                    <button
                      key={group.id}
                      onClick={() => setPopupPendingIds(prev => {
                        const next = new Set(prev)
                        if (next.has(group.id)) next.delete(group.id); else next.add(group.id)
                        return next
                      })}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors hover:bg-[rgba(122,82,48,.06)]"
                    >
                      <span className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                        isPending ? 'bg-[#7a5230] border-[#7a5230]' : 'border-[#d0b898]'
                      }`}>
                        {isPending && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-[#c49a72]" />
                      <span className="flex-1 truncate text-xs text-[#4a3422]">{group.name}</span>
                    </button>
                  )
                })}
              </div>
              <div className="px-3 py-2 border-t border-[rgba(122,82,48,.08)] flex gap-2 justify-end">
                <button
                  onClick={() => setAddToGroupPopup(null)}
                  className="px-2.5 py-1 text-xs text-[#a08060] hover:text-[#7a5230] transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmAddToGroups}
                  className="px-2.5 py-1 text-xs bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors"
                >
                  Xác nhận
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        detail={confirmConfig.detail}
        confirmLabel="Xóa"
        danger
        onConfirm={() => { setConfirmOpen(false); confirmConfig.onConfirm() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
