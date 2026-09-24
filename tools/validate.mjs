// Validation avant push : node tools/validate.mjs
// Vérifie questions.json, config.json, la syntaxe du JS inline, les fichiers référencés,
// et simule des milliers de tirages avec la vraie logique extraite d'index.html.
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = f => readFileSync(join(racine, f), 'utf8');
const erreurs = [];
const avertissements = [];
const erreur = m => erreurs.push(m);

const config = JSON.parse(lire('config.json'));
const banque = JSON.parse(lire('questions.json'));
const html = lire('index.html');

// --- Scripts inline : syntaxe (chaque bloc séparément) ---
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) erreur('index.html : aucun bloc <script> inline');
const dossierTmp = mkdtempSync(join(tmpdir(), 'checkup-'));
scripts.forEach((code, i) => {
  const fichierJs = join(dossierTmp, `inline-${i}.js`);
  writeFileSync(fichierJs, code);
  try {
    execFileSync(process.execPath, ['--check', fichierJs], { stdio: 'pipe' });
  } catch (e) {
    erreur(`index.html : erreur de syntaxe JS dans le bloc <script> n° ${i + 1}\n${e.stderr}`);
  }
});
for (const f of ['sw.js', 'tools/validate.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', join(racine, f)], { stdio: 'pipe' });
  } catch (e) {
    erreur(`${f} : erreur de syntaxe JS\n${e.stderr}`);
  }
}

// --- Logique pure extraite d'index.html ---
const logique = scripts.join('\n').match(/\/\/ === LOGIQUE PURE[^\n]*\n([\s\S]*?)\/\/ === FIN LOGIQUE PURE ===/);
if (!logique) throw new Error('Marqueurs LOGIQUE PURE introuvables dans index.html');
const L = new Function(`${logique[1]}; return { melanger, tirerQuestions, choixAffiches, calculerResultat, niveauPour, remplir, lienMail, valeursModele, postLinkedIn, typo };`)();

