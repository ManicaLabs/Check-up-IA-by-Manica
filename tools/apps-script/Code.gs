/**
 * Check-up IA by Manica — réception des contacts (leads) dans une Google Sheet.
 *
 * Installation : voir docs/LEADS.md (5 minutes, une seule fois).
 * Le test (index.html) envoie un POST JSON (Content-Type text/plain) à l'URL de cette application web,
 * renseignée dans config.json → leads.url.
 *
 * À chaque contact :
 *   1. une ligne est ajoutée dans l'onglet ONGLET de la feuille (créé au besoin) ;
 *   2. une notification mise en forme est envoyée à NOTIFIER : coordonnées, score, axes, priorités et
 *      corrigé complet, avec le diagnostic en PDF joint (pour le suivi) ;
 *   3. si ENVOYER_RECAP et que le test l'annonce (recap = true), le visiteur reçoit son diagnostic complet
 *      par e-mail, avec le même PDF.
 * Un même id n'est jamais enregistré deux fois (le test peut renvoyer un contact après une coupure réseau).
 */

const NOTIFIER = 'hello@manica.fr';        // destinataire des notifications ('' pour aucune)
const ENVOYER_RECAP = true;                // e-mail récapitulatif au visiteur
const JOINDRE_PDF = true;                  // diagnostic en PDF joint aux deux e-mails
const EXPEDITEUR_NOM = 'Cédric Delalande — Manica';
const REPONDRE_A = 'hello@manica.fr';
const ONGLET = 'Leads';

const COLONNES = [
  'Date', 'Nom', 'E-mail', 'Profil', 'Métier précisé', 'Score', 'Niveau', 'Bonnes réponses',
  'Axes', 'Priorités', 'Réponses', 'Accepte lives et contenus', 'Source', 'Page', 'Id'
];

// Couleurs de la charte (index.html).
const C = { navy: '#101B33', slate: '#2C3E5C', amber: '#E8874A', paper: '#F7F5F1', muted: '#4A566D', line: '#D9D4CA',
  ok: '#1D6940', okBg: '#E3F0E7', ko: '#9E3D2B', koBg: '#F6E4DF', mid: '#2C3E5C', midBg: '#E6EAF1' };

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const email = String(d.email || '').trim().slice(0, 120);
    const nom = String(d.nom || '').trim().slice(0, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || nom.length < 2) return repondre({ ok: false, erreur: 'champs' });

    const verrou = LockService.getScriptLock();
    verrou.waitLock(10000);
    let nouveau = false;
    try {
      const feuille = onglet_();
      const id = String(d.id || '').slice(0, 60);
      if (!id || !dejaRecu_(feuille, id)) {
        feuille.appendRow([
          new Date(),
          nom,
          email,
          texte_(d.profil),
          texte_(d.precision),
          Number(d.score) || 0,
          texte_(d.niveau),
          `${Number(d.bonnes) || 0} / ${Number(d.total) || 0}`,
          axes_(d).map(a => `${a.libelle} : ${a.pct} %`).join('\n'),
          priorites_(d).map((p, i) => `${i + 1}. ${p.titre}`).join('\n'),
          reponses_(d).map((r, i) => `${i + 1}. ${r.juste ? '✓' : '✗'} [${r.axe}] ${r.question}\n   → ${r.reponse}${r.juste ? '' : `\n   ✓ ${r.bonne}`}`).join('\n').slice(0, 45000),
          d.optin ? 'oui' : 'non',
          source_(d),
          texte_(d.page),
          id
        ].map(protegerFormule_));
        nouveau = true;
      }
    } finally {
      verrou.releaseLock();
    }

    if (nouveau) {
      const pdf = JOINDRE_PDF ? pdf_(d, nom) : null;
      if (NOTIFIER) essayer_(() => notifier_(d, nom, email, pdf));
      if (ENVOYER_RECAP && d.recap) essayer_(() => envoyerRecap_(d, nom, email, pdf));
    }
    return repondre({ ok: true });
  } catch (err) {
    console.error(err);
    return repondre({ ok: false, erreur: 'serveur' });
  }
}

// Ouvrir l'URL dans un navigateur affiche ce message : utile pour vérifier le déploiement.
function doGet() {
  return repondre({ ok: true, service: 'Check-up IA by Manica — réception des contacts' });
}

function repondre(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

function onglet_() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(ONGLET);
  if (!feuille) {
    feuille = classeur.insertSheet(ONGLET);
    feuille.appendRow(COLONNES);
    feuille.setFrozenRows(1);
    feuille.getRange(1, 1, 1, COLONNES.length).setFontWeight('bold');
  }
  return feuille;
}

