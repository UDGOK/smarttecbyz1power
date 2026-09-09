// Diagram coordinates: feet east/south of conceptual NW parcel corner.
// These are presentation geometry, not legal/cadastral coordinate calculations.
const FT=0.3048;
export function localToLngLat([x,y],registration){
 const {northWest,northEast,southWest,widthFeet,depthFeet}=registration;
 return [northWest[0]+x/widthFeet*(northEast[0]-northWest[0])+y/depthFeet*(southWest[0]-northWest[0]),northWest[1]+x/widthFeet*(northEast[1]-northWest[1])+y/depthFeet*(southWest[1]-northWest[1])];
}
export function validateRegistration(r){if(!r||![r.northWest,r.northEast,r.southWest].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85)||!(r.widthFeet>0&&r.depthFeet>0))throw new Error('Three valid longitude/latitude corners and positive dimensions are required.');const a=[r.northEast[0]-r.northWest[0],r.northEast[1]-r.northWest[1]],b=[r.southWest[0]-r.northWest[0],r.southWest[1]-r.northWest[1]];if(Math.abs(a[0]*b[1]-a[1]*b[0])<1e-10)throw new Error('Control points are collinear.');return r;}
export function geojson(data,registration=data.registration){validateRegistration(registration);return {type:'FeatureCollection',features:data.features.map(f=>({type:'Feature',id:f.id,properties:{id:f.id,name:f.name,group:f.group,status:f.status,description:f.description,color:f.color,height:(f.displayHeightFeet||0)*FT},geometry:{type:'Polygon',coordinates:[f.ringFeet.map(p=>localToLngLat(p,registration))]}}))};}
export function bounds(features){const pts=features.features.flatMap(f=>f.geometry.coordinates[0]);return [[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]];}
export function polygonArea(ring){return Math.abs(ring.reduce((sum,p,i)=>{const n=ring[(i+1)%ring.length];return sum+p[0]*n[1]-n[0]*p[1];},0))/2;}
