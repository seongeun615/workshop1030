// 의존성 없음 (Node 18+). 실행: ADMIN_PW=비밀번호 node server.js
const http=require('http'),fs=require('fs'),crypto=require('crypto'),path=require('path');
const PORT=process.env.PORT||3000,DB=process.env.DATA_FILE||path.join(__dirname,'data.json');
const NAMES=["신철균","김기덕","한국현","김양수","서지혜","김경화","김보겸","홍예린","이다은","변재형","이성은"],N=NAMES.length;
const ADMIN_PW=process.env.ADMIN_PW||(()=>{const p=crypto.randomBytes(3).toString('hex');console.log('임시 관리자 비밀번호:',p);return p})();
const fresh=()=>({phase:'collect',parts:{},tmis:{},order:[],idx:0,qEnd:0,answers:{},authors:{}});
let S=fresh();try{S={...fresh(),...JSON.parse(fs.readFileSync(DB,'utf8'))}}catch{}
let tickets=new Set(); // 이름과 연결하지 않는 1회용 티켓(메모리)
const save=()=>{try{fs.writeFileSync(DB,JSON.stringify(S))}catch{}};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const rid=()=>crypto.randomBytes(16).toString('hex');
const send=(res,c,o)=>{res.writeHead(c,{'content-type':'application/json;charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(o))};
const body=req=>new Promise(r=>{let b='';req.on('data',d=>{b+=d;if(b.length>1e5)req.destroy()});req.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch{r({})}})});
const auth=(n,t)=>!!(S.parts[n]&&t&&S.parts[n].token===t);
function result(){const au=S.authors;
  const rows=NAMES.map(n=>{let s=0;const det=S.order.map((t,i)=>{const p=(S.answers[n]||{})[i],self=au[t]===n,hit=!self&&p===au[t];if(hit)s++;return{self,hit,p}});return{name:n,s,det}}).sort((a,b)=>b.s-a.s);
  return{rows,qs:S.order.map(t=>({text:S.tmis[t].text,author:S.authors[t]}))}}
function view(n,t){
  const o={phase:S.phase,names:NAMES,N,submitted:Object.keys(S.parts),tmiCount:Object.keys(S.tmis).length,idx:S.idx};
  if(S.phase==='play'&&S.idx<N){o.text=S.tmis[S.order[S.idx]].text;o.left=Math.max(0,S.qEnd-Date.now());
    o.answered=Object.values(S.answers).filter(a=>a[S.idx]!==undefined).length;
    if(auth(n,t))o.mine=(S.answers[n]||{})[S.idx]}
  if(S.phase==='reveal'){o.revealed=Object.keys(S.authors).length;if(o.revealed>=N)o.result=result()}
  return o}
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x');
  if(!u.pathname.startsWith('/api/')){
    fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{res.writeHead(e?404:200,{'content-type':'text/html;charset=utf-8'});res.end(d||'not found')});return}
  const p=u.pathname.slice(5);
  if(p==='state')return send(res,200,view(u.searchParams.get('n'),u.searchParams.get('t')));
  if(req.method!=='POST')return send(res,405,{e:'잘못된 요청'});
  const b=await body(req);
  if(p.startsWith('admin/')){
    if(req.headers['x-admin']!==ADMIN_PW)return send(res,401,{e:'비밀번호가 틀렸어요'});
    const a=p.slice(6);
    if(a==='reset'){S=fresh();tickets=new Set()}
    else if(a==='start'){
      if(S.phase!=='collect'||Object.keys(S.tmis).length<N||Object.keys(S.parts).length<N)return send(res,400,{e:'아직 전원 제출 전이에요'});
      S.order=Object.keys(S.tmis).sort(()=>crypto.randomInt(3)-1);
      for(let i=S.order.length-1;i>0;i--){const j=crypto.randomInt(i+1);[S.order[i],S.order[j]]=[S.order[j],S.order[i]]}
      S.phase='play';S.idx=0;S.qEnd=Date.now()+31000}
    else if(a==='next'){if(S.phase==='play'&&S.idx<N){S.idx++;S.qEnd=Date.now()+31000}}
    else if(a==='reveal'){if(S.phase!=='play'||S.idx<N)return send(res,400,{e:'11문제가 끝난 뒤에만 공개할 수 있어요'});S.phase='reveal'}
    save();return send(res,200,{ok:1})}
  if(p==='claim'){ // 이름 점유 (TMI 내용은 이 요청에 없음)
    if(S.phase!=='collect'||!NAMES.includes(b.name))return send(res,400,{e:'제출할 수 없는 상태예요'});
    if(S.parts[b.name])return send(res,409,{e:'이미 제출된 이름이에요'});
    const token=rid(),ticket=rid();S.parts[b.name]={token};tickets.add(ticket);save();return send(res,200,{token,ticket})}
  if(p==='tmi'){ // TMI 접수 (이름 없음: 티켓만 소모)
    const t=String(b.text||'').trim();
    if(!tickets.has(b.ticket)||t.length<2||t.length>100||!/^[0-9a-f]{32}$/.test(b.tmiId||'')||!/^[0-9a-f]{64}$/.test(b.commit||''))return send(res,400,{e:'접수 실패'});
    tickets.delete(b.ticket);S.tmis[b.tmiId]={text:t,commit:b.commit};save();return send(res,200,{ok:1})}
  if(!auth(b.n,b.t))return send(res,401,{e:'인증 실패'});
  if(p==='answer'){
    if(S.phase!=='play'||S.idx>=N||Date.now()>S.qEnd+1500||!NAMES.includes(b.pick))return send(res,400,{e:'제출할 수 없어요'});
    const a=S.answers[b.n]=S.answers[b.n]||{};if(a[S.idx]!==undefined)return send(res,409,{e:'이미 제출했어요'});
    a[S.idx]=b.pick;save();return send(res,200,{ok:1})}
  if(p==='reveal'){ // 게임 종료 후 각자 기기가 작성자 증명 (해시 검증)
    const t=S.tmis[b.tmiId];
    if(S.phase!=='reveal'||!t||sha(b.tmiId+'|'+encodeURIComponent(b.n)+'|'+b.salt)!==t.commit)return send(res,400,{e:'검증 실패'});
    S.authors[b.tmiId]=b.n;save();return send(res,200,{ok:1})}
  send(res,404,{e:'없는 경로'})
}).listen(PORT,'0.0.0.0',()=>console.log('http://localhost:'+PORT));
