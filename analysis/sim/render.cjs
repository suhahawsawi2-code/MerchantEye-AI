// usage: node render.cjs <query> <fps> <startSec> <endSec> <out.mp4>
const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{const [q,fps,s0,s1,out]=process.argv.slice(2);const F=+fps;
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();p.on('pageerror',e=>console.log('E:',e.message));
await p.goto(`http://localhost:8765/scene.html?${q}&fps=${F}`);await p.waitForFunction('window.ready',null,{timeout:120000});
const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(F),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-r',String(F),out],{stdio:['pipe','inherit','inherit']});
// frame k shows the scene at time k/F (frame 0 = t 0)
const k0=Math.round(+s0*F),k1=Math.round(+s1*F);
if(k0>0)await p.evaluate(`advance(${k0})`);
const t0=Date.now();
for(let k=k0;k<k1;k++){
  const u=await p.evaluate('render(0.93)');
  const buf=Buffer.from(u.slice(u.indexOf(',')+1),'base64');
  if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
  await p.evaluate('advance(1)');
  if((k-k0)%100===0)console.log(out,'frame',k,'of',k1,((Date.now()-t0)/1000/(k-k0+1)).toFixed(2),'s/frame');
}
ff.stdin.end();await new Promise(r=>ff.on('close',r));
if(+s1>=0){const gt=await p.evaluate('gt()');require('fs').writeFileSync(out.replace('.mp4','_simgt.json'),JSON.stringify(gt));}
await b.close();})();