function dejaRecu_(feuille, id) {
  const derniere = feuille.getLastRow();
  if (derniere < 2) return false;
  const debut = Math.max(2, derniere - 199);
  const ids = feuille.getRange(debut, COLONNES.length, derniere - debut + 1, 1).getValues();
  return ids.some(([v]) => v === id);
}

// --- Lecture prudente des données reçues ---

function texte_(v, max) {
  return String(v === undefined || v === null ? '' : v).slice(0, max || 500);
}

function axes_(d) {
  return (Array.isArray(d.axes) ? d.axes : []).slice(0, 10)
    .map(a => ({ libelle: texte_(a.libelle, 80), pct: Number(a.pct) || 0 }));
}

function priorites_(d) {
  return (Array.isArray(d.priorites) ? d.priorites : []).slice(0, 5)
    .map(p => ({ titre: texte_(p.titre, 150), texte: texte_(p.texte, 1000) }));
}

function reponses_(d) {
  return (Array.isArray(d.reponses) ? d.reponses : []).slice(0, 30).map(r => ({
    id: texte_(r.id, 30),
    juste: Boolean(r.juste),
    axe: texte_(r.axe, 80),
    question: texte_(r.question, 400) || texte_(r.id, 30),
    reponse: texte_(r.reponse, 300),
    bonne: texte_(r.bonne, 300),
    explication: texte_(r.explication, 1000)
  }));
}

function source_(d) {
  return Object.entries(d.source || {}).slice(0, 10).map(([k, v]) => `${texte_(k, 30)}=${texte_(v, 200)}`).join(' ; ');
}

// Une valeur saisie qui commence par = + - @ serait interprétée comme une formule : on la neutralise.
function protegerFormule_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v;
}

