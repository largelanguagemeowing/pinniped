import React from 'react';
import { EventEmitter } from 'events';
import { act, create } from 'react-test-renderer';
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { useRedactionDismiss } from '../../src/app/hooks/useRedactionDismiss';

const redaction = (redacts: string) => ({ getAssociatedId: () => redacts });

const setup = (eventId: string | undefined) => {
  const mx = new EventEmitter() as unknown as MatrixClient;
  const onRedacted = vi.fn();
  function Harness() {
    useRedactionDismiss(mx, eventId, onRedacted);
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Harness />);
  });
  return { mx, onRedacted, renderer };
};

describe('useRedactionDismiss', () => {
  it('fires when the watched event is redacted', () => {
    const { mx, onRedacted } = setup('$ring');
    mx.emit(RoomEvent.Redaction, redaction('$ring'));
    expect(onRedacted).toHaveBeenCalledTimes(1);
  });

  it('ignores other redactions and does nothing without an event', () => {
    const { mx, onRedacted } = setup('$ring');
    mx.emit(RoomEvent.Redaction, redaction('$other'));
    expect(onRedacted).not.toHaveBeenCalled();
    const none = setup(undefined);
    none.mx.emit(RoomEvent.Redaction, redaction('$ring'));
    expect(none.onRedacted).not.toHaveBeenCalled();
  });

  it('stops listening when unmounted', () => {
    const { mx, onRedacted, renderer } = setup('$ring');
    act(() => renderer.unmount());
    mx.emit(RoomEvent.Redaction, redaction('$ring'));
    expect(onRedacted).not.toHaveBeenCalled();
  });
});
