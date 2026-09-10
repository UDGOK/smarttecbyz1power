// Keep the original survey/map feature, but move its long reference UI out of
// the guided tour. No source data or financial calculation is changed.
export function mountReferencePanel(){
 const section=document.querySelector('#site-map');if(!section||section.parentElement?.id==='sta-reference')return;
 const detail=document.createElement('details');detail.id='sta-reference';detail.className='sta-reference';
 const summary=document.createElement('summary');summary.textContent='Survey and satellite reference';
 section.before(detail);detail.append(summary,section);
 const heading=section.querySelector('.inv-section-heading h2');if(heading)heading.textContent='The survey behind the concept.';
 const marker=section.querySelector('.inv-eyebrow');if(marker)marker.textContent='REFERENCE / NOT A DIGITAL TWIN';
 const align=section.querySelector('#inv-map-align')?.closest('details');
 if(align)align.querySelector('summary').textContent='Technical alignment controls · unverified preview';
 detail.addEventListener('toggle',()=>{if(detail.open)window.dispatchEvent(new Event('resize'));});
 document.querySelectorAll('a[href="#site-map"]').forEach(link=>link.addEventListener('click',()=>{detail.open=true;}));
 if(location.hash==='#site-map')detail.open=true;
}
