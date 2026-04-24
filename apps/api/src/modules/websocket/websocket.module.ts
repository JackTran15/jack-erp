import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebSocketEventsGateway } from './websocket.gateway';
import { WebSocketEmitterService } from './websocket-emitter.service';

@Module({
  imports: [AuthModule],
  providers: [WebSocketEventsGateway, WebSocketEmitterService],
  exports: [WebSocketEmitterService],
})
export class WebSocketModule {}
