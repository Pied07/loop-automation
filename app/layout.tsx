import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Viral Desk | Viral Clips & Social Automation Studio",
  description: "The Viral Desk — Repurpose viral videos into multi-part clips with custom video outros, and auto-publish to YouTube, Facebook, and Instagram.",
  icons: { icon: "/assets/logo.png" },
  verification: {
    google: "NjSfpACEk9YBKqZJJ_B2o8y0XESWmNHwdqQr4ECMNL0",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
