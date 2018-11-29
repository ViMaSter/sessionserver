"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const SessionServer_1 = require("./SessionServer");
class PingPong {
    constructor(client, ping, pong, isMatch) {
        this.resolveMethod = () => { };
        this.rejectMethod = () => { };
        this.client = client;
        this.sentMessage = ping;
        this.expectedResponse = pong;
        this.isMatch = isMatch;
    }
    Execute() {
        return new Promise(((resolve, reject) => {
            this.client.addEventListener("message", this.handleMessage.call(this, resolve, reject));
            this.client.addEventListener("close", this.handleClose.call(this, resolve, reject));
            this.client.send(this.sentMessage);
        }).bind(this));
    }
    handleMessage(resolve, reject) {
        this.resolveMethod = (message) => {
            this.client.removeEventListener("message", this.resolveMethod);
            if (this.isMatch) {
                expect(message.data).toMatch(this.expectedResponse);
            }
            else {
                expect(message.data).not.toMatch(this.expectedResponse);
            }
            resolve(message.data.match(this.expectedResponse));
        };
        return this.resolveMethod;
    }
    handleClose(resolve, reject) {
        this.rejectMethod = () => {
            this.client.removeEventListener("close", this.rejectMethod);
            reject();
        };
        return this.rejectMethod;
    }
}
describe('SessionServer multi user session', () => {
    const secureConnection = false;
    const hostname = "localhost";
    const port = 7000;
    let server;
    let client;
    let client2;
    let clientMessageStack = [];
    let client2MessageStack = [];
    let sessionID = -1;
    let playerID = -1;
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        // create a server
        server = yield SessionServer_1.SessionServer.Create(port);
        // create two client
        client = new WebSocket(`${secureConnection ? "wss" : "ws"}://${hostname}:${port}/`);
        // create listeners and wait for success
        yield expect(new Promise((resolve, reject) => {
            client.addEventListener("open", () => {
                client.addEventListener("message", (message) => {
                    console.error("new message for client");
                    console.log(message.data);
                    clientMessageStack.push(message.data);
                }, { capture: false });
                resolve();
            });
            client.addEventListener("close", () => {
                reject();
            });
        })).resolves.toBeUndefined();
        client2 = new WebSocket(`${secureConnection ? "wss" : "ws"}://${hostname}:${port}/`);
        yield expect(new Promise((resolve, reject) => {
            client2.addEventListener("open", () => {
                client2.addEventListener("message", (message) => {
                    console.error("new message for client2");
                    console.log(message.data);
                    client2MessageStack.push(message.data);
                }, { capture: false });
                resolve();
            });
            client2.addEventListener("close", () => {
                reject();
            });
        })).resolves.toBeUndefined();
    }));
    test('createSession()[1] + joinSession(/DERIVED/)[2] + leaveSession()[1] + leaveSession()[2]', () => __awaiter(this, void 0, void 0, function* () {
        // create session and retrieve IDs
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        // join session and retrieve ID
        const joinSessionRequest2 = yield new PingPong(client2, '{"command":"joinSession","sessionID": ' + newSessionID + '}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID2 = parseInt(joinSessionRequest2[1]);
        const newPlayerID2 = parseInt(joinSessionRequest2[2]);
        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayerJoinMessage = clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch('{"command":"playerJoin","error":0,"playerID":' + newPlayerID2 + ',"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}');
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayer2LeaveMessage = client2MessageStack.pop();
        expect(remotePlayer2LeaveMessage).toMatch('{"command":"playerLeave","error":0,"playerID":' + newPlayerID + '}');
        // leave session and verify ID
        const leaveSessionRequest2 = yield new PingPong(client2, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
    }));
    test('createSession()[1] + joinSession(-1)[2] + leaveSession()[1] + leaveSession()[2]', () => __awaiter(this, void 0, void 0, function* () {
        // create session and retrieve IDs
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        // join session and retrieve ID
        const joinSessionRequest2 = yield new PingPong(client2, '{"command":"joinSession","sessionID": -1}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID2 = parseInt(joinSessionRequest2[1]);
        const newPlayerID2 = parseInt(joinSessionRequest2[2]);
        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayerJoinMessage = clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch('{"command":"playerJoin","error":0,"playerID":' + newPlayerID2 + ',"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}');
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayer2LeaveMessage = client2MessageStack.pop();
        expect(remotePlayer2LeaveMessage).toMatch('{"command":"playerLeave","error":0,"playerID":' + newPlayerID + '}');
        // leave session and verify ID
        const leaveSessionRequest2 = yield new PingPong(client2, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
    }));
    test('createSession()[1] + joinSession(-1)[2] + updatePlayer()[1] + gracefull leave on both', () => __awaiter(this, void 0, void 0, function* () {
        // create session and retrieve IDs
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        // join session and retrieve ID
        const joinSessionRequest2 = yield new PingPong(client2, '{"command":"joinSession","sessionID": -1}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID2 = parseInt(joinSessionRequest2[1]);
        const newPlayerID2 = parseInt(joinSessionRequest2[2]);
        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayerJoinMessage = clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch('{"command":"playerJoin","error":0,"playerID":' + newPlayerID2 + ',"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}');
        // update own player data and check replication to other clients
        const updatePlayerRequest = yield new PingPong(client, '{"command": "updatePlayer", "player": {"name":"DontLookNow", "position":{"x":14.0, "y":-27.123}, "colorHex":16740352 }}', /{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"DontLookNow","position":{"x":14,"y":-27.123},"colorHex":16740352}}/, true).Execute();
        const updatedPlayerID = parseInt(updatePlayerRequest[1]);
        expect(updatedPlayerID).toBe(newPlayerID);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayer2UpdateMessage = client2MessageStack.pop();
        expect(remotePlayer2UpdateMessage).toMatch('{"command":"playerUpdate","error":0,"playerID":' + newPlayerID + ',"player":{"name":"DontLookNow","position":{"x":14,"y":-27.123},"colorHex":16740352}}');
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        // leave session and verify ID
        const leaveSessionRequest2 = yield new PingPong(client2, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
    }));
    test('createSession()[1] + joinSession(-1)[2] + updateSession()[2] + gracefull leave on both', () => __awaiter(this, void 0, void 0, function* () {
        // create session and retrieve IDs
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        // join session and retrieve ID
        const joinSessionRequest2 = yield new PingPong(client2, '{"command":"joinSession","sessionID": -1}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID2 = parseInt(joinSessionRequest2[1]);
        const newPlayerID2 = parseInt(joinSessionRequest2[2]);
        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayerJoinMessage = clientMessageStack.pop();
        expect(remotePlayerJoinMessage).toMatch('{"command":"playerJoin","error":0,"playerID":' + newPlayerID2 + ',"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}');
        // update session data and check replication to other clients
        const updateSessionRequest = yield new PingPong(client, '{"command":"updateSession", "session": {"mapName":"desert", "timelimit":6000, "currentMatchStart":1543237287000}, "player": {"name":"New Player", "position":{"x":-20, "y":-20, "z":40}, "colorName":"red"}}', /{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"NewPlayer","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}/, true).Execute();
        const updatedSessionID = parseInt(updateSessionRequest[1]);
        expect(updatedSessionID).toBe(newPlayerID);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const remotePlayer2UpdateMessage = client2MessageStack.pop();
        expect(remotePlayer2UpdateMessage).toMatch('{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"NewPlayer","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}');
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        // leave session and verify ID
        const leaveSessionRequest2 = yield new PingPong(client2, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
    }));
    test('createSession()[1] + joinSession(-1)[2] + updateSession()[2] + gracefull leave on both', () => __awaiter(this, void 0, void 0, function* () {
        // create session and retrieve IDs
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        // update own player data and check replication to other clients
        const updateSessionRequest = yield new PingPong(client, '{"command":"updateSession", "session": {"mapName":"desert", "timelimit":6000, "currentMatchStart":1543237287000}, "player": {"name":"New Player", "position":{"x":-20, "y":-20, "z":40}, "colorName":"red"}}', /{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"NewPlayer","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}/, true).Execute();
        const updatedSessionID = parseInt(updateSessionRequest[1]);
        expect(updatedSessionID).toBe(newPlayerID);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        // join session, retrieve ID and check for updated session + player data
        const joinSessionRequest2 = yield new PingPong(client2, '{"command":"joinSession","sessionID": -1}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"desert","timelimit":6000,"currentMatchStart":1543237287000},"player":{"name":"NewPlayer","position":{"x":-20,"y":-20,"z":40},"colorName":"red"}}/, true).Execute();
        const newSessionID2 = parseInt(joinSessionRequest2[1]);
        const newPlayerID2 = parseInt(joinSessionRequest2[2]);
        expect(newSessionID2).toBe(newSessionID);
        expect(newPlayerID2).toBe(newPlayerID + 1);
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        // halt execution so all message-event-handlers could handle new messages
        yield new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, 10); });
        // leave session and verify ID
        const leaveSessionRequest2 = yield new PingPong(client2, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
    }));
    afterAll(() => {
        client.close();
        client2.close();
        server.Shutdown();
    });
});
//# sourceMappingURL=SessionServer.multiuser.test.js.map