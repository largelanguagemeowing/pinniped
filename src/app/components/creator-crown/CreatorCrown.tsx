import React from 'react';
import { Crown } from 'lucide-react';
import { Room } from 'matrix-js-sdk';
import { Icon, Text, Tooltip, TooltipProvider, type IconSrc } from 'folds';
import { IPowerLevels } from '../../hooks/usePowerLevels';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useAccessiblePowerTagColors } from '../../hooks/useMemberPowerTag';
import { FOUNDER_POWER } from '../../utils/powerLevelTags';

// folds IconSrc render function, like the lucide overrides in src/folds; solid silhouette
const CrownIcon: IconSrc = () =>
  React.createElement(Crown, {
    width: '100%',
    height: '100%',
    fill: 'currentColor',
    stroke: 'currentColor',
  });

/** The Founder role's colour as shown in this theme; undefined when role colours are off. */
export const useCreatorCrownColor = (room: Room, powerLevels: IPowerLevels): string | undefined => {
  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const tagColors = useAccessiblePowerTagColors(powerLevelTags);
  const founderColor = powerLevelTags[FOUNDER_POWER]?.color;
  return founderColor ? tagColors.get(founderColor) : undefined;
};

type CreatorCrownProps = {
  /** undefined takes the surrounding text colour */
  crownColor: string | undefined;
};

/** Marks a room creator (room v12+ `creators`) next to their name in member lists. */
export function CreatorCrown({ crownColor }: CreatorCrownProps) {
  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">Founder</Text>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Icon
          ref={triggerRef}
          src={CrownIcon}
          size="50"
          style={{ color: crownColor, flexShrink: 0 }}
          aria-label="Founder"
        />
      )}
    </TooltipProvider>
  );
}
