export interface BudgetSlot {id:string;monthlyCapMicros:number;monthlyConsumedMicros:number;spentMicros:number;creditMicros:number}
export interface StudioBudgetRequest {monthlyLimitMicros:number;mode:"automatic"|"custom";allocations?:Record<string,number>}
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
