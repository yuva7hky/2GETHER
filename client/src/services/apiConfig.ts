/**
 * 2GETHER API Configuration
 * Manages API endpoint resolution for development, preview, and production.
 */

export const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // Default to relative path handled by Vite dev/preview proxy
  return '';
};

export const apiUrl = (endpoint: string): string => {
  const base = getApiBase();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
};
