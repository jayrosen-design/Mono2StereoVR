import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mono2StereoVR",
  description: "Convert mono 360 video to stereoscopic VR",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
