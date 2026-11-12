export type Size = { width: number; height: number };
// Pan is measured in unscaled image pixels, after rotation.
export type Camera = { zoom: number; x: number; y: number; rotation: number };
export const MAX_ZOOM = 6;

export function fitPhoto(photo: Size, view: Size, rotation: number) {
  const sideways = rotation % 180 !== 0;
  const width = sideways ? photo.height : photo.width;
  const height = sideways ? photo.width : photo.height;
  const scale = Math.min(view.width / width, view.height / height);
  return { width, height, scale };
}

export function clampPan(camera: Camera, photo: Size, view: Size): Camera {
  const { width, height, scale } = fitPhoto(photo, view, camera.rotation);
  const limitX = Math.max(0, (width * camera.zoom - view.width / scale) / 2);
  const limitY = Math.max(0, (height * camera.zoom - view.height / scale) / 2);
  return {
    ...camera,
    x: Math.max(-limitX, Math.min(limitX, camera.x)),
    y: Math.max(-limitY, Math.min(limitY, camera.y)),
  };
}

export function zoomAt(
  camera: Camera,
  photo: Size,
  view: Size,
  cursorX: number,
  cursorY: number,
  delta: number,
): Camera {
  const zoom = Math.max(
    1,
    Math.min(MAX_ZOOM, camera.zoom * Math.exp(-delta * 0.002)),
  );
  const ratio = zoom / camera.zoom;
  const { scale } = fitPhoto(photo, view, camera.rotation);
  // Keep the pixel under the pointer stationary until reaching an edge.
  return clampPan(
    {
      ...camera,
      zoom,
      x: camera.x * ratio + (cursorX / scale) * (1 - ratio),
      y: camera.y * ratio + (cursorY / scale) * (1 - ratio),
    },
    photo,
    view,
  );
}

export function easeZoom(
  current: Camera,
  target: Camera,
  elapsed: number,
  scale: number,
): Camera {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.zoom - current.zoom;
  if (
    Math.abs(dz) < 0.003 &&
    Math.max(Math.abs(dx), Math.abs(dy)) * scale < 0.5
  )
    return target;
  const step = 1 - Math.exp(-Math.max(1, Math.min(64, elapsed)) / 55);
  return {
    ...current,
    x: current.x + dx * step,
    y: current.y + dy * step,
    zoom: current.zoom + dz * step,
  };
}
