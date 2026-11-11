import { RoomPackFormat } from './PackFormat';

export class PackAddress {
  public readonly roomId: string;

  public readonly stateKey: string;

  public readonly format: RoomPackFormat;

  constructor(roomId: string, stateKey: string, format: RoomPackFormat) {
    this.roomId = roomId;
    this.stateKey = stateKey;
    this.format = format;
  }
}
