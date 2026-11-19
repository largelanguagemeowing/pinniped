import baduntss from './sounds/baduntss.ogg';
import cat from './sounds/cat.ogg';
import clap from './sounds/clap.ogg';
import crickets from './sounds/crickets.ogg';
import deer from './sounds/deer.ogg';
import dog from './sounds/dog.ogg';
import generic from './sounds/generic.ogg';
import lightbulb from './sounds/lightbulb.ogg';
import party from './sounds/party.ogg';
import rock from './sounds/rock.ogg';
import wave from './sounds/wave.ogg';

/** The sound of each reaction, by its name in the call core's ReactionSet. */
const REACTION_SOUNDS: Record<string, string> = {
  party,
  clapping: clap,
  dog,
  cat,
  lightbulb,
  crickets,
  deer,
  rock,
  wave,
  drum: baduntss,
};

/** Reactions without a sound of their own play this one. */
export const GENERIC_REACTION_SOUND = generic;

export const reactionSoundUrl = (name: string): string =>
  Object.prototype.hasOwnProperty.call(REACTION_SOUNDS, name)
    ? REACTION_SOUNDS[name]
    : GENERIC_REACTION_SOUND;

/** Every sound a reaction can play. */
export const allReactionSoundUrls = (): string[] => [
  ...new Set([...Object.values(REACTION_SOUNDS), GENERIC_REACTION_SOUND]),
];
