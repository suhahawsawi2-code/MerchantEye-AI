// node truth.mjs <fps> <duration> <seed> <zones.json> <video name> <out.json>
import {createSim,lateFlags} from './sim.js';import fs from 'fs';
const [fps,dur,seed,zf,vname,out]=process.argv.slice(2);
const s=createSim({seed:+seed,duration:+dur,dt:1/+fps});
const n=Math.round(+dur*+fps); for(let i=0;i<n;i++) s.step();
const r2=v=>v===null?null:Math.round(v*10)/10;
const journeys=s.gt.filter(j=>j.tEnter!==null).map(j=>({id:j.id,type:j.type,tEnter:r2(j.tEnter),tQueue:r2(j.tQueue),tOrder:r2(j.tOrder),tServed:r2(j.tServed),serveMode:j.serveMode,tSeated:r2(j.tSeated),table:j.table,tExit:r2(j.tExit),lastSeen:r2(j.tExit??+dur),invoice:null,late:lateFlags(j,+dur),note:j.note||undefined}));
const zones=JSON.parse(fs.readFileSync(zf));
fs.writeFileSync(out,JSON.stringify({source:'ground-truth (simulation)',video:vname,duration:+dur,analyzedFps:+fps,seed:+seed,
 definitions:{tEnter:'crosses the door line into the cafe',tQueue:'reaches the end of the order line',tOrder:'finishes ordering and steps away from the till',tServed:'pickup: takes the cup from the counter; table: the waiter puts the cup on the table',tSeated:'sits down',tExit:'crosses the door line on the way out',late:'entry -> served >= 8 min (or still unserved after 8 min)'},
 zones,journeys},null,1));
console.log(journeys.length,'customers;',journeys.filter(j=>j.late).length,'late');
