/**
 * Static site served by the worker on the apex domain:
 * GET /privacy-policy → the store-listing privacy policy.
 * GET /data-deletion → how to delete data (no accounts).
 * GET /              → minimal landing page (PWA lives on app.*).
 */

export const EFFECTIVE_DATE = '22 September 2026';

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
<strong>no accounts and no sign-in</strong>: the app works anonymously
with a random browser identifier stored in your device's
localStorage.</p>

<h2>Data we process</h2>
<ul>
<li><strong>Page photos.</strong> When you tap the shutter, the photo is
sent to our backend and forwarded to our AI provider (OpenRouter,
running a Google model) solely to generate your summary. Page images
are <strong>not stored on our servers</strong>; they are kept only in
the on-device history in your browser (IndexedDB) until you delete them.</li>
<li><strong>Anonymous browser identifier.</strong> The app generates a
random identifier (a <code>uuid:</code> value in localStorage) to count
your monthly page allowance and recognise an active subscription. It
contains no contact details; a purchase email is stored separately and
only for subscribers. Clearing site data resets it.</li>
<li><strong>Purchase information.</strong> Subscriptions are sold and
billed by Stripe. We receive only the fact that a subscription is
active (plus price and expiry timestamps) — never your payment
details. Subscribers' purchase email and a one-way hash of a recovery
code are stored alongside the Stripe customer link; restoring moves
access so exactly one device ID is active per subscription.</li>
<li><strong>Page counters.</strong> Monthly and daily counters linked to
your anonymous identifier are stored in our Cloudflare D1 database to
enforce the 100-pages/month free allowance and the subscriber
guardrails (500/day, 10000/month).</li>
</ul>

<h2>What we do not collect</h2>
<p>No contacts, precise location, advertising identifiers, or analytics
SDKs. Your purchase email is kept only if you subscribe, solely to
recover your subscription. The camera is used only when you tap
the shutter; no photos are taken in the background.</p>

<h2>Subscription recovery</h2>
<p>Subscribers' purchase email and a one-way hash of a recovery code are
stored alongside the Stripe customer link and used only to restore
Unlimited on a new device. Restoring moves access: exactly one device
ID is active per subscription.</p>

<h2>Third parties</h2>
<ul>
<li>OpenRouter (AI summarisation) — receives page photos transiently.</li>
<li>Stripe (payments) — processes subscriptions under Stripe's own
privacy policy.</li>
<li>Cloudflare (hosting) — serves the app and runs the backend that
relays summaries and counts pages.</li>
</ul>

<h2>Retention</h2>
<p>Page photos and summaries live only on your device and disappear
when you delete them or clear site data. Server-side page counters
reset every calendar month. Subscription records are kept while a
subscription is active (plus its paid period) and removed on
expiry.</p>

<h2>Children</h2>
<p>The app is a general-audience reading tool and is not directed at
children under 13. No children's data is knowingly collected.</p>

<h2>Your rights</h2>
<p>Depending on where you live (e.g. GDPR, CCPA) you may request
access, correction, or deletion of data linked to your browser
identifier. See <a href="/data-deletion">data deletion</a> for the
one-minute process: your on-device history deletes instantly in the
app, while server-side page counters reset every calendar month and
subscription records disappear when the subscription expires. There
is currently no support email address; a dedicated address for this
domain will be listed here once available.</p>

<h2>Changes</h2>
<p>Material changes to this policy will be published here with a new
effective date. Continued use of the app after a change means you
accept it.</p>

<h2>Contact</h2>
<p>There is currently no public support email. A dedicated address for this domain will be listed here once available.</p>
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
<h2>1. On your device (instant)</h2>
<p>Open the app and tap the red bin on any summary to delete that
page's photo and text immediately. Clearing the site's data removes
whatever remains, including your anonymous browser identifier.</p>
<h2>2. On our servers (automatic)</h2>
<p>Nothing to send: monthly page counters reset on their own, and
subscription records disappear when the subscription expires.
Clearing your site data removes your anonymous browser identifier
from the device.</p>
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
<a class="btn" href="https://app.diagonalreader.com">Open the app</a>
<footer><a href="/privacy-policy">Privacy Policy</a></footer>
</body>
</html>`;
