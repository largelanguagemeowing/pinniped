import { BlockMDRule } from './type';

// Only # to ### are headings; more #s are literal text.
const HEADING_REG_1 = /^(#{1,3}) +(.+)\n?/m;
export const HeadingRule: BlockMDRule = {
  match: (text) => text.match(HEADING_REG_1),
  html: (match, parseInline) => {
    const [, g1, g2] = match;
    const level = g1.length;
    return `<h${level} data-md="${g1}">${parseInline ? parseInline(g2) : g2}</h${level}>`;
  },
};

// opening fence of 3 or more backticks, captured in group 1.
// optional info string on the fence line in group 2, only when the line has no spaces.
// code content in group 3, which may start on the fence line and end right before the closing fence.
// closing fence must match the exact same fence sequence via \1
const CODEBLOCK_REG_1 = /^(`{3,})(?!`)(?:([^\s`]*)\n)?([\s\S]+?)\n?\1(?!`) *\n?/m;
export const CodeBlockRule: BlockMDRule = {
  match: (text) => text.match(CODEBLOCK_REG_1),
  html: (match) => {
    const [, fence, g1, g2] = match;
    // use last identifier after dot, e.g. for "example.json" gets us "json" as language code.
    const langCode = g1 ? g1.substring(g1.lastIndexOf('.') + 1) : null;
    const filename = g1 !== langCode ? g1 : null;
    const classNameAtt = langCode ? ` class="language-${langCode}"` : '';
    const filenameAtt = filename ? ` data-label="${filename}"` : '';
    return `<pre data-md="${fence}"><code${classNameAtt}${filenameAtt}>${g2}\n</code></pre>`;
  },
};

const BLOCKQUOTE_MD_1 = '>';
const BLOCKQUOTE_MD_2 = '>>>';
const QUOTE_LINE_PREFIX = /^> ?/;
const BLOCKQUOTE_TRAILING_NEWLINE = /\n$/;

const quoteLinesToHtml = (lines: string[], parseInline?: (txt: string) => string): string =>
  lines
    .map((line) => {
      if (parseInline) return `${parseInline(line)}<br/>`;
      return `${line}<br/>`;
    })
    .join('');

// A quote line needs a space after `>`, so `>_>` stays literal.
const BLOCKQUOTE_REG_1 = /(?:^>(?: .*)?(?:\n|$))+/m;
export const BlockQuoteRule: BlockMDRule = {
  match: (text) => text.match(BLOCKQUOTE_REG_1),
  html: (match, parseInline) => {
    const [blockquoteText] = match;

    const lines = blockquoteText
      .replace(BLOCKQUOTE_TRAILING_NEWLINE, '')
      .split('\n')
      .map((lineText) => lineText.replace(QUOTE_LINE_PREFIX, ''));
    return `<blockquote data-md="${BLOCKQUOTE_MD_1}">${quoteLinesToHtml(
      lines,
      parseInline
    )}</blockquote>`;
  },
};

// `>>> ` quotes everything until the end of the message.
const MULTILINE_BLOCKQUOTE_REG_1 = /^>>>(?: |\n|$)([\s\S]*)/m;
export const MultilineBlockQuoteRule: BlockMDRule = {
  match: (text) => text.match(MULTILINE_BLOCKQUOTE_REG_1),
  html: (match, parseInline) => {
    const [, content] = match;
    const lines = content.replace(BLOCKQUOTE_TRAILING_NEWLINE, '').split('\n');
    return `<blockquote data-md="${BLOCKQUOTE_MD_2}">${quoteLinesToHtml(
      lines,
      parseInline
    )}</blockquote>`;
  },
};

// `-# ` makes the line small subtext.
const SUBTEXT_MD_1 = '-#';
const SUBTEXT_REG_1 = /^-# +(.+)(\n?)/m;
export const SubtextRule: BlockMDRule = {
  match: (text) => text.match(SUBTEXT_REG_1),
  html: (match, parseInline) => {
    const [, g1, newline] = match;
    const content = parseInline ? parseInline(g1) : g1;
    return `<sub data-md="${SUBTEXT_MD_1}">${content}</sub>${newline ? '<br/>' : ''}`;
  },
};

// `-` and `*` are bullet lists, `1.` is a numbered list.
const LIST_ITEM_REG = /^( *)([-*]|\d{1,9}\.) +(.+)$/;
type ListType = 'ol' | 'ul';

function getListType(marker: string): ListType {
  return marker === '*' || marker === '-' ? 'ul' : 'ol';
}

function getOrderedStart(marker: string): string | undefined {
  const startMatch = marker.match(/^(\d+)\./);
  return startMatch?.[1];
}

interface ParsedLine {
  indent: number;
  marker: string;
  content: string;
  listType: ListType;
}

function parseLines(text: string): ParsedLine[] {
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      const match = line.match(LIST_ITEM_REG);

      if (!match) return null;

      const [, spaces, marker, content] = match;

      return {
        indent: spaces.length,
        marker,
        content,
        listType: getListType(marker),
      };
    })
    .filter(Boolean) as ParsedLine[];
}

function openList(line: ParsedLine) {
  if (line.listType === 'ul') {
    return `<ul data-md="${line.marker}">`;
  }
  const start = String(parseInt(getOrderedStart(line.marker) ?? '1', 10));
  const startAtt = start !== '1' ? ` start="${start}"` : '';
  return `<ol data-md="${start}"${startAtt}>`;
}

function closeList(listType: ListType) {
  return listType === 'ul' ? '</ul>' : '</ol>';
}

function buildList(lines: ParsedLine[], parseInline?: (s: string) => string): string {
  let html = '';

  const stack: ('ul' | 'ol')[] = [];

  lines.forEach((line, index) => {
    const prev = lines[index - 1];
    const next = lines[index + 1];

    const content = parseInline ? parseInline(line.content) : line.content;

    // FIRST ITEM
    if (!prev) {
      html += openList(line);
      stack.push(line.listType);
    }

    // DEEPER INDENT > open nested list
    else if (line.indent > prev.indent) {
      html += openList(line);
      stack.push(line.listType);
    }

    // SAME LEVEL
    else if (line.indent === prev.indent) {
      html += '</li>';

      // different list type
      if (line.listType !== prev.listType) {
        html += closeList(stack.pop()!);

        html += openList(line);
        stack.push(line.listType);
      }
    }

    // GOING BACK UP
    else if (line.indent < prev.indent) {
      html += '</li>';

      while (stack.length > line.indent + 1) {
        html += closeList(stack.pop()!);
        html += '</li>';
      }

      if (line.listType !== stack[stack.length - 1]) {
        html += closeList(stack.pop()!);

        html += openList(line);
        stack.push(line.listType);
      }
    }

    html += `<li><p>${content}</p>`;

    // LAST ITEM cleanup
    if (!next) {
      html += '</li>';

      while (stack.length) {
        html += closeList(stack.pop()!);
      }
    }
  });

  return html;
}

const LIST_REG_1 = /^(?: *(?:[-*]|\d{1,9}\.) +.+\n?)+/m;
export const ListRule: BlockMDRule = {
  match: (text) => text.match(LIST_REG_1),
  html: (match, parseInline) => {
    const [listText] = match;

    const lines = parseLines(listText);

    const html = buildList(lines, parseInline);

    return html;
  },
};

export const UN_ESC_BLOCK_SEQ = /^\\*(#{1,3} +|-# +|```|>|(?:[-*]|\d{1,9}\.) +)/;
export const ESC_BLOCK_SEQ = /^\\(\\*(?:#{1,3} +|-# +|```|>|(?:[-*]|\d{1,9}\.) +))/;
