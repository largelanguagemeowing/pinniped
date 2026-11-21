# End-to-end tests

The Playwright suite logs in through the real Pinniped UI once, saves the authenticated browser state (including IndexedDB, which holds the device's encryption keys) under `playwright/.auth/`, and reuses that state for the Chromium tests. Tests run with one worker because they share a Matrix account and some specs update account or room state. Tests with two people in them (`call.spec.ts`, `presence.spec.ts`) sign both in themselves.

The suite runs against either a throwaway local homeserver (what CI does) or a deployment.

## Local stack

`tests/e2e/stack/` starts a Matrix stack on this machine's loopback with podman (or docker; set `E2E_CONTAINER_RUNTIME` to choose):

- Synapse (SQLite, one TLS listener for the client and federation APIs, self-signed certificate)
- LiveKit and lk-jwt-service, wired as in [matrix-installer](https://github.com/largelanguagemeowing/matrix-installer): lk-jwt-service is an application service (MSC4502/MSC4512), and Synapse's `/.well-known/matrix/client` announces it
- justserve serving `dist/` with the production settings: the `Containerfile`'s `server` stage, which is the production image without the bundle

The containers share the host network, so the browser, the SFU and the services meet on loopback and WebRTC needs no NAT traversal. Each `up` generates fresh secrets, a certificate and three accounts (`e2e-user`, `e2e-peer`, `e2e-third`), and writes their credentials to `playwright/.stack/e2e.env`.

```sh
npm run build              # the stack serves dist/; rebuild after changing src/
npm run e2e:stack:up       # (re)creates the stack
npm run test:e2e:stack     # the suite against it
npm run e2e:stack:down
node tests/e2e/stack/stack.mjs logs   # container logs
```

Ports: Synapse 18448, lk-jwt-service 18080, LiveKit 17880-17882, app 14173. Image versions are pinned in `stack.mjs`, the web server's in the `Containerfile`.

Tests that need rooms which only exist on the deployment are tagged `@deployment`, and `test:e2e:stack` skips them (`room-reorder.spec.ts`, which uses the federated `#space:unredacted.org`). Other tests create what they need through the UI (`support/rooms.ts`) and leave it afterwards.

## Deployment

Copy the example environment file and fill in a dedicated Matrix test account:

```sh
cp .env.e2e.example .env.e2e
```

Required variables:

- `PLAYWRIGHT_BASE_URL`: Pinniped deployment to test
- `E2E_HOMESERVER`: homeserver domain accepted by Pinniped's login route
- `E2E_USERNAME`: Matrix account username
- `E2E_PASSWORD`: Matrix account password

Optional: `E2E_PEER_USERNAME`/`E2E_PEER_PASSWORD` and `E2E_THIRD_USERNAME`/`E2E_THIRD_PASSWORD`, more accounts on the same homeserver for the tests with several people (`call.spec.ts`, `group-dm.spec.ts`, `presence.spec.ts`); without them those tests are skipped.

`.env.e2e` and the generated authentication state are ignored by Git. Never commit either file.

```sh
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:report
```
