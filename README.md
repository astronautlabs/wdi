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
pull streams down from such a server in real time. 

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
