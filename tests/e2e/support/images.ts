import type { Page } from '@playwright/test';

/** A 64x64 PNG of one color, drawn in the page. */
export const solidPng = (page: Page, color: string): Promise<number[]> =>
  page.evaluate(async (fill) => {
    const canvas = new OffscreenCanvas(64, 64);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas');
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 64);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, color);
