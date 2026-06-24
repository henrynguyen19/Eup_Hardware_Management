// Shared types for Ho Tro module
export interface DailyRecord {
  date: string
  sortKey: string
  total_requests: number
  avg_time: number
  max_time: number
  devices: Record<string, number>
  resolution: Record<string, number>
  locations: Record<string, number>
  channels: Record<string, number>
  errors: Record<string, number>
  pm_types: Record<string, number>
  device_error_pairs: Record<string, number>
}
