from pathlib import Path
from io import BytesIO
import re, json, xml.etree.ElementTree as ET
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'output/pdf/SmartTec-Colocation-Customer-Packet-2026-09.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,path in [('Space','public/investor-assets/space-grotesk-0.ttf'),('Medium','public/investor-assets/space-grotesk-1.ttf'),('Bold','public/investor-assets/space-grotesk-3.ttf'),('Mono','public/assets/fonts/GoogleSansCode-Regular.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(ROOT/path)))
pdfmetrics.registerFontFamily('Space',normal='Space',bold='Bold')
W,H=1152,648
FOREST='#633F50'; SIGNAL='#EDB6C8'; PAPER='#FFF8FA'; INK='#271F25'; DARK='#241F27'; MUTED='#D9C8D0'
PAGE=0; LIGHT=False; BOXES=[]; RULES=[]
c=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
c.setTitle('SmartTec | Customer-Owned Colocation | Proposed Service Packet')
c.setAuthor('SmartTec')
def color(value):return HexColor(value)
def rect(x,y,w,h,fill,alpha=1):
 c.setFillColor(color(fill),alpha=alpha);c.rect(x,H-y-h,w,h,fill=1,stroke=0)
def line(x,y,x2,y2,fill=None,width=1):
 c.setStrokeColor(color(fill or ('#CFB8C4' if LIGHT else '#715C69')));c.setLineWidth(width);c.line(x,H-y,x2,H-y2)
 if y==y2:RULES.append({'page':PAGE,'x':[x,x2],'y':y})
def text(s,x,y,size=20,font='Space',fill=None,w=1024,leading=None):
 fill=fill or (FOREST if LIGHT else PAPER)
 style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.25,textColor=color(fill),spaceAfter=0,allowWidows=0,allowOrphans=0)
 s=re.sub(r'&(?!#\d+;|#x[0-9a-fA-F]+;|[A-Za-z][A-Za-z0-9]+;)', '&amp;', s)
 p=Paragraph(s.replace('\n','<br/>'),style);pw,ph=p.wrap(w,H)
 if y+ph>H-10 or x+w>W+1 or x<0:raise ValueError(f'Page {PAGE} overflow: {s[:65]} at {x},{y},{w},{ph}')
 p.drawOn(c,x,H-y-ph);BOXES.append({'page':PAGE,'text':re.sub('<[^>]+>','',s),'box':[x,y,w,ph]})
 return ph
def img(path,x,y,w,h,focus=.5):
 # Cropping occurs only in the PDF viewport; the original artwork stays unchanged.
 im=Image.open(ROOT/path);iw,ih=im.size;ratio=max(w/iw,h/ih);dw,dh=iw*ratio,ih*ratio
 c.saveState();p=c.beginPath();p.rect(x,H-y-h,w,h);c.clipPath(p,stroke=0);encoded=BytesIO();im=im.convert('RGB');im.thumbnail((2200,1600));im.save(encoded,format='JPEG',quality=85,optimize=True);encoded.seek(0);c.drawImage(ImageReader(encoded),x+(w-dw)*focus,H-y-h+(h-dh)/2,dw,dh,mask='auto');c.restoreState()

def gradient(light=False):
 shades=['#FFF9FB','#F3E9EE','#E9D3DF'] if light else ['#211C25','#392936','#684756']
 c.linearGradient(0,H,W,0,[color(v) for v in shades],[0,.55,1],extend=True)

def scrim(left=.9,right=.5):
 # Native PDF transparency keeps text legible over the original generated image.
 c.saveState()
 rect(0,0,W,H,'#251C26',alpha=(left+right)/2)
 c.restoreState()
def logo(x=64,y=34,w=173,light=False):
 # Draw the supplied SVG paths without redesigning or rasterizing the logo.
 root=ET.parse(ROOT/('public/assets/brand/smarttec-lockup-'+('forest-green' if light else 'offwhite-green')+'.svg')).getroot()
 c.saveState();c.translate(x,H-y);c.scale(w/1231,-w/1231)
 for el in root.iter('{http://www.w3.org/2000/svg}path'):
  tokens=re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?',el.attrib['d']);p=c.beginPath();i=0
  while i<len(tokens):
   op=tokens[i];i+=1
   if op=='Z':p.close();continue
   count=6 if op=='C' else 2;v=list(map(float,tokens[i:i+count]));i+=count
   {'M':p.moveTo,'L':p.lineTo,'C':p.curveTo}[op](*v)
  c.setFillColor(color(el.attrib['fill']));c.drawPath(p,fill=1,stroke=0,fillMode=0)
 c.restoreState()
