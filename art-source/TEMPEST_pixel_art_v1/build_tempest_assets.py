from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import numpy as np, random, json, math, zipfile, shutil, textwrap, csv
from collections import deque

SRC=Path('/mnt/data/a_large_detailed_pixel_art_game_asset_sheet_sty.png')
ROOT=Path('/mnt/data/TEMPEST_pixel_art_v1')
if ROOT.exists(): shutil.rmtree(ROOT)
for folder in ['characters','characters/portraits','environments','props/valcendre','props/estate','props/abbey','props/ascension','props/shared','fx','ui','boss','reference','previews']:
    (ROOT/folder).mkdir(parents=True,exist_ok=True)
master=Image.open(SRC).convert('RGB')
shutil.copyfile(SRC,ROOT/'reference/TEMPEST_master_art_direction.png')

# Image cuts are derived from the generated art-direction atlas. Remove its matte by
# edge-connected background detection. This is deliberately conservative: artists
# should inspect for 1px fragments before shipping.
def matte_extract(box, target=None, limit=None, anchor='bottom', cutoff=27):
    src=master.crop(box).convert('RGB')
    ar=np.asarray(src).astype('int16')
    h,w=ar.shape[:2]
    corners=np.concatenate([ar[:max(2,h//12),:max(2,w//12)].reshape(-1,3),ar[:max(2,h//12),-max(2,w//12):].reshape(-1,3),ar[-max(2,h//12):,:max(2,w//12)].reshape(-1,3),ar[-max(2,h//12):,-max(2,w//12):].reshape(-1,3)],axis=0)
    bg=np.median(corners,axis=0)
    diff=np.max(np.abs(ar-bg[None,None,:]),axis=2)
    # near-black matte extends to edges; flood only contiguous pixels
    removable=diff<cutoff
    seen=np.zeros((h,w),dtype=bool)
    q=deque()
    for x in range(w):
        for y in (0,h-1):
            if removable[y,x]: seen[y,x]=True; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if removable[y,x] and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=ny<h and 0<=nx<w and removable[ny,nx] and not seen[ny,nx]:
                seen[ny,nx]=True; q.append((ny,nx))
    alpha=np.where(seen,0,255).astype('uint8')
    # delete tiny isolated source noise, keeping all connected visible details
    vis=alpha>0
    explored=np.zeros((h,w),bool)
    for y in range(h):
        for x in range(w):
            if not vis[y,x] or explored[y,x]:continue
            group=[(y,x)];explored[y,x]=True;q=deque([(y,x)])
            while q:
                yy,xx=q.popleft()
                for ny,nx in ((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)):
                    if 0<=ny<h and 0<=nx<w and vis[ny,nx] and not explored[ny,nx]:
                        explored[ny,nx]=True;q.append((ny,nx));group.append((ny,nx))
            if len(group)<3:
                for yy,xx in group:alpha[yy,xx]=0
    rgba=src.convert('RGBA'); rgba.putalpha(Image.fromarray(alpha))
    if target:
        a=rgba.getchannel('A').getbbox()
        out=Image.new('RGBA',target)
        if a:
            piece=rgba.crop(a)
            bound_w=(target[0]-1) if not limit else min(target[0]-1, limit[0])
            bound_h=(target[1]-1) if not limit else min(target[1]-1, limit[1])
            scale=min(bound_w/piece.width,bound_h/piece.height)
            nw=max(1,round(piece.width*scale));nh=max(1,round(piece.height*scale))
            piece=piece.resize((nw,nh),Image.Resampling.NEAREST)
            px=(target[0]-nw)//2
            py=(target[1]-nh-1) if anchor=='bottom' else (target[1]-nh)//2
            out.alpha_composite(piece,(px,py))
        return out
    return rgba

CHARACTERS={
 'tempest':([81,119,156,195],(20,57,84,111)),
 'lookout_guard':([302,340,379,415],(237,59,301,111)),
 'enforcer':([519,559,598,636],(451,59,516,112)),
 'zealot_cultist':([739,777,818,855],(665,58,726,112)),
 'ascendant_cultist':([960,998,1035,1073],(890,58,952,112)),
 'suzanne':([1177,1215,1254,1293],(1110,58,1175,112)),
 'barnabe':([1389,1427,1467,1505],(1324,58,1387,113))
}
ROW_BOXES=[(109,147),(149,188),(190,228),(231,268),(271,306),(307,325)]
ANIMS=['idle','walk','aim','fire','hit','down']
manifest={'title':'TEMPEST','version':'1.0.0','game_resolution':[480,270],'tile_size':[16,16],'human_sprite_size':[24,32], 'characters':{},'environments':{},'props':{},'fx':{},'boss':{},'notes':[]}
for name,(xcenters,portrait_rect) in CHARACTERS.items():
    sheet=Image.new('RGBA',(24*4,32*6))
    for row,(y0,y1) in enumerate(ROW_BOXES):
        for col,cx in enumerate(xcenters):
            # restrict each source to its individual pose: neighboring columns must not bleed
            if name=='tempest' and row==5:
                y0c,y1c=y0,y1
            else: y0c,y1c=y0,y1
            frame=matte_extract((cx-18,y0c,cx+18,y1c),(24,32),limit=(23,30),cutoff=26)
            sheet.alpha_composite(frame,(col*24,row*32))
    sheet.save(ROOT/f'characters/{name}_24x32_4x6.png')
    # portraits retained at native reference crop resolution
    portrait=master.crop(portrait_rect)
    portrait.save(ROOT/f'characters/portraits/{name}_portrait.png')
    manifest['characters'][name]={'file':f'characters/{name}_24x32_4x6.png','frame_width':24,'frame_height':32,'columns':4,'rows':6,'row_names':ANIMS,'frames_per_row':4,'origin':[12,30], 'direction_note':'Pose frames from concept atlas, not a fully authored 4-directional animation set; mirror or redraw for directional play.'}

# Cut transparent scene props from generated source. Each is a fixed-size game object;
# all use nearest-neighbor only.
PROP_CROPS={
 'valcendre':[
 ('fountain',(18,599,95,663),(32,32)),('barrels',(97,609,156,671),(32,24)),('hay_cart',(154,598,242,658),(32,24)),('flower_box',(238,599,304,645),(32,16)),('stone_cover',(300,602,363,659),(32,16)),('lamppost',(350,630,378,708),(16,32)),('bench',(51,670,152,708),(32,16)),('flower_pot',(160,662,224,705),(16,16)),('tree',(223,658,353,760),(32,32)),('french_flag',(13,666,50,750),(16,32)),('clothesline',(124,708,229,762),(32,16)),('village_cross',(45,703,120,776),(16,32))],
 'estate':[
 ('statue',(393,598,464,672),(32,32)),('topiary',(455,606,526,667),(32,32)),('candelabra',(514,601,557,665),(16,24)),('covered_table',(555,603,630,671),(32,24)),('wooden_crates',(621,605,693,666),(32,24)),('hedge',(397,665,465,722),(32,16)),('iron_gate',(470,665,651,768),(32,32)),('banner',(683,691,745,769),(16,32)),('lantern',(704,602,752,672),(16,32)),('wardrobe_cover',(695,656,752,713),(32,32))],
 'abbey':[
 ('broken_wall',(767,597,843,675),(32,32)),('broken_column',(843,599,884,667),(16,32)),('stone_sarcophagus',(880,601,1017,678),(32,16)),('collapsed_pillar',(1007,607,1069,674),(32,24)),('rubble',(1061,612,1140,675),(32,16)),('candles',(770,678,847,713),(16,16)),('lectern',(883,696,955,756),(16,24)),('chandelier',(959,681,1029,744),(16,24)),('skulls',(1036,714,1128,765),(32,16)),('church_pew',(801,724,889,771),(32,16)),('banner',(1080,672,1144,766),(16,32))],
 'ascension':[
 ('black_pillar',(1149,602,1201,675),(16,32)),('infernal_altar',(1199,607,1341,687),(32,24)),('flame_brazier',(1337,598,1409,690),(16,24)),('hanging_cage',(1458,624,1528,698),(16,32)),('ritual_banner',(1463,697,1531,778),(16,32)),('skull_heap',(1328,706,1456,776),(32,16)),('stone_steps',(1161,694,1341,769),(32,16)),('black_column',(1417,593,1469,682),(16,32)),('altar_candles',(1380,671,1456,733),(16,16))]
}
for scene,items in PROP_CROPS.items():
    manifest['props'][scene]=[]
    for name,rect,size in items:
        im=matte_extract(rect,size,limit=(size[0]-1,size[1]-1),anchor='bottom',cutoff=24)
        p=ROOT/f'props/{scene}/{name}_{size[0]}x{size[1]}.png';im.save(p)
        manifest['props'][scene].append({'name':name,'file':str(p.relative_to(ROOT)),'width':size[0],'height':size[1], 'origin':[size[0]//2,size[1]-1]})
# Body props under SFX row, at uniform 32x16
for name,rect in [('guard',(908,823,1030,867)),('cultist',(909,869,1031,923)),('civilian',(910,922,1029,980))]:
    size=(32,16)
    im=matte_extract(rect,size,anchor='bottom',cutoff=24)
    out=ROOT/f'props/shared/body_{name}_32x16.png';im.save(out)
    manifest['props'].setdefault('shared',[]).append({'name':'body_'+name,'file':str(out.relative_to(ROOT)),'width':32,'height':16})

# Palette-driven native 16x16 tilemaps: no anti-aliasing, no float pixels.
THEMES={
 'valcendre':dict(floor='#c2ae91',floor2='#a8967d',light='#e1d0b1',dark='#746959',wall='#cabca4',mortar='#756f65',accent='#b66e54',accent2='#5f7387',leaf='#526d48',leaf2='#7b885b',blood='#923f40',gold='#b99a55'),
 'estate':dict(floor='#858993',floor2='#727681',light='#bec1bf',dark='#414a56',wall='#a6a7a5',mortar='#5a5f69',accent='#5a6575',accent2='#7b3c48',leaf='#405b49',leaf2='#7a8868',blood='#803b45',gold='#b49a69'),
 'abbey':dict(floor='#65636a',floor2='#4f5159',light='#9a9895',dark='#292d34',wall='#737278',mortar='#393b44',accent='#5b454b',accent2='#7a5f50',leaf='#425749',leaf2='#657c5a',blood='#983c45',gold='#a28a61'),
 'ascension':dict(floor='#45363b',floor2='#382a33',light='#766066',dark='#1c1b25',wall='#503d46',mortar='#251f2b',accent='#963a40',accent2='#bc5550',leaf='#65434b',leaf2='#8c4d45',blood='#a92739',gold='#c39c55')
}
TILE_NAMES=['floor_01','floor_02','floor_03','floor_04','floor_05','floor_06','floor_07','floor_08',
 'wall_solid','wall_variant','wall_top','wall_bottom','wall_left','wall_right','wall_corner_tl','wall_corner_tr',
 'wall_corner_bl','wall_corner_br','door_closed','door_open','threshold','window','stairs_up','stairs_down',
 'trim','floor_inlay','floor_crack','ground_debris','floor_stain','deep_shadow','cover_low','cover_high',
 'grass','hedge','flowerbed','roof','roof_edge','rubble','cobble','brick','checker','carpet','carpet_edge','metal','pillar','grate','accent','ritual_mark']
assert len(TILE_NAMES)==48

def hex2t(s):return tuple(int(s[i:i+2],16) for i in (1,3,5))
def tint(color,amount):return tuple(max(0,min(255,a+amount)) for a in hex2t(color)) if isinstance(color,str) else tuple(max(0,min(255,a+amount)) for a in color)

def draw_base_texture(kind, p, seed):
    rng=random.Random(seed)
    im=Image.new('RGBA',(16,16),p['floor']);d=ImageDraw.Draw(im)
    def C(a):return p[a]
    if kind in ('floor','crack','stain','inlay','debris','rubble','cobble','checker','carpet','carpet_edge','trim','threshold','stairs_up','stairs_down','accent','ritual','shadow'):
        # restrained flagstone chips and partial joints: avoid busy 8px checker repetition
        im.paste(C('floor') if seed%4 else C('floor2'),(0,0,16,16))
        d=ImageDraw.Draw(im)
        if kind=='cobble':
            d.line((0,7,15,7),fill=C('mortar'))
            d.line((7,0,7,6),fill=C('mortar'))
            d.line((3,8,3,15),fill=C('mortar'))
            d.line((12,8,12,15),fill=C('mortar'))
            d.line((1,1,6,1),fill=C('light'))
            d.line((6,9,11,9),fill=C('light'))
        else:
            # Quiet stone: only a few edge fragments and high-value material flecks.
            if seed%3==0:d.line((0,15,9,15),fill=C('mortar'))
            if seed%5==0:d.line((15,0,15,10),fill=C('mortar'))
            if seed%4==0:d.line((0,7,4,7),fill=C('mortar'))
            for _ in range(5):
                x,y=rng.randrange(16),rng.randrange(16)
                d.point((x,y),fill=rng.choice([C('light'),C('floor2')]))
    if kind=='floor':
        if seed%3==0: d.line((1,4,4,4),fill=C('light'))
        if seed%4==0:d.point((10,12),fill=C('light'))
    elif kind=='wall':
        im.paste(C('wall'),(0,0,16,16));d=ImageDraw.Draw(im)
        for y in [0,5,10,15]:d.line((0,y,15,y),fill=C('mortar'))
        for y in [0,10]:
            for x in [4,11]:d.line((x,y,x,y+4),fill=C('mortar'))
        for x in [0,8,15]:d.line((x,6,x,9),fill=C('mortar'))
        for _ in range(9):d.point((rng.randrange(16),rng.randrange(16)),fill=rng.choice([C('light'),C('floor2'),C('mortar')]))
    elif kind=='roof':
        im.paste(C('accent'),(0,0,16,16));d=ImageDraw.Draw(im)
        for y in range(0,16,5):
            d.line((0,y,15,y),fill=C('dark'))
            for x in range((-3 if y%2 else 1),16,7):
                d.line((x,y+1,x,y+4),fill=C('dark'))
                d.line((x+1,y+1,x+4,y+1),fill=C('light'))
    elif kind=='grass':
        im.paste(C('leaf'),(0,0,16,16));d=ImageDraw.Draw(im)
        for _ in range(30):
            x,y=rng.randrange(16),rng.randrange(16)
            d.point((x,y),fill=rng.choice([C('leaf2'),C('dark'),C('light')]))
    elif kind=='hedge':
        im.paste(C('leaf'),(0,0,16,16));d=ImageDraw.Draw(im)
        for x,y in [(2,2),(9,1),(5,7),(13,8),(1,12),(8,13)]:
            d.rectangle((x,y,x+3,y+2),fill=C('leaf2'))
            d.point((x+1,y),fill=C('light'))
    elif kind=='metal':
        im.paste(C('dark'),(0,0,16,16));d=ImageDraw.Draw(im)
        for x in range(2,16,4):d.line((x,1,x,14),fill=C('mortar'));d.line((x+1,1,x+1,14),fill=C('light'))
    elif kind=='brick':
        im.paste(C('accent'),(0,0,16,16));d=ImageDraw.Draw(im)
        for y in [4,9,14]: d.line((0,y,15,y),fill=C('dark'))
        for y,xs in [(0,(4,11)),(5,(1,8)),(10,(5,12))]:
            for x in xs:d.line((x,y,x,y+3),fill=C('dark'))
    return im

def tile_art(name,p,seed):
    basekind='floor'
    if name.startswith('wall') or name in ('pillar','window','door_closed','door_open','cover_low','cover_high'):
        basekind='wall'
    elif name in ('roof','roof_edge'):basekind='roof'
    elif name=='grass' or name=='flowerbed':basekind='grass'
    elif name=='hedge':basekind='hedge'
    elif name=='metal' or name=='grate':basekind='metal'
    elif name=='brick':basekind='brick'
    elif name in ('floor_inlay','ritual_mark','checker','carpet','carpet_edge','deep_shadow','accent','stairs_up','stairs_down','trim','threshold','floor_stain','floor_crack','ground_debris','rubble','cobble'):basekind=name if name not in ('floor_inlay','ground_debris','floor_stain','floor_crack','deep_shadow') else {'floor_inlay':'inlay','ground_debris':'debris','floor_stain':'stain','floor_crack':'crack','deep_shadow':'shadow'}[name]
    tile=draw_base_texture(basekind,p,seed)
    d=ImageDraw.Draw(tile)
    C=lambda k:p[k]
    if name.startswith('wall_'):
        if name.endswith('top'):d.line((0,0,15,0),fill=C('light'));d.line((0,1,15,1),fill=C('light'))
        if name.endswith('bottom'):d.rectangle((0,13,15,15),fill=C('dark'))
        if name.endswith('left') or name.endswith('tl') or name.endswith('bl'):d.line((0,0,0,15),fill=C('dark'))
        if name.endswith('right') or name.endswith('tr') or name.endswith('br'):d.line((15,0,15,15),fill=C('dark'))
        if 'corner' in name:
            d.rectangle((1 if name.endswith('l') else 12,1 if name.endswith('t') else 12,3 if name.endswith('l') else 14,3 if name.endswith('t') else 14),fill=C('light'))
    elif name=='door_closed':
        d.rectangle((2,1,13,15),fill=C('dark'),outline=C('light'))
        for x in (4,11):d.line((x,3,x,14),fill=C('mortar'))
        d.point((10,9),fill=C('gold'))
    elif name=='door_open':d.rectangle((2,1,13,15),fill=C('dark'));d.line((2,1,2,15),fill=C('light'))
    elif name=='threshold':d.rectangle((0,7,15,10),fill=C('wall'));d.line((0,7,15,7),fill=C('light'))
    elif name=='window':d.rectangle((3,2,12,13),fill=C('dark'),outline=C('light'));d.line((7,2,7,13),fill=C('accent2'));d.line((3,7,12,7),fill=C('accent2'))
    elif name.startswith('stairs'):
        for y in [2,6,10,14]:d.line((0,y,15,y),fill=C('dark'));d.line((0,y+1,15,y+1),fill=C('light'))
    elif name=='trim':d.line((0,2,15,2),fill=C('light'));d.line((0,4,15,4),fill=C('dark'))
    elif name=='floor_inlay':
        d.rectangle((2,2,13,13),outline=C('gold'));d.line((5,5,10,10),fill=C('dark'));d.line((10,5,5,10),fill=C('dark'))
    elif name=='floor_crack':d.line([(2,1),(6,5),(5,8),(10,10),(9,15)],fill=C('dark'),width=1)
    elif name=='ground_debris' or name=='rubble':
        for x,y in [(1,4),(8,2),(4,11),(12,9)]:d.rectangle((x,y,x+2,y+2),fill=C('light'),outline=C('dark'))
    elif name=='floor_stain':
        blood=C('blood');
        for rect in [(3,4,6,7),(7,7,10,10),(2,11,3,12),(12,6,13,8)]:d.ellipse(rect,fill=blood)
    elif name=='deep_shadow':d.rectangle((0,0,15,15),fill=C('dark'));d.line((0,0,15,0),fill=C('mortar'))
    elif name in ('cover_low','cover_high'):
        d.rectangle((0,4 if name=='cover_low' else 0,15,15),fill=C('wall'),outline=C('mortar'))
        for y in ([8,12] if name=='cover_high' else [10,14]):d.line((0,y,15,y),fill=C('mortar'))
    elif name=='flowerbed':
        for x,y in [(3,4),(10,6),(6,12),(14,11)]:d.point((x,y),fill=C('accent'));d.point((x+1,y),fill=C('light'))
    elif name=='roof_edge':d.rectangle((0,12,15,15),fill=C('dark'));d.line((0,12,15,12),fill=C('light'))
    elif name=='cobble':
        for x,y in [(2,2),(9,3),(3,10),(11,11)]:d.rectangle((x,y,x+3,y+2),outline=C('dark'))
    elif name=='checker':
        for y in range(0,16,8):
            for x in range(0,16,8):
                d.rectangle((x,y,x+7,y+7),fill=C('light') if (x+y)//8%2 else C('dark'))
    elif name=='carpet' or name=='carpet_edge':
        d.rectangle((0,0,15,15),fill=C('accent2'))
        for x in (2,13):d.line((x,0,x,15),fill=C('gold'))
        if name=='carpet_edge':d.line((0,0,15,0),fill=C('gold'))
    elif name=='pillar':
        d.rectangle((3,0,12,15),fill=C('wall'),outline=C('dark'));d.line((5,1,5,14),fill=C('light'));d.rectangle((1,12,14,15),outline=C('light'))
    elif name=='grate':
        for x in range(3,16,4):d.line((x,0,x,15),fill=C('gold'))
    elif name=='accent':
        for x,y in [(3,3),(12,3),(3,12),(12,12)]:d.point((x,y),fill=C('gold'))
    elif name=='ritual_mark':
        # readable gold ritual icon, restrained scale
        d.ellipse((2,2,13,13),outline=C('gold'))
        d.line([(8,3),(12,11),(3,6),(13,6),(4,11),(8,3)],fill=C('gold'))
        d.point((7,8),fill=C('accent'))
    return tile

COLLIDE={'wall_solid','wall_variant','wall_top','wall_bottom','wall_left','wall_right','wall_corner_tl','wall_corner_tr','wall_corner_bl','wall_corner_br','door_closed','window','cover_high','hedge','roof','pillar'}
COVER={'cover_low':'half','cover_high':'full','hedge':'full','wall_solid':'full','wall_variant':'full'}
for theme,p0 in THEMES.items():
    p={key:hex2t(value) for key,value in p0.items()}
    tiles=Image.new('RGBA',(128,96))
    meta=[]
    for i,name in enumerate(TILE_NAMES):
        tile=tile_art(name,p,seed=367+i*131+len(theme)*37)
        tiles.alpha_composite(tile,((i%8)*16,(i//8)*16))
        meta.append({'id':i,'name':name,'solid':name in COLLIDE,'cover':COVER.get(name,'none'),'occludes_vision':name in COLLIDE})
    tilepath=ROOT/f'environments/{theme}_tiles_16x16.png'
    tiles.save(tilepath)
    (ROOT/f'environments/{theme}_tiles.json').write_text(json.dumps({'name':theme,'tilewidth':16,'tileheight':16,'columns':8,'tilecount':48,'image':tilepath.name,'tiles':meta},indent=2))
    # TMX/Tiled compatible TSX without collision polygons; tile IDs align json.
    import xml.etree.ElementTree as ET
    ts=ET.Element('tileset',{'version':'1.10','tiledversion':'1.11.2','name':f'tempest_{theme}','tilewidth':'16','tileheight':'16','tilecount':'48','columns':'8'})
    ET.SubElement(ts,'image',{'source':tilepath.name,'width':'128','height':'96'})
    for t in meta:
        te=ET.SubElement(ts,'tile',{'id':str(t['id'])});props=ET.SubElement(te,'properties')
        ET.SubElement(props,'property',{'name':'solid','type':'bool','value':'true' if t['solid'] else 'false'})
        ET.SubElement(props,'property',{'name':'cover','value':t['cover']})
        ET.SubElement(props,'property',{'name':'blocks_vision','type':'bool','value':'true' if t['occludes_vision'] else 'false'})
    ET.ElementTree(ts).write(ROOT/f'environments/{theme}_tiles.tsx',encoding='utf-8',xml_declaration=True)
    manifest['environments'][theme]={'png':str(tilepath.relative_to(ROOT)),'json':f'environments/{theme}_tiles.json','tsx':f'environments/{theme}_tiles.tsx','columns':8,'rows':6,'tile_size':[16,16]}

# Original 5x7 block font rasterized into 8x8, with transparent backing.
FONT={
 'A':['01110','10001','10001','11111','10001','10001','10001'], 'B':['11110','10001','10001','11110','10001','10001','11110'],
 'C':['01111','10000','10000','10000','10000','10000','01111'], 'D':['11110','10001','10001','10001','10001','10001','11110'],
 'E':['11111','10000','10000','11110','10000','10000','11111'], 'F':['11111','10000','10000','11110','10000','10000','10000'],
 'G':['01111','10000','10000','10111','10001','10001','01111'], 'H':['10001','10001','10001','11111','10001','10001','10001'],
 'I':['11111','00100','00100','00100','00100','00100','11111'], 'J':['00111','00010','00010','00010','10010','10010','01100'],
 'K':['10001','10010','10100','11000','10100','10010','10001'], 'L':['10000','10000','10000','10000','10000','10000','11111'],
 'M':['10001','11011','10101','10101','10001','10001','10001'], 'N':['10001','11001','10101','10011','10001','10001','10001'],
 'O':['01110','10001','10001','10001','10001','10001','01110'], 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'Q':['01110','10001','10001','10001','10101','10010','01101'], 'R':['11110','10001','10001','11110','10100','10010','10001'],
 'S':['01111','10000','10000','01110','00001','00001','11110'], 'T':['11111','00100','00100','00100','00100','00100','00100'],
 'U':['10001','10001','10001','10001','10001','10001','01110'], 'V':['10001','10001','10001','10001','10001','01010','00100'],
 'W':['10001','10001','10001','10101','10101','10101','01010'], 'X':['10001','10001','01010','00100','01010','10001','10001'],
 'Y':['10001','10001','01010','00100','00100','00100','00100'], 'Z':['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10011','10101','10101','10101','11001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01111','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','11110'],
 ' ':['00000']*7,'.':['00000','00000','00000','00000','00000','00110','00110'],',':['00000','00000','00000','00000','00110','00110','00100'],
 ':':['00000','00110','00110','00000','00110','00110','00000'],';':['00000','00110','00110','00000','00110','00110','00100'],
 '!':['00100','00100','00100','00100','00100','00000','00100'],'?':['01110','10001','00001','00010','00100','00000','00100'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],'+':['00000','00100','00100','11111','00100','00100','00000'],
 '/':['00001','00001','00010','00100','01000','10000','10000'],'\\':['10000','10000','01000','00100','00010','00001','00001'],
 '(':['00010','00100','01000','01000','01000','00100','00010'],')':['01000','00100','00010','00010','00010','00100','01000'],
 '[':['01110','01000','01000','01000','01000','01000','01110'],']':['01110','00010','00010','00010','00010','00010','01110'],
 "'":['00100','00100','00000','00000','00000','00000','00000'],'"':['01010','01010','00000','00000','00000','00000','00000'],
 '#':['01010','01010','11111','01010','11111','01010','01010'], '%':['11001','11010','00100','00100','01011','10011','00000'],
 '=':['00000','11111','00000','11111','00000','00000','00000'],'_':['00000','00000','00000','00000','00000','00000','11111'],
 '*':['00000','10101','01110','11111','01110','10101','00000'],'<':['00010','00100','01000','10000','01000','00100','00010'],
 '>':['01000','00100','00010','00001','00010','00100','01000'],'@':['01110','10001','10111','10101','10111','10000','01111']
}
chars=''.join(sorted(FONT.keys()))
font_atlas=Image.new('RGBA',(16*8, math.ceil(len(chars)/16)*8))
for i,ch in enumerate(chars):
    px,py=(i%16)*8,(i//16)*8
    for y,line in enumerate(FONT[ch]):
        for x,b in enumerate(line):
            if b=='1':font_atlas.putpixel((px+x+1,py+y),(232,224,204,255))
font_atlas.save(ROOT/'ui/font_5x7_in_8x8_cells.png')
(ROOT/'ui/font.json').write_text(json.dumps({'image':'font_5x7_in_8x8_cells.png','cell_width':8,'cell_height':8,'glyph_width':5,'glyph_height':7,'columns':16,'charset':chars,'character_to_index':{c:i for i,c in enumerate(chars)}, 'lowercase_fallback':'uppercase'},indent=2))

def draw_text(im,pos,msg,color=(231,221,204,255)):
    x0,y0=pos
    for idx,ch in enumerate(msg):
        glyph=FONT.get(ch.upper(),FONT['?']);x=x0+idx*6
        for y,s in enumerate(glyph):
            for ix,v in enumerate(s):
                if v=='1' and 0<=x+ix<im.width and 0<=y0+y<im.height:im.putpixel((x+ix,y0+y),color)

# Compact 16x16 pixel effects and alert icons.
def make_fx(name,frame=0):
    im=Image.new('RGBA',(16,16));d=ImageDraw.Draw(im)
    rust=(199,132,75,255);fire=(249,186,68,255);cream=(255,231,153,255);red=(178,43,57,255);red2=(232,74,68,255)
    if name=='muzzle':
        shapes=[[(1,7),(6,6),(9,2),(10,6),(15,7),(10,9),(8,13),(6,9)],[(1,7),(5,5),(10,5),(13,3),(13,7),(15,8),(9,10),(10,13),(5,9)],[(1,7),(7,6),(9,1),(10,6),(15,7),(10,8),(11,12),(7,9)],[(2,7),(7,6),(11,5),(14,7),(11,9),(7,9)]]
        d.polygon(shapes[frame],fill=rust);d.polygon([(3,7),(7,7),(9,5),(11,7),(9,8),(6,8)],fill=fire);d.line((3,7,8,7),fill=cream)
    if name=='blood':
        rng=random.Random(133+frame)
        for i in range(8+frame*2):
            r=rng.choice([1,1,1,2]);x=rng.randrange(2,15);y=rng.randrange(2,15)
            d.rectangle((x,y,x+r,y+r),fill=rng.choice([red,red2,(113,28,44,255)]))
        d.rectangle((6,7,9,9),fill=red2)
    if name=='alert_question':draw_text(im,(5,4),'?',(223,211,188,255))
    if name=='alert_suspicious':draw_text(im,(5,4),'!',(235,163,80,255))
    if name=='alert_detected':draw_text(im,(3,4),'!!',(239,70,61,255))
    if name in ('eye','eye_hidden'):
        d.polygon([(1,8),(5,4),(10,4),(14,8),(10,12),(5,12)],outline=(224,215,192,255))
        d.ellipse((6,6,9,9),fill=(223,215,202,255))
        if name=='eye_hidden':d.line((1,14,14,1),fill=(230,85,80,255),width=2)
    if name=='interaction':draw_text(im,(5,4),'E')
    if name=='silenced':d.rectangle((3,6,11,10),outline=(213,205,189,255));d.line((8,2,8,14),fill=(108,148,172,255))
    return im
fx_names=['muzzle','blood','alert_question','alert_suspicious','alert_detected','eye','eye_hidden','interaction','silenced']
for name in fx_names:
    num=4 if name in ('muzzle','blood') else 1
    sheet=Image.new('RGBA',(16*num,16))
    for i in range(num):sheet.alpha_composite(make_fx(name,i),(i*16,0))
    path=ROOT/f'fx/{name}_16x16_{num}f.png';sheet.save(path)
    manifest['fx'][name]={'file':str(path.relative_to(ROOT)),'frame_width':16,'frame_height':16,'frames':num}

# Pixel UI: 9-slice-like panel, HP/stamina marks, weapon/ammo and warning overlays.
hud=Image.new('RGBA',(256,48));d=ImageDraw.Draw(hud)
d.rectangle((0,0,255,47),fill=(17,20,28,255),outline=(193,178,149,255))
d.rectangle((2,2,253,45),outline=(72,80,92,255))
d.rectangle((6,7,45,39),fill=(38,39,47,255),outline=(135,121,113,255))
# Small portrait is genuine cropped illustration, not a vector symbol.
portrait=master.crop((23,58,76,108)).resize((35,29),Image.Resampling.NEAREST)
hud.paste(portrait,(8,9))
draw_text(hud,(54,8),'HP');draw_text(hud,(54,23),'ST')
for i in range(10):
    d.rectangle((74+i*12,8,83+i*12,17),fill=(172,56,64,255) if i<7 else (48,48,57,255),outline=(218,204,182,255))
    d.rectangle((74+i*12,24,83+i*12,33),fill=(200,185,153,255) if i<5 else (48,48,57,255),outline=(218,204,182,255))
draw_text(hud,(199,8),'12/36');draw_text(hud,(199,24),'MED 3')
hud.save(ROOT/'ui/hud_256x48_example.png')
panel=Image.new('RGBA',(48,48)); d=ImageDraw.Draw(panel);d.rectangle((0,0,47,47),fill=(17,20,28,255),outline=(190,177,151,255));d.rectangle((2,2,45,45),outline=(58,66,76,255));panel.save(ROOT/'ui/panel_48x48_nineslice.png')
warning=Image.new('RGBA',(64,16))
for i,name in enumerate(['alert_question','alert_suspicious','alert_detected','eye']): warning.alpha_composite(make_fx(name), (i*16,0))
warning.save(ROOT/'ui/awareness_strip_16x16x4.png')

# Belial cutout from high-resolution boss illustration, and discrete small sprite actions.
# Large concept is retained verbatim; gameplay sprite sizes are fixed 64x64 for each action.
concept=master.crop((1063,818,1323,996)); concept.save(ROOT/'boss/belial_full_concept_crop.png')
# Small poses from reference: idle, grasp, blast, hit
belial=Image.new('RGBA',(64*4,64*4))
boss_xs=[1390,1429,1466,1505]
boss_ys=[(823,867),(872,913),(921,956),(957,994)]
for row,(y0,y1) in enumerate(boss_ys):
    for col,cx in enumerate(boss_xs):
        f=matte_extract((cx-17,y0,cx+18,y1),(64,64),limit=(51,59),anchor='bottom',cutoff=28)
        belial.alpha_composite(f,(col*64,row*64))
belial.save(ROOT/'boss/belial_64x64_4x4.png')
manifest['boss']['belial']={'file':'boss/belial_64x64_4x4.png','frame_width':64,'frame_height':64,'columns':4,'rows':4,'row_names':['idle','grasp','blast','hit'],'concept':'boss/belial_full_concept_crop.png','note':'Boss sprites are source-derived visual prototypes; frame-to-frame character continuity requires artist cleanup.'}

# One scene palette/reference image per stage, plus a true 480x270 placement test.
SCENE_REGIONS={'valcendre':(10,357,379,592),'estate':(391,357,752,592),'abbey':(764,357,1137,592),'ascension':(1149,357,1527,592)}
for name,rect in SCENE_REGIONS.items():
    master.crop(rect).save(ROOT/f'reference/{name}_scene_reference.png')

# Native 480x270 tile view preview for one of the sets using 30x16 + remainder.
world=Image.new('RGBA',(480,270))
base=Image.open(ROOT/'environments/valcendre_tiles_16x16.png')
tile_map={n:base.crop(((i%8)*16,(i//8)*16,(i%8+1)*16,(i//8+1)*16)) for i,n in enumerate(TILE_NAMES)}
rng=random.Random(71)
for yy in range(17):
    for xx in range(30):
        key=rng.choice(['floor_01','floor_02','floor_03','floor_04','floor_05'])
        if 4<=xx<=9 and 3<=yy<=8:key='grass'
        if xx in (0,29) or yy in (0,16):key='wall_solid'
        if 19<=xx<=24 and 2<=yy<=8:key='cobble'
        world.alpha_composite(tile_map[key],(xx*16,yy*16))
for name,x,y in [('fountain',20*16,6*16),('tree',5*16,3*16),('bench',12*16,12*16),('barrels',25*16,12*16),('lamppost',16*16,5*16)]:
    files=list((ROOT/'props/valcendre').glob(name+'_*.png'))
    if files:world.alpha_composite(Image.open(files[0]),(x,y))
world.alpha_composite(Image.open(ROOT/'characters/tempest_24x32_4x6.png').crop((0,0,24,32)),(14*16,8*16))
world.alpha_composite(hud,(0,0))
world.convert('RGB').save(ROOT/'previews/native_480x270_gameplay_test.png')

# Contact sheet to inspect all character cuts and stage tiles without opening 20 files.
prev=Image.new('RGBA',(1050,568),(18,20,26,255));D=ImageDraw.Draw(prev)
for i,name in enumerate(CHARACTERS):
    x=10+(i%4)*260;y=10+(i//4)*250
    D.text((x,y),name.replace('_',' ').upper(),fill=(225,218,201))
    sprites=Image.open(ROOT/f'characters/{name}_24x32_4x6.png').resize((192,384),Image.Resampling.NEAREST)
    prev.alpha_composite(sprites,(x,y+18)) if y+18+384<=568 else prev.alpha_composite(sprites.crop((0,0,192,568-y-18)),(x,y+18))
# Better separate strip of assets and tile samples with no overlapping.
prev=Image.new('RGBA',(1120,780),(23,24,30,255));D=ImageDraw.Draw(prev)
for i,name in enumerate(CHARACTERS):
    x=10+i*158
    D.text((x,8),name.replace('_',' ')[:18],fill=(229,216,190))
    sprites=Image.open(ROOT/f'characters/{name}_24x32_4x6.png').resize((96,192),Image.Resampling.NEAREST)
    prev.alpha_composite(sprites,(x+9,32))
for idx,name in enumerate(THEMES):
    x=10+idx*276;y=248
    D.text((x,y),name.upper(),fill=(227,216,196))
    tile=Image.open(ROOT/f'environments/{name}_tiles_16x16.png').resize((256,192),Image.Resampling.NEAREST)
    prev.alpha_composite(tile,(x,y+20))
D.text((10,479),'PROPS  -  ORIGINAL CONCEPT ATLAS EXTRACTS',fill=(228,211,190))
xs=[10,286,562,838]
for i,scene in enumerate(THEMES):
    propfiles=list((ROOT/f'props/{scene}').glob('*.png'))
    for j,pth in enumerate(propfiles[:8]):
        pr=Image.open(pth)
        prev.alpha_composite(pr.resize((pr.width*2,pr.height*2),Image.Resampling.NEAREST),(xs[i]+(j%4)*60,514+(j//4)*96))
prev.save(ROOT/'previews/contact_sheet.png')

manifest['notes']=[
 'Source-derived sprite sheets and prop crops require manual pixel cleanup and animation alignment before final production release.',
 'Environment tiles, HUD font and FX are authored at exact native pixel resolution; each file has no antialiasing, blur, or fractional scaling.',
 'Human sheet layout is 4 columns by 6 animation rows (idle, walk, aim, fire, hit, down); 4 columns are frames, NOT cardinal directions.',
 'The AI-generated visual reference contains more detail than 16px tiles can hold; test sprite silhouettes, collision, and occlusion in your running game.',
 'Tiled TSX tile collision properties are coarse; level-specific collision shapes, line-of-sight, and navigation meshes remain to be authored.',
 'Belial concept art is not a finished multi-phase boss rig; boss sheets are action studies only.'
]
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
README='''# TEMPEST — Pixel Art Production Starter Set

A unified late-SNES / early-PS1 top-down pixel-art set for **TEMPEST**. Four escalating stage palettes: Valcendre (warm limestone), Estate (cool slate), Abbey (ruined graphite/blood), Ascension (basalt/crimson/ritual gold).

## Contents

- `reference/TEMPEST_master_art_direction.png`: generated unified art-direction atlas.
- `characters/`: **seven** named 96×192 RGBA PNG sheets. Each contains 24 frames (4 columns × 6 rows), at **24×32 pixels per frame**. Row order: **idle, walk, aim, fire, hit, down**. Four frames in each row are poses / animation variations, **not four cardinal directions**.
- `characters/portraits/`: character concept portraits.
- `environments/`: **four** 128×96 tilesets at 16×16 px, 48 tiles per stage. Each has JSON tile names/properties and a `.tsx` Tiled tileset. Basic solid and cover hints are included.
- `props/`: scene props and shared downed-body props; transparent RGBA PNGs at the dimensions in filenames.
- `fx/`: 16×16 PNG animation strips for muzzle, blood, alert/awareness, and action indicators.
- `ui/`: original 5×7 bitmap font packed into 8×8 cells, dialogue-panel-style UI texture, HUD demonstration and warning strip. `font.json` maps characters to glyph cells. Lowercase text should fall back to uppercase.
- `boss/`: concept-compatible Belial study and 64×64 pose atlas. Rows are idle, grasp, blast, hit.
- `previews/`: contact sheet and **native 480×270** placement/layout test.
- `manifest.json`: machine-readable paths, dimensions, animation rows, stage tiles and known limitations.

## Integration rules

1. Import PNGs without mipmapping or texture filtering: **NEAREST** only. Disable texture compression if it changes pixels or alpha edges.
2. Set game internal framebuffer to **480×270**; preserve aspect ratio; use integer nearest-neighbor scale when possible.
3. Tile size **16×16**. Human frame size **24×32**, origin **(12,30)**. Layer characters by foot Y, not by the entire 32px sprite rectangle.
4. Gameplay collision is separate from image alpha: update Tiled solids for actual authored maps. Props should have explicit cover/occluder metadata when placed.
5. Enemy silhouettes should remain clearly distinguishable during 480×270 play; never overlay particles on target centers for longer than a few frames.
6. Use palette progression in order; keep HUD neutral and reserve bright gold/crimson for high-stakes encounter readability.

## Production honesty / limitations

The **character and prop images are extracted from one generated concept atlas** and are **reference-quality/vertical-slice-ready** rather than a fully hand-checked final release. Matting, silhouette irregularities, pose registration, frame-to-frame consistency, missing directional animations, isolated 1px noise, and sprite/level relationships **need artist review**. Pixel-precise exported dimensions and transparent backdrops are provided, but this alone does not make every pose animation-production-ready.

The **environment tiles, font, HUD and FX are pixel-authored at native size**, and include usable import metadata. These are intentionally modest in detail, in order to read at native size rather than at concept-art zoom.

## Source & workflow

The art direction originated from a TEMPEST concept atlas generated for this project; `build_tempest_assets.py` (also packaged) performs deterministic crop/extraction and writes the native palette tiles, font and effects. The original PNG is kept so a human pixel artist can re-author exact sprites from the reference as needed.
'''
(ROOT/'README.md').write_text(README)
shutil.copyfile('/mnt/data/build_tempest_assets.py',ROOT/'build_tempest_assets.py')
archive=Path('/mnt/data/TEMPEST_pixel_art_v1.zip')
if archive.exists():archive.unlink()
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for f in ROOT.rglob('*'):
        if f.is_file():z.write(f,arcname=str(f.relative_to(ROOT.parent)))
print('WROTE',archive, 'BYTES',archive.stat().st_size)
print('FILES',len([f for f in ROOT.rglob('*') if f.is_file()]))
print('STATS:',{cat:len(list((ROOT/cat).rglob('*.png'))) for cat in ['characters','environments','props','fx','ui','boss']})
