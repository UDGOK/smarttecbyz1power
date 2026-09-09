"""Directional satin and split-satin test digitization; not physically sewn.
Run with requirements-embroidery.txt installed. Coordinates: mm -> PES 0.1 mm.
"""
import json, math, heapq
from pathlib import Path
from collections import Counter
from svgpathtools import parse_path
from shapely.geometry import Polygon, GeometryCollection, LineString, box
from shapely.affinity import scale, translate
from shapely.ops import unary_union
from pyembroidery import EmbPattern, STITCH, JUMP, TRIM, END, COLOR_CHANGE, COMMAND_MASK, write_pes, read_pes
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'embroidery-pes/refined-satin';OUT.mkdir(parents=True,exist_ok=True)
G=json.loads((ROOT/'source/logo-geometry.json').read_text())
def polys(s):
    if s.is_empty:return []
    return [s] if s.geom_type=='Polygon' else [p for p in s.geoms if p.geom_type=='Polygon']
def shape(d):
    result=GeometryCollection()
    for sub in parse_path(d).continuous_subpaths():
        pts=[]
        for seg in sub:
            n=max(1,math.ceil(seg.length()/.7))
            pts.extend((seg.point(i/n).real,seg.point(i/n).imag) for i in range(n))
        result=result.symmetric_difference(Polygon(pts).buffer(0))
    return result.intersection(box(0,0,G['width'],G['mainBottom']))
BASE=[shape(G['paths'][k]) for k in ['white','green']]
BODY=sorted(polys(BASE[0]),key=lambda p:p.bounds[0])

# Art-directed divisions in original artwork coordinates. A section's axis is
# its progression direction: x = vertical satin, y = horizontal satin.
# Mitered divisions in the S change direction at the architectural corners.
def sections(kind):
    result=[]
    def carve(index, regions, default_axis):
        remaining=BODY[index]
        for label,mask,axis in regions:
            region=remaining.intersection(mask)
            result.extend((0,label,p,axis) for p in polys(region) if p.area>.5)
            remaining=remaining.difference(mask)
        result.extend((0,f'body-{index}-remainder',p,default_axis) for p in polys(remaining) if p.area>.5)
    carve(0,[('S-upper-leg',Polygon([(-50,-49),(250,251),(250,400),(-50,400)]),'y')],'x')
    carve(1,[('S-lower-leg',Polygon([(-50,-200),(300,-200),(300,308),(-50,-42)]),'y')],'x')
    if kind=='wordmark':
        carve(2,[('m-left',Polygon([(200,46),(267,113),(267,250),(200,250)]),'y'),('m-middle',box(303,104,352,250),'y'),('m-right',Polygon([(389,113),(450,52),(450,250),(389,250)]),'y')],'x')
        carve(3,[('a-right',box(548,0,620,250),'y'),('a-bowl-left',box(430,120,500,250),'y')],'x')
        carve(4,[('r-stem',box(600,0,661,250),'y')],'x')
        carve(5,[('t-stem',box(710,0,765,250),'y')],'x')
        carve(6,[],'x');carve(7,[],'y')
        carve(8,[('e-left',box(920,0,984,250),'y'),('e-right',box(1041,63,1100,122),'y')],'x')
        carve(9,[('c-left',box(1090,0,1150,250),'y')],'x')
    result.extend((1,'green-core',p,'x') for p in polys(BASE[1]))
    target=BASE if kind=='wordmark' else [unary_union(BODY[:2]),BASE[1]]
    for color in [0,1]:
        union=unary_union([p for c,_,p,_ in result if c==color])
        assert union.symmetric_difference(target[color]).area<1,'Section coverage mismatch'
    return result,target

def columns(poly,axis):
    # Slice independent columns; branching breaks a column instead of crossing a counter.
    def local(x,y):return (x,y) if axis=='x' else (y,x)
    def world(u,v):return (u,v) if axis=='x' else (v,u)
    x0,y0,x1,y1=poly.bounds;lo,hi=(x0,x1) if axis=='x' else (y0,y1)
    n=max(2,math.ceil((hi-lo)/.20)+1);finished=[];active=[]
    for k in range(n):
        u=lo+.015+(hi-lo-.03)*k/(n-1)
        line=LineString([world(u,-1000),world(u,1000)])
        cross=poly.intersection(line)
        segs=[cross] if cross.geom_type=='LineString' else [v for v in getattr(cross,'geoms',[]) if v.geom_type=='LineString']
        rows=[]
        for seg in segs:
            coords=[local(*p) for p in seg.coords];vs=[p[1] for p in coords]
            a,b=min(vs),max(vs)
            if b-a>=.32:rows.append((u,a,b))
        rows.sort(key=lambda row:row[1])
        if len(rows)!=len(active):finished.extend(active);active=[[row] for row in rows]
        else:
            for i,row in enumerate(rows):
                prev=active[i][-1]
                overlap=min(prev[2],row[2])-max(prev[1],row[1])
                if overlap<.12:finished.append(active[i]);active[i]=[row]
                else:active[i].append(row)
    finished.extend(active)
    return [[(world(u,a),world(u,b)) for u,a,b in rows] for rows in finished if len(rows)>=2]

