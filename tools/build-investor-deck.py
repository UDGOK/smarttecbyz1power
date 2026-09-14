"""Rebuild the branded investor PDF and its authenticated server download.

Run from the repository root using Python with reportlab and Pillow installed.
The JavaScript export supplies the canonical reviewed v6.1 financial snapshot.
No legacy scenario engine or superseded cost comparison is used.
"""
from pathlib import Path
import base64, hashlib, json, re, subprocess, xml.etree.ElementTree as ET
from io import BytesIO
from datetime import date
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
subprocess.run(['node','tools/export-investor-deck-data.mjs'],cwd=ROOT,check=True)
D=json.loads((ROOT/'tmp/pdfs/deck-financials.json').read_text(encoding='utf-8'))
M=D['model']; A=M['assumptions']
S={item['id']:item for item in M['scenarios']}
PHASE1_IDS=['downside','base','market','contracted','marketplace-heavy','delayed']
if set(S)!=set(PHASE1_IDS+['maximum-base']):
 raise ValueError('The deck requires the six reviewed Phase-1 cases and maximum-base.')
if A.get('primaryReturnMetric')!='headlineIrr':
 raise ValueError('The reviewed workbook defines headline project IRR as the primary return metric.')
PHASE1=[S[item] for item in PHASE1_IDS]
B=S['base']; CONTRACTED=S['contracted']; MAXIMUM=S['maximum-base']
B2=next(row for row in B['annual'] if row['year']==2)
if not all(row['operatingCashUsd']>0 for row in B['annual'] if row['year']<=B['horizonYears']):
 raise ValueError('The deck states that every Base forecast year has positive operating cash.')
if any(row['returns']['headlineIrr']>=A['hurdleRate'] for row in PHASE1):
 raise ValueError('The deck states that none of the six Phase-1 cases clears the hurdle.')
if not (
 CONTRACTED['commercial']['contractedGpus']==40
 and abs(CONTRACTED['commercial']['contractRateUsd']-6.50)<1e-9
 and abs(CONTRACTED['commercial']['contractPaidShare']-.95)<1e-9
 and CONTRACTED['commercial']['contractTermMonths']==36
):
 raise ValueError('The Contracted case no longer matches the reviewed workbook terms.')
CREDENTIALS=json.loads((ROOT/'src/data/yasir-credentials.json').read_text(encoding='utf-8'))
EDITION_DATE=M.get('reviewedAt',M['source'].get('reviewedAt','2026-09-13'))
OUT=ROOT/'output/pdf/SmartTec-Investor-Presentation-2026-09.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,path in [('Space','public/investor-assets/space-grotesk-0.ttf'),('Medium','public/investor-assets/space-grotesk-1.ttf'),('Bold','public/investor-assets/space-grotesk-3.ttf'),('Mono','public/assets/fonts/GoogleSansCode-Regular.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(ROOT/path)))
pdfmetrics.registerFontFamily('Space',normal='Space',bold='Bold',italic='Space',boldItalic='Bold')
W,H=1152,648
FOREST='#1C4839'; SIGNAL='#7BE88A'; PAPER='#EEF1EF'; INK='#141414'; DARK='#10161F'; MUTED='#BCD0C5'; RED='#FFB4A9'
pdf_buffer=BytesIO()
c=canvas.Canvas(pdf_buffer,pagesize=(W,H),pageCompression=1,invariant=1)
c.setTitle('SmartTec by Z1Power | Investor Presentation | September 2026')
c.setAuthor('SmartTec.dev LLC')
c.setSubject('Grid-first B300 compute, shared inference and dedicated servers; conditional project economics from the reviewed v'+str(M['version'])+' model')
c.setViewerPreference('DisplayDocTitle','true')
PAGE=0; LIGHT=False; TITLES=[]; BOXES=[]; RULES=[]
usd=lambda n:'-'+usd(-n) if n<0 else '${:,.0f}'.format(n)
million=lambda n:('-' if n<0 else '')+'${:.2f}m'.format(abs(n)/1e6)
def color(value):return HexColor(value)
def rect(x,y,w,h,fill,alpha=1):
 c.setFillColor(color(fill),alpha=alpha);c.rect(x,H-y-h,w,h,fill=1,stroke=0)
def line(x,y,x2,y2,fill=None,width=1):
 c.setStrokeColor(color(fill or ('#B5C8BC' if LIGHT else '#446454')));c.setLineWidth(width);c.line(x,H-y,x2,H-y2)
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
 shades=['#F5F7F3','#E9F0EA','#CDDED4'] if light else ['#061711','#123B2E','#25654E']
 c.linearGradient(0,H,W,0,[color(v) for v in shades],[0,.55,1],extend=True)

