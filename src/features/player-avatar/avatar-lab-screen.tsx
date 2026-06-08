"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import type { AdvancedProgress } from "@/lib/advanced-progress";
import { AvatarLabIcon, LockIcon } from "@/features/results/result-icons";
import { PlayerAvatar } from "@/features/player-avatar/player-avatar";
import { getCustomAvatarOutlineColorFromCanvas } from "@/features/player-avatar/custom-avatar-color";
import {
  clampCustomAvatarCropTransform,
  getCustomAvatarBaseScale,
  getCustomAvatarSourceCrop,
  type CustomAvatarCropTransform,
  type CustomAvatarImageSize,
} from "@/features/player-avatar/custom-avatar-crop";
import {
  CUSTOM_AVATAR_MAX_SYNC_BYTES,
  CUSTOM_AVATAR_OUTPUT_SIZE,
  getCustomAvatarFileError,
} from "@/features/player-avatar/custom-avatar-storage";
import {
  PLAYER_AVATAR_SKIN_DESCRIPTIONS,
  PLAYER_AVATAR_SKIN_LABELS,
  getPlayerAvatarSkinDisplayItems,
  isPlayerAvatarSkinUnlocked,
  type PlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar-skin";

const CROP_FRAME_SIZE = 260;
const INITIAL_CROP_TRANSFORM: CustomAvatarCropTransform = { offsetX: 0, offsetY: 0, zoom: 1 };
const CUSTOM_AVATAR_WEBP_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42] as const;

type CropSource = {
  image: HTMLImageElement;
  size: CustomAvatarImageSize;
  url: string;
};

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("custom-avatar-image-load-failed"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function drawCustomAvatarCrop(
  image: HTMLImageElement,
  transform: CustomAvatarCropTransform,
  imageSize: CustomAvatarImageSize,
  frameSize: number,
  outputSize: number,
) {
  const crop = getCustomAvatarSourceCrop(transform, imageSize, frameSize);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outputSize, outputSize);
  return canvas;
}

async function createCustomAvatarBlob(
  image: HTMLImageElement,
  transform: CustomAvatarCropTransform,
  imageSize: CustomAvatarImageSize,
  frameSize: number,
) {
  let bestBlob: Blob | null = null;
  let outlineColor = "";
  for (const outputSize of [CUSTOM_AVATAR_OUTPUT_SIZE, 288, 256]) {
    const canvas = drawCustomAvatarCrop(image, transform, imageSize, frameSize, outputSize);
    if (!canvas) continue;
    if (!outlineColor) outlineColor = getCustomAvatarOutlineColorFromCanvas(canvas);
    for (const quality of CUSTOM_AVATAR_WEBP_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/webp", quality);
      if (!blob) continue;
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= CUSTOM_AVATAR_MAX_SYNC_BYTES) return { blob, outlineColor };
    }
  }

  if (bestBlob) return { blob: bestBlob, outlineColor };
  const fallbackCanvas = drawCustomAvatarCrop(image, transform, imageSize, frameSize, CUSTOM_AVATAR_OUTPUT_SIZE);
  if (!fallbackCanvas) return null;
  return {
    blob: await canvasToBlob(fallbackCanvas, "image/png"),
    outlineColor: outlineColor || getCustomAvatarOutlineColorFromCanvas(fallbackCanvas),
  };
}

