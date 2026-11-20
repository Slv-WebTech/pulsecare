"""Regenerates the raster brand assets (favicon.ico, PNGs) from the PulseCare mark geometry.

The SVGs in this folder are hand-written; this script draws the same mark with Pillow so the PNG/ICO
files match. Dev-only helper:  pip install pillow && python assets/build-brand-assets.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
TEAL_LIGHT = (20, 184, 166)
TEAL_DARK = (10, 79, 70)
PULSE = (11, 93, 82)
INK = (6, 40, 36)
MINT = (167, 243, 208)
SS = 4  # supersampling factor for anti-aliasing


def bezier(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


# Heart outline in the 64x64 mark space (same path as logo-mark.svg)
HEART = (
    bezier((32, 51), (14, 39), (10, 30), (10, 24))
    + bezier((10, 24), (10, 18), (14.5, 14), (20, 14))
    + bezier((20, 14), (25, 14), (29.5, 16.5), (32, 21))
    + bezier((32, 21), (34.5, 16.5), (39, 14), (44, 14))
    + bezier((44, 14), (49.5, 14), (54, 18), (54, 24))
    + bezier((54, 24), (54, 30), (50, 39), (32, 51))
)
BEAT = [(13, 31), (23, 31), (27, 23), (33, 40), (38, 27), (41, 31), (51, 31)]


def gradient(size, c1, c2):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img


def mark(px):
    """The app-icon mark rendered at px x px (RGBA)."""
    s = px * SS
    base = gradient((s, s), TEAL_LIGHT, TEAL_DARK).convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 15 / 64), fill=255)
    base.putalpha(mask)
    d = ImageDraw.Draw(base)
    k = s / 64
    d.polygon([(x * k, y * k) for x, y in HEART], fill=(255, 255, 255, 255))
    pts = [(x * k, y * k) for x, y in BEAT]
    d.line(pts, fill=PULSE + (255,), width=max(2, int(3 * k)), joint="curve")
    for x, y in (pts[0], pts[-1]):
        r = 1.5 * k
        d.ellipse((x - r, y - r, x + r, y + r), fill=PULSE + (255,))
    return base.resize((px, px), Image.LANCZOS)


def font(size, bold=True):
    for name in (["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def social_preview():
    w, h = 1280, 640
    img = gradient((w, h), (7, 52, 46), (13, 110, 98)).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # faint ECG trace across the lower third
    trace = [(0, 505)]
    x = 0
    while x < w + 200:
        trace += [(x + 40, 505), (x + 70, 458), (x + 110, 556), (x + 150, 488), (x + 175, 505), (x + 260, 505)]
        x += 260
    d.line(trace, fill=(167, 243, 208, 70), width=4, joint="curve")
    img.alpha_composite(mark(220).resize((220, 220)), (96, 120))
    d.text((352, 118), "PulseCare", font=font(112), fill=(255, 255, 255, 255))
    d.text((356, 262), "Care that keeps its own rhythm.", font=font(44, bold=False), fill=MINT + (255,))
    for i, line in enumerate(["Book real free slots  •  Share records privately", "AI summaries that never diagnose  •  Open source"]):
        d.text((356, 350 + i * 46), line, font=font(30, bold=False), fill=(220, 245, 240, 230))
    d.text((96, 586), "React  •  Express  •  PostgreSQL  •  FastAPI + Ollama", font=font(28, bold=False), fill=(167, 243, 208, 200))
    return img.convert("RGB")


if __name__ == "__main__":
    big = mark(512)
    big.save(OUT / "logo-mark-512.png")
    mark(180).save(OUT / "apple-touch-icon.png")
    mark(32).save(OUT / "favicon-32.png")
    big.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    social_preview().save(OUT / "social-preview.png", optimize=True)
    print("wrote PNG/ICO assets to", OUT)
