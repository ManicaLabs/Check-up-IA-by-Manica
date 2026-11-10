// SEO et GEO du Check-up IA : node tools/seo.mjs (écrit les fichiers) ou node tools/seo.mjs --verifier.
// Depuis config.json et questions.json, génère ce que lisent les moteurs et les assistants IA sans exécuter
// de JavaScript (GPTBot, ClaudeBot, PerplexityBot ne l'exécutent pas) :
//   - index.html : bloc « Qui est derrière le test ? » + FAQ en HTML statique, et graphe JSON-LD dans le <head> ;
//   - llms.txt : présentation du test pour les assistants IA (format llmstxt.org) ;
//   - sitemap.xml : les pages indexables, avec la date de dernière modification de leurs sources.
// validate.mjs appelle generer() et échoue si index.html ou llms.txt ne correspondent plus à config.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Entité Manica : mêmes identifiants et même désambiguïsation que le graphe JSON-LD de manica.fr
// (src/lib/jsonld.ts du dépôt du site). La Search Console montre que « manica » renvoie surtout à des homonymes.
export const MANICA = {
  org: 'https://manica.fr/#organisation',
  personne: 'https://manica.fr/a-propos/cedric-delalande/#personne',
  url: 'https://manica.fr/',
  pageFondateur: 'https://manica.fr/a-propos/cedric-delalande/',
  pageProjet: 'https://manica.fr/projets/check-up-ia/',
  bilan: 'https://manica.fr/offres/bilan-ia/',
  logo: 'https://manica.fr/icons/icon-512.png',
  description: 'accompagnement IA et développement pour PME et ETI, à Grenoble',
  desambiguisation: "Entreprise française d'accompagnement en intelligence artificielle et de développement logiciel pour les PME et ETI, basée à Grenoble (Isère). Sans lien avec les sociétés homonymes d'architecture ou de logistique.",
  sameAs: ['https://www.linkedin.com/company/manica-tech/', 'https://annuaire-entreprises.data.gouv.fr/entreprise/999397490'],
  depot: 'https://github.com/ManicaLabs/Check-up-IA-by-Manica',
};

const MARQUES = {
  apropos: ['<!-- seo:apropos', '<!-- /seo:apropos -->'],
  jsonld: ['<!-- seo:jsonld', '<!-- /seo:jsonld -->'],
};

const echapper = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PLUS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

// La typographie affichée (apostrophe courbe, espaces fines insécables) vient de la vraie fonction typo() d'index.html.
function chargerTypo(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const logique = scripts.match(/\/\/ === LOGIQUE PURE[^\n]*\n([\s\S]*?)\/\/ === FIN LOGIQUE PURE ===/);
  if (!logique) throw new Error('Marqueurs LOGIQUE PURE introuvables dans index.html');
  return new Function(`${logique[1]}; return typo;`)();
}

function remplacerEntre(html, [debut, fin], contenu) {
  const i = html.indexOf(debut);
  const j = html.indexOf(fin);
  if (i < 0 || j < i) throw new Error(`Marqueurs ${debut} … ${fin} introuvables dans index.html`);
  return html.slice(0, i) + contenu + html.slice(j + fin.length);
}

function blocAPropos(config, typo) {
  const a = config.a_propos;
  const qui = config.cta.interlocuteur;
  const faq = config.faq.map(f => `      <details><summary><span>${echapper(typo(f.q))}</span>${PLUS}</summary><p>${echapper(typo(f.r))}</p></details>`);
  return [
    '<!-- seo:apropos : généré par tools/seo.mjs depuis config.json (a_propos, cta.interlocuteur, faq). Ne pas modifier à la main : éditer config.json, puis lancer node tools/seo.mjs. -->',
    '<section class="wrap apropos" id="apropos" aria-labelledby="apropos-titre">',
    `  <h2 class="block-title" id="apropos-titre">${echapper(typo(a.titre))}</h2>`,
    '  <div class="apropos-carte">',
    `    <img src="${echapper(qui.photo)}" width="256" height="256" alt="" loading="lazy">`,
    `    <p><span class="apropos-nom" id="apropos-nom">${echapper(qui.nom)}</span><br><span class="apropos-role" id="apropos-role">${echapper(typo(qui.role))}</span></p>`,
    '  </div>',
    `  <p class="apropos-texte" id="apropos-texte">${echapper(typo(a.texte))}</p>`,
    ...(a.preuve ? [`  <p class="apropos-preuve" id="apropos-preuve">${echapper(typo(a.preuve))}</p>`] : []),
    '  <div class="apropos-liens">',
    '    <a class="text-btn" href="https://manica.fr/" data-lien-site>Découvrir Manica sur manica.fr</a>',
    ...(a.linkedin ? [`    <a class="text-btn" id="apropos-linkedin" href="${echapper(a.linkedin)}" target="_blank" rel="noopener">Suivre ${echapper(qui.nom.split(' ')[0])} sur LinkedIn</a>`] : []),
    '  </div>',
    '  <div class="faq">',
    '    <h2 class="block-title" id="faq-titre">Questions fréquentes</h2>',
    '    <div class="faq-list" id="faq">',
    ...faq,
    '    </div>',
    '  </div>',
    '</section>',
    MARQUES.apropos[1],
  ].join('\n');
}

