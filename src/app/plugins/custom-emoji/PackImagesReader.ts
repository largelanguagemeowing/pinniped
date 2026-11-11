import { PackImageReader } from './PackImageReader';
import { PackImages } from './types';

export class PackImagesReader {
  private readonly rawImages: PackImages;

  private readonly perImageUsage: boolean;

  private shortcodeToImages: Map<string, PackImageReader> | undefined;

  constructor(images: PackImages, perImageUsage: boolean) {
    this.rawImages = images;
    this.perImageUsage = perImageUsage;
  }

  get collection(): Map<string, PackImageReader> {
    if (this.shortcodeToImages) return this.shortcodeToImages;

    const shortcodeToImages: Map<string, PackImageReader> = new Map();

    Object.entries(this.rawImages).forEach(([shortcode, image]) => {
      const imageReader = PackImageReader.fromPackImage(
        shortcode,
        this.perImageUsage ? image : { ...image, usage: undefined }
      );
      if (imageReader) {
        shortcodeToImages.set(shortcode, imageReader);
      }
    });

    this.shortcodeToImages = shortcodeToImages;
    return this.shortcodeToImages;
  }
}
