// Do not delete. See docs/adr/0003-vue-shims-for-tsgolint.md
//
// `vp check` type-checks with tsgolint (TypeScript-Go), which cannot read Vue
// SFCs. This wildcard keeps `*.vue` imports resolvable there. Real SFC types
// come from `nuxt typecheck` (vue-tsc), which resolves the files directly and
// takes precedence over this declaration.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
