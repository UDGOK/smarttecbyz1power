/** Owner-price deployment sensitivities. No verified contracts or engineering approval. */
const hw={b300:{cost:670000,rate:6.5,peak:19.7,average:15/19.7,profileId:'hgx-b300-reference'},rtx:{cost:170000,rate:1.5,peak:10,average:.7,profileId:'rtx-pro-6000-blackwell-server'}};
export function buildOwnerScenario({b300,rtx,hours=20,reserve='node',decline=0,extraOps=0}){
 if(!Number.isInteger(b300)||!Number.isInteger(rtx)||b300<0||rtx<0||b300+rtx<1||b300+rtx>16||![18,20].includes(hours)||!['none','half','node'].includes(reserve)||![0,-.1].includes(decline)||!Number.isFinite(extraOps)||extraOps<0)throw new Error('Unsupported owner deployment search input');
 const counts={b300,rtx},rows=[];let hardware=0,peak=0,average=1;
 for(const [type,n] of Object.entries(counts)){if(!n)continue;const h=hw[type],reserved=reserve==='node'?8:reserve==='half'?4:0;
  hardware+=n*h.cost;peak+=n*h.peak;average+=n*h.peak*h.average;
  const contracts=f=>f===0?[]:[{startMonth:4,endMonth:60,billing:'gpu_hour',rate:h.rate,paidOccupancy:hours/24*f,collectionFraction:.98,salesFeeFraction:.1,annualRateEscalation:decline,collectionLagMonths:0}];
  const row=(id,systems,f)=>({id,model:`Eight-GPU ${type.toUpperCase()} system; owner price, OEM quote scope pending`,profileId:h.profileId,ownership:'owned',systems,gpusPerSystem:8,completeSystemCost:h.cost,peakKwPerSystem:h.peak,averagePowerFraction:h.average,operatingStartMonth:4,operatingEndMonth:60,contracts:contracts(f)});
  if(n>1)rows.push(row(type+'-active',n-1,1));
  rows.push(row(type+'-last',1,(8-reserved)/8));
 }
 const s={schemaVersion:1,startMonth:'2026-10',horizonMonths:60,siteCapex:(150000+2500*peak)*1.2,softCosts:30000+.1*hardware,openingReserve:0,monthlyFixedOpex:9000+100*(b300+rtx)+hardware*.03/12+extraOps,monthlyNetworkCost:8075,networkCommitmentMonths:60,monthlyDemandCharges:1000+20*peak,energyRatePerKwh:.07,pue:1.4,extraITPeakKw:2,extraITAverageFraction:.5,annualOpexEscalation:.03,annualDiscountRate:.15,exitSaleProceeds:0,exitDecommissionCost:40000,exitOtherLiabilities:0,investorProRataFraction:null,debt:{principal:0,annualRate:0,termMonths:60},capexEvents:[{month:37,cost:.1*hardware}],rows};
 s.openingReserve=Math.ceil(6*(s.monthlyFixedOpex+s.monthlyNetworkCost+s.monthlyDemandCharges+average*1.4*.07*730));
 s.underwriting={status:'Optimization sensitivity; not signed customer demand, approved hardware or verified power capacity',b300Nodes:b300,rtxNodes:rtx,gpusPurchased:(b300+rtx)*8,reservePerHardwareFamily:reserve==='node'?8:reserve==='half'?4:0,paidHoursPerSaleableGpuPerDay:hours,annualPriceChange:decline,extraMonthlyOperations:extraOps};
 return s;
}