def scrim(left=.9,right=.5):
 # Native PDF transparency keeps text legible over the original generated image.
 c.saveState()
 rect(0,0,W,H,'#071D16',alpha=(left+right)/2)
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
def page(title,section,light=False,bg=None):
 global PAGE,LIGHT
 if PAGE:c.showPage()
 PAGE+=1;LIGHT=light;TITLES.append(title)
 gradient(light)
 backgrounds={2:('fiber-gradient',.92,.76),6:('campus-dusk',.97,.85),7:('power-supply-concept',.97,.34),10:('fiber-gradient',.96,.84),19:('fiber-gradient',.95,.84),22:('campus-dusk',.97,.86),26:('campus-dusk',.93,.8)}
 if PAGE in backgrounds:
  key,left,right=backgrounds[PAGE];img('public/assets/investor/'+key+'.webp',0,0,W,H);scrim(left,right)
 logo(light=light)
 text(section.upper(),700,44,11,'Mono',w=385)
 text(title,64,113,43,'Medium',w=1024,leading=47)
 line(64,183,112,183,fill=FOREST if light else SIGNAL,width=3)
 line(64,606,1088,606)
 text('SMARTTEC  /  INVESTOR DISCUSSION  /  '+date.fromisoformat(EDITION_DATE).strftime('%d %B %Y').upper(),64,622,9,'Mono',w=840)
 text(f'{PAGE:02}',1045,617,15,'Mono',w=43)
 c.bookmarkPage(f'page-{PAGE}');c.addOutlineEntry(title,f'page-{PAGE}',0)
def foot(s):text(s,64,571,11,w=1024,fill='#456252' if LIGHT else MUTED,leading=14)
def two_blocks(items,y=220,space=176):
 for i,(heading,body) in enumerate(items):
  x=64+i*528;text(heading,x,y,26,'Medium',w=470);text(body,x,y+57,20,w=470)
def table(headers,rows,widths,y=225,rowh=52,size=18,x0=64):
 x=x0
 for h,w in zip(headers,widths):text(h,x+10,y,13,'Mono',w=w-20);x+=w
 line(x0,y+40,x0+sum(widths),y+40)
 for i,row in enumerate(rows):
  yy=y+52+i*rowh;x=x0
  if i%2==0:
   c.saveState();rect(x0,yy-8,sum(widths),rowh-2,'#FFFFFF',alpha=.28 if LIGHT else .06);c.restoreState()
  for j,(v,w) in enumerate(zip(row,widths)):
   text(str(v),x+10,yy,size,'Medium' if j==0 else 'Space',w=w-20);x+=w
  line(x0,yy+rowh-5,x0+sum(widths),yy+rowh-5,width=.5)


pct=lambda n: 'Not resolved' if n is None else f'{n*100:.2f}%'
num=lambda n: f'{n:,.0f}'
fleet=B['capacity']; cap=B['capital']; tech=B['technical']; comm=B['commercial']
FUND=A.get('initialFounderCapitalUsd',6000000)
def metric(value,label,x,y=221,w=475,light=False):
 text(value,x,y,57,'Medium',fill=FOREST if LIGHT else SIGNAL,w=w)
 text(label,x,y+82,21,w=w)
def callout(heading,body,y=440):
 line(64,y-20,1088,y-20)
 text(heading,64,y,25,'Medium',w=470)
 text(body,592,y,20,w=496,leading=25)
def project_note():
 foot('Conditional and unsigned. Includes modeled resale and reserve release. Unlevered project return before any investor ownership, preference or distribution waterfall; not a promised return.')

# 01 / cinematic opening, original supplied brand and existing Runway artwork
page('Compute with a place to grow','Investor presentation')
img('public/assets/investor/b300-studio.webp',0,0,W,H);scrim(.78,.32)
BOXES[:]=[b for b in BOXES if b['page']!=1]
RULES[:]=[r for r in RULES if r['page']!=1]
logo(64,55,275)
text('Compute with<br/>a place to grow',64,218,61,'Medium',w=680,leading=66)
text('SMARTTEC  /  MEAD, OKLAHOMA',67,399,16,'Mono',w=600)
text('Shared AI inference. Dedicated GPU servers.<br/>A grid-first deployment, built around customer commitments.',67,449,23,w=745,leading=30)
text('INVESTOR PRESENTATION  /  MODEL '+str(M['version']),67,566,12,'Mono',w=700)
text('RUNWAY PRODUCT CONCEPT / NOT A PHOTO OF THE SELECTED SUPERMICRO SYSTEM',574,620,8,'Mono',w=545)

