import { useState, useRef, useEffect, useCallback } from "react";

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
const TEMPLATES   = [
  {id:'blank',   name:'Leer',        icon:'○',desc:'Leere Leinwand'},
  {id:'mindmap', name:'Mind Map',    icon:'◎',desc:'Radiale Struktur'},
  {id:'org',     name:'Organigramm', icon:'⊤',desc:'Hierarchie top-down'},
  {id:'fishbone',name:'Fischgräte',  icon:'≺',desc:'Ursache & Wirkung'},
  {id:'spider',  name:'Spinnennetz', icon:'✦',desc:'Vernetzte Themen'},
];
const HIST_MAX = 60;
const TOOLBAR_BTNS = [
  {cmd:'bold',         icon:'B', title:'Fett',           sty:{fontWeight:700}},
  {cmd:'italic',       icon:'I', title:'Kursiv',         sty:{fontStyle:'italic'}},
  {cmd:'underline',    icon:'U', title:'Unterstrichen',  sty:{textDecoration:'underline'}},
  {cmd:'strikeThrough',icon:'S', title:'Durchgestrichen',sty:{textDecoration:'line-through'}},
  null,
  {cmd:'insertUnorderedList',icon:'• —',title:'Aufzählung'},
  {cmd:'insertOrderedList',  icon:'1.', title:'Numm. Liste'},
  null,
  {cmd:'justifyLeft',  icon:'⬤≡',title:'Links'},
  {cmd:'justifyCenter',icon:'≡≡', title:'Mitte'},
  {cmd:'justifyRight', icon:'≡⬤',title:'Rechts'},
];

const uid         = () => Math.random().toString(36).slice(2,9);
const rnd         = n  => Math.floor(Math.random()*n);
const getNodeSize = s  => s==='circle'?[72,72]:s==='diamond'?[130,70]:s==='hexagon'?[140,54]:[158,48];
const mkNode = (label,x,y,color=COLORS[0],shape='rounded') => {
  const [w,h]=getNodeSize(shape);
  return {id:uid(),label,x,y,color,shape,w,h,notesHtml:'',images:[],childMapId:null,colorBorder:false};
};
const mkEdge = (from,to) => ({id:uid(),from,to,style:'curved',arrow:'forward',color:'#6b6b9a',cp:null,routing:false,label:''});
const mkMap  = name => ({id:uid(),name,nodes:[],edges:[],createdAt:Date.now()});

// ── Templates ─────────────────────────────────────────────────────────────────
function applyTemplate(map, tpl) {
  if (tpl==='blank') return {...map,nodes:[mkNode('Hauptthema',350,230,COLORS[0])],edges:[]};
  if (tpl==='mindmap') {
    const c=mkNode('Hauptthema',370,235,'#818cf8','circle'); c.w=90; c.h=90;
    const kids=[0,55,110,175,230,295].map((deg,i)=>{
      const r=deg*Math.PI/180,[w,h]=getNodeSize('rounded');
      return mkNode(`Thema ${i+1}`,370+Math.cos(r)*220-w/2,235+Math.sin(r)*170-h/2,COLORS[(i+1)%COLORS.length]);
    });
    return {...map,nodes:[c,...kids],edges:kids.map(k=>mkEdge(c.id,k.id))};
  }
  if (tpl==='org') {
    const root=mkNode('Leitung',335,20,'#818cf8','rect');
    const l1=[mkNode('Abt. A',85,130,'#60a5fa','rect'),mkNode('Abt. B',335,130,'#34d399','rect'),mkNode('Abt. C',585,130,'#f472b6','rect')];
    const l2=[mkNode('Team 1',10,255,'#60a5fa'),mkNode('Team 2',165,255,'#60a5fa'),mkNode('Team 3',265,255,'#34d399'),
              mkNode('Team 4',410,255,'#34d399'),mkNode('Team 5',505,255,'#f472b6'),mkNode('Team 6',650,255,'#f472b6')];
    const edges=[...l1.map(n=>mkEdge(root.id,n.id)),
      mkEdge(l1[0].id,l2[0].id),mkEdge(l1[0].id,l2[1].id),mkEdge(l1[1].id,l2[2].id),
      mkEdge(l1[1].id,l2[3].id),mkEdge(l1[2].id,l2[4].id),mkEdge(l1[2].id,l2[5].id)]
      .map(e=>({...e,style:'ortho',arrow:'forward',color:'#6b6b9a'}));
    return {...map,nodes:[root,...l1,...l2],edges};
  }
  if (tpl==='fishbone') {
    const effect=mkNode('Hauptproblem',570,205,'#f87171','rect');
    const cats=['Methode','Mensch','Maschine','Material','Umwelt','Messung'];
    const nodes=[effect],edges=[];
    cats.forEach((l,i)=>{
      const n=mkNode(l,60+(i%3)*200,i<3?50:325,COLORS[(i+1)%COLORS.length],'pill');
      nodes.push(n);edges.push({...mkEdge(n.id,effect.id),style:'straight',color:'#6b6b9a'});
    });
    return {...map,nodes,edges};
  }
  if (tpl==='spider') {
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
    return {...map,nodes,edges};
  }
  return map;
}

// ── Auto-layout ───────────────────────────────────────────────────────────────
function layoutRadial(nodes) {
  if(!nodes.length) return nodes;
  const cx=420,cy=280;
  const out=[{...nodes[0],x:cx-nodes[0].w/2,y:cy-nodes[0].h/2}];
  const rest=nodes.slice(1);
  let placed=0;
  [Math.min(6,rest.length),rest.length-Math.min(6,rest.length)].filter(Boolean).forEach((count,ri)=>{
    const r=180+ri*140;
    for(let i=0;i<count;i++){
      const a=(i/count)*2*Math.PI-Math.PI/2,n=rest[placed++];
      out.push({...n,x:cx+Math.cos(a)*r-n.w/2,y:cy+Math.sin(a)*r-n.h/2});
    }
  });
  return out;
}
function layoutHierarchical(nodes,edges) {
  if(!nodes.length) return nodes;
  const adj={};
  nodes.forEach(n=>{adj[n.id]=[];});
  edges.forEach(e=>{adj[e.from]&&adj[e.from].push(e.to);adj[e.to]&&adj[e.to].push(e.from);});
  const visited={},levels=[];
  const queue=[nodes[0].id];visited[nodes[0].id]=true;
  while(queue.length){
    const sz=queue.length,lvl=[];
    for(let i=0;i<sz;i++){
      const id=queue.shift();lvl.push(id);
      (adj[id]||[]).forEach(nb=>{if(!visited[nb]){visited[nb]=true;queue.push(nb);}});
    }
    levels.push(lvl);
  }
  nodes.filter(n=>!visited[n.id]).forEach(n=>levels.push([n.id]));
  const nmap={};nodes.forEach(n=>{nmap[n.id]=n;});
  const result=[];
  levels.forEach((lvl,ri)=>{
    const totalW=lvl.reduce((s,id)=>s+(nmap[id]?.w||158)+20,0);
    let x=(840-totalW)/2;
    lvl.forEach(id=>{const n=nmap[id];if(!n)return;result.push({...n,x,y:ri*120+30});x+=n.w+20;});
  });
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
    return {d:`M${p1.x},${p1.y} L${p2.x},${p2.y}`,endDir:ed,startDir:ed+Math.PI,
            x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:null,mid:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}};
  }
  if(style==='curved'){
    const off=Math.max(40,dist*0.28);
    const cpx=cp?cp.x:(fcx+tcx)/2-(dy/dist)*off;
    const cpy=cp?cp.y:(fcy+tcy)/2+(dx/dist)*off;
    const p1=nodeIntersect(fn,cpx,cpy),p2=nodeIntersect(tn,cpx,cpy);
    const ed=Math.atan2(p2.y-cpy,p2.x-cpx),sd=Math.atan2(p1.y-cpy,p1.x-cpx);
    return {d:`M${p1.x},${p1.y} Q${cpx},${cpy} ${p2.x},${p2.y}`,endDir:ed,startDir:sd,
            x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:{x:cpx,y:cpy},
            mid:{x:.25*p1.x+.5*cpx+.25*p2.x,y:.25*p1.y+.5*cpy+.25*p2.y}};
  }
  const horiz=Math.abs(dx)>=Math.abs(dy);
  if(horiz){
    const bx=cp?cp.x:(fcx+tcx)/2;
    const p1={x:bx>fcx?fn.x+fn.w:fn.x,y:fcy},p2={x:bx>tcx?tn.x+tn.w:tn.x,y:tcy};
    return {d:`M${p1.x},${fcy} L${bx},${fcy} L${bx},${tcy} L${p2.x},${tcy}`,
            endDir:dx>=0?0:Math.PI,startDir:dx>=0?Math.PI:0,
            x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:{x:bx,y:(fcy+tcy)/2},mid:{x:bx,y:(fcy+tcy)/2}};
  }
  const by=cp?cp.y:(fcy+tcy)/2;
  const p1={x:fcx,y:by>fcy?fn.y+fn.h:fn.y},p2={x:tcx,y:by>tcy?tn.y+tn.h:tn.y};
  return {d:`M${fcx},${p1.y} L${fcx},${by} L${tcx},${by} L${tcx},${p2.y}`,
          endDir:dy>=0?Math.PI/2:-Math.PI/2,startDir:dy>=0?-Math.PI/2:Math.PI/2,
          x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,handlePos:{x:(fcx+tcx)/2,y:by},mid:{x:(fcx+tcx)/2,y:by}};
}
function arrowPts(tx,ty,angle,size=11){
  const half=size*.52,bx=tx-size*Math.cos(angle),by=ty-size*Math.sin(angle);
  const wx=half*Math.sin(angle),wy=-half*Math.cos(angle);
  return `${tx},${ty} ${bx+wx},${by+wy} ${bx-wx},${by-wy}`;
}

