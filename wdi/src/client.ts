import { WDISession } from "./session";

/**
 * Used to connect to a WDI server. Using WDI, you can send and/or receive 
 * audio, video and data streams from a remote server from within a web browser 
 * using WebSockets and WebRTC. When you connect over WDI, you establish 
 * a WebSocket on a given URL, then use that to negotiate a WebRTC 
 * connection between yourself and the server. You can then use commands to
 * control which streams you want to send/receive. 
 * 
 * Like RTMP, WDI is capable of both push and pull. If you connect to a server 
 * and add no tracks of your own to the session and request the stream you desire
 * using the built-in signalling mechanisms, then you are pulling. If you opt to add
 * local media tracks to be sent to a server, then you are pushing. You can push and 
 * pull simultaneously. 
 * 
 * Sending a stream:
 * ```typescript
 * let stream : MediaStream; // acquire a stream from somewhere
 * let client = new WDIClient('wss://wdi.example.com');
 * await client.addStream(stream);
 * await client.connect();
 * ```
 * 
 * Receiving a stream:
 * ```typescript
 * let client = new WDIClient('wss://wdi.example.com');
 * let stream = await client.acquireStream('stream-identifier');
 * // use stream for something
 * ```
 * 
 * You can change the active tracks at any time. The tracks you've shared are automatically
 * transmitted to the server (including WebRTC renegotiation).
 */
export class WDIClient extends WDISession {
    constructor(
        readonly url : string
    ) {
        super();
    }
    
    private _intentToConnect = false;
    private _reconnectTime = 10;

    async connect() {
        let socket = new WebSocket(this.url);
        
        await new Promise((onConnected, onError) => {
            this._intentToConnect = true;

            socket.addEventListener('error', async event => {
                this.onError(event);
                onError(new Error(`Error connecting to websocket`));
            });

            socket.addEventListener('open', async () => onConnected());
        });
        
        await this.setSocket(socket);
    }

    async disconnect(notify = true) {
        this._intentToConnect = false;
        super.disconnect(notify);
    }

    private onError(event: Event) {
        this._reconnectTime = Math.min(10 * 1000, this._reconnectTime * 10);
        setTimeout(() => this.reconnect(), this._reconnectTime);
        setTimeout(() => this.reduceReconnectTime(), this._reconnectTime*2);
    }

    private reconnect() {
        if (this._intentToConnect)
            this.connect();
    }

    private reduceReconnectTime() {
        this._reconnectTime = Math.max(100, this._reconnectTime / 10);
    }
}
