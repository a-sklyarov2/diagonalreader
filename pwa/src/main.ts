/** App shell: camera ⇄ reader, Library sheet, Stripe return toasts. */

import { ApiError } from './api';
import { Billing } from './billing';
import { CameraView } from './camera';
import { getUserId } from './identity';
import { LibraryView } from './library';
import { ReadingSession } from './session';
import { ReaderView } from './reader';
import { showDialog, snackbar } from './ui';
import './styles.css';

const PENDING_RECOVERY_KEY = 'diagonal_pending_recovery';

const FIXTURE_URL = 'e2e-fixtures/page1.jpg';

function toastForCheckout(params: URLSearchParams): string | null {
  const result = params.get('checkout');
  if (result === 'success') return 'Subscription active — happy reading.';
  if (result === 'cancelled') return 'Checkout cancelled.';
  return null;
}

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) throw new Error('missing #app');

  const userId = getUserId();
  const session = new ReadingSession(userId);
  const billing = new Billing(userId);
  await session.restore();

  const params = new URLSearchParams(window.location.search);
  const toast = toastForCheckout(params);
  // Stripe redirects back immediately after payment while the webhook
  // is still in flight — refresh once so a just-activated
  // subscription flips the pill instead of showing stale free counts.
  // Failure keeps the old quota (offline/Airplane) and the toast
  // still explains the outcome.
  if (toast) {
    snackbar(toast);
    params.delete('checkout');
    const clean =
      params.size > 0
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
    window.history.replaceState(null, '', clean);
    await billing.refreshQuota();
    if (toast.startsWith('Subscription active')) {
      let stashed: string | null = null;
      try {
        stashed = localStorage.getItem(PENDING_RECOVERY_KEY);
        localStorage.removeItem(PENDING_RECOVERY_KEY);
      } catch {
        stashed = null;
      }
      if (stashed) {
        showDialog(
          'Subscription active',
          [
            `Your recovery code: ${stashed}`,
            'Save it somewhere safe — email it to yourself.',
            'You can also find it later in the Library, or at the bottom of your purchase confirmation email.',
          ],
          [{ label: 'Done' }],
        );
      }
    }
  }

  let camera: CameraView | null = null;
  let reader: ReaderView | null = null;
  let library: LibraryView | null = null;

  // The Library is a sheet over whichever view is live — closing
  // returns to it, no navigation state lost.
  const showLibrary = (): void => {
    if (library) return;
    library = new LibraryView(app, billing, userId, () => {
      library?.destroy();
      library = null;
    });
    library.mount();
  };

  const showCamera = (): void => {
    reader?.destroy();
    reader = null;
    camera?.destroy();
    camera = new CameraView(
      app,
      session,
      billing,
      (_page, index) => showReader(index),
      () => showLibrary(),
      {
        fetchFixture: async () => {
          const res = await fetch(FIXTURE_URL);
          if (!res.ok) throw new ApiError(res.status, 'fixture missing');
          return res.blob();
        },
      },
    );
    camera.mount();
    void billing.refreshQuota();
  };

  const showReader = (index: number): void => {
    if (session.pages.length === 0) {
      showCamera();
      return;
    }
    camera?.destroy();
    camera = null;
    reader?.destroy();
    reader = new ReaderView(
      app,
      session,
      billing,
      index,
      () => showCamera(),
      () => showCamera(),
      () => showLibrary(),
    );
    reader.mount();
  };

  showCamera();
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : `${e}`;
  document.querySelector('#app')?.append(`Boot failed: ${msg}`);
});
