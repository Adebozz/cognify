import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cognify | AI Study Engine",
  description: "Upload notes and build a personalised 3-phase exam practice session.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
