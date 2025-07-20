import './globals.css'; // Import your global CSS file
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

// Initialize the Inter font with the 'latin' subset
const inter = Inter({ subsets: ['latin'] });

// Define metadata for your application
export const metadata: Metadata = {
  title: 'CodeCollab',
  description: 'Real-time collaborative code editor with video chat.',
};

// RootLayout component that wraps all pages
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Apply the Inter font to the body using Tailwind CSS class */}
      <body className={inter.className}>
        {/* Render the child components (your pages) */}
        {children}
      </body>
    </html>
  );
}