const metaDe = (html, re) => (html.match(re) || [])[1];

function blocJsonLd(config, typo, html, chiffres) {
  const url = config.url_app;
  const qui = config.cta.interlocuteur;
  const titre = metaDe(html, /<title>([^<]*)<\/title>/);
  const description = metaDe(html, /<meta name="description" content="([^"]*)">/);
  const graphe = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': MANICA.org, name: 'Manica', legalName: 'MANICA LABS', alternateName: ['Manica Labs'],
        description: `Manica : ${MANICA.description}.`, disambiguatingDescription: MANICA.desambiguisation,
        url: MANICA.url, logo: MANICA.logo, email: config.contact.email, founder: { '@id': MANICA.personne }, sameAs: MANICA.sameAs,
      },
      {
        '@type': 'Person', '@id': MANICA.personne, name: qui.nom, jobTitle: 'Fondateur', url: MANICA.pageFondateur,
        worksFor: { '@id': MANICA.org }, ...(config.a_propos.linkedin ? { sameAs: [config.a_propos.linkedin] } : {}),
      },
      {
        '@type': 'WebSite', '@id': `${url}#site`, name: 'Check-up IA', alternateName: 'Check-up IA by Manica', url,
        inLanguage: 'fr-FR', publisher: { '@id': MANICA.org },
      },
      {
        '@type': 'WebApplication', '@id': `${url}#application`, name: 'Check-up IA', alternateName: 'Check-up IA by Manica', url,
        description: `Test gratuit pour évaluer votre maîtrise de l'IA générative, à titre personnel ou pour votre entreprise : ${chiffres.total} questions adaptées à votre métier sur ${chiffres.axes.length} axes, un score sur 100 tout de suite, puis un diagnostic détaillé par e-mail.`,
        applicationCategory: 'EducationalApplication', applicationSubCategory: 'Test de maturité en intelligence artificielle',
        operatingSystem: 'Web', browserRequirements: 'Navigateur récent avec JavaScript', inLanguage: 'fr',
        isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: [
          `${chiffres.total} questions adaptées à votre métier (${chiffres.roles.join(', ')})`,
          `${chiffres.axes.length} axes : ${chiffres.axes.join(', ')}`,
          `Score sur 100 et niveau (${chiffres.niveaux.map(n => n.nom).join(', ')}), tout de suite`,
          'Diagnostic détaillé par e-mail : profil par axe, 3 priorités et corrigé commenté',
          'Échange offert de 30 minutes pour en parler',
        ],
        image: `${url}og-image.png`, author: { '@id': MANICA.personne }, publisher: { '@id': MANICA.org },
        subjectOf: { '@type': 'WebPage', url: MANICA.pageProjet },
      },
      {
        '@type': 'WebPage', '@id': `${url}#page`, url, name: titre, description, inLanguage: 'fr-FR',
        isPartOf: { '@id': `${url}#site` }, mainEntity: { '@id': `${url}#application` },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${url}og-image.png`, width: 1200, height: 630 },
      },
      {
        '@type': 'FAQPage', '@id': `${url}#faq`, isPartOf: { '@id': `${url}#page` },
        mainEntity: config.faq.map(f => ({ '@type': 'Question', name: typo(f.q), acceptedAnswer: { '@type': 'Answer', text: typo(f.r) } })),
      },
    ],
  };
  const json = JSON.stringify(graphe).replace(/</g, '\\u003c');
  return `<!-- seo:jsonld : généré par tools/seo.mjs (entité Manica alignée sur manica.fr) -->\n<script type="application/ld+json">${json}</script>\n${MARQUES.jsonld[1]}`;
}

