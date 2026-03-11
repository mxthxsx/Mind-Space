import { useState, useRef, useEffect, useCallback } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const COLORS = [
  '#818cf8','#a78bfa','#c084fc','#e879f9',
  '#f472b6','#fb7185','#f87171','#fb923c',
  '#fbbf24','#a3e635','#34d399','#2dd4bf',
  '#60a5fa','#38bdf8','#94a3b8','#e2e8f0',
  '#ffffff','#f8fafc',
];
const EDGE_COLORS = ['#6b6b9a','#818cf8','#f472b6','#34d399','#fbbf24','#60a5fa','#f87171','#a78bfa','#2dd4bf','#fb923c','#c084fc','#38bdf8'];
const SHAPES      = ['rounded','rect','pill','circle','diamond','hexagon'];
const SHAPE_ICONS = {rounded:'▭',rect:'▬',pill:'⬭',circle:'◯',diamond:'◇',hexagon:'⬡'};
const SHAPE_NAMES = {rounded:'Abgerundet',rect:'Rechteck',pill:'Pille',circle:'Kreis',diamond:'Raute',hexagon:'Sechseck'};
const STATUS_LIST = [
  {id:'star', icon:'⭐', label:'Wichtig'},
  {id:'fire', icon:'🔥', label:'Dringend'},
  {id:'check',icon:'✅', label:'Erledigt'},
  {id:'warn', icon:'⚠️', label:'Offen'},
  {id:'idea', icon:'💡', label:'Idee'},
  {id:'pin',  icon:'📌', label:'Angeheftet'},
];
const TEMPLATES = [
  {id:'blank',   name:'Leer',        icon:'○',desc:'Leere Leinwand'},
  {id:'mindmap', name:'Mind Map',    icon:'◎',desc:'Radiale Struktur'},
  {id:'org',     name:'Organigramm', icon:'⊤',desc:'Hierarchie top-down'},
  {id:'fishbone',name:'Fischgräte',  icon:'≺',desc:'Ursache & Wirkung'},
  {id:'spider',  name:'Spinnennetz', icon:'✦',desc:'Vernetzte Themen'},
];
const HIST_MAX = 60;
const TOOLBAR_BTNS = [
  {cmd:'bold',icon:'B',title:'Fett',sty:{fontWeight:700}},
  {cmd:'italic',icon:'I',title:'Kursiv',sty:{fontStyle:'italic'}},
  {cmd:'underline',icon:'U',title:'Unterstrichen',sty:{textDecoration:'underline'}},
  {cmd:'strikeThrough',icon:'S',title:'Durchgestrichen',sty:{textDecoration:'line-through'}},
  null,
  {cmd:'insertUnorderedList',icon:'• —',title:'Aufzählung'},
  {cmd:'insertOrderedList',icon:'1.',title:'Numm. Liste'},
  null,
  {cmd:'justifyLeft',icon:'⬤≡',title:'Links'},
  {cmd:'justifyCenter',icon:'≡≡',title:'Mitte'},
  {cmd:'justifyRight',icon:'≡⬤',title:'Rechts'},
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid         = () => Math.random().toString(36).slice(2,9);
const rnd         = n  => Math.floor(Math.random()*n);
const getNodeSize = s  => s==='circle'?[72,72]:s==='diamond'?[130,70]:s==='hexagon'?[140,54]:[158,48];
const mkNode = (label,x,y,color=COLORS[0],shape='rounded') => {
  const [w,h]=getNodeSize(shape);
  return {id:uid(),label,x,y,color,shape,w,h,notesHtml:'',images:[],childMapId:null,linkMapId:null,colorBorder:false,colorFill:false,status:null,tags:[]};
};
const mkEdge  = (from,to) => ({id:uid(),from,to,style:'curved',arrow:'forward',color:'#6b6b9a',cp:null,routing:false,label:''});
const mkMap   = name => ({id:uid(),name,nodes:[],edges:[],groups:[],createdAt:Date.now()});
const mkGroup = (nodeIds,color,label='') => ({id:uid(),nodeIds,color,label});

// ── Collapse helpers ──────────────────────────────────────────────────────────
function getDescendants(rootId, edges){
  // BFS following directed edges away from root.
  // arrow:'forward'  → root can expand via from→to  (root is from)
  // arrow:'backward' → root can expand via to→from  (root is to)
  // arrow:'both'/'none' → both directions (undirected)
  const visited=new Set();
  const queue=[rootId];
  while(queue.length){
    const cur=queue.shift();
    edges.forEach(e=>{
      let next=null;
      if(e.arrow==='forward'){
        if(e.from===cur) next=e.to;
      } else if(e.arrow==='backward'){
        if(e.to===cur) next=e.from;
      } else {
        // 'both' or 'none' → undirected
        if(e.from===cur) next=e.to;
        else if(e.to===cur) next=e.from;
      }
      if(next&&!visited.has(next)){visited.add(next);queue.push(next);}
    });
  }
  visited.delete(rootId);
  return visited;
}

// ── Markdown export ───────────────────────────────────────────────────────────
function generateMarkdown(nodes,edges){
  if(!nodes.length) return '';
  // Build child map (directed: forward edges from→to, backward to→from)
  const childMap={};
  nodes.forEach(n=>{childMap[n.id]=[];});
  edges.forEach(e=>{
    if(e.arrow==='forward'||e.arrow==='both'||e.arrow==='none'){
      if(childMap[e.from]) childMap[e.from].push(e.to);
      if(e.arrow==='both'&&childMap[e.to]) childMap[e.to].push(e.from);
    } else if(e.arrow==='backward'){
      if(childMap[e.to]) childMap[e.to].push(e.from);
    }
  });
  // Roots = nodes with no incoming edges
  const hasParent=new Set();
  edges.forEach(e=>{
    if(e.arrow==='forward'||e.arrow==='both'||e.arrow==='none') hasParent.add(e.to);
    if(e.arrow==='backward'||e.arrow==='both') hasParent.add(e.from);
  });
  let roots=nodes.filter(n=>!hasParent.has(n.id));
  if(!roots.length) roots=[nodes[0]];
  const visited=new Set();
  const lines=[];
  const nodeMap={};nodes.forEach(n=>{nodeMap[n.id]=n;});
  const dfs=(id,depth)=>{
    if(visited.has(id))return;visited.add(id);
    const n=nodeMap[id];if(!n)return;
    const status=n.status?` ${STATUS_LIST.find(s=>s.id===n.status)?.icon||''}` :'';
    const tags=(n.tags||[]).length>0?'  '+(n.tags||[]).map(t=>`#${t}`).join(' '):'';
    const prefix=depth===0?'## ':'  '.repeat(depth-1)+'- ';
    lines.push(`${prefix}${n.label}${status}${tags}`);
    (childMap[id]||[]).forEach(cid=>dfs(cid,depth+1));
  };
  roots.forEach(r=>dfs(r.id,0));
  nodes.filter(n=>!visited.has(n.id)).forEach(n=>dfs(n.id,0));
  return lines.join('\n');
}

// ── Templates ─────────────────────────────────────────────────────────────────
function applyTemplate(map,tpl){
  if(tpl==='blank') return {...map,nodes:[mkNode('Hauptthema',350,230,COLORS[0])],edges:[],groups:[]};
  if(tpl==='mindmap'){
    const c=mkNode('Hauptthema',370,235,'#818cf8','circle');c.w=90;c.h=90;
    const kids=[0,55,110,175,230,295].map((deg,i)=>{
      const r=deg*Math.PI/180,[w,h]=getNodeSize('rounded');
      return mkNode(`Thema ${i+1}`,370+Math.cos(r)*220-w/2,235+Math.sin(r)*170-h/2,COLORS[(i+1)%COLORS.length]);
    });
    return {...map,nodes:[c,...kids],edges:kids.map(k=>mkEdge(c.id,k.id)),groups:[]};
  }
  if(tpl==='org'){
    const root=mkNode('Leitung',335,20,'#818cf8','rect');
    const l1=[mkNode('Abt. A',85,130,'#60a5fa','rect'),mkNode('Abt. B',335,130,'#34d399','rect'),mkNode('Abt. C',585,130,'#f472b6','rect')];
    const l2=[mkNode('Team 1',10,255,'#60a5fa'),mkNode('Team 2',165,255,'#60a5fa'),mkNode('Team 3',265,255,'#34d399'),
              mkNode('Team 4',410,255,'#34d399'),mkNode('Team 5',505,255,'#f472b6'),mkNode('Team 6',650,255,'#f472b6')];
    const edges=[...l1.map(n=>mkEdge(root.id,n.id)),
      mkEdge(l1[0].id,l2[0].id),mkEdge(l1[0].id,l2[1].id),mkEdge(l1[1].id,l2[2].id),
      mkEdge(l1[1].id,l2[3].id),mkEdge(l1[2].id,l2[4].id),mkEdge(l1[2].id,l2[5].id)]
      .map(e=>({...e,style:'ortho',arrow:'forward',color:'#6b6b9a'}));
    return {...map,nodes:[root,...l1,...l2],edges,groups:[]};
  }
  if(tpl==='fishbone'){
    const effect=mkNode('Hauptproblem',570,205,'#f87171','rect');
    const cats=['Methode','Mensch','Maschine','Material','Umwelt','Messung'];
    const nodes=[effect],edges=[];
    cats.forEach((l,i)=>{
      const n=mkNode(l,60+(i%3)*200,i<3?50:325,COLORS[(i+1)%COLORS.length],'pill');
      nodes.push(n);edges.push({...mkEdge(n.id,effect.id),style:'straight',color:'#6b6b9a'});
    });
    return {...map,nodes,edges,groups:[]};
  }
  if(tpl==='spider'){
    const c=mkNode('Kernthema',350,225,'#818cf8','circle');
    const topics=['Aspekt 1','Aspekt 2','Aspekt 3','Aspekt 4','Aspekt 5','Aspekt 6'];
    const nodes=[c],edges=[];
    topics.forEach((l,i)=>{
      const a=(i/topics.length)*2*Math.PI-Math.PI/2,[w,h]=getNodeSize('rounded');
      const n=mkNode(l,350+Math.cos(a)*215-w/2,225+Math.sin(a)*175-h/2,COLORS[(i+1)%COLORS.length]);
      nodes.push(n);edges.push({...mkEdge(c.id,n.id),color:COLORS[(i+1)%COLORS.length]});
    });
    for(let i=1;i<nodes.length;i++){
      const j=(i%topics.length)+1;
      edges.push({...mkEdge(nodes[i].id,nodes[j].id),style:'straight',arrow:'none',color:'#252545'});
    }
    return {...map,nodes,edges,groups:[]};
  }
  return map;
}

// ── Auto-layout ───────────────────────────────────────────────────────────────
function layoutRadial(nodes){
  if(!nodes.length) return nodes;
  const cx=420,cy=280;
  const out=[{...nodes[0],x:cx-nodes[0].w/2,y:cy-nodes[0].h/2}];
  const rest=nodes.slice(1);let placed=0;
  [Math.min(6,rest.length),rest.length-Math.min(6,rest.length)].filter(Boolean).forEach((count,ri)=>{
    const r=180+ri*140;
    for(let i=0;i<count;i++){const a=(i/count)*2*Math.PI-Math.PI/2,n=rest[placed++];out.push({...n,x:cx+Math.cos(a)*r-n.w/2,y:cy+Math.sin(a)*r-n.h/2});}
  });
  return out;
}
function layoutHierarchical(nodes,edges){
  if(!nodes.length) return nodes;
  const adj={};nodes.forEach(n=>{adj[n.id]=[];});
  edges.forEach(e=>{adj[e.from]&&adj[e.from].push(e.to);adj[e.to]&&adj[e.to].push(e.from);});
  const visited={},levels=[];const queue=[nodes[0].id];visited[nodes[0].id]=true;
  while(queue.length){const sz=queue.length,lvl=[];for(let i=0;i<sz;i++){const id=queue.shift();lvl.push(id);(adj[id]||[]).forEach(nb=>{if(!visited[nb]){visited[nb]=true;queue.push(nb);}});}levels.push(lvl);}
  nodes.filter(n=>!visited[n.id]).forEach(n=>levels.push([n.id]));
  const nmap={};nodes.forEach(n=>{nmap[n.id]=n;});
  const result=[];
  levels.forEach((lvl,ri)=>{const totalW=lvl.reduce((s,id)=>s+(nmap[id]?.w||158)+20,0);let x=(840-totalW)/2;lvl.forEach(id=>{const n=nmap[id];if(!n)return;result.push({...n,x,y:ri*120+30});x+=n.w+20;});});
  return result;
}

// ── Edge geometry ─────────────────────────────────────────────────────────────
function nodeIntersect(node,fx,fy){
  const cx=node.x+node.w/2,cy=node.y+node.h/2,dx=fx-cx,dy=fy-cy;
  if(Math.abs(dx)<0.01&&Math.abs(dy)<0.01) return {x:cx,y:cy};
  const a=Math.atan2(dy,dx),ac=Math.abs(Math.cos(a)),as=Math.abs(Math.sin(a));
  const d=(ac*(node.h/2)>=as*(node.w/2))?(node.w/2)/ac:(node.h/2)/as;
  return {x:cx+Math.cos(a)*d,y:cy+Math.sin(a)*d};
}
function edgeGeometry(fn,tn,style,cp){
  const fcx=fn.x+fn.w/2,fcy=fn.y+fn.h/2,tcx=tn.x+tn.w/2,tcy=tn.y+tn.h/2;
  const dx=tcx-fcx,dy=tcy-fcy,dist=Math.sqrt(dx*dx+dy*dy)||1;
  if(style==='straight'){
    const p1=nodeIntersect(fn,tcx,tcy),p2=nodeIntersect(tn,fcx,fcy);
    const ed=Math.atan2(p2.y-p1.y,p2.x-p1.x);
    return {d:`M${p1.x},${p1.y} L${p2.x},${p2.y}`,endDir:ed,startDir:ed+Math.PI,x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:null,mid:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}};
  }
  if(style==='curved'){
    const off=Math.max(40,dist*0.28);
    const cpx=cp?cp.x:(fcx+tcx)/2-(dy/dist)*off;
    const cpy=cp?cp.y:(fcy+tcy)/2+(dx/dist)*off;
    const p1=nodeIntersect(fn,cpx,cpy),p2=nodeIntersect(tn,cpx,cpy);
    const ed=Math.atan2(p2.y-cpy,p2.x-cpx),sd=Math.atan2(p1.y-cpy,p1.x-cpx);
    return {d:`M${p1.x},${p1.y} Q${cpx},${cpy} ${p2.x},${p2.y}`,endDir:ed,startDir:sd,x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:{x:cpx,y:cpy},mid:{x:.25*p1.x+.5*cpx+.25*p2.x,y:.25*p1.y+.5*cpy+.25*p2.y}};
  }
  const horiz=Math.abs(dx)>=Math.abs(dy);
  if(horiz){
    const bx=cp?cp.x:(fcx+tcx)/2;
    const p1={x:bx>fcx?fn.x+fn.w:fn.x,y:fcy},p2={x:bx>tcx?tn.x+tn.w:tn.x,y:tcy};
    return {d:`M${p1.x},${fcy} L${bx},${fcy} L${bx},${tcy} L${p2.x},${tcy}`,endDir:dx>=0?0:Math.PI,startDir:dx>=0?Math.PI:0,x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:{x:bx,y:(fcy+tcy)/2},mid:{x:bx,y:(fcy+tcy)/2}};
  }
  const by=cp?cp.y:(fcy+tcy)/2;
  const p1={x:fcx,y:by>fcy?fn.y+fn.h:fn.y},p2={x:tcx,y:by>tcy?tn.y+tn.h:tn.y};
  return {d:`M${fcx},${p1.y} L${fcx},${by} L${tcx},${by} L${tcx},${p2.y}`,endDir:dy>=0?Math.PI/2:-Math.PI/2,startDir:dy>=0?-Math.PI/2:Math.PI/2,x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:{x:(fcx+tcx)/2,y:by},mid:{x:(fcx+tcx)/2,y:by}};
}
function arrowPts(tx,ty,angle,size=11){
  const half=size*.52,bx=tx-size*Math.cos(angle),by=ty-size*Math.sin(angle);
  const wx=half*Math.sin(angle),wy=-half*Math.cos(angle);
  return `${tx},${ty} ${bx+wx},${by+wy} ${bx-wx},${by-wy}`;
}

