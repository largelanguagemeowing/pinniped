# Notification sound bundles

Each folder here is a bundle, named by its folder (`icq/`, `skype-classic-7x/`, ...).
A bundle appears in Settings > Notifications once it contains a `message` file.

- `message.(ogg|mp3|wav)`: new message (required)
- `invite.(ogg|mp3|wav)`: new invitation (optional, falls back to the default sound)
- `call.(ogg|mp3|wav)`: incoming call ring, looped (optional, falls back to the default sound)

The built-in sounds are the `default` bundle (`public/sound/`).

Optional event sounds, played only when "Event Sounds" is on in settings (a bundle without one stays silent):
`sent`, `signin`, `signout`, `online`, `offline`, `callStart`, `callEnd`, and the sounds of the embedded call: `ringback` (waiting for pickup), `callJoin`, `callLeave`, `callDeclined`, `callTimeout`.
