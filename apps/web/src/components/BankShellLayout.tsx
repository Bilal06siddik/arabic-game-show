import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './LanguageProvider';

interface BankShellLayoutProps {
  children: ReactNode;
  subtitle?: string;
  backTo?: string;
  fullBleed?: boolean;
}

export function BankShellLayout({
  children,
  subtitle,
  backTo = '/',
  fullBleed = false,
}: BankShellLayoutProps): JSX.Element {
  const { language, setLanguage, tr } = useLanguage();
  const kicker = language === 'ar' ? 'ساحة بنك الحظ المباشرة' : 'BANK ALHAZ LIVE ARENA';

  return (
    <div className={`bank-shell${fullBleed ? ' bank-shell-full' : ''}`}>
      <header className="bank-shell-header">
        <div className="bank-shell-brand">
          <p className="bank-shell-kicker">{kicker}</p>
          <h1>{tr('bank.title')}</h1>
          {subtitle ? <p className="bank-shell-subtitle">{subtitle}</p> : null}
        </div>
        <div className="bank-shell-controls">
          <div className="lang-toggle">
            <button
              type="button"
              className={language === 'ar' ? 'active' : ''}
              onClick={() => setLanguage('ar')}
            >
              AR
            </button>
            <button
              type="button"
              className={language === 'en' ? 'active' : ''}
              onClick={() => setLanguage('en')}
            >
              EN
            </button>
          </div>
          <Link className="bank-exit-link" to={backTo}>
            {tr('bank.backToGames')}
          </Link>
        </div>
      </header>
      <main className="bank-shell-main">{children}</main>
    </div>
  );
}
