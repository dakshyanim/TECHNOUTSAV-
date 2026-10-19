import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Techno Utsav QR Challenge',
  description: 'College event QR challenge infrastructure',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<nav className="event-navigation qr-no-print" aria-label="Event navigation">
    <Link href="/">Student entry</Link><Link href="/leaderboard">Leaderboard</Link>
  </nav></body></html>;
}