// ── NodeShape ─────────────────────────────────────────────────────────────────
function NodeShape({node,selected}){
  const {x,y,w,h,color,shape,colorBorder}=node;
  const fill='#12121e';
  const stroke=selected?color:colorBorder?color:'#1e1e32';
  const sw=selected?2.5:colorBorder?1.5:1;
  const glow=selected?`drop-shadow(0 0 12px ${color}66)`:colorBorder?`drop-shadow(0 0 4px ${color}44)`:'none';
  const sty={filter:glow,transition:'filter .2s'};
  const p={fill,stroke,strokeWidth:sw,style:sty};
  if(shape==='rect')   return <rect x={x} y={y} width={w} height={h} {...p}/>;
  if(shape==='pill')   return <rect x={x} y={y} width={w} height={h} rx={h/2} {...p}/>;
  if(shape==='circle') return <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} {...p}/>;
  if(shape==='diamond'){
    const cx=x+w/2,cy=y+h/2;
    return <path d={`M${cx},${y} L${x+w},${cy} L${cx},${y+h} L${x},${cy}Z`} {...p}/>;
  }
  if(shape==='hexagon'){
    const cx=x+w/2,cy=y+h/2,rx=w/2,ry=h/2;
    const pts=Array.from({length:6},(_,i)=>{
      const a=(i*60-30)*Math.PI/180;
      return `${cx+rx*Math.cos(a)},${cy+ry*Math.sin(a)}`;
    }).join(' ');
    return <polygon points={pts} {...p}/>;
  }
  return <rect x={x} y={y} width={w} height={h} rx={10} {...p}/>;
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
function ConfirmModal({msg,onOk,onCancel}){
  return (
    <div style={{position:'fixed',inset:0,background:'#00000095',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}} onClick={onCancel}>
      <div style={{background:'#0f0f1a',border:'1px solid #f8717140',borderRadius:14,padding:'28px 30px',width:360,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,color:'#e2e8f0',marginBottom:20,lineHeight:1.6}}>{msg}</div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onCancel} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 18px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={onOk}     style={{background:'#f87171',border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',fontFamily:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>Löschen</button>
        </div>
      </div>
    </div>
  );
}

// ── TemplatePicker ────────────────────────────────────────────────────────────
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
          <button onClick={onClose}          style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={()=>onApply(tpl)} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer'}}>Anwenden →</button>
        </div>
      </div>
    </div>
  );
}

