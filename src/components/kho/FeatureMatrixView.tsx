'use client'

import React, { useEffect, useRef, useState } from 'react'

interface DeviceInfo { equipment_id: string; name: string; status: string; device_type: string }
interface CellVal { value: string; notes: string | null }
interface MatrixData {
  devices: DeviceInfo[]
  featureKeys: string[]
  matrix: Record<string, Record<string, CellVal>>
}
interface Props { isAdmin: boolean }

// ── Nhóm tính năng (thứ tự chính xác theo file Excel) ─────────────────────
interface FeatureGroup {
  label: string
  icon: string
  bg: string
  text: string
  border: string
  keys: string[]
}
const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: 'Tieu chuan phap ly', icon: '📜',
    bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200',
    keys: ['QCVN06', 'QCVN31', 'Nghi Dinh 10'],
  },
  {
    label: 'RFID & Tai xe', icon: '🪪',
    bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200',
    keys: ['Canh bao quet the', 'Quet The lai xe', 'Tu dong dang xuat'],
  },
  {
    label: 'Canh bao toc do', icon: '⚡',
    bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200',
    keys: ['Canh bao Toc do theo cung duong', 'Canh bao qua toc do'],
  },
  {
    label: 'Camera', icon: '📷',
    bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200',
    keys: ['Tich hop cam'],
  },
  {
    label: 'Cam bien dau', icon: '🛢️',
    bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200',
    keys: ['Cam bien dau Taiwan - Soji', 'Cam bien dau doi', 'Cam bien dau chuyen doi'],
  },
  {
    label: 'Cam bien & Mo rong', icon: '🔌',
    bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200',
    keys: ['Cam bien nhiet do', 'Cam bien be tong', 'Cong tac nang ha', 'Cam bien va cham', 'Cam bien romooc etag'],
  },
]

// Vietnamese canonical feature names (must match DB exactly)
const VI_FEATURE_NAMES: Record<string, string> = {
  'QCVN06':             'QCVN06',
  'QCVN31':             'QCVN31',
  'Nghi Dinh 10':       'Nghị Định 10',
  'Canh bao quet the':  'Cảnh báo quẹt thẻ',
  'Quet The lai xe':    'Quẹt Thẻ lái xe',
  'Tu dong dang xuat':  'Tự động đăng xuất',
  'Canh bao Toc Do theo cung duong': 'Cảnh báo Tốc độ theo cung đường',
  'Canh bao qua toc do':'Cảnh báo quá tốc độ',
  'Tich hop cam':        'Tích hợp cam',
  'Cam bien dau Taiwan - Soji': 'Cảm biến dầu Taiwan - Soji',
  'Cam bien dau doi':   'Cảm biến dầu đôi',
  'Cam bien dau chuyen doi': 'Cảm biến dầu chuyển đổi',
  'Cam bien nhiet do':  'Cảm biến nhiệt độ',
  'Cam bien be tong':   'Cảm biến bê tông',
  'Cong tac nang ha':   'Công tắc nâng hạ ben, cửa, điều hòa, Sos, Công tắc chở hàng',
  'Cam bien va cham':   'Cảm biến va chạm',
  'Cam bien romooc etag':'Cảm biến rơmooc etag',
}

// Build lookup from vi_name -> group
const KEY_TO_GROUP = new Map<string, FeatureGroup>()
const CANONICAL_ORDER: string[] = []
for (const g of FEATURE_GROUPS) {
  for (const slug of g.keys) {
    const viName = VI_FEATURE_NAMES[slug] ?? slug
    KEY_TO_GROUP.set(viName, g)
    CANONICAL_ORDER.push(viName)
  }
}

const STORAGE_KEY = 'kho_feature_order_v3'

function loadOrder(apiKeys: string[]): string[] {
  try {
    const stored: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (stored.length > 0) {
      return [...stored.filter(k => apiKeys.includes(k)), ...apiKeys.filter(k => !stored.includes(k))]
    }
  } catch {}
  // Default: follow CANONICAL_ORDER, then extras
  return [...CANONICAL_ORDER.filter(k => apiKeys.includes(k)), ...apiKeys.filter(k => !CANONICAL_ORDER.includes(k))]
}
function saveOrder(keys: string[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)) }

