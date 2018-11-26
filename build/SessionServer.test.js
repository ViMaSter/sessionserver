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
        this.websocketClient = client;
        this.sentMessage = ping;
        this.expectedResponse = pong;
        this.isMatch = isMatch;
    }
    Execute() {
        return new Promise(((resolve, reject) => {
            this.websocketClient.addEventListener("message", this.handleMessage.call(this, resolve, reject));
            this.websocketClient.addEventListener("close", this.handleClose.call(this, resolve, reject));
            this.websocketClient.send(this.sentMessage);
        }).bind(this));
    }
    handleMessage(resolve, reject) {
        this.resolveMethod = (message) => {
            this.websocketClient.removeEventListener("message", this.resolveMethod);
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
            this.websocketClient.removeEventListener("close", this.rejectMethod);
            reject();
        };
        return this.rejectMethod;
    }
}
class GameData {
    constructor(parameters) {
        this.playerPositionX = -1;
        this.playerPositionY = -1;
        if (typeof parameters.playerPositionX == "number") {
            this.playerPositionX = parameters.playerPositionX;
        }
        if (typeof parameters.playerPositionY == "number") {
            this.playerPositionY = parameters.playerPositionY;
        }
    }
    Update(parameters) {
        if (typeof parameters.playerPositionX == "number") {
            this.playerPositionX = parameters.playerPositionX;
        }
        if (typeof parameters.playerPositionY == "number") {
            this.playerPositionY = parameters.playerPositionY;
        }
    }
}
;
describe('SessionServer example session', () => {
    const correctPort = 7000;
    let server;
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        server = yield SessionServer_1.SessionServer.Create(GameData, correctPort);
    }));
    afterAll(() => {
        server.Shutdown();
    });
    test('correct raw message ping-pong', () => __awaiter(this, void 0, void 0, function* () {
        const websocketClient = new WebSocket(`ws://localhost:${correctPort}/`);
        yield new Promise((resolve, reject) => {
            websocketClient.addEventListener("open", () => __awaiter(this, void 0, void 0, function* () {
                // create session and retrieve ID
                const createSessionRequest = yield new PingPong(websocketClient, '{"command":"createSession","parameters": {"playerPositionX":20,"playerPositionY":20}}', /{"command":"sessionJoin","sessionID":(\d+),"session":{"playerPositionX":20,"playerPositionY":20}}/, true).Execute();
                const createSessionID = parseInt(createSessionRequest[1]);
                expect(createSessionID).toBeGreaterThan(-1);
                // update a piece and expect session update
                const updateSessionRequest = yield new PingPong(websocketClient, '{"command": "updateSession", "sessionID": ' + createSessionID + ', "parameters": {"playerPositionX":30,"playerPositionY":30} }', /{"command":"sessionUpdate","sessionID":(\d+),"session":{"playerPositionX":30,"playerPositionY":30}}/, true).Execute();
                // leave session
                yield new PingPong(websocketClient, '{"command": "leaveSession", "sessionID": ' + createSessionID + ' }', new RegExp('{"command":"sessionLeave","sessionID":' + createSessionID + '}'), true).Execute();
                resolve();
            }));
            websocketClient.addEventListener("close", () => __awaiter(this, void 0, void 0, function* () {
                reject();
            }));
        });
        websocketClient.close();
    }));
});
//# sourceMappingURL=SessionServer.test.js.map