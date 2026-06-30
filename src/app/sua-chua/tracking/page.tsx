import RepairTrackingDashboard from '@/components/sua-chua/RepairTrackingDashboard'

export const metadata = { title: 'Theo dõi sửa chữa | EUP Hardware' }

export default function RepairTrackingPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <RepairTrackingDashboard />
    </div>
  )
}
