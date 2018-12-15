import {SessionServer} from './SessionServer';

type resolveCallback = (regexMatches : RegExpMatchArray) => void;
type rejectCallback = () => void;
type resolveHandler = (message : MessageEvent) => void;
type rejectHandler = () => void;
class PingPong {
    private readonly sentMessage : string;
    private readonly expectedResponse : RegExp;
    private readonly client : WebSocket;
    private readonly isMatch : boolean;
    private resolveMethod : resolveHandler;
    private rejectMethod : rejectHandler;

    public constructor(client : WebSocket, ping : string, pong : RegExp, isMatch : boolean) {
        this.client = client;
        this.sentMessage = ping;
        this.expectedResponse = pong;
        this.isMatch = isMatch;
        this.resolveMethod = (message : MessageEvent) : void => {}; // tslint:disable-line:no-empty
        this.rejectMethod = () : void => {}; // tslint:disable-line:no-empty
    }

    public async Execute() : Promise<RegExpMatchArray> {
        return new Promise<RegExpMatchArray>((resolve : resolveCallback, reject : rejectCallback) : void => {
            this.client.addEventListener('message', this.handleMessage(resolve, reject));
            this.client.addEventListener('close', this.handleClose(resolve, reject));
            this.client.send(this.sentMessage);
        });
    }
    private handleMessage(resolve : resolveCallback, reject : rejectCallback) : resolveHandler {
        this.resolveMethod = (message : MessageEvent) : void => {
            this.client.removeEventListener('message', this.resolveMethod);
            if (this.isMatch) {
                expect(message.data).toMatch(this.expectedResponse);
            } else {
                expect(message.data).not.toMatch(this.expectedResponse);
            }

            resolve(<RegExpMatchArray>(<string>message.data).match(this.expectedResponse));
        };

        return this.resolveMethod;
    }
    private handleClose(resolve : resolveCallback, reject : rejectCallback) : rejectHandler {
        this.rejectMethod = () : void => {
            this.client.removeEventListener('close', this.rejectMethod);
            reject();
        };

        return this.rejectMethod;
    }
}

describe('SessionServer single user session', () => {

    const secureConnection : boolean = false;
    const hostname : string = 'localhost';
    const port : number = 7000;

    let server : SessionServer;
    let client : WebSocket;

    let sessionID : number = -1;
    let playerID : number = -1;

    beforeAll(async () => {
        // create a server
        server = await SessionServer.Create(port);
    });

    beforeEach(async () => {
        // create a client
        client = new WebSocket(`${secureConnection ? 'wss' : 'ws'}://${hostname}:${port}/`);

        // create listeners and wait for success
        await expect(new Promise<void>((resolve : (() => void), reject : (() => void)) : void => {
            client.addEventListener('open', async () => {
                // create session and retrieve ID
                const createSessionRequest : RegExpMatchArray = await new PingPong(
                    client,
                    '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}',
                    /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
                    true
                ).Execute();
                sessionID = parseInt(createSessionRequest[1], 10);
                playerID = parseInt(createSessionRequest[2], 10);
                expect(sessionID).toBeGreaterThan(-1);
                expect(playerID).toBeGreaterThan(-1);
                resolve();
            });
            client.addEventListener('close', async () => {
                reject();
            });
        })).resolves.toBeUndefined();
    });

    afterEach(async () => {
        client.close();
    });

    afterAll(async () => {
        await server.Shutdown();
    });

    test('leaveSession + createSession (same parameters)', async () => {
        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        // create session and retrieve ID
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);

        sessionID = newSessionID;
        playerID = newPlayerID;
    });

    test('leaveSession + updateSession (fails) + createSession (same parameters)', async () => {
        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updateSession","session": {"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player": {"name":"New Player","position":{"x":-20, "y":-20},"colorHex":16673386}}',
            /{"command":"sessionUpdate","error":2}/,
            true
        ).Execute();

        // create session and retrieve ID
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);

        sessionID = newSessionID;
        playerID = newPlayerID;
    });

    test('leaveSession + updatePlayer (fails) + createSession (same parameters)', async () => {
        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updatePlayer", "player": {"name":"NotIntentional", "position":{"x":3.23, "y":1.00}, "colorHex":1942370}}',
            /{"command":"playerUpdate","error":2}/,
            true
        ).Execute();

        // create session and retrieve ID
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);

        sessionID = newSessionID;
        playerID = newPlayerID;
    });

    test('leaveSession + leaveSession (fails) + createSession (same parameters)', async () => {
        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"leaveSession" }',
            /{"command":"sessionLeave","error":2}/,
            true
        ).Execute();

        // create session and retrieve ID
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);

        sessionID = newSessionID;
        playerID = newPlayerID;
    });

    test('updateSession', async () => {
        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updateSession","session": {"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player": {"name":"New Player","position":{"x":-20, "y":-20},"colorHex":16673386}}',
            /{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20},"colorHex":16673386}}/,
            true
        ).Execute();
        console.log(1);
    });

    test('updatePlayer', async () => {
        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updatePlayer", "player": {"name":"DontLookNow", "position":{"x":14, "y":27}, "colorHex":16740352}}',
            /{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"DontLookNow","position":{"x":14,"y":27},"colorHex":16740352}}/,
            true
        ).Execute();
        const newPlayerID : number = parseInt(updateSessionRequest[1], 10);
        expect(newPlayerID).toBe(playerID);

        const updateSessionRequest2 : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updatePlayer", "player": {"name":"NotIntentional", "position":{"x":3.23, "y":1.000000000001}, "colorHex":1942370}}',
            /{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"NotIntentional","position":{"x":3.23,"y":1.000000000001},"colorHex":1942370}}/,
            true
        ).Execute();
        const newPlayerID2 : number = parseInt(updateSessionRequest[1], 10);
        expect(newPlayerID2).toBe(playerID);
        expect(newPlayerID2).toBe(newPlayerID);
    });

    test('createSession (fails)', async () => {
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":4}/,
            true
        ).Execute();
    });

    // @TODO: createSession() (when still in session)
});
