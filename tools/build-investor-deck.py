"""Rebuild the branded investor PDF and its authenticated server download.

Run from the repository root using Python with reportlab and Pillow installed.
The JavaScript export supplies the current readiness record and an explicitly
historical comparison calculated by the monthly ROI engine.
"""
from pathlib import Path
import base64, hashlib, json, re, subprocess, xml.etree.ElementTree as ET
from io import BytesIO
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
R=D['result']
Q=D['readiness']
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
c.setSubject('Founder-backed B300 deployment, staged capital release and investment-readiness evidence')
c.setViewerPreference('DisplayDocTitle','true')
PAGE=0; LIGHT=False; TITLES=[]; BOXES=[]
usd=lambda n:'-'+usd(-n) if n<0 else '${:,.0f}'.format(n)
million=lambda n:('-' if n<0 else '')+'${:.2f}m'.format(abs(n)/1e6)
def color(value):return HexColor(value)
def rect(x,y,w,h,fill,alpha=1):
 c.setFillColor(color(fill),alpha=alpha);c.rect(x,H-y-h,w,h,fill=1,stroke=0)
def line(x,y,x2,y2,fill=None,width=1):
 c.setStrokeColor(color(fill or ('#B5C8BC' if LIGHT else '#446454')));c.setLineWidth(width);c.line(x,H-y,x2,H-y2)
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
 text('SMARTTEC  /  INVESTOR DISCUSSION  /  11 SEPTEMBER 2026',64,622,9,'Mono',w=840)
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
   c.saveState();rect(x0,yy-8,sum(widths),rowh-5,'#FFFFFF',alpha=.28 if LIGHT else .06);c.restoreState()
  for j,(v,w) in enumerate(zip(row,widths)):
   text(str(v),x+10,yy,size,'Medium' if j==0 else 'Space',w=w-20);x+=w
  line(x0,yy+rowh-13,x0+sum(widths),yy+rowh-13,width=.5)

# 01 / cinematic cover
page('AI infrastructure, built in phases','Investment presentation')
img('public/assets/investor/b300-studio.webp',0,0,W,H)
scrim(.68,.12)
BOXES[:]=[b for b in BOXES if b['page']!=1]
logo(64,55,275)
text('AI infrastructure,<br/>built in phases',64,230,56,'Medium',w=590,leading=63)
text('Mead, Oklahoma',67,401,25,w=520)
text('A proposed founder-backed B300 deployment.<br/>A customer-led strategy for staged growth.',67,453,21,w=565)
text('INVESTOR DISCUSSION / SEPTEMBER 2026',67,573,11,'Mono',w=700)
text('<link href="https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html" color="#EEF1EF">RUNWAY PRODUCT CONCEPT / NVIDIA REFERENCE / NOT THE SELECTED SUPERMICRO SYSTEM</link>',574,620,8,'Mono',w=545)

# 02 / the actual investment proposition
page('Founder-backed AI infrastructure in Mead','Investment thesis')
text(million(Q['founderCapital']['initialAvailable']),64,215,82,'Medium',fill=SIGNAL,w=460)
text('initial founder capital, owner-reported',68,317,23,w=468)
text('Management also intends to fund the overage. The proposal can be developed without treating $6m as a fixed funding ceiling.',64,382,23,w=470)
text('Three sources of potential value',592,220,27,'Medium',w=496)
text('Long-term site access<br/>Behind-the-meter power strategy<br/>Dedicated B300 compute capacity',592,281,25,w=496,leading=42)
text('The investment decision depends on complete delivery costs, binding customer payments and agreed investor rights.',592,455,22,w=496)
foot('Founder availability and willingness are reported, not verified transfers. Customer discussions are active; no signed revenue or definitive updated return is established.')

