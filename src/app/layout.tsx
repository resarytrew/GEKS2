import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Северо-Западный фронт: Прибалтика 1941",
  description:
    "Baltic Front 1941 — исторический операционный hex-and-counter варгейм о Прибалтийской оборонительной операции, 22 июня — 9 июля 1941 года.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-staff-void text-staff-ink antialiased">{children}</body>
    </html>
  );
}