# 02 / thesis with no promised return
page('A focused first deployment','Investment thesis')
metric(million(FUND),'initial founder capital, owner-reported',64)
text('Management intends to fund the overage. Contribution timing, form and transfers require documentation.',64,355,22,w=470)
text('A tangible starting point',592,222,28,'Medium',w=496)
text('Long-term site access in Oklahoma<br/>Eight proposed Supermicro systems<br/>Two ways to sell owned GPU capacity<br/>Growth linked to paying customers',592,278,23,w=496,leading=39)
callout('The economic discipline','The unsigned Base case is below the hurdle. Contract terms and delivered cost determine whether the investment is attractive.',y=472)
foot('Founder capital is reported, not independently verified. The current proposal is a development-stage investment discussion.')

# 03 / two own-hosted offerings
page('Two offerings. One owned compute fleet.','Proposed service portfolio',True)
two_blocks([
 ('Shared AI inference','A multi-tenant service using SmartTec-owned GPUs. Planned customer access is through managed inference endpoints, with workload isolation, metering and support.'),
 ('Dedicated GPU servers','Single-tenant access to agreed SmartTec-owned server capacity. Reserved compute for inference, model development, rendering and other validated GPU workloads.')
 ],y=216)
callout('One capacity and revenue budget','The same GPUs cannot earn twice at the same time. The financial model uses GPU-hours; it assumes no additional token-sales or platform-margin uplift.',y=458)
foot('Proposed offerings, not a claim of an operating service. The shared/dedicated allocation, product pricing, security controls and customer SLAs remain to be validated.')

# 04 / what belongs in the model
page('Clear ownership. Clear revenue boundaries.','Commercial model',True)
table(['SERVICE','WHO OWNS THE HARDWARE','TREATMENT IN THIS MODEL'],[
 ['Shared AI inference','SmartTec','Part of the same owned fleet; no separate per-token revenue forecast.'],
 ['Dedicated GPU servers','SmartTec','Capacity monetized as GPU-hours; contract cases reserve a defined paid allocation.'],
 ['Colocation / hosting','Customer','Separate potential business. Customer-owned hardware and hosting revenue are excluded.'],
 ['Solar and BESS','Separate project scope','Future hybrid power investment; no savings or revenue in the grid-only Base.']
 ],[235,277,512],y=208,rowh=78,size=20)
foot('Dedicated server configurations and service commitments must match whole-node scheduling and recovery capabilities. Service mix is not an additional revenue multiplier.')

# 05 / commercial evidence
page('A pipeline to convert into paid capacity','Commercial position')
text('Active discussions',64,219,40,'Medium',fill=SIGNAL,w=510)
text('Management reports marketplace discussions and a separate potential offtake channel. Interest includes a possible 180-B300 requirement.',64,289,23,w=475)
text('Current commitment level',592,221,28,'Medium',w=496)
text('0 signed customer contracts<br/>0 paid pilots established<br/>No agreed minimum customer receipts',592,291,25,w=496,leading=44)
callout('Contract the customer payment','The proposed buyer pays for compliant reserved capacity under enforceable terms. Downstream token or resale demand is not a substitute for that obligation.',y=472)
foot('Owner-reported discussions, not verified orders. Marketplace access does not guarantee utilization. No expansion decision is supported solely by the 180-GPU inquiry.')

# 06 / site rights rather than ownership
page('A long-term operating location','Site and founder position')
metric('50 years','site commitment; signed status owner-reported',64)
text('BC LLC owns the property and has an ownership connection to the CEO. SmartTec holds site rights; land value is not included as SmartTec cash equity.',64,367,23,w=475)
metric('1% annually','BC LLC share of the agreed profit base',592)
text('Management describes profit after expenses. The model uses its selected accounting-profit basis; the operative agreement, consent rights and payment definition remain unreviewed.',592,367,23,w=496)
foot('Property is reported paid off. Premises, assignment, improvements, termination and financing rights require document review. Runway campus concept, not proof of installed capacity.')

