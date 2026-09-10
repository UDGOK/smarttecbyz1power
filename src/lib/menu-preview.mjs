/** One image at a time; plain links remain the navigation source of truth. */
export function mountMenuPreview(){
  const menu=document.querySelector('#site-menu');
  if(!menu||menu.dataset.previewMounted)return;menu.dataset.previewMounted='true';
  const image=menu.querySelector('[data-preview-image]'),heading=menu.querySelector('[data-preview-heading]'),caption=menu.querySelector('[data-preview-caption]'),link=menu.querySelector('[data-preview-link]');
  if(!image||!heading||!caption||!link)return;
  const links=[...menu.querySelectorAll('[data-preview-art]')];
  let selected=links.find(item=>item.getAttribute('aria-current')==='page')||links[0],generation=0;
  function show(item){
    if(!item)return;selected=item;const current=++generation;
    links.forEach(node=>node.toggleAttribute('data-preview-active',node===item));
    heading.textContent=item.dataset.previewTitle;caption.textContent=item.dataset.previewNote;link.href=item.getAttribute('href');
    const src=item.dataset.previewArt;
    if(!matchMedia('(min-width: 761px)').matches)return;
    if(image.getAttribute('src')===src&&image.complete&&image.naturalWidth){image.hidden=false;return;}
    image.hidden=true;image.onload=()=>{if(current===generation)image.hidden=false;};image.onerror=()=>{if(current===generation)image.hidden=true;};image.src=src;
    if(image.complete&&image.naturalWidth)image.hidden=false;
  }
  links.forEach(item=>{item.addEventListener('pointerenter',()=>show(item));item.addEventListener('focus',()=>show(item));});
  window.addEventListener('smarttec:menu-change',event=>{if(event.detail?.open)show(selected);});
  window.addEventListener('pagehide',()=>{generation++;image.onload=null;image.onerror=null;});
}
