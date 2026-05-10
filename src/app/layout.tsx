import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "测测你的游戏段位",
  description: "8个小游戏测测你的段位",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
