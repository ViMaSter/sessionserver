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
const deepKeys = (object, stack = []) => {
    Object.keys(object).forEach((element) => {
        // Escape . in the element name
        var escaped = element.replace(/\./g, '\\\.');
        // If it's a nested object
        if ((object[element] !== null && typeof object[element] === 'object' && !(object[element] instanceof Date)) && !Array.isArray(object[element])) {
            deepKeys(object[element], stack);
        }
        else {
            // Create and save the key
            stack.push(escaped);
        }
    });
    return stack;
};
// helper classes to ensure we're not relying on the actual data of either the session or players
class ISessionData {
}
;
class IPlayerData {
}
;
class Session {
    constructor(ID, sessionData, playerData) {
        this.connectedPlayers = {};
        this.ID = ID;
        this.defaultSessionData = sessionData;
        this.defaultPlayerData = playerData;
        this.currentSessionData = Object.assign({}, this.defaultSessionData);
    }
    get CurrentPlayerCount() { return Object.keys(this.connectedPlayers).length; }
    ;
    // player handling
    ForEachPlayer(callback) {
        Object.keys(this.connectedPlayers).map((item) => { return parseInt(item); }).forEach(callback);
    }
    HasPlayerIDInSession(playerID) {
        return !!this.connectedPlayers[playerID];
    }
    AddPlayerByID(playerID) {
        if (this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is already part of session ${this.ID} (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
            return false;
        }
        this.connectedPlayers[playerID] = Object.assign({}, this.defaultPlayerData);
        return true;
    }
    RemovePlayerByID(playerID) {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
            return false;
        }
        delete this.connectedPlayers[playerID];
        return true;
    }
    // player data handling
    GetPlayerDataByID(playerID) {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't receive his data (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
            return {};
        }
        return this.connectedPlayers[playerID];
    }
    UpdatePlayerByID(playerID, playerUpdateArguments) {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't update his data (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
            return false;
        }
        if (JSON.stringify(deepKeys(this.defaultPlayerData)) != JSON.stringify(deepKeys(playerUpdateArguments))) {
            console.group(`[SessionServer] Player ${playerID} is attempting to update his player data with additional/missing fields`);
            console.error("Default player data structure:");
            console.error(this.defaultPlayerData);
            console.error("Requested data:");
            console.error(playerUpdateArguments);
            console.error("Current player data structure:");
            console.error(this.connectedPlayers[playerID]);
            console.groupEnd();
            return false;
        }
        this.connectedPlayers[playerID] = playerUpdateArguments;
        return true;
    }
    // session data handling
    GetSessionData() {
        return this.currentSessionData;
    }
    // session data handling
    GetDefaultPlayerData() {
        return this.defaultPlayerData;
    }
    UpdateSessionData(playerID, sessionUpdateArguments, playerUpdateArguments) {
        this.currentSessionData = sessionUpdateArguments;
        this.defaultPlayerData = playerUpdateArguments;
        // reset player data for every player in this session
        //   the associated sessionUpdate-websocket message propagates this change to every client and requires a
        //   playerUpdate-call from every player, as other game modes might require other player data
        console.log(`[SessionServer] Resetting every player's data due to change in defaultSessionData-object`);
        this.ForEachPlayer((playerID) => {
            this.UpdatePlayerByID(playerID, this.defaultPlayerData);
        });
        return true;
    }
}
;
const http = __importStar(require("http"));
const ws = __importStar(require("websocket"));
//@ts-ignore
const http_shutdown_1 = __importDefault(require("http-shutdown"));
class SessionServer {
    constructor(port) {
        this.commands = {};
        this.nextSessionID = 0;
        this.sessions = {};
        this.nextPlayerID = 0;
        this.player = {};
        this.sessionIDByPlayerID = {};
        this.port = -1;
        this.port = port;
        this.httpServer = http_shutdown_1.default(http.createServer(() => { }));
        this.wsServer = new ws.server({ httpServer: this.httpServer });
    }
    setupCommands() {
        const validateSessionIDHelper = (playerID, request) => {
            if (typeof this.sessionIDByPlayerID[playerID] != "number") {
                console.error(`[SessionServer] ${request} requires player '${playerID}' to exist in sessionIDByPlayerID - ensure his connection was handled correctly`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": request,
                    "error": 1
                }));
                return false;
            }
            if (this.sessionIDByPlayerID[playerID] == -1) {
                console.error(`[SessionServer] ${request} requires player '${playerID}' to be in a session`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": request,
                    "error": 2
                }));
                return false;
            }
            if (!this.sessions[this.sessionIDByPlayerID[playerID]]) {
                console.error(`[SessionServer] Attemping to run ${request} and player '${playerID}' is in a session (ID: ${this.sessionIDByPlayerID[playerID]}) which doesn't exist (any more)`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": request,
                    "error": 3
                }));
                return false;
            }
            return true;
        };
        this.commands["createSession"] = (playerID, jsonMessage) => {
            const newSessionID = this.generateSessionID();
            this.sessions[newSessionID] = new Session(newSessionID, jsonMessage.session, jsonMessage.player);
            console.log(`[SessionServer] Created new session with ID ${newSessionID} for player ${playerID}`);
            jsonMessage.sessionID = newSessionID;
            this.commands.joinSession(playerID, jsonMessage);
        };
        this.commands["updateSession"] = (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to update his session (${this.sessionIDByPlayerID[playerID] || "no session"})`);
            if (!validateSessionIDHelper(playerID, "sessionUpdate")) {
                return;
            }
            if (!this.sessions[this.sessionIDByPlayerID[playerID]].UpdateSessionData(playerID, jsonMessage.session, jsonMessage.player)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionUpdate",
                    "error": 4
                }));
            }
            this.sessions[this.sessionIDByPlayerID[playerID]].ForEachPlayer(((playerID) => {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionUpdate",
                    "error": 0,
                    "session": this.sessions[this.sessionIDByPlayerID[playerID]].GetSessionData(),
                    "player": this.sessions[this.sessionIDByPlayerID[playerID]].GetDefaultPlayerData()
                }));
            }).bind(this));
        };
        this.commands["updatePlayer"] = (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to update his player data for session (${this.sessionIDByPlayerID[playerID] || "no session"})`);
            if (!validateSessionIDHelper(playerID, "playerUpdate")) {
                return;
            }
            if (!this.sessions[this.sessionIDByPlayerID[playerID]].UpdatePlayerByID(playerID, jsonMessage.player)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "playerUpdate",
                    "error": 4
                }));
            }
            const updatedPlayerID = playerID;
            this.sessions[this.sessionIDByPlayerID[playerID]].ForEachPlayer(((playerID) => {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "playerUpdate",
                    "error": 0,
                    "playerID": updatedPlayerID,
                    "player": this.sessions[this.sessionIDByPlayerID[playerID]].GetPlayerDataByID(updatedPlayerID)
                }));
            }).bind(this));
        };
        this.commands["joinSession"] = (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to join session (${jsonMessage.sessionID})`);
            // a player can only be connected to one session at a time
            if (this.sessionIDByPlayerID[playerID] != -1) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionJoin",
                    "error": 1
                }));
                return;
            }
            // if client requests to join session -1...
            if (jsonMessage.sessionID == -1) {
                // ...and we don't have any current sessions
                if (Object.keys(this.sessions).length <= 0) {
                    // ...return an error
                    this.sendMessageToPlayer(playerID, JSON.stringify({
                        "command": "sessionJoin",
                        "error": 2
                    }));
                    return;
                }
                // otherwise he'll join the session created last
                jsonMessage.sessionID = this.nextSessionID - 1;
            }
            if (!this.sessions[jsonMessage.sessionID].AddPlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionJoin",
                    "error": 3
                }));
                return;
            }
            this.sessionIDByPlayerID[playerID] = jsonMessage.sessionID;
            // send session state to new player...
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": "sessionJoin",
                "error": 0,
                "sessionID": this.sessionIDByPlayerID[playerID],
                "playerID": playerID,
                "session": this.sessions[this.sessionIDByPlayerID[playerID]].GetSessionData(),
                "player": this.sessions[this.sessionIDByPlayerID[playerID]].GetPlayerDataByID(playerID)
            }));
            // ... and for every player already connected...
            const newPlayerID = playerID;
            const newPlayerSessionID = this.sessionIDByPlayerID[newPlayerID];
            this.sessions[newPlayerSessionID].ForEachPlayer(((playerID) => {
                // ...except for the new player...
                if (playerID != newPlayerID) {
                    // ...send updates to the new player about the existing player...
                    console.log(`Informing player ${newPlayerID} about player ${playerID}`);
                    this.sendMessageToPlayer(newPlayerID, JSON.stringify({
                        "command": "playerJoin",
                        "error": 0,
                        "playerID": playerID,
                        "player": this.sessions[newPlayerSessionID].GetPlayerDataByID(playerID)
                    }));
                    // ...and send updates to the existing player about the new player...
                    console.log(`Informing player ${playerID} about player ${newPlayerID}`);
                    this.sendMessageToPlayer(playerID, JSON.stringify({
                        "command": "playerJoin",
                        "error": 0,
                        "playerID": newPlayerID,
                        "player": this.sessions[newPlayerSessionID].GetPlayerDataByID(newPlayerID)
                    }));
                }
            }).bind(this));
        };
        this.commands["leaveSession"] = (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to leave his session (${this.sessionIDByPlayerID[playerID] || "no session"})`);
            if (!validateSessionIDHelper(playerID, "sessionLeave")) {
                return;
            }
            if (!this.sessions[this.sessionIDByPlayerID[playerID]].RemovePlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "sessionLeave",
                    "error": 4
                }));
                return;
            }
            console.log(`[SessionServer] Players remaining in session ${this.sessionIDByPlayerID[playerID]}: ${this.sessions[this.sessionIDByPlayerID[playerID]].CurrentPlayerCount}`);
            if (!this.sessions[this.sessionIDByPlayerID[playerID]].CurrentPlayerCount) {
                console.log(`[SessionServer] Session ${this.sessionIDByPlayerID[playerID]} has no players left; discarding it`);
                delete this.sessions[this.sessionIDByPlayerID[playerID]];
            }
            // store session and player ID to inform potential remaining clients
            const leavingPlayerID = playerID;
            const sessionIDLeft = this.sessionIDByPlayerID[leavingPlayerID];
            // reset association of player
            this.sessionIDByPlayerID[playerID] = -1;
            // inform leaving player about success
            this.sendMessageToPlayer(playerID, JSON.stringify({
                "command": "sessionLeave",
                "error": 0
            }));
            // inform remaining players about leaving player
            // sessions are destroyed, if the last player left
            if (!this.sessions[sessionIDLeft]) {
                return;
            }
            // send message about leaving player
            this.sessions[sessionIDLeft].ForEachPlayer(((playerID) => {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    "command": "playerLeave",
                    "error": 0,
                    "playerID": leavingPlayerID
                }));
            }).bind(this));
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
                    console.group("Invalid JSON string received");
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
    addPlayer(request) {
        const connection = request.accept(undefined, request.origin);
        const playerID = this.generatePlayerID();
        this.player[playerID] = connection;
        this.sessionIDByPlayerID[playerID] = -1;
        this.player[playerID].on('message', this.generatePlayerMessageHandler(playerID));
        this.player[playerID].on('close', this.generatePlayerCloseHandler(playerID));
    }
    removePlayer(playerID) {
        console.log(`[SessionServer] Connection from player ${playerID} closed...`);
        if (this.sessionIDByPlayerID[playerID] != -1) {
            this.commands.leaveSession(playerID, {});
            this.sessionIDByPlayerID[playerID] = -1;
        }
        delete this.player[playerID];
        delete this.sessionIDByPlayerID[playerID];
    }
    static Create(port) {
        return new Promise((resolve, reject) => {
            const newServer = new SessionServer(port);
            newServer.setupCommands();
            newServer.wsServer.on('request', newServer.addPlayer.bind(newServer));
            newServer.httpServer.on('listening', () => {
                console.log(`[SessionServer] Listening on port ${newServer.port}...`);
                resolve(newServer);
            });
            newServer.wsServer.on('error', () => {
                console.group(`[SessionServer] Error initializing server`);
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
            console.error(`[SessionServer] No player with ID ${playerID} is connected`);
            return false;
        }
        console.log("Message to " + playerID);
        console.log(message);
        this.player[playerID].send(message);
        return true;
    }
}
exports.SessionServer = SessionServer;
;
//# sourceMappingURL=SessionServer.js.map