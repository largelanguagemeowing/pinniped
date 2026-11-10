import React, { FormEventHandler, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { M_POLL_START, Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { stopPropagation } from '../../utils/keyboard';
import { EmojiBoard } from '../emoji-board';
import {
  POLL_ANSWER_MAX_LENGTH,
  POLL_MAX_ANSWERS,
  POLL_QUESTION_MAX_LENGTH,
  makePollStartContent,
} from '../../utils/poll';

export function PollIcon() {
  return (
    <>
      <path d="M4 20V13H7V20H4Z" fill="currentColor" />
      <path d="M10.5 20V4H13.5V20H10.5Z" fill="currentColor" />
      <path d="M17 20V9H20V20H17Z" fill="currentColor" />
    </>
  );
}

const HOUR = 60 * 60 * 1000;
const DURATIONS: { label: string; ms?: number }[] = [
  { label: '1 hour', ms: HOUR },
  { label: '4 hours', ms: 4 * HOUR },
  { label: '8 hours', ms: 8 * HOUR },
  { label: '24 hours', ms: 24 * HOUR },
  { label: '3 days', ms: 72 * HOUR },
  { label: '1 week', ms: 168 * HOUR },
  { label: '2 weeks', ms: 336 * HOUR },
  { label: 'No time limit' },
];
const DEFAULT_DURATION = 3;

type AnswerDraft = {
  key: number;
  emoji?: string;
  text: string;
};

type PollCreatorProps = {
  room: Room;
  requestClose: () => void;
};

export function PollCreator({ room, requestClose }: PollCreatorProps) {
  const mx = useMatrixClient();
  const nextKey = useRef(2);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<AnswerDraft[]>([
    { key: 0, text: '' },
    { key: 1, text: '' },
  ]);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [multiple, setMultiple] = useState(false);
  const [durationAnchor, setDurationAnchor] = useState<RectCords>();
  const [emojiTarget, setEmojiTarget] = useState<{ key: number; anchor: RectCords }>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const answerTexts = answers
    .map((a) => {
      const text = a.text.trim();
      if (!text) return '';
      return a.emoji ? `${a.emoji} ${text}` : text;
    })
    .filter((text) => text.length > 0);
  const canPost = question.trim().length > 0 && answerTexts.length >= 2 && !sending;

  const updateAnswer = (key: number, patch: Partial<AnswerDraft>) =>
    setAnswers((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const removeAnswer = (key: number) =>
    setAnswers((prev) => (prev.length > 2 ? prev.filter((a) => a.key !== key) : prev));

  const addAnswer = () => {
    const key = nextKey.current;
    nextKey.current += 1;
    setAnswers((prev) => (prev.length < POLL_MAX_ANSWERS ? [...prev, { key, text: '' }] : prev));
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!canPost) return;
    const { ms } = DURATIONS[duration];
    const content = makePollStartContent(
      question.trim(),
      answerTexts,
      multiple ? answerTexts.length : 1,
      ms !== undefined ? Date.now() + ms : undefined
    );
    setSending(true);
    setError(undefined);
    mx.sendEvent(room.roomId, M_POLL_START.altName, content)
      .then(() => requestClose())
      .catch(() => {
        setError('Failed to post poll.');
        setSending(false);
      });
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={{ width: toRem(520), maxWidth: '100%' }}>
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Create a Poll</Text>
              </Box>
              <IconButton size="300" onClick={requestClose} radii="300" aria-label="Close">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Scroll size="300" hideTrack style={{ maxHeight: '75vh' }}>
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{ padding: config.space.S400 }}
                direction="Column"
                gap="500"
              >
                <Box direction="Column" gap="100">
                  <Text size="L400">Question</Text>
                  <Input
                    size="400"
                    variant="Background"
                    radii="300"
                    outlined
                    autoFocus
                    placeholder="What question do you want to ask?"
                    maxLength={POLL_QUESTION_MAX_LENGTH}
                    value={question}
                    onChange={(evt) => setQuestion(evt.currentTarget.value)}
                  />
                  <Text size="T200" priority="300" align="Right">
                    {question.length} / {POLL_QUESTION_MAX_LENGTH}
                  </Text>
                </Box>

                <Box direction="Column" gap="200">
                  <Text size="L400">Answers</Text>
                  {answers.map((answer) => (
                    <Input
                      key={answer.key}
                      size="400"
                      variant="Background"
                      radii="300"
                      outlined
                      placeholder="Type your answer"
                      maxLength={POLL_ANSWER_MAX_LENGTH}
                      value={answer.text}
                      onChange={(evt) =>
                        updateAnswer(answer.key, { text: evt.currentTarget.value })
                      }
                      before={
                        <IconButton
                          type="button"
                          size="300"
                          radii="300"
                          variant="Background"
                          aria-label="Pick answer emoji"
                          aria-pressed={emojiTarget?.key === answer.key}
                          onClick={(evt) => {
                            if (answer.emoji) {
                              updateAnswer(answer.key, { emoji: undefined });
                              return;
                            }
                            setEmojiTarget({
                              key: answer.key,
                              anchor: evt.currentTarget.getBoundingClientRect(),
                            });
                          }}
                        >
                          {answer.emoji ? (
                            <Text as="span" size="T400">
                              {answer.emoji}
                            </Text>
                          ) : (
                            <Icon size="100" src={Icons.Smile} />
                          )}
                        </IconButton>
                      }
                      after={
                        <IconButton
                          type="button"
                          size="300"
                          radii="300"
                          variant="Background"
                          aria-label="Remove answer"
                          disabled={answers.length <= 2}
                          onClick={() => removeAnswer(answer.key)}
                        >
                          <Icon size="100" src={Icons.Delete} />
                        </IconButton>
                      }
                    />
                  ))}
                  {answers.length < POLL_MAX_ANSWERS && (
                    <Box justifyContent="End">
                      <Button
                        type="button"
                        size="400"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        before={<Icon size="100" src={Icons.Plus} />}
                        onClick={addAnswer}
                      >
                        <Text size="B400">Add another answer</Text>
                      </Button>
                    </Box>
                  )}
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">Duration</Text>
                  <Button
                    type="button"
                    size="400"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    outlined
                    aria-pressed={!!durationAnchor}
                    after={<Icon size="100" src={Icons.ChevronBottom} />}
                    onClick={(evt) => setDurationAnchor(evt.currentTarget.getBoundingClientRect())}
                  >
                    <Text size="T300" style={{ flexGrow: 1, textAlign: 'left' }}>
                      {DURATIONS[duration].label}
                    </Text>
                  </Button>
                </Box>

                {error && (
                  <Text size="T300" style={{ color: color.Critical.Main }}>
                    {error}
                  </Text>
                )}

                <Box alignItems="Center" gap="300">
                  <Box
                    grow="Yes"
                    alignItems="Center"
                    gap="200"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setMultiple(!multiple)}
                  >
                    <Checkbox size="300" variant="Primary" checked={multiple} />
                    <Text size="T300">Allow Multiple Answers</Text>
                  </Box>
                  <Button
                    type="submit"
                    size="400"
                    variant="Primary"
                    fill="Solid"
                    radii="300"
                    disabled={!canPost}
                    before={
                      sending ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined
                    }
                  >
                    <Text size="B400">Post</Text>
                  </Button>
                </Box>
              </Box>
            </Scroll>
            <PopOut
              anchor={durationAnchor}
              position="Bottom"
              align="Start"
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    returnFocusOnDeactivate: false,
                    onDeactivate: () => setDurationAnchor(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <Menu style={{ minWidth: toRem(200) }}>
                    <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                      {DURATIONS.map((d, index) => (
                        <MenuItem
                          key={d.label}
                          size="300"
                          radii="300"
                          aria-pressed={index === duration}
                          after={
                            index === duration ? <Icon size="100" src={Icons.Check} /> : undefined
                          }
                          onClick={() => {
                            setDuration(index);
                            setDurationAnchor(undefined);
                          }}
                        >
                          <Text style={{ flexGrow: 1 }} as="span" size="T300">
                            {d.label}
                          </Text>
                        </MenuItem>
                      ))}
                    </Box>
                  </Menu>
                </FocusTrap>
              }
            />
            <PopOut
              anchor={emojiTarget?.anchor}
              position="Bottom"
              align="Start"
              content={
                <EmojiBoard
                  imagePackRooms={[]}
                  returnFocusOnDeactivate={false}
                  onEmojiSelect={(unicode) => {
                    if (emojiTarget) updateAnswer(emojiTarget.key, { emoji: unicode });
                    setEmojiTarget(undefined);
                  }}
                  requestClose={() => setEmojiTarget(undefined)}
                />
              }
            />
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