def page(title,section,light=False):
 global PAGE,LIGHT
 if PAGE:c.showPage()
 PAGE+=1;LIGHT=light;gradient(light);logo(light=light)
 text(section.upper(),660,44,11,'Mono',w=428)
 text(title,64,112,40,'Medium',w=1024,leading=46)
 line(64,178,118,178,fill=FOREST if light else SIGNAL,width=3)
 line(64,607,1088,607)
 text('SMARTTEC / COLOCATION / BUDGETARY PROPOSAL / 14 SEP 2026',64,622,9,'Mono',w=900)
 text(f'{PAGE:02}',1048,619,12,'Mono',w=40)
 c.bookmarkPage(f'p{PAGE}');c.addOutlineEntry(title,f'p{PAGE}')
def foot(s):text(s,64,568,10.5,w=1024,leading=14,fill=FOREST if LIGHT else MUTED)
def blocks(items,y=218):
 for i,(a,b) in enumerate(items):
  x=64+i*528;text(a,x,y,27,'Medium',w=480);text(b,x,y+53,21,w=480,leading=29)
def table(headers,rows,widths,y=214,rh=74,size=17):
 x=64
 for h,w in zip(headers,widths):text(h,x+10,y,11,'Mono',w=w-20);x+=w
 for i,row in enumerate(rows):
  yy=y+42+i*rh;x=64
  line(64,yy-8,1088,yy-8)
  for val,w in zip(row,widths):text(str(val),x+10,yy,size,w=w-20,leading=size*1.25);x+=w
def link(label,url,x,y,w=490):
 text(label,x,y,16,'Medium',w=w)
 c.linkURL(url,(x,H-y-25,x+w,H-y),relative=0)
