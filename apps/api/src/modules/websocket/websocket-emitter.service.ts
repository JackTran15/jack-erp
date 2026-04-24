import { Injectable, Logger } from '@nestjs/common';
import { WsEvent } from '@erp/shared-interfaces';
import { WebSocketEventsGateway } from './websocket.gateway';

@Injectable()
export class WebSocketEmitterService {
  private readonly logger = new Logger(WebSocketEmitterService.name);

  constructor(private readonly gateway: WebSocketEventsGateway) {}

  emitToOrg(orgId: string, event: WsEvent): void {
    this.assertCorrelationId(event);
    const room = `org:${orgId}`;
    this.gateway.server.to(room).emit(event.eventType, event);
    this.logger.debug(
      `Emitted ${event.eventType} to ${room} (eventId=${event.eventId})`,
    );
  }

  emitToBranch(branchId: string, event: WsEvent): void {
    this.assertCorrelationId(event);
    const room = `branch:${branchId}`;
    this.gateway.server.to(room).emit(event.eventType, event);
    this.logger.debug(
      `Emitted ${event.eventType} to ${room} (eventId=${event.eventId})`,
    );
  }

  emitToUser(userId: string, event: WsEvent): void {
    this.assertCorrelationId(event);
    const room = `user:${userId}`;
    this.gateway.server.to(room).emit(event.eventType, event);
    this.logger.debug(
      `Emitted ${event.eventType} to ${room} (eventId=${event.eventId})`,
    );
  }

  emitToSession(sessionId: string, event: WsEvent): void {
    this.assertCorrelationId(event);
    const room = `session:${sessionId}`;
    this.gateway.server.to(room).emit(event.eventType, event);
    this.logger.debug(
      `Emitted ${event.eventType} to ${room} (eventId=${event.eventId})`,
    );
  }

  private assertCorrelationId(event: WsEvent): void {
    if (!event.correlationId) {
      this.logger.warn(
        `Event ${event.eventId} (${event.eventType}) missing correlationId`,
      );
    }
  }
}
