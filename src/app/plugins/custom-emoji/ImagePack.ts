import { MatrixEvent } from 'matrix-js-sdk';
import { PackAddress } from './PackAddress';
import { roomPackFormatOf } from './PackFormat';
import { PackImageReader } from './PackImageReader';
import { PackImagesReader } from './PackImagesReader';
import { PackMetaReader } from './PackMetaReader';
import { ImageUsage, PackContent } from './types';

export class ImagePack {
  public readonly id: string;

  public readonly deleted: boolean;

  public readonly address: PackAddress | undefined;

  /** Whether images may override the pack's usage. */
  public readonly perImageUsage: boolean;

  public readonly meta: PackMetaReader;

  public readonly images: PackImagesReader;

  private emoticonMemo: PackImageReader[] | undefined;

  private stickerMemo: PackImageReader[] | undefined;

  constructor(id: string, content: PackContent, address: PackAddress | undefined) {
    this.id = id;

    this.address = address;
    // without an address this is the personal pack, which only exists as im.ponies.user_emotes
    this.perImageUsage = address ? address.format.perImageUsage : true;

    this.deleted = content.pack === undefined && content.images === undefined;

    this.meta = new PackMetaReader(content.pack ?? {});
    this.images = new PackImagesReader(content.images ?? {}, this.perImageUsage);
  }

  static fromMatrixEvent(id: string, matrixEvent: MatrixEvent) {
    const roomId = matrixEvent.getRoomId();
    const stateKey = matrixEvent.getStateKey();
    const format = roomPackFormatOf(matrixEvent.getType());

    const address =
      roomId && typeof stateKey === 'string' && format
        ? new PackAddress(roomId, stateKey, format)
        : undefined;

    const content = matrixEvent.getContent<PackContent>();

    const imagePack: ImagePack = new ImagePack(id, content, address);

    return imagePack;
  }

  public getImages(usage: ImageUsage): PackImageReader[] {
    if (usage === ImageUsage.Emoticon && this.emoticonMemo) {
      return this.emoticonMemo;
    }
    if (usage === ImageUsage.Sticker && this.stickerMemo) {
      return this.stickerMemo;
    }

    const images = Array.from(this.images.collection.values()).filter((image) => {
      const usg = image.usage ?? this.meta.usage;
      return usg.includes(usage);
    });

    if (usage === ImageUsage.Emoticon) {
      this.emoticonMemo = images;
    }
    if (usage === ImageUsage.Sticker) {
      this.stickerMemo = images;
    }

    return images;
  }

  public getAvatarUrl(usage: ImageUsage): string | undefined {
    if (this.meta.avatar) return this.meta.avatar;
    const images = this.getImages(usage);
    const firstImage = images[0];
    if (firstImage) return firstImage.url;
    return undefined;
  }
}
