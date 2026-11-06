// Test de bout en bout dans un vrai Chrome (headless).
//   Local (serveur intégré qui imite GitHub Pages, page 404 comprise) : node tools/e2e.mjs
//   Prod :  BASE=https://checkup-ia.manica.fr/ node tools/e2e.mjs
// Prérequis : (cd tools && npm install) pour puppeteer-core, et Chrome installé (CHROME=/chemin/vers/chrome sinon).
// Les captures d'écran sont écrites dans tools/.e2e-captures/ (ignoré par git).
// Aucun comptage réel : les requêtes vers manica.goatcounter.com sont interceptées et bloquées.
// Aucun lead réel : l'envoi vers Apps Script (script.google.com) est intercepté et simulé ; en local, une URL de test
// est injectée dans config.json. L'agenda Google intégré est remplacé par une page factice.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(RACINE, 'tools', '.e2e-captures') + '/';
const DL = join(OUT, 'telechargements') + '/';
const PREFIXE = '/';
const URL_APP = 'https://checkup-ia.manica.fr/';
const EXTERNES_AUTORISES = ['https://gc.zgo.at', 'https://manica.goatcounter.com', 'https://script.google.com', 'https://calendar.google.com'];
const URL_LEADS_TEST = 'https://script.google.com/macros/s/TEST-E2E/exec';
const CONFIG = JSON.parse(readFileSync(join(RACINE, 'config.json'), 'utf8'));
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

async function nouvellePage({ mobile = true, systeme = 'light', stockageBloque = false, leadsEnPanne = false, avecServiceWorker = false } = {}) {
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
  const leads = [];
  const etat = { leadsEnPanne };
  await page.exposeFunction('__gcEvenement', p => evenements.push(p));
  // Les requêtes faites par le service worker échappent à l'interception : on le contourne, sauf pour le test hors ligne.
  if (!avecServiceWorker) await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const url = r.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return r.continue();
    const o = new URL(url).origin;
    if (LOCAL && url.startsWith(`${BASE}config.json`)) {
      const c = JSON.parse(readFileSync(join(RACINE, 'config.json'), 'utf8'));
      c.leads.url = URL_LEADS_TEST;
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' }, body: JSON.stringify(c) });
    }
    if (o === 'https://script.google.com') {
      externes.add(o);
      if (etat.leadsEnPanne) return r.abort('internetdisconnected');
      if (r.method() !== 'POST') return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
      // Le corps n'est pas toujours joint à l'événement : on le demande au besoin.
      return Promise.resolve(r.postData() ?? r.fetchPostData()).then(corps => {
        try { leads.push(JSON.parse(corps)); } catch (e) { problemes.push(`lead illisible : ${corps}`); }
        return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
      });
    }
    if (o === 'https://calendar.google.com') {
      externes.add(o);
      return r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Agenda</title><p>Agenda de test</p>' });
    }
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
  return { ctx, page, evenements, pagesVues, leads, etat };
}

