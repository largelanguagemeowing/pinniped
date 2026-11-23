import type { Page } from '@playwright/test';

type MatrixRequestOptions = {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  /** below `/_matrix/client/v3`, or `/_matrix/media/v3` with `api: 'media'` */
  path: string;
  api?: 'client' | 'media';
  body?: unknown;
  /** raw bytes instead of a JSON body */
  upload?: { bytes: number[]; contentType: string };
  allowNotFound?: boolean;
};

/** A request as the signed-in person, made from the page so it uses their session. */
export async function matrixRequest<T = unknown>(
  page: Page,
  options: MatrixRequestOptions
): Promise<T | undefined> {
  const result = await page.evaluate(
    async ({ method, path, api = 'client', body, upload, allowNotFound }) => {
      const homeserver = localStorage.getItem('cinny_hs_base_url');
      const accessToken = localStorage.getItem('cinny_access_token');
      if (!homeserver || !accessToken) throw new Error('Missing authenticated Matrix session');

      const send = () =>
        fetch(`${homeserver}/_matrix/${api}/v3${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': upload?.contentType ?? 'application/json',
          },
          body: upload
            ? new Uint8Array(upload.bytes)
            : body === undefined
              ? undefined
              : JSON.stringify(body),
        });
      // a rate-limited request is retried after the wait the homeserver names
      let response = await send();
      for (let retry = 0; response.status === 429 && retry < 5; retry += 1) {
        const { retry_after_ms: wait = 1000 } = await response.json().catch(() => ({}));
        await new Promise((resolve) => {
          setTimeout(resolve, Math.min(wait, 10_000));
        });
        response = await send();
      }
      if (allowNotFound && response.status === 404) return undefined;
      if (!response.ok) {
        throw new Error(`Matrix request failed: ${method} ${path} (${response.status})`);
      }
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        return response.json();
      }
      return undefined;
    },
    { ...options }
  );
  return result as T | undefined;
}

export async function redactEvent(page: Page, roomId: string, eventId: string): Promise<void> {
  await matrixRequest(page, {
    method: 'PUT',
    path: `/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${Date.now()}`,
    body: {},
  });
}

/** Uploads a file to the homeserver's media repository and returns its mxc:// URI. */
export async function uploadMedia(
  page: Page,
  file: { bytes: number[]; contentType: string; filename: string }
): Promise<string> {
  const result = await matrixRequest<{ content_uri?: string }>(page, {
    method: 'POST',
    api: 'media',
    path: `/upload?filename=${encodeURIComponent(file.filename)}`,
    upload: { bytes: file.bytes, contentType: file.contentType },
  });
  if (!result?.content_uri) throw new Error('Upload returned no content URI');
  return result.content_uri;
}
