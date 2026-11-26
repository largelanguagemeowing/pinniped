import { Upload, UploadStatus } from '../../state/upload';

export type UploadTotals = {
  loadedBytes: number;
  totalBytes: number;
  /** Files that are up. */
  done: number;
  /** Files that are up or on their way; a failed file is not counted. */
  count: number;
};

export const getUploadTotals = (uploads: Upload[]): UploadTotals =>
  uploads.reduce<UploadTotals>(
    (totals, upload) => {
      const { size } = upload.file;
      switch (upload.status) {
        case UploadStatus.Success:
          return {
            loadedBytes: totals.loadedBytes + size,
            totalBytes: totals.totalBytes + size,
            done: totals.done + 1,
            count: totals.count + 1,
          };
        case UploadStatus.Loading:
          return {
            ...totals,
            loadedBytes: totals.loadedBytes + upload.progress.loaded,
            totalBytes: totals.totalBytes + size,
            count: totals.count + 1,
          };
        case UploadStatus.Idle:
          return { ...totals, totalBytes: totals.totalBytes + size, count: totals.count + 1 };
        default:
          return totals;
      }
    },
    { loadedBytes: 0, totalBytes: 0, done: 0, count: 0 }
  );