function html_(v) {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function essayer_(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// --- Contenu du diagnostic (HTML commun aux e-mails et au PDF) ---

function ton_(pct) {
  if (pct >= 60) return { fg: C.ok, bg: C.okBg, libelle: 'Acquis' };
  if (pct >= 30) return { fg: C.mid, bg: C.midBg, libelle: 'En cours' };
  return { fg: C.ko, bg: C.koBg, libelle: 'À renforcer' };
}

function blocDiagnostic_(d) {
  const score = Number(d.score) || 0;
  const reponses = reponses_(d);
  const ratees = reponses.filter(r => !r.juste).length;
  const h2 = t => `<h2 style="font-size:18px;color:${C.navy};margin:28px 0 10px;border-bottom:2px solid ${C.amber};padding-bottom:4px">${t}</h2>`;

  const axes = axes_(d).map(a => {
    const t = ton_(a.pct);
    return `<tr>
      <td style="padding:6px 8px 6px 0;color:${C.navy}">${html_(a.libelle)}</td>
      <td style="padding:6px 8px;width:45%"><div style="background:${C.line};border-radius:4px;height:8px"><div style="background:${t.fg};width:${Math.max(2, Math.min(100, a.pct))}%;height:8px;border-radius:4px"></div></div></td>
      <td style="padding:6px 0 6px 8px;white-space:nowrap;text-align:right"><strong>${a.pct} %</strong> <span style="background:${t.bg};color:${t.fg};font-size:12px;padding:2px 6px;border-radius:10px">${t.libelle}</span></td>
    </tr>`;
  }).join('');

  const priorites = priorites_(d).map((p, i) => `
    <div style="margin:0 0 12px;padding:10px 12px;background:${C.paper};border-left:3px solid ${C.amber}">
      <div style="font-weight:bold;color:${C.navy}">${i + 1}. ${html_(p.titre)}</div>
      <div style="margin-top:4px;color:${C.slate}">${html_(p.texte)}</div>
    </div>`).join('');

  const corrige = reponses.map((r, i) => `
    <div style="margin:0 0 14px;padding:10px 12px;border:1px solid ${C.line};border-left:4px solid ${r.juste ? C.ok : C.ko};border-radius:4px">
      <div style="font-size:12px;color:${C.muted}">Question ${i + 1} · ${html_(r.axe)} · <strong style="color:${r.juste ? C.ok : C.ko}">${r.juste ? '✓ Juste' : '✗ À revoir'}</strong></div>
      <div style="font-weight:bold;color:${C.navy};margin:4px 0 6px">${html_(r.question)}</div>
      <div>Réponse donnée : <span style="color:${r.juste ? C.ok : C.ko}">${html_(r.reponse)}</span></div>
      ${r.juste ? '' : `<div>Bonne réponse : <span style="color:${C.ok}">${html_(r.bonne)}</span></div>`}
      ${r.explication ? `<div style="margin-top:6px;color:${C.slate};font-size:14px">${html_(r.explication)}</div>` : ''}
    </div>`).join('');

  return `
    <div style="text-align:center;padding:18px;background:${C.paper};border-radius:8px">
      <div style="font-size:40px;font-weight:bold;color:${C.navy};line-height:1">${score}<span style="font-size:18px;color:${C.muted}"> /100</span></div>
      <div style="margin-top:6px;color:${C.slate}">Niveau <strong>${html_(texte_(d.niveau, 40))}</strong> · ${Number(d.bonnes) || 0} bonne(s) réponse(s) sur ${Number(d.total) || 0}</div>
    </div>
    ${h2('Détail par axe')}
    <table style="width:100%;border-collapse:collapse;font-size:15px">${axes}</table>
    ${h2('Vos 3 priorités')}
    ${priorites}
    ${h2(`Le corrigé, question par question${ratees ? ` (${ratees} à revoir)` : ''}`)}
    ${corrige}`;
}

function page_(titre, contenu) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${html_(titre)}</title></head>
  <body style="margin:0;padding:0;background:#ffffff">
    <div style="max-width:640px;margin:0 auto;padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:${C.navy}">
      ${contenu}
      <p style="margin-top:28px;font-size:12px;color:${C.muted}">Check-up IA by Manica · <a href="https://manica.fr" style="color:${C.muted}">manica.fr</a></p>
    </div>
  </body></html>`;
}

function pdf_(d, nom) {
  try {
    const date = Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yyyy');
    const contenu = `
      <h1 style="font-size:22px;color:${C.navy};margin:0 0 4px">Check-up IA — diagnostic</h1>
      <p style="margin:0 0 18px;color:${C.muted}">${html_(nom)} · ${html_(texte_(d.profil, 120))} · ${date}</p>
      ${blocDiagnostic_(d)}`;
    return Utilities.newBlob(page_('Check-up IA', contenu), 'text/html', 'diagnostic.html')
      .getAs('application/pdf')
      .setName(`Check-up IA - ${nom.replace(/[\\/:*?"<>|]/g, '')}.pdf`);
  } catch (err) {
    console.error(err);
    return null;   // l'e-mail part quand même, sans pièce jointe
  }
}

// --- E-mails ---

function notifier_(d, nom, email, pdf) {
  const score = Number(d.score) || 0;
  const src = source_(d) || 'directe';
  const fiche = [
    ['Contact', `<a href="mailto:${html_(email)}">${html_(nom)} &lt;${html_(email)}&gt;</a>`],
    ['Profil', html_(texte_(d.profil, 120))],
    ['Lives et contenus', d.optin ? '<strong>oui</strong>' : 'non'],
    ['Source', html_(src)],
    ['Feuille', `<a href="${SpreadsheetApp.getActiveSpreadsheet().getUrl()}">ouvrir la feuille des leads</a>`]
  ].map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:${C.muted};white-space:nowrap">${k}</td><td style="padding:3px 0">${v}</td></tr>`).join('');

  const contenu = `
    <h1 style="font-size:20px;color:${C.navy};margin:0 0 12px">Nouveau Check-up IA : ${html_(nom)}</h1>
    <table style="border-collapse:collapse;font-size:15px;margin-bottom:18px">${fiche}</table>
    ${blocDiagnostic_(d)}`;

  const texte = [
    `${nom} <${email}>`,
    `Profil : ${texte_(d.profil)}`,
    `Score : ${score}/100 (niveau ${texte_(d.niveau)})`,
    '',
    ...reponses_(d).map((r, i) => `${i + 1}. ${r.juste ? 'juste' : 'faux'} — ${r.question}\n   Réponse : ${r.reponse}${r.juste ? '' : `\n   Bonne réponse : ${r.bonne}`}`),
    '',
    `Lives et contenus : ${d.optin ? 'oui' : 'non'}`,
    `Source : ${src}`
  ].join('\n');

  MailApp.sendEmail({
    to: NOTIFIER,
    replyTo: email,
    subject: `Check-up IA : ${nom} — ${score}/100 (${texte_(d.profil)})`,
    body: texte,
    htmlBody: page_('Nouveau Check-up IA', contenu),
    attachments: pdf ? [pdf] : []
  });
}

function envoyerRecap_(d, nom, email, pdf) {
  const prenom = nom.split(/\s+/)[0];
  const score = Number(d.score) || 0;
  const lien = texte_(d.lien_rdv);
  const bouton = /^https:\/\//.test(lien)
    ? `<p style="text-align:center;margin:24px 0"><a href="${html_(lien)}" style="display:inline-block;background:${C.amber};color:${C.navy};font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:24px">Réserver mon échange offert (30 min)</a></p>`
    : '';

  const contenu = `
    <p>Bonjour ${html_(prenom)},</p>
    <p>Merci d'avoir fait le Check-up IA by Manica. Voici votre diagnostic complet${pdf ? ', également en PDF joint pour le garder ou le transmettre' : ''}.</p>
    ${blocDiagnostic_(d)}
    ${h2Simple_('On en parle 30 minutes ?')}
    <p>L'échange est offert et sans engagement, et part de vos résultats : j'aurai votre diagnostic sous les yeux.</p>
    ${bouton}
    <p>Vous pouvez aussi simplement répondre à cet e-mail.</p>
    <p>Cédric Delalande<br><span style="color:${C.muted}">Manica — IA utile et accompagnée</span></p>`;

  const texte = [
    `Bonjour ${prenom},`,
    '',
    'Merci d\'avoir fait le Check-up IA by Manica. Voici votre diagnostic.',
    '',
    `Votre score : ${score}/100 (niveau ${texte_(d.niveau)})`,
    '',
    'Par axe :',
    ...axes_(d).map(a => `- ${a.libelle} : ${a.pct} %`),
    '',
    'Vos 3 priorités :',
    ...priorites_(d).map((p, i) => `${i + 1}. ${p.titre}\n${p.texte}`),
    '',
    'Le corrigé :',
    ...reponses_(d).map((r, i) => `${i + 1}. ${r.question}\n   Votre réponse : ${r.reponse}${r.juste ? ' (juste)' : `\n   Bonne réponse : ${r.bonne}`}\n   ${r.explication}`),
    '',
    'On en parle 30 minutes ? L\'échange est offert et sans engagement, et part de vos résultats :',
    lien,
    '',
    'Vous pouvez aussi simplement répondre à cet e-mail.',
    '',
    'Cédric Delalande',
    'Manica — IA utile et accompagnée'
  ].join('\n');

  MailApp.sendEmail({
    to: email,
    replyTo: REPONDRE_A,
    name: EXPEDITEUR_NOM,
    subject: `Votre Check-up IA : ${score}/100`,
    body: texte,
    htmlBody: page_('Votre Check-up IA', contenu),
    attachments: pdf ? [pdf] : []
  });
}

function h2Simple_(t) {
  return `<h2 style="font-size:18px;color:${C.navy};margin:28px 0 10px;border-bottom:2px solid ${C.amber};padding-bottom:4px">${html_(t)}</h2>`;
}

// À lancer une fois depuis l'éditeur (bouton Exécuter) pour accorder les autorisations et créer l'onglet.
function installer() {
  onglet_();
  console.log('Onglet prêt : ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

// À lancer depuis l'éditeur pour recevoir un exemple des deux e-mails (sur NOTIFIER), sans toucher à la feuille.
function testerEmails() {
  const d = {
    nom: 'Test Manica', email: NOTIFIER, profil: 'Dirigeant·e', score: 60, niveau: 'Pratiquant', bonnes: 6, total: 10, optin: true,
    axes: [{ libelle: 'Fondamentaux', pct: 100 }, { libelle: 'Usages concrets', pct: 50 }, { libelle: 'Limites & fiabilité', pct: 0 }],
    priorites: [{ titre: 'Encadrer la fiabilité', texte: 'Définissez, par type d’usage, le niveau de contrôle attendu.' }],
    reponses: [
      { id: 'x-01', juste: true, axe: 'Fondamentaux', question: 'Question juste ?', reponse: 'La bonne', explication: 'Explication.' },
      { id: 'x-02', juste: false, axe: 'Limites & fiabilité', question: 'Question ratée ?', reponse: 'Mauvaise', bonne: 'La bonne', explication: 'Explication.' }
    ],
    source: { utm_source: 'test' }, lien_rdv: 'https://manica.fr', recap: true
  };
  const pdf = JOINDRE_PDF ? pdf_(d, d.nom) : null;
  notifier_(d, d.nom, NOTIFIER, pdf);
  envoyerRecap_(d, d.nom, NOTIFIER, pdf);
}
