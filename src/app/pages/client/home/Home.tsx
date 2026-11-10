import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Input,
  Text,
  Tooltip,
  TooltipProvider,
  config,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as css from './Home.css';
import { factoryRoomIdByActivity } from '../../../utils/sort';
import {
  NavCategory,
  NavCategoryHeader,
  NavEmptyCenter,
  NavEmptyLayout,
  NavItem,
  NavItemContent,
  NavLink,
} from '../../../components/nav';
import {
  getDirectCreatePath,
  getHomeInvitesPath,
  getHomePath,
  getHomeRoomPath,
} from '../../pathUtils';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import { useDirectCreateSelected } from '../../../hooks/router/useDirectSelected';
import {
  useHomeIndexSelected,
  useHomeInvitesSelected,
} from '../../../hooks/router/useHomeSelected';
import { useDirectRooms } from '../direct/useDirectRooms';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { VirtualTile } from '../../../components/virtualizer';
import { RoomNavItem } from '../../../features/room-nav';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { PageNav, PageNavHeader, PageNavContent } from '../../../components/page';
import { InvitesNavItem } from '../inbox/Inbox';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';

type HomeHeaderProps = {
  /** The DM filter text. Undefined when there are no DMs to filter, which shows the title instead. */
  filter?: string;
  onFilterChange: (filter: string) => void;
};
function HomeHeader({ filter, onFilterChange }: HomeHeaderProps) {
  return (
    <PageNavHeader>
      <Box alignItems="Center" grow="Yes" gap="300">
        <Box grow="Yes" direction="Column">
          {filter === undefined ? (
            <Text size="H4" truncate>
              Home
            </Text>
          ) : (
            <Input
              variant="Surface"
              size="300"
              radii="300"
              className={css.DmFilter}
              outlined={false}
              placeholder="Find a conversation"
              aria-label="Find a conversation"
              value={filter}
              onChange={(evt) => onFilterChange(evt.target.value)}
              onKeyDown={(evt) => {
                if (evt.key === 'Escape') onFilterChange('');
              }}
              after={<Icon src={Icons.Search} size="50" />}
            />
          )}
        </Box>
      </Box>
    </PageNavHeader>
  );
}

function HomeEmpty() {
  const navigate = useNavigate();

  return (
    <NavEmptyCenter>
      <NavEmptyLayout
        icon={<Icon size="600" src={Icons.Mention} />}
        title={
          <Text size="H5" align="Center">
            No Direct Messages
          </Text>
        }
        content={
          <Text size="T300" align="Center">
            You do not have any direct messages yet.
          </Text>
        }
        options={
          <Button onClick={() => navigate(getDirectCreatePath())} variant="Secondary" size="300">
            <Text size="B300" truncate>
              Create Chat
            </Text>
          </Button>
        }
      />
    </NavEmptyCenter>
  );
}

export function Home() {
  const mx = useMatrixClient();
  useNavToActivePathMapper('home');
  const scrollRef = useRef<HTMLDivElement>(null);
  const directs = useDirectRooms();
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const navigate = useNavigate();

  const selectedRoomId = useSelectedRoom();
  const createDirectSelected = useDirectCreateSelected();
  const homeIndexSelected = useHomeIndexSelected();
  const invitesSelected = useHomeInvitesSelected();
  const noRoomToDisplay = directs.length === 0;

  const [dmFilter, setDmFilter] = useState('');
  const sortedDirects = useMemo(() => {
    const sorted = Array.from(directs).sort(factoryRoomIdByActivity(mx));
    const term = dmFilter.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((roomId) => mx.getRoom(roomId)?.name.toLowerCase().includes(term));
  }, [mx, directs, dmFilter]);

  const directVirtualizer = useVirtualizer({
    count: sortedDirects.length,
    getItemKey: (index) => sortedDirects[index] ?? index,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  return (
    <PageNav>
      <HomeHeader filter={noRoomToDisplay ? undefined : dmFilter} onFilterChange={setDmFilter} />
      {noRoomToDisplay ? (
        <HomeEmpty />
      ) : (
        <PageNavContent scrollRef={scrollRef}>
          <Box direction="Column" gap="200">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={homeIndexSelected}>
                <NavLink to={getHomePath()}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Home} size="100" filled={homeIndexSelected} />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          Home
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
              <InvitesNavItem to={getHomeInvitesPath()} selected={invitesSelected} />
            </NavCategory>
            <NavCategory>
              <NavCategoryHeader>
                <Box grow="Yes" style={{ padding: `0 ${config.space.S200}` }}>
                  <Text size="T200" priority="300" truncate>
                    Direct Messages
                  </Text>
                </Box>
                <Box shrink="No">
                  <TooltipProvider
                    position="Right"
                    offset={4}
                    tooltip={
                      <Tooltip>
                        <Text>Create Chat</Text>
                      </Tooltip>
                    }
                  >
                    {(triggerRef) => (
                      <IconButton
                        ref={triggerRef}
                        aria-label="Create Chat"
                        aria-pressed={createDirectSelected}
                        variant="Background"
                        size="300"
                        radii="300"
                        onClick={() => navigate(getDirectCreatePath())}
                      >
                        <Icon src={Icons.Plus} size="100" />
                      </IconButton>
                    )}
                  </TooltipProvider>
                </Box>
              </NavCategoryHeader>
              <div
                style={{
                  position: 'relative',
                  height: directVirtualizer.getTotalSize(),
                }}
              >
                {directVirtualizer.getVirtualItems().map((vItem) => {
                  const roomId = sortedDirects[vItem.index];
                  const room = mx.getRoom(roomId);
                  if (!room) return null;
                  const selected = selectedRoomId === roomId;

                  return (
                    <VirtualTile
                      virtualItem={vItem}
                      key={roomId}
                      ref={directVirtualizer.measureElement}
                    >
                      <RoomNavItem
                        room={room}
                        selected={selected}
                        showAvatar
                        direct
                        linkPath={getHomeRoomPath(getCanonicalAliasOrRoomId(mx, roomId))}
                        notificationMode={getRoomNotificationMode(
                          notificationPreferences,
                          room.roomId
                        )}
                      />
                    </VirtualTile>
                  );
                })}
              </div>
            </NavCategory>
          </Box>
        </PageNavContent>
      )}
    </PageNav>
  );
}
