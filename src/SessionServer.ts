/* tslint:disable:no-any no-unsafe-any */
type deepKeysCopyType = (object : any, stack? : string[]) => string[];
const deepKeys : deepKeysCopyType = (object : any, stack : string[] = []) : string[] => {
    Object.keys(object)
          .forEach((element : string) : void => {
              // Escape . in the element name
              const escaped : string = element.replace(/\./g, '\\\.');

              // If it's a nested object
              if (
                (object[element] !== null && typeof object[element] === 'object' && !(object[element] instanceof Date))
                && !Array.isArray(object[element])
              ) {
                  deepKeys(object[element], stack);
              } else {
                  // Create and save the key
                  stack.push(escaped);
              }
          });

    return stack;
};
/* tslint:enable:no-any no-unsafe-any */

// helper classes to ensure we're not relying on the actual data of either the session or players
class ISessionData {} // tslint:disable-line:no-unnecessary-class
class IPlayerData {} // tslint:disable-line:no-unnecessary-class

type ForEachPlayerCallback = (playerID : number) => void;
type PlayerMessageHandler = (data : string) => void;
type PlayerRemoveHandler = (reasonCode : number, description : string) => void;
class Session {
    private readonly ID : number;

    private readonly defaultSessionData : ISessionData;
    private defaultPlayerData : IPlayerData;

    private currentSessionData : ISessionData;

    private readonly connectedPlayers : Map<number, IPlayerData> = new Map<number, IPlayerData>();
    get CurrentPlayerCount() : number { return this.connectedPlayers.size; }

    constructor(ID : number, sessionData : ISessionData, playerData : IPlayerData) {
        this.ID = ID;
        this.defaultSessionData = sessionData;
        this.defaultPlayerData = playerData;

        this.currentSessionData = { ...this.defaultSessionData};
    }

    // player handling
    public ForEachPlayer(callback : ForEachPlayerCallback) : void {
        if (this.connectedPlayers.size <= 0) {
            console.error('[SessionServer] Library error: Attempting to itterate over players inside an empty session!');

            return;
        }

        this.connectedPlayers.forEach((playerData : IPlayerData, playerID : number, containingMap : Map<number, IPlayerData>) : void => {
            callback(playerID);
        });
    }

    public HasPlayerIDInSession(playerID : number) : boolean {
        return this.connectedPlayers.has(playerID);
    }

    public AddPlayerByID(playerID : number) : boolean {
        if (this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is already part of session ${this.ID} (current players: ${this.connectedPlayers.keys()})`);

            return false;
        }
        this.connectedPlayers.set(playerID, { ...this.defaultPlayerData});

        return true;
    }

    public RemovePlayerByID(playerID : number) : boolean {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} (current players: ${this.connectedPlayers.keys()})`);

            return false;
        }
        this.connectedPlayers.delete(playerID);

        return true;
    }

    // player data handling
    public GetPlayerDataByID(playerID : number) : IPlayerData {
        if (!this.HasPlayerIDInSession(playerID)) {
            console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't receive his data (current players: ${this.connectedPlayers.keys()})`);

            return new IPlayerData();
        }

        return <IPlayerData>this.connectedPlayers.get(playerID);
    }

    public UpdatePlayerByID(playerID : number, playerUpdateArguments : Object) : boolean {
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
    public GetSessionData() : ISessionData {
        return this.currentSessionData;
    }

    // session data handling
    public GetDefaultPlayerData() : IPlayerData {
        return this.defaultPlayerData;
    }

    public UpdateSessionData(playerID : number, sessionUpdateArguments : Object, playerUpdateArguments : Object) : void {
        this.currentSessionData = sessionUpdateArguments;
        this.defaultPlayerData = playerUpdateArguments;

        // reset player data for every player in this session
        //   the associated sessionUpdate-websocket message propagates this change to every client and requires a
        //   playerUpdate-call from every player, as other game modes might require other player data
        console.log(`[SessionServer] Resetting every player's data due to change in defaultSessionData-object`);
        this.ForEachPlayer((currentPlayerID : number) : void => {
            this.UpdatePlayerByID(currentPlayerID, this.defaultPlayerData);
        });
    }
}

import * as http from 'http';
import * as ws from 'ws';

class CommandPayload {
    public command : string = '';
}
export class SessionServer {
    private readonly commands : Map<string, Function> = new Map<string, Function>();

    private nextSessionID : number = 0;
    private readonly sessions : Map<number, Session> = new Map<number, Session>();