# 07 / grid first, future hybrid separate
page('Grid first. Hybrid power in a later phase.','Power strategy')
metric(f"{A['energyUsdPerKwh']*100:g} cents",'per kWh energy planning assumption',64)
metric(usd(A['demandUsdPerKwMonth'])+'/kW','monthly demand-charge assumption',592)
text('Launch uses grid power. The model includes energy and demand charges separately, with demand based on the estimated billed peak.',64,381,23,w=475)
text('Solar and battery storage are future additions. They require their own installed budget, tariff analysis, interconnection and measured savings.',592,381,23,w=496)
foot('Neither tariff component is verified. The billed peak is '+pct(A['demandPeakFactor'])+' of the design-day peak. No behind-the-meter discount or solar savings is included in Base. Runway hybrid-power concept.')

# 08 / hardware correctly air cooled
page('Eight complete B300 systems','Compute platform',True)
metric(million(cap['serverHardwareUsd']),str(fleet['nodes'])+' systems x '+usd(cap['serverHardwareUsd']/fleet['nodes']),64)
text(f"{fleet['installedGpus']} GPUs installed<br/>{fleet['saleableGpus']} revenue-producing GPU allocation<br/>{fleet['heldBackGpus']} installed GPUs held uncommitted",64,375,26,'Medium',w=478,leading=38)
text('Supermicro HGX B300 platform',592,220,26,'Medium',w=496)
text('Eight GPUs per complete system<br/>Dual CPUs and NVSwitch fabric<br/>Networking and local storage<br/>NVIDIA software and support<br/>Air-cooled server planning basis',592,272,22,w=496,leading=37)
text('Support: '+str(A['includedSupportMonths'])+' operating months included; then '+pct(A['postWarrantySupportRate'])+' of complete-system purchase cost/year before '+pct(A['annualCostInflation'])+' annual cost escalation. Supplier terms are unverified.',64,517,17,w=1024)
foot('Complete-system price and inclusions are owner-reported. Exact quoted SKU, inter-node fabric, support coverage and delivery terms require confirmation. This model uses air cooling, not a direct-liquid server loop.')

# 09 / fleet allocation illustration
page('Capacity allocation is not full redundancy','Service availability',True)
text('EIGHT SYSTEMS / EIGHT GPUS EACH',64,198,13,'Mono',w=620)
for node in range(8):
 y=235+node*35;text(f'Node {node+1}',64,y+2,17,'Medium',w=130)
 for gpu in range(8):rect(201+gpu*46,y,34,25,'#C7D1CB' if node==7 and gpu>=4 else '#31804B')
text('60 modeled earning GPUs',650,222,32,'Medium',w=430)
text('All 64 GPUs are purchased. The four held-back GPUs are installed but unsold, not loose spare cards.',650,278,21,w=430)
text('A whole node contains eight GPUs',650,389,25,'Medium',w=430)
text('One failed node leaves 56 installed GPUs. Maintaining a 60-GPU customer commitment needs a separately designed recovery plan.',650,441,21,w=430)
foot('Illustrative capacity allocation, not an approved tenant layout or guaranteed uptime. Customer SLAs, service credits, standby capacity and recovery time must be agreed before commitments.')

# 10 / engineering model
page('Power and cooling sized together','Preliminary engineering')
metric(f"{tech['itKw']:,.1f} kW",'IT load at full modeled draw',64)
metric(f"{tech['facilityPeakKw']:,.1f} kW",'estimated whole-site design-day load',592)
text(f"{tech['chillerCount']} x {tech['chillerUnitTons']:g}-ton chillers<br/>{tech['inRowCoolerCount']} x {tech['inRowUnitKw']:g} kW in-row coolers",64,383,28,'Medium',w=475,leading=40)
text(f"{tech['coolingLoadTons']:.1f} tons of design cooling duty. In-row units transfer server exhaust heat to a closed chilled-water/glycol loop. Modeled quantities include spare units.",592,381,23,w=496)
foot('Node load '+str(tech['nodeKw'])+' kW is an estimate. Chiller ambient/glycol derate, electrical ratings, pumps, controls, transfer, fire/egress and layout need engineer/vendor approval. N+1 arithmetic is not facility certification.')

# 11 / replace all obsolete funding bridges
page('The initial capital requirement','Base uses of funds',True)
table(['USE','AMOUNT','BASIS'],[
 ['Complete GPU systems',usd(cap['serverHardwareUsd']),'Owner-reported complete-system price'],
 ['Storage / management / spares',usd(cap['storageAndSparesUsd']),'Additional allowance; quote overlap unresolved'],
 ['Freight / rigging / sales tax',usd(cap['freightAndTaxUsd']),'Planning allowance; exemptions unverified'],
 ['Power / cooling / site infrastructure',usd(cap['infrastructureUsd']),'Includes engineering and contingency'],
 ['Cash reserve and launch top-up',usd(cap['cashReserveUsd']+cap['launchTopUpUsd']),'Includes receivables funding'],
 ['TOTAL INITIAL FUNDING',usd(cap['totalUsd']),'Model v'+str(M['version'])+' Base; not a contractor quotation']
 ],[441,220,363],y=190,rowh=55,size=17)
