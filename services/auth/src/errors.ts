export class EmailInUseError extends Error {
  constructor(email: string) {
    super(`Email already in use: ${email}`);
    this.name = 'EmailInUseError';
  }
}

// Deliberately identical message regardless of whether the email doesn't
// exist or the password was wrong -- do not let login responses leak which
// half was incorrect (Cipher's security review checks this).
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

// The refresh token itself failed JWT verification -- bad signature,
// malformed, or wrong secret. Distinct from SessionInvalidError below
// because this can't even be looked up (no trustworthy claims to hash/find
// with); it's rejected before touching the session store at all.
export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid refresh token');
    this.name = 'InvalidRefreshTokenError';
  }
}

// Deliberately covers three different underlying causes -- session not
// found, already revoked, or past expiresAt -- behind one message and one
// status code. Same principle as InvalidCredentialsError: a client with a
// dead refresh token doesn't get to learn *why* it's dead (e.g. "revoked"
// vs "expired" would tell an attacker whether a stolen token was ever
// valid in the first place). The action is identical either way: re-login.
export class SessionInvalidError extends Error {
  constructor() {
    super('Session is invalid, expired, or revoked');
    this.name = 'SessionInvalidError';
  }
}
