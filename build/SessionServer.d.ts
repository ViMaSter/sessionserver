declare global {
    interface Array<T> {
        remove(elem: T): Array<T>;
    }
}
export declare class SessionServer {
    private commands;
    private nextSessionID;
    private sessions;
    private nextPlayerID;
    private player;
    private sessionIDByPlayerID;
    private port;
    private httpServer;
    private wsServer;
    private setupCommands;
    private generatePlayerMessageHandler;
    private generatePlayerCloseHandler;
    private addPlayer;
    private removePlayer;
    private constructor();
    static Create(port: number): Promise<SessionServer>;
    Shutdown(): Promise<void>;
    Running(): boolean;
    private generatePlayerID;
    private generateSessionID;
    private handleMessage;
    private sendMessageToPlayer;
}
