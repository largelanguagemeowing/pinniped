import React, { useMemo } from 'react';
import parse, { HTMLReactParserOptions } from 'html-react-parser';
import Linkify from 'linkify-react';
import { Opts } from 'linkifyjs';
import { MessageEmptyContent } from './content';
import { sanitizeCustomHtml, stripUnsafeTextChars } from '../../utils/sanitize';
import { unwrapEmbedUrls, unwrapEmbedUrlsHtml } from '../../utils/regex';
import { highlightText, scaleSystemEmoji } from '../../plugins/react-custom-html-parser';
import { withReadableTextColors } from '../../plugins/readableHtmlColors';
import { useReadableColor } from '../../hooks/useReadableColor';

type RenderBodyProps = {
  body: string;
  customBody?: string;

  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
};
export function RenderBody({
  body,
  customBody,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
}: RenderBodyProps) {
  const readable = useReadableColor();
  const parserOptions = useMemo(
    () => withReadableTextColors(htmlReactParserOptions, readable),
    [htmlReactParserOptions, readable]
  );

  if (body === '') <MessageEmptyContent />;
  if (customBody) {
    if (customBody === '') <MessageEmptyContent />;
    return parse(
      sanitizeCustomHtml(unwrapEmbedUrlsHtml(stripUnsafeTextChars(customBody))),
      parserOptions
    );
  }
  const shown = unwrapEmbedUrls(stripUnsafeTextChars(body));
  return (
    <Linkify options={linkifyOpts}>
      {highlightRegex
        ? highlightText(highlightRegex, scaleSystemEmoji(shown))
        : scaleSystemEmoji(shown)}
    </Linkify>
  );
}