// ── NodeShape ─────────────────────────────────────────────────────────────────
function NodeShape({node,selected}){
  const {x,y,w,h,color,shape,colorBorder,colorFill}=node;
  const fill=colorFill?`${color}18`:'#12121e';
  const stroke=selected?color:colorBorder?color:'#1e1e32';
  const sw=selected?2.5:colorBorder?1.5:1;
  const glow=selected?`drop-shadow(0 0 12px ${color}66)`:colorBorder?`drop-shadow(0 0 4px ${color}44)`:'none';
  const sty={filter:glow,transition:'filter .2s'};
  const p={fill,stroke,strokeWidth:sw,style:sty};
  if(shape==='rect')    return <rect x={x} y={y} width={w} height={h} {...p}/>;
  if(shape==='pill')    return <rect x={x} y={y} width={w} height={h} rx={h/2} {...p}/>;
  if(shape==='circle')  return <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} {...p}/>;
  if(shape==='diamond'){const cx=x+w/2,cy=y+h/2;return <path d={`M${cx},${y} L${x+w},${cy} L${cx},${y+h} L${x},${cy}Z`} {...p}/>;}
  if(shape==='hexagon'){
    const cx=x+w/2,cy=y+h/2,rx=w/2,ry=h/2;
    const pts=Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${cx+rx*Math.cos(a)},${cy+ry*Math.sin(a)}`;}).join(' ');
    return <polygon points={pts} {...p}/>;
  }
  return <rect x={x} y={y} width={w} height={h} rx={10} {...p}/>;
}

// ── Modals ────────────────────────────────────────────────────────────────────
function ConfirmModal({msg,onOk,onCancel,okLabel='Löschen',okColor='#f87171'}){
  return (
    <div style={{position:'fixed',inset:0,background:'#00000095',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}} onClick={onCancel}>
      <div style={{background:'#0f0f1a',border:'1px solid #f8717140',borderRadius:14,padding:'28px 30px',width:360,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,color:'#e2e8f0',marginBottom:20,lineHeight:1.6}}>{msg}</div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onCancel} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 18px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={onOk} style={{background:okColor,border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',fontFamily:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}

function TemplatePicker({onApply,onClose}){
  const [tpl,setTpl]=useState('mindmap');
  return (
    <div style={{position:'fixed',inset:0,background:'#00000090',display:'flex',alignItems:'center',justifyContent:'center',zIndex:250}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252540',borderRadius:16,padding:28,width:490,maxWidth:'92vw'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:'Unbounded',fontSize:12,color:'#818cf8',marginBottom:14}}>◈ Vorlage anwenden</div>
        <div style={{fontSize:12,color:'#7a7a9a',marginBottom:16,lineHeight:1.6}}>⚠️ Bestehende Knoten werden ersetzt.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:22}}>
          {TEMPLATES.map(t=>(
            <div key={t.id} onClick={()=>setTpl(t.id)}
              style={{background:tpl===t.id?'#818cf815':'#0d0d18',border:`1px solid ${tpl===t.id?'#818cf8':'#1e1e30'}`,borderRadius:10,padding:'12px 6px',cursor:'pointer',textAlign:'center'}}>
              <div style={{fontSize:22,marginBottom:5}}>{t.icon}</div>
              <div style={{fontSize:10,color:'#e2e8f0',fontWeight:500}}>{t.name}</div>
              <div style={{fontSize:9,color:'#3a3a55',marginTop:2,lineHeight:1.4}}>{t.desc}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={()=>onApply(tpl)} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer'}}>Anwenden →</button>
        </div>
      </div>
    </div>
  );
}

function NewMapModal({onClose,onCreate}){
  const [name,setName]=useState('');
  const s={width:'100%',background:'#0d0d18',border:'1px solid #1e1e32',color:'#e2e8f0',borderRadius:8,padding:'10px 12px',fontSize:14,outline:'none',fontFamily:'inherit',boxSizing:'border-box'};
  return (
    <div style={{position:'fixed',inset:0,background:'#00000090',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252540',borderRadius:16,padding:28,width:360,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:'Unbounded',fontSize:12,color:'#818cf8',marginBottom:18}}>◈ Neue Mind Map</div>
        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:8}}>NAME</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="z.B. Elektrotechnik" autoFocus
          style={{...s,marginBottom:20}} onKeyDown={e=>e.key==='Enter'&&onCreate(name||'Neue Map')}/>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={()=>onCreate(name||'Neue Map')} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer'}}>Erstellen →</button>
        </div>
      </div>
    </div>
  );
}

// ── Global Search ─────────────────────────────────────────────────────────────
function GlobalSearchPanel({maps,mapOrder,onJump,onClose}){
  const [q,setQ]=useState('');
  // Build full path string for a mapId
  const getPath=(targetMapId)=>{
    const findParent=(childId)=>{
      for(const [mid,m] of Object.entries(maps)){
        const node=m.nodes?.find(n=>n.childMapId===childId);
        if(node) return {parentMapId:mid};
      }
      return null;
    };
    const chain=[targetMapId];
    let cur=targetMapId;
    for(let i=0;i<15;i++){
      const p=findParent(cur);
      if(!p) break;
      chain.unshift(p.parentMapId);
      if(mapOrder.includes(p.parentMapId)) break;
      cur=p.parentMapId;
    }
    return chain.map(mid=>maps[mid]?.name||'?').join(' › ');
  };
  const allMapIds=Object.keys(maps);
  const results=q.trim().length>1?allMapIds.flatMap(mid=>{
    const m=maps[mid];if(!m)return[];
    return m.nodes.filter(n=>
      n.label.toLowerCase().includes(q.toLowerCase())||
      (n.tags||[]).some(t=>t.toLowerCase().includes(q.toLowerCase()))
    ).map(n=>({mapId:mid,pathStr:getPath(mid),node:n,isSub:!mapOrder.includes(mid)}));
  }):[];
  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:400,paddingTop:'12vh'}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252545',borderRadius:16,width:'min(580px,94vw)',maxHeight:'60vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px #00000099'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #181828'}}>
          <span style={{fontSize:16,color:'#3a3a55'}}>🔍</span>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Alle Maps + Sub-Maps durchsuchen…"
            style={{flex:1,background:'transparent',border:'none',color:'#e2e8f0',fontSize:15,outline:'none',fontFamily:'inherit'}}/>
          <div onClick={onClose} style={{color:'#3a3a55',cursor:'pointer',fontSize:18}}>×</div>
        </div>
        <div style={{overflowY:'auto',flex:1}}>
          {q.trim().length<=1 && <div style={{padding:'24px 18px',fontSize:12,color:'#3a3a55',textAlign:'center'}}>Mindestens 2 Zeichen eingeben…</div>}
          {q.trim().length>1 && results.length===0 && <div style={{padding:'24px 18px',fontSize:12,color:'#3a3a55',textAlign:'center'}}>Keine Ergebnisse gefunden.</div>}
          {results.map((r,i)=>(
            <div key={i} onClick={()=>onJump(r.mapId,r.node.id)}
              style={{padding:'10px 18px',borderBottom:'1px solid #0f0f18',cursor:'pointer',display:'flex',alignItems:'center',gap:12}}
              onMouseEnter={e=>e.currentTarget.style.background='#161626'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{width:10,height:10,borderRadius:'50%',background:r.node.color,flexShrink:0,boxShadow:`0 0 6px ${r.node.color}88`}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:'#e2e8f0',fontWeight:500}}>{r.node.label}
                  {r.node.status&&<span style={{marginLeft:6}}>{STATUS_LIST.find(s=>s.id===r.node.status)?.icon}</span>}
                </div>
                <div style={{fontSize:10,color:'#3a3a55',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  <span style={{color:r.isSub?'#34d399':'#818cf8'}}>{r.pathStr}</span>
                  {(r.node.tags||[]).map(t=><span key={t} style={{marginLeft:5,background:'#1e1e30',color:'#7a7a9a',padding:'1px 5px',borderRadius:4,fontSize:9}}>#{t}</span>)}
                </div>
              </div>
              <span style={{fontSize:11,color:'#3a3a55',flexShrink:0}}>→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── RichTextEditor ────────────────────────────────────────────────────────────
const CELL_SIZES=[{p:4,mw:50},{p:5,mw:60},{p:6,mw:70},{p:7,mw:85},{p:9,mw:100},{p:11,mw:120}];
function RichTextEditor({node,onClose,onSave}){
  const editorRef=useRef(null),imgRef=useRef(null);
  const [activeFmt,setActiveFmt]=useState({});
  const [showTbl,setShowTbl]=useState(false);
  const [tblPick,setTblPick]=useState({r:0,c:0});
  const [curFontSize,setCurFontSize]=useState(3);
  useEffect(()=>{if(editorRef.current)editorRef.current.innerHTML=node.notesHtml||'';updateActive();},[]);
  const updateActive=()=>{const s={};['bold','italic','underline','strikeThrough'].forEach(cmd=>{try{s[cmd]=document.queryCommandState(cmd);}catch(ex){}});setActiveFmt(s);};
  const exec=(cmd,val=null)=>{editorRef.current?.focus();document.execCommand(cmd,false,val);updateActive();};
  const insertTable=(rows,cols)=>{
    const {p,mw}=CELL_SIZES[curFontSize-1]||CELL_SIZES[2];
    let html=`<table style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>`;
    for(let r=0;r<rows;r++){html+='<tr>';for(let c=0;c<cols;c++)html+=`<td style="border:1px solid #3a3a55;padding:${p}px ${p+2}px;min-width:${mw}px"> </td>`;html+='</tr>';}
    html+=`</tbody></table><div><br></div>`;exec('insertHTML',html);setShowTbl(false);
  };
  const handleImgFile=(e)=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=ev=>{exec('insertHTML',`<img src="${ev.target.result}" style="max-width:100%;height:auto;border-radius:6px;margin:6px 0;display:block"/>`)};reader.readAsDataURL(f);e.target.value='';};
  const handleKeyDown=(e)=>{
    if(e.key!=='Tab')return;e.preventDefault();
    const sel=window.getSelection();if(!sel.rangeCount)return;
    let nd=sel.anchorNode;while(nd&&nd!==editorRef.current){if(nd.nodeName==='TD'||nd.nodeName==='TH')break;nd=nd.parentNode;}
    if(nd&&(nd.nodeName==='TD'||nd.nodeName==='TH')){
      const cells=[...nd.closest('table').querySelectorAll('td,th')];const idx=cells.indexOf(nd);const next=e.shiftKey?cells[idx-1]:cells[idx+1];
      if(next){const r2=document.createRange();r2.selectNodeContents(next);r2.collapse(false);sel.removeAllRanges();sel.addRange(r2);}
      else if(!e.shiftKey){const lastRow=nd.closest('table').querySelector('tbody').lastElementChild;const colCount=lastRow.children.length;const newRow=document.createElement('tr');const {p,mw}=CELL_SIZES[curFontSize-1]||CELL_SIZES[2];for(let i=0;i<colCount;i++){const td=document.createElement('td');td.style.cssText=`border:1px solid #3a3a55;padding:${p}px ${p+2}px;min-width:${mw}px`;td.innerHTML=' ';newRow.appendChild(td);}lastRow.parentNode.appendChild(newRow);const fc=newRow.querySelector('td');const r2=document.createRange();r2.selectNodeContents(fc);r2.collapse(false);sel.removeAllRanges();sel.addRange(r2);}
    } else {exec('insertText','  ');}
  };
  const tbS=(active)=>({background:active?'#818cf825':'transparent',border:`1px solid ${active?'#818cf860':'transparent'}`,color:active?'#c7d2fe':'#7a7a9a',borderRadius:5,padding:'4px 8px',fontSize:12,cursor:'pointer',fontFamily:'inherit'});
  const Sep=()=><div style={{width:1,height:20,background:'#1e1e30',margin:'0 3px',flexShrink:0}}/>;
  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252545',borderRadius:16,width:'min(900px,96vw)',height:'min(80vh,720px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px #00000099'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'12px 18px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <div style={{width:9,height:9,borderRadius:'50%',background:node.color,boxShadow:`0 0 7px ${node.color}99`}}/>
          <span style={{fontFamily:'Unbounded',fontSize:10,color:'#818cf8'}}>◈</span>
          <span style={{fontSize:13,fontWeight:600,color:'#e2e8f0',flex:1}}>{node.label} — Notizen</span>
          <div onClick={onClose} style={{cursor:'pointer',color:'#3a3a55',fontSize:18}}>×</div>
        </div>
        <div style={{padding:'7px 12px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:2,flexWrap:'wrap',background:'#0d0d18',flexShrink:0}}>
          {TOOLBAR_BTNS.map((t,i)=>t===null?<Sep key={i}/>:<button key={t.cmd} title={t.title} onMouseDown={e=>{e.preventDefault();exec(t.cmd);}} style={{...tbS(activeFmt[t.cmd]),fontStyle:t.sty?.fontStyle,fontWeight:t.sty?.fontWeight,textDecoration:t.sty?.textDecoration}}>{t.icon}</button>)}
          <Sep/>
          {['H1','H2','H3'].map(h=><button key={h} title={h} onMouseDown={e=>{e.preventDefault();exec('formatBlock',h.toLowerCase());}} style={{...tbS(false),fontSize:10,fontWeight:600}}>{h}</button>)}
          <button title="Normal" onMouseDown={e=>{e.preventDefault();exec('formatBlock','div');}} style={{...tbS(false),fontSize:10}}>¶ Normal</button>
          <Sep/>
          <div style={{position:'relative'}}>
            <button title="Tabelle" onMouseDown={e=>{e.preventDefault();setShowTbl(v=>!v);}} style={tbS(showTbl)}>⊞ Tabelle</button>
            {showTbl&&<div style={{position:'absolute',top:'110%',left:0,background:'#13131e',border:'1px solid #252545',borderRadius:10,padding:12,zIndex:500,boxShadow:'0 8px 32px #00000088'}} onMouseLeave={()=>setTblPick({r:0,c:0})}>
              <div style={{fontSize:10,color:'#3a3a55',marginBottom:8}}>{tblPick.r>0?`${tblPick.r} × ${tblPick.c}`:'Zeilen × Spalten'}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,18px)',gap:3}}>
                {Array.from({length:36},(_,i)=>{const r=Math.floor(i/6)+1,c=(i%6)+1,active=r<=tblPick.r&&c<=tblPick.c;return <div key={i} style={{width:18,height:18,borderRadius:3,background:active?'#818cf840':'#1e1e30',border:`1px solid ${active?'#818cf8':'#252540'}`,cursor:'pointer'}} onMouseEnter={()=>setTblPick({r,c})} onClick={()=>insertTable(r,c)}/>;})}</div>
            </div>}
          </div>
          <Sep/>
          <input ref={imgRef} type="file" accept="image/*" onChange={handleImgFile} style={{display:'none'}}/>
          <button title="Bild einfügen" onMouseDown={e=>{e.preventDefault();imgRef.current?.click();}} style={tbS(false)}>🖼 Bild</button>
          <Sep/>
          <select onChange={e=>{const v=parseInt(e.target.value);setCurFontSize(v);exec('fontSize',v);}} value={curFontSize} style={{background:'#0d0d18',border:'1px solid #1e1e30',color:'#7a7a9a',borderRadius:5,padding:'3px 5px',fontSize:11,fontFamily:'inherit',cursor:'pointer'}}>
            {[1,2,3,4,5,6].map(n=><option key={n} value={n}>{[10,13,16,18,24,32][n-1]}px</option>)}
          </select>
          <Sep/>
          <button title="Rückgängig" onMouseDown={e=>{e.preventDefault();exec('undo');}} style={tbS(false)}>↩</button>
          <button title="Wiederholen" onMouseDown={e=>{e.preventDefault();exec('redo');}} style={tbS(false)}>↪</button>
        </div>
        <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={updateActive} onKeyUp={updateActive} onMouseUp={updateActive} onKeyDown={handleKeyDown}
          style={{flex:1,overflowY:'auto',padding:'18px 24px',color:'#c9d1d9',fontSize:14,lineHeight:1.8,outline:'none',fontFamily:'"IBM Plex Sans",sans-serif'}} data-placeholder="Notizen eingeben…"/>
        <div style={{padding:'12px 18px',borderTop:'1px solid #181828',display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 18px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={()=>onSave(editorRef.current?.innerHTML||'')} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:'9px 22px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer'}}>Speichern ✓</button>
        </div>
      </div>
      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:#3a3a55;pointer-events:none}[contenteditable] h1{font-size:22px;font-weight:700;margin:10px 0 4px;color:#e2e8f0}[contenteditable] h2{font-size:18px;font-weight:600;margin:8px 0 4px;color:#c9d1d9}[contenteditable] h3{font-size:15px;font-weight:600;margin:6px 0 3px;color:#a0aec0}[contenteditable] div{margin:2px 0}[contenteditable] ul{margin:4px 0 4px 22px;list-style:disc}[contenteditable] ol{margin:4px 0 4px 22px;list-style:decimal}[contenteditable] li{margin:2px 0}[contenteditable] table{border-collapse:collapse;width:100%;margin:8px 0}[contenteditable] td,[contenteditable] th{border:1px solid #3a3a55;vertical-align:top}[contenteditable] img{max-width:100%;height:auto;border-radius:6px;margin:4px 0;display:block}`}</style>
    </div>
  );
}

