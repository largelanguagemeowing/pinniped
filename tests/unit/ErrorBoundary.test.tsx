import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/app/components/ErrorBoundary';

function Bomb(): never {
  throw new Error('bad event');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React and the boundary both log the contained error
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the fallback for a throwing child and leaves its siblings alone', () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <div>
          <ErrorBoundary fallback={(e) => <b>{`failed: ${(e as Error).message}`}</b>}>
            <Bomb />
          </ErrorBoundary>
          <ErrorBoundary fallback={() => <b>unused</b>}>
            <i>fine</i>
          </ErrorBoundary>
        </div>
      );
    });

    expect(JSON.stringify(r.toJSON())).toContain('failed: bad event');
    expect(JSON.stringify(r.toJSON())).toContain('fine');
    expect(JSON.stringify(r.toJSON())).not.toContain('unused');
  });
});
