import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Techno Utsav QR Challenge',
  description: 'College event QR challenge infrastructure',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