// Espion GoatCounter + pas de navigation réelle vers les services externes (à refaire après chaque rechargement).
async function espionner(page) {
  await page.waitForFunction(() => window.goatcounter && typeof window.goatcounter.count === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    window.goatcounter.count = v => { if (v && v.event) window.__gcEvenement(v.path); };
    window.__ouverts = [];
    window.open = u => { window.__ouverts.push(u); return null; };
    document.addEventListener('click', e => {
      if (e.target.closest('#cta-mail, #dr-onglet, #partage-facebook, #partage-mail, #di-ouvrir')) e.preventDefault();
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

const lireSession = page => page.evaluate(() => JSON.parse(localStorage.getItem('checkup-ia:v2')));

// Un clic sur un choix = question suivante (ou résultat après la dernière).
async function repondre(page, position) {
  const avant = await page.$eval('#q-compteur', e => e.textContent);
  await page.click(`#q-choix .choice[data-position="${position}"]`);
  await page.waitForFunction(a => !document.getElementById('ecran-resultat').hidden
    || (document.getElementById('q-compteur').textContent !== a && !document.querySelector('#q-corps.is-leaving, #q-corps.is-entering')), { timeout: 5000 }, avant);
  await pause(60);
}

async function repondreATout(page) {
  while (!(await page.$eval('#ecran-quiz', e => e.hidden))) await repondre(page, 0);
  await page.waitForSelector('#ecran-resultat:not([hidden])');
}

async function demarrer(page, role, precision = '') {
  if (role === 'autre') {
    await page.click('.role[data-role="autre"]');
    await page.waitForSelector('#zone-autre:not([hidden])');
    if (precision) await page.type('#autre-metier', precision);
    await page.click('#btn-autre');
  } else {
    await page.click(`.role[data-role="${role}"]`);
  }
  await page.waitForSelector('#ecran-quiz:not([hidden])');
}

async function remplirFormulaire(page, nom = 'Ada Lovelace', email = 'ada@exemple.fr') {
  await page.click('#lead-nom', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#lead-nom', nom);
  await page.click('#lead-email', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#lead-email', email);
  await page.click('#lead-envoyer');
  await page.waitForSelector('#r-diagnostic:not([hidden])');
}

// --- Formulaire : erreurs, envoi, contenu transmis ---
async function testerFormulaire(page, prefixe, { leads, score, role, total, mobile }) {
  const avant = await page.evaluate(() => ({
    gate: !document.getElementById('r-gate').hidden, diag: !document.getElementById('r-diagnostic').hidden,
    hautGate: document.getElementById('gate-titre').getBoundingClientRect().top, h: innerHeight,
    tailleNom: parseFloat(getComputedStyle(document.getElementById('lead-nom')).fontSize),
    optin: document.getElementById('lead-optin').checked, libelleEmail: document.getElementById('lead-email-libelle').textContent
  }));
  if (!avant.gate || avant.diag) problemes.push(`${prefixe} : le diagnostic doit être masqué derrière le formulaire`);
  if (mobile && avant.hautGate > avant.h) problemes.push(`${prefixe} : titre du formulaire sous la ligne de flottaison (${Math.round(avant.hautGate)} px)`);
  if (avant.tailleNom < 16) problemes.push(`${prefixe} : champ nom en ${avant.tailleNom} px (zoom iOS)`);
  if (avant.optin) problemes.push(`${prefixe} : case « lives et contenus » cochée par défaut (RGPD)`);
  if (avant.libelleEmail !== (role === 'perso' ? 'E-mail' : 'E-mail professionnel')) problemes.push(`${prefixe} : libellé e-mail ${avant.libelleEmail}`);
  // Envoi vide puis e-mail invalide : erreurs visibles, rien n'est envoyé
  await page.click('#lead-envoyer');
  if (await page.$eval('#err-nom', e => e.hidden)) problemes.push(`${prefixe} : erreur « nom » absente`);
  await page.type('#lead-nom', 'Ada Lovelace');
  await page.type('#lead-email', 'ada@exemple');
  await page.click('#lead-envoyer');
  if (await page.$eval('#err-email', e => e.hidden)) problemes.push(`${prefixe} : erreur « e-mail » absente`);
  if (leads.length || !(await page.$eval('#r-diagnostic', e => e.hidden))) problemes.push(`${prefixe} : formulaire invalide accepté`);
  await page.click('#lead-optin');
  await remplirFormulaire(page);
  await page.waitForFunction(() => !document.getElementById('cta-transmis').hidden, { timeout: 5000 }).catch(() => problemes.push(`${prefixe} : « résultats transmis » non affiché`));
  const d = leads.at(-1);
  if (!d) { problemes.push(`${prefixe} : aucun lead envoyé`); return; }
  if (d.nom !== 'Ada Lovelace' || d.email !== 'ada@exemple.fr' || d.optin !== true || d.role !== role || d.score !== Number(score) || d.reponses.length !== total || d.reponses.some(r => !r.question || !r.reponse || !r.explication || (!r.juste && !r.bonne)) || d.priorites.length !== 3 || !d.id) problemes.push(`${prefixe} : lead incomplet ${JSON.stringify(d).slice(0, 300)}`);
  if (leads.length !== 1) problemes.push(`${prefixe} : ${leads.length} envois pour un seul formulaire`);
  const titre = await page.$eval('#diag-titre', e => e.textContent);
  if (titre !== 'Votre diagnostic, Ada') problemes.push(`${prefixe} : titre du diagnostic « ${titre} »`);
}

// --- Diagnostic : axes en couleur, corrigé, bloc RDV, agenda intégré, bulle ---
async function testerDiagnostic(page, prefixe, { score, total }) {
  const e = await page.evaluate(() => ({
    axes: [...document.querySelectorAll('#r-axes .axis')].map(li => [li.dataset.ton, li.dataset.pct, li.querySelector('.axis-tag').textContent]),
    recos: document.querySelectorAll('#r-recos li').length,
    corrige: document.querySelectorAll('#r-corrige details').length,
    ko: document.querySelectorAll('#r-corrige .rev.is-ko').length,
    reassurance: [...document.querySelectorAll('#cta-reassurance li')].map(l => l.textContent),
    rdv: document.getElementById('cta-rdv').textContent,
    boutons: document.querySelectorAll('.cta-actions .btn').length,
    photo: document.getElementById('cta-photo').complete && document.getElementById('cta-photo').naturalWidth > 0,
    nom: document.getElementById('cta-nom').textContent,
    mail: decodeURIComponent(document.getElementById('cta-mail').href),
    adresseCopiable: Boolean(document.getElementById('cta-copier-adresse'))
  }));
  if (e.axes.length !== 5) problemes.push(`${prefixe} : axes ≠ 5`);
  for (const [ton, pct] of e.axes) if (ton !== (pct >= 60 ? 'ok' : pct >= 30 ? 'mid' : 'ko')) problemes.push(`${prefixe} : couleur d'axe ${ton} pour ${pct} %`);
  if (e.recos !== 3) problemes.push(`${prefixe} : priorités ≠ 3`);
  if (e.corrige !== total) problemes.push(`${prefixe} : corrigé de ${e.corrige} questions`);
  if (e.ko !== total - Math.round(Number(score) * total / 100)) problemes.push(`${prefixe} : corrigé incohérent avec le score (${e.ko} à revoir)`);
  if (e.reassurance.join('|') !== CONFIG.cta.reassurance.join('|')) problemes.push(`${prefixe} : réassurance ${e.reassurance}`);
  if (e.boutons !== 1) problemes.push(`${prefixe} : ${e.boutons} boutons principaux dans le bloc RDV (1 attendu)`);
  if (!e.photo || e.nom !== 'Cédric Delalande') problemes.push(`${prefixe} : photo ou nom du bloc RDV`);
  if (!e.mail.startsWith('mailto:hello@manica.fr?subject=') || !e.mail.includes(`mon score : ${score}/100`) || /\{\w+\}/.test(e.mail)) problemes.push(`${prefixe} : mailto ${e.mail.slice(0, 120)}`);
  if (e.adresseCopiable) problemes.push(`${prefixe} : la copie d'adresse devait disparaître`);
  // Corrigé : une question ouverte montre la réponse et l'explication
  await page.click('#r-corrige details summary');
  const ouvert = await page.$eval('#r-corrige details', d => d.open && d.querySelector('.rev-expl').textContent.length > 20);
  if (!ouvert) problemes.push(`${prefixe} : corrigé non dépliable`);
  await page.screenshot({ path: `${OUT}${prefixe}-4-diagnostic.png`, fullPage: true });
  // Bulle visible tant que le bloc RDV n'est pas à l'écran
  await page.evaluate(() => scrollTo(0, 0));
  await pause(400);
  if (!(await page.$eval('#bulle-rdv', b => b.classList.contains('is-visible')))) problemes.push(`${prefixe} : bulle RDV absente en haut du diagnostic`);
  await page.screenshot({ path: `${OUT}${prefixe}-5-bulle.png` });
  await page.click('#bulle-rdv');
  await page.waitForSelector('#dialogue-rdv[open]');
  const cal = await page.evaluate(() => ({ src: document.getElementById('dr-cadre').src, note: document.getElementById('dr-note').textContent, h: document.getElementById('dr-cadre').getBoundingClientRect().height }));
  if (cal.src !== CONFIG.contact.lien_rdv_integre) problemes.push(`${prefixe} : agenda intégré ${cal.src}`);
  if (cal.h < 300) problemes.push(`${prefixe} : agenda trop petit (${cal.h} px)`);
  if (!cal.note.includes('rien à recopier')) problemes.push(`${prefixe} : note de l'agenda ${cal.note}`);
  await pause(300);
  await page.screenshot({ path: `${OUT}${prefixe}-6-agenda.png` });
  await page.click('#dr-onglet');
  await page.keyboard.press('Escape');
  await pause(200);
  await page.evaluate(() => document.getElementById('cta-bloc').scrollIntoView({ block: 'center' }));
  await pause(500);
  if (await page.$eval('#bulle-rdv', b => b.classList.contains('is-visible'))) problemes.push(`${prefixe} : bulle visible alors que le bloc RDV est à l'écran`);
  await page.screenshot({ path: `${OUT}${prefixe}-7-bloc-rdv.png` });
  await page.click('#cta-rdv');
  await page.waitForSelector('#dialogue-rdv[open]');
  await page.click('#dialogue-rdv [data-fermer]');
  await page.click('#cta-mail');
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
  const fait = await page.$eval('#partage-copier', b => b.classList.contains('is-done'));
  if (!tg.visible || tg.role !== 'status' || tg.live !== 'polite' || !tg.lu.includes(pp2) || !fait || !pp2.endsWith(URL_APP)) problemes.push(`${prefixe} : copie depuis l'icône incorrecte`);
  await page.screenshot({ path: `${OUT}${prefixe}-8-copie.png` });
}

async function parcours(prefixe, { systeme = 'light', forcer = null, role = 'dirigeant', precision = '', mobile = true } = {}) {
  const { ctx, page, evenements, pagesVues, leads } = await nouvellePage({ systeme, mobile });
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
  await page.screenshot({ path: `${OUT}${prefixe}-1b-accueil-complet.png`, fullPage: true });
  await pasDeScrollHorizontal(page, `${prefixe} accueil`);
  await verifierLogos(page, `${prefixe} accueil`, 'baseline');
  const accueil = await page.evaluate(() => ({ faq: document.querySelectorAll('#faq details').length, apropos: !document.getElementById('apropos').hidden, texte: document.body.innerText }));
  if (accueil.faq !== CONFIG.faq.length || !accueil.apropos) problemes.push(`${prefixe} : bloc « Qui est derrière » ou FAQ absent de l'accueil`);
  if (/sans inscription|pas de mail demandé/i.test(accueil.texte)) problemes.push(`${prefixe} : promesse « sans inscription » encore affichée`);
  if (mobile) {
    const bas = await page.$eval('.role[data-role="autre"]', b => b.getBoundingClientRect().bottom);
    if (bas > 844 * 1.35) problemes.push(`${prefixe} : profils trop bas sur mobile (${Math.round(bas)} px)`);
  }

  await demarrer(page, role, precision);
  await verifierLogos(page, `${prefixe} quiz`, 'compact');
  if ((await page.$$('#q-choix .choice')).length !== 4) problemes.push(`${prefixe} : 4 choix attendus`);
  if (await page.$('#q-bouton, #q-feedback')) problemes.push(`${prefixe} : bouton « Valider » ou correction encore présents`);
  if (mobile) {
    const bas = await page.$eval('#q-choix .choice:last-child', b => b.getBoundingClientRect().bottom);
    if (bas > 844) problemes.push(`${prefixe} : dernier choix sous la ligne de flottaison (${Math.round(bas)} px)`);
  }

  let s = await lireSession(page);
  const total = s.items.length;
  if (total !== 10) problemes.push(`${prefixe} : ${total} questions au lieu de 10`);
  if (s.cible.role !== role || s.precision !== precision) problemes.push(`${prefixe} : cible ${JSON.stringify(s.cible)} / ${s.precision}`);
  const banque = JSON.parse(readFileSync(join(RACINE, 'questions.json'), 'utf8')).questions;
  const parId = new Map(banque.map(q => [q.id, q]));
  const nbCiblees = s.items.filter(it => { const q = parId.get(it.id); return Array.isArray(q.roles) ? q.roles.includes(role) : (role === 'perso' && q.profil === 'perso'); }).length;
  if (role !== 'autre' && nbCiblees < 5) problemes.push(`${prefixe} : ${nbCiblees} questions écrites pour ce profil (5 attendues)`);
  if (s.items.some(it => { const q = parId.get(it.id); return Array.isArray(q.roles) && !q.roles.includes(role); })) problemes.push(`${prefixe} : question d'un autre métier tirée`);

  let bonnes = 0;
  let clics = 0;
  for (let i = 0; i < total; i++) {
    s = await lireSession(page);
    const ordre = s.items[i].ordre;
    const position = i % 2 === 0 ? ordre.indexOf(0) : ordre.findIndex(x => x !== 0);
    if (ordre[position] === 0) bonnes++;
    const compteur = await page.$eval('#q-compteur', e => e.textContent);
    if (compteur !== `Question ${i + 1} / ${total}`) problemes.push(`${prefixe} : compteur ${compteur}`);
    if (i === 1) await page.screenshot({ path: `${OUT}${prefixe}-2-question.png` });
    if (i === 2) {
      // Retour : la question précédente revient avec la réponse marquée, un clic la remplace
      await page.click('#q-retour');
      const r = await page.evaluate(() => ({ c: document.getElementById('q-compteur').textContent, marque: document.querySelector('#q-choix .choice.is-picked')?.dataset.position }));
      const avant = (await lireSession(page)).reponses[1];
      if (r.c !== `Question 2 / ${total}` || Number(r.marque) !== avant) problemes.push(`${prefixe} : retour arrière ${JSON.stringify(r)}`);
      await repondre(page, avant);
      clics++;
    }
    await repondre(page, position);
    clics++;
    if (i === 4) {
      await page.reload({ waitUntil: 'networkidle0' });
      await espionner(page);
      if ((await etatTheme(page)).theme !== t.theme) problemes.push(`${prefixe} : thème perdu au rechargement`);
      await page.waitForSelector('#bloc-reprise:not([hidden])');
      const txt = await page.$eval('#texte-reprise', e => e.textContent);
      if (!txt.includes(`question 6 sur ${total}`)) problemes.push(`${prefixe} : reprise « ${txt} »`);
      await page.click('#btn-reprendre');
      await page.waitForSelector('#ecran-quiz:not([hidden])');
    }
  }
  if (clics !== total + 1) problemes.push(`${prefixe} : ${clics} clics pour ${total} questions (+1 retour)`);
  await page.waitForSelector('#ecran-resultat:not([hidden])');
  await pause(1100);
  await verifierLogos(page, `${prefixe} résultat`, 'compact');
  await page.screenshot({ path: `${OUT}${prefixe}-3-resultat.png` });
  await pasDeScrollHorizontal(page, `${prefixe} résultat`);

  const score = await page.$eval('#r-score', e => e.textContent);
  if (Number(score) !== Math.round(100 * bonnes / total)) problemes.push(`${prefixe} : score ${score}, attendu ${Math.round(100 * bonnes / total)}`);
  if (await page.$eval('#bulle-rdv', b => !b.hidden)) problemes.push(`${prefixe} : bulle RDV visible avant le formulaire`);

  await testerFormulaire(page, prefixe, { leads, score, role, total, mobile });
  await pause(900);
  await testerDiagnostic(page, prefixe, { score, total });
  await testerPartage(page, ctx, prefixe, score);
  const attendus = ['test_demarre', `profil_${role}`, 'question_02', 'test_termine', 'formulaire_vu', 'lead_envoye', 'rdv_ouvert', 'rdv_ouvert_bulle', 'clic_rdv', 'clic_mail', 'partage_linkedin', 'partage_copie', 'partage_instagram', 'partage_facebook', 'partage_mail'];
  const manquants = attendus.filter(e => !evenements.includes(e));
  if (manquants.length) problemes.push(`${prefixe} : événements non envoyés ${manquants}`);
  log(`${prefixe} (${role}${precision ? ` : ${precision}` : ''}) : score ${score}/100, ${nbCiblees} questions ciblées, ${evenements.length} événements, lead transmis`);

  // Rechargement : le diagnostic reste débloqué, sans nouvel envoi
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#bloc-reprise:not([hidden])');
  await page.click('#btn-reprendre');
  await page.waitForSelector('#ecran-resultat:not([hidden])');
  const apres = await page.evaluate(() => ({ score: document.getElementById('r-score').textContent, diag: !document.getElementById('r-diagnostic').hidden, gate: !document.getElementById('r-gate').hidden }));
  if (apres.score !== score || !apres.diag || apres.gate) problemes.push(`${prefixe} : après rechargement ${JSON.stringify(apres)}`);
  if (leads.length !== 1) problemes.push(`${prefixe} : ${leads.length} leads après rechargement`);
  await page.click('#btn-refaire');
  await page.waitForSelector('#ecran-accueil:not([hidden])');
  if (await page.evaluate(() => localStorage.getItem('checkup-ia:v2'))) problemes.push(`${prefixe} : session non effacée après « Refaire »`);
  // Le test suivant pré-remplit le formulaire
  await demarrer(page, role, precision);
  await repondreATout(page);
  if ((await page.$eval('#lead-email', e => e.value)) !== 'ada@exemple.fr') problemes.push(`${prefixe} : e-mail non pré-rempli au test suivant`);
  await ctx.close();
}

await parcours('dirigeant-clair', { systeme: 'light', role: 'dirigeant' });
await parcours('perso-sombre', { systeme: 'dark', role: 'perso' });
await parcours('dsi-sombre-force', { systeme: 'light', forcer: 'dark', role: 'dsi' });
await parcours('marketing-clair-force', { systeme: 'dark', forcer: 'light', role: 'marketing' });
await parcours('autre-bureau', { systeme: 'dark', role: 'autre', precision: 'juriste', mobile: false });

// Envoi du lead en échec : le diagnostic s'affiche quand même, le contact est renvoyé à la visite suivante
{
  const { ctx, page, leads, etat, evenements } = await nouvellePage({ systeme: 'light', leadsEnPanne: true });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await espionner(page);
  await demarrer(page, 'perso');
  await repondreATout(page);
  await remplirFormulaire(page, 'Grace Hopper', 'grace@exemple.fr');
  await page.waitForFunction(() => localStorage.getItem('checkup-ia:lead-en-attente'), { timeout: 8000 }).catch(() => problemes.push('lead en échec : non gardé pour plus tard'));
  if (!(await page.$eval('#cta-transmis', e => e.hidden))) problemes.push('lead en échec : « résultats transmis » affiché à tort');
  if (!evenements.includes('lead_echec')) problemes.push('lead en échec : événement lead_echec absent');
  etat.leadsEnPanne = false;
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !localStorage.getItem('checkup-ia:lead-en-attente'), { timeout: 8000 }).catch(() => problemes.push('lead en échec : non renvoyé à la visite suivante'));
  if (leads.length !== 1 || leads[0].email !== 'grace@exemple.fr') problemes.push(`lead en échec : renvoi ${leads.length}`);
  log('lead en échec : diagnostic affiché, contact renvoyé ensuite ✓');
  await ctx.close();
}

// Robot (champ piège rempli) : diagnostic affiché, rien n'est envoyé
{
  const { ctx, page, leads } = await nouvellePage({ systeme: 'light' });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await demarrer(page, 'dsi');
  await repondreATout(page);
  await page.evaluate(() => { document.getElementById('lead-site').value = 'spam'; });
  await remplirFormulaire(page);
  await pause(800);
  if (leads.length) problemes.push('robot : lead envoyé malgré le champ piège');
  log('robot : rien envoyé ✓');
  await ctx.close();
}

// Copie refusée : message honnête, rien de marqué comme copié
{
  const { ctx, page } = await nouvellePage({ systeme: 'dark' });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('refus', 'NotAllowedError')); });
  await demarrer(page, 'perso');
  await repondreATout(page);
  await remplirFormulaire(page);
  // Icône au centre de l'écran : la bulle RDV, fixe en bas, ne doit pas recevoir le clic.
  await page.$eval('#partage-copier', b => b.scrollIntoView({ block: 'center' }));
  await pause(400);
  await page.click('#partage-copier');
  await attendreToast(page);
  const t = await toastDe(page, '#toast');
  const fait = await page.$eval('#partage-copier', b => b.classList.contains('is-done'));
  if (!t.texte.includes('Copie impossible') || fait) problemes.push(`copie refusée : ${JSON.stringify({ t, fait })}`);
  log('copie refusée : message honnête ✓');
  await ctx.close();
}

// Stockage bloqué : l'app fonctionne, la bascule vaut pour la visite, aucune erreur JS (GoatCounter compris)
{
  const { ctx, page } = await nouvellePage({ systeme: 'light', stockageBloque: true });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.click('#btn-theme');
  if ((await etatTheme(page)).theme !== 'dark') problemes.push('stockage bloqué : bascule inopérante');
  await demarrer(page, 'perso');
  await repondreATout(page);
  await remplirFormulaire(page);
  log('stockage bloqué : bascule, quiz et diagnostic OK ✓');
  await ctx.close();
}

// Pages secondaires : mentions légales (refus de la mesure d'audience), 404
{
  const { ctx, page } = await nouvellePage({ systeme: 'dark' });
  await page.goto(`${BASE}mentions-legales.html`, { waitUntil: 'networkidle0' });
  const ml = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, texte: document.body.innerText, bouton: document.getElementById('btn-opt-out')?.textContent }));
  for (const attendu of ['MANICA LABS', '999 397 490', 'FR82999397490', '11 avenue Paul Verlaine', 'Cédric Delalande', 'GitHub, Inc.', 'GoatCounter', 'CNIL', 'diagnostic détaillé', 'Google Workspace', '3 ans']) if (!ml.texte.includes(attendu)) problemes.push(`mentions légales : « ${attendu} » absent`);
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
  const { ctx, page } = await nouvellePage({ systeme: 'dark', avecServiceWorker: true });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle0' });
  const caches = await page.evaluate(async () => (await caches.keys()).join(','));
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await pause(800);
  await demarrer(page, 'marketing');
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
