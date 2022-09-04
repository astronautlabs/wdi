export interface StreamIdentity extends Record<string,any> {
    url? : string;
    acquisitionId? : string;
}

export interface AddedTrack {
    track : MediaStreamTrack;
    sender : RTCRtpSender;
}

export interface AddedStream {
    stream : MediaStream;
    identity : StreamIdentity;
    tracks : AddedTrack[];
}

export interface StreamResolver {
    (identity : StreamIdentity) : Promise<MediaStream>; 
}
