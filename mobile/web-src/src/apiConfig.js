// Dynamic host router strictly for Mobile APK
const DEFAULT_HOST = '192.168.1.40:8000';

export function apiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${DEFAULT_HOST}${cleanPath}`;
}
