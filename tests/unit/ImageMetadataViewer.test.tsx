import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ImageMetadataViewer } from '../../src/app/features/image-metadata/ImageMetadataViewer';
import { AsyncState, AsyncStatus } from '../../src/app/hooks/useAsyncCallback';
import { MetadataScan } from '../../src/app/features/image-metadata/scanImageMetadata';

vi.mock('../../src/app/features/image-metadata/ImageMetadataViewer.css', () => ({
  Viewer: 'viewer',
  Header: 'header',
  Content: 'content',
  Notice: 'notice',
  Fields: 'fields',
  Value: 'value',
  Preview: 'preview',
}));

const render = async (scan: AsyncState<MetadataScan>) => {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<ImageMetadataViewer scan={scan} requestClose={() => undefined} />);
  });
  return renderer!;
};

const texts = (renderer: ReactTestRenderer): string[] =>
  renderer.root
    .findAll((node) => typeof node.type === 'string')
    .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string'));

describe('ImageMetadataViewer', () => {
  it('lists the fields and strips direction overrides from sender-controlled text', async () => {
    const renderer = await render({
      status: AsyncStatus.Success,
      data: {
        status: 'found',
        metadata: {
          fields: [
            { section: 'location', label: 'Coordinates', value: '52.520094, -13.400000' },
            { section: 'text', label: 'Artist', value: 'Jane‮eoD' },
          ],
        },
      },
    });
    const shown = texts(renderer);
    expect(shown).toContain('52.520094, -13.400000');
    expect(shown).toContain('JaneeoD');
    expect(renderer.root.findAllByType('dl')).toHaveLength(2);
  });

  it('shows the embedded preview when there is one', async () => {
    const renderer = await render({
      status: AsyncStatus.Success,
      data: {
        status: 'found',
        metadata: { fields: [], thumbnail: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
      },
    });
    const [img] = renderer.root.findAllByType('img');
    expect(img.props.src).toMatch(/^blob:/);
  });

  it('shows no fields when the image is clean or could not be read', async () => {
    const states: AsyncState<MetadataScan>[] = [
      { status: AsyncStatus.Success, data: { status: 'clean' } },
      { status: AsyncStatus.Success, data: { status: 'unreadable' } },
      { status: AsyncStatus.Error, error: new Error('offline') },
      { status: AsyncStatus.Loading },
    ];
    await Promise.all(
      states.map(async (scan) => {
        const renderer = await render(scan);
        expect(renderer.root.findAllByType('dl')).toHaveLength(0);
      })
    );
  });
});
