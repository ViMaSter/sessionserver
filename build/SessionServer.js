"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
if (Array.prototype.remove) {
    Array.prototype.remove = function (elem) {
        return this.filter(e => e !== elem);
    };
}
class Session {
    constructor(sessionType, ID, sessionCreationArguments) {
        this.connectedPlayerIDs = [];
        this.id = ID;
        this.currentSessionData = new sessionType(sessionCreationArguments);
    }
    get CurrentPlayerCount() { return this.connectedPlayerIDs.length; }
    ;
    HasPlayerInSession(playerID) {
        return this.connectedPlayerIDs.indexOf(playerID) > -1;
    }
    AddPlayerByID(playerID) {
        if (this.HasPlayerInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is already part of session ${this.id} (current players: ${this.connectedPlayerIDs.join(', ')})`);
            return false;
        }
        this.connectedPlayerIDs.push(playerID);
        return true;
    }
    RemovePlayerByID(playerID) {
        if (!this.HasPlayerInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.id} (current players: ${this.connectedPlayerIDs.join(', ')})`);
            return false;
        }
        this.connectedPlayerIDs.splice(this.connectedPlayerIDs.indexOf(playerID), 1);
        return true;
    }
    Update(playerID, sessionUpdateArguments) {
        if (!this.HasPlayerInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.id} and therefore can't update the session (current players: ${this.connectedPlayerIDs.join(', ')})`);
            return false;
        }
        this.currentSessionData.Update(sessionUpdateArguments);
        return true;
    }
    GetData() {
        return this.currentSessionData;
    }
    ForEachPlayer(callback) {
        this.connectedPlayerIDs.forEach(callback);
    }
}
;
const http = __importStar(require("http"));
const ws = __importStar(require("websocket"));
//@ts-ignore
const http_shutdown_1 = __importDefault(require("http-shutdown"));
class SessionServer {
    constructor(sessionType, port) {
        this.commands = {};
        this.nextSessionID = 0;
        this.sessions = {};
        this.nextPlayerID = 0;
        this.player = {};
        this.port = -1;
        this.port = port;
        this.sessionType = sessionType;
        this.httpServer = http_shutdown_1.default(http.createServer(() => { }));
        this.wsServer = new ws.server({ httpServer: this.httpServer });
    }
    validateSessionID(playerID, sessionID, request) {
        if (typeof sessionID != "number") {
            console.error(`[SessionServer] ${request} requires a 'sessionID'-parameter as number! (supplied: ${sessionID} [${typeof sessionID}])`);
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": request,
                "sessionID": -1
            }));
            return false;
        }
        if (!this.sessions[sessionID]) {
            console.error(`[SessionServer] Attemping to run ${request} on session '${sessionID}' will fail, as the session doesn't exist`);
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": request,
                "sessionID": -2
            }));
            return false;
        }
        return true;
    }
    setupCommands() {
        this.commands["createSession"] = (playerID, jsonMessage) => {
            const newSessionID = this.generateSessionID();
            this.sessions[newSessionID] = new Session(this.sessionType, newSessionID, jsonMessage.parameters);
            if (!this.sessions[newSessionID].AddPlayerByID(playerID)) {
                console.error(`[SessionServer] Unable to add player ${playerID} to newly created session ${newSessionID}`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionJoin",
                    "sessionID": -1,
                    "session": {}
                }));
                return;
            }
            console.log(`[SessionServer] Created new session with ID ${newSessionID}`);
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": "sessionJoin",
                "sessionID": newSessionID,
                "session": this.sessions[newSessionID].GetData()
            }));
        };
        this.commands["updateSession"] = (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to update session ${jsonMessage.sessionID}`);
            if (!this.validateSessionID(playerID, jsonMessage.sessionID, "sessionUpdate")) {
                return;
            }
            if (!this.sessions[jsonMessage.sessionID].Update(playerID, jsonMessage.parameters)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionUpdate",
                    "sessionID": -3
                }));
            }
            this.sessions[jsonMessage.sessionID].ForEachPlayer(((playerID) => {
                this.sendMessageToPlayer(playerID, JSON.stringify({ "command": "sessionUpdate", "sessionID": jsonMessage.sessionID, "session": this.sessions[jsonMessage.sessionID].GetData() }));
            }).bind(this));
        };
        this.commands["joinSession"] = (playerID, jsonMessage) => {
            if (jsonMessage.sessionID != -1 && !this.validateSessionID(playerID, jsonMessage.sessionID, "sessionJoin")) {
                return;
            }
            // requesting a join to session ID -1 will join the latest session
            if (jsonMessage.sessionID == -1) {
                jsonMessage.sessionID = this.nextSessionID - 1;
            }
            if (!this.validateSessionID(playerID, jsonMessage.sessionID, "sessionJoin")) {
                return;
            }
            if (!this.sessions[jsonMessage.sessionID].AddPlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionJoin",
                    "sessionID": -3
                }));
                return;
            }
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": "sessionJoin",
                "sessionID": jsonMessage.sessionID,
                "session": this.sessions[jsonMessage.sessionID].GetData()
            }));
        };
        this.commands["leaveSession"] = (playerID, jsonMessage) => {
            if (!this.validateSessionID(playerID, jsonMessage.sessionID, "sessionLeave")) {
                return;
            }
            if (!this.sessions[jsonMessage.sessionID].RemovePlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionLeave",
                    "sessionID": -3
                }));
                return;
            }
            console.log(`[SessionServer] Players left in session ${jsonMessage.sessionID}: ${this.sessions[jsonMessage.sessionID].CurrentPlayerCount}`);
            if (!this.sessions[jsonMessage.sessionID].CurrentPlayerCount) {
                console.log(`[SessionServer] Session ${jsonMessage.sessionID} has no players left; discarding it`);
                delete this.sessions[jsonMessage.sessionID];
            }
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": "sessionLeave",
                "sessionID": jsonMessage.sessionID
            }));
        };
    }
    generatePlayerMessageHandler(playerID) {
        return (message) => {
            if (message.type === 'utf8') {
                try {
                    const jsonMessage = JSON.parse(message.utf8Data);
                    this.handleMessage(playerID, jsonMessage);
                }
                catch (e) {
                    console.group("Invalid JSON string received!");
                    console.error(message);
                    console.error(e);
                    console.groupEnd();
                }
            }
        };
    }
    generatePlayerCloseHandler(playerID) {
        return (reasonCode, description) => {
            this.removePlayer(playerID);
        };
    }
    removePlayer(playerID) {
        console.log(`[SessionServer] Connection from player ${playerID} closed...`);
        for (const sessionID in this.sessions) {
            this.commands.leaveSession.apply(this, [playerID, { "sessionID": parseInt(sessionID) }]);
        }
        delete this.player[playerID];
    }
    handleNewPlayer(request) {
        const connection = request.accept(undefined, request.origin);
        const playerID = this.generatePlayerID();
        this.player[playerID] = connection;
        this.player[playerID].on('message', this.generatePlayerMessageHandler(playerID));
        this.player[playerID].on('close', this.generatePlayerCloseHandler(playerID));
    }
    static Create(sessionType, port) {
        return new Promise((resolve, reject) => {
            const newServer = new SessionServer(sessionType, port);
            newServer.setupCommands();
            newServer.wsServer.on('request', newServer.handleNewPlayer.bind(newServer));
            newServer.httpServer.on('listening', () => {
                console.log(`[SessionServer] Listening on port ${newServer.port}...`);
                resolve(newServer);
            });
            newServer.wsServer.on('error', () => {
                console.group(`[SessionServer] Error initializing server!`);
                reject();
            });
            newServer.httpServer.listen(newServer.port);
        });
    }
    Shutdown() {
        return new Promise((resolve, reject) => {
            this.httpServer.shutdown(() => {
                resolve();
            });
        });
    }
    Running() {
        return this.httpServer.shutdown();
    }
    generatePlayerID() {
        return this.nextPlayerID++;
    }
    generateSessionID() {
        return this.nextSessionID++;
    }
    handleMessage(playerID, jsonMessage) {
        if (jsonMessage.command) {
            if (typeof this.commands[jsonMessage.command] == "function") {
                this.commands[jsonMessage.command].apply(this, [playerID, jsonMessage]);
            }
            else {
                console.error(`[SessionServer] no command called "${jsonMessage.command}" available`);
            }
        }
    }
    sendMessageToPlayer(playerID, message) {
        if (!this.player[playerID]) {
            console.error(`[SessionServer] No player with ID ${playerID} is connected!`);
            return false;
        }
        this.player[playerID].send(message);
        return true;
    }
}
exports.SessionServer = SessionServer;
;
//# sourceMappingURL=SessionServer.js.map