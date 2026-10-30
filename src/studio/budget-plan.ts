export interface BudgetSlot {id:string;monthlyCapMicros:number;monthlyConsumedMicros:number;spentMicros:number;creditMicros:number}
export interface StudioBudgetRequest {monthlyLimitMicros:number;mode:"automatic"|"custom";allocations?:Record<string,number>;expectedPolicyOperationId?:string|null}
const money=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw Error("Budgets must be non-negative whole USD micros.");return n;};
const sum=(values:number[])=>money(values.reduce((a,b)=>a+money(b),0));

/** Agent37 caps are per instance. Bound actual consumption plus all remaining
 * monthly/one-time headroom; summing caps alone can hide already-spent credit. */
export function planStudioBudget(request:StudioBudgetRequest,slots:BudgetSlot[]) {
  const limit=money(request.monthlyLimitMicros);
  if(!slots.length||new Set(slots.map(s=>s.id)).size!==slots.length)throw Error("The employee budget inventory is unavailable.");
  const spent=sum(slots.map(s=>s.spentMicros)),credits=sum(slots.map(s=>s.creditMicros));
  for(const slot of slots){money(slot.monthlyConsumedMicros);money(slot.monthlyCapMicros);}
  if(credits>Math.max(0,limit-spent))throw Error("Existing one-time headroom cannot fit this Studio budget. It remains spendable in Agent37.");
  const available=Math.max(0,limit-spent-credits),allocations:Record<string,number>={};
  if(request.mode==="automatic") {
    const share=Math.floor(available/slots.length),remainder=available%slots.length;
    slots.forEach((slot,index)=>{allocations[slot.id]=limit<spent?0:money(slot.monthlyConsumedMicros+share+(index<remainder?1:0));});
  } else if(request.mode==="custom") {
    if(!request.allocations||Object.keys(request.allocations).length!==slots.length||Object.keys(request.allocations).some(id=>!slots.some(s=>s.id===id)))throw Error("Provide an allocation for every employee in this studio.");
    for(const slot of slots)allocations[slot.id]=money(request.allocations[slot.id]);
  } else throw Error("Choose automatic or custom allocation.");
  // Caps recur next month. A cap below this month's consumption must not hide
  // allowance that becomes spendable again at the next UTC reset.
  if(sum(Object.values(allocations))+credits>limit)throw Error("Recurring employee caps and one-time headroom exceed the Studio budget.");
  const monthlyHeadroom=sum(slots.map(s=>Math.max(0,allocations[s.id]-s.monthlyConsumedMicros)));
  if(monthlyHeadroom>available)throw Error("Employee allocations exceed the available Studio budget.");
  return {monthlyLimitMicros:limit,mode:request.mode,allocations,spentMicros:spent,creditMicros:credits,allocatedHeadroomMicros:monthlyHeadroom,unallocatedMicros:available-monthlyHeadroom,exhausted:limit<=spent};
}

/** One recurring owner allowance; the provider cap is adjusted for spend that
 * survives retiring an older workstation and for its one-time credit. */
export function planSharedStudioBudget(request:StudioBudgetRequest,slot:BudgetSlot,retiredSpentMicros=0) {
  if(request.mode!=="automatic"||request.allocations!==undefined)throw Error("Set one monthly allowance for Robyn.");
  const limit=money(request.monthlyLimitMicros),retired=money(retiredSpentMicros);
  money(slot.monthlyCapMicros);money(slot.monthlyConsumedMicros);
  const spent=sum([retired,slot.spentMicros]),credits=money(slot.creditMicros);
  if(credits>Math.max(0,limit-spent))throw Error("Existing one-time headroom cannot fit this Studio budget. It remains spendable in Agent37.");
  const headroom=Math.max(0,limit-spent-credits),providerCap=Math.min(limit,money(slot.monthlyConsumedMicros+headroom));
  const allocatedHeadroom=Math.max(0,providerCap-slot.monthlyConsumedMicros);
  return {monthlyLimitMicros:limit,mode:"automatic" as const,allocations:{[slot.id]:limit},providerCapMicros:providerCap,
    retiredSpentMicros:retired,spentMicros:spent,creditMicros:credits,allocatedHeadroomMicros:allocatedHeadroom,unallocatedMicros:headroom-allocatedHeadroom,exhausted:limit<=spent};
}

export interface RetiredBudgetUsage {instance_id:string;period:string;usage:{period?:unknown;total_micros?:unknown}}
export function retiredBudgetSpend(rows:RetiredBudgetUsage[],period:string,currentInstanceId?:string|null) {
  if(!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(period))throw Error("Invalid Studio spending period.");
  const seen=new Set<string>(),amounts=[];
  for(const row of rows){
    if(row.period!==period)continue;
    if(!row.instance_id||seen.has(row.instance_id)||row.instance_id===currentInstanceId||row.usage?.period!==period)throw Error("Retired workstation spending could not be verified.");
    seen.add(row.instance_id);amounts.push(money(typeof row.usage.total_micros==="number"?row.usage.total_micros:NaN));
  }
  return sum(amounts);
}
