import { describe, expect, it } from 'vitest';
import { MatrixEvent } from 'matrix-js-sdk';
import {
  makePollEndContent,
  makePollResponseContent,
  makePollStartContent,
  parsePollStart,
  tallyPoll,
} from '../../src/app/utils/poll';

const response = (sender: string, ts: number, answers: unknown) =>
  new MatrixEvent({
    type: 'org.matrix.msc3381.poll.response',
    sender,
    origin_server_ts: ts,
    event_id: `$${sender}-${ts}`,
    content: {
      ...makePollResponseContent('$poll', []),
      'org.matrix.msc3381.poll.response': { answers },
    },
  });

describe('polls', () => {
  // Other clients parse the unstable MSC3381 form; a stable event type or key with unstable
  // text inside is a mix that strict parsers reject.
  it('sends every poll event in the unstable MSC3381 form', () => {
    const start = makePollStartContent('Pizza?', ['yes', 'no'], 1);
    const [yes, no] = parsePollStart(start)!.answers.map((a) => a.id);
    expect(start).toEqual({
      'org.matrix.msc3381.poll.start': {
        question: { 'org.matrix.msc1767.text': 'Pizza?' },
        kind: 'org.matrix.msc3381.poll.disclosed',
        max_selections: 1,
        answers: [
          { id: yes, 'org.matrix.msc1767.text': 'yes' },
          { id: no, 'org.matrix.msc1767.text': 'no' },
        ],
      },
      'org.matrix.msc1767.text': 'Pizza?\n1. yes\n2. no',
    });

    expect(makePollResponseContent('$poll', [yes])).toEqual({
      'org.matrix.msc3381.poll.response': { answers: [yes] },
      'm.relates_to': { rel_type: 'm.reference', event_id: '$poll' },
    });

    expect(makePollEndContent('$poll', 'The poll has ended.')).toEqual({
      'org.matrix.msc3381.poll.end': {},
      'org.matrix.msc1767.text': 'The poll has ended.',
      'm.relates_to': { rel_type: 'm.reference', event_id: '$poll' },
    });
  });

  it('round-trips the poll start content we send', () => {
    const poll = parsePollStart(makePollStartContent('Pizza?', ['yes', 'no'], 2, 1234));
    expect(poll?.question).toBe('Pizza?');
    expect(poll?.answers.map((a) => a.text)).toEqual(['yes', 'no']);
    expect(poll?.maxSelections).toBe(2);
    expect(poll?.disclosed).toBe(true);
    expect(poll?.expiresAt).toBe(1234);
  });

  it('sends the deadline under the Pinniped name and still reads the earlier one', () => {
    const content = makePollStartContent('Pizza?', ['yes', 'no'], 1, 1234);
    expect(content['club.stablecat.pinniped.poll.expires_ts']).toBe(1234);

    const { 'club.stablecat.pinniped.poll.expires_ts': deadline, ...rest } = content;
    expect(parsePollStart({ ...rest, 'de.mreow.poll.expires_ts': deadline })?.expiresAt).toBe(1234);
    expect(parsePollStart(rest)?.expiresAt).toBeUndefined();
  });

  it('parses stable-namespaced polls from other clients', () => {
    const poll = parsePollStart({
      'm.poll.start': {
        question: { 'm.text': [{ body: 'Question' }] },
        kind: 'm.poll.undisclosed',
        max_selections: 5,
        answers: [
          { id: 'x', 'm.text': [{ body: 'X' }] },
          { id: 'y', 'm.text': [{ body: 'Y' }] },
        ],
      },
    });
    expect(poll?.question).toBe('Question');
    expect(poll?.maxSelections).toBe(2);
    expect(poll?.disclosed).toBe(false);
  });

  it('tallies votes per MSC3381', () => {
    const poll = parsePollStart(makePollStartContent('Q', ['a', 'b', 'c'], 1, 100))!;
    const [a, b] = poll.answers.map((ans) => ans.id);
    const tally = tallyPoll(
      poll,
      [
        response('@changed', 1, [a]),
        response('@changed', 2, [b]), // latest response wins
        response('@greedy', 1, [a, b]), // truncated to max_selections
        response('@removed', 1, [a]),
        response('@removed', 5, []), // empty answers = vote removed
        response('@bogus', 1, ['nope']), // unknown ids spoil the vote
        response('@late', 200, [a]), // after the poll closed
      ],
      100
    );
    expect(tally.voterCount).toBe(2);
    expect(tally.counts.get(a)).toBe(1);
    expect(tally.counts.get(b)).toBe(1);
    expect(tally.userAnswers.get('@changed')).toEqual([b]);
    expect(tally.userAnswers.has('@removed')).toBe(false);
  });
});
