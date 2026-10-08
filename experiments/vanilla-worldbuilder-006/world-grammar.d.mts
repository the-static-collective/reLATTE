export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface FillOperation {
  kind: 'fill';
  from: WorldPosition;
  to: WorldPosition;
  block: string;
}

export interface SetBlockOperation {
  kind: 'setblock';
  at: WorldPosition;
  block: string;
}

export interface SummonOperation {
  kind: 'summon';
  entity: string;
  at: WorldPosition;
}

export type WorldOperation = FillOperation | SetBlockOperation | SummonOperation;

export interface WorldAnchor {
  at: WorldPosition;
  block: string;
  role: string;
}

export interface WorldPlan {
  schema: 'relatte.vanilla-world-plan/v0';
  goal: string;
  server_seed: string;
  seed: number;
  palette: {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    light: string;
    leaf: string;
    log: string;
    floor: string;
  };
  districts: string[];
  operations: WorldOperation[];
  anchors: WorldAnchor[];
  plan_sha256: string;
}

export const WORLD_BOUNDS: {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

export function buildWorldPlan(args: {
  goal: string;
  serverSeed: string | number;
}): WorldPlan;

export function operationToCommand(op: WorldOperation): string;

export function validateWorldPlan(plan: WorldPlan): true;
