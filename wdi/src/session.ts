import { v4 as uuid } from 'uuid';
import { Subject, Observable, Subscription } from 'rxjs';
import { 
    WDIMessage, PendingRequest, WDIRequest, RTCEnvelope, WDIRTCMessage, 
    AddedStream, StreamIdentity, WDIStreamIdentityMessage, 
    WDIAcquireStreamRequest, WDIResponse, IdentifiedStream, 
    StreamResolver, RequestHandler 
} from './interface';
import { timeout } from './util';

const MAX_MESSAGE_LENGTH = 1024 * 512;

/**
 * Business logic for a WDI session participant. Base class for WDIClient, WDIServerSession.
 */
export class WDISession {
    constructor() {
        this._id = uuid();
        this.setupPeerConnection();
        this.addRequestHandlers<any>({
            acquireStream: rq => this.onAcquireStream(rq),
            identifyStream: rq => this.onIdentifyStream(rq)
        });
    }

    private _id: string = null;

    get id() { return this._id; }

    toJSON() {
        return {
            id: this.id
        }
    }

    protected connection : RTCPeerConnection;
    protected connectionState: string;
    protected channel: RTCDataChannel;

    private _socket : WebSocket;
    private _remoteStreamAdded = new Subject<IdentifiedStream>();
    private _remoteStreamsChanged = new Subject<IdentifiedStream[]>();
    private _remoteStreams = new Set<IdentifiedStream>();
    private _outstandingRequests = new Map<string, PendingRequest>();
    private _streamIdentities = new Map<string, StreamIdentity>();

    public streamResolvers : StreamResolver[] = [];

    get socket() { return this._socket; }
    get remoteStreamAdded(): Observable<IdentifiedStream> { return this._remoteStreamAdded; }
    get remoteStreamsChanged(): Observable<IdentifiedStream[]> { return this._remoteStreamsChanged; }
    get remoteStreams() { return this._remoteStreams; }

    private async onAcquireStream(request : WDIAcquireStreamRequest) {
        this.addStream(await this.provideStream(request.identity), request.identity);
    }

    private async onIdentifyStream(request : WDIStreamIdentityMessage) {
        console.log(`[WDI] Remote has announced stream ${request.streamId} with identity:`);
        console.dir(request.identity);
        
        this._streamIdentities.set(request.streamId, request.identity);
    }

    private conformAcquisitionIdentity(identityOrUrl : string | StreamIdentity) {
        return Object.assign(
            {}, 
            typeof identityOrUrl === 'string' 
                ? { url: identityOrUrl } 
                : identityOrUrl,
            {
                acquisitionId: uuid()
            }
        );
    }

    /**
     * Acquire the stream corresponding to the given identity from the remote side.
     * If the request cannot be fulfilled, this method will throw an error, otherwise
     * it will resolve to a MediaStream that can be used locally.
     */
    async acquireStream(identityOrUrl : string | StreamIdentity) {
        return await new Promise<MediaStream>(async (resolve, reject) => {
            let identity = this.conformAcquisitionIdentity(identityOrUrl);
            let subscription : Subscription;
            subscription = this.remoteStreamAdded.subscribe(identifiedStream => {
                if (identifiedStream.identity.acquisitionId === identity.acquisitionId) {
                    subscription.unsubscribe();
                    resolve(identifiedStream.stream);
                }
            });
    
            try {
                await this.sendRequest(<WDIAcquireStreamRequest>{
                    type: 'acquireStream',
                    identity
                });
            } catch (e) {
                subscription.unsubscribe();
                reject(e);
            }
        });
    }

