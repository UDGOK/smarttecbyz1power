// Public UI metadata; assets are served only after authentication.
export const chapters = {
  manufacturing: {
    label:'Manufacturing', number:'01', title:'Built around power.',
    text:'Two planned manufacturing buildings. This close-up studies one hall; it does not depict completed construction.',
    fact:'2 × 30,000 sq ft · planned', status:'PROPOSED DEVELOPMENT',
    image:'concept-manufacturing', alt:'AI architectural concept of a proposed manufacturing hall with forest-green accents; not a site photograph',
    model:'module-factory', target:[0,4,0], camera:[70,29,-83], distance:[18,180],
    modelNote:'Single-hall 3D study. Proposed 150 × 200 ft footprint; appearance and height are illustrative.'
  },
  compute: {
    label:'First compute', number:'02', title:'Eight systems. One building.',
    text:'The current proposal is 64 B300 GPUs in eight complete Supermicro systems, together in one building with all-new direct liquid cooling. The earlier rack image is illustrative; customer commitments, full costs and engineering acceptance precede procurement.',
    fact:'64 B300 GPUs · proposed', status:'PROCUREMENT AND COMMISSIONING AHEAD',
    image:'concept-compute', alt:'AI concept of a small equipment room with one rack and two GPU server chassis; not installed equipment',
    model:'module-rack', target:[0,1.15,0], camera:[2.9,2.2,-4.0], distance:[1.7,12],
    modelNote:'Earlier RTX-only rack study with two illustrative chassis. It does not depict the proposed eight-system B300 fleet, an OEM specification or a surveyed room.'
  },
  energy: {
    label:'Energy', number:'03', title:'Room for the next phase.',
    text:'Tract 3 is reserved for proposed solar and storage. A separate storage location may use space on Tract 2, subject to design and approval.',
    fact:'18.20-acre Tract 3 · proposed', status:'CONCEPT / NOT SIZED',
    image:'concept-energy', alt:'AI concept of two battery enclosures beside illustrative solar rows; no installed capacity is asserted',
    model:'module-energy', target:[0,1,2], camera:[31,15,-34], distance:[8,100],
    modelNote:'Generic storage and solar assembly. Equipment count does not establish MW, MWh, capacity or setbacks.'
  },
  cooling: {
    label:'Cooling', number:'04', title:'Two loops. Different duties.',
    text:'The proposed B300 fleet requires all-new liquid and residual-air cooling in one building. This earlier two-loop exhibit shows one option; new and warranted refurbished plant, room cooling versus rear doors, and optional staged dry coolers are being compared.',
    fact:'All-new cooling · options under review', status:'EQUIPMENT STUDY / SITING PENDING',
    image:'thermal-preview', alt:'Geometry-rendered two-loop cooling study with dry coolers, trim chiller, scroll chillers, CDUs, buffer tank and a generator docking pad; not installed equipment',
    model:'thermal-model', target:[2,1,0], camera:[29,25,33], distance:[12,95],
    modelNote:'Earlier equipment study, not a selected bill of quantities. Separately controlled circuits may share a plant. Mechanical review establishes equipment, placement, clearances and redundancy.'
  },
  overview: {
    label:'Campus layout', number:'05', title:'One property. Three roles.',
    text:'8460 US 70, Mead, Oklahoma. The current legal parcel is 39.39 acres. This earlier owner-marked concept retains historical survey tract labels totaling 39.21 acres.',
    fact:'39.39-acre legal parcel', status:'EARLIER OWNER-MARKED CONCEPT',
    image:'architecture-overview', alt:'Geometry-rendered overview of the owner-marked campus concept, showing manufacturing, existing structures and an illustrative solar zone',
    model:'architecture-model', target:[100,0,360], camera:[700,770,-320], distance:[50,1800],
    modelNote:'Historical traced geometry is unchanged. Tract annotations total 39.21 acres, distinct from the current 39.39-acre legal parcel. Not a georeferenced overlay or approved site plan.'
  }
};
export const imageDisclosure = key => ['overview','cooling'].includes(key)
  ? 'MODEL PREVIEW · APPROXIMATE GEOMETRY'
  : 'AI ARCHITECTURAL CONCEPT · NOT A SITE PHOTO';
