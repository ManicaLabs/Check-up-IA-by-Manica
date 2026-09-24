// Service worker du Check-up IA : rend l'app disponible hors ligne.
// Réseau d'abord (contenu toujours frais en ligne), cache en secours.
// Incrémenter VERSION à chaque déploiement qui modifie la liste PRECACHE.
const VERSION = 'v1.1.0';
const CACHE = `checkup-ia-${VERSION}`;
const PRECACHE = [
  './',
  'index.html',
  'config.json',
  'questions.json',
  'manifest.webmanifest',
  'favicon-32.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'img/logo-manica-baseline-600.png',
  'img/logo-manica-baseline-900.png',
  'img/logo-manica-300.png',
  'fonts/manrope-latin.woff2'
];
const DELAI_RESEAU_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(cle => cle.startsWith('checkup-ia-') && cle !== CACHE).map(cle => caches.delete(cle))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requete = event.request;
  if (requete.method !== 'GET' || new URL(requete.url).origin !== self.location.origin) return;
  event.respondWith(reseauPuisCache(event, requete));
});

async function reseauPuisCache(event, requete) {
  const cache = await caches.open(CACHE);
  const reseau = fetch(requete, { cache: 'no-cache' }).then(reponse => {
    if (reponse.ok) event.waitUntil(cache.put(requete, reponse.clone()));
    return reponse;
  });
  const enCache = await cache.match(requete, { ignoreSearch: requete.mode === 'navigate' });
  if (!enCache) return reseau.catch(() => pageHorsLigne(cache, requete));
  const delai = new Promise(resolve => setTimeout(() => resolve(enCache), DELAI_RESEAU_MS));
  return Promise.race([reseau.catch(() => enCache), delai]);
}

async function pageHorsLigne(cache, requete) {
  if (requete.mode === 'navigate') {
    const accueil = await cache.match('index.html');
    if (accueil) return accueil;
  }
  return Response.error();
}
