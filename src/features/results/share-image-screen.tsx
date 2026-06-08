"use client";

import NextImage from "next/image";
import { type GameRankResult } from "@/lib/scoring";
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH } from "@/features/results/share-image";

type ImageShareState = "idle" | "sharing" | "saved" | "failed";

export function ShareImageScreen({
  appTitle,
  dataUrl,
  imageShareState,
  onBack,
  rankTitle,
  result,
  shareCopyNoticeId,
}: {
  appTitle: string;
  dataUrl: string | null;
  imageShareState: ImageShareState;
  onBack: () => void;
  rankTitle: string | null;
  result: GameRankResult | null;
  shareCopyNoticeId: number;
}) {
  return (
    <section className="share-image-screen">
      <div className="share-image-header">
        <button className="secondary-button compact-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <div>
          <p className="eyebrow">长按保存图片</p>
          <h1>{rankTitle ?? result?.name ?? appTitle}</h1>
        </div>
      </div>

      {shareCopyNoticeId > 0 ? (
        <div className="share-copy-toast" key={shareCopyNoticeId}>
          分享链接已复制
        </div>
      ) : null}

      <div className="share-image-stage">
        {dataUrl ? (
          <NextImage
            alt={`${rankTitle ?? result?.name ?? appTitle}分享图`}
            className="share-image-preview"
            height={SHARE_IMAGE_HEIGHT}
            src={dataUrl}
            unoptimized
            width={SHARE_IMAGE_WIDTH}
          />
        ) : imageShareState === "failed" ? (
          <div className="share-image-placeholder">
            <strong>生成失败</strong>
            <span>返回后重试</span>
          </div>
        ) : (
          <div className="share-image-placeholder">
            <strong>生成中</strong>
            <span>正在绘制结果图</span>
          </div>
        )}
      </div>

    </section>
  );
}
