import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import parse from 'html-react-parser';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MatrixClient } from 'matrix-js-sdk';
import { MAX_MXC_IMAGES_PER_MESSAGE, sanitizeCustomHtml } from '../../src/app/utils/sanitize';

// style modules are built by a bundler plugin; any class name will do here
const anyStyle = vi.hoisted(
  () => () =>
    new Proxy({}, { has: () => true, get: (_t, key) => (key === 'then' ? undefined : () => 'c') })
);
vi.mock('../../src/app/styles/CustomHtml.css', anyStyle);
vi.mock('../../src/app/styles/ContainerColor.css', anyStyle);
vi.mock('../../src/app/components/message/Reaction.css', anyStyle);

const images = (count: number, attrs = '') =>
  Array.from({ length: count }, (_, i) => `<img src="mxc://example.org/${i}" ${attrs}>`).join('');
const countImgs = (html: string) => (html.match(/<img /g) ?? []).length;

describe('mxc images in one message', () => {
  it('keeps every image up to the limit', () => {
    expect(countImgs(sanitizeCustomHtml(images(MAX_MXC_IMAGES_PER_MESSAGE)))).toBe(
      MAX_MXC_IMAGES_PER_MESSAGE
    );
  });

  it('drops the images beyond the limit, so a small event cannot request hundreds of files', () => {
    const html = sanitizeCustomHtml(images(300));

    expect(countImgs(html)).toBe(MAX_MXC_IMAGES_PER_MESSAGE);
    expect(html).toContain('mxc://example.org/0');
    expect(html).not.toContain(`mxc://example.org/${MAX_MXC_IMAGES_PER_MESSAGE}"`);
  });

  it('does not count a message toward another', () => {
    sanitizeCustomHtml(images(300));

    expect(countImgs(sanitizeCustomHtml(images(5)))).toBe(5);
  });

  it('does not let non-mxc images, which become links, use up the allowance', () => {
    const html = sanitizeCustomHtml(
      Array.from({ length: 100 }, (_, i) => `<img src="https://example.org/${i}.png">`).join('') +
        images(3)
    );

    expect(countImgs(html)).toBe(3);
  });
});

describe('thumbnails instead of originals', () => {
  const mx = () => {
    const mxcUrlToHttp = vi.fn(
      (url: string, w?: number, h?: number, method?: string) =>
        `https://hs/thumb?u=${url}&w=${w}&h=${h}&m=${method}`
    );
    return { mx: { mxcUrlToHttp } as unknown as MatrixClient, mxcUrlToHttp };
  };

  it('asks for a bounded, animated thumbnail of an inline image and the original of a custom emoji', async () => {
    const { getReactCustomHtmlParser } =
      await import('../../src/app/plugins/react-custom-html-parser');
    const { mx: client, mxcUrlToHttp } = mx();
    const options = getReactCustomHtmlParser(client, undefined, { linkifyOpts: {} });

    const markup = renderToStaticMarkup(
      <>
        {parse(
          '<img src="mxc://example.org/emoji" data-mx-emoticon><img src="mxc://example.org/pic">',
          options
        )}
      </>
    );

    const call = (url: string) => mxcUrlToHttp.mock.calls.find((c) => c[0] === url)!;
    expect(call('mxc://example.org/emoji').slice(1, 4)).toEqual([undefined, undefined, undefined]);
    expect(call('mxc://example.org/pic').slice(1, 4)).toEqual([600, 600, 'scale']);
    expect(markup).toMatch(/<img src="[^"]*pic[^"]*animated=true"/);
    expect(markup).not.toMatch(/<img src="[^"]*emoji[^"]*animated/);
  });

  it('shows a reaction image as a thumbnail', async () => {
    const { Reaction } = await import('../../src/app/components/message/Reaction');
    const { mx: client, mxcUrlToHttp } = mx();

    renderToStaticMarkup(<Reaction mx={client} count={1} reaction="mxc://example.org/big" />);

    expect(mxcUrlToHttp.mock.calls[0].slice(0, 4)).toEqual([
      'mxc://example.org/big',
      64,
      64,
      'scale',
    ]);
  });
});
