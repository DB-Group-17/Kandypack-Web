import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

// Plus Jakarta Sans is the single interface font (DESIGN.md §3). Exposed as --font-jakarta and
// mapped to Tailwind's `font-sans` in globals.css; monospace falls back to the system stack.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

