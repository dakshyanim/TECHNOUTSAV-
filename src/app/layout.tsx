import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import EventProvider from '@/components/event-provider';

export const metadata: Metadata = {
  title: 'Techno Utsav QR Challenge',
  description: 'College event QR challenge infrastructure',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><EventProvider>{children}<nav className="event-navigation qr-no-print" aria-label="Event navigation">
    <Link href="/">Student entry</Link><Link href="/leaderboard">Leaderboard</Link>
  </nav></EventProvider></body></html>;
}
