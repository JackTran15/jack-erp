import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { SessionStore } from '../redis/session.store';
import {
  AuthenticatedSocket,
  SubscribePayload,
  UnsubscribePayload,
} from './websocket.types';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*', credentials: true },
})
export class WebSocketEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebSocketEventsGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly sessionStore: SessionStore,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.rejectConnection(client, 'Authentication required');
        return;
      }

      const jwtPayload = this.authService.verifyAccessToken(token);

      const session = await this.sessionStore.getSession(jwtPayload.jti);
      if (!session) {
        this.logger.warn(
          `Connection rejected: session revoked (${client.id}, jti=${jwtPayload.jti})`,
        );
        this.rejectConnection(client, 'Session expired or revoked');
        return;
      }

      client.user = {
        userId: session.userId,
        organizationId: session.organizationId,
        branchIds: session.branchIds,
        roles: session.roles,
        sessionId: jwtPayload.jti,
      };

      this.logger.log(
        `Client connected: ${client.id} (user=${client.user.userId})`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Connection error: ${message}`);
      this.rejectConnection(client, 'Authentication failed');
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.user?.userId ?? 'unknown';
    this.logger.log(`Client disconnected: ${client.id} (user=${userId})`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SubscribePayload,
  ): { success: boolean; channels: string[] } {
    if (!client.user) {
      return { success: false, channels: [] };
    }

    const joined: string[] = [];
    for (const channel of payload.channels) {
      if (this.isChannelAccessAllowed(client, channel)) {
        client.join(channel);
        joined.push(channel);
        this.logger.debug(`Client ${client.id} joined channel: ${channel}`);
      } else {
        this.logger.warn(
          `Channel access denied: ${client.id} attempted ${channel}`,
        );
      }
    }

    return { success: true, channels: joined };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: UnsubscribePayload,
  ): { success: boolean } {
    for (const channel of payload.channels) {
      client.leave(channel);
      this.logger.debug(`Client ${client.id} left channel: ${channel}`);
    }
    return { success: true };
  }

  private rejectConnection(client: AuthenticatedSocket, reason: string): void {
    this.logger.warn(`Connection rejected (${client.id}): ${reason}`);
    client.emit('error', { message: reason });
    client.disconnect(true);
  }

  private isChannelAccessAllowed(
    client: AuthenticatedSocket,
    channel: string,
  ): boolean {
    const { organizationId, branchIds, userId, sessionId } = client.user;

    if (channel === `org:${organizationId}`) return true;

    if (channel.startsWith('branch:')) {
      const branchId = channel.slice('branch:'.length);
      return branchIds.includes(branchId);
    }

    if (channel === `user:${userId}`) return true;

    if (channel === `session:${sessionId}`) return true;

    return false;
  }
}
