import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

// NFC tag lands here via ?found=<token>. Stash it before routing so it
// survives a login redirect, then UserApp processes it once signed in.
const foundToken = new URLSearchParams(window.location.search).get('found');
if (foundToken) localStorage.setItem('olympe-pending-found', foundToken);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
