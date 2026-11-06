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
for (const f of ['sw.js', 'tools/validate.mjs', 'tools/e2e.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', join(racine, f)], { stdio: 'pipe' });
  } catch (e) {
    erreur(`${f} : erreur de syntaxe JS\n${e.stderr}`);
  }
}

// --- Logique pure extraite d'index.html ---
const logique = scripts.join('\n').match(/\/\/ === LOGIQUE PURE[^\n]*\n([\s\S]*?)\/\/ === FIN LOGIQUE PURE ===/);
if (!logique) throw new Error('Marqueurs LOGIQUE PURE introuvables dans index.html');
const L = new Function(`${logique[1]}; return { melanger, tirerQuestions, choixAffiches, calculerResultat, niveauPour, remplir, lienMail, valeursModele, postLinkedIn, typo, cibleDe, questionAccessible, questionCiblee, libelleRole, texteCible, tonAxe, donneesLead, EMAIL_VALIDE };`)();

// --- config.json ---
const axesIds = config.axes.map(a => a.id);
const profils = Object.keys(config.profils);
// --- Rôles (profils proposés à l'accueil) ---
const roles = config.roles || [];
const rolesIds = roles.map(r => r.id);
if (!roles.length) erreur('config.json : roles manquant');
if (new Set(rolesIds).size !== rolesIds.length) erreur('config.json : id de rôle en double');
for (const r of roles) {
  if (!r.id || !r.libelle) erreur(`config.json : rôle incomplet ${JSON.stringify(r)}`);
  if (!profils.includes(r.profil)) erreur(`config.json : rôle ${r.id} rattaché à un profil inconnu « ${r.profil} »`);
}
for (const p of profils) if (!roles.some(r => r.profil === p)) erreur(`config.json : aucun rôle pour le profil ${p}`);
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
for (const k of Object.keys(config.cta.sous_titre)) if (!profils.includes(k) && !rolesIds.includes(k)) erreur(`config.json : cta.sous_titre.${k} ne correspond à aucun profil ni rôle`);
if (!Array.isArray(config.cta.reassurance) || !config.cta.reassurance.length || config.cta.reassurance.length > 3) erreur('config.json : cta.reassurance doit lister 1 à 3 micro-réassurances');
for (const k of ['bouton_rdv', 'bouton_mail', 'resultats_transmis']) if (!config.cta[k]) erreur(`config.json : cta.${k} manquant`);
if (!config.cta.bulle?.question || !config.cta.bulle?.action) erreur('config.json : cta.bulle.question / action manquants');
if (!/^https:\/\/calendar\.google\.com\/calendar\/appointments\/schedules\/[\w-]+\?gv=true$/.test(config.contact.lien_rdv_integre || '')) erreur('config.json : contact.lien_rdv_integre doit être l’agenda Google intégrable (…/calendar/appointments/schedules/…?gv=true)');
if (typeof config.leads !== 'object' || !('url' in config.leads)) erreur('config.json : leads.url manquant');
else if (!config.leads.url) avertissements.push('config.json : leads.url est vide, les contacts du formulaire ne sont transmis nulle part (voir docs/LEADS.md)');
else if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.leads.url)) erreur('config.json : leads.url doit être une URL d’application web Apps Script (https://script.google.com/macros/s/…/exec)');
if (!config.a_propos?.titre || !config.a_propos?.texte) erreur('config.json : a_propos.titre / texte manquants');
if (config.a_propos?.linkedin && !/^https:\/\/(www\.)?linkedin\.com\//.test(config.a_propos.linkedin)) erreur('config.json : a_propos.linkedin doit être une URL linkedin.com');
if (!Array.isArray(config.faq) || !config.faq.length || config.faq.some(f => !f.q || !f.r)) erreur('config.json : faq incomplète');
if (!Number.isInteger(config.quiz.questions_ciblees_par_axe) || config.quiz.questions_ciblees_par_axe < 0 || config.quiz.questions_ciblees_par_axe > config.quiz.questions_par_axe) erreur('config.json : quiz.questions_ciblees_par_axe doit être un entier entre 0 et questions_par_axe');
// Boutons de l'accueil ↔ rôles de config.json
const boutonsRoles = [...html.matchAll(/data-role="([\w-]+)"/g)].map(m => m[1]);
for (const id of rolesIds) if (!boutonsRoles.includes(id)) erreur(`index.html : pas de bouton data-role="${id}" pour le rôle de config.json`);
for (const id of boutonsRoles) if (!rolesIds.includes(id)) erreur(`index.html : bouton data-role="${id}" sans rôle dans config.json`);
for (const r of roles) if (r.precision && !html.includes('id="zone-autre"')) erreur(`index.html : le rôle ${r.id} demande une précision mais le champ est absent`);
for (const k of ['titre', 'texte', 'mail_objet']) if (!config.partage?.[k]) erreur(`config.json : partage.${k} manquant`);
const interlocuteur = config.cta?.interlocuteur || {};
for (const k of ['nom', 'role', 'photo']) if (!interlocuteur[k]) erreur(`config.json : cta.interlocuteur.${k} manquant`);
if (interlocuteur.photo && !existsSync(join(racine, interlocuteur.photo))) erreur(`config.json : photo introuvable ${interlocuteur.photo}`);
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
  if ('roles' in q) {
    if (!Array.isArray(q.roles) || !q.roles.length) erreur(`${ref} : roles doit être une liste non vide`);
    else for (const r of q.roles) {
      const role = roles.find(x => x.id === r);
      if (!role) erreur(`${ref} : rôle inconnu « ${r} »`);
      else if (q.profil !== 'tous' && role.profil !== q.profil) erreur(`${ref} : rôle « ${r} » incompatible avec le profil ${q.profil}`);
    }
  }
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
const ciblees = config.quiz.questions_ciblees_par_axe || 0;
const cibles = roles.map(r => L.cibleDe(config, r.id));
for (const c of cibles) {
  for (const axe of axesIds) {
    const pool = banque.questions.filter(q => q.axe === axe && L.questionAccessible(q, c) && statuts.includes(q.statut));
    const nb = d => pool.filter(q => q.difficulte === d).length;
    if (pool.length < parAxe) erreur(`pool ${c.role} / ${axe} : ${pool.length} question(s) publiée(s), ${parAxe} requises`);
    const niveaux = DIFFICULTES.filter(d => nb(d)).length;
    if (niveaux < Math.min(parAxe, DIFFICULTES.length)) erreur(`pool ${c.role} / ${axe} : ${niveaux} niveau(x) de difficulté publié(s), il en faut ${Math.min(parAxe, DIFFICULTES.length)} pour varier le tirage`);
    for (const d of DIFFICULTES) if (!nb(d)) avertissements.push(`pool ${c.role} / ${axe} : aucune question « ${d} » publiée`);
    if (ciblees && c.role !== 'autre' && !pool.some(q => L.questionCiblee(q, c))) avertissements.push(`pool ${c.role} / ${axe} : aucune question écrite pour ce profil`);
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

// --- Données transmises à Manica (formulaire du diagnostic) ---
let leadsVerifies = 0;
function verifierLead(c, items, reponses, r, precision) {
  leadsVerifies++;
  const s = { cible: c, precision, items, reponses };
  const d = L.donneesLead(config, s, r, questionsParId, { nom: '  Ada Lovelace ', email: 'ada@exemple.fr ', optin: true }, { id: 'test-id', date: '2026-11-06T10:00:00.000Z', source: { utm_source: 'linkedin' }, page: config.url_app });
  const ref = `lead (${c.role}, ${r.score}/100)`;
  if (d.nom !== 'Ada Lovelace' || d.email !== 'ada@exemple.fr') erreur(`${ref} : nom ou e-mail mal nettoyé`);
  if (d.score !== r.score || d.total !== items.length || d.reponses.length !== items.length) erreur(`${ref} : score ou réponses incohérents`);
  if (d.reponses.filter(x => x.juste).length !== r.bonnes) erreur(`${ref} : nombre de réponses justes incohérent`);
  if (d.priorites.length !== 3 || d.priorites.some(p => !p.titre || !p.texte)) erreur(`${ref} : priorités incomplètes`);
  if (d.axes.length !== axesIds.length) erreur(`${ref} : axes incomplets`);
  if (d.profil !== L.libelleRole(config, c, precision)) erreur(`${ref} : profil mal libellé`);
  const json = JSON.stringify(d);
  if (json.length > 30000) erreur(`${ref} : ${json.length} caractères, trop lourd pour un envoi`);
  d.reponses.forEach((x, i) => {
    const q = questionsParId.get(items[i].id);
    if (x.id !== q.id || !x.question || !x.reponse || !x.explication || !x.axe) erreur(`${ref} : corrigé incomplet pour ${q.id}`);
    if (x.juste !== (x.reponse === L.typo(q.bonne_reponse))) erreur(`${ref} : réponse donnée incohérente pour ${q.id}`);
    if (x.juste ? x.bonne : x.bonne !== L.typo(q.bonne_reponse)) erreur(`${ref} : bonne réponse mal transmise pour ${q.id}`);
  });
}
for (const [email, ok] of [['a@b.fr', true], ['prenom.nom@entreprise.co.uk', true], ['a@b', false], ['a b@c.fr', false], ['', false], ['a@b.c', false]]) {
  if (L.EMAIL_VALIDE.test(email) !== ok) erreur(`EMAIL_VALIDE : « ${email} » devrait être ${ok ? 'accepté' : 'refusé'}`);
}
for (const [pct, ton] of [[0, 'ko'], [29, 'ko'], [30, 'mid'], [50, 'mid'], [59, 'mid'], [60, 'ok'], [100, 'ok']]) {
  if (L.tonAxe(pct).ton !== ton) erreur(`tonAxe(${pct}) devrait être ${ton}`);
}

// --- Simulation de tirages ---
const questionsParId = new Map(banque.questions.map(q => [q.id, q]));
let graine = 42;
const rnd = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
const total = parAxe * axesIds.length;

// Les textes qui annoncent un nombre de questions ou d'axes doivent correspondre au tirage réel.
for (const f of ['index.html', 'config.json', 'manifest.webmanifest', 'tools/og-image.html', 'README.md', '404.html', 'mentions-legales.html']) {
  const texte = lire(f);
  for (const [, n] of texte.matchAll(/(\d+)\s+questions\b/g)) if (Number(n) !== total && Number(n) !== banque.questions.length) erreur(`${f} : « ${n} questions » annoncé, le test en tire ${total}`);
  for (const [, n] of texte.matchAll(/(\d+)\s+axes\b/g)) if (Number(n) !== axesIds.length) erreur(`${f} : « ${n} axes » annoncé, il y en a ${axesIds.length}`);
}
const vus = new Map();
if (!erreurs.length) {
  for (const c of cibles) {
    const p = c.profil;
    for (let t = 0; t < 2000; t++) {
      const tirage = L.tirerQuestions(banque.questions, config.axes, c, parAxe, statuts, rnd, ciblees);
      if (tirage.length !== total) { erreur(`tirage ${p} : ${tirage.length} questions au lieu de ${total}`); break; }
      if (new Set(tirage.map(q => q.id)).size !== total) { erreur(`tirage ${p} : doublon`); break; }
      for (const axe of axesIds) {
        const qs = tirage.filter(q => q.axe === axe);
        if (qs.length !== parAxe) erreur(`tirage ${p} : axe ${axe} a ${qs.length} questions`);
        if (new Set(qs.map(q => q.difficulte)).size !== Math.min(parAxe, DIFFICULTES.length)) erreur(`tirage ${c.role} : axe ${axe} sans difficultés variées (${qs.map(q => q.difficulte)})`);
        const dispoCiblees = banque.questions.filter(q => q.axe === axe && statuts.includes(q.statut) && L.questionAccessible(q, c) && L.questionCiblee(q, c)).length;
        if (qs.filter(q => L.questionCiblee(q, c)).length < Math.min(ciblees, dispoCiblees)) erreur(`tirage ${c.role} : axe ${axe} sans question écrite pour ce profil`);
      }
      if (tirage.some(q => !L.questionAccessible(q, c))) erreur(`tirage ${c.role} : question d’un autre profil ou métier`);
      tirage.forEach(q => vus.set(q.id, (vus.get(q.id) || 0) + 1));

      const items = tirage.map(q => ({ id: q.id, ordre: L.melanger([0, 1, 2, 3], rnd) }));
      items.forEach(it => {
        const affiches = L.choixAffiches(questionsParId.get(it.id), it.ordre);
        if (affiches[it.ordre.indexOf(0)] !== questionsParId.get(it.id).bonne_reponse) erreur(`${it.id} : bonne réponse mal repérée après mélange`);
      });
      const reponses = items.map(() => Math.floor(rnd() * 4));
      const r = L.calculerResultat(items, reponses, questionsParId, config.axes, config);
      const attendu = Math.round(100 * items.filter((it, i) => it.ordre[reponses[i]] === 0).length / items.length);
      if (r.score !== attendu || r.score < 0 || r.score > 100) erreur(`score incohérent : ${r.score} (attendu ${attendu})`);
      if (r.faibles.some((f, k) => k && (f.pct < r.faibles[k - 1].pct || (f.pct === r.faibles[k - 1].pct && f.lacune > r.faibles[k - 1].lacune)))) erreur('priorités mal ordonnées (score puis lacune)');
      if (r.faibles.length !== 3) erreur('il faut 3 axes faibles');
      if (r.niveau !== L.niveauPour(r.score, config.niveaux)) erreur('niveau incohérent');
      const precision = c.role === 'autre' ? 'juriste' : '';
      const mail = decodeURIComponent(L.lienMail(config, c, r, precision));
      if (/\{\w+\}/.test(mail)) erreur(`mail : variable non remplacée\n${mail}`);
      if (!mail.includes(L.libelleRole(config, c, precision))) erreur(`mail ${c.role} : profil absent`);
      if (!L.texteCible(config.cta.sous_titre, c)) erreur(`cta.sous_titre : rien pour ${c.role}`);
      const partage = L.remplir(config.partage.texte, L.valeursModele(config, c, r, precision));
      if (/\{\w+\}/.test(partage)) erreur('partage : variable non remplacée');
      verifierPost(L.postLinkedIn(config, p, r), r, p);
      if (t < 50) verifierLead(c, items, reponses, r, precision);
      if (erreurs.length) break;
    }
  }
  const jamais = banque.questions.filter(q => statuts.includes(q.statut) && !vus.has(q.id)).map(q => q.id);
  if (jamais.length) erreur(`questions jamais tirées : ${jamais.join(', ')}`);

  // Cas extrêmes du post LinkedIn : tout juste, tout faux
  for (const c of cibles) {
    const p = c.profil;
    const tirage = L.tirerQuestions(banque.questions, config.axes, c, parAxe, statuts, rnd, ciblees);
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

// --- Pages secondaires (mentions légales, 404) : fichiers référencés présents, aucune ressource externe ---
for (const f of ['mentions-legales.html', '404.html']) {
  if (!existsSync(join(racine, f))) { erreur(`${f} manquant`); continue; }
  const page = lire(f);
  for (const [, u] of page.matchAll(/(?:href|src)="([^"#:]+?)"/g)) {
    if (u === './' || u.startsWith('/')) continue;
    if (!existsSync(join(racine, u))) erreur(`${f} : fichier référencé introuvable ${u}`);
  }
  for (const [balise] of page.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*>/g)) {
    if (/\b(?:src|href)="(?:https?:)?\/\//.test(balise)) erreur(`${f} : ressource externe interdite ${balise}`);
  }
  if (/\sstyle="/.test(page)) erreur(`${f} : style en ligne bloqué par la CSP (style-src 'self')`);
}
if (!/<base href="\/Check-up-IA-by-Manica\/">/.test(lire('404.html'))) avertissements.push('404.html : base href à adapter si le site change d\'adresse');

// --- Mobile : survols réservés aux souris, champs de saisie à 16 px minimum (pas de zoom iOS) ---
const css = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '').replace(/\/\*[\s\S]*?\*\//g, '');
const debutSurvol = css.indexOf('@media (hover: hover) and (pointer: fine) {');
let finSurvol = -1;
if (debutSurvol >= 0) {
  let profondeur = 0;
  for (let i = css.indexOf('{', debutSurvol); i < css.length; i++) {
    if (css[i] === '{') profondeur++;
    if (css[i] === '}' && --profondeur === 0) { finSurvol = i; break; }
  }
}
for (const m of css.matchAll(/:hover/g)) {
  if (m.index < debutSurvol || m.index > finSurvol) erreur(`index.html : règle :hover hors de @media (hover: hover) and (pointer: fine) (resterait collée après un tap) : ${css.slice(Math.max(0, css.lastIndexOf('\n', m.index) + 1), m.index + 20).trim()}`);
}
for (const [, selecteur, corps] of css.matchAll(/([^{}]*\b(?:textarea|input|select)\b[^{}]*)\{([^}]*)\}/g)) {
  const taille = corps.match(/font-size:\s*([\d.]+)(px|rem)/);
  if (taille && (taille[2] === 'px' ? Number(taille[1]) : Number(taille[1]) * 16) < 16) erreur(`index.html : ${selecteur.trim()} en ${taille[1]}${taille[2]} (< 16 px : Safari iOS zoome à la saisie)`);
}

// --- Presse-papiers : toute écriture doit être confirmée à l'écran (afficherToast) juste après ---
const lignesHtml = html.split('\n');
lignesHtml.forEach((ligne, i) => {
  if (!/clipboard\.write|execCommand\(\s*['"](copy|cut)/.test(ligne)) return;
  const suite = lignesHtml.slice(i, i + 40).join('\n');
  if (!/afficherToast\(/.test(suite)) erreur(`index.html:${i + 1} : écriture dans le presse-papiers sans confirmation visible (afficherToast) dans les 40 lignes suivantes`);
});
if (!/<div class="toast" id="toast" role="status" aria-live="polite"/.test(html)) erreur('index.html : la région live #toast doit exister dès le chargement');

// --- Appels externes : seul GoatCounter est autorisé, script tiers verrouillé par SRI ---
// Google : réception des contacts (Apps Script) et agenda de réservation intégré, chargé à l'ouverture seulement.
const ORIGINES_AUTORISEES = ['https://gc.zgo.at', 'https://manica.goatcounter.com', 'https://script.google.com', 'https://script.googleusercontent.com', 'https://calendar.google.com'];
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
if (!/connect-src 'self' https:\/\/manica\.goatcounter\.com https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/.test(csp)) erreur('CSP : connect-src doit autoriser manica.goatcounter.com et Apps Script (script.google.com, script.googleusercontent.com)');
if (!/frame-src https:\/\/calendar\.google\.com;/.test(csp)) erreur('CSP : frame-src doit autoriser calendar.google.com (agenda intégré)');

// --- Promesses : le diagnostic demande un e-mail, aucun texte ne doit promettre le contraire ---
for (const f of ['index.html', 'config.json', 'manifest.webmanifest', 'tools/og-image.html', 'README.md', '404.html']) {
  const texte = lire(f);
  for (const promesse of [/sans inscription/i, /pas de (?:mail|e-mail) demand/i, /aucune réponse ne quitte/i, /zéro donnée/i]) {
    if (promesse.test(texte)) erreur(`${f} : « ${texte.match(promesse)[0]} » n'est plus vrai (le diagnostic détaillé demande nom et e-mail)`);
  }
}

// --- Bilan ---
const aValider = banque.questions.filter(q => q.statut === 'a_valider').length;
console.log(`${banque.questions.length} questions (${aValider} à valider), ${axesIds.length} axes, profils : ${profils.join(', ')}`);
for (const c of cibles) {
  const detail = axesIds.map(a => {
    const pool = banque.questions.filter(q => q.axe === a && L.questionAccessible(q, c));
    return `${a} ${pool.length} (${pool.filter(q => L.questionCiblee(q, c)).length} ciblées)`;
  }).join(', ');
  console.log(`  ${c.role} : ${detail}`);
}
console.log(`Posts LinkedIn vérifiés : ${postsVerifies}, données de contact vérifiées : ${leadsVerifies}`);
console.log(`Bonne réponse = choix le plus long : ${Math.round(partPlusLongue * 100)} %, le plus court : ${Math.round(partPlusCourte * 100)} %`);
avertissements.forEach(a => console.log(`⚠ ${a}`));
if (erreurs.length) {
  erreurs.forEach(e => console.error(`✗ ${e}`));
  process.exit(1);
}
console.log('✓ Validation OK');
