import QRCode from "qrcode";

import { ROUND_DISPLAY_BY_ID } from "@/lib/round-display";
import { type GameRankResult, type ScoreAxis } from "@/lib/scoring";

export const SHARE_IMAGE_WIDTH = 900;
export const SHARE_IMAGE_HEIGHT = 820;

export type ShareImageInput =
  | {
      kind: "result";
      avatarDataUrl?: string | null;
      rankTitle: string;
      result: GameRankResult;
      url: string;
    }
  | {
      kind: "default";
      avatarDataUrl?: string | null;
      url: string;
    };

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback for in-app browsers with stricter clipboard handling.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command failed");
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function createShareImage(input: ShareImageInput, tagline: string) {
  const canvas = document.createElement("canvas");
  const width = SHARE_IMAGE_WIDTH;
  const height = SHARE_IMAGE_HEIGHT;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  ctx.fillStyle = "#f7f4ee";
  ctx.fillRect(0, 0, width, height);

  const qrDataUrl = await QRCode.toDataURL(input.url, {
    color: { dark: "#181818", light: "#fffdf8" },
    errorCorrectionLevel: "M",
    margin: 1,
    width: 144,
  });
  const qrImage = await loadCanvasImage(qrDataUrl);
  const avatarImage = input.avatarDataUrl ? await loadCanvasImage(input.avatarDataUrl) : null;

  if (input.kind === "default") {
    drawCard(ctx, 24, 24, 852, 510);
    drawFittedText(ctx, "热血青铜", 58, 116, 640, 72, 48, "#181818");
    drawShareAvatarScreenshot(ctx, avatarImage, 704, 46, 132);

    drawRadarOnCanvas(ctx, defaultShareAxis(), 450, 342, 124);

    drawQrFooter(ctx, qrImage, 562, "扫码开测", tagline);
    return canvas.toDataURL("image/png");
  }

  drawCard(ctx, 24, 24, 852, 144);
  drawFittedText(ctx, input.rankTitle, 58, 116, 640, 72, 42, "#181818");
  drawShareAvatarScreenshot(ctx, avatarImage, 724, 30, 132);

  drawCard(ctx, 24, 194, 852, 352);
  drawRadarOnCanvas(ctx, input.result.axis, 450, 374, 112);
  drawQrFooter(ctx, qrImage, 574, "扫码来测", tagline);

  return canvas.toDataURL("image/png");
}

function defaultShareAxis(): ScoreAxis[] {
  const axis: Array<{ key: ScoreAxis["key"]; label: ScoreAxis["label"] }> = [
    { key: "reaction", label: ROUND_DISPLAY_BY_ID.reaction.label },
    { key: "targeting", label: ROUND_DISPLAY_BY_ID.aim.label },
    { key: "search", label: ROUND_DISPLAY_BY_ID.search.label },
    { key: "interference", label: ROUND_DISPLAY_BY_ID.stroop.label },
    { key: "rhythm", label: ROUND_DISPLAY_BY_ID.rhythm.label },
    { key: "memory", label: ROUND_DISPLAY_BY_ID.memory.label },
    { key: "braking", label: ROUND_DISPLAY_BY_ID.braking.label },
    { key: "waiting", label: ROUND_DISPLAY_BY_ID.patience.label },
  ];
  return axis.map((item) => ({
    ...item,
    score: 72,
  }));
}

function drawQrFooter(ctx: CanvasRenderingContext2D, qrImage: HTMLImageElement, y: number, title: string, subtitle: string) {
  drawCard(ctx, 24, y, 852, 210);

  const qrX = 58;
  const qrY = y + 34;
  roundedRect(ctx, qrX - 12, qrY - 12, 168, 168, 16);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.strokeStyle = "rgba(24, 24, 24, 0.1)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.drawImage(qrImage, qrX, qrY, 144, 144);

  drawText(ctx, title, 252, y + 86, "900 34px", "#181818");
  drawText(ctx, subtitle, 252, y + 132, "760 26px", "#665f55");
}

function drawShareAvatarScreenshot(
  ctx: CanvasRenderingContext2D,
  avatarImage: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
) {
  if (!avatarImage) return;
  ctx.drawImage(avatarImage, x, y, size, size);
}

function drawRadarOnCanvas(ctx: CanvasRenderingContext2D, axis: ScoreAxis[], centerX: number, centerY: number, radius: number) {
  const angleFor = (index: number) => -Math.PI / 2 + (index / axis.length) * Math.PI * 2;
  const point = (index: number, scale: number) => {
    const angle = angleFor(index);
    return {
      x: centerX + Math.cos(angle) * radius * scale,
      y: centerY + Math.sin(angle) * radius * scale,
    };
  };

  ctx.lineWidth = 3;
  for (const scale of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    axis.forEach((_, index) => {
      const current = point(index, scale);
      if (index === 0) ctx.moveTo(current.x, current.y);
      else ctx.lineTo(current.x, current.y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(24, 24, 24, 0.12)";
    ctx.stroke();
  }

  axis.forEach((_, index) => {
    const outer = point(index, 1);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(outer.x, outer.y);
    ctx.strokeStyle = "rgba(24, 24, 24, 0.12)";
    ctx.stroke();
  });

  ctx.beginPath();
  axis.forEach((item, index) => {
    const current = point(index, item.score / 100);
    if (index === 0) ctx.moveTo(current.x, current.y);
    else ctx.lineTo(current.x, current.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(27, 154, 170, 0.22)";
  ctx.strokeStyle = "#1b9aaa";
  ctx.lineWidth = 9;
  ctx.fill();
  ctx.stroke();

  axis.forEach((item, index) => {
    const labelPoint = point(index, 1.28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawText(ctx, item.label, labelPoint.x, labelPoint.y, "850 22px", "#665f55", "center");
  });
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  color: string,
) {
  let size = maxSize;
  do {
    ctx.font = `950 ${size}px Inter, "Microsoft YaHei", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 2;
  } while (size >= minSize);
  drawText(ctx, text, x, y, `950 ${size}px`, color);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${font} Inter, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  roundedRect(ctx, x, y, width, height, 16);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.strokeStyle = "#d8d0c4";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const right = x + width;
  const bottom = y + height;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
