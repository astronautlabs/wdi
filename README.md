# @/wdi

[![Version](https://img.shields.io/npm/v/@astronautlabs/wdi.svg)](https://www.npmjs.com/package/@astronautlabd/wdi)

> **Alpha Quality**  
> This software is very new and unstable. Use with caution, and avoid use in 
> production without careful consideration. Major API changes may be made 
> frequently.

## A web-native media transport protocol to replace RTMP

WDI (the Web Device Interface) is a client/server media transport scheme 
based on WebRTC and WebSockets. You can use WDI to push arbitrary 
audio/video streams from a web browser application to a server, as well as 
pull streams down from such a server in real time. You can also
use it between two servers to replace RTMP.

The design goals of WDI are:
- **Elegant**, simple yet powerful
  - Easy to implement in the browser
  - Easy to implement on the server
  - Capable of everything we're accustomed to with RTMP
- **Open**, in spirit, protocol and implementation
  - Formal standard
  - MIT-licensed reference implementation
  - No restrictions on usage
- **Highly reusable**
  - Isomorphic
  - Platform agnostic
  - Easily extensible

# The Name

WDI is a play on [SDI (Serial Digital Interface)](https://en.m.wikipedia.org/wiki/Serial_digital_interface), 
which is the standard way to transport media in a broadcast grade video network.

# Reference Implementation

WDI is a specification, but we also develop a reference implementation in Typescript
that provides both client and server functionality. We publish it to NPM as 
`@astronautlabs/wdi`, and you can use it to easily add WDI support to any Javascript 
or Typescript app.

## Usage in the Browser

For the browser, it is sufficient to just install the reference implementation:

```
npm install @astronautlabs/wdi
```

Within the package you will find a class called `WDIClient` that lets you easily
establish connections to WDI servers (via WebSockets and WebRTC).

```typescript
let client = new WDIClient(`wss://mywdiserver.example.com:1234/path`);
await client.addStream(someMediaStream);
await client.connect();
```

You can also pass arbitrary metadata with your stream.

```typescript
await client.addStream(someMediaStream, {
  yourDataHere: 123
});
```

For convenience, you can pass a URL as the identity parameter 
instead. 

```typescript
await client.addStream(someMediaStream, 'https://example.com/');
```

WDI will expand this into a `StreamIdentity` object like so:

```json
{
  "url": "https://example.com/"
}
```

Note that WDI itself assigns no special meaning to the identity data passed 
alongside a stream. The meaning needs to be agreed upon between the client and 
server applications.

## Usage on the Server

In addition to WDI itself, you will need implementations for WebRTC and WebSockets. We recommend `wrtc` (based on Google's `libwebrtc`) and 
`ws`, but you can use any standards compliant implementations.

```
npm install @astronautlabs/wdi wrtc ws
```

You'll need to ensure that the `RTCPeerConnection` class from your chosen
implementation is available in the global scope before trying to use WDI.

```typescript
import { RTCPeerConnection } from 'wrtc';
global['RTCPeerConnection'] = RTCPeerConnection;
```

Your server application will be responsible for accepting incoming `WebSocket` 
sessions and passing them to an instance of `WDIServer`. 

```typescript
import { WDIServer } from '@astronautlabs/wdi';
import { WebSocket } from 'ws';

// Construct a WDI server instance and subscribe 
// to incoming remote streams. 

const wdiServer = new WDIServer();
wdiServer.remoteStreamAdded.subscribe(async identifiedStream => {
  let stream : MediaStream = identifiedStream.stream;
  // do something with the stream (perhaps guided by identifiedStream.identity)
});

// Start a WebSocket server and pass clients to the WDI server
new WebSocket.Server({ port: 3000 })
  .addListener('connection', socket => wdiServer.accept(<any>socket))
;

```
For metadata sent alongside the stream from the client,
see `identifiedStream.identity`. 

The types of things you can do with the MediaStream depends on the WebRTC 
implementation you have selected. The `wrtc` package offers a set of classes
that let you send/receive raw audio/video data from streams sent over WebSockets.
For that, see `RTCVideoSink`, `RTCVideoSource`, `RTCAudioSink`, `RTCAudioSource`.

Note that operations on video frames (especially 1080p and up) are expensive, you
should take care to minimize unnecessary copies or frame transformations. For more
information see [Performance](#Performance).

## Performance

The reference implementation is very small and does none of the heavy lifting.
The performance you observe will be heavily dependent on what you do with the 
media streams being sent/received. 

### Transforming Video Frames

Raw video frames at modern resolutions are very large. Copying, converting, scaling 
and rotating video frames efficiently requires use of the host CPU's SIMD 
(single input, multple destination) instructions, or at least a highly optimized 
naive implementation. The easiest way to achieve this is to offload frame 
manipulation to WebAssembly (in the browser) and native C/C++/Rust addons (on Node.js).

The included server example utilizes Astronaut Labs' `libyuv` NPM package, which is a native add-on
for Node.js which exposes all of Chromium's `libyuv` library, which is written in C/C++ 
and implements SIMD on x64, ARM and MIPS. This Node.js binding is created and maintained by Astronaut Labs, the original authors of WDI).
`libyuv` provides color space conversions, scaling, and rotation routines for 
raw video frames, like the kind produced by `wrtc`.