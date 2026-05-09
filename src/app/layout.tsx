import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "游戏人格测试",
  description: "基于 8 个短操作任务生成段位结果。",
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
