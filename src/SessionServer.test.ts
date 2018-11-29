import {SessionServer} from "./SessionServer" 

type resolveCallback = (isMatch : boolean) => void;
type rejectCallback = () => void;
class PingPong
{
	private sentMessage : string;
	private expectedResponse : RegExp;
	private client : WebSocket;
	private isMatch : boolean;

	private resolveMethod : any = () => {};
	private rejectMethod : any = () => {};
 
	public constructor(client : WebSocket, ping : string, pong : RegExp, isMatch : boolean)
	{
		this.client = client;
		this.sentMessage = ping;
		this.expectedResponse = pong;
		this.isMatch = isMatch;
	}

	public Execute() : Promise<any>
	{ 
		return new Promise<any>(((resolve : resolveCallback, reject : rejectCallback)=>{
			this.client.addEventListener("message", this.handleMessage.call(this, resolve, reject));
			this.client.addEventListener("close", this.handleClose.call(this, resolve, reject));
			this.client.send(this.sentMessage);
		}).bind(this));
	}
	private handleMessage(resolve : resolveCallback, reject : rejectCallback)
	{
		this.resolveMethod = (message : MessageEvent) => {
			this.client.removeEventListener("message", this.resolveMethod);
			if (this.isMatch)
			{
				expect(message.data).toMatch(this.expectedResponse);
			}
			else
			{
				expect(message.data).not.toMatch(this.expectedResponse);
			}
			resolve(message.data.match(this.expectedResponse));
		};
		return this.resolveMethod;
	}
	private handleClose(resolve : resolveCallback, reject : rejectCallback)
	{
		this.rejectMethod = () => {
			this.client.removeEventListener("close", this.rejectMethod);
			reject();
		};
		return this.rejectMethod;
	}
}

