"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const deepKeys = (object, stack = []) => {
    Object.keys(object)
        .forEach((element) => {
        // Escape . in the element name
        const escaped = element.replace(/\./g, '\\\.');
        // If it's a nested object
        if ((object[element] !== null && typeof object[element] === 'object' && !(object[element] instanceof Date))
            && !Array.isArray(object[element])) {
            deepKeys(object[element], stack);
        }
        else {
            // Create and save the key
            stack.push(escaped);
        }
    });
    return stack;
};
/* tslint:enable:no-any no-unsafe-any */
// helper classes to ensure we're not relying on the actual data of either the session or players
class ISessionData {
} // tslint:disable-line:no-unnecessary-class
class IPlayerData {
} // tslint:disable-line:no-unnecessary-class
class Session {
    constructor(ID, sessionData, playerData) {
        this.connectedPlayers = new Map();
        this.ID = ID;
        this.defaultSessionData = sessionData;
        this.defaultPlayerData = playerData;
        this.currentSessionData = Object.assign({}, this.defaultSessionData);
    }
    get CurrentPlayerCount() { return this.connectedPlayers.size; }
    // player handling
    ForEachPlayer(callback) {
        if (this.connectedPlayers.size <= 0) {
            console.error('[SessionServer] Library error: Attempting to itterate over players inside an empty session!');
            return;
        }
        this.connectedPlayers.forEach((playerData, playerID, containingMap) => {
            callback(playerID);
        });
    }
    HasPlayerIDInSession(playerID) {
        return this.connectedPlayers.has(playerID);
    }
    AddPlayerByID(playerID) {
        if (this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is already part of session ${this.ID} (current players: ${this.connectedPlayers.keys()})`);
            return false;
        }
        this.connectedPlayers.set(playerID, Object.assign({}, this.defaultPlayerData));
        return true;
    }
    RemovePlayerByID(playerID) {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} (current players: ${this.connectedPlayers.keys()})`);
            return false;
        }
        this.connectedPlayers.delete(playerID);
        return true;
    }
    // player data handling
    GetPlayerDataByID(playerID) {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't receive his data (current players: ${this.connectedPlayers.keys()})`);
            return new IPlayerData();
        }
        return this.connectedPlayers.get(playerID);
    }
    UpdatePlayerByID(playerID, playerUpdateArguments) {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't update his data (current players: ${this.connectedPlayers.keys()})`);
            return false;
        }
        if (JSON.stringify(deepKeys(this.defaultPlayerData)) !== JSON.stringify(deepKeys(playerUpdateArguments))) {
            console.group(`[SessionServer] Player ${playerID} is attempting to update his player data with additional/missing fields`);
            console.error('Default player data structure:');
            console.error(this.defaultPlayerData);
            console.error('Requested data:');
            console.error(playerUpdateArguments);
            console.error('Current player data structure:');
            console.error(this.connectedPlayers.get(playerID));
            console.groupEnd();
            return false;
        }
        this.connectedPlayers.set(playerID, playerUpdateArguments);
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
        this.ForEachPlayer((currentPlayerID) => {
            this.UpdatePlayerByID(currentPlayerID, this.defaultPlayerData);
        });
    }
}
const http = __importStar(require("http"));
const ws = __importStar(require("ws"));
class CommandPayload {
    constructor() {
        this.command = '';
    }
}
class SessionServer {
    constructor(port) {
        this.commands = new Map();
        this.nextSessionID = 0;
        this.sessions = new Map();
        this.nextPlayerID = 0;
        this.player = new Map();
        this.sessionIDByPlayerID = new Map();
        this.port = -1;
        this.addPlayer = (socket, request) => {
            const playerID = this.generatePlayerID();
            this.player.set(playerID, socket);
            this.sessionIDByPlayerID.set(playerID, -1);
            socket.on('message', this.generatePlayerMessageHandler(playerID));
            socket.on('close', this.generatePlayerCloseHandler(playerID));
        };
        this.port = port;
        this.httpServer = http.createServer();
        this.wsServer = new ws.Server({ server: this.httpServer });
    }
    static Create(port) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const newServer = new SessionServer(port);
                newServer.setupCommands();
                newServer.wsServer.on('connection', newServer.addPlayer);
                newServer.httpServer.on('listening', () => {
                    console.log(`[SessionServer] Listening on port ${newServer.port}...`);
                    resolve(newServer);
                });
                newServer.wsServer.on('error', (error) => {
                    console.group(`[SessionServer] Error initializing server`);
                    console.error(error);
                    reject();
                });
                newServer.httpServer.listen(newServer.port);
            });
        });
    }
    Shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.httpServer.close(() => {
                    this.wsServer.close();
                    resolve();
                });
            });
        });
    }
    Running() {
        return this.httpServer.listening;
    }
    setupCommands() {
        const validateSessionIDHelper = (playerID, request) => {
            if (!this.sessionIDByPlayerID.has(playerID)) {
                console.error(`[SessionServer] ${request} requires player '${playerID}' to exist in sessionIDByPlayerID - ensure his connection was handled correctly`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: request,
                    error: 1
                }));
                return false;
            }
            if (this.sessionIDByPlayerID.get(playerID) === -1) {
                console.error(`[SessionServer] ${request} requires player '${playerID}' to be in a session`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: request,
                    error: 2
                }));
                return false;
            }
            if (!this.sessions.has(this.sessionIDByPlayerID.get(playerID))) {
                console.error(`[SessionServer] Attemping to run ${request} and player '${playerID}' is in a session (ID: ${this.sessionIDByPlayerID.get(playerID)}) which doesn't exist (any more)`);
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: request,
                    error: 3
                }));
                return false;
            }
            return true;
        };
        // TODO @VM Refactor to dynamic payload+function tuple (probably involves changing `commands`)
        class CreateSessionPayload extends CommandPayload {
            constructor() {
                super(...arguments);
                this.session = new Object();
                this.sessionID = -1;
                this.player = new Object();
            }
        }
        this.commands.set('createSession', (playerID, jsonMessage) => {
            // a player can only be connected to one session at a time
            if (this.sessionIDByPlayerID.get(playerID) !== -1) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionJoin',
                    error: 4
                }));
                return;
            }
            const newSessionID = this.generateSessionID();
            this.sessions.set(newSessionID, new Session(newSessionID, jsonMessage.session, jsonMessage.player));
            console.log(`[SessionServer] Created new session with ID ${newSessionID} for player ${playerID}`);
            jsonMessage.sessionID = newSessionID;
            this.commands.get('joinSession')(playerID, jsonMessage);
        });
        class UpdateSessionPayload extends CommandPayload {
            constructor() {
                super(...arguments);
                this.session = new Object();
                this.player = new Object();
            }
        }
        this.commands.set('updateSession', (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to update his session (${this.sessionIDByPlayerID.has(playerID) ? this.sessionIDByPlayerID.get(playerID) : 'no session'})`);
            if (!validateSessionIDHelper(playerID, 'sessionUpdate')) {
                return;
            }
            const playerSessionID = this.sessionIDByPlayerID.get(playerID);
            const playerSession = this.sessions.get(playerSessionID);
            playerSession.UpdateSessionData(playerID, jsonMessage.session, jsonMessage.player);
            playerSession.ForEachPlayer((currentPlayerID) => {
                console.log(`[SessionServer] INFO ${currentPlayerID} by ${playerID}`);
                this.sendMessageToPlayer(currentPlayerID, JSON.stringify({
                    command: 'sessionUpdate',
                    error: 0,
                    session: playerSession.GetSessionData(),
                    player: playerSession.GetDefaultPlayerData()
                }));
            });
        });
        class UpdatePlayerPayload extends CommandPayload {
            constructor() {
                super(...arguments);
                this.player = new Object();
            }
        }
        this.commands.set('updatePlayer', (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to update his player data for session (${this.sessionIDByPlayerID.has(playerID) ? this.sessionIDByPlayerID.get(playerID) : 'no session'})`);
            if (!validateSessionIDHelper(playerID, 'playerUpdate')) {
                return;
            }
            const playerSessionID = this.sessionIDByPlayerID.get(playerID);
            const playerSession = this.sessions.get(playerSessionID);
            if (!playerSession.UpdatePlayerByID(playerID, jsonMessage.player)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'playerUpdate',
                    error: 4
                }));
            }
            const updatedPlayerID = playerID;
            playerSession.ForEachPlayer((currentPlayerID) => {
                this.sendMessageToPlayer(currentPlayerID, JSON.stringify({
                    command: 'playerUpdate',
                    error: 0,
                    playerID: updatedPlayerID,
                    player: playerSession.GetPlayerDataByID(updatedPlayerID)
                }));
            });
        });
        class JoinSessionPayload extends CommandPayload {
            constructor() {
                super(...arguments);
                this.sessionID = -1;
            }
        }
        this.commands.set('joinSession', (playerID, jsonMessage) => {
            console.log(`[SessionServer] Player ${playerID} attempting to join session (${jsonMessage.sessionID})`);
            // a player can only be connected to one session at a time
            if (this.sessionIDByPlayerID.get(playerID) !== -1) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionJoin',
                    error: 5
                }));
                return;
            }
            // if client requests to join session -1...
            if (jsonMessage.sessionID === -1) {
                // ...and we don't have any current sessions
                if (this.sessions.size <= 0) {
                    // ...return an error
                    this.sendMessageToPlayer(playerID, JSON.stringify({
                        command: 'sessionJoin',
                        error: 6
                    }));
                    return;
                }
                // otherwise he'll join the session created last
                jsonMessage.sessionID = this.nextSessionID - 1;
            }
            const requestedSession = this.sessions.get(jsonMessage.sessionID);
            if (!requestedSession.AddPlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionJoin',
                    error: 7
                }));
                return;
            }
            this.sessionIDByPlayerID.set(playerID, jsonMessage.sessionID);
            // send session state to new player...
            this.sendMessageToPlayer(playerID, JSON.stringify({
                command: 'sessionJoin',
                error: 0,
                sessionID: jsonMessage.sessionID,
                playerID: playerID,
                session: requestedSession.GetSessionData(),
                player: requestedSession.GetPlayerDataByID(playerID)
            }));
            // ... and for every player already connected...
            requestedSession.ForEachPlayer((existingPlayerID) => {
                // ...except for the new player...
                if (existingPlayerID !== playerID) {
                    // ...send updates to the new player about the existing player...
                    console.log(`Informing player ${playerID} about player ${existingPlayerID}`);
                    this.sendMessageToPlayer(playerID, JSON.stringify({
                        command: 'playerJoin',
                        error: 0,
                        playerID: existingPlayerID,
                        player: requestedSession.GetPlayerDataByID(existingPlayerID)
                    }));
                    // ...and send updates to the existing player about the new player...
                    console.log(`Informing player ${existingPlayerID} about player ${playerID}`);
                    this.sendMessageToPlayer(existingPlayerID, JSON.stringify({
                        command: 'playerJoin',
                        error: 0,
                        playerID: playerID,
                        player: requestedSession.GetPlayerDataByID(playerID)
                    }));
                }
            });
        });
        class LeaveSessionPayload extends CommandPayload {
        }
        this.commands.set('leaveSession', (playerID, jsonMessage) => {
            // store session and player ID to inform potential remaining clients
            console.log(`[SessionServer] Player ${playerID} attempting to leave his session (${this.sessionIDByPlayerID.has(playerID) ? this.sessionIDByPlayerID.get(playerID) : 'no session'})`);
            if (!validateSessionIDHelper(playerID, 'sessionLeave')) {
                return;
            }
            const sessionID = this.sessionIDByPlayerID.get(playerID);
            const session = this.sessions.get(sessionID);
            if (!session.RemovePlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionLeave',
                    error: 4
                }));
                return;
            }
            console.log(`[SessionServer] Players remaining in session ${sessionID}: ${session.CurrentPlayerCount}`);
            if (session.CurrentPlayerCount <= 0) {
                console.log(`[SessionServer] Session ${sessionID} has no players left; discarding it`);
                this.sessions.delete(sessionID);
            }
            // reset association of player
            this.sessionIDByPlayerID.set(playerID, -1);
            // inform leaving player about success
            this.sendMessageToPlayer(playerID, JSON.stringify({
                command: 'sessionLeave',
                error: 0
            }));
            // inform remaining players about leaving player
            // sessions are destroyed, if the last player left
            if (!this.sessions.has(sessionID)) {
                return;
            }
            // send message about leaving player
            session.ForEachPlayer((remainingPlayerID) => {
                this.sendMessageToPlayer(remainingPlayerID, JSON.stringify({
                    command: 'playerLeave',
                    error: 0,
                    playerID: playerID
                }));
            });
        });
    }
    generatePlayerMessageHandler(playerID) {
        return (data) => {
            try {
                const jsonMessage = JSON.parse(data);
                this.handleMessage(playerID, jsonMessage);
            }
            catch (e) {
                console.group('Invalid JSON string received');
                console.error(data);
                console.error(e);
                console.groupEnd();
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
        if (!this.player.has(playerID)) {
            console.log(`[SessionServer] Player ${playerID} gracefully disconnected...`);
            return;
        }
        console.log(`[SessionServer] Player ${playerID} was still connected - cleaning up...`);
        if (this.sessionIDByPlayerID.get(playerID) !== -1) {
            // remove the player from any session he was still in - this informs other players
            this.commands.get('leaveSession')(playerID, new CommandPayload());
            this.sessionIDByPlayerID.set(playerID, -1);
        }
        this.player.delete(playerID);
        this.sessionIDByPlayerID.delete(playerID);
        console.log(`[SessionServer] Player ${playerID} removed`);
    }
    generatePlayerID() {
        const nextID = this.nextPlayerID;
        this.nextPlayerID = this.nextPlayerID + 1;
        return nextID;
    }
    generateSessionID() {
        const nextID = this.nextSessionID;
        this.nextSessionID = this.nextSessionID + 1;
        return nextID;
    }
    handleMessage(playerID, jsonMessage) {
        if (jsonMessage.command.trim().length <= 0) {
            console.error(`[SessionServer] Attemping to handle new message, but 'command'-field was not set`);
        }
        if (this.commands.has(jsonMessage.command)) {
            this.commands.get(jsonMessage.command).apply(this, [playerID, jsonMessage]);
        }
        else {
            console.error(`[SessionServer] Attemping to handle new message, but no command called "${jsonMessage.command}" available`);
        }
    }
    sendMessageToPlayer(playerID, message) {
        if (!this.player.has(playerID)) {
            console.error(`[SessionServer] No player with ID ${playerID} is connected`);
            return false;
        }
        const playerWebsocket = this.player.get(playerID);
        console.log(`Message to ${playerID}`);
        console.log(message);
        if (playerWebsocket.readyState !== 1) {
            console.warn(`[SessionServer] Can\'t send message to player, since the connection is (already) unavailable - readyState: ${playerWebsocket.readyState}`);
            return false;
        }
        playerWebsocket.send(message);
        return true;
    }
}
exports.SessionServer = SessionServer;
//# sourceMappingURL=SessionServer.js.map