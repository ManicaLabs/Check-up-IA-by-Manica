// Test de bout en bout dans un vrai Chrome (headless).
//   Local (serveur intégré qui imite GitHub Pages, page 404 comprise) : node tools/e2e.mjs
//   Prod :  BASE=https://manicalabs.github.io/Check-up-IA-by-Manica/ node tools/e2e.mjs
// Prérequis : (cd tools && npm install) pour puppeteer-core, et Chrome installé (CHROME=/chemin/vers/chrome sinon).
// Les captures d'écran sont écrites dans tools/.e2e-captures/ (ignoré par git).
// Aucun comptage réel : les requêtes vers manica.goatcounter.com sont interceptées et bloquées.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(RACINE, 'tools', '.e2e-captures') + '/';
const DL = join(OUT, 'telechargements') + '/';
const PREFIXE = '/Check-up-IA-by-Manica/';
const URL_APP = 'https://manicalabs.github.io/Check-up-IA-by-Manica/';
const EXTERNES_AUTORISES = ['https://gc.zgo.at', 'https://manica.goatcounter.com'];
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });

const problemes = [];
const externes = new Set();
const log = (...a) => console.log(...a);
const pause = ms => new Promise(r => setTimeout(r, ms));

// --- Serveur local : même arborescence et même 404 que GitHub Pages ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
let serveur = null;
let BASE = process.env.BASE;
if (!BASE) {
  serveur = createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fichier = chemin.startsWith(PREFIXE) ? join(RACINE, chemin.slice(PREFIXE.length)) : null;
    if (fichier && existsSync(fichier) && statSync(fichier).isDirectory()) fichier = join(fichier, 'index.html');
    if (!fichier || !existsSync(fichier) || !fichier.startsWith(RACINE)) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(readFileSync(join(RACINE, '404.html')));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(fichier));
  });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  BASE = `http://localhost:${serveur.address().port}${PREFIXE}`;
}
const ORIGINE = new URL(BASE).origin;
const LOCAL = Boolean(serveur);
log(`Cible : ${BASE}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });

async function nouvellePage({ mobile = true, systeme = 'light', stockageBloque = false } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(ORIGINE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const page = await ctx.newPage();
  if (mobile) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: systeme }]);
  if (stockageBloque) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqué', 'SecurityError'); } });
    });
  }
  const evenements = [];
  const pagesVues = [];
  await page.exposeFunction('__gcEvenement', p => evenements.push(p));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const url = r.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return r.continue();
    const o = new URL(url).origin;
    if (o !== ORIGINE) {
      externes.add(o);
      if (!EXTERNES_AUTORISES.includes(o)) problemes.push(`requête externe non autorisée : ${url}`);
      if (o === 'https://manica.goatcounter.com') {
        const q = new URL(url).searchParams;
        if (q.get('e') !== 'true') pagesVues.push(q.get('p'));
        return r.abort();
      }
    }
    r.continue();
  });
  page.on('console', m => {
    const t = m.text();
    if (/goatcounter: not counting/.test(t)) { pagesVues.push('(localhost ignoré par GoatCounter)'); return; }
    if (/Failed to load resource: the server responded with a status of 404/.test(t) && page.url().includes('introuvable')) return;
    if (['error', 'warning'].includes(m.type()) && !/ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(t)) problemes.push(`console ${m.type()} : ${t}`);
  });
  page.on('pageerror', e => problemes.push(`erreur JS : ${e.message}`));
  return { ctx, page, evenements, pagesVues };
}

// Espion GoatCounter + pas de navigation réelle vers les services externes (à refaire après chaque rechargement).
async function espionner(page) {
  await page.waitForFunction(() => window.goatcounter && typeof window.goatcounter.count === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    window.goatcounter.count = v => { if (v && v.event) window.__gcEvenement(v.path); };
    window.__ouverts = [];
    window.open = u => { window.__ouverts.push(u); return null; };
    document.addEventListener('click', e => {
      if (e.target.closest('#cta-rdv, #cta-mail, #cta-adresse, #partage-facebook, #partage-mail, #di-ouvrir')) e.preventDefault();
    }, true);
  });
}

async function pasDeScrollHorizontal(page, ou) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  if (sw > iw) problemes.push(`${ou} : défilement horizontal (${sw} > ${iw})`);
}

async function verifierLogos(page, ou, attendu) {
  const infos = await page.$$eval('img.logo', imgs => imgs.map(i => ({
    classe: i.className, alt: i.alt, visible: i.offsetParent !== null && getComputedStyle(i).display !== 'none',
    charge: i.complete && i.naturalWidth > 0, filtre: getComputedStyle(i).filter
  })));
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  for (const i of infos) {
    if (i.alt !== 'Manica') problemes.push(`${ou} : logo sans alt="Manica" (${i.classe})`);
    if (i.visible && !i.charge) problemes.push(`${ou} : logo non chargé (${i.classe})`);
    if (i.visible && theme === 'dark' && !i.filtre.includes('invert(1)')) problemes.push(`${ou} : logo non inversé en sombre`);
    if (i.visible && theme === 'light' && i.filtre !== 'none') problemes.push(`${ou} : filtre inattendu en clair`);
  }
  const entete = infos.filter(i => i.visible && !i.classe.includes('logo-foot')).map(i => (i.classe.includes('logo-full') ? 'baseline' : 'compact'));
  if (entete.join() !== attendu) problemes.push(`${ou} : logo d'en-tête ${entete.join()} au lieu de ${attendu}`);
}

