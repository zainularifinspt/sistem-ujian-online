import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Sistem Ujian Online",
  description: "Frontend sistem ujian online mahasiswa berbasis token"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${outfit.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
