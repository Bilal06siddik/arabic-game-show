import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/PageLayout';
import { PixelWipe } from '../components/PixelWipe';
import { useLanguage } from '../components/LanguageProvider';

export function LandingPage(): JSX.Element {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const triggerRef = useRef<((onBlack: () => void) => void) | null>(null);

  const registerWipe = useCallback((trigger: (onBlack: () => void) => void) => {
    triggerRef.current = trigger;
  }, []);

  function goToCasino() {
    if (triggerRef.current) {
      triggerRef.current(() => navigate('/casino'));
    } else {
      navigate('/casino');
    }
  }

  return (
    <>
      <PixelWipe onRegister={registerWipe} />
      <PageLayout title={tr('app.title')} subtitle={tr('app.subtitle')}>
        <section className="hero-panel">
          <h2>{tr('landing.title')}</h2>
          <p>{tr('landing.description')}</p>
        </section>

        <section className="choice-grid">
          <article className="choice-card casino-card">
            <h3>{tr('landing.casino')}</h3>
            <p>Real-time quiz rounds with a single race buzzer and host moderation.</p>
            <button
              type="button"
              className="primary-btn"
              onClick={goToCasino}
            >
              {tr('landing.open')}
            </button>
          </article>

          <article className="choice-card bank-card">
            <h3>{tr('landing.bank')}</h3>
            <p>Classic monopoly-style board game adapted to Egyptian city presets.</p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => navigate('/bank')}
            >
              {tr('landing.open')}
            </button>
          </article>
        </section>
      </PageLayout>
    </>
  );
}