"""Rebuild the branded investor PDF and its authenticated server download.

Run from the repository root using Python with reportlab and Pillow installed.
The JavaScript export calculates the financial tables with the live ROI engine.
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
D=json.loads((ROOT/'tmp/pdfs/deck-financials.json').read_text())
S,R,STUDY=D['scenario'],D['result'],D['study']
OUT=ROOT/'output/pdf/SmartTec-Investor-Presentation.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,path in [('Space','public/investor-assets/space-grotesk-0.ttf'),('Medium','public/investor-assets/space-grotesk-1.ttf'),('Bold','public/investor-assets/space-grotesk-3.ttf'),('Mono','public/assets/fonts/GoogleSansCode-Regular.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(ROOT/path)))
pdfmetrics.registerFontFamily('Space',normal='Space',bold='Bold',italic='Space',boldItalic='Bold')
W,H=1152,648
FOREST='#1C4839'; SIGNAL='#7BE88A'; PAPER='#EEF1EF'; INK='#141414'; DARK='#10161F'; MUTED='#BCD0C5'; RED='#FFB4A9'
c=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1,invariant=1)
c.setTitle('SmartTec by Z1Power | Investor Presentation | September 2026')
c.setAuthor('SmartTec.dev LLC')
c.setSubject('Mead campus, behind-the-meter power strategy and conditional GPU investment economics')
c.setViewerPreference('DisplayDocTitle','true')
PAGE=0; LIGHT=False; TITLES=[]; BOXES=[]
usd=lambda n:'-'+usd(-n) if n<0 else '${:,.0f}'.format(n)
million=lambda n:('-' if n<0 else '')+'${:.2f}m'.format(abs(n)/1e6)
def color(value):return HexColor(value)
def rect(x,y,w,h,fill):
 c.setFillColor(color(fill));c.rect(x,H-y-h,w,h,fill=1,stroke=0)
def line(x,y,x2,y2,fill=None,width=1):
 c.setStrokeColor(color(fill or ('#B5C8BC' if LIGHT else '#446454')));c.setLineWidth(width);c.line(x,H-y,x2,H-y2)
def text(s,x,y,size=20,font='Space',fill=None,w=1024,leading=None):
 fill=fill or (FOREST if LIGHT else PAPER)
 style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.25,textColor=color(fill),spaceAfter=0,allowWidows=0,allowOrphans=0)
 p=Paragraph(s.replace('\n','<br/>'),style);pw,ph=p.wrap(w,H)
 if y+ph>H-10 or x+w>W+1 or x<0:raise ValueError(f'Page {PAGE} overflow: {s[:65]} at {x},{y},{w},{ph}')
 p.drawOn(c,x,H-y-ph);BOXES.append({'page':PAGE,'text':re.sub('<[^>]+>','',s),'box':[x,y,w,ph]})
 return ph
def img(path,x,y,w,h):
 # Cropping occurs only in the PDF viewport; the original artwork stays unchanged.
 im=Image.open(ROOT/path);iw,ih=im.size;ratio=max(w/iw,h/ih);dw,dh=iw*ratio,ih*ratio
 c.saveState();p=c.beginPath();p.rect(x,H-y-h,w,h);c.clipPath(p,stroke=0);encoded=BytesIO();im.convert('RGB').save(encoded,format='JPEG',quality=90,optimize=True);encoded.seek(0);c.drawImage(ImageReader(encoded),x+(w-dw)/2,H-y-h+(h-dh)/2,dw,dh,mask='auto');c.restoreState()
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
 rect(0,0,W,H,PAPER if light else (bg or FOREST));logo(light=light)
 text(section.upper(),700,44,11,'Mono',w=385)
 text(title,64,113,43,'Medium',w=1024,leading=47)
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
  for j,(v,w) in enumerate(zip(row,widths)):
   text(str(v),x+10,yy,size,'Medium' if j==0 else 'Space',w=w-20);x+=w
  line(x0,yy+rowh-13,x0+sum(widths),yy+rowh-13,width=.5)

# 01 / cinematic cover
page('AI infrastructure, built in phases','Investment presentation')
img('public/assets/cinematic/campus-1586.webp',0,0,W,H)
c.saveState();c.setFillAlpha(.73);rect(0,0,650,H,'#102A22');c.restoreState()
logo(64,55,275)
text('AI infrastructure,<br/>built in phases',64,230,61,'Medium',w=640,leading=66)
text('Mead, Oklahoma',67,401,25,w=520)
text('A development-stage investment in GPU compute<br/>and a behind-the-meter power strategy.',67,453,21,w=565)
text('INVESTOR PRESENTATION / SEPTEMBER 2026',67,573,11,'Mono',w=700)
text('AI CONCEPT ARTWORK / NOT CURRENT SITE PHOTOGRAPHY',700,620,8,'Mono',w=415)

# 02
page('The SmartTec investment case','Opportunity')
text('39.39',64,213,87,'Medium',fill=SIGNAL,w=420,leading=90)
text('acre legal parcel in Mead, Oklahoma',69,318,23,w=420)
text('SmartTec.dev LLC operates under SmartTec Holdings LLC. Z1Power provides the parent battery-company context.',64,388,21,w=420)
text('A focused compute opportunity',592,222,27,'Medium',w=496)
text('Dedicated GPU services with procurement sized to customer commitments. The current financial study favors B300 over RTX at management\'s supplied prices.',592,270,22,w=496)
text('Power economics',592,388,27,'Medium',w=496)
text('Management reports a solar, battery and gas supply agreement below 7 cents/kWh. Firm capacity and full cost coverage remain under review.',592,435,22,w=496)
foot('Development-stage discussion. Owner reports underpin property, organization and power statements. Signed customer demand is unverified.')

# 03
page('Power demand creates a large backdrop','Market context',True)
text('Global data-center electricity use',64,205,20,w=560)
for value,label,x in [(485,'2025 ESTIMATE',95),(950,'2030 PROJECTION',369)]:
 height=value/950*210;rect(x,501-height,155,height,FOREST if value==485 else '#50A75F');text(str(value),x,501-height-47,33,'Medium',w=220);text(label,x-4,515,12,'Mono',w=238)
text('TWh / year',65,548,12,'Mono',w=300)
text('Local revenue depends on execution',676,222,28,'Medium',w=400)
text('The IEA\'s 2026 outlook projects roughly twice the global data-center electricity use by 2030.<br/><br/>SmartTec must turn its own available power, commissioned infrastructure and workload performance into paying customer contracts.',676,305,21,w=400)
foot('Source: IEA, Key Questions on Energy and AI (2026), executive summary. Global demand does not establish SmartTec bookings or market share.')

# 04
page('The Mead campus','Property and development',True)
text('5,035',64,210,79,'Medium',w=430,leading=83)
text('sq ft gross data-center building area',67,304,22,w=475)
text('Building A: 1,500 sq ft<br/>Building C: 3,535 sq ft',67,363,23,w=435)
text('Building B adds 2,083 sq ft for batteries, utilities and storage. Gross building area does not establish IT capacity.',67,453,20,w=445)
text('8460 US 70, Mead, OK 73449',592,216,27,'Medium',w=496)
text('The campus concept separates existing compute structures from proposed manufacturing and energy development.<br/><br/>Two proposed 30,000 sq ft factories address inverter manufacturing and battery assembly. Solar and storage remain separate development scopes.',592,277,21,w=496)
foot('Owner record, 10 Sep 2026. Legal acreage: 39.39. Legacy survey tract annotations total 39.21 acres. Title, rights and permitted use require diligence.')

# 05
page('Behind-the-meter power strategy','Energy')
img('public/assets/cinematic/energy-1586.webp',580,190,508,348)
text('&lt;7¢',64,211,90,'Medium',fill=SIGNAL,w=470,leading=92)
text('per kWh, reported by management',68,319,23,w=475)
text('Management reports a supply agreement using solar, batteries and gas generators.',64,377,21,w=460)
text('The model uses 7¢/kWh. The team is confirming continuous reserved kW, service date and fuel, maintenance and equipment obligations.',64,461,19,w=465)
foot('Energy input is conditional, not a verified all-in tariff. Shared OG&E service is recorded separately. Image: SmartTec AI concept artwork.')

# 06
page('Engineering defines usable capacity','Infrastructure readiness',True)
table(['SYSTEM','CURRENT BASIS','REQUIRED ACCEPTANCE'],[
 ['Electrical','3,000 A / 208 V / three-phase\nowner-reported shared service','Usable exclusive kW, voltage conversion, protection and commissioning'],
 ['Cooling','Two-loop design concept','Final OEM loads, heat rejection, controls and commissioning tests'],
 ['Connectivity','Dobson fiber target\n8 Oct - 5 Nov 2026','Installed service, measured throughput and actual carrier terms'],
 ['Resilience','Four spare GPUs in the 64-GPU case','Node failure, network failure, power transfers and recovery procedures']
 ],[185,345,494],y=209,rowh=78,size=18)
foot('Planning records and engineering allowances. Four GPUs do not replace a complete eight-GPU node. No uptime certification or approved site capacity is claimed.')

# 07
page('B300 leads at the supplied prices','Compute products',bg=DARK)
img('public/assets/cinematic/compute-1586.webp',694,184,394,355)
table(['OWNER INPUT','B300','RTX 6000'],[
 ['GPU-hour rate','$6.50','$1.50'],['Eight-GPU system','$670,000','$170,000'],['Per-GPU allocation','$83,750','$21,250']
 ],[220,180,180],y=219,rowh=67,size=21)
text('B300 suits the primary owned-compute study. RTX needs a workload and pricing case that justifies its investment.',74,479,20,w=555)
foot('Owner inputs, 10 Sep 2026. Exact OEM scope and support remain unverified. RTX context: PRO 6000 Blackwell Server Edition. Image is conceptual.')

# 08
page('Customer commitments precede procurement','Commercial strategy')
two_blocks([
 ('Proposed customers','AI application companies and GPU-cloud operators that need dedicated compute. Workload fit, security needs and support scope determine the actual offer.'),
 ('Proposed contract structure','Minimum paid GPU-hours, collection security and defined service credits. Model paid usage separately from hardware availability and utilization.')
 ],y=216)
line(64,452,1088,452)
text('Qualification evidence',64,477,22,'Medium',fill=SIGNAL,w=320)
text('Paid pilot results, signed minimum payments, credit review, support costs and renewal terms. No contracted customer pipeline is represented in this deck.',414,477,21,w=674)
foot('Commercial strategy is proposed. The 18-20 paid hours/day assumptions do not represent existing bookings, contracts or guaranteed demand.')

# 09
page('A conditional 60 + 4 B300 deployment','Fleet under consideration',True)
for x,value,label in [(64,'8','eight-GPU systems'),(416,'60','saleable GPUs'),(768,'4','reserve GPUs')]:
 text(value,x,216,92,'Medium',w=305);text(label,x+4,329,22,w=310)
text('$5.36m hardware purchase',64,430,31,'Medium',w=520)
text('All 64 GPUs carry purchase and power costs. Revenue comes from the 60 saleable GPUs.',64,482,20,w=496)
text('159.6 kW modeled IT peak',592,430,31,'Medium',w=496)
text('Includes supporting IT. PUE is 1.4 for energy modeling. Engineering must establish deliverable facility capacity.',592,482,20,w=496)
foot('This is a financial alternative, not an ordered fleet. The earlier two-RTX/one-B300 concept remains separate. Reserve GPUs are not full-node redundancy.')

# 10
page('Monthly cash generation can be positive','Unit economics',bg=DARK)
table(['NORMALIZED 30-DAY OPERATING MONTH','USD'],[
 ['60 GPUs x 20 paid hours x $6.50 x 30 days',usd(234000)],
 ['Receipts after 98% collection and 10% fees',usd(206388)],
 ['Electricity at 7¢/kWh and PUE 1.4',usd(8537.76)],
 ['Other operations, network and demand costs',usd(35427)],
 ['Operating cash before capital spending',usd(162423.24)]
 ],[770,254],y=202,rowh=57,size=22)
foot('Illustrative early operating month. Operating cash excludes equipment/site acquisition, overhaul, tax and investor distributions. Calendar-month results vary.')

# 11
page('Capital covers more than GPUs','Use of funds',True)
text(million(R['requiredInitialFunding']),64,214,72,'Medium',w=440)
text('initial modeled funding',68,303,24,w=440)
text('Plus approximately '+usd(R['project']['additionalContributions'])+' in later capital calls.',64,375,24,w=435)
text('The final raise depends on full quotes, customer terms, engineering and the agreed investor structure.',64,466,20,w=440)
table(['INITIAL USE','USD'],[
 ['Eight B300 systems',usd(5360000)],['Site work and contingency',usd(S['siteCapex'])],['Startup and acquisition allowance',usd(S['softCosts'])],['Opening operating reserve',usd(S['openingReserve'])]
 ],[340,156],y=212,rowh=69,size=20,x0=592)

# 12
page('Five-year cash model','Conditional financial schedule',True)
rows=[]
for label,key in [('Gross billings','billed'),('Collected receipts, net of fees','receipts'),('Operating expenses','opex'),('Operating cash','operatingCash'),('Later capital spending','capex'),('Net distributions less calls','netDistributions')]:
 rows.append([label]+[f"{a[key]/1000:,.0f}" for a in D['annual']])
table(['USD THOUSANDS','YEAR 1','YEAR 2','YEAR 3','YEAR 4','YEAR 5'],rows,[384,128,128,128,128,128],y=195,rowh=46,size=18)
text('Five-year net cash profit: '+million(R['project']['netProfit'])+'     Total five-year ROI: 28.7%',74,536,22,'Medium',w=1010)
foot('Year 1: Oct 2026-Sep 2027, with sales from Jan 2027. Initial funding excluded from table. Year 4 includes overhaul. Year 5 releases reserve after exit costs.')

# 13
page('Fleet size does not guarantee a strong return','Deployment comparison')
table(['B300 FLEET / 20 PAID HOURS','TOTAL FUNDING','5-YR PROFIT','NPV AT 15%'],[
 ['24 / no reserve',million(STUDY['cases'][0]['result']['totalFunding']),million(STUDY['cases'][0]['result']['profit']),million(STUDY['cases'][0]['result']['npv'])],
 ['60 + 4 reserve',million(R['project']['totalContributed']),million(R['project']['netProfit']),million(R['project']['npv'])],
 ['72 / no reserve',million(STUDY['cases'][3]['result']['totalFunding']),million(STUDY['cases'][3]['result']['profit']),usd(STUDY['cases'][3]['result']['npv'])]
 ],[418,202,202,202],y=218,rowh=67,size=23)
text('72 GPUs barely meet the assumed annual hurdle.',64,493,27,'Medium',fill=SIGNAL,w=1024)
text('Its positive NPV is less than 0.1% of total funding and fails the tested downside cases.',64,535,20,w=1024)
foot('912 configurations: 8-128 GPUs, B300/RTX/mixes, reserve variants and 18/20 paid hours. At 18 hours, none passes. Total ROI and annual discount rate differ.')

# 14
page('Price and procurement terms change the result','Negotiation thresholds',True)
two_blocks([
 ('$7.03 / GPU-hour','At $670,000 per eight-GPU B300 system, the 60 + 4 case reaches the 15% hurdle at approximately this flat rental price.'),
 ('$604,000 / system','At $6.50 per GPU-hour, approximately this eight-GPU B300 purchase price reaches the same hurdle, with hardware-linked costs recalculated.')
 ],y=226)
line(64,449,1088,449)
text('A smaller 24-GPU option',64,474,25,'Medium',w=470)
text('At 20 paid hours/day, approximately $7.93/hour meets the hurdle with no reserve. At $6.50/hour, total five-year ROI is about 6%.',592,473,21,w=496)
foot('Alternative sensitivities, not agreed prices. All cases assume 20 paid hours/day after month 3. Thresholds leave little cushion and need stronger contracted terms.')

# 15
page('Downside resilience remains the decision gate','Risk sensitivities',bg=DARK)
table(['60 + 4 B300 CASE','NPV AT 15%'],[
 ['20 paid hours/day, flat $6.50 pricing',million(R['project']['npv'])],
 ['18 paid hours/day, flat pricing',million(STUDY['cases'][1]['result']['npv'])],
 ['20 hours, 10% annual rental-price decline',million(STUDY['cases'][2]['declineNPV'])],
 ['20 hours, another $10,000/month operating cost',million(STUDY['cases'][2]['extraOperationsNPV'])],
 ['20 hours, full hardware replacement in month 37',million(D['fullReplacementNPV'])]
 ],[800,224],y=204,rowh=57,size=21)
foot('One change at a time. Replacement stress substitutes 100% of original GPU-system cost for the 10% overhaul. No efficiency gain, resale or extra revenue assumed.')

# 16
page('Execution milestones','Targets and acceptance',True)
table(['MILESTONE','CURRENT TARGET / REQUIREMENT','CAPITAL RELEASE EVIDENCE'],[
 ['Construction start','24 September 2026 owner target','Defined scope and approved contractor budget'],
 ['Transformer commissioning','8 October 2026 owner target','Electrical acceptance and exclusive capacity'],
 ['Dobson fiber delivery','8 October - 5 November 2026 target','Carrier acceptance and performance tests'],
 ['Compute commissioning','After power, cooling and network acceptance','Workload validation and support readiness'],
 ['Revenue and expansion','Model sales begin January 2027','Paid commitments and collected receipts']
 ],[250,390,384],y=196,rowh=65,size=18)
foot('Targets reflect the 10 Sep 2026 owner record and are not completion claims. The financial start date is an assumption, distinct from utility and carrier targets.')

# 17
page('Leadership and advisory team','People')
team=[('Syed Hussain','Chief Executive Officer'),('Yasir Jahangir','Chief Technology Officer'),('Muhammad Siddiqui','Chief Operating Officer'),('Ryan','Director of Operations'),('Daniel','Chief Financial Officer'),('Ken','Legal'),('Javed Iqbal, PhD','Strategic Advisor'),('Shahb Kazmi','Senior Advisor'),('Ali Askara','Graphics and Media Relations')]
for i,(name,role) in enumerate(team):
 x=64+(i%3)*352;y=218+(i//3)*107
 text(name,x,y,23,'Medium',w=320);text(role,x,y+38,17,fill=MUTED,w=320);line(x,y+82,x+314,y+82)
foot('Names and roles supplied by management. No independently verified track records or biographies are represented. ')

# 18
page('A proposed investment framework','Capital and governance',True)
two_blocks([
 ('Funding scope','The 60 + 4 illustration requires $6.84m initially and about $6.95m including later modeled calls. Final raise size, valuation and ownership terms remain open.'),
 ('Proposed investor controls','Release capital against signed procurement and commissioning milestones. Report cash collections, paid hours, downtime, operating costs and reserve coverage monthly.')
 ],y=216)
line(64,452,1088,452)
text('Property and related-party rights',64,476,25,'Medium',w=470)
text('The owner reports $2m gross property value. Title, debt, valuation and rights held by the investment entity require review. No collateral value enters GPU returns.',592,473,20,w=496)
foot('Governance proposals require agreement and documentation. The model has no debt and no negotiated investor waterfall, preferred return or tax treatment.')

# 19
page('Expansion follows demonstrated demand','Campus roadmap')
text('Compute first',64,223,37,'Medium',fill=SIGNAL,w=480)
text('Validate a paid workload and establish reliable service. Choose an initial fleet supported by complete costs and enforceable minimum payments.',64,285,23,w=466)
text('Manufacturing and energy development',592,223,29,'Medium',w=496)
text('Proposed inverter manufacturing, battery assembly, solar and storage each need their own budget and approval.<br/><br/>Customer-owned hosting remains an alternative for separate review. No hosting leases or revenue are assumed.',592,301,22,w=496)
line(64,493,1088,493)
text('No manufacturing, electricity resale, land appreciation or speculative terminal valuation supports the GPU return model.',64,515,23,w=1024)
foot('Development areas are concepts. The reported power agreement does not establish SmartTec ownership of generation assets or a budget for their construction.')

# 20
page('Investment risks and information limits','Diligence')
table(['EXPOSURE','EVIDENCE NEEDED BEFORE INVESTMENT'],[
 ['Demand and rental pricing','Paid commitments, credit quality, renewal economics and service-credit limits'],
 ['Power and engineering','Executed supply terms, continuous kW, cost inclusions and commissioned systems'],
 ['Equipment and operations','Complete OEM quotes, useful life, support, staffing, security and software costs'],
 ['Property and governance','Title, debt, permits, related-party rights, cap table and investor documents'],
 ['Financial evidence','Company financial statements and actual operating records for diligence']
 ],[300,724],y=204,rowh=61,size=20)
foot('Discussion material, not definitive offering terms. Projections are conditional and capital is at risk. This deck contains no audited SmartTec financial statements.')

# 21
page('Financial assumptions','Model appendix',True)
two_blocks([
 ('Revenue and equipment','60 saleable B300 GPUs plus four reserves. Eight systems at $670,000 each. $6.50/GPU-hour, 20 paid hours/day after month 3, flat pricing, 98% collection and 10% selling fees. All equipment purchased upfront.'),
 ('Cash timing and return','Five years from October 2026. Six-month opening operating reserve. $536,000 overhaul in month 37. $40,000 exit cost and zero resale. Costs escalate 3% annually. No debt, tax effects or agreed distribution waterfall.')
 ],y=205)
line(64,450,1088,450)
text('15% annual discount hurdle',64,474,25,'Medium',w=470)
text('NPV discounts project cash flows at 15% annually. Total ROI = (total distributions - total contributions) / total contributions, across five years. IRR is omitted for potentially ambiguous cash flows.',592,473,18,w=496)
foot('Source: SmartTec owner-deployment model and monthly ROI engine. These are planning assumptions, not verified costs, contracted utilization or guaranteed returns.')

# 22
page('Operating-cost assumptions and sources','Evidence appendix',True)
text('Operating-cost basis',64,208,26,'Medium',w=460)
text('$23,200/month fixed operating allowance<br/>$8,075/month network allowance<br/>$4,152/month demand allowance<br/>7¢/kWh energy and PUE 1.4<br/><br/>B300 node planning load: 19.7 kW peak and 15 kW average. Supporting IT adds 2 kW peak and 1 kW average.',64,262,20,w=465)
text('Source register',592,208,26,'Medium',w=496)
sources=[('Management record and financial model','https://www.smarttec.dev/investors#owner-deployment'),('IEA 2026: Key Questions on Energy and AI','https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary'),('NVIDIA DGX B300 facility planning reference','https://docs.nvidia.com/dgx-pdf/data-center-best-practices-with-dgx-b300-v1.pdf')]
for i,(label,url) in enumerate(sources):
 y=260+i*75;text(f'<link href="{url}" color="{FOREST}"><u>{label}</u></link>',592,y,19,w=496)
text('Site and team facts: owner record dated 10 Sep 2026 and supplied BM Surveying plat dated 28 Dec 2025.',592,493,17,w=496)
foot('Fixed costs include $9,000 shared operations, $800 system allowance and $13,400 maintenance. DGX is a power reference, not the selected OEM. Sources checked 11 Sep 2026.')

# 23
page('The next investment discussion','Contact',bg='#123027')
text('A customer-backed fleet.<br/>A verified power agreement.<br/>A funded commissioning plan.',64,214,43,'Medium',w=1024,leading=57)
text('Yasir Jahangir',64,443,30,'Medium',fill=SIGNAL,w=520)
text('Chief Technology Officer',64,487,21,w=520)
text('<link href="mailto:yasir@smarttec.dev" color="#EEF1EF">yasir@smarttec.dev</link><br/><link href="tel:+19185203823" color="#EEF1EF">918-520-3823</link>',592,449,23,w=496)
text('<link href="https://www.smarttec.dev/investors" color="#7BE88A"><u>smarttec.dev/investors</u></link>',592,518,23,w=496)
foot('8460 US 70, Mead, Oklahoma 73449. Explore the editable model, discuss customer commitments and review the supporting documents in the investor room.')
c.save()
data=OUT.read_bytes();digest=hashlib.sha256(data).hexdigest()
meta={'title':'SmartTec Investor Presentation','filename':OUT.name,'reviewedAt':'2026-09-11','pages':PAGE,'bytes':len(data),'sha256':digest,'modelVersion':R.get('modelVersion','1.1.0'),'ownerStudySha256':hashlib.sha256((ROOT/'src/smarttec-investor/data/owner-deployment-study.json').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'engineSha256':hashlib.sha256((ROOT/'src/smarttec-investor/roi-engine.mjs').read_bytes().replace(b'\r\n',b'\n')).hexdigest()}
(ROOT/'src/smarttec-investor/data/investor-deck.json').write_text(json.dumps(meta,indent=2)+'\n')
(ROOT/'src/smarttec-investor/server/investor-deck.mjs').write_text('// Generated by tools/build-investor-deck.py. Server-only authenticated download.\nexport const investorDeckBase64='+json.dumps(base64.b64encode(data).decode())+';\n')
(ROOT/'tmp/pdfs/deck-layout.json').write_text(json.dumps({'titles':TITLES,'boxes':BOXES},indent=2))
print(json.dumps(meta,indent=2))
