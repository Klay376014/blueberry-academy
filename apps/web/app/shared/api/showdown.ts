/**
 * The shapes replay.pokemonshowdown.com answers with, under Showdown's own
 * field names.
 *
 * They sit in `shared/api/` rather than inside a feature because two features
 * hold them: the importer fetches these, and the timeline links back out to
 * the replay one of them names. Neither owns the other's knowledge of an
 * external system (issue #61).
 */

/** One row of `search.json`, under Showdown's own field names. */
export interface ReplayListing {
  id: string
  /**
   * A display name — `[Gen 9 Champions] VGC 2026 Reg M-B` — and not a format
   * id. `battles.format_id` can only be filled from a single replay's
   * `formatid`, which means after fetchReplay.
   */
  format: string
  players: string[]
  uploadtime: number
  rating: number | null
  /** 0 public / 1 private with a password / 2 private without one / 3 deleted. */
  private: number
  password: string | null
}

/** A single replay: everything a listing has, plus the format id and the log. */
export interface ReplayRecord extends ReplayListing {
  formatid: string
  log: string
  views?: string
}

/** Which replay to fetch. A private one is only served with its password. */
export interface ReplayRef {
  id: string
  password?: string | null
}

export interface ReplayList {
  replays: ReplayListing[]
  /**
   * Whether the search ran out of pages before it ran out of replays: there
   * is more of this player's history than the list shows.
   */
  truncated: boolean
}
