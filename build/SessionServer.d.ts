export declare class SessionServer {
    private readonly commands;
    private nextSessionID;
    private readonly sessions;
    private nextPlayerID;
    private readonly player;
    private readonly sessionIDByPlayerID;
    private readonly port;
    private readonly httpServer;
    private readonly wsServer;
    private constructor();
    static Create(port: number): Promise<SessionServer>;
    Shutdown(): Promise<void>;
    Running(): boolean;
    private setupCommands;
    private generatePlayerMessageHandler;
    private generatePlayerCloseHandler;
    private readonly addPlayer;
    private removePlayer;
    private generatePlayerID;
    private generateSessionID;
    private handleMessage;
    private sendMessageToPlayer;
}
