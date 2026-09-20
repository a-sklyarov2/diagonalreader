/** Fullscreen camera: pick a level, hit the shutter, read the page. */

import { ApiError } from './api';
import type { Level } from './api';
import { Billing } from './billing';
import { ReadingSession } from './session';
import type { SummaryPage } from './session';
import { showDialog, snackbar } from './ui';

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
  private longPressTimer = 0;
  private destroyed = false;

  constructor(
    private app: HTMLElement,
    private session: ReadingSession,
    private billing: Billing,
    private onCapture: (page: SummaryPage, index: number) => void,
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
    window.clearTimeout(this.longPressTimer);
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
      // Portrait-first: pages are framed upright, so ask for a
      // portrait stream. A landscape stream in a portrait viewport
      // forces `object-fit: cover` to throw away most of the frame
      // (the crop mismatch you're seeing). `ideal` (never `exact`)
      // keeps older devices working at their own max.
      const portrait = window.innerHeight >= window.innerWidth;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: portrait
          ? {
              facingMode: 'environment',
              width: { ideal: 1080 },
              height: { ideal: 1920 },
            }
          : {
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

  private showUserIdDialog(extra?: string): void {
    const lines = [this.session.userId];
    if (extra) lines.push(extra);
    showDialog('User ID', lines, [
      {
        label: 'Copy',
        onClick: () => {
          void navigator.clipboard
            ?.writeText(this.session.userId)
            .catch(() => undefined);
        },
      },
      { label: 'Close' },
    ]);
  }

  private async onPillTap(): Promise<void> {
    if (!this.billing.ready) return;
    if (this.billing.quota === null) {
      this.showUserIdDialog(
        this.billing.quotaError ?? 'quota unavailable',
      );
      return;
    }
    try {
      await this.billing.pillAction();
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      if (msg.startsWith('redirecting')) return;
      snackbar(msg);
    }
  }

  private async grabFrame(): Promise<Blob> {
    if (this.video && this.stream) {
      const track = this.stream.getVideoTracks()[0];
      const capture = (
        window as unknown as {
          ImageCapture?: new (t: MediaStreamTrack) => {
            takePhoto: () => Promise<Blob>;
          };
        }
      ).ImageCapture;
      if (typeof capture !== 'undefined' && track) {
        try {
          const photo = await new capture(track).takePhoto();
          // takePhoto() returns the full sensor frame, which is wider
          // than the `object-fit: cover` preview — crop the photo to
          // exactly what was on screen so framing is WYSIWYG.
          return await this.cropToVisible(photo);
        } catch {
          // Fall through to canvas grab.
        }
      }
      // Canvas grab is already WYSIWYG: videoWidth/Height is the full
      // decoded frame, so crop it to the displayed cover rect too.
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      if (vw > 0 && vh > 0) {
        const rect = this.visibleRect(vw, vh);
        const canvas = new OffscreenCanvas(rect.sw, rect.sh);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(
            this.video,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            0,
            0,
            rect.sw,
            rect.sh,
          );
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

  /**
   * The `object-fit: cover` rect actually shown on screen, in source
   * pixels: scale the frame to fill the element box, then center-crop
   * the overflow. Same math the browser uses to render the preview.
   */
  private visibleRect(
    frameW: number,
    frameH: number,
  ): { sx: number; sy: number; sw: number; sh: number } {
    const el = this.video;
    const boxW = el?.clientWidth ?? frameW;
    const boxH = el?.clientHeight ?? frameH;
    const scale = Math.max(boxW / frameW, boxH / frameH);
    const shownW = boxW / scale;
    const shownH = boxH / scale;
    const sx = Math.max(0, Math.round((frameW - shownW) / 2));
    const sy = Math.max(0, Math.round((frameH - shownH) / 2));
    return {
      sx,
      sy,
      sw: Math.min(frameW - sx, Math.round(shownW)),
      sh: Math.min(frameH - sy, Math.round(shownH)),
    };
  }

  private async cropToVisible(photo: Blob): Promise<Blob> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(photo, {
        imageOrientation: 'from-image',
      });
    } catch {
      return photo;
    }
    try {
      const rect = this.visibleRect(bitmap.width, bitmap.height);
      // Photo and preview aspect already match (e.g. fixture shots)
      // — skip the crop instead of shaving rounding pixels.
      if (
        rect.sx === 0 &&
        rect.sy === 0 &&
        rect.sw === bitmap.width &&
        rect.sh === bitmap.height
      ) {
        return photo;
      }
      const canvas = new OffscreenCanvas(rect.sw, rect.sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) return photo;
      ctx.drawImage(
        bitmap,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        0,
        0,
        rect.sw,
        rect.sh,
      );
      const cropped = await canvas.convertToBlob({ type: 'image/jpeg' });
      return cropped ?? photo;
    } finally {
      bitmap.close();
    }
  }

  private async capture(): Promise<void> {
    if (this.capturing) return;
    // Allowance first, outside the capture spinner: subscribing can
    // take a while and shouldn't look like a stuck photo capture.
    const allowed = await this.billing.ensureAllowance();
    if (!allowed) {
      snackbar(this.billing.lastError ?? 'Out of pages — subscribe to keep reading.');
      // Subscriber portal flow refreshes on return; free users land
      // on checkout via the pill.
      if (this.billing.quota === null) {
        this.showUserIdDialog(
          this.billing.quotaError ?? 'quota unavailable',
        );
      }
      return;
    }
    this.capturing = true;
    this.render();
    try {
      const blob = await this.grabFrame();
      const page = await this.session.startPage(blob, this.level);
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
    const label = document.createElement('span');
    label.textContent = this.pillLabel;
    const gear = document.createElement('span');
    gear.className = 'gear';
    gear.textContent = '⚙';
    pill.append(label, gear);
    pill.addEventListener('click', () => void this.onPillTap());
    pill.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showUserIdDialog();
    });
    pill.addEventListener('pointerdown', () => {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = window.setTimeout(
        () => this.showUserIdDialog(),
        600,
      );
    });
    pill.addEventListener('pointerup', () => {
      window.clearTimeout(this.longPressTimer);
    });
    this.root.appendChild(pill);
  }
}
