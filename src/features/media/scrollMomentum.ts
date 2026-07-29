const FRAME_DURATION_MS = 1000 / 60;
const MAX_FRAME_DURATION_MS = 32;
const INPUT_VELOCITY_SCALE = 0.032;
const MAX_VELOCITY_PX_PER_MS = 4.8;
const FRICTION_PER_FRAME = 0.88;
const SETTLED_VELOCITY_PX_PER_MS = 0.02;

export type MomentumFrame = {
  position: number;
  velocity: number;
  settled: boolean;
};

export function addWheelImpulse(velocity: number, deltaPixels: number): number {
  return clamp(
    velocity + deltaPixels * INPUT_VELOCITY_SCALE,
    -MAX_VELOCITY_PX_PER_MS,
    MAX_VELOCITY_PX_PER_MS,
  );
}

export function advanceMomentum(
  position: number,
  velocity: number,
  elapsedMs: number,
  minimum: number,
  maximum: number,
): MomentumFrame {
  if (Math.abs(velocity) < SETTLED_VELOCITY_PX_PER_MS) {
    return { position, velocity: 0, settled: true };
  }

  const frameTime = clamp(elapsedMs, 1, MAX_FRAME_DURATION_MS);
  const nextPosition = clamp(position + velocity * frameTime, minimum, maximum);
  if (
    (nextPosition === minimum && velocity < 0) ||
    (nextPosition === maximum && velocity > 0)
  ) {
    return { position: nextPosition, velocity: 0, settled: true };
  }

  const nextVelocity =
    velocity * Math.pow(FRICTION_PER_FRAME, frameTime / FRAME_DURATION_MS);
  return {
    position: nextPosition,
    velocity: nextVelocity,
    settled: Math.abs(nextVelocity) < SETTLED_VELOCITY_PX_PER_MS,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
