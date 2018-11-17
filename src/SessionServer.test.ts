import {SessionServer} from "./SessionServer" 
import {ISessionData} from "./SessionDataInterface" 

type resolveCallback = (isMatch : boolean) => void;
type rejectCallback = () => void;
class PingPong
{
	private sentMessage : string;
	private expectedResponse : RegExp;
	private websocketClient : WebSocket;
	private isMatch : boolean;

	private resolveMethod : any = () => {};
	private rejectMethod : any = () => {};
 
	public constructor(client : WebSocket, ping : string, pong : RegExp, isMatch : boolean)
	{
		this.websocketClient = client;
		this.sentMessage = ping;
		this.expectedResponse = pong;
		this.isMatch = isMatch;
	}

	public Execute() : Promise<any>
	{ 
		return new Promise<any>(((resolve : resolveCallback, reject : rejectCallback)=>{
			this.websocketClient.addEventListener("message", this.handleMessage.call(this, resolve, reject));
			this.websocketClient.addEventListener("close", this.handleClose.call(this, resolve, reject));
			this.websocketClient.send(this.sentMessage);
		}).bind(this));
	}
	private handleMessage(resolve : resolveCallback, reject : rejectCallback)
	{
		this.resolveMethod = (message : MessageEvent) => {
			this.websocketClient.removeEventListener("message", this.resolveMethod);
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
			this.websocketClient.removeEventListener("close", this.rejectMethod);
			reject();
		};
		return this.rejectMethod;
	}
}

class GameData implements ISessionData
{
	playerPositionX : number = -1;
	playerPositionY : number = -1;
	constructor(parameters : any)
	{
		if (typeof parameters.playerPositionX == "number")
		{
			this.playerPositionX = parameters.playerPositionX;
		}
		if (typeof parameters.playerPositionY == "number")
		{
			this.playerPositionY = parameters.playerPositionY;
		}
	}

	Update(parameters : any) : void
	{
		if (typeof parameters.playerPositionX == "number")
		{
			this.playerPositionX = parameters.playerPositionX;
		}
		if (typeof parameters.playerPositionY == "number")
		{
			this.playerPositionY = parameters.playerPositionY;
		}
	}
};

describe('SessionServer example session', () => {

	const correctPort : number = 7000;
	let server : SessionServer;

	beforeAll(async () => {
		server = await SessionServer.Create(GameData, correctPort);
	});

	afterAll(() => {
		server.Shutdown();
	});

	test('correct raw message ping-pong', async () => {
		const websocketClient : WebSocket = new WebSocket(`ws://localhost:${correctPort}/`);
		await new Promise((resolve, reject)=>{
			websocketClient.addEventListener("open", async () => {
				// create session and retrieve ID
				const createSessionRequest : any = await new PingPong(websocketClient,
					'{"command":"createSession","parameters": {"playerPositionX":20,"playerPositionY":20}}',
					/{"command":"sessionJoin","sessionID":(\d+),"session":{"playerPositionX":20,"playerPositionY":20}}/
				, true).Execute();
				const createSessionID : number = parseInt(createSessionRequest[1]);
				expect(createSessionID).toBeGreaterThan(-1);

				// update a piece and expect session update
				const updateSessionRequest : any = await new PingPong(websocketClient,
					'{"command": "updateSession", "sessionID": '+createSessionID+', "parameters": {"playerPositionX":30,"playerPositionY":30} }',
					/{"command":"sessionUpdate","sessionID":(\d+),"session":{"playerPositionX":30,"playerPositionY":30}}/
				, true).Execute();

				// leave session
				await new PingPong(websocketClient,
					'{"command": "leaveSession", "sessionID": '+createSessionID+' }',
					new RegExp('{"command":"sessionLeave","sessionID":'+createSessionID+'}')
				, true).Execute();
				resolve();
			});
			websocketClient.addEventListener("close", async () => {
				reject();
			});
		});
		websocketClient.close();
	});
});