export const LAB02_QUEUE = 'tasks';

export interface TaskMessage {
  taskId: number;

  /**
   * Optional per-task work time.
   * When absent, the worker falls back to its own WORKER_DELAY.
   */
  durationMs?: number;
}
