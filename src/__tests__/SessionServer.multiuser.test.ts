// testing helper
import {PingPong} from './PingPong.testutil';

// testee
import {SessionServer} from '../SessionServer'; // tslint:disable-line: no-relative-imports

describe('SessionServer multi user session', () => {

    const secureConnection : boolean = false;
    const hostname : string = 'localhost';
    const port : number = 7001;

    let server : SessionServer;
    let client : WebSocket;
    let client2 : WebSocket;
    let clientMessageStack : RegExpMatchArray;
    let client2MessageStack : RegExpMatchArray;

    const sessionID : number = -1;
    const playerID : number = -1;

    beforeAll(async () => {
        // create a server
        server = await SessionServer.Create(port);
    });

    beforeEach(async () => {
        // create two clients
        client = new WebSocket(`${secureConnection ? 'wss' : 'ws'}://${hostname}:${port}/`);

        // create listeners and wait for success
        await expect(new Promise((resolve : (() => void), reject : (() => void)) : void => {
            client.addEventListener('open', () => {
                client.addEventListener(
                    'message',
                    (message : MessageEvent) => {
                        console.error('new message for client');
                        console.log(message.data);
                        clientMessageStack.push(<string>message.data);
                    },
                    {
                        capture: false
                    }
                );
                resolve();
            });
            client.addEventListener('close', () => {
                reject();
            });
        })).resolves.toBeUndefined();

        client2 = new WebSocket(`${secureConnection ? 'wss' : 'ws'}://${hostname}:${port}/`);
        await expect(new Promise((resolve : (() => void), reject : (() => void)) : void => {
            client2.addEventListener('open', () => {
                client2.addEventListener(
                    'message',
                    (message : MessageEvent) => {
                        console.error('new message for client2');
                        console.log(message.data);
                        client2MessageStack.push(<string>message.data);
                    },
                    {
                        capture: false
                    }
                );
                resolve();
            });
            client2.addEventListener('close', () => {
                reject();
            });
        })).resolves.toBeUndefined();

        // clear message stacks
        clientMessageStack = [];
        client2MessageStack = [];
    });

    afterEach(async () => {
        client.close();
        client2.close();
    });

    afterAll(async () => {
        await server.Shutdown();
    });

    test('createSession()[1] + joinSession(/DERIVED/)[2] + leaveSession()[1] + leaveSession()[2]', async () => {
        // create session and retrieve IDs
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);

        // join session and retrieve ID
        const joinSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            `{"command":"joinSession","sessionID": ${newSessionID}}`,
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID2 : number = parseInt(joinSessionRequest2[1], 10);
        const newPlayerID2 : number = parseInt(joinSessionRequest2[2], 10);

        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);

        const remotePlayerJoinMessage : string = <string>clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch(`{"command":"playerJoin","error":0,"playerID":${newPlayerID2},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}`);

        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        const remotePlayer2LeaveMessage : string = <string>client2MessageStack.pop();
        expect(remotePlayer2LeaveMessage).toMatch(`{"command":"playerLeave","error":0,"playerID":${newPlayerID}}`);

        // leave session and verify ID
        const leaveSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();
    });

    test('createSession()[1] + joinSession(-1)[2] + leaveSession()[1] + leaveSession()[2]', async () => {
        // create session and retrieve IDs
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);

        // join session and retrieve ID
        const joinSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command":"joinSession","sessionID": -1}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID2 : number = parseInt(joinSessionRequest2[1], 10);
        const newPlayerID2 : number = parseInt(joinSessionRequest2[2], 10);

        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);

        const remotePlayerJoinMessage : string = <string>clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch(`{"command":"playerJoin","error":0,"playerID":${newPlayerID2},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}`);

        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        const remotePlayer2LeaveMessage : string = <string>client2MessageStack.pop();
        expect(remotePlayer2LeaveMessage).toMatch(`{"command":"playerLeave","error":0,"playerID":${newPlayerID}}`);

        // leave session and verify ID
        const leaveSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();
    });

    test('createSession()[1] + joinSession(-1)[2] + updatePlayer()[1] + gracefull leave on both', async () => {
        // create session and retrieve IDs
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);

        // join session and retrieve ID
        const joinSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command":"joinSession","sessionID": -1}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID2 : number = parseInt(joinSessionRequest2[1], 10);
        const newPlayerID2 : number = parseInt(joinSessionRequest2[2], 10);

        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);

        const remotePlayerJoinMessage : string = <string>clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch(`{"command":"playerJoin","error":0,"playerID":${newPlayerID2},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}`);

        // update own player data and check replication to other clients
        const updatePlayerRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "updatePlayer", "player": {"name":"DontLookNow", "position":{"x":14.0, "y":-27.123}, "colorHex":16740352 }}',
            /{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"DontLookNow","position":{"x":14,"y":-27.123},"colorHex":16740352}}/,
            true
        ).Execute();
        const updatedPlayerID : number = parseInt(updatePlayerRequest[1], 10);
        expect(updatedPlayerID).toBe(newPlayerID);

        const remotePlayer2UpdateMessage : string = <string>client2MessageStack.pop();
        expect(remotePlayer2UpdateMessage).toMatch(`{"command":"playerUpdate","error":0,"playerID":${newPlayerID},"player":{"name":"DontLookNow","position":{"x":14,"y":-27.123},"colorHex":16740352}}`);

        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        // leave session and verify ID
        const leaveSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();
    });

    test('createSession()[1] + joinSession(-1)[2] + updateSession()[2] + gracefull leave on both', async () => {
        // create session and retrieve IDs
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);

        // join session and retrieve ID
        const joinSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command":"joinSession","sessionID": -1}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID2 : number = parseInt(joinSessionRequest2[1], 10);
        const newPlayerID2 : number = parseInt(joinSessionRequest2[2], 10);

        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);

        const remotePlayerJoinMessage : string = <string>clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch(`{"command":"playerJoin","error":0,"playerID":${newPlayerID2},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}`);

        // update session data and check replication to other clients
        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updateSession", "session": {"mapName":"desert", "timelimit":6000, "currentMatchStart":1543237287000}, "player": {"name":"New Player", "position":{"x":-20, "y":-20, "z":40}, "colorName":"red"}}',
            /{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}/,
            true
        ).Execute();

        const remotePlayer2UpdateMessage : string = <string>client2MessageStack.pop();
        expect(remotePlayer2UpdateMessage).toMatch('{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}');

        // leave session and verify ID
        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        // leave session and verify ID
        const leaveSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();
    });

    test('createSession()[1] + updateSession()[1] + joinSession(-1)[2] + gracefull leave on both', async () => {
        // create session and retrieve IDs
        const createSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/,
            true
        ).Execute();
        const newSessionID : number = parseInt(createSessionRequest[1], 10);
        const newPlayerID : number = parseInt(createSessionRequest[2], 10);

        // update own player data and check replication to other clients
        const updateSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command":"updateSession", "session": {"mapName":"desert", "timelimit":6000, "currentMatchStart":1543237287000}, "player": {"name":"New Player", "position":{"x":-20, "y":-20, "z":40}, "colorName":"red"}}',
            /{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}/,
            true
        ).Execute();

        // join session, retrieve ID and check for updated session + player data
        const joinSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command":"joinSession","sessionID": -1}',
            /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}/,
            true
        ).Execute();
        const newSessionID2 : number = parseInt(joinSessionRequest2[1], 10);
        const newPlayerID2 : number = parseInt(joinSessionRequest2[2], 10);

        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);

        // ensure session is different from it's creation
        const sessionJoinMessage : string = <string>joinSessionRequest2.pop();
        expect(sessionJoinMessage).not.toMatch(`{"command":"sessionJoin","error":0,"sessionID":${newSessionID2},"playerID":${newPlayerID2},"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}`);

        const remotePlayerJoinMessage : string = <string>clientMessageStack.pop();
        expect(remotePlayerJoinMessage).not.toMatch(`{"command":"playerJoin","error":0,"playerID":${newPlayerID2},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}`);
        expect(remotePlayerJoinMessage).toMatch(`{"command":"playerJoin","error":0,"playerID":${newPlayerID2},"player":{"name":"New Player","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}`);

        const leaveSessionRequest : RegExpMatchArray = await new PingPong(
            client,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();

        // leave session and verify ID
        const leaveSessionRequest2 : RegExpMatchArray = await new PingPong(
            client2,
            '{"command": "leaveSession" }',
            /{"command":"sessionLeave","error":0}/,
            true
        ).Execute();
    });
});
