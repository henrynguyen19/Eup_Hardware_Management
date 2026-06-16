import { useState } from 'react'

export type PhotoType = 'main' | string  // 'main' | '2' | '整組' | '配線' …

interface UploadResult {
  public_id: string
  url: string
}

export function usePhotoUpload(equipment_id: string) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // ── upload單ảnhảnh ─────────────────────────────────────────────
  // type: 'main' 或細節後綴（'2', '整組', '配線'…）
  async function upload(file: File, type: PhotoType): Promise<UploadResult | null> {
    setUploading(true)
    setError(null)

    try {
      // Step 1：向自己的 API 取得 Cloudinary 簽名
      const sigRes = await fetch('/api/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ equipment_id, type }),
      })
      if (!sigRes.ok) throw new Error('Failed to get upload signature')
      const { signature, timestamp, public_id, folder, api_key, cloud_name } =
        await sigRes.json()

      // Step 2：直接 POST 到 Cloudinary（檔案不過 Vercel）
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key',   api_key)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)
      formData.append('public_id', public_id)
      formData.append('folder',    folder)

      const cdnRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
        { method: 'POST', body: formData },
      )
      if (!cdnRes.ok) throw new Error('Cloudinary upload failed')
      const { secure_url } = await cdnRes.json()

      // Step 3：寫回 Supabase（透過 PATCH /api/upload）
      const patchRes = await fetch('/api/upload', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ equipment_id, type, public_id, url: secure_url }),
      })
      if (!patchRes.ok) throw new Error('Failed to save photo record')

      return { public_id, url: secure_url }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload error')
      return null
    } finally {
      setUploading(false)
    }
  }

  // ── Xóaảnh ─────────────────────────────────────────────────
  async function remove(public_id: string, type: 'main' | 'detail'): Promise<boolean> {
    setUploading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/upload/${encodeURIComponent(public_id)}?equipment_id=${equipment_id}&type=${type}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Delete failed')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete error')
      return false
    } finally {
      setUploading(false)
    }
  }

  return { upload, remove, uploading, error }
}
