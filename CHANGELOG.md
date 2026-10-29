# 0.0.16

- No longer hardcodes `degradationPreference = 'maintain-resolution'`, instead using browser-default, but also now 
  accepts RTC sender parameters when adding the stream to allow these options to be set yourself. If you relied on this 
  policy, you will need to add that yourself. There are other strategies (and other parameters) that may be desirable 
  depending on your use cases.

# 0.0.14

- Fixes for connection establishment issues

# 0.0.6

- Fix: Expose `RemoteStream` properly without deep imports

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