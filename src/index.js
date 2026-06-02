import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ErrorBoundary from './ErrorBoundary';
import Game from './Game';
import './index.css';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000 * 5
    }
  }
});

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Game />
    </QueryClientProvider>
  </ErrorBoundary>
);

// listen for installprompt (should keep this before serviceworker registration)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.installPrompt = e;
});

// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