function llmsTxt(config, typo, chiffres) {
  const url = config.url_app;
  const tranche = (n, i) => `${n.nom} (${n.min} à ${i + 1 < chiffres.niveaux.length ? chiffres.niveaux[i + 1].min - 1 : 100})`;
  return [
    '# Check-up IA by Manica',
    '',
    `> Test gratuit en ligne pour évaluer sa maîtrise de l'intelligence artificielle générative, à titre personnel ou pour son entreprise : ${chiffres.total} questions adaptées au métier, un score sur 100 tout de suite, puis un diagnostic détaillé par e-mail. En français. Édité par Manica (MANICA LABS, Grenoble).`,
    '',
    `Adresse : ${url}. Gratuit et sans engagement. Code source public : ${MANICA.depot}.`,
    '',
    '## Comment fonctionne le test',
    `- Profils : ${chiffres.roles.join(', ')}. Le profil choisi oriente une partie des questions.`,
    `- ${chiffres.total} questions tirées d'une banque de ${chiffres.banque} questions relues, réparties sur ${chiffres.axes.length} axes : ${chiffres.axes.join(', ')}.`,
    '- Une réponse d\'un clic par question, sans correction pendant le test : le corrigé complet est donné à la fin.',
    `- Score sur 100 : la part de bonnes réponses, calculée dans le navigateur par des règles simples, sans modèle d'IA. Niveaux : ${chiffres.niveaux.map(tranche).join(', ')}.`,
    '- Diagnostic détaillé, débloqué avec un nom et une adresse e-mail : profil sur les axes, 3 priorités avec un premier pas pour chacune, corrigé question par question avec explications ; envoyé aussi par e-mail.',
    '- Données : rien n\'est transmis tant que la personne ne demande pas son diagnostic ; dans ce cas, son nom, son e-mail, son profil et ses résultats vont à Manica, qui ne les revend pas. Mesure d\'audience anonyme et sans cookie (GoatCounter).',
    '',
    '## Questions fréquentes',
    ...config.faq.map(f => `- ${typo(f.q)} ${typo(f.r)}`),
    '',
    '## Éditeur',
    `- [Manica](${MANICA.url}): ${MANICA.desambiguisation}`,
    `- [Le Check-up IA sur manica.fr](${MANICA.pageProjet}): présentation du projet, de sa méthode et de ses limites.`,
    `- [Bilan IA](${MANICA.bilan}): l'étape suivante proposée par Manica, l'audit des usages réels de l'IA dans une entreprise.`,
    `- [${typo(config.cta.interlocuteur.nom)}](${MANICA.pageFondateur}): ${typo(config.cta.interlocuteur.role)}.`,
    '',
    '## Optional',
    `- [Mentions légales et confidentialité](${url}mentions-legales.html): éditeur, hébergement, données collectées, mesure d'audience.`,
    '',
  ].map(typo).join('\n');
}

// Date (AAAA-MM-JJ) de la dernière modification des sources d'une page : aujourd'hui si l'une d'elles est
// modifiée sans être commitée, sinon la date du dernier commit qui l'a touchée.
function derniereModification(fichiers) {
  const git = (...args) => execFileSync('git', args, { cwd: RACINE, encoding: 'utf8' }).trim();
  try {
    if (git('status', '--porcelain', '--', ...fichiers)) return new Date().toISOString().slice(0, 10);
    return git('log', '-1', '--format=%cs', '--', ...fichiers) || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const PAGES = [
  { chemin: '', sources: ['index.html', 'config.json', 'questions.json'] },
  { chemin: 'mentions-legales.html', sources: ['mentions-legales.html', 'pages.css'] },
];

function sitemapXml(config) {
  const lignes = PAGES.map(p => `  <url><loc>${config.url_app}${p.chemin}</loc><lastmod>${derniereModification(p.sources)}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lignes.join('\n')}\n</urlset>\n`;
}

export function generer(racine = RACINE) {
  const lire = f => readFileSync(join(racine, f), 'utf8');
  const config = JSON.parse(lire('config.json'));
  const banque = JSON.parse(lire('questions.json'));
  const html = lire('index.html');
  const typo = chargerTypo(html);
  const chiffres = {
    total: config.quiz.questions_par_axe * config.axes.length,
    banque: banque.questions.filter(q => config.quiz.statuts_publies.includes(q.statut)).length,
    axes: config.axes.map(a => typo(a.libelle)),
    roles: config.roles.map(r => typo(r.libelle)),
    niveaux: config.niveaux,
  };
  let index = remplacerEntre(html, MARQUES.apropos, blocAPropos(config, typo));
  index = remplacerEntre(index, MARQUES.jsonld, blocJsonLd(config, typo, index, chiffres));
  return { 'index.html': index, 'llms.txt': llmsTxt(config, typo, chiffres), 'sitemap.xml': sitemapXml(config) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fichiers = generer();
  if (process.argv.includes('--verifier')) {
    const ecarts = ['index.html', 'llms.txt'].filter(f => {
      try { return readFileSync(join(RACINE, f), 'utf8') !== fichiers[f]; } catch { return true; }
    });
    if (ecarts.length) {
      console.error(`À régénérer (node tools/seo.mjs) : ${ecarts.join(', ')}`);
      process.exit(1);
    }
    console.log('SEO : index.html et llms.txt à jour');
  } else {
    for (const [f, contenu] of Object.entries(fichiers)) writeFileSync(join(RACINE, f), contenu);
    console.log(`Écrits : ${Object.keys(fichiers).join(', ')}`);
  }
}
