import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { isArianneUser, isLegacyArianneUser, signInArianneDevice } from './arianneAccess';

export default function ArianneRoute({ children }) {
  const { currentUser, loading, login, signup } = useAuth();
  const migrationStarted = useRef(false);
  const [migrationError, setMigrationError] = useState('');

  useEffect(() => {
    if (loading || !isLegacyArianneUser(currentUser) || migrationStarted.current) return;
    migrationStarted.current = true;
    signInArianneDevice(login, signup).catch((error) => {
      setMigrationError(error?.message || 'Migration impossible.');
    });
  }, [currentUser, loading, login, signup]);

  if (loading || isLegacyArianneUser(currentUser)) {
    return (
      <div className="loading-screen">
        {!migrationError && <div className="spinner" />}
        <p>{migrationError || 'Loading...'}</p>
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;
  if (!isArianneUser(currentUser)) return <Navigate to="/app" replace />;

  return children;
}
