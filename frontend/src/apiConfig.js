// Dynamic Backend API resolver for Astra Talk
// Supports Web Localhost, Mobile Native App with Wi-Fi Bridge & Offline Fallback
const DEFAULT_HOST = '192.168.1.40:8000';

export function getApiBaseUrl() {
  const customHost = localStorage.getItem('astra_backend_host');
  if (customHost) return `http://${customHost}`;

  // If running inside Capacitor Android APK (origin is https://localhost or capacitor://localhost)
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    return `http://${DEFAULT_HOST}`;
  }

  // If accessed directly from phone browser via Wi-Fi IP (e.g. 192.168.1.40:3000)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:8000`;
  }

  // Standard PC localhost
  return '';
}

export function apiUrl(path) {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
