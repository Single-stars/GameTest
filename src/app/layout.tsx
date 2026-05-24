import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <MobileLongPressGuard />
        {children}
      </body>
    </html>
  );
}
