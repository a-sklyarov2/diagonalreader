/** Fullscreen camera: pick a level, hit the shutter, read the page. */

import { ApiError } from './api';
import type { Level } from './api';
import { Billing } from './billing';
import { getVoice } from './prefs';
import { ReadingSession } from './session';
import type { SummaryPage } from './session';
import { snackbar } from './ui';

const LEVELS: Level[] = ['low', 'high', 'max'];

export interface CameraDeps {
  fetchFixture?: () => Promise<Blob>;
}

export class CameraView {
  private root: HTMLElement;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private level: Level = 'high';
  private capturing = false;
  private ready = false;
  private cameraError: string | null = null;
  private pillLabel = '…';
  private pillVisible = false;
  private unsubBilling: (() => void) | null = null;
  private destroyed = false;
  constructor(
    private app: HTMLElement,
    private session: ReadingSession,
    private billing: Billing,
    private onCapture: (page: SummaryPage, index: number) => void,
    private onLibrary: () => void,
    private deps: CameraDeps = {},
  ) {
    this.root = document.createElement('div');
    this.root.className = 'camera';
  }

  mount(): void {
    this.app.appendChild(this.root);
    this.render();
    this.unsubBilling = this.billing.onChange(() => {
      if (this.destroyed) return;
      this.syncPill();
    });
    this.syncPill();
    void this.billing.refreshQuota();
    void this.initCamera();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubBilling?.();
    this.stopStream();
    this.root.remove();
  }

  refresh(): void {
    if (this.destroyed) return;
    this.syncPill();
    this.render();
  }

  private syncPill(): void {
    const quota = this.billing.quota;
    this.pillVisible = this.billing.ready;
    this.pillLabel = quota?.pillLabel ?? '…';
    this.renderPill();
  }

