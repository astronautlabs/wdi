import { Observable, Subject } from "rxjs";
import { StreamIdentity } from "./interface";
import { WDISession } from "./session";

export class RemoteStream {
    constructor(
        readonly stream : MediaStream,
        readonly identity : StreamIdentity
    ) {
    }

    private _ended = new Subject<void>();
    
    get ended() : Observable<void> { return this._ended; }

    _notifyEnded() {
        this._ended.next();
    }
}