foot('Above the initial owner-reported '+million(FUND)+' is '+usd(max(0,cap['totalUsd']-FUND))+'. Management intends to cover the overage. Capital availability and terms remain unverified.')

# 12 / unit economics transparent
page('Operating profit and capital return differ','Base operating economics')
metric(million(B2['revenueUsd']),'Year 2 modeled revenue',64)
metric(million(B2['ebitdaUsd']),'Year 2 EBITDA / before tax and depreciation',592)
text(f"{fleet['saleableGpus']} earning GPUs x {num(A['annualHours'])} hours<br/>x {pct(comm['merchantUtilizationYear2Plus'])} paid utilization<br/>x ${comm['merchantRateYear1Usd']*(1+comm['annualMerchantRateChange']):.2f}/GPU-hour in Year 2",64,382,24,w=475,leading=36)
text('The Base starts at $'+f"{comm['merchantRateYear1Usd']:.2f}"+' per GPU-hour. Merchant pricing declines '+pct(-comm['annualMerchantRateChange'])+' annually; cash costs include staff, support, fees, power, tax and site payments.',592,381,23,w=496)
foot('Utilization and price are assumptions, not customer commitments. Positive EBITDA does not establish investment payback or cash available to an outside investor.')

# 13 / full annual operating path
page('Five years of Base operating performance','Base forecast',True)
table(['YEAR','REVENUE','OPERATING COST','EBITDA','OPERATING CASH'],[
 [str(r['year']),million(r['revenueUsd']),million(r['opexUsd']),million(r['ebitdaUsd']),million(r['operatingCashUsd'])] for r in B['annual'] if r['year']<=B['horizonYears']
 ],[115,227,227,227,228],y=212,rowh=56,size=21)
text('Operating cash is after modeled operating tax and the BC LLC payment. It excludes asset sale proceeds and reserve release.',64,541,17,w=1024)
foot('The launch period is '+str(comm['buildMonths'])+' months. Receivables, funded reserves and actual distribution timing are handled separately in the dated project-cash schedule.')

# 14 / headline project return is the workbook's primary metric
page('The unsigned Base does not clear the hurdle','Base capital recovery')
metric(pct(B['returns']['headlineIrr']),'headline project IRR / primary metric',64)
metric(pct(A['hurdleRate']),'modeled project-return hurdle',592)
text(million(B['returns']['unrecoveredOperatingCapitalUsd'])+' remains unrecovered',64,386,29,'Medium',w=1010)
text('after the modeled operating cash over the horizon. Asset-sale assumptions and the timing of reserve release matter; neither is recurring operating income.',64,441,23,w=970)
text('Headline NPV at '+pct(A['hurdleRate'])+': '+million(B['returns']['npvUsd'])+'  /  Headline cash multiple: '+f"{B['returns']['moic']:.3f}x"+' including modeled resale',64,527,17,w=1024)
foot('Five-year hold; resale assumes '+pct(A['hardwareResaleYear5'])+' of hardware cost and '+pct(A['infrastructureResale'])+' of infrastructure, with no guaranteed buyer. Annual-funded IRR '+pct(B['returns']['annualFundedIrr'])+' and dated XIRR '+pct(B['returns']['datedFundedIrr'])+' are timing diagnostics, before investor allocation.')

# 15 / the six workbook-native Phase-1 cases
page('Customer economics change the result','Conditional scenario comparison',True)
scenario_names={
 'downside':'Downside',
 'base':'Base',
 'market':'Market',
 'contracted':'Contracted / 40 GPUs',
 'marketplace-heavy':'Marketplace-heavy',
 'delayed':'Delayed customer',
}
table(['PHASE-1 CASE','INITIAL CAPITAL','YEAR 2 OPERATING CASH','HEADLINE IRR'],[
 [scenario_names[row['id']],million(row['capital']['totalUsd']),million(next(item for item in row['annual'] if item['year']==2)['operatingCashUsd']),pct(row['returns']['headlineIrr'])]
 for row in PHASE1
 ],[330,217,270,207],y=190,rowh=52,size=18)
