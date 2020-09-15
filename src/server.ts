import { StreamResolver, StreamIdentity, IdentifiedStream } from './interface';
import { Observable, Subject } from 'rxjs';
import { WDISession } from './session';

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

    private _remoteStreamAdded = new Subject<IdentifiedStream>();
    private _remoteStreamsChanged = new Subject<IdentifiedStream[]>();
    private _remoteStreams = new Set<IdentifiedStream>();
    get remoteStreamAdded(): Observable<IdentifiedStream> { return this._remoteStreamAdded; }
    get remoteStreamsChanged(): Observable<IdentifiedStream[]> { return this._remoteStreamsChanged; }
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

    provideStream(identity : StreamIdentity) {
        for (let resolver of this.streamResolvers) {
            let stream = resolver(identity);
            if (stream)
                return stream;
        }

        throw new Error(`No provider for stream with identity '${JSON.stringify(identity)}'`);
    }

    accept(socket : WebSocket) {
        let session = new WDISession();
        session.setSocket(socket);

        session.addStreamResolver(async identity => await this.provideStream(identity));            
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