describe('SessionServer single user session', () => {

	const secureConnection : boolean = false;
	const hostname : string = "localhost";
	const port : number = 7000;
	
	let server : SessionServer;
	let client : WebSocket;

	let sessionID : number = -1;
	let playerID : number = -1;

	beforeAll(async () => {
		// create a server
		server = await SessionServer.Create(port);

		// create a client
		client = new WebSocket(`${secureConnection?"wss":"ws"}://${hostname}:${port}/`);

		// create listeners and wait for success
		await expect(new Promise((resolve, reject)=>{
			client.addEventListener("open", async () => {
				// create session and retrieve ID
				const createSessionRequest : any = await new PingPong(client,
					'{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}',
					/{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/
				, true).Execute();
				sessionID = parseInt(createSessionRequest[1]);
				playerID = parseInt(createSessionRequest[2]);
				expect(sessionID).toBeGreaterThan(-1);
				expect(playerID).toBeGreaterThan(-1);
				resolve();
			})
			client.addEventListener("close", async () => {
				reject();
			});
		})).resolves.toBeUndefined();
	});

	afterAll(() => {
		client.close();
		server.Shutdown();
	});

	test('leaveSession + createSession (same parameters)', async () => {
		// leave session and verify ID
		const leaveSessionRequest : any = await new PingPong(client,
			'{"command": "leaveSession" }',
			/{"command":"sessionLeave","error":0}/
		, true).Execute();

		// create session and retrieve ID
		const createSessionRequest : any = await new PingPong(client,
			'{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
			/{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/
		, true).Execute();
		const newSessionID : number = parseInt(createSessionRequest[1]);
		const newPlayerID : number = parseInt(createSessionRequest[2]);
		expect(newSessionID).not.toBe(sessionID);
		expect(newPlayerID).toBe(playerID);

		sessionID = newSessionID;
		playerID = newPlayerID;
	});


	test('leaveSession + updateSession (fails) + createSession (same parameters)', async () => {
		// leave session and verify ID
		const leaveSessionRequest : any = await new PingPong(client,
			'{"command": "leaveSession" }',
			/{"command":"sessionLeave","error":0}/
		, true).Execute();

		const updateSessionRequest : any = await new PingPong(client,
			'{"command":"updateSession","session": {"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player": {"name":"New Player","position":{"x":-20, "y":-20},"colorHex":16673386}}',
			/{"command":"sessionUpdate","error":2}/
		, true).Execute();

		// create session and retrieve ID
		const createSessionRequest : any = await new PingPong(client,
			'{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
			/{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/
		, true).Execute();
		const newSessionID : number = parseInt(createSessionRequest[1]);
		const newPlayerID : number = parseInt(createSessionRequest[2]);
		expect(newSessionID).not.toBe(sessionID);
		expect(newPlayerID).toBe(playerID);

		sessionID = newSessionID;
		playerID = newPlayerID;
	});


	test('leaveSession + updatePlayer (fails) + createSession (same parameters)', async () => {
		// leave session and verify ID
		const leaveSessionRequest : any = await new PingPong(client,
			'{"command": "leaveSession" }',
			/{"command":"sessionLeave","error":0}/
		, true).Execute();

		const updateSessionRequest : any = await new PingPong(client,
			'{"command":"updatePlayer", "player": {"name":"NotIntentional", "position":{"x":3.23, "y":1.00}, "colorHex":1942370}}',
			/{"command":"playerUpdate","error":2}/
		, true).Execute();

		// create session and retrieve ID
		const createSessionRequest : any = await new PingPong(client,
			'{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
			/{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/
		, true).Execute();
		const newSessionID : number = parseInt(createSessionRequest[1]);
		const newPlayerID : number = parseInt(createSessionRequest[2]);
		expect(newSessionID).not.toBe(sessionID);
		expect(newPlayerID).toBe(playerID);

		sessionID = newSessionID;
		playerID = newPlayerID;
	});


	test('leaveSession + leaveSession (fails) + createSession (same parameters)', async () => {
		// leave session and verify ID
		const leaveSessionRequest : any = await new PingPong(client,
			'{"command": "leaveSession" }',
			/{"command":"sessionLeave","error":0}/
		, true).Execute();

		const updateSessionRequest : any = await new PingPong(client,
			'{"command":"leaveSession" }',
			/{"command":"sessionLeave","error":2}/
		, true).Execute();

		// create session and retrieve ID
		const createSessionRequest : any = await new PingPong(client,
			'{"command":"createSession","session": {"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player": {"name":"Unnamed Player","position":{"x":-1, "y":-1},"colorHex":49407}}',
			/{"command":"sessionJoin","error":0,"sessionID":(\d+),"playerID":(\d+),"session":{"mapName":"castle","gameType":"DeathMatch","currentMatchStart":1543236582000},"player":{"name":"Unnamed Player","position":{"x":-1,"y":-1},"colorHex":49407}}/
		, true).Execute();
		const newSessionID : number = parseInt(createSessionRequest[1]);
		const newPlayerID : number = parseInt(createSessionRequest[2]);
		expect(newSessionID).not.toBe(sessionID);
		expect(newPlayerID).toBe(playerID);

		sessionID = newSessionID;
		playerID = newPlayerID;
	});

	test('updateSession', async () => {
		const updateSessionRequest : any = await new PingPong(client,
			'{"command":"updateSession","session": {"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player": {"name":"New Player","position":{"x":-20, "y":-20},"colorHex":16673386}}',
			/{"command":"sessionUpdate","error":0,"session":{"mapName":"desert","gameType":"CaptureTheFlag","currentMatchStart":1543237287000},"player":{"name":"New Player","position":{"x":-20,"y":-20},"colorHex":16673386}}/
		, true).Execute();
	});

	test('updatePlayer', async () => {
		const updateSessionRequest : any = await new PingPong(client,
			'{"command":"updatePlayer", "player": {"name":"DontLookNow", "position":{"x":14, "y":27}, "colorHex":16740352}}',
			/{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"DontLookNow","position":{"x":14,"y":27},"colorHex":16740352}}/
		, true).Execute();
		const newPlayerID : number = parseInt(updateSessionRequest[1]);
		expect(newPlayerID).toBe(playerID);

		const updateSessionRequest2 : any = await new PingPong(client,
			'{"command":"updatePlayer", "player": {"name":"NotIntentional", "position":{"x":3.23, "y":1.000000000001}, "colorHex":1942370}}',
			/{"command":"playerUpdate","error":0,"playerID":(\d+),"player":{"name":"NotIntentional","position":{"x":3.23,"y":1.000000000001},"colorHex":1942370}}/
		, true).Execute();
		const newPlayerID2 : number = parseInt(updateSessionRequest[1]);
		expect(newPlayerID2).toBe(playerID);
		expect(newPlayerID2).toBe(newPlayerID);
	});
});