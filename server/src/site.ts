/**
 * Static site served by the worker on the apex domain:
 * GET /privacy-policy → the Play-listing privacy policy.
 * GET /              → minimal landing page.
 */

export const CONTACT_EMAIL = 'sklyarovaleksandar@gmail.com';
export const EFFECTIVE_DATE = '19 September 2026';

export const privacyPolicyHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Diagonal Reader</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:44rem;margin:0 auto;padding:2rem 1.25rem;line-height:1.6;color:#1a1a1a}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:2rem}
.muted{color:#666}
</style>
</head>
<body>
<h1>Privacy Policy — Diagonal Reader</h1>
<p class="muted">Effective date: ${EFFECTIVE_DATE}</p>
<p>Diagonal Reader ("the app") helps you read faster by photographing
book pages and returning style-preserving summaries. This policy
explains what data the app and its backend process. There are
<strong>no accounts and no sign-in</strong>: the app works anonymously.</p>

<h2>Data we process</h2>
<ul>
<li><strong>Page photos.</strong> When you tap the shutter, the photo is
sent to our backend and forwarded to our AI provider (OpenRouter,
running a Google model) solely to generate your summary. Page images
are <strong>not stored on our servers</strong>; they are kept only in
the on-device history on your phone until you delete them.</li>
<li><strong>Anonymous device identifier.</strong> The app generates a
random identifier from your device (Android ID) to count your monthly
page allowance and recognise an active subscription. It contains no
name, email, or contact details.</li>
<li><strong>Purchase information.</strong> Subscriptions are sold and
billed by Google Play and managed through RevenueCat. We receive only
the fact that a subscription is active (plus product and expiry
timestamps) — never your payment details.</li>
</ul>

<h2>What we do not collect</h2>
<p>No names, emails, contacts, precise location, advertising
identifiers, or analytics SDKs. The camera is used only when you tap
the shutter; no photos are taken in the background.</p>

<h2>Third parties</h2>
<ul>
<li>OpenRouter (AI summarisation) — receives page photos transiently.</li>
<li>RevenueCat (subscription status) — receives the anonymous device
identifier and purchase events.</li>
<li>Google Play (billing) — processes payments under Google's own
privacy policy.</li>
<li>Cloudflare (hosting) — runs the backend that relays summaries and
counts pages.</li>
</ul>

<h2>Retention</h2>
<p>Page photos and summaries live only on your device and disappear
when you delete them or uninstall the app. Server-side page counters
reset every calendar month. Subscription records are kept while a
subscription is active (plus its paid period) and removed on
expiry.</p>

<h2>Children</h2>
<p>The app is a general-audience reading tool and is not directed at
children under 13. No children's data is knowingly collected.</p>

<h2>Your rights</h2>
<p>Depending on where you live (e.g. GDPR, CCPA) you may request
access, correction, or deletion of data linked to your device
identifier. See <a href="/data-deletion">data deletion</a> for the
one-minute process: your on-device history deletes instantly in the
app, and server records go on emailed request. Contact:
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

<h2>Changes</h2>
<p>Material changes to this policy will be published here with a new
effective date. Continued use of the app after a change means you
accept it.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body>
</html>`;

export const deletionHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data deletion — Diagonal Reader</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:44rem;margin:0 auto;padding:2rem 1.25rem;line-height:1.6;color:#1a1a1a}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:2rem}
code{background:#f0f0f0;padding:.1rem .35rem;border-radius:4px}
</style>
</head>
<body>
<h1>Data deletion — Diagonal Reader</h1>
<p>There are no accounts, so there is nothing to log into. Deleting
your data takes two short steps:</p>
<h2>1. On your phone (instant)</h2>
<p>Open the app and tap the red bin on any summary to delete that
page's photo and text immediately. Uninstalling the app removes
whatever remains.</p>
<h2>2. On our servers (by email)</h2>
<p>Email <a href="mailto:${CONTACT_EMAIL}?subject=Data%20deletion">${CONTACT_EMAIL}</a>
with subject <code>Data deletion</code> and include your
<strong>Device ID</strong> so we can find your records: in the app,
<strong>long-press the page counter</strong> at the top of the camera
screen, then Copy. We delete your monthly counters and any
subscription record and confirm back within 30 days.</p>
<p>Note: monthly page counters reset automatically, and subscription
records disappear on their own when the subscription expires —
emailing only hurries that along.</p>
</body>
</html>`;

export const landingHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagonal Reader — read faster</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:40rem;margin:0 auto;padding:4rem 1.25rem;line-height:1.6;text-align:center;color:#1a1a1a}
a.btn{display:inline-block;margin-top:1.5rem;padding:.8rem 1.6rem;background:#129BDB;color:#fff;border-radius:999px;text-decoration:none;font-weight:600}
footer{margin-top:4rem;font-size:.85rem;color:#666}
</style>
</head>
<body>
<h1>Diagonal Reader</h1>
<p>Photograph a book page. Get back a summary in the author's own
style — in seconds. 100 pages free every month, unlimited with one
subscription.</p>
<a class="btn" href="https://play.google.com/store/apps/details?id=com.diagonalreader.app">Get it on Google Play</a>
<footer><a href="/privacy-policy">Privacy Policy</a></footer>
</body>
</html>`;
