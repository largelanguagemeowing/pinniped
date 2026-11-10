import { ClientWidgetApi } from 'matrix-widget-api';
import EventEmitter from 'events';
import { CallControlState } from './CallControlState';
import { ElementMediaStateDetail, ElementMediaStatePayload, ElementWidgetActions } from './types';
import {
  CallControlRequest,
  CallViewState,
  initialCallViewState,
  parseCallViewState,
} from './view';

export enum CallControlEvent {
  StateUpdate = 'state_update',
  /** Emitted only for toggles the user made, with the values they chose. */
  UserToggle = 'user_toggle',
}

/**
 * Pinniped's side of the call controls. The widget draws none of its own while embedded: every
 * button here reaches it as a widget action, and the widget reports back what the buttons show.
 */
export class CallControl extends EventEmitter implements CallControlState {
  private state: CallControlState;

  private view: CallViewState = initialCallViewState;

  private call: ClientWidgetApi;

  private mediaStatePromiseResolver: undefined | (() => void);

  constructor(state: CallControlState, call: ClientWidgetApi) {
    super();

    this.state = state;
    this.call = call;
  }

  public getState(): CallControlState {
    return this.state;
  }

  public get microphone(): boolean {
    return this.state.microphone;
  }

  public get video(): boolean {
    return this.state.video;
  }

  public get sound(): boolean {
    return this.state.sound;
  }

  public get screenshare(): boolean {
    return this.state.screenshare;
  }

  public get spotlight(): boolean {
    return this.state.spotlight;
  }

  /** Height in pixels of the screen share being watched, if there is one. */
  public get streamHeight(): number | undefined {
    return this.view.streamHeight;
  }

  public async applyState() {
    await this.setMediaState({
      audio_enabled: this.microphone,
      video_enabled: this.video,
    });
    this.setSound(this.sound);
    this.emitStateUpdate();
  }

  public applySound() {
    this.setSound(this.sound);
  }

  /**
   * Sends a request to the call view. A widget that is not listening yet does not answer, which
   * is not an error here: the state is applied again once it reports its media state.
   */
  public request(control: CallControlRequest): void {
    this.call.transport.send(ElementWidgetActions.CallControl, control).catch(() => undefined);
  }

  private async setMediaState(state: ElementMediaStatePayload) {
    const data = await this.call.transport.send(ElementWidgetActions.DeviceMute, state);
    // The change may already have arrived while the reply was on its way, so no further state
    // update is coming to resolve the wait below.
    if (this.microphone === !!state.audio_enabled && this.video === !!state.video_enabled) {
      return data;
    }
    return new Promise<typeof data>((resolve) => {
      if (this.mediaStatePromiseResolver) {
        this.mediaStatePromiseResolver();
      }
      this.mediaStatePromiseResolver = () => resolve(data);
    });
  }

  private setSound(sound: boolean): void {
    this.request({ outputEnabled: sound });
  }

  public onMediaState(evt: CustomEvent<ElementMediaStateDetail>) {
    const { data } = evt.detail;
    if (!data) return;

    const state = new CallControlState(
      data.audio_enabled ?? this.microphone,
      data.video_enabled ?? this.video,
      this.sound,
      this.screenshare,
      this.spotlight
    );

    this.state = state;
    this.emitStateUpdate();

    if (this.microphone && !this.sound) {
      this.toggleSound();
    }

    if (this.mediaStatePromiseResolver) {
      this.mediaStatePromiseResolver();
      this.mediaStatePromiseResolver = undefined;
    }
  }

  /** The widget reported its layout, our screen share and the watched stream (`call_view`). */
  public onViewState(data: unknown) {
    this.view = parseCallViewState(data, this.view);
    this.state = new CallControlState(
      this.microphone,
      this.video,
      this.sound,
      this.view.screenSharing,
      this.view.layout === 'spotlight'
    );
    this.emitStateUpdate();
  }

  public toggleMicrophone() {
    // The microphone shows as off while deafened, so unmuting while deafened also undeafens.
    const audioEnabled = !(this.microphone && this.sound);
    if (audioEnabled && !this.sound) this.toggleSound();
    const payload: ElementMediaStatePayload = {
      audio_enabled: audioEnabled,
      video_enabled: this.video,
    };
    this.emit(CallControlEvent.UserToggle, { microphone: payload.audio_enabled });
    return this.setMediaState(payload);
  }

  public toggleVideo() {
    const payload: ElementMediaStatePayload = {
      audio_enabled: this.microphone,
      video_enabled: !this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleSound() {
    const sound = !this.sound;

    this.setSound(sound);
    this.emit(CallControlEvent.UserToggle, { sound });

    const state = new CallControlState(
      this.microphone,
      this.video,
      sound,
      this.screenshare,
      this.spotlight
    );
    this.state = state;
    this.emitStateUpdate();
  }

  /** Ends our screen share. Starting one goes through the picker (`CallEmbed.startScreenshare`). */
  public stopScreenshare() {
    this.request({ screenShare: false });
  }

  public toggleSpotlight() {
    this.request({ layout: this.spotlight ? 'grid' : 'spotlight' });
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