const etatTheme = page => page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  presse: document.getElementById('btn-theme').getAttribute('aria-pressed'),
  meta: document.querySelector('meta[name="theme-color"]').content
}));

const toastDe = (page, sel) => page.evaluate(s => {
  const t = document.querySelector(s);
  return { visible: t.classList.contains('is-visible') && getComputedStyle(t).opacity === '1', texte: t.textContent, lu: t.querySelector('.sr-only')?.textContent || '', role: t.getAttribute('role'), live: t.getAttribute('aria-live') };
}, sel);

async function attendreToast(page, sel = '#toast') {
  await page.waitForFunction(s => document.querySelector(s).classList.contains('is-visible'), { timeout: 4000 }, sel);
  await pause(250);
}

async function attendreFichier(nom) {
  let fichiers = [];
  for (let i = 0; i < 30 && !fichiers.includes(nom); i++) { await pause(200); fichiers = readdirSync(DL); }
  if (!fichiers.includes(nom)) return null;
  const png = readFileSync(`${DL}${nom}`);
  return { l: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

async function repondre(page, position) {
  const choix = await page.$$('#q-choix input');
  await choix[position].click();
  await page.click('#q-bouton');
  await page.waitForSelector('#q-feedback:not([hidden])');
}

async function repondreATout(page) {
  while (await page.$('#ecran-quiz:not([hidden])')) { await repondre(page, 0); await page.click('#q-bouton'); }
  await page.waitForSelector('#ecran-resultat:not([hidden])');
}

// --- Bloc RDV : interlocuteur, indication du score, adresse copiable ---
async function testerBlocRdv(page, prefixe, score) {
  const e = await page.evaluate(() => {
    const img = document.getElementById('cta-photo');
    return {
      photo: img.complete && img.naturalWidth > 0, alt: img.getAttribute('alt'),
      nom: document.getElementById('cta-nom').textContent, role: document.getElementById('cta-role').textContent,
      indice: document.getElementById('cta-indice').textContent,
      adresse: document.getElementById('cta-adresse').textContent,
      rdv: [document.getElementById('cta-rdv').href, document.getElementById('cta-rdv').target],
      mail: decodeURIComponent(document.getElementById('cta-mail').href)
    };
  });
  if (!e.photo || e.alt !== '') problemes.push(`${prefixe} : photo du bloc RDV absente ou alt inattendu`);
  if (e.nom !== 'Cédric Delalande' || !e.role.includes('Manica Labs')) problemes.push(`${prefixe} : interlocuteur ${e.nom} / ${e.role}`);
  if (!e.indice.includes(`${score}/100`)) problemes.push(`${prefixe} : indication de score absente (${e.indice})`);
  if (e.adresse !== 'hello@manica.fr') problemes.push(`${prefixe} : adresse e-mail non affichée (${e.adresse})`);
  if (e.rdv[0] !== 'https://calendar.app.google/dQyJBwpYKtc184NdA' || e.rdv[1] !== '_blank') problemes.push(`${prefixe} : lien RDV ${e.rdv}`);
  if (!e.mail.startsWith('mailto:hello@manica.fr?subject=') || /\{\w+\}/.test(e.mail) || !e.mail.includes(`mon score : ${score}/100`)) problemes.push(`${prefixe} : mailto incorrect`);
  await page.click('#cta-rdv');
  await page.click('#cta-mail');
  // Copie de l'adresse (webmail)
  await page.click('#cta-copier-adresse');
  await attendreToast(page);
  const t = await toastDe(page, '#toast');
  const pp = await page.evaluate(() => navigator.clipboard.readText());
  const bouton = await page.$eval('#cta-copier-adresse', b => b.textContent);
  if (pp !== 'hello@manica.fr' || !t.texte.includes('Adresse copiée') || !t.lu.includes('hello@manica.fr') || bouton !== 'Copiée !') problemes.push(`${prefixe} : copie de l'adresse incorrecte ${JSON.stringify({ pp, t, bouton })}`);
  await page.evaluate(() => document.querySelector('.cta-panel').scrollIntoView({ block: 'center' }));
  await pause(300);
  await page.screenshot({ path: `${OUT}${prefixe}-5-bloc-rdv.png` });
  await page.waitForFunction(() => document.getElementById('cta-copier-adresse').textContent === 'Copier l’adresse', { timeout: 3000 });
  await page.waitForFunction(() => !document.getElementById('toast').classList.contains('is-visible'), { timeout: 4000 });
  await pause(300);
}

// --- Partage : fenêtres LinkedIn et Instagram, Facebook, e-mail, copie ---
async function testerPartage(page, ctx, prefixe, score) {
  const labels = await page.$$eval('.share-btn', b => b.map(x => x.getAttribute('aria-label')));
  if (labels.join('|') !== 'Partager sur LinkedIn|Partager sur Facebook|Partager sur Instagram|Partager par e-mail|Copier le texte et le lien') problemes.push(`${prefixe} : libellés ${labels}`);
  rmSync(DL, { recursive: true, force: true });
  mkdirSync(DL, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: ctx.id });

  // LinkedIn : post pré-rédigé, modifiable, copie confirmée dans la fenêtre, publication du texte modifié
  await page.click('#partage-linkedin');
  await page.waitForSelector('#dialogue-linkedin[open]');
  const post = await page.$eval('#dl-texte', t => t.value);
  if (!post.split('\n')[0].includes(`${score}/100`) || !post.includes(URL_APP) || !post.includes('#IA') || /\{\w+\}/.test(post)) problemes.push(`${prefixe} : post LinkedIn incomplet\n${post}`);
  if ((await page.evaluate(() => document.activeElement.id)) !== 'dl-publier') problemes.push(`${prefixe} : focus initial LinkedIn`);
  const police = await page.$eval('#dl-texte', t => parseFloat(getComputedStyle(t).fontSize));
  if (police < 16) problemes.push(`${prefixe} : texte du post en ${police} px (< 16 : zoom iOS)`);
  await page.screenshot({ path: `${OUT}${prefixe}-6-linkedin.png` });
  await page.click('#dl-texte');
  await page.keyboard.down('Control'); await page.keyboard.press('End'); await page.keyboard.up('Control');
  await page.keyboard.type(' #Test');
  await page.click('#dl-copier');
  await attendreToast(page, '#dialogue-linkedin .toast');
  const tl = await toastDe(page, '#dialogue-linkedin .toast');
  const valeur = await page.$eval('#dl-texte', t => t.value);
  const pp = await page.evaluate(() => navigator.clipboard.readText());
  if (!tl.visible || !tl.texte.includes('Texte copié') || pp !== valeur || !tl.lu.includes(pp)) problemes.push(`${prefixe} : copie dans la fenêtre LinkedIn incorrecte`);
  if ((await page.$eval('#dl-copier', b => b.textContent)) !== 'Copié !') problemes.push(`${prefixe} : « Copié ! » absent`);
  await page.click('#dl-image');
  const imgPost = await attendreFichier('check-up-ia-manica-post.png');
  if (!imgPost || imgPost.l !== 1080 || imgPost.h !== 1350) problemes.push(`${prefixe} : image pour LinkedIn ${JSON.stringify(imgPost)}`);
  await page.click('#dl-publier');
  await pause(200);
  const lienLi = (await page.evaluate(() => window.__ouverts)).find(u => u.startsWith('https://www.linkedin.com/feed/?shareActive=true&text='));
  if (!lienLi || decodeURIComponent(lienLi.split('text=')[1]) !== valeur.trim()) problemes.push(`${prefixe} : LinkedIn non ouvert avec le texte modifié`);
  if (await page.$('#dialogue-linkedin[open]')) problemes.push(`${prefixe} : fenêtre LinkedIn restée ouverte`);

  // Instagram : aperçu, format par défaut publication (pas de partage de fichiers en headless), story, téléchargement
  await page.click('#partage-instagram');
  await page.waitForSelector('#dialogue-instagram[open]');
  await page.waitForFunction(() => { const i = document.getElementById('di-apercu'); return !i.hidden && i.complete && i.naturalWidth > 0; }, { timeout: 6000 });
  const ei = await page.evaluate(() => ({
    h: document.getElementById('di-apercu').naturalHeight, coche: document.querySelector('input[name="format-image"]:checked')?.value,
    action: document.getElementById('di-action').textContent, ouvrir: !document.getElementById('di-ouvrir').hidden,
    etapes: !document.getElementById('di-etapes-bureau').hidden, focus: document.activeElement.id
  }));
  if (ei.coche !== 'post' || ei.h !== 1350 || ei.action !== 'Télécharger l’image' || !ei.ouvrir || !ei.etapes || ei.focus !== 'di-action') problemes.push(`${prefixe} : fenêtre Instagram ${JSON.stringify(ei)}`);
  await page.screenshot({ path: `${OUT}${prefixe}-7-instagram.png` });
  await page.click('#dialogue-instagram input[value="story"]');
  await page.waitForFunction(() => document.getElementById('di-apercu').naturalHeight === 1920, { timeout: 6000 });
  if (await page.$eval('#di-note-story', n => n.hidden)) problemes.push(`${prefixe} : note « pas de story sur ordinateur » absente`);
  await page.click('#di-action');
  await attendreToast(page, '#dialogue-instagram .toast');
  const imgStory = await attendreFichier('check-up-ia-manica-story.png');
  if (!imgStory || imgStory.h !== 1920) problemes.push(`${prefixe} : image story ${JSON.stringify(imgStory)}`);
  await page.keyboard.press('Escape');
  await pause(200);
  if (await page.$('#dialogue-instagram[open]')) problemes.push(`${prefixe} : Échap ne ferme pas la fenêtre Instagram`);

  // Facebook, e-mail
  const [facebook, mail] = await page.evaluate(() => ['facebook', 'mail'].map(n => document.getElementById(`partage-${n}`).href));
  if (facebook !== `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(URL_APP)}`) problemes.push(`${prefixe} : lien Facebook ${facebook}`);
  const m = decodeURIComponent(mail);
  if (!m.startsWith(`mailto:?subject=Check-up IA : j'ai obtenu ${score}/100`) || !m.endsWith(URL_APP)) problemes.push(`${prefixe} : mailto de partage ${m}`);
  await page.click('#partage-facebook');
  await page.click('#partage-mail');

  // Copie depuis l'icône : toast global, coche, panneau du texte copié
  await page.click('#partage-copier');
  await attendreToast(page);
  const tg = await toastDe(page, '#toast');
  const pp2 = await page.evaluate(() => navigator.clipboard.readText());
  const etat = await page.evaluate(() => ({ fait: document.getElementById('partage-copier').classList.contains('is-done'), panneau: !document.getElementById('partage-panneau').hidden, texte: document.getElementById('partage-texte').textContent }));
  if (!tg.visible || tg.role !== 'status' || tg.live !== 'polite' || !tg.lu.includes(pp2) || !etat.fait || !etat.panneau || etat.texte !== pp2 || !pp2.endsWith(URL_APP)) problemes.push(`${prefixe} : copie depuis l'icône incorrecte`);
  await page.screenshot({ path: `${OUT}${prefixe}-8-copie.png` });
}

async function parcours(prefixe, { systeme = 'light', forcer = null, profil = 'entreprise', mobile = true } = {}) {
  const { ctx, page, evenements, pagesVues } = await nouvellePage({ systeme, mobile });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await espionner(page);
  if (!pagesVues.length) problemes.push(`${prefixe} : aucune page vue comptée au chargement`);
  let t = await etatTheme(page);
  if (t.theme !== systeme) problemes.push(`${prefixe} : thème initial ${t.theme} au lieu de ${systeme}`);
  if (forcer && forcer !== t.theme) {
    await page.click('#btn-theme');
    t = await etatTheme(page);
    if (t.theme !== forcer) problemes.push(`${prefixe} : la bascule n'a pas appliqué ${forcer}`);
  }
  if (t.presse !== String(t.theme === 'dark') || t.meta !== (t.theme === 'dark' ? '#0B1326' : '#F7F5F1')) problemes.push(`${prefixe} : aria-pressed ou theme-color incohérent`);
  await page.evaluate(() => document.fonts.ready);
  await pause(1900);
  await page.screenshot({ path: `${OUT}${prefixe}-1-accueil.png` });
  await pasDeScrollHorizontal(page, `${prefixe} accueil`);
  await verifierLogos(page, `${prefixe} accueil`, 'baseline');
  if (await page.$('.hero-by')) problemes.push(`${prefixe} : « by Manica » encore sous le titre`);

  await page.click('#btn-commencer');
  if (await page.$eval('#hint-profil', e => e.hidden)) problemes.push(`${prefixe} : aide « choisissez un profil » absente`);
  await page.click(`input[name="profil"][value="${profil}"]`);
  await page.click('#btn-commencer');
  await page.waitForSelector('#ecran-quiz:not([hidden])');
  await verifierLogos(page, `${prefixe} quiz`, 'compact');
  await page.click('#q-bouton');
  if (await page.$eval('#hint-choix', e => e.hidden)) problemes.push(`${prefixe} : aide « choisissez une réponse » absente`);

  const total = await page.evaluate(() => JSON.parse(localStorage.getItem('checkup-ia:v1')).items.length);
  if (total !== 10) problemes.push(`${prefixe} : ${total} questions au lieu de 10`);
  let bonnes = 0;
  for (let i = 0; i < total; i++) {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('checkup-ia:v1')));
    const ordre = s.items[i].ordre;
    const position = i % 2 === 0 ? ordre.indexOf(0) : ordre.findIndex(x => x !== 0);
    if (ordre[position] === 0) bonnes++;
    await repondre(page, position);
    if (i === 1) await page.screenshot({ path: `${OUT}${prefixe}-2-correction.png`, fullPage: true });
    const compteur = await page.$eval('#q-compteur', e => e.textContent);
    if (compteur !== `Question ${i + 1} / ${total}`) problemes.push(`${prefixe} : compteur ${compteur}`);
    if (i === 4) {
      await page.reload({ waitUntil: 'networkidle0' });
      await espionner(page);
      if ((await etatTheme(page)).theme !== t.theme) problemes.push(`${prefixe} : thème perdu au rechargement`);
      await page.waitForSelector('#bloc-reprise:not([hidden])');
      const txt = await page.$eval('#texte-reprise', e => e.textContent);
      if (!txt.includes(`question 5 sur ${total}`)) problemes.push(`${prefixe} : reprise « ${txt} »`);
      await page.click('#btn-reprendre');
      await page.waitForSelector('#q-feedback:not([hidden])');
    }
    await page.click('#q-bouton');
  }
  await page.waitForSelector('#ecran-resultat:not([hidden])');
  await pause(1300);
  await verifierLogos(page, `${prefixe} résultat`, 'compact');
  await page.screenshot({ path: `${OUT}${prefixe}-3-resultat.png`, fullPage: true });
  await pasDeScrollHorizontal(page, `${prefixe} résultat`);

  const score = await page.$eval('#r-score', e => e.textContent);
  if (Number(score) !== Math.round(100 * bonnes / total)) problemes.push(`${prefixe} : score ${score}, attendu ${Math.round(100 * bonnes / total)}`);
  if (await page.$$eval('#r-recos li', l => l.length) !== 3) problemes.push(`${prefixe} : priorités ≠ 3`);
  if (await page.$$eval('#r-axes li', l => l.length) !== 5) problemes.push(`${prefixe} : axes ≠ 5`);
  const partageVisible = await page.evaluate(() => document.querySelector('.share').getBoundingClientRect().bottom <= innerHeight);
  if (!partageVisible) problemes.push(`${prefixe} : icônes de partage hors de l'écran à l'arrivée sur le résultat`);

  await testerBlocRdv(page, prefixe, score);
  await testerPartage(page, ctx, prefixe, score);
  const attendus = ['test_demarre', 'test_termine', 'clic_rdv', 'clic_mail', 'copie_adresse', 'partage_linkedin', 'partage_copie', 'partage_instagram', 'partage_facebook', 'partage_mail'];
  const manquants = attendus.filter(e => !evenements.includes(e));
  if (manquants.length) problemes.push(`${prefixe} : événements non envoyés ${manquants}`);
  log(`${prefixe} : score ${score}/100, ${evenements.length} événements`);

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#bloc-reprise:not([hidden])');
  await page.click('#btn-reprendre');
  await page.waitForSelector('#ecran-resultat:not([hidden])');
  if (await page.$eval('#r-score', e => e.textContent) !== score) problemes.push(`${prefixe} : score changé après rechargement`);
  await page.click('#btn-refaire');
  await page.waitForSelector('#ecran-accueil:not([hidden])');
  if (await page.evaluate(() => localStorage.getItem('checkup-ia:v1'))) problemes.push(`${prefixe} : session non effacée après « Refaire »`);
  await ctx.close();
}

