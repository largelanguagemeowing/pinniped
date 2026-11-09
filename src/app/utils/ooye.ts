/**
 * Utilities for detecting and parsing OOYE (Out of Your Element) bridge GIF messages.
 *
 * OOYE bridges Discord GIFs into Matrix as text/notice messages with a specific
 * structure. Two known formats:
 *
 * 1. Tenor GIFs (m.notice):
 *    body:        "| ## Title https://tenor.com/view/...\n| \n| 🎞️ https://media.tenor.com/.../*.mp4"
 *    formatted_body: "<blockquote><p><strong><a href="https://tenor.com/view/...">Title</a></strong></p><p>🎞️ https://media.tenor.com/.../*.mp4</p></blockquote>"
 *
 * 2. Klipy GIFs (m.text):
 *    body:        "[GIF] Title https://static.klipy.com/.../*.mp4"
 *    formatted_body: "<blockquote>➿ <a href="https://static.klipy.com/.../*.mp4">Title</a></blockquote>"
 *
 * Both formats share: a <blockquote> wrapper, an <a> tag with the title, and an .mp4 URL.
 */

export type OoyeGifData = {
  /** Display title for the GIF. */
  title: string;
  /** Optional page URL (e.g. tenor.com/view/...) linking back to the source. */
  pageUrl?: string;
  /** The direct .mp4 video URL to play. */
  videoUrl: string;
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

const MP4_URL_REG = /https:\/\/[^\s"<>']+\.mp4/g;

/**
 * Detects and parses an OOYE bridged GIF message.
 *
 * Returns `undefined` if the content does not look like an OOYE GIF, so callers
 * can fall through to the normal text/notice renderer.
 */
// Finds an OOYE GIF in a message without checking the video host.
function parseOoyeGifUnchecked(content: Record<string, unknown>): OoyeGifData | undefined {
  const body = typeof content.body === 'string' ? content.body : '';
  const formattedBody = typeof content.formatted_body === 'string' ? content.formatted_body : '';

  if (!body && !formattedBody) return undefined;

  // OOYE GIF messages are always wrapped in a <blockquote> (formatted_body)
  // or start with "[GIF]" in the plain-text body.
  const isBlockquote = formattedBody.includes('<blockquote');
  const isGifBody = body.startsWith('[GIF]');
  if (!isBlockquote && !isGifBody) return undefined;

  const searchText = formattedBody || body;

  // Find the .mp4 video URL.
  const videoUrlMatch = searchText.match(MP4_URL_REG);
  if (!videoUrlMatch || videoUrlMatch.length === 0) return undefined;
  const videoUrl = videoUrlMatch[0];

  let title = 'GIF';
  let pageUrl: string | undefined;

  if (formattedBody) {
    // Extract title and link from the first <a> tag.
    const linkMatch = formattedBody.match(/<a\s+href="([^"]+)"[^>]*>([^<]*)<\/a>/);
    if (linkMatch) {
      const href = decodeHtmlEntities(linkMatch[1]);
      const linkText = decodeHtmlEntities(linkMatch[2]).trim();
      if (linkText) title = linkText;
      // If the href is not the .mp4 URL itself, it's a separate page URL.
      if (href !== videoUrl && !href.endsWith('.mp4')) {
        pageUrl = href;
      }
    }
  }

  // Fallback: extract title from the plain-text body.
  if (title === 'GIF' && body) {
    // Tenor body: "| ## Title https://tenor.com/view/..."
    const tenorMatch = body.match(/##\s+(.+?)\s+https:\/\/tenor\.com\/view\//);
    if (tenorMatch) {
      title = tenorMatch[1].trim();
    } else {
      // Klipy body: "[GIF] Title https://..."
      const klipyMatch = body.match(/\[GIF\]\s*(.+?)\s+https:\/\//);
      if (klipyMatch) {
        title = klipyMatch[1].trim();
      }
    }
  }

  // Look for a separate tenor.com page URL (tenor format has both).
  if (!pageUrl) {
    const [matchedPageUrl] = searchText.match(/https:\/\/tenor\.com\/view\/[^\s"<>']+/) ?? [];
    if (matchedPageUrl) {
      pageUrl = matchedPageUrl;
    }
  }

  return {
    title,
    pageUrl,
    videoUrl,
  };
}

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};

// The video host must be on the Media Embeds list (passed in from settings).
export function parseOoyeGif(
  content: Record<string, unknown>,
  hosts: readonly string[]
): OoyeGifData | undefined {
  const gif = parseOoyeGifUnchecked(content);
  const host = gif && hostOf(gif.videoUrl);
  return host && hosts.includes(host) ? gif : undefined;
}

/** The video URL of an OOYE GIF, whether or not its host is on the list. */
export function getOoyeGifVideoUrl(content: Record<string, unknown>): string | undefined {
  return parseOoyeGifUnchecked(content)?.videoUrl;
}
