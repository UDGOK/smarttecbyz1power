"""Generate the protected two-loop 3D exhibit and its preview. Python 3 + Pillow.
All sizes/positions are illustrative. No campus coordinates or equipment capacities.
"""
import base64,json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from cooling_mesh import shapes,box,cyl,glb
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/cooling';OUT.mkdir(parents=True,exist_ok=True)
PEACH='#efb99c';LAVENDER='#c6b6e9';ICE='#bce9eb';SKY='#85bfee'
def unit(x,z,length,width,height,name,stripe,fans):
    box([x,.12,z],[length+.15,.24,width+.15],'#5d7167','Equipment support',name)
    box([x,height/2+.2,z],[length,height,width],'#a7b8ae','Generic enclosure',name)
    for zz in [-width/2,width/2]:
        box([x,height*.6,z+zz],[length-.2,height*.55,.045],'#30483c','Coil face',name)
        box([x,height*.9,z+zz],[length-.2,.16,.055],stripe,'Circuit identifier',name)
        for i in range(8):box([x,height*.35+i*.11,z+zz+.035],[length-.3,.022,.023],'#708d7d','Coil fin',name)
    for i in range(fans):
        xx=x-length/2+(i+.5)*length/fans
        cyl(xx,height+.2,z,.49,.15,'#12291e','Condenser fan',name)
        cyl(xx,height+.35,z,.13,.06,'#a9c3b4','Fan hub',name)
def rack(x,z,name,cold_plate=False):
    box([x,1.1,z],[1.1,2.2,1.4],'#263c30','Generic rack',name)
    for y in [.45,.85,1.25,1.65]:
        box([x,y,z-.72],[.90,.26,.04],'#668672','Server indication',name)
        box([x+.35,y,z-.75],[.07,.07,.025],'#7be88a','Indicator',name)
    if cold_plate:
        box([x+.57,1,z],[.045,1.65,.8],PEACH,'Liquid interface indication',name)
    else:
        box([x,1.1,z+.78],[1.1,2.2,.17],ICE,'Active rear-door coil',name)
        for y in [.4,.8,1.2,1.6,2]:box([x,y,z+.88],[.9,.10,.025],'#517a82','Rear-door ventilation',name)
def pipe(x1,z1,x2,z2,color,name):
    if x1==x2:box([x1,.35,(z1+z2)/2],[.07,.07,abs(z2-z1)],color,'Schematic circuit',name)
    else:box([(x1+x2)/2,.35,z1],[abs(x2-x1),.07,.07],color,'Schematic circuit',name)
# Equipment arranged as an explanatory exhibit. These are NOT locations behind B.
unit(4,-5,4.4,1.4,1.9,'Dry cooler · Loop A',PEACH,3)
unit(10,-5,4.4,1.4,1.9,'Dry cooler · Loop A',PEACH,3)
unit(16,-5,2.8,1.5,1.5,'Trim chiller · Loop A',PEACH,2)
unit(4,5,3.5,1.6,1.8,'Scroll chiller · Loop B',ICE,2)
unit(10,5,3.5,1.6,1.8,'Scroll chiller · Loop B',ICE,2)
rack(-12,-5,'DLC rack category',True);rack(-12,5,'Rear-door rack category')
for x in [-5.5,-3.8]:
    box([x,.9,-5],[.9,1.8,1.1],'#8aa696','CDU enclosure','CDU category')
    box([x,.9,-5.56],[.68,1.3,.02],PEACH,'CDU circuit identifier','CDU category')
cyl(-4,.2,5,.62,2.4,'#a4bfbb','Buffer tank','Buffer tank category')
for zz,colors,name in [(-5,[PEACH,LAVENDER],'Warm facility circuit'),(5,[ICE,SKY],'Chilled facility circuit')]:
    for k,color in enumerate(colors):
        z=zz-1.7-k*.38
        pipe(-4 if zz<0 else -12,z,18,z,color,name)
        for x in ([-4,4,10,16] if zz<0 else [-12,-4,4,10]):pipe(x,z,x,zz,color,name)
        cyl(-.6+k*.65,.2,zz+.4,.22,.32,'#7b9987','Pump indication',name)
