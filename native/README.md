# Willow companion for iOS and Android

This React Native/Expo development-build app has native language and time-clock
controls and notification registration. Employee forms, documents, company
content, signing, surveys and self-ID use the employer's existing authenticated
WebView. This shares current authority, reviewed document bytes, translations
and consent with the browser; it is not a separate copy of business records.

From this directory run `npm ci`, then `npm run ios` on macOS with Xcode, or
`npm run android` with the Android SDK. Expo prebuild generates the native projects
from app.json. Enter the employer's HTTPS origin, sign in through the ordinary
email-link form and open its confirmation link in the in-app browser. Only that
origin may navigate. HttpOnly sessions remain in the OS WebView cookie jar;
no session or business record is written to JS storage. Background/resume reloads
current authority. Requests are never queued offline or replayed automatically.

Set your own bundle IDs and `extra.eas.projectId` in app.json before developer
account distribution and push enrollment. Enable APNs/FCM in that Expo project.
Permission denial and unavailable configuration are visible failures. Push is
opt-in and session-bound; registration expires with the session and is excluded from portable archives. A restored installation requires fresh device enrollment. Fixed generic
payloads carry only `/app`, and that destination authenticates again. Android
uses a private lock-screen channel. Devices can revoke OS notification permission;
signing out makes their server registration unusable. Provider acceptance is
recorded independently of business completion and proves no physical delivery.

`npm run bundle:ios` and `npm run bundle:android` compile both production platform
bundles without a developer account. The two LOCALE-001 journeys run native
React components against the real local Worker using recorded native host and
push-provider edges. Physical device, store distribution and live APNs/FCM trials
still need the employer's devices and developer accounts.
