"""
OrderFlow Beast — Twitter Visual Assets Generator
Outputs 5 production-ready PNGs to growth/assets/
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# ── Brand colors ───────────────────────────────────────────────────
BG    = (10,  10,  12)
CYAN  = (34,  211, 238)
CORAL = (249, 115, 102)
WHITE = (255, 255, 255)
GRAY  = (163, 163, 163)
DARK2 = (14,  14,  18)
DARK3 = (20,  20,  26)
FOOT  = (16,  16,  20)

# ── Fonts ──────────────────────────────────────────────────────────
DEJA_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJA_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

OUTPUT = "/root/projects/orderflow/growth/assets"
os.makedirs(OUTPUT, exist_ok=True)


def F(path, size):
    return ImageFont.truetype(path, size)


def bar(draw, x, y_base, w, h, color, alpha, radius=3):
    """Draw a rounded rectangle bar (bottom-anchored)."""
    c = (*color, int(alpha * 255))
    r = radius
    bx, by = x, y_base - h
    ex, ey = x + w, y_base
    draw.rectangle([bx+r, by, ex-r, ey],   fill=c)
    draw.rectangle([bx, by+r, ex, ey-r],   fill=c)
    draw.ellipse([bx, by, bx+2*r, by+2*r], fill=c)
    draw.ellipse([ex-2*r, by, ex, by+2*r], fill=c)
    draw.ellipse([bx, ey-2*r, bx+2*r, ey], fill=c)
    draw.ellipse([ex-2*r, ey-2*r, ex, ey], fill=c)


def card_footer(draw, label="@orderflowbeast", right_label="orderflowbeast.com",
                right_color=None, width=400, y=452):
    draw.rectangle([0, y, width, 500], fill=FOOT)
    fl = F(DEJA_REG, 11)
    draw.text((30, y+14), label, font=fl, fill=(*GRAY, 115))
    if right_label:
        rc = right_color or CYAN
        bb = draw.textbbox((0,0), right_label, font=fl)
        tw = bb[2] - bb[0]
        draw.text((width-30-tw, y+14), right_label, font=fl, fill=(*rc, 140))


# ═══════════════════════════════════════════════════════════════════
#  1. PROFILE PICTURE  400×400
# ═══════════════════════════════════════════════════════════════════
def make_profile():
    img  = Image.new("RGBA", (400, 400), (*BG, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    # Corner bracket accents
    for (bx, by) in [(28,28),(346,28),(28,346),(346,346)]:
        flip_x = bx > 200;  flip_y = by > 200
        hx1 = bx - 10 if flip_x else bx
        hx2 = bx      if flip_x else bx + 10
        vy1 = by - 10 if flip_y else by
        vy2 = by      if flip_y else by + 10
        draw.rectangle([hx1, by, hx2, by+2], fill=(*CYAN, 55))
        draw.rectangle([bx if not flip_x else bx-2, vy1,
                        bx+2 if not flip_x else bx, vy2], fill=(*CYAN, 55))

    # Top accent line + dot
    draw.rectangle([176, 36, 224, 38], fill=CYAN)
    draw.ellipse([197, 48, 203, 54], fill=(*CYAN, 140))

    # Delta ticks above bars
    for (tx, th) in [(189, 10),(199, 16),(209, 10)]:
        draw.rectangle([tx, 78-th, tx+2, 78], fill=(*CYAN, 115))

    # 5 footprint bars
    HEIGHTS   = [58, 96, 152, 112, 68]
    OPACITIES = [0.35, 0.60, 1.0, 0.60, 0.35]
    BAR_W, GAP = 26, 10
    TW = BAR_W*5 + GAP*4
    SX = (400 - TW) // 2
    BY = 218
    for i, (h, op) in enumerate(zip(HEIGHTS, OPACITIES)):
        bar(draw, SX + i*(BAR_W+GAP), BY, BAR_W, h, CYAN, op)

    # Baseline
    draw.rectangle([SX-10, BY+3, SX+TW+10, BY+5], fill=(*CYAN, 46))

    # ORDERFLOW wordmark
    f_big = F(DEJA_BOLD, 22)
    f_sub = F(DEJA_BOLD, 16)
    t1 = "ORDERFLOW"
    bb = draw.textbbox((0,0), t1, font=f_big)
    draw.text(((400-(bb[2]-bb[0]))//2, 248), t1, font=f_big, fill=(*WHITE, 230))

    t2 = "BEAST"
    bb2 = draw.textbbox((0,0), t2, font=f_sub)
    draw.text(((400-(bb2[2]-bb2[0]))//2, 280), t2, font=f_sub, fill=CYAN)

    img = img.convert("RGB")
    path = f"{OUTPUT}/1_profile_picture.png"
    img.save(path, "PNG", dpi=(300,300))
    print(f"  ✓  {path}  (400×400)")


# ═══════════════════════════════════════════════════════════════════
#  2. HEADER BANNER  1500×500
# ═══════════════════════════════════════════════════════════════════
def make_header():
    img  = Image.new("RGBA", (1500, 500), (*BG, 255))

    # Ambient glow (blurred ellipse layer)
    glow = Image.new("RGBA", (1500, 500), (0,0,0,0))
    gd   = ImageDraw.Draw(glow)
    gd.ellipse([-60, 90, 440, 410], fill=(*CYAN, 18))
    glow = glow.filter(ImageFilter.GaussianBlur(45))
    img  = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img, "RGBA")

    # Grid lines
    for i in range(1, 9):
        draw.rectangle([0, i*60, 1500, i*60+1], fill=(*WHITE, 6))

    # ── LEFT ──────────────────────────────────────────────────────
    draw.text((80, 108), "ORDER FLOW ANALYTICS",
              font=F(DEJA_REG, 11), fill=(*CYAN, 210))

    draw.text((80, 140), "See the order that",
              font=F(DEJA_BOLD, 54), fill=WHITE)
    draw.text((80, 202), "moved the market.",
              font=F(DEJA_BOLD, 54), fill=WHITE)

    draw.text((80, 300),
              "True L2 on crypto  ·  Inferred delta on stocks, futures & FX",
              font=F(DEJA_REG, 15), fill=GRAY)

    # CTA pill
    draw.rounded_rectangle([80, 340, 280, 378], radius=19,
                            fill=(*CYAN, 26), outline=(*CYAN, 102))
    draw.ellipse([96, 354, 103, 361], fill=CYAN)
    draw.text((112, 349), "Free tier — no card",
              font=F(DEJA_BOLD, 13), fill=CYAN)

    # ── RIGHT: Terminal window ─────────────────────────────────────
    draw.rounded_rectangle([740, 62, 1440, 437], radius=14,
                            fill=(*DARK2, 255), outline=(*WHITE, 18))
    draw.rounded_rectangle([740, 62, 1440, 96],  radius=14, fill=(*DARK3, 255))
    draw.rectangle([740, 84, 1440, 96], fill=(*DARK3, 255))

    for i in range(3):
        cx = 758 + i*18
        draw.ellipse([cx, 74, cx+10, 84], fill=(*WHITE, 26))

    draw.text((842, 75), "BTC-PERP  ·  67,420.50  +0.94%",
              font=F(DEJA_BOLD, 11), fill=GRAY)

    # Chart bars
    CBARS = [
        (50,CYAN,0.28),(80,CYAN,0.45),(115,CORAL,0.55),(90,CORAL,0.38),
        (150,CYAN,0.78),(64,CYAN,0.38),(178,CYAN,1.0),(110,CYAN,0.58),
        (82,CORAL,0.38),(98,CYAN,0.48),
    ]
    CBW, CGAP, CBASE, CSX = 36, 8, 344, 762
    for i,(h,c,op) in enumerate(CBARS):
        bar(draw, CSX + i*(CBW+CGAP), CBASE, CBW, h, c, op, radius=2)

    draw.rectangle([762, CBASE+1, 762+440, CBASE+2], fill=(*WHITE, 15))
    draw.text((762, 352), "CVD +12,480", font=F(DEJA_REG, 10), fill=(*CYAN,  178))
    draw.text((870, 352), "Δ +2,340",    font=F(DEJA_REG, 10), fill=(*CORAL, 178))

    # Signal alert card
    draw.rounded_rectangle([1224, 108, 1420, 208], radius=8,
                            fill=(22,22,30,255), outline=(*CYAN, 71))
    draw.rounded_rectangle([1224, 108, 1420, 112], radius=8, fill=CYAN)
    draw.ellipse([1234, 124, 1239, 129], fill=CYAN)
    draw.text((1244, 121), "BUY SWEEP",       font=F(DEJA_BOLD, 9),  fill=CYAN)
    draw.text((1244, 138), "BTC-PERP",        font=F(DEJA_BOLD, 16), fill=WHITE)
    draw.text((1244, 164), "67,420.50 · 14:02 UTC",
              font=F(DEJA_REG, 10), fill=GRAY)
    draw.text((1244, 180), "4 lifts in 90s",  font=F(DEJA_REG, 10), fill=(*GRAY,160))

    # Footer
    draw.text((80, 460), "@OrderFlowBeast  ·  orderflowbeast.com",
              font=F(DEJA_REG, 11), fill=(*WHITE, 51))

    img = img.convert("RGB")
    path = f"{OUTPUT}/2_header_banner.png"
    img.save(path, "PNG", dpi=(150,150))
    print(f"  ✓  {path}  (1500×500)")


# ═══════════════════════════════════════════════════════════════════
#  3. TWEET CARD — Signal Fired  400×500
# ═══════════════════════════════════════════════════════════════════
def make_card_signal():
    img  = Image.new("RGBA", (400, 500), (*BG, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    draw.rectangle([0, 0, 400, 3], fill=CYAN)

    # Badge
    draw.rounded_rectangle([30, 36, 160, 62], radius=4, fill=(*CYAN, 31))
    draw.ellipse([38, 45, 44, 51], fill=CYAN)
    draw.text((50, 41), "SIGNAL FIRED", font=F(DEJA_BOLD, 9), fill=CYAN)

    draw.text((30, 86), "buy_sweep · BTC-PERP",
              font=F(DEJA_REG, 13), fill=GRAY)
    draw.text((30, 108), "67,420.50",
              font=F(MONO_BOLD, 48), fill=CYAN)

    draw.rectangle([30, 180, 370, 181], fill=(*WHITE, 15))

    meta = [
        ("TIME",    "14:02 UTC"),
        ("TRIGGER", "4 lifts in 90s · book thinning above"),
        ("CONTEXT", "38M absorbed at 67.5k"),
        ("CHANNEL", "Live in app · 30min delay on Telegram"),
    ]
    for i,(lbl,val) in enumerate(meta):
        y0 = 200 + i*40
        draw.text((30, y0),    lbl, font=F(DEJA_REG, 9),  fill=(*GRAY, 140))
        draw.text((30, y0+13), val, font=F(DEJA_BOLD, 12), fill=(*WHITE, 224))

    card_footer(draw, right_label="orderflowbeast.com")
    img = img.convert("RGB")
    path = f"{OUTPUT}/3_tweet_signal_fired.png"
    img.save(path, "PNG", dpi=(150,150))
    print(f"  ✓  {path}  (400×500)")


# ═══════════════════════════════════════════════════════════════════
#  4. TWEET CARD — Tape Teardown  400×500
# ═══════════════════════════════════════════════════════════════════
def make_card_tape():
    img  = Image.new("RGBA", (400, 500), (*BG, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    draw.text((30, 40), "TAPE TEARDOWN",
              font=F(DEJA_BOLD, 9), fill=(*GRAY, 140))
    draw.text((30, 62), "+0.94%",
              font=F(MONO_BOLD, 58), fill=CYAN)
    draw.text((30, 152), "ES_F · 5,840.25 → 5,895.50 · NY open",
              font=F(DEJA_REG, 13), fill=GRAY)

    draw.rectangle([30, 186, 370, 187], fill=(*WHITE, 15))

    bullets = [
        "4 buy sweeps in 90s into 5,840",
        "Book thinned above 5,845 on third lift",
        "CVD diverged +1,240 before the move",
        "Value area low defended — continuation",
    ]
    for i, txt in enumerate(bullets):
        cy = 207 + i*52
        draw.ellipse([30, cy+4, 35, cy+9], fill=CYAN)
        draw.text((46, cy), txt, font=F(DEJA_REG, 13), fill=(*WHITE, 210))

    card_footer(draw)
    img = img.convert("RGB")
    path = f"{OUTPUT}/4_tweet_tape_teardown.png"
    img.save(path, "PNG", dpi=(150,150))
    print(f"  ✓  {path}  (400×500)")


# ═══════════════════════════════════════════════════════════════════
#  5. TWEET CARD — Edge Education  400×500
# ═══════════════════════════════════════════════════════════════════
def make_card_education():
    img  = Image.new("RGBA", (400, 500), (*BG, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    draw.multiline_text(
        (30, 50),
        "Why does CVD divergence\nfail 6 out of 10 times?",
        font=F(DEJA_BOLD, 26), fill=WHITE, spacing=10,
    )

    draw.rectangle([30, 148, 78, 150], fill=CYAN)

    points = [
        ("01", "No level to fail at",    "In open space, divergence is decoration."),
        ("02", "No tape confirmation",   "Needs absorption, sweep, or speed shift."),
        ("03", "Wrong timeframe",        "1m divergence resolves in minutes."),
    ]
    for i,(num,title,desc) in enumerate(points):
        y0 = 170 + i*90
        draw.text((30, y0),    num,   font=F(DEJA_BOLD, 10),  fill=(*CYAN, 128))
        draw.text((30, y0+18), title, font=F(DEJA_BOLD, 17),  fill=WHITE)
        draw.text((30, y0+42), desc,  font=F(DEJA_REG,  13),  fill=GRAY)
        if i < 2:
            draw.rectangle([30, y0+78, 370, y0+79], fill=(*WHITE, 13))

    # Footer with CTA
    draw.rectangle([0, 452, 400, 500], fill=FOOT)
    draw.text((30, 466),  "@orderflowbeast",
              font=F(DEJA_REG, 11), fill=(*GRAY, 115))
    draw.text((218, 466), "Free tier → link in bio",
              font=F(DEJA_BOLD, 11), fill=(*CYAN, 178))

    img = img.convert("RGB")
    path = f"{OUTPUT}/5_tweet_education.png"
    img.save(path, "PNG", dpi=(150,150))
    print(f"  ✓  {path}  (400×500)")


# ── Run ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\nGenerating OrderFlow Beast Twitter assets...\n")
    make_profile()
    make_header()
    make_card_signal()
    make_card_tape()
    make_card_education()
    print(f"\nAll 5 files in: {OUTPUT}/\n")