foot('All six cases are unsigned, conditional workbook scenarios; none clears the '+pct(A['hurdleRate'])+' project-return hurdle. Positive operating cash is not the same as full capital recovery. Maximum build is shown separately on page 22.')

# 16 / exact unsigned Contracted case from the workbook
page('A contract must survive its own assumptions','Contracted scenario')
metric(pct(CONTRACTED['returns']['headlineIrr']),'headline project IRR / '+str(CONTRACTED['horizonYears'])+' years',64)
text(f"{CONTRACTED['commercial']['contractedGpus']} GPUs at ${CONTRACTED['commercial']['contractRateUsd']:.2f}/GPU-hour<br/>{pct(CONTRACTED['commercial']['contractPaidShare'])} paid share / {CONTRACTED['commercial']['contractTermMonths']} months",64,379,27,'Medium',w=475,leading=39)
text('Merchant economics after expiry',592,218,28,'Medium',w=496)
text('The remaining '+str(CONTRACTED['capacity']['saleableGpus']-CONTRACTED['commercial']['contractedGpus'])+' saleable GPUs use a $'+f"{CONTRACTED['commercial']['merchantRateYear1Usd']:.2f}"+' Year-1 reference, '+pct(CONTRACTED['commercial']['merchantUtilizationYear1'])+' / '+pct(CONTRACTED['commercial']['merchantUtilizationYear2Plus'])+' paid utilization and '+pct(-CONTRACTED['commercial']['annualMerchantRateChange'])+' annual price decline. Contracted capacity follows merchant inputs after expiry; no renewal is assumed.',592,278,18,w=496,leading=25)
text('Credit support, acceptance, deposit, service credits and termination provisions determine whether the minimum payment is dependable.',592,490,18,w=496,leading=25)
project_note()

# 17 / make positive cash and sub-hurdle return legible together
page('Cash-positive operations still miss the hurdle','Base return bridge')
metric(million(B2['operatingCashUsd']),'Year 2 modeled operating cash',64)
metric(million(B['returns']['npvUsd']),'headline NPV at '+pct(A['hurdleRate']),592)
text('Every Base forecast year shows positive modeled operating cash after operating tax and the BC LLC payment.',64,380,25,'Medium',w=475,leading=34)
text('The '+million(B['capital']['totalUsd'])+' initial outlay, declining merchant price and modeled exit value produce a '+pct(B['returns']['headlineIrr'])+' headline project IRR. Annual cash generation alone does not establish full capital recovery.',592,380,22,w=496,leading=30)
project_note()

# 18 / launch measured milestones
page('Release capital against delivery milestones','Execution sequence',True)
table(['STAGE','DELIVERABLE','DECISION BASIS'],[
 ['Commercial validation','Paid workload evidence and enforceable reserved-capacity terms','Customer economics, credit support and service acceptance'],
 ['Engineering and site','Utility capacity, layout, electrical and cooling selections','Complete installed scope and commissioning criteria'],
 ['Procurement','Confirmed system specification and supplier milestones','Price validity, support dates, delivery and acceptance'],
 ['Commissioning','Load, cooling, network and recovery tests','Measured service performance before customer acceptance'],
 ['Operating growth','Utilization, receipts, support and reserve reporting','Further purchases linked to supported demand']
 ],[220,403,401],y=196,rowh=65,size=18)
foot('The Base assumes '+str(comm['buildMonths'])+' months before billing, not an approved construction schedule. Vendor milestones and contractor commitments remain to be documented.')

