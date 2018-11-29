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
describe('SessionServer single user session', () => {
    const secureConnection = false;
    const hostname = "localhost";
    const port = 7000;
    let server;
    let client;
    let sessionID = -1;
    let playerID = -1;
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        // create a server
        server = yield SessionServer_1.SessionServer.Create(port);
        // create a client
        client = new WebSocket(`${secureConnection ? "wss" : "ws"}://${hostname}:${port}/`);
        // create listeners and wait for success
        yield expect(new Promise((resolve, reject) => {
            client.addEventListener("open", () => __awaiter(this, void 0, void 0, function* () {
                // create session and retrieve ID
                const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
                sessionID = parseInt(createSessionRequest[1]);
                playerID = parseInt(createSessionRequest[2]);
                expect(sessionID).toBeGreaterThan(-1);
                expect(playerID).toBeGreaterThan(-1);
                resolve();
            }));
            client.addEventListener("close", () => __awaiter(this, void 0, void 0, function* () {
                reject();
            }));
        })).resolves.toBeUndefined();
    }));
    afterAll(() => {
        client.close();
        server.Shutdown();
    });
    test('leaveSession + createSession (same parameters)', () => __awaiter(this, void 0, void 0, function* () {
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        // create session and retrieve ID
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);
        sessionID = newSessionID;
        playerID = newPlayerID;
    }));
    test('leaveSession + updateSession (fails) + createSession (same parameters)', () => __awaiter(this, void 0, void 0, function* () {
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        const updateSessionRequest = yield new PingPong(client, '{"command":"updateSession","session": {"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player": {"name":"New Player","position":{"x":-20, "y":-20},"colorHex":16673386}}', /{"command":"sessionUpdate","error":2}/, true).Execute();
        // create session and retrieve ID
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);
        sessionID = newSessionID;
        playerID = newPlayerID;
    }));
    test('leaveSession + updatePlayer (fails) + createSession (same parameters)', () => __awaiter(this, void 0, void 0, function* () {
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        const updateSessionRequest = yield new PingPong(client, '{"command":"updatePlayer", "player": {"name":"NotIntentional", "position":{"x":3.23, "y":1.00}, "colorHex":1942370}}', /{"command":"playerUpdate","error":2}/, true).Execute();
        // create session and retrieve ID
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);
        sessionID = newSessionID;
        playerID = newPlayerID;
    }));
    test('leaveSession + leaveSession (fails) + createSession (same parameters)', () => __awaiter(this, void 0, void 0, function* () {
        // leave session and verify ID
        const leaveSessionRequest = yield new PingPong(client, '{"command": "leaveSession" }', /{"command":"sessionLeave","error":0}/, true).Execute();
        const updateSessionRequest = yield new PingPong(client, '{"command":"leaveSession" }', /{"command":"sessionLeave","error":2}/, true).Execute();
        // create session and retrieve ID
        const createSessionRequest = yield new PingPong(client, '{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}', /{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/, true).Execute();
        const newSessionID = parseInt(createSessionRequest[1]);
        const newPlayerID = parseInt(createSessionRequest[2]);
        expect(newSessionID).not.toBe(sessionID);
        expect(newPlayerID).toBe(playerID);
        sessionID = newSessionID;
        playerID = newPlayerID;
    }));
    test('updateSession', () => __awaiter(this, void 0, void 0, function* () {
        const updateSessionRequest = yield new PingPong(client, '{"command":"updateSession","session": {"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player": {"name":"New Player","position":{"x":-20, "y":-20},"colorHex":16673386}}', /{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20},"colorHex":16673386}}/, true).Execute();
    }));
    test('updatePlayer', () => __awaiter(this, void 0, void 0, function* () {
        const updateSessionRequest = yield new PingPong(client, '{"command":"updatePlayer", "player": {"name":"DontLookNow", "position":{"x":14, "y":27}, "colorHex":16740352}}', /{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"DontLookNow","position":{"x":14,"y":27},"colorHex":16740352}}/, true).Execute();
        const newPlayerID = parseInt(updateSessionRequest[1]);
        expect(newPlayerID).toBe(playerID);
        const updateSessionRequest2 = yield new PingPong(client, '{"command":"updatePlayer", "player": {"name":"NotIntentional", "position":{"x":3.23, "y":1.000000000001}, "colorHex":1942370}}', /{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"NotIntentional","position":{"x":3.23,"y":1.000000000001},"colorHex":1942370}}/, true).Execute();
        const newPlayerID2 = parseInt(updateSessionRequest[1]);
        expect(newPlayerID2).toBe(playerID);
        expect(newPlayerID2).toBe(newPlayerID);
    }));
});
//# sourceMappingURL=SessionServer.test.js.map