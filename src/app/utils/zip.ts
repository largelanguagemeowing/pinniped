import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { MatrixClient } from 'matrix-js-sdk';
import { ImagePack } from '../plugins/custom-emoji';
import { downloadMedia, mxcUrlToHttp } from './matrix';
import { mimeTypeToSafeExt } from './mimeTypes';

const sanitizeFileName = (name: string): string => {
  const cleaned = name.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 64) || 'set';
};

/**
 * Downloads every image in the given image pack as a single .zip archive.
 * Each image is stored under its shortcode, with an extension derived from
 * the image's mime type (falling back to the blob's content-type).
 */
export const downloadImagePackZip = async (
  mx: MatrixClient,
  useAuthentication: boolean,
  pack: ImagePack
): Promise<void> => {
  const images = Array.from(pack.images.collection.values());
  if (images.length === 0) return;

  const zip = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    images.map(async (image) => {
      const httpUrl = mxcUrlToHttp(mx, image.url, useAuthentication);
      if (!httpUrl) throw new Error(`Could not resolve URL for ${image.shortcode}`);

      const blob = await downloadMedia(httpUrl);
      const ext = mimeTypeToSafeExt(image.info?.mimetype || blob.type || '');
      const base = (image.shortcode || 'image').replace(/[/\\]/g, '_');
      let name = ext ? `${base}.${ext}` : base;

      let suffix = 1;
      while (usedNames.has(name.toLowerCase())) {
        name = ext ? `${base}-${suffix}.${ext}` : `${base}-${suffix}`;
        suffix += 1;
      }
      usedNames.add(name.toLowerCase());
      zip.file(name, blob);
    })
  );

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const fileName = `${sanitizeFileName(pack.meta.name ?? pack.id)}.zip`;
  FileSaver.saveAs(zipBlob, fileName);
};
