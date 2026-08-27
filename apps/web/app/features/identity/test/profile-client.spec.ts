import { beforeEach, describe, expect, it, vi } from 'vitest'
import supabasePlugin from '../../../plugins/supabase.client'
import { signIn } from '../../../../test/helpers'

// Same shape as auth-client.spec.ts: the Supabase client is faked, everything
// between it and the app -- the plugin, useProfile, the alias state -- is real.
const { table, selected, updates, createClient } = vi.hoisted(() => {
  const selected = { data: { showdown_usernames: [] as string[] }, error: null as unknown }
  const updates: unknown[] = []
  const updateResult = {
    data: null as { showdown_usernames: string[] } | null,
    error: null as unknown,
  }

  const table = {
    selected,
    updates,
    updateResult,
    from: vi.fn((_name: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, _value: unknown) => ({
          single: () => Promise.resolve(selected),
        }),
      }),
      update: (values: unknown) => {
        updates.push(values)
        return {
          eq: (_column: string, _value: unknown) => ({
            // The row is asked for back, so an update that matched nothing
            // cannot pass for success.
            select: (_columns: string) => ({ single: () => Promise.resolve(updateResult) }),
          }),
        }
      },
    })),
  }

  return {
    table,
    selected,
    updates,
    createClient: vi.fn(() => ({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(),
      },
      from: table.from,
    })),
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

/** Runs the plugin the way Nuxt would, so that $supabase is there to use. */
async function bootPlugin() {
  const nuxtApp = useNuxtApp()
  const result = (await (
    supabasePlugin as unknown as (app: typeof nuxtApp) => Promise<{
      provide: { supabase: unknown }
    }>
  )(nuxtApp)) as { provide: { supabase: unknown } }

  if (!nuxtApp.$supabase) nuxtApp.provide('supabase', result.provide.supabase)
}

describe('useProfile', () => {
  beforeEach(async () => {
    await bootPlugin()
    signIn()
    useShowdownAliases().value = []
    selected.data = { showdown_usernames: [] }
    selected.error = null
    table.updateResult.data = null
    table.updateResult.error = null
    updates.length = 0
    table.from.mockClear()
  })

  it('reads the alias list off the profile', async () => {
    selected.data = { showdown_usernames: ['NotLittleStar', 'Bibas Rozkurwiator'] }

    const { aliases, load } = useProfile()
    await load()

    expect(table.from).toHaveBeenCalledWith('profiles')
    expect(aliases.value).toEqual(['NotLittleStar', 'Bibas Rozkurwiator'])
  })

  it('binds a name, keeping the spelling the user typed', async () => {
    const { aliases, bindAlias } = useProfile()

    expect(await bindAlias('NotLittleStar')).toBe('bound')

    // Stored as typed -- the display name is what a replay shows -- while
    // every comparison below goes through toID.
    expect(updates).toEqual([{ showdown_usernames: ['NotLittleStar'] }])
    expect(aliases.value).toEqual(['NotLittleStar'])
  })

  it('trims the name before storing it', async () => {
    const { aliases, bindAlias } = useProfile()

    await bindAlias('  NotLittleStar  ')

    expect(aliases.value).toEqual(['NotLittleStar'])
  })

  it('recognises a differently-cased name as one already bound', async () => {
    const { aliases, bindAlias } = useProfile()
    await bindAlias('NotLittleStar')
    updates.length = 0

    expect(await bindAlias('notlittlestar')).toBe('already-bound')

    // Nothing written, and no second entry: toID says these are one person.
    expect(updates).toEqual([])
    expect(aliases.value).toEqual(['NotLittleStar'])
  })

  it('turns away something that is no name at all', async () => {
    const { aliases, bindAlias } = useProfile()

    expect(await bindAlias('   ')).toBe('unusable')
    // toID strips it to nothing, so it could never match a replay.
    expect(await bindAlias('!!!')).toBe('unusable')

    expect(updates).toEqual([])
    expect(aliases.value).toEqual([])
  })

  it('binds a name somebody else has already bound', async () => {
    // Trust model, not first-come-first-served: the replays behind a name are
    // public anyway, and losing your own name forever is the real harm. There
    // is nothing in this path that could even ask the question.
    const { bindAlias } = useProfile()

    expect(await bindAlias('NotLittleStar')).toBe('bound')
  })

  it('unbinds a name whatever case it is given in', async () => {
    const { aliases, bindAlias, unbindAlias } = useProfile()
    await bindAlias('NotLittleStar')
    await bindAlias('Bibas Rozkurwiator')
    updates.length = 0

    await unbindAlias('NOTLITTLESTAR')

    expect(updates).toEqual([{ showdown_usernames: ['Bibas Rozkurwiator'] }])
    expect(aliases.value).toEqual(['Bibas Rozkurwiator'])
  })

  it('leaves the list alone when the write is refused', async () => {
    const { aliases, bindAlias } = useProfile()
    table.updateResult.error = new Error('row level security')

    await expect(bindAlias('NotLittleStar')).rejects.toThrow('row level security')

    // The screen must not claim a binding the database refused.
    expect(aliases.value).toEqual([])
  })

  it('refuses to write a list it has never read', async () => {
    // A write replaces the whole array. Building one from a list that never
    // arrived would delete every name actually on the profile.
    useShowdownAliases().value = null

    await expect(useProfile().bindAlias('NotLittleStar')).rejects.toThrow(/not been read/)
    expect(updates).toEqual([])
  })

  it('takes the stored list from the row the write returned', async () => {
    table.updateResult.data = { showdown_usernames: ['NotLittleStar'] }

    const { aliases, bindAlias } = useProfile()
    await bindAlias('NotLittleStar')

    // What is stored now, rather than what was sent -- the row is the truth.
    expect(aliases.value).toEqual(['NotLittleStar'])
  })

  it('treats a write that matched no row as a failure, not a success', async () => {
    // An update whose filter matches nothing is not an error in Postgres, so
    // without the read-back a user with no profile row would be shown a
    // binding that was never stored.
    table.updateResult.error = new Error('no rows returned')

    const { aliases, bindAlias } = useProfile()

    await expect(bindAlias('NotLittleStar')).rejects.toThrow('no rows returned')
    expect(aliases.value).toEqual([])
  })

  it('reports a refused read rather than showing an empty list', async () => {
    selected.error = new Error('no such profile')

    await expect(useProfile().load()).rejects.toThrow('no such profile')
  })
})
