export type CustomAvatarImageSize = {
  width: number;
  height: number;
};

export type CustomAvatarCropTransform = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type CustomAvatarSourceCrop = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export const CUSTOM_AVATAR_MIN_ZOOM = 1;
export const CUSTOM_AVATAR_MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundCropNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function getCustomAvatarBaseScale(imageSize: CustomAvatarImageSize, frameSize: number) {
  const safeFrameSize = positive(frameSize, 1);
  const width = positive(imageSize.width, safeFrameSize);
  const height = positive(imageSize.height, safeFrameSize);
  return Math.max(safeFrameSize / width, safeFrameSize / height);
}

export function clampCustomAvatarCropTransform(
  transform: CustomAvatarCropTransform,
  imageSize: CustomAvatarImageSize,
  frameSize: number,
): CustomAvatarCropTransform {
  const zoom = clamp(transform.zoom, CUSTOM_AVATAR_MIN_ZOOM, CUSTOM_AVATAR_MAX_ZOOM);
  const baseScale = getCustomAvatarBaseScale(imageSize, frameSize);
  const displayWidth = positive(imageSize.width, frameSize) * baseScale * zoom;
  const displayHeight = positive(imageSize.height, frameSize) * baseScale * zoom;
  const maxOffsetX = Math.max(0, (displayWidth - positive(frameSize, 1)) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - positive(frameSize, 1)) / 2);

  return {
    offsetX: roundCropNumber(clamp(transform.offsetX, -maxOffsetX, maxOffsetX)),
    offsetY: roundCropNumber(clamp(transform.offsetY, -maxOffsetY, maxOffsetY)),
    zoom: roundCropNumber(zoom),
  };
}

export function getCustomAvatarSourceCrop(
  transform: CustomAvatarCropTransform,
  imageSize: CustomAvatarImageSize,
  frameSize: number,
): CustomAvatarSourceCrop {
  const clamped = clampCustomAvatarCropTransform(transform, imageSize, frameSize);
  const width = positive(imageSize.width, frameSize);
  const height = positive(imageSize.height, frameSize);
  const scale = getCustomAvatarBaseScale({ width, height }, frameSize) * clamped.zoom;
  const sw = positive(frameSize, 1) / scale;
  const sh = positive(frameSize, 1) / scale;
  const sx = clamp(width / 2 - clamped.offsetX / scale - sw / 2, 0, width - sw);
  const sy = clamp(height / 2 - clamped.offsetY / scale - sh / 2, 0, height - sh);

  return {
    sx: roundCropNumber(sx),
    sy: roundCropNumber(sy),
    sw: roundCropNumber(sw),
    sh: roundCropNumber(sh),
  };
}
