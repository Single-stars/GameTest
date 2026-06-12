import type { Metadata, Viewport } from "next";
import { GameViewportGuard } from "@/features/layout/game-viewport-guard";
import { MobileLongPressGuard } from "@/features/input/mobile-long-press-guard";
import "./globals.css";

const siteUrl = "https://208848.xyz";
const title = "测测你的游戏段位";
const description = "8个小游戏测测你的段位";
const shareImage = "/share-card.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: title,
  openGraph: {
    title,
    description,
    url: "/",
    siteName: title,
    locale: "zh_CN",
    type: "website",
    images: [
      {
        url: shareImage,
        width: 855,
        height: 856,
        alt: title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [shareImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f4ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {process.env.NODE_ENV === "development" ? (
          <>
            <link rel="stylesheet" href="/local-only/styles/homeworld.css" />
            <link rel="stylesheet" href="/local-only/styles/outdoor-adventure.css" />
          </>
        ) : null}
        <GameViewportGuard />
        <MobileLongPressGuard />
        {children}
      </body>
    </html>
  );
}
