/* Minecraft-010 CI research runner.
 * Operates solely on a fresh localhost Java server in an ephemeral
 * GitHub-hosted runner. Does not act on public or user-owned servers.
 */
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {conductNativeGame} from './hostile-game.mjs';

const fail=(c,x)=>{if(!c)throw Error('MC011_CI_'+x)};
const work='work/motif-minecraft-011-live';
const serverDir=join(work,'server');
const id='26.1.1';
const body=(x)=>JSON.stringify(x,null,2)+'\n';

async function downloadOfficialJar(){
  const url='https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
  const response=await fetch(url);
  fail(response.ok,'OFFICIAL_VERSION_MANIFEST_UNAVAILABLE');
  const manifest=await response.json();
  const found=manifest.versions.find(x=>x.id===id);
  fail(found?.url?.startsWith('https://'),'TARGET_VERSION_NOT_FOUND');
  const metaResponse=await fetch(found.url);
  fail(metaResponse.ok,'OFFICIAL_VERSION_DATA_UNAVAILABLE');
  const meta=await metaResponse.json();
  fail(meta.id===id&&meta.downloads?.server?.sha1?.length===40,
    'OFFICIAL_VERSION_METADATA_INVALID');
  const binaryResponse=await fetch(meta.downloads.server.url);
  fail(binaryResponse.ok,'OFFICIAL_MOJANG_JAR_UNAVAILABLE');
  const jar=Buffer.from(await binaryResponse.arrayBuffer());
  const sum=createHash('sha1').update(jar).digest('hex');
  fail(sum===meta.downloads.server.sha1&&jar.length===meta.downloads.server.size,
    'OFFICIAL_GAME_JAR_BYTES_CHANGED');
  await mkdir(serverDir,{recursive:true});
  await writeFile(join(serverDir,'server.jar'),jar);
  await writeFile(join(work,'server-version.json'),body({
    id,server_sha1:sum,server_size:jar.length,
    official_distribution:meta.downloads.server.url,
  }));
  return sum;
}

async function provisionWorld(){
  const target=join(serverDir,'world','datapacks','motif023');
  await mkdir(target,{recursive:true});
  await cp('work/motif-minecraft-011/datapack',target,{recursive:true});
  await writeFile(join(serverDir,'server.properties'),[
    'server-ip=127.0.0.1','server-port=25565',
    'online-mode=false','enforce-secure-profile=false',
    'gamemode=creative','force-gamemode=true','difficulty=peaceful',
    'spawn-protection=0','generate-structures=false',
    'level-type=minecraft:flat','level-seed=381654729',
    'view-distance=8','simulation-distance=8',
    'allow-flight=true','op-permission-level=4',
    'enable-rcon=true','rcon.port=25575','rcon.password=relatte-ci',
    'enable-query=false','motd=Motif 023 adversarial method sandbox',
  ].join('\n')+'\n');
  await writeFile(join(serverDir,'eula.txt'),'eula=true\n');
}

function serverReady(game){
  return new Promise((ok,no)=>{
    let completed=false,lines='';
    const timer=setTimeout(()=>done(Error('OFFICIAL_GAME_SERVER_TIMEOUT')),150000);
    const done=(err)=>{
      if(completed)return;
      completed=true;clearTimeout(timer);
      err?no(err):ok();
    };
    for(const stream of [game.stdout,game.stderr]){
      stream.setEncoding('utf8');
      stream.on('data',part=>{
        lines+=part;
        if(lines.length>500000)lines=lines.slice(-200000);
        if(lines.includes('Done ('))done();
      });
    }
    game.on('error',done);
    game.on('exit',code=>{
      if(!completed)done(Error('OFFICIAL_GAME_EARLY_EXIT_'+code+':'+lines.slice(-1400)));
    });
  });
}

export async function run(){
  fail(process.env.MOTIF_011_CI_GAME_ONLY==='1','NOT_OPERATOR_SELECTED');
  fail(process.env.GITHUB_ACTIONS==='true'&&
    process.env.MC_HOST==='127.0.0.1','NOT_ISOLATED_CI');
  await mkdir(work,{recursive:true});
  const source=JSON.parse(await readFile(
    'work/motif-minecraft-011/proposal.json','utf8'));
  fail(source.schema==='relatte.minecraft011.hostile-method-proposal/v0' &&
    source.game_server_not_yet_run===true &&
    source.world==='A'&&source.fault_x===-28&&
    source.side_power_position?.x===20 &&
    source.disposition==='R3_HOLD' &&
    source.physical_effect===false,
    'UNAUTHORIZED_GAME_PROPOSAL');
  const sum=await downloadOfficialJar();
  await provisionWorld();
  const game=spawn('java',['-Xms1G','-Xmx2G','-jar','server.jar','nogui'],{
    cwd:serverDir,stdio:['ignore','pipe','pipe'],
  });
  let log='';
  for(const stream of [game.stdout,game.stderr])stream.on('data',x=>{log+=x;});
  try{
    await serverReady(game);
    process.env.MC_VERSION_META=join(work,'server-version.json');
    const result=await conductNativeGame();
    await writeFile(join(work,'live-game-summary.json'),body({
      actual_official_minecraft_world_observed:true,
      observed_lamps:result.outcome.faultCount,
      micro_predicted_lamps:result.outcome.inferredCount,
      prefix_falsified:result.outcome.original_micro_method_unsafe_if_nonprefix,
      method_conclusion:result.outcome.source_conclusion,
      independent_full_audit:result.outcome.status,
      crossing_id:result.bundle.crossing.crossing_id,
      signed_R3_HOLD:true,
      game_only:true,physical_field_improvement:false,
    }));
    process.stdout.write(body({
      ...result.outcome,official_sha1:sum,
      game_result_crossing:result.bundle.crossing.crossing_id,
      signed_R3_HOLD:true,
    }));
  }finally{
    try{game.kill('SIGTERM')}catch{}
    await writeFile(join(work,'server-log.txt'),log.slice(-150000));
  }
}
if(process.argv[1]?.endsWith('/ci-run-hostile.mjs')){
  run().catch(e=>{console.error(e.stack??String(e));process.exitCode=1;});
}