# 19 / shared real team, no invented biography
page('The team carrying the project forward','Leadership, operations and advisors')
team=json.loads((ROOT/'src/data/team.json').read_text(encoding='utf-8'))
for i,person in enumerate(team):
 x=64+(i%3)*352;y=212+(i//3)*116
 name=person['name']
 if person.get('linkedin'):name=f'<link href="{person["linkedin"]}" color="{PAPER}">{name}</link>'
 text(name,x,y,23,'Medium',w=320)
 text(person['role'],x,y+35,15.5,fill=MUTED,w=320)
 if person.get('email'):text(f'<link href="mailto:{person["email"]}" color="{SIGNAL}">{person["email"]}</link>',x,y+63,13,w=200 if person.get('credly') else 320)
 if person.get('credly'):text(f'<link href="{person["credly"]}" color="{SIGNAL}"><u>Credentials</u></link>',x+212,y+63,13,w=108)
 line(x,y+94,x+314,y+94)
credential_links=' / '.join(f'<link href="{item["verificationUrl"]}"><u>{item["shortLabel"]}</u></link>' for item in CREDENTIALS['certifications'])
foot('Yasir Jahangir: '+credential_links+'. Credly verified '+date.fromisoformat(CREDENTIALS['verifiedAt']).strftime('%d %b %Y')+'. Personal credentials, not SmartTec corporate certification.')

# 20 / disciplined customer economics
page('Price the risk as well as the GPU','Commercial underwriting',True)
two_blocks([
 ('Reserved customer capacity','Contracted price, minimum paid hours, service start, payment dates and counterparty support define the revenue commitment. Dedicated server shape must match the hardware allocation.'),
 ('Merchant and shared inference','Usage, realized price, platform fees and workload mix determine receipts. Retail GPU list prices are context; they are not SmartTec net receipts or long-term customer contracts.')
 ],y=216)
callout('A passing scenario is not an offer','Pricing needs margin for launch delay, outages, service credits, cost overruns and customer credit exposure. These terms require commercial negotiation.',y=463)
foot('Initial connectivity allowance: '+usd(A['phase1InternetAnnualUsd']/12)+'/month; bandwidth, route diversity and SLA scope are unconfirmed. No extra token revenue is modeled. Customer resale requires an enforceable buyer payment obligation.')

# 21 / grid remains base, future hybrid opportunity not false savings
page('Solar and storage are a separate investment','Future hybrid phase')
text('Add resilience and power options in stages',64,218,37,'Medium',fill=SIGNAL,w=1015)
two_blocks([
 ('Solar generation','Potential on-site production requires an EPC scope, interconnection review, credible production profile and tariff-based self-consumption value.'),
 ('Battery storage','Capacity, dispatch, degradation, replacement and the actual demand tariff determine savings. A battery is not automatically a firm alternate source for the full cooling load.')
 ],y=300)
foot('No solar/BESS capex, incentive, savings or revenue is credited to the GPU Base case. The future hybrid system requires its own approved investment case; grid supply supports launch.')

# 22 / preliminary scale notexcitementguarantee
page('Scale follows commitments and engineering','Expansion case')
metric(str(MAXIMUM['capacity']['installedGpus'])+' GPUs','preliminary service-capacity ceiling',64)
metric(million(MAXIMUM['capital']['totalUsd']),'maximum-build modeled funding',592)
text(str(MAXIMUM['capacity']['nodes'])+' systems / '+str(MAXIMUM['capacity']['saleableGpus'])+' earning GPUs. The electrical screen includes cooling, support loads and design margin.',64,384,23,w=475)
text('Unsigned maximum-build headline project IRR: '+pct(MAXIMUM['returns']['headlineIrr'])+'. More GPUs spread fixed costs, but do not create signed demand or guarantee capital recovery.',592,384,23,w=496)
foot('Maximum is a preliminary screen, not utility or engineer approval. The unsigned 40-GPU Contracted case does not support the rest of a 225-GPU saleable fleet. Runway campus concept.')

# 23 / distinction investor projectreturns
page('Project returns precede investor economics','Participation and governance',True)
two_blocks([
 ('Capital and ownership','Founder equity or loan treatment, outside capital, valuation, ownership and future capital calls remain open. The available founder funding is reported; it is not a verified bank transfer.'),
 ('Distribution and protections','Preferences, cash distributions, investor controls, exit rights and related-party protections require documentation. The BC LLC site commitment and payment basis are material to that structure.')
 ],y=216)
callout('No investor waterfall is modeled','The quoted project IRRs do not establish an investor\'s return after ownership dilution, preferences, fees or distributions. Financing scenarios also carry repayment obligations.',y=463)
foot('No fixed raise, ownership percentage, preferred return or investor entitlement is offered in this presentation. Definitive terms require agreement.')

# 24 / credible investor-facing risks
page('Evidence that governs the investment decision','Readiness and risk controls',True)
table(['DEPENDENCY','REQUIRED EVIDENCE'],[
 ['Customer payments','Executed customer terms, credit support, paid capacity and acceptance; no reliance on unsigned resale demand.'],
 ['Hardware and installed cost','Final configuration, scope, support dates, delivered cost and complete contractor budget.'],
 ['Grid, cooling and service','Verified tariff/capacity, engineering selections, permits and tested recovery performance.'],
 ['Site and capital rights','BC LLC agreement definition and consent rights; contribution, overage and investor documents.'],
 ['Cash and exit','Collections, taxes, reserves, repayment and dated distributions; supportable resale and completed customer obligations.']
 ],[293,731],y=194,rowh=65,size=19)
foot('Development-stage risks remain. The model is an auditable planning case; forecasts and check cells do not verify customers, bank balances, installed equipment or future sale proceeds.')

# 25 / model provenance and precise methods
page('A traceable financial and technical basis','Model and sources',True)
text('Reviewed model '+str(M['version']),64,210,28,'Medium',w=480)
text('Native Excel recalculation and independent cash checks support this snapshot. The website and PDF use the same USD project values.',64,267,22,w=480)
text('Headline project IRR is the quoted return metric. Annual-funded IRR and dated XIRR use different cash-timing conventions and are shown only as diagnostics.',64,387,21,w=480)
text('Workbook stays private',64,496,23,'Medium',w=480)
text('Source identity and values are retained in the protected model.',64,531,16,w=480)
text('External context, not project verification',592,211,23,'Medium',w=496)
sources=[
 ('Supermicro HGX B300 platform','https://www.supermicro.com/en/products/system/gpu/8u/sys-822gs-nb3rt'),
 ('NVIDIA DGX B300 reference specifications','https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html'),
 ('Daikin Trailblazer chiller range','https://www.daikinapplied.com/products/chiller-products/trailblazer'),
 ('Runpod on-demand pricing','https://www.runpod.io/pricing'),
 ('Nebius on-demand pricing','https://nebius.com/prices'),
 ('SmartTec protected investor area','https://www.smarttec.dev/investors')]
for i,(label,url) in enumerate(sources):text(f'<link href="{url}" color="{FOREST}"><u>{label}</u></link>',592,268+i*47,18,w=496)
foot('Supplier specifications and market prices provide context only. The system quote, utility tariff, customer obligations, funding and BC LLC documents have not been independently verified.')

# 26 / close confidentaboutprocessaccurateaboutstage
page('Build the first deployment with SmartTec','Investor discussion')
text('A place. A fleet. A customer-led plan.',64,215,40,'Medium',w=1024)
text('SmartTec is developing owned compute for shared AI inference and dedicated GPU customers. The next step is to align binding customer economics, installed delivery scope and investor rights.',64,284,27,w=976,leading=35)
text('Grid first. Customer commitments. Evidence before expansion.',64,402,24,'Medium',fill=SIGNAL,w=1024)
text('Yasir Jahangir',64,457,30,'Medium',fill=SIGNAL,w=520)
text('Chief Technology Officer',64,501,21,w=520)
text('<link href="mailto:yasir@smarttec.dev" color="#EEF1EF">yasir@smarttec.dev</link><br/><link href="tel:+19185203823" color="#EEF1EF">918-520-3823</link>',592,456,23,w=496)
text('<link href="https://www.smarttec.dev/investors" color="#7BE88A"><u>smarttec.dev/investors</u></link>',592,523,23,w=496)
foot('8460 US 70, Mead, Oklahoma 73449. Conditional project scenarios, not signed revenue or promised investor returns. Runway campus concept.')
c.save()

data=pdf_buffer.getvalue()
pending=OUT.with_suffix('.pending.pdf');pending.write_bytes(data);pending.replace(OUT)
(ROOT/'output/pdf/SmartTec-Investor-Presentation.pdf').write_bytes(data)
meta={
 'title':'SmartTec Investor Presentation','filename':OUT.name,'reviewedAt':EDITION_DATE,
 'financialBasisReviewedAt':EDITION_DATE,'edition':'Grid-first shared inference and dedicated GPU compute',
 'pages':PAGE,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
 'modelVersion':M['version'],'modelSourceSha256':D['modelSourceSha256'],'financialSource':M['source'],
 'teamSourceSha256':D['teamSourceSha256'],'credentialsSourceSha256':D['credentialsSourceSha256'],
 'currentReturnStatus':'conditional-scenarios','primaryReturnMetric':'headline-project-irr',
 'builderSourceSha256':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest(),
 'exporterSourceSha256':hashlib.sha256((ROOT/'tools/export-investor-deck-data.mjs').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),
}
(ROOT/'src/smarttec-investor/data/investor-deck.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
(ROOT/'src/smarttec-investor/server/investor-deck.mjs').write_text('// Generated by tools/build-investor-deck.py. Server-only authenticated download.\nexport const investorDeckBase64='+json.dumps(base64.b64encode(data).decode())+';\n',encoding='utf-8')
(ROOT/'tmp/pdfs/deck-layout.json').write_text(json.dumps({'titles':TITLES,'boxes':BOXES,'rules':RULES},indent=2),encoding='utf-8')
print(json.dumps(meta,indent=2))
