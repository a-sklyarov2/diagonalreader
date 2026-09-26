/**
 * Static site served by the worker on the apex domain:
 * GET /privacy-policy → the store-listing privacy policy.
 * GET /data-deletion → how to delete data (no accounts).
 * GET /              → marketing landing page (the PWA lives on app.*).
 */

export const EFFECTIVE_DATE = '24 September 2026';

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
details. Subscribers' purchase email and invoice numbers are
stored alongside the Stripe customer link; restoring moves access so
exactly one device ID is active per subscription.</li>
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
<p>Subscribers' purchase email and invoice numbers are stored
alongside the Stripe customer link and used only to restore Unlimited
on a new device: enter your purchase email and an invoice number from
a Stripe subscription invoice. Restoring moves access: exactly one
device ID is active per subscription.</p>

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
<title>Diagonal Reader — Finish the books you keep meaning to read</title>
<meta name="description" content="Snap any book page and read it in half, as a few key points, or as one sentence, in the author's voice and the page's own language. 100 free pages a month, no account.">
<link rel="canonical" href="https://diagonalreader.com/">
<meta name="theme-color" content="#fbf8f1">
<link rel="icon" href="/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/icon-192.png">
<meta property="og:type" content="website">
<meta property="og:url" content="https://diagonalreader.com/">
<meta property="og:title" content="Diagonal Reader — Finish the books you keep meaning to read">
<meta property="og:description" content="Snap a page, get the gist in seconds, keep reading. 100 free pages a month, no account.">
<meta property="og:image" content="https://diagonalreader.com/icon-512.png">
<meta name="twitter:card" content="summary">
<style>
:root {
  color-scheme: light;
  --paper: #fbf8f1;
  --surface: #fff;
  --ink: #0b1b33;
  --muted: #45536a;
  --line: #e7e1d3;
  --teal: #067587;
  --cyan: #18bfd3;
  --bolt: #ffc62b;
  --night: #081421;
  --night-muted: #a9b7c9;
  --sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  font-family: var(--sans);
}
* { box-sizing: border-box; }
html { scroll-padding-top: 5rem; -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); line-height: 1.6; }
svg { display: block; }
a { color: var(--teal); text-underline-offset: .18em; }
a:hover { color: var(--ink); }
:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
h1, h2, h3 { margin: 0; line-height: 1.08; letter-spacing: -.035em; }
.container { width: min(100% - 2.5rem, 72rem); margin-inline: auto; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip-link { position: absolute; z-index: 20; top: -5rem; left: 1rem; padding: .75rem 1rem; border-radius: .6rem; background: var(--ink); color: #fff; font-weight: 700; text-decoration: none; }
.skip-link:focus { top: 1rem; color: #fff; }

/* header */
.site-header { position: sticky; top: 0; z-index: 10; border-bottom: 1px solid rgb(231 225 211 / 70%); background: rgb(251 248 241 / 88%); -webkit-backdrop-filter: saturate(1.4) blur(12px); backdrop-filter: saturate(1.4) blur(12px); }
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 4rem; }
.brand { display: inline-flex; align-items: center; gap: .6rem; color: var(--ink); font-size: 1.08rem; font-weight: 800; letter-spacing: -.02em; text-decoration: none; white-space: nowrap; }
.brand:hover { color: var(--ink); }
.brand img { width: 2rem; height: 2rem; border-radius: .55rem; }

/* buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 48px; padding: .8rem 1.45rem; border-radius: 999px; font-size: 1rem; font-weight: 750; line-height: 1.2; text-align: center; text-decoration: none; transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease, border-color .15s ease; }
.btn svg { width: 1.1em; height: 1.1em; flex: none; }
.btn-sm { min-height: 44px; padding: .6rem 1.1rem; font-size: .95rem; }
.btn-primary { background: var(--ink); color: #fff; box-shadow: 0 12px 24px -12px rgb(11 27 51 / 60%); }
.btn-primary:hover { background: #17305a; color: #fff; box-shadow: 0 16px 28px -12px rgb(11 27 51 / 65%); transform: translateY(-1px); }
.btn-ghost { border: 1px solid #d9d0bd; background: var(--surface); color: var(--ink); }
.btn-ghost:hover { border-color: var(--ink); color: var(--ink); }
.btn-bolt { background: var(--bolt); color: var(--ink); box-shadow: 0 14px 30px -14px rgb(255 198 43 / 70%); }
.btn-bolt:hover { background: #ffd65e; color: var(--ink); transform: translateY(-1px); }

/* hero */
.hero-wrap { position: relative; overflow: hidden; background: radial-gradient(42rem 26rem at 88% 8%, rgb(24 191 211 / 20%), transparent 70%), radial-gradient(34rem 22rem at 0% 100%, rgb(255 198 43 / 18%), transparent 70%); }
.hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); align-items: center; gap: clamp(2.5rem, 5vw, 4.5rem); padding-block: clamp(2.25rem, 6vw, 5.5rem) clamp(3.5rem, 7vw, 6rem); }
.eyebrow { display: inline-flex; align-items: center; gap: .5rem; margin: 0 0 1.25rem; padding: .3rem .85rem .3rem .35rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: .9rem; font-weight: 700; }
.eyebrow .dot { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--bolt); }
.eyebrow svg { width: .95rem; height: .95rem; }
h1 { max-width: 12.5ch; font-size: clamp(2.55rem, 6.2vw, 4.85rem); font-weight: 800; }
.hl { padding-inline: .06em; background: linear-gradient(transparent 60%, rgb(255 198 43 / 85%) 60%, rgb(255 198 43 / 85%) 92%, transparent 92%); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.lead { max-width: 36rem; margin: 1.35rem 0 1.9rem; color: var(--muted); font-size: clamp(1.08rem, 1.7vw, 1.24rem); }
.lead strong { color: var(--ink); }
.cta-row { display: flex; flex-wrap: wrap; gap: .75rem; }
.trust { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; margin: 1.35rem 0 0; padding: 0; color: var(--muted); font-size: .95rem; font-weight: 650; list-style: none; }
.trust li { display: inline-flex; align-items: center; gap: .4rem; }
.trust svg { width: 1.1rem; height: 1.1rem; flex: none; color: var(--teal); }

.stage { position: relative; width: 100%; max-width: 32rem; margin-inline: auto; aspect-ratio: 1 / 1.08; }
.paper { position: absolute; top: 3%; left: 0; width: 66%; max-height: 82%; overflow: hidden; padding: 1.5rem 1.4rem; border-radius: .4rem; background: #fffaf0; color: #3b342a; font-family: var(--serif); font-size: .8rem; line-height: 1.55; box-shadow: 0 1px 0 #efe6d2, 0 30px 60px -28px rgb(60 44 20 / 45%); transform: rotate(-5deg); -webkit-mask-image: linear-gradient(#000 60%, transparent 98%); mask-image: linear-gradient(#000 60%, transparent 98%); }
.paper-head { margin: 0 0 .9rem; color: #8a7a60; font-size: .66rem; letter-spacing: .2em; text-align: center; text-transform: uppercase; }
.paper p { margin: 0; text-align: justify; text-indent: 1.4em; -webkit-hyphens: auto; hyphens: auto; }
.paper::before { position: absolute; top: 44%; left: -15%; width: 130%; height: 1.35rem; border-radius: 3px; background: rgb(255 198 43 / 55%); content: ""; mix-blend-mode: multiply; transform: rotate(33deg); }
.paper::after { position: absolute; top: -30%; right: 0; left: 0; height: 30%; background: linear-gradient(transparent, rgb(24 191 211 / 32%), transparent); content: ""; }
.phone { position: absolute; right: 0; bottom: 0; display: grid; width: 56%; aspect-ratio: 9 / 18.5; padding: .5rem; border-radius: 2.6rem; background: #0e131a; box-shadow: inset 0 0 0 1px #2a313b, 0 40px 80px -30px rgb(8 20 33 / 70%), 0 18px 36px -18px rgb(8 20 33 / 50%); container-type: inline-size; transform: rotate(4deg); }
.screen { position: relative; display: flex; flex-direction: column; overflow: hidden; padding: 12cqi 7cqi 8cqi; border-radius: 2.1rem; background: #2b241a; color: #fff; }
.screen::before { position: absolute; inset: -10%; background: radial-gradient(55% 35% at 30% 28%, #8a7453, transparent 70%), radial-gradient(50% 40% at 75% 72%, #6b5a3f, transparent 70%), #2b241a; content: ""; filter: blur(10px); }
.screen::after { position: absolute; inset: 0; background: rgb(0 0 0 / 60%); content: ""; }
.screen > * { position: relative; z-index: 1; }
.notch { position: absolute; top: 3cqi; left: 36%; width: 28%; height: 6.5cqi; border-radius: 99px; background: #000; }
.s-top { display: flex; align-items: center; justify-content: space-between; }
.s-top svg { width: 7cqi; height: 7cqi; }
.s-count { padding: 1.4cqi 3.6cqi; border-radius: 99px; background: rgb(0 0 0 / 55%); font-size: 4.4cqi; }
.s-chip { align-self: flex-start; margin: 7cqi 0 3.5cqi; padding: 1.2cqi 3cqi; border-radius: 3cqi; background: rgb(0 0 0 / 60%); font-size: 3.9cqi; }
.s-text { margin: 0; font-size: 1rem; font-size: 6.1cqi; line-height: 1.5; text-shadow: 0 1px 8px rgb(0 0 0 / 87%); }
.s-bottom { display: flex; align-items: center; justify-content: center; gap: 3cqi; margin-top: auto; }
.s-next { display: inline-flex; align-items: center; gap: 2cqi; padding: 3.6cqi 7cqi; border-radius: 99px; background: #fff; color: #000; font-size: 4.8cqi; font-weight: 600; }
.s-next svg { width: 5cqi; height: 5cqi; }
.s-again { display: grid; place-items: center; width: 12cqi; height: 12cqi; }
.s-again svg { width: 8cqi; height: 8cqi; }
.badge { position: absolute; bottom: 10%; left: 2%; z-index: 2; display: grid; gap: .1rem; padding: .75rem 1.1rem; border-radius: 1rem; background: var(--bolt); color: var(--ink); box-shadow: 0 18px 30px -16px rgb(120 80 0 / 60%); transform: rotate(-3deg); }
.badge b { font-size: clamp(1.15rem, 2.4vw, 1.5rem); font-weight: 800; letter-spacing: -.02em; white-space: nowrap; }
.badge span { font-size: .8rem; font-weight: 700; }

/* sections */
.section { padding-block: clamp(4rem, 8vw, 6.5rem); }
.section-head { max-width: 46rem; margin-bottom: clamp(2rem, 4vw, 3rem); }
.kicker { margin: 0 0 .85rem; color: var(--teal); font-size: .84rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h2 { font-size: clamp(2rem, 4.2vw, 3.1rem); font-weight: 800; }
.section-head > p:not(.kicker) { margin: 1rem 0 0; color: var(--muted); font-size: 1.12rem; }

/* live demo */
.demo-sec { border-block: 1px solid var(--line); background: var(--surface); }
.demo { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 1.5rem; }
.demo-page { grid-row: 1; grid-column: 1; margin: 0; padding: clamp(1.5rem, 3vw, 2.25rem); border: 1px solid #efe5cf; border-radius: 1.25rem; background: #fffaf0; color: #3b342a; font-family: var(--serif); font-size: 1rem; line-height: 1.65; }
.demo-page figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem 1rem; margin-bottom: 1rem; padding-bottom: .9rem; border-bottom: 1px solid #efe5cf; color: #7a6a50; font-family: var(--sans); font-size: .85rem; font-weight: 650; }
.demo-page p { margin: 0; text-indent: 1.4em; }
.demo-app { position: sticky; top: 5.5rem; grid-row: 1; grid-column: 2; padding: clamp(1.1rem, 2.5vw, 1.6rem); border-radius: 1.5rem; background: radial-gradient(30rem 16rem at 100% 0%, rgb(24 191 211 / 22%), transparent 70%), var(--night); color: #fff; box-shadow: 0 30px 60px -30px rgb(8 20 33 / 60%); }
.demo-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
.seg { display: flex; gap: .25rem; padding: .25rem; border: 1px solid rgb(255 255 255 / 30%); border-radius: 999px; }
.seg label { display: inline-flex; align-items: center; justify-content: center; min-width: 4.4rem; min-height: 44px; padding: .5rem 1rem; border-radius: 999px; font-weight: 700; cursor: pointer; transition: background-color .15s ease, color .15s ease; }
.seg label:hover { background: rgb(255 255 255 / 12%); }
.demo-hint { color: var(--night-muted); font-size: .88rem; }
#lv-low:checked ~ .demo-app label[for="lv-low"],
#lv-high:checked ~ .demo-app label[for="lv-high"],
#lv-max:checked ~ .demo-app label[for="lv-max"] { background: #fff; color: #000; }
#lv-low:focus-visible ~ .demo-app label[for="lv-low"],
#lv-high:focus-visible ~ .demo-app label[for="lv-high"],
#lv-max:focus-visible ~ .demo-app label[for="lv-max"] { outline: 3px solid var(--bolt); outline-offset: 2px; }
.out { display: none; }
#lv-low:checked ~ .demo-app .out-low,
#lv-high:checked ~ .demo-app .out-high,
#lv-max:checked ~ .demo-app .out-max { display: block; }
.out-chip { display: inline-block; margin: 1.35rem 0 .8rem; padding: .25rem .7rem; border-radius: .75rem; background: rgb(255 255 255 / 12%); font-size: .82rem; font-weight: 700; }
.out p { margin: 0 0 .9rem; color: #f4f7fb; font-size: 1.08rem; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; margin: 1.35rem 0 1rem; }
.stats div { padding: .7rem .85rem; border-radius: .9rem; background: rgb(255 255 255 / 7%); }
.stats dt { color: var(--night-muted); font-size: .78rem; font-weight: 650; }
.stats dd { margin: 0; font-size: 1.3rem; font-weight: 800; letter-spacing: -.02em; }
.meter { position: relative; height: .5rem; overflow: hidden; border-radius: 999px; background: rgb(255 255 255 / 12%); }
.meter span { position: absolute; inset-block: 0; left: 0; width: var(--w); border-radius: inherit; background: linear-gradient(90deg, var(--cyan), var(--bolt)); }
.meter-label { display: flex; justify-content: space-between; margin-top: .45rem; color: var(--night-muted); font-size: .8rem; }
.fine { margin: 1.5rem 0 0; color: var(--muted); font-size: .88rem; }

/* benefits */
.benefits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; margin: 0; padding: 0; list-style: none; }
.benefit { padding: clamp(1.4rem, 3vw, 2rem); border: 1px solid var(--line); border-radius: 1.25rem; background: var(--surface); }
.icon { display: grid; place-items: center; width: 3rem; height: 3rem; margin-bottom: 1.1rem; border-radius: .9rem; background: #def4f7; color: var(--teal); }
.benefit:nth-child(even) .icon { background: #fff1c7; color: #8a5a00; }
.icon svg { width: 1.5rem; height: 1.5rem; }
.benefit h3 { margin-bottom: .5rem; font-size: 1.3rem; letter-spacing: -.02em; }
.benefit p { margin: 0; color: var(--muted); }

/* how it works */
.how { padding-top: 0; }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; margin: 0; padding: 0; list-style: none; counter-reset: step; }
.step { padding: 1.6rem 1.5rem; border-radius: 1.25rem; background: #f3eee3; }
.step::before { display: grid; place-items: center; width: 2.4rem; height: 2.4rem; margin-bottom: 1rem; border-radius: 50%; background: var(--ink); color: #fff; content: counter(step); counter-increment: step; font-weight: 800; }
.step h3 { margin-bottom: .45rem; font-size: 1.25rem; letter-spacing: -.02em; }
.step p { margin: 0; color: var(--muted); }

/* languages */
.langs-sec { border-block: 1px solid var(--line); background: var(--surface); }
.langs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; margin: 0; padding: 0; list-style: none; }
.lang { display: flex; flex-direction: column; gap: 1rem; padding: 1.6rem; border: 1px solid var(--line); border-radius: 1.25rem; background: var(--paper); }
.lang-tag { align-self: flex-start; padding: .25rem .75rem; border-radius: 999px; background: var(--ink); color: #fff; font-size: .8rem; font-weight: 700; }
.lang blockquote { margin: 0; font-family: var(--serif); font-size: 1.12rem; line-height: 1.55; }
.lang-src { margin: auto 0 0; color: var(--muted); font-size: .88rem; }

/* faq */
.faq-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 3rem; }
.faq details { border-bottom: 1px solid var(--line); }
.faq details:first-child { border-top: 1px solid var(--line); }
.faq summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 44px; padding: 1.1rem 0; font-size: 1.1rem; font-weight: 750; list-style: none; cursor: pointer; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { flex: none; color: var(--teal); content: "+"; font-size: 1.6rem; font-weight: 400; line-height: 1; transition: transform .2s ease; }
.faq details[open] summary::after { transform: rotate(45deg); }
.faq details p { max-width: 42rem; margin: 0 0 1.25rem; color: var(--muted); }

/* closing */
.closing { padding-block: 0 clamp(4rem, 8vw, 6rem); }
.closing-panel { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2.5rem; padding: clamp(2rem, 6vw, 4.5rem); border-radius: 2rem; background: radial-gradient(40rem 20rem at 100% 0%, rgb(24 191 211 / 32%), transparent 60%), radial-gradient(30rem 18rem at 0% 100%, rgb(255 198 43 / 16%), transparent 60%), var(--night); color: #fff; }
.closing :focus-visible { outline-color: var(--bolt); }
.quote { margin: 0 0 2rem; }
.quote blockquote { margin: 0; color: #dfe9f3; font-family: var(--serif); font-size: clamp(1.25rem, 2.4vw, 1.7rem); line-height: 1.4; }
.quote blockquote p { margin: 0; }
.quote figcaption { margin-top: .6rem; color: var(--night-muted); font-size: .92rem; }
.closing h2 { max-width: 18ch; }
.closing-lede { max-width: 36rem; margin: 1rem 0 1.75rem; color: #c7d3e0; font-size: 1.12rem; }
.closing .trust { color: #c7d3e0; }
.closing .trust svg { color: var(--bolt); }
.qr { display: grid; justify-items: center; gap: .7rem; width: 13rem; margin: 0; padding: 1.1rem 1.1rem 1rem; border-radius: 1.25rem; background: #fff; color: var(--ink); font-size: .88rem; font-weight: 700; line-height: 1.35; text-align: center; }
.qr svg { width: 100%; height: auto; }

/* footer */
.site-footer { border-top: 1px solid var(--line); }
.footer-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem 2rem; padding-block: 1.5rem 2rem; color: var(--muted); font-size: .95rem; }
.footer-inner p { margin: 0; }
.footer-inner nav { display: flex; flex-wrap: wrap; gap: 0 1.5rem; }
.footer-inner nav a { display: inline-block; padding-block: .6rem; }

@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
  .paper::after { animation: scan 2.4s ease-in-out .6s 3 both; }
  .s-text { animation: rise .7s ease-out .3s both; }
}
@keyframes scan { from { top: -30%; } to { top: 110%; } }
@keyframes rise { from { opacity: 0; transform: translateY(.6rem); } to { opacity: 1; transform: none; } }
@media (max-width: 900px), (pointer: coarse) {
  .qr { display: none; }
  .closing-panel { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .hero { grid-template-columns: minmax(0, 1fr); }
  .stage { max-width: 27rem; }
  .demo { grid-template-columns: minmax(0, 1fr); }
  .demo-page, .demo-app { grid-row: auto; grid-column: auto; }
  .demo-app { position: static; }
  .faq-grid { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
}
@media (max-width: 760px) {
  h1 { max-width: none; }
  .steps, .langs, .benefits { grid-template-columns: minmax(0, 1fr); }
  .stage { aspect-ratio: 1 / 1.12; }
  .paper { width: 72%; padding: 1.1rem 1rem; font-size: .7rem; }
  .phone { width: 55%; padding: .4rem; border-radius: 2rem; }
  .screen { border-radius: 1.65rem; }
}
@media (max-width: 480px) {
  .cta-row .btn { flex: 1 1 100%; }
  .stats dd { font-size: 1.1rem; }
}
@media (max-width: 359px) {
  .brand-name { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/"><img src="/icon-192.png" alt="" width="32" height="32"><span class="brand-name">Diagonal Reader</span></a>
    <a class="btn btn-primary btn-sm" href="https://app.diagonalreader.com/">Open the app</a>
  </div>
</header>
<main id="main">
  <div class="hero-wrap">
    <section class="container hero" aria-labelledby="hero-title">
      <div>
        <p class="eyebrow"><span class="dot"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg></span>Read diagonally. Keep the ideas.</p>
        <h1 id="hero-title">Finish the books you keep <span class="hl">meaning to read.</span></h1>
        <p class="lead">Snap any printed page with your phone. Seconds later you're reading it <strong>in half, as a few key points, or as a single sentence</strong>, in the author's own voice and the page's own language. Then turn the page and keep going.</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="https://app.diagonalreader.com/">Start reading free<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
          <a class="btn btn-ghost" href="#demo">See a real page</a>
        </div>
        <ul class="trust">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>No account</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>No card</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>100 free pages every month</li>
        </ul>
      </div>
      <div class="stage" aria-hidden="true">
        <div class="paper">
          <p class="paper-head">I · The Daily Miracle</p>
          <p>You have to live on this twenty-four hours of daily time. Out of it you have to spin health, pleasure, money, content, respect, and the evolution of your immortal soul. Its right use, its most effective use, is a matter of the highest urgency and of the most thrilling actuality. All depends on that. Your happiness—the elusive prize that you are all clutching for, my friends!—depends on that. Strange that the newspapers, so enterprising and up-to-date as they are, are not full of “How to live on a given income of time,” instead of “How to live on a given income of money”! Money is far commoner than time.</p>
          <p>If one can’t contrive to live on a certain income of money, one earns a little more—or steals it, or advertises for it. One doesn’t necessarily muddle one’s life because one can’t quite manage on a thousand pounds a year; one braces the muscles and makes it guineas, and balances the budget.</p>
        </div>
        <div class="phone">
          <div class="screen">
            <span class="notch"></span>
            <div class="s-top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg><span class="s-count">8 / 8</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></div>
            <span class="s-chip">Max</span>
            <p class="s-text">Your happiness, your very life, depends entirely on the proper use of your daily twenty-four hours, yet while money is common and easily adjusted, time is cruelly restricted and we vainly delude ourselves that we will somehow find more of it later.</p>
            <div class="s-bottom"><span class="s-next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Next page</span><span class="s-again"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></span></div>
          </div>
        </div>
        <div class="badge"><b>1½ min → 11 s</b><span>same page, at Max</span></div>
      </div>
    </section>
  </div>

  <section class="section demo-sec" id="demo" aria-labelledby="demo-title">
    <div class="container">
      <div class="section-head">
        <p class="kicker">Real page · real output</p>
        <h2 id="demo-title">You can't make more hours. You can make pages shorter.</h2>
        <p>Here's a page from Arnold Bennett's <cite>How to Live on 24 Hours a Day</cite> (1908) and what Diagonal Reader returned for it. Pick a level and compare.</p>
      </div>
      <div class="demo">
        <input class="sr-only" type="radio" name="level" id="lv-low">
        <input class="sr-only" type="radio" name="level" id="lv-high" checked>
        <input class="sr-only" type="radio" name="level" id="lv-max">
        <div class="demo-app">
          <div class="demo-controls">
            <div class="seg"><label for="lv-low">Low</label><label for="lv-high">High</label><label for="lv-max">Max</label></div>
            <span class="demo-hint">Choose how short</span>
          </div>
          <div aria-live="polite">
            <div class="out out-low">
              <span class="out-chip">Low · about half</span>
              <p>You have to live on these twenty-four hours of daily time. Out of it you must spin health, pleasure, money, content, respect, and the evolution of your immortal soul. Its correct use is a matter of the highest urgency; your happiness depends on that. Strange that newspapers are full of “How to live on a given income of money,” instead of time, when money is the commonest thing there is, encumbering the earth in gross heaps.</p>
              <p>If one cannot live on a certain income of money, one earns more or adjusts. But failing to arrange an income of twenty-four hours to cover expenditure means muddling one’s life definitely, for the supply of time is cruelly restricted. Which of us is free from the uneasy feeling that his daily life is mismanaged, always promising to alter it “when I have a little more time”? We never shall have any more time. We have, and have always had, all the time there is.</p>
              <dl class="stats"><div><dt>Words</dt><dd>161</dd></div><div><dt>Read in</dt><dd>~41 s</dd></div><div><dt>Shorter</dt><dd>54%</dd></div></dl>
              <div class="meter"><span style="--w: 46%"></span></div>
              <div class="meter-label"><span>Length vs. the original page</span><span>46%</span></div>
            </div>
            <div class="out out-high">
              <span class="out-chip">High · the key points</span>
              <p>You have twenty-four hours a day to spin health, pleasure, money, and content—it is the most urgent resource of all, yet newspapers obsess over money instead of the vital income of time. While we easily adjust when money falls short, failing to manage our twenty-four hours leads to a muddling existence, plagued by the eternal, false hope that we will “alter that when I have a little more time.” We never shall have any more time; we have, and have always had, all the time there is.</p>
              <dl class="stats"><div><dt>Words</dt><dd>88</dd></div><div><dt>Read in</dt><dd>~22 s</dd></div><div><dt>Shorter</dt><dd>75%</dd></div></dl>
              <div class="meter"><span style="--w: 25%"></span></div>
              <div class="meter-label"><span>Length vs. the original page</span><span>25%</span></div>
            </div>
            <div class="out out-max">
              <span class="out-chip">Max · one sentence</span>
              <p>Your happiness, your very life, depends entirely on the proper use of your daily twenty-four hours, yet while money is common and easily adjusted, time is cruelly restricted and we vainly delude ourselves that we will somehow find more of it later.</p>
              <dl class="stats"><div><dt>Words</dt><dd>42</dd></div><div><dt>Read in</dt><dd>~11 s</dd></div><div><dt>Shorter</dt><dd>88%</dd></div></dl>
              <div class="meter"><span style="--w: 12%"></span></div>
              <div class="meter-label"><span>Length vs. the original page</span><span>12%</span></div>
            </div>
          </div>
        </div>
        <figure class="demo-page">
          <figcaption><span>The original page</span><span>353 words · about 1½ min</span></figcaption>
          <p>You have to live on this twenty-four hours of daily time. Out of it you have to spin health, pleasure, money, content, respect, and the evolution of your immortal soul. Its right use, its most effective use, is a matter of the highest urgency and of the most thrilling actuality. All depends on that. Your happiness—the elusive prize that you are all clutching for, my friends!—depends on that. Strange that the newspapers, so enterprising and up-to-date as they are, are not full of “How to live on a given income of time,” instead of “How to live on a given income of money”! Money is far commoner than time. When one reflects, one perceives that money is just about the commonest thing there is. It encumbers the earth in gross heaps.</p>
          <p>If one can’t contrive to live on a certain income of money, one earns a little more—or steals it, or advertises for it. One doesn’t necessarily muddle one’s life because one can’t quite manage on a thousand pounds a year; one braces the muscles and makes it guineas, and balances the budget. But if one cannot arrange that an income of twenty-four hours a day shall exactly cover all proper items of expenditure, one does muddle one’s life definitely. The supply of time, though gloriously regular, is cruelly restricted.</p>
          <p>Which of us lives on twenty-four hours a day? And when I say “lives,” I do not mean exists, nor “muddles through.” Which of us is free from that uneasy feeling that the “great spending departments” of his daily life are not managed as they ought to be? Which of us is quite sure that his fine suit is not surmounted by a shameful hat, or that in attending to the crockery he has forgotten the quality of the food? Which of us is not saying to himself—which of us has not been saying to himself all his life: “I shall alter that when I have a little more time”?</p>
          <p>We never shall have any more time. We have, and we have always had, all the time there is.</p>
        </figure>
      </div>
      <p class="fine">Reading times assume 238 words per minute, the average adult silent reading rate for non-fiction (<a href="https://doi.org/10.1016/j.jml.2019.104047">Brysbaert, 2019</a>). Summaries vary slightly each time.</p>
    </div>
  </section>

  <section class="section" aria-labelledby="benefits-title">
    <div class="container">
      <div class="section-head">
        <p class="kicker">What changes</p>
        <h2 id="benefits-title">Be the one who's actually read it.</h2>
        <p>Diagonal Reader turns the ten minutes you do have into real progress through the books you care about.</p>
      </div>
      <ul class="benefits">
        <li class="benefit">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="m9 10 2 2 4-4"/></svg></span>
          <h3>Finish what you start</h3>
          <p>Ten spare minutes can cover a chapter, so books stop stalling at page 40 and start landing on the “read” shelf.</p>
        </li>
        <li class="benefit">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg></span>
          <h3>Walk in prepared</h3>
          <p>The book-club pick, the business book your team keeps quoting, Thursday's seminar reading: have the ideas before the conversation starts.</p>
        </li>
        <li class="benefit">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg></span>
          <h3>Say yes to more books</h3>
          <p>Sample more authors and subjects. Read the ones that grab you cover to cover; take the gist from the rest.</p>
        </li>
        <li class="benefit">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/></svg></span>
          <h3>Crack the dense ones</h3>
          <p>Old prose, textbooks, jargon: switch the voice to Plain language and get the same ideas in everyday words.</p>
        </li>
      </ul>
    </div>
  </section>

  <section class="section how" aria-labelledby="how-title">
    <div class="container">
      <div class="section-head">
        <p class="kicker">How it works</p>
        <h2 id="how-title">Three taps. No sign-up.</h2>
      </div>
      <ol class="steps">
        <li class="step"><h3>Snap the page</h3><p>Open the app in your phone's browser, point the camera at any printed page and tap the shutter.</p></li>
        <li class="step"><h3>Choose how short</h3><p>Low halves it. High keeps the key points. Max gives you one sentence.</p></li>
        <li class="step"><h3>Read, flip, repeat</h3><p>The summary streams in within seconds. Turn the page, snap again, and swipe back through everything you've read.</p></li>
      </ol>
    </div>
  </section>

  <section class="section langs-sec" aria-labelledby="langs-title">
    <div class="container">
      <div class="section-head">
        <p class="kicker">Multilingual</p>
        <h2 id="langs-title">Reads the book's language. Keeps the author's voice.</h2>
        <p>Summaries come back in the language printed on the page. Three real results at Max:</p>
      </div>
      <ul class="langs">
        <li class="lang">
          <span class="lang-tag">Español</span>
          <blockquote lang="es">En un lugar de la Mancha, de cuyo nombre no quiero acordarme, vivía un hidalgo cincuentón, de modesta hacienda y aficionado a la lectura de libros de caballerías hasta el punto de perder el juicio.</blockquote>
          <p class="lang-src">Cervantes, <cite lang="es">Don Quijote</cite> · 266&nbsp;words&nbsp;→&nbsp;35</p>
        </li>
        <li class="lang">
          <span class="lang-tag">Français</span>
          <blockquote lang="fr">En l’année 1872, Phileas Fogg, gentleman énigmatique et impassible aux habitudes aussi régulières qu’inconnues des Londoniens, habitait au numéro 7 de Saville-row.</blockquote>
          <p class="lang-src">Jules Verne, <cite lang="fr">Le Tour du monde en quatre-vingts jours</cite> · 235&nbsp;words&nbsp;→&nbsp;22</p>
        </li>
        <li class="lang">
          <span class="lang-tag">Deutsch</span>
          <blockquote lang="de">Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte, musste er zu seinem Entsetzen feststellen, dass er sich in seinem Bett in ein ungeheueres Ungeziefer verwandelt hatte und all seine verzweifelten Versuche, in seine gewohnte Seitenlage zurückzukehren, kläglich scheiterten.</blockquote>
          <p class="lang-src">Franz Kafka, <cite lang="de">Die Verwandlung</cite> · 249&nbsp;words&nbsp;→&nbsp;39</p>
        </li>
      </ul>
    </div>
  </section>

  <section class="section" aria-labelledby="faq-title">
    <div class="container faq-grid">
      <div>
        <p class="kicker">Questions</p>
        <h2 id="faq-title">Good to know</h2>
      </div>
      <div class="faq">
        <details>
          <summary>Is it really free?</summary>
          <p>Yes. You get 100 pages every month with no account and no card. Reading more than that? Subscribe to Unlimited in the app with one monthly plan, and cancel anytime.</p>
        </details>
        <details>
          <summary>What happens to my photos?</summary>
          <p>Each page is sent to our AI provider only to write your summary and is not stored on our servers. Photos and summaries stay on your device until you delete them. Details are in the <a href="/privacy-policy">Privacy Policy</a>.</p>
        </details>
        <details>
          <summary>Which languages does it read?</summary>
          <p>It writes the summary in the language printed on the page, like the Spanish, French and German examples above.</p>
        </details>
        <details>
          <summary>Does it replace reading the book?</summary>
          <p>It gets you the gist, so more books actually get finished. When a page grabs you, the full text is right there in your hands.</p>
        </details>
        <details>
          <summary>Do I need to install anything?</summary>
          <p>No. It runs in your phone's browser. You can add it to your home screen if you like.</p>
        </details>
      </div>
    </div>
  </section>

  <section class="container closing" aria-labelledby="closing-title">
    <div class="closing-panel">
      <div>
        <figure class="quote">
          <blockquote><p>“We never shall have any more time. We have, and we have always had, all the time there is.”</p></blockquote>
          <figcaption>Arnold Bennett, <cite>How to Live on 24 Hours a Day</cite> (1908)</figcaption>
        </figure>
        <h2 id="closing-title">Your next big idea is one page away.</h2>
        <p class="closing-lede">The pile on your nightstand won't read itself, and every week it waits, the ideas inside stay closed. Try Diagonal Reader on the very next page you pick up.</p>
        <a class="btn btn-bolt" href="https://app.diagonalreader.com/">Start reading free<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        <ul class="trust">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>No account</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>No card</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>100 free pages every month</li>
        </ul>
      </div>
      <figure class="qr">
        <svg viewBox="0 0 33 33" shape-rendering="crispEdges" role="img" aria-label="QR code for app.diagonalreader.com"><path fill="none" stroke="#0b1b33" stroke-width="1" transform="translate(2,2.5)" d="M0,0h7M8,0h1M10,0h1M12,0h1M15,0h2M18,0h3M22,0h7M0,1h1M6,1h1M8,1h5M14,1h2M17,1h1M22,1h1M28,1h1M0,2h1M2,2h3M6,2h1M12,2h4M18,2h3M22,2h1M24,2h3M28,2h1M0,3h1M2,3h3M6,3h1M8,3h1M12,3h1M16,3h2M22,3h1M24,3h3M28,3h1M0,4h1M2,4h3M6,4h1M9,4h1M13,4h1M17,4h1M19,4h1M22,4h1M24,4h3M28,4h1M0,5h1M6,5h1M10,5h2M14,5h1M18,5h2M22,5h1M28,5h1M0,6h7M8,6h1M10,6h1M12,6h1M14,6h1M16,6h1M18,6h1M20,6h1M22,6h7M8,7h3M12,7h3M17,7h1M19,7h2M0,8h1M2,8h2M5,8h3M9,8h1M13,8h2M16,8h5M22,8h1M25,8h1M27,8h2M0,9h2M4,9h2M7,9h2M11,9h1M15,9h2M18,9h7M28,9h1M1,10h1M6,10h2M9,10h1M14,10h2M17,10h2M20,10h2M23,10h2M26,10h2M2,11h1M4,11h1M9,11h1M11,11h1M13,11h3M18,11h3M22,11h3M28,11h1M0,12h3M6,12h1M16,12h2M19,12h1M25,12h2M0,13h1M2,13h2M5,13h1M9,13h1M13,13h1M17,13h3M22,13h2M26,13h3M0,14h2M5,14h3M10,14h2M14,14h1M17,14h1M19,14h2M26,14h3M1,15h1M3,15h1M5,15h1M8,15h1M10,15h1M13,15h1M15,15h1M18,15h1M24,15h1M27,15h1M0,16h2M5,16h2M9,16h4M20,16h2M24,16h2M27,16h1M1,17h2M5,17h1M11,17h1M13,17h1M17,17h1M20,17h1M23,17h1M25,17h3M0,18h1M2,18h2M6,18h7M17,18h1M21,18h1M24,18h1M26,18h1M4,19h2M9,19h4M15,19h3M19,19h1M21,19h1M23,19h1M26,19h1M1,20h2M4,20h1M6,20h6M13,20h1M15,20h4M20,20h7M8,21h2M11,21h1M13,21h3M18,21h1M20,21h1M24,21h5M0,22h7M8,22h2M11,22h1M13,22h1M16,22h1M19,22h2M22,22h1M24,22h2M27,22h1M0,23h1M6,23h1M8,23h1M11,23h1M15,23h1M18,23h1M20,23h1M24,23h2M27,23h1M0,24h1M2,24h3M6,24h1M9,24h4M14,24h1M17,24h1M20,24h5M26,24h1M28,24h1M0,25h1M2,25h3M6,25h1M8,25h1M13,25h3M19,25h1M21,25h1M24,25h2M27,25h1M0,26h1M2,26h3M6,26h1M8,26h2M11,26h2M14,26h1M17,26h2M20,26h1M23,26h1M26,26h1M28,26h1M0,27h1M6,27h1M9,27h2M12,27h2M15,27h2M20,27h1M23,27h3M27,27h1M0,28h7M8,28h2M12,28h4M18,28h6M27,28h1"/></svg>
        <figcaption>On a computer? Scan to open it on your phone.</figcaption>
      </figure>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <p>Diagonal Reader · made for people with more books than time.</p>
    <nav aria-label="Legal">
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/data-deletion">Data deletion</a>
    </nav>
  </div>
</footer>
</body>
</html>`;
