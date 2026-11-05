const EVENTS: Record<string, string> = {
  assignment: 'Work assigned', completion: 'Work completed', leave: 'Leave decision ready', payroll: 'Payroll handoff ready',
}
const RESULTS: Record<string, string> = {
  development: 'Saved locally; no external email sent', accepted: 'Accepted by email provider', pending: 'Waiting to send',
  failed: 'Delivery failed; check the mail configuration', refused: 'Delivery refused; check the recipient’s access and mail configuration',
  recipient_access_changed: 'Not sent because the recipient’s access changed', mail_unavailable: 'Mail is not configured; ask the owner to configure it',
  mail_refused: 'The email provider refused this notice; check the mail configuration', mail_failed: 'The email request failed; check the provider connection',
}
export const noticeEvent = (kind: string) => EVENTS[kind] ?? 'Work update'
export const noticeResult = (status: string) => RESULTS[status] ?? 'Delivery is not confirmed; check the mail configuration'