await parcours('clair', { systeme: 'light', profil: 'entreprise' });
await parcours('sombre-systeme', { systeme: 'dark', profil: 'perso' });
await parcours('sombre-force', { systeme: 'light', forcer: 'dark', profil: 'entreprise' });
await parcours('clair-force', { systeme: 'dark', forcer: 'light', profil: 'perso' });
await parcours('bureau-sombre', { systeme: 'dark', profil: 'perso', mobile: false });

// Copie refusée : message honnête, rien de marqué comme copié
{
  const { ctx, page } = await nouvellePage({ systeme: 'dark' });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('refus', 'NotAllowedError')); });
  await page.click('input[name="profil"][value="perso"]');
  await page.click('#btn-commencer');
  await repondreATout(page);
  await page.click('#partage-copier');
  await attendreToast(page);
  const t = await toastDe(page, '#toast');
  const fait = await page.$eval('#partage-copier', b => b.classList.contains('is-done'));
  const libelle = await page.$eval('#partage-libelle', p => p.textContent);
  if (!t.texte.includes('sélectionnez le texte affiché') || fait || !libelle.includes('Copie impossible')) problemes.push(`copie refusée : ${JSON.stringify({ t, fait, libelle })}`);
  await page.waitForFunction(() => !document.getElementById('toast').classList.contains('is-visible'), { timeout: 4000 });
  await page.click('#cta-copier-adresse');
  await attendreToast(page);
  if ((await page.$eval('#cta-copier-adresse', b => b.textContent)).includes('Copiée')) problemes.push('copie refusée : adresse marquée « Copiée » à tort');
  log('copie refusée : message honnête ✓');
  await ctx.close();
}

