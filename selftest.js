// Headless harness for TheTool's freshness + routing logic.
const fs=require('fs');
const src=fs.readFileSync('/root/TheTool/index.html','utf8');
const js=src.slice(src.indexOf('<script>')+8, src.lastIndexOf('</script>'));

let pass=0,fail=0;
const chk=(c,m)=>{(c?pass++:fail++);console.log((c?'PASS  ':'FAIL  ')+m);};

// --- DOM + fetch stubs -------------------------------------------------
const dots={};
function mkEl(){return {className:'',dataset:{},style:{},title:'',innerHTML:'',
  classList:{toggle(){},add(){},remove(){}},appendChild(){},
  removeAttribute(){},addEventListener(){},setAttribute(){}};}
const nodes={frame:mkEl(),load:mkEl(),loadTxt:mkEl(),err:mkEl(),nav:mkEl(),topbar:mkEl()};
let FETCHES=[];
let RESP={};   // url -> {ok, status, json}
global.document={
  getElementById:id=>nodes[id]||mkEl(),
  createElement:()=>mkEl(),
  querySelectorAll:sel=>{
    const m=/\[data-dot="(\w+)"\]/.exec(sel);
    if(m){ dots[m[1]]=dots[m[1]]||mkEl(); return [dots[m[1]]]; }
    return [];
  },
  get title(){return '';}, set title(v){},
};
global.location={hash:''};
global.window={addEventListener(){}};
global.fetch=(u,o)=>{
  FETCHES.push([u,(o&&o.method)||'GET']);
  const r=RESP[u];
  if(r===undefined) return Promise.reject(new Error('no route'));
  if(r.throw) return Promise.reject(new Error(r.throw));
  return Promise.resolve({ok:r.ok!==false,status:r.status||200,json:()=>Promise.resolve(r.json)});
};

const NOW=Date.parse('2026-08-03T20:00:00Z');
const RealDate=Date;
global.Date=class extends RealDate{
  constructor(...a){ super(...(a.length?a:[NOW])); }
  static now(){return NOW;}
  static parse(s){return RealDate.parse(s);}
};

RESP['/MLBTool/mlb/data/slate.json']={json:{generated:'2026-08-03T19:14:12+00:00'}}; // 0.8h
RESP['/NFLTool/data/slate.json']     ={json:{generated:'2026-08-01T20:00:00+00:00'}}; // 48h
RESP['/SoccerTool/data/slate.json']  ={json:{generated:'2026-07-28T20:00:00+00:00'}}; // 144h
// UFC has no slate.json -- its board is inlined into a 2.9MB page at build time -- but
// refresh_odds.py stamps docs/status.json before every rebuild, and that is a real
// build timestamp in a different field. This dot was switched off on the assumption
// that no timestamp existed.
RESP['/UFC-ODDS/status.json']        ={json:{odds_asof:'2026-08-03T14:00+00:00'}};     // 6h
new Function(js)();

setTimeout(()=>{
  chk(dots.soc!==undefined, 'Soccer now has a freshness dot at all (it had none)');
  chk(dots.ufc!==undefined, 'UFC now has a freshness dot at all (it had none)');
  chk(dots.ufc&&dots.ufc.style.background==='#4ad6a2',
      `UFC reads its own field (odds_asof, not generated) -> green (${dots.ufc&&dots.ufc.style.background})`);
  chk(dots.ufc&&/updated 6h ago/.test(dots.ufc.title),
      `UFC tooltip carries the age (${dots.ufc&&dots.ufc.title})`);
  chk(dots.mlb.style.background==='#4ad6a2', `fresh -> green (${dots.mlb.style.background})`);
  chk(dots.nfl.style.background==='#e8b44a', `48h -> amber (${dots.nfl.style.background})`);
  chk(dots.soc.style.background==='#e06c75', `144h -> red (${dots.soc.style.background})`);
  chk(/updated 48h ago/.test(dots.nfl.title), `tooltip carries the age (${dots.nfl.title})`);
  chk(!/checking/.test(dots.soc.title), 'no dot is left saying "checking freshness…"');

  // round 2: failures must be VISIBLY unknown, not silently grey and not red
  Object.keys(dots).forEach(k=>delete dots[k]);
  RESP['/MLBTool/mlb/data/slate.json']={throw:'network down'};
  RESP['/NFLTool/data/slate.json']={ok:false,status:404};
  RESP['/SoccerTool/data/slate.json']={json:{}};            // no `generated`
  RESP['/UFC-ODDS/status.json']={json:{event:'some card'}};  // status.json, no odds_asof
  new Function(js)();
  setTimeout(()=>{
    chk(dots.mlb.style.background==='#6b5bd0'&&/could not read/.test(dots.mlb.title),
        `a failed fetch reads UNKNOWN, not stale (${dots.mlb.style.background} / ${dots.mlb.title})`);
    chk(dots.nfl.style.background==='#6b5bd0'&&/HTTP 404/.test(dots.nfl.title),
        `a 404 reads UNKNOWN and names the status (${dots.nfl.title})`);
    chk(dots.soc.style.background==='#6b5bd0'&&/no readable/.test(dots.soc.title),
        `a missing timestamp reads UNKNOWN, not red (${dots.soc.title})`);
    chk(dots.mlb.style.background!=='#e06c75',
        'and specifically NOT red -- "I could not tell" is not "it is old"');
    chk(dots.ufc.style.background==='#6b5bd0'&&/odds_asof/.test(dots.ufc.title),
        `a status.json with no odds_asof reads UNKNOWN and names the field (${dots.ufc.title})`);
    chk(FETCHES.some(([u,m])=>m==='HEAD'), 'the selected tool URL is HEAD-checked for a 404');
    chk(FETCHES.some(([u])=>/\?r=\d+/.test(u)) || nodes.frame.src&&/\?r=\d+/.test(nodes.frame.src),
        'the frame src is cache-busted');
    console.log(`\n${pass}/${pass+fail} checks pass`);
    process.exit(fail?1:0);
  },20);
},20);
