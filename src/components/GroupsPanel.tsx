'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Fuse from 'fuse.js'
import { EquipmentCard, UserGroup } from '@/types/equipment'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Star, ChevronDown, ChevronRight, Plus, Check, Pencil, Trash2, Search, Loader2, X, Folder, Lock } from 'lucide-react'

interface GroupsPanelProps {
  initialGroups: UserGroup[]
  allCards: EquipmentCard[]
  onCardClick: (card: EquipmentCard) => void
  onGroupsChange: (groups: UserGroup[]) => void
  activeStatus: string
  onDelete?: (card: EquipmentCard) => void
  filteredCards?: EquipmentCard[]
  bookmarkedIds?: Set<string>
  onToggleBookmark?: (card: EquipmentCard) => void
}

// ── 替換Thiết bị彈窗 ────────────────────────────────────────────────
interface ReplaceDialogProps {
  card: EquipmentCard
  groups: UserGroup[]
  allCards: EquipmentCard[]
  onConfirm: (newCard: EquipmentCard, targetGroupIds: string[]) => Promise<void>
  onCancel: () => void
}

function ReplaceDialog({ card, groups, allCards, onConfirm, onCancel }: ReplaceDialogProps) {
  const [searchQ, setSearchQ] = useState('')
  const [selected, setSelected] = useState<EquipmentCard | null>(null)
  const [targetGroups, setTargetGroups] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const g of groups) {
      if (g.group_items.some(i => i.equipment_id === card.equipment_id)) {
        s.add(g.id)
      }
    }
    return s
  })
  const [saving, setSaving] = useState(false)

  const fuse = useMemo(() => new Fuse(allCards, {
    keys: [
      { name: 'equipment_id', weight: 2 },
      { name: 'name', weight: 2 },
      { name: 'vendor', weight: 1 },
    ],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [allCards])

  const results = useMemo(() => {
    const q = searchQ.trim()
    if (!q) return allCards
    if (/^\d+$/.test(q)) {
      return allCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q))
    }
    return fuse.search(q).map(r => r.item)
  }, [searchQ, allCards, fuse])

  const containingGroups = groups.filter(g => g.group_items.some(i => i.equipment_id === card.equipment_id))

  function toggleGroup(id: string) {
    setTargetGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await onConfirm(selected, Array.from(targetGroups))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#5a3820]">替換「{card.name}」</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-[#a08060] mb-1.5 font-medium">Tìm kiếm新Thiết bị</p>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Mã thiết bị、Tên thiết bị…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a]"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto border border-[#e8ddd0] rounded-lg divide-y divide-[rgba(122,82,48,.08)]">
              {results.map(c => (
                <button
                  key={c.equipment_id}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                    selected?.equipment_id === c.equipment_id
                      ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230]'
                      : 'hover:bg-[rgba(122,82,48,.05)] text-[#4a3422]'
                  }`}
                >
                  {selected?.equipment_id === c.equipment_id
                    ? <Check className="h-3 w-3 flex-shrink-0 text-[#7a5230]" />
                    : <span className="h-3 w-3 flex-shrink-0" />
                  }
                  <span className="font-mono text-[10px] text-[#a08060] flex-shrink-0">{c.equipment_id}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {results.length === 0 && (
                <p className="text-xs text-[#a08060] px-3 py-4 text-center">找不到Thiết bị</p>
              )}
            </div>
          </div>

          {containingGroups.length > 0 && (
            <div>
              <p className="text-xs text-[#a08060] mb-1.5 font-medium">此Thiết bị同時存在於</p>
              <div className="space-y-1">
                {containingGroups.map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={targetGroups.has(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="accent-[#7a5230]"
                    />
                    <span className="text-xs text-[#4a3422]">
                      {g.is_default && <Star className="inline h-3 w-3 text-amber-400 fill-amber-400 mr-0.5" />}
                      {g.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || saving || targetGroups.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            xác nhận替換
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thêm vàoThiết bị彈窗 ────────────────────────────────────────────────
interface AddCardDialogProps {
  group: UserGroup
  allCards: EquipmentCard[]
  onConfirm: (equipmentIds: string[]) => Promise<void>
  onCancel: () => void
}

function AddCardDialog({ group, allCards, onConfirm, onCancel }: AddCardDialogProps) {
  const [searchQ, setSearchQ] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const existingIds = useMemo(
    () => new Set(group.group_items.map(i => i.equipment_id)),
    [group.group_items]
  )

  const availableCards = useMemo(
    () => allCards.filter(c => !existingIds.has(c.equipment_id)),
    [allCards, existingIds]
  )

  const fuse = useMemo(() => new Fuse(availableCards, {
    keys: [
      { name: 'equipment_id', weight: 2 },
      { name: 'name', weight: 2 },
      { name: 'vendor', weight: 1 },
    ],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [availableCards])

  const results = useMemo(() => {
    const q = searchQ.trim()
    if (!q) return availableCards
    if (/^\d+$/.test(q)) {
      return availableCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q))
    }
    return fuse.search(q).map(r => r.item)
  }, [searchQ, availableCards, fuse])

  function toggleCard(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  async function handleConfirm() {
    if (selectedIds.size === 0) return
    setSaving(true)
    try {
      await onConfirm(Array.from(selectedIds))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between flex-shrink-0">
          <p className="text-sm font-semibold text-[#5a3820]">Thêm vàoThiết bị到「{group.name}」</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
            <input
              autoFocus
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Mã thiết bị、Tên thiết bị、Nhà cung cấp…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a]"
            />
          </div>
          {selectedIds.size > 0 && (
            <p className="text-xs text-[#7a5230] mt-1.5 font-medium">Đã chọn {selectedIds.size} ảnh</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          <div className="border border-[#e8ddd0] rounded-lg divide-y divide-[rgba(122,82,48,.08)]">
            {results.map(c => {
              const isSelected = selectedIds.has(c.equipment_id)
              return (
                <button
                  key={c.equipment_id}
                  onClick={() => toggleCard(c.equipment_id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                    isSelected
                      ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230]'
                      : 'hover:bg-[rgba(122,82,48,.04)] text-[#4a3422]'
                  }`}
                >
                  <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-[#7a5230] border-[#7a5230]' : 'border-[#d0b898]'
                  }`}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  <span className="font-mono text-[10px] text-[#a08060] flex-shrink-0 w-16">{c.equipment_id}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              )
            })}
            {results.length === 0 && (
              <p className="text-xs text-[#a08060] px-3 py-6 text-center">找不到可Thêm vào的Thiết bị</p>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[rgba(122,82,48,.1)] flex gap-2 justify-end flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Thêm vào {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主元件 ────────────────────────────────────────────────────────
export default function GroupsPanel({
  initialGroups,
  allCards,
  onCardClick,
  onGroupsChange,
  activeStatus,
  onDelete,
  filteredCards,
  bookmarkedIds,
  onToggleBookmark,
}: GroupsPanelProps) {
  const [groups, setGroups] = useState<UserGroup[]>(initialGroups)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    new Set(initialGroups.map(g => g.id)))

  // 同步外部 groups 變更（例如從Tất cả thiết bị的Thêm vàoNhóm popup Cập nhật）
  // 當 initialGroups 參考改變時才Cập nhật（即 PhotoWall setGroups 被呼叫時）
  useEffect(() => {
    setGroups(initialGroups)
  }, [initialGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  const [isLoading, setIsLoading] = useState(false)

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const newGroupInputRef = useRef<HTMLInputElement>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<UserGroup | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [replaceTarget, setReplaceTarget] = useState<{ card: EquipmentCard } | null>(null)
  const [addTarget, setAddTarget] = useState<{ groupId: string } | null>(null)

  // Tìm kiếmLọc Set：O(1) truy vấn用
  const filteredSet = useMemo(() =>
    filteredCards ? new Set(filteredCards.map(c => c.equipment_id)) : null,
  [filteredCards])

  // 只在沒有初始dữ liệu時才 fetch（觸發懶遷移）；有dữ liệu直接用 prop
  useEffect(() => {
    if (initialGroups.length > 0) {
      setGroups(initialGroups)
      setExpandedIds(new Set(initialGroups.map(g => g.id)))
      return
    }
    setIsLoading(true)
    fetch('/api/groups')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setGroups(data)
          setExpandedIds(new Set((data as UserGroup[]).map(g => g.id)))
          onGroupsChange(data)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (addingGroup && newGroupInputRef.current) {
      newGroupInputRef.current.focus()
    }
  }, [addingGroup])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function applyGroups(next: UserGroup[]) {
    setGroups(next)
    onGroupsChange(next)
  }

  async function handleAddGroup() {
    const name = newGroupName.trim()
    if (!name) { setAddingGroup(false); return }

    // Optimistic: 立即關閉輸入框並Hiển thịNhóm
    setAddingGroup(false)
    setNewGroupName('')
    const tempId = `temp-${Date.now()}`
    const tempGroup: UserGroup = { id: tempId, name, is_default: false, sort_order: 999, created_at: new Date().toISOString(), group_items: [] }
    const defaultIdx = groups.findIndex(g => g.is_default)
    const insertIdx = defaultIdx >= 0 ? defaultIdx + 1 : groups.length
    const withTemp = [...groups]
    withTemp.splice(insertIdx, 0, tempGroup)
    applyGroups(withTemp)
    setExpandedIds(prev => { const next = new Set(prev); next.add(tempId); return next })

    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const newGroup: UserGroup = await res.json()
      applyGroups(withTemp.map(g => g.id === tempId ? newGroup : g))
      setExpandedIds(prev => { const next = new Set(prev); next.delete(tempId); next.add(newGroup.id); return next })
    } else {
      applyGroups(withTemp.filter(g => g.id !== tempId))
      setExpandedIds(prev => { const next = new Set(prev); next.delete(tempId); return next })
    }
  }

  function askDelete(group: UserGroup) {
    setConfirmTarget(group)
    setConfirmOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!confirmTarget) return
    setConfirmOpen(false)
    const res = await fetch(`/api/groups/${confirmTarget.id}`, { method: 'DELETE' })
    if (res.ok) {
      applyGroups(groups.filter(g => g.id !== confirmTarget.id))
    }
    setConfirmTarget(null)
  }

  function startRename(group: UserGroup) {
    setRenamingId(group.id)
    setRenameValue(group.name)
  }

  async function handleRenameSubmit(groupId: string) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    applyGroups(groups.map(g => g.id === groupId ? { ...g, name } : g))
    await fetch(`/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  const handleReplace = useCallback(async (
    oldCard: EquipmentCard,
    newCard: EquipmentCard,
    targetGroupIds: string[]
  ) => {
    const res = await fetch('/api/groups/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_equipment_id: oldCard.equipment_id,
        new_equipment_id: newCard.equipment_id,
        group_ids: targetGroupIds,
      }),
    })
    if (res.ok) {
      const now = new Date().toISOString()
      applyGroups(groups.map(g => {
        if (!targetGroupIds.includes(g.id)) return g
        const items = g.group_items.filter(i => i.equipment_id !== oldCard.equipment_id)
        if (!items.some(i => i.equipment_id === newCard.equipment_id)) {
          items.unshift({ equipment_id: newCard.equipment_id, added_at: now })
        }
        return { ...g, group_items: items }
      }))
    }
    setReplaceTarget(null)
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRemoveCard(card: EquipmentCard, groupId: string) {
    // 樂觀Cập nhật：立即從 UI 移除，不等 API phản hồi
    applyGroups(groups.map(g =>
      g.id !== groupId ? g : { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
    ))
    await fetch(`/api/groups/${groupId}/items/${card.equipment_id}`, { method: 'DELETE' })
  }

  const handleAddCards = useCallback(async (groupId: string, equipmentIds: string[]) => {
    const now = new Date().toISOString()
    const results = await Promise.allSettled(
      equipmentIds.map(id =>
        fetch(`/api/groups/${groupId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ equipment_id: id }),
        })
      )
    )
    const successIds = equipmentIds.filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value.ok
    })
    if (successIds.length > 0) {
      applyGroups(groups.map(g => {
        if (g.id !== groupId) return g
        const newItems = successIds
          .filter(id => !g.group_items.some(i => i.equipment_id === id))
          .map(id => ({ equipment_id: id, added_at: now }))
        return { ...g, group_items: [...newItems, ...g.group_items] }
      }))
    }
    setAddTarget(null)
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  const addTargetGroup = addTarget ? groups.find(g => g.id === addTarget.groupId) : null

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-[#a08060]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Đang tải...</span>
          </div>
        ) : (
          <div>
            {/* 頂端工具列：Thêm mớiNhóm + 私人說明 */}
            <div className="flex items-center justify-between pb-3 mb-1 border-b border-[rgba(122,82,48,.1)]">
              {addingGroup ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    ref={newGroupInputRef}
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddGroup()
                      if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                    }}
                    placeholder="Nhómtên…"
                    className="flex-1 text-sm border border-[#c49a72] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a]"
                  />
                  <button
                    onClick={handleAddGroup}
                    className="flex items-center justify-center w-8 h-8 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setAddingGroup(false); setNewGroupName('') }}
                    className="flex items-center justify-center w-8 h-8 border border-[#e8ddd0] text-[#a08060] rounded-lg hover:text-[#7a5230] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingGroup(true)}
                  className="flex items-center gap-1.5 text-sm text-[#a08060] hover:text-[#7a5230] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mớiNhóm
                </button>
              )}
              <span className="flex items-center gap-1 text-xs text-[#c0a882] ml-4 flex-shrink-0">
                <Lock className="h-3 w-3" />
                僅你可見
              </span>
            </div>

            {/* Nhóm列表 */}
            <div className="divide-y divide-[rgba(122,82,48,.08)]">
              {groups.map(group => {
                const isExpanded = expandedIds.has(group.id)
                const itemCount = group.group_items.length

                const groupCards = group.group_items
                  .map(item => allCards.find(c => c.equipment_id === item.equipment_id))
                const validCards = groupCards.filter(Boolean) as EquipmentCard[]
                const displayCards = filteredSet
                  ? validCards.filter(c => filteredSet.has(c.equipment_id))
                  : validCards

                return (
                  <div key={group.id} className="py-2">
                    {/* NhómTiêu đề列 */}
                    <div className="relative flex items-center group/header">
                      {renamingId === group.id ? (
                        /* 重命名模式：flat div，不巢狀在 button 內，有 ✓ / ✗ 按鈕 */
                        <div className="flex items-center gap-1.5 w-full min-w-0 py-1">
                          {group.is_default
                            ? <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                            : <Folder className="h-4 w-4 text-[#c49a72] flex-shrink-0" />
                          }
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameSubmit(group.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => handleRenameSubmit(group.id)}
                            className="flex-1 min-w-0 text-sm font-medium text-[#5a3820] bg-white border border-[#c49a72] rounded px-2 py-0.5 focus:outline-none"
                          />
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleRenameSubmit(group.id)}
                            className="p-1 text-[#7a5230] hover:bg-[rgba(122,82,48,.1)] rounded flex-shrink-0 transition-colors"
                            title="xác nhận"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => setRenamingId(null)}
                            className="p-1 text-[#a08060] hover:bg-[rgba(122,82,48,.06)] rounded flex-shrink-0 transition-colors"
                            title="Hủy"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        /* 一般模式：點擊展開/收合 */
                        <button
                          onClick={() => toggleExpand(group.id)}
                          className="flex items-center gap-2 w-full min-w-0 text-left py-1"
                        >
                          {group.is_default
                            ? <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                            : <Folder className="h-4 w-4 text-[#c49a72] flex-shrink-0" />
                          }
                          <span className="text-sm font-semibold text-[#5a3820] truncate flex-1">{group.name}</span>
                          <span className="text-xs text-[#a08060] flex-shrink-0 mr-1">
                            {filteredSet && displayCards.length !== itemCount
                              ? `${displayCards.length} / ${itemCount} mục`
                              : `${itemCount} mục`
                            }
                          </span>
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                          }
                        </button>
                      )}

                      {/* Chỉnh sửa按鈕：重命名時隱藏，absolute 不佔計數空間 */}
                      {!group.is_default && renamingId !== group.id && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity bg-gradient-to-l from-[#faf6f0] from-50% pl-8">
                          <button
                            onClick={e => { e.stopPropagation(); setAddTarget({ groupId: group.id }) }}
                            className="p-1.5 text-[#a08060] hover:text-[#7a5230] transition-colors rounded"
                            title="Thêm vàoThiết bị"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); startRename(group) }}
                            className="p-1.5 text-[#a08060] hover:text-[#7a5230] transition-colors rounded"
                            title="重命名"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); askDelete(group) }}
                            className="p-1.5 text-[#a08060] hover:text-red-500 transition-colors rounded"
                            title="XóaNhóm"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 展開的大圖網格 */}
                    {isExpanded && (
                      itemCount === 0 ? (
                        <div className="pt-2 pb-1 flex items-center gap-3">
                          <p className="text-sm text-[#b0967a] italic">此Nhóm尚無Thiết bị</p>
                          <button
                            onClick={() => setAddTarget({ groupId: group.id })}
                            className="flex items-center gap-1 text-xs text-[#a08060] hover:text-[#7a5230] border border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] px-2 py-1 rounded-lg transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Thêm vàoThiết bị
                          </button>
                        </div>
                      ) : displayCards.length === 0 ? (
                        <p className="text-sm text-[#b0967a] italic pt-2 pb-1">Lọc後無符合結果</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pt-2">
                          {displayCards.map(card => (
                            <EquipmentCardItem
                              key={card.equipment_id}
                              card={card}
                              onClick={() => onCardClick(card)}
                              isAdmin={false}
                              onDelete={group.is_default ? (onDelete ? () => onDelete(card) : undefined) : undefined}
                              activeStatus={activeStatus}
                              isNew={card.is_new}
                              onReplace={!group.is_default ? () => setReplaceTarget({ card }) : undefined}
                              onRemoveFromGroup={!group.is_default ? () => handleRemoveCard(card, group.id) : undefined}
                              isBookmarked={group.is_default ? bookmarkedIds?.has(card.equipment_id) : undefined}
                              onToggleBookmark={group.is_default && onToggleBookmark ? () => onToggleBookmark(card) : undefined}
                            />
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Xóa「${confirmTarget?.name ?? ''}」Nhóm？`}
        message="Nhóm內的Thiết bị不會被Xóa，只是移除Nhóm本身。"
        confirmLabel="Xóa"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setConfirmOpen(false); setConfirmTarget(null) }}
      />


      {replaceTarget && (
        <ReplaceDialog
          card={replaceTarget.card}
          groups={groups}
          allCards={allCards}
          onConfirm={(newCard, targetGroupIds) =>
            handleReplace(replaceTarget.card, newCard, targetGroupIds)
          }
          onCancel={() => setReplaceTarget(null)}
        />
      )}

      {addTarget && addTargetGroup && (
        <AddCardDialog
          group={addTargetGroup}
          allCards={allCards}
          onConfirm={(ids) => handleAddCards(addTarget.groupId, ids)}
          onCancel={() => setAddTarget(null)}
        />
      )}
    </>
  )
}
