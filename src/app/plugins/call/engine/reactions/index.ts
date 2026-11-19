/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RelationType } from 'matrix-js-sdk';

export const ElementCallReactionEventType = 'io.element.call.reaction';

export interface ReactionOption {
  /**
   * The emoji to display. This is always displayed even if no emoji is matched
   * from `ReactionSet`.
   *
   * @note Any excess characters are trimmed from this string.
   */
  emoji: string;
  /**
   * The name of the emoji. This is the unique key used when looking for a local
   * effect in our `ReactionSet` array.
   */
  name: string;
  /**
   * Optional aliases to look for when searching for an emoji in the interface.
   */
  alias?: string[];
}

export interface ECallReactionEventContent {
  'm.relates_to': {
    rel_type: RelationType.Reference;
    event_id: string;
  };
  emoji: string;
  name: string;
}

export const GenericReaction: ReactionOption = {
  name: 'generic',
  emoji: '', // Filled in by user
};

export const ReactionsRowSize = 5;

// The first {ReactionsRowSize} reactions are always visible.
export const ReactionSet: ReactionOption[] = [
  {
    emoji: '👍',
    name: 'thumbsup',
    // TODO: These need to be translated.
    alias: ['+1', 'yes', 'thumbs up'],
  },
  {
    emoji: '🎉',
    name: 'party',
    alias: ['hurray', 'success'],
  },
  {
    emoji: '👏',
    name: 'clapping',
    alias: ['celebrate', 'success'],
  },
  {
    emoji: '🐶',
    name: 'dog',
    alias: ['doggo', 'pupper', 'woofer', 'bark'],
  },
  {
    emoji: '🐱',
    name: 'cat',
    alias: ['meow', 'kitty'],
  },
  {
    emoji: '💡',
    name: 'lightbulb',
    alias: ['bulb', 'light', 'idea', 'ping'],
  },
  {
    emoji: '🦗',
    name: 'crickets',
    alias: ['awkward', 'silence'],
  },
  {
    emoji: '👎',
    name: 'thumbsdown',
    alias: ['-1', 'no', 'thumbs no'],
  },
  {
    emoji: '😵‍💫',
    name: 'dizzy',
    alias: ['dazed', 'confused'],
  },
  {
    emoji: '👌',
    name: 'ok',
    alias: ['okay', 'cool'],
  },
  {
    emoji: '🥰',
    name: 'heart',
    alias: ['heart', 'love', 'smiling'],
  },
  {
    emoji: '😄',
    name: 'laugh',
    alias: ['giggle', 'joy', 'smiling'],
  },
  {
    emoji: '🦌',
    name: 'deer',
    alias: ['stag', 'doe', 'bleat'],
  },
  {
    emoji: '🤘',
    name: 'rock',
    alias: ['cool', 'horns', 'guitar'],
  },
  {
    emoji: '👋',
    name: 'wave',
    alias: ['hand', 'waving'],
  },
  {
    emoji: '🥁',
    name: 'drum',
    alias: ['joke'],
  },
];

export interface RaisedHandInfo {
  /**
   * Call membership event that was reacted to.
   */
  membershipEventId: string;
  /**
   * Event ID of the reaction itself.
   */
  reactionEventId: string;
  /**
   * The time when the reaction was raised.
   */
  time: Date;
}

export interface ReactionInfo {
  expireAfter: Date;
  reactionOption: ReactionOption;
}
