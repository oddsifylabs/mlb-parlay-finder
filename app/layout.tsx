import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'MLB Parlay Finder', description: 'Find 3 and 5 leg MLB parlay candidates for DraftKings lines.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