R='public/assets/campus/2026-09/renders/'
page('Your infrastructure. A place to grow.','Customer-owned colocation')
img(R+'08-campus-dusk-1600.webp',0,0,W,H);scrim(.82,.68);logo(64,45,240)
text('Your infrastructure.<br/>A place to grow.',64,230,58,'Medium',w=950,leading=65)
text('Customer-owned GPU colocation<br/>Mead, Oklahoma',67,402,26,w=710)
text('A tailored deployment. Transparent power billing.<br/>A technical scope built around your equipment.',67,489,21,w=850)
text('PROPOSED SERVICE / SEPTEMBER 2026',67,582,11,'Mono',w=700)
text('ARCHITECTURAL CONCEPT / PROPOSED FIT-OUT',705,622,8,'Mono',w=405)
page('Bring your hardware. Define your deployment.','The offering',True)
blocks([('Customer-owned colocation','You own the servers, GPUs and software. SmartTec proposes cabinet space, a contracted power allocation, an agreed cooling interface and coordinated connectivity.'),('Designed around your workload','For inference platforms, GPU service operators and dedicated enterprise infrastructure. Hardware, density, access and support requirements shape the final service order.')])
text('Development-stage campus',64,460,26,'Medium',w=1000)
text('Availability follows engineering review, utility and carrier confirmation, fit-out and commissioning. This packet is a planning proposal, not a claim of an operating colocation service.',64,505,18,w=1024)
page('A campus with distinct roles.','Mead / Oklahoma')
img(R+'01-campus-aerial-1600.webp',570,207,518,335)
text('A + C / Compute',64,216,26,'Medium',w=460)
text('Planned customer equipment areas, subject to space, structural, electrical and thermal allocation.',64,258,20,w=460)
text('B / Utility coordination',64,343,26,'Medium',w=460)
text('Campus controls and utility concept; owner-reported fiber handoff. Proposed cooling plant behind Building B.',64,387,20,w=460)
foot('8460 US 70, Mead, Oklahoma 73449. Illustration is a proposed campus concept. Solar and BESS are later phases; initial service is planned on grid power.')
page('Choose the ownership model that fits.','Service boundaries',True)
table(['OFFERING','EQUIPMENT OWNER','CUSTOMER RECEIVES'],[
['Colocation','Customer','Space, committed IT kW and agreed facility services. The focus of this packet.'],
['Dedicated GPU hosting','SmartTec','Single-tenant use of a specified SmartTec-owned server; separately quoted.'],
['Shared inference','SmartTec','Access to shared compute or an agreed inference service; separately scoped.']],[255,230,539],rh=93,size=20)
foot('GPU-hour rental pricing is not a colocation tariff. Customer colocation consumes the same finite campus resources as SmartTec-owned equipment; capacity is allocated once.')
page('A proposed rate card with visible boundaries.','SmartTec / indicative USD',True)
table(['PLANNING PACKAGE','MONTHLY FACILITY FEE','POWER / OTHER CHARGES'],[
['Conventional cabinet / 5 IT kW','$850','Metered electricity and demand extra; network and setup quoted.'],
['Conventional cabinet / 10 IT kW','$1,500','Metered electricity and demand extra; network and setup quoted.'],
['Liquid-cooled allocation / 15+ IT kW','$150 per committed IT kW\n$2,250 minimum','Electricity extra. OEM cabinet, CDU, manifolds and custom integration separately scoped.']],[340,260,424],rh=88,size=18)
text('Facility fee covers reserved space, agreed base power distribution, facility cooling service and access arrangements within the signed scope. Electrical/cooling upgrades and one-time fit-out are quoted separately.',64,518,16,w=1024)
foot('Proposed 12-month term from service acceptance. Engineering acceptance and written quote required; no capacity reservation or guaranteed tariff is created by this packet. Taxes additional.')
page('See how a monthly budget is assembled.','Illustration / 15 IT kW')
table(['LINE ITEM','ILLUSTRATIVE BASIS','MONTHLY USD'],[
['Reserved facility service','15 committed IT kW x $150','$2,250.00'],
['Energy, including cooling overhead','15 kW x 730 h x 1.30 x $0.095/kWh','$1,352.33'],
['Allocated utility demand','19.5 billed kW x $12/kW','$234.00'],
['Illustrative recurring subtotal','Before separately quoted items','$3,836.33']],[320,475,229],rh=62,size=19)
text('Not a complete deployment price',64,518,20,'Medium',w=440)
text('Network, taxes, setup, CDU/integration and optional support are additional.',520,516,17,w=568)
foot('Assumes sustained 15 kW load. PUE 1.30, energy-only $0.095/kWh and allocated peak 19.5 kW are planning assumptions, not measured performance or a verified utility tariff. Actual month and metering govern.')
page('Power billing that can be checked.','Commercial mechanics',True)
blocks([('Reserved capacity vs. consumption','The facility fee follows committed IT kW, even when the rack is idle. Electricity follows metered consumption plus the cooling and shared-load allocation defined in the service order.'),('Demand is a separate measurement','Utility demand charges depend on billing peaks, tariff rules and allocation. The example uses an illustrative 19.5 kW allocation; it is not a confirmed campus peak or an automatic PUE conversion.')])
text('Before you sign',64,473,26,'Medium',w=1024)
text('Your quote identifies the meter boundary, energy rate components, demand allocation, cooling overhead method, adjustments and taxes. Network port, bandwidth commitment and cross-connect charges are listed separately.',64,515,18,w=1024)
foot('No solar subsidy, battery savings or unapproved grant is assumed in these proposed prices. If demand is already included in an energy rate, it must not be charged again.')
page('Published regional offers: what is included.','Market snapshots / 14 Sep 2026',True)
table(['PROVIDER / LOCATION','ADVERTISED MONTHLY','PACKAGE / KEY DIFFERENCES'],[
['BluePod / Oklahoma [1]','$6,000 / 40 kW\n$150 per kW','Air cooling; power and cooling included. 6-month term; $800 setup; 3% annual escalator. Liquid cooling listed as coming soon.'],
['MinRTT / Dallas DA11 [2]','$1,999 / 52U\n5 kVA usable','A+B 240V; 10 Gbps commit on 100G. Minimum 12 months; 3.25% annual escalation; external cross-connects extra.'],
['SmartTec / proposed','$2,250 facility only\n15 IT kW allocation','$3,836.33 illustrative subtotal with power (page 6). Network, tax, setup and liquid integration extra. Availability subject to commissioning.']],[255,249,520],rh=94,size=17)
foot('These are different scopes, not equivalent bids. BluePod $150/kW includes power; SmartTec $150/kW is facility-only. kVA is not kW without power factor. Sources [1]-[2] are clickable on page 14.')
page('Small-rack pricing is a different product.','Further market context',True)
table(['PROVIDER / LOCATION','ADVERTISED MONTHLY','PACKAGE / LIMITATIONS'],[
['Tier.Net / Dallas [3]','$599 / 47U','20A at 120V circuit; 100TB on 1Gbps; 3-year contract; $199 setup. Circuit rating is not stated usable continuous IT load.'],
['InterServer / Dallas [4]','$940 / quarter rack','1.5 kW; 5Gbps bandwidth on 10Gbps port. Example monthly quote; term and setup not specified on the cited page.']],[255,249,520],rh=109,size=19)
text('Compare a complete service, not just a rack price.',64,480,27,'Medium',w=1024)
text('Request the same usable kW, cooling method, bandwidth, redundancy, support and term in each bid. No verified like-for-like liquid-cooled B300 tariff was found in this review.',64,511,17,w=1024)
foot('Published offers can change and require provider confirmation. This is a selected regional sample, not a market average, price ranking or savings guarantee. Sources [3]-[4] on page 14.')
page('Liquid cooling needs an agreed interface.','Technical design / proposed')
img(R+'10-rack-liquid-cooling-1600.webp',620,212,468,326)
text('Two loops. One controlled handoff.',64,218,26,'Medium',w=500)
text('Heat rejection / facility-water loop\nCDU heat exchanger\nIsolated technology coolant loop\nRack manifolds / OEM cold plates',64,275,22,w=500,leading=40)
text('The service order assigns the CDU, coolant, hoses, leak detection, controls and maintenance. Residual air heat remains part of the room design.',64,458,18,w=500)
foot('Concept render, not an approved pipe schematic. Confirm coolant chemistry, temperatures, pressure, flow, couplings and dew-point control for each SKU. Technical sources [5]-[6].')
page('Power, connectivity and protection.','Requirements before acceptance',True)
blocks([('Power and thermal acceptance','Validate exact server SKU, operating voltage, peak load, inlets, PDUs and redundancy mode. A 208V supply is not universal proof of rack compatibility. Available IT capacity follows engineering review.'),('Carrier and support scope','The owner-reported carrier handoff is in Building B. Your order defines upload/download commitment, ports, IPs, egress and route requirements. Remote hands and access coverage are explicitly quoted.')])
text('Service assurance is defined in the order.',64,478,25,'Medium',w=1024)
text('Availability metrics, monitoring, response windows, planned maintenance, service credits and exclusions follow the accepted design. Certifications, redundant carriers and 24/7 onsite staffing are not represented as established.',64,520,17,w=1024)
foot('Customer remains responsible for workload security, backups, software licensing and hardware warranties unless a separate managed-service scope expressly assigns them.')
page('From requirements to a tested handover.','Deployment process',True)
table(['STAGE','DELIVERABLE','CUSTOMER GATE'],[
['01 / Qualify','Hardware BOM, rack dimensions/weight, peak kW, cooling data, network and support requirements.','Agree workload and target timeline.'],
['02 / Engineer + quote','Capacity allocation, one-time fit-out, recurring charges, carrier scope and responsibility matrix.','Approve scope and service order.'],
['03 / Build + commission','Install approved distribution and cooling; validate network and agreed fault/acceptance tests.','Review readiness evidence.'],
['04 / Accept + operate','Delivery appointment, inventory, baseline measurements, escalation contacts and handover.','Accept service; billing term starts.']],[205,529,290],rh=76,size=18)
foot('Do not ship hardware before written delivery approval. Commencement dates depend on engineering, procurement, utilities, carrier delivery and commissioning; this packet promises no fixed ready date.')
page('Let us shape your deployment.','Start a technical conversation')
img(R+'14-datahall-interior-1600.webp',615,207,473,330)
text('Send your rack and power profile.',64,218,30,'Medium',w=510)
text('Hardware list / rack size and weight\nContinuous and peak IT kW\nLiquid and air cooling requirements\nBandwidth and redundancy needs\nTarget start, term and growth plan',64,278,21,w=500,leading=35)
text('Yasir Jahangir / CTO',64,465,24,'Medium',w=500)
link('yasir@smarttec.dev','mailto:yasir@smarttec.dev',64,503)
link('918-520-3823','tel:+19185203823',64,534)
link('Explore the campus concept','https://www.smarttec.dev/site/campus',640,538,w=420)
foot('Illustrated interior is a proposed fit-out. Location: 8460 US 70, Mead, Oklahoma 73449. This is a budgetary discussion packet; a signed service order controls pricing, scope and availability.')
page('Sources and proposal basis.','Reference / clickable links',True)
refs=[
('[1] BluePod - Oklahoma pricing','https://www.bluepod.ai/pricing'),
('[2] MinRTT - Dallas DA11 colocation configurator','https://control.minrtt.com/?page=dallas-colo'),
('[3] Tier.Net - Colocation plans','https://www.tier.net/colocation'),
('[4] InterServer - Dallas colocation example','https://www.interserver.net/colo/dallas-colocation.html'),
('[5] Supermicro - Liquid cooling architecture','https://www.supermicro.com/en/solutions/liquid-cooling'),
('[6] Supermicro - B300 liquid-cooled system specifications','https://www.supermicro.com/en/products/system/gpu/4u/sys-422gs-nb3rt-lcc')]
for i,(label,url) in enumerate(refs):link(label,url,64,215+i*44,w=1024)
text('Research checked 14 September 2026. Prices are provider-published snapshots, not negotiated quotes. SmartTec packages are newly proposed budgetary rates; utility assumptions come from the current planning model and are not a verified tariff.',64,496,17,w=1024)
foot('Campus details and illustrations are management-provided planning information. Customer pricing excludes owned-GPU acquisition and rental economics. No customer capacity, uptime certification or financial return is implied.')
c.save()
(ROOT/'tmp/pdfs/colocation-text-boxes.json').write_text(json.dumps(BOXES),encoding='utf-8')
print(OUT)
print('Pages:',PAGE)