# 03 / sources of capital, not a fictional raise
page('Founder funding position','Capital position',True)
table(['CURRENT BASIS','WHAT IT MEANS'],[
 [usd(Q['founderCapital']['initialAvailable'])+' initially','Management reports funds available. Contribution form, timing and transfers into the project remain unverified.'],
 ['Overage willingness','Management intends to personally fund additional costs. The amount depends on the completed project budget.'],
 ['Existing property and buildings','Reported paid off and held by BC LLC. Property value is separate from spendable project cash.'],
 ['Outside investment','Optional structure remains open. No fixed raise, valuation, equity percentage or return entitlement is offered here.']
 ],[295,729],y=209,rowh=77,size=20)
foot('Management-reported funding availability and overage intent, 11 Sep 2026. Funds and transfers have not been independently verified; investment economics remain open.')

# 04 / commercial status
page('Commercial pipeline and current commitments','Commercial evidence')
text('Active discussions',64,219,40,'Medium',fill=SIGNAL,w=510)
text('Two commercial channels are under discussion. Management reports a potential 180-B300 requirement and a separate resale/offtake opportunity.',64,289,23,w=475)
text('The current commitment level',592,221,28,'Medium',w=496)
text('0 signed customer contracts<br/>0 paid pilots established<br/>No agreed minimum receipts',592,291,25,w=496,leading=44)
text('The proposed procurement strategy links capacity<br/>to contracted workloads and payment terms.',64,480,27,'Medium',w=1010)
foot('Customer reports have not been independently verified. Identities and private discussions are omitted. A potential 180-GPU request is not an order or an expansion commitment.')

# 05
page('Proposed customer agreement structure','Commercial terms for discussion',True)
table(['AGREEMENT AREA','PROPOSED SCOPE'],[
 ['Payment counterparty','The paying legal entity, its payment obligations and the credit support available to SmartTec.'],
 ['Minimum receipts','Minimum payments for compliant reserved capacity, including periods of lower resale or workload demand.'],
 ['Net realized price','The distinction between net host receipts, customer pricing and fees at the proposed $6.50/GPU-hour rate.'],
 ['Acceptance and exit','Workload acceptance, service start, contract duration, deposits, service credits, remedies and termination.']
 ],[287,737],y=215,rowh=77,size=21)
foot('Proposed agreement scope. No deposit, minimum payment or take-or-pay commitment is established. Marketplace access does not guarantee customer receipts.')

# 06 / property, accurately held outside SmartTec
page('A long-term home for the operation','Site rights')
text('50 years',64,215,70,'Medium',fill=SIGNAL,w=470)
text('site-use agreement, signed status<br/>confirmed by management',68,308,23,w=470)
text('Management identifies BC LLC as landholder, with an ownership connection to the CEO. The property is reported paid off.',64,398,23,w=470)
text('39.39 acres / 5,035 sq ft gross A + C area',64,529,18,'Medium',w=485)
text('1% annually',592,220,47,'Medium',w=496)
text('Management describes a payment to BC LLC of 1% of profit remaining after expenses.',592,296,23,w=496)
text('The written profit definition, premises, termination, improvements and financing rights remain unreviewed.',592,422,23,w=496)
foot('Owner record: agreement signed, document and title unreviewed. Site access does not imply SmartTec property ownership or investor collateral. Runway campus concept.')

# 07
page('Power is a potential operating advantage','Behind-the-meter strategy')
text('&lt;7 cents',64,216,68,'Medium',fill=SIGNAL,w=490)
text('per kWh, reported by management',68,306,23,w=475)
text('Solar + batteries + gas generation',64,377,28,'Medium',w=476)
text('Management reports a supply agreement. Its delivered cost advantage remains subject to firm capacity, reliability and complete operating costs.',64,443,22,w=473)
text('Outstanding supply terms',592,222,29,'Medium',w=496)
text('Exclusive continuous kW<br/>Service availability date<br/>Fuel and maintenance obligations<br/>Losses, replacements and equipment costs<br/>Interruption and recovery terms',592,283,22,w=496,leading=40)
foot('The rate is not a verified all-in tariff. Shared OG&E service is recorded separately; it does not establish exclusive capacity. Runway power concept, not installed equipment.')

