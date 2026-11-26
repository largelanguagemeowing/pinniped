import { describe, expect, it, vi } from 'vitest';
import { ConnectionError, HTTPError, MatrixError } from 'matrix-js-sdk';
import type { MatrixClient, UploadOpts, UploadResponse } from 'matrix-js-sdk';
import { uploadContent } from '../../src/app/utils/matrix';
import { UploadFailure, UploadFailureKind } from '../../src/app/utils/uploadFailure';

const file = new File(['x'], 'a.bin');

type Outcome = { mxc: string } | { failure: UploadFailure };

// runs uploadContent against a client whose upload ends the way `end` says
const upload = async (
  end: (opts: UploadOpts) => Promise<Partial<UploadResponse>>
): Promise<Outcome> => {
  const mx = {
    uploadContent: (_file: File, opts: UploadOpts) => end(opts),
  } as unknown as MatrixClient;
  let outcome: Outcome | undefined;
  await uploadContent(mx, file, {
    onSuccess: (mxc) => {
      outcome = { mxc };
    },
    onError: (failure) => {
      outcome = { failure };
    },
  });
  if (!outcome) throw new Error('uploadContent reported nothing');
  return outcome;
};

const failureOf = async (error: unknown): Promise<UploadFailure> => {
  const outcome = await upload(() => Promise.reject(error));
  if (!('failure' in outcome)) throw new Error('upload did not fail');
  return outcome.failure;
};

const limited = (body: object, headers?: Headers) =>
  new MatrixError(
    { errcode: 'M_LIMIT_EXCEEDED', error: 'slow down', ...body },
    429,
    undefined,
    undefined,
    headers
  );

describe('uploadContent', () => {
  it('reports the content URI of a finished upload', async () => {
    expect(await upload(async () => ({ content_uri: 'mxc://hs/abc' }))).toEqual({
      mxc: 'mxc://hs/abc',
    });
  });

  it('tells a file over the size limit apart, from the homeserver or a proxy in front of it', async () => {
    const fromServer = await failureOf(
      new MatrixError({ errcode: 'M_TOO_LARGE', error: 'too large' }, 413)
    );
    const fromProxy = await failureOf(new HTTPError('Server returned 413 error', 413));

    expect(fromServer.kind).toBe(UploadFailureKind.TooLarge);
    expect(fromProxy.kind).toBe(UploadFailureKind.TooLarge);
  });

  it('keeps how long a rate limit asks to wait', async () => {
    const inBody = await failureOf(limited({ retry_after_ms: 2500 }));
    const inHeader = await failureOf(limited({}, new Headers({ 'Retry-After': '7' })));

    expect(inBody).toMatchObject({
      kind: UploadFailureKind.RateLimited,
      retryAfter: { kind: 'after', ms: 2500 },
    });
    expect(inHeader).toMatchObject({
      kind: UploadFailureKind.RateLimited,
      retryAfter: { kind: 'after', ms: 7000 },
    });
  });

  it('says so when a rate limit names no usable wait', async () => {
    const none = await failureOf(limited({}));
    const invalid = await failureOf(limited({ retry_after_ms: 'soon' }));
    const proxy = await failureOf(new HTTPError('Server returned 429 error', 429));

    [none, invalid, proxy].forEach((failure) =>
      expect(failure).toMatchObject({
        kind: UploadFailureKind.RateLimited,
        retryAfter: { kind: 'unspecified' },
      })
    );
  });

  it('tells a lost connection apart', async () => {
    const failed = await failureOf(new ConnectionError('request failed'));
    // the SDK reports a request that never got an answer as an abort
    const noAnswer = await failureOf(new DOMException('', 'AbortError'));

    expect(failed.kind).toBe(UploadFailureKind.Network);
    expect(noAnswer.kind).toBe(UploadFailureKind.Network);
  });

  it('tells a cancelled upload apart from a lost connection', async () => {
    const outcome = await upload((opts) => {
      // what mx.cancelUpload does to the upload it was handed
      opts.abortController?.abort();
      return Promise.reject(new DOMException('', 'AbortError'));
    });

    expect(outcome).toMatchObject({ failure: { kind: UploadFailureKind.Aborted } });
  });

  it('tells a session the server no longer accepts apart', async () => {
    const failure = await failureOf(
      new MatrixError({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid access token' }, 401)
    );

    expect(failure.kind).toBe(UploadFailureKind.Auth);
  });

  it('reports any other failure as such and keeps its cause', async () => {
    const refused = new MatrixError({ errcode: 'M_UNKNOWN', error: 'Internal server error' }, 500);
    const thrown = { not: 'an error' };

    expect(await failureOf(refused)).toMatchObject({
      kind: UploadFailureKind.Other,
      cause: refused,
    });
    expect(await failureOf(thrown)).toMatchObject({ kind: UploadFailureKind.Other, cause: thrown });
  });

  it('fails when the server answers without a content URI', async () => {
    const outcome = await upload(async () => ({}));

    expect(outcome).toMatchObject({ failure: { kind: UploadFailureKind.Other } });
  });

  it('gives every failure a message to show', async () => {
    const failures = await Promise.all(
      [
        new MatrixError({ errcode: 'M_TOO_LARGE' }, 413),
        limited({ retry_after_ms: 1000 }),
        limited({}),
        new ConnectionError('request failed'),
        new MatrixError({ errcode: 'M_UNKNOWN_TOKEN' }, 401),
        new Error('boom'),
      ].map(failureOf)
    );

    failures.forEach((failure) => {
      expect(failure).toBeInstanceOf(Error);
      expect(failure.message).not.toBe('');
    });
    expect(new Set(failures.map((failure) => failure.message)).size).toBe(failures.length);
  });

  it('hands the upload promise to the caller, who cancels through it', async () => {
    const pending = Promise.resolve({ content_uri: 'mxc://hs/abc' });
    const mx = { uploadContent: () => pending } as unknown as MatrixClient;
    const onPromise = vi.fn();

    await uploadContent(mx, file, {
      onPromise,
      onSuccess: () => undefined,
      onError: () => undefined,
    });

    expect(onPromise).toHaveBeenCalledWith(pending);
  });
});
