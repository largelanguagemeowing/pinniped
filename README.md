# Pinniped

Pinniped is an independent Matrix client. It started as a fork of [Cinny](https://github.com/cinnyapp/cinny) and has since gone its own way.

## What Pinniped adds

- Mention counts on the app icon: dock badge on macOS, launcher count on Linux, taskbar overlay on Windows
- Unread pills and mention badges in the sidebar, including for spaces
- Animated profile banners and clamped bios with show more/less
- Rich presence: the activity games and media players report over the local RPC socket is published as your Matrix rich presence (MSC4320; desktop app only, off by default)
- Call status with a duration timer and member list
- Keyboard shortcuts to move between rooms, and alt+left/right to step through visited rooms
- Collapsible emoji groups, with Twemoji as the default font
- Copy selected messages as a clean transcript

## Getting started

```bash
npm install
npm start        # development server
npm run build    # production build into dist/
```

To build the desktop app for Linux, run `npm run electron:dist`. Packages land in `electron/out/`.

## Self-hosting

Serve the files in `dist/` with any web server. The app uses client-side routing, so the server must send `index.html` for unknown paths. [`docker-nginx.conf`](docker-nginx.conf) is the nginx config the container image uses. If you'd rather not configure redirects, enable hash routing in [`config.json`](config.json).

To deploy under a subdirectory, set `base` in [`build.config.ts`](build.config.ts) and rebuild.

## License

AGPL-3.0-only, the same as Cinny, which Pinniped is derived from.
