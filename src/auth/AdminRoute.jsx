import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function AdminRoute({ children }) {
  const { currentUser, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== 'admin') {
    return (
      <div className="page-center">
        <div className="card" style={{ maxWidth: 400 }}>
          <h2 style={{ color: 'var(--danger)' }}>Access Denied</h2>
          <p>You need admin privileges to view this page.</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Your current role: <strong>{userRole || 'user'}</strong>
          </p>
          <a href="/app" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
            ← Back to App
          </a>
        </div>
      </div>
    );
  }

  return children;
}
