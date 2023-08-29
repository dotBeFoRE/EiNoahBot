import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { alert, toast } from 'burnt';
import type { SFSymbol } from 'sf-symbols-typescript';
import { api } from 'src/utils/api';

import {
  ChannelType,
  clientChangeLobby,
  LobbyChange,
  lobbyChangeSchema,
  userIdToPusherChannel,
} from '@ei/lobby';
import baseConfig from '@ei/tailwind-config';

import { usePusher } from './pusher';

type LobbyContextProps = {
  lobby: LobbyChange | null;
  changeChannelType: (type: ChannelType) => void;
  changeUserLimit: (limit: number) => void;
};

const lobbyContext = createContext<LobbyContextProps>({
  lobby: null,
  changeChannelType: () => {
    throw new Error('Outside of provider');
  },
  changeUserLimit: () => {
    throw new Error('Outside of provider');
  },
});

export function useLobby() {
  return useContext(lobbyContext);
}

export function LobbyProvider({ children }: { children: React.ReactNode }) {
  const { pusher, connectionState } = usePusher();
  const [lobby, setLobby] = useState<LobbyChange | null>(null);
  const { data: user } = api.user.me.useQuery();

  // Listen for connection state changes
  useEffect(() => {
    if (connectionState === 'unavailable') {
      toast({
        title: 'Lost connection',
        message:
          'Could not connect to the server. Please check your internet connection and try again.',
        preset: 'custom',
        icon: {
          ios: {
            name: 'wifi.slash' satisfies SFSymbol,
            color: baseConfig.theme.colors.reject,
          },
        },
      });

      setLobby(null);
    }
  }, [connectionState]);

  // Subscribe to lobby channel
  useEffect(() => {
    if (!pusher || !user) return undefined;

    const channelName = userIdToPusherChannel(user);

    const channel = pusher.subscribe(channelName);

    channel.bind('pusher:subscription_succeeded', () => {
      pusher.send_event('client-refresh', {}, channelName);
    });

    return () => {
      pusher.unsubscribe(userIdToPusherChannel(user));
    };
  }, [pusher, user]);

  // Listen for lobby changes
  useEffect(() => {
    if (!pusher) return undefined;

    pusher.user.bind('lobbyChange', (newData: unknown) => {
      const result = lobbyChangeSchema.safeParse(newData);
      if (!result.success) {
        if (__DEV__)
          alert({
            title: 'Error',
            message: `Failed to parse lobby data\n${result.error.message}`,
          });
        else
          toast({
            title: 'Error',
            message: `Cannot read lobby data`,
            preset: 'error',
          });

        return;
      }

      setLobby(result.data);
    });

    return () => {
      pusher.user.unbind('lobbyChange');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pusher?.sessionID]);

  // When connection state changes refresh the lobby
  useEffect(() => {
    if (!pusher || !user) return;

    const channelName = userIdToPusherChannel(user);

    if (connectionState === 'connected') {
      pusher.send_event('client-refresh', {}, channelName);
    }
  }, [pusher, user, connectionState]);

  const props = useMemo(
    () => ({
      lobby,
      changeChannelType: (type: ChannelType) => {
        if (!pusher || !user) return;

        if (connectionState !== 'connected') {
          toast({
            title: 'Error',
            message: 'Cannot change channel type while offline',
            preset: 'error',
          });
          return;
        }

        // Optimistic update
        setLobby((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            channel: {
              ...prev.channel,
              type,
            },
          };
        });

        const channel = pusher.channel(userIdToPusherChannel(user));

        channel.trigger('client-change-lobby', {
          type,
        } satisfies Zod.infer<typeof clientChangeLobby>);
      },
      changeUserLimit: (limit: number) => {
        if (!pusher) return;
        if (!user) return;

        if (connectionState !== 'connected') {
          toast({
            title: 'Error',
            message: 'Cannot change user limit while offline',
            preset: 'error',
          });
          return;
        }

        // Optimistic update
        setLobby((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            channel: {
              ...prev.channel,
              limit,
            },
          };
        });

        const channel = pusher.channel(userIdToPusherChannel(user));

        channel.trigger('client-change-lobby', { limit } satisfies Zod.infer<
          typeof clientChangeLobby
        >);
      },
    }),
    [connectionState, lobby, pusher, user],
  );

  return (
    <lobbyContext.Provider value={props}>{children}</lobbyContext.Provider>
  );
}
