import {
  as,
  Badge,
  Box,
  color,
  ContainerColor,
  MainColor,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import React, { ReactNode, useId } from 'react';
import * as css from './styles.css';
import { Presence, usePresenceLabel } from '../../hooks/useUserPresence';
import { useTheme } from '../../hooks/useTheme';
import { isGrayscaleTheme } from '../../themes/fork/registry';

// Online stays green independently of the theme's success palette, except on a theme
// that has no hues: there it takes the theme's own neutral success step.
const ONLINE_GREEN = '#50FA7B';
const AWAY_YELLOW = '#F1C40F';
const OFFLINE_GRAY = '#80848E';

const usePresenceColors = () => {
  const grayscale = isGrayscaleTheme(useTheme().id);
  return {
    online: grayscale ? color.Success.Main : ONLINE_GREEN,
    away: grayscale ? color.Warning.Main : AWAY_YELLOW,
  };
};

// Away is a crescent filling the same round box as the other badges, so it differs from
// them by shape and not only by color. It is laid over its parent, so the parent's size
// stays that of a plain badge.
function Crescent() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <path d="M0.8 16.32A12 12 0 1 0 16.32 0.8A11 11 0 0 1 0.8 16.32z" />
    </svg>
  );
}

type PresenceDotProps = {
  presence: Presence;
  size: string;
};
export function PresenceDot({ presence, size }: PresenceDotProps) {
  const colors = usePresenceColors();
  if (presence === Presence.Unavailable) {
    return (
      <span
        style={{
          position: 'relative',
          width: size,
          height: size,
          flexShrink: 0,
          color: colors.away,
        }}
      >
        <Crescent />
      </span>
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: presence === Presence.Online ? colors.online : OFFLINE_GRAY,
      }}
    />
  );
}

const PresenceToColor: Record<Presence, MainColor> = {
  [Presence.Online]: 'Success',
  [Presence.Unavailable]: 'Warning',
  [Presence.Offline]: 'Secondary',
};

const presenceStyle = (presence: Presence, colors: { online: string; away: string }) => {
  if (presence === Presence.Online) return { backgroundColor: colors.online };
  // The crescent is drawn in the badge's own color on a clear background.
  if (presence === Presence.Unavailable)
    return { position: 'relative' as const, backgroundColor: 'transparent', color: colors.away };
  return undefined;
};

type PresenceBadgeProps = {
  presence: Presence;
  status?: string;
  size?: '200' | '300' | '400' | '500';
};
export function PresenceBadge({ presence, status, size }: PresenceBadgeProps) {
  const label = usePresenceLabel();
  const badgeLabelId = useId();
  const colors = usePresenceColors();

  return (
    <TooltipProvider
      position="Right"
      align="Center"
      offset={4}
      delay={200}
      tooltip={
        <Tooltip id={badgeLabelId}>
          <Box style={{ maxWidth: toRem(250) }} alignItems="Baseline" gap="100">
            <Text size="L400">{label[presence]}</Text>
            {status && <Text size="T200">•</Text>}
            {status && <Text size="T200">{status}</Text>}
          </Box>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Badge
          aria-labelledby={badgeLabelId}
          ref={triggerRef}
          size={size}
          variant={PresenceToColor[presence]}
          fill={presence === Presence.Offline ? 'Soft' : 'Solid'}
          style={presenceStyle(presence, colors)}
          radii="Pill"
        >
          {presence === Presence.Unavailable && <Crescent />}
        </Badge>
      )}
    </TooltipProvider>
  );
}

type AvatarPresenceProps = {
  badge: ReactNode;
  variant?: ContainerColor;
};
export const AvatarPresence = as<'div', AvatarPresenceProps>(
  ({ as: AsAvatarPresence, badge, variant = 'Surface', children, ...props }, ref) => (
    <Box as={AsAvatarPresence} className={css.AvatarPresence} {...props} ref={ref}>
      {badge && (
        <div
          className={css.AvatarPresenceBadge}
          style={{ backgroundColor: color[variant].Container }}
        >
          {badge}
        </div>
      )}
      {children}
    </Box>
  )
);
