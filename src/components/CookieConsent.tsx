import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('cookie_consent', 'accepted');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-card/95 backdrop-blur-lg border-t border-border/30">
      <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-3 text-sm">
        <p className="text-muted-foreground text-center sm:text-left flex-1">
          Usamos cookies essenciais para manter sua sessão e preferências.{' '}
          <Link to="/privacidade" className="text-primary/70 hover:text-primary underline">Política de Privacidade</Link>
        </p>
        <button
          onClick={accept}
          className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all whitespace-nowrap"
        >
          Aceitar
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;
