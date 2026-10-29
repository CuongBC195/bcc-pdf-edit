import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import '@phosphor-icons/web/regular/style.css';
import './index.css';
import { CategoryPage } from './hub/CategoryPage';
import { HomePage } from './hub/HomePage';
import { InternalToolPage } from './hub/InternalToolPage';
import { RaycastLauncherPage } from './hub/RaycastLauncherPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/launcher" element={<RaycastLauncherPage />} />
        <Route path="/c/*" element={<CategoryPage />} />
        <Route path="/t/:toolId" element={<InternalToolPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
