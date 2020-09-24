# @/wdi » Example

## A web-native media transport protocol to replace RTMP

[Home](https://github.com/astronautlabs/wdi) | [Reference Implementation](https://github.com/astronautlabs/wdi/blob/master/wdi/README.md) | Example

> **Alpha Quality**  
> This software is very new and unstable. Use with caution, and avoid use in 
> production without careful consideration. Major API changes may be made 
> frequently.

---

This directory contains a simple Typescript example that demonstrates how to use the [reference implementation](https://github.com/astronautlabs/wdi/blob/master/wdi/README.md) for [WDI](https://github.com/astronautlabs/wdi). The example includes both client and server components.

This example implements a rudimentary WDI->RTMP gateway for demonstration purposes.

> [View Files on GitHub](https://github.com/astronautlabs/wdi/tree/master/examples)


# Client

The client application is written in Angular. To run it, enter the `client/` directory, run `npm install` to install dependencies, and then run `npm start`.

# Server

The server application targets the Node.js environment. To run it, enter the `server/` directory, run `npm install` to install dependencies, and then run `npm start`. 