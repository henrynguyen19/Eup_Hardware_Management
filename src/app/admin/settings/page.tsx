import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import OptionsEditor from '@/components/OptionsEditor'
import { ArrowLeft, Settings } from 'lucide-react'

export default async function AdminSettingsPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/')

  const settings = await getSettings()

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Cài đặt tùy chọn</h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <OptionsEditor
          title="Tùy chọn danh mục"
          description="Thiết bị的Danh mục下拉清單，可自由Thêm mới或Xóa"
          settingsKey="categories"
          initialItems={settings.categories}
        />
        <OptionsEditor
          title="Tùy chọn trạng thái"
          description="第一個tùy chọn為預設Trạng thái（現役）；KhácTrạng thái在縮圖上會Hiển thị覆蓋Tags"
          settingsKey="statuses"
          initialItems={settings.statuses}
        />
      </div>
    </main>
  )
}
