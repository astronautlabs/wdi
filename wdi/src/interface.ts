import { Observable, Subject } from "rxjs";
import { WDISession } from "./session";

export interface StreamIdentity extends Record<string,any> {
    url? : string;
    acquisitionId? : string;
}

export interface AddedStream {
    stream : MediaStream;
    identity : StreamIdentity;
}

export interface PendingRequest {
    request : WDIRequest;
    promise? : Promise<any>;
    resolve?(value : any);
    reject?(error : any);
}

export interface WDIMessage {
    type : string;
}

export interface WDIRequest extends WDIMessage {
    $rq? : string;
}

export interface WDIResponse extends WDIMessage {
    $rs : string;
    type : 'result' | 'exception';
    error : any;
    result : any;
}

export interface WDIAcquireStreamRequest extends WDIRequest {
    type : 'acquireStream';
    identity : StreamIdentity;
}

export interface WDIAcquireStreamResult {
    streamId : string;
}

export interface WDIStreamIdentityMessage {
    type: 'identifyStream';
    streamId: string;
    identity: StreamIdentity;
}

export interface RTCEnvelope {
    type : 'candidate' | 'answer' | 'offer';
    candidate? : any;
    answer? : any;
    offer? : any;
}

export interface WDIRTCMessage {
    type : 'webrtc';
    rtcMessage : RTCEnvelope;
}

export interface RequestHandler<T = WDIRequest> {
    (request : T) : Promise<any>;
}

export interface StreamResolver {
    (identity : StreamIdentity) : Promise<MediaStream>; 
}
