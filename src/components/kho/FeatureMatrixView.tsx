'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────
interface DeviceInfo  { equipment_id: string; name: string; status: string; device_type: string }
interface CellVal     { value: string; notes: string | null }
interface FeatureMeta { feature_key: string; group_label: string; sort_order: number }
interface GroupDef    { label: string; icon: string; color: string; sort_order: number }
interface MatrixData {
  devices: DeviceInfo[]
  featureKeys: string[]
  matrix: Record<string, Record<string, CellVal>>
  featureMeta: FeatureMeta[]
  groupDefs: GroupDef[]
}
interface Props { isAdmin: boolean }

// ── Color map ─────────────────────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; text: string; border: string; groupBg: string }> = {
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200',  groupBg: 'bg-amber-50'  },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200',   groupBg: 'bg-blue-50'   },
  orange: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', groupBg: 'bg-orange-50' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', groupBg: 'bg-purple-50' },
  teal:   { bg: 'bg-teal-50',   text: 'text-teal-800',   border: 'border-teal-200',   groupBg: 'bg-teal-50'   },
  green:  { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200',  groupBg: 'bg-green-50'  },
  gray:   { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200',   groupBg: 'bg-gray-50'   },
}
const COLOR_OPTIONS = ['amber', 'blue', 'orange', 'purple', 'teal', 'green', 'gray']
const colorStyle = (color: string) => COLOR_MAP[color] ?? COLOR_MAP.gray

function deviceHeaderStyle(deviceType: string) {
  const t = (deviceType ?? '').toLowerCase()
  if (t.includes('ai') || t.includes('adas'))    return 'bg-violet-600 text-white'
  if (t.includes('camera') || t.includes('dvr')) return 'bg-purple-600 text-white'
  return 'bg-blue-600 text-white'
}

// ── Cell renderer ─────────────────────────────────────────────
function CellDisplay({ value, notes }: { value: string; notes: string | null }) {
  const v = value.trim()
  const isCheck = v === 'check' || v === '✔' || ['co', 'yes', '1'].includes(v.toLowerCase())
  const isCross = v === 'Khong' || v === '✘' || ['khong', 'no', '0', ''].includes(v.toLowerCase())

  if (isCheck) return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">✔</span>
      {notes && <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[80px] break-words">{notes}</span>}
    </span>
  )
  if (isCross) return <span className="text-gray-300 text-base">&mdash;</span>
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium text-center max-w-[80px] break-words">{v}</span>
      {notes && <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[80px] break-words">{notes}</span>}
    </span>
  )
}

// ── Cell Edit Popup ────────────────────────────────────────────
interface CellEditState {
  equipmentId: string
  featureKey: string
  value: string
  notes: string
  anchorRect: DOMRect
}

function CellEditPopup({
  state, onClose, onSave,
}: {
  state: CellEditState
  onClose: () => void
  onSave: (equipmentId: string, featureKey: string, value: string, notes: string) => Promise<void>
}) {
  const [valueType, setValueType] = useState<'check' | 'cross' | 'text'>(() => {
    const v = state.value.trim()
    if (v === 'check' || v === '✔' || ['co', 'yes', '1'].includes(v.toLowerCase())) return 'check'
    if (v === 'Khong' || ['khong', 'no', '0', ''].includes(v.toLowerCase())) return 'cross'
    return 'text'
  })
  const [textVal, setTextVal] = useState(() => {
    const v = state.value.trim()
    const isSpecial = ['check', '✔', 'Khong', '✘', 'co', 'yes', '1', 'khong', 'no', '0', ''].includes(v.toLowerCase())
    return isSpecial ? '' : v
  })
  const [notes, setNotes] = useState(state.notes)
  const [saving, setSaving] = useState(false)

  const top  = Math.min(state.anchorRect.bottom + 4, window.innerHeight - 260)
  const left = Math.min(state.anchorRect.left, window.innerWidth - 280)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    const val = valueType === 'check' ? 'check' : valueType === 'cross' ? 'Khong' : textVal.trim() || 'Khong'
    await onSave(state.equipmentId, state.featureKey, val, notes)
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64" style={{ top, left }}>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 truncate">{state.featureKey}</p>
        <div className="flex gap-1.5 mb-3">
          {(['check','cross','text'] as const).map(t => (
            <button key={t} onClick={() => setValueType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${
                valueType === t
                  ? t === 'check' ? 'bg-green-100 border-green-400 text-green-700'
                  : t === 'cross' ? 'bg-gray-200 border-gray-400 text-gray-700'
                  : 'bg-blue-100 border-blue-400 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >{t === 'check' ? '✔ Co' : t === 'cross' ? '— Khong' : '📝 Text'}</button>
          ))}
        </div>
        {valueType === 'text' && (
          <input autoFocus value={textVal} onChange={e => setTextVal(e.target.value)}
            placeholder="Vi du: Soji, DVR88..."
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 mb-3"
          />
        )}
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Chu thich (hien duoi gia tri)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="Vi du: Can them cap ket noi..."
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-3"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huy</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
            style={{ background: '#A70A0A' }}
          >{saving ? '...' : 'Luu'}</button>
        </div>
      </div>
    </>
  )
}

// ── Add Feature Modal ─────────────────────────────────────────
function AddFeatureModal({ groups, defaultGroup, onClose, onAdd }: {
  groups: GroupDef[]; defaultGroup: string
  onClose: () => void; onAdd: (key: string, group: string) => Promise<void>
}) {
  const [name, setName]   = useState('')
  const [group, setGroup] = useState(defaultGroup)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleAdd() {
    if (!name.trim()) { setErr('Nhap ten tinh nang'); return }
    setSaving(true); setErr(null)
    try { await onAdd(name.trim(), group) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-900 mb-4">+ Them tinh nang moi</h3>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ten tinh nang</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Vi du: Cam bien ap suat lop"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 mb-3"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1">Thuoc nhom</label>
        <select value={group} onChange={e => setGroup(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 mb-4"
        >
          {groups.map(g => <option key={g.label} value={g.label}>{g.icon} {g.label}</option>)}
        </select>
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huy</button>
          <button onClick={handleAdd} disabled={saving}
            className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ background: '#A70A0A' }}
          >{saving ? 'Dang them...' : 'Them'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Group Modal ────────────────────────────────────────────
function AddGroupModal({ onClose, onAdd }: {
  onClose: () => void; onAdd: (label: string, icon: string, color: string) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [icon, setIcon]   = useState('⚙️')
  const [color, setColor] = useState('gray')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const EMOJI_OPTIONS = ['⚙️','📜','🪞','⚡','📷','🛢️','🔌','🔧','📡','💡','🔒','🌡️','📲','🚨','🔋','🛡️']

  async function handleAdd() {
    if (!label.trim()) { setErr('Nhap ten nhom'); return }
    setSaving(true); setErr(null)
    try { await onAdd(label.trim(), icon, color) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Them nhom moi</h3>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ten nhom</label>
        <input autoFocus value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Vi du: Dinh vi & GPS"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 mb-3"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1">Bieu tuong</label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {EMOJI_OPTIONS.map(e => (
            <button key={e} onClick={() => setIcon(e)}
              className={`w-8 h-8 rounded-lg text-base border transition ${icon === e ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
            >{e}</button>
          ))}
        </div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mau sac</label>
        <div className="flex gap-1.5 mb-4">
          {COLOR_OPTIONS.map(c => {
            const s = colorStyle(c)
            return (
              <button key={c} onClick={() => setColor(c)}
                className={`flex-1 h-7 rounded-lg border text-[10px] font-medium transition ${s.bg} ${s.text} ${color === c ? 'ring-2 ring-offset-1 ring-gray-400' : 'border-transparent'}`}
              >{c}</button>
            )
          })}
        </div>
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huy</button>
          <button onClick={handleAdd} disabled={saving}
            className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ background: '#164d81' }}
          >{saving ? 'Dang tao...' : 'Tao nhom'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function FeatureMatrixView({ isAdmin }: Props) {
  const [data, setData]       = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [sortedKeys, setSorted] = useState<string[]>([])

  const [cellEdit, setCellEdit]             = useState<CellEditState | null>(null)
  const [editingKey, setEditingKey]         = useState<string | null>(null)
  const [editVal, setEditVal]               = useState('')
  const [renaming, setRenaming]             = useState(false)
  const [renameErr, setRenameErr]           = useState<string | null>(null)
  const [showAddFeature, setShowAddFeature] = useState<string | null>(null)
  const [showAddGroup, setShowAddGroup]     = useState(false)
  const [deletingKey, setDeletingKey]       = useState<string | null>(null)
  const dragIdx = useRef<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  const loadData = useCallback(() => {
    setLoading(true)
    fetch('/api/kho/features-matrix')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d); setSorted(d.featureKeys)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleCellSave(eqId: string, fk: string, value: string, notes: string) {
    const res = await fetch(`/api/kho/equipment/${eqId}/features`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: fk, value, notes: notes || null }),
    })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
    setData(prev => {
      if (!prev) return prev
      const m = { ...prev.matrix, [eqId]: { ...prev.matrix[eqId], [fk]: { value, notes: notes || null } } }
      return { ...prev, matrix: m }
    })
  }

  async function confirmRename(oldKey: string) {
    const newKey = editVal.trim()
    if (!newKey || newKey === oldKey) { setEditingKey(null); return }
    setRenaming(true); setRenameErr(null)
    try {
      const res = await fetch('/api/kho/features-matrix', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_key: oldKey, new_key: newKey }),
      })
      if (!res.ok) { const j = await res.json(); setRenameErr(j.error ?? 'Loi'); return }
      setEditingKey(null); loadData()
    } finally { setRenaming(false) }
  }

  async function handleAddFeature(key: string, group: string) {
    const res = await fetch('/api/kho/features-matrix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key, group_label: group }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error)
    setShowAddFeature(null); loadData()
  }

  async function handleAddGroup(label: string, icon: string, color: string) {
    const res = await fetch('/api/kho/feature-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, icon, color }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error)
    setShowAddGroup(false); loadData()
  }

  async function handleDeleteFeature(key: string) {
    if (!confirm(`Xoa tinh nang "${key}"?\nTat ca du lieu tren moi thiet bi se bi xoa.`)) return
    setDeletingKey(key)
    await fetch('/api/kho/features-matrix', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key }),
    })
    setDeletingKey(null); loadData()
  }

  function handleDragStart(idx: number) { dragIdx.current = idx }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDropIdx(idx) }
  function handleDrop(targetIdx: number) {
    const src = dragIdx.current
    if (src === null || src === targetIdx) { dragIdx.current = null; setDropIdx(null); return }
    const next = [...sortedKeys]; const [moved] = next.splice(src, 1); next.splice(targetIdx, 0, moved)
    setSorted(next); dragIdx.current = null; setDropIdx(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Dang tai bang tinh nang...
    </div>
  )
  if (error) return <div className="text-red-500 text-sm bg-red-50 rounded-xl p-4 m-4">{error}</div>
  if (!data || data.devices.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <span className="text-4xl">⚙️</span>
      Chua co du lieu tinh nang.
    </div>
  )

  const { devices, matrix, featureMeta, groupDefs } = data
  const metaMap = new Map(featureMeta.map(m => [m.feature_key, m]))

  const keysByGroup = new Map<string, string[]>()
  const noGroupKeys: string[] = []
  for (const key of sortedKeys) {
    const meta = metaMap.get(key)
    if (meta) {
      const arr = keysByGroup.get(meta.group_label) ?? []; arr.push(key)
      keysByGroup.set(meta.group_label, arr)
    } else { noGroupKeys.push(key) }
  }

  const orderedGroups: { group: GroupDef | null; label: string; keys: string[] }[] = []
  for (const g of groupDefs) orderedGroups.push({ group: g, label: g.label, keys: keysByGroup.get(g.label) ?? [] })
  if (noGroupKeys.length > 0) orderedGroups.push({ group: null, label: 'Khac', keys: noGroupKeys })

  return (
    <div className="overflow-x-auto">
      {renameErr && <div className="mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{renameErr}</div>}
      <table className="w-full text-xs border-collapse" style={{ minWidth: `${260 + devices.length * 110}px` }}>
        <thead>
          <tr>
            {isAdmin && <th className="w-6 bg-gray-50 border-b-2 border-gray-200" />}
            <th className="text-left px-4 py-3 font-bold text-gray-700 bg-gray-50 border-b-2 border-gray-200 sticky left-0 z-10 border-r border-gray-300" style={{ width: 220, minWidth: 180 }}>
              Tinh nang
            </th>
            {devices.map(dev => (
              <th key={dev.equipment_id} className="text-center px-2 py-0 border-b-2 border-gray-200 border-l border-gray-100" style={{ minWidth: 100 }}>
                <div className={`${deviceHeaderStyle(dev.device_type)} py-2.5 px-2 flex flex-col items-center gap-1`}>
                  <span className="font-bold text-sm leading-snug">{dev.name}</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-white/20">{dev.status}</span>
                </div>
              </th>
            ))}
            {isAdmin && <th className="w-8 bg-gray-50 border-b-2 border-gray-200" />}
          </tr>
        </thead>
        <tbody>
          {orderedGroups.map(({ group, label, keys }) => {
            const s = colorStyle(group?.color ?? 'gray')
            return (
              <React.Fragment key={label}>
                <tr className={`${s.groupBg} border-b ${s.border} border-t`}>
                  {isAdmin && <td className={s.groupBg} />}
                  <td colSpan={devices.length + (isAdmin ? 2 : 1)} className={`px-4 py-2 sticky left-0 ${s.groupBg} z-10`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-[11px] tracking-wider uppercase ${s.text}`}>
                        {group?.icon ?? '⚙️'} {label}
                      </span>
                      {isAdmin && (
                        <button onClick={() => setShowAddFeature(label)}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text} border ${s.border} hover:brightness-95 transition`}
                        >+ Tinh nang</button>
                      )}
                    </div>
                  </td>
                </tr>
                {keys.map((key, idx) => {
                  const globalIdx    = sortedKeys.indexOf(key)
                  const isDragging   = dragIdx.current === globalIdx
                  const isDropTarget = dropIdx === globalIdx && dragIdx.current !== globalIdx
                  const isEditing    = editingKey === key
                  const isDeleting   = deletingKey === key
                  return (
                    <tr key={key}
                      draggable={isAdmin}
                      onDragStart={() => isAdmin && handleDragStart(globalIdx)}
                      onDragOver={e => isAdmin && handleDragOver(e, globalIdx)}
                      onDrop={() => isAdmin && handleDrop(globalIdx)}
                      onDragEnd={() => { dragIdx.current = null; setDropIdx(null) }}
                      className={
                        'border-b border-gray-100 transition-colors group ' +
                        (isDragging ? 'opacity-40 ' : '') +
                        (isDropTarget ? 'bg-violet-50 border-violet-300 ' : (idx % 2 === 0 ? 'bg-white ' : 'bg-gray-50/40 ')) +
                        (isAdmin ? 'cursor-grab' : '')
                      }
                    >
                      {isAdmin && (
                        <td className="text-center w-6 border-r border-gray-100 text-gray-300 group-hover:text-gray-400 select-none" title="Keo de sap xep">⋮</td>
                      )}
                      <td className="px-4 py-2 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                        {isAdmin && isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmRename(key); if (e.key === 'Escape') setEditingKey(null) }}
                              className="flex-1 border border-violet-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                            />
                            <button onClick={() => confirmRename(key)} disabled={renaming} className="text-green-600 font-bold text-sm px-1 disabled:opacity-40">✔</button>
                            <button onClick={() => setEditingKey(null)} className="text-gray-400 text-sm px-1">×</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-800 font-medium leading-snug">{key}</span>
                            {isAdmin && (
                              <button onClick={() => { setEditingKey(key); setEditVal(key); setRenameErr(null) }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-violet-600 text-[10px] px-1 py-0.5 rounded border border-transparent hover:border-violet-200 hover:bg-violet-50"
                                title="Doi ten"
                              >✏️</button>
                            )}
                          </div>
                        )}
                      </td>
                      {devices.map(dev => {
                        const cell = matrix[dev.equipment_id]?.[key]
                        return (
                          <td key={dev.equipment_id}
                            className={`py-2 px-2 text-center border-l border-gray-100 align-top ${isAdmin ? 'cursor-pointer hover:bg-blue-50/40 transition-colors' : ''}`}
                            onClick={isAdmin ? (e) => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setCellEdit({ equipmentId: dev.equipment_id, featureKey: key, value: cell?.value ?? 'Khong', notes: cell?.notes ?? '', anchorRect: rect })
                            } : undefined}
                            title={isAdmin ? 'Click de chinh sua' : undefined}
                          >
                            {cell ? <CellDisplay value={cell.value} notes={cell.notes} /> : (
                              <span className="text-gray-200 text-base">&mdash;</span>
                            )}
                          </td>
                        )
                      })}
                      {isAdmin && (
                        <td className="text-center w-8 border-l border-gray-100">
                          <button onClick={() => handleDeleteFeature(key)} disabled={isDeleting}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 text-sm p-1"
                            title="Xoa tinh nang"
                          >{isDeleting ? '...' : '🗑'}</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {isAdmin && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/40">
          <button onClick={() => setShowAddGroup(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition"
          >+ Them nhom moi</button>
          <span className="ml-auto text-[11px] text-gray-300">Hover de sua ten · Click o de chinh gia tri · Keo de sap xep</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">✔</span>
          Co / Dat chuan
        </span>
        <span className="flex items-center gap-1.5"><span className="text-gray-300 text-base">&mdash;</span> Khong ho tro</span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">Gia tri</span>
          Thong so cu the
        </span>
      </div>
      {cellEdit && <CellEditPopup state={cellEdit} onClose={() => setCellEdit(null)} onSave={handleCellSave} />}
      {showAddFeature && <AddFeatureModal groups={groupDefs} defaultGroup={showAddFeature} onClose={() => setShowAddFeature(null)} onAdd={handleAddFeature} />}
      {showAddGroup && <AddGroupModal onClose={() => setShowAddGroup(false)} onAdd={handleAddGroup} />}
    </div>
  )
}
