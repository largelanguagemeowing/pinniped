import { describe, expect, it } from 'vitest';
import { createEditor, Descendant, Editor, Transforms } from 'slate';
import { BlockType } from '../../src/app/components/editor/types';
import { toMatrixCustomHTML, trimCustomHtml } from '../../src/app/components/editor/output';
import { htmlToEditorInput } from '../../src/app/components/editor/input';
import {
  continueMarkdownList,
  decorateMarkdown,
  getMarkdownLines,
  isInOpenCodeBlock,
  pasteMarkdownLink,
  toggleMarkdownWrap,
} from '../../src/app/components/editor/markdown';

const paragraphs = (text: string): Descendant[] =>
  text.split('\n').map((line) => ({ type: BlockType.Paragraph, children: [{ text: line }] }));

const md = (text: string): string =>
  trimCustomHtml(
    toMatrixCustomHTML(paragraphs(text), {
      allowTextFormatting: true,
      allowBlockMarkdown: true,
      allowInlineMarkdown: true,
    })
  );

const editorWith = (text: string): Editor => {
  const editor = createEditor();
  editor.children = paragraphs(text);
  return editor;
};

const editorText = (editor: Editor) =>
  editor.children
    .map((n) => Editor.string(editor, Editor.range(editor, [editor.children.indexOf(n)])))
    .join('\n');

