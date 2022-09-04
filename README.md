# @/wdi
## A web-native media transport protocol to replace RTMP

[![Version](https://img.shields.io/npm/v/@astronautlabs/wdi.svg)](https://www.npmjs.com/package/@astronautlabs/wdi)

> **Alpha Quality**  
> This software is new and unstable. Use with caution, and avoid use in 
> production without careful consideration. Major API changes may be made 
> frequently.

> 📺 Part of the [**Astronaut Labs Broadcast Suite**](https://github.com/astronautlabs/broadcast)

---

WDI (the Web Device Interface) is a client/server media transport scheme 
based on WebRTC and WebRPC. You can use WDI to push arbitrary 
audio/video streams from a web browser application to a server, as well as 
pull streams down from such a server in real time. You can also
use it between two servers to replace RTMP.

The design goals of WDI are:
- **Elegant**, simple yet powerful
  - Easy to implement in the browser
  - Easy to implement on the server
  - Capable of everything we're accustomed to with RTMP
- **Open**, in spirit, protocol and implementation
  - Built for standardization
  - MIT-licensed reference implementation
  - No restrictions on usage
- **Reusable**
  - Isomorphic
  - Platform agnostic
  - Extensible via WebRPC

The name WDI is a play on 
[SDI (Serial Digital Interface)](https://en.m.wikipedia.org/wiki/Serial_digital_interface), 
which is the standard way to transport media in a broadcast grade video network.

WDI is built on top of a new RPC solution for the web we're calling [WebRPC](https://github.com/astronautlabs/webrpc). WebRPC is a powerful object-oriented RPC mechanism that supports pluggable transports including WebSockets, Window-to-Window communication and more. It is suitable for browser-to-browser, browser-to-server and server-to-server communication and supports multiple services simultaneously. Those who know worked closely with Flash and Flash Media Server understand that RTMP's RPC mechanism was in many ways powerful and beautiful, but those who worked closely with RTMP outside of that space will rightly say it is cursed. We hope we've been able to bridge this gap and produce a worthy successor while polishing away the warts.

# Examples

Connect to a server and start sending a local MediaStream:

```typescript
import { WDIPeer } from '@astronautlabs/wdi';

let remotePeer = await WDIPeer.connect(`wss://mywdiserver.example.com/`);
let localPeer = new WDIPeer();
localPeer.addStream(myMediaStream);
await localPeer.start(remotePeer);
```

As a server, given an incoming WebSocket, receive a media stream from a client:

```typescript
import { RTCPeerConnection } from '@astronautlabs/webrtc'; 
globalThis['RTCPeerConnection'] = RTCPeerConnection;

import { WDIPeer } from '@astronautlabs/wdi';
import { RPCSession, SocketChannel } from '@astronautlabs/webrpc';

export function handleNewClient(clientWebSocket: WebSocket) {
  let session = new RPCSession(new SocketChannel(clientWebSocket));
  let wdiPeer = new WDIPeer();
  session.registerService(WDIPeer, () => wdiPeer);
  wdiPeer.remoteStreamAdded.subscribe((stream: MediaStream) => {
    // Do something with the MediaStream...
    let videoTrack = stream.getVideoTracks()[0];
    let audioTrack = stream.getAudioTracks()[0];
    let videoSink = new RTCVideoSink(videoTrack); // These are non-standard APIs provided by @/webrtc
    let audioSink = new RTCAudioSink(audioTrack); // and other node-webrtc based WebRTC implementations
    // ...
  });
}
```

The `WDIPeer` API is symmetrical, so you can of course perform the same operations in reverse (from server to client) if you wish.

You can also request that a specific stream be sent to you by using `acquireStream`. It is up to server implementations to decide how to accomodate requests (nothing is built into the WDI library
by default).

```typescript
let peer: WDIPeer;
let stream = await peer.acquireStream({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
// ^ Perhaps the server could support playing back a YouTube video over WebRTC
```

# Concepts
## Streams versus Tracks versus Transceivers

WebRTC is built on RTP Transceivers. Sending MediaStreamTracks is built on top 
of that, and sending MediaStreams themselves is only done indirectly. This allows
WebRTC to be used for many use cases, including fast starting, changing media 
configuration without renegotiation, reusing sockets etc.

WDI does not directly expose transceivers and only allows you to send/receive 
MediaStreams themselves. This does not mean you cannot extend WDI for your use
case, but using MediaStreams as the atomic unit of media delivery allows WDI
to be easy to use and reason about.

That is not to say that you cannot send a single track (ie a video with no audio
or audio without video). To do that, construct a new MediaStream around your 
desired track(s):

```typescript
new MediaStream([ myTrack, ... ]);
```

## Adaptive Resolution

WebRTC uses adaptive bitrate streaming to ensure quality of service for clients 
which are bandwidth-limited, including adaptive resolution. This is important 
to note, because you may not realize that the video frames given to you by 
`wrtc` do not have a static width/height. Even on network links that are not 
bandwidth-limited (like localhost), most WebRTC implementations start a new 
stream at lower resolution and gradually ramp up resolution as the bandwidth 
measurement system gets more data. 

You will need to take this into account when you are directly handling video 
frames. The included server example handles this by upscaling all frames to a 
particular target resolution, which is the obvious strategy, but may not be 
the ideal one depending on your use case.

# Samples

This repository contains simple client/server examples for demonstrative purposes.
- The client application is written in Angular. To run it, enter the `client/` directory, run `npm install` to install dependencies, and then run `npm start`.
- The server application targets the Node.js environment. To run it, enter the `server/` directory, run `npm install` to install dependencies, and then run `npm start`. 