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
npm install wdi
```

Within the package you will find a class called `WDIClient` that lets you easily
establish connections to WDI servers (via WebSockets and WebRTC).

```typescript
let client = new WDIClient(`wss://mywdiserver.example.com:1234/path`);
await client.addStream(this.stream, {
  destination: this.rtmpUrl
});
await client.connect();
```

## Usage on the Server

In addition to WDI itself, you will need implementations for WebRTC and WebSockets. We recommend `wrtc` (based on Google's `libwebrtc`) and 
`ws`, but you can use any standards compliant implementations.

```
npm install wdi wrtc
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