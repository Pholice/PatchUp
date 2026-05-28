import "./globals.css";

export const metadata = {
  title: "PatchUp",
  description: "Catch up on what changed while you were away",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
