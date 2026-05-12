import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import ThemedPage from "@/components/ThemedPage";
import { ThemeProvider } from "@/lib/ThemeContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Classroom Digital Twin — Prototype",
  description: "AI-Powered Digital Twin Platform for Classroom Intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <ThemeProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto relative">
            <ThemeSwitcher />
            <ThemedPage>{children}</ThemedPage>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
