import { Link } from 'react-router-dom';
import { PageLayout } from '../components/PageLayout';
import { useLanguage } from '../components/LanguageProvider';

export function LandingPage(): JSX.Element {
  const { tr } = useLanguage();

  return (
    <PageLayout title={tr('app.title')} subtitle={tr('app.subtitle')}>
      <section className="hero-panel">
        <h2>{tr('landing.title')}</h2>
        <p>{tr('landing.description')}</p>
      </section>

      <section className="choice-grid">
        <article className="choice-card casino-card">
          <h3>{tr('landing.casino')}</h3>
          <p>Real-time quiz rounds with a single race buzzer and host moderation.</p>
          <Link to="/casino" className="primary-btn">
            {tr('landing.open')}
          </Link>
        </article>

        <article className="choice-card bank-card">
          <h3>{tr('landing.bank')}</h3>
          <p>Classic monopoly-style board game adapted to Egyptian city presets.</p>
          <Link to="/bank" className="primary-btn">
            {tr('landing.open')}
          </Link>
        </article>
      </section>
    </PageLayout>
  );
}