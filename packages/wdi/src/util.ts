
export function timeout(time : number) {
    return new Promise<void>(r => setTimeout(() => r(), time));
}