# 08 / hardware scope owner has actually supplied
page('Eight complete Supermicro B300 systems','Management-supplied system basis',True)
text(million(Q['hardware']['totalCost']),64,216,76,'Medium',w=460)
text('8 systems x '+usd(Q['hardware']['systemPrice']),68,326,26,w=470)
text('64 proposed GPUs<br/>60 saleable + 4 financial reserves',64,381,27,'Medium',w=475,leading=39)
text('Direct liquid cooling',64,489,24,'Medium',w=470)
text('Owner-reported complete-system scope',592,217,25,'Medium',w=496)
text('Eight B300 GPUs<br/>Dual Intel Xeon 6776P CPUs<br/>NVSwitch fabric<br/>Networking and storage<br/>NVIDIA software stack and support',592,274,22,w=496,leading=38)
foot('Supplier price and scope are management inputs. Exact configuration is private and unreviewed. Support term, external fabric, taxes, freight and installation remain unreconciled.')

# 09 / reserve GPU semantics
page('60 saleable GPUs. Four financial reserves.','Capacity allocation',True)
text('EIGHT SYSTEMS / EIGHT GPUS EACH',64,198,13,'Mono',w=620)
for node in range(8):
 y=235+node*35;text(f'Node {node+1}',64,y+2,17,'Medium',w=130)
 for gpu in range(8):
  reserve=node==7 and gpu>=4
  rect(201+gpu*46,y,34,25,'#C7D1CB' if reserve else '#31804B')
text('60 saleable',650,222,34,'Medium',w=430)
text('Revenue uses the 60 saleable GPUs.<br/>All 64 are in the proposed purchase.',650,276,21,w=430)
text('Reserve is not full redundancy',650,367,28,'Medium',w=430)
text('Four GPUs cannot replace one complete eight-GPU node. Whole-node scheduling and recovery capabilities remain unvalidated.',650,415,21,w=430)
foot('Illustrative financial allocation, not an approved scheduling or spare-parts topology. Heat and electrical design must account for the complete proposed fleet.')

# 10 / cooling concept
page('One building. Two controlled cooling loops.','Proposed thermal design')
text(str(Q['cooling']['screeningDutyPerChillerKW'])+' kW',64,212,72,'Medium',fill=SIGNAL,w=468)
text('net cooling-duty screening target<br/>per full-duty chiller',68,307,23,w=470)
text('Two full-duty chillers and two CDUs are retained in the initial comparison. The proposed duty criterion retains required cooling with one unit unavailable.',64,398,23,w=469)
text('Warm server-coolant circuit',592,217,26,'Medium',w=496)
text('CDUs isolate and control the compatible direct-liquid-cooled server loop.',592,263,22,w=496)
text('Separate residual-air cooling',592,365,26,'Medium',w=496)
text('The residual-air design compares rear-door cooling with complete new room cooling. The building has no working air conditioning.',592,411,22,w=496)
foot('225 kW is an engineering allowance, not confirmed OEM load: (8 x 20 + 20 ancillary + 5 pump) kW x 1.20 = 222 kW, rounded up. Component redundancy is not facility certification.')

# 11 / budget levels do not pretend to be quotes
FULL=next(v for v in Q['cooling']['cases'] if v['id']=='full-scope')
LOW=next(v for v in Q['cooling']['cases'] if v['id']=='lower-cost')
page('Cooling: complete installed cost scenarios','Preliminary cost comparison',True)
two_blocks([
 (usd(FULL['installedCoolingAllowance']),'Full-scope analyst comparison. Two chillers, two CDUs, dry coolers, four active rear doors and installation allowances. Includes 20% contingency.'),
 (usd(LOW['installedCoolingAllowance']),'Lower-cost sensitivity. Assumes a $100,000 chiller pair and defers $70,000 of separate dry coolers. Other allowances and 20% contingency remain.')
 ],y=218)
line(64,458,1088,458)
text('Neither amount is minimum pricing<br/>or an approved contractor bid.',64,481,24,'Medium',w=472)
text('New and warranted refurbished equipment are options under assessment. Both require summer duty, residual-air cooling, controls, installation and commissioning.',592,474,19,w=496,leading=23)
foot('Savings are arithmetic, not verified quotations. Deferred dry cooling changes seasonal energy use. The team reports a mechanical contractor, electrician and plumber are available.')

