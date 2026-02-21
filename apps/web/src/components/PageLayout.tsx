import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './LanguageProvider';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  children: ReactNode;
}

export function PageLayout({ title, subtitle, backTo, children }: PageLayoutProps): JSX.Element {
  const { language, setLanguage, tr } = useLanguage();

  return (
    <div className="page-root">
      <header className="top-nav">
        <div className="brand-block">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="top-nav-controls">
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
          {backTo ? (
            <Link className="back-link" to={backTo}>
              {tr('common.back')}
            </Link>
          ) : null}
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  );
}