def midpoint(a,b):return ((a[0]+b[0])/2,(a[1]+b[1])/2)
def lerp(a,b,t):return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
class Stitcher:
    def __init__(self,pattern,safe):
        self.p=pattern;self.safe=safe.buffer(.025);self.current=None;self.top_segments=0;self.split_segments=0;self.graph=None
    def direct(self,q,maxlen=2.5,phase=None):
        if self.current is None:
            self.p.add_stitch_absolute(JUMP,q[0]*10,q[1]*10);self.current=q;return
        a=self.current;dist=math.dist(a,q)
        if dist<.045:return
        if phase is not None and dist>6:
            cuts=[];step=4.5;v=step*phase
            while v<dist-.6:
                if v>=.6:cuts.append(v/dist)
                v+=step
            ts=cuts+[1];self.split_segments+=1
        else:ts=[i/max(1,math.ceil(dist/maxlen)) for i in range(1,max(1,math.ceil(dist/maxlen))+1)]
        for t in ts:
            p=lerp(a,q,t);self.p.add_stitch_absolute(STITCH,p[0]*10,p[1]*10)
        self.current=q
    def route(self,q,maxlen=2.5,phase=None):
        if self.current is None or self.safe.covers(LineString([self.current,q])):
            self.direct(q,maxlen,phase);return
        # Rare concave transitions use visibility routing inside this section.
        poly=self.safe.simplify(.015,preserve_topology=True)
        nodes=list(poly.exterior.coords)[:-1]
        for r in poly.interiors:nodes+=list(r.coords)[:-1]
        nodes += [self.current,q];start=len(nodes)-2;end=start+1
        distances={start:0};previous={};queue=[(0,start)]
        while queue:
            cost,i=heapq.heappop(queue)
            if i==end:break
            if cost>distances[i]:continue
            for j,b in enumerate(nodes):
                if i==j:continue
                if not self.safe.buffer(.002).covers(LineString([nodes[i],b])):continue
                d=cost+math.dist(nodes[i],b)
                if d<distances.get(j,float('inf')):
                    distances[j]=d;previous[j]=i;heapq.heappush(queue,(d,j))
        if end not in distances:raise RuntimeError('No safe travel route')
        ids=[end]
        while ids[-1]!=start:ids.append(previous[ids[-1]])
        for i in list(reversed(ids))[1:]:self.direct(nodes[i])
    def run(self,points):
        if len(points)<2:return
        points=list(LineString(points).simplify(.055).coords)
        for q in points:self.route(q)
    def lock(self,a,b):
        d=math.dist(a,b)
        if d<.35:return
        q=lerp(a,b,.3/d)
        for p in [a,q,a,q,a]:self.route(p)
    def column(self,rows):
        centers=[midpoint(a,b) for a,b in rows]
        self.route(centers[0]);self.lock(centers[0],centers[1] if math.dist(centers[0],centers[1])>.35 else centers[-1])
        self.run(centers)
        left=[];right=[]
        for a,b in rows:
            t=min(.35,.3/math.dist(a,b));left.append(lerp(a,b,t));right.append(lerp(b,a,t))
        self.run(list(reversed(left)));self.run(right)
        # Sparse inset zigzag supports loft, followed by the satin cover layer.
        sparse=list(range(len(rows)-1,-1,-6))
        if sparse[-1]!=0:sparse.append(0)
        for j,k in enumerate(sparse):self.route(left[k] if j%2==0 else right[k])
        for j,(a,b) in enumerate(rows):
            # Alternate rails at half pitch: 0.4 mm between same-side penetrations.
            q=a if j%2==0 else b
            self.route(q,maxlen=6,phase=[.2,.45,.7,.95][j%4]);self.top_segments+=1
        q=self.current;self.lock(q,centers[-1])
        self.p.add_command(TRIM);self.current=None

def preview(pattern,file,colors,bounds):
    parts=[[],[]];color=0;prev=None
    for x,y,c in pattern.stitches:
        c &= COMMAND_MASK;q=(x/10,y/10)
        if c==COLOR_CHANGE:color+=1;prev=None
        elif c==STITCH:
            if prev:parts[color].append(f'M{prev[0]:.2f},{prev[1]:.2f}L{q[0]:.2f},{q[1]:.2f}')
            prev=q
        elif c==JUMP:prev=q
        elif c in (TRIM,END):prev=None
    x0,y0,x1,y1=bounds;pad=3;w=x1-x0+6;h=y1-y0+6
    background='#141f1a' if colors[0]=='#eef1ef' else '#f0f0e9'
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1400" viewBox="{x0-pad} {y0-pad} {w} {h}"><rect x="{x0-pad}" y="{y0-pad}" width="{w}" height="{h}" fill="{background}"/>'
    for c,p in zip(colors,parts):svg+=f'<path d="{" ".join(p)}" stroke="{c}" stroke-width=".15" fill="none" stroke-linecap="round"/>'
    file.write_text(svg+'</svg>')