    private nextPlayerID : number = 0;
    private readonly player : Map<number, ws> = new Map<number, ws>();
    private readonly sessionIDByPlayerID : Map<number, number> = new Map<number, number>();

    private readonly port : number = -1;

    private readonly httpServer : http.Server;
    private readonly wsServer : ws.Server;

    private constructor(port : number) {
        this.port = port;

        this.httpServer = http.createServer();
        this.wsServer = new ws.Server({server: this.httpServer});
    }

    public static async Create(port : number) : Promise<SessionServer> {
        return new Promise<SessionServer>((resolve : Function, reject : Function) : void => {
            const newServer : SessionServer = new SessionServer(port);

            newServer.setupCommands();

            newServer.wsServer.on('connection', newServer.addPlayer);

            newServer.httpServer.on('listening', () : void => {
                console.log(`[SessionServer] Listening on port ${newServer.port}...`);
                resolve(newServer);
            });

            newServer.wsServer.on('error', (error : Error) : void => {
                console.group(`[SessionServer] Error initializing server`);
                console.error(error);
                reject();
            });

            newServer.httpServer.listen(newServer.port);
        });
    }

    public async Shutdown() : Promise<void> {
        return new Promise<void>((resolve : Function, reject : Function) : void => {
            this.httpServer.close(() : void => {
                this.wsServer.close();
                resolve();
            });
        });
    }

    public Running() : boolean {
        return this.httpServer.listening;
    }

    private setupCommands() : void {
        const validateSessionIDHelper : Function = (playerID : number, request : string) : boolean => {
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

            if (!this.sessions.has(<number>this.sessionIDByPlayerID.get(playerID))) {
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
            public session : Object = new Object();
            public sessionID : number = -1;
            public player : Object = new Object();
        }
        this.commands.set('createSession', (playerID : number, jsonMessage : CreateSessionPayload) : void => {
            // a player can only be connected to one session at a time

            if (this.sessionIDByPlayerID.get(playerID) !== -1) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionJoin',
                    error: 4
                }));

                return;
            }

            const newSessionID : number = this.generateSessionID();
            this.sessions.set(newSessionID, new Session(newSessionID, jsonMessage.session, jsonMessage.player));
            console.log(`[SessionServer] Created new session with ID ${newSessionID} for player ${playerID}`);

            jsonMessage.sessionID = newSessionID;

