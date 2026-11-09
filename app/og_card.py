"""Draws the 1200x630 preview card shown in Discord/Slack for files and folders without a real preview image.

Uses the site's colours and the bundled IBM Plex fonts (app/assets/fonts). Pure Pillow, no network.
"""

from functools import lru_cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTS = Path(__file__).parent / "assets" / "fonts"
BG, FG, MUTED, BLUE, PANEL = "#1e1f23", "#f1f1f1", "#9a9ca3", "#9ad2ed", "#2a2c31"
W, H, S = 1200, 630, 2  # drawn at 2x and scaled down for smooth edges

# The logo mark, in its 256x256 design box (see static/icons/logo.svg).
_LEFT = [(29.27, 61.11), (138.68, 61.11), (89.37, 245.11), (29.27, 245.11)]
_RIGHT = [(166.63, 10.89), (226.73, 10.89), (226.73, 194.89), (117.32, 194.89)]


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size * S)


def _mark(draw: ImageDraw.ImageDraw, x: float, y: float, size: float, left: str, right: str):
    k = size / 256 * S
    for pts, fill in ((_LEFT, left), (_RIGHT, right)):
        draw.polygon([(x * S + px * k, y * S + py * k) for px, py in pts], fill=fill)


def _wrap(draw, text: str, font, max_w: int, max_lines: int) -> list[str]:
    """Break `text` into at most `max_lines` lines; long unbroken names are split by character and end in an ellipsis."""
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=font) > max_w * S and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > max_w * S:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


@lru_cache(maxsize=256)
def render_card(title: str, kind: str, meta: str, path: str) -> bytes:
    img = Image.new("RGB", (W * S, H * S), BG)
    d = ImageDraw.Draw(img)

    # Big faded mark on the right, as a backdrop.
    _mark(d, 760, 60, 520, PANEL, "#26323a")

    # Accent bar on the left edge.
    d.rectangle([0, 0, 14 * S, H * S], fill=BLUE)

    # Type pill.
    pill = _font("PlexMono-Regular.ttf", 30)
    pw = d.textlength(kind, font=pill) / S
    d.rectangle([72 * S, 72 * S, (72 + pw + 44) * S, 124 * S], fill=PANEL, outline=BLUE, width=2 * S)
    d.text((94 * S, 98 * S), kind, font=pill, fill=BLUE, anchor="lm")

    # Title (up to two lines), then the path.
    tf = _font("PlexSans-Bold.ttf", 78)
    y = 170
    for line in _wrap(d, title, tf, 880, 2):
        d.text((72 * S, y * S), line, font=tf, fill=FG)
        y += 98
    pf = _font("PlexMono-Regular.ttf", 28)
    pth = path if len(path) <= 52 else "…" + path[-51:]
    d.text((72 * S, (y + 14) * S), pth, font=pf, fill=MUTED)

    # Footer: logo + site name on the left, size/count on the right.
    _mark(d, 72, 520, 56, FG, BLUE)
    d.text((148 * S, 548 * S), "amit/cdn", font=_font("PlexSans-Bold.ttf", 36), fill=FG, anchor="lm")
    if meta:
        d.text(((W - 72) * S, 548 * S), meta, font=_font("PlexSans-Regular.ttf", 36), fill=MUTED, anchor="rm")

    out = BytesIO()
    img.resize((W, H), Image.LANCZOS).save(out, "PNG", optimize=True)
    return out.getvalue()
