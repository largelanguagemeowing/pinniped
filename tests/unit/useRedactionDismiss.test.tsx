import React from 'react';
import { EventEmitter } from 'events';
import { act, create } from 'react-test-renderer';
import { EventType, MatrixEvent, RoomEvent, type MatrixClient, type Room } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { useRedactionDismiss } from '../../src/app/hooks/useRedactionDismiss';

const redaction = (redacts: string) => ({ getAssociatedId: () => redacts });

const setup = (eventId: string | undefined, alreadyRedacted = false) => {
  const room = {
    findEventById: (id: string) => ({ isRedacted: () => alreadyRedacted && id === '$ring' }),
  } as unknown as Room;
  const mx = new EventEmitter() as unknown as MatrixClient;
  const onRedacted = vi.fn();
  function Harness() {
    useRedactionDismiss(mx, room, eventId, onRedacted);
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

  it('fires at once when the event was redacted before it subscribed', () => {
    const { onRedacted } = setup('$ring', true);
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

  it('fires for the redaction event the SDK emits, which names its target through redacts', () => {
    const { mx, onRedacted } = setup('$ring');
    const real = (redacts: string) =>
      new MatrixEvent({ event_id: '$r', type: EventType.RoomRedaction, redacts, content: {} });
    act(() => {
      mx.emit(RoomEvent.Redaction, real('$other'));
    });
    expect(onRedacted).not.toHaveBeenCalled();
    act(() => {
      mx.emit(RoomEvent.Redaction, real('$ring'));
    });
    expect(onRedacted).toHaveBeenCalledTimes(1);
  });
});
