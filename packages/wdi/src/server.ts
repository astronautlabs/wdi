import { StreamResolver, StreamIdentity } from './interface';
import { Observable, Subject } from 'rxjs';
import { WDISession } from './session';
import { RemoteStream } from './remote-stream';

/**
 * Class implementing a multiplexed WDI server logic. To use, create a new WebSocket server
 * and call accept() when new websockets connect. You will also want to add at least one StreamResolver
 * to handle requests to pull media streams, and you'll also want to subscribe to remoteStreamAdded to 
 * get access to incoming media streams.
 */
export class WDIServer {
    sessions: WDISession[] = [];
    sessionsById = new Map<string, WDISession>();
    streamResolvers : StreamResolver[] = [];

    private _remoteStreamAdded = new Subject<RemoteStream>();
    private _remoteStreamsChanged = new Subject<RemoteStream[]>();
    private _remoteStreams = new Set<RemoteStream>();
    get remoteStreamAdded(): Observable<RemoteStream> { return this._remoteStreamAdded; }
    get remoteStreamsChanged(): Observable<RemoteStream[]> { return this._remoteStreamsChanged; }
    get remoteStreams() { return this._remoteStreams; }
    
    getSession(id: string) {
        return this.sessionsById.get(id);
    }

    onDisconnect(session: WDISession) {
        let index = this.sessions.indexOf(session);
        this.sessions.splice(index, 1);
    }

    addStreamResolver(resolver : StreamResolver) {
        this.streamResolvers.push(resolver);
    }

    provideStream(identity : StreamIdentity, session : WDISession) {
        for (let resolver of this.streamResolvers) {
            let stream = resolver(identity);
            if (stream)
                return stream;
        }

        console.error(`[Server] Available resolvers:`);
        console.dir(this.streamResolvers);
        throw new Error(`No provider for stream with identity '${JSON.stringify(identity)}'`);
    }

    async accept(socket : WebSocket) {
        let session = new WDISession();
        await session.setSocket(socket);

        session.addStreamResolver(async identity => await this.provideStream(identity, session));
        session.socket.addEventListener('close', () => this.onDisconnect(session));
        session.socket.addEventListener('error', () => console.error(`[WDI/WS] Connection closed due to error`));

        this.sessions.push(session);
        this.sessionsById.set(session.id, session);

        session.remoteStreamAdded.subscribe(identifiedStream => {
            this._remoteStreams.add(identifiedStream);
            this._remoteStreamAdded.next(identifiedStream);
            this._remoteStreamsChanged.next(Array.from(this._remoteStreams));
        });
    }
}