import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Appointment Log',
  description: 'Team appointment logging and weekly reports'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
