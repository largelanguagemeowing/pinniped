import { describe, expect, it } from 'vitest';
import { Editor, Element, Range, Transforms, createEditor } from 'slate';
import { withHistory } from 'slate-history';
import { withInline, withVoid } from '../../src/app/components/editor/plugins';
import {
  createMentionElement,
  getPrevWordRange,
  moveCursor,
  replaceWithElement,
} from '../../src/app/components/editor/utils';
import { BlockType } from '../../src/app/components/editor/types';

const makeEditor = (children: Element['children']) => {
  const editor = withInline(withVoid(withHistory(createEditor())));
  editor.children = [{ type: BlockType.Paragraph, children }];
  return editor;
};

// Same steps as UserMentionAutocomplete.handleAutocomplete.
const acceptMention = (editor: Editor, userId: string) => {
  const range = getPrevWordRange(editor);
  if (!range) throw new Error('no query range');
  replaceWithElement(editor, range, createMentionElement(userId, userId, false));
  moveCursor(editor, true);
};

describe('mention autocomplete caret', () => {
  it('leaves the caret after the mention and its space at the end of a line', () => {
    const editor = makeEditor([{ text: 'hello @ali' }]);
    Transforms.select(editor, Editor.end(editor, []));

    acceptMention(editor, '@alice:x');

    const selection = editor.selection as Range;
    const caretNode = (editor.children[0] as Element).children[selection.anchor.path[1]];
    expect(caretNode).toEqual({ text: ' ' });
    expect(selection.anchor.offset).toBe(1);
  });
});
