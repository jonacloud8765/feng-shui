"""Builds the Film Closet demo: a 3D shelf of public-domain films for Feng
Shui's Custom Widget. Spines and posters are drawn here (typographic, original
art), so nothing copyrighted is bundled.

    python3 examples/film-closet/build.py

Writes index.html and thumbs/ next to this file. Add it in Feng Shui with
Add Widget > Custom Widget and pick index.html.
"""
import colorsys, html, os, random, re
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = '/System/Library/Fonts'
rng = random.Random(1927)

films = []
for line in open(os.path.join(HERE, 'films.txt'), encoding='utf-8'):
    line = line.strip()
    if line and not line.startswith('#'):
        t, y, g = line.split('|')
        films.append({'t': t, 'y': y, 'g': g})

def slug(s):
    s = s.lower().replace('ä', 'a').replace('é', 'e').replace('â', 'a').replace('ô', 'o').replace("'", '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def font(name, size, index=0):
    for p in (f'{FONTS}/Supplemental/{name}', f'{FONTS}/{name}'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()

# A muted palette per genre, varied per film.
GENRE_HUE = {'Horror': 0.98, 'Comedy': 0.12, 'Drama': 0.6, 'Romance': 0.94, 'Western': 0.08, 'Adventure': 0.07,
             'Fantasy': 0.75, 'Sci-Fi': 0.53, 'Epic': 0.1, 'War': 0.25, 'Crime': 0.66, 'Noir': 0.62, 'Thriller': 0.0,
             'Documentary': 0.33, 'Animation': 0.15, 'Musical': 0.85, 'Surreal': 0.45}
for f in films:
    h = (GENRE_HUE.get(f['g'], rng.random()) + rng.uniform(-0.04, 0.04)) % 1
    l = rng.uniform(0.22, 0.62); s = rng.uniform(0.25, 0.55)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    f['c'] = (int(r * 255), int(g * 255), int(b * 255))
    f['k'] = '#111' if l > 0.55 else '#f2ede2'
    f['slug'] = f"{slug(f['t'])}-{f['y']}"

def wrap(draw, text, fnt, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if draw.textlength(test, font=fnt) <= width or not cur: cur = test
        else: lines.append(cur); cur = w
    lines.append(cur)
    return lines

def poster(f, W, H):
    """An original typographic poster: a field of colour, one geometric motif, the title."""
    bg = f['c']
    ink = (17, 17, 17) if f['k'] == '#111' else (242, 237, 226)
    im = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(im)
    u = W / 200
    motif = rng.randrange(4)
    lighter = tuple(min(255, int(c * 1.25 + 20)) for c in bg)
    darker = tuple(int(c * 0.7) for c in bg)
    if motif == 0:  # a rising sun
        d.ellipse((W * .2, H * .18, W * .8, H * .18 + W * .6), fill=lighter)
        for i in range(9): d.line((0, H * .5 + i * 8 * u, W, H * .5 + i * 8 * u), fill=darker, width=int(3 * u))
    elif motif == 1:  # art deco rays
        cx, cy = W / 2, H * .62
        for i in range(13):
            import math
            a = math.pi * (i / 12)
            d.line((cx, cy, cx + math.cos(a) * W, cy - math.sin(a) * W), fill=lighter, width=int(2 * u))
        d.ellipse((cx - 22 * u, cy - 22 * u, cx + 22 * u, cy + 22 * u), fill=darker)
    elif motif == 2:  # stacked bars
        for i in range(5): d.rectangle((W * .14, H * (.16 + i * .08), W * (.86 - i * .1), H * (.16 + i * .08) + 10 * u), fill=lighter if i % 2 else darker)
    else:  # a framed arch
        d.rounded_rectangle((W * .18, H * .12, W * .82, H * .62), radius=int(60 * u), outline=lighter, width=int(4 * u))
        d.ellipse((W * .4, H * .3, W * .6, H * .3 + W * .2), fill=lighter)
    ft = font('Didot.ttc', int(22 * u))
    fy = font('Futura.ttc', int(10 * u))
    y = H * .68
    for line in wrap(d, f['t'].upper(), ft, W * .84)[:3]:
        d.text((W / 2, y), line, font=ft, fill=ink, anchor='ma'); y += 25 * u
    d.text((W / 2, H - 18 * u), f"{f['y']} · {f['g'].upper()}", font=fy, fill=ink, anchor='mm')
    d.rectangle((6 * u, 6 * u, W - 6 * u, H - 6 * u), outline=ink, width=max(1, int(u)))
    return im

os.makedirs(os.path.join(HERE, 'thumbs'), exist_ok=True)
for f in films:
    poster(f, 180, 270).save(os.path.join(HERE, 'thumbs', f"{f['slug']}.jpg"), quality=82, optimize=True)

FACES = ['Metropolis', 'Nosferatu', 'The General', 'A Trip to the Moon']
for f in films:
    if f['t'] in FACES:
        poster(f, 392, 588).save(os.path.join(HERE, 'thumbs', f"{f['slug']}-big.jpg"), quality=84, optimize=True)

# Lay the shelves: three walls of six rows. Titles are shuffled into each wall
# so a repeat never sits near its twin.
def attrs(f):
    return f'data-t="{html.escape(f["t"])}" data-y="{f["y"]}" data-g="{f["g"]}" data-p="thumbs/{f["slug"]}.jpg"'

n = 0
def spine(f):
    global n
    n += 1
    w = rng.randint(26, 34); h = rng.randint(262, 300)
    c = '#%02x%02x%02x' % f['c']
    return (f'<div class="sp film" {attrs(f)} style="width:{w}px;height:{h}px;--c:{c};--k:{f["k"]}">'
            f'<i>{n}</i><b>{html.escape(f["t"])}</b></div>'), w + 1

pool = []
def take():
    global pool
    if not pool:
        pool = films[:]; rng.shuffle(pool)
    return pool.pop()

def wall(kind, width):
    out = [f'<div class="wall {kind}">']
    for r in range(6):
        out.append('<div class="row">')
        room = width - 40
        if kind == 'back' and r == 2:
            faces = [f for f in films if f['t'] in FACES]
            half = (room - len(faces) * 220) // 2
            used = 0
            while used < half - 34:
                s, w = spine(take()); out.append(s); used += w
            for f in faces:
                out.append(f'<div class="face film" {attrs(f)} style="width:196px;height:294px"><img src="thumbs/{f["slug"]}-big.jpg" alt=""></div>')
            used = 0
            while used < half - 34:
                s, w = spine(take()); out.append(s); used += w
        else:
            used = 0
            while used < room - 34:
                s, w = spine(take()); out.append(s); used += w
        out.append('</div>')
    out.append('</div>')
    return ''.join(out)

walls = wall('left', 900) + wall('back', 1900) + wall('right', 900)
page = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read().replace('{{WALLS}}', walls)
open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(page)
print(f'{len(films)} films, {n} spines')
