# @/wdi
## A web-native media transport protocol to replace RTMP

Home | [Reference Implementation](wdi/README.md) | [Example](#Example)

> **Alpha Quality**  
> This software is very new and unstable. Use with caution, and avoid use in 
> production without careful consideration. Major API changes may be made 
> frequently.

---

[![Version](https://img.shields.io/npm/v/@astronautlabs/wdi.svg)](https://www.npmjs.com/package/@astronautlabs/wdi)

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

The name WDI is a play on 
[SDI (Serial Digital Interface)](https://en.m.wikipedia.org/wiki/Serial_digital_interface), 
which is the standard way to transport media in a broadcast grade video network.

WDI is a specification, but we also develop a 
[reference implementation](wdi/README.md) written in Typescript that provides both client and server functionality. We publish it to NPM as `@astronautlabs/wdi`, and you can use it to easily add WDI support to any Javascript or Typescript app.

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