            (<Function>this.commands.get('joinSession'))(playerID, jsonMessage);
        });

        class UpdateSessionPayload extends CommandPayload {
            public session : Object = new Object();
            public player : Object = new Object();
        }
        this.commands.set('updateSession', (playerID : number, jsonMessage : UpdateSessionPayload) : void => {
            console.log(`[SessionServer] Player ${playerID} attempting to update his session (${this.sessionIDByPlayerID.has(playerID) ? this.sessionIDByPlayerID.get(playerID) : 'no session'})`);
            if (!validateSessionIDHelper(playerID, 'sessionUpdate')) {
                return;
            }

            const playerSessionID : number = <number>this.sessionIDByPlayerID.get(playerID);
            const playerSession : Session = <Session>this.sessions.get(playerSessionID);

            playerSession.UpdateSessionData(playerID, jsonMessage.session, jsonMessage.player);

            playerSession.ForEachPlayer((currentPlayerID : number) : void => {
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
            public player : Object = new Object();
        }
        this.commands.set('updatePlayer', (playerID : number, jsonMessage : UpdatePlayerPayload) : void => {
            console.log(`[SessionServer] Player ${playerID} attempting to update his player data for session (${this.sessionIDByPlayerID.has(playerID) ? this.sessionIDByPlayerID.get(playerID) : 'no session'})`);
            if (!validateSessionIDHelper(playerID, 'playerUpdate')) {
                return;
            }

            const playerSessionID : number = <number>this.sessionIDByPlayerID.get(playerID);
            const playerSession : Session = <Session>this.sessions.get(playerSessionID);

            if (!playerSession.UpdatePlayerByID(playerID, jsonMessage.player)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'playerUpdate',
                    error: 4
                }));
            }

            const updatedPlayerID : number = playerID;
            playerSession.ForEachPlayer((currentPlayerID : number) : void => {
                this.sendMessageToPlayer(currentPlayerID, JSON.stringify({
                    command: 'playerUpdate',
                    error: 0,
                    playerID: updatedPlayerID,
                    player: playerSession.GetPlayerDataByID(updatedPlayerID)
                }));
            });
        });

        class JoinSessionPayload extends CommandPayload {
            public sessionID : number = -1;
        }
        this.commands.set('joinSession', (playerID : number, jsonMessage : JoinSessionPayload) : void => {
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

            // if that session no longer exists
            if (!this.sessions.has(jsonMessage.sessionID)) {
                // ...return an error
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionJoin',
                    error: 7
                }));

                return;
            }

            const requestedSession : Session = <Session>this.sessions.get(jsonMessage.sessionID);
            if (!requestedSession.AddPlayerByID(playerID)) {
                this.sendMessageToPlayer(playerID, JSON.stringify({
                    command: 'sessionJoin',
                    error: 8
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
            requestedSession.ForEachPlayer((existingPlayerID : number) : void => {
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
        this.commands.set('leaveSession', (playerID : number, jsonMessage : LeaveSessionPayload) : void => {
            // store session and player ID to inform potential remaining clients
            console.log(`[SessionServer] Player ${playerID} attempting to leave his session (${this.sessionIDByPlayerID.has(playerID) ? this.sessionIDByPlayerID.get(playerID) : 'no session'})`);

            if (!validateSessionIDHelper(playerID, 'sessionLeave')) {
                return;
            }

            const sessionID : number = <number>this.sessionIDByPlayerID.get(playerID);
            const session : Session = <Session>this.sessions.get(sessionID);
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
            session.ForEachPlayer((remainingPlayerID : number) : void => {
                    this.sendMessageToPlayer(remainingPlayerID, JSON.stringify({
                        command: 'playerLeave',
                        error: 0,
                        playerID: playerID
                    }));
                });
        });
    }
    private generatePlayerMessageHandler(playerID : number) : PlayerMessageHandler {
        return (data : string) : void => {
            try {
                const jsonMessage : CommandPayload = <CommandPayload>JSON.parse(data);
                this.handleMessage(playerID, jsonMessage);
            } catch (e) {
                console.group('Invalid JSON string received');
                console.error(data);
                console.error(e);
                console.groupEnd();
            }
        };
    }

    private generatePlayerCloseHandler(playerID : number) : PlayerRemoveHandler {
        return (reasonCode : number, description : string) : void => {
            this.removePlayer(playerID);
        };
    }

    private readonly addPlayer = (socket : ws, request: http.IncomingMessage) : void => {
        const playerID : number = this.generatePlayerID();
        this.player.set(playerID, socket);
        this.sessionIDByPlayerID.set(playerID, -1);

        console.log(`[SessionServer] New connection detected - assigning player ID: playerID`);

        socket.on('message', this.generatePlayerMessageHandler(playerID));
        socket.on('close', this.generatePlayerCloseHandler(playerID));
    }

    private removePlayer(playerID : number) : void {
        console.log(`[SessionServer] Connection from player ${playerID} closed...`);
        if (!this.player.has(playerID)) {
            console.log(`[SessionServer] Player ${playerID} gracefully disconnected...`);

            return;
        }

        console.log(`[SessionServer] Player ${playerID} was still connected - cleaning up...`);
        if (this.sessionIDByPlayerID.get(playerID) !== -1) {
            // remove the player from any session he was still in - this informs other players
            (<Function>this.commands.get('leaveSession'))(playerID, new CommandPayload());
            this.sessionIDByPlayerID.set(playerID, -1);
        }

        this.player.delete(playerID);
        this.sessionIDByPlayerID.delete(playerID);
        console.log(`[SessionServer] Player ${playerID} removed`);
    }

    private generatePlayerID() : number {
        const nextID : number = this.nextPlayerID;
        this.nextPlayerID = this.nextPlayerID + 1;

        return nextID;
    }

    private generateSessionID() : number {
        const nextID : number = this.nextSessionID;
        this.nextSessionID = this.nextSessionID + 1;

        return nextID;
    }

    private handleMessage(playerID : number, jsonMessage : CommandPayload) : void {
        if (jsonMessage.command.trim().length <= 0) {
            console.error(`[SessionServer] Attemping to handle new message, but 'command'-field was not set`);
        }

        if (this.commands.has(jsonMessage.command)) {
            (<Function>this.commands.get(jsonMessage.command)).apply(this, [playerID, jsonMessage]);
        } else {
            console.error(`[SessionServer] Attemping to handle new message, but no command called "${jsonMessage.command}" available`);
        }
    }

    private sendMessageToPlayer(playerID : number, message : string) : boolean {
        if (!this.player.has(playerID)) {
            console.error(`[SessionServer] No player with ID ${playerID} is connected`);

            return false;
        }
        const playerWebsocket : ws = <ws>this.player.get(playerID);

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
