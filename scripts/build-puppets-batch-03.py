#!/usr/bin/env python3
"""Build Puppets of Interest ranks 22–31 as ten separate WEBP card assets.

The source portraits are freely licensed/public-sector images hosted by Wikimedia
Commons. Every card carries the editorial boundary: PUBLIC-RECORD ROUTE · NOT
ACCUSATION. Outputs are written to card-art-inbox for the existing resolver.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps
from urllib.request import Request, urlopen
import io, math, random

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "card-art-inbox"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1200, 1800
SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/lato/Lato-Semibold.ttf"
SANS = "/usr/share/fonts/truetype/lato/Lato-Medium.ttf"

CARDS = [
 {"rank":22,"id":"tim-cook","name":"TIM COOK","suit":"COINS","lane":"MONEY / OWNERSHIP POWER","score":77,"palette":"gold","credit":"Photo: Tessa Bury / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/6/67/Tim_Cook_March_2026.jpg"},
 {"rank":23,"id":"george-soros","name":"GEORGE SOROS","suit":"MASKS","lane":"NARRATIVE / BELIEF POWER","score":74,"palette":"blue","credit":"Photo: Frank Plitt / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/5/57/George_Soros_%282012_cropped%29.jpg"},
 {"rank":24,"id":"mukesh-ambani","name":"MUKESH AMBANI","suit":"COINS","lane":"MONEY / OWNERSHIP POWER","score":72,"palette":"gold","credit":"Photo: Asia Society / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/4/40/Mukesh_Ambani_was_Awarded_the_Asia_Society_Leadership_Award_%28cropped%29.jpg"},
 {"rank":25,"id":"xi-jinping","name":"XI JINPING","suit":"CROWNS","lane":"GOVERNANCE / STATE POWER","score":72,"palette":"gold","credit":"Photo: Kremlin.ru / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/d/d1/Xi_Jinping_at_a_meeting_with_Vladimir_Putin_%282024%29_3x4_portrait.jpg"},
 {"rank":26,"id":"narendra-modi","name":"NARENDRA MODI","suit":"CROWNS","lane":"GOVERNANCE / STATE POWER","score":71,"palette":"gold","credit":"Photo: Government of India / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/2/2f/Official_portrait_of_the_Prime_Minister_Narendra_Modi%2C_2020.jpg"},
 {"rank":27,"id":"vladimir-putin","name":"VLADIMIR PUTIN","suit":"SWORDS","lane":"SECURITY / CONTRACTOR POWER","score":71,"palette":"blue","credit":"Photo: Kremlin.ru / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/5/5c/Vladimir_Putin_official_portrait_%281%29_%28cropped_2%29.jpg"},
 {"rank":28,"id":"benjamin-netanyahu","name":"BENJAMIN NETANYAHU","suit":"SWORDS","lane":"SECURITY / CONTRACTOR POWER","score":70,"palette":"blue","credit":"Photo: Avi Ohayon / Israel GPO","url":"https://upload.wikimedia.org/wikipedia/commons/b/b6/Netanyahu_official_portrait_%28cropped%29.jpg"},
 {"rank":29,"id":"volodymyr-zelenskyy","name":"VOLODYMYR ZELENSKYY","suit":"CROWNS","lane":"GOVERNANCE / STATE POWER","score":69,"palette":"gold","credit":"Photo: President.gov.ua / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/b/b1/Volodymyr_Zelensky_Official_portrait_%28cropped%29.jpg"},
 {"rank":30,"id":"giorgia-meloni","name":"GIORGIA MELONI","suit":"CROWNS","lane":"GOVERNANCE / STATE POWER","score":68,"palette":"gold","credit":"Photo: Governo Italiano / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/6/64/Giorgia_Meloni_Official_2024_crop.jpg"},
 {"rank":31,"id":"gautam-adani","name":"GAUTAM ADANI","suit":"COINS","lane":"MONEY / OWNERSHIP POWER","score":67,"palette":"gold","credit":"Photo: Gautam Adani / Wikimedia Commons","url":"https://upload.wikimedia.org/wikipedia/commons/f/ff/Gautam_Adani.jpg"},
]

def f(path, size): return ImageFont.truetype(path, size=size)

def fit_font(draw, text, path, max_size, min_size, max_width):
    for size in range(max_size, min_size - 1, -2):
        candidate = f(path, size)
        if draw.textbbox((0,0), text, font=candidate)[2] <= max_width:
            return candidate
    return f(path, min_size)

def fetch_image(url):
    req = Request(url, headers={"User-Agent":"MatrixReprogrammedCardBuilder/1.0"})
    with urlopen(req, timeout=45) as response:
        return Image.open(io.BytesIO(response.read())).convert("RGB")

def cover_crop(img, width, height, focus_y=.06):
    scale = max(width/img.width, height/img.height)
    img = img.resize((int(img.width*scale), int(img.height*scale)), Image.Resampling.LANCZOS)
    left = max(0, (img.width-width)//2)
    top = int(max(0, img.height-height)*focus_y)
    return img.crop((left, top, left+width, top+height))

def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,size[0]-1,size[1]-1), radius=radius, fill=255)
    return mask

def suit_icon(draw, x, y, suit, color, scale=.72):
    lw=max(3,int(5*scale)); r=int(25*scale)
    if suit=="COINS":
        draw.ellipse((x-r,y-r,x+r,y+r),outline=color,width=lw); draw.ellipse((x-r+5,y-r+5,x+r-5,y+r-5),outline=color,width=2)
        draw.line((x-r*.45,y,x+r*.45,y),fill=color,width=2); draw.line((x,y-r*.45,x,y+r*.45),fill=color,width=2)
    elif suit=="CROWNS":
        pts=[(x-30*scale,y+17*scale),(x-25*scale,y-18*scale),(x-7*scale,y+1*scale),(x,y-29*scale),(x+8*scale,y+1*scale),(x+27*scale,y-18*scale),(x+30*scale,y+17*scale)]
        draw.line(pts,fill=color,width=lw,joint="curve"); draw.line((x-30*scale,y+17*scale,x+30*scale,y+17*scale),fill=color,width=lw)
    elif suit=="SWORDS":
        for sign in (-1,1):
            draw.line((x-22*sign*scale,y+25*scale,x+20*sign*scale,y-25*scale),fill=color,width=lw)
            draw.line((x-30*sign*scale,y+15*scale,x-12*sign*scale,y+31*scale),fill=color,width=lw)
    else:
        draw.ellipse((x-34*scale,y-22*scale,x+1*scale,y+28*scale),outline=color,width=lw)
        draw.ellipse((x-1*scale,y-22*scale,x+34*scale,y+28*scale),outline=color,width=lw)
        draw.arc((x-26*scale,y+4*scale,x-7*scale,y+18*scale),5,175,fill=color,width=2)
        draw.arc((x+7*scale,y+7*scale,x+27*scale,y+22*scale),185,355,fill=color,width=2)

def background(accent):
    image=Image.new("RGB",(W,H),(5,7,10)); pixels=image.load()
    for y in range(H):
        for x in range(W):
            dx=(x-W/2)/(W/2); dy=(y-H*.44)/(H*.74); v=max(0,1-math.sqrt(dx*dx+dy*dy)); n=((x*13+y*7)%29)/29
            pixels[x,y]=(int(5+accent[0]*v*.12+n*2),int(7+accent[1]*v*.12+n*2),int(10+accent[2]*v*.12+n*2))
    return image

def network(draw, accent, seed):
    random.seed(seed); nodes=[(random.randint(90,W-90),random.randint(170,H-220)) for _ in range(36)]; faint=tuple(int(c*.30) for c in accent)
    for i,p in enumerate(nodes):
        for q in sorted(nodes[:i]+nodes[i+1:],key=lambda q:(p[0]-q[0])**2+(p[1]-q[1])**2)[:2]: draw.line((*p,*q),fill=faint,width=1)
        draw.ellipse((p[0]-3,p[1]-3,p[0]+3,p[1]+3),fill=faint)

def build(card):
    gold=(203,158,62); pale=(238,214,152); blue=(76,166,220); silver=(192,216,232)
    accent=gold if card["palette"]=="gold" else blue; light=pale if card["palette"]=="gold" else silver
    canvas=background(accent); draw=ImageDraw.Draw(canvas); network(draw,accent,card["rank"])
    draw.rounded_rectangle((32,32,W-33,H-33),radius=38,outline=accent,width=8)
    draw.rounded_rectangle((50,50,W-51,H-51),radius=32,outline=light,width=2)
    draw.rounded_rectangle((68,68,W-69,H-69),radius=26,outline=tuple(int(c*.65) for c in accent),width=3)
    draw.text((W//2,92),"MATRIX REPROGRAMMED",font=f(SANS_BOLD,28),fill=light,anchor="ma")
    draw.line((280,135,W-280,135),fill=accent,width=2)
    draw.text((W//2,151),"PUPPETS OF INTEREST",font=f(SERIF_BOLD,33),fill=(235,235,230),anchor="ma")
    for x in (112,W-112):
        draw.rounded_rectangle((x-54,78,x+54,202),radius=15,fill=(7,10,14),outline=accent,width=3)
        draw.text((x,88),str(card["rank"]),font=f(SERIF_BOLD,43),fill=light,anchor="ma"); suit_icon(draw,x,163,card["suit"],accent)
    px0,py0,px1,py1=118,240,W-118,1185
    portrait=cover_crop(fetch_image(card["url"]),px1-px0,py1-py0,.18 if card["id"]=="tim-cook" else .05)
    portrait=ImageEnhance.Contrast(portrait).enhance(1.12); portrait=ImageEnhance.Color(portrait).enhance(.62)
    portrait=Image.blend(portrait,Image.new("RGB",portrait.size,accent),.10)
    vignette=Image.new("L",portrait.size,0); ImageDraw.Draw(vignette).ellipse((-160,-80,portrait.width+160,portrait.height+180),fill=255); vignette=vignette.filter(ImageFilter.GaussianBlur(80))
    panel=Image.new("RGB",portrait.size,(3,5,8)); panel.paste(portrait,mask=vignette); canvas.paste(panel,(px0,py0),rounded_mask(panel.size,25)); draw=ImageDraw.Draw(canvas)
    draw.rounded_rectangle((px0,py0,px1,py1),radius=25,outline=accent,width=6); draw.rounded_rectangle((px0+13,py0+13,px1-13,py1-13),radius=18,outline=light,width=2)
    for y in range(py0+20,py1-20,12): draw.line((px0+18,y,px1-18,y),fill=(185,190,195),width=1)
    top=1115; draw.rounded_rectangle((138,top,W-138,1305),radius=24,fill=(4,6,9),outline=accent,width=5)
    draw.text((W//2,top+28),card["name"],font=fit_font(draw,card["name"],SERIF_BOLD,74,46,W-330),fill=(246,244,232),anchor="ma",stroke_width=2,stroke_fill=(0,0,0))
    draw.text((W//2,top+116),f'{card["suit"]} · CARD {card["rank"]}',font=f(SANS_BOLD,27),fill=accent,anchor="ma")
    draw.line((175,1345,W-175,1345),fill=accent,width=3)
    draw.text((W//2,1370),card["lane"],font=fit_font(draw,card["lane"],SANS_BOLD,35,26,W-270),fill=light,anchor="ma")
    draw.text((W//2,1445),f'POWER SCORE  {card["score"]} / 100',font=f(SERIF_BOLD,50),fill=(245,245,238),anchor="ma")
    bx0,by0,bx1,by1=230,1515,W-230,1542; draw.rounded_rectangle((bx0,by0,bx1,by1),radius=13,fill=(20,24,29),outline=accent,width=2)
    draw.rounded_rectangle((bx0+4,by0+4,bx0+int((bx1-bx0)*card["score"]/100),by1-4),radius=9,fill=accent)
    draw.rounded_rectangle((145,1590,W-145,1692),radius=18,fill=(6,8,11),outline=light,width=2)
    draw.text((W//2,1614),"PUBLIC-RECORD ROUTE · NOT ACCUSATION",font=f(SANS_BOLD,27),fill=(235,235,230),anchor="ma")
    draw.text((W//2,1656),"Influence map · evidence-led · editorially bounded",font=f(SANS,21),fill=accent,anchor="ma")
    draw.text((W//2,1735),card["credit"],font=f(SANS,15),fill=(128,132,138),anchor="ma")
    canvas.save(OUT/f'{card["id"]}.webp',"WEBP",quality=92,method=6)
    print(f'Built {card["rank"]}: {card["id"]}.webp')

if __name__ == "__main__":
    for item in CARDS: build(item)
    print(f'Puppets batch 03 complete: {len(CARDS)} separate card assets.')
