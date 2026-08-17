import * as conduit from '@astronautlabs/conduit';

import { Subject } from 'rxjs';
import { AddedStream, StreamIdentity } from './interface';
import { markProxied, timeout } from './util';
import { RemoteStream } from './remote-stream';

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

@conduit.Name('com.astronautlabs.wdi')
export class WDI extends conduit.Service {
    defaultConfiguration: RTCConfiguration = DEFAULT_RTC_CONFIG;

    @conduit.Method()
    async createPeer(): Promise<WDIPeer> {
        return new WDIPeer(this.defaultConfiguration);
    }

    /**
     * Connect to the given WebRPC-capable WebSocket, obtain the remote WDIPeer and return it.
     * You can then create your own local WDIPeer object and call localPeer.start(remotePeer).
     * @param url
     */
    static async connect(url: string) {
        let wdi = await (await (await conduit.RPCSession.connect(url)).getRemoteService(WDI))
        if (!wdi)
            throw new Error(`Could not acquire WDI service (com.astronautlabs.wdi), please ensure this Conduit service is capable of WDI.`);

        return wdi.createPeer();
    }
}

/**
 * The primary API for WDI. Typically a client and server both create WDIPeer objects and Conduit is used to
 * connect them together. WDI can operate over any signaling mechanism that Conduit can operate over, though the
 * simplest mechanism is to use WebSockets. The connect() method provides an easy way to get started.
 */
@conduit.Remotable()
export class WDIPeer {
    constructor(configuration?: RTCConfiguration) {
        this._rtcConnection = new RTCPeerConnection({ ...DEFAULT_RTC_CONFIG, ...configuration });
        this._rtcConnection.addEventListener('icecandidate', ev => {
            if (ev.candidate)
                this._iceCandidates.next(ev.candidate);
        });
        this._rtcConnection.addEventListener('negotiationneeded', ev => this.onNegotiationNeeded());
        this._rtcConnection.addEventListener('icecandidateerror', ev => this.onIceCandidateError(ev['errorCode'], ev['errorText']));
        this._rtcConnection.addEventListener('connectionstatechange', () => this.onConnectionStateChange());
        this._rtcConnection.addEventListener('datachannel', event => this.setupChannel(event.channel));
        this._rtcConnection.addEventListener('track', ev => this.onTrack(ev.track, <MediaStream[]>ev.streams));
    }