describe('inline markdown', () => {
  it('formats the basics', () => {
    expect(md('**b** *i* _i_ __u__ ~~s~~ ||sp|| `c`')).toBe(
      '<strong data-md="**">b</strong> <i data-md="*">i</i> <i data-md="_">i</i> <u data-md="__">u</u> <s data-md="~~">s</s> <span data-md="||" data-mx-spoiler>sp</span> <code data-md="`">c</code>'
    );
  });

  it('handles bold italic', () => {
    expect(md('***x***')).toBe('<strong data-md="**"><i data-md="*">x</i></strong>');
  });

  it('leaves snake_case alone', () => {
    expect(md('some_snake_case_name')).toBe('some_snake_case_name');
    expect(md('a _real_ italic')).toBe('a <i data-md="_">real</i> italic');
  });

  it('does not italicize spaced asterisks', () => {
    expect(md('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(md('* not a list*')).not.toContain('<i');
  });

  it('supports double backtick code with a backtick inside', () => {
    expect(md('``a`b``')).toBe('<code data-md="``">a`b</code>');
  });

  it('turns <url> into a link without brackets', () => {
    expect(md('see <https://example.com/a?b=1&c=2>')).toBe(
      'see <a data-md="<" href="https://example.com/a?b=1&amp;c=2">https://example.com/a?b=1&amp;c=2</a>'
    );
  });

  it('keeps masked links', () => {
    expect(md('[text](https://example.com)')).toBe(
      '<a data-md href="https://example.com">text</a>'
    );
  });

  it('leaves markdown inside urls alone', () => {
    expect(md('https://example.com/a_b_c')).toBe('https://example.com/a_b_c');
  });
});

describe('block markdown', () => {
  it('only supports # to ### headings', () => {
    expect(md('# one')).toBe('<h1 data-md="#">one</h1>');
    expect(md('### three')).toBe('<h3 data-md="###">three</h3>');
    expect(md('#### four')).toBe('#### four');
    expect(md('#nospace')).toBe('#nospace');
  });

  it('supports -# subtext', () => {
    expect(md('-# small')).toBe('<sub data-md="-#">small</sub>');
    expect(md('-# small\nnext')).toBe('<sub data-md="-#">small</sub><br/>next');
  });

  it('makes - and * bullet lists and numbers ordered lists', () => {
    expect(md('- a\n- b')).toBe('<ul data-md="-"><li><p>a</p></li><li><p>b</p></li></ul>');
    expect(md('* a')).toBe('<ul data-md="*"><li><p>a</p></li></ul>');
    expect(md('1. a\n2. b')).toBe('<ol data-md="1"><li><p>a</p></li><li><p>b</p></li></ol>');
    expect(md('12. a')).toBe('<ol data-md="12" start="12"><li><p>a</p></li></ol>');
    expect(md('a. not a list')).toBe('a. not a list');
  });

  it('requires a space after > for quotes', () => {
    expect(md('> quoted\n> more')).toBe(
      '<blockquote data-md=">">quoted<br/>more<br/></blockquote>'
    );
    expect(md('>_>')).toBe('&gt;_&gt;');
  });

  it('quotes the rest of the message with >>>', () => {
    expect(md('before\n>>> a\nb\nc')).toBe(
      'before<br/><blockquote data-md=">>>">a<br/>b<br/>c<br/></blockquote>'
    );
  });

  it('fences code blocks, with the language on the fence line or the code on it', () => {
    expect(md('```js\nconst a = 1;\n```')).toBe(
      '<pre data-md="```"><code class="language-js">const a = 1;\n</code></pre>'
    );
    expect(md('```\nplain\n```')).toBe('<pre data-md="```"><code>plain\n</code></pre>');
    expect(md('```inline code```')).toBe('<pre data-md="```"><code>inline code\n</code></pre>');
    expect(md('```py\nprint(1)```')).toBe(
      '<pre data-md="```"><code class="language-py">print(1)\n</code></pre>'
    );
    expect(md('```\n**not bold**\n```')).toContain('**not bold**');
  });
});

describe('editing round trip', () => {
  const roundTrip = (text: string) => {
    const html = md(text);
    const nodes = htmlToEditorInput(html, true);
    const editor = createEditor();
    editor.children = nodes;
    return editorText(editor);
  };

  it.each([
    ['**b** and *i*'],
    ['- a\n- b'],
    ['12. a\n13. b'],
    ['> q'],
    ['>>> a\nb'],
    ['-# small'],
    ['# heading'],
    ['see <https://example.com>'],
  ])('%s', (text) => {
    expect(roundTrip(text)).toBe(text);
  });
});

describe('composer', () => {
  it('classifies lines', () => {
    const editor = editorWith('# h\n> q\n-# s\n- l\n```\ncode\n```\ntext');
    expect(getMarkdownLines(editor).map((l) => l?.kind)).toEqual([
      'heading',
      'quote',
      'subtext',
      'list',
      'code',
      'code',
      'code',
      'text',
    ]);
  });

  it('decorates inline markdown and syntax', () => {
    const editor = editorWith('a **b**');
    const ranges = decorateMarkdown(editor, [editor, []]);
    expect(ranges).toContainEqual({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 7 },
      mdBold: true,
    });
    expect(ranges.filter((r) => r.mdSyntax)).toHaveLength(2);
  });

  it('keeps Enter as newline inside an open code block only', () => {
    const editor = editorWith('```js\nfoo');
    Transforms.select(editor, Editor.end(editor, []));
    expect(isInOpenCodeBlock(editor)).toBe(true);

    const closed = editorWith('```js\nfoo\n```');
    Transforms.select(closed, Editor.end(closed, []));
    expect(isInOpenCodeBlock(closed)).toBe(false);
  });

  it('continues lists and ends them on an empty item', () => {
    const editor = editorWith('9. a');
    Transforms.select(editor, Editor.end(editor, []));
    expect(continueMarkdownList(editor)).toBe(true);
    expect(editorText(editor)).toBe('9. a\n10. ');
    expect(continueMarkdownList(editor)).toBe(true);
    expect(editorText(editor)).toBe('9. a\n');
  });

  it('wraps and unwraps a selection', () => {
    const editor = editorWith('hello world');
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 11 },
    });
    toggleMarkdownWrap(editor, '**');
    expect(editorText(editor)).toBe('hello **world**');
    expect(Editor.string(editor, editor.selection!)).toBe('world');
    toggleMarkdownWrap(editor, '**');
    expect(editorText(editor)).toBe('hello world');
  });

  it('pastes a url over a selection as a link', () => {
    const editor = editorWith('click here');
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 10 },
    });
    expect(pasteMarkdownLink(editor, 'https://example.com')).toBe(true);
    expect(editorText(editor)).toBe('click [here](https://example.com)');
  });
});