reports=[];construction=[]
for kind,inches in [('wordmark',3),('wordmark',3.25),('monogram',2.5)]:
    sections0,target=sections(kind);b=unary_union(target).bounds;factor=inches*25.4/(b[2]-b[0])
    def transform(s):return translate(scale(s,xfact=factor,yfact=factor,origin=(0,0)),xoff=-(b[0]+b[2])*factor/2,yoff=-(b[1]+b[3])*factor/2)
    transformed=[transform(s) for s in target];limits=unary_union(transformed).bounds
    pattern=EmbPattern();lastcolor=0;split_count=0;column_count=0;nominal_height=(b[3]-b[1])*factor
    for color,label,section,axis in sections0:
        if color!=lastcolor:pattern.add_command(COLOR_CHANGE);lastcolor=color
        nominal=transform(section).simplify(.025,preserve_topology=True)
        # Small baseline pull compensation, bounded to the requested overall width.
        adjusted=nominal.buffer(.12,join_style=1).intersection(box(limits[0],-1000,limits[2],1000))
        for p in polys(adjusted):
            stitcher=Stitcher(pattern,p)
            cols=columns(p,axis)
            for rows in cols:stitcher.column(rows);column_count+=1
            split_count+=stitcher.split_segments
            construction.append({'design':kind,'width_inches':inches,'section':label,'axis':axis,'columns':len(cols),'nominal_bounds_mm':nominal.bounds,'split_satin_spans':stitcher.split_segments})
    pattern.add_command(END)
    for fabric,body in [('dark-fabric','#eef1ef'),('light-fabric','#1c4839')]:
        colors=[body,'#7be88a'];pattern.threadlist=[]
        for c in colors:pattern.add_thread({'color':c,'description':{'#eef1ef':'Off-white','#1c4839':'Forest green','#7be88a':'Signal green'}[c]})
        name=f'smarttec-{kind}-{str(inches).replace(".","p")}in-{fabric}-SATIN-TEST-SEWOUT'
        pattern.extras['name']=name
        file=OUT/(name+'.pes');write_pes(pattern,str(file),{'version':6,'max_stitch':61})
        decoded=read_pes(str(file));cmd=Counter(s[2]&COMMAND_MASK for s in decoded.stitches)
        pts=[s for s in decoded.stitches if s[2]&COMMAND_MASK==STITCH]
        measured=(min(s[0] for s in pts)/10,min(s[1] for s in pts)/10,max(s[0] for s in pts)/10,max(s[1] for s in pts)/10)
        width=measured[2]-measured[0];height=measured[3]-measured[1]
        assert abs(width-inches*25.4)<.25,(name,width)
        assert cmd[COLOR_CHANGE]==1 and cmd[END]==1 and len(decoded.threadlist)==2
        safe=[s.buffer(.24) for s in transformed];prev=None;color=0;bad=0;longest=0;tested=0
        for x,y,c in decoded.stitches:
            c &= COMMAND_MASK;q=(x/10,y/10)
            if c==COLOR_CHANGE:color+=1;prev=None
            elif c==STITCH:
                if prev and prev!=q:
                    longest=max(longest,math.dist(prev,q));tested+=1
                    if not safe[color].covers(LineString([prev,q])):bad+=1
                prev=q
            elif c==JUMP:prev=q
            elif c in (TRIM,END):prev=None
        assert longest<=6.15,(name,longest)
        assert bad==0,(name,'Outside compensated artwork',bad)
        preview(decoded,OUT/(name+'-stitch-preview.svg'),colors,measured)
        report={'file':file.name,'design':kind,'nominal_width_inches':inches,'nominal_height_mm':round(nominal_height,2),'stitch_width_mm':round(width,2),'stitch_height_mm':round(height,2),'stitches':cmd[STITCH],'trims_decoded':cmd[TRIM],'color_changes':cmd[COLOR_CHANGE],'threads':colors,'max_stitch_mm':round(longest,3),'columns':column_count,'split_satin_spans':split_count,'geometry_segments_checked':tested,'outside_compensated_artwork':bad,'geometry_tolerance_mm':.24,'physical_sew_out':False}
        reports.append(report);print(report,flush=True)
(OUT/'stitch-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
(OUT/'construction.json').write_text(json.dumps(construction,indent=2)+'\n')
