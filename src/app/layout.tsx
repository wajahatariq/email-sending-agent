import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TopTabs } from './TopTabs';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Email Sending Agent',
  description: 'Deliverability-safe cold-outreach engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <TopTabs />
        {children}
      </body>
    </html>
  );
}
