import React from 'react';
import { Box, Text } from 'folds';
import * as css from './styles.css';
import { LOGIN_PATH, REGISTER_PATH, RESET_PASSWORD_PATH } from '../paths';

type AsideCopy = {
  heading: string;
  paragraphs: string[];
};

const ASIDE_COPY: Record<string, AsideCopy> = {
  [LOGIN_PATH]: {
    heading: 'Your account lives on a homeserver',
    paragraphs: [
      'A homeserver stores your account and message history. Homeservers talk to each other, so you can chat with people on any of them.',
      'Signing in gets you into your account. Your encrypted messages are unlocked in the next step, on this device.',
    ],
  },
  [REGISTER_PATH]: {
    heading: 'Pick a homeserver you trust',
    paragraphs: [
      'Your homeserver stores your account and knows which rooms you are in and who you talk to. It cannot read messages in encrypted rooms.',
      'You can chat with people on other homeservers, so this choice is about who looks after your account, not who you can reach.',
    ],
  },
  [RESET_PASSWORD_PATH]: {
    heading: 'A new password does not unlock old messages',
    paragraphs: [
      'Resetting your password lets you sign in again. Your encrypted history is protected by your recovery key, which is separate.',
      'Without the recovery key or a device that is already signed in, messages sent before the reset stay locked.',
    ],
  },
};

export function AuthAside({ authPath }: { authPath: string }) {
  const copy = ASIDE_COPY[authPath] ?? ASIDE_COPY[LOGIN_PATH];

  return (
    <Box as="aside" className={css.AuthAside}>
      <Box className={css.AuthAsideContent} direction="Column">
        <Text size="H3">{copy.heading}</Text>
        {copy.paragraphs.map((paragraph) => (
          <Text key={paragraph} size="T400" priority="300">
            {paragraph}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
