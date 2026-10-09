// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAppServices } from './appServices';
import { browserPlatform } from './platform/browser';
import './styles/theme.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

// Built here, once, so the platform is swapped in one place.
const services = createAppServices(browserPlatform());

createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