# 12 / partial means partial
page('Partial initial capital requirements','Partial initial funding',True)
table(['CURRENT PLANNING INPUT','FULL-SCOPE','LOWER-COST'],[
 ['Eight complete B300 systems',usd(Q['hardware']['totalCost']),usd(Q['hardware']['totalCost'])],
 ['Cooling allowance',usd(FULL['installedCoolingAllowance']),usd(LOW['installedCoolingAllowance'])],
 ['Retained startup/acquisition allowance',usd(Q['budget']['startupAllowance']),usd(Q['budget']['startupAllowance'])],
 ['Retained opening operating reserve',usd(Q['budget']['openingReserve']),usd(Q['budget']['openingReserve'])],
 ['PARTIAL INITIAL FUNDING',usd(FULL['partialInitialFunding']),usd(LOW['partialInitialFunding'])],
 ['Above initial $6m founder funding',usd(FULL['additionalFounderContribution']),usd(LOW['additionalFounderContribution'])]
 ],[552,236,236],y=195,rowh=45,size=20)
foot('Excludes remaining non-cooling site work, reserve revisions and later capital calls. The cooling scenarios replace the earlier $652,800 combined site allowance; scope overlaps remain unresolved.')

# 13 / arithmetic without a fabricated profitability claim
page('GPU rental revenue illustration','Illustrative revenue model')
text(million(Q['commercial']['grossAnnualAtIllustrativePaidHours']),64,211,84,'Medium',fill=SIGNAL,w=490)
text('illustrative annual gross billings',68,335,25,w=475)
text('60 saleable GPUs x 20 paid hours/day<br/>x $6.50/GPU-hour x 365 days',64,386,25,'Medium',w=480,leading=37)
text('From gross billings to project cash',592,222,28,'Medium',w=496)
text('Unpaid hours and customer collections<br/>Platform or sales charges<br/>Power, cooling and connectivity<br/>People, support and maintenance<br/>BC LLC payment, taxes and reserves',592,282,22,w=496,leading=40)
foot('Uncontracted billing arithmetic, not a forecast or investor profit. 20 paid hours/day equals 83.3% utilization of saleable capacity. Actual utilization, collections, fees and net receipts remain unresolved.')

# 14 / limits and next model specification
page('Current return model status','Project economics')
text('Updated ROI: not established',64,218,39,'Medium',fill=SIGNAL,w=1000)
text('The updated capital and operating cost basis remains incomplete. New cooling scope, remaining site work and the BC LLC payment are not yet reconciled into a definitive return model.',64,292,25,w=1015)
line(64,399,1088,399)
two_blocks([
 ('Capital inputs under review','Non-cooling site work, taxes, freight, installation, working capital and future reserves.'),
 ('Operating inputs under review','Net receipts, seasonal power, maintenance, site payments, taxes and hardware-life costs.')
 ],y=431)
foot('Founder funding intent supports capital availability. Updated NPV, payback and investor distributions remain unestablished pending complete costs and commercial terms.')

# 15 / explain old numbers once rather than silently retain
page('Historical model context','Superseded model',True)
text('Previous model result',64,215,27,'Medium',w=492)
text(million(R['project']['npv']),64,299,59,'Medium',w=485)
text('NPV at an assumed 15% annual hurdle',68,390,21,w=475)
text('Positive operating cash did not compensate for the previous modeled capital cost and timing.',64,449,22,w=470)
text('A superseded cost basis',592,215,28,'Medium',w=496)
text('The earlier model used a $652,800 combined site allowance. It did not include the newly itemized cooling comparison, unresolved non-cooling scope or BC LLC payment.',592,280,23,w=496)
text('Its ROI, payback and price thresholds<br/>describe the superseded case only.',592,465,23,'Medium',w=496)
foot('Historical comparison only, reproduced by the monthly engine. The earlier 28.7% ROI is not a current project return.')

