import { Element, HTMLReactParserOptions } from 'html-react-parser';

// Text color someone set with <font>/<span>; the sanitizer only lets #hex through.
const COLORED_TAGS = new Set(['font', 'span']);

const readStyle = (style: string): Map<string, string> =>
  new Map(
    style
      .split(';')
      .map((declaration) => declaration.split(':').map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== '')
  );

/**
 * Wraps parser options so text colors in sanitized message HTML go through `readable`.
 * Text that also sets its own background is left alone: that pair is the sender's own
 * foreground/background choice and does not depend on the theme.
 */
export const withReadableTextColors = (
  options: HTMLReactParserOptions,
  readable: (color: string) => string
): HTMLReactParserOptions => ({
  ...options,
  replace: (domNode, index) => {
    if (domNode instanceof Element && COLORED_TAGS.has(domNode.name) && domNode.attribs.style) {
      const style = readStyle(domNode.attribs.style);
      const color = style.get('color');
      if (color && !style.has('background-color')) {
        style.set('color', readable(color));
        domNode.attribs.style = [...style].map(([name, value]) => `${name}:${value}`).join(';');
      }
    }
    return options.replace?.(domNode, index);
  },
});
