import { Descendant, Editor, Element, Node, NodeEntry, Range, Text, Transforms } from 'slate';
import { BlockType } from './types';
import { HeadingLevel, MarkdownDecoratedText } from './slate';
import { InlineMDRange, tokenizeInlineMD } from '../../plugins/markdown';

/**
 * How a composer line renders as markdown, mirroring what the parser
 * in `plugins/markdown` will do with it once sent.
 */
export type MarkdownLine =
  | { kind: 'code'; open: boolean }
  | { kind: 'heading'; level: HeadingLevel; prefix: number }
  | { kind: 'quote'; prefix: number }
  | { kind: 'subtext'; prefix: number }
  | { kind: 'list'; prefix: number; indent: string; marker: string }
  | { kind: 'text'; prefix: 0 };

const FENCE_REG = /^(`{3,})(?!`)/;
const MULTILINE_QUOTE_REG = /^>>>(?: |$)/;
const QUOTE_REG = /^>(?: |$)/;
const HEADING_REG = /^(#{1,3}) +(?=\S)/;
const SUBTEXT_REG = /^-# +(?=\S)/;
const LIST_REG = /^( *)([-*]|\d{1,9}\.) +/;

const lineCache = new WeakMap<Descendant[], Array<MarkdownLine | undefined>>();

const firstText = (block: Element): string => {
  const [first] = block.children;
  return Text.isText(first) ? first.text : '';
};

/**
 * Classifies each top-level paragraph of the editor as a markdown line.
 * Non-paragraph blocks (from the rich text toolbar) end any open code block or quote.
 * Result is cached per `editor.children` snapshot.
 */
export const getMarkdownLines = (editor: Editor): Array<MarkdownLine | undefined> => {
  const cached = lineCache.get(editor.children);
  if (cached) return cached;

  const lines: Array<MarkdownLine | undefined> = [];
  let fence: string | undefined;
  let multilineQuote = false;

  editor.children.forEach((block, index) => {
    if (!Element.isElement(block) || block.type !== BlockType.Paragraph) {
      fence = undefined;
      multilineQuote = false;
      lines[index] = undefined;
      return;
    }
    const text = firstText(block);
    const full = Node.string(block);

    if (fence) {
      if (full.includes(fence)) fence = undefined;
      lines[index] = { kind: 'code', open: fence !== undefined };
      return;
    }

    const fenceMatch = text.match(FENCE_REG);
    if (fenceMatch) {
      const [openFence] = fenceMatch;
      if (!full.slice(openFence.length).includes(openFence)) fence = openFence;
      lines[index] = { kind: 'code', open: fence !== undefined };
      return;
    }

    if (multilineQuote) {
      lines[index] = { kind: 'quote', prefix: 0 };
      return;
    }

    const multilineQuoteMatch = text.match(MULTILINE_QUOTE_REG);
    if (multilineQuoteMatch) {
      multilineQuote = true;
      lines[index] = { kind: 'quote', prefix: multilineQuoteMatch[0].length };
      return;
    }

    const quoteMatch = text.match(QUOTE_REG);
    if (quoteMatch) {
      lines[index] = { kind: 'quote', prefix: quoteMatch[0].length };
      return;
    }

    const headingMatch = text.match(HEADING_REG);
    if (headingMatch) {
      lines[index] = {
        kind: 'heading',
        level: headingMatch[1].length as HeadingLevel,
        prefix: headingMatch[0].length,
      };
      return;
    }

    const subtextMatch = text.match(SUBTEXT_REG);
    if (subtextMatch) {
      lines[index] = { kind: 'subtext', prefix: subtextMatch[0].length };
      return;
    }

    const listMatch = text.match(LIST_REG);
    if (listMatch) {
      lines[index] = {
        kind: 'list',
        prefix: listMatch[0].length,
        indent: listMatch[1],
        marker: listMatch[2],
      };
      return;
    }

    lines[index] = { kind: 'text', prefix: 0 };
  });

  lineCache.set(editor.children, lines);
  return lines;
};

const MARK_TO_DECORATION: Record<InlineMDRange['mark'], keyof MarkdownDecoratedText | undefined> = {
  bold: 'mdBold',
  italic: 'mdItalic',
  underline: 'mdUnderline',
  strikeThrough: 'mdStrikeThrough',
  code: 'mdCode',
  spoiler: 'mdSpoiler',
  link: 'mdLink',
  syntax: 'mdSyntax',
  escape: undefined,
};

const FENCE_G_REG = /`{3,}/g;

/**
 * Slate `decorate` for the editor root that highlights markdown syntax in place,
 * so the formatting shows while it is typed.
 */
export type MarkdownDecoratedRange = Range & MarkdownDecoratedText;

export const decorateMarkdown = (editor: Editor, [node]: NodeEntry): MarkdownDecoratedRange[] => {
  if (!Editor.isEditor(node)) return [];

  const lines = getMarkdownLines(editor);
  const ranges: MarkdownDecoratedRange[] = [];

  editor.children.forEach((block, blockIndex) => {
    const line = lines[blockIndex];
    if (!line || !Element.isElement(block)) return;

    block.children.forEach((child, childIndex) => {
      if (!Text.isText(child) || child.text === '') return;
      const path = [blockIndex, childIndex];
      const range = (start: number, end: number): Range => ({
        anchor: { path, offset: start },
        focus: { path, offset: end },
      });

      if (line.kind === 'code') {
        Array.from(child.text.matchAll(FENCE_G_REG)).forEach((m) => {
          const start = m.index ?? 0;
          ranges.push({ ...range(start, start + m[0].length), mdSyntax: true });
        });
        return;
      }

      const prefix = childIndex === 0 ? line.prefix : 0;
      if (prefix > 0 && line.kind !== 'list') {
        ranges.push({ ...range(0, prefix), mdSyntax: true });
      }

      tokenizeInlineMD(child.text.slice(prefix), prefix).forEach((token) => {
        const key = MARK_TO_DECORATION[token.mark];
        if (!key || token.start === token.end) return;
        ranges.push({ ...range(token.start, token.end), [key]: true });
      });
    });
  });

  return ranges;
};

/**
 * @returns true when the cursor is inside a code block that has not been closed yet,
 * where Enter should insert a new line instead of sending.
 */
export const isInOpenCodeBlock = (editor: Editor): boolean => {
  const { selection } = editor;
  if (!selection) return false;
  const [index] = Range.start(selection).path;
  const line = getMarkdownLines(editor)[index];
  return line?.kind === 'code' && line.open;
};

/**
 * Continues a markdown list on a new line (Shift+Enter).
 * An empty list item gets its marker removed instead.
 *
 * @returns true when handled.
 */
export const continueMarkdownList = (editor: Editor): boolean => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const [index] = selection.anchor.path;
  const line = getMarkdownLines(editor)[index];
  if (line?.kind !== 'list') return false;

  const block = editor.children[index];
  if (!Element.isElement(block)) return false;

  if (Node.string(block).trim() === `${line.indent}${line.marker}`.trim()) {
    Transforms.delete(editor, {
      at: { anchor: Editor.start(editor, [index]), focus: Editor.end(editor, [index]) },
    });
    return true;
  }

  const num = line.marker.match(/^(\d+)\./);
  const marker = num ? `${parseInt(num[1], 10) + 1}.` : line.marker;
  Editor.insertBreak(editor);
  Editor.insertText(editor, `${line.indent}${marker} `);
  return true;
};

/**
 * Wraps the selection in a markdown sequence, or unwraps it when already wrapped.
 * With a collapsed selection the sequence is inserted around the cursor.
 */
export const toggleMarkdownWrap = (editor: Editor, sequence: string) => {
  const { selection } = editor;
  if (!selection) return;

  if (Range.isCollapsed(selection)) {
    Editor.insertText(editor, `${sequence}${sequence}`);
    Transforms.move(editor, { distance: sequence.length, unit: 'offset', reverse: true });
    return;
  }

  const [start, end] = Range.edges(selection);
  const before = Editor.before(editor, start, { distance: sequence.length, unit: 'offset' });
  const after = Editor.after(editor, end, { distance: sequence.length, unit: 'offset' });
  if (
    before &&
    after &&
    Editor.string(editor, { anchor: before, focus: start }) === sequence &&
    Editor.string(editor, { anchor: end, focus: after }) === sequence
  ) {
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, { at: { anchor: end, focus: after } });
      Transforms.delete(editor, { at: { anchor: before, focus: start } });
    });
    return;
  }

  const startRef = Editor.pointRef(editor, start, { affinity: 'forward' });
  const endRef = Editor.pointRef(editor, end, { affinity: 'backward' });
  Editor.withoutNormalizing(editor, () => {
    Transforms.insertText(editor, sequence, { at: end });
    Transforms.insertText(editor, sequence, { at: start });
  });
  const newStart = startRef.unref();
  const newEnd = endRef.unref();
  if (newStart && newEnd) Transforms.select(editor, { anchor: newStart, focus: newEnd });
};

const URL_REG = /^https?:\/\/\S+$/;

/**
 * Turns a URL pasted over selected text into a `[text](url)` link.
 *
 * @returns true when handled.
 */
export const pasteMarkdownLink = (editor: Editor, pasted: string): boolean => {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection)) return false;

  const url = pasted.trim();
  if (!URL_REG.test(url)) return false;

  const selected = Editor.string(editor, selection);
  if (!selected.trim() || selected.includes('\n') || URL_REG.test(selected.trim())) return false;
  if (getMarkdownLines(editor)[Range.start(selection).path[0]]?.kind === 'code') return false;

  Editor.insertText(editor, `[${selected}](${url})`);
  return true;
};
