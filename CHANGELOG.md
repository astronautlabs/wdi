# 0.0.5

**Reference Implementation**

- Rename `IdentifiedStream` to `RemoteStream`
- Better connection lifecycle handling
- Add ability to listen for `ended` event on streams obtained via WDI
- `WDIServer#provideStream()` now accepts the `WDISession` that is requesting 
  the stream
- Added more diagnostics logging

**Examples**

- Updated client/server examples to use new `ended` lifecycle events
- Server example now properly calculates audio calls-per-second (CPS)

# 0.0.4

**Packaging**

- Fix package metadata to properly reference homepage/issues/repository

# 0.0.3

**Project**

- Documentation enhancements

**Packaging**

- Fix links on npmjs.org package page

# 0.0.2

**Project**

- Documentation enhancements

**Examples**

- Add client & server examples

# 0.0.1

- Initial release comprised of an isomorphic reference implementation with 
  simple media forwarding working