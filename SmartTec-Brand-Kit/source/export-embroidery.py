"""Draft garment digitization. Units are mm internally and 0.1 mm in PES.
Requires pyembroidery==1.5.1, shapely==2.0.7, svgpathtools==1.8.0.
No physical sew-out has been performed. See embroidery-pes/READ-ME-FIRST.md.
"""
import json, math, heapq
from pathlib import Path
from collections import Counter
from svgpathtools import parse_path
from shapely.geometry import Polygon, GeometryCollection, LineString, box
from shapely.affinity import scale, translate
from pyembroidery import EmbPattern, STITCH, JUMP, TRIM, END, COLOR_CHANGE, COMMAND_MASK, write_pes, read_pes
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'embroidery-pes'; OUT.mkdir(exist_ok=True)
g=json.loads((ROOT/'source/logo-geometry.json').read_text())
def shape(d):
    result=GeometryCollection()
    for sub in parse_path(d).continuous_subpaths():
        pts=[]
        for seg in sub:
            n=max(1,math.ceil(seg.length()/0.7))
            pts.extend((seg.point(i/n).real,seg.point(i/n).imag) for i in range(n))
        poly=Polygon(pts).buffer(0)
        result=result.symmetric_difference(poly)
    return result.intersection(box(0,0,g['width'],g['mainBottom']))
base=[shape(g['paths'][k]) for k in ['white','green']]
bounds=base[0].union(base[1]).bounds

def polygons(s):
    return [s] if s.geom_type=='Polygon' else [p for p in s.geoms if p.geom_type=='Polygon']

def stitch_component(pattern, poly):
    """Travel between fill rows through the shape using a visibility graph."""
    safe=poly.buffer(.015)
    nodes=list(poly.exterior.coords)[:-1]
    for ring in poly.interiors: nodes.extend(list(ring.coords)[:-1])
    graph=None
    current=None
    def line(a,b):
        n=max(1,math.ceil(math.dist(a,b)/2.5))
        for i in range(1,n+1):
            q=(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n)
            pattern.add_stitch_absolute(STITCH,q[0]*10,q[1]*10)
    def route(a,b):
        nonlocal graph
        if safe.covers(LineString([a,b])): return [a,b]
        if graph is None:
            graph=[[] for _ in nodes]
            for i in range(len(nodes)):
                for j in range(i):
                    if safe.covers(LineString([nodes[i],nodes[j]])):
                        dist=math.dist(nodes[i],nodes[j]);graph[i].append((j,dist));graph[j].append((i,dist))
        vs=nodes+[a,b]; adj=[v[:] for v in graph]+[[],[]]; start=len(nodes); end=start+1
        for index in [start,end]:
            for j in range(len(nodes)):
                if safe.covers(LineString([vs[index],vs[j]])):
                    dist=math.dist(vs[index],vs[j]);adj[index].append((j,dist));adj[j].append((index,dist))
        queue=[(0,start)]; distances={start:0}; prev={}
        while queue:
            cost,i=heapq.heappop(queue)
            if i==end: break
            if cost>distances[i]: continue
            for j,d in adj[i]:
                if cost+d<distances.get(j,float('inf')):
                    distances[j]=cost+d;prev[j]=i;heapq.heappush(queue,(cost+d,j))
        if end not in distances: raise RuntimeError('No interior travel route')
        ids=[end]
        while ids[-1]!=start: ids.append(prev[ids[-1]])
        return [vs[i] for i in reversed(ids)]
    def sew(points):
        nonlocal current
        if not points:return
        if current is None:
            current=points[0];pattern.add_stitch_absolute(JUMP,current[0]*10,current[1]*10)
            # Short repeated stitches along the first path secure the start.
            if len(points)>1:
                b=points[1];dist=math.dist(current,b)
                if dist>.3:
                    q=(current[0]+(b[0]-current[0])*.3/dist,current[1]+(b[1]-current[1])*.3/dist)
                    line(current,q);line(q,current);line(current,q);line(q,current)
        for q in points:
            if math.dist(current,q)<.05:continue
            path=route(current,q)
            for a,b in zip(path,path[1:]):line(a,b)
            current=q
    def fill(region,spacing):
        if region.is_empty:return
        x0,y0,x1,y1=region.bounds
        for row in range(max(1,math.ceil((y1-y0)/spacing))):
            y=y0+spacing*(row+.5)
            cross=region.intersection(LineString([(x0-1,y),(x1+1,y)]))
            lines=[cross] if cross.geom_type=='LineString' else [s for s in getattr(cross,'geoms',[]) if s.geom_type=='LineString']
            lines=sorted(lines,key=lambda s:s.bounds[0],reverse=bool(row%2))
            for segment in lines:
                coords=list(segment.coords)
                if row%2:coords.reverse()
                if segment.length>=.25:sew(coords)
    fill(poly.buffer(-.25),1.2)
    # Edge run retains the approved exterior and counter boundaries.
    sew(list(poly.exterior.coords))
    for ring in poly.interiors:sew(list(ring.coords))
    fill(poly,.4)
    # Secure the end using a short in-shape segment.
    if current:
        point=poly.representative_point(); dest=(point.x,point.y)
        path=route(current,dest)
        if len(path)>1:
            b=path[1];dist=math.dist(current,b)
            if dist>.3:
                q=(current[0]+(b[0]-current[0])*.3/dist,current[1]+(b[1]-current[1])*.3/dist)
                line(current,q);line(q,current);line(current,q)
    pattern.add_command(TRIM)

