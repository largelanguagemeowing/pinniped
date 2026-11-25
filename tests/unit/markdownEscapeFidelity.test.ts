import { describe, expect, it } from 'vitest';
import { toPlainText } from '../../src/app/components/editor/output';
import { plainToEditorInput } from '../../src/app/components/editor/input';
import { parseInlineMD } from '../../src/app/plugins/markdown';

describe('editing a message in a markdown room', () => {
  it.each([
    '# h',
    '\\# h',
    '\\\\# h',
    '> q',
    '\\> q',
    '- a',
    '\\- a',
    '1. a',
    '\\\\1. a',
    '```',
    '\\```',
  ])('sends %j back unchanged', (body) => {
    expect(toPlainText(plainToEditorInput(body, true), true)).toBe(`${body}\n`);
  });
});

describe('inline markdown nesting', () => {
  it('keeps bold inside an italic', () => {
    expect(parseInlineMD('*a **b** c*')).toBe(
      '<i data-md="*">a <strong data-md="**">b</strong> c</i>'
    );
  });

  it('keeps italic inside a bold', () => {
    expect(parseInlineMD('**a *b* c**')).toBe(
      '<strong data-md="**">a <i data-md="*">b</i> c</strong>'
    );
  });
});
