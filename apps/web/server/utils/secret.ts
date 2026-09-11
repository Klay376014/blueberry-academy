/**
 * The value, kept off the object. A field — `#private` included — is a field
 * to the V8 inspector, and `console.log` is the inspector, so anything stored
 * on the instance prints. Here the instance carries no own property at all
 * and `console.log(secret)` says `Secret {}`.
 */
const values = new WeakMap<Secret, string>()

const REDACTED = '[redacted]'

/**
 * A credential that cannot be printed by accident: every way a value usually
 * reaches a log gives `[redacted]`, and `.expose()` is the only way back to
 * it. See docs/specs/2026-09-11-private-replay-sync-design.md §5.2.
 */
export class Secret {
  constructor(value: string) {
    values.set(this, value)
  }

  /** The one place the value comes back out. */
  expose(): string {
    return values.get(this)!
  }

  toString(): string {
    return REDACTED
  }

  toJSON(): string {
    return REDACTED
  }
}
