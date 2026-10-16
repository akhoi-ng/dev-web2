// Entry point of the client bundle. This is where client-side rendering starts:
// React takes the empty <div id="root"> from index.html and draws the app into it.
//
// We do not wrap <App> in <StrictMode>: in dev mode StrictMode runs every effect
// twice, so the Network tab would show two GET /api/students requests (one
// cancelled). Without it, the evidence shows exactly one request on first load.
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
