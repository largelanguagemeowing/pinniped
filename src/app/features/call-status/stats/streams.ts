import { CallStatsConnection, CallStatsStream } from '../../../plugins/call';

/** The SFU connection's streams in one direction, or none before the connection exists. */
export const streamsOf = (
  connection: CallStatsConnection | undefined,
  direction: 'outbound' | 'inbound'
): CallStatsStream[] => connection?.[direction] ?? [];

/** Who the stream is from ("You" for ours) and what it carries, e.g. "Alice · Microphone". */
export const streamTitle = (stream: CallStatsStream, who: (userId: string) => string): string => {
  const from = stream.participant ? who(stream.participant) : 'You';
  const kind = stream.kind === 'video' ? 'Video' : 'Audio';
  const track = stream.track ?? kind;
  // Simulcast sends one video stream per quality layer, named by its rid.
  const { rid } = stream.stats;
  const layer = typeof rid === 'string' && rid ? ` (${rid})` : '';
  return `${from} · ${track}${layer}`;
};
