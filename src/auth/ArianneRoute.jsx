import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { isArianneUser } from './arianneAccess';

export default function ArianneRoute({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;
  if (!isArianneUser(currentUser)) return <Navigate to="/app" replace />;

  return children;
}
