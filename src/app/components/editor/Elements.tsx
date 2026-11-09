import { Scroll, Text } from 'folds';
import React from 'react';
import {
  ReactEditor,
  RenderElementProps,
  RenderLeafProps,
  useFocused,
  useSelected,
  useSlate,
} from 'slate-react';
import classNames from 'classnames';

import * as css from '../../styles/CustomHtml.css';
import * as editorCss from './Editor.css';
import { CommandElement, EmoticonElement, LinkElement, MentionElement } from './slate';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getBeginCommand } from './utils';
import { BlockType } from './types';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { MarkdownLine, getMarkdownLines } from './markdown';
import { isMxcUrl } from '../../utils/mxc';

// Put this at the start and end of an inline component to work around this Chromium bug:
// https://bugs.chromium.org/p/chromium/issues/detail?id=1249405
function InlineChromiumBugfix() {
  return (
    <span className={css.InlineChromiumBugfix} contentEditable={false}>
      {String.fromCodePoint(160) /* Non-breaking space */}
    </span>
  );
}

function RenderMentionElement({
  attributes,
  element,
  children,
}: { element: MentionElement } & RenderElementProps) {
  const selected = useSelected();
  const focused = useFocused();

  return (
    <span
      {...attributes}
      className={css.Mention({
        highlight: element.highlight,
        focus: selected && focused,
      })}
      contentEditable={false}
    >
      {element.name}
      {children}
    </span>
  );
}
function RenderCommandElement({
  attributes,
  element,
  children,
}: { element: CommandElement } & RenderElementProps) {
  const selected = useSelected();
  const focused = useFocused();
  const editor = useSlate();

  return (
    <span
      {...attributes}
      className={css.Command({
        focus: selected && focused,
        active: getBeginCommand(editor) === element.command,
      })}
      contentEditable={false}
    >
      {`/${element.command}`}
      {children}
    </span>
  );
}

function RenderEmoticonElement({
  attributes,
  element,
  children,
}: { element: EmoticonElement } & RenderElementProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const selected = useSelected();
  const focused = useFocused();

  return (
    <span className={css.EmoticonBase} {...attributes}>
      <span
        className={css.Emoticon({
          focus: selected && focused,
        })}
        contentEditable={false}
      >
        {isMxcUrl(element.key) ? (
          <img
            className={css.EmoticonImg}
            src={mxcUrlToHttp(mx, element.key, useAuthentication) ?? element.key}
            alt={element.shortcode}
          />
        ) : (
          element.key
        )}
        {children}
      </span>
    </span>
  );
}

function RenderLinkElement({
  attributes,
  element,
  children,
}: { element: LinkElement } & RenderElementProps) {
  return (
    <a href={element.href} {...attributes}>
      <InlineChromiumBugfix />
      {children}
    </a>
  );
}

const getMarkdownLineClass = (line: MarkdownLine | undefined): string | undefined => {
  switch (line?.kind) {
    case 'code':
      return editorCss.MdLineCode;
    case 'heading':
      return editorCss.MdLineHeading[line.level];
    case 'quote':
      return editorCss.MdLineQuote;
    case 'subtext':
      return editorCss.MdLineSubtext;
    default:
      return undefined;
  }
};

function RenderMarkdownParagraph({ attributes, element, children }: RenderElementProps) {
  // useSlate re-renders on every change, as a line's style can depend on lines above it.
  const editor = useSlate();
  const [index] = ReactEditor.findPath(editor, element);
  const line = getMarkdownLines(editor)[index];

  return (
    <Text {...attributes} className={classNames(css.Paragraph, getMarkdownLineClass(line))}>
      {children}
    </Text>
  );
}

