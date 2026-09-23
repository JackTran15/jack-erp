import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { WsEventType } from '@erp/shared-interfaces';
import { WebSocketEmitterService } from '../../../websocket/websocket-emitter.service';

/**
 * Best-effort realtime nudge (`NOTIFICATION_CREATED` to room `user:<id>`) so an
 * open client refreshes its badge. NOT queued: a missed nudge is repaired the
 * next time the client loads its inbox, so a retry row would buy nothing.
 */
@Injectable()
export class WebSocketNotifier {
  private readonly logger = new Logger(WebSocketNotifier.name);

  constructor(private readonly emitter: WebSocketEmitterService) {}

  notifyCreated(input: { organizationId: string; notifications: Array<{ id: string; userId: string; type: string }> }): void {
    for (const n of input.notifications) {
      try {
        this.emitter.emitToUser(n.userId, {
          eventId: uuid(),
          eventType: WsEventType.NOTIFICATION_CREATED,
          timestamp: new Date().toISOString(),
          organizationId: input.organizationId,
          correlationId: n.id,
          payload: { notificationId: n.id, type: n.type },
        });
      } catch (err) {
        this.logger.debug(`WS nudge failed for ${n.userId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