# 16
page('Planned return sensitivities','Proposed analysis framework',True)
table(['SCENARIO','ANALYSIS SCOPE'],[
 ['Supported operating case','Signed net price and payment terms; validated cost scope; realistic commissioning and collection timing.'],
 ['Lower demand and pricing','Fewer paid hours, rate pressure, customer concentration, churn and nonpayment.'],
 ['Delivery and operating stress','Delayed launch, higher power/demand costs, repair events, outage credits and added working capital.'],
 ['Hardware-life and exit stress','Overhaul versus replacement, funded reserves, resale downside, wind-down costs and investor cash rights.']
 ],[310,714],y=211,rowh=77,size=20)
foot('These analyses are proposed for the completed model and agreed investor structure. Updated outcomes have not been established.')

# 17 / practical actionable staged path
page('Proposed capital-release milestones','Proposed purchase gates')
table(['GATE','EVIDENCE','CAPITAL CONSEQUENCE'],[
 ['1  Commercial','Paid validation and enforceable payment terms from a creditworthy counterparty','Order size linked to supported demand.'],
 ['2  Technical','Exact load/flow requirements, full installed budget and deliverable power/network','Delivery scope and reserves ready for approval.'],
 ['3  Procurement','Final price, payment milestones, warranty, delivery and acceptance terms','Orders subject to documented release controls.'],
 ['4  Service acceptance','Load tests, failure tests, customer acceptance and operating readiness','Service commencement, then receipt-led expansion.']
 ],[220,464,340],y=210,rowh=77,size=20)
foot('A proposed control framework, not completed milestones or an approved procurement commitment. Staged orders remain subject to supplier and customer agreement.')

# 18 / timeline no false turnkey
page('Phased delivery to customer acceptance','Delivery sequence',True)
table(['WORKSTREAM','CURRENT BASIS','PROGRESSION MILESTONE'],[
 ['Building preparation','Single-building deployment planned; new cooling required','Survey, layout, permits and contractor scope.'],
 ['Power','Owner-reported agreement and shared electrical service','Exclusive continuous kW and commissioning.'],
 ['Cooling and network','Design concepts and contractor resources identified','Installed systems, measured duty and throughput.'],
 ['Compute service','64-GPU planning fleet; customer discussions active','Workload proof, signed terms and customer acceptance.'],
 ['Expansion','Potential demand under discussion','Evidence-backed next order and available capacity.']
 ],[255,400,369],y=199,rowh=65,size=18)
foot('Earlier construction, utility and fiber dates remain unconfirmed targets, not completed work. No updated service launch date is committed in this presentation.')