// Device type -> header color
function deviceHeaderStyle(deviceType: string): string {
  const t = (deviceType ?? '').toLowerCase()
  if (t.includes('ai') || t.includes('adas'))      return 'bg-violet-600 text-white'
  if (t.includes('camera') || t.includes('dvr'))   return 'bg-purple-600 text-white'
  return 'bg-blue-600 text-white'
}

function renderValue(value: string, notes: string | null) {
  const v = value.trim()
  const posLower = ['co', 'yes', '1']
  const negLower = ['khong', 'no', '0']
  const isCheck = v === 'check' || v === '✔' || posLower.includes(v.toLowerCase())
  const isCross = v === '✘' || negLower.includes(v.toLowerCase())

  if (isCheck) return (
    <span className="flex flex-col items-center gap-0.5" title={notes ?? undefined}>
      <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">✔</span>
      {notes && <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[80px] break-words">{notes}</span>}
    </span>
  )
  if (isCross) return (
    <span className="flex justify-center text-gray-300 text-base" title={notes ?? undefined}>&mdash;</span>
  )
  // Text value (e.g. 'Soji')
  return (
    <span className="flex flex-col items-center gap-0.5" title={notes ?? undefined}>
      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium text-center max-w-[80px] break-words">{v}</span>
      {notes && <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[80px] break-words">{notes}</span>}
    </span>
  )
}

export default function FeatureMatrixView({ isAdmin }: Props) {
  const [data, setData]             = useState<MatrixData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [sortedKeys, setSortedKeys] = useState<string[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editVal, setEditVal]       = useState('')
  const [renaming, setRenaming]     = useState(false)
  const [renameErr, setRenameErr]   = useState<string | null>(null)
  const dragIdx = useRef<number | null>(null)
  const [dropIdx, setDropIdx]       = useState<number | null>(null)

  const loadData = () => {
    setLoading(true)
    fetch('/api/kho/features-matrix')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setSortedKeys(loadOrder(d.featureKeys))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

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
      const json = await res.json()
      if (!res.ok) { setRenameErr(json.error ?? 'Loi'); return }
      setSortedKeys(prev => { const next = prev.map(k => k === oldKey ? newKey : k); saveOrder(next); return next })
      setEditingKey(null)
      loadData()
    } catch (e: unknown) { setRenameErr(e instanceof Error ? e.message : 'Loi mang') }
    finally { setRenaming(false) }
  }

  function handleDragStart(idx: number) { dragIdx.current = idx }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDropIdx(idx) }
  function handleDrop(targetIdx: number) {
    const src = dragIdx.current
    if (src === null || src === targetIdx) { dragIdx.current = null; setDropIdx(null); return }
    const next = [...sortedKeys]
    const [moved] = next.splice(src, 1)
    next.splice(targetIdx, 0, moved)
    setSortedKeys(next); saveOrder(next)
    dragIdx.current = null; setDropIdx(null)
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
      Chua co du lieu tinh nang. Chay seed script sau khi da chay SQL migration.
    </div>
  )

  const devices = data.devices

  return (
    <div className="overflow-x-auto">
      {renameErr && (
        <div className="mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{renameErr}</div>
      )}
      <table className="w-full text-xs border-collapse" style={{ minWidth: `${240 + devices.length * 110}px` }}>
        <thead>
          <tr>
            {/* drag col */}
            {isAdmin && <th className="w-6 bg-gray-50 border-b-2 border-gray-200" />}
            {/* feature name col */}
            <th className="text-left px-4 py-3 font-bold text-gray-700 bg-gray-50 border-b-2 border-gray-200 sticky left-0 z-10 border-r border-gray-300" style={{ width: 220, minWidth: 180 }}>
              Tinh nang
            </th>
            {/* device columns - colored header */}
            {devices.map(dev => (
              <th key={dev.equipment_id} className={'text-center px-2 py-0 border-b-2 border-gray-200 border-l border-gray-100'} style={{ minWidth: 100 }}>
                <div className={deviceHeaderStyle(dev.device_type) + ' py-2.5 px-2 flex flex-col items-center gap-1 m-0'}>
                  <span className="font-bold text-sm leading-snug">{dev.name}</span>
                  <span className={'text-[10px] font-normal px-2 py-0.5 rounded-full bg-white/20'}>
                    {dev.status}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const rows: React.ReactNode[] = []
            let lastGroup: FeatureGroup | null = null

            for (let idx = 0; idx < sortedKeys.length; idx++) {
              const key = sortedKeys[idx]
              const group = KEY_TO_GROUP.get(key) ?? null
              const isDragging = dragIdx.current === idx
              const isDropTarget = dropIdx === idx && dragIdx.current !== idx
              const isEditing = editingKey === key

              // Insert group header when group changes
              if (group && group !== lastGroup) {
                lastGroup = group
                rows.push(
                  <tr key={`grp-${group.label}`} className={group.bg + ' border-b ' + group.border + ' border-t'}>
                    <td colSpan={devices.length + (isAdmin ? 2 : 1)} className={'px-4 py-1.5 font-bold text-[11px] tracking-wider uppercase ' + group.text + ' sticky left-0 ' + group.bg}>
                      {group.icon} {group.label}
                    </td>
                  </tr>
                )
              }

              rows.push(
                <tr
                  key={key}
                  draggable={isAdmin}
                  onDragStart={() => isAdmin && handleDragStart(idx)}
                  onDragOver={e => isAdmin && handleDragOver(e, idx)}
                  onDrop={() => isAdmin && handleDrop(idx)}
                  onDragEnd={() => { dragIdx.current = null; setDropIdx(null) }}
                  className={
                    'border-b border-gray-100 transition-colors group ' +
                    (isDragging ? 'opacity-40 ' : '') +
                    (isDropTarget ? 'bg-violet-50 border-violet-300 ' : (idx % 2 === 0 ? 'bg-white ' : 'bg-gray-50/40 ')) +
                    (isAdmin ? 'cursor-grab' : '')
                  }
                >
                  {isAdmin && (
                    <td className="text-center w-6 border-r border-gray-100 text-gray-300 group-hover:text-gray-400 select-none text-base" title="Keo de sap xep">
                      &#8942;
                    </td>
                  )}
                  <td className="px-4 py-2 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                    {isAdmin && isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmRename(key); if (e.key === 'Escape') setEditingKey(null) }}
                          className="flex-1 border border-violet-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                          style={{ minWidth: 120 }}
                        />
                        <button onClick={() => confirmRename(key)} disabled={renaming} className="text-green-600 font-bold text-sm px-1 disabled:opacity-40">✔</button>
                        <button onClick={() => setEditingKey(null)} className="text-gray-400 text-sm px-1">×</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-800 font-medium leading-snug">{key}</span>
                        {isAdmin && (
                          <button
                            onClick={() => { setEditingKey(key); setEditVal(key); setRenameErr(null) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-violet-600 text-[10px] px-1 py-0.5 rounded border border-transparent hover:border-violet-200 hover:bg-violet-50"
                          >✏️</button>
                        )}
                      </div>
                    )}
                  </td>
                  {devices.map(dev => {
                    const cell = data.matrix[dev.equipment_id]?.[key]
                    return (
                      <td key={dev.equipment_id} className="py-2 px-2 text-center border-l border-gray-100 align-top">
                        {cell ? renderValue(cell.value, cell.notes) : (
                          <span className="text-gray-200 text-base">&mdash;</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            }
            return rows
          })()}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50/40 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">✔</span>
          Co / Dat chuan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-300 text-base">&mdash;</span>
          Khong ho tro
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">Gia tri</span>
          Thong so cu the
        </span>
        {isAdmin && <span className="ml-auto text-gray-300">Hover de sua ten · Keo ⋮ de sap xep hang</span>}
      </div>
    </div>
  )
}
