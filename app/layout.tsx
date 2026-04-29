import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AppLog V2',
  description: 'Team appointment logging and weekly reporting system'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
