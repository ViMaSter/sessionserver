declare global {
	interface Array<T> {
		remove(elem: T): Array<T>;
	}
}

if (Array.prototype.remove) {
	Array.prototype.remove = function<T>(this: T[], elem: T): T[] {
		return this.filter(e => e !== elem);
	}
}


const deepKeys = (object : any, stack : string[] = []) : any => {
	Object.keys(object).forEach((element) => {
		// Escape . in the element name
		var escaped = element.replace(/\./g, '\\\.');

		// If it's a nested object
		if((object[element] !== null && typeof object[element] === 'object' && !(object[element] instanceof Date)) && !Array.isArray(object[element])) {
			deepKeys(object[element], stack);
		} else {
			// Create and save the key
			stack.push(escaped)
		}
	});
	return stack;
};

// helper classes to ensure we're not relying on the actual data of either the session or players
class ISessionData {};
class IPlayerData {};

type ForEachPlayerCallback = (playerID : number) => void;
class Session {
	private ID : number;

	private defaultSessionData : ISessionData;
	private defaultPlayerData : IPlayerData;

	private currentSessionData : ISessionData;

	private connectedPlayers : {[key: number]: IPlayerData} = {};
	get CurrentPlayerCount() { return Object.keys( this.connectedPlayers).length; };

	constructor(ID : number, sessionData : ISessionData, playerData : IPlayerData)
	{
		this.ID = ID;
		this.defaultSessionData = sessionData;
		this.defaultPlayerData = playerData;

		this.currentSessionData = { ...this.defaultSessionData};
	}

	// player handling
	ForEachPlayer(callback : ForEachPlayerCallback)
	{
		Object.keys(this.connectedPlayers).map((item) => {return parseInt(item)}).forEach(callback);
	}

	HasPlayerIDInSession(playerID : number) : boolean
	{
		return !!this.connectedPlayers[playerID];
	}

