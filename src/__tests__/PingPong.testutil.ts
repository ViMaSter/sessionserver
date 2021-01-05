type resolveCallback = (regexMatches: RegExpMatchArray) => void;
type rejectCallback = () => void;
type resolveHandler = (message: MessageEvent) => void;
type rejectHandler = () => void;
class PingPong {
    private readonly sentMessage: string;
    private readonly expectedResponse: RegExp;
    private readonly client: WebSocket;
    private readonly isMatch: boolean;
    private resolveMethod: resolveHandler;
    private rejectMethod: rejectHandler;

    public constructor(client: WebSocket, ping: string, pong: RegExp, isMatch: boolean) {
        this.client = client;
        this.sentMessage = ping;
        this.expectedResponse = pong;
        this.isMatch = isMatch;
        this.resolveMethod = (message: MessageEvent): void => { }; // tslint:disable-line:no-empty
        this.rejectMethod = (): void => { }; // tslint:disable-line:no-empty
    }

    public async Execute(): Promise<RegExpMatchArray> {
        return new Promise<RegExpMatchArray>((resolve: resolveCallback, reject: rejectCallback): void => {
            this.client.addEventListener('message', this.handleMessage(resolve, reject));
            this.client.addEventListener('close', this.handleClose(resolve, reject));
            this.client.send(this.sentMessage);
        });
    }
    private handleMessage(resolve: resolveCallback, reject: rejectCallback): resolveHandler {
        this.resolveMethod = (message: MessageEvent): void => {
            this.client.removeEventListener('message', this.resolveMethod);
            if (this.isMatch) {
                expect(message.data).toMatch(this.expectedResponse);
            } else {
                expect(message.data).not.toMatch(this.expectedResponse);
            }
            // halt our thread to first update clientMessageStack + client2MessageStack
            // and then finish execution of the PingPong
            // otherwise this method might be done, without messages being accessable from the queue
            // see: 'new message for client' + 'new message for client2'
            setTimeout(
                () => {
                    resolve(<RegExpMatchArray>(<string>message.data).match(this.expectedResponse));
                },
                0
            );
        };

        return this.resolveMethod;
    }
    private handleClose(resolve: resolveCallback, reject: rejectCallback): rejectHandler {
        this.rejectMethod = (): void => {
            this.client.removeEventListener('close', this.rejectMethod);
            reject();
        };

        return this.rejectMethod;
    }
}

export { PingPong as PingPong };