# Server circuit is isolated in design; this short secondary pair ends at the CDU.
for z,c in [(-4,PEACH),(-3.6,LAVENDER)]:pipe(-12,z,-5.5,z,c,'Server-side circuit indication')
box([17,.08,4.8],[2.8,.16,2.2],'#607a6a','Unlocated docking pad','Generator docking concept')
box([17,.85,4.8],[.8,1.55,.35],'#a0b5a7','Tap box only; no generator','Generator docking concept')
meta={'status':'Schematic equipment exhibit; not site placement','locationApproved':False,'capacitiesPublished':False,'units':'meters; illustrative envelope sizes only','groups':['Loop A: two dry coolers and one trim chiller','Loop B: two scroll chillers and buffer tank','CDU and pump categories; redundancy not established','Generator docking pad and tap box; not a generator'],'source':'Owner-supplied architecture brief, 10 September 2026','siting':'PE must establish exact coordinates and clearances before campus placement'}
(OUT/'two-loop-scene.json').write_text(json.dumps({'metadata':meta,'geometry':shapes},separators=(',',':')))
glb(shapes,OUT/'two-loop-cooling.glb')
# Preview uses the same geometry, with an orthographic software projection.
im=Image.new('RGB',(1800,1100),'#12362b');d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def text(x,y,t,size,color='#eef1ef'):d.text((x,y),t,font=ImageFont.truetype(font,size),fill=color)
text(65,42,'SMARTTEC / TWO-LOOP COOLING STUDY',21,'#7be88a')
text(65,90,'Warm loop. Chilled loop. Dry heat rejection.',43)
text(65,156,'Equipment categories only. Sizes, spacing and positions are illustrative.',22,'#c3d6ca')
yaw=-.18;pitch=.78;scale=43
def project(v):
    x,y,z=v;x-=2
    xx=x*math.cos(yaw)-z*math.sin(yaw);zz=x*math.sin(yaw)+z*math.cos(yaw)
    return 900+xx*scale,590-(y*math.cos(pitch)-zz*math.sin(pitch))*scale,zz*math.cos(pitch)+y*math.sin(pitch)
faces=[]
for shape in shapes:
    vs=[project(v) for v in shape['v']]
    for f in shape['f']:
        ps=[vs[i] for i in f];faces.append((sum(p[2] for p in ps)/len(ps),[(p[0],p[1]) for p in ps],shape['c']))
for _,points,c in sorted(faces):d.polygon(points,fill=c,outline='#233e30')
for v,label in [([-12,3.5,-5],'DLC RACK / CDU'),([6,3.6,-5],'DRY COOLERS'),([16,3.3,-5],'TRIM'),([-12,3.5,5],'REAR DOOR'),([-4,3.5,5],'BUFFER'),([7,3.5,5],'SCROLL CHILLERS'),([17,3,5],'DOCKING PAD')]:
    x,y,_=project(v);tw=d.textlength(label,font=ImageFont.truetype(font,16));d.rounded_rectangle((x-tw/2-10,y-30,x+tw/2+10,y),radius=6,fill='#09271e');text(x-tw/2,y-25,label,16,'#ccedda')
text(65,920,'DESIGN INTENT / NOT LOCATED ON THE SURVEY',24,'#7be88a')
text(65,966,'N+1 is a design target. Counts shown do not establish capacity or fault tolerance.',22)
text(65,1005,'No evaporative heat rejection planned. Filling and maintenance still require fluid.',22,'#c3d6ca')
im.save(OUT/'two-loop-preview.png');im.save(OUT/'two-loop-preview.webp',quality=88)
assets={'thermal-model':{'mime':'model/gltf-binary','data':base64.b64encode((OUT/'two-loop-cooling.glb').read_bytes()).decode()},'thermal-preview':{'mime':'image/webp','data':base64.b64encode((OUT/'two-loop-preview.webp').read_bytes()).decode()}}
server=ROOT/'src/smarttec-architecture/server/thermal-assets.mjs'
server.write_text('// GENERATED SERVER ONLY. Do not import into a client module.\nconst assets='+json.dumps(assets,separators=(',',':'))+';\nexport function thermalAsset(action,method){if(method!=="GET"||!Object.hasOwn(assets,action))return null;const a=assets[action];return {bytes:Buffer.from(a.data,"base64"),mime:a.mime};}\n')
print('Generated schematic GLB, protected preview, geometry source and server assets.')