    /**
     * Start a connection between local/remote peers
     * @param otherPeer
     */
    @conduit.Method()
    async connect(otherPeer: WDIPeer) {
        await this.setRemotePeer(markProxied(otherPeer)),
        await otherPeer.setRemotePeer(markProxied(<WDIPeer>this));
        this.fireLinkEstablished();
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
    private _remotePeer: conduit.Proxied<WDIPeer>;
    private _iceCandidates = new Subject<RTCIceCandidate>();
    private _iceCandidates$ = this._iceCandidates.asObservable();
    private _offers = new Subject<RTCSessionDescriptionInit>();
    private _offers$ = this._offers.asObservable();
    private _answers = new Subject<RTCSessionDescriptionInit>();
    private _answers$ = this._answers.asObservable();
    private _closed = new Subject<void>();
    private _closed$ = this._closed.asObservable();
    private _isClosed = false;
    private _streams : AddedStream[] = [];
    private _streamRemoved = new Subject<string>();
    private _streamRemoved$ = this._streamRemoved.asObservable();

    @conduit.Event() get iceCandidates() { return this._iceCandidates$; }
    @conduit.Event() get offers() { return this._offers$; }
    @conduit.Event() get answers() { return this._answers$; }
    @conduit.Event() get streamRemoved() { return this._streamRemoved$; }

    get connectionState() { return this._connectionState; }
    get rtcConnection() { return this._rtcConnection; }
    get remoteStreamAdded() { return this._remoteStreamAdded$; }
    get remoteStreamsChanged() { return this._remoteStreamsChanged$; }
    get remoteStreams() { return this._remoteStreams; }
    get isClosed() { return this._isClosed; }
    get closed() { return this._closed$; }

    fireLinkEstablished!: () => void;
    linkEstablished = new Promise<void>(resolve => this.fireLinkEstablished = resolve);

    @conduit.Method()
    async setRemotePeer(peer: conduit.Proxied<WDIPeer>) {
        if (this._remotePeer)
            throw new Error(`Can only call setRemotePeer() once [this method is called for you]`);

        let pendingIceCandidates: RTCIceCandidate[] = [];

        this._remotePeer = peer;
        this._remotePeer.iceCandidates.subscribe(async candidate => {
            try {
                if (!this.rtcConnection.remoteDescription) {
                    console.log(`[WDI] Saving ICE candidate as pending (no remote description yet)`);
                    pendingIceCandidates.push(candidate);
                } else {
                    console.log(`[WDI] Applying ICE candidate...`);
                    await this.rtcConnection.addIceCandidate(candidate)
                }
            } catch (e: any) {
                console.error(`Failed to add ice candidate ${JSON.stringify(candidate)}: ${e.stack || e}`);
            }
        });
        this._remotePeer.offers.subscribe(async offer => {
            console.log(`[WDI] Received offer, applying remote description...`);
            await this.rtcConnection.setRemoteDescription(offer);
            let answer = await this.rtcConnection.createAnswer();
            this.rtcConnection.setLocalDescription(answer);
            console.log(`[WDI] Sending answer...`);
            this._answers.next(answer);

            if (pendingIceCandidates.length > 0)
                console.log(`[WDI] Flushing ${pendingIceCandidates.length} pending ICE candidates...`);
            while (pendingIceCandidates.length > 0)
                await this.rtcConnection.addIceCandidate(pendingIceCandidates.pop());
        });
        this._remotePeer.answers.subscribe(async answer => {
            console.log(`[WDI] Received answer, applying remote description.`);
            await this.rtcConnection.setRemoteDescription(answer);
            if (pendingIceCandidates.length > 0)
                console.log(`[WDI] Flushing ${pendingIceCandidates.length} pending ICE candidates...`);
            while (pendingIceCandidates.length > 0)
                await this.rtcConnection.addIceCandidate(pendingIceCandidates.pop());
        });

        for (let addedStream of this._streams) {
            console.log(`[WDI] Identifying previously added streams for peer`);
            await this._remotePeer.identifyStream(addedStream.stream.id, addedStream.identity);
        }
    }

    @conduit.Method()
    async identifyStream(streamId: string, identity: StreamIdentity) {
        console.log(`[WDI] Remote has announced stream ${streamId} with identity:`);
        console.dir(identity);

        this._streamIdentities.set(streamId, identity);
    }

    private async onNegotiationNeeded() {
        try {
            console.log(`[WDI] Negotiation needed...`);
            await this.linkEstablished;

            console.log(`[WDI] Creating offer...`);
            let sdp = await this.rtcConnection.createOffer();
            console.log(`[WDI] Setting local description...`);
            await this.rtcConnection.setLocalDescription(sdp);
            console.log(`[WDI] Sending offer...`);
            this._offers.next(sdp);
        } catch (e: any) {
            console.error(`Failed to begin negotation: ${e.stack || e}`);
        }
    }

    private onConnectionStateChange() {
        if (this._connectionState === this._rtcConnection.connectionState)
            return;

        console.log(`[WDI] RTC connection state changed: ${this._rtcConnection.connectionState}`);
        this._connectionState = this._rtcConnection.connectionState;

        if (this._connectionState === 'failed') {
            console.log(`[WDI] RTC Connection entered failed state.`);
            this.onClose();
        }
    }

    private async onIceCandidateError(errorCode: number, errorText: string) {
        if (errorCode !== 701) {
            console.log(`[WDI] Received ICE candidate error code=${errorCode}, text=${errorText}`);
            console.error(`[WDI] Received ICE candidate error code=${errorCode}, text=${errorText}`);
        }
    }

    private onTrack(track: MediaStreamTrack, streams: MediaStream[]) {
        console.log(`[WDI] Receiving ${track.kind} track ${track.id}`);
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

        if (this._remotePeer) {
            console.log(`[WDI] Announcing stream to peer: ${addedStream.stream.id}`);
            await this._remotePeer.identifyStream(addedStream.stream.id, addedStream.identity);
        }
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
     *
     * TODO: This can't work, right?
     */
    @conduit.Method()
    async acquireStream(identity : StreamIdentity): Promise<MediaStream> {
        throw new Error(`No provider for stream with identity '${JSON.stringify(identity)}'`);
    }
}
