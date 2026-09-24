// Una conexión de navegador, vista por el lobby (sin detalles de WebSocket,
// así las salas se pueden probar sin red).

import type { ServerMessage } from '../../../shared/protocol.ts';
import type { Room } from './room.ts';

export interface Conn {
  /** Viene del mismo computador que el servidor (el del profesor). */
  readonly isLocal: boolean;
  role: 'none' | 'student' | 'teacher';
  /** Sala donde juega (estudiante) o que está mirando (profesor). */
  room: Room | null;
  /** Intentos fallidos de clave de profesor. */
  pinFails: number;
  send(msg: ServerMessage): void;
  /** El navegador no alcanza a leer lo que se le manda (conexión lenta). */
  congested(): boolean;
  close(): void;
}
