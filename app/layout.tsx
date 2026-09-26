import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kandypack — Logistics Workspace",
  description: "Rail & road distribution management platform for Kandypack FMCG logistics",
};

/**
 * RootLayout provides the top-level HTML document structure and mounts global providers.
 * Keeps server component purity for metadata while supplying client-side AuthProvider to all routes.
 *
 * @param {Readonly<{ children: React.ReactNode }>} props - Child route segments
 * @returns {JSX.Element} The rendered root layout HTML structure
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

