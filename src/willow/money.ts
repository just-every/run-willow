// Display formatting for pay: a stored amount in cents plus an ISO currency
// code reads as a currency amount ("A$85,000 per year"). Storage, the payroll
// handoff and its CSV keep the plain "85000.00 AUD" form.
export type PayBasis = 'salary' | 'hourly' | 'unknown' | string

export function formatMoney(cents: number, currency: string) {
  const whole = cents % 100 === 0
  return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)
}

export function formatPay(basis: PayBasis, cents: number | null, currency: string) {
  if (cents === null) return `${basis} (amount unknown)`
  const unit = basis === 'hourly' ? ' per hour' : basis === 'salary' ? ' per year' : ''
  return `${formatMoney(cents, currency)}${unit}`
}

// The plain machine form written into the payroll handoff and its CSV.
export const plainMoney = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`

// Reads the handoff's plain pay text back as the display form on screen.
export const displayPayText = (text: string) => text.replace(/\b(salary|hourly) (\d+\.\d{2}) ([A-Z]{3})\b/g, (_, basis, amount, currency) => formatPay(basis, Math.round(Number(amount) * 100), currency))
