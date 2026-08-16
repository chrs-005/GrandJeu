import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AdminRoute from './auth/AdminRoute';
import ArianneRoute from './auth/ArianneRoute';
import { isArianneUser } from './auth/arianneAccess';
import Login from './pages/Login';
import UserApp from './pages/UserApp';
import Admin from './pages/Admin';
import ArianneApp from './pages/ArianneApp';
import NfcRedirect from './pages/NfcRedirect';

function RootRedirect() {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={isArianneUser(currentUser) ? '/arianne' : '/app'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/nfc/:tagId" element={<NfcRedirect />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <UserApp />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route
            path="/arianne"
            element={
              <ArianneRoute>
                <ArianneApp />
              </ArianneRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
