import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FileContent } from '../../src/app/components/message/content/FileContent';

// vanilla-extract styles need the build plugin; the classes are not under test
vi.mock('../../src/app/styles/Modal.css', () => ({ ModalWide: 'modal-wide' }));

const render = (body: string, mimeType: string) =>
  renderToStaticMarkup(
    <FileContent
      body={body}
      mimeType={mimeType}
      renderAsTextFile={() => <span>text-viewer</span>}
      renderAsPdfFile={() => <span>pdf-viewer</span>}
    />
  );

describe('FileContent text viewer', () => {
  it('opens a file with a known source extension as text', () => {
    expect(render('main.rs', 'application/octet-stream')).toContain('text-viewer');
  });

  it.each(['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'])(
    'does not treat a file named %s as text',
    (name) => {
      expect(render(name, 'application/octet-stream')).not.toContain('text-viewer');
    }
  );
});