// ── ExportModal ───────────────────────────────────────────────────────────────
function ExportModal({data,onClose}){
  const [copied,setCopied]=useState(false);
  const copy=()=>{navigator.clipboard?.writeText(data.content).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const isText=data.type==='json'||data.type==='markdown';
  const title=data.type==='json'?'💾 JSON Export':data.type==='markdown'?'📋 Markdown / Outline':'🖼 PNG Export';
  return (
    <div style={{position:'fixed',inset:0,background:'#00000090',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252545',borderRadius:16,width:'min(860px,96vw)',height:'82vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px #00000099'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'14px 18px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:'Unbounded',fontSize:11,color:'#818cf8'}}>◈</span>
          <span style={{fontSize:13,fontWeight:600,color:'#e2e8f0',flex:1}}>{title}</span>
          <div onClick={onClose} style={{cursor:'pointer',color:'#3a3a55',fontSize:18}}>×</div>
        </div>
        {isText&&<>
          <div style={{padding:'12px 18px',background:'#0d0d18',borderBottom:'1px solid #181828',fontSize:11,color:'#7a7a9a',lineHeight:1.7}}>
            {data.type==='json'&&<>Kopiere und speichere als <code style={{color:'#818cf8',background:'#818cf815',padding:'1px 5px',borderRadius:4}}>mindspace-export.json</code>. Über <strong style={{color:'#c9d1d9'}}>📥 Importieren</strong> wieder laden.</>}
            {data.type==='markdown'&&<>Hierarchische Textdarstellung der Map. In Notion, Obsidian, Roam o.ä. einfügen.</>}
          </div>
          <div style={{position:'relative',flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <textarea readOnly value={data.content} onClick={e=>e.target.select()}
              style={{flex:1,background:'#0d0d18',border:'none',color:data.type==='markdown'?'#c9d1d9':'#4ade80',fontFamily:'"IBM Plex Mono",monospace',fontSize:data.type==='markdown'?14:12,padding:'20px 24px',outline:'none',resize:'none',lineHeight:2}}/>
          </div>
          <div style={{padding:'12px 18px',borderTop:'1px solid #181828',display:'flex',gap:10,justifyContent:'flex-end'}}>
            <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Schließen</button>
            <button onClick={copy} style={{background:copied?'#34d399':'#818cf8',border:'none',color:copied?'#0b0b14':'#fff',borderRadius:8,padding:'9px 22px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer',transition:'all .2s'}}>{copied?'✓ Kopiert!':'📋 Alles kopieren'}</button>
          </div>
        </>}
        {data.type==='png'&&<>
          <div style={{padding:'12px 18px',background:'#0d0d18',borderBottom:'1px solid #181828',fontSize:11,color:'#7a7a9a',lineHeight:1.7}}>Rechtsklick auf das Bild → <strong style={{color:'#c9d1d9'}}>"Bild speichern unter…"</strong></div>
          <div style={{flex:1,overflow:'auto',padding:18,display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d18'}}><img src={data.content} alt="Map Export" style={{maxWidth:'100%',borderRadius:8,border:'1px solid #252545'}}/></div>
          <div style={{padding:'12px 18px',borderTop:'1px solid #181828',display:'flex',justifyContent:'flex-end'}}><button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Schließen</button></div>
        </>}
      </div>
    </div>
  );
}

// ── MapThumbnail ──────────────────────────────────────────────────────────────
function MapThumbnail({map,w=200,h=110}){
  const nodes=map?.nodes||[];
  const edges=map?.edges||[];
  if(!nodes.length) return (
    <div style={{width:'100%',height:h,display:'flex',alignItems:'center',justifyContent:'center',color:'#252545',fontSize:28,background:'#0a0a12',borderRadius:'8px 8px 0 0'}}>◈</div>
  );
  // Fit all nodes into the thumbnail viewport with padding
  const pad=12;
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs.map((x,i)=>x+(nodes[i].w||158)));
  const minY=Math.min(...ys),maxY=Math.max(...ys.map((y,i)=>y+(nodes[i].h||48)));
  const rangeX=Math.max(maxX-minX,1),rangeY=Math.max(maxY-minY,1);
  const scale=Math.min((w-pad*2)/rangeX,(h-pad*2)/rangeY);
  const tx=n=>pad+(n.x-minX)*scale;
  const ty=n=>pad+(n.y-minY)*scale;
  const tw=n=>(n.w||158)*scale;
  const th=n=>(n.h||48)*scale;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:'block',background:'#0a0a12',borderRadius:'8px 8px 0 0'}}>
      <rect width={w} height={h} fill="#0a0a12"/>
      {/* Edges */}
      {edges.map(e=>{
        const fn=nodes.find(n=>n.id===e.from),tn=nodes.find(n=>n.id===e.to);
        if(!fn||!tn)return null;
        const x1=tx(fn)+tw(fn)/2,y1=ty(fn)+th(fn)/2,x2=tx(tn)+tw(tn)/2,y2=ty(tn)+th(tn)/2;
        return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={e.color||'#2a2a45'} strokeWidth={1} opacity={.6}/>;
      })}
      {/* Nodes */}
      {nodes.map(n=>{
        const x=tx(n),y=ty(n),nw=tw(n),nh=th(n);
        const r=Math.min(3,nw/4,nh/4);
        return <rect key={n.id} x={x} y={y} width={Math.max(nw,4)} height={Math.max(nh,4)} rx={r} fill={`${n.color}22`} stroke={n.color} strokeWidth={.8} opacity={.85}/>;
      })}
    </svg>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({maps,mapOrder,onOpen,onDelete,onNew,onRename,onImport,onReset,onGlobalSearch}){
  const [editing,setEditing]=useState(null);
  const importRef=useRef(null);
  const isMob=typeof window!=='undefined'&&window.innerWidth<768;
  const commit=()=>{if(editing?.val.trim())onRename(editing.id,editing.val.trim());setEditing(null);};
  return (
    <div style={{minHeight:'100vh',background:'#0b0b14',color:'#c9d1d9',fontFamily:'"IBM Plex Sans",sans-serif',overflowY:'auto'}}>
      <div style={{borderBottom:'1px solid #181828',padding:isMob?'14px 16px':'16px 36px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{fontFamily:'Unbounded',fontSize:isMob?13:15,color:'#818cf8',letterSpacing:'-0.3px'}}>◈ MindSpace</div>
        {!isMob&&<><div style={{width:1,height:18,background:'#181828'}}/><div style={{fontSize:11,color:'#2a2a42'}}>Verschachtelte Mind Maps</div></>}
        <div style={{marginLeft:'auto',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={onGlobalSearch} title="Alle Maps durchsuchen" style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:isMob?'8px 10px':'9px 14px',fontSize:isMob?11:12,fontFamily:'inherit',cursor:'pointer'}}>🔍 {isMob?'':'Suchen'}</button>
          <input ref={importRef} type="file" accept=".json" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{onImport(JSON.parse(ev.target.result));}catch(ex){}};r.readAsText(f);e.target.value='';}} style={{display:'none'}}/>
          <button onClick={()=>importRef.current?.click()} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:isMob?'8px 10px':'9px 14px',fontSize:isMob?11:12,fontFamily:'inherit',cursor:'pointer'}}>📥 {isMob?'':'Importieren'}</button>
          <button onClick={onNew} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:isMob?'8px 14px':'9px 20px',fontSize:isMob?12:13,fontFamily:'inherit',fontWeight:500,cursor:'pointer'}}>+ Neue Map</button>
          <button onClick={onReset} title="Alle Daten zurücksetzen" style={{background:'transparent',border:'1px solid #f8717130',color:'#f87171',borderRadius:8,padding:isMob?'8px 10px':'9px 12px',fontSize:13,fontFamily:'inherit',cursor:'pointer'}}>🗑️</button>
        </div>
      </div>
      <div style={{padding:isMob?'20px 14px':'32px 36px'}}>
        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'0.12em',marginBottom:14}}>MEINE MAPS ({mapOrder.length})</div>
        <div style={{display:'grid',gridTemplateColumns:isMob?'1fr 1fr':'repeat(auto-fill,minmax(220px,1fr))',gap:12}}>
          {mapOrder.map(id=>{
            const m=maps[id];if(!m)return null;const isEdit=editing?.id===id;
            return (
              <div key={id} onClick={()=>{if(!isEdit)onOpen(id);}}
                style={{background:'#0f0f1a',border:'1px solid #1a1a2e',borderRadius:12,cursor:'pointer',position:'relative',transition:'border-color .15s',overflow:'hidden'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#818cf850'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#1a1a2e'}>
                {/* Thumbnail */}
                <MapThumbnail map={m} h={isMob?80:100}/>
                {/* Card body */}
                <div style={{padding:isMob?'10px 12px':'12px 14px'}}>
                  {isEdit
                    ?<input autoFocus value={editing.val} onChange={e=>setEditing({...editing,val:e.target.value})} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(null);}} onClick={e=>e.stopPropagation()} style={{width:'100%',background:'#0d0d18',border:'1px solid #818cf8',color:'#e2e8f0',borderRadius:6,padding:'4px 8px',fontSize:13,fontFamily:'inherit',outline:'none',marginBottom:4,boxSizing:'border-box'}}/>
                    :<div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
                      <div style={{fontSize:isMob?12:13,fontWeight:600,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{m.name}</div>
                      <div onClick={e=>{e.stopPropagation();setEditing({id,val:m.name});}} style={{color:'#3a3a55',fontSize:11,cursor:'pointer',padding:'2px 4px',borderRadius:4,flexShrink:0}}>✎</div>
                    </div>
                  }
                  <div style={{fontSize:10,color:'#3a3a55',display:'flex',gap:8}}>
                    <span>{m.nodes.length} Knoten</span>
                    <span>·</span>
                    <span>{m.edges.length} Verbindungen</span>
                  </div>
                  <div style={{fontSize:9,color:'#1e1e38',marginTop:2}}>{new Date(m.createdAt).toLocaleDateString('de')}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();onDelete(id);}} style={{position:'absolute',top:6,right:6,background:'#0a0a1288',border:'none',color:'#3a3a55',fontSize:14,padding:'2px 6px',borderRadius:4,fontFamily:'inherit',cursor:'pointer',backdropFilter:'blur(4px)'}}>×</button>
              </div>
            );
          })}
          <div onClick={onNew} style={{background:'transparent',border:'1px dashed #222238',borderRadius:12,padding:14,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:isMob?90:130,color:'#333355'}}>
            <div style={{fontSize:24,marginBottom:6}}>+</div><div style={{fontSize:11}}>Neue Map</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function Minimap({nodes,edges,pan,zoom,svgW,svgH,hiddenColors}){
  const MW=180,MH=110;if(!nodes.length) return null;
  const minX=Math.min(...nodes.map(n=>n.x))-20,minY=Math.min(...nodes.map(n=>n.y))-20;
  const maxX=Math.max(...nodes.map(n=>n.x+n.w))+20,maxY=Math.max(...nodes.map(n=>n.y+n.h))+20;
  const scale=Math.min(MW/(maxX-minX||1),MH/(maxY-minY||1),.8);
  const tx=n=>(n-minX)*scale,ty=n=>(n-minY)*scale;
  const vx0=-pan.x/zoom,vy0=-pan.y/zoom,vx1=vx0+svgW/zoom,vy1=vy0+svgH/zoom;
  return (
    <div style={{position:'absolute',bottom:16,right:16,background:'#0d0d18',border:'1px solid #252540',borderRadius:10,overflow:'hidden',zIndex:50}}>
      <svg width={MW} height={MH}>
        {edges.map(e=>{const fn=nodes.find(n=>n.id===e.from),tn=nodes.find(n=>n.id===e.to);if(!fn||!tn)return null;return <line key={e.id} x1={tx(fn.x+fn.w/2)} y1={ty(fn.y+fn.h/2)} x2={tx(tn.x+tn.w/2)} y2={ty(tn.y+tn.h/2)} stroke="#252545" strokeWidth={1}/>;})  }
        {nodes.filter(n=>!hiddenColors.has(n.color)).map(n=><rect key={n.id} x={tx(n.x)} y={ty(n.y)} width={Math.max(4,n.w*scale)} height={Math.max(3,n.h*scale)} rx={2} fill={n.color} opacity={.8}/>)}
        <rect x={tx(vx0)} y={ty(vy0)} width={(vx1-vx0)*scale} height={(vy1-vy0)*scale} fill="none" stroke="#818cf8" strokeWidth={1} opacity={.6}/>
      </svg>
    </div>
  );
}

