import { CallStatsConnection, CallStatsStream } from '../../../plugins/call';

/** The SFU connection's streams in one direction, or none before the connection exists. */
export const streamsOf = (
  connection: CallStatsConnection | undefined,
  direction: 'outbound' | 'inbound'
): CallStatsStream[] => connection?.[direction] ?? [];
