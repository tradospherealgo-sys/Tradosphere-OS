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
