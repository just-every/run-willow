// A form confirmation is shown on the following page once. The URL alone
// cannot replay it on reload; no client script or durable business write is used.
const COOKIE = 'willow_confirmation'
const cookie = (value: string, secure: boolean, age: number) => `${COOKIE}=${value}; Path=/app; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`

export function confirmation(location: URL) {
  const token = crypto.randomUUID()
  location.searchParams.set('confirmation', token)
  return cookie(token, location.protocol === 'https:', 120)
}

export function consumeConfirmation(request: Request, url: URL) {
  if (request.method !== 'GET' || !url.searchParams.has('notice')) return null
  const token = url.searchParams.get('confirmation')
  // Other subsystems own their notices; consume only Willow form confirmations.
  if (!token) return null
  const stored = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  if (token !== stored) url.searchParams.delete('notice')
  url.searchParams.delete('confirmation')
  return cookie('', url.protocol === 'https:', 0)
}
