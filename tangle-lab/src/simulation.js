// Authored fixtures, not a recording of a real model or live Wikipedia.
export const SEED='Why does the water cycle keep going?';
const Q={
  root:SEED,
  rise:'How does water enter the atmosphere?',
  cloud:'How do clouds form and release water?',
  return:'How does water return to the sea?',
  evap:'What drives evaporation?',
  plant:'What is transpiration?',
  cond:'Why does water vapour condense?',
  rain:'When does a cloud produce rain?',
  energy:'What supplies the energy for the cycle?'
};
const facts={
  evap:['Evaporation','Energy allows liquid water molecules to enter the gas phase. Water can evaporate below its boiling point.','Liquid water becomes water vapour when molecules gain enough energy.'],
  plant:['Transpiration','Plants release water vapour, mainly through openings called stomata in their leaves.','Plants add water vapour to the atmosphere through transpiration.'],
  cond:['Condensation','As air cools, its capacity to contain water vapour decreases. Water may condense onto small particles as droplets.','Cooling moist air can produce cloud droplets by condensation.'],
  rain:['Precipitation','Droplets or ice particles in clouds can grow. When they fall to the ground, they become precipitation.','Cloud particles grow and fall as precipitation.'],
  return:['Runoff and groundwater','Water travels over land in streams and rivers or passes through soil and groundwater. Some of it returns to the ocean.','Runoff, rivers and groundwater carry water towards the sea.'],
  energy:['Energy in the water cycle','Solar energy powers much evaporation. Gravity drives falling precipitation and downhill flows.','Solar energy and gravity keep water moving between reservoirs.']
};
export function simulatedProposal(s,n,preset='revisit'){
  const key=Object.keys(Q).find(k=>Q[k]===n.question)||'repeat';
  if(preset==='repeat'&&n.question==='How does water move?')return {action:'decompose',questions:['How does water move?']};
  const kids=s.nodes.filter(x=>x.parent===n.id);
  if(key==='root'&&!kids.length)return {action:'decompose',questions:preset==='repeat'?['How does water move?']:[Q.rise,Q.cloud,Q.return]};
  if(key==='rise'&&!kids.length)return {action:'decompose',questions:[Q.evap,Q.plant]};
  if(key==='cloud'&&!kids.length)return {action:'decompose',questions:[Q.cond,Q.rain]};
  if(key==='root'&&!kids.some(c=>c.question===Q.energy)&&preset==='revisit')return {action:'decompose',questions:[Q.energy]};
  if(key==='rain'&&preset==='blocked')return {action:'blocked',reason:'Simulation: the source could not be read. This is not a claim about a real network failure.'};
  if(facts[key]&&!n.observed.length)return {action:'wiki',query:facts[key][0],fixture:{title:facts[key][0],text:facts[key][1],kind:'fixture'}};
  const evidence=[...new Set([...n.observed,...s.nodes.filter(x=>x.parent===n.id).flatMap(x=>x.evidence)])].slice(-5);
  return {action:'resolved',finding:facts[key]?.[2]||({rise:'Evaporation and plant transpiration supply atmospheric water vapour.',cloud:'Cooling forms droplets or ice; their growth leads to precipitation.',root:'Water cycles through evaporation, transpiration, condensation, precipitation and return flows. Solar energy and gravity sustain this movement.'})[key],evidence};
}
