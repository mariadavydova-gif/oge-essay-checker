import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Проверка сочинения ОГЭ' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
