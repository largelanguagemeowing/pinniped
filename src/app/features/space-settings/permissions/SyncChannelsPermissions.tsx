import React, { useCallback, useState } from 'react';
import { Box, Button, Spinner, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncLoad } from '../../../hooks/useAsyncCallback';
import {
  applySpacePermissionSync,
  planSpacePermissionSync,
  readSyncContext,
  SkipReason,
  SyncPlan,
  SyncResult,
} from './spacePermissionSync';

const SKIP_TEXT: Record<SkipReason, string> = {
  'not-joined': 'not joined',
  'no-permission': 'you cannot edit them',
  'would-lose-access': 'your own access would change',
  unchanged: 'already match',
};

const countSkips = (plan: SyncPlan): string => {
  const counts = new Map<SkipReason, number>();
  plan.skipped.forEach(({ reason }) => counts.set(reason, (counts.get(reason) ?? 0) + 1));
  return Array.from(counts, ([reason, n]) => `${n} ${SKIP_TEXT[reason]}`).join(', ');
};

const describePlan = (plan: SyncPlan): string => {
  const n = plan.updates.length;
  const updateText = `${n} ${n === 1 ? 'channel' : 'channels'} will be updated`;
  return plan.skipped.length > 0
    ? `${updateText}. Skipped: ${countSkips(plan)}.`
    : `${updateText}.`;
};

const describeResult = (result: SyncResult): string => {
  const updated = `Updated ${result.updated} ${result.updated === 1 ? 'channel' : 'channels'}.`;
  if (result.failed.length === 0) return updated;
  return `${updated} ${result.failed.length} failed; the others were still updated.`;
};

type SyncChannelsPermissionsProps = {
  space: Room;
};

/**
 * Applies the space's power levels and role tags to every joined channel below it. The plan is
 * shown first, and nothing is sent until the user confirms. Applying re-reads the rooms, so the
 * confirmed plan is the one that runs even if the rooms changed since the preview.
 */
export function SyncChannelsPermissions({ space }: SyncChannelsPermissionsProps) {
  const mx = useMatrixClient();
  const [plan, setPlan] = useState<SyncPlan>();

  const [applyState, apply] = useAsyncLoad(
    useCallback(async () => {
      const fresh = planSpacePermissionSync(readSyncContext(mx, space));
      const outcome = await applySpacePermissionSync(mx, fresh.updates);
      setPlan(undefined);
      return outcome;
    }, [mx, space])
  );

  const applying = applyState.status === AsyncStatus.Loading;
  const result = applyState.status === AsyncStatus.Success ? applyState.data : undefined;
  const failed = applyState.status === AsyncStatus.Error;

  const handlePreview = () => {
    setPlan(planSpacePermissionSync(readSyncContext(mx, space)));
  };

  return (
    <SettingTile
      title="Sync to channels"
      description="Apply this space's permissions and role tags to every joined channel and subspace below it. Per-member roles in each channel are kept."
    >
      {plan && !applying && (
        <Text size="T200" priority="300">
          {describePlan(plan)}
        </Text>
      )}
      {result && <Text size="T200">{describeResult(result)}</Text>}
      {failed && <Text size="T200">The sync could not run. Try again.</Text>}
      <Box gap="200" wrap="Wrap">
        {!plan || applying ? (
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            onClick={handlePreview}
            disabled={applying}
          >
            <Text size="B300">Preview</Text>
          </Button>
        ) : (
          <>
            <Button
              variant="Critical"
              fill="Soft"
              size="300"
              radii="300"
              onClick={() => apply()}
              disabled={plan.updates.length === 0}
              before={applying ? <Spinner size="100" variant="Critical" /> : undefined}
            >
              <Text size="B300">Apply to {plan.updates.length} channels</Text>
            </Button>
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              onClick={() => setPlan(undefined)}
            >
              <Text size="B300">Cancel</Text>
            </Button>
          </>
        )}
      </Box>
    </SettingTile>
  );
}
