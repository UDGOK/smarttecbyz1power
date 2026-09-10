import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/smarttec-investor/data/campus-map.json' with {type:'json'};
import {geojson,localToLngLat,validateRegistration,polygonArea} from '../src/smarttec-investor/map-geometry.mjs';
test('three control points map to exact supplied anchors',()=>{const r=data.registration;assert.deepEqual(localToLngLat([0,0],r),r.northWest);assert.deepEqual(localToLngLat([r.widthFeet,0],r),r.northEast);assert.deepEqual(localToLngLat([0,r.depthFeet],r),r.southWest);});
test('factory written areas and BESS area are preserved',()=>{for(const f of data.features.filter(f=>f.group==='planned'))assert.equal(polygonArea(f.ringFeet),30000);assert.equal(polygonArea(data.features.find(f=>f.id==='bess').ringFeet),2000);});
test('invalid or collinear alignment rejected',()=>{assert.throws(()=>validateRegistration({...data.registration,southWest:data.registration.northEast}));assert.throws(()=>validateRegistration({...data.registration,northWest:[NaN,20]}));});
test('all polygons closed with finite coordinates and illustrative heights',()=>{for(const f of geojson(data).features){const r=f.geometry.coordinates[0];assert.deepEqual(r[0],r.at(-1));assert.ok(r.flat().every(Number.isFinite));assert.ok(f.properties.height>=0);}assert.equal(data.registration.status,'unverified-address-anchor');assert.ok(!data.features.some(f=>/greenhouse/i.test(f.name)));});
