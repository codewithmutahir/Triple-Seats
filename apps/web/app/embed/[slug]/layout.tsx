import type { ReactNode } from "react";
import "@/app/globals.css";

/**
 * Minimal layout for embeddable form — no providers, no auth.
 * Headers for iframe embedding are set in next.config.mjs.
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">
        {children}
      </body>
    </html>
  );
}
