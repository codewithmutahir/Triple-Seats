import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { AuthSessionProvider } from "@/components/auth-session-provider";
import { Providers } from "@/components/providers";
import { getServerAuthSession } from "@/lib/server-auth-session";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair"
});

export const metadata: Metadata = {
  title: {
    default: "Tripeseats — Catering business software",
    template: "%s | Tripeseats"
  },
  description: "Run your catering business on one platform — bookings, quotes, and events."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  const initialUser = session?.user ?? null;

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="font-sans antialiased">
        <AuthSessionProvider initialUser={initialUser}>
          <Providers>{children}</Providers>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
