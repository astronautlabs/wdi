import { Proxied, RPCProxy } from "@astronautlabs/webrpc";

export function timeout(time : number) {
    return new Promise<void>(r => setTimeout(() => r(), time));
}

export function markProxied<T>(value: T | Proxied<T>): Proxied<T> {
    return <Proxied<T>> <unknown> value;
}