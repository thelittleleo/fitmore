import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitmore",
  description: "Personal health intelligence — Fitbit Air data turned into insight",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
