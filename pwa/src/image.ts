/**
 * Downscale a captured page photo for upload: bakes EXIF orientation,
 * limits the long edge to 1600px, re-encodes as JPEG q0.75.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.75;

export async function preparePageImage(source: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, {
      imageOrientation: 'from-image',
    });
  } catch {
    throw new Error('Could not decode image');
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not decode image');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: QUALITY,
    });
    if (!blob) throw new Error('Could not decode image');
    return blob;
  } finally {
    bitmap.close();
  }
}