export function AvatarLabScreen({
  advancedProgress,
  customAvatarImageUrl,
  onBack,
  onSaveCustomAvatarImage,
  onSelectSkin,
  selectedSkin,
}: {
  advancedProgress: AdvancedProgress;
  customAvatarImageUrl: string | null;
  onBack: () => void;
  onSaveCustomAvatarImage: (blob: Blob, outlineColor: string) => Promise<boolean>;
  onSelectSkin: (skin: PlayerAvatarSkin) => void;
  selectedSkin: PlayerAvatarSkin;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cropFrameSize, setCropFrameSize] = useState(CROP_FRAME_SIZE);
  const [cropTransform, setCropTransform] = useState<CustomAvatarCropTransform>(INITIAL_CROP_TRANSFORM);
  const [cropError, setCropError] = useState("");
  const [cropSaving, setCropSaving] = useState(false);
  const skinItems = getPlayerAvatarSkinDisplayItems(advancedProgress);
  const customSkinUnlocked = isPlayerAvatarSkinUnlocked("custom", advancedProgress);
  const customActionsVisible = selectedSkin === "custom" && customSkinUnlocked;

  const cropImageStyle = useMemo(() => {
    if (!cropSource) return undefined;
    const scale = getCustomAvatarBaseScale(cropSource.size, cropFrameSize) * cropTransform.zoom;
    return {
      height: `${cropSource.size.height * scale}px`,
      transform: `translate(-50%, -50%) translate(${cropTransform.offsetX}px, ${cropTransform.offsetY}px)`,
      width: `${cropSource.size.width * scale}px`,
    } as CSSProperties;
  }, [cropFrameSize, cropSource, cropTransform.offsetX, cropTransform.offsetY, cropTransform.zoom]);

  const closeCropDialog = useCallback(() => {
    setCropSource((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setCropError("");
    setCropSaving(false);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (!cropSource) return undefined;
    const measureFrame = () => {
      const nextFrameSize = cropFrameRef.current?.clientWidth || CROP_FRAME_SIZE;
      setCropFrameSize(nextFrameSize);
      setCropTransform((current) => clampCustomAvatarCropTransform(current, cropSource.size, nextFrameSize));
    };
    measureFrame();
    window.addEventListener("resize", measureFrame);
    return () => window.removeEventListener("resize", measureFrame);
  }, [cropSource]);

  useEffect(() => {
    return () => {
      setCropSource((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return null;
      });
    };
  }, []);

  const openCustomAvatarPicker = () => {
    setCropError("");
    fileInputRef.current?.click();
  };

  const handleFileChange = async () => {
    const file = fileInputRef.current?.files?.[0] ?? null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    const fileError = getCustomAvatarFileError(file);
    if (fileError || !file) {
      setCropError(fileError ?? "请选择图片文件");
      return;
    }

    const url = URL.createObjectURL(file);
    try {
      const image = await loadImageFromUrl(url);
      const nextSource = {
        image,
        size: { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height },
        url,
      };
      setCropSource((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return nextSource;
      });
      setCropTransform(INITIAL_CROP_TRANSFORM);
      setCropError("");
    } catch {
      URL.revokeObjectURL(url);
      setCropError("图片读取失败，请换一张图片");
    }
  };

  const updateCropTransform = (next: CustomAvatarCropTransform) => {
    if (!cropSource) return;
    setCropTransform(clampCustomAvatarCropTransform(next, cropSource.size, cropFrameSize));
  };

  const beginCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!cropSource) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropTransform.offsetX,
      originY: cropTransform.offsetY,
    };
  };

  const moveCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateCropTransform({
      ...cropTransform,
      offsetX: drag.originX + event.clientX - drag.startX,
      offsetY: drag.originY + event.clientY - drag.startY,
    });
  };

  const endCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const saveCustomAvatar = async () => {
    if (!cropSource || cropSaving) return;
    setCropSaving(true);
    setCropError("");
    const customAvatar = await createCustomAvatarBlob(cropSource.image, cropTransform, cropSource.size, cropFrameSize);
    if (!customAvatar?.blob) {
      setCropSaving(false);
      setCropError("图片处理失败，请换一张图片");
      return;
    }
    const saved = await onSaveCustomAvatarImage(customAvatar.blob, customAvatar.outlineColor);
    if (!saved) {
      setCropSaving(false);
      setCropError("保存失败，当前浏览器可能禁止本地存储");
      return;
    }
    onSelectSkin("custom");
    closeCropDialog();
  };

  return (
    <section className="avatar-lab-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onClick={onBack}>
          返回
        </button>
        <span>小方块皮肤</span>
      </header>

      <div className="avatar-lab-stage">
        <div className="avatar-lab-preview">
          <PlayerAvatar action="idle" customImageUrl={customAvatarImageUrl} effect="none" expression="neutral" skin={selectedSkin} size={132} />
        </div>
        <p>{PLAYER_AVATAR_SKIN_LABELS[selectedSkin]}</p>
        {customActionsVisible ? (
          <div className="avatar-lab-custom-actions">
            <button
              aria-label={customAvatarImageUrl ? "更换图片" : "制作头像"}
              className="avatar-lab-custom-icon-button"
              type="button"
              onClick={openCustomAvatarPicker}
            >
              <AvatarLabIcon />
            </button>
            <input ref={fileInputRef} className="avatar-lab-file-input" type="file" accept="image/*" onChange={handleFileChange} />
          </div>
        ) : null}
        {cropError && !cropSource ? <small className="avatar-lab-custom-status">{cropError}</small> : null}
      </div>

      <div className="avatar-lab-controls">
        <section className="avatar-lab-section">
          <h2>皮肤</h2>
          <div className="avatar-lab-skin-list">
            {skinItems.map(({ skin, unlock }) => {
              return (
                <button
                  aria-pressed={selectedSkin === skin}
                  className={`avatar-lab-skin-row ${selectedSkin === skin ? "selected" : ""} ${unlock.unlocked ? "unlocked" : "locked"}`}
                  disabled={!unlock.unlocked}
                  key={skin}
                  onClick={() => {
                    if (unlock.unlocked) onSelectSkin(skin);
                  }}
                  type="button"
                >
                  <PlayerAvatar action="idle" customImageUrl={customAvatarImageUrl} expression="neutral" skin={skin} size={44} />
                  <span className="avatar-lab-skin-copy">
                    <strong>{PLAYER_AVATAR_SKIN_LABELS[skin]}</strong>
                    <small>{PLAYER_AVATAR_SKIN_DESCRIPTIONS[skin]}</small>
                    <em>{unlock.label}</em>
                  </span>
                  {!unlock.unlocked ? (
                    <span className="avatar-lab-lock" aria-hidden="true">
                      <LockIcon />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {cropSource ? (
        <div className="avatar-lab-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-lab-crop-title">
          <div className="avatar-lab-crop-card">
            <button className="avatar-lab-crop-close" type="button" aria-label="关闭裁剪面板" onClick={closeCropDialog}>
              ×
            </button>
            <h2 id="avatar-lab-crop-title">裁剪头像</h2>
            <div
              className="avatar-lab-crop-frame"
              ref={cropFrameRef}
              onPointerCancel={endCropDrag}
              onPointerDown={beginCropDrag}
              onPointerMove={moveCropDrag}
              onPointerUp={endCropDrag}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Cropping previews a user-selected blob URL. */}
              <img alt="" draggable={false} src={cropSource.url} style={cropImageStyle} />
            </div>
            <input
              aria-label="缩放图片"
              className="avatar-lab-crop-zoom"
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={cropTransform.zoom}
              onChange={(event) => updateCropTransform({ ...cropTransform, zoom: Number(event.currentTarget.value) })}
            />
            {cropError ? <p className="avatar-lab-custom-status">{cropError}</p> : null}
            <div className="avatar-lab-crop-actions">
              <button type="button" onClick={closeCropDialog}>
                取消
              </button>
              <button type="button" disabled={cropSaving} onClick={saveCustomAvatar}>
                {cropSaving ? "保存中" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
