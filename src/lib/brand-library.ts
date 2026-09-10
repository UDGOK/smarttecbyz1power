import {BRAND_ROOT, visuals, marks, variants, files} from '../data/brand-library';

export function initBrandLibrary(): void {
  const root=document.querySelector<HTMLElement>('.brand-studio');
  if(!root || root.dataset.ready) return;
  root.dataset.ready='true';
  const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
  const search=$<HTMLInputElement>('#brand-search'),format=$<HTMLSelectElement>('#brand-format');
  const cards=Array.from(root.querySelectorAll<HTMLElement>('[data-brand-asset]'));
  const filters=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-brand-category]'));
  const dialog=$<HTMLDialogElement>('#brand-viewer'),stage=$<HTMLDivElement>('[data-viewer-stage]');
  const background=$<HTMLSelectElement>('[data-viewer-background]');
  let category='all',active=0,opener:HTMLElement|null=null;
  let visible=cards.map((_,index)=>index);
  $('[data-library-tools]').hidden=false;
  $('[data-file-search-label]').hidden=false;

  function filter(){
    const terms=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    visible=[];
    cards.forEach((card,index)=>{
      const matches=(category==='all'||card.dataset.category===category) && (format.value==='all'||card.dataset.format===format.value)
        && terms.every(term=>card.dataset.search!.includes(term));
      card.hidden=!matches;if(matches)visible.push(index);
    });
    filters.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.brandCategory===category)));
    $('[data-library-count]').textContent=`${visible.length} of ${visuals.length} previews`;
    $('[data-library-empty]').hidden=visible.length>0;
  }
  search.addEventListener('input',filter);format.addEventListener('change',filter);
  filters.forEach(button=>button.addEventListener('click',()=>{category=button.dataset.brandCategory!;filter();}));
  root.querySelectorAll('[data-library-reset]').forEach(button=>button.addEventListener('click',()=>{category='all';search.value='';format.value='all';filter();}));

  const fileSearch=$<HTMLInputElement>('#brand-file-search');
  fileSearch.addEventListener('input',()=>{
    const terms=fileSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);let count=0;
    root.querySelectorAll<HTMLElement>('[data-file-row]').forEach(row=>{row.hidden=!terms.every(term=>row.dataset.search!.includes(term));if(!row.hidden)count++;});
    $('[data-file-count]').textContent=count?`${count} of ${files.length} files`:'No matching files. Try another name or format.';
  });

  function setSurface(){stage.dataset.surface=background.value==='auto'?visuals[active].surface:background.value;}
  function clearMedia(){
    stage.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.load();});
    stage.replaceChildren();
  }
  function show(index:number){
    active=index;const asset=visuals[index];clearMedia();setSurface();
    let media:HTMLVideoElement|HTMLImageElement;
    if(asset.kind==='video'){
      media=document.createElement('video');media.controls=true;media.playsInline=true;media.preload='metadata';media.poster=asset.poster;media.src=asset.url;media.setAttribute('aria-label',asset.title);
      // Playback remains an explicit action, including for reduced-motion users.
    }else{
      media=document.createElement('img');media.alt=asset.title;media.src=asset.kind==='gif'?asset.poster:asset.url;
      if(asset.kind==='gif'){
        const toggle=document.createElement('button');toggle.type='button';toggle.className='brand-gif-toggle';toggle.textContent='Play GIF';toggle.setAttribute('aria-pressed','false');
        let playing=false;
        toggle.addEventListener('click',()=>{playing=!playing;(media as HTMLImageElement).src=playing?asset.url:asset.poster;toggle.textContent=playing?'Pause GIF':'Play GIF';toggle.setAttribute('aria-pressed',String(playing));});
        stage.append(toggle);
      }
    }
    media.addEventListener('error',()=>{const note=document.createElement('p');note.className='brand-media-error';note.textContent='This browser could not preview the file. You can still download the original below.';stage.append(note);},{once:true});
    stage.prepend(media);
    $('#brand-viewer-title').textContent=asset.title;
    $('[data-viewer-note]').textContent=asset.note;
    $('[data-viewer-file]').textContent=`${asset.format} · ${asset.size} · ${asset.path}`;
    const download=$<HTMLAnchorElement>('[data-viewer-download]');download.href=asset.url;download.download=asset.path.split('/').at(-1)!;download.textContent=`Download ${asset.format} ↓`;
    const related=$('[data-viewer-related]');related.replaceChildren();
    for(const file of asset.related){const link=document.createElement('a');link.href=file.url;link.download='';link.className='brand-button brand-button--quiet';link.textContent='Download PES draft ↓';related.append(link);}
    $('[data-viewer-position]').textContent=`${visible.indexOf(index)+1} / ${visible.length}`;
    $<HTMLButtonElement>('[data-viewer-prev]').disabled=visible.length<2;
    $<HTMLButtonElement>('[data-viewer-next]').disabled=visible.length<2;
  }
  root.querySelectorAll<HTMLAnchorElement>('[data-open-preview]').forEach(link=>link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||typeof dialog.showModal!=='function')return;
    event.preventDefault();opener=link;background.value='auto';show(Number(link.dataset.openPreview));dialog.showModal();
    document.documentElement.classList.add('brand-viewer-open');$<HTMLButtonElement>('[data-viewer-close]').focus();
  }));
  function step(direction:number){const index=visible.indexOf(active);if(visible.length)show(visible[(index+direction+visible.length)%visible.length]);}
  $('[data-viewer-prev]').addEventListener('click',()=>step(-1));$('[data-viewer-next]').addEventListener('click',()=>step(1));
  $('[data-viewer-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{clearMedia();document.documentElement.classList.remove('brand-viewer-open');opener?.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('keydown',event=>{if((event.target as HTMLElement).closest('video,input,select'))return;if(event.key==='ArrowRight'){event.preventDefault();step(1);}if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}});
  background.addEventListener('change',setSurface);

  function updateLogo(){
    const mark=marks.find(m=>m.id===$<HTMLInputElement>('input[name="brand-mark"]:checked').value)!;
    const variant=variants.find(v=>v.id===$<HTMLInputElement>('input[name="brand-variant"]:checked').value)!;
    const file=`smarttec-${mark.id}-${variant.id}`;
    const image=$<HTMLImageElement>('[data-logo-image]');image.src=`${BRAND_ROOT}/logos/svg/${file}.svg`;image.alt=`SmartTec ${mark.name}, ${variant.name}`;
    $('[data-logo-surface]').dataset.logoSurface=variant.surface;
    $('[data-logo-label]').textContent=`${mark.name} / ${variant.name}`;
    $('[data-logo-ground]').textContent=variant.surface==='light'?'Preview on off-white':'Preview on forest';
    $('[data-logo-note]').textContent=mark.note;
    const downloads=$('[data-logo-downloads]');downloads.replaceChildren();
    for(const [format,path,note] of [['SVG',`logos/svg/${file}.svg`,'Web & scalable design'],['PNG',`logos/png/${file}-${mark.id==='symbol'?'1024':'2400'}.png`,`${mark.id==='symbol'?'1024':'2400'} px · transparent`],['EPS',`logos/eps/${file}.eps`,'Print & signage']]){
      const link=document.createElement('a');link.href=`${BRAND_ROOT}/${path}`;link.download='';link.setAttribute('aria-label',`Download ${mark.name}, ${variant.name}, ${format}`);
      const type=document.createElement('b');type.textContent=format;const hint=document.createElement('span');hint.textContent=note;const arrow=document.createElement('span');arrow.textContent='↓';arrow.setAttribute('aria-hidden','true');link.append(type,hint,arrow);downloads.append(link);
    }
  }
  root.querySelectorAll('[data-logo-studio] input').forEach(input=>input.addEventListener('change',updateLogo));

  root.querySelectorAll<HTMLButtonElement>('[data-copy-colour]').forEach(button=>button.addEventListener('click',async()=>{
    const hex=button.dataset.copyColour!;
    try{await navigator.clipboard.writeText(hex);$('[data-copy-status]').textContent=`${hex} copied to clipboard.`;}
    catch{const range=document.createRange();range.selectNodeContents(button.querySelector('[data-colour-hex]')!);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);$('[data-copy-status]').textContent=`Copy unavailable. ${hex} is selected; copy it manually.`;}
  }));

  const hero=$<HTMLVideoElement>('#brand-hero-video'),heroButton=$<HTMLButtonElement>('[data-hero-play]');
  heroButton.hidden=false;
  const heroLabel=()=>{heroButton.textContent=hero.paused?'Play motion ▷':'Pause motion Ⅱ';heroButton.setAttribute('aria-pressed',String(!hero.paused));};
  heroButton.addEventListener('click',async()=>{if(!hero.paused){hero.pause();return;}try{await hero.play();}catch{heroButton.textContent='Preview unavailable';heroButton.disabled=true;}});
  hero.addEventListener('play',heroLabel);hero.addEventListener('pause',heroLabel);
  const pauseMotion=()=>{hero.pause();stage.querySelectorAll('video').forEach(video=>video.pause());};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseMotion();});
  window.addEventListener('pagehide',()=>{pauseMotion();if(dialog.open)dialog.close();});
  if(typeof IntersectionObserver!=='undefined')new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)hero.pause();}).observe(hero);
  updateLogo();filter();
}
