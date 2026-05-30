export const CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR = "rgb(198 198 198)";

const RGB_COLOR_PATTERN = /^rgb\((?:[0-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]) (?:[0-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]) (?:[0-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\)$/;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) return { hue: 0, saturation: 0, lightness };

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return { hue: hue / 6, saturation, lightness };
}

function hslToRgb(hue: number, saturation: number, lightness: number) {
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value] as const;
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hueToRgb = (offset: number) => {
    let t = hue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return [
    Math.round(hueToRgb(1 / 3) * 255),
    Math.round(hueToRgb(0) * 255),
    Math.round(hueToRgb(-1 / 3) * 255),
  ] as const;
}

export function isCustomAvatarOutlineColor(value: string) {
  return RGB_COLOR_PATTERN.test(value);
}

export function getCustomAvatarOutlineColorFromPixels(pixels: Uint8ClampedArray) {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let weightTotal = 0;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.25) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max > 0 ? (max - min) / max : 0;
    const distanceFromWhite = (765 - red - green - blue) / 765;
    const weight = alpha * (0.2 + saturation * 1.6 + distanceFromWhite * 0.8);

    redTotal += red * weight;
    greenTotal += green * weight;
    blueTotal += blue * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) return CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR;

  const averageRed = Math.round(redTotal / weightTotal);
  const averageGreen = Math.round(greenTotal / weightTotal);
  const averageBlue = Math.round(blueTotal / weightTotal);
  const hsl = rgbToHsl(averageRed, averageGreen, averageBlue);
  const saturation = hsl.saturation < 0.08 ? 0 : clamp(hsl.saturation * 1.08, 0.36, 0.72);
  const lightness = hsl.saturation < 0.08 ? clamp(hsl.lightness, 0.34, 0.56) : clamp(hsl.lightness * 0.72, 0.32, 0.46);
  const [red, green, blue] = hslToRgb(hsl.hue, saturation, lightness);

  return `rgb(${red} ${green} ${blue})`;
}

export function getCustomAvatarOutlineColorFromCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width <= 0 || canvas.height <= 0) return CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR;
  return getCustomAvatarOutlineColorFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data);
}

function loadCustomAvatarColorImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("custom-avatar-color-image-load-failed"));
    image.src = url;
  });
}

export async function getCustomAvatarOutlineColorFromBlob(blob: Blob) {
  if (typeof document === "undefined" || typeof Image === "undefined" || typeof URL === "undefined") {
    return CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR;
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await loadCustomAvatarColorImage(url);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (naturalWidth <= 0 || naturalHeight <= 0) return CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR;

    const sampleSize = 96;
    const scale = Math.min(1, sampleSize / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return getCustomAvatarOutlineColorFromCanvas(canvas);
  } catch {
    return CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR;
  } finally {
    URL.revokeObjectURL(url);
  }
}
