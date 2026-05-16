"use client";

import { ShareIcon } from "@/features/results/result-icons";

export function HomeScreen({
  onShareImage,
  onStart,
  title,
}: {
  onShareImage: () => void;
  onStart: () => void;
  title: string;
}) {
  return (
    <section className="home-screen">
      <button aria-label="生成默认分享图片" className="icon-button home-image-button" type="button" onPointerDown={onShareImage}>
        <ShareIcon />
      </button>
      <div className="hero-copy compact">
        <h1>{title}</h1>
      </div>
      <button className="primary-button hero-button" type="button" onPointerDown={onStart}>
        开始
      </button>
    </section>
  );
}
