# PR #5: Babel SystemJS qualification

Date: 2026-10-21 UTC. Original umbrella task: **20261016-2010**.
Continuation: [issue #10](https://github.com/Laisky/js-utils/issues/10) and
[PR #5](https://github.com/Laisky/js-utils/pull/5).

## Scope and pinned inputs

The original dependency proposal was commit
`8eefdda2687ee275043bd5e093bafb4fd0325e61`. Its recorded PR base was stale.
The qualification baseline is actual main
`2ed8d98d9e1985fefd03fa41ada0c1d8733f32ff`, which includes the merged
flatted, form-data, minimatch and brace-expansion fixes.

The candidate merges that baseline into the existing PR branch, retains the
upstream SystemJS 7.29.4 fix and adds the regression test in
`tests/systemjs-dependency.test.js`. The containing commit identifies this
candidate; the PR description records its final head and hosted check URLs.

Only the Babel transform's required lockfile closure, one pinned development
test loader, this record and the new regression test differ from main. The
application sources, build configuration, public API, runtime dependencies,
peer dependencies and package entry points are unchanged. The existing
Node 22/24 CI workflow runs the new tests without adding jobs or test services.

## Dependency graph and reachability

| Resolved package | Baseline | Candidate |
| --- | --- | --- |
| `@babel/core` | 7.26.9 | 7.26.9 |
| `@babel/preset-env` | 7.26.9 | 7.26.9 |
| SystemJS transform resolved by preset-env | 7.25.9 | 7.29.4 |
| `systemjs` qualification loader | Not a project dependency | 6.15.1, dev-only |
| `flatted` | 3.4.2 | 3.4.2 |
| `form-data` | 4.0.4 | 4.0.4 |
| `minimatch` | 3.1.5 | 3.1.5 |
| `brace-expansion` | 1.1.21 | 1.1.21 |

Resolution follows `createRequire(require.resolve('@babel/preset-env'))`,
so the test exercises the transform used by the real preset. Core still
resolves generator/parser/traverse/types 7.26.9. The patched SystemJS plugin
resolves helper-module-transforms 7.28.6, helper-plugin-utils 7.28.6,
helper-validator-identifier 7.28.5 and traverse 7.29.0.

The project's `.babelrc` targets `node: current` and leaves module selection
to Babel's normal caller handling. The regression verifies that representative
Rollup and Jest callers do not select SystemJS, and includes a positive
control proving that explicit `modules: 'systemjs'` activates the detector.
Actual Rollup builds exercise the unchanged production configuration.

[Babel's advisory](https://github.com/babel/babel/security/advisories/GHSA-fv7c-fp4j-7gwp)
identifies 7.29.4 as patched. It concerns compilation of specifically crafted
untrusted source with the SystemJS transform. The installed dependency does
not by itself establish application exploitability; this task does not claim
such exposure. The upstream repair uses proper string member access rather
than treating arbitrary export names as identifiers.

## Behavioral reproduction and regression evidence

A harmless reproduction is a string-named re-export combined with export-star:

```js
export { count as "friendly name" } from './dep.js';
export * from './dep.js';
```

The old transform emits invalid member access for this ordinary name. The
patched transform retains the name as data and loads successfully.

The permanent suite uses the real SystemJS loader in one bounded native Node
child, outside Jest's application dependency mocks. It creates only local
temporary modules and cleans them up. It checks namespace keys, values,
binding updates, module identity and exactly one expected module evaluation.

| Qualification | Result |
| --- | --- |
| Existing baseline suite, Node 24.19.0 | 72/72 pass |
| New 13-case suite against baseline transform 7.25.9 | 7 pass, 6 fail |
| New suite against candidate transform 7.29.4 | 13/13 pass |
| Full candidate suite, Node 22.23.3 | 85/85 pass |
| Full candidate suite, Node 24.19.0 | 85/85 pass |
| Frozen Yarn 1.22.22 installation | Pass; no unplanned input changes |
| ESLint on the new test with Node/Jest globals | Pass |
| Actual Rollup ESM/CJS/UMD builds, both Node versions | Pass |

The six baseline failures are names containing a space, hyphen, quotation
mark, backslash, newline or Unicode line separators. Identifier, quoted
identifier, Unicode identifier and supported Unicode punctuation controls
pass. String-named imports alongside namespace imports, ordinary default and
namespace imports, direct re-exports, live imported values and dynamic
imports also pass on both versions. The confirmed separate live-binding
limitation below is not hidden by these results.

The initial restricted executor denied the existing tests' child processes
and loopback listener. Those EPERM results were environmental failures, not
RED source evidence. The approved executions supporting this record permit
those local test facilities. There is no repository-wide lint/typecheck
script or extra lint/type CI gate; declaration qualification is reported
separately below.

## Packed artifact and consumer comparison

The following bytes and hashes match between baseline and candidate, and
also match across Node 22.23.3 and Node 24.19.0:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist/index.esm.js` | 10942 | `a6c3176cbe91b29ab800250e744c57fec8718d9d85d242972b834af188e6712c` |
| `dist/index.cjs.js` | 11435 | `44948d8989749a4c0d1cdeb3d0ef768d57ff475f0f604980c9a905229c133ed2` |
| `dist/index.umd.js` | 11555 | `61dc2cfcfe5831bec9c836c7de77a2c097c2d9d4f74bddfe9de94fb388cc0009` |

Both `npm pack --offline` tarballs contain six files. Only their manifests
differ: the candidate adds the pinned SystemJS development dependency. No
test or task file is included in the published file set, and no package was
published by this qualification.

Isolated consumers use actual Bootstrap 5.3.8, Marked 15.0.12, PouchDB 9.0.0,
js-sha256 0.11.0 and Popper 2.11.8. Browser UMD runs in jsdom 20.0.3 with real
peer scripts and Node's native fetch/text APIs supplied where jsdom lacks
them. The peers are not replaced by application Jest mocks.

| Consumer check | Baseline and candidate, Node 22/24 |
| --- | --- |
| Native import of the declared ESM **module file** | Pass |
| Browser UMD global with real peer scripts | Pass |
| Identical CJS bytes under a temporary `.cjs` filename | Pass; diagnostic control |
| Native require/import of the **package root** | Fail identically; inherited filename defect |
| Strict TypeScript 5.8.2 NodeNext consumer | TS7016 in both; advertised declarations absent |

The passing variants agree on 31 namespace exports, 46 default-object keys,
15 `kvUtils` keys and alias identities. SHA-256, Markdown rendering, DOM
activation, string helpers and existing local-storage value roundtrips also
agree. This is focused consumer qualification, not exhaustive browser or
PouchDB integration testing.

## Separate inherited findings

1. **Package root:** `type: module` plus `main: dist/index.cjs.js` causes
   `exports is not defined in ES module scope`. Copying the same bytes to a
   `.cjs` file makes the consumer pass. [PR #2](https://github.com/Laisky/js-utils/pull/2)
   already owns the compatible filename repair and retains the legacy path;
   it is not merged into the qualification baseline or duplicated here.
2. **Declarations:** `dist/index.d.ts` is advertised but not generated or
   packed. Tracked independently in [issue #11](https://github.com/Laisky/js-utils/issues/11).
3. **Import then local re-export:** `import { count } from './dep.js'; export
   { count };` publishes the initial value but not later dependency updates
   under both SystemJS transform versions. A native ESM control exports 8
   after incrementing 7; both Babel variants still export 7 while a local
   `readCount()` closure returns 8. Their emitted code is identical. Direct
   re-exports work. Tracked with the minimal fixture and expected semantics
   in [issue #12](https://github.com/Laisky/js-utils/issues/12).

These failures are not passing acceptance checks and are not introduced by
this update. The PR establishes a compatible dependency remediation, not a
complete package release qualification or full SystemJS conformance.

## HOWTO: repeat the core checks

Use Yarn 1.22.22 and each supported Node version:

```sh
corepack prepare yarn@1.22.22 --activate
COREPACK_ENABLE_AUTO_PIN=0 corepack yarn install --frozen-lockfile --non-interactive
corepack yarn test --runInBand
corepack yarn build
npm pack --offline
git diff --exit-code -- package.json yarn.lock src tests
```

For the RED control, create a separate worktree pinned to baseline
`2ed8d98d9e1985fefd03fa41ada0c1d8733f32ff`, install its unchanged frozen
lockfile, copy the candidate test into its `tests` directory, and make only
the candidate's `systemjs@6.15.1` loader available under its `node_modules`
(it has no dependency subtree). Do not replace any baseline Babel package.
Run `corepack yarn test --runInBand --runTestsByPath
tests/systemjs-dependency.test.js`; the expected result is six failures and
seven passing controls. Remove the copied test after collecting evidence.

ESLint for the new test:

```sh
node node_modules/eslint/bin/eslint.js tests/systemjs-dependency.test.js \
  --global process --global require --global describe --global beforeAll \
  --global expect --global test
```

## Merge, release and rollback

The PR description is the final record of exact-head hosted CI. Review this
dependency update separately from the outstanding packaging fixes. No merge,
npm publication or production deployment is part of this continuation.
There is no data migration or changed application behavior. A source revert
can restore prior build inputs, but restoring the old SystemJS transform
also restores the upstream advisory exposure; prefer a corrected compatible
version if a later regression is discovered.