    protected setupPeerConnection() {
        this.connection = new RTCPeerConnection({
            iceTransportPolicy: 'all',
            iceServers: [
                // TODO: configurable
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        });

        this.connection.onicecandidateerror = ev => {
            if (ev.errorCode !== 701) {
                console.log(`[RTC] Received ICE candidate error code=${ev.errorCode}, text=${ev.errorText}`);
                console.error(`[RTC] Received ICE candidate error code=${ev.errorCode}, text=${ev.errorText}`);
            }
        };

        this.connection.onconnectionstatechange = ev => {
            this.connectionState = this.connection.connectionState;
            console.log(`[RTC] Connection state change: ${this.connectionState}`);
        };

        this.connection.ondatachannel = event => {
            console.log(`RTC: ondatachannel`);
            this.channel = event.channel;
            this.setupChannel();
        };

        this.connection.onicecandidate = ev => {
            this.sendRTC({ 
                type: 'candidate', 
                candidate: ev.candidate 
            });
        };

        this.connection.onnegotiationneeded = async ev => {
            console.log(`[RTC] Negotiation needed...`);
            let sdp = await this.connection.createOffer();
            await this.connection.setLocalDescription(sdp);

            // console.log(`=========== SENDING OFFER =============`);
            // console.log(sdp.sdp);
            // console.log(`=======================================`);

            this.sendRTC({ type: 'offer', offer: sdp });
        };

        this.connection.ontrack = ev => {
            console.log(`[RTC] Receiving ${ev.track.kind} track ${ev.track.id}`);
            console.log(`      Streams:`);
            for (let stream of ev.streams) {
                console.log(`      - [${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video] ${stream.id}`);
            }

            let added = 0;

            ev.streams.forEach(stream => {
                let identity = this._streamIdentities.get(stream.id);
                let identifiedStream : IdentifiedStream = { identity, stream };

                if (!Array.from(this._remoteStreams.values()).some(x => x.stream.id === stream.id)) {
                    console.log(`[WDI] Setting up incoming remote stream ${stream.id}, ${stream.getAudioTracks().length} audio tracks, ${stream.getVideoTracks().length} video tracks`);
                    this._remoteStreams.add(identifiedStream);
                    this._remoteStreamAdded.next(identifiedStream);
                    ++added;
                }
            });

            if (added > 0)
                this._remoteStreamsChanged.next(Array.from(this._remoteStreams));
        };
    }

    sendMessage(message: WDIMessage) {
        this._socket.send(JSON.stringify(message));
    }
    
    sendDataMessage(message: any) {
        if (this.channel)
            this.channel.send(JSON.stringify(message));
    }
    
    public addStreamResolver(resolver : StreamResolver) {
        this.streamResolvers.push(resolver);
    }

    /**
     * Called when the remote requests a stream with the given identity.
     * Exception thrown out of this function will be conveyed to the remote
     * as an error condition. Otherwise, return a MediaStream which will be sent to the 
     * remote via WebRTC.
     */
    protected async provideStream(identity : StreamIdentity): Promise<NonNullable<MediaStream>> {
        for (let resolver of this.streamResolvers) {
            let stream = resolver(identity);
            if (stream)
                return stream;
        }

        throw new Error(`No provider for stream with identity '${JSON.stringify(identity)}'`);
    }

    private _requestHandlers = new Map<string, RequestHandler>();

    protected addRequestHandlers<T extends WDIRequest = WDIRequest>(handlers : Record<string, RequestHandler<T>>) {
        Object.keys(handlers).forEach(type => this.addRequestHandler(type, handlers[type]));
    }

    protected addRequestHandler<T extends WDIRequest = WDIRequest>(type : string, handler : RequestHandler<T>) {
        this._requestHandlers.set(type, handler);
    }

    protected async handleRequest(request : WDIRequest): Promise<any> {
        let handler = this._requestHandlers.get(request.type);
        if (!handler)
            throw new Error(`Request type '${request.type}' is not supported`);
        
        return await handler(request);
    }
    
    async disconnect(notify = true) {
        if (this.connection) {
            if (notify) {
                this.sendDataMessage({ type: 'closing' });
                await timeout(100);
            }

            this.connection.close();
            this.connection = null;
            this.connectionState = 'disconnected';
        }
    }
    
    async sendRequest(message : WDIMessage): Promise<any> {
        let id = uuid();
        let state : PendingRequest;
        
        state = { request: <WDIRequest>Object.assign({}, message, { $rq: id }) };
        state.promise = new Promise((rs, rj) => (state.resolve = rs, state.reject = rj));

        this._outstandingRequests.set(id, state);
        this.sendMessage(state.request);
        return await state.promise;
    }

    sendRTC(rtcMessage: RTCEnvelope) {
        this.sendMessage(<WDIRTCMessage>{
            type: 'webrtc',
            rtcMessage
        });
    }

    private streams : AddedStream[] = [];

    async addStream(stream : MediaStream, identity : string | StreamIdentity) {
        console.log(`[WDI] Adding outgoing stream ${stream.id}`);
        let addedStream : AddedStream = {
            identity: typeof identity === 'string' ? { url: identity } : identity,
            stream
        };

        this.streams.push(addedStream);
        await this.addStreamToConnection(addedStream);
    }
    
    private async addStreamToConnection(addedStream : AddedStream) {
        if (!this.socket)
            return;

        console.log(`[WDI] Adding stream to RTC connection...`);
        for (let track of addedStream.stream.getTracks()) {
            let sender = this.connection.addTrack(track, addedStream.stream);
            let params = sender.getParameters();

            params.degradationPreference = 'maintain-resolution';
            params.priority = 'high';
            sender.setParameters(params);
        }

        await this.announceStream(addedStream);
    }

    private async announceStream(addedStream : AddedStream) {
        if (!this._socket)
            return;
        
        console.log(`[WDI] Announcing stream to peer: ${addedStream.stream.id}`);
        await this.sendRequest(<WDIStreamIdentityMessage>{ type: 'identifyStream', streamId: addedStream.stream.id, identity: addedStream.identity });
    }

    private setupChannel() {
        let channel = this.channel;

        channel.addEventListener('message', ev => {
            console.log(`[Peer:${this.id.split('-')[0]}]: ${ev.data}`);
            let message = JSON.parse(ev.data);
            this.onDataMessage(message);
        });

        channel.addEventListener('close', ev => {
            console.log(`[WDI/Data] Closed:`);
            console.dir(ev);
        });

        channel.addEventListener('error', ev => {
            console.log(`[WDI/Data] Error:`);
            console.error(ev.error);
            console.dir(ev);
        });

        channel.addEventListener('open', ev => {
            channel.send(JSON.stringify({ message: `hello from ${this.id}` }));
        });
    }

    private onDataMessage(message: any) {
        switch (message.type) {
            case 'closing':
                console.log(`Peer is closing connection intentionally, disconnecting on our end...`);
                this.disconnect(false);
                break;
        }
    }

    public async setSocket(socket : WebSocket) {
        this._socket = socket;
        this._socket.addEventListener('message', ev => this.onMessage(ev));
        await Promise.all(Array.from(this.streams).map(stream => this.addStreamToConnection(stream)));
    }

    async onMessage(event: MessageEvent) {
        if (typeof event.data !== 'string') {
            this._socket.send(JSON.stringify({
                type: 'diagnostics',
                request: event.data,
                code: 'no-binary',
                message: 'This service does not accept binary messages.'
            }));

            this._socket.close();
            return;
        }

        if (event.data.length > MAX_MESSAGE_LENGTH) {
            this._socket.send(JSON.stringify({
                type: 'diagnostics',
                request: event.data,
                code: 'message-too-long',
                message: `This service does not accept messages larger than ${MAX_MESSAGE_LENGTH / 1024}KB (${MAX_MESSAGE_LENGTH} bytes). Message length was ${event.data.length} bytes`
            }));

            this._socket.close();
            return;
        }

        let pc = this.connection;
        let message = JSON.parse(event.data);

        if (message.$rq) {
            let request = <WDIRequest>message;
            let result : any;
            
            try {
                result = await this.handleRequest(message);
                this.sendMessage(<WDIResponse>{ $rs: request.$rq, type: 'result', result });
            } catch (error) {
                this.sendMessage(<WDIResponse>{ $rs: request.$rq, type: 'exception', error: { message: error.message } });
            }

            return;
        } else if (message.$rs) {
            // Response to a preceding request 

            let response : WDIResponse = message;
            let pendingRequest = this._outstandingRequests.get(response.$rs);
            
            if (response.type === 'result')
                pendingRequest.resolve(message.value);
            else if (response.type === 'exception')
                pendingRequest.reject(message.error);

            this._outstandingRequests.delete(response.$rs);
            return;
        }

        if (message.type === 'webrtc') {
            if (message.rtcMessage.type === 'offer') {
                pc.setRemoteDescription(message.rtcMessage.offer);
                let answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                // console.log(`=========== SENDING ANSWER =============`);
                // console.log(answer.sdp);
                // console.log(`=======================================`);

                this.sendRTC({ type: 'answer', answer });
            } else if (message.rtcMessage.type === 'answer') {
                pc.setRemoteDescription(message.rtcMessage.answer);
            } else if (message.rtcMessage.type === 'candidate') {

                if (!message.rtcMessage.candidate) {
                    console.log(`[WDI] End of ICE candidates.`);
                } else {
                    pc.addIceCandidate(message.rtcMessage.candidate);
                }
            }
        } else {
            if (this._requestHandlers.has(message.type)) {
                console.error(`[WDI] Error: Client sent request of type '${message.type}' as a message (missing $rq field)`);
            } else {
                console.error(`[WDI] Error: Unrecognized command type ${message.type}.`);
            }
        }
    }

}