export interface HealthResponse {
  status: "ok";
  uptimeSeconds: number;
}

export interface GameStateSnapshot {
  id: string;
  version: number;
}
