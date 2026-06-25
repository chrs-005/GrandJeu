import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Admin() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function sendNotification(target) {
    setError('');
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setSending(true);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), target }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Server error: ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message || 'Network error. Is the server running?');
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="page-center" style={{ alignItems: 'flex-start', paddingTop: 32 }}>
      <div className="card" style={{ maxWidth: 540, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="logo-title">Grand Jeu</h1>
            <span className="badge badge-admin" style={{ marginBottom: 12 }}>Admin</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Signed in as <strong>{currentUser?.email}</strong>
        </p>

        <section>
          <h3 className="section-title">Send Push Notification</h3>

          <div className="field">
            <label htmlFor="notif-title">Title</label>
            <input
              id="notif-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              disabled={sending}
              maxLength={120}
            />
          </div>

          <div className="field">
            <label htmlFor="notif-body">Message</label>
            <textarea
              id="notif-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body text…"
              rows={3}
              disabled={sending}
              maxLength={500}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="btn-group">
            <button
              className="btn btn-primary"
              onClick={() => sendNotification('all')}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Send to all users'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => sendNotification('self')}
              disabled={sending}
            >
              Send to myself only
            </button>
          </div>
        </section>

        {result && (
          <div className="result-box">
            <h4 style={{ marginBottom: 8, color: 'var(--success)' }}>Notification sent</h4>
            <div className="result-grid">
              <div className="result-item">
                <span className="result-num">{result.sent ?? 0}</span>
                <span className="result-label">Sent</span>
              </div>
              <div className="result-item">
                <span className="result-num" style={{ color: 'var(--warning)' }}>{result.failed ?? 0}</span>
                <span className="result-label">Failed</span>
              </div>
              <div className="result-item">
                <span className="result-num" style={{ color: 'var(--text-muted)' }}>{result.removed ?? 0}</span>
                <span className="result-label">Removed</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <a
            href="/app"
            onClick={(e) => { e.preventDefault(); navigate('/app'); }}
            className="btn btn-ghost"
          >
            ← Back to App
          </a>
        </div>
      </div>
    </div>
  );
}
