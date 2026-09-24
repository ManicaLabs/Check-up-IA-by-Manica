"""Génère les logos web et les icônes à partir des logos sources de img/.

Usage : python3 tools/build-assets.py   (nécessite Pillow)
Sources : img/logo_manica_hd.png (sans baseline), img/logo_manica_hd_baseline.png (avec).
L'image Open Graph se génère à part (voir docs/CDC.md, section « Assets »).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

RACINE = Path(__file__).resolve().parent.parent
NAVY = (16, 27, 51, 255)


def charger(nom):
    im = Image.open(RACINE / 'img' / nom).convert('RGBA')
    return im.crop(im.getbbox())


def redimensionner(im, largeur=None, hauteur=None):
    if largeur is None:
        largeur = round(im.width * hauteur / im.height)
    if hauteur is None:
        hauteur = round(im.height * largeur / im.width)
    # Alpha prémultiplié : pas de liseré parasite sur les bords.
    return im.convert('RGBa').resize((largeur, hauteur), Image.LANCZOS).convert('RGBA')


def symbole(logo):
    """Isole le symbole rond : tout ce qui précède le premier espace vide large."""
    alpha = logo.getchannel('A')
    vides = 0
    for x in range(logo.width):
        if alpha.crop((x, 0, x + 1, logo.height)).getbbox() is None:
            vides += 1
            if vides >= 40:
                partie = logo.crop((0, 0, x - vides + 1, logo.height))
                return partie.crop(partie.getbbox())
        else:
            vides = 0
    raise ValueError('symbole introuvable')


def inverser(im):
    r, g, b, a = im.split()
    rgb = ImageOps.invert(Image.merge('RGB', (r, g, b)))
    return Image.merge('RGBA', (*rgb.split(), a))


def carre(taille, rayon):
    fond = Image.new('RGBA', (taille, taille), (0, 0, 0, 0))
    ImageDraw.Draw(fond).rounded_rectangle((0, 0, taille - 1, taille - 1), radius=rayon, fill=NAVY)
    return fond


def icone(sym_clair, taille, ratio, rayon):
    fond = carre(taille, rayon)
    cote = round(taille * ratio)
    s = redimensionner(sym_clair, hauteur=cote) if sym_clair.height >= sym_clair.width else redimensionner(sym_clair, largeur=cote)
    fond.alpha_composite(s, ((taille - s.width) // 2, (taille - s.height) // 2))
    return fond


def enregistrer(im, nom):
    chemin = RACINE / nom
    # Palette de 64 couleurs avec transparence : 3 à 4 fois plus léger, sans différence visible.
    im.quantize(colors=64, method=Image.FASTOCTREE).save(chemin, optimize=True)
    print(f'{nom:34} {im.width}×{im.height}  {chemin.stat().st_size // 1024} Ko')


logo = charger('logo_manica_hd.png')
logo_baseline = charger('logo_manica_hd_baseline.png')

# Logos pour la page (inversés en CSS en mode sombre)
enregistrer(redimensionner(logo_baseline, largeur=900), 'img/logo-manica-baseline-900.png')
enregistrer(redimensionner(logo_baseline, largeur=600), 'img/logo-manica-baseline-600.png')
enregistrer(redimensionner(logo, largeur=300), 'img/logo-manica-300.png')
# Version claire pour l'image de partage (dessinée sur canvas, sans filtre CSS)
enregistrer(inverser(redimensionner(logo_baseline, largeur=900)), 'img/logo-manica-baseline-clair-900.png')

# Icônes : symbole en clair sur fond bleu nuit
sym = inverser(symbole(logo))
enregistrer(icone(sym, 32, .84, 7), 'favicon-32.png')
enregistrer(icone(sym, 192, .74, 42), 'icon-192.png')
enregistrer(icone(sym, 512, .74, 112), 'icon-512.png')
enregistrer(icone(sym, 512, .62, 0), 'icon-maskable-512.png')
enregistrer(icone(sym, 180, .72, 0), 'apple-touch-icon.png')