	AddPlayerByID(playerID : number) : boolean
	{
		if (this.HasPlayerIDInSession(playerID))
		{
			console.error(`[SessionServer] Player ${playerID} is already part of session ${this.ID} (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
			return false;
		}
		this.connectedPlayers[playerID] = { ...this.defaultPlayerData};
		return true;
	}

	RemovePlayerByID(playerID : number) : boolean
	{
		if (!this.HasPlayerIDInSession(playerID))
		{
			console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
			return false;
		}
		delete this.connectedPlayers[playerID];
		return true;
	}

	// player data handling
	GetPlayerDataById(playerID : number) : IPlayerData
	{
		if (!this.HasPlayerIDInSession(playerID))
		{
			console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't receive his data (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
			return {};
		}

		return this.connectedPlayers[playerID];
	}

	UpdatePlayerByID(playerID : number, playerUpdateArguments : any) : boolean
	{
		if (!this.HasPlayerIDInSession(playerID))
		{
			console.error(`[SessionServer] Player ${playerID} is not part of session ${this.ID} and therefore can't update his data (current players: ${Object.keys(this.connectedPlayers).join(', ')})`);
			return false;
		}

		if (JSON.stringify(deepKeys(this.defaultPlayerData)) != JSON.stringify(deepKeys(playerUpdateArguments)))
		{
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
	GetSessionData() : ISessionData
	{
		return this.currentSessionData;
	}

	UpdateSessionData(playerID : number, sessionUpdateArguments : any) : boolean
	{
		if (JSON.stringify(deepKeys(this.defaultSessionData)) != JSON.stringify(deepKeys(sessionUpdateArguments)))
		{
			console.group(`[SessionServer] Player ${playerID} is attempting to update the session data with additional/missing fields`);
			console.error("Default session data structure:");
			console.error(this.defaultSessionData);
			console.error("Requested session:");
			console.error(sessionUpdateArguments);
			console.error("Current session data structure:");
			console.error(this.currentSessionData);
			console.groupEnd();
			return false;
		}

		this.currentSessionData = sessionUpdateArguments;
		return true;
	}
};

import * as http from 'http';
import * as ws from 'websocket';

//@ts-ignore
import httpShutdown from 'http-shutdown';

type commandSignature = (playerID : number, jsonMessage : any) => any;
export class SessionServer
{
	private commands : {[name : string]: commandSignature} = {};

	private nextSessionID : number = 0;
	private sessions : {[ID : number]: Session} = {};

	private nextPlayerID : number = 0;
	private player : {[ID : number]: ws.connection} = {};
	private sessionIDByPlayerID : {[ID : number]: number} = {};

	private port : number = -1;

	private httpServer : any;
	private wsServer : ws.server;

	private setupCommands()
	{
		const validateSessionIDHelper = (playerID : number, request : string) =>
		{
			if (typeof this.sessionIDByPlayerID[playerID] != "number")
			{
				console.error(`[SessionServer] ${request} requires player '${playerID}' to exist in sessionIDByPlayerID - ensure his connection was handled correctly`);
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": request,
					"error": 1
				}));
				return false;
			}

			if (this.sessionIDByPlayerID[playerID] == -1)
			{
				console.error(`[SessionServer] ${request} requires player '${playerID}' to be in a session`);
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": request,
					"error": 2
				}));
				return false;
			}

			if (!this.sessions[this.sessionIDByPlayerID[playerID]])
			{
				console.error(`[SessionServer] Attemping to run ${request} and player '${playerID}' is in a session (ID: ${this.sessionIDByPlayerID[playerID]}) which doesn't exist (any more)`);
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": request,
					"error": 3
				}));
				return false;
			}

			return true;
		};

		this.commands["createSession"] = (playerID : number, jsonMessage : any) =>
		{
			const newSessionID = this.generateSessionID();
			this.sessions[newSessionID] = new Session(newSessionID, jsonMessage.session, jsonMessage.player);
			if (!this.sessions[newSessionID].AddPlayerByID(playerID))
			{
				console.error(`[SessionServer] Unable to add player ${playerID} to newly created session ${newSessionID}`);
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "sessionJoin",
					"error": 1
				}));
				return;
			}

			console.log(`[SessionServer] Created new session with ID ${newSessionID}`);

			this.sendMessageToPlayer(playerID, JSON.stringify({
				"command": "sessionJoin",
				"error": 0,
				"sessionID": newSessionID,
				"session": this.sessions[newSessionID].GetSessionData()
			}));
		};

		this.commands["updateSession"] = (playerID : number, jsonMessage : any) =>
		{
			console.log(`[SessionServer] Player ${playerID} attempting to update his session`);
			if (!validateSessionIDHelper(playerID, "sessionUpdate"))
			{
				return;
			}

			if (!this.sessions[this.sessionIDByPlayerID[playerID]].UpdateSessionData(playerID, jsonMessage.session))
			{
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "sessionUpdate",
					"error": 4
				}));
			}

			this.sessions[this.sessionIDByPlayerID[playerID]].ForEachPlayer(((playerID : number) =>
			{
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "sessionUpdate",
					"error": 0,
					"session": this.sessions[this.sessionIDByPlayerID[playerID]].GetSessionData()
				}));
			}).bind(this));
		};

		this.commands["updatePlayer"] = (playerID : number, jsonMessage : any) =>
		{
			console.log(`[SessionServer] Player ${playerID} attempting to update hisplayer data`);
			if (!validateSessionIDHelper(playerID, "playerUpdate"))
			{
				return;
			}

			if (!this.sessions[this.sessionIDByPlayerID[playerID]].UpdatePlayerByID(playerID, jsonMessage.player))
			{
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "playerUpdate",
					"error": 4
				}));
			}

			this.sessions[this.sessionIDByPlayerID[playerID]].ForEachPlayer(((playerID : number) =>
			{
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "playerUpdate",
					"error": 0,
					"playerID": playerID,
					"player": this.sessions[jsonMessage]
				}));
			}).bind(this));
		};

		this.commands["joinSession"] = (playerID : number, jsonMessage : any) =>
		{
			// a player can only be connected to one session at a time
			if (this.sessionIDByPlayerID[playerID] != -1)
			{
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "sessionJoin",
					"error": 1
				}));
				return;
			}

			// if client requests to join session -1...
			if (jsonMessage.sessionID == -1)
			{
				// ...and we don't have any current sessions
				if (Object.keys(this.sessions).length <= 0)
				{
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

			if (!this.sessions[jsonMessage.sessionID].AddPlayerByID(playerID))
			{
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
				"session": this.sessions[this.sessionIDByPlayerID[playerID]].GetSessionData()
			}));

			// ... and for every player already connected...
			const newPlayerID = playerID;
			const newPlayerSessionID = this.sessionIDByPlayerID[newPlayerID];
			this.sessions[newPlayerSessionID].ForEachPlayer(((playerID : number) =>
			{
				// ...except for the new player...
				if (playerID != newPlayerID)
				{
					// ...send updates to the new player about the existing player...
					this.sendMessageToPlayer(newPlayerID, JSON.stringify({
						"command": "playerJoin",
						"error": 0,
						"playerID": playerID,
						"player": this.sessions[newPlayerSessionID].GetPlayerDataById(playerID)
					}));

					// ...and send updates to the existing player about the new player...
					this.sendMessageToPlayer(playerID, JSON.stringify({
						"command": "playerJoin",
						"error": 0,
						"playerID": newPlayerID,
						"player": this.sessions[newPlayerSessionID].GetPlayerDataById(newPlayerID)
					}));
				}
			}).bind(this));
		};

		this.commands["leaveSession"] = (playerID : number, jsonMessage : any) =>
		{
			if (!validateSessionIDHelper(playerID, "sessionLeave"))
			{
				return;
			}

			if (!this.sessions[this.sessionIDByPlayerID[playerID]].RemovePlayerByID(playerID))
			{
				this.sendMessageToPlayer(playerID, JSON.stringify({
					"command": "sessionLeave",
					"error": 4
				}));
				return;
			}

			console.log(`[SessionServer] Players left in session ${this.sessionIDByPlayerID[playerID]}: ${this.sessions[this.sessionIDByPlayerID[playerID]].CurrentPlayerCount}`);
			if (!this.sessions[this.sessionIDByPlayerID[playerID]].CurrentPlayerCount)
			{
				console.log(`[SessionServer] Session ${this.sessionIDByPlayerID[playerID]} has no players left; discarding it`);
				delete this.sessions[this.sessionIDByPlayerID[playerID]];
			}

			this.sessionIDByPlayerID[playerID] = -1;

			this.sendMessageToPlayer(playerID, JSON.stringify({
				"command": "sessionLeave",
				"error": 0
			}));
		};
	}

	private generatePlayerMessageHandler(playerID : number)
	{
		return (message : ws.IMessage) => {
			if (message.type === 'utf8')
			{
				try
				{
					const jsonMessage = JSON.parse(message.utf8Data as string);
					this.handleMessage(playerID, jsonMessage);
				}
				catch(e)
				{
					console.group("Invalid JSON string received");
					console.error(message);
					console.error(e);
					console.groupEnd();
				}
			}
		};
	}

	private generatePlayerCloseHandler(playerID : number)
	{
		return (reasonCode : number, description : string) => {
			this.removePlayer(playerID);
		};
	}

	private addPlayer(request : ws.request)
	{
		const connection : ws.connection = request.accept(undefined, request.origin);
		
		const playerID : number = this.generatePlayerID();
		this.player[playerID] = connection;
		this.sessionIDByPlayerID[playerID] = -1;

		this.player[playerID].on('message', this.generatePlayerMessageHandler(playerID));

		this.player[playerID].on('close', this.generatePlayerCloseHandler(playerID));
	}

	private removePlayer(playerID : number)
	{
		console.log(`[SessionServer] Connection from player ${playerID} closed...`);
		if (this.sessionIDByPlayerID[playerID] != -1)
		{
			this.commands.leaveSession(playerID, {});
			this.sessionIDByPlayerID[playerID] = -1;
		}

		delete this.player[playerID];
		delete this.sessionIDByPlayerID[playerID];
	}

	private constructor(port : number)
	{
		this.port = port;

		this.httpServer = httpShutdown(http.createServer(() => {}));

		this.wsServer = new ws.server({ httpServer: this.httpServer });
	}

	static Create(port : number) : Promise<SessionServer>
	{
		return new Promise<SessionServer>((resolve, reject)=>
		{
			const newServer : SessionServer = new SessionServer(port);

			newServer.setupCommands();

			newServer.wsServer.on('request', newServer.addPlayer.bind(newServer));

			newServer.httpServer.on('listening', () =>
			{
				console.log(`[SessionServer] Listening on port ${newServer.port}...`);
				resolve(newServer);
			});

			newServer.wsServer.on('error', () =>
			{
				console.group(`[SessionServer] Error initializing server`);
				reject();
			});

			newServer.httpServer.listen(newServer.port);
		})
	}

	Shutdown() : Promise<void>
	{
		return new Promise((resolve, reject) => {
			this.httpServer.shutdown(()=>{
				resolve();
			});
		});
	}

	Running() : boolean
	{
		return this.httpServer.shutdown();
	}

	private generatePlayerID()
	{
		return this.nextPlayerID++;
	}

	private generateSessionID()
	{
		return this.nextSessionID++;
	}

	private handleMessage(playerID : number, jsonMessage : any)
	{
		if (jsonMessage.command)
		{
			if (typeof this.commands[jsonMessage.command] == "function")
			{
				this.commands[jsonMessage.command].apply(this, [playerID, jsonMessage]);
			}
			else
			{
				console.error(`[SessionServer] no command called "${jsonMessage.command}" available`)
			}
		}
	}

	private sendMessageToPlayer(playerID : number, message : string)
	{
		if (!this.player[playerID])
		{
			console.error(`[SessionServer] No player with ID ${playerID} is connected`);
			return false;
		}

		this.player[playerID].send(message);
		return true;
	}
};