"""Paints the Feng Shui layout's wallpaper: layered ink mountains in mist at
dusk, with a pale sun. Deterministic (fixed seed), so it can be rebuilt.
Usage: python3 scripts/make-wallpaper.py src/renderer/fengshui/wallpaper.jpg
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

W, H = 2880, 1800
rng = np.random.default_rng(8)
y = np.linspace(0, 1, H)[:, None]
x = np.linspace(0, 1, W)[None, :]

def lerp(a, b, t):
    return a + (b - a) * t

def grad(stops, t):
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / (p1 - p0))[..., None]
        out = np.where(m[..., None], lerp(np.array(c0, float), np.array(c1, float), k), out)
    return out

# Sky: deep ink at the top, through slate teal, to a warm haze at the horizon.
sky = grad([(0, (22, 30, 42)), (0.38, (46, 70, 82)), (0.58, (120, 134, 136)), (0.70, (206, 176, 142)), (1, (232, 214, 190))], np.broadcast_to(y, (H, W)))

# A pale sun with a wide, soft glow.
sx, sy = 0.66, 0.56
d = np.sqrt(((x - sx) * W / H) ** 2 + (y - sy) ** 2)
glow = np.exp(-(d / 0.22) ** 2)[..., None]
sky = lerp(sky, np.array([246, 226, 196.]), 0.55 * glow)
disc = np.clip((0.038 - d) / 0.004, 0, 1)[..., None]
sky = lerp(sky, np.array([250, 240, 222.]), 0.9 * disc)
img = sky

def ridge(base, amp, seed, rough):
    r = np.random.default_rng(seed)
    xs = np.linspace(0, 1, W)
    h = np.zeros(W)
    for i in range(1, 7):
        f = 0.9 * 1.9 ** (i - 1)
        h += (amp / i ** rough) * np.sin(2 * np.pi * (f * xs + r.random())) * (0.6 + 0.4 * r.random())
    return base - h

# Mountain layers, far to near: each lighter mist above, darker ink below.
layers = [
    (0.66, 0.060, 11, 2.2, (120, 128, 130), 0.45),
    (0.72, 0.070, 23, 2.1, (84, 98, 106), 0.6),
    (0.79, 0.075, 37, 2.0, (54, 68, 78), 0.75),
    (0.87, 0.070, 41, 1.9, (32, 42, 52), 0.9),
    (0.96, 0.050, 53, 1.8, (18, 24, 32), 1.0),
]
for base, amp, seed, rough, col, alpha in layers:
    top = ridge(base, amp, seed, rough)[None, :]
    mask = np.clip((y - top) * H / 2.0, 0, 1)
    # Each range fades into mist toward its foot.
    fade = np.clip(1 - (y - top) * 2.2, 0.45, 1)
    col = np.array(col, float)
    shade = lerp(col, np.array([200, 196, 186.]), (1 - fade[..., None]) * 0.35)
    img = lerp(img, shade, (mask * alpha)[..., None])
    # A band of mist hangs just under the ridge line.
    mist = np.exp(-((y - top - 0.035) / 0.03) ** 2) * 0.22
    img = lerp(img, np.array([226, 220, 208.]), mist[..., None])

im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
# Fine paper grain keeps the gradients from banding.
grain = rng.normal(0, 2.2, (H, W, 1))
arr = np.clip(np.asarray(im, float) + grain, 0, 255).astype(np.uint8)
Image.fromarray(arr).save(sys.argv[1], quality=90, optimize=True, progressive=True)
