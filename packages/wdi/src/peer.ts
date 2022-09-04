import { Subject } from 'rxjs';
import { AddedStream, StreamIdentity } from './interface';
import { markProxied, timeout } from './util';
import { RemoteStream } from './remote-stream';
import { Event, Method, Proxied, Remotable, RPCSession, Service } from '@astronautlabs/webrpc';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
];

const DEFAULT_RTC_CONFIG = <Partial<RTCConfiguration>>{
    iceTransportPolicy: 'all',
    iceServers: DEFAULT_ICE_SERVERS
}

/**
 * The primary API for WDI. Typically a client and server both create WDIPeer objects and WebRPC is used to 
 * connect them together. WDI can operate over any signaling mechanism that WebRPC can operate over, though the 
 * simplest mechanism is to use WebSockets. The connect() method provides an easy way to get started.
 */
@Service('com.astronautlabs.wdi')
export class WDIPeer {
    constructor(configuration?: RTCConfiguration) {
        this._rtcConnection = new RTCPeerConnection({ ...DEFAULT_RTC_CONFIG, ...configuration });
        this._rtcConnection.addEventListener('icecandidate', ev => this._iceCandidates.next(ev.candidate));
        this._rtcConnection.addEventListener('negotiationneeded', ev => this.onNegotiationNeeded());
        this._rtcConnection.addEventListener('icecandidateerror', ev => this.onIceCandidateError(ev['errorCode'], ev['errorText']));
        this._rtcConnection.addEventListener('connectionstatechange', () => this.onConnectionStateChange());
        this._rtcConnection.addEventListener('datachannel', event => this.setupChannel(event.channel));
        this._rtcConnection.addEventListener('track', ev => this.onTrack(ev.track, <MediaStream[]>ev.streams));
    }

    /**
     * Connect to the given WebRPC-capable WebSocket, obtain the remote WDIPeer and return it.
     * You can then create your own local WDIPeer object and call localPeer.start(remotePeer).
     * @param url 
     */
    static async connect(url: string) {
        return await (await RPCSession.connect(url)).getRemoteService(WDIPeer);
    }

    /**
     * Start a connection between local/remote peers
     * @param otherPeer 
     */
    @Method()
    async start(otherPeer: WDIPeer) {
        await Promise.all([
            otherPeer.connect(markProxied(<WDIPeer>this)),
            this.connect(this._remotePeer)
        ]);
    }

    private _remoteStreamAdded = new Subject<RemoteStream>();
    private _remoteStreamAdded$ = this._remoteStreamAdded.asObservable();
    private _remoteStreamsChanged = new Subject<RemoteStream[]>();
    private _remoteStreamsChanged$ = this._remoteStreamsChanged.asObservable();
    private _remoteStreams = new Set<RemoteStream>();
    private _streamIdentities = new Map<string, StreamIdentity>();
    private _rtcConnection: RTCPeerConnection;
    private _connectionState: string;
    private _channel: RTCDataChannel;
    private _remotePeer: Proxied<WDIPeer>;
    private _iceCandidates = new Subject<RTCIceCandidate>();
    private _iceCandidates$ = this._iceCandidates.asObservable();
    private _offers = new Subject<RTCSessionDescriptionInit>();
    private _offers$ = this._offers.asObservable();
    private _answers = new Subject<RTCSessionDescriptionInit>();
    private _answers$ = this._answers.asObservable();
    private _isClosed = false;
    private _streams : AddedStream[] = [];
    private _streamRemoved = new Subject<string>();
    private _streamRemoved$ = this._streamRemoved.asObservable();

    @Event() get iceCandidates() { return this._iceCandidates$; }
    @Event() get offers() { return this._offers$; }
    @Event() get answers() { return this._answers$; }
    @Event() get streamRemoved() { return this._streamRemoved$; }

    get connectionState() { return this._connectionState; }
    get rtcConnection() { return this._rtcConnection; }
    get remoteStreamAdded() { return this._remoteStreamAdded$; }
    get remoteStreamsChanged() { return this._remoteStreamsChanged$; }
    get remoteStreams() { return this._remoteStreams; }
    get isClosed() { return this._isClosed; }

    @Method()
    async connect(peer: Proxied<WDIPeer>) {
        if (this._remotePeer)
            throw new Error(`Can only call connect() once [this method is called for you]`);

        this._remotePeer = peer;
        this._remotePeer.iceCandidates.subscribe(candidate => this.rtcConnection.addIceCandidate(candidate));
        this._remotePeer.offers.subscribe(async offer => {
            await this.rtcConnection.setRemoteDescription(offer);
            let answer = await this.rtcConnection.createAnswer();
            this.rtcConnection.setLocalDescription(answer);
            this._answers.next(answer);
        });
        this._remotePeer.answers.subscribe(async answer => {
            await this.rtcConnection.setRemoteDescription(answer);
        });
    }

    @Method()
    async identifyStream(streamId: string, identity: StreamIdentity) {
        console.log(`[WDI] Remote has announced stream ${streamId} with identity:`);
        console.dir(identity);
        
        this._streamIdentities.set(streamId, identity);
    }

