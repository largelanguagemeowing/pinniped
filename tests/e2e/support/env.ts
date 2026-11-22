function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.e2e.example to .env.e2e and set the test account.`);
  }
  return value;
}

export type Credentials = { homeserver: string; username: string; password: string };

export const e2eCredentials: Credentials = {
  homeserver: requireEnv('E2E_HOMESERVER'),
  username: requireEnv('E2E_USERNAME'),
  password: requireEnv('E2E_PASSWORD'),
};

const otherAccount = (prefix: string): Credentials => ({
  homeserver: e2eCredentials.homeserver,
  username: requireEnv(`${prefix}_USERNAME`),
  password: requireEnv(`${prefix}_PASSWORD`),
});

/** More accounts on the same homeserver, for tests with several people in them. */
export const peerCredentials = (): Credentials => otherAccount('E2E_PEER');
export const thirdCredentials = (): Credentials => otherAccount('E2E_THIRD');
export const fourthCredentials = (): Credentials => otherAccount('E2E_FOURTH');
