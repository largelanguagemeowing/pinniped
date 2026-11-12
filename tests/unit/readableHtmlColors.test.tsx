import React from 'react';
import { describe, expect, it } from 'vitest';
import parse from 'html-react-parser';
import { renderToStaticMarkup } from 'react-dom/server';
import { withReadableTextColors } from '../../src/app/plugins/readableHtmlColors';

const render = (html: string) =>
  renderToStaticMarkup(
    <>
      {parse(
        html,
        withReadableTextColors({}, (c) => `#${c.slice(1).split('').reverse().join('')}`)
      )}
    </>
  );

describe('readable text colors in message html', () => {
  it('passes a text color through the adjuster', () => {
    expect(render('<span style="color:#112233">hi</span>')).toContain('color:#332211');
  });

  it('works on font tags', () => {
    expect(render('<font style="color:#112233">hi</font>')).toContain('color:#332211');
  });

  it('leaves text alone when the sender also sets a background', () => {
    const html = '<span style="background-color:#000000;color:#112233">hi</span>';
    expect(render(html)).toContain('color:#112233');
  });

  it('leaves unstyled elements alone', () => {
    expect(render('<span>hi</span>')).toBe('<span>hi</span>');
  });
});

describe('readable text colors after sanitizing', () => {
  it('adjusts a color the sender set with data-mx-color', async () => {
    const { sanitizeCustomHtml } = await import('../../src/app/utils/sanitize');
    const html = sanitizeCustomHtml('<font data-mx-color="#112233">hi</font>');
    expect(render(html)).toContain('color:#332211');
  });
});
