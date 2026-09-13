import snapshot from '../data/investor-model-v6-1.json' with {type:'json'};

// One reviewed workbook snapshot supplies all live financial copy. Calculations
// are audited offline in native Excel; presentation never invents a new engine.
export const model=snapshot;
export const assumptions=model.assumptions;
export const scenario=id=>{const item=model.scenarios.find(item=>item.id===id);if(!item)throw new Error('Unknown reviewed model scenario');return item;};
export const base=scenario('base');
export const contracted=scenario('contracted-60');
export const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
export const rate=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export const pct=(value,digits=2)=>value===null?'Not resolved':(value*100).toFixed(digits)+'%';
export const millions=value=>'$'+(value/1e6).toFixed(2)+'m';
export const serviceLines=[
 {name:'Shared inference capacity',tenancy:'Multi-tenant',ownership:'SmartTec-owned equipment',description:'GPU capacity shared across inference customers with workload isolation. Revenue is billed capacity or contracted compute service; no token-volume or per-token sales forecast is included.'},
 {name:'Dedicated GPU servers',tenancy:'Single-tenant',ownership:'SmartTec-owned equipment',description:'Complete GPU servers reserved for one customer requiring isolation. Configuration, acceptance tests, availability and price are agreed in the service contract.'},
 {name:'Colocation',tenancy:'Customer-owned hardware',ownership:'Customer equipment; SmartTec facility services',description:'Space, power, cooling and connectivity for customer equipment. Colocation has a separate scope and pricing agreement; its revenue is excluded from the B300 ownership model.'}
];
export const evidence=[
 {title:'Customer commitments',status:'Active discussions',detail:'No signed customer contract or paid pilot is established. All contracted scenarios are hypothetical; customer credit, minimum payments and service acceptance remain open.'},
 {title:'Hardware and installation',status:'Planning prices',detail:'The owner reports $670,000 per complete eight-B300 Supermicro node. Exact SKU, voltage, cooling configuration, supplier inclusions, delivery dates, warranty and installed contractor prices require confirmation.'},
 {title:'Power and cooling',status:'Grid first',detail:'The model uses grid energy and demand allowances. Firm utility capacity, tariff, voltage conversion, cooling performance at design ambient and commissioning are not established by the spreadsheet.'},
 {title:'Founder funding',status:'Owner reported',detail:'Management reports $6 million available and willingness to cover the overage. Transfers, binding contribution terms and additional capital availability have not been independently verified.'},
 {title:'Site rights',status:'Owner reported signed agreement',detail:'BC LLC, associated with the CEO, owns the paid-off property. Management reports a signed 50-year site agreement with an annual 1% profit payment. The model uses positive after-tax accounting income; the legal agreement and that definition require reconciliation.'},
 {title:'Investor participation',status:'Terms to be agreed',detail:'No fixed outside raise, valuation, investor ownership, waterfall, exit guarantee or collateral package is established. Project cash-flow returns are not returns promised to a particular investor.'}
];