reports=[]
for inches in [3,3.25]:
    factor=inches*25.4/(bounds[2]-bounds[0])
    shapes=[translate(scale(s,xfact=factor,yfact=factor,origin=(0,0)),xoff=-(bounds[0]+bounds[2])*factor/2,yoff=-(bounds[1]+bounds[3])*factor/2).simplify(.035,preserve_topology=True) for s in base]
    pattern=EmbPattern()
    for i,s in enumerate(shapes):
        if i:pattern.add_command(COLOR_CHANGE)
        for poly in sorted(polygons(s),key=lambda p:p.bounds[0]):stitch_component(pattern,poly)
    pattern.add_command(END)
    for fabric,body in [('dark-fabric','#eef1ef'),('light-fabric','#1c4839')]:
        pattern.threadlist=[]
        pattern.add_thread({'color':body,'description':'Off-white' if fabric=='dark-fabric' else 'Forest green'})
        pattern.add_thread({'color':'#7be88a','description':'Signal green'})
        name=f'smarttec-wordmark-{str(inches).replace(".","p")}in-{fabric}-TEST-SEWOUT'
        pattern.extras['name']=name
        file=OUT/(name+'.pes')
        write_pes(pattern,str(file),{'version':6,'max_stitch':30})
        read=read_pes(str(file))
        points=[s for s in read.stitches if s[2]&COMMAND_MASK==STITCH]
        xs=[s[0] for s in points];ys=[s[1] for s in points]
        width=(max(xs)-min(xs))/10;height=(max(ys)-min(ys))/10
        assert abs(width-inches*25.4)<.2,(width,inches)
        assert len(read.threadlist)==2
        commands=Counter(s[2]&COMMAND_MASK for s in read.stitches)
        assert commands[COLOR_CHANGE]==1 and commands[END]==1
        prev=None; max_length=0; segments=[[],[]];color=0
        for x,y,c in read.stitches:
            c &= COMMAND_MASK
            if c==COLOR_CHANGE:color+=1;prev=None
            elif c==STITCH:
                if prev is not None:
                    max_length=max(max_length,math.dist(prev,(x,y))/10)
                    segments[color].append(f'M{prev[0]/10:.2f},{prev[1]/10:.2f}L{x/10:.2f},{y/10:.2f}')
                prev=(x,y)
            elif c in [TRIM,END]:prev=None
            elif c==JUMP:prev=(x,y)
        assert max_length<=3.15,max_length
        bg='#141f1a' if fabric=='dark-fabric' else '#f0f0e9'
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-width/2-3} {-height/2-3} {width+6} {height+6}" width="1400"><rect x="{-width/2-3}" y="{-height/2-3}" width="{width+6}" height="{height+6}" fill="{bg}"/>'
        for col,paths in zip([body,'#7be88a'],segments):svg+=f'<path d="{" ".join(paths)}" fill="none" stroke="{col}" stroke-width=".14" stroke-linecap="round"/>'
        (OUT/(name+'-stitch-preview.svg')).write_text(svg+'</svg>')
        reports.append({'file':file.name,'width_mm':round(width,2),'height_mm':round(height,2),'width_inches':inches,'stitches':commands[STITCH],'trims_decoded':commands[TRIM],'color_changes':commands[COLOR_CHANGE],'max_stitch_mm':round(max_length,3),'threads':[body,'#7be88a'],'pes_version':6,'physical_sew_out':False})
        print(reports[-1],flush=True)
(OUT/'stitch-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
