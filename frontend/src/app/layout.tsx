import type { Metadata } from "next";
import { Providers } from "@/providers";
import "./globals.css";

export const metadata: Metadata = {
    title: "SportBooking - Reserva instalaciones deportivas",
    description:
        "Plataforma para la gestión y reserva de instalaciones deportivas",
};

// Script inyectado inline para evitar flash de tema incorrecto
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (systemDark ? 'dark' : 'light');
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  } catch(e) {}
})();
`;

export default function RootLayout({
    children,
}: {
        children: React.ReactNode;
}) {
    return (
      <html lang="es" suppressHydrationWarning>
          <head>
              <script dangerouslySetInnerHTML={{ __html: themeScript }} />
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
              <link
                  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
                  rel="stylesheet"
              />
          </head>
          <body className="min-h-screen bg-background font-sans antialiased">
              <Providers>{children}</Providers>
          </body>
      </html>
  );
}