    private async onNegotiationNeeded() {
        console.log(`[RTC] Negotiation needed...`);
        let sdp = await this.rtcConnection.createOffer();
        await this.rtcConnection.setLocalDescription(sdp);
        this._offers.next(sdp);
    }

    private onConnectionStateChange() {
        if (this._connectionState === this._rtcConnection.connectionState)
            return;

        this._connectionState = this._rtcConnection.connectionState;

        if (this._connectionState === 'failed') {
            console.log(`[WDI] RTC Connection entered failed state.`);
            this.onClose();
        }
    }

    private async onIceCandidateError(errorCode: number, errorText: string) {
        if (errorCode !== 701) {
            console.log(`[RTC] Received ICE candidate error code=${errorCode}, text=${errorText}`);
            console.error(`[RTC] Received ICE candidate error code=${errorCode}, text=${errorText}`);
        }
    }

    private onTrack(track: MediaStreamTrack, streams: MediaStream[]) {
        console.log(`[RTC] Receiving ${track.kind} track ${track.id}`);
        console.log(`      Streams:`);
        for (let stream of streams) {
            console.log(`      - [${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video] ${stream.id}`);
        }

        let added = 0;

        streams.forEach(stream => {
            let identity = this._streamIdentities.get(stream.id);
            let identifiedStream = new RemoteStream(stream, identity);

            identifiedStream._notifyEnded()
            if (!Array.from(this._remoteStreams.values()).some(x => x.stream.id === stream.id)) {
                console.log(`[WDI] Setting up incoming remote stream ${stream.id}, ${stream.getAudioTracks().length} audio tracks, ${stream.getVideoTracks().length} video tracks`);
                this._remoteStreams.add(identifiedStream);
                this._remoteStreamAdded.next(identifiedStream);
                ++added;
            }
        });

        if (added > 0)
            this._remoteStreamsChanged.next(Array.from(this._remoteStreams));
    }

    private onClose() {
        if (this._isClosed)
            return;
        this._isClosed = true;
        
        console.log(`[WDI] Connection is ending.`);
        console.log(`[WDI] Ending ${this.remoteStreams.size} remote streams...`);
        this.remoteStreams.forEach(stream => stream._notifyEnded());
        this._rtcConnection.close();
    }

    private setupChannel(channel: RTCDataChannel) {
        this._channel = channel;

        channel.addEventListener('message', ev => {
            let message = JSON.parse(ev.data);
            this.onDataMessage(message);
        });

        channel.addEventListener('close', ev => {
            console.log(`[WDI/Data] Closed:`);
            console.dir(ev);
        });

        channel.addEventListener('error', ev => {
            console.log(`[WDI/Data] Error:`);
            console.error(ev['error']);
            console.dir(ev);
        });

        channel.addEventListener('open', ev => {
            console.log(`[WDI/Data] Established`);
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

    async disconnect(notify = true) {
        if (this._rtcConnection) {
            if (notify) {
                this.sendDataMessage({ type: 'closing' });
                await timeout(100);
            }

            this._rtcConnection.close();
            this._rtcConnection = null;
            this._connectionState = 'disconnected';
        }
    }
    
    sendDataMessage(message: any) {
        if (this._channel)
            this._channel.send(JSON.stringify(message));
    }

    async addStream(stream : MediaStream, identity : string | StreamIdentity) {
        console.log(`[WDI] Adding outgoing stream ${stream.id}`);
        let addedStream : AddedStream = {
            identity: typeof identity === 'string' ? { url: identity } : identity,
            stream,
            tracks: []
        };

        this._streams.push(addedStream);
        
        console.log(`[WDI] Adding stream to RTC connection...`);
        for (let track of addedStream.stream.getTracks()) {
            let addedTrack = addedStream.tracks.find(x => x.track === track);
            if (addedTrack)
                continue;

            let sender = this._rtcConnection.addTrack(track, addedStream.stream);
            let params = sender.getParameters();

            params.degradationPreference = 'maintain-resolution';
            params['priority'] = 'high';
            sender.setParameters(params);
            addedStream.tracks.push({ track, sender });
        }

        console.log(`[WDI] Announcing stream to peer: ${addedStream.stream.id}`);
        await this._remotePeer.identifyStream(addedStream.stream.id, addedStream.identity);
    }

    async removeStream(stream : MediaStream) {
        let index = this._streams.findIndex(x => x.stream === stream);
        if (index < 0)
            return false;
        
        let addedStream = this._streams[index];
        this._streams.splice(index, 1);

        addedStream.tracks.forEach(track => this._rtcConnection.removeTrack(track.sender));
        addedStream.tracks = [];

        console.log(`[WDI] Announcing stream removal to peer: ${addedStream.stream.id}`);
        this._streamRemoved.next(addedStream.stream.id);

        return true;
    }

    /**
     * Acquire the stream corresponding to the given identity from the remote side.
     * If the request cannot be fulfilled, this method will throw an error, otherwise
     * it will resolve to a MediaStream that can be used locally.
     * 
     * Implementors should call addStream() and return the new stream if a new stream is created as 
     * a result of this call.
     */
    @Method()
    async acquireStream(identity : StreamIdentity) {
        throw new Error(`No provider for stream with identity '${JSON.stringify(identity)}'`);
    }
}