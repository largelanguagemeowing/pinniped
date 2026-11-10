/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room as MatrixRoom } from "matrix-js-sdk";
import {
  type FC,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import classNames from "classnames";
import { combineLatest, map } from "rxjs";
import { useObservable } from "observable-hooks";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { useTranslation } from "react-i18next";

import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { HeaderStyle, useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { ElementWidgetActions, widget } from "../widget";
import {
  type CallViewState,
  layoutRequest$,
  streamHeight$,
} from "../hostControl";
import {
  sampleConnection,
  type CallStatsConnection,
} from "../livekit/callStats";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { type MuteStates } from "../state/MuteStates";
import { type MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import {
  type CallViewModel,
  createCallViewModel$,
} from "../state/CallViewModel/CallViewModel.ts";
import { Grid, type TileProps } from "../grid/Grid";
import { SpotlightTile } from "../tile/SpotlightTile";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { makeGridLayout } from "../grid/GridLayout";
import { type CallLayoutOutputs } from "../grid/CallLayout";
import { makeOneOnOneLandscapeLayout } from "../grid/OneOnOneLandscapeLayout";
import { makeOneOnOnePortraitLayout } from "../grid/OneOnOnePortraitLayout";
import { makeSpotlightExpandedLayout } from "../grid/SpotlightExpandedLayout";
import { makeSpotlightLandscapeLayout } from "../grid/SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "../grid/SpotlightPortraitLayout";
import { GridTileViewModel, type TileViewModel } from "../state/TileViewModel";
import {
  ReactionsSenderProvider,
  useReactionsSender,
} from "../reactions/useReactionsSender";
import { ReactionsAudioRenderer } from "./ReactionAudioRenderer";
import { ReactionsOverlay } from "./ReactionsOverlay";
import { CallEventAudioRenderer } from "./CallEventAudioRenderer";
import { matrixRTCMode as matrixRTCModeSetting } from "../settings/settings";
import { ReactionsReader } from "../reactions/ReactionsReader";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer.tsx";
import { muteAllAudio$ } from "../state/MuteAllAudioModel.ts";
import { useMediaDevices } from "../MediaDevicesContext.ts";
import { EarpieceOverlay } from "./EarpieceOverlay.tsx";
import { useAppBarHidden, useAppBarSecondaryButton } from "../AppBar.tsx";
import { useBehavior } from "../useBehavior.ts";
import { Toast } from "../Toast.tsx";
import { type ElementCallError } from "../utils/errors.ts";
import { ErrorSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import overlayStyles from "../Overlay.module.css";
import { loopCallSound } from "../livekit/callSounds";
import { useTrackProcessorObservable$ } from "../livekit/TrackProcessorContext.tsx";
import { type Layout } from "../state/layout-types.ts";
import { ObservableScope } from "../state/ObservableScope.ts";
import { CallFooter, type FooterSnapshot } from "../components/CallFooter.tsx";
import { FocusMediaContext, isTileBodyClick } from "../grid/FocusMedia.ts";
import { SettingsIconButton } from "../button/Button.tsx";
import { createCallFooterViewModel } from "../components/CallFooterViewModel.tsx";
import { type ViewModel } from "../state/ViewModel.ts";

declare module "react" {
  interface CSSProperties {
    "--call-view-safe-area-inset-top"?: string;
    "--call-view-safe-area-inset-bottom"?: string;
  }
}

const logger = rootLogger.getChild("[InCallView]");

export interface ActiveCallProps extends Omit<
  InCallViewProps,
  "vm" | "livekitRoom" | "connState" | "footerVm"
> {
  e2eeSystem: EncryptionSystem;
  // TODO refactor those reasons into an enum
  onLeft: (
    reason: "user" | "timeout" | "decline" | "allOthersLeft" | "error",
  ) => void;
}

export const ActiveCall: FC<ActiveCallProps> = (props) => {
  const [vm, setVm] = useState<CallViewModel | null>(null);
  const [footerVm, setFooterVm] = useState<ViewModel<FooterSnapshot> | null>(
    null,
  );
  const urlParams = useUrlParams();
  const mediaDevices = useMediaDevices();
  const trackProcessorState$ = useTrackProcessorObservable$();
  useEffect(() => {
    logger.info("START CALL VIEW SCOPE");
    const scope = new ObservableScope();
    const reactionsReader = new ReactionsReader(scope, props.rtcSession);
    const { autoLeaveWhenOthersLeft, waitForCallPickup, sendNotificationType } =
      urlParams;

    const vm = createCallViewModel$(
      scope,
      props.rtcSession,
      props.matrixRoom,
      mediaDevices,
      props.muteStates,
      {
        encryptionSystem: props.e2eeSystem,
        autoLeaveWhenOthersLeft,
        waitForCallPickup: waitForCallPickup && sendNotificationType === "ring",
        matrixRTCMode$: matrixRTCModeSetting.value$,
      },
      reactionsReader.raisedHands$,
      reactionsReader.reactions$,
      scope.behavior(trackProcessorState$),
    );
    // TODO move this somewhere else once we use the callViewModel in the lobby as well!
    vm.join();
    setVm(vm);

    vm.leave$.pipe(scope.bind()).subscribe(props.onLeft);

    return (): void => {
      scope.end();
    };
  }, [
    props.rtcSession,
    props.matrixRoom,
    props.muteStates,
    props.e2eeSystem,
    props.onLeft,
    urlParams,
    mediaDevices,
    trackProcessorState$,
    props.client,
  ]);

  useEffect(() => {
    if (vm === null) return;

    const scope = new ObservableScope();
    const footerVm = createCallFooterViewModel(
      scope,
      vm,
      props.muteStates,
      mediaDevices,
      `${props.client.getUserId()}:${props.client.getDeviceId()}`,
    );
    setFooterVm(footerVm);

    return (): void => {
      scope.end();
    };
  }, [
    props.rtcSession,
    props.matrixRoom,
    props.muteStates,
    props.e2eeSystem,
    props.onLeft,
    urlParams,
    mediaDevices,
    trackProcessorState$,
    props.client,
    vm,
  ]);

  if (vm === null) return null;
  if (footerVm === null) return null;

  return (
    <ReactionsSenderProvider vm={vm} rtcSession={props.rtcSession}>
      <InCallView {...props} vm={vm} footerVm={footerVm} />
    </ReactionsSenderProvider>
  );
};

export interface InCallViewProps {
  client: MatrixClient;
  vm: CallViewModel;
  footerVm: ViewModel<FooterSnapshot>;
  matrixInfo: MatrixInfo;
  rtcSession: MatrixRTCSession;
  matrixRoom: MatrixRoom;
  muteStates: MuteStates;
  onShareClick: (() => void) | null;
}

export const InCallView: FC<InCallViewProps> = ({
  client,
  vm,
  footerVm,
  matrixInfo,
  matrixRoom,
  muteStates,
  onShareClick,
}) => {
  const { t } = useTranslation();
  const { sendReaction, toggleRaisedHand } = useReactionsSender();

  useWakeLock();
  // TODO-MULTI-SFU This is unused now??
  // const connectionState = useObservableEagerState(vm.livekitConnectionState$);

  // annoyingly we don't get the disconnection reason this way,
  // only by listening for the emitted event
  // This needs to be done differential. with the vm connection state we start with Disconnected.
  // TODO-MULTI-SFU decide how to handle this properly
  // @BillCarsonFr
  // if (connectionState === ConnectionState.Disconnected)
  //   throw new ConnectionLostError();

  const containerRef1 = useRef<HTMLDivElement | null>(null);
  const [containerRef2, bounds] = useMeasure();
  // Merge the refs so they can attach to the same element
  const containerRef = useMergedRefs(containerRef1, containerRef2);

  const { showControls, header: headerStyle } = useUrlParams();

  const muteAllAudio = useBehavior(muteAllAudio$);

  const toggleAudio = useBehavior(muteStates.audio.toggle$);
  const toggleVideo = useBehavior(muteStates.video.toggle$);
  const setAudioEnabled = useBehavior(muteStates.audio.setEnabled$);

  useCallViewKeyboardShortcuts(
    toggleAudio,
    toggleVideo,
    setAudioEnabled,
    (reaction) => void sendReaction(reaction),
    () => void toggleRaisedHand(),
  );

  const ringing = useBehavior(vm.ringing$);
  const audioParticipants = useBehavior(vm.livekitRoomItems$);
  const participantCount = useBehavior(vm.participantCount$);
  const reconnecting = useBehavior(vm.reconnecting$);
  const publishError = useBehavior(vm.publishError$);
  const [dismissedPublishError, setDismissedPublishError] =
    useState<ElementCallError | null>(null);
  const layout = useBehavior(vm.layout$);
  const edgeToEdge = useBehavior(vm.edgeToEdge$);
  const showNameTags = useBehavior(vm.showNameTags$);
  const showHeader = useBehavior(vm.showHeader$);
  const settingsOpen = useBehavior(vm.settingsOpen$);
  const setSettingsOpen = useBehavior(vm.setSettingsOpen$);
  const earpieceMode = useBehavior(vm.earpieceMode$);
  const audioOutputSwitcher = useBehavior(vm.audioOutputSwitcher$);

  const fatalCallError = useBehavior(vm.fatalError$);
  // Stop the rendering and throw for the error boundary
  if (fatalCallError) {
    logger.debug("fatalCallError stop rendering", fatalCallError);
    throw fatalCallError;
  }

  // While ringing, the client loops the ringtone (after its intro, if it has one).
  useEffect((): void | (() => void) => {
    if (ringing) return loopCallSound("waiting", "waitingIntro");
  }, [ringing]);

  // iOS Safari doesn't reliably fire `click` on plain <div>s, so we listen
  // for `pointerup` instead. Scrolls end in `pointercancel`, not `pointerup`,
  // so this still only fires for taps.
  const onViewPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (
        e.pointerType === "touch" &&
        // If an interactive element was tapped, don't count this as a tap on the screen
        (e.target as Element).closest?.("button, input") === null
      )
        vm.tapScreen();
    },
    [vm],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse") vm.hoverScreen();
    },
    [vm],
  );
  const onPointerOut = useCallback(() => vm.unhoverScreen(), [vm]);

  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  const openProfile = useMemo(
    () =>
      // Profile settings are unavailable in widget mode
      widget === null
        ? (): void => {
            setSettingsTab("profile");
            setSettingsOpen(true);
          }
        : null,
    [setSettingsTab, setSettingsOpen],
  );

  const [headerRef, headerBounds] = useMeasure();
  const [footerRef, footerBounds] = useMeasure();

  // useMeasure includes the vertical scrollbar of the container; tiles sized to
  // that width would slide underneath it.
  const scrollbarWidth = containerRef1.current
    ? containerRef1.current.offsetWidth - containerRef1.current.clientWidth
    : 0;
  const gridBounds = useMemo(
    () => ({
      width: bounds.width - scrollbarWidth,
      // Pinniped hides this footer (out of flow, invisible) and draws its own call
      // bar outside the iframe, so the footer must not take height from the grid.
      height: bounds.height - (edgeToEdge ? 0 : headerBounds.height),
    }),
    [
      bounds.width,
      scrollbarWidth,
      bounds.height,
      headerBounds.height,
      edgeToEdge,
    ],
  );
  const gridBoundsObservable$ = useObservable(
    (inputs$) => inputs$.pipe(map(([gridBounds]) => gridBounds)),
    [gridBounds],
  );

  useAppBarHidden(!showHeader);

  let header: ReactNode = null;
  switch (headerStyle) {
    case HeaderStyle.AppBar: {
      // dont build a header here. The AppBar will take care of it.
      break;
    }
    case HeaderStyle.None:
      // Cosmetic header to fill out space while still affecting the bounds of
      // the grid
      header = showHeader && (
        <div
          className={classNames(styles.header, styles.filler)}
          ref={headerRef}
        />
      );
      break;
    case HeaderStyle.Standard:
      header = (
        <Header
          className={classNames(styles.header, {
            [styles.overlay]: edgeToEdge,
            [styles.hidden]: !showHeader,
          })}
          ref={headerRef}
          disconnectedBanner={false} // This screen has its own 'reconnecting' toast
        >
          <LeftNav>
            <RoomHeaderInfo
              id={matrixInfo.roomId}
              name={matrixInfo.roomName}
              avatarUrl={matrixInfo.roomAvatar}
              encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
              participantCount={participantCount}
            />
          </LeftNav>
          <RightNav>
            {showControls && onShareClick !== null && (
              <InviteButton className={styles.invite} onClick={onShareClick} />
            )}
          </RightNav>
        </Header>
      );
  }

  // The reconnecting toast cannot be dismissed
  const onDismissReconnectingToast = useCallback(() => {}, []);
  // We need to use a non-modal toast to avoid trapping focus within the toast.
  // However, a non-modal toast will not render any background overlay on its
  // own, so we must render one manually.
  const reconnectingToast = (
    <>
      <div
        className={classNames(overlayStyles.bg, overlayStyles.animate)}
        data-state={reconnecting ? "open" : "closed"}
      />
      <Toast
        onDismiss={onDismissReconnectingToast}
        open={reconnecting}
        modal={false}
      >
        {t("common.reconnecting")}
      </Toast>
    </>
  );

  const onDismissPublishError = useCallback(
    () => setDismissedPublishError(publishError),
    [publishError],
  );
  const publishErrorToast = publishError && (
    <Toast
      onDismiss={onDismissPublishError}
      open={publishError !== dismissedPublishError}
      modal={false}
      Icon={ErrorSolidIcon}
    >
      {publishError.localisedMessage
        ? `${publishError.localisedTitle}. ${publishError.localisedMessage}`
        : publishError.localisedTitle}
    </Toast>
  );

  // Embedded clients (Pinniped) show the problem next to the call controls, where
  // it stays visible while the call view is hidden.
  useEffect(() => {
    if (widget === null) return;
    widget.api.transport
      .send(ElementWidgetActions.CallError, {
        error: publishError && {
          code: publishError.code,
          title: publishError.localisedTitle,
          message: publishError.localisedMessage ?? null,
        },
      })
      .catch(() => {});
  }, [publishError]);

  const earpieceOverlay = (
    <EarpieceOverlay
      show={earpieceMode && !reconnecting}
      onBackToVideoPressed={audioOutputSwitcher?.switch}
    />
  );

  // If the reconnecting toast or earpiece overlay obscures the media tiles, we
  // need to remove them from the accessibility tree and block focus.
  const contentObscured = reconnecting || earpieceMode;

  const Tile = useMemo(
    () =>
      function Tile({
        ref,
        className,
        style,
        targetWidth,
        targetHeight,
        model,
      }: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
        const spotlightExpanded = useBehavior(vm.spotlightExpanded$);
        const onToggleExpanded = useBehavior(vm.toggleSpotlightExpanded$);
        const showSpotlightIndicators = useBehavior(
          vm.showSpotlightIndicators$,
        );
        const showSpeakingIndicators = useBehavior(vm.showSpeakingIndicators$);
        const showNameTags = useBehavior(vm.showNameTags$);

        return model instanceof GridTileViewModel ? (
          <GridTile
            ref={ref}
            vm={model}
            onClick={(e) => {
              if (isTileBodyClick(e)) vm.focusMedia(model.media$.value.id);
            }}
            onOpenProfile={openProfile}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            className={classNames(className, styles.tile)}
            style={style}
            showSpeakingIndicators={showSpeakingIndicators}
            showNameTags={showNameTags}
            focusable={!contentObscured}
          />
        ) : (
          <SpotlightTile
            ref={ref}
            vm={model}
            onClick={(e) => {
              if (isTileBodyClick(e)) vm.showGrid();
            }}
            expanded={spotlightExpanded}
            onToggleExpanded={onToggleExpanded}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            showIndicators={showSpotlightIndicators}
            showNameTags={showNameTags}
            focusable={!contentObscured}
            className={classNames(className, styles.tile)}
            style={style}
          />
        );
      },
    [vm, openProfile, contentObscured],
  );

  const layouts = useMemo(() => {
    const inputs = { minBounds$: gridBoundsObservable$ };
    return {
      grid: makeGridLayout(inputs),
      "spotlight-landscape": makeSpotlightLandscapeLayout(inputs),
      "spotlight-portrait": makeSpotlightPortraitLayout(inputs),
      "spotlight-expanded": makeSpotlightExpandedLayout(inputs),
      "one-on-one-landscape": makeOneOnOneLandscapeLayout(inputs),
      "one-on-one-portrait": makeOneOnOnePortraitLayout(inputs),
    };
  }, [gridBoundsObservable$]);

  const showFooter = useBehavior(footerVm.showFooter$);
  const focusMediaContext = useMemo(
    () => ({
      focusMedia: vm.focusMedia,
      showGrid: vm.showGrid,
      screenShares$: vm.screenShares$,
    }),
    [vm],
  );
  const renderContent = (): JSX.Element => {
    if (layout.type === "pip") {
      return (
        <SpotlightTile
          className={classNames(styles.tile, styles.maximised)}
          vm={layout.spotlight}
          expanded
          onToggleExpanded={null}
          targetWidth={gridBounds.width}
          targetHeight={gridBounds.height}
          showIndicators={false}
          showNameTags={showNameTags}
          focusable={!contentObscured}
          aria-hidden={contentObscured}
        />
      );
    }

    const layers = layouts[layout.type] as CallLayoutOutputs<Layout>;
    const fixedGrid = (
      <Grid
        key="fixed"
        className={styles.fixedGrid}
        style={{
          // If not edge-to-edge, consume the header insets right here.
          insetBlockStart: edgeToEdge ? 0 : bounds.top + headerBounds.height,
          height: edgeToEdge ? "100%" : gridBounds.height,
          // If edge-to-edge, compute new safe area insets that account for the
          // header and footer, passing them down to the tiles.
          "--call-view-safe-area-inset-top":
            edgeToEdge && headerStyle !== HeaderStyle.None && showHeader
              ? // Header has two relevant cases: if it's an app bar, it lives
                // outside the InCallView and consumes the safe area insets
                // itself. Otherwise account for the safe area and header size
                // as part of the InCallView.
                headerStyle === HeaderStyle.AppBar
                ? `${bounds.top}px`
                : `calc(env(safe-area-inset-top) + ${headerBounds.height}px)`
              : undefined,
          "--call-view-safe-area-inset-bottom":
            edgeToEdge && showFooter
              ? // Footer always lives inside the InCallView.
                `calc(env(safe-area-inset-bottom) + ${footerBounds.height}px)`
              : undefined,
        }}
        model={layout}
        Layout={layers.fixed}
        Tile={Tile}
        aria-hidden={contentObscured}
      />
    );
    const scrollingGrid = (
      <Grid
        key="scrolling"
        className={styles.scrollingGrid}
        model={layout}
        Layout={layers.scrolling}
        Tile={Tile}
        aria-hidden={contentObscured}
      />
    );

    // Put the right layer in the foreground for the requested layout
    switch (layers.foreground) {
      case "fixed":
        return (
          <>
            {scrollingGrid}
            {fixedGrid}
          </>
        );
      case "scrolling":
        return (
          <>
            {fixedGrid}
            {scrollingGrid}
          </>
        );
    }
  };

  const rageshakeRequestModalProps = useRageshakeRequestModal(
    matrixRoom.roomId,
  );

  useAppBarSecondaryButton(
    // Embedded clients (Pinniped) own the call settings
    widget === null ? (
      <SettingsIconButton
        key="settings"
        onClick={() => setSettingsOpen(true)}
        data-testid="settings-app-bar"
      />
    ) : (
      ""
    ),
  );

  // Only hide the settings button if we have an AppBar header and we are showing the header
  const footer = footerVm !== null && (
    <CallFooter ref={footerRef} vm={footerVm} />
  );
  const allConnections = useBehavior(vm.allConnections$);

  // Embedded clients (Pinniped) show who is speaking, muted or sharing their screen.
  useEffect(() => {
    if (widget === null) return;
    const api = widget.api;
    const subscription = vm.participantActivity$.subscribe((activity) => {
      api.transport
        .send(ElementWidgetActions.CallActivity, {
          speaking: [...activity.speaking],
          muted: [...activity.muted],
          deafened: [...activity.deafened],
          screenSharing: [...activity.screenSharing],
        })
        .catch(() => {});
    });
    return (): void => subscription.unsubscribe();
  }, [vm]);

  // Embedded clients (Pinniped) draw the layout and screen share buttons themselves:
  // tell them what those show, and take their layout choice.
  useEffect(() => {
    if (widget === null) return;
    const api = widget.api;
    const state = combineLatest([
      vm.gridMode$,
      vm.sharingScreen$,
      streamHeight$,
    ]).subscribe(([layout, screenSharing, streamHeight]) => {
      const view: CallViewState = { layout, screenSharing, streamHeight };
      api.transport.send(ElementWidgetActions.CallView, view).catch(() => {});
    });
    const requests = layoutRequest$.subscribe((layout) =>
      vm.setGridMode(layout),
    );
    return (): void => {
      state.unsubscribe();
      requests.unsubscribe();
    };
  }, [vm]);

  // The stats sampler names remote streams by Matrix user, from the latest room items.
  const audioParticipantsRef = useRef(audioParticipants);
  useEffect(() => {
    audioParticipantsRef.current = audioParticipants;
  }, [audioParticipants]);

  // Embedded clients (Pinniped) show WebRTC stats; report raw counters to them.
  useEffect(() => {
    if (widget === null) return;
    const api = widget.api;
    const id = setInterval(() => {
      void (async (): Promise<void> => {
        const connections = (
          await Promise.all(
            allConnections.getConnections().map(async (c) => {
              const url = c.transport.livekit_service_url;
              const userIds =
                audioParticipantsRef.current.find((item) => item.url === url)
                  ?.userIds ?? {};
              return sampleConnection(url, c.livekitRoom, userIds).catch(
                () => null,
              );
            }),
          )
        ).filter((c): c is CallStatsConnection => c !== null);
        if (connections.length > 0)
          await api.transport
            .send(ElementWidgetActions.CallStats, {
              time: Date.now(),
              connections,
            })
            .catch(() => {});
      })();
    }, 1000);
    return (): void => clearInterval(id);
  }, [allConnections]);

  return (
    // The pointer handler here exists to control the visibility of the footer,
    // and the footer is also viewable by moving focus into it, so this is fine.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={styles.inRoom}
      ref={containerRef}
      onPointerUp={onViewPointerUp}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    >
      {header}
      {audioParticipants.map(({ livekitRoom, url, participants, userIds }) => (
        <LivekitRoomAudioRenderer
          key={url}
          url={url}
          livekitRoom={livekitRoom}
          validIdentities={participants}
          userIds={userIds}
          muted={muteAllAudio}
        />
      ))}
      <FocusMediaContext value={focusMediaContext}>
        {renderContent()}
      </FocusMediaContext>
      <CallEventAudioRenderer vm={vm} />
      <ReactionsAudioRenderer vm={vm} muted={muteAllAudio} />
      {reconnectingToast}
      {publishErrorToast}
      {earpieceOverlay}
      <ReactionsOverlay vm={vm} />
      {footer}
      {layout.type !== "pip" && (
        <>
          <RageshakeRequestModal {...rageshakeRequestModalProps} />
          <SettingsModal
            client={client}
            roomId={matrixRoom.roomId}
            open={settingsOpen}
            onDismiss={(): void => setSettingsOpen(false)}
            tab={settingsTab}
            onTabChange={setSettingsTab}
            livekitRooms={allConnections
              .getConnections()
              .map((connectionItem) => ({
                room: connectionItem.livekitRoom,
                livekitAlias: connectionItem.livekitAlias,
                // TODO compute is local or tag it in the livekit room items already
                isLocal: undefined,
                url: connectionItem.transport.livekit_service_url,
              }))}
          />
        </>
      )}
    </div>
  );
};