// ── NewMapModal ───────────────────────────────────────────────────────────────
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
        <div style={{fontSize:11,color:'#3a3a55',marginBottom:18}}>💡 Vorlagen direkt im Editor wählbar.</div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onClose}                       style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={()=>onCreate(name||'Neue Map')} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer'}}>Erstellen →</button>
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

  useEffect(()=>{
    if(editorRef.current) editorRef.current.innerHTML=node.notesHtml||'';
    updateActive();
  },[]);

  const updateActive=()=>{
    const s={};
    ['bold','italic','underline','strikeThrough'].forEach(cmd=>{try{s[cmd]=document.queryCommandState(cmd);}catch(ex){}});
    setActiveFmt(s);
  };
  const exec=(cmd,val=null)=>{editorRef.current?.focus();document.execCommand(cmd,false,val);updateActive();};

  const insertTable=(rows,cols)=>{
    const {p,mw}=CELL_SIZES[curFontSize-1]||CELL_SIZES[2];
    let html=`<table style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>`;
    for(let r=0;r<rows;r++){
      html+='<tr>';
      for(let c=0;c<cols;c++) html+=`<td style="border:1px solid #3a3a55;padding:${p}px ${p+2}px;min-width:${mw}px"> </td>`;
      html+='</tr>';
    }
    html+=`</tbody></table><div><br></div>`;
    exec('insertHTML',html);setShowTbl(false);
  };

  const handleImgFile=(e)=>{
    const f=e.target.files[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      exec('insertHTML',`<img src="${ev.target.result}" style="max-width:100%;height:auto;border-radius:6px;margin:6px 0;display:block"/>`);
    };
    reader.readAsDataURL(f);e.target.value='';
  };

  const handleKeyDown=(e)=>{
    if(e.key!=='Tab') return;
    e.preventDefault();
    const sel=window.getSelection();if(!sel.rangeCount)return;
    let nd=sel.anchorNode;
    while(nd&&nd!==editorRef.current){if(nd.nodeName==='TD'||nd.nodeName==='TH')break;nd=nd.parentNode;}
    if(nd&&(nd.nodeName==='TD'||nd.nodeName==='TH')){
      const cells=[...nd.closest('table').querySelectorAll('td,th')];
      const idx=cells.indexOf(nd);
      const next=e.shiftKey?cells[idx-1]:cells[idx+1];
      if(next){
        const r2=document.createRange();r2.selectNodeContents(next);r2.collapse(false);
        sel.removeAllRanges();sel.addRange(r2);
      } else if(!e.shiftKey){
        const lastRow=nd.closest('table').querySelector('tbody').lastElementChild;
        const colCount=lastRow.children.length;
        const newRow=document.createElement('tr');
        const {p,mw}=CELL_SIZES[curFontSize-1]||CELL_SIZES[2];
        for(let i=0;i<colCount;i++){
          const td=document.createElement('td');
          td.style.cssText=`border:1px solid #3a3a55;padding:${p}px ${p+2}px;min-width:${mw}px`;
          td.innerHTML=' ';newRow.appendChild(td);
        }
        lastRow.parentNode.appendChild(newRow);
        const fc=newRow.querySelector('td');
        const r2=document.createRange();r2.selectNodeContents(fc);r2.collapse(false);
        sel.removeAllRanges();sel.addRange(r2);
      }
    } else {exec('insertText','  ');}
  };

  const tbS=(active)=>({background:active?'#818cf825':'transparent',border:`1px solid ${active?'#818cf860':'transparent'}`,color:active?'#c7d2fe':'#7a7a9a',borderRadius:5,padding:'4px 8px',fontSize:12,cursor:'pointer',fontFamily:'inherit'});
  const Sep=()=><div style={{width:1,height:20,background:'#1e1e30',margin:'0 3px',flexShrink:0}}/>;

  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252545',borderRadius:16,width:'min(900px,96vw)',height:'min(80vh,720px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px #00000099'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'12px 18px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <div style={{width:9,height:9,borderRadius:'50%',background:node.color,boxShadow:`0 0 7px ${node.color}99`}}/>
          <span style={{fontFamily:'Unbounded',fontSize:10,color:'#818cf8'}}>◈</span>
          <span style={{fontSize:13,fontWeight:600,color:'#e2e8f0',flex:1}}>{node.label} — Notizen</span>
          <div onClick={onClose} style={{cursor:'pointer',color:'#3a3a55',fontSize:18}}>×</div>
        </div>

        {/* Toolbar */}
        <div style={{padding:'7px 12px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:2,flexWrap:'wrap',background:'#0d0d18',flexShrink:0}}>
          {TOOLBAR_BTNS.map((t,i)=>
            t===null
              ? <Sep key={i}/>
              : <button key={t.cmd} title={t.title} onMouseDown={e=>{e.preventDefault();exec(t.cmd);}}
                  style={{...tbS(activeFmt[t.cmd]),fontStyle:t.sty?.fontStyle,fontWeight:t.sty?.fontWeight,textDecoration:t.sty?.textDecoration}}>
                  {t.icon}
                </button>
          )}
          <Sep/>
          {['H1','H2','H3'].map(h=>(
            <button key={h} title={h} onMouseDown={e=>{e.preventDefault();exec('formatBlock',h.toLowerCase());}}
              style={{...tbS(false),fontSize:10,fontWeight:600}}>{h}</button>
          ))}
          <button title="Normal" onMouseDown={e=>{e.preventDefault();exec('formatBlock','div');}} style={{...tbS(false),fontSize:10}}>¶ Normal</button>
          <Sep/>

          {/* Table picker */}
          <div style={{position:'relative'}}>
            <button title="Tabelle" onMouseDown={e=>{e.preventDefault();setShowTbl(v=>!v);}} style={tbS(showTbl)}>⊞ Tabelle</button>
            {showTbl && (
              <div style={{position:'absolute',top:'110%',left:0,background:'#13131e',border:'1px solid #252545',borderRadius:10,padding:12,zIndex:500,boxShadow:'0 8px 32px #00000088'}}
                onMouseLeave={()=>setTblPick({r:0,c:0})}>
                <div style={{fontSize:10,color:'#3a3a55',marginBottom:8}}>{tblPick.r>0?`${tblPick.r} × ${tblPick.c}`:'Zeilen × Spalten'}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,18px)',gap:3}}>
                  {Array.from({length:36},(_,i)=>{
                    const r=Math.floor(i/6)+1,c=(i%6)+1,active=r<=tblPick.r&&c<=tblPick.c;
                    return (
                      <div key={i}
                        style={{width:18,height:18,borderRadius:3,background:active?'#818cf840':'#1e1e30',border:`1px solid ${active?'#818cf8':'#252540'}`,cursor:'pointer'}}
                        onMouseEnter={()=>setTblPick({r,c})} onClick={()=>insertTable(r,c)}/>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <Sep/>

          {/* Image */}
          <input ref={imgRef} type="file" accept="image/*" onChange={handleImgFile} style={{display:'none'}}/>
          <button title="Bild einfügen" onMouseDown={e=>{e.preventDefault();imgRef.current?.click();}} style={tbS(false)}>🖼 Bild</button>
          <Sep/>

          {/* Font size */}
          <select onChange={e=>{const v=parseInt(e.target.value);setCurFontSize(v);exec('fontSize',v);}} value={curFontSize}
            style={{background:'#0d0d18',border:'1px solid #1e1e30',color:'#7a7a9a',borderRadius:5,padding:'3px 5px',fontSize:11,fontFamily:'inherit',cursor:'pointer'}}>
            {[1,2,3,4,5,6].map(n=><option key={n} value={n}>{[10,13,16,18,24,32][n-1]}px</option>)}
          </select>
          <Sep/>
          <button title="Rückgängig"  onMouseDown={e=>{e.preventDefault();exec('undo');}} style={tbS(false)}>↩</button>
          <button title="Wiederholen" onMouseDown={e=>{e.preventDefault();exec('redo');}} style={tbS(false)}>↪</button>
        </div>

        {/* Editor */}
        <div ref={editorRef} contentEditable suppressContentEditableWarning
          onInput={updateActive} onKeyUp={updateActive} onMouseUp={updateActive} onKeyDown={handleKeyDown}
          style={{flex:1,overflowY:'auto',padding:'18px 24px',color:'#c9d1d9',fontSize:14,lineHeight:1.8,outline:'none',fontFamily:'"IBM Plex Sans",sans-serif'}}
          data-placeholder="Notizen eingeben…"/>

        {/* Footer */}
        <div style={{padding:'12px 18px',borderTop:'1px solid #181828',display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 18px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={()=>onSave(editorRef.current?.innerHTML||'')} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:'9px 22px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer'}}>Speichern ✓</button>
        </div>
      </div>
      <style>{`
        [contenteditable]:empty:before{content:attr(data-placeholder);color:#3a3a55;pointer-events:none}
        [contenteditable] h1{font-size:22px;font-weight:700;margin:10px 0 4px;color:#e2e8f0}
        [contenteditable] h2{font-size:18px;font-weight:600;margin:8px 0 4px;color:#c9d1d9}
        [contenteditable] h3{font-size:15px;font-weight:600;margin:6px 0 3px;color:#a0aec0}
        [contenteditable] div{margin:2px 0}
        [contenteditable] ul{margin:4px 0 4px 22px;list-style:disc}
        [contenteditable] ol{margin:4px 0 4px 22px;list-style:decimal}
        [contenteditable] li{margin:2px 0}
        [contenteditable] table{border-collapse:collapse;width:100%;margin:8px 0}
        [contenteditable] td,[contenteditable] th{border:1px solid #3a3a55;vertical-align:top}
        [contenteditable] img{max-width:100%;height:auto;border-radius:6px;margin:4px 0;display:block}
      `}</style>
    </div>
  );
}

// ── ExportModal ───────────────────────────────────────────────────────────────
function ExportModal({data,onClose}){
  const [copied,setCopied]=useState(false);
  const copy=()=>{
    navigator.clipboard?.writeText(data.content).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  };
  return (
    <div style={{position:'fixed',inset:0,background:'#00000090',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500}} onClick={onClose}>
      <div style={{background:'#0f0f1a',border:'1px solid #252545',borderRadius:16,width:'min(680px,94vw)',maxHeight:'85vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px #00000099'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'14px 18px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:'Unbounded',fontSize:11,color:'#818cf8'}}>◈</span>
          <span style={{fontSize:13,fontWeight:600,color:'#e2e8f0',flex:1}}>
            {data.type==='json' ? '💾 JSON Export' : '🖼 PNG Export'}
          </span>
          <div onClick={onClose} style={{cursor:'pointer',color:'#3a3a55',fontSize:18}}>×</div>
        </div>

        {data.type==='json' && (
          <>
            <div style={{padding:'12px 18px',background:'#0d0d18',borderBottom:'1px solid #181828',fontSize:11,color:'#7a7a9a',lineHeight:1.7}}>
              Kopiere den gesamten Text und speichere ihn als <code style={{color:'#818cf8',background:'#818cf815',padding:'1px 5px',borderRadius:4}}>mindspace-export.json</code> auf deinem Computer. Beim nächsten Mal über <strong style={{color:'#c9d1d9'}}>📥 Importieren</strong> wieder laden.
            </div>
            <div style={{position:'relative',flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
              <textarea readOnly value={data.content}
                onClick={e=>e.target.select()}
                style={{flex:1,background:'#0d0d18',border:'none',color:'#4ade80',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,padding:'14px 18px',outline:'none',resize:'none',lineHeight:1.6}}/>
            </div>
            <div style={{padding:'12px 18px',borderTop:'1px solid #181828',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Schließen</button>
              <button onClick={copy} style={{background:copied?'#34d399':'#818cf8',border:'none',color:copied?'#0b0b14':'#fff',borderRadius:8,padding:'9px 22px',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer',transition:'all .2s'}}>
                {copied ? '✓ Kopiert!' : '📋 Alles kopieren'}
              </button>
            </div>
          </>
        )}

        {data.type==='png' && (
          <>
            <div style={{padding:'12px 18px',background:'#0d0d18',borderBottom:'1px solid #181828',fontSize:11,color:'#7a7a9a',lineHeight:1.7}}>
              Rechtsklick auf das Bild → <strong style={{color:'#c9d1d9'}}>"Bild speichern unter…"</strong>
            </div>
            <div style={{flex:1,overflow:'auto',padding:18,display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d18'}}>
              <img src={data.content} alt="Map Export" style={{maxWidth:'100%',borderRadius:8,border:'1px solid #252545'}}/>
            </div>
            <div style={{padding:'12px 18px',borderTop:'1px solid #181828',display:'flex',justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:'9px 16px',fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>Schließen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({maps,mapOrder,onOpen,onDelete,onNew,onRename,onImport}){
  const [editing,setEditing]=useState(null);
  const importRef=useRef(null);
  const isMob=typeof window!=='undefined'&&window.innerWidth<768;
  const commit=()=>{if(editing?.val.trim())onRename(editing.id,editing.val.trim());setEditing(null);};
  return (
    <div style={{minHeight:'100vh',background:'#0b0b14',color:'#c9d1d9',fontFamily:'"IBM Plex Sans",sans-serif',overflowY:'auto'}}>
      <div style={{borderBottom:'1px solid #181828',padding:isMob?'14px 16px':'16px 36px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{fontFamily:'Unbounded',fontSize:isMob?13:15,color:'#818cf8',letterSpacing:'-0.3px'}}>◈ MindSpace</div>
        {!isMob&&<><div style={{width:1,height:18,background:'#181828'}}/><div style={{fontSize:11,color:'#2a2a42'}}>Verschachtelte Mind Maps</div></>}
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <input ref={importRef} type="file" accept=".json" onChange={e=>{
            const f=e.target.files[0];if(!f)return;
            const r=new FileReader();
            r.onload=ev=>{try{onImport(JSON.parse(ev.target.result));}catch(ex){}};
            r.readAsText(f);e.target.value='';
          }} style={{display:'none'}}/>
          <button onClick={()=>importRef.current?.click()} style={{background:'transparent',border:'1px solid #252545',color:'#7a7a9a',borderRadius:8,padding:isMob?'8px 10px':'9px 14px',fontSize:isMob?11:12,fontFamily:'inherit',cursor:'pointer'}}>📥 {isMob?'':'Importieren'}</button>
          <button onClick={onNew} style={{background:'#818cf8',border:'none',color:'#fff',borderRadius:8,padding:isMob?'8px 14px':'9px 20px',fontSize:isMob?12:13,fontFamily:'inherit',fontWeight:500,cursor:'pointer'}}>+ Neue Map</button>
        </div>
      </div>
      <div style={{padding:isMob?'20px 14px':'32px 36px'}}>
        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'0.12em',marginBottom:14}}>MEINE MAPS ({mapOrder.length})</div>
        <div style={{display:'grid',gridTemplateColumns:isMob?'1fr 1fr':'repeat(auto-fill,minmax(210px,1fr))',gap:10}}>
          {mapOrder.map(id=>{
            const m=maps[id];if(!m)return null;
            const isEdit=editing?.id===id;
            return (
              <div key={id} onClick={()=>{if(!isEdit)onOpen(id);}}
                style={{background:'#0f0f1a',border:'1px solid #181828',borderRadius:12,padding:isMob?'14px 12px':'18px 16px',cursor:'pointer',position:'relative',transition:'all .15s'}}>
                <div style={{width:32,height:32,background:'#818cf815',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,marginBottom:10,color:'#818cf8'}}>◈</div>
                {isEdit
                  ? <input autoFocus value={editing.val} onChange={e=>setEditing({...editing,val:e.target.value})}
                      onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(null);}}
                      onClick={e=>e.stopPropagation()}
                      style={{width:'100%',background:'#0d0d18',border:'1px solid #818cf8',color:'#e2e8f0',borderRadius:6,padding:'4px 8px',fontSize:13,fontFamily:'inherit',outline:'none',marginBottom:4,boxSizing:'border-box'}}/>
                  : <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
                      <div style={{fontSize:isMob?12:14,fontWeight:600,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{m.name}</div>
                      <div onClick={e=>{e.stopPropagation();setEditing({id,val:m.name});}}
                        style={{color:'#3a3a55',fontSize:11,cursor:'pointer',padding:'2px 4px',borderRadius:4}}>✎</div>
                    </div>
                }
                <div style={{fontSize:10,color:'#3a3a55'}}>{m.nodes.length} K · {m.edges.length} V</div>
                <div style={{fontSize:9,color:'#252540',marginTop:2}}>{new Date(m.createdAt).toLocaleDateString('de')}</div>
                <button onClick={e=>{e.stopPropagation();onDelete(id);}}
                  style={{position:'absolute',top:8,right:8,background:'none',border:'none',color:'#3a3a55',fontSize:14,padding:'2px 5px',borderRadius:4,fontFamily:'inherit',cursor:'pointer'}}>×</button>
              </div>
            );
          })}
          <div onClick={onNew}
            style={{background:'transparent',border:'1px dashed #222238',borderRadius:12,padding:14,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:isMob?90:130,color:'#333355'}}>
            <div style={{fontSize:24,marginBottom:6}}>+</div>
            <div style={{fontSize:11}}>Neue Map</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function Minimap({nodes,edges,pan,zoom,svgW,svgH,hiddenColors}){
  const MW=180,MH=110;
  if(!nodes.length) return null;
  const minX=Math.min(...nodes.map(n=>n.x))-20;
  const minY=Math.min(...nodes.map(n=>n.y))-20;
  const maxX=Math.max(...nodes.map(n=>n.x+n.w))+20;
  const maxY=Math.max(...nodes.map(n=>n.y+n.h))+20;
  const scale=Math.min(MW/(maxX-minX||1),MH/(maxY-minY||1),.8);
  const tx=n=>(n-minX)*scale,ty=n=>(n-minY)*scale;
  const vx0=-pan.x/zoom,vy0=-pan.y/zoom,vx1=vx0+svgW/zoom,vy1=vy0+svgH/zoom;
  return (
    <div style={{position:'absolute',bottom:16,right:16,background:'#0d0d18',border:'1px solid #252540',borderRadius:10,overflow:'hidden',zIndex:50}}>
      <svg width={MW} height={MH}>
        {edges.map(e=>{
          const fn=nodes.find(n=>n.id===e.from),tn=nodes.find(n=>n.id===e.to);
          if(!fn||!tn) return null;
          return <line key={e.id} x1={tx(fn.x+fn.w/2)} y1={ty(fn.y+fn.h/2)} x2={tx(tn.x+tn.w/2)} y2={ty(tn.y+tn.h/2)} stroke="#252545" strokeWidth={1}/>;
        })}
        {nodes.filter(n=>!hiddenColors.has(n.color)).map(n=>(
          <rect key={n.id} x={tx(n.x)} y={ty(n.y)} width={Math.max(4,n.w*scale)} height={Math.max(3,n.h*scale)} rx={2} fill={n.color} opacity={.8}/>
        ))}
        <rect x={tx(vx0)} y={ty(vy0)} width={(vx1-vx0)*scale} height={(vy1-vy0)*scale} fill="none" stroke="#818cf8" strokeWidth={1} opacity={.6}/>
      </svg>
    </div>
  );
}

// ── Initial state ─────────────────────────────────────────────────────────────
function createInitial(){
  const m1=applyTemplate(mkMap('Mechatronik'),'mindmap');
  ['Mechatronik','Mechanik','Elektrotechnik','Informatik','Physik','Mathematik','Konstruktion'].forEach((l,i)=>{if(m1.nodes[i])m1.nodes[i].label=l;});
  const m2=applyTemplate(mkMap('Projekt-Planung'),'org');
  return {screen:'home',maps:{[m1.id]:m1,[m2.id]:m2},mapOrder:[m1.id,m2.id],currentMapId:null,navStack:[]};
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function MindSpaceApp(){
  const [app,setApp]               = useState(createInitial);
  const [history,setHistory]       = useState([]);
  const [future,setFuture]         = useState([]);
  const [selNode,setSelNode]       = useState(null);
  const [selEdge,setSelEdge]       = useState(null);
  const [connectMode,setConnMode]  = useState(false);
  const [pan,setPan]               = useState({x:0,y:0});
  const [zoom,setZoom]             = useState(1);
  const [showNewMap,setShowNewMap] = useState(false);
  const [showTpl,setShowTpl]       = useState(false);
  const [confirm,setConfirm]       = useState(null);
  const [notePopup,setNotePopup]   = useState(null);
  const [exportModal,setExportModal]= useState(null); // {type:'json'|'png', content:string}
  const [searchTerm,setSearchTerm] = useState('');
  const [hiddenColors,setHiddenColors]=useState(new Set());
  const [hoverNode,setHoverNode]   = useState(null);
  const [showMinimap,setShowMinimap]=useState(true);
  const [svgSize,setSvgSize]       = useState({w:800,h:600});
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const isMobile                   = typeof window!=='undefined' && window.innerWidth < 768;
  const pinchRef                   = useRef(null); // {dist}

  const svgRef=useRef(null),fileRef=useRef(null),dragRef=useRef(null),didMove=useRef(false);
  const panelOpenedAt=useRef(0); // timestamp when right panel last opened
  const zoomR=useRef(zoom),panR=useRef(pan),selNodeR=useRef(selNode),selEdgeR=useRef(selEdge),appR=useRef(app);
  useEffect(()=>{zoomR.current=zoom;},[zoom]);
  useEffect(()=>{panR.current=pan;},[pan]);
  useEffect(()=>{selNodeR.current=selNode;if(selNode)panelOpenedAt.current=Date.now();},[selNode]);
  useEffect(()=>{selEdgeR.current=selEdge;},[selEdge]);
  useEffect(()=>{appR.current=app;},[app]);

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
    setHistory(h=>{
      const snap={maps:JSON.parse(JSON.stringify(appR.current.maps)),currentMapId:appR.current.currentMapId};
      return [...h.slice(-HIST_MAX),snap];
    });
    setFuture([]);
  },[]);

  const undo=useCallback(()=>{
    setHistory(h=>{
      if(!h.length) return h;
      const snap=h[h.length-1];
      setFuture(f=>[{maps:JSON.parse(JSON.stringify(appR.current.maps)),currentMapId:appR.current.currentMapId},...f.slice(0,HIST_MAX)]);
      setApp(s=>({...s,maps:snap.maps,currentMapId:snap.currentMapId}));
      return h.slice(0,-1);
    });
  },[]);

  const redo=useCallback(()=>{
    setFuture(f=>{
      if(!f.length) return f;
      const snap=f[0];
      setHistory(h=>[...h,{maps:JSON.parse(JSON.stringify(appR.current.maps)),currentMapId:appR.current.currentMapId}]);
      setApp(s=>({...s,maps:snap.maps,currentMapId:snap.currentMapId}));
      return f.slice(1);
    });
  },[]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const patchNode=(id,patch)=>setApp(s=>{
    const mid=s.currentMapId;
    return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===id?{...n,...patch}:n)}}};
  });
  const patchEdge=(id,patch)=>setApp(s=>{
    const mid=s.currentMapId;
    return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.map(e=>e.id===id?{...e,...patch}:e)}}};
  });
  const doDeleteNode=useCallback((id)=>{
    pushHistory();
    setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.filter(n=>n.id!==id),edges:s.maps[mid].edges.filter(e=>e.from!==id&&e.to!==id)}}};});
    setSelNode(null);
  },[pushHistory]);
  const doDeleteEdge=useCallback((id)=>{
    pushHistory();
    setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.filter(e=>e.id!==id)}}};});
    setSelEdge(null);
  },[pushHistory]);
  const doDeleteSubMap=(nodeId,subMapId)=>{
    pushHistory();
    setApp(s=>{
      const mid=s.currentMapId;const nm={...s.maps};
      const collect=(id)=>{if(!nm[id])return;const sub=nm[id];delete nm[id];sub.nodes?.forEach(n=>n.childMapId&&collect(n.childMapId));};
      collect(subMapId);
      return {...s,maps:{...nm,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===nodeId?{...n,childMapId:null}:n)}}};
    });
  };
  const addEdgeBetween=(fromId,toId)=>{
    pushHistory();
    setApp(s=>{
      const mid=s.currentMapId;
      if(s.maps[mid].edges.some(e=>(e.from===fromId&&e.to===toId)||(e.from===toId&&e.to===fromId)))return s;
      return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:[...s.maps[mid].edges,mkEdge(fromId,toId)]}}};
    });
  };
  const addNode=()=>{
    pushHistory();
    const n=mkNode('Neu',160+rnd(300),120+rnd(230),COLORS[rnd(COLORS.length)]);
    setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:[...s.maps[mid].nodes,n]}}};});
    setSelNode(null);setSelEdge(null);setSidebarOpen(false);
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const openSubMap=()=>{
    if(!selNodeObj)return;
    setApp(s=>{
      const mid=s.currentMapId;let tid=selNodeObj.childMapId;let nm=s.maps;
      if(!tid||!s.maps[tid]){
        const sub=applyTemplate(mkMap(selNodeObj.label),'blank');tid=sub.id;
        nm={...s.maps,[sub.id]:sub,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===selNode?{...n,childMapId:sub.id}:n)}};
      }
      return {...s,maps:nm,currentMapId:tid,navStack:[...s.navStack,{mapId:mid,label:s.maps[mid].name}]};
    });
    setSelNode(null);setPan({x:0,y:0});setZoom(1);
  };
  const goBack=(idx)=>{setApp(s=>({...s,currentMapId:s.navStack[idx].mapId,navStack:s.navStack.slice(0,idx)}));setSelNode(null);setSelEdge(null);setPan({x:0,y:0});setZoom(1);};
  const goHome=()=>{setApp(s=>({...s,screen:'home',currentMapId:null,navStack:[]}));setSelNode(null);setSelEdge(null);setConnMode(false);setSidebarOpen(false);};
  const openMap=(id)=>{setApp(s=>({...s,screen:'editor',currentMapId:id,navStack:[]}));setSelNode(null);setSelEdge(null);setPan({x:0,y:0});setZoom(1);};
  const createMap=(name)=>{const m=applyTemplate(mkMap(name),'blank');setApp(s=>({...s,maps:{...s.maps,[m.id]:m},mapOrder:[...s.mapOrder,m.id],screen:'editor',currentMapId:m.id,navStack:[]}));setShowNewMap(false);setPan({x:0,y:0});setZoom(1);};
  const applyTpl=(tpl)=>{setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:applyTemplate({...s.maps[mid],nodes:[],edges:[]},tpl)}};});setShowTpl(false);setSelNode(null);setSelEdge(null);};
  const renameMap=(id,name)=>setApp(s=>({...s,maps:{...s.maps,[id]:{...s.maps[id],name}}}));
  const deleteMap=(id)=>{const m=maps[id];setConfirm({msg:`Mind Map "${m?.name}" wirklich löschen?`,onOk:()=>{setApp(s=>{const nm={...s.maps};delete nm[id];return {...s,maps:nm,mapOrder:s.mapOrder.filter(i=>i!==id)};});setConfirm(null);}});};

  // ── Export / Import ───────────────────────────────────────────────────────
  const exportJSON=()=>{
    const json=JSON.stringify(app,null,2);
    // Try native download first; fall back to copy-modal (artifact sandbox)
    try {
      const a=document.createElement('a');
      a.href='data:application/json;charset=utf-8,'+encodeURIComponent(json);
      a.download='mindspace-export.json';
      document.body.appendChild(a);a.click();document.body.removeChild(a);
    } catch(ex){}
    setExportModal({type:'json',content:json});
  };
  const exportPNG=()=>{
    const svg=svgRef.current;if(!svg)return;
    const s=new XMLSerializer().serializeToString(svg);
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas');c.width=svg.clientWidth*2;c.height=svg.clientHeight*2;
      const ctx=c.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#0b0b14';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);
      const dataUrl=c.toDataURL('image/png');
      try{const a=document.createElement('a');a.href=dataUrl;a.download=`${curMap?.name||'map'}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(ex){}
      setExportModal({type:'png',content:dataUrl});
    };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
  };
  const importData=(data)=>{if(data?.maps&&data?.mapOrder)setApp(s=>({...s,...data,screen:'home'}));};
  const autoLayout=(type)=>{
    if(!curMap)return;pushHistory();
    const newNodes=type==='radial'?layoutRadial(curMap.nodes):layoutHierarchical(curMap.nodes,curMap.edges);
    setApp(s=>({...s,maps:{...s.maps,[s.currentMapId]:{...s.maps[s.currentMapId],nodes:newNodes}}}));
  };

  // ── Unified pointer helpers (mouse + touch) ───────────────────────────────
  const evPos=(e)=>e.touches?{clientX:e.touches[0].clientX,clientY:e.touches[0].clientY}:{clientX:e.clientX,clientY:e.clientY};

  const applyDrag=(clientX,clientY)=>{
    const dr=dragRef.current;if(!dr)return;
    didMove.current=true;
    const dx=(clientX-dr.sx)/zoomR.current,dy=(clientY-dr.sy)/zoomR.current;
    if(dr.type==='node'){
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:s.maps[mid].nodes.map(n=>n.id===dr.nodeId?{...n,x:dr.ox+dx,y:dr.oy+dy}:n)}}};});
    } else if(dr.type==='cp'){
      setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],edges:s.maps[mid].edges.map(edge=>edge.id===dr.edgeId?{...edge,cp:{x:dr.ox+dx,y:dr.oy+dy}}:edge)}}};});
    } else if(dr.type==='pan'){
      setPan({x:dr.ox+(clientX-dr.sx),y:dr.oy+(clientY-dr.sy)});
    }
  };

  // ── Mouse / Keyboard ──────────────────────────────────────────────────────
  useEffect(()=>{
    const onMove=(e)=>{const {clientX,clientY}=evPos(e);applyDrag(clientX,clientY);};
    const onUp=()=>{dragRef.current=null;};
    const onTouchMove=(e)=>{
      // pinch-to-zoom with 2 fingers
      if(e.touches.length===2){
        e.preventDefault();
        const t0=e.touches[0],t1=e.touches[1];
        const dx=t0.clientX-t1.clientX,dy=t0.clientY-t1.clientY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        const midX=(t0.clientX+t1.clientX)/2;
        const midY=(t0.clientY+t1.clientY)/2;
        if(pinchRef.current){
          const ratio=dist/pinchRef.current;
          // zoom centered on pinch midpoint
          const oldZoom=zoomR.current;
          const newZoom=Math.min(3,Math.max(0.15,oldZoom*ratio));
          const wx=(midX-panR.current.x)/oldZoom;
          const wy=(midY-panR.current.y)/oldZoom;
          setZoom(newZoom);
          setPan({x:midX-wx*newZoom,y:midY-wy*newZoom});
        }
        pinchRef.current=dist;
        return;
      }
      pinchRef.current=null;
      const {clientX,clientY}=evPos(e);applyDrag(clientX,clientY);
    };
    const onTouchEnd=()=>{dragRef.current=null;pinchRef.current=null;};
    const onKey=(e)=>{
      const tag=document.activeElement.tagName;
      if(e.key==='Escape'){setConnMode(false);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();return;}
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='z'))){e.preventDefault();redo();return;}
      if((e.key==='Delete'||e.key==='Backspace')&&tag!=='INPUT'&&tag!=='TEXTAREA'&&!document.activeElement.isContentEditable){
        const nid=selNodeR.current,eid=selEdgeR.current;
        if(nid){const nd=appR.current.maps[appR.current.currentMapId]?.nodes.find(n=>n.id===nid);setConfirm({msg:`Knoten "${nd?.label}" löschen?`,onOk:()=>{doDeleteNode(nid);setConfirm(null);}});}
        else if(eid){setConfirm({msg:'Verbindung löschen?',onOk:()=>{doDeleteEdge(eid);setConfirm(null);}});}
      }
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchmove',onTouchMove,{passive:false});
    window.addEventListener('touchend',onTouchEnd);
    window.addEventListener('keydown',onKey);
    return()=>{
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
      window.removeEventListener('touchmove',onTouchMove);
      window.removeEventListener('touchend',onTouchEnd);
      window.removeEventListener('keydown',onKey);
    };
  },[undo,redo,doDeleteNode,doDeleteEdge]);

  useEffect(()=>{
    const svg=svgRef.current;if(!svg)return;
    const wh=(e)=>{
      e.preventDefault();
      const rect=svg.getBoundingClientRect();
      const mx=e.clientX-rect.left,my=e.clientY-rect.top;
      const oldZoom=zoomR.current;
      const newZoom=Math.min(3,Math.max(0.15,oldZoom*(e.deltaY>0?0.92:1.08)));
      const wx=(mx-panR.current.x)/oldZoom;
      const wy=(my-panR.current.y)/oldZoom;
      setZoom(newZoom);
      setPan({x:mx-wx*newZoom,y:my-wy*newZoom});
    };
    svg.addEventListener('wheel',wh,{passive:false});return()=>svg.removeEventListener('wheel',wh);
  },[screen]);

  const handleBgDown=(e)=>{
    const {clientX,clientY}=evPos(e);
    didMove.current=false;
    if(dragRef.current?.type==='node')return;
    dragRef.current={type:'pan',sx:clientX,sy:clientY,ox:panR.current.x,oy:panR.current.y};
  };
  const handleBgClick=()=>{if(!didMove.current){setSelNode(null);setSelEdge(null);setConnMode(false);}};
  const handleBgDbl=(e)=>{
    const r=svgRef.current.getBoundingClientRect();
    const {clientX,clientY}=evPos(e);
    const x=(clientX-r.left-panR.current.x)/zoomR.current,y=(clientY-r.top-panR.current.y)/zoomR.current;
    const n=mkNode('Neu',x-79,y-24,COLORS[rnd(COLORS.length)]);
    setApp(s=>{const mid=s.currentMapId;return {...s,maps:{...s.maps,[mid]:{...s.maps[mid],nodes:[...s.maps[mid].nodes,n]}}};});
    setSelNode(n.id);setSelEdge(null);
  };
  const handleNodeDown=(e,nodeId)=>{
    e.stopPropagation();didMove.current=false;
    const {clientX,clientY}=evPos(e);
    const isTouch=!!e.touches;
    if(connectMode&&selNodeR.current&&nodeId!==selNodeR.current){addEdgeBetween(selNodeR.current,nodeId);setConnMode(false);return;}
    // On mouse: select immediately. On touch: wait for touchend to decide.
    if(!isTouch){setSelNode(nodeId);setSelEdge(null);}
    const nd=curMap.nodes.find(n=>n.id===nodeId);
    if(nd) dragRef.current={type:'node',nodeId,sx:clientX,sy:clientY,ox:nd.x,oy:nd.y};
  };
  const handleNodeTouchEnd=(e,nodeId)=>{
    e.stopPropagation();
    if(connectMode&&selNodeR.current&&nodeId!==selNodeR.current){
      addEdgeBetween(selNodeR.current,nodeId);setConnMode(false);return;
    }
    // Only open panel if finger didn't move (tap, not drag)
    if(!didMove.current){setSelNode(nodeId);setSelEdge(null);}
  };
  const handleEdgeClick=(e,edgeId)=>{e.stopPropagation();setSelEdge(edgeId);setSelNode(null);};
  const handleCpDown=(e,edgeId,cpx,cpy)=>{
    e.stopPropagation();didMove.current=false;
    const {clientX,clientY}=evPos(e);
    dragRef.current={type:'cp',edgeId,sx:clientX,sy:clientY,ox:cpx,oy:cpy};
  };
  const handleImgUpload=(e)=>{
    const f=e.target.files[0];if(!f||!selNodeObj)return;
    const r=new FileReader();r.onload=ev=>patchNode(selNode,{images:[...(selNodeObj.images||[]),ev.target.result]});
    r.readAsDataURL(f);e.target.value='';
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const inp={width:'100%',background:'#0d0d18',border:'1px solid #1e1e32',color:'#e2e8f0',borderRadius:7,padding:'7px 10px',fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:'inherit'};
  const btn=(col,bg='transparent')=>({background:bg,border:`1px solid ${col}35`,color:col,borderRadius:7,padding:'7px 10px',fontSize:12,cursor:'pointer',textAlign:'left',width:'100%',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6});
  const lbl={fontSize:10,color:'#3a3a55',letterSpacing:'0.1em',display:'block',marginBottom:7};

  // ── Home ──────────────────────────────────────────────────────────────────
  if(screen==='home') return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Unbounded:wght@600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}button:hover{opacity:.78;cursor:pointer;}`}</style>
      <HomeScreen maps={maps} mapOrder={mapOrder} onOpen={openMap} onDelete={deleteMap} onNew={()=>setShowNewMap(true)} onRename={renameMap} onImport={importData}/>
      {showNewMap && <NewMapModal onClose={()=>setShowNewMap(false)} onCreate={createMap}/>}
      {confirm    && <ConfirmModal msg={confirm.msg} onOk={confirm.onOk} onCancel={()=>setConfirm(null)}/>}
      {exportModal && <ExportModal data={exportModal} onClose={()=>setExportModal(null)}/>}
    </>
  );

  if(!curMap) return null;

  const searchLow=searchTerm.toLowerCase();
  const matchingIds=searchTerm?new Set(curMap.nodes.filter(n=>n.label.toLowerCase().includes(searchLow)).map(n=>n.id)):null;
  const visibleNodes=curMap.nodes.filter(n=>!hiddenColors.has(n.color));

  // ── Editor ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',height:'100vh',background:'#0b0b14',color:'#c9d1d9',fontFamily:'"IBM Plex Sans",sans-serif',overflow:'hidden',userSelect:'none',touchAction:'none'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Unbounded:wght@600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0b0b14}::-webkit-scrollbar-thumb{background:#252540;border-radius:2px}input:focus,textarea:focus{border-color:#818cf8!important}button:hover{opacity:.78;}@media(max-width:767px){.desktop-only{display:none!important}}`}</style>

      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && isMobile && <div onClick={()=>setSidebarOpen(false)} style={{position:'fixed',inset:0,background:'#00000060',zIndex:99}}/>}

      {/* MOBILE TOGGLE BUTTON */}
      {isMobile && (
        <button onClick={()=>setSidebarOpen(v=>!v)}
          style={{position:'fixed',top:12,left:12,zIndex:200,background:'#818cf8',border:'none',color:'#fff',borderRadius:10,width:42,height:42,fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px #00000066',cursor:'pointer'}}>
          {sidebarOpen?'×':'☰'}
        </button>
      )}

      {/* LEFT SIDEBAR */}
      <div style={{
        width:215,background:'#0e0e19',borderRight:'1px solid #181828',display:'flex',flexDirection:'column',
        padding:14,flexShrink:0,overflowY:'auto',
        ...(isMobile?{position:'fixed',top:0,left:0,height:'100vh',zIndex:100,transform:sidebarOpen?'translateX(0)':'translateX(-100%)',transition:'transform .25s',boxShadow:sidebarOpen?'4px 0 32px #000000aa':'none'}:{})
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,paddingLeft:isMobile?52:0}}>
          <button onClick={goHome} style={{background:'none',border:'none',color:'#818cf8',fontSize:16,padding:'2px 5px',borderRadius:5,fontFamily:'inherit',cursor:'pointer'}}>←</button>
          <div style={{fontFamily:'Unbounded',fontSize:12,color:'#818cf8'}}>◈ MindSpace</div>
        </div>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:7}}>NAVIGATION</div>
        {navStack.map((s,i)=>(
          <button key={i} onClick={()=>goBack(i)} style={{background:'none',border:'none',color:'#818cf8',fontSize:11,textAlign:'left',padding:'3px 6px',borderRadius:5,fontFamily:'inherit',marginBottom:2,display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
            <span style={{opacity:.5}}>↩</span>{s.label}
          </button>
        ))}
        <div style={{fontSize:12,color:'#e2e8f0',fontWeight:500,padding:'5px 8px',background:'#161626',borderRadius:7,marginBottom:16,display:'flex',alignItems:'center',gap:7}}>
          <span style={{color:'#818cf8'}}>◉</span>{curMap.name}
        </div>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:7}}>SUCHE</div>
        <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Knoten suchen…" style={{...inp,marginBottom:14,fontSize:11}}/>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:7}}>WERKZEUGE</div>
        <button onClick={addNode}                style={{...btn('#818cf8','#818cf812'),justifyContent:'center',fontWeight:500,marginBottom:5}}>+ Knoten</button>
        <button onClick={()=>setConnMode(v=>!v)} style={{...btn(connectMode?'#f472b6':'#a5b4fc',connectMode?'#f472b615':'transparent'),justifyContent:'center',marginBottom:5}}>🔗 {connectMode?'Verbinden aktiv':'Verbinden'}</button>
        <button onClick={()=>setShowTpl(true)}   style={{...btn('#7dd3fc'),justifyContent:'center',marginBottom:5}}>📐 Vorlage</button>
        <button onClick={()=>autoLayout('radial')}       style={{...btn('#a78bfa'),justifyContent:'center',marginBottom:5}}>⊙ Radial-Layout</button>
        <button onClick={()=>autoLayout('hierarchical')} style={{...btn('#a78bfa'),justifyContent:'center',marginBottom:14}}>⊤ Hierarchie-Layout</button>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:8}}>FARB-FILTER</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:14}}>
          {COLORS.map(c=>(
            <div key={c} onClick={()=>setHiddenColors(s=>{const n=new Set(s);n.has(c)?n.delete(c):n.add(c);return n;})}
              style={{width:18,height:18,borderRadius:'50%',background:hiddenColors.has(c)?'#1e1e30':c,cursor:'pointer',border:hiddenColors.has(c)?`2px solid ${c}`:'2px solid transparent',opacity:hiddenColors.has(c)?.4:1,transition:'all .15s'}}/>
          ))}
          {hiddenColors.size>0 && <button onClick={()=>setHiddenColors(new Set())} style={{fontSize:9,color:'#f472b6',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>alle zeigen</button>}
        </div>

        <div style={{fontSize:10,color:'#3a3a55',letterSpacing:'.1em',marginBottom:8}}>EXPORT</div>
        <button onClick={exportJSON} style={{...btn('#34d399'),marginBottom:5,fontSize:11}}>💾 Als JSON speichern</button>
        <button onClick={exportPNG}  style={{...btn('#34d399'),marginBottom:14,fontSize:11}}>🖼 Als PNG exportieren</button>

        <div style={{display:'flex',gap:5,marginBottom:8}}>
          <button onClick={undo} disabled={!history.length} style={{...btn(history.length?'#a5b4fc':'#252540'),flex:1,justifyContent:'center',fontSize:11,opacity:history.length?1:.4}}>↩ Undo</button>
          <button onClick={redo} disabled={!future.length}  style={{...btn(future.length?'#a5b4fc':'#252540'),flex:1,justifyContent:'center',fontSize:11,opacity:future.length?1:.4}}>↪ Redo</button>
        </div>
        <button onClick={()=>setShowMinimap(v=>!v)} style={{...btn(showMinimap?'#818cf8':'#3a3a55',showMinimap?'#818cf815':'transparent'),justifyContent:'center',fontSize:11,marginBottom:16}}>
          🗺 Minimap {showMinimap?'AN':'AUS'}
        </button>

        <div style={{marginTop:'auto',fontSize:10,color:'#252540',lineHeight:2.2}}>
          <div>⊞ Doppelklick → Knoten</div>
          <div>✥ Drag Fläche → Pan</div>
          <div>⊙ Scroll → Zoom</div>
          <div>⌦ Entf → löschen</div>
          <div>Ctrl+Z/Y → Undo/Redo</div>
        </div>
      </div>

      {/* CANVAS */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <svg ref={svgRef} style={{width:'100%',height:'100%',display:'block',cursor:connectMode?'crosshair':'default'}}>
          <defs>
            <pattern id="grd" x={pan.x%28} y={pan.y%28} width={28} height={28} patternUnits="userSpaceOnUse">
              <circle cx={14} cy={14} r={.7} fill="#181828"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grd)"
            onMouseDown={handleBgDown} onTouchStart={handleBgDown}
            onClick={handleBgClick} onDoubleClick={handleBgDbl}
            style={{cursor:connectMode?'crosshair':'default'}}/>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {curMap.edges.map(edge=>{
              const fn=curMap.nodes.find(n=>n.id===edge.from),tn=curMap.nodes.find(n=>n.id===edge.to);
              if(!fn||!tn||hiddenColors.has(fn.color)||hiddenColors.has(tn.color)) return null;
              const geo=edgeGeometry(fn,tn,edge.style,edge.cp);
              const isSel=edge.id===selEdge,col=isSel?'#c7d2fe':(edge.color||'#6b6b9a');
              const hasEnd=edge.arrow==='forward'||edge.arrow==='both';
              const hasStart=edge.arrow==='backward'||edge.arrow==='both';
              return (
                <g key={edge.id} onClick={ev=>handleEdgeClick(ev,edge.id)} style={{cursor:'pointer'}}>
                  <path d={geo.d} fill="none" stroke="transparent" strokeWidth={18}/>
                  <path d={geo.d} fill="none" stroke={col} strokeWidth={isSel?2.5:1.5} strokeDasharray={isSel?'7,3':undefined}/>
                  {hasEnd   && <polygon points={arrowPts(geo.x2,geo.y2,geo.endDir,11)}   fill={col} style={{pointerEvents:'none'}}/>}
                  {hasStart && <polygon points={arrowPts(geo.x1,geo.y1,geo.startDir,11)} fill={col} style={{pointerEvents:'none'}}/>}
                  {isSel && geo.handlePos && (
                    <circle cx={geo.handlePos.x} cy={geo.handlePos.y} r={9} fill="#818cf8" stroke="#0b0b14" strokeWidth={2}
                      style={{cursor:'grab'}}
                      onMouseDown={ev=>{ev.stopPropagation();if(!edge.routing)patchEdge(edge.id,{routing:true});handleCpDown(ev,edge.id,geo.handlePos.x,geo.handlePos.y);}}
                      onTouchStart={ev=>{ev.stopPropagation();if(!edge.routing)patchEdge(edge.id,{routing:true});handleCpDown(ev,edge.id,geo.handlePos.x,geo.handlePos.y);}}
                      onClick={ev=>ev.stopPropagation()}/>
                  )}
                  {edge.label && (
                    <g style={{pointerEvents:'none'}}>
                      <rect x={geo.mid.x-edge.label.length*3.3-5} y={geo.mid.y-9} width={edge.label.length*6.5+10} height={17} rx={4} fill="#0e0e1a" stroke={col} strokeWidth={.8} opacity={.92}/>
                      <text x={geo.mid.x} y={geo.mid.y+1} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize={10} fontFamily={'"IBM Plex Sans",sans-serif'} fontWeight={500}>{edge.label}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {visibleNodes.map(node=>{
              const isSel=node.id===selNode;
              const isMatch=matchingIds&&matchingIds.has(node.id);
              const isDimmed=matchingIds&&!matchingIds.has(node.id);
              const hasNote=!!node.notesHtml;
              return (
                <g key={node.id} onMouseDown={e=>handleNodeDown(e,node.id)} onTouchStart={e=>handleNodeDown(e,node.id)} onTouchEnd={e=>handleNodeTouchEnd(e,node.id)}
                  onMouseEnter={()=>setHoverNode(node.id)} onMouseLeave={()=>setHoverNode(null)}
                  style={{cursor:'pointer',opacity:isDimmed?.25:1,transition:'opacity .2s'}}>
                  {isSel   && <rect x={node.x-9} y={node.y-9} width={node.w+18} height={node.h+18} rx={16} fill={node.color} opacity={.1} style={{pointerEvents:'none'}}/>}
                  {isMatch && <rect x={node.x-5} y={node.y-5} width={node.w+10} height={node.h+10} rx={13} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={.8} style={{pointerEvents:'none'}}/>}
                  <NodeShape node={node} selected={isSel}/>
                  {(node.shape==='rounded'||node.shape==='rect') && <rect x={node.x} y={node.y} width={5} height={node.h} rx={2} fill={node.color} style={{pointerEvents:'none'}}/>}
                  <text x={node.x+node.w/2+(node.shape==='rounded'||node.shape==='rect'?2:0)} y={node.y+node.h/2}
                    textAnchor="middle" dominantBaseline="middle" fill={isSel?'#fff':'#c9d1d9'}
                    fontSize={node.shape==='circle'?11:13} fontWeight={isSel?600:400}
                    style={{userSelect:'none',fontFamily:'"IBM Plex Sans",sans-serif'}}>
                    {node.label.length>14?node.label.slice(0,14)+'…':node.label}
                  </text>
                  {node.childMapId && <circle cx={node.x+node.w-9}  cy={node.y+9} r={5} fill={node.color} opacity={.9} style={{pointerEvents:'none'}}/>}
                  {hasNote          && <circle cx={node.x+node.w-(node.childMapId?22:9)} cy={node.y+9} r={4} fill="#fbbf24" opacity={.85} style={{pointerEvents:'none'}}/>}
                </g>
              );
            })}
          </g>

          {connectMode && (
            <g style={{pointerEvents:'none'}}>
              <rect x={10} y={10} width={280} height={28} rx={7} fill="#180d1a" stroke="#f472b640" strokeWidth={1}/>
              <text x={20} y={29} fill="#f472b6" fontSize={12} fontFamily={'"IBM Plex Sans",sans-serif'}>🔗 Ziel-Knoten anklicken · ESC = Abbrechen</text>
            </g>
          )}
        </svg>

        {/* Hover tooltip */}
        {hoverNode && !selNode && (()=>{
          const nd=visibleNodes.find(n=>n.id===hoverNode);
          if(!nd||!nd.notesHtml) return null;
          const plain=nd.notesHtml.replace(/<[^>]*>/g,'').slice(0,120).trim();
          if(!plain) return null;
          return (
            <div style={{position:'absolute',left:20,bottom:20,background:'#13131e',border:'1px solid #252545',borderRadius:10,padding:'10px 14px',maxWidth:280,fontSize:11,color:'#a0aec0',lineHeight:1.6,pointerEvents:'none',zIndex:30,boxShadow:'0 4px 20px #00000099'}}>
              <div style={{fontWeight:600,color:'#e2e8f0',marginBottom:4}}>{nd.label}</div>
              <div>{plain}{nd.notesHtml.replace(/<[^>]*>/g,'').length>120?'…':''}</div>
            </div>
          );
        })()}

        {showMinimap && curMap && (
          <Minimap nodes={curMap.nodes} edges={curMap.edges} pan={pan} zoom={zoom} svgW={svgSize.w} svgH={svgSize.h} hiddenColors={hiddenColors}/>
        )}
      </div>

      {/* RIGHT PANEL — hidden while connect mode is active */}
      {(selNodeObj||selEdgeObj) && !connectMode && (
        <div style={{width:262,background:'#0e0e19',borderLeft:'1px solid #181828',display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
          <div style={{padding:'12px 14px',borderBottom:'1px solid #181828',display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:9,height:9,borderRadius:'50%',background:selNodeObj?selNodeObj.color:'#a5b4fc',flexShrink:0,boxShadow:`0 0 7px ${selNodeObj?selNodeObj.color:'#a5b4fc'}99`}}/>
            <span style={{fontSize:12,fontWeight:600,color:'#e2e8f0'}}>{selNodeObj?'Knoten':'Verbindung'}</span>
            <div onClick={()=>{setSelNode(null);setSelEdge(null);}} style={{marginLeft:'auto',cursor:'pointer',color:'#3a3a55',fontSize:16}}>×</div>
          </div>
          <div style={{padding:14,overflowY:'auto',flex:1}}>

            {selNodeObj && (
              <>
                <label style={lbl}>BEZEICHNUNG</label>
                <input value={selNodeObj.label} onChange={e=>patchNode(selNode,{label:e.target.value})} style={{...inp,marginBottom:14}}/>

                <label style={lbl}>FARBE</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8}}>
                  {COLORS.map(c=>(
                    <div key={c} onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{color:c});}}
                      style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',
                        border:selNodeObj.color===c?'3px solid #fff':'2px solid #1e1e30',
                        boxShadow:selNodeObj.color===c?`0 0 8px ${c}aa`:'none',transition:'all .15s'}}/>
                  ))}
                </div>
                <button onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{colorBorder:!selNodeObj.colorBorder});}}
                  style={{...btn(selNodeObj.colorBorder?selNodeObj.color:'#3a3a55',selNodeObj.colorBorder?`${selNodeObj.color}15`:'transparent'),
                    justifyContent:'space-between',marginBottom:14,border:`1px solid ${selNodeObj.colorBorder?selNodeObj.color+'60':'#252540'}`}}>
                  <span>Farbiger Rand</span>
                  <span style={{background:selNodeObj.colorBorder?selNodeObj.color:'#252540',color:selNodeObj.colorBorder?'#0b0b14':'#6b6b9a',borderRadius:10,padding:'1px 7px',fontSize:10,fontWeight:600}}>
                    {selNodeObj.colorBorder?'AN':'AUS'}
                  </span>
                </button>

                <label style={lbl}>FORM</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:14}}>
                  {SHAPES.map(s=>{
                    const [nw,nh]=getNodeSize(s),active=selNodeObj.shape===s;
                    return (
                      <button key={s} onClick={()=>{if(Date.now()-panelOpenedAt.current<400)return;patchNode(selNode,{shape:s,w:nw,h:nh});}}
                        style={{...btn(active?selNodeObj.color:'#3a3a55',active?`${selNodeObj.color}18`:'transparent'),justifyContent:'center',flexDirection:'column',padding:'8px 4px',gap:2,fontSize:11,border:`1px solid ${active?selNodeObj.color:'#1e1e30'}`}}>
                        <span style={{fontSize:17}}>{SHAPE_ICONS[s]}</span>
                        <span>{SHAPE_NAMES[s]}</span>
                      </button>
                    );
                  })}
                </div>

                <label style={lbl}>NOTIZEN</label>
                {selNodeObj.notesHtml && (
                  <div dangerouslySetInnerHTML={{__html:selNodeObj.notesHtml}}
                    style={{fontSize:11,color:'#7a7a9a',lineHeight:1.5,marginBottom:8,maxHeight:70,overflow:'hidden',padding:'6px 8px',background:'#0d0d18',borderRadius:7,border:'1px solid #1e1e30',cursor:'pointer'}}
                    onClick={()=>setNotePopup(selNode)}/>
                )}
                <button onClick={()=>setNotePopup(selNode)} style={{...btn(selNodeObj.notesHtml?'#34d399':'#818cf8',selNodeObj.notesHtml?'#0d1f1560':'transparent'),justifyContent:'center',marginBottom:14}}>
                  {selNodeObj.notesHtml?'✏️ Notizen bearbeiten':'📝 Notizen öffnen'}
                </button>

                <label style={lbl}>BILDER</label>
                {(selNodeObj.images||[]).length>0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                    {selNodeObj.images.map((img,i)=>(
                      <div key={i} style={{position:'relative',width:60,height:60}}>
                        <img src={img} alt="" style={{width:60,height:60,objectFit:'cover',borderRadius:7,display:'block',border:'1px solid #1e1e30'}}/>
                        <div onClick={()=>patchNode(selNode,{images:selNodeObj.images.filter((_,j)=>j!==i)})}
                          style={{position:'absolute',top:-5,right:-5,width:16,height:16,background:'#ef4444',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',cursor:'pointer',fontWeight:700}}>×</div>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImgUpload} style={{display:'none'}}/>
                <button onClick={()=>fileRef.current?.click()} style={{...btn('#818cf8'),border:'1px dashed #252545',justifyContent:'center',marginBottom:14}}>+ Bild anhängen</button>

                <div style={{borderTop:'1px solid #181828',paddingTop:12,display:'flex',flexDirection:'column',gap:6}}>
                  <button onClick={()=>setConnMode(true)} style={btn('#a5b4fc')}>🔗 Verbindung erstellen</button>
                  <button onClick={openSubMap} style={btn(selNodeObj.childMapId?'#34d399':'#a5b4fc',selNodeObj.childMapId?'#0d1f15':'transparent')}>
                    🗺️ {selNodeObj.childMapId?'Sub-Map öffnen →':'Sub-Map erstellen'}
                    {selNodeObj.childMapId && <span style={{marginLeft:'auto',width:7,height:7,borderRadius:'50%',background:'#34d399'}}/>}
                  </button>
                  {selNodeObj.childMapId && (
                    <button onClick={()=>setConfirm({msg:`Sub-Map "${selNodeObj.label}" löschen?`,onOk:()=>{doDeleteSubMap(selNode,selNodeObj.childMapId);setConfirm(null);}})} style={btn('#f87171')}>🗑️ Sub-Map löschen</button>
                  )}
                  <button onClick={()=>setConfirm({msg:`Knoten "${selNodeObj.label}" löschen?`,onOk:()=>{doDeleteNode(selNode);setConfirm(null);}})} style={btn('#f87171')}>🗑️ Knoten löschen</button>
                </div>
              </>
            )}

            {selEdgeObj && (
              <>
                <label style={lbl}>BESCHREIBUNG</label>
                <input value={selEdgeObj.label||''} onChange={e=>patchEdge(selEdge,{label:e.target.value})} placeholder="z.B. besteht aus…" style={{...inp,marginBottom:14}}/>

                <label style={lbl}>PFEILRICHTUNG</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:14}}>
                  {[['none','─ Keine'],['forward','→ Vorwärts'],['backward','← Rückwärts'],['both','↔ Beide']].map(([v,l])=>(
                    <button key={v} onClick={()=>patchEdge(selEdge,{arrow:v})}
                      style={{...btn(selEdgeObj.arrow===v?'#a5b4fc':'#3a3a55',selEdgeObj.arrow===v?'#818cf820':'transparent'),justifyContent:'center',fontSize:11,border:`1px solid ${selEdgeObj.arrow===v?'#818cf860':'#1e1e30'}`}}>
                      {l}
                    </button>
                  ))}
                </div>

                <label style={lbl}>LINIENSTIL</label>
                <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:14}}>
                  {[['curved','~ Gebogen'],['straight','— Gerade'],['ortho','⌐ Orthogonal']].map(([v,l])=>(
                    <button key={v} onClick={()=>patchEdge(selEdge,{style:v,cp:null,routing:false})}
                      style={{...btn(selEdgeObj.style===v?'#a5b4fc':'#3a3a55',selEdgeObj.style===v?'#818cf820':'transparent'),fontSize:11,border:`1px solid ${selEdgeObj.style===v?'#818cf860':'#1e1e30'}`}}>
                      {l}
                    </button>
                  ))}
                </div>

                {selEdgeObj.style!=='straight' && selEdgeObj.cp && (
                  <div style={{marginBottom:14,background:'#0d0d18',border:'1px solid #1e1e30',borderRadius:8,padding:'8px 11px',fontSize:11,color:'#5a5a7a',lineHeight:1.7,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span>Verlauf angepasst</span>
                    <span style={{color:'#34d399',cursor:'pointer',fontWeight:500}} onClick={()=>patchEdge(selEdge,{cp:null,routing:false})}>↺ Zurücksetzen</span>
                  </div>
                )}
                {selEdgeObj.style!=='straight' && !selEdgeObj.cp && (
                  <div style={{marginBottom:14,fontSize:11,color:'#3a3a55',padding:'6px 10px',background:'#0d0d18',borderRadius:8,border:'1px solid #1e1e30'}}>
                    ● Blauen Punkt ziehen zum Anpassen
                  </div>
                )}

                <label style={lbl}>FARBE</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
                  {EDGE_COLORS.map(c=>(
                    <div key={c} onClick={()=>patchEdge(selEdge,{color:c})}
                      style={{width:21,height:21,borderRadius:'50%',background:c,cursor:'pointer',border:selEdgeObj.color===c?'3px solid #fff':'2px solid transparent',boxShadow:selEdgeObj.color===c?`0 0 8px ${c}aa`:'none',transition:'all .15s'}}/>
                  ))}
                </div>
                <div style={{borderTop:'1px solid #181828',paddingTop:12}}>
                  <button onClick={()=>setConfirm({msg:'Verbindung löschen?',onOk:()=>{doDeleteEdge(selEdge);setConfirm(null);}})} style={btn('#f87171')}>🗑️ Verbindung löschen</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showTpl   && <TemplatePicker onApply={applyTpl} onClose={()=>setShowTpl(false)}/>}
      {confirm   && <ConfirmModal msg={confirm.msg} onOk={confirm.onOk} onCancel={()=>setConfirm(null)}/>}
      {exportModal && <ExportModal data={exportModal} onClose={()=>setExportModal(null)}/>}
      {notePopup && (()=>{
        const nd=curMap?.nodes.find(n=>n.id===notePopup);
        if(!nd) return null;
        return (
          <RichTextEditor node={nd} onClose={()=>setNotePopup(null)}
            onSave={html=>{patchNode(notePopup,{notesHtml:html});setNotePopup(null);}}/>
        );
      })()}
    </div>
  );
}
