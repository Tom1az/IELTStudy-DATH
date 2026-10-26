import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "IELTStudy – Adaptive IELTS learning", template: "%s · IELTStudy" },
  description: "Climb from Band 4 to Band 7, one skill at a time. Adaptive IELTS Academic courses in Listening, Reading, Writing and Speaking.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FAF7F0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
