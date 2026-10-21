// The ten EEO-1 job categories and the snapshot window of the pinned rule version (eeo1-component1-2024).
export const JOB_CATEGORIES = [
  { value: 'exec_senior', label: 'Executive/Senior Level Officials and Managers' },
  { value: 'first_mid', label: 'First/Mid-Level Officials and Managers' },
  { value: 'professionals', label: 'Professionals' },
  { value: 'technicians', label: 'Technicians' },
  { value: 'sales', label: 'Sales Workers' },
  { value: 'admin_support', label: 'Administrative Support Workers' },
  { value: 'craft', label: 'Craft Workers' },
  { value: 'operatives', label: 'Operatives' },
  { value: 'laborers', label: 'Laborers and Helpers' },
  { value: 'service', label: 'Service Workers' },
] as const
export type JobCategory = typeof JOB_CATEGORIES[number]['value']
export const categoryLabel = (value: string | null) => JOB_CATEGORIES.find(category => category.value === value)?.label ?? 'No job category'

/** The workforce snapshot is one pay period inside the fourth quarter (1 October to 31 December) of one calendar year. */
export const SNAPSHOT_WINDOW = 'A pay period inside October 1 to December 31 of one calendar year'
export const inWindow = (from: string, to: string) => from.slice(0, 4) === to.slice(0, 4) && from >= `${from.slice(0, 4)}-10-01` && to <= `${to.slice(0, 4)}-12-31` && from <= to

export const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase()
