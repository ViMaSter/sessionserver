# TypeScript session server

Memory-stored session server for use with WebSockets.

## Installation on Node.js

1) Run `npm install sessionserver`.
2) In your script, import the SessionServer variable
```ts
import { SessionServer } from "sessionserver"
```
3) Initialize the server
```ts
const server : Promise<SessionServer> = SessionServer.Create(7000); // 7000 = example port
```
4) Compile and run your script - on success, you should be presented with
```[SessionServer] Listening on port 7000``` in the console output

## Server concepts
### Session and sessionData
A session is composed of [Players](#players) and an associated **SessionData**-set. SessionData is accessible (and modifiable) by all clients. (Important: No authority is granted about who can modify this data.)

When a session is initially created, the SessionData- and PlayerData-format is defined once, so only it's values can change. The only way to change the SessionData- and/or PlayerData-format, is by updating the Session. Important: This will yield in a reset of every players PlayerData-set and the SessionData to it's supplied defaults. (See [updateSession](#updateSession))

### Player and playerData
A **player** is composed of an ID and an associated **PlayerData**-set. PlayerData is accessible to all players, but a player can only modify their own PlayerData-set. A player can only be in **one session at a time**.

If a player leaves a session, the **playerLeave**-event will be send to all remaining players in that session. Associated PlayerData will therefore also be dropped.  
**Note: This also occurs automatically, if the connection to that player is lost.**

## Message format
The server communicates through a WebSocket port (7000 by default) using JSON-encoded objects consisting of a "command"-field and properties changing based on the command. Both server and client use this structure for updates. Client-commands start with the verb (create, update, leave), Server-commands with the object affected (player, session).
Each server-command also comes with an "error"-field, that is set to 0 on success, or any other integer, indicating an error code.
When a player has joined a session (or created one anew) it get's informed about changes of all other player's PlayerData and the SessionData. If SessionData is changed, the Player is responsible for updating it's PlayerData, as it get's reset.

### Example
To create a new session, with a name for each player and the end-time for a match being 01/01/2010 - 00:00:00 Unix timestamp, the following blobs need to be sent:
```json
{
	"command": "createSession",
	"sessionData":
	{
		"endTimeInMS": 1262304000
	},
	"playerData":
	{
		"name": "__unset__"
	}
}
```

Upon joining, the player will receive the following data
```json
{
	"command": "sessionJoin",
	"error": 0,
	"sessionID": 3,
	"playerID": 9,
	"sessionData":
	{
		"endTimeInMS": 1262304000
	}
}
```
`sessionID` represents the ID of the session they've joined. `playerID` represents which ID the player has received from the server.
**For each player** already in the session, a "playerJoin"-command is sent. Two players, "NowYouSeeMe" and "CloudOfDust" are already part of the session; following updates are sent:
```json
{
	"command": "playerJoin",
	"error": 0,
	"playerID": 8,
	"playerData":
	{
		"name": "NowYouSeeMe"
	}
}

{
	"command": "playerJoin",
	"error": 0,
	"playerID": 7,
	"playerData":
	{
		"name": "CloudOfDust"
	}
}
```

### Client to server commands
#### joinSession
`sessionID : int`
#### updateSession
`sessionData : object`  
`playerData : object`
#### leaveSession
`void`
#### updatePlayer
`playerData : object`

### Server to client commands
#### sessionJoin
`sessionID : int`  
`playerID : int`  
`sessionData : int`  
`playerData : int`
#### sessionUpdate
`sessionData : int`  
`playerData : int`
#### sessionLeave
`void`
#### playerJoin
`playerID : int`  
`playerData : int`
#### playerUpdate
`playerID : int`  
`playerData : int`
#### playerLeave
`playerID : int`
