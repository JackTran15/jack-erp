import { Socket } from 'socket.io';

export interface SocketUserContext {
  userId: string;
  organizationId: string;
  branchIds: string[];
  roles: string[];
  sessionId: string;
}

export interface AuthenticatedSocket extends Socket {
  user: SocketUserContext;
}

export interface SubscribePayload {
  channels: string[];
}

export interface UnsubscribePayload {
  channels: string[];
}
