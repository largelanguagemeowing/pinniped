import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text, color, config, toRem } from 'folds';
import { M_POLL_END, M_POLL_RESPONSE, MatrixEvent, Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePoll } from '../../hooks/usePoll';
import {
  PollData,
  formatTimeLeft,
  makePollEndContent,
  makePollResponseContent,
  pollEndSummary,
  tallyPoll,
} from '../../utils/poll';
import * as css from './Poll.css';

// Polls whose deadline-triggered m.poll.end this session already sent.
const autoEndedPolls = new Set<string>();

const useNow = (enabled: boolean, intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
};

const votesLabel = (count: number) => `${count} ${count === 1 ? 'vote' : 'votes'}`;

type PollContentProps = {
  room: Room;
  mEvent: MatrixEvent;
  poll: PollData;
};

export function PollContent({ room, mEvent, poll }: PollContentProps) {
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const pollEventId = mEvent.getId();
  const { responses, loading, ended: endedByEvent } = usePoll(room, mEvent);

  const multiple = poll.maxSelections > 1;
  const now = useNow(!!poll.expiresAt && !endedByEvent, 30 * 1000);
  const expired = poll.expiresAt !== undefined && now >= poll.expiresAt;
  const ended = endedByEvent || expired;

  const tally = useMemo(() => tallyPoll(poll, responses, poll.expiresAt), [poll, responses]);
  const myAnswers = tally.userAnswers.get(myUserId);

  const [selected, setSelected] = useState<string[]>([]);
  const [peekResults, setPeekResults] = useState(false);
  // Optimistic vote shown until the response comes back through sync.
  const [pending, setPending] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const effectiveAnswers = pending ?? myAnswers ?? [];
  const hasVoted = effectiveAnswers.length > 0;
  const pendingSettled =
    pending !== undefined &&
    (myAnswers ?? []).length === pending.length &&
    pending.every((id) => myAnswers?.includes(id));
  useEffect(() => {
    if (pendingSettled && !busy) setPending(undefined);
  }, [pendingSettled, busy]);

  const showResults = ended || hasVoted || peekResults;
  const countsVisible = poll.disclosed || ended;
  const voterCount = pending
    ? tally.voterCount - (myAnswers ? 1 : 0) + (pending.length > 0 ? 1 : 0)
    : tally.voterCount;
  const counts = useMemo(() => {
    if (!pending) return tally.counts;
    const adjusted = new Map(tally.counts);
    myAnswers?.forEach((id) => adjusted.set(id, (adjusted.get(id) ?? 1) - 1));
    pending.forEach((id) => adjusted.set(id, (adjusted.get(id) ?? 0) + 1));
    return adjusted;
  }, [tally.counts, myAnswers, pending]);

  const isCreator = mEvent.getSender() === myUserId;
  const canEnd =
    !ended && (isCreator || room.currentState.maySendRedactionForEvent(mEvent, myUserId));

  const sendResponse = useCallback(
    async (answerIds: string[]) => {
      if (!pollEventId) return;
      setBusy(true);
      setError(undefined);
      setPending(answerIds);
      try {
        await mx.sendEvent(
          room.roomId,
          M_POLL_RESPONSE.altName,
          makePollResponseContent(pollEventId, answerIds)
        );
      } catch {
        setPending(undefined);
        setError(answerIds.length > 0 ? 'Failed to send vote.' : 'Failed to remove vote.');
      } finally {
        setBusy(false);
      }
    },
    [mx, room, pollEventId]
  );

  const sendEnd = useCallback(async () => {
    if (!pollEventId) return;
    await mx.sendEvent(
      room.roomId,
      M_POLL_END.altName,
      makePollEndContent(pollEventId, pollEndSummary(poll, tally))
    );
  }, [mx, room, pollEventId, poll, tally]);

  // The deadline is a client-side extension; once it passes, the creator's
  // client closes the poll for real so other clients see it ended too.
  useEffect(() => {
    if (!pollEventId || !isCreator || !expired || endedByEvent || loading) return;
    if (autoEndedPolls.has(pollEventId)) return;
    autoEndedPolls.add(pollEventId);
    sendEnd().catch(() => autoEndedPolls.delete(pollEventId));
  }, [pollEventId, isCreator, expired, endedByEvent, loading, sendEnd]);

  const handleEnd = () => {
    setBusy(true);
    setError(undefined);
    sendEnd()
      .catch(() => setError('Failed to end poll.'))
      .finally(() => setBusy(false));
  };

  const handleSelect = (answerId: string) => {
    if (!multiple) {
      setSelected([answerId]);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(answerId)) return prev.filter((id) => id !== answerId);
      if (prev.length >= poll.maxSelections) return prev;
      return [...prev, answerId];
    });
  };

  const handleVote = () => {
    if (selected.length === 0) return;
    sendResponse(selected).then(() => setSelected([]));
    setPeekResults(false);
  };

  const handleRemoveVote = () => {
    setSelected([]);
    sendResponse([]);
  };

  let subtitle: string;
  if (ended) subtitle = 'Poll closed';
  else if (!showResults) subtitle = multiple ? 'Select one or more answers' : 'Select one answer';
  else if (!countsVisible) subtitle = 'Results will be shown when the poll ends';
  else subtitle = multiple ? 'Multiple answers allowed' : 'Single answer';

  let optionsRole: string | undefined;
  if (!showResults) optionsRole = multiple ? 'group' : 'radiogroup';

  const topCount = Math.max(0, ...counts.values());

  return (
    <div className={css.PollCard}>
      <Box direction="Column" gap="100">
        <Text size="H5" style={{ overflowWrap: 'anywhere' }}>
          {poll.question}
        </Text>
        <Text size="T300" priority="300">
          {subtitle}
        </Text>
      </Box>
      <Box direction="Column" gap="200" role={optionsRole}>
        {poll.answers.map((answer) => {
          if (!showResults) {
            const checked = selected.includes(answer.id);
            return (
              <button
                key={answer.id}
                type="button"
                className={css.PollOption}
                role={multiple ? 'checkbox' : 'radio'}
                aria-checked={checked}
                disabled={busy}
                onClick={() => handleSelect(answer.id)}
              >
                <span className={css.PollOptionContent}>
                  <Text className={css.PollOptionText} size="T400">
                    <b>{answer.text}</b>
                  </Text>
                  <span
                    className={css.PollIndicator}
                    data-multiple={multiple}
                    data-checked={checked}
                  >
                    {checked && <Icon size="50" src={Icons.Check} />}
                  </span>
                </span>
              </button>
            );
          }

          const count = counts.get(answer.id) ?? 0;
          const percent = voterCount > 0 ? Math.round((count / voterCount) * 100) : 0;
          const mine = effectiveAnswers.includes(answer.id);
          const winner = ended && count > 0 && count === topCount;
          return (
            <div
              key={answer.id}
              className={css.PollOption}
              data-voted={mine || (ended && !hasVoted && winner)}
              style={{ [css.PollOptionFill]: countsVisible ? `${percent}%` : '0%' }}
            >
              <span className={css.PollOptionContent}>
                <Text className={css.PollOptionText} size="T400">
                  <b>{answer.text}</b>
                </Text>
                {countsVisible && (
                  <Box shrink="No" alignItems="Center" gap="200">
                    <Text size="T200" style={{ whiteSpace: 'nowrap' }}>
                      <b>{votesLabel(count)}</b>
                    </Text>
                    <Text size="T400" style={{ minWidth: toRem(40), textAlign: 'right' }}>
                      <b>{percent}%</b>
                    </Text>
                  </Box>
                )}
                {mine && (
                  <span className={css.PollIndicator} data-checked>
                    <Icon size="50" src={Icons.Check} />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </Box>
      <Box alignItems="Center" gap="300" wrap="Wrap">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Text size="T300" priority="300">
            {loading ? 'Loading votes…' : votesLabel(voterCount)}
            {!ended && poll.expiresAt !== undefined && (
              <>
                {' • '}
                {formatTimeLeft(poll.expiresAt - now)}
              </>
            )}
          </Text>
          {(loading || busy) && <Spinner size="50" variant="Secondary" />}
        </Box>
        <Box alignItems="Center" gap="200">
          {canEnd && (
            <Button
              size="300"
              variant="Secondary"
              fill="None"
              radii="300"
              disabled={busy}
              onClick={handleEnd}
            >
              <Text size="B300">End Poll</Text>
            </Button>
          )}
          {!ended && !hasVoted && poll.disclosed && (
            <Button
              size="300"
              variant="Secondary"
              fill="None"
              radii="300"
              onClick={() => setPeekResults(!peekResults)}
            >
              <Text size="B300">{peekResults ? 'Go back to vote' : 'Show results'}</Text>
            </Button>
          )}
          {!ended && !hasVoted && !peekResults && (
            <Button
              size="300"
              variant="Primary"
              fill="Solid"
              radii="300"
              disabled={selected.length === 0 || busy}
              onClick={handleVote}
            >
              <Text size="B300">Vote</Text>
            </Button>
          )}
          {!ended && hasVoted && (
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={busy}
              onClick={handleRemoveVote}
            >
              <Text size="B300">Remove Vote</Text>
            </Button>
          )}
        </Box>
      </Box>
      {error && (
        <Text
          size="T200"
          style={{ color: color.Critical.Main, marginTop: `-${config.space.S100}` }}
        >
          {error}
        </Text>
      )}
    </div>
  );
}
