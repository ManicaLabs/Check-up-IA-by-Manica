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

// --- Script inline : syntaxe ---
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) erreur(`index.html : 1 bloc <script> attendu, ${scripts.length} trouvé(s)`);
const dossierTmp = mkdtempSync(join(tmpdir(), 'checkup-'));
const fichierJs = join(dossierTmp, 'inline.js');
writeFileSync(fichierJs, scripts.join('\n'));
try {
  execFileSync(process.execPath, ['--check', fichierJs], { stdio: 'pipe' });
} catch (e) {
  erreur(`index.html : erreur de syntaxe JS\n${e.stderr}`);
}
for (const f of ['sw.js', 'tools/validate.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', join(racine, f)], { stdio: 'pipe' });
  } catch (e) {
    erreur(`${f} : erreur de syntaxe JS\n${e.stderr}`);
  }
}

// --- Logique pure extraite d'index.html ---
const logique = scripts[0].match(/\/\/ === LOGIQUE PURE[^\n]*\n([\s\S]*?)\/\/ === FIN LOGIQUE PURE ===/);
if (!logique) throw new Error('Marqueurs LOGIQUE PURE introuvables dans index.html');
const L = new Function(`${logique[1]}; return { melanger, tirerQuestions, choixAffiches, calculerResultat, niveauPour, remplir, lienMail, valeursModele, typo };`)();

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
if (!/^https:\/\//.test(config.contact.lien_rdv)) erreur('config.json : lien_rdv doit être une URL https');
if (!/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(config.contact.email)) erreur('config.json : email invalide');
const variables = new Set(['score', 'niveau', 'profil', 'detail_axes']);
for (const [nom, modele] of [['mail.objet', config.mail.objet], ['mail.corps', config.mail.corps], ['partage.texte', config.partage.texte]]) {
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
      if (erreurs.length) break;
    }
  }
  const jamais = banque.questions.filter(q => statuts.includes(q.statut) && !vus.has(q.id)).map(q => q.id);
  if (jamais.length) erreur(`questions jamais tirées : ${jamais.join(', ')}`);

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

// --- Bilan ---
const aValider = banque.questions.filter(q => q.statut === 'a_valider').length;
console.log(`${banque.questions.length} questions (${aValider} à valider), ${axesIds.length} axes, profils : ${profils.join(', ')}`);
for (const p of profils) {
  const detail = axesIds.map(a => `${a} ${banque.questions.filter(q => q.axe === a && (q.profil === 'tous' || q.profil === p)).length}`).join(', ');
  console.log(`  ${p} : ${detail}`);
}
console.log(`Bonne réponse = choix le plus long : ${Math.round(partPlusLongue * 100)} %, le plus court : ${Math.round(partPlusCourte * 100)} %`);
avertissements.forEach(a => console.log(`⚠ ${a}`));
if (erreurs.length) {
  erreurs.forEach(e => console.error(`✗ ${e}`));
  process.exit(1);
}
console.log('✓ Validation OK');