// Stockage bloqué : l'app fonctionne, la bascule vaut pour la visite, aucune erreur JS (GoatCounter compris)
{
  const { ctx, page } = await nouvellePage({ systeme: 'light', stockageBloque: true });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.click('#btn-theme');
  if ((await etatTheme(page)).theme !== 'dark') problemes.push('stockage bloqué : bascule inopérante');
  await page.click('input[name="profil"][value="perso"]');
  await page.click('#btn-commencer');
  await page.waitForSelector('#ecran-quiz:not([hidden])', { timeout: 5000 });
  await repondre(page, 0);
  log('stockage bloqué : bascule et quiz OK ✓');
  await ctx.close();
}

// Pages secondaires : mentions légales (refus de la mesure d'audience), 404
{
  const { ctx, page } = await nouvellePage({ systeme: 'dark' });
  await page.goto(`${BASE}mentions-legales.html`, { waitUntil: 'networkidle0' });
  const ml = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, texte: document.body.innerText, bouton: document.getElementById('btn-opt-out')?.textContent }));
  for (const attendu of ['MANICA LABS', '999 397 490', 'FR82999397490', '11 avenue Paul Verlaine', 'Cédric Delalande', 'GitHub, Inc.', 'GoatCounter', 'CNIL']) if (!ml.texte.includes(attendu)) problemes.push(`mentions légales : « ${attendu} » absent`);
  if (ml.theme !== 'dark') problemes.push('mentions légales : thème sombre non appliqué');
  await verifierLogos(page, 'mentions légales', 'compact');
  await pasDeScrollHorizontal(page, 'mentions légales');
  await page.screenshot({ path: `${OUT}mentions-legales.png`, fullPage: true });
  await page.click('#btn-opt-out');
  if ((await page.evaluate(() => localStorage.getItem('skipgc'))) !== 't') problemes.push('mentions légales : refus de la mesure non enregistré');
  await page.click('#btn-opt-out');
  if ((await page.evaluate(() => localStorage.getItem('skipgc'))) !== null) problemes.push('mentions légales : réacceptation de la mesure non enregistrée');
  const reponse = await page.goto(`${BASE}page-introuvable-${Date.now()}`, { waitUntil: 'networkidle0' });
  const e404 = await page.evaluate(() => ({ titre: document.querySelector('h1')?.textContent, lien: document.querySelector('.btn')?.href, logo: document.querySelector('img.logo')?.naturalWidth }));
  if (reponse.status() !== 404 || !e404.titre?.includes('n’existe pas') || e404.lien !== BASE || !e404.logo) problemes.push(`404 : ${reponse.status()} ${JSON.stringify(e404)}`);
  await page.screenshot({ path: `${OUT}404.png` });
  log('mentions légales et 404 ✓');
  await ctx.close();
}

// Hors ligne : service worker, GoatCounter absent sans erreur
{
  const { ctx, page } = await nouvellePage({ systeme: 'dark' });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle0' });
  const caches = await page.evaluate(async () => (await caches.keys()).join(','));
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await pause(800);
  await page.click('input[name="profil"][value="perso"]');
  await page.click('#btn-commencer');
  await page.waitForSelector('#ecran-quiz:not([hidden])', { timeout: 8000 });
  await repondre(page, 0);
  log(`hors ligne : quiz OK (cache ${caches}) ✓`);
  await ctx.close();
}

await browser.close();
if (serveur) serveur.close();
log(`origines externes contactées : ${[...externes].join(', ') || 'aucune'}${LOCAL ? ' (GoatCounter ne compte pas localhost)' : ''}`);
log(`captures : ${OUT}`);
if (problemes.length) { log('PROBLÈMES :'); problemes.forEach(p => log(` ✗ ${p}`)); process.exit(1); }
log('✓ E2E OK');
