import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { APP_NAME, APP_SUBTITLE } from '../config/gameConfig';

const USERNAME_DOMAIN = 'grandjeu.local';

function normalizeLogin(value) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : `${trimmed}@${USERNAME_DOMAIN}`;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(normalizeLogin(username), password);
      navigate('/app');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  function friendlyError(err) {
    const code = err?.code;
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Les dieux ne reconnaissent pas ce nom ou ce mot de passe.';
      case 'auth/too-many-requests':
        return 'Trop de tentatives. Les dieux demandent de la patience…';
      case 'auth/network-request-failed':
        return 'Hermès ne passe pas : vérifie ta connexion.';
      case 'auth/invalid-email':
        return 'Entre un nom d’équipe valide.';
      case 'auth/api-key-not-valid':
      case 'auth/invalid-api-key':
        return 'Clé API Firebase manquante ou invalide (Vercel).';
      case 'auth/configuration-not-found':
      case 'auth/operation-not-allowed':
        return 'La connexion Email/Password n’est pas activée sur Firebase.';
      default:
        return `Connexion refusée : ${code || err?.message || 'erreur inconnue'}`;
    }
  }

  return (
    <div className="page-center">
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 4 }}>🏛️</div>
        <h1 className="logo-title">{APP_NAME}</h1>
        <p className="subtitle">{APP_SUBTITLE}</p>

        <form onSubmit={handleSubmit} noValidate style={{ textAlign: 'left' }}>
          <div className="field">
            <label htmlFor="username">Nom d’équipe</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="faucon"
              required
              autoComplete="username"
              autoCapitalize="none"
              disabled={loading}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mot de passe"
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Ouverture des portes…' : '⚡ Entrer dans l’Olympe'}
          </button>
        </form>

        <p className="hint">Utilise le nom d’équipe et le mot de passe donnés par les dieux (tes chefs).</p>
      </div>
    </div>
  );
}
