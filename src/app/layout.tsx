import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email Sending Agent',
  description: 'Automated email sending agent',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