// --- config.json ---
const axesIds = config.axes.map(a => a.id);
const profils = Object.keys(config.profils);
if (new Set(axesIds).size !== axesIds.length) erreur('config.json : id d’axe en double');
if (config.niveaux[0].min !== 0) erreur('config.json : le premier niveau doit commencer à 0');
config.niveaux.forEach((n, i) => {
  if (i && n.min <= config.niveaux[i - 1].min) erreur(`config.json : niveaux non triés (${n.nom})`);
  if (!n.nom || !n.message) erreur(`config.json : niveau incomplet (min ${n.min})`);
});
for (const axe of axesIds) {
  for (const p of profils) {
    const r = config.recommandations?.[axe]?.[p];
    if (!r?.titre || !r?.texte) erreur(`config.json : recommandation manquante ${axe} / ${p}`);
  }
}
for (const p of profils) {
  if (!config.cta.sous_titre[p]) erreur(`config.json : cta.sous_titre.${p} manquant`);
  if (!config.cta.positionnement[p]) erreur(`config.json : cta.positionnement.${p} manquant`);
}
for (const k of ['titre', 'texte', 'mail_objet']) if (!config.partage?.[k]) erreur(`config.json : partage.${k} manquant`);
// Post LinkedIn : textes présents et variables autorisées
const li = config.partage?.linkedin || {};
const variablesDe = t => [...String(t || '').matchAll(/\{(\w+)\}/g)].map(m => m[1]);
for (const k of ['modele', 'ligne_fort', 'ligne_chantier', 'hashtags']) if (!li[k]) erreur(`config.json : partage.linkedin.${k} manquant`);
for (const v of variablesDe(li.modele)) if (!['accroche', 'points', 'enseignement', 'url', 'hashtags'].includes(v)) erreur(`config.json : variable inconnue {${v}} dans partage.linkedin.modele`);
for (const k of ['ligne_fort', 'ligne_chantier']) for (const v of variablesDe(li[k])) if (!['axe', 'pct'].includes(v)) erreur(`config.json : variable inconnue {${v}} dans partage.linkedin.${k}`);
for (const n of config.niveaux) {
  if (!n.accroche_linkedin) erreur(`config.json : accroche_linkedin manquante pour le niveau ${n.nom}`);
  for (const v of variablesDe(n.accroche_linkedin)) if (v !== 'score') erreur(`config.json : variable inconnue {${v}} dans l'accroche LinkedIn ${n.nom}`);
}
for (const axe of config.axes.map(a => a.id)) for (const p of Object.keys(config.profils)) {
  if (!li.enseignements?.[axe]?.[p]) erreur(`config.json : partage.linkedin.enseignements.${axe}.${p} manquant`);
}
if (!/^https:\/\//.test(config.contact.lien_rdv)) erreur('config.json : lien_rdv doit être une URL https');
if (!/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(config.contact.email)) erreur('config.json : email invalide');
const variables = new Set(['score', 'niveau', 'profil', 'detail_axes']);
for (const [nom, modele] of [['mail.objet', config.mail.objet], ['mail.corps', config.mail.corps], ['partage.texte', config.partage.texte], ['partage.mail_objet', config.partage.mail_objet]]) {
  for (const [, v] of modele.matchAll(/\{(\w+)\}/g)) if (!variables.has(v)) erreur(`config.json : variable inconnue {${v}} dans ${nom}`);
}

// --- questions.json ---
const DIFFICULTES = ['facile', 'moyen', 'avance'];
const STATUTS = ['a_valider', 'valide'];
const ids = new Set();
const normaliser = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
const enonces = new Set();
let plusLongue = 0;
let plusCourte = 0;
for (const q of banque.questions) {
  const ref = q.id || JSON.stringify(q).slice(0, 60);
  if (!q.id) erreur(`question sans id : ${ref}`);
  if (ids.has(q.id)) erreur(`id en double : ${q.id}`);
  ids.add(q.id);
  if (!axesIds.includes(q.axe)) erreur(`${ref} : axe inconnu « ${q.axe} »`);
  if (!['tous', ...profils].includes(q.profil)) erreur(`${ref} : profil inconnu « ${q.profil} »`);
  if (!DIFFICULTES.includes(q.difficulte)) erreur(`${ref} : difficulté inconnue « ${q.difficulte} »`);
  if (!STATUTS.includes(q.statut)) erreur(`${ref} : statut inconnu « ${q.statut} »`);
  for (const champ of ['question', 'bonne_reponse', 'explication']) {
    if (typeof q[champ] !== 'string' || !q[champ].trim()) erreur(`${ref} : champ « ${champ} » vide`);
  }
  if (!Array.isArray(q.distracteurs) || q.distracteurs.length !== 3) erreur(`${ref} : exactement 3 distracteurs attendus`);
  const choix = [q.bonne_reponse, ...(q.distracteurs || [])].map(normaliser);
  if (new Set(choix).size !== choix.length) erreur(`${ref} : choix en double`);
  if (enonces.has(normaliser(q.question))) erreur(`${ref} : énoncé en double`);
  enonces.add(normaliser(q.question));
  const longueurs = choix.map(c => c.length);
  if (longueurs[0] > Math.max(...longueurs.slice(1))) plusLongue++;
  if (longueurs[0] < Math.min(...longueurs.slice(1))) plusCourte++;
}
// La longueur des choix ne doit pas trahir la bonne réponse (idéal : ~25 % chacun).
const partPlusLongue = plusLongue / banque.questions.length;
const partPlusCourte = plusCourte / banque.questions.length;
for (const [part, sens] of [[partPlusLongue, 'long'], [partPlusCourte, 'court']]) {
  if (part > 0.4) avertissements.push(`La bonne réponse est le choix le plus ${sens} dans ${Math.round(part * 100)} % des questions (indice exploitable)`);
}

// --- Pools par profil et par axe ---
const parAxe = config.quiz.questions_par_axe;
const statuts = config.quiz.statuts_publies;
for (const p of profils) {
  for (const axe of axesIds) {
    const pool = banque.questions.filter(q => q.axe === axe && (q.profil === 'tous' || q.profil === p) && statuts.includes(q.statut));
    const nb = d => pool.filter(q => q.difficulte === d).length;
    if (pool.length < parAxe) erreur(`pool ${p} / ${axe} : ${pool.length} question(s) publiée(s), ${parAxe} requises`);
    if (!nb('facile')) erreur(`pool ${p} / ${axe} : aucune question facile publiée`);
    if (!nb('avance')) erreur(`pool ${p} / ${axe} : aucune question avancée publiée`);
  }
}

// --- Post LinkedIn généré ---
let postsVerifies = 0;
function verifierPost(post, r, p) {
  postsVerifies++;
  const ref = `post LinkedIn (${p}, ${r.score}/100)`;
  if (/\{\w+\}/.test(post)) erreur(`${ref} : variable non remplacée\n${post}`);
  if (post.length > 3000) erreur(`${ref} : ${post.length} caractères (max LinkedIn 3000)`);
  if (!post.split('\n')[0].includes(`${r.score}/100`)) erreur(`${ref} : le score n'est pas dans la première ligne`);
  if (!post.includes(config.url_app)) erreur(`${ref} : lien du test absent`);
  if (/\n{3,}/.test(post)) erreur(`${ref} : lignes vides en trop`);
}

// --- Simulation de tirages ---
const questionsParId = new Map(banque.questions.map(q => [q.id, q]));
let graine = 42;
const rnd = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
const total = parAxe * axesIds.length;
const vus = new Map();
if (!erreurs.length) {
  for (const p of profils) {
    for (let t = 0; t < 3000; t++) {
      const tirage = L.tirerQuestions(banque.questions, config.axes, p, parAxe, statuts, rnd);
      if (tirage.length !== total) { erreur(`tirage ${p} : ${tirage.length} questions au lieu de ${total}`); break; }
      if (new Set(tirage.map(q => q.id)).size !== total) { erreur(`tirage ${p} : doublon`); break; }
      for (const axe of axesIds) {
        const qs = tirage.filter(q => q.axe === axe);
        if (qs.length !== parAxe) erreur(`tirage ${p} : axe ${axe} a ${qs.length} questions`);
        if (!qs.some(q => q.difficulte === 'facile') || !qs.some(q => q.difficulte === 'avance')) erreur(`tirage ${p} : axe ${axe} sans mixité de difficulté`);
      }
      if (tirage.some(q => q.profil !== 'tous' && q.profil !== p)) erreur(`tirage ${p} : question d’un autre profil`);
      tirage.forEach(q => vus.set(q.id, (vus.get(q.id) || 0) + 1));

      const items = tirage.map(q => ({ id: q.id, ordre: L.melanger([0, 1, 2, 3], rnd) }));
      items.forEach(it => {
        const affiches = L.choixAffiches(questionsParId.get(it.id), it.ordre);
        if (affiches[it.ordre.indexOf(0)] !== questionsParId.get(it.id).bonne_reponse) erreur(`${it.id} : bonne réponse mal repérée après mélange`);
      });
      const reponses = items.map(() => Math.floor(rnd() * 4));
      const r = L.calculerResultat(items, reponses, questionsParId, config.axes, config);
      const attendu = items.filter((it, i) => it.ordre[reponses[i]] === 0).length * config.quiz.points_par_bonne_reponse;
      if (r.score !== attendu || r.score % 5 || r.score < 0 || r.score > 100) erreur(`score incohérent : ${r.score} (attendu ${attendu})`);
      if (r.faibles.length !== 3) erreur('il faut 3 axes faibles');
      if (r.niveau !== L.niveauPour(r.score, config.niveaux)) erreur('niveau incohérent');
      const mail = decodeURIComponent(L.lienMail(config, p, r));
      if (/\{\w+\}/.test(mail)) erreur(`mail : variable non remplacée\n${mail}`);
      const partage = L.remplir(config.partage.texte, L.valeursModele(config, p, r));
      if (/\{\w+\}/.test(partage)) erreur('partage : variable non remplacée');
      verifierPost(L.postLinkedIn(config, p, r), r, p);
      if (erreurs.length) break;
    }
  }
  const jamais = banque.questions.filter(q => statuts.includes(q.statut) && !vus.has(q.id)).map(q => q.id);
  if (jamais.length) erreur(`questions jamais tirées : ${jamais.join(', ')}`);

  // Cas extrêmes du post LinkedIn : tout juste, tout faux
  for (const p of profils) {
    const tirage = L.tirerQuestions(banque.questions, config.axes, p, parAxe, statuts, rnd);
    const items = tirage.map(q => ({ id: q.id, ordre: [0, 1, 2, 3] }));
    for (const reponse of [0, 1]) {
      const r = L.calculerResultat(items, items.map(() => reponse), questionsParId, config.axes, config);
      const post = L.postLinkedIn(config, p, r);
      verifierPost(post, r, p);
      if (r.score === 100 && /chantier/i.test(post)) erreur(`post LinkedIn ${p} 100/100 : « prochain chantier » affiché à tort`);
      if (r.score === 0 && /point fort/i.test(post)) erreur(`post LinkedIn ${p} 0/100 : « point fort » affiché à tort`);
    }
  }

  // Scores limites
  for (const [score, niveau] of [[0, 'Découverte'], [35, 'Découverte'], [40, 'Curieux'], [60, 'Curieux'], [65, 'Pratiquant'], [80, 'Pratiquant'], [85, 'Avancé'], [100, 'Avancé']]) {
    const n = L.niveauPour(score, config.niveaux).nom;
    if (n !== niveau) erreur(`score ${score} → niveau ${n}, attendu ${niveau}`);
  }
  const t = L.typo("Qu'est-ce que « ça » ? 90 %");
  if (t !== 'Qu’est-ce que « ça » ? 90 %') erreur(`typo() inattendu : ${JSON.stringify(t)}`);
}

// --- Fichiers référencés ---
const refs = new Set();
for (const [, u] of html.matchAll(/(?:href|src)="([^"#:]+?)"/g)) refs.add(u);
for (const [, liste] of html.matchAll(/srcset="([^"]+)"/g)) liste.split(',').forEach(c => refs.add(c.trim().split(/\s+/)[0]));
const manifeste = JSON.parse(lire('manifest.webmanifest'));
manifeste.icons.forEach(i => refs.add(i.src));
const sw = lire('sw.js');
const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
precache.filter(u => u !== './').forEach(u => refs.add(u));
for (const f of refs) if (!existsSync(join(racine, f))) erreur(`fichier référencé introuvable : ${f}`);
for (const f of ['config.json', 'questions.json', 'index.html', 'manifest.webmanifest']) {
  if (!precache.includes(f)) erreur(`sw.js : ${f} absent du PRECACHE`);
}
if (!html.includes(`content="${config.url_app}og-image.png"`)) avertissements.push('og:image ne pointe pas vers url_app de config.json');

// --- Presse-papiers : toute écriture doit être confirmée à l'écran (afficherToast) juste après ---
const lignesHtml = html.split('\n');
lignesHtml.forEach((ligne, i) => {
  if (!/clipboard\.write|execCommand\(\s*['"](copy|cut)/.test(ligne)) return;
  const suite = lignesHtml.slice(i, i + 40).join('\n');
  if (!/afficherToast\(/.test(suite)) erreur(`index.html:${i + 1} : écriture dans le presse-papiers sans confirmation visible (afficherToast) dans les 40 lignes suivantes`);
});
if (!/<div class="toast" id="toast" role="status" aria-live="polite"/.test(html)) erreur('index.html : la région live #toast doit exister dès le chargement');

// --- Appels externes : seul GoatCounter est autorisé, script tiers verrouillé par SRI ---
const ORIGINES_AUTORISEES = ['https://gc.zgo.at', 'https://manica.goatcounter.com'];
for (const [balise] of html.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*>/g)) {
  const [, url] = balise.match(/\b(?:src|href)="((?:https?:)?\/\/[^"]+)"/) || [];
  if (!url) continue;
  const origine = new URL(url, 'https://x').origin;
  if (/rel="canonical"/.test(balise)) continue;
  if (!ORIGINES_AUTORISEES.includes(origine)) erreur(`ressource externe non autorisée : ${url}`);
  if (/^<script/.test(balise) && !/integrity="sha(256|384|512)-/.test(balise)) erreur(`script externe sans empreinte SRI : ${url}`);
}
const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
for (const origine of csp.match(/https:\/\/[^\s;]+/g) || []) {
  if (!ORIGINES_AUTORISEES.includes(origine)) erreur(`CSP : origine non prévue ${origine}`);
}
if (!/connect-src 'self' https:\/\/manica\.goatcounter\.com/.test(csp)) erreur('CSP : connect-src doit autoriser manica.goatcounter.com');

// --- Bilan ---
const aValider = banque.questions.filter(q => q.statut === 'a_valider').length;
console.log(`${banque.questions.length} questions (${aValider} à valider), ${axesIds.length} axes, profils : ${profils.join(', ')}`);
for (const p of profils) {
  const detail = axesIds.map(a => `${a} ${banque.questions.filter(q => q.axe === a && (q.profil === 'tous' || q.profil === p)).length}`).join(', ');
  console.log(`  ${p} : ${detail}`);
}
console.log(`Posts LinkedIn vérifiés : ${postsVerifies}`);
console.log(`Bonne réponse = choix le plus long : ${Math.round(partPlusLongue * 100)} %, le plus court : ${Math.round(partPlusCourte * 100)} %`);
avertissements.forEach(a => console.log(`⚠ ${a}`));
if (erreurs.length) {
  erreurs.forEach(e => console.error(`✗ ${e}`));
  process.exit(1);
}
console.log('✓ Validation OK');