// ── Initial state ─────────────────────────────────────────────────────────────
const STORAGE_KEY='mindspace_v4';
function createInitial(){
  const m1=applyTemplate(mkMap('Mechatronik'),'mindmap');
  ['Mechatronik','Mechanik','Elektrotechnik','Informatik','Physik','Mathematik','Konstruktion'].forEach((l,i)=>{if(m1.nodes[i])m1.nodes[i].label=l;});
  const m2=applyTemplate(mkMap('Projekt-Planung'),'org');
  return {screen:'home',maps:{[m1.id]:m1,[m2.id]:m2},mapOrder:[m1.id,m2.id],currentMapId:null,navStack:[]};
}
function loadSaved(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const d=JSON.parse(raw);if(d?.maps&&d?.mapOrder)return{...createInitial(),...d,screen:'home'};}}catch(e){}
  return createInitial();
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function MindSpaceApp(){
  const [app,setApp]               = useState(loadSaved);
  const [history,setHistory]       = useState([]);
  const [future,setFuture]         = useState([]);
  const [selNode,setSelNode]       = useState(null);
  const [selEdge,setSelEdge]       = useState(null);
  const [selNodes,setSelNodes]     = useState(new Set()); // multi-select
  const [connectMode,setConnMode]  = useState(false);
  const [pan,setPan]               = useState({x:0,y:0});
  const [zoom,setZoom]             = useState(1);
  const [showNewMap,setShowNewMap] = useState(false);
  const [showTpl,setShowTpl]       = useState(false);
  const [confirm,setConfirm]       = useState(null);
  const [notePopup,setNotePopup]   = useState(null);
  const [exportModal,setExportModal]= useState(null);
  const [searchTerm,setSearchTerm] = useState('');
  const [filterColors,setFilterColors] = useState(new Set()); // whitelist: empty = show all
  const [filterTags,setFilterTags]     = useState(new Set()); // whitelist: empty = show all
  const [filterStatus,setFilterStatus] = useState(new Set()); // whitelist: empty = show all
  const [hoverNode,setHoverNode]   = useState(null);
  const [showMinimap,setShowMinimap]=useState(true);
  const [svgSize,setSvgSize]       = useState({w:800,h:600});
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [focusMode,setFocusMode]   = useState(false);
  const [globalSearchOpen,setGlobalSearchOpen]=useState(false);
  const [inlineEdit,setInlineEdit] = useState(null); // {id,val}
  const [selBox,setSelBox]         = useState(null);  // {x0,y0,x1,y1} rubber band
  const [mapNameEdit,setMapNameEdit]= useState(null); // inline rename of current map
  const [collapsedNodes,setCollapsed]=useState(new Set()); // nodeIds whose children are hidden
  const [inlineEdgeLbl,setInlineEdgeLbl]=useState(null); // {id,val,x,y} inline edge label edit
  const isMobile                   = typeof window!=='undefined'&&window.innerWidth<768;
  const pinchRef                   = useRef(null);

  const svgRef=useRef(null),fileRef=useRef(null),dragRef=useRef(null),didMove=useRef(false);
  const panelOpenedAt=useRef(0);
  const zoomR=useRef(zoom),panR=useRef(pan),selNodeR=useRef(selNode),selEdgeR=useRef(selEdge),appR=useRef(app);
  useEffect(()=>{zoomR.current=zoom;},[zoom]);
  useEffect(()=>{panR.current=pan;},[pan]);
  useEffect(()=>{selNodeR.current=selNode;if(selNode)panelOpenedAt.current=Date.now();},[selNode]);
  useEffect(()=>{selEdgeR.current=selEdge;},[selEdge]);
  useEffect(()=>{appR.current=app;},[app]);

  useEffect(()=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({maps:app.maps,mapOrder:app.mapOrder}));}catch(e){}
  },[app.maps,app.mapOrder]);

  useEffect(()=>{
    const update=()=>{if(svgRef.current){const r=svgRef.current.getBoundingClientRect();setSvgSize({w:r.width,h:r.height});}};
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);
  },[]);

  const {screen,maps,mapOrder,currentMapId,navStack}=app;
  const curMap=currentMapId?maps[currentMapId]:null;
  const selNodeObj=selNode?curMap?.nodes.find(n=>n.id===selNode):null;
  const selEdgeObj=selEdge?curMap?.edges.find(e=>e.id===selEdge):null;

  // ── History ───────────────────────────────────────────────────────────────
  const pushHistory=useCallback(()=>{
    setHistory(h=>{const snap={maps:JSON.parse(JSON.stringify(appR.current.maps)),currentMapId:appR.current.currentMapId};return [...h.slice(-HIST_MAX),snap];});
    setFuture([]);
  },[]);
  const undo=useCallback(()=>{setHistory(h=>{if(!h.length)return h;const snap=h[h.length-1];setFuture(f=>[{maps:JSON.parse(JSON.stringify(appR.current.maps)),currentMapId:appR.current.currentMapId},...f.slice(0,HIST_MAX)]);setApp(s=>({...s,maps:snap.maps,currentMapId:snap.currentMapId}));return h.slice(0,-1);});},[]);
  const redo=useCallback(()=>{setFuture(f=>{if(!f.length)return f;const snap=f[0];setHistory(h=>[...h,{maps:JSON.parse(JSON.stringify(appR.current.maps)),currentMapId:appR.current.currentMapId}]);setApp(s=>({...s,maps:snap.maps,currentMapId:snap.currentMapId}));return f.slice(1);});},[]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const patchNode=(id,patch)=>setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===id?{...n,...patch}:n)}}};});
  const patchEdge=(id,patch)=>setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.map(e=>e.id===id?{...e,...patch}:e)}}};});
  const doDeleteNode=useCallback((id)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.filter(n=>n.id!==id),edges:s.maps[mid].edges.filter(e=>e.from!==id&&e.to!==id)}}};});setSelNode(null);},[pushHistory]);
  const doDeleteEdge=useCallback((id)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.filter(e=>e.id!==id)}}};});setSelEdge(null);},[pushHistory]);
  const doDeleteSubMap=(nodeId,subMapId)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;const nm={...s.maps};const collect=(id)=>{if(!nm[id])return;const sub=nm[id];delete nm[id];sub.nodes?.forEach(n=>n.childMapId&&collect(n.childMapId));};collect(subMapId);return {...s,maps:{...nm,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===nodeId?{...n,childMapId:null}:n)}}};});};
  const doDeleteMultiple=(ids)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.filter(n=>!ids.has(n.id)),edges:s.maps[mid].edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to))}}};});setSelNodes(new Set());setSelNode(null);};
  const patchMultiple=(ids,patch)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>ids.has(n.id)?{...n,...patch}:n)}}};});};
  const addEdgeBetween=(fromId,toId)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;if(s.maps[mid].edges.some(e=>(e.from===fromId&&e.to===toId)||(e.from===toId&&e.to===fromId)))return s;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:[...s.maps[mid].edges,mkEdge(fromId,toId)]}}};});};
  const addGroup=(nodeIds,color)=>{pushHistory();setApp(s=>{const mid=s.currentMapId;const g=mkGroup(nodeIds,color);const groups=(s.maps[mid].groups||[]);return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],groups:[...groups,g]}}};});setSelNodes(new Set());};
  const deleteGroup=(gid)=>setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],groups:(s.maps[mid].groups||[]).filter(g=>g.id!==gid)}}};});
  const patchGroup=(gid,patch)=>setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],groups:(s.maps[mid].groups||[]).map(g=>g.id===gid?{...g,...patch}:g)}}};});
  const addNode=()=>{pushHistory();const n=mkNode('Neu',160+rnd(300),120+rnd(230),COLORS[rnd(COLORS.length)]);setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:[...s.maps[mid].nodes,n]}}};});setSelNode(null);setSelEdge(null);setSidebarOpen(false);};

  // ── Navigation ────────────────────────────────────────────────────────────
  const openSubMap=()=>{if(!selNodeObj)return;setApp(s=>{const mid=s.currentMapId;let tid=selNodeObj.childMapId;let nm=s.maps;if(!tid||!s.maps[tid]){const sub=applyTemplate(mkMap(selNodeObj.label),'blank');tid=sub.id;nm={...s.maps,[sub.id]:sub,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===selNode?{...n,childMapId:sub.id}:n)}};}return {...s,maps:nm,currentMapId:tid,navStack:[...s.navStack,{mapId:mid,label:s.maps[mid].name}]};});setSelNode(null);setPan({x:0,y:0});setZoom(1);};
  const goBack=(idx)=>{setApp(s=>({...s,currentMapId:s.navStack[idx].mapId,navStack:s.navStack.slice(0,idx)}));setSelNode(null);setSelEdge(null);setPan({x:0,y:0});setZoom(1);};
  const goHome=()=>{setApp(s=>({...s,screen:'home',currentMapId:null,navStack:[]}));setSelNode(null);setSelEdge(null);setConnMode(false);setSidebarOpen(false);};
  const openMap=(id)=>{setApp(s=>({...s,screen:'editor',currentMapId:id,navStack:[]}));setSelNode(null);setSelEdge(null);setPan({x:0,y:0});setZoom(1);setCollapsed(new Set());};
  const openLinkMap=(linkMapId)=>{
    // Navigate to a linked map, adding current map to the breadcrumb stack
    setApp(s=>({...s,currentMapId:linkMapId,navStack:[...s.navStack,{mapId:s.currentMapId,label:s.maps[s.currentMapId]?.name||'Map'}]}));
    setSelNode(null);setSelEdge(null);setPan({x:0,y:0});setZoom(1);setCollapsed(new Set());
  };
  const createMap=(name)=>{const m=applyTemplate(mkMap(name),'blank');setApp(s=>({...s,maps:{...s.maps,[m.id]:m},mapOrder:[...s.mapOrder,m.id],screen:'editor',currentMapId:m.id,navStack:[]}));setShowNewMap(false);setPan({x:0,y:0});setZoom(1);};
  const applyTpl=(tpl)=>{setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:applyTemplate({...s.maps[mid],nodes:[],edges:[],groups:[]},tpl)}};});setShowTpl(false);setSelNode(null);setSelEdge(null);};
  const renameMap=(id,name)=>setApp(s=>({...s,maps:{...s.maps,[id]:{...s.maps[id],name}}}));
  const deleteMap=(id)=>{const m=maps[id];setConfirm({msg:`Mind Map "${m?.name}" wirklich löschen?`,onOk:()=>{setApp(s=>{const nm={...s.maps};delete nm[id];return {...s,maps:nm,mapOrder:s.mapOrder.filter(i=>i!==id)};});setConfirm(null);}});};
  // Build full breadcrumb path from any map to a top-level map
  // Returns { stack: [{mapId,label},...], pathStr: "Root › Parent › Map" }
  const buildNavPath=(targetMapId)=>{
    const findParent=(childId)=>{
      for(const [mid,m] of Object.entries(maps)){
        const node=m.nodes?.find(n=>n.childMapId===childId);
        if(node) return {parentMapId:mid,nodeLabel:node.label,mapName:m.name};
      }
      return null;
    };
    // Build chain: [topLevelMapId, ..., targetMapId]
    const chain=[targetMapId];
    const labels=[maps[targetMapId]?.name||'Map'];
    let cur=targetMapId;
    for(let i=0;i<20;i++){
      const p=findParent(cur);
      if(!p) break;
      chain.unshift(p.parentMapId);
      labels.unshift(maps[p.parentMapId]?.name||p.mapName);
      if(mapOrder.includes(p.parentMapId)) break;
      cur=p.parentMapId;
    }
    const stack=chain.slice(0,-1).map((mid,i)=>({mapId:mid,label:maps[mid]?.name||'Map'}));
    const pathStr=labels.join(' › ');
    return {stack, pathStr, mapId:targetMapId};
  };

  const jumpToNode=(mapId,nodeId)=>{
    setGlobalSearchOpen(false);
    const {stack}=buildNavPath(mapId);
    setApp(s=>({...s,screen:'editor',currentMapId:mapId,navStack:stack}));
    setSelNode(null);setSelEdge(null);setPan({x:0,y:0});setZoom(1);
    setTimeout(()=>{
      setSelNode(nodeId);
      const nd=maps[mapId]?.nodes.find(n=>n.id===nodeId);
      if(nd){const svgW=svgRef.current?.clientWidth||800,svgH=svgRef.current?.clientHeight||600;setPan({x:svgW/2-(nd.x+nd.w/2),y:svgH/2-(nd.y+nd.h/2)});}
    },80);
  };

  // ── Export / Import ───────────────────────────────────────────────────────
  const exportJSON=()=>{const json=JSON.stringify(app,null,2);try{const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(json);a.download='mindspace-export.json';document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(ex){}setExportModal({type:'json',content:json});};
  const exportMarkdown=()=>{
    if(!curMap)return;
    const md=`# ${curMap.name}\n\n`+generateMarkdown(curMap.nodes,curMap.edges);
    try{const a=document.createElement('a');a.href='data:text/markdown;charset=utf-8,'+encodeURIComponent(md);a.download=`${curMap.name}.md`;document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(ex){}
    setExportModal({type:'markdown',content:md});
  };
  const exportPNG=()=>{const svg=svgRef.current;if(!svg)return;const s=new XMLSerializer().serializeToString(svg);const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=svg.clientWidth*2;c.height=svg.clientHeight*2;const ctx=c.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#0b0b14';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);const dataUrl=c.toDataURL('image/png');try{const a=document.createElement('a');a.href=dataUrl;a.download=`${curMap?.name||'map'}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(ex){}setExportModal({type:'png',content:dataUrl});};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);};
  const resetAll=()=>{setConfirm({msg:'Alle Daten auf diesem Gerät löschen?',onOk:()=>{try{localStorage.removeItem(STORAGE_KEY);}catch(e){}setApp(createInitial());setConfirm(null);}});};
  const importData=(data)=>{if(data?.maps&&data?.mapOrder)setApp(s=>({...s,...data,screen:'home'}));};
  const autoLayout=(type)=>{if(!curMap)return;pushHistory();const newNodes=type==='radial'?layoutRadial(curMap.nodes):layoutHierarchical(curMap.nodes,curMap.edges);setApp(s=>({...s,maps:{...s.maps,[s.currentMapId]:{...s.maps[s.currentMapId],nodes:newNodes}}}));};

  // ── Pointer helpers ───────────────────────────────────────────────────────
  const evPos=(e)=>e.touches?{clientX:e.touches[0].clientX,clientY:e.touches[0].clientY}:{clientX:e.clientX,clientY:e.clientY};
  const svgCoord=(clientX,clientY)=>{const r=svgRef.current?.getBoundingClientRect()||{left:0,top:0};return {x:(clientX-r.left-panR.current.x)/zoomR.current,y:(clientY-r.top-panR.current.y)/zoomR.current};};

  const applyDrag=(clientX,clientY)=>{
    const dr=dragRef.current;if(!dr)return;
    didMove.current=true;
    if(dr.type==='node'){
      const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===dr.nodeId?{...n,x:dr.ox+dx,y:dr.oy+dy}:n)}}};});
    } else if(dr.type==='multinodes'){
      const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>dr.ids.has(n.id)?{...n,x:(dr.origins[n.id]?.x||n.x)+dx,y:(dr.origins[n.id]?.y||n.y)+dy}:n)}}};});
    } else if(dr.type==='cp'){
      const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.map(edge=>edge.id===dr.edgeId?{...edge,cp:{x:dr.ox+dx,y:dr.oy+dy}}:edge)}}};});
    } else if(dr.type==='pan'){
      setPan({x:dr.ox+(clientX-dr.sx),y:dr.oy+(clientY-dr.sy)});
    } else if(dr.type==='selbox'){
      const c=svgCoord(clientX,clientY);
      setSelBox({x0:dr.sx0,y0:dr.sy0,x1:c.x,y1:c.y});
    }
  };

  // ── Mouse / Keyboard ──────────────────────────────────────────────────────
  useEffect(()=>{
    const onMove=(e)=>{const {clientX,clientY}=evPos(e);applyDrag(clientX,clientY);};
    const onUp=(e)=>{
      const dr=dragRef.current;
      if(dr?.type==='selbox'&&selBox){
        const x0=Math.min(selBox.x0,selBox.x1),x1=Math.max(selBox.x0,selBox.x1);
        const y0=Math.min(selBox.y0,selBox.y1),y1=Math.max(selBox.y0,selBox.y1);
        const cur=appR.current.maps[appR.current.currentMapId];
        if(cur){const ids=new Set(cur.nodes.filter(n=>n.x<x1&&n.x+n.w>x0&&n.y<y1&&n.y+n.h>y0).map(n=>n.id));if(ids.size>0){setSelNodes(ids);setSelNode(null);setSelEdge(null);}}
        setSelBox(null);
      }
      dragRef.current=null;
    };
    const onTouchMove=(e)=>{
      if(e.touches.length===2){
        e.preventDefault();
        const t0=e.touches[0],t1=e.touches[1];
        const dx=t0.clientX-t1.clientX,dy=t0.clientY-t1.clientY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        const midX=(t0.clientX+t1.clientX)/2,midY=(t0.clientY+t1.clientY)/2;
        if(pinchRef.current){
          const ratio=dist/pinchRef.current,oldZoom=zoomR.current;
          const newZoom=Math.min(3,Math.max(0.15,oldZoom*ratio));
          const wx=(midX-panR.current.x)/oldZoom,wy=(midY-panR.current.y)/oldZoom;
          setZoom(newZoom);setPan({x:midX-wx*newZoom,y:midY-wy*newZoom});
        }
        pinchRef.current=dist;return;
      }
      pinchRef.current=null;const {clientX,clientY}=evPos(e);applyDrag(clientX,clientY);
    };
    const onTouchEnd=()=>{dragRef.current=null;pinchRef.current=null;};
    const onKey=(e)=>{
      const tag=document.activeElement.tagName;
      if(e.key==='Escape'){setConnMode(false);setSelNodes(new Set());setInlineEdit(null);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();return;}
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='z'))){e.preventDefault();redo();return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();setGlobalSearchOpen(true);return;}
      if((e.key==='Delete'||e.key==='Backspace')&&tag!=='INPUT'&&tag!=='TEXTAREA'&&!document.activeElement.isContentEditable){
        const nid=selNodeR.current,eid=selEdgeR.current;
        if(nid){const nd=appR.current.maps[appR.current.currentMapId]?.nodes.find(n=>n.id===nid);setConfirm({msg:`Knoten "${nd?.label}" löschen?`,onOk:()=>{doDeleteNode(nid);setConfirm(null);}});}
        else if(eid){setConfirm({msg:'Verbindung löschen?',onOk:()=>{doDeleteEdge(eid);setConfirm(null);}});}
      }
    };
    window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);
    window.addEventListener('touchmove',onTouchMove,{passive:false});window.addEventListener('touchend',onTouchEnd);
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);window.removeEventListener('touchmove',onTouchMove);window.removeEventListener('touchend',onTouchEnd);window.removeEventListener('keydown',onKey);};
  },[undo,redo,doDeleteNode,doDeleteEdge,selBox]);

  useEffect(()=>{
    const svg=svgRef.current;if(!svg)return;
    const wh=(e)=>{e.preventDefault();const rect=svg.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top;const oldZoom=zoomR.current;const newZoom=Math.min(3,Math.max(0.15,oldZoom*(e.deltaY>0?0.92:1.08)));const wx=(mx-panR.current.x)/oldZoom,wy=(my-panR.current.y)/oldZoom;setZoom(newZoom);setPan({x:mx-wx*newZoom,y:my-wy*newZoom});};
    svg.addEventListener('wheel',wh,{passive:false});return()=>svg.removeEventListener('wheel',wh);
  },[screen]);

  const handleBgDown=(e)=>{
    if(inlineEdit){setInlineEdit(null);return;}
    const {clientX,clientY}=evPos(e);didMove.current=false;
    if(dragRef.current?.type==='node')return;
    const c=svgCoord(clientX,clientY);
    dragRef.current={type:'selbox',sx0:c.x,sy0:c.y};
    // also start pan after small delay / movement threshold handled in applyDrag
    // Use pan as fallback if no selection box grew
    dragRef.current._panFallback={sx:clientX,sy:clientY,ox:panR.current.x,oy:panR.current.y};
  };
  const handleBgClick=()=>{if(!didMove.current){setSelNode(null);setSelEdge(null);setSelNodes(new Set());setConnMode(false);setInlineEdit(null);}};
  const handleBgDbl=(e)=>{
    const r=svgRef.current.getBoundingClientRect();const {clientX,clientY}=evPos(e);
    const x=(clientX-r.left-panR.current.x)/zoomR.current,y=(clientY-r.top-panR.current.y)/zoomR.current;
    const n=mkNode('Neu',x-79,y-24,COLORS[rnd(COLORS.length)]);
    setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:[...s.maps[mid].nodes,n]}}};});
    setSelNode(n.id);setSelEdge(null);
  };
  const handleNodeDown=(e,nodeId)=>{
    e.stopPropagation();didMove.current=false;
    if(inlineEdit){setInlineEdit(null);return;}
    const {clientX,clientY}=evPos(e);const isTouch=!!e.touches;
    if(connectMode&&selNodeR.current&&nodeId!==selNodeR.current){addEdgeBetween(selNodeR.current,nodeId);setConnMode(false);return;}
    if(!isTouch){
      if(selNodes.size>0&&selNodes.has(nodeId)){
        const cur=appR.current.maps[appR.current.currentMapId];
        const origins={};cur.nodes.filter(n=>selNodes.has(n.id)).forEach(n=>{origins[n.id]={x:n.x,y:n.y};});
        dragRef.current={type:'multinodes',ids:new Set(selNodes),origins,sx:clientX,sy:clientY};
        return;
      }
      setSelNode(nodeId);setSelEdge(null);setSelNodes(new Set());
    }
    const nd=curMap.nodes.find(n=>n.id===nodeId);
    if(nd) dragRef.current={type:'node',nodeId,sx:clientX,sy:clientY,ox:nd.x,oy:nd.y};
  };
  // Separate click handler for link-node navigation (fires after mouseup, only if no drag)
  const handleNodeClick=(e,nodeId)=>{e.stopPropagation();};
  const handleNodeDbl=(e,nodeId)=>{
    e.stopPropagation();
    const nd=curMap?.nodes.find(n=>n.id===nodeId);
    // Link-nodes: double-click navigates immediately
    if(nd?.linkMapId&&maps[nd.linkMapId]){openLinkMap(nd.linkMapId);return;}
    if(nd) setInlineEdit({id:nodeId,val:nd.label});
  };
  const handleNodeTouchEnd=(e,nodeId)=>{
    e.stopPropagation();
    if(connectMode&&selNodeR.current&&nodeId!==selNodeR.current){addEdgeBetween(selNodeR.current,nodeId);setConnMode(false);return;}
    if(!didMove.current){setSelNode(nodeId);setSelEdge(null);setSelNodes(new Set());}
  };
  const handleEdgeClick=(e,edgeId)=>{e.stopPropagation();setSelEdge(edgeId);setSelNode(null);setSelNodes(new Set());};
  const handleCpDown=(e,edgeId,cpx,cpy)=>{e.stopPropagation();didMove.current=false;const {clientX,clientY}=evPos(e);dragRef.current={type:'cp',edgeId,sx:clientX,sy:clientY,ox:cpx,oy:cpy};};
  const handleImgUpload=(e)=>{const f=e.target.files[0];if(!f||!selNodeObj)return;const r=new FileReader();r.onload=ev=>patchNode(selNode,{images:[...(selNodeObj.images||[]),ev.target.result]});r.readAsDataURL(f);e.target.value='';};

  // Override handleBgDown to do pan when not selecting
  const handleSvgMouseDown=(e)=>{
    if(e.target===svgRef.current||e.target.tagName==='rect'&&e.target.getAttribute('fill')==='url(#grd)'){
      const {clientX,clientY}=evPos(e);didMove.current=false;
      const c=svgCoord(clientX,clientY);
      dragRef.current={type:'pan_or_selbox',sx:clientX,sy:clientY,ox:panR.current.x,oy:panR.current.y,sx0:c.x,sy0:c.y};
    }
  };

  // Patch applyDrag to handle pan_or_selbox
  const applyDrag2=(clientX,clientY)=>{
    const dr=dragRef.current;if(!dr)return;
    didMove.current=true;
    if(dr.type==='pan_or_selbox'){
      const dx=clientX-dr.sx,dy=clientY-dr.sy;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist>8){
        // decide: if shift held OR small initial movement, do selbox; else pan
        const c=svgCoord(clientX,clientY);
        if(dr._selbox){setSelBox({x0:dr.sx0,y0:dr.sy0,x1:c.x,y1:c.y});}
        else{setPan({x:dr.ox+dx,y:dr.oy+dy});}
      }
      return;
    }
    if(dr.type==='node'){
      const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===dr.nodeId?{...n,x:dr.ox+dx,y:dr.oy+dy}:n)}}};});
    } else if(dr.type==='multinodes'){
      const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>dr.ids.has(n.id)?{...n,x:(dr.origins[n.id]?.x||n.x)+dx,y:(dr.origins[n.id]?.y||n.y)+dy}:n)}}};});
    } else if(dr.type==='cp'){
      const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.map(edge=>edge.id===dr.edgeId?{...edge,cp:{x:dr.ox+dx,y:dr.oy+dy}}:edge)}}};});
    } else if(dr.type==='pan'){
      setPan({x:dr.ox+(clientX-dr.sx),y:dr.oy+(clientY-dr.sy)});
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const inp={width:'100%',background:'#0d0d18',border:'1px solid #1e1e32',color:'#e2e8f0',borderRadius:7,padding:'7px 10px',fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:'inherit'};
  const btn=(col,bg='transparent')=>({background:bg,border:`1px solid ${col}35`,color:col,borderRadius:7,padding:'7px 10px',fontSize:12,cursor:'pointer',textAlign:'left',width:'100%',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6});
  const lbl={fontSize:10,color:'#3a3a55',letterSpacing:'0.1em',display:'block',marginBottom:7};

  // ── Derived ───────────────────────────────────────────────────────────────
  const searchLow=searchTerm.toLowerCase();
  const allTags=curMap?[...new Set(curMap.nodes.flatMap(n=>n.tags||[]))]:[];
  const matchingIds=searchTerm?new Set(curMap?.nodes.filter(n=>n.label.toLowerCase().includes(searchLow)||(n.tags||[]).some(t=>t.toLowerCase().includes(searchLow))).map(n=>n.id)):null;

  // Focus mode: which nodes are "visible"
  const focusVisibleIds=focusMode&&selNode&&curMap?new Set([selNode,...curMap.edges.filter(e=>e.from===selNode||e.to===selNode).flatMap(e=>[e.from,e.to])]):null;

  // Collapse: compute all descendants of collapsed nodes
  const collapsedHidden=curMap?(() => {
    const hidden=new Set();
    collapsedNodes.forEach(nid=>{
      if(curMap.nodes.find(n=>n.id===nid)){
        getDescendants(nid,curMap.edges).forEach(id=>hidden.add(id));
      }
    });
    return hidden;
  })():new Set();

  const toggleCollapse=(nodeId)=>setCollapsed(s=>{
    const n=new Set(s);n.has(nodeId)?n.delete(nodeId):n.add(nodeId);return n;
  });

  const visibleNodes=curMap?.nodes.filter(n=>{
    if(collapsedHidden.has(n.id)) return false;
    if(filterColors.size>0 && !filterColors.has(n.color)) return false;
    if(filterTags.size>0){
      const nodeTags=n.tags||[];
      if(nodeTags.length===0) return false;
      if(!nodeTags.some(t=>filterTags.has(t))) return false;
    }
    if(filterStatus.size>0){
      if(!filterStatus.has(n.status||'none')) return false;
    }
    return true;
  })||[];

  // Visible edges: hide edges where either endpoint is a collapsed-hidden node
  const visibleEdges=curMap?.edges.filter(e=>!collapsedHidden.has(e.from)&&!collapsedHidden.has(e.to))||[];

  // Count of hidden children per collapsed node (for badge)
  const collapsedChildCount={};
  collapsedNodes.forEach(nid=>{
    if(curMap?.nodes.find(n=>n.id===nid)){
      collapsedChildCount[nid]=getDescendants(nid,curMap.edges||[]).size;
    }
  });

  // Backlinks: show which nodes in other maps have opened the CURRENT map as sub-map
  // i.e. "this map was created from node X in map Y"
  const backlinks=curMap?Object.entries(maps).filter(([mid])=>mid!==currentMapId).flatMap(([mid,m])=>
    m.nodes.filter(n=>n.childMapId===currentMapId).map(n=>{
      const {pathStr}=buildNavPath(mid);
      return {mapId:mid,mapName:m.name,nodeLabel:n.label,nodeId:n.id,pathStr};
    })
  ):[];

  // ── Home ──────────────────────────────────────────────────────────────────
  if(screen==='home') return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Unbounded:wght@600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}button:hover{opacity:.78;cursor:pointer;}`}</style>
      <HomeScreen maps={maps} mapOrder={mapOrder} onOpen={openMap} onDelete={deleteMap} onNew={()=>setShowNewMap(true)} onRename={renameMap} onImport={importData} onReset={resetAll} onGlobalSearch={()=>setGlobalSearchOpen(true)}/>
      {showNewMap && <NewMapModal onClose={()=>setShowNewMap(false)} onCreate={createMap}/>}
      {confirm    && <ConfirmModal msg={confirm.msg} onOk={confirm.onOk} onCancel={()=>setConfirm(null)}/>}
      {globalSearchOpen && <GlobalSearchPanel maps={maps} mapOrder={mapOrder} onJump={jumpToNode} onClose={()=>setGlobalSearchOpen(false)}/>}
    </>
  );

  if(!curMap) return null;

  // ── Editor ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',height:'100vh',background:'#0b0b14',color:'#c9d1d9',fontFamily:'"IBM Plex Sans",sans-serif',overflow:'hidden',userSelect:'none',touchAction:'none'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Unbounded:wght@600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0b0b14}::-webkit-scrollbar-thumb{background:#252540;border-radius:2px}input:focus,textarea:focus{border-color:#818cf8!important}button:hover{opacity:.78;}`}</style>

      {sidebarOpen&&isMobile&&<div onClick={()=>setSidebarOpen(false)} style={{position:'fixed',inset:0,background:'#00000060',zIndex:99}}/>}
      {isMobile&&<button onClick={()=>setSidebarOpen(v=>!v)} style={{position:'fixed',top:12,left:12,zIndex:200,background:'#818cf8',border:'none',color:'#fff',borderRadius:10,width:42,height:42,fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px #00000066',cursor:'pointer'}}>{sidebarOpen?'×':'☰'}</button>}

      {/* LEFT SIDEBAR */}
      <div style={{width:215,background:'#0e0e19',borderRight:'1px solid #181828',display:'flex',flexDirection:'column',padding:14,flexShrink:0,overflowY:'auto',...(isMobile?{position:'fixed',top:0,left:0,height:'100vh',zIndex:100,transform:sidebarOpen?'translateX(0)':'translateX(-100%)',transition:'transform .25s',boxShadow:sidebarOpen?'4px 0 32px #000000aa':'none'}:{})}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,paddingLeft:isMobile?52:0}}>
          <button onClick={goHome} style={{background:'none',border:'none',color:'#818cf8',fontSize:16,padding:'2px 5px',borderRadius:5,fontFamily:'inherit',cursor:'pointer'}}>←</button>
          <div style={{fontFamily:'Unbounded',fontSize:12,color:'#818cf8'}}>◈ MindSpace</div>
        </div>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:7}}>NAVIGATION</div>
        {navStack.map((s,i)=><button key={i} onClick={()=>goBack(i)} style={{background:'none',border:'none',color:'#818cf8',fontSize:11,textAlign:'left',padding:'3px 6px',borderRadius:5,fontFamily:'inherit',marginBottom:2,display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}><span style={{opacity:.5}}>↩</span>{s.label}</button>)}
        {/* Current map name — click ✎ to rename */}
        {mapNameEdit
          ? <div style={{display:'flex',gap:5,marginBottom:16}}>
              <input autoFocus value={mapNameEdit} onChange={e=>setMapNameEdit(e.target.value)}
                onBlur={()=>{if(mapNameEdit.trim())renameMap(currentMapId,mapNameEdit.trim());setMapNameEdit(null);}}
                onKeyDown={e=>{if(e.key==='Enter'){if(mapNameEdit.trim())renameMap(currentMapId,mapNameEdit.trim());setMapNameEdit(null);}if(e.key==='Escape')setMapNameEdit(null);}}
                style={{...inp,fontSize:12,flex:1,padding:'4px 8px'}}/>
            </div>
          : <div style={{fontSize:12,color:'#e2e8f0',fontWeight:500,padding:'5px 8px',background:'#161626',borderRadius:7,marginBottom:16,display:'flex',alignItems:'center',gap:7,cursor:'pointer'}} onClick={()=>setMapNameEdit(curMap.name)}>
              <span style={{color:'#818cf8'}}>◉</span>
              <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{curMap.name}</span>
              <span style={{color:'#3a3a55',fontSize:11}}>✎</span>
            </div>
        }

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:7}}>SUCHE</div>
        <div style={{position:'relative',marginBottom:8}}>
          <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Knoten / Tags…" style={{...inp,fontSize:11,paddingRight:26}}/>
          {searchTerm&&<span onClick={()=>setSearchTerm('')} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#3a3a55',fontSize:14}}>×</span>}
        </div>
        <button onClick={()=>setGlobalSearchOpen(true)} style={{...btn('#818cf8'),justifyContent:'center',fontSize:11,marginBottom:14}}>🔍 Alle Maps suchen</button>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:7}}>WERKZEUGE</div>
        <button onClick={addNode} style={{...btn('#818cf8','#818cf812'),justifyContent:'center',fontWeight:500,marginBottom:5}}>+ Knoten</button>
        <button onClick={()=>setConnMode(v=>!v)} style={{...btn(connectMode?'#f472b6':'#a5b4fc',connectMode?'#f472b615':'transparent'),justifyContent:'center',marginBottom:5}}>🔗 {connectMode?'Verbinden aktiv':'Verbinden'}</button>
        <button onClick={()=>setShowTpl(true)} style={{...btn('#7dd3fc'),justifyContent:'center',marginBottom:5}}>📐 Vorlage</button>
        <button onClick={()=>autoLayout('radial')} style={{...btn('#a78bfa'),justifyContent:'center',marginBottom:5}}>⊙ Radial-Layout</button>
        <button onClick={()=>autoLayout('hierarchical')} style={{...btn('#a78bfa'),justifyContent:'center',marginBottom:5}}>⊤ Hierarchie-Layout</button>
        <button onClick={()=>setFocusMode(v=>!v)} style={{...btn(focusMode?'#fbbf24':'#4a4a6a',focusMode?'#fbbf2415':'transparent'),justifyContent:'center',marginBottom:14,border:`1px solid ${focusMode?'#fbbf2460':'#1e1e30'}`}}>👁 Fokus-Modus {focusMode?'AN':'AUS'}</button>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:8}}>FARB-FILTER</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:4}}>
          {COLORS.map(c=>{const active=filterColors.has(c);return <div key={c} onClick={()=>setFilterColors(s=>{const n=new Set(s);n.has(c)?n.delete(c):n.add(c);return n;})} style={{width:18,height:18,borderRadius:'50%',background:c,cursor:'pointer',border:active?'3px solid #fff':'2px solid transparent',opacity:active||filterColors.size===0?1:.3,transition:'all .15s'}}/>;})}</div>
        {filterColors.size>0&&<button onClick={()=>setFilterColors(new Set())} style={{fontSize:9,color:'#f472b6',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',marginBottom:6,padding:0}}>× Filter zurücksetzen</button>}
        {filterColors.size===0&&<div style={{height:6}}/>}

        {allTags.length>0&&<>
          <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:6}}>TAG-FILTER</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:4}}>
            {allTags.map(t=>{const active=filterTags.has(t);return <div key={t} onClick={()=>setFilterTags(s=>{const n=new Set(s);n.has(t)?n.delete(t):n.add(t);return n;})} style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:active?'#818cf8':'#1e1e30',color:active?'#0b0b14':'#818cf8',cursor:'pointer',border:`1px solid ${active?'#818cf8':'#818cf840'}`,transition:'all .15s',opacity:active||filterTags.size===0?1:.4}}>#{t}</div>;})}</div>
          {filterTags.size>0&&<button onClick={()=>setFilterTags(new Set())} style={{fontSize:9,color:'#f472b6',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',marginBottom:4,padding:0}}>× Filter zurücksetzen</button>}
          <div style={{height:6}}/>
        </>}

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:6}}>STATUS-FILTER</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:4}}>
          {[{id:'none',icon:'–',label:'Kein Status'},...STATUS_LIST].map(s=>{const active=filterStatus.has(s.id);return <div key={s.id} title={s.label} onClick={()=>setFilterStatus(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})} style={{fontSize:14,padding:'3px 6px',borderRadius:7,background:active?'#252540':'transparent',border:`1px solid ${active?'#818cf8':'#252540'}`,cursor:'pointer',opacity:active||filterStatus.size===0?1:.4,transition:'all .15s'}}>{s.icon}</div>;})}</div>
        {filterStatus.size>0&&<button onClick={()=>setFilterStatus(new Set())} style={{fontSize:9,color:'#f472b6',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',marginBottom:4,padding:0}}>× Filter zurücksetzen</button>}
        <div style={{height:10}}/>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:8}}>EXPORT</div>
        <button onClick={exportJSON}     style={{...btn('#34d399'),marginBottom:5,fontSize:11}}>💾 Als JSON speichern</button>
        <button onClick={exportMarkdown} style={{...btn('#34d399'),marginBottom:5,fontSize:11}}>📋 Als Markdown/Outline</button>
        <button onClick={exportPNG}      style={{...btn('#34d399'),marginBottom:14,fontSize:11}}>🖼 Als PNG exportieren</button>

        <div style={{display:'flex',gap:5,marginBottom:8}}>
          <button onClick={undo} disabled={!history.length} style={{...btn(history.length?'#a5b4fc':'#252540'),flex:1,justifyContent:'center',fontSize:11,opacity:history.length?1:.4}}>↩ Undo</button>
          <button onClick={redo} disabled={!future.length} style={{...btn(future.length?'#a5b4fc':'#252540'),flex:1,justifyContent:'center',fontSize:11,opacity:future.length?1:.4}}>↪ Redo</button>
        </div>
        <button onClick={()=>setShowMinimap(v=>!v)} style={{...btn(showMinimap?'#34d399':'#4a4a6a'),justifyContent:'center',fontSize:11,marginBottom:5}}>🗺 Minimap {showMinimap?'AN':'AUS'}</button>
        <div style={{marginTop:'auto',paddingTop:10}}>
          {/* Map-level backlinks in sidebar */}
          {backlinks.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:6}}>EINGEBETTET IN</div>
              {backlinks.map((bl,i)=>(
                <div key={i} onClick={()=>jumpToNode(bl.mapId,bl.nodeId)}
                  style={{fontSize:10,color:'#818cf8',cursor:'pointer',padding:'4px 7px',background:'#0d0d18',borderRadius:6,marginBottom:3,border:'1px solid #1e1e30',lineHeight:1.6}}>
                  <div style={{color:'#e2e8f0',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>↩ {bl.nodeLabel}</div>
                  <div style={{color:'#3a3a55',fontSize:9,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bl.pathStr}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:9,color:'#1e1e30',lineHeight:1.8}}>
            Doppelklick = neuer Knoten<br/>Shift + Ziehen = Auswahl<br/>Ctrl+F = Globale Suche<br/>Ctrl+Z/Y = Undo/Redo
          </div>
        </div>
      </div>

      {/* CANVAS */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <svg ref={svgRef} width="100%" height="100%"
          onMouseDown={e=>{
            const dr=dragRef.current;
            const {clientX,clientY}=e;
            didMove.current=false;
            if(e.shiftKey){
              const c=svgCoord(clientX,clientY);
              dragRef.current={type:'selbox',sx0:c.x,sy0:c.y};
            } else {
              if(dr?.type==='node')return;
              dragRef.current={type:'pan',sx:clientX,sy:clientY,ox:panR.current.x,oy:panR.current.y};
            }
          }}
          onTouchStart={e=>{didMove.current=false;const {clientX,clientY}=evPos(e);dragRef.current={type:'pan',sx:clientX,sy:clientY,ox:panR.current.x,oy:panR.current.y};}}
          onClick={handleBgClick}
          onDoubleClick={handleBgDbl}
          style={{cursor:connectMode?'crosshair':'default'}}>
          <defs>
            <pattern id="grd" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="0.9" fill="#1e1e2e"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grd)"/>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Groups / Boundaries */}
            {(curMap.groups||[]).map(g=>{
              const gnodes=curMap.nodes.filter(n=>g.nodeIds.includes(n.id));
              if(!gnodes.length)return null;
              const gx0=Math.min(...gnodes.map(n=>n.x))-16,gy0=Math.min(...gnodes.map(n=>n.y))-28;
              const gx1=Math.max(...gnodes.map(n=>n.x+n.w))+16,gy1=Math.max(...gnodes.map(n=>n.y+n.h))+16;
              return (
                <g key={g.id}>
                  <rect x={gx0} y={gy0} width={gx1-gx0} height={gy1-gy0} rx={14} fill={`${g.color}0d`} stroke={g.color} strokeWidth={1.5} strokeDasharray="6,4" opacity={.9}/>
                  {g.label&&<text x={gx0+10} y={gy0+18} fill={g.color} fontSize={11} fontFamily="IBM Plex Sans" fontWeight={600} opacity={.85}>{g.label}</text>}
                  <text x={gx1-14} y={gy0+16} fill={g.color} fontSize={13} opacity={.6} style={{cursor:'pointer'}} onClick={()=>deleteGroup(g.id)}>×</text>
                </g>
              );
            })}

            {/* Edges */}
            {visibleEdges.map(edge=>{
              const fn=curMap.nodes.find(n=>n.id===edge.from),tn=curMap.nodes.find(n=>n.id===edge.to);
              if(!fn||!tn)return null;
              const geo=edgeGeometry(fn,tn,edge.style,edge.cp);
              const isSel=selEdge===edge.id;
              const col=edge.color||'#6b6b9a';
              const focusDim=focusVisibleIds&&!focusVisibleIds.has(edge.from)&&!focusVisibleIds.has(edge.to);
              const isEditingLbl=inlineEdgeLbl?.id===edge.id;
              return (
                <g key={edge.id}
                  onClick={ev=>handleEdgeClick(ev,edge.id)}
                  onDoubleClick={ev=>{ev.stopPropagation();setInlineEdgeLbl({id:edge.id,val:edge.label||'',x:geo.mid.x,y:geo.mid.y});}}
                  style={{opacity:focusDim?.15:1,transition:'opacity .3s'}}>
                  <path d={geo.d} fill="none" stroke="transparent" strokeWidth={18}/>
                  <path d={geo.d} fill="none" stroke={col} strokeWidth={isSel?2.5:1.5} strokeDasharray={isSel?'7,3':undefined}/>
                  {(edge.arrow==='forward'||edge.arrow==='both')&&<polygon points={arrowPts(geo.x2,geo.y2,geo.endDir)} fill={col}/>}
                  {(edge.arrow==='backward'||edge.arrow==='both')&&<polygon points={arrowPts(geo.x1,geo.y1,geo.startDir)} fill={col}/>}
                  {isSel&&geo.handlePos&&<circle cx={geo.handlePos.x} cy={geo.handlePos.y} r={9} fill="#818cf8" stroke="#0b0b14" strokeWidth={2} style={{cursor:'grab'}} onMouseDown={ev=>{ev.stopPropagation();if(!edge.routing)patchEdge(edge.id,{routing:true});handleCpDown(ev,edge.id,geo.handlePos.x,geo.handlePos.y);}} onTouchStart={ev=>{ev.stopPropagation();if(!edge.routing)patchEdge(edge.id,{routing:true});handleCpDown(ev,edge.id,geo.handlePos.x,geo.handlePos.y);}} onClick={ev=>ev.stopPropagation()}/>}
                  {/* Inline label editor OR static label */}
                  {isEditingLbl
                    ?<foreignObject x={geo.mid.x-60} y={geo.mid.y-12} width={120} height={24} onClick={ev=>ev.stopPropagation()}>
                      <input autoFocus value={inlineEdgeLbl.val}
                        onChange={e=>setInlineEdgeLbl(v=>({...v,val:e.target.value}))}
                        onBlur={()=>{patchEdge(edge.id,{label:inlineEdgeLbl.val});setInlineEdgeLbl(null);}}
                        onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape'){patchEdge(edge.id,{label:inlineEdgeLbl.val});setInlineEdgeLbl(null);}e.stopPropagation();}}
                        placeholder="Label…"
                        style={{width:'100%',background:'#0d0d18',border:`1px solid ${col}`,color:'#e2e8f0',borderRadius:4,padding:'2px 6px',fontSize:11,outline:'none',fontFamily:'IBM Plex Sans',boxSizing:'border-box',textAlign:'center'}}/>
                    </foreignObject>
                    :edge.label&&<><rect x={geo.mid.x-edge.label.length*3.3-5} y={geo.mid.y-9} width={edge.label.length*6.5+10} height={17} rx={4} fill="#0e0e1a" stroke={col} strokeWidth={.8} opacity={.92}/><text x={geo.mid.x} y={geo.mid.y+4} textAnchor="middle" fill={col} fontSize={10} fontFamily="IBM Plex Sans">{edge.label}</text></>
                  }
                </g>
              );
            })}

            {/* Nodes */}
            {visibleNodes.map(node=>{
              const isSel=selNode===node.id;
              const isMultiSel=selNodes.has(node.id);
              const isMatch=matchingIds&&matchingIds.has(node.id);
              const focusDim=focusVisibleIds&&!focusVisibleIds.has(node.id);
              const statusItem=STATUS_LIST.find(s=>s.id===node.status);
              return (
                <g key={node.id}
                  onMouseDown={e=>handleNodeDown(e,node.id)}
                  onClick={e=>handleNodeClick(e,node.id)}
                  onTouchStart={e=>handleNodeDown(e,node.id)}
                  onTouchEnd={e=>handleNodeTouchEnd(e,node.id)}
                  onDoubleClick={e=>handleNodeDbl(e,node.id)}
                  onMouseEnter={()=>setHoverNode(node.id)}
                  onMouseLeave={()=>setHoverNode(null)}
                  style={{cursor:connectMode?'crosshair':node.linkMapId?'pointer':'grab',opacity:focusDim?.15:1,transition:'opacity .3s'}}>
                  {isMultiSel&&<rect x={node.x-7} y={node.y-7} width={node.w+14} height={node.h+14} rx={14} fill="#818cf8" opacity={.12} style={{pointerEvents:'none'}}/>}
                  {isSel&&<rect x={node.x-9} y={node.y-9} width={node.w+18} height={node.h+18} rx={16} fill={node.color} opacity={.1} style={{pointerEvents:'none'}}/>}
                  {isMatch&&<rect x={node.x-5} y={node.y-5} width={node.w+10} height={node.h+10} rx={13} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={.8} style={{pointerEvents:'none'}}/>}
                  <NodeShape node={node} selected={isSel}/>
                  {(node.shape==='rounded'||node.shape==='rect')&&<rect x={node.x} y={node.y} width={5} height={node.h} rx={2} fill={node.color} style={{pointerEvents:'none'}}/>}

                  {/* Inline edit or label */}
                  {inlineEdit?.id===node.id
                    ?<foreignObject x={node.x+8} y={node.y+node.h/2-12} width={node.w-16} height={24}>
                      <input value={inlineEdit.val}
                        autoFocus
                        onChange={e=>setInlineEdit(v=>({...v,val:e.target.value}))}
                        onBlur={()=>{if(inlineEdit)patchNode(inlineEdit.id,{label:inlineEdit.val||'Neu'});setInlineEdit(null);}}
                        onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape'){patchNode(inlineEdit.id,{label:inlineEdit.val||'Neu'});setInlineEdit(null);}e.stopPropagation();}}
                        onClick={e=>e.stopPropagation()}
                        style={{width:'100%',background:'#0d0d18',border:'1px solid #818cf8',color:'#e2e8f0',borderRadius:4,padding:'2px 6px',fontSize:12,outline:'none',fontFamily:'IBM Plex Sans',boxSizing:'border-box'}}/>
                    </foreignObject>
                    :<text x={node.x+(node.shape==='rounded'||node.shape==='rect'?5:0)+node.w/2-(node.shape==='rounded'||node.shape==='rect'?2.5:0)} y={node.y+node.h/2+5}
                      textAnchor="middle" fill="#e2e8f0" fontSize={12} fontFamily="IBM Plex Sans" style={{pointerEvents:'none'}}
                      clipPath={`inset(0 0 0 0)`}>{node.label}</text>
                  }

                  {/* Status icon */}
                  {statusItem&&<text x={node.x+node.w-4} y={node.y+4} fontSize={13} textAnchor="end" dominantBaseline="hanging" style={{pointerEvents:'none'}}>{statusItem.icon}</text>}
                  {/* Tags indicator */}
                  {(node.tags||[]).length>0&&<circle cx={node.x+8} cy={node.y+node.h-8} r={4} fill="#818cf8" opacity={.7} style={{pointerEvents:'none'}}/>}
                  {/* Sub-map indicator */}
                  {node.childMapId&&<circle cx={node.x+node.w-9} cy={node.y+9} r={5} fill={node.color} opacity={.9} style={{pointerEvents:'none'}}/>}
                  {/* Link-map indicator: ⇒ arrow + dashed underline */}
                  {node.linkMapId&&maps[node.linkMapId]&&<>
                    <text x={node.x+node.w-5} y={node.y+node.h-5} fontSize={11} textAnchor="end" fill={node.color} opacity={.9} style={{pointerEvents:'none'}}>⇒</text>
                    <line x1={node.x+8} y1={node.y+node.h-1} x2={node.x+node.w-8} y2={node.y+node.h-1} stroke={node.color} strokeWidth={1} strokeDasharray="3,2" opacity={.5} style={{pointerEvents:'none'}}/>
                  </>}
                  {/* Notes indicator */}
                  {node.notesHtml&&<circle cx={node.x+node.w-22} cy={node.y+9} r={4} fill="#818cf860" style={{pointerEvents:'none'}}/>}
                  {/* Collapse badge */}
                  {collapsedNodes.has(node.id)&&(()=>{
                    const cnt=collapsedChildCount[node.id]||0;
                    const label=`+${cnt}`;
                    const bw=label.length*7+10;
                    return <g style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();toggleCollapse(node.id);}}>
                      <rect x={node.x+node.w/2-bw/2} y={node.y+node.h+4} width={bw} height={16} rx={8} fill={node.color} opacity={.9}/>
                      <text x={node.x+node.w/2} y={node.y+node.h+15} textAnchor="middle" fill="#0b0b14" fontSize={9} fontFamily="IBM Plex Sans" fontWeight={700}>{label}</text>
                    </g>;
                  })()}
                </g>
              );
            })}

            {/* Rubber band selection */}
            {selBox&&(()=>{
              const x=Math.min(selBox.x0,selBox.x1),y=Math.min(selBox.y0,selBox.y1);
              const w=Math.abs(selBox.x1-selBox.x0),h=Math.abs(selBox.y1-selBox.y0);
              return <rect x={x} y={y} width={w} height={h} fill="#818cf815" stroke="#818cf8" strokeWidth={1} strokeDasharray="5,3" style={{pointerEvents:'none'}}/>;
            })()}

          </g>

          {/* Connect mode overlay */}
          {connectMode&&<rect x={10} y={10} width={280} height={28} rx={7} fill="#180d1a" stroke="#f472b640" strokeWidth={1}/>}
          {connectMode&&<text x={20} y={29} fill="#f472b6" fontSize={11} fontFamily="IBM Plex Sans">🔗 Quellknoten: {curMap.nodes.find(n=>n.id===selNode)?.label||'—'} → Ziel antippen</text>}
        </svg>

        {/* Hover tooltip */}
        {hoverNode&&(()=>{const nd=curMap.nodes.find(n=>n.id===hoverNode);if(!nd||!nd.notesHtml)return null;const plain=nd.notesHtml.replace(/<[^>]+>/g,'').slice(0,120);return <div style={{position:'absolute',bottom:16,left:16,background:'#0f0f1a',border:'1px solid #252545',borderRadius:10,padding:'8px 12px',maxWidth:280,fontSize:11,color:'#7a7a9a',lineHeight:1.6,zIndex:40,pointerEvents:'none'}}><span style={{color:nd.color,marginRight:6}}>●</span>{plain}{nd.notesHtml.replace(/<[^>]+>/g,'').length>120?'…':''}</div>;})()}

        {showMinimap&&<Minimap nodes={visibleNodes} edges={curMap.edges} pan={pan} zoom={zoom} svgW={svgSize.w} svgH={svgSize.h} hiddenColors={filterColors}/>}

        {/* Canvas overlay: Fokus-Modus toggle + active filter badges */}
        <div style={{position:'absolute',top:12,right:12,display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,zIndex:50,pointerEvents:'none'}}>
          <button onClick={()=>setFocusMode(v=>!v)} style={{pointerEvents:'all',background:focusMode?'#fbbf24':'#0e0e19cc',border:`1px solid ${focusMode?'#fbbf24':'#252540'}`,color:focusMode?'#0b0b14':'#7a7a9a',borderRadius:9,padding:'6px 11px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:focusMode?600:400,boxShadow:'0 2px 12px #00000055',backdropFilter:'blur(4px)'}}>
            👁 {focusMode?'Fokus AN':'Fokus'}
          </button>
          {(filterColors.size>0||filterTags.size>0||filterStatus.size>0)&&(
            <div style={{pointerEvents:'all',background:'#0e0e19cc',border:'1px solid #fbbf2440',borderRadius:9,padding:'5px 10px',fontSize:10,color:'#fbbf24',display:'flex',gap:6,alignItems:'center',backdropFilter:'blur(4px)',cursor:'pointer'}} onClick={()=>{setFilterColors(new Set());setFilterTags(new Set());setFilterStatus(new Set());}}>
              ⚠ Filter aktiv — × zurücksetzen
            </div>
          )}
        </div>

        {/* Multi-select action bar */}
        {selNodes.size>0&&(
          <div style={{position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',background:'#0f0f1a',border:'1px solid #818cf840',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,zIndex:60,boxShadow:'0 8px 32px #00000088',flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:'#818cf8',fontWeight:600,whiteSpace:'nowrap'}}>{selNodes.size} Knoten</span>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {COLORS.slice(0,9).map(c=><div key={c} onClick={()=>patchMultiple(selNodes,{color:c})} style={{width:16,height:16,borderRadius:'50%',background:c,cursor:'pointer',border:'2px solid transparent'}}/>)}
            </div>
            <button onClick={()=>{const grpColor=COLORS[rnd(COLORS.length)];addGroup([...selNodes],grpColor);}} style={{background:'#252540',border:'none',color:'#a5b4fc',borderRadius:7,padding:'5px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>⬚ Gruppieren</button>
            <button onClick={()=>setConfirm({msg:`${selNodes.size} Knoten löschen?`,onOk:()=>{doDeleteMultiple(selNodes);setConfirm(null);}})} style={{background:'#f8717115',border:'none',color:'#f87171',borderRadius:7,padding:'5px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>🗑️</button>
            <button onClick={()=>setSelNodes(new Set())} style={{background:'none',border:'none',color:'#3a3a55',fontSize:16,cursor:'pointer',padding:'0 4px'}}>×</button>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      {(selNodeObj||selEdgeObj)&&!connectMode&&(
        <div style={{width:220,background:'#0e0e19',borderLeft:'1px solid #181828',display:'flex',flexDirection:'column',flexShrink:0,...(isMobile?{position:'fixed',top:0,right:0,height:'100vh',zIndex:100,boxShadow:'-4px 0 32px #000000aa'}:{})}}>
          <div style={{padding:'12px 14px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:6}}>
            <div style={{fontSize:11,fontWeight:600,color:'#e2e8f0',flex:1}}>{selNodeObj?selNodeObj.label:selEdgeObj?.label||'Verbindung'}</div>
            <div onClick={()=>{setSelNode(null);setSelEdge(null);}} style={{marginLeft:'auto',cursor:'pointer',color:'#3a3a55',fontSize:16}}>×</div>
          </div>
          <div style={{padding:14,overflowY:'auto',flex:1}}>

            {selNodeObj&&(
              <>
                <label style={lbl}>BEZEICHNUNG</label>
                <input value={selNodeObj.label} onChange={e=>patchNode(selNode,{label:e.target.value})} style={{...inp,marginBottom:14}}/>

                <label style={lbl}>STATUS</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:14}}>
                  <div onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{status:null});}}
                    style={{fontSize:13,cursor:'pointer',padding:'3px 6px',borderRadius:6,background:!selNodeObj.status?'#252540':'transparent',border:`1px solid ${!selNodeObj.status?'#818cf8':'#252540'}`}}>–</div>
                  {STATUS_LIST.map(s=><div key={s.id} title={s.label} onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{status:selNodeObj.status===s.id?null:s.id});}}
                    style={{fontSize:15,cursor:'pointer',padding:'3px 5px',borderRadius:6,background:selNodeObj.status===s.id?'#252540':'transparent',border:`1px solid ${selNodeObj.status===s.id?'#818cf8':'#252540'}`}}>{s.icon}</div>)}
                </div>

                <label style={lbl}>TAGS</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>
                  {(selNodeObj.tags||[]).map(t=><span key={t} style={{background:'#1e1e30',color:'#818cf8',padding:'2px 7px',borderRadius:10,fontSize:10,display:'flex',alignItems:'center',gap:4}}>#{t}<span onClick={()=>patchNode(selNode,{tags:(selNodeObj.tags||[]).filter(x=>x!==t)})} style={{cursor:'pointer',color:'#3a3a55',fontSize:12}}>×</span></span>)}
                </div>
                <input placeholder="Tag hinzufügen + Enter" style={{...inp,marginBottom:14,fontSize:11}}
                  onKeyDown={e=>{if(e.key==='Enter'&&e.target.value.trim()){const t=e.target.value.trim().replace(/\s+/g,'-').toLowerCase();if(!(selNodeObj.tags||[]).includes(t))patchNode(selNode,{tags:[...(selNodeObj.tags||[]),t]});e.target.value='';}}}/>

                <label style={lbl}>FARBE</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8}}>
                  {COLORS.map(c=><div key={c} onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{color:c});}} style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:selNodeObj.color===c?'3px solid #fff':'2px solid #1e1e30',boxShadow:selNodeObj.color===c?`0 0 8px ${c}aa`:'none',transition:'all .15s'}}/>)}
                </div>
                <div style={{display:'flex',gap:5,marginBottom:14}}>
                  <button onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{colorBorder:!selNodeObj.colorBorder});}}
                    style={{...btn(selNodeObj.colorBorder?selNodeObj.color:'#3a3a55',selNodeObj.colorBorder?`${selNodeObj.color}15`:'transparent'),flex:1,justifyContent:'center',fontSize:10,border:`1px solid ${selNodeObj.colorBorder?selNodeObj.color+'60':'#252540'}`}}>
                    Rand {selNodeObj.colorBorder?'AN':'AUS'}
                  </button>
                  <button onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{colorFill:!selNodeObj.colorFill});}}
                    style={{...btn(selNodeObj.colorFill?selNodeObj.color:'#3a3a55',selNodeObj.colorFill?`${selNodeObj.color}15`:'transparent'),flex:1,justifyContent:'center',fontSize:10,border:`1px solid ${selNodeObj.colorFill?selNodeObj.color+'60':'#252540'}`}}>
                    Füllung {selNodeObj.colorFill?'AN':'AUS'}
                  </button>
                </div>

                <label style={lbl}>FORM</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:14}}>
                  {SHAPES.map(s=>{const [nw,nh]=getNodeSize(s),active=selNodeObj.shape===s;return (
                    <button key={s} onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{shape:s,w:nw,h:nh});}}
                      style={{...btn(active?selNodeObj.color:'#3a3a55',active?`${selNodeObj.color}18`:'transparent'),justifyContent:'center',flexDirection:'column',padding:'8px 4px',gap:2,fontSize:11,border:`1px solid ${active?selNodeObj.color:'#1e1e30'}`}}>
                      <span style={{fontSize:17}}>{SHAPE_ICONS[s]}</span><span>{SHAPE_NAMES[s]}</span>
                    </button>
                  );})}
                </div>

                <label style={lbl}>NOTIZEN</label>
                {selNodeObj.notesHtml&&<div dangerouslySetInnerHTML={{__html:selNodeObj.notesHtml}} style={{fontSize:11,color:'#7a7a9a',lineHeight:1.5,marginBottom:8,maxHeight:70,overflow:'hidden',padding:'6px 8px',background:'#0d0d18',borderRadius:7,border:'1px solid #1e1e30',cursor:'pointer'}} onClick={()=>setNotePopup(selNode)}/>}
                <button onClick={()=>setNotePopup(selNode)} style={{...btn(selNodeObj.notesHtml?'#34d399':'#818cf8',selNodeObj.notesHtml?'#0d1f1560':'transparent'),justifyContent:'center',marginBottom:14}}>{selNodeObj.notesHtml?'✏️ Notizen bearbeiten':'📝 Notizen öffnen'}</button>

                <label style={lbl}>BILDER</label>
                {(selNodeObj.images||[]).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>{selNodeObj.images.map((img,i)=><div key={i} style={{position:'relative',width:60,height:60}}><img src={img} alt="" style={{width:60,height:60,objectFit:'cover',borderRadius:7,display:'block',border:'1px solid #1e1e30'}}/><div onClick={()=>patchNode(selNode,{images:selNodeObj.images.filter((_,j)=>j!==i)})} style={{position:'absolute',top:-5,right:-5,width:16,height:16,background:'#ef4444',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',cursor:'pointer',fontWeight:700}}>×</div></div>)}</div>}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImgUpload} style={{display:'none'}}/>
                <button onClick={()=>fileRef.current?.click()} style={{...btn('#818cf8'),border:'1px dashed #252545',justifyContent:'center',marginBottom:14}}>+ Bild anhängen</button>

                {/* Backlinks */}
                {backlinks.length>0&&<>
                  <label style={lbl}>BACKLINKS</label>
                  <div style={{marginBottom:14}}>
                    {backlinks.map((bl,i)=>(
                      <div key={i} onClick={()=>jumpToNode(bl.mapId,bl.nodeId)}
                        style={{fontSize:10,cursor:'pointer',padding:'5px 8px',background:'#0d0d18',borderRadius:6,marginBottom:4,border:'1px solid #1e1e30',lineHeight:1.6}}>
                        <div style={{color:'#e2e8f0',fontWeight:500}}>↩ {bl.nodeLabel}</div>
                        <div style={{color:'#818cf8',fontSize:9}}>{bl.pathStr}</div>
                      </div>
                    ))}
                    <div style={{fontSize:9,color:'#3a3a55',marginTop:3,lineHeight:1.5}}>Diese Map ist als Sub-Map in obigen Knoten verankert.</div>
                  </div>
                </>}

                <div style={{borderTop:'1px solid #181828',paddingTop:12,display:'flex',flexDirection:'column',gap:6}}>
                  <button onClick={()=>toggleCollapse(selNode)}
                    style={btn(collapsedNodes.has(selNode)?selNodeObj.color:'#a5b4fc',collapsedNodes.has(selNode)?`${selNodeObj.color}15`:'transparent')}>
                    {collapsedNodes.has(selNode)?`▶ Aufklappen (+${collapsedChildCount[selNode]||0})`:'▼ Einklappen'}
                  </button>
                  <button onClick={()=>setConnMode(true)} style={btn('#a5b4fc')}>🔗 Verbindung erstellen</button>
                  <button onClick={openSubMap} style={btn(selNodeObj.childMapId?'#34d399':'#a5b4fc',selNodeObj.childMapId?'#0d1f15':'transparent')}>🗺️ {selNodeObj.childMapId?'Sub-Map öffnen →':'Sub-Map erstellen'}{selNodeObj.childMapId&&<span style={{marginLeft:'auto',width:7,height:7,borderRadius:'50%',background:'#34d399'}}/>}</button>
                  {selNodeObj.childMapId&&<button onClick={()=>setConfirm({msg:`Sub-Map "${selNodeObj.label}" löschen?`,onOk:()=>{doDeleteSubMap(selNode,selNodeObj.childMapId);setConfirm(null);}})} style={btn('#f87171')}>🗑️ Sub-Map löschen</button>}

                  {/* Link-Map Picker */}
                  <div style={{background:'#0d0d18',border:'1px solid #1e1e30',borderRadius:8,padding:'9px 11px'}}>
                    <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.08em',marginBottom:7}}>⇒ LINK ZU MAP</div>
                    <select value={selNodeObj.linkMapId||''}
                      onChange={e=>patchNode(selNode,{linkMapId:e.target.value||null})}
                      style={{width:'100%',background:'#0b0b14',border:'1px solid #252545',color:selNodeObj.linkMapId?'#e2e8f0':'#3a3a55',borderRadius:6,padding:'6px 8px',fontSize:11,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                      <option value=''>— Kein Link —</option>
                      {mapOrder.filter(mid=>mid!==currentMapId).map(mid=>(
                        <option key={mid} value={mid}>{maps[mid]?.name||'Map'}</option>
                      ))}
                    </select>
                    {selNodeObj.linkMapId&&maps[selNodeObj.linkMapId]&&(
                      <button onClick={()=>openLinkMap(selNodeObj.linkMapId)}
                        style={{...btn(selNodeObj.color,'transparent'),marginTop:6,justifyContent:'center',fontSize:11}}>
                        ⇒ Jetzt zu „{maps[selNodeObj.linkMapId]?.name}" springen
                      </button>
                    )}
                    {selNodeObj.linkMapId&&<div style={{fontSize:9,color:'#3a3a55',marginTop:5,lineHeight:1.6}}>Doppelklick auf den Knoten öffnet die verlinkte Map.</div>}
                  </div>
                  <button onClick={()=>setConfirm({msg:`Knoten "${selNodeObj.label}" löschen?`,onOk:()=>{doDeleteNode(selNode);setConfirm(null);}})} style={btn('#f87171')}>🗑️ Knoten löschen</button>
                </div>
              </>
            )}

            {selEdgeObj&&(
              <>
                <label style={lbl}>BESCHREIBUNG</label>
                <input value={selEdgeObj.label||''} onChange={e=>patchEdge(selEdge,{label:e.target.value})} placeholder="z.B. besteht aus…" style={{...inp,marginBottom:14}}/>
                <label style={lbl}>PFEILRICHTUNG</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:14}}>
                  {[['none','─ Keine'],['forward','→ Vorwärts'],['backward','← Rückwärts'],['both','↔ Beide']].map(([v,l])=><button key={v} onClick={()=>patchEdge(selEdge,{arrow:v})} style={{...btn(selEdgeObj.arrow===v?'#a5b4fc':'#3a3a55',selEdgeObj.arrow===v?'#818cf820':'transparent'),justifyContent:'center',fontSize:11,border:`1px solid ${selEdgeObj.arrow===v?'#818cf860':'#1e1e30'}`}}>{l}</button>)}
                </div>
                <label style={lbl}>LINIENSTIL</label>
                <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:14}}>
                  {[['curved','~ Gebogen'],['straight','— Gerade'],['ortho','⌐ Orthogonal']].map(([v,l])=><button key={v} onClick={()=>patchEdge(selEdge,{style:v,cp:null,routing:false})} style={{...btn(selEdgeObj.style===v?'#a5b4fc':'#3a3a55',selEdgeObj.style===v?'#818cf820':'transparent'),fontSize:11,border:`1px solid ${selEdgeObj.style===v?'#818cf860':'#1e1e30'}`}}>{l}</button>)}
                </div>
                {selEdgeObj.style!=='straight'&&selEdgeObj.cp&&<div style={{marginBottom:14,background:'#0d0d18',border:'1px solid #1e1e30',borderRadius:8,padding:'8px 11px',fontSize:11,color:'#5a5a7a',lineHeight:1.7,display:'flex',alignItems:'center',justifyContent:'space-between'}}><span>Verlauf angepasst</span><span style={{color:'#34d399',cursor:'pointer',fontWeight:500}} onClick={()=>patchEdge(selEdge,{cp:null,routing:false})}>↺ Zurücksetzen</span></div>}
                {selEdgeObj.style!=='straight'&&!selEdgeObj.cp&&<div style={{marginBottom:14,fontSize:11,color:'#3a3a55',padding:'6px 10px',background:'#0d0d18',borderRadius:8,border:'1px solid #1e1e30'}}>● Blauen Punkt ziehen zum Anpassen</div>}
                <label style={lbl}>FARBE</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
                  {EDGE_COLORS.map(c=><div key={c} onClick={()=>patchEdge(selEdge,{color:c})} style={{width:21,height:21,borderRadius:'50%',background:c,cursor:'pointer',border:selEdgeObj.color===c?'3px solid #fff':'2px solid transparent',boxShadow:selEdgeObj.color===c?`0 0 8px ${c}aa`:'none',transition:'all .15s'}}/>)}
                </div>
                <div style={{borderTop:'1px solid #181828',paddingTop:12}}>
                  <button onClick={()=>setConfirm({msg:'Verbindung löschen?',onOk:()=>{doDeleteEdge(selEdge);setConfirm(null);}})} style={btn('#f87171')}>🗑️ Verbindung löschen</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showTpl&&<TemplatePicker onApply={applyTpl} onClose={()=>setShowTpl(false)}/>}
      {confirm&&<ConfirmModal msg={confirm.msg} onOk={confirm.onOk} onCancel={()=>setConfirm(null)}/>}
      {exportModal&&<ExportModal data={exportModal} onClose={()=>setExportModal(null)}/>}
      {globalSearchOpen&&<GlobalSearchPanel maps={maps} mapOrder={mapOrder} onJump={jumpToNode} onClose={()=>setGlobalSearchOpen(false)}/>}
      {notePopup&&(()=>{const nd=curMap?.nodes.find(n=>n.id===notePopup);if(!nd)return null;return <RichTextEditor node={nd} onClose={()=>setNotePopup(null)} onSave={html=>{patchNode(notePopup,{notesHtml:html});setNotePopup(null);}}/>;})()}
    </div>
  );
}
