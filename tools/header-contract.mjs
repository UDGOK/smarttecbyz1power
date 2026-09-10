import assert from 'node:assert/strict';

/** Shared visible markup contract; this deliberately does not claim visual QA. */
export function headerSignature(html){
  assert.equal((html.match(/\bdata-site-header\b/g)||[]).length,1,'one shared header');
  const header=html.match(/<header\b[^>]*\bdata-site-header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
  assert.ok(header,'shared header rendered');
  assert.match(header,/data-header-version="2"/);
  const brand=header.match(/<a\b[^>]*class="brandmark"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(brand,'approved homepage symbol in header');
  assert.match(brand,/viewBox="0 0 204 215"/);
  const toggle=header.match(/<button\b[^>]*id="menu-toggle"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(toggle,'homepage menu button in header');
  assert.match(toggle,/aria-haspopup="dialog"/);assert.match(toggle,/>Menu<\/span>/);
  for(const id of ['menu-toggle','site-menu','site-menu-close'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'one '+id);
  assert.ok(!html.includes('id="inv-menu-open"'),'old investor menu removed');
  assert.ok(!html.includes('class="nav" data-nav'),'old public header removed');
  return {brand,toggle};
}