  private async initCamera(): Promise<void> {
    try {
      // Ask for 1080p but keep the native landscape stream: the
      // capture path is a canvas grab of these exact frames, so
      // preview and photo share one resolution by construction.
      // `ideal` (never `exact`) keeps older devices working.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (this.destroyed) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      if (stream.getVideoTracks().length === 0) {
        throw new Error('no video track');
      }
      this.stream = stream;
      this.ready = true;
      // Book pages need near-focus locked continuously; without this
      // some phones sit at hyperfocal/infinity and text never sharpens.
      void this.tuneFocus(stream.getVideoTracks()[0]);
    } catch (e) {
      this.ready = true;
      // No camera hardware (headless/desktop without webcam) is not
      // fatal — fall through to the demo fixture fallback. Denied
      // permission and other failures stay a visible inline error.
      const name = e instanceof DOMException ? e.name : '';
      const msg = e instanceof Error ? e.message : `${e}`;
      const noDevice =
        name === 'NotFoundError' ||
        name === 'OverconstrainedError' ||
        /not found|no video track/i.test(msg);
      this.cameraError = noDevice ? null : msg;
    }
    this.render();
  }

  private async tuneFocus(track: MediaStreamTrack): Promise<void> {
    try {
      const caps = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { focusMode?: string[] })
        | undefined;
      if (caps?.focusMode && !caps.focusMode.includes('continuous')) {
        return;
      }
      // focusMode is a real device constraint but missing from this
      // TS lib — spread through an extension record instead of
      // widening the whole constraint type.
      const ext: Record<string, string> = { focusMode: 'continuous' };
      await track.applyConstraints({ advanced: [ext] });
    } catch {
      // Unsupported on this device/browser — preview still works,
      // just with the default focus behavior.
    }
  }

  /** Single-shot refocus where the user tapped (point of interest). */
  private async focusAt(track: MediaStreamTrack): Promise<void> {
    try {
      const single: Record<string, string> = { focusMode: 'single-shot' };
      const cont: Record<string, string> = { focusMode: 'continuous' };
      await track.applyConstraints({ advanced: [single] });
      await track.applyConstraints({ advanced: [cont] });
    } catch {
      // Not supported — continuous mode (or default) keeps running.
    }
  }

  private stopStream(): void {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.video = null;
  }

  private onPillTap(): void {
    if (!this.billing.ready) return;
    // The cog means settings: open the Library sheet (usage,
    // subscription, reading prefs). Checkout lives there as an
    // explicit button — never an auto-redirect from here.
    this.onLibrary();
  }

  /**
   * Capture exactly the frames on screen: draw the live video element
   * to a canvas at its native decoded size and encode that. Preview
   * and photo share one source by construction, so framing is WYSIWYG
   * with no crop math. Deliberately no `ImageCapture.takePhoto()`: it
   * returns the full sensor frame (different lens/resolution), which
   * is what made captures wider than the preview.
   */
  private async grabFrame(): Promise<Blob> {
    if (this.video && this.stream) {
      const w = this.video.videoWidth;
      const h = this.video.videoHeight;
      if (w > 0 && h > 0) {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(this.video, 0, 0, w, h);
          const blob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: 0.92,
          });
          if (blob) return blob;
        }
      }
      throw new Error('No picture returned');
    }
    if (this.deps.fetchFixture) return this.deps.fetchFixture();
    throw new Error('No picture returned');
  }
  private async capture(): Promise<void> {
    if (this.capturing) return;
    // Allowance first, outside the capture spinner: subscribing can
    // take a while and shouldn't look like a stuck photo capture.
    const allowed = await this.billing.ensureAllowance();
    if (!allowed) {
      // Free exhaustion opens the Library (usage + subscribe CTA);
      // guardrail/quota-fetch failures stay a snackbar.
      const denial = this.billing.quota?.denial;
      if (denial === 'free') {
        this.onLibrary();
      } else {
        snackbar(
          this.billing.lastError ?? 'Out of pages — subscribe to keep reading.',
        );
      }
      return;
    }
    this.capturing = true;
    this.render();
    try {
      const blob = await this.grabFrame();
      const page = await this.session.startPage(
        blob,
        this.level,
        getVoice(),
      );
      const index = this.session.pages.indexOf(page);
      // The page was paid for while the reader is open — refresh on
      // return so the pill increments immediately.
      this.onCapture(page, index);
      await this.billing.refreshQuota();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.excerpt
          : e instanceof Error
            ? e.message
            : `${e}`;
      snackbar(`Capture failed: ${msg}`);
    } finally {
      this.capturing = false;
      if (!this.destroyed) this.render();
    }
  }

  private render(): void {
    if (this.destroyed) return;
    this.root.innerHTML = '';

    if (this.cameraError !== null) {
      const err = document.createElement('div');
      err.className = 'camera-error';
      err.dataset.testid = 'cameraError';
      err.textContent = `Camera error: ${this.cameraError}`;
      this.root.appendChild(err);
    } else if (!this.ready) {
      const loading = document.createElement('div');
      loading.className = 'camera-error';
      loading.dataset.testid = 'cameraLoading';
      loading.textContent = 'Starting camera…';
      this.root.appendChild(loading);
    } else if (this.stream) {
      const video = document.createElement('video');
      video.className = 'camera-video';
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      const attached = this.video;
      if (attached?.srcObject === this.stream) {
        this.video = attached;
      } else {
        video.srcObject = this.stream;
        void video.play().catch(() => undefined);
        this.video = video;
      }
      // Tap the preview to refocus (single-shot, then back to
      // continuous) — helps on pages that never sharpen on their own.
      this.video.onclick = () => {
        const track = this.stream?.getVideoTracks()[0];
        if (track) void this.focusAt(track);
      };
      this.root.appendChild(this.video);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'camera-fallback';
      fallback.dataset.testid = 'fakePreview';
      const icon = document.createElement('div');
      icon.className = 'book-icon';
      icon.textContent = '📖';
      const label = document.createElement('div');
      label.textContent = 'Demo camera — sample page photo';
      fallback.append(icon, label);
      this.root.appendChild(fallback);
    }

    const title = document.createElement('div');
    title.className = 'camera-title';
    title.textContent = 'DIAGONAL READER';
    this.root.appendChild(title);

    this.renderPill();

    if (this.cameraError === null && this.ready) {
      const controls = document.createElement('div');
      controls.className = 'camera-controls';

      const seg = document.createElement('div');
      seg.className = 'segmented';
      seg.setAttribute('role', 'group');
      for (const level of LEVELS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent =
          level === 'low' ? 'Low' : level === 'high' ? 'High' : 'Max';
        btn.setAttribute('aria-pressed', `${this.level === level}`);
        btn.addEventListener('click', () => {
          this.level = level;
          this.render();
        });
        seg.appendChild(btn);
      }
      controls.appendChild(seg);

      const shutter = document.createElement('button');
      shutter.type = 'button';
      shutter.className = `shutter${this.capturing ? ' capturing' : ''}`;
      shutter.dataset.testid = 'captureButton';
      shutter.disabled = this.capturing;
      shutter.setAttribute('aria-label', 'Capture page');
      if (this.capturing) {
        const spin = document.createElement('div');
        spin.className = 'spinner';
        shutter.appendChild(spin);
      } else {
        const inner = document.createElement('div');
        inner.className = 'shutter-inner';
        shutter.appendChild(inner);
      }
      shutter.addEventListener('click', () => void this.capture());
      controls.appendChild(shutter);

      if (!this.stream && this.deps.fetchFixture) {
        const demo = document.createElement('button');
        demo.type = 'button';
        demo.className = 'demo-btn';
        demo.textContent = 'Use sample page photo';
        demo.addEventListener('click', () => void this.capture());
        controls.appendChild(demo);
      }

      this.root.appendChild(controls);
    }
  }

  private renderPill(): void {
    this.root.querySelector('.quota-pill')?.remove();
    if (!this.pillVisible) return;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'quota-pill';
    pill.dataset.testid = 'quotaPill';
    pill.setAttribute('aria-label', 'Open library');
    const label = document.createElement('span');
    label.textContent = this.pillLabel;
    const gear = document.createElement('span');
    gear.className = 'gear';
    gear.textContent = '⚙';
    pill.append(label, gear);
    // The whole pill opens the Library sheet — id dialog and
    // checkout moved there as explicit rows/buttons.
    pill.addEventListener('click', () => this.onPillTap());
    this.root.appendChild(pill);
  }
}
