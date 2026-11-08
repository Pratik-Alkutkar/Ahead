import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Onboarding } from "@/components/Onboarding";
import { Toast } from "@/components/Toast";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const brand = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-brand", display: "swap" });

export const metadata: Metadata = {
  title: "Ahead",
  description: "Your money, a little clearer.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={brand.variable}>
      <body>
        <StoreProvider>
          <Nav />
          <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
            {children}
            <footer className="mt-12 text-center text-[13px] text-faint">For education only. Not financial advice.</footer>
          </main>
          <Toast />
          <Onboarding />
        </StoreProvider>
      </body>
    </html>
  );
}