export function RenderElement({
  attributes,
  element,
  children,
  markdown,
}: RenderElementProps & { markdown?: boolean }) {
  switch (element.type) {
    case BlockType.Paragraph:
      if (markdown) {
        return (
          <RenderMarkdownParagraph attributes={attributes} element={element}>
            {children}
          </RenderMarkdownParagraph>
        );
      }
      return (
        <Text {...attributes} className={css.Paragraph}>
          {children}
        </Text>
      );
    case BlockType.Heading:
      if (element.level === 1)
        return (
          <Text className={css.Heading} as="h2" size="H2" {...attributes}>
            {children}
          </Text>
        );
      if (element.level === 2)
        return (
          <Text className={css.Heading} as="h3" size="H3" {...attributes}>
            {children}
          </Text>
        );
      if (element.level === 3)
        return (
          <Text className={css.Heading} as="h4" size="H4" {...attributes}>
            {children}
          </Text>
        );
      return (
        <Text className={css.Heading} as="h3" size="H3" {...attributes}>
          {children}
        </Text>
      );
    case BlockType.CodeLine:
      return <div {...attributes}>{children}</div>;
    case BlockType.CodeBlock:
      return (
        <Text as="pre" className={css.CodeBlock} {...attributes}>
          <Scroll
            direction="Horizontal"
            variant="SurfaceVariant"
            size="300"
            visibility="Hover"
            hideTrack
          >
            <div className={css.CodeBlockInternal}>{children}</div>
          </Scroll>
        </Text>
      );
    case BlockType.QuoteLine:
      return <div {...attributes}>{children}</div>;
    case BlockType.BlockQuote:
      return (
        <Text as="blockquote" className={css.BlockQuote} {...attributes}>
          {children}
        </Text>
      );
    case BlockType.ListItem:
      return (
        <Text as="li" {...attributes}>
          {children}
        </Text>
      );
    case BlockType.OrderedList:
      return (
        <ol className={css.List} {...attributes}>
          {children}
        </ol>
      );
    case BlockType.UnorderedList:
      return (
        <ul className={css.List} {...attributes}>
          {children}
        </ul>
      );
    case BlockType.Mention:
      return (
        <RenderMentionElement attributes={attributes} element={element}>
          {children}
        </RenderMentionElement>
      );
    case BlockType.Emoticon:
      return (
        <RenderEmoticonElement attributes={attributes} element={element}>
          {children}
        </RenderEmoticonElement>
      );
    case BlockType.Link:
      return (
        <RenderLinkElement attributes={attributes} element={element}>
          {children}
        </RenderLinkElement>
      );
    case BlockType.Command:
      return (
        <RenderCommandElement attributes={attributes} element={element}>
          {children}
        </RenderCommandElement>
      );
    default:
      return (
        <Text className={css.Paragraph} {...attributes}>
          {children}
        </Text>
      );
  }
}

export function RenderLeaf({ attributes, leaf, children }: RenderLeafProps) {
  let md = children;
  // text-decoration from nested elements combines, so underline and strike can both show.
  if (leaf.mdUnderline) md = <span className={editorCss.MdUnderline}>{md}</span>;
  if (leaf.mdStrikeThrough) md = <span className={editorCss.MdStrikeThrough}>{md}</span>;
  const mdClass = classNames({
    [editorCss.MdSyntax]: leaf.mdSyntax,
    [editorCss.MdBold]: leaf.mdBold,
    [editorCss.MdItalic]: leaf.mdItalic,
    [editorCss.MdCode]: leaf.mdCode,
    [editorCss.MdSpoiler]: leaf.mdSpoiler,
    [editorCss.MdLink]: leaf.mdLink,
  });
  if (mdClass) md = <span className={mdClass}>{md}</span>;

  let child = md;
  if (leaf.bold)
    child = (
      <strong {...attributes}>
        <InlineChromiumBugfix />
        {child}
      </strong>
    );
  if (leaf.italic)
    child = (
      <i {...attributes}>
        <InlineChromiumBugfix />
        {child}
      </i>
    );
  if (leaf.underline)
    child = (
      <u {...attributes}>
        <InlineChromiumBugfix />
        {child}
      </u>
    );
  if (leaf.strikeThrough)
    child = (
      <s {...attributes}>
        <InlineChromiumBugfix />
        {child}
      </s>
    );
  if (leaf.code)
    child = (
      <code className={css.Code} {...attributes}>
        <InlineChromiumBugfix />
        {child}
      </code>
    );
  if (leaf.spoiler)
    child = (
      <span className={css.Spoiler()} {...attributes}>
        <InlineChromiumBugfix />
        {child}
      </span>
    );

  if (child !== md) return child;

  return <span {...attributes}>{child}</span>;
}
