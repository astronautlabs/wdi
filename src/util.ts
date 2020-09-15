
export function timeout(time : number) {
    return new Promise(r => setTimeout(() => r(), time));
}