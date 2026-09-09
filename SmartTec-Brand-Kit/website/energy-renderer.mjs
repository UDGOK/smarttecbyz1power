/** SmartTec particle identity renderer. No dependencies, network calls, or app globals.
 * Browser and offline exports share this deterministic 12-second loop.
 * createSurface(width,height) must return a Canvas-compatible surface.
 */
export const LOOP_SECONDS=12;
export function createEnergyRenderer(canvas,logo,createSurface,{intensity='website',speed=1,transparent=false}={}){
  const ctx=canvas.getContext('2d');
  let W=canvas.width,H=canvas.height,ratio=1;
  const config={intensity,speed,transparent};
  let seed=917;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const source=createSurface(logo.width,logo.height),sc=source.getContext('2d');sc.drawImage(logo,0,0);
  const data=sc.getImageData(0,0,source.width,source.height).data;
  const points=[];let gx=0,gy=0,gn=0;
  for(let y=0;y<source.height;y+=3)for(let x=0;x<source.width;x+=3){const k=(y*source.width+x)*4;if(data[k+3]>180){const green=data[k+1]>data[k]*1.18;if(green){gx+=x;gy+=y;gn++;}points.push({x:x/source.width,y:y/source.height,green});}}
  for(let i=points.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[points[i],points[j]]=[points[j],points[i]];}
  const targets=points.slice(0,2100).map(p=>({...p,delay:p.x*.68+random()*.32,angle:random()*Math.PI*2,r:random()}));
  const core={x:gn?gx/gn/source.width:.08,y:gn?gy/gn/source.height:.35};
  const dust=Array.from({length:125},()=>({x:random(),y:random(),z:random(),phase:random()*Math.PI*2}));
  const currents=Array.from({length:104},(_,i)=>({lane:i%9-4,phase:random(),cycles:i%5===0?1:2+i%2,neutral:i%5===0,size:.6+random()*.8}));
  function sprite(rgb){const c=createSurface(40,40),g=c.getContext('2d'),a=g.createRadialGradient(20,20,0,20,20,20);a.addColorStop(0,`rgba(${rgb},1)`);a.addColorStop(.1,`rgba(${rgb},.9)`);a.addColorStop(.3,`rgba(${rgb},.2)`);a.addColorStop(1,`rgba(${rgb},0)`);g.fillStyle=a;g.fillRect(0,0,40,40);return c;}
  const greenSprite=sprite('123,232,138'),whiteSprite=sprite('226,245,233');
  function resize(width,height,pixelRatio=1){W=width;H=height;ratio=pixelRatio;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
  function layout(){const w=W*.84,h=w*source.height/source.width,x=(W-w)/2,y=H*.47-h*.5;return{x,y,w,h,cx:x+w*core.x,cy:y+h*core.y};}
  function bez(a,b,c,d,t){const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;}
  function flow(t,lane,l){const spread=config.intensity==='conference'?1.2:.85;if(t<.35){const p=t/.35;return{x:bez(-W*.15,W*.03,l.cx-W*.09,l.cx,p),y:bez(H*.5+lane*H*.085*spread,l.cy+lane*H*.07,l.cy+lane*H*.035,l.cy,p)};}const p=(t-.35)/.65;return{x:bez(l.cx,W*.38,W*.77,W*1.12,p),y:bez(l.cy,l.cy+lane*H*.04,l.cy+lane*H*.068*spread,H*.5+lane*H*.09*spread,p)};}
  function dot(x,y,size,alpha,neutral=false){ctx.globalAlpha=alpha;ctx.drawImage(neutral?whiteSprite:greenSprite,x-size*6,y-size*6,size*12,size*12);ctx.globalAlpha=1;}
  function background(l,u){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);if(config.transparent)return;
    ctx.fillStyle='#1c4839';ctx.fillRect(0,0,W,H);const glow=ctx.createRadialGradient(l.cx,l.cy,0,l.cx,l.cy,W*.8);glow.addColorStop(0,'#23543d');glow.addColorStop(.6,'#1c4839');glow.addColorStop(1,'#102f25');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#a2e2b70b';ctx.lineWidth=.6;for(let i=0;i<8;i++){const yy=H*.69+i*i*H/140;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W,yy);ctx.stroke();}for(let i=-5;i<=7;i++){ctx.beginPath();ctx.moveTo(W*.5,H*.6);ctx.lineTo(W*.5+i*W*.22,H*1.5);ctx.stroke();}
    for(const p of dust){const x=p.x*W+Math.sin(u*Math.PI*2+p.phase)*7,y=p.y*H+Math.cos(u*Math.PI*2+p.phase)*5;ctx.fillStyle=`rgba(204,244,218,${.1+p.z*.22})`;ctx.beginPath();ctx.arc(x,y,.3+p.z*.65,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#abefbd12';ctx.lineWidth=.65;for(let lane=-4;lane<=4;lane+=2){ctx.beginPath();for(let i=0;i<=70;i++){const p=flow(i/70,lane,l);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.stroke();}}
  function orbit(l,u,front){const radius=Math.min(W*.095,H*.15),wide=config.intensity==='conference'?1.24:1;for(let j=0;j<3;j++){const tilt=[-.65,.7,0][j],rx=radius*(1+j*.18)*wide,ry=radius*(.37+j*.055);if(!front){ctx.save();ctx.translate(l.cx,l.cy);ctx.rotate(tilt);ctx.strokeStyle='#a5f4b519';ctx.lineWidth=.65;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.stroke();ctx.restore();}for(let k=0;k<3;k++){const a=u*Math.PI*2*(j%2?-1:2)+k*Math.PI*2/3+j;if((Math.sin(a)>0)!==front)continue;const ex=Math.cos(a)*rx,ey=Math.sin(a)*ry;dot(l.cx+ex*Math.cos(tilt)-ey*Math.sin(tilt),l.cy+ex*Math.sin(tilt)+ey*Math.cos(tilt),j===1?1.7:1.2,.65,j===1);}}}
  function stream(l,u,front){const total=config.intensity==='conference'?104:64;for(let i=0;i<total;i++){const p=currents[i];if((i%3===0)!==front)continue;const t=(p.phase+u*p.cycles)%1,point=flow(t,p.lane,l),bright=front?.55:.72,tail=p.neutral?.009:.022;ctx.lineWidth=p.neutral?.8:.7;for(let k=6;k>0;k--){const a=flow(Math.max(0,t-tail*k/6),p.lane,l),b=flow(Math.max(0,t-tail*(k-1)/6),p.lane,l);ctx.strokeStyle=p.neutral?`rgba(222,244,230,${(1-k/7)*bright*.48})`:`rgba(123,232,138,${(1-k/7)*bright*.55})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}dot(point.x,point.y,p.size*(p.neutral?1.25:1),bright,p.neutral);}}
  function render(time,{formation=false,staticFrame=false,caption=false}={}){
    const t=time*config.speed,u=staticFrame?.25:((t%LOOP_SECONDS)+LOOP_SECONDS)%LOOP_SECONDS/LOOP_SECONDS,l=layout();
    background(l,u);orbit(l,u,false);stream(l,u,false);
    const intro=formation?t:8,solid=smooth((intro-3.1)/1.8);ctx.globalAlpha=solid;ctx.drawImage(source,l.x,l.y,l.w,l.h);ctx.globalAlpha=1;
    if(intro<5.8){const density=W<480?2:1;for(let i=0;i<targets.length;i+=density){const p=targets[i],progress=clamp((intro-p.delay)/3.65),ease=1-Math.pow(1-progress,3),tx=l.x+p.x*l.w,ty=l.y+p.y*l.h,spin=p.angle+progress*3.2,radius=(1-ease)*(.3+p.r)*W*.54,x=mix(l.cx+Math.cos(spin)*radius,tx,ease),y=mix(l.cy+Math.sin(spin)*radius*.48,ty,ease),alpha=(1-smooth((intro-4.05)/1.4))*(.38+p.r*.55);ctx.fillStyle=p.green?`rgba(123,232,138,${alpha})`:`rgba(224,246,230,${alpha})`;ctx.beginPath();ctx.arc(x,y,(.55+p.r*.6)*(W<480?.8:1),0,Math.PI*2);ctx.fill();if(i%27===0)dot(x,y,.8,alpha*.8,!p.green);}}
    if(solid>.65){const beat=.5+.5*Math.sin(u*Math.PI*4);dot(l.cx,l.cy,3.3+beat*1.8,.18+beat*.09);}
    stream(l,u,true);orbit(l,u,true);
    if(caption){ctx.fillStyle='#d4e8d9';ctx.textAlign='center';ctx.font=`${Math.round(W*.022)}px Arial`;ctx.fillText('DATA CENTERS  ·  COLOCATION',W*.5,Math.max(H*.72,l.y+l.h+H*.09));ctx.fillStyle='#9ac9ac';ctx.font=`${Math.round(W*.013)}px Arial`;ctx.fillText('SMARTTEC BY Z1POWER',W*.5,H*.91);}
  }
  return {render,resize,config,get width(){return W;},get height(){return H;},destroy(){targets.length=0;points.length=0;}};
}
