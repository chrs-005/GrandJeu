import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { recordNfcScan } from '../services/api';

export default function NfcRedirect() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || started.current) return;

    if (!currentUser) {
      navigate(`/login?next=${encodeURIComponent(`/nfc/${tagId}`)}`, { replace: true });
      return;
    }

    started.current = true;
    recordNfcScan(currentUser, tagId)
      .then(({ redirectUrl }) => window.location.replace(redirectUrl))
      .catch((err) => {
        started.current = false;
        setError(err.message || 'Le scan NFC a echoue.');
      });
  }, [currentUser, loading, navigate, tagId]);

  if (!error) return <div className="nfc-redirect" />;

  return (
    <div className="nfc-redirect nfc-redirect-error">
      <p>{error}</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()} type="button">
        Reessayer
      </button>
    </div>
  );
}
