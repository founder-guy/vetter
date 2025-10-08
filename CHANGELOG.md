# [1.0.0](https://github.com/founder-guy/vetter/compare/v0.5.2...v1.0.0) (2025-10-08)


### chore

* upgrade to ESLint 9 with flat config ([#10](https://github.com/founder-guy/vetter/issues/10)) ([2b9ec46](https://github.com/founder-guy/vetter/commit/2b9ec4685421d47a5b51039c528a213a8885c9dc))


### BREAKING CHANGES

* Minimum Node.js version is now 18.18.0 (was 18.0.0)

This removes 5 deprecation warnings from npm install:
- eslint@8.57.1
- rimraf@3.0.2
- glob@7.2.3
- inflight@1.0.6
- @humanwhocodes/* packages

* fix: resolve ESLint errors and improve type safety

- Remove unused error variables in catch blocks (prefer catch without binding)
- Fix prefer-const violation in install timeout handling
- Replace any types with proper TypeScript types in tests (PackageLockEntry, Manifest)
- Add eslint-disable comments only for necessary test mocks (Node.js API simulation)
- Prefix unused parameters with underscore per convention
- Remove unused parsePackageString mock from cache-integration tests

All 244 tests passing. No functional changes.

## [0.5.2](https://github.com/founder-guy/vetter/compare/v0.5.1...v0.5.2) (2025-10-08)


### Bug Fixes

* defer timeout rejection until SIGKILL is needed ([f96a6b7](https://github.com/founder-guy/vetter/commit/f96a6b7823e9e9c090fed5adb721324cbd9ddded))
