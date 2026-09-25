/**
 * Static site served by the worker on the apex domain:
 * GET /privacy-policy → the store-listing privacy policy.
 * GET /data-deletion → how to delete data (no accounts).
 * GET /              → minimal landing page (PWA lives on app.*).
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
<title>Diagonal Reader — Make room for more books</title>
<meta name="description" content="Photograph a book page, get a shorter summary in the author's voice, and keep reading. Try Diagonal Reader free; no account needed.">
<link rel="canonical" href="https://diagonalreader.com/">
<meta name="theme-color" content="#f7faf8">
<link rel="icon" href="/icon-192.png" type="image/png">
<style>
:root {
  color-scheme: light;
  --background: #f7faf8;
  --surface: #fff;
  --ink: #172b33;
  --muted: #506269;
  --teal: #0b5f6d;
  --divider: #d7e5e3;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--ink); line-height: 1.55; }
a { color: var(--teal); }
a:hover { color: #084b57; }
a:focus-visible { outline: 3px solid var(--ink); outline-offset: 4px; }
.container { max-width: 70rem; margin-inline: auto; padding-inline: 1.5rem; }
.skip-link {
  position: absolute;
  z-index: 1;
  top: -5rem;
  left: 1rem;
  padding: .7rem 1rem;
  border-radius: .5rem;
  background: var(--surface);
  font-weight: 700;
}
.skip-link:focus { top: 1rem; }
.site-header { border-bottom: 1px solid var(--divider); background: var(--surface); }
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-block: 1rem; }
.wordmark { font-size: 1.1rem; font-weight: 800; letter-spacing: -.03em; white-space: nowrap; }
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: .7rem 1.4rem;
  border-radius: 999px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
}
.pill-primary { background: var(--teal); color: #fff; }
.pill-primary:hover { background: #084b57; color: #fff; }
.pill-outline { border: 1px solid var(--teal); color: var(--teal); }
.pill-outline:hover { background: #eaf4f1; }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  align-items: center;
  gap: clamp(2rem, 5vw, 5rem);
  padding-block: clamp(3.5rem, 8vw, 7rem);
}
.hero-copy { max-width: 40rem; }
.eyebrow { margin: 0 0 1rem; color: var(--teal); font-size: .9rem; font-weight: 750; letter-spacing: .035em; }
h1, h2, h3 { line-height: 1.15; letter-spacing: -.04em; }
h1 { max-width: 13ch; margin: 0 0 1.5rem; font-size: clamp(2.75rem, 5vw, 4.6rem); }
.lead { max-width: 38rem; margin: 0 0 1.75rem; color: var(--muted); font-size: clamp(1.05rem, 2vw, 1.2rem); line-height: 1.65; }
.reassurance { margin: .85rem 0 0; color: var(--muted); font-size: .95rem; font-weight: 600; }
.illustration {
  position: relative;
  width: 100%;
  aspect-ratio: 1.12;
  overflow: hidden;
  border: 1px solid var(--divider);
  border-radius: 1.75rem;
  background: #e7f2ef;
}
.page {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: .8rem;
  border-radius: .85rem;
  background: var(--surface);
  box-shadow: 0 18px 40px rgb(23 43 51 / 12%);
}
.page-large { top: 11%; left: 18%; width: 54%; aspect-ratio: 250 / 310; padding: 11% 8%; }
.page-small { right: 9%; bottom: 10%; width: 41%; aspect-ratio: 1; padding: 10% 6%; }
.line { display: block; flex: none; height: .4rem; border-radius: 999px; background: #d7e5e3; }
.line:nth-child(even) { width: 84%; }
.line:last-child { width: 63%; }
.page-small::after {
  position: absolute;
  top: 53%;
  left: 21%;
  width: 65%;
  height: .4rem;
  border-radius: 999px;
  background: var(--teal);
  content: "";
  transform: rotate(-32deg);
}
.why { border-top: 1px solid var(--divider); padding-block: 4.5rem; }
.why-intro { max-width: 44rem; margin-bottom: 2.75rem; }
h2 { margin: 0 0 1rem; font-size: clamp(2rem, 3vw, 2.9rem); }
.why-intro p, .closing p { margin: 0; color: var(--muted); font-size: 1.1rem; }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; margin: 0; padding: 0; list-style: none; }
.step { padding: 1.75rem; border: 1px solid var(--divider); border-radius: 1.25rem; background: var(--surface); }
.step::before { display: block; width: 2.25rem; height: .25rem; margin-bottom: 1.5rem; border-radius: 999px; background: var(--teal); content: ""; }
.step h3 { margin: 0 0 .7rem; font-size: 1.25rem; }
.step p { margin: 0; color: var(--muted); }
.closing { padding-block: 1rem 5rem; }
.closing-panel { padding: clamp(2.5rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 3rem); border: 1px solid var(--divider); border-radius: 1.75rem; background: #eaf4f1; text-align: center; }
.closing h2 { max-width: 24ch; margin-inline: auto; }
.closing p { margin-bottom: 1.75rem; }
.site-footer { border-top: 1px solid var(--divider); background: var(--surface); }
.footer-inner { padding-block: 1.75rem; }
.footer-inner nav { display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; }
.footer-inner a { text-underline-offset: .2em; }
@media (max-width: 760px) {
  .hero { grid-template-columns: 1fr; gap: 2.75rem; padding-block: 3rem 4rem; }
  .illustration { max-width: 30rem; margin-inline: auto; }
  .why { padding-block: 3rem; }
  .steps { grid-template-columns: 1fr; }
  .step { padding: 1.5rem; }
  .closing { padding-block: 0 3.5rem; }
}
@media (max-width: 420px) {
  .wordmark { font-size: 1rem; }
  .header-inner { gap: .5rem; }
  .header-inner .pill { padding-inline: 1rem; }
}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <span class="wordmark">Diagonal Reader</span>
    <a class="pill pill-outline" href="https://app.diagonalreader.com/">Open the app</a>
  </div>
</header>
<main id="main">
  <section class="container hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow">A little more room for reading</p>
      <h1 id="hero-title">More books. More ideas. Same 24 hours.</h1>
      <p class="lead">Books are full of ideas. Busy days are full of everything else. Diagonal Reader exists so “I'll read it someday” doesn't have to stay someday: photograph a page, get a shorter version in the author's voice, and keep going.</p>
      <a class="pill pill-primary" href="https://app.diagonalreader.com/">Try it free</a>
      <p class="reassurance">No account needed · 100 free pages every month</p>
    </div>
    <div class="illustration" aria-hidden="true">
      <div class="page page-large">
        <span class="line"></span><span class="line"></span><span class="line"></span>
        <span class="line"></span><span class="line"></span><span class="line"></span>
      </div>
      <div class="page page-small">
        <span class="line"></span><span class="line"></span><span class="line"></span>
      </div>
    </div>
  </section>
  <section class="container why" aria-labelledby="why-title">
    <div class="why-intro">
      <h2 id="why-title">“Someday” is a terrible bookmark.</h2>
      <p>You don't need to rush a book to make progress. You just need a way back into it when time is short.</p>
    </div>
    <ol class="steps">
      <li class="step"><h3>Snap a page</h3><p>Point your camera at the page in front of you.</p></li>
      <li class="step"><h3>Pick your pace</h3><p>Choose Low, High, or Max to decide how short it gets.</p></li>
      <li class="step"><h3>Keep the thread</h3><p>Find the gist in the page's own language and voice, and carry the idea forward.</p></li>
    </ol>
  </section>
  <section class="container closing" aria-labelledby="closing-title">
    <div class="closing-panel">
      <h2 id="closing-title">The next idea you love might be one page away.</h2>
      <p>Make more room for curiosity, without asking your day for more hours.</p>
      <a class="pill pill-primary" href="https://app.diagonalreader.com/">Open Diagonal Reader</a>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <nav aria-label="Legal">
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/data-deletion">Data deletion</a>
    </nav>
  </div>
</footer>
</body>
</html>`;