# 19 / preserve actual team named facts
page('The team carrying the project forward','Management and advisors')
team=json.loads((ROOT/'src/data/team.json').read_text(encoding='utf-8'))
for i,person in enumerate(team):
 x=64+(i%3)*352;y=212+(i//3)*116
 name=person['name']
 if person.get('linkedin'):name=f'<link href="{person["linkedin"]}" color="{PAPER}">{name}</link>'
 text(name,x,y,23,'Medium',w=320)
 text(person['role'],x,y+35,15.5,fill=MUTED,w=320)
 if person.get('email'):text(f'<link href="mailto:{person["email"]}" color="{SIGNAL}">{person["email"]}</link>',x,y+63,13,w=320)
 line(x,y+94,x+314,y+94)
foot('Names, roles and contacts supplied by management. Experience and commitment levels have not been independently verified.')

# 20 / investment terms
page('Investor participation and governance','Terms for discussion',True)
two_blocks([
 ('Capital and economic rights','Potential terms cover the funded entity, founder equity or loan treatment, valuation, ownership, distributions and capital calls. No terms are fixed.'),
 ('Site and related-party protections','BC LLC site rights and the annual profit payment are material to the structure. Improvements, termination, assignment and financing rights remain unreviewed.')
 ],y=217)
line(64,461,1088,461)
text('Reporting and oversight',64,483,25,'Medium',w=465)
text('Proposed reporting covers receipts, utilization, outages, costs and reserves. Milestone approvals and related-party protections remain subject to agreement.',592,473,19,w=496,leading=23)
foot('Governance proposals require agreement and documentation. Paid-off property is not automatically SmartTec equity or investor collateral. No preferred return or waterfall is promised.')

# 21
page('Proposed execution responsibilities','Delivery and oversight',True)
table(['PROPOSED LEAD','RESPONSIBILITY SCOPE'],[
 ['CEO / COO','Customer counterparty, paid workload evidence, minimum payments and staged capacity commitments.'],
 ['CTO / Operations','Supplier interfaces, liquid-cooling requirements, network design, service tests and operating procedures.'],
 ['Mechanical / Electrical / Plumbing','Complete installed pricing, design coordination, site scope and tested commissioning.'],
 ['CFO / Legal','Founder contribution documents, BC agreement review, full model, reserves and investor terms.']
 ],[305,719],y=215,rowh=77,size=21)
foot('Proposed responsibilities; assignments are not yet confirmed. Contractor availability is owner-reported; qualifications, scope, prices and acceptance remain to be established.')

# 22
page('Customer-led growth options','Growth options')
text('64 GPUs under review',64,218,39,'Medium',fill=SIGNAL,w=490)
text('Eight systems form the current planning case. Customer commitments and the completed cost model determine what is purchased and when.',64,288,23,w=475)
text('180 GPUs discussed',592,218,39,'Medium',w=496)
text('Management reports potential customer interest at this scale. It is not signed demand, funded expansion or approved site capacity.',592,288,23,w=496)
line(64,435,1088,435)
text('Owned compute or customer-owned hosting',64,465,28,'Medium',w=1010)
text('The two routes carry different capital needs, customer credit exposure and service obligations. Current revenue arithmetic excludes hosting and manufacturing income.',64,516,20,w=1010)
foot('Runway campus concept, not installed buildings or approved expansion plans. Future manufacturing and energy development require separate budgets and decisions.')

# 23
page('Principal risks and dependencies','Investment considerations')
table(['EXPOSURE','CURRENT DEPENDENCY'],[
 ['Commercial','No signed payment obligations. Credit support, workload requirements and acceptance remain open.'],
 ['Power and cooling','Delivered capacity, all-in tariff scope, summer duty and failure performance remain unverified.'],
 ['Equipment and operations','External fabric, support term, staffing, security and replacement funding remain unreconciled.'],
 ['Property and governance','BC agreement and title unreviewed; payment base, contributions and investor rights remain unresolved.'],
 ['Financial information','Incomplete costs and no definitive updated return. Audited company statements have not been reviewed.']
 ],[300,724],y=204,rowh=62,size=20)
foot('Development-stage discussion material. Capital remains at risk. No audited SmartTec financial statements, investment approval or funding guarantee is represented.')

# 24 / stop energy and fee double counting
page('Financial assumptions and cost boundaries','Cost model basis',True)
two_blocks([
 ('Energy and maintenance','The historical model included facility overhead energy through PUE 1.4 at 7 cents/kWh. Seasonal cooling energy and site charges remain unreconciled within that cost basis.'),
 ('Commercial and property costs','Net host receipts, customer fees, collections and the BC LLC profit-payment definition remain open. Tax, reserve and distribution treatment are unresolved.')
 ],y=217)
line(64,456,1088,456)
text('Reserves and service coverage',64,481,24,'Medium',w=470)
text('The $264,501 opening reserve and $25,000/year cooling-service allowance are planning inputs. Supplier-covered and incremental costs remain unreconciled.',592,478,18,w=496,leading=22)
foot('No revised operating-expense total or five-year cash schedule is asserted. Exact supplier support coverage, other site work and later capital requirements remain open.')

# 25 / honest evidence, clickable links
page('Information basis and sources','Sources and status',True)
text('Management inputs / 11 Sep 2026',64,210,26,'Medium',w=480)
text('Founder capital and overage willingness<br/>Supermicro complete-system price and scope<br/>BC LLC signed-site-agreement status<br/>One-building deployment; no working HVAC<br/>Active customer discussions; no signed terms',64,263,20,w=482,leading=36)
text('Analyst work / preliminary',64,463,24,'Medium',w=480)
text('Itemized cooling comparison, arithmetic funding bridge and historical monthly cash model. No contractor bids.',64,503,18,w=480,leading=22)
text('External context, not project verification',592,211,23,'Medium',w=496)
sources=[
 ('Supermicro liquid-cooled Blackwell portfolio',Q['sources'][2]['url']),
 ('Vast.ai hosting and marketplace context','https://docs.vast.ai/host/hosting-overview'),
 ('New chiller manufacturer pricing context','https://waterchillers.com/60-ton-chillers-air-cooled-water-cooled/'),
 ('Refurbished chiller testing and warranty','https://powermechanical.com/sales/used-chillers-for-sale/'),
 ('SmartTec investor room and planning basis','https://www.smarttec.dev/investors#owner-deployment')]
for i,(label,url) in enumerate(sources):
 text(f'<link href="{url}" color="{FOREST}"><u>{label}</u></link>',592,267+i*57,18,w=496)
foot('External sources provide product or market context only. Owner facts are reported; private contracts, quote terms and funding have not been independently reviewed.')

# 26 / close on the decision and next evidence
page('Discuss the first SmartTec deployment','Investor discussion')
text('A proposed founder-backed B300 deployment',64,215,37,'Medium',w=1024)
text('SmartTec invites prospective investors to discuss its B300 proposal, customer pipeline and participation structure. The discussion brings together commercial terms, installed costs and investor rights.',64,282,26,w=945)
text('Participation structure and investment terms remain open.',64,396,24,'Medium',fill=SIGNAL,w=1024)
text('Yasir Jahangir',64,453,30,'Medium',fill=SIGNAL,w=520)
text('Chief Technology Officer',64,497,21,w=520)
text('<link href="mailto:yasir@smarttec.dev" color="#EEF1EF">yasir@smarttec.dev</link><br/><link href="tel:+19185203823" color="#EEF1EF">918-520-3823</link>',592,452,23,w=496)
text('<link href="https://www.smarttec.dev/investors" color="#7BE88A"><u>smarttec.dev/investors</u></link>',592,521,23,w=496)
foot('8460 US 70, Mead, Oklahoma 73449. Discussion material; no definitive investment terms or return are offered. Background: Runway campus concept.')
c.save()

data=pdf_buffer.getvalue()
pending=OUT.with_suffix('.pending.pdf')
pending.write_bytes(data)
pending.replace(OUT)
digest=hashlib.sha256(data).hexdigest()
meta={'title':'SmartTec Investor Presentation','filename':OUT.name,'reviewedAt':Q['reviewedAt'],'edition':'Founder-backed B300 proposal and investor participation','pages':PAGE,'bytes':len(data),'sha256':digest,'modelVersion':R.get('modelVersion','1.1.0'),'ownerStudySha256':hashlib.sha256((ROOT/'src/smarttec-investor/data/owner-deployment-study.json').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'engineSha256':hashlib.sha256((ROOT/'src/smarttec-investor/roi-engine.mjs').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'readinessSourceSha256':hashlib.sha256((ROOT/'src/smarttec-investor/investment-readiness.mjs').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'teamSourceSha256':hashlib.sha256((ROOT/'src/data/team.json').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'currentReturnStatus':'not-established'}
(ROOT/'src/smarttec-investor/data/investor-deck.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
(ROOT/'src/smarttec-investor/server/investor-deck.mjs').write_text('// Generated by tools/build-investor-deck.py. Server-only authenticated download.\nexport const investorDeckBase64='+json.dumps(base64.b64encode(data).decode())+';\n',encoding='utf-8')
(ROOT/'tmp/pdfs/deck-layout.json').write_text(json.dumps({'titles':TITLES,'boxes':BOXES},indent=2),encoding='utf-8')
print(json.dumps(meta,indent=2))
