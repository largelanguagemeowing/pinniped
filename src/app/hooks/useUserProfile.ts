import { useEffect, useState } from 'react';
import { ClientEvent, UserEvent, UserEventHandlerMap } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { hasRecentProfileFailure, requestProfile } from '../utils/profileRequests';

export type UserProfile = {
  avatarUrl?: string;
  displayName?: string;
  extended: Record<string, unknown>;
  loaded: boolean;
};

export const useUserProfile = (userId: string): UserProfile => {
  const mx = useMatrixClient();

  const [profile, setProfile] = useState<UserProfile>(() => {
    const user = mx.getUser(userId);
    return {
      avatarUrl: user?.avatarUrl,
      displayName: user?.displayName,
      extended: {},
      loaded: false,
    };
  });

  useEffect(() => {
    const user = mx.getUser(userId);
    const onAvatarChange: UserEventHandlerMap[UserEvent.AvatarUrl] = (event, myUser) => {
      setProfile((cp) => ({
        ...cp,
        avatarUrl: myUser.avatarUrl,
      }));
    };
    const onDisplayNameChange: UserEventHandlerMap[UserEvent.DisplayName] = (event, myUser) => {
      setProfile((cp) => ({
        ...cp,
        displayName: myUser.displayName,
      }));
    };
    const onProfileUpdate = (
      updatedUserId: string,
      updatedProfile: Record<string, unknown> | null
    ) => {
      if (updatedUserId !== userId) return;
      setProfile((current) => ({
        ...current,
        extended: updatedProfile === null ? {} : { ...current.extended, ...updatedProfile },
        loaded: true,
      }));
    };

    if (hasRecentProfileFailure(mx, userId)) {
      setProfile((current) => ({ ...current, loaded: true }));
    } else {
      requestProfile(mx, userId).then(
        (info) =>
          setProfile({
            avatarUrl: typeof info.avatar_url === 'string' ? info.avatar_url : undefined,
            displayName: typeof info.displayname === 'string' ? info.displayname : undefined,
            extended: info,
            loaded: true,
          }),
        () => setProfile((current) => ({ ...current, loaded: true }))
      );
    }

    mx.on(ClientEvent.UserProfileUpdate, onProfileUpdate);
    user?.on(UserEvent.AvatarUrl, onAvatarChange);
    user?.on(UserEvent.DisplayName, onDisplayNameChange);
    return () => {
      mx.removeListener(ClientEvent.UserProfileUpdate, onProfileUpdate);
      user?.removeListener(UserEvent.AvatarUrl, onAvatarChange);
      user?.removeListener(UserEvent.DisplayName, onDisplayNameChange);
    };
  }, [mx, userId]);

  return profile;
};
