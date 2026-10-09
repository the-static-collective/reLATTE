import {bytesForText, transmission, decodeCapture, syntheticCapture, DEFAULT_CHIP_MS} from './protocol.mjs';
const $ = (id) => document.getElementById(id);
const tabs = ['tx','rx','sim'];
function showMode(mode){
  for(const name of tabs){
    $('section-'+name).classList.toggle('hidden',name!==mode);
    $('tab-'+name).classList.toggle('selected',name===mode);
    $('tab-'+name).setAttribute('aria-pressed',name===mode?'true':'false');
  }
}
for(const t of tabs) $('tab-'+t).addEventListener('click',()=>showMode(t));
function messageDescription(){
  try {
    const packet=transmission($('message').value,Number($('tx-chip').value));
    $('message-size').textContent=`${bytesForText($('message').length} UTF-8 bytes · ${Math.round(packet.durationMs/1000)} seconds of flashing plus lead-in`;
    $('tx-start').disabled=false;
  } catch(err){
    $('message-size').textContent=err.message+' (UTF-8 bytes, not character count)';
    $('tx-start').disabled=true;
  }
}
$('message').addEventListener('input',messageDescription);
$('tx-chip').addEventListener('change',messageDescription);
messageDescription();
let txCancelled=false;
let wakeLock=null;
async function acquireWakeLock(){
  try {if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen');} catch {} // device may deny
}
async function releaseWakeLock(){try{await wakeLock?.release();}catch{}wakeLock=null;}
// Coarse optical TX relies on foreground active browser timers. Measured timing
// drift is expected and should be recorded in later hardware field captures.
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function displaySymbol(bright, number, total){
  $('transmitter').style.background=bright?'#fff':'#000';
  $('tx-progress').textContent=`Symbol ${number}/${total}`;
  await new Promise(resolve=>requestAnimationFrame(resolve));
}
$('tx-stop').addEventListener('click',()=>{txCancelled=true;});
$('tx-start').addEventListener('click',async()=>{
  let packet;
  try {packet=transmission($('message').value,Number($('tx-chip').value));}
  catch(e){$('tx-result').textContent=e.message;return;}
  const overlay=$('transmitter');
  $('tx-start').disabled=true; txCancelled=false;
  overlay.hidden=false;
  await acquireWakeLock();
  try {
    await displaySymbol(0,0,packet.chips.length);
    await sleep(1400); // black lead-in, scan receiver before starting
    const began=performance.now();
    for(let i=0;i<packet.chips.length;i++){
      if(txCancelled) break;
      await displaySymbol(packet.chips[i],i+1,packet.chips.length);
      const deadline=began+(i+1)*packet.chipMs;
      await sleep(Math.max(0,deadline-performance.now()));
    }
    const elapsed=performance.now()-began;
    const drift=Math.round(elapsed-packet.durationMs);
    $('tx-result').textContent=txCancelled ? 'Stopped early — incomplete packet.' :
      `Transmitted ${packet.raw.length} framed bytes as ${packet.chips.length} optical symbols. Wall-clock timing deviation: ${drift} ms. Receiver verification required.`;
  } catch(e){$('tx-result').textContent='Transmit error: '+e.message;}
  finally {overlay.style.background='#000';overlay.hidden=true;await releaseWakeLock();messageDescription();}
});

let cameraStream=null, sampleTimer=null, decodeTimer=null, samples=[], latestResult=null;
const scratch=document.createElement('canvas');scratch.width=32;scratch.height=32;
const ctx=scratch.getContext('2d',{willReadFrequently:true});
function paintGraph(){
  const canvas=$('signal');const c=canvas.getContext('2d');
  c.fillStyle='#0b131a';c.fillRect(0,0,canvas.width,canvas.height);
  const end=samples.at(-1)?.t??0, start=end-24000;
  c.strokeStyle='#345768';c.beginPath();c.moveTo(0,canvas.height/2);c.lineTo(canvas.width,canvas.height/2);c.stroke();
  c.strokeStyle='#f9c669';c.lineWidth=2;c.beginPath();let first=true;
  for(const s of samples){if(s.t<start)continue;
    const x=(s.t-start)/24000*canvas.width, y=(1-s.y/255)*canvas.height;
    if(first){c.moveTo(x,y);first=false;}else c.lineTo(x,y);
  }
  c.stroke();
}
function sampleCamera(){
  const video=$('camera');if(video.readyState<2)return;
  const w=video.videoWidth,h=video.videoHeight;
  if(!w||!h)return;
  // 16% centered crop; avoids averaging the surrounding room into the signal.
  const sw=Math.max(1,Math.round(w*.16)),sh=Math.max(1,Math.round(h*.16));
  ctx.drawImage(video,Math.round((w-sw)/2),Math.round((h-sh)/2),sw,sh,0,0,32,32);
  const data=ctx.getImageData(0,0,32,32).data;
  let sum=0;
  for(let i=0;i<data.length;i+=16){sum += (data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722);}
  const y=sum/(data.length/16);
  samples.push({t:performance.now(),y:Math.round(y*100)/100});
  if(samples.length>18000) samples.shift();
  $('brightness').textContent='Luma: '+y.toFixed(0)+'/255';
  $('count').textContent='Samples: '+samples.length;
  if(samples.length%5===0)paintGraph();
}
function evaluate(){
  const result=decodeCapture(samples,{chipMs:Number($('rx-chip').value)});
  latestResult=result;
  if(result.status==='VALID'){
    $('rx-result').textContent=`VALID CRC / ${result.text}\nMeasured contrast ${result.contrast.toFixed(1)}, leader errors ${result.leaderErrors}, polarity reversed ${result.inverted}.\nThis proves only short optical packet recovery, not a signature, identity, or receiver admission.`;
    stopReceiver();
    return;
  }
  $('contrast').textContent='Contrast: '+(result.contrast?.toFixed(1)??'—');
  const seconds=Math.round((samples.at(-1)?.t - samples[0]?.t||0)/1000);
  $('rx-result').textContent=`Capturing ${seconds}s… ${result.status}. ${result.matchedPreambles??0} candidate preambles. Keep phones still and transmitter visible.`;
}
async function stopReceiver(){
  if(sampleTimer!==null){clearInterval(sampleTimer);sampleTimer=null;}
  if(decodeTimer!==null){clearInterval(decodeTimer);decodeTimer=null;}
  cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;
  $('camera').srcObject=null;
  $('rx-start').disabled=false;$('rx-stop').disabled=true;
  $('export').disabled=samples.length===0;
  await releaseWakeLock();
}
$('rx-stop').addEventListener('click',async()=>{
  if(samples.length && latestResult?.status!=='VALID'){
    latestResult=decodeCapture(samples,{chipMs:Number($('rx-chip').value)});
    $('rx-result').textContent=`Capture stopped: ${latestResult.status}. No verified packet recovered.`;
  }
  await stopReceiver();
});
$('rx-start').addEventListener('click',async()=>{
  if(!navigator.mediaDevices?.getUserMedia){$('rx-result').textContent='Camera API unavailable. Use a modern browser served over HTTPS or localhost.';return;}
  try{
    $('rx-start').disabled=true;
    cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
    $('camera').srcObject=cameraStream;
    await $('camera').play();
    samples=[];latestResult=null;$('export').disabled=true;
    $('rx-stop').disabled=false;
    await acquireWakeLock();
    sampleTimer=setInterval(sampleCamera,45);
    decodeTimer=setInterval(evaluate,1700);
    $('rx-result').textContent='Camera active. Start transmitter now.';
  }catch(e){
    $('rx-result').textContent='Camera not available: '+e.message;
    await stopReceiver();
  }
});
$('export').addEventListener('click',()=>{
  const output={schema:'skymirror.capture/v0',created_at:new Date().toISOString(),
    chip_ms:Number($('rx-chip').value),source:'CAMERA_LUMINANCE_NO_IMAGES',
    result:latestResult?{...latestResult,payload:latestResult.payload?Array.from(latestResult.payload):undefined}:null,
    samples};
  const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='skymirror-002-capture.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('simulate').addEventListener('click',()=>{
  const s=syntheticCapture('HI',{noise:7,frameMs:39,leadingMs:1400});
  const r=decodeCapture(s,{chipMs:DEFAULT_CHIP_MS});
  $('sim-result').textContent=JSON.stringify({mode:'SIMULATION_NOT_PHYSICAL',
    camera_samples:s.length,result:r,packet_duration_seconds:transmission('HI').durationMs/1000},
    (_key,val)=>val instanceof Uint8Array?Array.from(val):val,2);
});
