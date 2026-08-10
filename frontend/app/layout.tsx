import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "antd/dist/reset.css";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Agent Loop",
  description: "Agent loop chung với skill, RAG và tool orchestration",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={`${beVietnam.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
