import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { useImageFilePicker, useImageFilesPicker } from '../../src/app/hooks/useFilePicker';

const picked = vi.hoisted(() => ({ file: undefined as File | File[] | undefined }));
vi.mock('../../src/app/utils/dom', () => ({ selectFile: async () => picked.file }));

// SOI, a COM segment holding "secret", a quantisation table, SOS with scan data, EOI
const jpegWithComment = new Uint8Array([
  0xff, 0xd8, 0xff, 0xfe, 0, 8, 115, 101, 99, 114, 101, 116, 0xff, 0xdb, 0, 5, 1, 2, 3, 0xff, 0xda,
  0, 4, 1, 2, 9, 9, 0xff, 0xd9,
]);

let pick!: (accept: string) => Promise<void>;
function Harness({ onSelect }: { onSelect: (file: File) => void }) {
  pick = useImageFilePicker(onSelect);
  return null;
}
function FilesHarness({ onSelect }: { onSelect: (files: File[]) => void }) {
  pick = useImageFilesPicker(onSelect);
  return null;
}

beforeEach(() => {
  picked.file = undefined;
});

it('hands over the picked image without its metadata', async () => {
  picked.file = new File([jpegWithComment], 'me.jpg', { type: 'image/jpeg' });
  const onSelect = vi.fn();
  act(() => {
    create(<Harness onSelect={onSelect} />);
  });
  await act(() => pick('image/*'));
  const file: File = onSelect.mock.calls[0][0];
  expect(file.name).toBe('me.jpg');
  expect(new TextDecoder('latin1').decode(await file.arrayBuffer())).not.toContain('secret');
  expect(file.size).toBeLessThan(jpegWithComment.length);
});

it('hands over a file that is no supported image as it is', async () => {
  picked.file = new File(['hello'], 'note.txt', { type: 'text/plain' });
  const onSelect = vi.fn();
  act(() => {
    create(<Harness onSelect={onSelect} />);
  });
  await act(() => pick('image/*'));
  expect(onSelect).toHaveBeenCalledWith(picked.file);
});

it('hands over nothing when the dialog is dismissed', async () => {
  const onSelect = vi.fn();
  act(() => {
    create(<Harness onSelect={onSelect} />);
  });
  await act(() => pick('image/*'));
  expect(onSelect).not.toHaveBeenCalled();
});

it('hands over every picked image without its metadata, keeping the others as they are', async () => {
  const note = new File(['hello'], 'note.txt', { type: 'text/plain' });
  picked.file = [new File([jpegWithComment], 'a.jpg', { type: 'image/jpeg' }), note];
  const onSelect = vi.fn();
  act(() => {
    create(<FilesHarness onSelect={onSelect} />);
  });
  await act(() => pick('image/*'));
  const [first, second]: File[] = onSelect.mock.calls[0][0];
  expect(first.name).toBe('a.jpg');
  expect(new TextDecoder('latin1').decode(await first.arrayBuffer())).not.toContain('secret');
  expect(second).toBe(note);
});
