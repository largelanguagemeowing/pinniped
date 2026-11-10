# End-to-end tests

The Playwright suite logs in through the real Pinniped UI once, saves the authenticated browser state under `playwright/.auth/`, and reuses that state for the Chromium tests. Tests run with one worker because they share a Matrix account and some specs update account or room state.

## Configure

Copy the example environment file and fill in a dedicated Matrix test account:

```sh
cp .env.e2e.example .env.e2e
```

Required variables:

- `PLAYWRIGHT_BASE_URL`: Pinniped deployment to test
- `E2E_HOMESERVER`: homeserver domain accepted by Pinniped's login route
- `E2E_USERNAME`: Matrix account username
- `E2E_PASSWORD`: Matrix account password

`.env.e2e` and the generated authentication state are ignored by Git. Never commit either file.

## Run

```sh
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:report
```
