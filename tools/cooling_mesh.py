"""Geometry helpers for schematic equipment, not OEM CAD. Python standard library only."""
import math,json,struct
shapes=[]
def poly(vertices,faces,color,name,group):
    shapes.append(dict(v=vertices,f=faces,c=color,n=name,g=group))
def box(center,size,color,name,group):
    x,y,z=center;a,b,c=[v/2 for v in size]
    v=[[x+i*a,y+j*b,z+k*c] for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    poly(v,[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]],color,name,group)
def cyl(x,y,z,r,h,color,name,group,N=20):
    v=[[x+r*math.cos(i*2*math.pi/N),y+j*h,z+r*math.sin(i*2*math.pi/N)] for j in [0,1] for i in range(N)]
    f=[list(range(N-1,-1,-1)),list(range(N,2*N))]+[[i,(i+1)%N,(i+1)%N+N,i+N] for i in range(N)]
    poly(v,f,color,name,group)

def glb(meshes,path):
    doc={'asset':{'version':'2.0','generator':'SmartTec schematic model generator','copyright':'Concept model; not Vertiv OEM CAD'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[]}
    blob=bytearray();mats={}
    def accessor(vals,kind,comp):
        while len(blob)%4:blob.append(0)
        off=len(blob);blob.extend(struct.pack('<'+'f'*len(vals),*vals))
        vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(vals)*4})
        a={'bufferView':vi,'componentType':5126,'count':len(vals)//comp,'type':kind}
        if kind=='VEC3':a.update(min=[min(vals[i::3]) for i in range(3)],max=[max(vals[i::3]) for i in range(3)])
        doc['accessors'].append(a);return len(doc['accessors'])-1
    for e in meshes:
        col=e['c']
        if col not in mats:
            mats[col]=len(doc['materials']);rgb=[int(col[i:i+2],16)/255 for i in (1,3,5)]
            doc['materials'].append({'name':col,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':rgb+[1],'metallicFactor':.25,'roughnessFactor':.65}})
        pts=[];norm=[]
        for f in e['f']:
            for i in range(1,len(f)-1):
                vs=[e['v'][j] for j in (f[0],f[i],f[i+1])];u=[vs[1][j]-vs[0][j] for j in range(3)];v=[vs[2][j]-vs[0][j] for j in range(3)]
                n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];l=math.sqrt(sum(x*x for x in n)) or 1;n=[x/l for x in n]
                for p in vs:pts.extend(p);norm.extend(n)
        pi=accessor(pts,'VEC3',3);ni=accessor(norm,'VEC3',3)
        doc['meshes'].append({'name':e['n'],'primitives':[{'attributes':{'POSITION':pi,'NORMAL':ni},'material':mats[col]}]})
        doc['nodes'].append({'name':e['g']+' / '+e['n'],'mesh':len(doc['meshes'])-1,'extras':{'category':e['g']}});doc['scenes'][0]['nodes'].append(len(doc['nodes'])-1)
    doc['buffers'][0]['byteLength']=len(blob);js=json.dumps(doc,separators=(',',':')).encode();js+=b' ' *((-len(js))%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(blob))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
