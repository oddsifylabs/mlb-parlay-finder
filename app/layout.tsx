import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VIC MLB Props',
  description: 'Player Prop Intelligence + Parlay Builder powered by the Oddsify Labs VIC Framework.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
