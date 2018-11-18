declare global {
    interface Array<T> {
        remove(elem: T): Array<T>;
    }
}
import { ISessionDataConstructor as ISessionDataConstructor } from './SessionDataInterface';
export declare class SessionServer {
    private commands;
    private nextSessionID;
    private sessions;
    private nextPlayerID;
    private player;
    private sessionType;
    private port;
    private httpServer;
    private wsServer;
    private validateSessionID;
    private setupCommands;
    private generatePlayerMessageHandler;
    private generatePlayerCloseHandler;
    private removePlayer;
    private handleNewPlayer;
    private constructor();
    static Create(sessionType: ISessionDataConstructor, port: number): Promise<SessionServer>;
    Shutdown(): Promise<void>;
    Running(): boolean;
    private generatePlayerID;
    private generateSessionID;
    private handleMessage;
    private sendMessageToPlayer;
}
