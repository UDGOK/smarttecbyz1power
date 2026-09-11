import {pitchMedia} from './pitch-media.mjs';
import {privateHeaders,json} from './auth.mjs';

// This helper must only be called after the request's session is authenticated.
// One byte range is sufficient for browser media seeking; multipart ranges are rejected.
export function pitchMediaResponse(request,action){
  if(!action.startsWith('pitch-'))return null;
  if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405,{Allow:'GET, HEAD'});
  const asset=Object.hasOwn(pitchMedia,action)?pitchMedia[action]:null;
  if(!asset)return json({error:'Media not found.'},404);
  const headers={...privateHeaders,'Cross-Origin-Resource-Policy':'same-origin','Content-Type':asset.mime,'Accept-Ranges':'bytes','Content-Length':String(asset.bytes),ETag:`"${asset.sha256}"`};
  // RFC 9110 §14.2: Range applies to GET and must be ignored for other methods.
  if(request.method==='HEAD')return new Response(null,{headers});
  const raw=request.headers.get('range');
  const ifRange=request.headers.get('if-range');
  if(raw===null||(ifRange!==null&&ifRange!==headers.ETag))return new Response(Buffer.from(asset.base64,'base64'),{headers});
  // Unknown range units must be ignored; malformed byte ranges are rejected below.
  if(/^[!#$%&'*+.^_`|~0-9a-z-]+=/i.test(raw.trim())&&!/^bytes=/i.test(raw.trim()))return new Response(Buffer.from(asset.base64,'base64'),{headers});
  const match=/^bytes=(\d*)-(\d*)$/i.exec(raw.trim());
  let start,end;
  if(match&&(match[1]||match[2])){
    if(match[1]){
      start=Number(match[1]);
      end=match[2]?Number(match[2]):asset.bytes-1;
    }else{
      const suffix=Number(match[2]);
      if(Number.isSafeInteger(suffix)&&suffix>0){start=Math.max(0,asset.bytes-suffix);end=asset.bytes-1;}
    }
  }
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=asset.bytes||end<start){
    return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${asset.bytes}`,'Content-Length':'0'}});
  }
  end=Math.min(end,asset.bytes-1);
  const bytes=Buffer.from(asset.base64,'base64').subarray(start,end+1);
  return new Response(bytes,{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${asset.bytes}`,'Content-Length':String(bytes.length)}});
}
