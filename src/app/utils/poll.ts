import {
  IContent,
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
  MatrixEvent,
  RelationType,
} from 'matrix-js-sdk';

// Polls follow MSC3381. Events are sent with the unstable identifiers because
// that is what Element and most other clients still emit; parsing accepts both.
const TEXT_UNSTABLE = 'org.matrix.msc1767.text';
const TEXT_STABLE = 'm.text';

// Fork-only extension: MSC3381 has no notion of a poll deadline. Pinniped stores
// the deadline here and treats the poll as closed after it; the creator's
// client also sends a real m.poll.end once it notices the deadline passed.
export const POLL_EXPIRES_KEY = 'club.stablecat.pinniped.poll.expires_ts';
/** The name the deadline was sent under before it moved to Pinniped's namespace. */
const LEGACY_POLL_EXPIRES_KEY = 'de.mreow.poll.expires_ts';

export const POLL_QUESTION_MAX_LENGTH = 300;
export const POLL_ANSWER_MAX_LENGTH = 100;
export const POLL_MAX_ANSWERS = 20;

export const isPollStartType = (type: string): boolean => M_POLL_START.matches(type);

export type PollAnswer = {
  id: string;
  text: string;
};

export type PollData = {
  question: string;
  answers: PollAnswer[];
  maxSelections: number;
  disclosed: boolean;
  expiresAt?: number;
};

const getText = (content: unknown): string | undefined => {
  if (!content || typeof content !== 'object') return undefined;
  const obj = content as Record<string, unknown>;
  const unstable = obj[TEXT_UNSTABLE];
  if (typeof unstable === 'string') return unstable;
  const stable = obj[TEXT_STABLE];
  if (typeof stable === 'string') return stable;
  if (Array.isArray(stable)) {
    const plain = stable.find(
      (repr) => typeof repr?.body === 'string' && (!repr.mimetype || repr.mimetype === 'text/plain')
    );
    if (plain) return plain.body;
  }
  if (typeof obj.body === 'string') return obj.body;
  return undefined;
};

export const parsePollStart = (content: IContent): PollData | undefined => {
  const poll = content[M_POLL_START.name] ?? content[M_POLL_START.altName];
  if (!poll || typeof poll !== 'object') return undefined;

  const question = getText(poll.question);
  if (!question) return undefined;
  if (!Array.isArray(poll.answers)) return undefined;

  const seen = new Set<string>();
  const answers: PollAnswer[] = [];
  poll.answers.forEach((answer: unknown) => {
    if (!answer || typeof answer !== 'object') return;
    const { id } = answer as { id?: unknown };
    const text = getText(answer);
    if (typeof id !== 'string' || !text || seen.has(id)) return;
    seen.add(id);
    answers.push({ id, text });
  });
  if (answers.length === 0) return undefined;

  const rawMax = typeof poll.max_selections === 'number' ? poll.max_selections : 1;
  const maxSelections = Math.min(Math.max(1, Math.floor(rawMax)), answers.length);

  // A missing or unrecognised kind is undisclosed (MSC3381).
  const disclosed = M_POLL_KIND_DISCLOSED.matches(poll.kind);

  const rawExpires = content[POLL_EXPIRES_KEY] ?? content[LEGACY_POLL_EXPIRES_KEY];
  const expiresAt = typeof rawExpires === 'number' && rawExpires > 0 ? rawExpires : undefined;

  return {
    question,
    answers: answers.slice(0, POLL_MAX_ANSWERS),
    maxSelections,
    disclosed,
    expiresAt,
  };
};

export const getPollQuestion = (content: IContent): string | undefined =>
  parsePollStart(content)?.question;

const randomAnswerId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

export const makePollStartContent = (
  question: string,
  answers: string[],
  maxSelections: number,
  expiresAt?: number
): IContent => {
  const fallback = `${question}\n${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
  const content: IContent = {
    [M_POLL_START.altName]: {
      question: { [TEXT_UNSTABLE]: question },
      kind: M_POLL_KIND_DISCLOSED.altName,
      max_selections: maxSelections,
      answers: answers.map((text) => ({ id: randomAnswerId(), [TEXT_UNSTABLE]: text })),
    },
    [TEXT_UNSTABLE]: fallback,
  };
  if (expiresAt !== undefined) content[POLL_EXPIRES_KEY] = expiresAt;
  return content;
};

export const makePollResponseContent = (pollEventId: string, answerIds: string[]): IContent => ({
  [M_POLL_RESPONSE.altName]: { answers: answerIds },
  'm.relates_to': { rel_type: RelationType.Reference, event_id: pollEventId },
});

export const makePollEndContent = (pollEventId: string, text: string): IContent => ({
  [M_POLL_END.altName]: {},
  [TEXT_UNSTABLE]: text,
  'm.relates_to': { rel_type: RelationType.Reference, event_id: pollEventId },
});

export type PollTally = {
  /** answer id -> number of voters who picked it */
  counts: Map<string, number>;
  /** user id -> the answers their latest valid response picked */
  userAnswers: Map<string, string[]>;
  voterCount: number;
};

/**
 * Count votes per MSC3381: only each user's most recent response before the
 * poll closed counts. Unknown answer ids are dropped, selections past
 * max_selections are truncated, and a response left with no valid answer is
 * spoiled, which counts as the user not having voted (used for "Remove vote").
 */
export const tallyPoll = (
  poll: PollData,
  responses: MatrixEvent[],
  closedAt?: number
): PollTally => {
  const validIds = new Set(poll.answers.map((a) => a.id));
  const latest = new Map<string, MatrixEvent>();

  responses.forEach((evt) => {
    const sender = evt.getSender();
    if (!sender || evt.isDecryptionFailure() || evt.isRedacted()) return;
    if (!M_POLL_RESPONSE.matches(evt.getType())) return;
    if (closedAt !== undefined && evt.getTs() > closedAt) return;
    const prev = latest.get(sender);
    if (!prev || prev.getTs() <= evt.getTs()) latest.set(sender, evt);
  });

  const counts = new Map<string, number>();
  const userAnswers = new Map<string, string[]>();
  latest.forEach((evt, sender) => {
    const content = evt.getContent();
    const raw = (content[M_POLL_RESPONSE.name] ?? content[M_POLL_RESPONSE.altName])?.answers;
    if (!Array.isArray(raw)) return;
    // Truncate to max_selections first, then drop duplicates; any id that is
    // not an answer of this poll spoils the whole response.
    const limited = raw.slice(0, poll.maxSelections);
    if (limited.some((id) => typeof id !== 'string' || !validIds.has(id))) return;
    const picked = Array.from(new Set<string>(limited));
    if (picked.length === 0) return;
    userAnswers.set(sender, picked);
    picked.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  });

  return { counts, userAnswers, voterCount: userAnswers.size };
};

export const pollEndSummary = (poll: PollData, tally: PollTally): string => {
  const top = Math.max(0, ...tally.counts.values());
  if (top === 0) return 'The poll has ended. No votes were cast.';
  const winners = poll.answers.filter((a) => tally.counts.get(a.id) === top).map((a) => a.text);
  return `The poll has ended. Top answer: ${winners.join(', ')}`;
};

export const formatTimeLeft = (ms: number): string => {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
};
