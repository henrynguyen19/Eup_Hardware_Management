// Shared types for Ho Tro module
export interface DailyRecord {
  date: string       // "1/11/2025" formatted from sheet
  sortKey: string    // "2025-11-01" for sorting
  total_requests: number
  avg_time: number
  max_time: number
  devices: Record<string, number>
  resolution: Record<string, number>
  locations: Record<string, number>
  channels: Record<string, number>
  errors: Record<string, number>
}
