const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.goto('http://localhost:8765/scene.html?aa=0');await p.waitForFunction('window.ready',null,{timeout:120000});
const z=await p.evaluate('zones()');
const pts={reg_foot:[-3.4,0,-2.35],reg_c:[-3.4,0.85,-2.35],pick_foot:[-0.5,0,-2.3],pick_c:[-0.5,0.85,-2.3],aisle_foot_m05:[-0.5,0,-1.3],aisle_foot_15:[1.5,0,-1.3],aisle_foot_35:[3.5,0,-1.3],aisle_m25:[-2.3,0,-1.3],staff_c:[-1.5,1.3,-3.75],staff_bot:[-1.5,1.05,-2.8],q5:[-3.4,0,1.25],overflow:[1.6,0,-2.2],express:[0.6,0,-2.3],
 door_in:[4.1,0,-3.6],col245_z0:[2.45,0,-0.1],col245_z2:[2.45,0,2.1],seatT1L:[0.68-0.12,0.0,-0.1],seatT1Lc:[0.68,0.7,-0.1],seatT3R:[1.92+0.12,0,2.1],T5R:[-0.78+0.12,0,1.0],T6R:[-0.78+0.12,0,3.1],waiter_stand_T1:[2.45,0,-0.65]};
const inz=(u,v)=>Object.entries(z).flatMap(([k,rs])=>rs.map((r,i)=>(u>=r.x1&&u<=r.x2&&v>=r.y1&&v<=r.y2)?k+(rs.length>1?i:''):null).filter(Boolean));
for(const [k,v] of Object.entries(pts)){const [u,w]=await p.evaluate(`project(${v})`);console.log(k.padEnd(16),u.toFixed(3),w.toFixed(3),inz(u,w).join(','));}
console.log(JSON.stringify(z));
fs.writeFileSync('zones.json',JSON.stringify(z,null,1));await b.close();})();
