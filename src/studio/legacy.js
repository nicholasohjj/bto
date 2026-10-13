// Flat Studio: 2D plan + 3D view of an HDB flat. Moved from a single HTML file; new, testable
// pieces live in TypeScript modules next to this one.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import LAYOUTS from './layouts.json'

// Keep the look the design had on three.js r128: no colour management, and light intensities
// scaled by PI (three.js now uses physical light units).
THREE.ColorManagement.enabled=false;
const LI=Math.PI;

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const T=0.12;                       // wall thickness (m)
const DH=2.05;                      // door opening height (m)
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sn=(v,g=.1)=>+(Math.round(v/g)*g).toFixed(3);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let uidn=1; const uid=()=>'n'+(uidn++);
const HAS3D=true;

/* ───────── data tables ───────── */
const FLOORS={
  oak:{n:'Oak plank',c:'#c6a47a',r:.7}, walnut:{n:'Walnut plank',c:'#7a5a43',r:.7},
  vinyl:{n:'Ash vinyl',c:'#d6ccbb',r:.8}, tile:{n:'Grey tile',c:'#c9cecd',r:.35},
  marble:{n:'White marble',c:'#e8e7e3',r:.25}
};
const WALLS=['#f2f0eb','#dcd7cd','#cfd8c8','#cdd8dd','#e2cfc4','#6a7074'];
const SW=['#d9d3c5','#b9a58a','#8a9a7b','#8aa0ad','#c89a82','#4a4f52','#f0eee9','#7a5a43'];
const WTYPES={std:{n:'Standard',sill:.9,wh:1.2},slide:{n:'Sliding',sill:.9,wh:1.2},tall:{n:'Floor to ceiling',sill:.05,wh:2.4},high:{n:'High (bathroom)',sill:1.5,wh:.6},bay:{n:'Bay (projects out)',sill:.6,wh:1.5}};
const DTYPES={single:'Single swing',double:'Double swing',slide:'Sliding',arch:'Open archway'};

/* ───────── 3D primitives ───────── */
const matCache={};
let ENVMAP=null;
function mat(c,r=.85,m=0,x){const k=c+'|'+r+'|'+m+(x?JSON.stringify(x):'');
  if(!matCache[k]){matCache[k]=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r,metalness:m},x||{}));matCache[k].userData.cached=1;if(ENVMAP&&(m>=.3||r<=.3||(x&&x.transparent))){matCache[k].envMap=ENVMAP;matCache[k].envMapIntensity=(x&&x.transparent)?.9:.55;}}
  return matCache[k];}
function shade(hex,f){const c=new THREE.Color(hex);c.multiplyScalar(f);c.r=Math.min(1,c.r);c.g=Math.min(1,c.g);c.b=Math.min(1,c.b);return '#'+c.getHexString();}
function bx(g,w,h,d,x,y,z,c,r,m,x2){const me=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c,r,m,x2));me.position.set(x,y,z);me.castShadow=!(x2&&x2.transparent);me.receiveShadow=true;g.add(me);return me;}
function cyl(g,r,h,x,y,z,c,o={}){const me=new THREE.Mesh(new THREE.CylinderGeometry(o.rt??r,r,h,o.seg||24),mat(c,o.r??.7,o.m??0));me.position.set(x,y,z);me.scale.set(o.sx||1,1,o.sz||1);if(o.rx)me.rotation.x=o.rx;me.castShadow=true;me.receiveShadow=true;g.add(me);return me;}
function sph(g,r,x,y,z,c,sx=1,sy=1,sz=1){const me=new THREE.Mesh(new THREE.SphereGeometry(r,14,10),mat(c,.9));me.position.set(x,y,z);me.scale.set(sx,sy,sz);me.castShadow=true;g.add(me);return me;}
function legs(g,w,d,h,t,col,ins=.04){for(const sx of[-1,1])for(const sz of[-1,1])bx(g,t,h,t,sx*(w/2-ins),h/2,sz*(d/2-ins),col,.6);}
const GLASS={transparent:true,opacity:.28};
let CH=2.6;const env={hour:14,lamps:'auto',north:0};try{const n=+localStorage.getItem('flatstudio.north');if(n>=0&&n<360)env.north=n;}catch(e){}
const LAMPMAT=HAS3D?new THREE.MeshStandardMaterial({color:'#fff4d8',emissive:'#ffcf8a',emissiveIntensity:.05,roughness:.4}):null;
const STEEL='#9aa2a6', WOOD='#a88b6a';

const B={
  bed(g,w,d,c){bx(g,w,.28,d,0,.14,0,WOOD,.7);bx(g,w-.08,.22,d-.12,0,.39,.03,'#f3f1ec',.95);bx(g,w-.04,.08,d*.66,0,.54,d*.17,c,.95);
    bx(g,w+.04,.95,.07,0,.475,-d/2+.035,WOOD,.7);const n=w>1.3?2:1,pw=(w-.2)/n;
    for(let i=0;i<n;i++)bx(g,pw*.8,.12,.36,(i-(n-1)/2)*pw,.6,-d/2+.4,'#faf9f6',.95);},
  ward(g,w,d,c){bx(g,w,2.4,d,0,1.2,0,c,.6);const n=Math.max(2,Math.round(w/.55));
    for(let i=1;i<n;i++)bx(g,.012,2.3,.01,-w/2+w*i/n,1.2,d/2+.002,shade(c,.62));
    for(let i=0;i<n;i++)bx(g,.014,.28,.02,-w/2+w*(i+.5)/n+(i%2?-.06:.06),1.15,d/2+.012,'#6b6e70',.4,.6);},
  bside(g,w,d,c){bx(g,w,.42,d,0,.21,0,c,.6);bx(g,w-.05,.012,.01,0,.3,d/2+.003,shade(c,.62));bx(g,.07,.016,.02,0,.35,d/2+.01,'#5c5f61',.4,.6);},
  desk(g,w,d,c){bx(g,w,.04,d,0,.73,0,c,.55);legs(g,w,d,.71,.05,shade(c,.7));bx(g,.34,.015,.23,w*.12,.7575,.03,'#c9cdd0',.4,.6);bx(g,.34,.22,.01,w*.12,.87,-.09,'#2b2e31',.4);},
  chair(g,w,d,c){bx(g,w,.05,d,0,.45,0,c,.8);legs(g,w,d,.43,.035,'#3a3d3f',.03);bx(g,w,.42,.04,0,.69,-d/2+.02,c,.8);},
  sofa(g,w,d,c){const a=Math.min(.2,w*.22);bx(g,w,.22,d,0,.11,0,shade(c,.6),.9);bx(g,w-2*a,.16,d-.22,0,.30,.11,c,.95);
    bx(g,w,.45,.22,0,.45,-d/2+.11,c,.95);bx(g,a,.28,d,-w/2+a/2,.36,0,c,.95);bx(g,a,.28,d,w/2-a/2,.36,0,c,.95);
    const n=Math.max(1,Math.round((w-2*a)/.75)),cw=(w-2*a)/n;for(let i=0;i<n;i++)bx(g,cw-.03,.36,.15,-(w-2*a)/2+cw*(i+.5),.64,-d/2+.3,shade(c,1.08),.95);},
  coffee(g,w,d,c){bx(g,w,.04,d,0,.4,0,c,.5);legs(g,w,d,.38,.045,shade(c,.7),.05);bx(g,w-.1,.02,d-.1,0,.2,0,shade(c,.85),.6);},
  tvc(g,w,d,c){bx(g,w,.45,d,0,.225,0,c,.6);const n=Math.max(2,Math.round(w/.6));for(let i=1;i<n;i++)bx(g,.01,.4,.01,-w/2+w*i/n,.225,d/2+.003,shade(c,.62));
    bx(g,.3,.05,.18,0,.475,0,'#222527',.4);bx(g,w*.6,.5,.04,0,.77,0,'#101213',.25);},
  dining(g,w,d,c){const td=d-.5;bx(g,w,.04,td,0,.75,0,c,.5);legs(g,w,td,.73,.06,shade(c,.7),.06);
    const n=Math.max(2,Math.round(w/.7));for(const sd of[-1,1])for(let i=0;i<n;i++){const cg=new THREE.Group();B.chair(cg,.44,.44,'#d7cfc0');cg.position.set((i-(n-1)/2)*(w/n),0,sd*(td/2+.2));cg.rotation.y=sd>0?Math.PI:0;g.add(cg);}},
  shelf(g,w,d,c){bx(g,.03,1.8,d,-w/2+.015,.9,0,c,.6);bx(g,.03,1.8,d,w/2-.015,.9,0,c,.6);bx(g,w,1.8,.015,0,.9,-d/2+.008,shade(c,.8),.7);
    for(let k=0;k<=5;k++)bx(g,w-.04,.03,d,0,.015+k*.35,0,c,.6);const cols=['#8a9a7b','#c89a82','#8aa0ad','#d9d3c5'];
    for(let k=0;k<5;k++)for(let j=0;j<3;j++)bx(g,.05+.02*((j+k)%3),.2+.04*((j*k)%3),d*.7,-w/2+.18+j*.22,.03+k*.35+.12,0,cols[(j+k)%4],.8);},
  shoe(g,w,d,c){bx(g,w,1.1,d,0,.55,0,c,.6);for(let k=1;k<4;k++)bx(g,w-.03,.008,.01,0,.27*k,d/2+.002,shade(c,.6));bx(g,.01,1.05,.01,0,.55,d/2+.002,shade(c,.6));},
  rug(g,w,d,c){bx(g,w,.016,d,0,.008,0,c,1).castShadow=false;bx(g,w-.24,.004,d-.24,0,.018,0,shade(c,.92),1).castShadow=false;},
  plant(g,w,d,c){cyl(g,.15,.28,0,.14,0,'#c9b9a6',{rt:.17,r:.8});sph(g,.2,0,.55,0,'#5d7b57',1,1.2,1);sph(g,.15,.1,.8,.05,'#6b8a63');sph(g,.13,-.1,.72,-.06,'#4f6d4a');},
  cab(g,w,d,c){bx(g,w,.1,d-.04,0,.05,-.02,'#3b3e40',.9);bx(g,w,.76,d-.02,0,.48,0,c,.6);bx(g,w+.015,.04,d+.015,0,.87,0,'#e4e1db',.35);
    const n=Math.max(1,Math.round(w/.6));for(let i=1;i<n;i++)bx(g,.01,.7,.01,-w/2+w*i/n,.5,d/2+.003,shade(c,.6));
    for(let i=0;i<n;i++)bx(g,.14,.014,.02,-w/2+w*(i+.5)/n,.8,d/2+.012,'#6b6e70',.4,.6);},
  sink(g,w,d,c){B.cab(g,w,d,c);bx(g,Math.min(.6,w-.2),.012,d-.2,0,.892,.02,'#b7bec2',.3,.8);cyl(g,.015,.22,0,1.0,-d/2+.08,STEEL,{r:.3,m:.8});bx(g,.015,.015,.14,0,1.1,-d/2+.15,STEEL,.3,.8);},
  hob(g,w,d,c){B.cab(g,w,d,c);for(const sx of[-1,1])for(const sz of[-1,1])cyl(g,.075,.012,sx*w*.22,.893,sz*d*.2,'#1c1d1f',{r:.4});},
  over(g,w,d,c){bx(g,w,.7,d,0,1.8,0,c,.6);const n=Math.max(1,Math.round(w/.45));for(let i=1;i<n;i++)bx(g,.01,.65,.01,-w/2+w*i/n,1.8,d/2+.003,shade(c,.6));},
  fridge(g,w,d){bx(g,w,1.75,d,0,.875,0,'#cfd4d7',.4,.5);bx(g,w-.02,.01,.01,0,1.15,d/2+.003,'#8d9296');bx(g,.02,.5,.03,-w/2+.07,1.45,d/2+.02,'#8d9296',.4,.6);bx(g,.02,.4,.03,-w/2+.07,.75,d/2+.02,'#8d9296',.4,.6);},
  washer(g,w,d){bx(g,w,.85,d,0,.425,0,'#f1f2f2',.5);cyl(g,.25,.02,0,.42,d/2+.005,'#d6d9da',{rx:Math.PI/2,r:.4});cyl(g,.2,.02,0,.42,d/2+.012,'#2f3539',{rx:Math.PI/2,r:.2});bx(g,w-.1,.05,.01,0,.78,d/2+.003,'#9ea5a8',.4,.4);},
  wc(g,w,d){bx(g,w*.95,.4,.16,0,.6,-d/2+.1,'#f4f4f2',.3);cyl(g,.19,.4,0,.2,.05,'#f4f4f2',{rt:.16,sz:1.5,r:.3});cyl(g,.19,.03,0,.43,.05,'#ecece8',{sz:1.5,r:.3});},
  vanity(g,w,d,c){bx(g,w,.8,d,0,.4,0,c,.6);bx(g,w+.01,.03,d+.01,0,.815,0,'#e4e1db',.35);cyl(g,.17,.02,0,.835,0,'#fafafa',{sz:.8,r:.2});
    cyl(g,.012,.16,0,.9,-d/2+.06,STEEL,{r:.3,m:.8});bx(g,w*.8,.7,.02,0,1.5,-d/2+.01,'#cfe0e6',.1,.8);},
  shower(g,w,d){bx(g,w,.05,d,0,.025,0,'#e9eaea',.3);bx(g,w,2.0,.012,0,1.05,d/2-.01,'#cfe6ee',.1,0,GLASS);bx(g,.012,2.0,d,w/2-.01,1.05,0,'#cfe6ee',.1,0,GLASS);
    cyl(g,.012,1.1,-w/2+.08,1.15,-d/2+.08,STEEL,{r:.3,m:.8});cyl(g,.09,.012,-w/2+.08,2.05,-d/2+.08,STEEL,{r:.3,m:.8});},
  dresser(g,w,d,c){bx(g,w,.85,d,0,.425,0,c,.6);for(let k=1;k<3;k++)bx(g,w-.03,.008,.01,0,k*.283,d/2+.003,shade(c,.6));for(let k=0;k<3;k++)bx(g,.14,.014,.02,0,.14+k*.283,d/2+.012,'#6b6e70',.4,.6);},
  sideb(g,w,d,c){bx(g,w,.7,d,0,.45,0,c,.6);for(const sx of[-1,1])for(const sz of[-1,1])bx(g,.04,.1,.04,sx*(w/2-.06),.05,sz*(d/2-.05),shade(c,.6),.6);const n=Math.max(2,Math.round(w/.5));for(let i=1;i<n;i++)bx(g,.01,.64,.01,-w/2+w*i/n,.45,d/2+.003,shade(c,.6));},
  island(g,w,d,c){bx(g,w-.1,.76,d-.3,0,.48,-.08,c,.6);bx(g,w,.04,d,0,.88,0,'#e4e1db',.35);bx(g,w-.1,.1,d-.34,0,.05,-.08,'#3b3e40',.9);},
  bathtub(g,w,d){bx(g,w,.55,d,0,.275,0,'#f4f4f2',.3);bx(g,w-.14,.02,d-.14,0,.56,0,'#dfe9ec',.2);cyl(g,.012,.14,-w/2+.12,.62,0,STEEL,{r:.3,m:.8});},
  ottoman(g,w,d,c){bx(g,w,.4,d,0,.2,0,c,.95);bx(g,w-.04,.04,d-.04,0,.42,0,shade(c,1.06),.95);},
  stool(g,w,d,c){cyl(g,w/2,.05,0,.68,0,c,{r:.8});for(const a of[0,2.1,4.2])cyl(g,.015,.66,Math.cos(a)*w*.28,.33,Math.sin(a)*w*.28,'#3a3d3f',{r:.5});},
  pantry(g,w,d,c){bx(g,w,2.1,d,0,1.05,0,c,.6);const n=Math.max(1,Math.round(w/.5));for(let i=1;i<n;i++)bx(g,.01,2.0,.01,-w/2+w*i/n,1.05,d/2+.003,shade(c,.6));bx(g,w,.01,.01,0,1.05,d/2+.003,shade(c,.6));for(let i=0;i<n;i++)bx(g,.014,.3,.02,-w/2+w*(i+.5)/n+.05,1.0,d/2+.012,'#6b6e70',.4,.6);},
  pendant(g,w,d,c){cyl(g,.006,.6,0,CH-.3,0,'#2b2e31');cyl(g,w*.5,.24,0,CH-.7,0,c,{rt:.07,r:.6,seg:28});const b=new THREE.Mesh(new THREE.SphereGeometry(.06,12,8),LAMPMAT);b.position.set(0,CH-.76,0);g.add(b);},
  ceilL(g,w,d,c){cyl(g,w/2,.05,0,CH-.025,0,c,{r:.5,seg:32});const l=new THREE.Mesh(new THREE.CylinderGeometry(w/2-.04,w/2-.04,.01,32),LAMPMAT);l.position.set(0,CH-.055,0);g.add(l);},
  flampL(g,w,d,c){cyl(g,.14,.03,0,.015,0,'#3a3d3f',{r:.5});cyl(g,.01,1.45,0,.75,0,'#3a3d3f',{r:.4,m:.5});cyl(g,.17,.3,0,1.55,0,c,{rt:.12,r:.9,seg:24});const b=new THREE.Mesh(new THREE.SphereGeometry(.05,10,8),LAMPMAT);b.position.set(0,1.5,0);g.add(b);},
  fan(g,w,d,c){cyl(g,.07,.12,0,CH-.06,0,'#e9e8e5',{r:.5});cyl(g,.02,.18,0,CH-.15,0,'#d6d3cd');cyl(g,.1,.1,0,CH-.3,0,'#e9e8e5',{r:.5});const l=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.02,18),LAMPMAT);l.position.set(0,CH-.36,0);g.add(l);
    for(let i=0;i<4;i++){const a=i*Math.PI/2,bl=bx(g,w/2-.12,.012,.14,0,CH-.2,0,c,.7);bl.position.set(Math.cos(a)*(w/4+.02),CH-.2,Math.sin(a)*(w/4+.02));bl.rotation.y=-a;}},
  wlight(g,w,d,c){bx(g,w,.14,.015,0,1.8,-d/2+.0075,'#3a3d3f',.5,.4);const b=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,w*.8,14,1,false,0,Math.PI),LAMPMAT);b.rotation.z=Math.PI/2;b.rotation.y=Math.PI/2;b.position.set(0,1.8,-d/2+.06);g.add(b);},
  trap(g,w,d){cyl(g,w/2,.012,0,.006,0,'#7d8386',{r:.4,m:.6});cyl(g,w/2-.02,.014,0,.007,0,'#aeb4b7',{r:.4,m:.6});},
  duct(g,w,d,c){bx(g,w,CH,d,0,CH/2,0,c,.9);bx(g,w*.5,.3,.01,0,1.0,d/2+.003,shade(c,.8),.9);},
  socket(g,w,d){bx(g,.09,.09,.02,0,.3,-d/2+.01,'#f4f4f2',.4);bx(g,.03,.03,.01,0,.3,-d/2+.025,'#2a2d2f',.5);},
  wpoint(g,w,d){bx(g,.1,.1,.02,0,.6,-d/2+.01,'#cfd8dc',.4,.4);cyl(g,.015,.1,0,.6,-d/2+.07,'#3f8fd2',{rx:Math.PI/2,r:.4});},

  bunk(g,w,d,c){const h=1.65;for(const sx of[-1,1])for(const sz of[-1,1])bx(g,.06,h,.06,sx*(w/2-.03),h/2,sz*(d/2-.03),WOOD,.7);
    for(const y of[.35,1.15]){bx(g,w-.1,.12,d-.1,0,y,0,WOOD,.7);bx(g,w-.14,.16,d-.16,0,y+.14,0,'#f3f1ec',.95);bx(g,w-.16,.06,d*.5,0,y+.24,d*.2,c,.95);bx(g,w*.7,.1,.3,0,y+.28,-d/2+.3,'#faf9f6',.95);}
    bx(g,w-.1,.3,.03,0,1.5,d/2-.03,WOOD,.7);bx(g,.04,1.2,.04,w/2-.05,.6,d/2-.2,WOOD,.7);for(let k=0;k<4;k++)bx(g,.03,.03,.28,w/2-.05,.2+k*.28,d/2-.12,WOOD,.7);},
  cot(g,w,d,c){bx(g,w,.04,d,0,.35,0,'#f3f1ec',.95);for(const sx of[-1,1])for(let i=0;i<9;i++)bx(g,.015,.55,.015,sx*(w/2-.01),.65,-d/2+.06+i*(d-.12)/8,c,.7);for(const sz of[-1,1])for(let i=0;i<6;i++)bx(g,.015,.55,.015,-w/2+.06+i*(w-.12)/5,.65,sz*(d/2-.01),c,.7);legs(g,w,d,.34,.04,c,.02);},
  wardS(g,w,d,c){bx(g,w,2.4,d,0,1.2,0,c,.6);const n=Math.max(2,Math.round(w/.9));for(let i=0;i<n;i++){bx(g,w/n-.02,2.3,.02,-w/2+w*(i+.5)/n,1.2,d/2+.01+(i%2?.02:0),shade(c,i%2?.92:1.04),.5);}
    for(let i=1;i<n;i++)bx(g,.02,.5,.03,-w/2+w*i/n,1.1,d/2+.05,'#6b6e70',.4,.6);},
  dress(g,w,d,c){bx(g,w,.04,d,0,.75,0,c,.55);legs(g,w,d,.73,.05,shade(c,.7));bx(g,w*.5,.3,d-.04,-w*.22,.6,0,shade(c,.9),.6);bx(g,.5,.9,.03,0,1.25,-d/2+.015,'#cfe0e6',.1,.8);bx(g,.4,.4,.4,w*.0,.2,d*.6,'#e8dcc4',.9);},
  bookc(g,w,d,c){bx(g,w,2.0,d,0,1,0,c,.6);for(let k=0;k<6;k++)bx(g,w-.06,.025,d-.03,0,.2+k*.33,.01,shade(c,1.08),.6);const cols=['#8a9a7b','#c89a82','#8aa0ad','#d9d3c5','#7a5a43'];
    for(let k=0;k<5;k++){let x=-w/2+.06;for(let j=0;j<Math.floor((w-.12)/.07);j++){const bw=.035+((j*7+k*3)%4)*.01;bx(g,bw,.22+((j+k)%3)*.04,d*.7,x+bw/2,.22+k*.33+.12,.02,cols[(j+k)%5],.8);x+=bw+.01;}}},
  lsofa(g,w,d,c){const a=.16,sd=.9;bx(g,w,.22,d,0,.11,0,shade(c,.6),.9);bx(g,w-sd,.16,sd-.22,-sd/2,.30,d/2-sd/2+.11-.11,c,.95);bx(g,sd-.22,.16,d-.22,w/2-sd/2,.30,.11-.0,c,.95);
    bx(g,w,.45,.22,0,.45,-d/2+.11,c,.95);bx(g,.22,.45,d,-w/2+.11,.45,0,c,.95);bx(g,.22,.28,sd,w/2-.11,.36,d/2-sd/2,c,.95);
    for(let i=0;i<3;i++)bx(g,(w-.5)/3-.04,.36,.15,-w/2+.35+(i+.5)*(w-.5)/3,.64,-d/2+.3,shade(c,1.08),.95);},
  recl(g,w,d,c){bx(g,w,.24,d,0,.12,0,shade(c,.6),.9);bx(g,w-.3,.2,d-.3,0,.34,.1,c,.95);bx(g,w,.7,.25,0,.6,-d/2+.12,c,.95);bx(g,.16,.4,d-.2,-w/2+.08,.42,.05,c,.95);bx(g,.16,.4,d-.2,w/2-.08,.42,.05,c,.95);bx(g,w-.4,.12,.3,0,.2,d/2-.05,shade(c,.9),.95);},
  tvwall(g,w,d,c){bx(g,w,.4,d,0,.2,0,c,.6);bx(g,w*.3,2.0,d,-w/2+w*.15,1.0,0,shade(c,.9),.6);bx(g,w*.3,2.0,d,w/2-w*.15,1.0,0,shade(c,.9),.6);bx(g,w*.4,.5,.04,0,1.15,-d/2+.04,'#101213',.25);bx(g,w*.4,.04,d,0,1.6,0,shade(c,.8),.6);},
  sidet(g,w,d,c){cyl(g,Math.min(w,d)/2,.03,0,.5,0,c,{r:.5});cyl(g,.02,.48,0,.25,0,'#3a3d3f',{r:.4});cyl(g,.15,.02,0,.01,0,'#3a3d3f',{r:.4});},
  consol(g,w,d,c){bx(g,w,.04,d,0,.8,0,c,.55);legs(g,w,d,.78,.04,shade(c,.7),.04);bx(g,w-.1,.02,d-.06,0,.3,0,shade(c,.9),.6);},
  disp(g,w,d,c){bx(g,w,1.9,d,0,.95,0,c,.6);bx(g,w-.1,1.1,.01,0,1.3,d/2+.003,'#cfe6ee',.1,0,GLASS);for(let k=0;k<4;k++)bx(g,w-.1,.015,d-.06,0,.9+k*.28,0,'#e8e6e0',.4);bx(g,w-.04,.7,.02,0,.4,d/2+.01,shade(c,.92),.6);},
  pouf(g,w,d,c){cyl(g,w/2,.4,0,.2,0,c,{rt:w/2-.03,r:.95,seg:28});},
  roundt(g,w,d,c){cyl(g,w/2,.04,0,.75,0,c,{r:.5,seg:32});cyl(g,.07,.7,0,.37,0,shade(c,.7),{r:.5});cyl(g,.25,.03,0,.015,0,shade(c,.7),{r:.5});
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.4,cg=new THREE.Group();B.chair(cg,.44,.44,'#d7cfc0');cg.position.set(Math.cos(a)*(w/2+.12),0,Math.sin(a)*(w/2+.12));cg.rotation.y=-a-Math.PI/2;g.add(cg);}},
  bar(g,w,d,c){bx(g,w,1.05,d,0,.525,0,c,.6);bx(g,w+.1,.04,d+.15,0,1.07,.05,'#e4e1db',.35);},
  fridgeL(g,w,d){bx(g,w,1.8,d,0,.9,0,'#cfd4d7',.4,.5);bx(g,.01,1.75,.01,0,.9,d/2+.003,'#7d8286');bx(g,w-.02,.01,.01,0,.65,d/2+.003,'#7d8286');for(const sx of[-1,1])bx(g,.02,.6,.03,sx*.04,1.1,d/2+.02,'#8d9296',.4,.6);},
  oventw(g,w,d,c){bx(g,w,2.1,d,0,1.05,0,c,.6);bx(g,w-.1,.55,.02,0,1.35,d/2+.005,'#1c1d1f',.2);bx(g,w-.1,.4,.02,0,.85,d/2+.005,'#1c1d1f',.2);bx(g,w-.1,.03,.02,0,1.7,d/2+.012,'#6b6e70',.4,.6);},
  dishw(g,w,d){bx(g,w,.82,d,0,.41,0,'#d9dcde',.4,.4);bx(g,w-.04,.08,.01,0,.76,d/2+.003,'#2f3539',.3);bx(g,w*.7,.015,.02,0,.65,d/2+.01,'#8d9296',.4,.6);},
  hood(g,w,d,c){bx(g,w,.12,d,0,1.9,0,'#c4cacc',.4,.6);bx(g,w*.35,.7,d*.5,0,2.3,-d*.2,'#c4cacc',.4,.6);},
  corner(g,w,d,c){bx(g,w,.1,d-.04,0,.05,-.02,'#3b3e40',.9);bx(g,w,.76,d-.02,0,.48,0,c,.6);bx(g,w+.015,.04,d+.015,0,.87,0,'#e4e1db',.35);bx(g,.01,.7,.01,0,.5,d/2+.003,shade(c,.6));for(const sx of[-1,1])bx(g,.14,.014,.02,sx*.1,.8,d/2+.012,'#6b6e70',.4,.6);},
  dvanity(g,w,d,c){bx(g,w,.8,d,0,.4,0,c,.6);bx(g,w+.01,.03,d+.01,0,.815,0,'#e4e1db',.35);for(const sx of[-1,1]){cyl(g,.17,.02,sx*w*.25,.835,0,'#fafafa',{sz:.8,r:.2});cyl(g,.012,.16,sx*w*.25,.9,-d/2+.06,STEEL,{r:.3,m:.8});}bx(g,w*.85,.7,.02,0,1.5,-d/2+.01,'#cfe0e6',.1,.8);},
  towel(g,w,d){bx(g,w,.02,.02,0,1.2,-d/2+.06,STEEL,.3,.8);for(const sx of[-1,1])bx(g,.02,.02,.06,sx*(w/2-.02),1.2,-d/2+.03,STEEL,.3,.8);bx(g,w*.6,.5,.03,0,1.0,-d/2+.08,'#e8e6e0',.95);},
  mirror(g,w,d,c){bx(g,w,.9,.03,0,1.5,-d/2+.015,c,.5);bx(g,w-.06,.84,.01,0,1.5,-d/2+.035,'#cfe0e6',.05,.9);},
  heater(g,w,d){cyl(g,w/2,.5,0,1.65,0,'#f0f0ee',{r:.4,seg:20});cyl(g,.03,.2,w*.2,1.3,0,STEEL,{r:.4,m:.6});},
  shoeb(g,w,d,c){bx(g,w,.04,d,0,.5,0,c,.6);bx(g,w,.05,d,0,.03,0,shade(c,.7),.6);for(const sx of[-1,1])bx(g,.04,.5,d,sx*(w/2-.02),.25,0,c,.6);for(let i=0;i<3;i++){bx(g,.16,.08,.3,-w/2+.2+i*.22,.1,0,'#3a3d3f',.8);}bx(g,w,.08,d,0,.53,0,'#c89a82',.95);},
  mat(g,w,d,c){bx(g,w,.012,d,0,.006,0,c,1).castShadow=false;},
  curtain(g,w,d,c){bx(g,w,.02,.03,0,2.3,0,STEEL,.4,.6);const n=Math.max(4,Math.round(w/.18));for(let i=0;i<n;i++)bx(g,w/n*.8,2.25,.04+((i%2)*.03),-w/2+w*(i+.5)/n,1.15,((i%2)*.015),c,.95);},
  blinds(g,w,d,c){bx(g,w,.08,d,0,2.2,0,'#e8e6e0',.5);for(let i=0;i<14;i++)bx(g,w-.04,.012,d,0,2.1-i*.09,0,c,.7);},
  art(g,w,d,c){bx(g,w,.7,.03,0,1.5,-d/2+.015,'#3a3d3f',.5);bx(g,w-.06,.64,.01,0,1.5,-d/2+.035,c,.8);bx(g,w*.4,.3,.012,w*.1,1.5,-d/2+.045,shade(c,.7),.8);},
  tv(g,w,d,c){bx(g,w,w*.56,.04,0,1.3,-d/2+.02,'#101213',.25);bx(g,w-.04,w*.56-.04,.01,0,1.3,-d/2+.045,'#1a2a35',.1,.4);},
  bplant(g,w,d,c){cyl(g,.2,.45,0,.22,0,'#c9b9a6',{rt:.22,r:.8});for(let i=0;i<6;i++){const a=i*1.05;sph(g,.28,Math.cos(a)*.18,1.0+(i%3)*.25,Math.sin(a)*.18,['#4f6d4a','#5d7b57','#6b8a63'][i%3],1,1.2,1);}cyl(g,.03,.8,0,.8,0,'#6b5a45',{r:.9});},
  rack(g,w,d,c){for(const sx of[-1,1])bx(g,.03,1.2,d,sx*(w/2-.015),.6,0,'#9aa2a6',.4,.6);for(let i=0;i<5;i++)bx(g,w,.02,.02,0,1.15,-d/2+.1+i*(d-.2)/4,'#cfd4d7',.4,.6);bx(g,w*.8,.5,d*.6,0,1.0,0,'#d9d3c5',.95);},
  dlamp(g,w,d,c){cyl(g,.1,.02,0,.01,0,'#3a3d3f',{r:.5});bx(g,.015,.35,.015,0,.2,0,'#3a3d3f',.4,.6);cyl(g,.1,.12,0,.42,0,c,{rt:.06,r:.9});},
  piano(g,w,d,c){bx(g,w,1.1,d,0,.55,0,c,.35);bx(g,w,.04,d+.15,0,.82,.08,'#f4f4f2',.4);for(let i=0;i<24;i++)bx(g,.012,.015,.12,-w/2+.08+i*(w-.16)/23,.855,d/2+.1,'#101213',.4);bx(g,.5,.4,.4,0,.2,d/2+.35,shade(c,.8),.5);},
  stairs(g,w,d,c,it){const H=(it&&it.h)||2.6,n=Math.max(3,Math.round(H/.17)),rh=H/n,tr=d/n;for(let i=0;i<n;i++)bx(g,w,rh,tr*(n-i),0,i*rh+rh/2,d/2-tr*(n-i)/2,c,.7);
    for(const sx of[-1,1])bx(g,.04,.9,d,sx*(w/2),.45+H/2,0,'#3a3d3f',.5,.4).rotation.x=0;},
  aircon(g,w,d){bx(g,w,.3,d,0,2.15,0,'#f3f5f5',.4);bx(g,w-.1,.015,.012,0,2.05,d/2+.002,'#c4cacc',.5);bx(g,.03,.012,.01,w/2-.07,2.22,d/2+.002,'#59c27a',.5);}
};
const CAT={
  bed_q:{n:'Queen bed',g:'Bedroom',w:1.6,d:2.05,c:'#d9d3c5',b:B.bed},
  bed_k:{n:'King bed',g:'Bedroom',w:1.9,d:2.05,c:'#8a9a7b',b:B.bed},
  bed_s:{n:'Single bed',g:'Bedroom',w:1.0,d:2.0,c:'#8aa0ad',b:B.bed},
  ward:{n:'Wardrobe',g:'Bedroom',w:2.0,d:.6,c:'#b9a58a',b:B.ward,k:1},
  bside:{n:'Bedside table',g:'Bedroom',w:.45,d:.4,c:'#b9a58a',b:B.bside},
  desk:{n:'Desk',g:'Bedroom',w:1.2,d:.6,c:'#b9a58a',b:B.desk},
  chair:{n:'Chair',g:'Bedroom',w:.45,d:.45,c:'#8a9a7b',b:B.chair},
  sofa:{n:'3-seat sofa',g:'Living',w:2.2,d:.95,c:'#8aa0ad',b:B.sofa},
  arm:{n:'Armchair',g:'Living',w:.85,d:.85,c:'#c89a82',b:B.sofa},
  coffee:{n:'Coffee table',g:'Living',w:1.1,d:.6,c:'#b9a58a',b:B.coffee},
  tvc:{n:'TV console',g:'Living',w:1.8,d:.4,c:'#b9a58a',b:B.tvc,k:1},
  dining:{n:'Dining set',g:'Living',w:1.5,d:1.3,c:'#b9a58a',b:B.dining},
  shelf:{n:'Shelf unit',g:'Living',w:.9,d:.3,c:'#b9a58a',b:B.shelf,k:1},
  shoe:{n:'Shoe cabinet',g:'Living',w:1.0,d:.35,c:'#f0eee9',b:B.shoe,k:1},
  rug:{n:'Rug',g:'Living',w:2.4,d:1.6,c:'#d9d3c5',b:B.rug,flat:1},
  plant:{n:'Plant',g:'Living',w:.4,d:.4,c:'#8a9a7b',b:B.plant},
  cab:{n:'Base cabinet',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:B.cab,k:1},
  sink:{n:'Sink cabinet',g:'Kitchen',w:1.0,d:.6,c:'#f0eee9',b:B.sink,k:1},
  hob:{n:'Hob cabinet',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:B.hob,k:1},
  over:{n:'Overhead cabinet',g:'Kitchen',w:.9,d:.35,c:'#f0eee9',b:B.over,k:1,elev:1},
  fridge:{n:'Fridge',g:'Kitchen',w:.7,d:.7,c:'#d9d3c5',b:B.fridge},
  washer:{n:'Washer',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:B.washer},
  wc:{n:'Toilet',g:'Bathroom',w:.4,d:.7,c:'#f0eee9',b:B.wc},
  vanity:{n:'Vanity & basin',g:'Bathroom',w:.6,d:.45,c:'#b9a58a',b:B.vanity,k:1},
  shower:{n:'Shower',g:'Bathroom',w:.9,d:.9,c:'#f0eee9',b:B.shower},
  aircon:{n:'Air-con unit',g:'Other',w:.9,d:.25,c:'#f0eee9',b:B.aircon,elev:1},
  bunk:{n:'Bunk bed',g:'Bedroom',w:1.0,d:2.0,c:'#8aa0ad',b:B.bunk},
  cot:{n:'Baby cot',g:'Bedroom',w:.7,d:1.3,c:'#f0eee9',b:B.cot},
  wardS:{n:'Sliding wardrobe',g:'Bedroom',w:2.4,d:.65,c:'#d9d3c5',b:B.wardS,k:1},
  dress:{n:'Dressing table',g:'Bedroom',w:1.0,d:.45,c:'#f0eee9',b:B.dress},
  bookc:{n:'Bookcase',g:'Bedroom',w:.9,d:.3,c:'#b9a58a',b:B.bookc,k:1},
  lsofa:{n:'L-shaped sofa',g:'Living',w:2.7,d:1.7,c:'#8aa0ad',b:B.lsofa},
  recl:{n:'Recliner',g:'Living',w:.85,d:.9,c:'#7a5a43',b:B.recl},
  tvwall:{n:'TV wall unit',g:'Living',w:2.6,d:.4,c:'#b9a58a',b:B.tvwall,k:1},
  sidet:{n:'Side table',g:'Living',w:.5,d:.5,c:'#b9a58a',b:B.sidet},
  consol:{n:'Console table',g:'Living',w:1.2,d:.35,c:'#b9a58a',b:B.consol},
  disp:{n:'Display cabinet',g:'Living',w:1.0,d:.4,c:'#b9a58a',b:B.disp,k:1},
  pouf:{n:'Pouf',g:'Living',w:.5,d:.5,c:'#c89a82',b:B.pouf},
  roundt:{n:'Round dining set',g:'Living',w:1.1,d:1.1,c:'#b9a58a',b:B.roundt},
  piano:{n:'Piano',g:'Living',w:1.5,d:.6,c:'#2b2e31',b:B.piano},
  bplant:{n:'Large plant',g:'Living',w:.6,d:.6,c:'#8a9a7b',b:B.bplant},
  tv:{n:'Wall TV',g:'Living',w:1.2,d:.1,c:'#101213',b:B.tv,elev:1},
  art:{n:'Wall art',g:'Living',w:.8,d:.05,c:'#8aa0ad',b:B.art,elev:1},
  mat:{n:'Door mat',g:'Living',w:.8,d:.5,c:'#7a5a43',b:B.mat,flat:1},
  curtain:{n:'Curtain',g:'Living',w:2.0,d:.1,c:'#cfd8c8',b:B.curtain,elev:1},
  blinds:{n:'Roller blind',g:'Living',w:1.5,d:.1,c:'#d9d3c5',b:B.blinds,elev:1},
  fridgeL:{n:'Double-door fridge',g:'Kitchen',w:.9,d:.75,c:'#d9d3c5',b:B.fridgeL},
  oventw:{n:'Oven tower',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:B.oventw,k:1},
  dishw:{n:'Dishwasher',g:'Kitchen',w:.6,d:.6,c:'#d9dcde',b:B.dishw},
  hood:{n:'Cooker hood',g:'Kitchen',w:.9,d:.5,c:'#c4cacc',b:B.hood,elev:1},
  corner:{n:'Corner cabinet',g:'Kitchen',w:.9,d:.6,c:'#f0eee9',b:B.corner,k:1},
  dvanity:{n:'Double vanity',g:'Bathroom',w:1.2,d:.5,c:'#b9a58a',b:B.dvanity,k:1},
  towel:{n:'Towel rail',g:'Bathroom',w:.6,d:.1,c:'#9aa2a6',b:B.towel,elev:1},
  mirror:{n:'Mirror',g:'Bathroom',w:.6,d:.05,c:'#9aa2a6',b:B.mirror,elev:1},
  heater:{n:'Water heater',g:'Bathroom',w:.35,d:.35,c:'#f0f0ee',b:B.heater,elev:1,wet:1},
  shoeb:{n:'Shoe bench',g:'Other',w:1.0,d:.35,c:'#b9a58a',b:B.shoeb},
  rack:{n:'Laundry rack',g:'Other',w:1.2,d:.5,c:'#d9d3c5',b:B.rack},
  dlamp:{n:'Desk lamp',g:'Lighting',w:.2,d:.2,c:'#e8dcc4',b:B.dlamp,lamp:1,ly:()=>.5},
  stairs:{n:'Straight stairs',g:'Other',w:.9,d:3.0,c:'#b9a58a',b:B.stairs},
  dresser:{n:'Chest of drawers',g:'Bedroom',w:.9,d:.45,c:'#b9a58a',b:B.dresser},
  ottoman:{n:'Ottoman',g:'Living',w:.6,d:.6,c:'#c89a82',b:B.ottoman},
  sideb:{n:'Sideboard',g:'Living',w:1.6,d:.4,c:'#b9a58a',b:B.sideb,k:1},
  island:{n:'Kitchen island',g:'Kitchen',w:1.6,d:.9,c:'#f0eee9',b:B.island,k:1},
  pantry:{n:'Tall pantry',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:B.pantry,k:1},
  stool:{n:'Bar stool',g:'Kitchen',w:.38,d:.38,c:'#b9a58a',b:B.stool},
  bathtub:{n:'Bathtub',g:'Bathroom',w:1.5,d:.72,c:'#f0eee9',b:B.bathtub,wet:1},
  pendant:{n:'Pendant lamp',g:'Lighting',w:.45,d:.45,c:'#d9d3c5',b:B.pendant,lamp:1,ly:H=>H-.8,top:1},
  ceilL:{n:'Ceiling light',g:'Lighting',w:.5,d:.5,c:'#f4f4f2',b:B.ceilL,lamp:1,ly:H=>H-.25,top:1},
  flampL:{n:'Floor lamp',g:'Lighting',w:.35,d:.35,c:'#e8dcc4',b:B.flampL,lamp:1,ly:()=>1.5},
  fan:{n:'Ceiling fan',g:'Lighting',w:1.1,d:1.1,c:'#b9a58a',b:B.fan,lamp:1,ly:H=>H-.45,top:1},
  wlight:{n:'Wall light',g:'Lighting',w:.3,d:.1,c:'#3a3d3f',b:B.wlight,lamp:1,ly:()=>1.75,elev:1},
  trap:{n:'Floor trap',g:'Services',w:.15,d:.15,c:'#7d8386',b:B.trap,flat:1,svc:1,wet:1},
  wpoint:{n:'Water point',g:'Services',w:.12,d:.08,c:'#cfd8dc',b:B.wpoint,svc:1,wet:1,elev:1},
  socket:{n:'Power socket',g:'Services',w:.1,d:.06,c:'#f4f4f2',b:B.socket,svc:1,elev:1},
  duct:{n:'Pipe duct',g:'Services',w:.5,d:.4,c:'#cfcac0',b:B.duct,svc:1}
};
['wc','shower','vanity','sink','washer'].forEach(k=>CAT[k].wet=1);
const GROUPS=['Bedroom','Living','Kitchen','Bathroom','Lighting','Services','Other'];

/* ───────── state ───────── */
let S=null, sel=null, tool='select', rtab='inspect', mode='orbit', cut=true;
let undoS=[], redoS=[];
let walk={x:5,y:7.4,yaw:0,pitch:-.02};
let under=null,underSrc='',snapG=.1,calib=null;
let ms=[],freeAng=false,flush=true,clip=null,polyDraft=null,marq=null,gidn=1;
const FINS={paint:'Paint',tile:'Tile',wood:'Timber',concrete:'Concrete'};
const LAYERS=[['furn','Furniture'],['labels','Labels'],['dims','Dimensions'],['grid','Grid']];

function sample(){
  const walls=[],openings=[],rooms=[],items=[];
  const W=(x1,y1,x2,y2)=>walls.push({id:uid(),x1,y1,x2,y2,fin:'paint',col:'',str:false});
  W(0,0,11,0);W(11,0,11,8);W(11,8,0,8);W(0,8,0,0);
  W(3.4,0,3.4,3.6);W(6.6,0,6.6,3.6);W(0,3.6,11,3.6);W(2.2,3.6,2.2,8);W(0,5.6,2.2,5.6);W(9.2,3.6,9.2,8);W(9.2,5.6,11,5.6);
  const R=(n,x,y,w,h,f)=>rooms.push({id:uid(),name:n,x,y,w,h,floor:f});
  R('Bedroom 2',0,0,3.4,3.6,'oak');R('Bedroom 3',3.4,0,3.2,3.6,'oak');R('Master Bedroom',6.6,0,4.4,3.6,'oak');
  R('Common Bath',0,3.6,2.2,2,'tile');R('Kitchen',0,5.6,2.2,2.4,'tile');R('Living & Dining',2.2,3.6,7,4.4,'oak');
  R('Master Bath',9.2,3.6,1.8,2,'tile');R('Service Yard',9.2,5.6,1.8,2.4,'tile');
  const D=(axis,c,p,w,flip)=>openings.push({id:uid(),kind:'door',axis,c,p,w,flip});
  const N=(axis,c,p,w,wt)=>openings.push({id:uid(),kind:'window',axis,c,p,w,wt});
  D('h',3.6,2.9,.8,-1);D('h',3.6,4.2,.8,-1);D('h',3.6,7.9,.8,-1);D('h',3.6,10.1,.75,1);
  D('v',2.2,4.4,.75,-1);D('v',2.2,6.6,.9,-1);D('v',9.2,6.6,.8,1);D('h',8,5.0,1.0,-1);
  N('h',0,1.7,1.5,'std');N('h',0,5.0,1.5,'std');N('h',0,8.8,1.8,'std');N('h',8,7.4,2.4,'tall');
  N('v',0,4.6,.5,'high');N('v',0,6.9,1.0,'std');N('v',11,4.6,.5,'high');N('v',11,6.8,1.0,'std');
  const I=(type,x,y,rot,w,d,c)=>{const k=CAT[type];items.push({id:uid(),type,x,y,rot,w:w||k.w,d:d||k.d,color:c||k.c});};
  // Bedroom 2
  I('bed_q',1.1,1.9,270);I('bside',.28,.88,270);I('bside',.28,2.92,270);I('ward',3.04,1.5,90);I('desk',2.2,.38,0,1.2,.6);I('chair',2.2,.92,180);
  // Bedroom 3
  I('bed_s',5.52,2.4,90);I('bside',6.34,1.62,90);I('ward',3.76,1.2,270,1.8);I('desk',4.75,.38,0);I('chair',4.75,.92,180);
  // Master
  I('bed_k',8.8,1.09,0,1.9);I('bside',7.55,.27,0);I('bside',10.05,.27,0);I('ward',6.96,1.9,270,2.4);I('rug',8.8,1.9,0,2.6,1.9,'#d9d3c5');I('plant',10.65,3.3,0);I('aircon',10.35,.2,0);
  // Common bath
  I('wc',.5,4.0,0);I('vanity',1.05,3.9,0);I('shower',.51,5.09,270);
  // Master bath
  I('wc',9.7,4.0,0);I('vanity',10.5,3.9,0);I('shower',10.49,5.15,90);
  // Kitchen
  I('fridge',.42,6.0,270);I('sink',.36,6.85,270,1.0);I('hob',.36,7.65,270,.6);I('cab',1.4,7.64,180,1.4);I('cab',1.8,7.64,180,.6);
  // Yard
  I('washer',10.6,7.65,0);
  // Living / dining
  I('tvc',8.94,5.2,270,1.8);I('rug',7.3,5.2,90,2.6,2.0,'#d9d3c5');I('sofa',6.0,5.2,270,2.4,.95);I('coffee',7.4,5.2,90);
  I('shelf',9.0,7.55,270);I('dining',3.6,6.4,0,1.6,1.3);I('shoe',6.3,7.77,180);I('plant',2.6,7.6,0);I('aircon',5.2,3.8,0);
  return {name:'4-room sample',H:2.6,wallColor:'#f2f0eb',walls,rooms,openings,items,dims:[],layers:{furn:1,labels:1,dims:1,grid:1}};
}
function blank(w,d){
  const walls=[],W=(x1,y1,x2,y2)=>walls.push({id:uid(),x1,y1,x2,y2,fin:'paint',col:'',str:false});
  W(0,0,w,0);W(w,0,w,d);W(w,d,0,d);W(0,d,0,0);
  return {name:'My flat',H:2.6,wallColor:'#f2f0eb',walls,
    rooms:[{id:uid(),name:'Room',x:0,y:0,w,h:d,floor:'oak'}],
    openings:[{id:uid(),kind:'door',axis:'h',c:d,p:sn(w/2,.05),w:1.0,flip:-1}],items:[],dims:[],layers:{furn:1,labels:1,dims:1,grid:1}};
}
function ensureModelCat(i){if(typeof i.type!=='string'||!/^m:[\w-]+$/.test(i.type))return false;
  CAT[i.type]={n:'Missing model',g:'My models',w:+i.w||1,d:+i.d||1,h:+i.h||.5,c:'#c9b9a6',m:1,missing:1,b:(g,w,d,c,it)=>{const h=(it&&it.h)||.5;bx(g,w,h,d,0,h/2,0,'#c9b9a6',.9,0,{transparent:true,opacity:.5});}};return true;}
function emptyDesign(){return {name:'My flat',H:2.6,wallColor:WALLS[0],walls:[],rooms:[],openings:[],items:[],dims:[],layers:{furn:1,labels:1,dims:1,grid:1}};}
function loadState(o){
  const n={name:String(o.name||'My flat').slice(0,60),H:clamp(+o.H||2.6,2.2,3.2),wallColor:o.wallColor||WALLS[0],
    walls:(o.walls||[]).map(w=>({id:w.id||uid(),x1:+w.x1,y1:+w.y1,x2:+w.x2,y2:+w.y2,fin:FINS[w.fin]?w.fin:'paint',col:typeof w.col==='string'?w.col:'',str:!!w.str,th:(+w.th>=.06&&+w.th<=.4)?+(+w.th).toFixed(3):0})).filter(w=>[w.x1,w.y1,w.x2,w.y2].every(isFinite)&&Math.hypot(w.x2-w.x1,w.y2-w.y1)>.05),
    rooms:(o.rooms||[]).map(r=>{const q={id:r.id||uid(),name:String(r.name||'Room').slice(0,40),x:+r.x,y:+r.y,w:+r.w,h:+r.h,floor:FLOORS[r.floor]?r.floor:'oak'};
      if(Array.isArray(r.pts)&&r.pts.length>=3){const p=r.pts.map(a=>[+a[0],+a[1]]);if(p.every(a=>isFinite(a[0])&&isFinite(a[1]))){q.pts=p;syncBox(q);}}return q;}).filter(r=>[r.x,r.y,r.w,r.h].every(isFinite)&&r.w>0&&r.h>0),
    dims:(o.dims||[]).map(d=>({id:d.id||uid(),x1:+d.x1,y1:+d.y1,x2:+d.x2,y2:+d.y2,o:isFinite(+d.o)?+d.o:.5})).filter(d=>[d.x1,d.y1,d.x2,d.y2].every(isFinite)&&Math.hypot(d.x2-d.x1,d.y2-d.y1)>.05),
    views:(Array.isArray(o.views)?o.views:[]).filter(v=>v&&Array.isArray(v.a)).slice(0,24).map(v=>({id:v.id||uid(),n:String(v.n||'View').slice(0,40),m:v.m==='walk'?'walk':'orbit',a:[+v.a[0]||0,+v.a[1]||0,+v.a[2]||0,+v.a[3]||0,+v.a[4]||0].map(x=>+x.toFixed(3))})).filter(v=>Array.isArray(v.a)),
    layers:Object.assign({furn:1,labels:1,dims:1,grid:1},o.layers||{}),prices:Object.fromEntries(Object.entries(o.prices||{}).filter(([k,v])=>typeof v==='number'&&isFinite(v)&&v>=0)),extras:(o.extras||[]).map(x=>({id:x.id||uid(),name:String(x.name||'').slice(0,40),amt:Math.max(0,+x.amt||0)})),budget:Math.max(0,+o.budget||0),cid:typeof o.cid==='string'?o.cid:'',base:o.base&&typeof o.base==='object'?o.base:null,skirt:!!o.skirt,skirtCol:typeof o.skirtCol==='string'?o.skirtCol:'#f4f2ee',ceilCol:typeof o.ceilCol==='string'?o.ceilCol:'#f8f7f4',
    openings:(o.openings||[]).map(p=>({id:p.id||uid(),kind:p.kind==='window'?'window':'door',axis:p.axis==='v'?'v':'h',c:+p.c,p:+p.p,w:clamp(+p.w||.9,.4,5),flip:p.flip===undefined?-1:(p.flip<0?-1:1),wt:WTYPES[p.wt]?p.wt:'std',dt:DTYPES[p.dt]?p.dt:'single'})),
    items:(o.items||[]).filter(i=>CAT[i.type]||ensureModelCat(i)).map(i=>({id:i.id||uid(),type:i.type,x:+i.x,y:+i.y,rot:+i.rot||0,w:clamp(+i.w||CAT[i.type].w,.1,8),d:clamp(+i.d||CAT[i.type].d,.1,8),color:i.color||CAT[i.type].c,g:i.g||0,h:+i.h>0?+i.h:0,mt:['wood','fabric','leather','metal','gloss'].includes(i.mt)?i.mt:'',nm:typeof i.nm==='string'?i.nm.slice(0,40):'',pr:(+i.pr>0&&+i.pr<1e7)?+(+i.pr).toFixed(2):0}))};
  let m=0;[...n.walls,...n.rooms,...n.openings,...n.items,...n.dims].forEach(e=>{const k=+String(e.id).replace(/\D/g,'');if(k>m)m=k;});uidn=Math.max(uidn,m+1);
  return n;
}
const getE=(t,id)=>S&&({room:S.rooms,wall:S.walls,open:S.openings,item:S.items,dim:S.dims}[t]||[]).find(e=>e.id===id);
const checkpoint=()=>{undoS.push(JSON.stringify(S));if(undoS.length>100)undoS.shift();redoS=[];};
function undo(){if(!undoS.length)return;redoS.push(JSON.stringify(S));S=JSON.parse(undoS.pop());fixSel();changed();}
function redo(){if(!redoS.length)return;undoS.push(JSON.stringify(S));S=JSON.parse(redoS.pop());fixSel();changed();}
function fixSel(){if(sel&&!getE(sel.t,sel.id))sel=null;ms=ms.filter(m=>getE(m.t,m.id));if(ms.length<2)ms=[];}
let saveT=0;
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem('flatstudio.v1',JSON.stringify(S));localStorage.setItem('flatstudio.summary',JSON.stringify(budgetSummary()));}catch(e){}},500);}
function changed(o={}){dirty3=true;dirty=true;render2D();if(o.ui!==false)renderRight();updUndo();save();}
function mut(fn){checkpoint();fn();changed();}
function select(t,id){ms=[];sel=t?{t,id}:null;if(t&&rtab!=='inspect')rtab='inspect';
  if(t==='item'){const it=getE('item',id);if(it&&it.g){const m=S.items.filter(x=>x.g===it.g).map(x=>({t:'item',id:x.id}));if(m.length>1){ms=m;sel=null;}}}
  dirty3=true;dirty=true;render2D();renderRight();}
function setMulti(list){if(list.length<2){ms=[];sel=list[0]||null;}else{ms=list;sel=null;}dirty3=true;dirty=true;render2D();renderRight();}
const inMs=(t,id)=>ms.some(m=>m.t===t&&m.id===id);
function updUndo(){$('#bUndo').disabled=!undoS.length;$('#bRedo').disabled=!redoS.length;}

/* ───────── geometry helpers ───────── */
function wallInfo(w){
  const T=w.th||.12;
  if(w.x1!==w.x2&&w.y1!==w.y2){const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.hypot(dx,dy);return {axis:'a',a:0,b:len,c:0,ops:[],segs:[[-T/2,len+T/2]],ang:Math.atan2(dy,dx),len,th:T};}
  const axis=w.y1===w.y2?'h':'v';
  const a=axis==='h'?Math.min(w.x1,w.x2):Math.min(w.y1,w.y2), b=axis==='h'?Math.max(w.x1,w.x2):Math.max(w.y1,w.y2), c=axis==='h'?w.y1:w.x1;
  const ops=S.openings.filter(o=>o.axis===axis&&Math.abs(o.c-c)<.011&&o.p>a-.01&&o.p<b+.01).sort((m,n)=>m.p-n.p);
  const segs=[];let cur=a-T/2;
  for(const o of ops){const lo=o.p-o.w/2,hi=o.p+o.w/2;if(lo>cur+1e-4)segs.push([cur,lo]);cur=Math.max(cur,hi);}
  if(b+T/2>cur+1e-4)segs.push([cur,b+T/2]);
  return {axis,a,b,c,ops,segs,th:T};
}
function bounds(){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  const add=(x,y)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
  S.walls.forEach(w=>{add(w.x1,w.y1);add(w.x2,w.y2);});S.rooms.forEach(r=>{add(r.x,r.y);add(r.x+r.w,r.y+r.h);});
  if(x0>1e8){x0=y0=0;x1=y1=6;}
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0,cx:(x0+x1)/2,cy:(y0+y1)/2};
}
function nearestWall(p,w){
  let best=null,bd=.5;
  for(const wl of S.walls){const wi=wallInfo(wl);if(wi.axis==='a'||wi.b-wi.a<w+.3)continue;
    const along=wi.axis==='h'?p.x:p.y,off=Math.abs((wi.axis==='h'?p.y:p.x)-wi.c);
    if(along<wi.a-.2||along>wi.b+.2)continue;
    if(off<bd){bd=off;best={axis:wi.axis,c:wi.c,p:clamp(sn(along,.05),wi.a+.15+w/2,wi.b-.15-w/2)};}}
  return best;
}
function rpts(r){return r.pts||[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];}
function rarea(r){if(!r.pts)return r.w*r.h;let a=0;const p=r.pts;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return Math.abs(a)/2;}
const area=r=>rarea(r);
function syncBox(r){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;r.pts.forEach(q=>{x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);});r.x=x0;r.y=y0;r.w=x1-x0;r.h=y1-y0;}
function rcent(r){const p=rpts(r);let a=0,cx=0,cy=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],f=p[i][0]*q[1]-q[0]*p[i][1];a+=f;cx+=(p[i][0]+q[0])*f;cy+=(p[i][1]+q[1])*f;}
  if(Math.abs(a)<1e-6)return {x:r.x+r.w/2,y:r.y+r.h/2};return {x:cx/(3*a),y:cy/(3*a)};}
function pip(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;}return c;}
function pruneOps(){S.openings=S.openings.filter(o=>S.walls.some(w=>{const wi=wallInfo(w);return wi.axis===o.axis&&Math.abs(wi.c-o.c)<.011&&o.p>wi.a-.01&&o.p<wi.b+.01;}));}
function dpSimp(p,eps){if(p.length<3)return p;const a=p[0],b=p[p.length-1];let md=-1,mi=0;const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1e-9;
  for(let i=1;i<p.length-1;i++){const d=Math.abs((p[i][0]-a[0])*dy-(p[i][1]-a[1])*dx)/L;if(d>md){md=d;mi=i;}}
  if(md>eps){const l=dpSimp(p.slice(0,mi+1),eps),r=dpSimp(p.slice(mi),eps);return l.slice(0,-1).concat(r);}return [a,b];}
/* flood-fill room detection: returns polygon points (metres) or null */
function detectRoom(p){
  if(!S.walls.length)return null;const b=bounds(),g=.05,ox=b.x0-1,oy=b.y0-1,nx=Math.ceil((b.w+2)/g)+1,ny=Math.ceil((b.h+2)/g)+1;if(nx*ny>2.5e6)return null;
  const wl=new Uint8Array(nx*ny);
  for(const w of S.walls){const x0=Math.max(0,Math.floor((Math.min(w.x1,w.x2)-.06-ox)/g)),x1=Math.min(nx-1,Math.ceil((Math.max(w.x1,w.x2)+.06-ox)/g)),y0=Math.max(0,Math.floor((Math.min(w.y1,w.y2)-.06-oy)/g)),y1=Math.min(ny-1,Math.ceil((Math.max(w.y1,w.y2)+.06-oy)/g));
    const dx=w.x2-w.x1,dy=w.y2-w.y1,L2=dx*dx+dy*dy||1;
    for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){const px=ox+(i+.5)*g,py=oy+(j+.5)*g;let t=((px-w.x1)*dx+(py-w.y1)*dy)/L2;t=t<0?0:t>1?1:t;const qx=w.x1+t*dx-px,qy=w.y1+t*dy-py;if(qx*qx+qy*qy<=.002)wl[j*nx+i]=1;}}
  const si=Math.floor((p.x-ox)/g),sj=Math.floor((p.y-oy)/g);if(si<0||sj<0||si>=nx||sj>=ny||wl[sj*nx+si])return null;
  const reg=new Uint8Array(nx*ny),st=[sj*nx+si];reg[st[0]]=1;let n=0;
  while(st.length){const c=st.pop();n++;const i=c%nx,j=(c-i)/nx;if(i===0||j===0||i===nx-1||j===ny-1)return null;
    for(const d of [c-1,c+1,c-nx,c+nx])if(!wl[d]&&!reg[d]){reg[d]=1;st.push(d);}}
  if(n*g*g<.5)return null;
  const E=[],byS=new Map(),W1=nx+1,key=(i,j)=>j*W1+i,add=(a,b,c,d)=>{const k=key(a,b);E.push([a,b,c,d,0]);(byS.get(k)||byS.set(k,[]).get(k)).push(E.length-1);};
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){if(!reg[j*nx+i])continue;
    if(!reg[(j-1)*nx+i])add(i,j,i+1,j);if(!reg[j*nx+i+1])add(i+1,j,i+1,j+1);if(!reg[(j+1)*nx+i])add(i+1,j+1,i,j+1);if(!reg[j*nx+i-1])add(i,j+1,i,j);}
  let best=null,ba=0;
  for(let e0=0;e0<E.length;e0++){if(E[e0][4])continue;const loop=[];let e=e0;
    while(e!==undefined&&!E[e][4]){E[e][4]=1;loop.push([E[e][0],E[e][1]]);const nk=key(E[e][2],E[e][3]);const cand=byS.get(nk)||[];e=cand.find(q=>!E[q][4]);}
    let a=0;for(let i=0;i<loop.length;i++){const q=loop[(i+1)%loop.length];a+=loop[i][0]*q[1]-q[0]*loop[i][1];}a=Math.abs(a);if(a>ba){ba=a;best=loop;}}
  if(!best||best.length<4)return null;
  let pts=best.filter((q,i)=>{const a=best[(i+best.length-1)%best.length],c=best[(i+1)%best.length];return (q[0]-a[0])*(c[1]-q[1])-(q[1]-a[1])*(c[0]-q[0])!==0;});
  let far=0,fd=-1;pts.forEach((q,i)=>{const d=Math.hypot(q[0]-pts[0][0],q[1]-pts[0][1]);if(d>fd){fd=d;far=i;}});
  const A=pts.slice(0,far+1),B=pts.slice(far).concat([pts[0]]);let sp=dpSimp(A,1.2).slice(0,-1).concat(dpSimp(B,1.2).slice(0,-1));
  sp=sp.filter((q,i)=>{const a=sp[(i+sp.length-1)%sp.length],c=sp[(i+1)%sp.length];const cr=(q[0]-a[0])*(c[1]-q[1])-(q[1]-a[1])*(c[0]-q[0]);const l=Math.hypot(q[0]-a[0],q[1]-a[1])*Math.hypot(c[0]-q[0],c[1]-q[1])||1;return Math.abs(cr/l)>.05;});
  if(sp.length<3)return null;
  const xs=[],ys=[];S.walls.forEach(w=>{xs.push(w.x1,w.x2);ys.push(w.y1,w.y2);});
  const snp=(v,arr)=>{let bv=null,bd=.11;for(const c of arr){const d=Math.abs(c-v);if(d<bd){bd=d;bv=c;}}return bv!==null?bv:+(Math.round(v/.05)*.05).toFixed(3);};
  let out=sp.map(q=>[snp(ox+q[0]*g,xs),snp(oy+q[1]*g,ys)]);
  out=out.filter((q,i)=>{const a=out[(i+out.length-1)%out.length];return q[0]!==a[0]||q[1]!==a[1];});
  return out.length>=3?out:null;
}
function addRoomFromPts(pts){
  const r={id:uid(),name:'Room',floor:'oak'};
  const xs=[...new Set(pts.map(q=>q[0]))],ys=[...new Set(pts.map(q=>q[1]))];
  if(pts.length===4&&xs.length===2&&ys.length===2){r.x=Math.min(...xs);r.y=Math.min(...ys);r.w=Math.abs(xs[1]-xs[0]);r.h=Math.abs(ys[1]-ys[0]);}
  else{r.pts=pts.map(q=>[q[0],q[1]]);syncBox(r);}
  if(r.w<.3||r.h<.3)return null;S.rooms.push(r);return r;}

/* ───────── 2D plan ───────── */
const svg=$('#plan');
let view={cx:5.5,cy:4,s:60}, ghost=null, draft=null;
const COARSE=(()=>{try{return matchMedia('(pointer:coarse)').matches;}catch(e){return false;}})(),HR=COARSE?.2:.11,HW=COARSE?.55:.3;
function snapC(v,ax){let best=null,bd=Math.min(.15,9/view.s);const chk=c=>{const d=Math.abs(c-v);if(d<bd){bd=d;best=c;}};
  for(const w of S.walls){chk(ax==='x'?w.x1:w.y1);chk(ax==='x'?w.x2:w.y2);}
  for(const r of S.rooms){if(ax==='x'){chk(r.x);chk(r.x+r.w);}else{chk(r.y);chk(r.y+r.h);}}
  return best!==null?best:sn(v,snapG);}
function autoRoom(p){let L=-1e9,R=1e9,U=-1e9,D=1e9;
  for(const w of S.walls){const wi=wallInfo(w);
    if(wi.axis==='v'){if(p.y>wi.a&&p.y<wi.b){if(wi.c<=p.x)L=Math.max(L,wi.c);else R=Math.min(R,wi.c);}}
    else if(p.x>wi.a&&p.x<wi.b){if(wi.c<=p.y)U=Math.max(U,wi.c);else D=Math.min(D,wi.c);}}
  if([L,R,U,D].some(v=>Math.abs(v)>1e8)||R-L<.6||D-U<.6)return null;return {x:L,y:U,w:R-L,h:D-U};}
function fitImage(){if(!under)return;const W=svg.clientWidth||800,Hh=svg.clientHeight||600;view.s=clamp(Math.min(W/(under.w*1.08),Hh/(under.h*1.08)),15,300);view.cx=under.x+under.w/2;view.cy=under.y+under.h/2;render2D();}
function fit(){
  if(under&&under.show&&!S.walls.length&&!S.rooms.length){fitImage();return;}
  const b=bounds(),W=svg.clientWidth||800,Hh=svg.clientHeight||600;
  view.s=clamp(Math.min(W/(b.w+2.2),Hh/(b.h+2.2)),15,300);view.cx=b.cx;view.cy=b.cy;render2D();
}
function toM(e){const r=svg.getBoundingClientRect();return {x:view.cx+(e.clientX-r.left-r.width/2)/view.s,y:view.cy+(e.clientY-r.top-r.height/2)/view.s};}
function zoomAt(px,py,ns){const r=svg.getBoundingClientRect();const ox=px-r.left-r.width/2,oy=py-r.top-r.height/2;
  const wx=view.cx+ox/view.s,wy=view.cy+oy/view.s;view.s=clamp(ns,15,300);view.cx=wx-ox/view.s;view.cy=wy-oy/view.s;render2D();}
const isSel=(t,id)=>(sel&&sel.t===t&&sel.id===id)||inMs(t,id);
function render2D(){if(!S)return;const r=planMarkup(false);svg.setAttribute('viewBox',r.vb);svg.innerHTML=r.h;renderUnder();}
function planMarkup(ex){
  const sl=(t,id)=>ex?false:isSel(t,id);
  let s,vw,vh,x0,y0;
  if(ex){const b=bounds();s=60;x0=b.x0-1.8;y0=b.y0-1.5;vw=b.w+3.6;vh=b.h+3.0;}
  else{const W=svg.clientWidth||800,Hh=svg.clientHeight||600;s=view.s;vw=W/s;vh=Hh/s;x0=view.cx-vw/2;y0=view.cy-vh/2;}
  const vb=`${x0} ${y0} ${vw} ${vh}`;
  let h='';
  // grid
  let g1='',g5='';
  for(let x=Math.floor(x0);x<=x0+vw;x++){const d=`M${x} ${y0}V${y0+vh}`;if(x%5===0)g5+=d;else g1+=d;}
  for(let y=Math.floor(y0);y<=y0+vh;y++){const d=`M${x0} ${y}H${x0+vw}`;if(y%5===0)g5+=d;else g1+=d;}
  if(S.layers.grid&&!ex)h+=`<path class="gl" d="${g1}"/><path class="gl5" d="${g5}"/>`;
  // rooms
  for(const r of S.rooms){
    h+=`<g data-t="room" data-id="${r.id}">${r.pts?`<polygon class="room${sl('room',r.id)?' on':''}" points="${r.pts.map(q=>q[0]+','+q[1]).join(' ')}" style="fill:${FLOORS[r.floor].c}"/>`:`<rect class="room${sl('room',r.id)?' on':''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" style="fill:${FLOORS[r.floor].c}"/>`}</g>`;
  }
  // overall dimensions
  const bd=bounds();
  if(S.walls.length&&S.layers.dims){
    const dy=bd.y0-.7,dx=bd.x0-.7;
    h+=`<path class="dim" d="M${bd.x0} ${dy-.1}V${dy+.1}M${bd.x1} ${dy-.1}V${dy+.1}M${bd.x0} ${dy}H${bd.x1}M${dx-.1} ${bd.y0}H${dx+.1}M${dx-.1} ${bd.y1}H${dx+.1}M${dx} ${bd.y0}V${bd.y1}"/>`;
    h+=`<text class="dimt" x="${bd.cx}" y="${dy-.1}">${bd.w.toFixed(2)} m</text><text class="dimt" transform="translate(${dx-.1} ${bd.cy}) rotate(-90)">${bd.h.toFixed(2)} m</text>`;
  }
  if(S.layers.dims)for(const d of S.dims)h+=dimSvg(d,sl('dim',d.id));
  // walls
  const opsDrawn=[];
  for(const w of S.walls){
    const wi=wallInfo(w),on=sl('wall',w.id),T=wi.th;
    if(wi.axis==='a'){const c=Math.cos(wi.ang),sn_=Math.sin(wi.ang),h2=T/2,P=(u,v)=>`${w.x1+c*u-sn_*v},${w.y1+sn_*u+c*v}`;
      h+=`<polygon class="wall${on?' on':''}" points="${P(-h2,-h2)} ${P(wi.len+h2,-h2)} ${P(wi.len+h2,h2)} ${P(-h2,h2)}"/>`;}
    else for(const [a,b] of wi.segs)h+=wi.axis==='h'?`<rect class="wall${on?' on':''}" x="${a}" y="${wi.c-T/2}" width="${b-a}" height="${T}"/>`:`<rect class="wall${on?' on':''}" x="${wi.c-T/2}" y="${a}" width="${T}" height="${b-a}"/>`;
    if(!ex)h+=`<line class="hit" data-t="wall" data-id="${w.id}" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" style="stroke-width:${HW}px;vector-effect:none"/>`;
    if(on&&sel&&sel.id===w.id){const mx=(w.x1+w.x2)/2,my=(w.y1+w.y2)/2;
      h+=`<circle class="handle" data-t="we" data-id="${w.id}" data-c="1" cx="${w.x1}" cy="${w.y1}" r="${HR}"/><circle class="handle" data-t="we" data-id="${w.id}" data-c="2" cx="${w.x2}" cy="${w.y2}" r="${HR}"/><circle class="handle" data-t="wm" data-id="${w.id}" cx="${mx}" cy="${my}" r=".13"/>`;}
    else if(on)h+=`<circle class="handle" cx="${w.x1}" cy="${w.y1}" r=".06" style="pointer-events:none"/><circle class="handle" cx="${w.x2}" cy="${w.y2}" r=".06" style="pointer-events:none"/>`;
    if(w.str)h+=`<line class="strw" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}"/>`;
    wi.ops.forEach(o=>opsDrawn.push({o,wi}));
  }
  // openings
  for(const {o,wi} of opsDrawn)h+=openingSvg(o,wi.axis,o.c,o.p,sl('open',o.id),false);
  if(ghost&&!ex)h+=openingSvg({kind:tool==='door'?'door':'window',w:ghost.w,flip:-1,id:'ghost'},ghost.axis,ghost.c,ghost.p,false,true);
  // items
  const order=[...S.items].sort((a,b)=>(CAT[a.type].flat?0:CAT[a.type].elev?2:1)-(CAT[b.type].flat?0:CAT[b.type].elev?2:1));
  if(S.layers.furn)for(const it of order){
    const k=CAT[it.type],a=it.rot*Math.PI/180,ext=Math.abs(it.w*Math.cos(a))+Math.abs(it.d*Math.sin(a));
    const fs=Math.min(.15,ext*.9/(k.n.length*.6)),on=sl('item',it.id);
    h+=`<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})" data-t="item" data-id="${it.id}"><rect class="item${k.elev?' elev':''}" x="${-it.w/2}" y="${-it.d/2}" width="${it.w}" height="${it.d}" style="fill:${it.color}"/>`;
    h+=`<path class="front" d="M${-.07} ${it.d/2}L${.07} ${it.d/2}L0 ${it.d/2-.09}Z"/>`;
    if(S.layers.labels&&fs*s>=6.5)h+=`<text class="ilab" style="font-size:${fs}px" transform="rotate(${-it.rot})">${esc(k.n)}</text>`;
    if(on){h+=`<rect class="selbox" x="${-it.w/2-.04}" y="${-it.d/2-.04}" width="${it.w+.08}" height="${it.d+.08}"/>${sel&&sel.id===it.id?`<line class="rotline" x1="0" y1="${-it.d/2-.04}" x2="0" y2="${-it.d/2-.3}"/><circle class="handle" data-t="rot" data-id="${it.id}" cx="0" cy="${-it.d/2-.3}" r=".1"/>`:''}`;}
    h+=`</g>`;
  }
  if(S.layers.labels)for(const r of S.rooms)if(r.w>1.2&&r.h>.9){if(r.pts){const c=rcent(r);h+=`<text class="rname" x="${c.x}" y="${c.y}" text-anchor="middle" style="font-size:.21px">${esc(r.name)}</text><text class="rarea" x="${c.x}" y="${c.y+.22}" text-anchor="middle" style="font-size:.15px">${area(r).toFixed(1)} m²</text>`;}
    else h+=`<text class="rname" x="${r.x+.14}" y="${r.y+.3}" style="font-size:.21px">${esc(r.name)}</text><text class="rarea" x="${r.x+.14}" y="${r.y+.52}" style="font-size:.15px">${area(r).toFixed(1)} m²</text>`;
    if(S.layers.dims&&!r.pts)h+=`<text class="rdim" x="${r.x+r.w/2}" y="${r.y+r.h-.1}" style="font-size:.13px">${r.w.toFixed(2)} × ${r.h.toFixed(2)}</text>`;}
  // selected room handles
  const sr=!ex&&sel&&sel.t==='room'&&getE('room',sel.id);
  if(sr){const cc=sr.pts?rcent(sr):{x:sr.x+sr.w/2,y:sr.y+sr.h/2};
    if(sr.pts){sr.pts.forEach((c,i)=>{const n=sr.pts[(i+1)%sr.pts.length];h+=`<circle class="handle add" data-t="ra" data-id="${sr.id}" data-c="${i}" cx="${(c[0]+n[0])/2}" cy="${(c[1]+n[1])/2}" r=".07"/>`;});
      sr.pts.forEach((c,i)=>{h+=`<circle class="handle" data-t="rv" data-id="${sr.id}" data-c="${i}" cx="${c[0]}" cy="${c[1]}" r="${HR}"/>`;});}
    else [[sr.x,sr.y],[sr.x+sr.w,sr.y],[sr.x+sr.w,sr.y+sr.h],[sr.x,sr.y+sr.h]].forEach((c,i)=>{h+=`<circle class="handle" data-t="rc" data-id="${sr.id}" data-c="${i}" cx="${c[0]}" cy="${c[1]}" r="${HR}"/>`;});
    h+=`<circle class="handle" data-t="rm" data-id="${sr.id}" cx="${cc.x}" cy="${cc.y}" r=".16"/><path d="M${cc.x-.08} ${cc.y}H${cc.x+.08}M${cc.x} ${cc.y-.08}V${cc.y+.08}" stroke="var(--sel)" stroke-width="1.5" style="pointer-events:none"/>`;}
  // drafts
  if(!ex&&draft&&draft.k!=='dim'){h+=draft.k==='wall'?`<line class="draft" x1="${draft.x1}" y1="${draft.y1}" x2="${draft.x2}" y2="${draft.y2}" style="stroke-width:${T}px;vector-effect:none;stroke-dasharray:none;stroke-opacity:.5"/>`:`<rect class="draft" x="${Math.min(draft.x1,draft.x2)}" y="${Math.min(draft.y1,draft.y2)}" width="${Math.abs(draft.x2-draft.x1)}" height="${Math.abs(draft.y2-draft.y1)}"/>`;
    const len=draft.k==='wall'?Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1):0;if(len||draft.typed)h+=`<text class="dimt" x="${(draft.x1+draft.x2)/2}" y="${(draft.y1+draft.y2)/2-.2}">${draft.typed?draft.typed+' m (Enter)':len.toFixed(2)+' m'}</text>`;}
  if(!ex&&draft&&draft.k==='dim'){h+=dimSvg({x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,o:.5,id:'dd'},false,true);}
  if(!ex&&polyDraft&&polyDraft.pts.length){const P=polyDraft.pts,cu=polyDraft.cur;
    h+=`<polyline class="draft" points="${P.map(q=>q[0]+','+q[1]).join(' ')}${cu?' '+cu[0]+','+cu[1]:''}" style="pointer-events:none;fill:none"/>`+P.map((q,i)=>`<circle class="walkc" cx="${q[0]}" cy="${q[1]}" r="${i===0?.13:.07}" style="pointer-events:none"/>`).join('');}
  if(!ex&&marq)h+=`<rect class="draft" x="${Math.min(marq.x1,marq.x2)}" y="${Math.min(marq.y1,marq.y2)}" width="${Math.abs(marq.x2-marq.x1)}" height="${Math.abs(marq.y2-marq.y1)}" style="pointer-events:none"/>`;
  if(!ex&&calib&&calib.length){calib.forEach(c=>{h+=`<circle class="walkc" cx="${c.x}" cy="${c.y}" r=".1" style="pointer-events:none"/>`;});
    if(calib.length===2)h+=`<line class="draft" x1="${calib[0].x}" y1="${calib[0].y}" x2="${calib[1].x}" y2="${calib[1].y}" style="pointer-events:none"/>`;}
  // walk marker
  if(!ex&&mode==='walk'){const fx=-Math.sin(walk.yaw),fy=-Math.cos(walk.yaw),fov=1.0,r=1.1;
    const a1=Math.atan2(fy,fx)-fov/2,a2=Math.atan2(fy,fx)+fov/2;
    h+=`<path class="walkw" d="M${walk.x} ${walk.y}L${walk.x+Math.cos(a1)*r} ${walk.y+Math.sin(a1)*r}A${r} ${r} 0 0 1 ${walk.x+Math.cos(a2)*r} ${walk.y+Math.sin(a2)*r}Z" style="pointer-events:none"/><circle class="walkc" data-t="walk" cx="${walk.x}" cy="${walk.y}" r=".17"/>`;}
  return {h,vb};
}
function dimSvg(d,on,ghost){
  const dx=d.x2-d.x1,dy=d.y2-d.y1,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,nx=-uy*d.o,ny=ux*d.o,ax=d.x1+nx,ay=d.y1+ny,bx=d.x2+nx,by=d.y2+ny;
  let ang=Math.atan2(dy,dx)*180/Math.PI;if(ang>90||ang<-90)ang+=180;
  return `<g ${ghost?'style="pointer-events:none"':`data-t="dim" data-id="${d.id}"`}><path class="dim${on?' on':''}" d="M${d.x1} ${d.y1}L${ax+ux*.05*0} ${ay}M${d.x2} ${d.y2}L${bx} ${by}M${ax} ${ay}L${bx} ${by}M${ax-uy*.08-ux*.08} ${ay+ux*.08-uy*.08}L${ax+uy*.08+ux*.08} ${ay-ux*.08+uy*.08}M${bx-uy*.08-ux*.08} ${by+ux*.08-uy*.08}L${bx+uy*.08+ux*.08} ${by-ux*.08+uy*.08}"/><line class="hit" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" style="stroke-width:.25px;vector-effect:none"/><text class="dimt" transform="translate(${(ax+bx)/2} ${(ay+by)/2-.06}) rotate(${ang})">${L.toFixed(2)} m</text></g>`;}
function renderUnder(){
  const u=$('#planUnder');u.setAttribute('viewBox',svg.getAttribute('viewBox')||'0 0 1 1');
  svg.style.setProperty('--room-op',under&&under.show?'.14':'');
  if(!under||!under.show){if(u.firstChild)u.innerHTML='';underSrc='';return;}
  if(underSrc!==under.src||!$('#uimg')){u.innerHTML='<image id="uimg" preserveAspectRatio="none"></image>';$('#uimg').setAttribute('href',under.src);underSrc=under.src;}
  const im=$('#uimg');im.setAttribute('x',under.x);im.setAttribute('y',under.y);im.setAttribute('width',under.w);im.setAttribute('height',under.h);
  im.setAttribute('opacity',under.op);im.setAttribute('transform',`rotate(${under.rot||0} ${under.x+under.w/2} ${under.y+under.h/2})`);
}
let usT=0;function saveUnder(){clearTimeout(usT);usT=setTimeout(()=>{try{if(under)localStorage.setItem('flatstudio.under',JSON.stringify(under));else localStorage.removeItem('flatstudio.under');}catch(e){}},400);}
function addCalib(p){calib=calib||[];if(calib.length>=2)calib=[];calib.push({x:p.x,y:p.y});render2D();
  if(calib.length===2){if(Math.hypot(calib[1].x-calib[0].x,calib[1].y-calib[0].y)<.05){calib=[];render2D();return;}
    dialog(`<h2>Set the scale</h2><p class="note" style="margin:0 0 12px">How far apart are the two points you clicked, in metres? Use a printed dimension from the plan, for example 3.40.</p>
      <label class="row" style="grid-template-columns:1fr"><span>Real distance (m)</span><input id="cd" type="number" step="0.01" min="0.1" inputmode="decimal"></label><p id="cerr" class="note" style="color:var(--danger)"></p>
      <div class="acts"><button class="btn primary" data-d="scale">Apply</button><button class="btn" data-d="cancel">Cancel</button></div>`);}}
function openingSvg(o,axis,c,p,on,isGhost){
  const lo=p-o.w/2,hi=p+o.w/2,t=T,f=o.flip||-1,w=o.w,tr=axis==='h'?`translate(0 ${c})`:`translate(${c} 0) matrix(0 1 1 0 0 0)`;
  let b='';
  if(isGhost)b+=`<rect class="ghost" x="${lo}" y="${-t/2}" width="${w}" height="${t}"/>`;
  else if(o.kind==='door'){const dt=o.dt||'single',sw=f>0?1:0;
    if(dt==='single')b+=`<line class="dleaf" x1="${lo}" y1="0" x2="${lo}" y2="${f*w}"/><path class="darc" d="M${hi} 0A${w} ${w} 0 0 ${sw} ${lo} ${f*w}"/>`;
    else if(dt==='double'){const h2=w/2;b+=`<line class="dleaf" x1="${lo}" y1="0" x2="${lo}" y2="${f*h2}"/><path class="darc" d="M${lo+h2} 0A${h2} ${h2} 0 0 ${sw} ${lo} ${f*h2}"/><line class="dleaf" x1="${hi}" y1="0" x2="${hi}" y2="${f*h2}"/><path class="darc" d="M${hi-h2} 0A${h2} ${h2} 0 0 ${1-sw} ${hi} ${f*h2}"/>`;}
    else if(dt==='slide')b+=`<rect class="dleaf" x="${lo+.02}" y="${-.045}" width="${w/2+.02}" height=".05" style="fill:var(--paper)"/><path class="darc" d="M${lo+w*.62} ${f*.14}H${hi-.08}M${hi-.16} ${f*.09}L${hi-.08} ${f*.14}L${hi-.16} ${f*.19}"/>`;
    else b+=`<line class="darc" x1="${lo}" y1="0" x2="${hi}" y2="0"/><line class="dleaf" x1="${lo}" y1="${-t/2}" x2="${lo}" y2="${t/2}"/><line class="dleaf" x1="${hi}" y1="${-t/2}" x2="${hi}" y2="${t/2}"/>`;}
  else{const wt=o.wt||'std';b+=`<rect class="wbg" x="${lo}" y="${-t/2}" width="${w}" height="${t}"/>`;
    if(wt==='bay')b+=`<path class="wbay" d="M${lo} 0L${lo} ${f*.45}L${hi} ${f*.45}L${hi} 0"/><line class="wglass" x1="${lo}" y1="${f*.45}" x2="${hi}" y2="${f*.45}"/>`;
    else if(wt==='slide')b+=`<line class="wglass" x1="${lo}" y1="${-.03}" x2="${p+.03}" y2="${-.03}"/><line class="wglass" x1="${p-.03}" y1=".03" x2="${hi}" y2=".03"/>`;
    else if(wt==='high')b+=`<line class="wglass" x1="${lo}" y1="0" x2="${hi}" y2="0" style="stroke-dasharray:.1 .06;vector-effect:none;stroke-width:.03px"/>`;
    else if(wt==='tall')b+=`<line class="wglass" x1="${lo}" y1="${-.025}" x2="${hi}" y2="${-.025}"/><line class="wglass" x1="${lo}" y1=".025" x2="${hi}" y2=".025"/>`;
    else b+=`<line class="wglass" x1="${lo}" y1="0" x2="${hi}" y2="0"/>`;}
  b+=`<rect class="hit" x="${lo}" y="-.2" width="${w}" height=".4" style="vector-effect:none"/>`;
  return `<g class="${on?'sel-o':''}" ${isGhost?'style="pointer-events:none"':`data-t="open" data-id="${o.id}"`}><g transform="${tr}">${b}</g></g>`;
}

/* plan interaction */
const ptrs=new Map();let drag=null,pinch=null;
svg.addEventListener('contextmenu',e=>e.preventDefault());
svg.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,view.s*Math.exp(-e.deltaY*.0015));},{passive:false});
const HOOK=['rot','rc','rm','we','wm','rv','ra','walk'];
const deep=o=>JSON.parse(JSON.stringify(o));
function lockAng(A,q){const dx=q.x-A[0],dy=q.y-A[1];
  if(!freeAng){if(Math.abs(dx)>=Math.abs(dy))return {x:q.x,y:A[1]};return {x:A[0],y:q.y};}
  const a=Math.abs(Math.atan2(dy,dx)*180/Math.PI);if(a<4||a>176)return {x:q.x,y:A[1]};if(Math.abs(a-90)<4)return {x:A[0],y:q.y};return q;}
function flushSnap(it){
  const r=((Math.round(it.rot)%180)+180)%180;if(r!==0&&r!==90)return;
  const hw=(r===0?it.w:it.d)/2,hd=(r===0?it.d:it.w)/2,tol=.1,ab=Math.abs;
  for(const w of S.walls){const wi=wallInfo(w),T=wi.th;if(wi.axis==='a')continue;
    if(wi.axis==='h'){if(it.x+hw<wi.a-.05||it.x-hw>wi.b+.05)continue;const top=wi.c+T/2,bot=wi.c-T/2;
      if(ab(it.y-hd-top)<tol)it.y=top+hd;else if(ab(it.y+hd-bot)<tol)it.y=bot-hd;}
    else{if(it.y+hd<wi.a-.05||it.y-hd>wi.b+.05)continue;const rt=wi.c+T/2,lf=wi.c-T/2;
      if(ab(it.x-hw-rt)<tol)it.x=rt+hw;else if(ab(it.x+hw-lf)<tol)it.x=lf-hw;}}
}
const MULTI=['item','room','wall','dim'];
function toggleMulti(t,id){if(!MULTI.includes(t))return;let list=ms.length?ms.slice():(sel&&MULTI.includes(sel.t)?[sel]:[]);
  const i=list.findIndex(m=>m.t===t&&m.id===id);if(i>=0)list.splice(i,1);else list.push({t,id});setMulti(list);}
function gmStart(p){const list=ms.length?ms:(sel?[sel]:[]);const orig=[],ops=[],seen=new Set();
  for(const m of list){const e=getE(m.t,m.id);if(!e)continue;orig.push({t:m.t,e:deep(e)});
    if(m.t==='wall')for(const o of wallInfo(e).ops)if(!seen.has(o.id)){seen.add(o.id);ops.push({id:o.id,axis:o.axis,c:o.c,p:o.p});}}
  return {k:'gm',sx:p.x,sy:p.y,orig,ops};}
function gmApply(d,dx,dy){
  for(const o of d.orig){const e=getE(o.t,o.e.id);if(!e)continue;
    if(o.t==='item'){e.x=sn(o.e.x+dx,.05);e.y=sn(o.e.y+dy,.05);}
    else if(o.t==='room'){e.x=o.e.x+dx;e.y=o.e.y+dy;if(o.e.pts)e.pts=o.e.pts.map(q=>[q[0]+dx,q[1]+dy]);}
    else{e.x1=o.e.x1+dx;e.y1=o.e.y1+dy;e.x2=o.e.x2+dx;e.y2=o.e.y2+dy;}}
  for(const o of d.ops){const e=getE('open',o.id);if(!e)continue;if(o.axis==='h'){e.p=o.p+dx;e.c=o.c+dy;}else{e.c=o.c+dx;e.p=o.p+dy;}}
}
function polyClick(q){if(!polyDraft)polyDraft={pts:[],cur:null};const P=polyDraft.pts,L=P[P.length-1];
  if(P.length>=3&&(Math.hypot(q.x-P[0][0],q.y-P[0][1])<.2||Math.hypot(q.x-L[0],q.y-L[1])<.06)){polyFinish();return;}
  if(L&&Math.hypot(q.x-L[0],q.y-L[1])<.06)return;P.push([q.x,q.y]);render2D();}
function polyFinish(){const P=polyDraft&&polyDraft.pts;polyDraft=null;
  if(P&&P.length>=3){checkpoint();const r=addRoomFromPts(P);if(r){sel={t:'room',id:r.id};setTool('select');changed();return;}undoS.pop();}render2D();}
function wallJoins(w,wi){const J=[];if(wi.axis==='a')return J;
  for(const o of S.walls){if(o===w)continue;const oi=wallInfo(o);if(oi.axis==='a'||oi.axis===wi.axis)continue;
    for(const [ex,ey] of [[w.x1,w.y1],[w.x2,w.y2]]){if(Math.hypot(o.x1-ex,o.y1-ey)<.02)J.push({w:o,e:1});else if(Math.hypot(o.x2-ex,o.y2-ey)<.02)J.push({w:o,e:2});}}
  return J;}
svg.addEventListener('pointerdown',e=>{
  svg.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];const r=svg.getBoundingClientRect(),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,s:view.s,wx:view.cx+(mx-r.left-r.width/2)/view.s,wy:view.cy+(my-r.top-r.height/2)/view.s};drag=null;draft=null;marq=null;return;}
  const p=toM(e),hit=e.target.closest?e.target.closest('[data-t]'):null,t=hit?hit.dataset.t:null,id=hit?hit.dataset.id:null;
  const pan={k:'pan',sx:e.clientX,sy:e.clientY,cx:view.cx,cy:view.cy,moved:false};
  const q=()=>({x:snapC(p.x,'x'),y:snapC(p.y,'y')});
  if(e.button===1||e.button===2){drag=pan;return;}
  if(tool==='imove'&&under){drag={k:'img',ox:under.x-p.x,oy:under.y-p.y};return;}
  if(tool==='calib'){drag=pan;drag.calib=p;return;}
  if(tool==='wall'){const a=q();drag={k:'wall',x1:a.x,y1:a.y};draft={k:'wall',x1:a.x,y1:a.y,x2:a.x,y2:a.y};return;}
  if(tool==='dim'){const a=q();drag={k:'dim'};draft={k:'dim',x1:a.x,y1:a.y,x2:a.x,y2:a.y};return;}
  if(tool==='poly'){polyClick(q());return;}
  if(tool==='room'){const a=q();drag={k:'room',p};draft={k:'room',x1:a.x,y1:a.y,x2:a.x,y2:a.y};return;}
  if(tool==='door'||tool==='window'){const w=tool==='door'?.9:1.2,n=nearestWall(p,w);
    if(n){checkpoint();const o=tool==='door'?{id:uid(),kind:'door',axis:n.axis,c:n.c,p:n.p,w:.9,flip:-1,dt:'single'}:{id:uid(),kind:'window',axis:n.axis,c:n.c,p:n.p,w:1.2,wt:'std',flip:-1};
      S.openings.push(o);sel={t:'open',id:o.id};ms=[];ghost=null;changed();}
    return;}
  /* select tool */
  if(t==='rv'&&e.shiftKey){const r=getE('room',id);if(r&&r.pts&&r.pts.length>3){checkpoint();r.pts.splice(+hit.dataset.c,1);syncBox(r);changed();}return;}
  if(e.shiftKey&&!HOOK.includes(t)){drag={k:'sbox',t,id,p,sx:e.clientX,sy:e.clientY};return;}
  if(t==='rot'){drag={k:'rot',id};}
  else if(t==='rc'){drag={k:'rc',id,c:+hit.dataset.c};}
  else if(t==='rv'){drag={k:'rv',id,c:+hit.dataset.c};}
  else if(t==='ra'){const r=getE('room',id),i=+hit.dataset.c,A=r.pts[i],B=r.pts[(i+1)%r.pts.length];checkpoint();r.pts.splice(i+1,0,[(A[0]+B[0])/2,(A[1]+B[1])/2]);drag={k:'rv',id,c:i+1,cp:1};changed({ui:false});}
  else if(t==='rm'){const r=getE('room',id);drag={k:'rm',id,ox:r.x-p.x,oy:r.y-p.y};}
  else if(t==='we'){const w=getE('wall',id),wi=wallInfo(w),c=+hit.dataset.c,ex=c===1?w.x1:w.x2,ey=c===1?w.y1:w.y2;
    const J=[];for(const o of S.walls){if(o===w)continue;if(Math.hypot(o.x1-ex,o.y1-ey)<.02)J.push({w:o,e:1});else if(Math.hypot(o.x2-ex,o.y2-ey)<.02)J.push({w:o,e:2});}
    drag={k:'we',id,c,joins:J};}
  else if(t==='wm'){const w=getE('wall',id),wi=wallInfo(w);drag={k:'wm',id,axis:wi.axis,ops:wi.ops,joins:wallJoins(w,wi),o:deep(w),sx:p.x,sy:p.y};}
  else if(t==='walk'){drag={k:'walk'};}
  else if(t==='item'){const it=getE('item',id);if(!isSel('item',id))select('item',id);
    if(ms.length)drag=gmStart(p);else drag={k:'mv',id,ox:it.x-p.x,oy:it.y-p.y};}
  else if((t==='wall'||t==='dim'||t==='room')&&ms.length&&inMs(t,id)){drag=gmStart(p);}
  else if(t==='open'){if(!isSel('open',id))select('open',id);drag={k:'op',id};}
  else if(t==='wall'||t==='dim'){if(!isSel(t,id))select(t,id);drag=pan;}
  else {drag=pan;drag.click=t==='room'?id:null;}
});
svg.addEventListener('pointermove',e=>{
  if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&ptrs.size===2){const [a,b]=[...ptrs.values()],r=svg.getBoundingClientRect(),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;view.s=clamp(pinch.s*(Math.hypot(a.x-b.x,a.y-b.y)||1)/pinch.d,15,300);view.cx=pinch.wx-(mx-r.left-r.width/2)/view.s;view.cy=pinch.wy-(my-r.top-r.height/2)/view.s;render2D();return;}
  const p=toM(e);
  if(!drag){if(tool==='door'||tool==='window'){const w=tool==='door'?.9:1.2,n=nearestWall(p,w);ghost=n?Object.assign(n,{w}):null;render2D();}
    else if(tool==='poly'&&polyDraft){polyDraft.cur=[snapC(p.x,'x'),snapC(p.y,'y')];render2D();}return;}
  switch(drag.k){
    case 'pan':{const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;view.cx=drag.cx-dx/view.s;view.cy=drag.cy-dy/view.s;render2D();break;}
    case 'mv':{if(!drag.cp){checkpoint();drag.cp=1;}const it=getE('item',drag.id);it.x=sn(p.x+drag.ox,.05);it.y=sn(p.y+drag.oy,.05);if(flush&&!e.altKey)flushSnap(it);changed({ui:false});break;}
    case 'gm':{if(!drag.cp){checkpoint();drag.cp=1;}gmApply(drag,sn(p.x-drag.sx,.05),sn(p.y-drag.sy,.05));changed({ui:false});break;}
    case 'rot':{if(!drag.cp){checkpoint();drag.cp=1;}const it=getE('item',drag.id);it.rot=((Math.round((Math.atan2(p.y-it.y,p.x-it.x)*180/Math.PI+90)/15)*15)%360+360)%360;changed({ui:false});break;}
    case 'op':{const o=getE('open',drag.id),n=nearestWall(p,o.w);if(n){if(!drag.cp){checkpoint();drag.cp=1;}o.axis=n.axis;o.c=n.c;o.p=n.p;changed({ui:false});}break;}
    case 'rm':{if(!drag.cp){checkpoint();drag.cp=1;}const r=getE('room',drag.id),nx=sn(p.x+drag.ox,snapG),ny=sn(p.y+drag.oy,snapG),dx=nx-r.x,dy=ny-r.y;
      if(r.pts)r.pts=r.pts.map(q=>[q[0]+dx,q[1]+dy]);r.x=nx;r.y=ny;changed({ui:false});break;}
    case 'rv':{if(!drag.cp){checkpoint();drag.cp=1;}const r=getE('room',drag.id);r.pts[drag.c]=[snapC(p.x,'x'),snapC(p.y,'y')];syncBox(r);changed({ui:false});break;}
    case 'rc':{const r=getE('room',drag.id);if(!drag.cp){checkpoint();drag.cp=1;}
      const ax=drag.c===0||drag.c===3?r.x+r.w:r.x,ay=drag.c<2?r.y+r.h:r.y,q={x:snapC(p.x,'x'),y:snapC(p.y,'y')};
      if(Math.abs(q.x-ax)>=.6){r.x=Math.min(q.x,ax);r.w=Math.abs(q.x-ax);}if(Math.abs(q.y-ay)>=.6){r.y=Math.min(q.y,ay);r.h=Math.abs(q.y-ay);}
      if(drag.c===0||drag.c===3)drag.c=q.x>ax?(drag.c===0?1:2):drag.c;changed({ui:false});break;}
    case 'we':{const w=getE('wall',drag.id);if(!drag.cp){checkpoint();drag.cp=1;}const A=drag.c===1?[w.x2,w.y2]:[w.x1,w.y1];
      const q=lockAng(A,{x:snapC(p.x,'x'),y:snapC(p.y,'y')});if(Math.hypot(q.x-A[0],q.y-A[1])<.3)break;
      if(drag.c===1){w.x1=q.x;w.y1=q.y;}else{w.x2=q.x;w.y2=q.y;}
      for(const j of drag.joins){const ox=j.e===1?j.w.x2:j.w.x1,oy=j.e===1?j.w.y2:j.w.y1;if(Math.abs(ox-q.x)<1e-6||Math.abs(oy-q.y)<1e-6){if(j.e===1){j.w.x1=q.x;j.w.y1=q.y;}else{j.w.x2=q.x;j.w.y2=q.y;}}}
      changed({ui:false});break;}
    case 'wm':{if(!drag.cp){checkpoint();drag.cp=1;}const w=getE('wall',drag.id),o=drag.o;
      if(drag.axis==='h'){const c=snapC(p.y,'y');w.y1=w.y2=c;drag.ops.forEach(x=>x.c=c);drag.joins.forEach(j=>{j.w[j.e===1?'y1':'y2']=c;});}
      else if(drag.axis==='v'){const c=snapC(p.x,'x');w.x1=w.x2=c;drag.ops.forEach(x=>x.c=c);drag.joins.forEach(j=>{j.w[j.e===1?'x1':'x2']=c;});}
      else{const dx=sn(p.x-drag.sx,.05),dy=sn(p.y-drag.sy,.05);w.x1=o.x1+dx;w.y1=o.y1+dy;w.x2=o.x2+dx;w.y2=o.y2+dy;}
      changed({ui:false});break;}
    case 'img':{under.x=p.x+drag.ox;under.y=p.y+drag.oy;render2D();break;}
    case 'walk':{walk.x=p.x;walk.y=p.y;updateWalkCam();render2D();break;}
    case 'wall':{const q=lockAng([drag.x1,drag.y1],{x:snapC(p.x,'x'),y:snapC(p.y,'y')});draft.x2=q.x;draft.y2=q.y;render2D();break;}
    case 'dim':{draft.x2=snapC(p.x,'x');draft.y2=snapC(p.y,'y');render2D();break;}
    case 'sbox':{if(Math.abs(e.clientX-drag.sx)+Math.abs(e.clientY-drag.sy)>5){drag.k='box';marq={x1:drag.p.x,y1:drag.p.y,x2:p.x,y2:p.y};render2D();}break;}
    case 'box':{marq.x2=p.x;marq.y2=p.y;render2D();break;}
    case 'room':{draft.x2=snapC(p.x,'x');draft.y2=snapC(p.y,'y');render2D();break;}
  }
});
function endPtr(e){
  ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;
  if(!drag)return;const d=drag;drag=null;
  if(d.k==='pan'&&!d.moved){if(d.calib)addCalib(d.calib);else if(d.click)select('room',d.click);else if(d.click===null)select(null);}
  else if(d.k==='wall'&&draft){const len=Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1);if(len>=.3){checkpoint();S.walls.push({id:uid(),x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,fin:'paint',col:'',str:false,th:0});}draft=null;changed();}
  else if(d.k==='dim'&&draft){const len=Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1);if(len>=.1){checkpoint();const n={id:uid(),x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,o:.5};S.dims.push(n);sel={t:'dim',id:n.id};ms=[];}draft=null;changed();}
  else if(d.k==='sbox'){if(d.t&&d.id)toggleMulti(d.t,d.id);}
  else if(d.k==='box'){const m=marq;marq=null;const x0=Math.min(m.x1,m.x2),x1=Math.max(m.x1,m.x2),y0=Math.min(m.y1,m.y2),y1=Math.max(m.y1,m.y2),inb=(x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1,list=[];
    if(S.layers.furn)S.items.forEach(i=>{if(inb(i.x,i.y))list.push({t:'item',id:i.id});});
    S.walls.forEach(w=>{if(inb(w.x1,w.y1)&&inb(w.x2,w.y2))list.push({t:'wall',id:w.id});});
    S.rooms.forEach(r=>{const c=rcent(r);if(inb(c.x,c.y))list.push({t:'room',id:r.id});});
    S.dims.forEach(dd=>{if(inb(dd.x1,dd.y1)&&inb(dd.x2,dd.y2))list.push({t:'dim',id:dd.id});});
    setMulti(list);}
  else if(d.k==='img'){saveUnder();}
  else if(d.k==='room'&&draft){const w=Math.abs(draft.x2-draft.x1),h=Math.abs(draft.y2-draft.y1);
    if(w<.3&&h<.3){draft=null;const pts=detectRoom(d.p);
      if(!pts){$('#hint').textContent='That spot is not enclosed by walls. Close the gaps, or drag a rectangle instead.';render2D();return;}
      const ar=rarea({pts}),ex=S.rooms.find(r=>pip(d.p.x,d.p.y,rpts(r))&&Math.abs(rarea(r)-ar)<.05);
      if(ex){select('room',ex.id);return;}
      checkpoint();const r=addRoomFromPts(pts);if(!r){undoS.pop();render2D();return;}sel={t:'room',id:r.id};ms=[];changed();return;}
    if(w>=.8&&h>=.8){checkpoint();const r={id:uid(),name:'Room',x:Math.min(draft.x1,draft.x2),y:Math.min(draft.y1,draft.y2),w,h,floor:'oak'};S.rooms.push(r);sel={t:'room',id:r.id};ms=[];setTool('select');}draft=null;changed();}
  else if(d.k==='we'||d.k==='wm'){if(d.cp){pruneOps();changed();}}
  else if(d.cp||d.k==='walk'){renderRight();}
}
svg.addEventListener('pointerup',endPtr);svg.addEventListener('pointercancel',endPtr);
svg.addEventListener('dblclick',()=>{if(tool==='poly'&&polyDraft)polyFinish();});
svg.addEventListener('pointerleave',()=>{if(ghost){ghost=null;render2D();}});

/* ───────── 3D ───────── */
let renderer,scene,camera,hemi,sun,wallsG,floorG,itemsG,ceilG,slabM,selBox,solids=[],structSig='',itemMap=new Map();
let dirty=true,dirty3=true,last=0;const lampPool=[];let sunC={x:5,z:4,rad:10};
const orb={az:.55,pol:.95,dist:16,tx:5.5,tz:4};
const keys=new Set();
const texBase={};
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeTex(kind){
  const N=512,cv=document.createElement('canvas');cv.width=cv.height=N;const x=cv.getContext('2d'),R=rng(kind.length*977+kind.charCodeAt(0));
  const jit=(hex,a)=>{const c=new THREE.Color(hex);c.offsetHSL((R()-.5)*a*.3,0,(R()-.5)*a);return '#'+c.getHexString();};
  if(kind==='oak'||kind==='walnut'||kind==='vinyl'){
    const base=FLOORS[kind].c,rows=kind==='vinyl'?4:6,rh=N/rows;
    for(let i=0;i<rows;i++){const off=R()*N;for(let k=0;k<2;k++){const x0=(off+256*k)%N;
      const col=jit(base,.09);for(const sx of[x0,x0-N]){x.fillStyle=col;x.fillRect(sx,i*rh,256,rh);
        x.strokeStyle='rgba(60,40,20,.10)';x.lineWidth=1;for(let g=0;g<9;g++){const gy=i*rh+R()*rh;x.beginPath();x.moveTo(sx,gy);x.bezierCurveTo(sx+80,gy+R()*4-2,sx+170,gy+R()*4-2,sx+256,gy+R()*2-1);x.stroke();}
        x.strokeStyle='rgba(50,35,20,.35)';x.strokeRect(sx+.5,i*rh+.5,256,rh);}}}
  }else{
    const n=2,ts=N/n;x.fillStyle=kind==='marble'?'#f0efec':'#d3d7d6';x.fillRect(0,0,N,N);
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){x.fillStyle=jit(FLOORS[kind].c,.03);x.fillRect(i*ts+2,j*ts+2,ts-4,ts-4);
      if(kind==='marble'){x.strokeStyle='rgba(110,118,125,.22)';for(let v=0;v<5;v++){x.lineWidth=.6+R()*2;x.beginPath();let px=i*ts+R()*ts,py=j*ts;x.moveTo(px,py);for(let q=0;q<4;q++){px+=R()*70-35;py+=ts/4;x.lineTo(clamp(px,i*ts+3,i*ts+ts-3),py);}x.stroke();}}}
    x.strokeStyle=kind==='marble'?'#cfcdc8':'#8f9796';x.lineWidth=3;for(let i=0;i<=n;i++){x.beginPath();x.moveTo(i*ts,0);x.lineTo(i*ts,N);x.stroke();x.beginPath();x.moveTo(0,i*ts);x.lineTo(N,i*ts);x.stroke();}
  }
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
function floorTex(k,w,h){if(!texBase[k])texBase[k]=makeTex(k);const t=texBase[k].clone();t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(w/1.2,h/1.2);t.anisotropy=4;return t;}
const grainT={};
function grainTex(kind){if(grainT[kind])return grainT[kind];const N=256,cv=document.createElement('canvas');cv.width=cv.height=N;const x=cv.getContext('2d'),R=rng(kind.length*131);x.fillStyle='#fff';x.fillRect(0,0,N,N);
  if(kind==='wood'){for(let i=0;i<70;i++){const y=R()*N;x.strokeStyle=`rgba(0,0,0,${.05+R()*.1})`;x.lineWidth=.5+R()*1.6;x.beginPath();x.moveTo(0,y);x.bezierCurveTo(N*.3,y+R()*8-4,N*.7,y+R()*8-4,N,y+R()*4-2);x.stroke();}}
  else if(kind==='fabric'){for(let i=0;i<N;i+=2){x.fillStyle=`rgba(0,0,0,${.06+R()*.05})`;x.fillRect(i,0,1,N);x.fillRect(0,i,N,1);}}
  else{for(let i=0;i<4000;i++){x.fillStyle=`rgba(0,0,0,${R()*.07})`;x.fillRect(R()*N,R()*N,1.5,1.5);}}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);return grainT[kind]=t;}
const MTP={wood:{r:.55,m:0,map:'wood'},fabric:{r:1,m:0,map:'fabric'},leather:{r:.5,m:0,map:'leather'},metal:{r:.25,m:.85,map:null},gloss:{r:.12,m:.05,map:null}};
function applyMt(g,it){const p=MTP[it.mt];if(!p)return;const hex=new THREE.Color(it.color).getHexString(),cache={};
  g.traverse(m=>{if(!m.isMesh||!m.material||Array.isArray(m.material)||m.material.transparent)return;if(m.material.color.getHexString()!==hex)return;
    const k=m.material.uuid;if(!cache[k]){cache[k]=new THREE.MeshStandardMaterial({color:it.color,roughness:p.r,metalness:p.m,map:p.map?grainTex(p.map):null});}m.material=cache[k];});}
const wtBase={};
function wallTexBase(kind){const N=512,cv=document.createElement('canvas');cv.width=cv.height=N;const x=cv.getContext('2d'),R=rng(kind.length*313+kind.charCodeAt(1));
  if(kind==='tile'){x.fillStyle='#e9ecea';x.fillRect(0,0,N,N);const tw=128,th=64;for(let j=0;j<N/th;j++)for(let i=-1;i<N/tw;i++){const ox=(j%2)*tw/2;x.fillStyle=`hsl(170 6% ${88+R()*5}%)`;x.fillRect(i*tw+ox+2,j*th+2,tw-4,th-4);}}
  else if(kind==='wood'){const sw=N/10;for(let i=0;i<10;i++){const c=new THREE.Color('#a98a68');c.offsetHSL(0,0,(R()-.5)*.1);x.fillStyle='#'+c.getHexString();x.fillRect(i*sw,0,sw,N);
      x.strokeStyle='rgba(60,40,20,.12)';for(let g=0;g<14;g++){const gx=i*sw+R()*sw;x.beginPath();x.moveTo(gx,0);x.lineTo(gx+R()*4-2,N);x.stroke();}x.fillStyle='rgba(40,28,15,.55)';x.fillRect(i*sw,0,2,N);}}
  else{x.fillStyle='#9a9c9b';x.fillRect(0,0,N,N);for(let k=0;k<5000;k++){x.fillStyle=`rgba(${R()<.5?60:200},${R()<.5?60:200},${R()<.5?60:200},.06)`;x.fillRect(R()*N,R()*N,2+R()*3,2+R()*3);}
    x.strokeStyle='rgba(50,52,52,.35)';x.lineWidth=2;x.strokeRect(1,1,N-2,N-2);}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
function wallFaceMats(w,len,hh){
  const base=mat(w.col||S.wallColor,.95);if(!w.fin||w.fin==='paint')return base;
  if(!wtBase[w.fin])wtBase[w.fin]=wallTexBase(w.fin);const t=wtBase[w.fin].clone();t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(Math.max(.2,len/1.2),Math.max(.2,hh/1.2));
  const fm=new THREE.MeshStandardMaterial({map:t,roughness:w.fin==='tile'?.3:.85});return (w.x1===w.x2&&w.y1!==w.y2)?[fm,fm,base,base,base,base]:[base,base,base,base,fm,fm];}
function disposeG(o){o.traverse(m=>{if(m.geometry&&!m.geometry.userData.shared)m.geometry.dispose();if(m.material&&!m.material.userData.cached&&!m.material.userData.shared){if(m.material.map)m.material.map.dispose();m.material.dispose();}});}
function clearG(g){while(g.children.length){const c=g.children[0];g.remove(c);disposeG(c);}}
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function init3D(){
  if(!HAS3D){$('#noGL').style.display='grid';return;}
  try{renderer=new THREE.WebGLRenderer({canvas:$('#gl'),antialias:true});}catch(e){$('#noGL').style.display='grid';renderer=null;return;}
  renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,1,.05,120);
  try{const es=new THREE.Scene(),sph=new THREE.Mesh(new THREE.SphereGeometry(10,24,16),new THREE.MeshBasicMaterial({side:THREE.BackSide,vertexColors:true})),pos=sph.geometry.attributes.position,cols=[];
    for(let i=0;i<pos.count;i++){const y=pos.getY(i)/10,t=(y+1)/2,c=new THREE.Color('#9aa7ab').lerp(new THREE.Color('#f4f7f8'),Math.pow(t,.8));cols.push(c.r,c.g,c.b);}
    sph.geometry.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));es.add(sph);
    for(const [x,z] of [[-6,-3],[6,-2],[0,7]]){const pn=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide}));pn.position.set(x,5,z);pn.lookAt(0,0,0);es.add(pn);}
    const pm=new THREE.PMREMGenerator(renderer);ENVMAP=pm.fromScene(es,.04).texture;pm.dispose();}catch(e){ENVMAP=null;}
  hemi=new THREE.HemisphereLight(0xffffff,0xb9c3c3,.62*LI);scene.add(hemi);
  sun=new THREE.DirectionalLight(0xfff3e2,.62*LI);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0006;sun.shadow.normalBias=.02;scene.add(sun,sun.target);
  for(let i=0;i<8;i++){const l=new THREE.PointLight(0xffd9a0,0,7,1.6);l.visible=false;scene.add(l);lampPool.push(l);}
  wallsG=new THREE.Group();floorG=new THREE.Group();itemsG=new THREE.Group();ceilG=new THREE.Group();ceilG.visible=false;
  scene.add(floorG,wallsG,itemsG,ceilG);
  slabM=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xc2cccc,roughness:1}));slabM.receiveShadow=true;scene.add(slabM);
  selBox=new THREE.Box3Helper(new THREE.Box3(),0xd98c00);selBox.visible=false;scene.add(selBox);
  applyTheme3D();
  new ResizeObserver(resize3D).observe($('#viewPane'));
  const mq=matchMedia('(prefers-color-scheme: dark)');mq.addEventListener&&mq.addEventListener('change',applyTheme3D);
  new MutationObserver(applyTheme3D).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}
function lampsOn(){return env.lamps==='on'||(env.lamps==='auto'&&(env.hour<6.5||env.hour>18.5));}
function syncLamps(){const on=lampsOn();let i=0;
  for(const it of S.items){const k=CAT[it.type];if(!k||!k.lamp)continue;if(i>=lampPool.length)break;const l=lampPool[i++];l.visible=on;l.intensity=on?1.15*LI:0;l.position.set(it.x,k.ly(S.H),it.y);
    if(k.elev&&!k.top){const a=it.rot*Math.PI/180;l.position.x+=-Math.sin(a)*.25;l.position.z+=Math.cos(a)*.25;}}
  for(;i<lampPool.length;i++){lampPool[i].visible=false;lampPool[i].intensity=0;}
  if(LAMPMAT)LAMPMAT.emissiveIntensity=on?1.3:.05;}
function applyEnv(){if(!renderer)return;const h=env.hour,el=Math.max(0,Math.sin((h-6)/12*Math.PI)),az=((h-6)/12)*Math.PI,night=h<6||h>18;
  const rb=(90+(h-6)/12*180-env.north)*Math.PI/180,dir=[Math.sin(rb)*.9,Math.max(.18,el),-Math.cos(rb)*.9],rad=sunC.rad;sun.position.set(sunC.x+rad*dir[0]*1.1,rad*(.2+1.1*Math.max(.15,el)),sunC.z+rad*dir[2]);sun.target.position.set(sunC.x,0,sunC.z);
  const warm=new THREE.Color('#ffb070').lerp(new THREE.Color('#fff4e5'),clamp(el*2.2,0,1));
  sun.color.copy(night?new THREE.Color('#8fa4d8'):warm);sun.intensity=(night?.12:.12+.8*el)*(mode==='walk'?.85:1)*LI;
  hemi.intensity=(night?.28:.3+.4*el)*(mode==='walk'?1.35:1)*LI;hemi.color.set(night?'#6e7fa8':'#ffffff');
  const day=new THREE.Color(css('--scene')||'#dde6e6'),nt=new THREE.Color('#161d2e'),dusk=new THREE.Color('#e7b793');
  let bg=day;if(h<6||h>18.5)bg=nt;else if(h<7||h>17.5){bg=day.clone().lerp(dusk,.6);}scene.background=bg.clone();
  syncLamps();dirty=true;}
function applyTheme3D(){if(!renderer)return;scene.background=new THREE.Color(css('--scene')||'#dde6e6');slabM.material.color.set(css('--slab')||'#c2cccc');if(sun)applyEnv();dirty=true;}
function resize3D(){if(!renderer)return;const p=$('#viewPane'),w=p.clientWidth,h=p.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
function buildStructure(){
  clearG(wallsG);clearG(floorG);clearG(ceilG);solids.length=0;
  const H=S.H,wm=mat(S.wallColor,.95),b=bounds(),skM=mat(S.skirtCol||'#f4f2ee',.6);
  for(const r of S.rooms){let m;
    if(r.pts){const sh=new THREE.Shape(r.pts.map(q=>new THREE.Vector2(q[0],-q[1])));m=new THREE.Mesh(new THREE.ShapeGeometry(sh),new THREE.MeshStandardMaterial({map:floorTex(r.floor,1.2,1.2),roughness:FLOORS[r.floor].r,side:THREE.DoubleSide}));
      m.rotation.x=-Math.PI/2;m.position.set(0,.001,0);}
    else{m=new THREE.Mesh(new THREE.PlaneGeometry(r.w,r.h),new THREE.MeshStandardMaterial({map:floorTex(r.floor,r.w,r.h),roughness:FLOORS[r.floor].r}));
      m.rotation.x=-Math.PI/2;m.position.set(r.x+r.w/2,.001,r.y+r.h/2);}
    m.receiveShadow=true;floorG.add(m);}
  const frameW=mat('#2d3336',.5,.4),frameD=mat('#b89b78',.7),leafM=mat('#d8c3a0',.7),mainM=mat('#6a5545',.7),glass=mat('#bcd8e2',.1,0,GLASS);
  for(const w of S.walls){
    const wi=wallInfo(w),hz=wi.axis==='h',T=wi.th;
    if(wi.axis==='a'){const [s0,e0]=wi.segs[0],len=e0-s0,mid=(s0+e0)/2,c=Math.cos(wi.ang),sn_=Math.sin(wi.ang);
      const me=new THREE.Mesh(new THREE.BoxGeometry(len,H,T),wallFaceMats(w,len,H));me.position.set(w.x1+c*mid,H/2,w.y1+sn_*mid);me.rotation.y=-wi.ang;me.castShadow=true;me.receiveShadow=true;wallsG.add(me);
      if(S.skirt){const sk=new THREE.Mesh(new THREE.BoxGeometry(len,.1,T+.024),skM);sk.position.set(me.position.x,.05,me.position.z);sk.rotation.y=-wi.ang;sk.receiveShadow=true;wallsG.add(sk);}
      solids.push({cx:me.position.x,cz:me.position.z,hx:len/2,hz:T/2,c,s:sn_});continue;}
    const box=(s,e,y0,y1,m,th=T,solid=true,nc=0)=>{const len=e-s,hh=y1-y0;if(len<1e-3||hh<1e-3)return;
      const me=new THREE.Mesh(hz?new THREE.BoxGeometry(len,hh,th):new THREE.BoxGeometry(th,hh,len),m);const mid=(s+e)/2;
      me.position.set(hz?mid:wi.c+nc,(y0+y1)/2,hz?wi.c+nc:mid);me.castShadow=!m.transparent;me.receiveShadow=true;wallsG.add(me);
      if(solid&&y0<.3)solids.push(hz?{cx:mid,cz:wi.c,hx:len/2,hz:th/2,c:1,s:0}:{cx:wi.c,cz:mid,hx:th/2,hz:len/2,c:1,s:0});};
    for(const [s0,e0] of wi.segs)box(s0,e0,0,H,wallFaceMats(w,e0-s0,H));
    if(S.skirt)for(const [s0,e0] of wi.segs)box(s0,e0,0,.1,skM,T+.024,false);
    for(const o of wi.ops){const lo=o.p-o.w/2,hi=o.p+o.w/2,ang=80*Math.PI/180,f=o.flip||-1;
      const leafRot=hz?-f*ang:-Math.PI/2+f*ang,leafRotM=hz?Math.PI+f*ang:Math.PI/2-f*ang;
      if(o.kind==='door'){const dt=o.dt||'single',dh=dt==='arch'?2.3:DH;
        box(lo,hi,dh,H,wallFaceMats(w,hi-lo,H-dh));
        box(lo,lo+.05,0,dh,frameD,T+.02);box(hi-.05,hi,0,dh,frameD,T+.02);box(lo,hi,dh-.05,dh,frameD,T+.02);
        const mkLeaf=(lw,col)=>{const g=new THREE.Group(),lf=new THREE.Mesh(new THREE.BoxGeometry(lw,2.0,.04),col);lf.position.set(lw/2,1.0,0);lf.castShadow=true;g.add(lf);
          const hd=new THREE.Mesh(new THREE.BoxGeometry(.12,.025,.06),mat('#8d9296',.4,.6));hd.position.set(lw-.1,1.0,0);g.add(hd);return g;};
        if(dt==='single'){const g=mkLeaf(o.w-.1,o.w>=.95?mainM:leafM);if(hz)g.position.set(lo+.05,0,wi.c);else g.position.set(wi.c,0,lo+.05);g.rotation.y=leafRot;wallsG.add(g);}
        else if(dt==='double'){const lw=(o.w-.1)/2;
          const g1=mkLeaf(lw,mainM);if(hz)g1.position.set(lo+.05,0,wi.c);else g1.position.set(wi.c,0,lo+.05);g1.rotation.y=leafRot;wallsG.add(g1);
          const g2=mkLeaf(lw,mainM);if(hz)g2.position.set(hi-.05,0,wi.c);else g2.position.set(wi.c,0,hi-.05);g2.rotation.y=leafRotM;wallsG.add(g2);}
        else if(dt==='slide'){const pw=o.w/2+.02,off=.045*f,mid=lo+pw/2+.02,pm=new THREE.Mesh(hz?new THREE.BoxGeometry(pw,2.0,.035):new THREE.BoxGeometry(.035,2.0,pw),mainM);
          pm.position.set(hz?mid:wi.c+off,1.0,hz?wi.c+off:mid);pm.castShadow=true;wallsG.add(pm);
          const rail=new THREE.Mesh(hz?new THREE.BoxGeometry(o.w,.04,.05):new THREE.BoxGeometry(.05,.04,o.w),mat('#8d9296',.4,.6));rail.position.set(hz?o.p:wi.c+off,2.04,hz?wi.c+off:o.p);wallsG.add(rail);}
      }else{
        const wt=WTYPES[o.wt]||WTYPES.std,sill=wt.sill,top=Math.min(sill+wt.wh,H-.1);
        box(lo,hi,0,sill,wallFaceMats(w,hi-lo,sill));box(lo,hi,top,H,wallFaceMats(w,hi-lo,H-top));
        if(o.wt==='bay'){const pr=.45,nc=f*(pr+T/2-.02);
          box(lo,hi,sill,top,glass,.02,false,nc);
          const side=(u)=>{const m=new THREE.Mesh(hz?new THREE.BoxGeometry(.02,top-sill,pr):new THREE.BoxGeometry(pr,top-sill,.02),glass);m.position.set(hz?u:wi.c+f*(T/2+pr/2-.02),(sill+top)/2,hz?wi.c+f*(T/2+pr/2-.02):u);wallsG.add(m);};side(lo+.01);side(hi-.01);
          box(lo,hi,sill-.05,sill,mat('#eceae5',.6),T+pr*2-.04,false,0);
          box(lo,hi,top,top+.05,mat('#eceae5',.6),T+pr*2-.04,false,0);
          box(lo,lo+.04,sill,top,frameW,.03,false,nc);box(hi-.04,hi,sill,top,frameW,.03,false,nc);}
        else{
          box(lo,hi,sill,top,glass,.02);
          box(lo,hi,sill,sill+.04,frameW,T+.02);box(lo,hi,top-.04,top,frameW,T+.02);box(lo,lo+.04,sill,top,frameW,T+.02);box(hi-.04,hi,sill,top,frameW,T+.02);
          if(o.wt==='slide'){const m=(lo+hi)/2;box(m-.03,m+.03,sill,top,frameW,T+.02);box(m-.03,m+.03,sill+(top-sill)*.45,sill+(top-sill)*.55,mat('#8d9296',.4,.6),T+.05,false);}
          else if(o.w>1.4)box(o.p-.02,o.p+.02,sill,top,frameW,T+.02);}
      }}
  }
  slabM.scale.set(b.w+1.6,.2,b.h+1.6);slabM.position.set(b.cx,-.11,b.cy);
  const cm=new THREE.Mesh(new THREE.PlaneGeometry(b.w+T,b.h+T),new THREE.MeshStandardMaterial({color:S.ceilCol||'#f8f7f4',roughness:1}));cm.rotation.x=Math.PI/2;cm.castShadow=true;cm.position.set(b.cx,S.H,b.cy);ceilG.add(cm);
  const rad=Math.max(b.w,b.h)*.75+2;sunC={x:b.cx,z:b.cy,rad};
  const sc=sun.shadow.camera;sc.left=-rad;sc.right=rad;sc.top=rad;sc.bottom=-rad;sc.near=1;sc.far=rad*5;sc.updateProjectionMatrix();applyEnv();
}
function sync3D(){
  if(!renderer)return;
  const sig=JSON.stringify([S.walls,S.openings,S.rooms,S.wallColor,S.H,S.skirt,S.skirtCol,S.ceilCol]);
  if(sig!==structSig){structSig=sig;buildStructure();}
  const seen=new Set();
  for(const it of S.items){seen.add(it.id);const sg=it.type+'|'+it.w+'|'+it.d+'|'+it.color+'|'+S.H+'|'+(it.mt||'')+'|'+(it.h||0)+'|'+(CAT[it.type].missing?1:0)+'|'+modelRev;let e=itemMap.get(it.id);CH=S.H;
    if(!e||e.sig!==sg){if(e){itemsG.remove(e.g);disposeG(e.g);}const g=new THREE.Group();CAT[it.type].b(g,it.w,it.d,it.color,it);if(it.mt)applyMt(g,it);g.userData.id=it.id;itemsG.add(g);e={g,sig:sg};itemMap.set(it.id,e);}
    e.g.position.set(it.x,0,it.y);e.g.rotation.y=-it.rot*Math.PI/180;}
  for(const [id,e] of itemMap)if(!seen.has(id)){itemsG.remove(e.g);disposeG(e.g);itemMap.delete(id);}
  syncLamps();
  const e=sel&&sel.t==='item'&&itemMap.get(sel.id);
  if(e){e.g.updateMatrixWorld(true);selBox.box.setFromObject(e.g);selBox.visible=true;}else selBox.visible=false;
  wallsG.scale.y=(cut&&mode==='orbit')?.4:1;itemsG.visible=!!S.layers.furn;
}
function updateOrbit(){const sp=Math.sin(orb.pol);camera.position.set(orb.tx+orb.dist*sp*Math.sin(orb.az),orb.dist*Math.cos(orb.pol),orb.tz+orb.dist*sp*Math.cos(orb.az));camera.lookAt(orb.tx,0,orb.tz);dirty=true;}
function updateWalkCam(){if(!camera)return;camera.position.set(walk.x,1.55,walk.y);camera.rotation.order='YXZ';camera.rotation.set(walk.pitch,walk.yaw,0);dirty=true;}
function resetOrbit(){const b=bounds();orb.tx=b.cx;orb.tz=b.cy;const asp=camera?camera.aspect:1.4;orb.dist=clamp(Math.max((b.w+2)/(.7*asp),(b.h+2)/.55),8,45);orb.az=.55;orb.pol=.95;if(camera&&mode==='orbit')updateOrbit();}
function setMode(m){
  mode=m;$$('#modeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m));$('#pad').hidden=m!=='walk';$('#cutChip').style.display=m==='orbit'?'':'none';
  if(m==='walk'){const inRoom=S.rooms.some(r=>walk.x>r.x&&walk.x<r.x+r.w&&walk.y>r.y&&walk.y<r.y+r.h);if(!inRoom&&S.rooms[0]){const r=S.rooms[0];walk.x=r.x+r.w/2;walk.y=r.y+r.h/2;}}
  if(camera){camera.fov=m==='walk'?72:40;camera.updateProjectionMatrix();if(m==='walk')updateWalkCam();else{camera.rotation.order='XYZ';updateOrbit();}}
  if(ceilG)ceilG.visible=m==='walk';if(hemi)applyEnv();
  $('#hint3').textContent=m==='walk'?'Drag to look. W A S D or the arrow pad to move. Drag the blue dot on the plan to jump.':'Drag to orbit. Right-drag or Shift-drag to pan. Scroll or pinch to zoom. Click furniture to select it.';
  dirty3=true;dirty=true;render2D();
}
function walkStep(dt){
  if(mode!=='walk'||!keys.size)return;
  let f=0,s=0,t=0;if(keys.has('w')||keys.has('ArrowUp'))f++;if(keys.has('s')||keys.has('ArrowDown'))f--;if(keys.has('d'))s++;if(keys.has('a'))s--;
  if(keys.has('ArrowLeft'))t++;if(keys.has('ArrowRight'))t--;
  if(t)walk.yaw+=t*1.6*dt;
  if(f||s){const sp=1.7*dt,fx=-Math.sin(walk.yaw),fz=-Math.cos(walk.yaw),rx=Math.cos(walk.yaw),rz=-Math.sin(walk.yaw);
    walk.x+=(fx*f+rx*s)*sp;walk.y+=(fz*f+rz*s)*sp;
    for(let it=0;it<2;it++)for(const q of solids){const R=.22,dx=walk.x-q.cx,dz=walk.y-q.cz,lx=dx*q.c+dz*q.s,lz=-dx*q.s+dz*q.c,ex=q.hx+R,ez=q.hz+R;
      if(Math.abs(lx)<ex&&Math.abs(lz)<ez){const px=ex-Math.abs(lx),pz=ez-Math.abs(lz);let nx=lx,nz=lz;
        if(px<pz)nx=Math.sign(lx||1)*ex;else nz=Math.sign(lz||1)*ez;walk.x=q.cx+nx*q.c-nz*q.s;walk.y=q.cz+nx*q.s+nz*q.c;}}}
  updateWalkCam();render2D();
}
function frame(t){
  requestAnimationFrame(frame);const dt=Math.min(.05,(t-last)/1000||0);last=t;
  if(!renderer||!S)return;walkStep(dt);
  if(!dirty)return;const p=$('#viewPane');if(!p.clientWidth||!p.clientHeight)return;
  dirty=false;if(dirty3){sync3D();dirty3=false;}renderer.render(scene,camera);
}
/* 3D pointer */
const gl=$('#gl'),gp=new Map();let g3=null;
gl.addEventListener('contextmenu',e=>e.preventDefault());
gl.addEventListener('wheel',e=>{if(mode!=='orbit')return;e.preventDefault();orb.dist=clamp(orb.dist*Math.exp(e.deltaY*.001),3,45);updateOrbit();},{passive:false});
gl.addEventListener('pointerdown',e=>{gl.setPointerCapture(e.pointerId);gp.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gp.size===2){const [a,b]=[...gp.values()];g3={pinch:Math.hypot(a.x-b.x,a.y-b.y)||1,dist:orb.dist};return;}
  g3={sx:e.clientX,sy:e.clientY,lx:e.clientX,ly:e.clientY,pan:e.button===2||e.shiftKey,moved:0};});
gl.addEventListener('pointermove',e=>{if(!gp.has(e.pointerId)||!g3)return;gp.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(g3.pinch&&gp.size===2){if(mode==='orbit'){const [a,b]=[...gp.values()];orb.dist=clamp(g3.dist*g3.pinch/(Math.hypot(a.x-b.x,a.y-b.y)||1),3,45);updateOrbit();}return;}
  if(g3.pinch)return;
  const dx=e.clientX-g3.lx,dy=e.clientY-g3.ly;g3.lx=e.clientX;g3.ly=e.clientY;g3.moved+=Math.abs(dx)+Math.abs(dy);
  if(mode==='orbit'){
    if(g3.pan){const k=orb.dist*.0016,rx=Math.cos(orb.az),rz=-Math.sin(orb.az),fx=-Math.sin(orb.az),fz=-Math.cos(orb.az);orb.tx+=-rx*dx*k+fx*dy*k;orb.tz+=-rz*dx*k+fz*dy*k;}
    else{orb.az-=dx*.008;orb.pol=clamp(orb.pol-dy*.006,.08,1.45);}
    updateOrbit();
  }else{walk.yaw-=dx*.005;walk.pitch=clamp(walk.pitch-dy*.004,-1.2,1.2);updateWalkCam();render2D();}
});
function gEnd(e){const was=g3&&!g3.pinch&&g3.moved<5&&gp.has(e.pointerId);gp.delete(e.pointerId);if(gp.size<2&&g3&&g3.pinch){g3=null;return;}if(!gp.size){if(was)pick(e);g3=null;}}
gl.addEventListener('pointerup',gEnd);gl.addEventListener('pointercancel',gEnd);
function pick(e){
  if(!renderer)return;const r=gl.getBoundingClientRect(),rc=new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1),camera);
  const h=rc.intersectObjects(itemsG.children,true)[0];if(!h){select(null);return;}
  let o=h.object;while(o&&!o.userData.id)o=o.parent;if(o)select('item',o.userData.id);
}
$$('#pad button').forEach(b=>{const k=b.dataset.k;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(k);});['pointerup','pointercancel','lostpointercapture'].forEach(n=>b.addEventListener(n,()=>keys.delete(k)));});

/* ───────── left panel ───────── */
const TOOLS=[['select','Select'],['wall','Wall'],['room','Room'],['poly','Polygon'],['dim','Dimension'],['door','Door'],['window','Window']];
const HINTS={select:'Click to select. Shift-click adds to the selection, Shift-drag draws a box. Drag handles to reshape; drag furniture to move it. Hold Alt to skip wall snapping.',wall:'Drag to draw a wall, and type a length such as 3.2 then Enter to set it exactly. Locks to 90 degrees unless Free angle is on.',poly:'Click each corner of the room. Click the first point or double-click to finish.',dim:'Drag between two points to add a dimension line.',room:'Click inside a closed set of walls to fill a room, or drag a rectangle.',calib:'Click two points on the image whose real distance you know, such as the ends of a printed dimension. Zoom in first for accuracy.',imove:'Drag to move the image. Pick Select when it sits where you want it.',door:'Click on a wall to place a door.',window:'Click on a wall to place a window.'};
$('#left').addEventListener('input',e=>{if(e.target.id==='uop'&&under){under.op=e.target.value/100;renderUnder();saveUnder();}});
$('#left').addEventListener('change',e=>{if(e.target.id==='urot'&&under){const v=parseFloat(e.target.value);if(isFinite(v)){under.rot=clamp(v,-180,180);renderUnder();saveUnder();}}});
function buildLeft(){
  let h='<div class="sec"><h3>Draw</h3><div class="tools">'+TOOLS.map(([k,n])=>`<button class="tool" data-tool="${k}" aria-pressed="${k===tool}">${n}</button>`).join('')+'</div></div><div class="sec" id="opts"></div><div class="sec" id="trace"></div>';
  for(const g of GROUPS){h+=`<div class="sec"><h3>${g}</h3><div class="cat">`+Object.entries(CAT).filter(([,v])=>v.g===g).map(([k,v])=>`<button class="ci" data-add="${k}"><span>${v.n}</span><em>${Math.round(v.w*1000)}×${Math.round(v.d*1000)}</em></button>`).join('')+'</div></div>';}
  const mods=Object.entries(CAT).filter(([,v])=>v.g==='My models'&&!v.missing);
  h+=`<div class="sec"><h3>My models</h3>${mods.length?'<div class="cat">'+mods.map(([k,v])=>`<button class="ci" data-add="${k}"><span>${esc(v.n)}</span><em>${Math.round(v.w*1000)}×${Math.round(v.d*1000)}</em></button>`).join('')+'</div>':''}
    <p class="note" style="margin:8px 0 10px">Import a GLB, GLTF or OBJ file. It is scaled to real size and kept in this browser.</p><button class="btn" data-model="load" style="width:100%">Import 3D model</button>${mods.length?'<button class="btn" data-model="manage" style="width:100%;margin-top:8px">Remove a model…</button>':''}</div>`;
  $('#left').innerHTML=h;renderTrace();renderOpts();
}
function renderOpts(){const el=$('#opts');if(!el)return;
  el.innerHTML=`<h3>Options</h3><div class="tools"><button class="tool" data-opt="free" aria-pressed="${freeAng}">Free angle</button><button class="tool" data-opt="flush" aria-pressed="${flush}">Flush snap</button></div><div style="height:8px"></div><div class="lays">${LAYERS.map(([k,n])=>`<label><input type="checkbox" data-lay="${k}"${S.layers[k]?' checked':''}> ${n}</label>`).join('')}</div>`;}
$('#left').addEventListener('click',e=>{const o=e.target.closest('[data-opt]');if(!o)return;if(o.dataset.opt==='free')freeAng=!freeAng;else flush=!flush;renderOpts();});
$('#left').addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.lay;if(!k)return;S.layers[k]=e.target.checked?1:0;changed({ui:false});});
function renderTrace(){
  const el=$('#trace');if(!el)return;
  if(!under){el.innerHTML=`<h3>Trace a paper plan</h3><p class="note" style="margin:0 0 10px">Load a photo or scan of your floor plan, set its scale, then draw walls over it.</p><button class="btn primary" data-tr="load" style="width:100%">Load plan image</button>`;return;}
  el.innerHTML=`<h3>Trace a paper plan</h3><div class="tools"><button class="tool" data-tool="calib" aria-pressed="${tool==='calib'}">Set scale</button><button class="tool" data-tool="imove" aria-pressed="${tool==='imove'}">Move</button><button class="tool" data-tr="toggle" aria-pressed="${!under.show}">${under.show?'Hide':'Show'}</button></div>
    <div style="height:10px"></div><label class="row"><span>Opacity</span><input type="range" id="uop" min="10" max="100" value="${Math.round(under.op*100)}"></label>
    <label class="row"><span>Rotate °</span><input type="number" id="urot" step="0.1" min="-180" max="180" value="${(under.rot||0).toFixed(1)}" inputmode="decimal"></label>
    <div class="kv"><span>Image width</span><b>${under.w.toFixed(2)} m</b></div>
    <p class="note">1. Rotate until printed walls run level. 2. Set scale from one known dimension. 3. Draw walls over it, then click inside each space with the Room tool.</p>
    <div class="acts"><button class="btn" data-tr="load">Replace</button><button class="btn danger" data-tr="remove">Remove</button></div>`;
}
function startTrace(){fitImage();setTool('calib');renderTrace();}
function setTool(t){tool=t;ghost=null;draft=null;calib=null;polyDraft=null;marq=null;$$('.tool').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===t));$('#hint').textContent=HINTS[t];svg.style.cursor=t==='select'?'default':t==='imove'?'move':'crosshair';render2D();}
$('#left').addEventListener('click',e=>{
  const tr=e.target.closest('[data-tr]');
  if(tr){const a=tr.dataset.tr;
    if(a==='load')$('#imgIn').click();
    else if(a==='toggle'){under.show=!under.show;renderUnder();renderTrace();saveUnder();}
    else if(a==='remove'){under=null;underSrc='';calib=null;if(tool==='calib'||tool==='imove')setTool('select');saveUnder();renderUnder();renderTrace();render2D();}
    return;}
  const t=e.target.closest('[data-tool]');if(t){if((t.dataset.tool==='calib'||t.dataset.tool==='imove')&&!under)return;setTool(t.dataset.tool);renderTrace();return;}
  const a=e.target.closest('[data-add]');if(!a)return;
  const k=CAT[a.dataset.add],r=sel&&sel.t==='room'&&getE('room',sel.id);
  const cx=r?r.x+r.w/2:view.cx,cy=r?r.y+r.h/2:view.cy;
  checkpoint();const it={id:uid(),type:a.dataset.add,x:sn(cx,.05),y:sn(cy,.05),rot:0,w:k.w,d:k.d,color:k.c};S.items.push(it);sel={t:'item',id:it.id};
  setTool('select');changed();setTab('plan');
});

/* ───────── 3D model import ───────── */
let modelRev=0,modelDB=null;const MODELS={};
function idb(){return new Promise((res,rej)=>{if(modelDB)return res(modelDB);try{const q=indexedDB.open('flatstudio',1);q.onupgradeneeded=()=>q.result.createObjectStore('models',{keyPath:'id'});q.onsuccess=()=>{modelDB=q.result;res(modelDB);};q.onerror=()=>rej(q.error);}catch(e){rej(e);}});}
const idbDo=(mode,fn)=>idb().then(db=>new Promise((res,rej)=>{const t=db.transaction('models',mode),st=t.objectStore('models'),r=fn(st);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error);}));
function toast(m,ms=2600){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),ms);}
function protoFrom(obj){
  obj.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.geometry.userData.shared=1;(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>{if(x){x.userData.shared=1;}});}});
  obj.updateMatrixWorld(true);let bb=new THREE.Box3().setFromObject(obj),sz=bb.getSize(new THREE.Vector3());
  const mx=Math.max(sz.x,sz.y,sz.z);if(!isFinite(mx)||mx<=0)throw new Error('The model has no geometry.');
  const k=mx>400?.001:mx>8?.01:1;const wrap=new THREE.Group();wrap.add(obj);obj.scale.multiplyScalar(k);wrap.updateMatrixWorld(true);
  bb=new THREE.Box3().setFromObject(wrap);const c=bb.getCenter(new THREE.Vector3());sz=bb.getSize(new THREE.Vector3());
  obj.position.set(-c.x,-bb.min.y,-c.z);wrap.updateMatrixWorld(true);return {proto:wrap,w:sz.x,d:sz.z,h:sz.y};}
function registerModel(id,name,proto,dims){
  MODELS[id]={proto,dims};
  CAT['m:'+id]={n:name,g:'My models',w:+dims.w.toFixed(2),d:+dims.d.toFixed(2),h:+dims.h.toFixed(2),c:'#cccccc',m:1,model:id,
    b:(g,w,d,c,it)=>{const h=(it&&it.h)||dims.h,cl=proto.clone(true);cl.scale.set(w/dims.w,h/dims.h,d/dims.d);g.add(cl);}};
  modelRev++;}
function parseModel(name,buf){return new Promise((res,rej)=>{
  const ext=name.split('.').pop().toLowerCase();
  try{
    if(ext==='obj'){
      const o=new OBJLoader().parse(new TextDecoder().decode(buf));o.traverse(m=>{if(m.isMesh&&(!m.material||!m.material.map)){m.material=new THREE.MeshStandardMaterial({color:'#c9c3b8',roughness:.8});}});res(protoFrom(o));}
    else{
      new GLTFLoader().parse(ext==='gltf'?new TextDecoder().decode(buf):buf,'',g=>{try{res(protoFrom(g.scene));}catch(e){rej(e);}},err=>rej(new Error('Could not read that file. GLTF files with separate texture or bin files are not supported, use a GLB.')));}
  }catch(e){rej(e);}});}
$('#modelIn').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  if(f.size>40*1024*1024){toast('That file is over 40 MB. Use a lighter model.');return;}
  try{const buf=await f.arrayBuffer(),r=await parseModel(f.name,buf),id='u'+Date.now().toString(36),name=f.name.replace(/\.[^.]+$/,'').slice(0,28);
    registerModel(id,name,r.proto,r);try{await idbDo('readwrite',st=>st.put({id,name,ext:f.name.split('.').pop().toLowerCase(),buf}));}catch(er){toast('Model loaded but could not be saved in this browser.');}
    buildLeft();const k=CAT['m:'+id];checkpoint();const it={id:uid(),type:'m:'+id,x:sn(view.cx,.05),y:sn(view.cy,.05),rot:0,w:k.w,d:k.d,h:k.h,color:'#cccccc'};S.items.push(it);sel={t:'item',id:it.id};ms=[];changed();toast(`Imported ${name}: ${(k.w*1000)|0} × ${(k.d*1000)|0} × ${(k.h*1000)|0} mm`);
  }catch(err){dialog(`<h2>Could not import that model</h2><p class="note">${esc(err.message||String(err))}</p><div class="acts"><button class="btn" data-d="close">OK</button></div>`);}});
async function loadSavedModels(){try{const all=await idbDo('readonly',st=>st.getAll());
  for(const m of all||[]){try{const r=await parseModel(m.name+'.'+m.ext,m.buf);registerModel(m.id,m.name,r.proto,r);}catch(e){}}
  if(all&&all.length){buildLeft();itemMap.forEach(v=>{itemsG.remove(v.g);});itemMap.clear();dirty3=true;dirty=true;render2D();renderRight();}}catch(e){}}
$('#left').addEventListener('click',e=>{const m=e.target.closest('[data-model]');if(!m)return;
  if(m.dataset.model==='load')$('#modelIn').click();
  else{const mods=Object.entries(CAT).filter(([,v])=>v.g==='My models'&&!v.missing);
    dialog(`<h2>Remove a model</h2><p class="note" style="margin:0 0 10px">Items using it stay in your design as grey placeholders.</p>${mods.map(([k,v])=>`<div class="kv"><span>${esc(v.n)}</span><button class="btn danger" data-d="rmmodel" data-id="${k.slice(2)}">Remove</button></div>`).join('')}<div class="acts"><button class="btn" data-d="close">Close</button></div>`);}});
/* ───────── inspector ───────── */
const num=(k,v,step=.05,min=.1,max=60)=>`<input type="number" data-k="${k}" value="${(+v).toFixed(2)}" step="${step}" min="${min}" max="${max}" inputmode="decimal">`;
const row=(l,h)=>`<label class="row"><span>${l}</span>${h}</label>`;
const sw=(act,cols,cur)=>`<div class="sw">${cols.map(c=>`<button data-act="${act}" data-v="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${c.toLowerCase()===String(cur).toLowerCase()}"></button>`).join('')}</div>`;
function renderRight(){try{fillViews();}catch(e){}

  $$('.tabs [data-rt]').forEach(b=>b.setAttribute('aria-selected',b.dataset.rt===rtab));
  const el=$('#rbody');if(!S)return;let h='';
  if(rtab==='schedule'){el.innerHTML=scheduleHtml();return;}
  if(rtab==='budget'){el.innerHTML=budgetHtml();return;}
  if(rtab==='checks'){el.innerHTML=typeof checksHtml==='function'?checksHtml():'';return;}
  if(ms.length){el.innerHTML=multiHtml();return;}
  const e=sel&&getE(sel.t,sel.id);
  if(!e){
    const tot=S.rooms.reduce((a,r)=>a+area(r),0);
    h=`<div class="sec"><h3>Flat</h3>${row('Name',`<input type="text" data-k="name" value="${esc(S.name)}" maxlength="60">`)}${row('Ceiling (m)',num('H',S.H,.05,2.2,3.2))}
      <div style="margin-bottom:6px;color:var(--ink2)">Wall paint (all walls)</div>${sw('wallcol',WALLS,S.wallColor)}
      <div style="margin:12px 0 6px;color:var(--ink2)">Ceiling colour</div>${sw('ceilcol',['#f8f7f4','#ece8df','#dfe6ea','#f1e6df'],S.ceilCol||'#f8f7f4')}
      <label class="chk"><input type="checkbox" data-act="skirt"${S.skirt?' checked':''}> Skirting boards</label>${S.skirt?sw('skirtcol',['#f4f2ee','#d9d3c5','#8a6f55','#3a3d3f'],S.skirtCol||'#f4f2ee'):''}</div>
      <div class="sec"><h3>Summary</h3><div class="kv"><span>Floor area</span><b>${tot.toFixed(1)} m²</b></div><div class="kv"><span>Rooms</span><b>${S.rooms.length}</b></div>
      <div class="kv"><span>Doors / windows</span><b>${S.openings.filter(o=>o.kind==='door').length} / ${S.openings.filter(o=>o.kind==='window').length}</b></div><div class="kv"><span>Furniture items</span><b>${S.items.length}</b></div>
      <p class="note">Click anything on the plan or in 3D to edit it. Hacking or moving a wall in an HDB flat needs an HDB permit and a registered renovation contractor. ${S.walls.some(w=>w.str)?'Walls with red dashes are marked structural (from the brochure plan, or by you). Check your unit\'s plan too.':'This tool does not know which walls are structural. Mark them in a wall\'s settings.'}</p></div>`;
  }else if(sel.t==='item'){
    const k=CAT[e.type];
    h=`<div class="sec"><h3>${esc(k.n)}</h3>${row('Width (m)',num('w',e.w))}${row('Depth (m)',num('d',e.d))}${k.m?row('Height (m)',num('h',e.h||k.h)):''}${row('Rotation °',num('rot',e.rot,15,0,359).replace('.00',''))}
      ${k.m?'':`<div style="margin-bottom:6px;color:var(--ink2)">Colour</div>${sw('col',SW,e.color)}${row('Material',`<select data-k="mt"><option value="">Plain</option>${[['wood','Timber grain'],['fabric','Fabric'],['leather','Leather'],['metal','Metal'],['gloss','Gloss']].map(([v,n])=>`<option value="${v}"${e.mt===v?' selected':''}>${n}</option>`).join('')}</select>`)}`}
      ${row('Product name',`<input type="text" data-k="nm" value="${esc(e.nm||'')}" maxlength="40" placeholder="optional">`)}${row('Your price ($)',`<input type="number" data-k="pr" value="${e.pr||''}" min="0" step="any" inputmode="decimal" placeholder="overrides unit price">`)}
      <div class="acts"><button class="btn" data-act="rot90">Rotate 90°</button><button class="btn" data-act="dup">Duplicate</button><button class="btn danger" data-act="del">Delete</button></div>
      <p class="note">Front of the item is marked by the small triangle on the plan.${k.k?' Counts as carpentry in the schedule.':''}</p></div>`;
  }else if(sel.t==='room'){
    h=`<div class="sec"><h3>Room</h3>${row('Name',`<input type="text" data-k="name" value="${esc(e.name)}" maxlength="40">`)}
      ${e.pts?`<div class="kv"><span>Shape</span><b>Polygon, ${e.pts.length} corners</b></div>`:`<div class="pair">${row('X (m)',num('x',e.x,.1,-50,80))}${row('Y (m)',num('y',e.y,.1,-50,80))}</div><div class="pair">${row('Width',num('w',e.w,.1,.6))}${row('Depth',num('h',e.h,.1,.6))}</div>`}
      <div class="kv"><span>Area</span><b>${area(e).toFixed(2)} m²</b></div>
      <div style="margin:12px 0 6px;color:var(--ink2)">Floor finish</div><div class="floors">${Object.entries(FLOORS).map(([k,f])=>`<button data-act="floor" data-v="${k}" aria-pressed="${e.floor===k}"><i style="background:${f.c}"></i>${f.n}</button>`).join('')}</div>
      <div class="acts">${e.pts?'<button class="btn" data-act="torect">Use bounding box</button>':'<button class="btn" data-act="topoly">Edit corners</button>'}<button class="btn danger" data-act="del">Delete room</button></div><p class="note">${e.pts?'Drag the corner dots. Drag the faint dots on edges to add a corner. Shift-click a corner to remove it. ':''}Deleting a room removes its floor only. Walls and furniture stay.</p></div>`;
  }else if(sel.t==='wall'){
    const wi=wallInfo(e),len=wi.b-wi.a,ang=wi.axis==='a';
    h=`<div class="sec"><h3>Wall</h3><div class="kv"><span>Direction</span><b>${ang?(wi.ang*180/Math.PI).toFixed(1)+'°':wi.axis==='h'?'East–west':'North–south'}</b></div><div class="kv"><span>Length</span><b>${len.toFixed(2)} m</b></div>${row('Thickness (mm)',`<input type="number" data-k="th" value="${Math.round(wi.th*1000)}" min="60" max="400" step="10" inputmode="numeric">`)}
      <div style="height:10px"></div>${ang?`<div class="pair">${row('X1',num('x1',e.x1,.1,-50,80))}${row('Y1',num('y1',e.y1,.1,-50,80))}</div><div class="pair">${row('X2',num('x2',e.x2,.1,-50,80))}${row('Y2',num('y2',e.y2,.1,-50,80))}</div>`:`${row('Position (m)',num('c',wi.c,.1,-50,80))}<div class="pair">${row('From',num('a',wi.a,.1,-50,80))}${row('To',num('b',wi.b,.1,-50,80))}</div>`}
      <div style="margin:12px 0 6px;color:var(--ink2)">Finish</div><div class="floors">${Object.entries(FINS).map(([k,n])=>`<button data-act="fin" data-v="${k}" aria-pressed="${(e.fin||'paint')===k}">${n}</button>`).join('')}</div>
      ${(e.fin||'paint')==='paint'?`<div style="margin:12px 0 6px;color:var(--ink2)">Paint for this wall</div>${sw('wcol',WALLS,e.col||S.wallColor)}<div class="acts"><button class="btn" data-act="wcolclear">Same as flat</button></div>`:''}
      <label class="chk" style="margin-top:12px"><input type="checkbox" data-act="str"${e.str?' checked':''}> Structural wall (do not alter)</label>
      <div class="acts"><button class="btn danger" data-act="del">Delete wall</button></div><p class="note">Mark walls you know are structural. This tool cannot tell which are. Removing or moving a real wall needs an HDB permit.</p></div>`;
  }else if(sel.t==='dim'){
    h=`<div class="sec"><h3>Dimension</h3><div class="kv"><span>Length</span><b>${Math.hypot(e.x2-e.x1,e.y2-e.y1).toFixed(3)} m</b></div>${row('Line offset (m)',num('o',e.o,.1,-5,5))}<div class="acts"><button class="btn" data-act="flipdim">Flip side</button><button class="btn danger" data-act="del">Delete</button></div></div>`;
  }else if(sel.t==='open'){
    h=`<div class="sec"><h3>${e.kind==='door'?'Door':'Window'}</h3>${row('Width (m)',num('w',e.w,.05,.4,4))}${row('Position (m)',num('p',e.p,.05,-50,80))}`;
    if(e.kind==='window')h+=row('Type',`<select data-k="wt">${Object.entries(WTYPES).map(([k,v])=>`<option value="${k}"${e.wt===k?' selected':''}>${v.n}</option>`).join('')}</select>`);
    else h+=row('Type',`<select data-k="dt">${Object.entries(DTYPES).map(([k,v])=>`<option value="${k}"${(e.dt||'single')===k?' selected':''}>${v}</option>`).join('')}</select>`);
    h+=`<div class="acts">${e.kind==='door'||e.wt==='bay'||e.dt==='slide'?`<button class="btn" data-act="flip">${e.kind==='door'?'Flip side':'Flip outward'}</button>`:''}<button class="btn danger" data-act="del">Delete</button></div>
      <p class="note">${e.kind==='door'?'Drag the door along its wall on the plan. Doors swing to the side shown by the arc.':'Drag the window along its wall on the plan.'}</p></div>`;
  }
  el.innerHTML=h;
}
$('#rbody').addEventListener('change',ev=>{
  const el=ev.target,k=el.dataset.k;if(!k||!S)return;let v=el.type==='number'?parseFloat(el.value):el.value;if(el.type==='number'&&!isFinite(v)){if(k==='pr'){v=0;}else{renderRight();return;}}
  mut(()=>{
    if(!sel){if(k==='name')S.name=String(v).slice(0,60);if(k==='H')S.H=clamp(v,2.2,3.2);$('#pname').value=S.name;return;}
    const e=getE(sel.t,sel.id);if(!e)return;
    if(sel.t==='item'){if(k==='rot')e.rot=((v%360)+360)%360;else if(k==='mt')e.mt=v;else if(k==='nm')e.nm=String(v).slice(0,40);else if(k==='pr')e.pr=(isFinite(v)&&v>0)?Math.min(v,1e7):0;else e[k]=clamp(v,.1,8);}
    else if(sel.t==='room'){if(k==='name')e.name=String(v).slice(0,40);else e[k]=k==='w'||k==='h'?Math.max(.6,v):v;}
    else if(sel.t==='dim'){e.o=clamp(v,-5,5);}
    else if(sel.t==='open'){if(k==='wt')e.wt=v;else if(k==='dt')e.dt=v;else e[k]=v;}
    else if(sel.t==='wall'){const wi=wallInfo(e),hz=wi.axis==='h';
      if(k==='th'){e.th=clamp(Math.round(v)/1000,.06,.4);return;}
      if(wi.axis==='a'){if(['x1','y1','x2','y2'].includes(k)){const o=Object.assign({},e);e[k]=v;if(Math.hypot(e.x2-e.x1,e.y2-e.y1)<.3)e[k]=o[k];}return;}
      if(k==='c'){S.openings.filter(o=>wi.ops.includes(o)).forEach(o=>o.c=v);if(hz)e.y1=e.y2=v;else e.x1=e.x2=v;}
      else{const a=k==='a'?v:wi.a,b=k==='b'?v:wi.b;if(b-a<.3)return;if(hz){e.x1=a;e.x2=b;}else{e.y1=a;e.y2=b;}}}
  });
});
$('#rbody').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act]');if(!b||!S)return;const act=b.dataset.act,v=b.dataset.v,e=sel&&getE(sel.t,sel.id);
  if(act==='copy'){copyText($('#schedTxt').textContent,b);return;}
  if(act.startsWith('m_')){multiAct(act);return;}
  mut(()=>{
    if(act==='wallcol'){S.wallColor=v;S.walls.forEach(w=>{w.col='';});}
    else if(act==='ceilcol')S.ceilCol=v;
    else if(act==='skirt')S.skirt=b.checked;
    else if(act==='skirtcol')S.skirtCol=v;
    else if(!e)return;
    else if(act==='fin')e.fin=v;
    else if(act==='wcol')e.col=v;
    else if(act==='wcolclear')e.col='';
    else if(act==='str')e.str=b.checked;
    else if(act==='col')e.color=v;
    else if(act==='floor')e.floor=v;
    else if(act==='rot90')e.rot=(e.rot+90)%360;
    else if(act==='flip')e.flip=-(e.flip||-1);
    else if(act==='flipdim')e.o=-e.o;
    else if(act==='topoly'){e.pts=rpts(e).map(q=>[q[0],q[1]]);}
    else if(act==='torect'){syncBox(e);delete e.pts;}
    else if(act==='dup'){const c=Object.assign({},e,{id:uid(),x:e.x+.3,y:e.y+.3});S.items.push(c);sel={t:'item',id:c.id};}
    else if(act==='del')delSel();
  });
});
function delSel(){if(ms.length){for(const m of ms){const k={item:'items',room:'rooms',wall:'walls',open:'openings',dim:'dims'}[m.t];S[k]=S[k].filter(x=>x.id!==m.id);}ms=[];pruneOps();return;}
  if(!sel)return;const k={item:'items',room:'rooms',wall:'walls',open:'openings',dim:'dims'}[sel.t];S[k]=S[k].filter(x=>x.id!==sel.id);if(sel.t==='wall')pruneOps();sel=null;}
let pasteN=0;
const curList=()=>ms.length?ms:(sel?[sel]:[]);
function entsOf(list){const o={items:[],walls:[],rooms:[],dims:[],ops:[]},seen=new Set();
  for(const m of list){const e=getE(m.t,m.id);if(!e)continue;
    if(m.t==='item')o.items.push(deep(e));else if(m.t==='room')o.rooms.push(deep(e));else if(m.t==='dim')o.dims.push(deep(e));
    else if(m.t==='wall'){o.walls.push(deep(e));for(const p of wallInfo(e).ops)if(!seen.has(p.id)){seen.add(p.id);o.ops.push(deep(p));}}}
  return o;}
function cloneEnts(o,dx,dy){const out=[],gm={};
  for(const e of o.items){const n=Object.assign(deep(e),{id:uid(),x:sn(e.x+dx,.05),y:sn(e.y+dy,.05)});if(e.g){gm[e.g]=gm[e.g]||('g'+uid());n.g=gm[e.g];}S.items.push(n);out.push({t:'item',id:n.id});}
  for(const e of o.walls){const n=Object.assign(deep(e),{id:uid(),x1:e.x1+dx,y1:e.y1+dy,x2:e.x2+dx,y2:e.y2+dy});S.walls.push(n);out.push({t:'wall',id:n.id});}
  for(const e of o.ops){const n=deep(e);n.id=uid();if(e.axis==='h'){n.p+=dx;n.c+=dy;}else{n.c+=dx;n.p+=dy;}S.openings.push(n);}
  for(const e of o.rooms){const n=deep(e);n.id=uid();n.x+=dx;n.y+=dy;if(n.pts)n.pts=n.pts.map(q=>[q[0]+dx,q[1]+dy]);S.rooms.push(n);out.push({t:'room',id:n.id});}
  for(const e of o.dims){const n=Object.assign(deep(e),{id:uid(),x1:e.x1+dx,y1:e.y1+dy,x2:e.x2+dx,y2:e.y2+dy});S.dims.push(n);out.push({t:'dim',id:n.id});}
  return out;}
function setSelQuiet(out){if(out.length>1){ms=out;sel=null;}else{ms=[];sel=out[0]||null;}}
function extentsOf(list){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;const add=(x,y)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
  for(const m of list){const e=getE(m.t,m.id);if(!e)continue;if(m.t==='item')add(e.x,e.y);else if(m.t==='room')rpts(e).forEach(q=>add(q[0],q[1]));else{add(e.x1,e.y1);add(e.x2,e.y2);}}
  return {x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2};}
function multiAct(act){
  const list=ms.slice();
  mut(()=>{
    if(act==='m_del')delSel();
    else if(act==='m_dup'){setSelQuiet(cloneEnts(entsOf(list),.4,.4));}
    else if(act==='m_group'){const g='g'+uid();list.forEach(m=>{if(m.t==='item')getE('item',m.id).g=g;});}
    else if(act==='m_ungroup'){list.forEach(m=>{if(m.t==='item')getE('item',m.id).g=0;});}
    else if(act==='m_rot'){const X=extentsOf(list),cx=X.cx,cy=X.cy,R=(x,y)=>[cx-(y-cy),cy+(x-cx)],ops=[];
      list.forEach(m=>{if(m.t==='wall'){const w=getE('wall',m.id);if(w)wallInfo(w).ops.forEach(o=>{if(!ops.includes(o))ops.push(o);});}});
      for(const m of list){const e=getE(m.t,m.id);if(!e)continue;
        if(m.t==='item'){const q=R(e.x,e.y);e.x=sn(q[0],.05);e.y=sn(q[1],.05);e.rot=(e.rot+90)%360;}
        else if(m.t==='room'){if(e.pts){e.pts=e.pts.map(q=>R(q[0],q[1]));syncBox(e);}else{const a=R(e.x,e.y),b=R(e.x+e.w,e.y+e.h);e.x=Math.min(a[0],b[0]);e.y=Math.min(a[1],b[1]);e.w=Math.abs(b[0]-a[0]);e.h=Math.abs(b[1]-a[1]);}}
        else{const a=R(e.x1,e.y1),b=R(e.x2,e.y2);e.x1=a[0];e.y1=a[1];e.x2=b[0];e.y2=b[1];}}
      for(const o of ops){if(o.axis==='h'){const c=o.c,p=o.p;o.axis='v';o.c=cx-(c-cy);o.p=cy+(p-cx);if(o.flip)o.flip=-o.flip;}else{const c=o.c,p=o.p;o.axis='h';o.c=cy+(c-cx);o.p=cx-(p-cy);}}
    }
    else if(act.startsWith('m_al_')){const its=list.filter(m=>m.t==='item').map(m=>getE('item',m.id));if(its.length<2)return;
      const ext=i=>{const a=i.rot*Math.PI/180;return [(Math.abs(i.w*Math.cos(a))+Math.abs(i.d*Math.sin(a)))/2,(Math.abs(i.w*Math.sin(a))+Math.abs(i.d*Math.cos(a)))/2];};
      const k=act.slice(5);
      if(k==='l'){const v=Math.min(...its.map(i=>i.x-ext(i)[0]));its.forEach(i=>i.x=sn(v+ext(i)[0],.05));}
      else if(k==='r'){const v=Math.max(...its.map(i=>i.x+ext(i)[0]));its.forEach(i=>i.x=sn(v-ext(i)[0],.05));}
      else if(k==='t'){const v=Math.min(...its.map(i=>i.y-ext(i)[1]));its.forEach(i=>i.y=sn(v+ext(i)[1],.05));}
      else if(k==='b'){const v=Math.max(...its.map(i=>i.y+ext(i)[1]));its.forEach(i=>i.y=sn(v-ext(i)[1],.05));}
      else if(k==='ch'){const v=its.reduce((a,i)=>a+i.x,0)/its.length;its.forEach(i=>i.x=sn(v,.05));}
      else if(k==='cv'){const v=its.reduce((a,i)=>a+i.y,0)/its.length;its.forEach(i=>i.y=sn(v,.05));}}
  });
}
function multiHtml(){
  const c={};ms.forEach(m=>c[m.t]=(c[m.t]||0)+1);const nm={item:'furniture',room:'rooms',wall:'walls',dim:'dimensions'};
  const grouped=ms.some(m=>m.t==='item'&&getE('item',m.id).g),hasItems=c.item>1;
  return `<div class="sec"><h3>${ms.length} selected</h3><p class="note" style="margin-top:0">${Object.entries(c).map(([k,v])=>v+' '+nm[k]).join(', ')}</p>
    <div class="acts"><button class="btn" data-act="m_rot">Rotate 90°</button><button class="btn" data-act="m_dup">Duplicate</button><button class="btn danger" data-act="m_del">Delete</button></div>
    ${hasItems?`<h3 style="margin-top:16px">Align</h3><div class="tools"><button class="tool" data-act="m_al_l">Left</button><button class="tool" data-act="m_al_ch">Centre H</button><button class="tool" data-act="m_al_r">Right</button><button class="tool" data-act="m_al_t">Top</button><button class="tool" data-act="m_al_cv">Centre V</button><button class="tool" data-act="m_al_b">Bottom</button></div>
    <div class="acts" style="margin-top:12px"><button class="btn" data-act="m_group">Group</button>${grouped?'<button class="btn" data-act="m_ungroup">Ungroup</button>':''}</div>`:''}
    <p class="note">Drag any selected item to move them all. Ctrl or Cmd with C and V copies and pastes.</p></div>`;}
$('#rbody').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')e.target.blur();});
$$('.tabs [data-rt]').forEach(b=>b.addEventListener('click',()=>{rtab=b.dataset.rt;renderRight();}));

function scheduleData(){
  const rooms=S.rooms.map(r=>({n:r.name,a:area(r),f:FLOORS[r.floor].n}));
  const grp={};for(const it of S.items){const k=CAT[it.type],key=it.type+'|'+it.w+'|'+it.d;(grp[key]=grp[key]||{t:it.type,w:it.w,d:it.d,q:0}).q++;}
  const all=Object.values(grp).sort((a,b)=>CAT[a.t].n.localeCompare(CAT[b.t].n));
  return {rooms,carp:all.filter(g=>CAT[g.t].k),furn:all.filter(g=>!CAT[g.t].k),
    doors:S.openings.filter(o=>o.kind==='door').length,wins:S.openings.filter(o=>o.kind==='window').length};
}
const mm=v=>Math.round(v*1000);
function scheduleText(){
  const d=scheduleData(),L=[`${S.name}`,`Floor area ${d.rooms.reduce((a,r)=>a+r.a,0).toFixed(1)} m², ceiling ${S.H.toFixed(2)} m`,'','ROOMS'];
  d.rooms.forEach(r=>L.push(`  ${r.n}: ${r.a.toFixed(1)} m², ${r.f}`));
  L.push('',`DOORS ${d.doors}   WINDOWS ${d.wins}`,'','CARPENTRY (width x depth, mm)');
  d.carp.forEach(g=>L.push(`  ${g.q} x ${CAT[g.t].n}  ${mm(g.w)} x ${mm(g.d)}  (run ${(g.q*g.w).toFixed(2)} m)`));
  L.push('','FURNITURE & FITTINGS');d.furn.forEach(g=>L.push(`  ${g.q} x ${CAT[g.t].n}  ${mm(g.w)} x ${mm(g.d)}`));
  L.push('','Measure on site before ordering. Dimensions come from this drawing only.');return L.join('\n');
}
function scheduleHtml(){
  const d=scheduleData(),line=g=>`<div class="kv"><span>${g.q} × ${esc(CAT[g.t].n)}</span><b>${mm(g.w)}×${mm(g.d)}</b></div>`;
  return `<div class="sec sch"><h4>Rooms</h4>${d.rooms.map(r=>`<div class="kv"><span>${esc(r.n)}<br><small style="color:var(--ink2)">${r.f}</small></span><b>${r.a.toFixed(1)} m²</b></div>`).join('')||'<p class="note">No rooms yet.</p>'}
    <div class="kv"><span>Doors / windows</span><b>${d.doors} / ${d.wins}</b></div>
    <h4>Carpentry (mm)</h4>${d.carp.map(g=>line(g)+`<div class="kv" style="border:0;padding-top:0"><span style="color:var(--ink2)">Run length</span><b>${(g.q*g.w).toFixed(2)} m</b></div>`).join('')||'<p class="note">None placed.</p>'}
    <h4>Furniture (mm)</h4>${d.furn.map(line).join('')||'<p class="note">None placed.</p>'}
    <div class="acts"><button class="btn primary" data-act="copy">Copy list</button></div>
    <p class="note">Take this to your contractor. Dimensions come from the drawing only, so measure on site before ordering.</p><pre id="schedTxt" hidden>${esc(scheduleText())}</pre></div>`;
}
function copyText(txt,btn){
  const ok=()=>{const o=btn.textContent;btn.textContent='Copied';setTimeout(()=>btn.textContent=o,1400);};
  const fb=()=>{const t=document.createElement('textarea');t.value=txt;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy')&&ok();}catch(e){}t.remove();};
  try{navigator.clipboard.writeText(txt).then(ok,fb);}catch(e){fb();}
}

/* image underlay loading */
$('#imgIn').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){dialog(`<h2>PDF not supported here</h2><p class="note">Export the floor plan page as a PNG or JPG, or take a screenshot of it, then load that image.</p><div class="acts"><button class="btn" data-d="close">OK</button></div>`);return;}
  const fr=new FileReader();
  fr.onerror=()=>dialog(`<h2>Could not read that file</h2><p class="note">Try a JPG or PNG photo or scan.</p><div class="acts"><button class="btn" data-d="close">OK</button></div>`);
  fr.onload=()=>{const im=new Image();
    im.onerror=()=>dialog(`<h2>Could not read that image</h2><p class="note">Try a JPG or PNG photo or scan.</p><div class="acts"><button class="btn" data-d="close">OK</button></div>`);
    im.onload=()=>{const k=Math.min(1,2000/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);
      const w=12,h=w*c.height/c.width;under={src:c.toDataURL('image/jpeg',.85),x:view.cx-w/2,y:view.cy-h/2,w,h,rot:0,op:.65,show:true};underSrc='';saveUnder();
      if(S.walls.length||S.items.length)dialog(`<h2>Start from an empty plan?</h2><p class="note" style="margin:0 0 6px">Your current design would sit under the image you are tracing. Starting empty is easier. You can undo this.</p><div class="acts"><button class="btn primary" data-d="empty">Start empty</button><button class="btn" data-d="keep">Keep current design</button></div>`);
      else startTrace();};
    im.src=fr.result;};
  fr.readAsDataURL(f);
});

/* ───────── dialogs / header ───────── */
function dialog(html){$('#dcard').innerHTML=html;$('#dlg').classList.add('on');const f=$('#dcard input,#dcard textarea');if(f)f.focus();}
function closeDlg(){$('#dlg').classList.remove('on');}
$('#dlg').addEventListener('pointerdown',e=>{if(e.target.id==='dlg'){if(photoJob)photoJob.stop=true;closeDlg();}});
$('#dcard').addEventListener('click',e=>{
  const a=e.target.closest('[data-d]');if(!a)return;const k=a.dataset.d;
  if(k==='close')closeDlg();
  else if(k==='cancel'){calib=null;closeDlg();render2D();}
  else if(k==='empty'){newDesign(emptyDesign());closeDlg();startTrace();}
  else if(k==='keep'){closeDlg();startTrace();}
  else if(k==='scale'){const real=parseFloat($('#cd').value);if(!(real>=.1&&real<=200)){$('#cerr').textContent='Enter a distance in metres, for example 3.4.';return;}
    if(!calib||calib.length<2||!under){closeDlg();return;}const A=calib[0],B=calib[1],f=real/Math.hypot(B.x-A.x,B.y-A.y);
    under.x=A.x+(under.x-A.x)*f;under.y=A.y+(under.y-A.y)*f;under.w*=f;under.h*=f;calib=null;saveUnder();closeDlg();setTool('select');fitImage();renderTrace();}
  else if(k==='blank'){const w=clamp(parseFloat($('#bw').value)||8,3,30),d=clamp(parseFloat($('#bd').value)||10,3,30);newDesign(blank(sn(w,.1),sn(d,.1)));closeDlg();}
  else if(k==='rmmodel'){const id=a.dataset.id;idbDo('readwrite',st=>st.delete(id)).catch(()=>{});delete MODELS[id];const c=CAT['m:'+id];if(c){c.missing=1;c.n='Missing model';c.b=(g,w,d,cc,it)=>{const h=(it&&it.h)||.5;bx(g,w,h,d,0,h/2,0,'#c9b9a6',.9,0,{transparent:true,opacity:.5});};}
    modelRev++;buildLeft();dirty3=true;dirty=true;closeDlg();render2D();}
  else if(k==='copy')copyText($('#jt').value,a);
  else if(k==='load'){try{newDesign(loadState(JSON.parse($('#jt').value)));closeDlg();}catch(err){$('#jerr').textContent='That text is not a valid design. Paste the full text you copied from Save / load.';}}
});
function newDesign(o){checkpoint();S=loadState(o);sel=null;ms=[];structSig='';$('#pname').value=S.name;
  const r=S.rooms[0];if(S.rooms.length>1&&o.name.indexOf('sample')>=0){walk={x:5,y:7.4,yaw:0,pitch:-.02};}else if(r){walk={x:r.x+r.w/2,y:r.y+r.h/2,yaw:0,pitch:-.02};}
  resetOrbit();fit();changed();setMode(mode);}
$('#dcard').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){const p=$('#dcard .btn.primary');if(p)p.click();}});
/** Unit layouts redrawn from HDB brochures (layouts.js). Keeps the budget cap; the layout becomes the "original" for the Checks tab. */
const BRO=LAYOUTS;
{const g=$('#tplBro');const ks=Object.keys(BRO);if(ks.length)g.innerHTML=ks.map(k=>`<option value="b:${esc(k)}">${esc(BRO[k].label)}</option>`).join('');else g.remove();}
/** Flip the whole design left to right (many HDB units are the mirror image of the brochure's layout). Undoable. */
function mirrorDesign(){const xs=S.walls.flatMap(w=>[w.x1,w.x2]).concat(S.rooms.flatMap(r=>[r.x,r.x+r.w]));if(!xs.length){toast('Nothing to mirror yet.');return;}
  const M=Math.min(...xs)+Math.max(...xs),X=x=>+(M-x).toFixed(3);
  mut(()=>{S.walls.forEach(w=>{w.x1=X(w.x1);w.x2=X(w.x2);});
    S.rooms.forEach(r=>{if(r.pts){r.pts=r.pts.map(q=>[X(q[0]),q[1]]).reverse();syncBox(r);}else r.x=X(r.x+r.w);});
    S.openings.forEach(o=>{if(o.axis==='h')o.p=X(o.p);else{o.c=X(o.c);o.flip=-(o.flip||-1);}});
    S.items.forEach(i=>{i.x=X(i.x);i.rot=(360-i.rot)%360;});
    S.dims.forEach(d=>{d.x1=X(d.x1);d.x2=X(d.x2);d.o=-d.o;});
    if(S.base){S.base.walls.forEach(w=>{w.x1=X(w.x1);w.x2=X(w.x2);});S.base.wet.forEach(w=>{w.x=X(w.x);});S.base.ops.forEach(o=>{if(o.axis==='h')o.p=X(o.p);else o.c=X(o.c);});}});
  fit();toast('Mirrored. Undo to switch back.');}
function loadBrochure(k){const L=BRO[k];if(!L)return false;const cap=S&&S.budget;newDesign(JSON.parse(JSON.stringify(L.design)));S.base=snapBase();if(cap)S.budget=cap;changed();
  toast(`${L.label}: ${L.area}. Redrawn from HDB's brochure, so check it against your unit's plan.`,5200);return true;}
$('#tpl').addEventListener('change',e=>{const v=e.target.value;e.target.value='';if(v.startsWith('b:')){loadBrochure(v.slice(2));return;}if(v==='mirror'){mirrorDesign();return;}if(v==='p3'||v==='p5'){newDesign(hdbPreset(v==='p3'?3:5));toast('Generic layout, not a real HDB plan. Redraw it to match yours.',4200);return;}
  if(v==='empty')newDesign(emptyDesign());
  if(v==='s4')newDesign(sample());
  else if(v==='blank')dialog(`<h2>Blank flat</h2><p class="note" style="margin:0 0 12px">Enter the outer size from your floor plan. It starts as one room with four outer walls and a front door. Draw the rest yourself.</p>
    <div class="pair"><label class="row" style="grid-template-columns:1fr"><span>Width (m)</span><input id="bw" type="number" value="9" step=".1" min="3" max="30"></label><label class="row" style="grid-template-columns:1fr"><span>Depth (m)</span><input id="bd" type="number" value="10" step=".1" min="3" max="30"></label></div>
    <div class="acts"><button class="btn primary" data-d="blank">Create</button><button class="btn" data-d="close">Cancel</button></div>`);});
$('#bExport').addEventListener('click',openExport);
$('#bUndo').addEventListener('click',undo);$('#bRedo').addEventListener('click',redo);
$('#pname').addEventListener('change',e=>{mut(()=>{S.name=e.target.value.slice(0,60)||'My flat';});});
$$('#viewSeg button').forEach(b=>b.addEventListener('click',()=>{$('#stage').dataset.view=b.dataset.v;$$('#viewSeg button').forEach(x=>x.setAttribute('aria-pressed',x===b));setTimeout(()=>{render2D();resize3D();},30);}));
$$('#modeSeg button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.m)));
$('#cut').addEventListener('change',e=>{cut=e.target.checked;dirty3=true;dirty=true;});
$('#tod').addEventListener('input',e=>{env.hour=+e.target.value;const hh=Math.floor(env.hour),mi=Math.round((env.hour-hh)*60);$('#todT').textContent=String(hh).padStart(2,'0')+':'+String(mi).padStart(2,'0');applyEnv();});
const COMP=['N','NE','E','SE','S','SW','W','NW'];
function northLbl(){return COMP[Math.round(env.north/45)%8]+' '+env.north+'°';}
$('#north').value=env.north;$('#northT').textContent=northLbl();
$('#north').addEventListener('input',e=>{env.north=+e.target.value;$('#northT').textContent=northLbl();try{localStorage.setItem('flatstudio.north',env.north);}catch(x){}applyEnv();});
$('#lampSel').addEventListener('change',e=>{env.lamps=e.target.value;applyEnv();});
$('#rView').addEventListener('click',()=>{resetOrbit();if(mode==='orbit')updateOrbit();});
const act=(id,fn)=>{const el=$(id);el.addEventListener('click',fn);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}});};
act('#zIn',()=>zoomAt(svg.getBoundingClientRect().left+svg.clientWidth/2,svg.getBoundingClientRect().top+svg.clientHeight/2,view.s*1.3));
act('#zOut',()=>zoomAt(svg.getBoundingClientRect().left+svg.clientWidth/2,svg.getBoundingClientRect().top+svg.clientHeight/2,view.s/1.3));
act('#zFit',fit);
act('#snapChip',()=>{snapG=snapG===.1?.05:.1;$('#snapChip').textContent='Snap '+(snapG*100)+' cm';});
function setTab(t){$('#app').dataset.tab=t;$$('.mtabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));setTimeout(()=>{render2D();resize3D();dirty=true;},30);}
$$('.mtabs button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.t)));

/* keyboard */
addEventListener('keydown',e=>{
  if(drag&&drag.k==='wall'&&draft){
    if(/^[0-9.]$/.test(e.key)){e.preventDefault();draft.typed=(draft.typed||'')+e.key;render2D();return;}
    if(e.key==='Backspace'&&draft.typed){e.preventDefault();draft.typed=draft.typed.slice(0,-1);render2D();return;}
    if(e.key==='Enter'&&draft.typed){e.preventDefault();const L=parseFloat(draft.typed),dx=draft.x2-draft.x1,dy=draft.y2-draft.y1,cur=Math.hypot(dx,dy)||1;
      if(L>=.1&&L<=80){const ux=dx/cur,uy=dy/cur;if(cur<.05){draft.x2=draft.x1+L;draft.y2=draft.y1;}else{draft.x2=+(draft.x1+ux*L).toFixed(3);draft.y2=+(draft.y1+uy*L).toFixed(3);}
        checkpoint();S.walls.push({id:uid(),x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,fin:'paint',col:'',str:false,th:0});toast(`Wall ${L} m added`);}
      draft=null;drag=null;changed();return;}
    if(e.key==='Escape'){draft=null;drag=null;render2D();return;}
  }
  const tg=e.target.tagName;if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT')return;
  if(e.key==='Escape'){if($('#dlg').classList.contains('on'))closeDlg();else if(polyDraft){polyDraft=null;render2D();}else{if(tool!=='select')setTool('select');else select(null);}return;}
  const k=e.key.length===1?e.key.toLowerCase():e.key;
  if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();redo();return;}
  if(mode==='walk'&&['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)){e.preventDefault();keys.add(k);return;}
  const cm=e.ctrlKey||e.metaKey;
  if(polyDraft&&k==='Enter'){polyFinish();return;}
  if(cm&&k==='a'){e.preventDefault();setMulti(S.items.map(i=>({t:'item',id:i.id})));return;}
  if(cm&&k==='c'){const l=curList().filter(m=>['item','wall','room','dim'].includes(m.t));if(l.length){clip=entsOf(l);pasteN=0;}return;}
  if(cm&&k==='v'){if(clip){e.preventDefault();mut(()=>{pasteN++;setSelQuiet(cloneEnts(clip,.5*pasteN,.5*pasteN));});}return;}
  if(ms.length){
    if(k==='Delete'||k==='Backspace'){e.preventDefault();mut(delSel);}
    else if(cm&&k==='d'){e.preventDefault();multiAct('m_dup');}
    else if(cm&&k==='g'){e.preventDefault();multiAct(e.shiftKey?'m_ungroup':'m_group');}
    else if(k==='r')multiAct('m_rot');
    else if(k.startsWith('Arrow')){e.preventDefault();const st=e.shiftKey?.25:.05,dx=k==='ArrowLeft'?-st:k==='ArrowRight'?st:0,dy=k==='ArrowUp'?-st:k==='ArrowDown'?st:0;
      mut(()=>{const d=gmStart({x:0,y:0});gmApply(d,dx,dy);});}
    return;}
  if(!sel)return;
  const it=sel.t==='item'&&getE('item',sel.id);
  if(k==='Delete'||k==='Backspace'){e.preventDefault();mut(delSel);}
  else if(it&&k==='r'){mut(()=>{it.rot=(it.rot+(e.shiftKey?15:90))%360;});}
  else if(it&&(e.ctrlKey||e.metaKey)&&k==='d'){e.preventDefault();mut(()=>{const c=Object.assign({},it,{id:uid(),x:it.x+.3,y:it.y+.3});S.items.push(c);sel={t:'item',id:c.id};});}
  else if(it&&k.startsWith('Arrow')){e.preventDefault();mut(()=>{const s=e.shiftKey?.25:.05;if(k==='ArrowLeft')it.x-=s;if(k==='ArrowRight')it.x+=s;if(k==='ArrowUp')it.y-=s;if(k==='ArrowDown')it.y+=s;it.x=sn(it.x,.05);it.y=sn(it.y,.05);});}
});
addEventListener('keyup',e=>{keys.delete(e.key.length===1?e.key.toLowerCase():e.key);});
addEventListener('blur',()=>keys.clear());
new ResizeObserver(()=>render2D()).observe($('#planPane'));

/* ───────── file helpers: zip, pdf, dxf, save ───────── */
const te=new TextEncoder();
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=u=>{let c=~0;for(let i=0;i<u.length;i++)c=crcT[(c^u[i])&255]^(c>>>8);return (~c)>>>0;};
function zipStore(files){
  const parts=[],cen=[];let off=0;const w16=v=>[v&255,v>>8&255],w32=v=>[v&255,v>>8&255,v>>16&255,v>>>24&255];
  for(const f of files){const nm=te.encode(f.name),crc=crc32(f.data),sz=f.data.length;
    const lh=Uint8Array.from([0x50,0x4b,3,4,...w16(20),...w16(0),...w16(0),...w16(0),...w16(0x21),...w32(crc),...w32(sz),...w32(sz),...w16(nm.length),...w16(0)]);
    parts.push(lh,nm,f.data);
    cen.push(Uint8Array.from([0x50,0x4b,1,2,...w16(20),...w16(20),...w16(0),...w16(0),...w16(0),...w16(0x21),...w32(crc),...w32(sz),...w32(sz),...w16(nm.length),...w16(0),...w16(0),...w16(0),...w16(0),...w32(0),...w32(off)]),nm);
    off+=lh.length+nm.length+sz;}
  let cl=0;cen.forEach(c=>cl+=c.length);
  const end=Uint8Array.from([0x50,0x4b,5,6,...w16(0),...w16(0),...w16(files.length),...w16(files.length),...w32(cl),...w32(off),...w16(0)]);
  return new Blob([...parts,...cen,end],{type:'application/zip'});}
const pdfTxt=t=>String(t).replace(/×/g,'x').replace(/²/g,'2').replace(/°/g,' deg').replace(/[–—]/g,'-').replace(/[^\x20-\x7e]/g,'?').replace(/([\\()])/g,'\\$1');
function b64bytes(u){const b=atob(u.split(',')[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
/* pages: [{w,h,img:{url,w,h,x,y,dw,dh}|null,text:[{x,y,s,t,b}]}] */
function pdfBuild(pages){
  const chunks=[],offs=[];let pos=0;const push=b=>{if(typeof b==='string')b=te.encode(b);chunks.push(b);pos+=b.length;};
  const obj=(n,fn)=>{offs[n]=pos;push(`${n} 0 obj\n`);fn();push('\nendobj\n');};
  push('%PDF-1.4\n');const N=4+pages.length*3;
  obj(1,()=>push('<</Type/Catalog/Pages 2 0 R>>'));
  obj(2,()=>push(`<</Type/Pages/Count ${pages.length}/Kids[${pages.map((_,i)=>`${5+i*3} 0 R`).join(' ')}]>>`));
  obj(3,()=>push('<</Type/Font/Subtype/Type1/BaseFont/Courier>>'));obj(4,()=>push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>'));
  pages.forEach((p,i)=>{const pg=5+i*3,ct=6+i*3,im=7+i*3;let c='';
    if(p.img)c+=`q ${p.img.dw.toFixed(2)} 0 0 ${p.img.dh.toFixed(2)} ${p.img.x.toFixed(2)} ${p.img.y.toFixed(2)} cm /Im0 Do Q\n`;
    for(const t of p.text||[])c+=`BT /${t.b?'F2':'F1'} ${t.s} Tf ${t.x.toFixed(1)} ${t.y.toFixed(1)} Td (${pdfTxt(t.t)}) Tj ET\n`;
    obj(pg,()=>push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${p.w} ${p.h}]/Contents ${ct} 0 R/Resources<</Font<</F1 3 0 R/F2 4 0 R>>${p.img?`/XObject<</Im0 ${im} 0 R>>`:''}>>>>`));
    obj(ct,()=>{const b=te.encode(c);push(`<</Length ${b.length}>>\nstream\n`);push(b);push('\nendstream');});
    if(p.img){const d=b64bytes(p.img.url);obj(im,()=>{push(`<</Type/XObject/Subtype/Image/Width ${p.img.w}/Height ${p.img.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${d.length}>>\nstream\n`);push(d);push('\nendstream');});}
    else{obj(im,()=>push('<<>>'));}});
  const xr=pos;push(`xref\n0 ${N+1}\n0000000000 65535 f \n`);for(let i=1;i<=N;i++)push(String(offs[i]).padStart(10,'0')+' 00000 n \n');
  push(`trailer\n<</Size ${N+1}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});}
/* DXF R12 in millimetres */
function dxfBuild(){
  const L=[],layers={WALLS:7,DOORS:3,WINDOWS:5,ROOMS:8,FURNITURE:2,TEXT:7,DIMS:1};
  const g=(c,v)=>L.push(String(c),String(v)),M=v=>+(v*1000).toFixed(1);
  g(0,'SECTION');g(2,'HEADER');g(9,'$ACADVER');g(1,'AC1009');g(0,'ENDSEC');
  g(0,'SECTION');g(2,'TABLES');g(0,'TABLE');g(2,'LAYER');g(70,Object.keys(layers).length);
  for(const [n,c] of Object.entries(layers)){g(0,'LAYER');g(2,n);g(70,0);g(62,c);g(6,'CONTINUOUS');}
  g(0,'ENDTAB');g(0,'ENDSEC');g(0,'SECTION');g(2,'ENTITIES');
  const line=(ly,x1,y1,x2,y2)=>{g(0,'LINE');g(8,ly);g(10,M(x1));g(20,M(-y1));g(30,0);g(11,M(x2));g(21,M(-y2));g(31,0);};
  const poly=(ly,pts)=>pts.forEach((p,i)=>{const q=pts[(i+1)%pts.length];line(ly,p[0],p[1],q[0],q[1]);});
  const text=(ly,x,y,h,t,rot=0)=>{g(0,'TEXT');g(8,ly);g(10,M(x));g(20,M(-y));g(30,0);g(40,M(h));g(1,pdfTxt(t).replace(/\\/g,''));if(rot){g(50,rot);}};
  const arc=(x,y,r,a0,a1)=>{g(0,'ARC');g(8,'DOORS');g(10,M(x));g(20,M(-y));g(30,0);g(40,M(r));g(50,a0);g(51,a1);};
  const arcA=(a,b)=>((b-a+360)%360===90)?[a,b]:[b,a];
  for(const r of S.rooms){poly('ROOMS',rpts(r));const c=rcent(r);text('TEXT',c.x-.6,c.y,.15,r.name);text('TEXT',c.x-.6,c.y+.25,.12,area(r).toFixed(1)+' m2');}
  for(const w of S.walls){const wi=wallInfo(w),T=wi.th;
    if(wi.axis==='a'){const c=Math.cos(wi.ang),s=Math.sin(wi.ang),h=T/2,P=(u,v)=>[w.x1+c*u-s*v,w.y1+s*u+c*v];poly('WALLS',[P(-h,-h),P(wi.len+h,-h),P(wi.len+h,h),P(-h,h)]);continue;}
    for(const [a,b] of wi.segs){if(wi.axis==='h')poly('WALLS',[[a,wi.c-T/2],[b,wi.c-T/2],[b,wi.c+T/2],[a,wi.c+T/2]]);else poly('WALLS',[[wi.c-T/2,a],[wi.c+T/2,a],[wi.c+T/2,b],[wi.c-T/2,b]]);}
    for(const o of wi.ops){const lo=o.p-o.w/2,hi=o.p+o.w/2,f=o.flip||-1,h=wi.axis==='h';
      const P=(u,n)=>h?[u,wi.c+n]:[wi.c+n,u];
      if(o.kind==='window'){const a=P(lo,-T/2),b=P(hi,-T/2),c=P(lo,T/2),d=P(hi,T/2),m1=P(lo,0),m2=P(hi,0);line('WINDOWS',a[0],a[1],c[0],c[1]);line('WINDOWS',b[0],b[1],d[0],d[1]);line('WINDOWS',m1[0],m1[1],m2[0],m2[1]);}
      else{const dt=o.dt||'single';
        if(dt==='single'||dt==='double'){const half=dt==='double'?o.w/2:o.w,hs=dt==='double'?[[lo,1],[hi,-1]]:[[lo,1]];
          for(const [hu,dir] of hs){const A=P(hu,0),B=P(hu,f*half);line('DOORS',A[0],A[1],B[0],B[1]);
            const cl=h?(dir>0?0:180):(dir>0?270:90),op=h?(f>0?270:90):(f>0?0:180);const [a0,a1]=arcA(cl%360,op%360);arc(A[0],A[1],half,a0,a1);}}
        else{const a=P(lo,0),b=P(hi,0);line('DOORS',a[0],a[1],b[0],b[1]);}}}}
  for(const it of S.items){const k=CAT[it.type];if(!k)continue;const a=it.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a),R=(x,y)=>[it.x+x*c-y*s,it.y+x*s+y*c],hw=it.w/2,hd=it.d/2;
    poly('FURNITURE',[R(-hw,-hd),R(hw,-hd),R(hw,hd),R(-hw,hd)]);text('TEXT',it.x-hw*.8,it.y,Math.min(.1,it.w*.18),k.n);}
  for(const d of S.dims){const dx=d.x2-d.x1,dy=d.y2-d.y1,Ln=Math.hypot(dx,dy),ux=dx/Ln,uy=dy/Ln,nx=-uy*d.o,ny=ux*d.o;
    line('DIMS',d.x1,d.y1,d.x1+nx,d.y1+ny);line('DIMS',d.x2,d.y2,d.x2+nx,d.y2+ny);line('DIMS',d.x1+nx,d.y1+ny,d.x2+nx,d.y2+ny);
    text('DIMS',(d.x1+d.x2)/2+nx,(d.y1+d.y2)/2+ny-.05,.12,Ln.toFixed(2)+' m');}
  g(0,'ENDSEC');g(0,'EOF');return L.join('\n')+'\n';}
/* saving */
const capCache={};
function capUse(n){if(capCache[n])return capCache[n];let p;try{p=(window.claude&&window.claude.use)?Promise.resolve(window.claude.use(n)).catch(()=>null):Promise.resolve(null);}catch(e){p=Promise.resolve(null);}return capCache[n]=p;}
async function saveFile(name,data){
  const dl=await capUse('downloads');
  if(dl){try{await dl.save({filename:name,data});toast('Saved '+name);}catch(e){if(e&&e.code==='declined')return;toast('Could not save '+name+(e&&e.message?': '+e.message:''),4000);}return;}
  try{const blob=data instanceof Blob?data:new Blob([data]);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Downloading '+name);}catch(e){toast('Saving files is not available here.');}}

/* ───────── drawings: plan svg, elevations, export dialog ───────── */
const EXP_VARS='--paper:#ffffff;--ink:#14242a;--ink2:#54686f;--accent:#17707a;--sel:#d98c00;--danger:#b3372f;--wall:#14242a;--grid:#e3eaea;--grid2:#d3dddd;--room-op:.55;--f-mono:Menlo,Consolas,monospace;--f-display:Arial,Helvetica,sans-serif;';
function planCss(f){let css='';$$('style').forEach(st=>{st.textContent.split('\n').forEach(l=>{if(/^#plan\s/.test(l))css+=l.replace(/^#plan\s+/,'')+'\n';});});
  return css.replace(/stroke-width:([\d.]+)px/g,(m,n)=>`stroke-width:${(n*f).toFixed(2)}px`);}
function planSvgString(wpx,mmWidth){
  const r=planMarkup(true),v=r.vb.split(' ').map(Number),hpx=Math.round(wpx*v[3]/v[2]),f=wpx/1000;
  const tot=S.rooms.reduce((a,q)=>a+area(q),0);
  const sz=mmWidth?`width="${mmWidth.toFixed(1)}mm" height="${(mmWidth*v[3]/v[2]).toFixed(1)}mm"`:`width="${wpx}" height="${hpx}"`;
  const svgS=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.vb}" ${sz}><style>svg,:root{${EXP_VARS}}${planCss(f)}</style><rect x="${v[0]}" y="${v[1]}" width="${v[2]}" height="${v[3]}" fill="#fff"/>${r.h}<text x="${v[0]+.3}" y="${v[1]+v[3]-.3}" style="font-size:.26px;font-family:Arial,sans-serif;font-weight:bold;fill:#14242a">${esc(S.name)}</text><text x="${v[0]+.3}" y="${v[1]+v[3]-.05}" style="font-size:.17px;font-family:Arial,sans-serif;fill:#54686f">Floor area ${tot.toFixed(1)} m2. Ceiling ${S.H.toFixed(2)} m.</text></svg>`;
  return {svg:svgS,w:wpx,h:hpx,vw:v[2],vh:v[3]};}
function svgToCanvas(str,w,h){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);res(c);};im.onerror=()=>rej(new Error('Could not draw the plan.'));im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(str);});}
const cvBlob=(c,t='image/png')=>new Promise(r=>c.toBlob(r,t,.92));
/* elevations */
function itemYRange(it){const e=itemMap.get(it.id);if(e){e.g.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(e.g);if(isFinite(b.min.y)&&isFinite(b.max.y))return [Math.max(0,b.min.y),Math.min(S.H,Math.max(b.max.y,b.min.y+.02))];}return [0,.8];}
const compass=(fx,fy)=>Math.abs(fx)<.25?(fy<0?'north':'south'):Math.abs(fy)<.25?(fx>0?'east':'west'):'angled';
function elevPanels(){const out=[];
  for(const r of S.rooms){const P=rpts(r);
    for(let i=0;i<P.length;i++){const A=P[i],B=P[(i+1)%P.length],L=Math.hypot(B[0]-A[0],B[1]-A[1]);if(L<.6)continue;
      const ex=(B[0]-A[0])/L,ey=(B[1]-A[1])/L;let nx=ey,ny=-ex;const mx=(A[0]+B[0])/2,my=(A[1]+B[1])/2;if(!pip(mx+nx*.1,my+ny*.1,P)){nx=-nx;ny=-ny;}
      const rx=ny,ry=-nx,u0=Math.min(A[0]*rx+A[1]*ry,B[0]*rx+B[1]*ry),d0=A[0]*nx+A[1]*ny,U=(x,y)=>x*rx+y*ry-u0,D=(x,y)=>x*nx+y*ny-d0;
      const ops=[];for(const o of S.openings){const M=o.axis==='h'?[o.p,o.c]:[o.c,o.p];if(Math.abs(D(M[0],M[1]))<.08){const u=U(M[0],M[1]);if(u>-.05&&u<L+.05)ops.push({u,w:o.w,kind:o.kind,wt:o.wt,dt:o.dt});}}
      const its=[];for(const it of S.items){const k=CAT[it.type];if(!k||k.flat)continue;const a=it.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);let u1=1e9,u2=-1e9,d1=1e9,d2=-1e9;
        for(const [qx,qy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const px=it.x+qx*it.w/2*c-qy*it.d/2*s,py=it.y+qx*it.w/2*s+qy*it.d/2*c,uu=U(px,py),dd=D(px,py);u1=Math.min(u1,uu);u2=Math.max(u2,uu);d1=Math.min(d1,dd);d2=Math.max(d2,dd);}
        if(d2>-.05&&d1<1.0&&u2>.05&&u1<L-.05){const [z0,z1]=itemYRange(it);its.push({u1:Math.max(0,u1),u2:Math.min(L,u2),z0,z1,d:d1,c:it.color,n:k.n});}}
      out.push({title:`${r.name}, ${compass(-nx,-ny)} wall`,L,H:S.H,ops,its});}}
  return out;}
function elevPanelSvg(p,ox,oy){const H=p.H,L=p.L,sk='stroke="#14242a"';let s=`<g transform="translate(${ox} ${oy})" font-family="Arial,Helvetica,sans-serif">`;
  s+=`<text x="0" y="-.2" font-size=".2" font-weight="bold" fill="#14242a">${esc(p.title)}</text><rect x="0" y="0" width="${L}" height="${H}" fill="#fafafa" ${sk} stroke-width=".02"/>`;
  for(const o of p.ops){const x0=o.u-o.w/2;
    if(o.kind==='door'){const dh=o.dt==='arch'?2.3:DH;s+=`<rect x="${x0}" y="${H-dh}" width="${o.w}" height="${dh}" fill="#e6dccb" ${sk} stroke-width=".02"/>`;if(o.dt==='double')s+=`<line x1="${o.u}" y1="${H-dh}" x2="${o.u}" y2="${H}" ${sk} stroke-width=".015"/>`;}
    else{const wt=WTYPES[o.wt]||WTYPES.std,top=Math.min(wt.sill+wt.wh,H-.1);s+=`<rect x="${x0}" y="${H-top}" width="${o.w}" height="${top-wt.sill}" fill="#cfe6ee" ${sk} stroke-width=".02"/>`;if(o.w>1.4||o.wt==='slide')s+=`<line x1="${o.u}" y1="${H-top}" x2="${o.u}" y2="${H-wt.sill}" ${sk} stroke-width=".015"/>`;}}
  for(const it of p.its.slice().sort((a,b)=>b.d-a.d)){s+=`<rect x="${it.u1}" y="${H-it.z1}" width="${it.u2-it.u1}" height="${it.z1-it.z0}" fill="${it.c}" fill-opacity=".85" ${sk} stroke-width=".012"/>`;
    if(it.u2-it.u1>.45&&it.z1-it.z0>.2)s+=`<text x="${(it.u1+it.u2)/2}" y="${H-(it.z0+it.z1)/2}" font-size=".09" text-anchor="middle" fill="#14242a">${esc(it.n)}</text>`;}
  s+=`<line x1="0" y1="${H}" x2="${L}" y2="${H}" ${sk} stroke-width=".05"/>`;
  s+=`<path d="M0 ${H+.28}H${L}M0 ${H+.2}V${H+.36}M${L} ${H+.2}V${H+.36}M${L+.28} 0V${H}M${L+.2} 0H${L+.36}M${L+.2} ${H}H${L+.36}" stroke="#54686f" stroke-width=".012" fill="none"/><text x="${L/2}" y="${H+.5}" font-size=".14" text-anchor="middle" fill="#54686f">${L.toFixed(2)} m</text><text transform="translate(${L+.5} ${H/2}) rotate(-90)" font-size=".14" text-anchor="middle" fill="#54686f">${H.toFixed(2)} m</text></g>`;
  return s;}
function elevSheetSvg(panels,wpx){let x=.6,y=.9,rowH=0,maxW=0,body='';const WMAX=22;
  for(const p of panels){const pw=p.L+1.2,ph=p.H+1.3;if(x+pw>WMAX&&x>.6){x=.6;y+=rowH;rowH=0;}body+=elevPanelSvg(p,x,y);x+=pw;rowH=Math.max(rowH,ph);maxW=Math.max(maxW,x);}
  const W=Math.max(maxW+.2,6),Hh=y+rowH+.3,hp=Math.round(wpx*Hh/W);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${wpx}" height="${hp}"><rect width="${W}" height="${Hh}" fill="#fff"/><text x=".6" y=".45" font-family="Arial" font-size=".24" font-weight="bold" fill="#14242a">${esc(S.name)} - elevations</text><text x="${W-.3}" y=".45" font-family="Arial" font-size=".14" text-anchor="end" fill="#54686f">Seen from inside each room. Plan top is north. Metres.</text>${body}</svg>`,w:wpx,h:hp};}
/* export dialog */
function openExport(){
  dialog(`<h2>Export</h2><p class="note" style="margin:0 0 12px">Drawings are made from the current design. Your browser asks you to confirm each save.</p>
    <div class="exg"><button class="btn" data-ex="png">Plan image (PNG)</button><button class="btn" data-ex="svg">Plan drawing (SVG)</button><button class="btn" data-ex="pdf">Drawing pack (PDF)</button><button class="btn" data-ex="dxf">CAD file (DXF in ZIP)</button><button class="btn" data-ex="png3d">3D view (PNG)</button><button class="btn" data-ex="elev">View elevations</button><button class="btn" data-ex="json">Design file (JSON)</button></div>
    <div class="pair" style="margin-top:14px"><label class="row" style="grid-template-columns:1fr"><span>SVG scale</span><select id="exs"><option value="50">1:50</option><option value="100">1:100</option></select></label><label class="row" style="grid-template-columns:1fr"><span>PDF paper</span><select id="exp"><option value="a3">A3 landscape</option><option value="a4">A4 landscape</option></select></label></div>
    <p class="note">The PDF has the plan, elevations, schedule${typeof budgetText==='function'?', budget':''}${typeof checksText==='function'?' and checks':''}. DXF units are millimetres.</p><div class="acts"><button class="btn" data-d="close">Close</button></div>`);}
const safeName=()=>(S.name||'flat').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,40)||'flat';
async function doExport(k){
  try{
    if(k==='json')return saveFile(safeName()+'.json',JSON.stringify(S,null,1));
    if(k==='svg'){const sc=+($('#exs')&&$('#exs').value||50),b=bounds();return saveFile(safeName()+'-plan.svg',planSvgString(2000,(b.w+3.6)*1000/sc).svg);}
    if(k==='png'){toast('Rendering…',1500);const r=planSvgString(2600),c=await svgToCanvas(r.svg,r.w,r.h);return saveFile(safeName()+'-plan.png',await cvBlob(c));}
    if(k==='png3d'){if(!renderer){toast('The 3D view is not available.');return;}const w0=Math.round(1800),h0=Math.round(1800*(camera.aspect<1?1.3:.62));renderer.setSize(w0,h0,false);camera.aspect=w0/h0;camera.updateProjectionMatrix();renderer.render(scene,camera);const bl=await new Promise(r=>$('#gl').toBlob(r,'image/png'));resize3D();return saveFile(safeName()+'-3d.png',bl);}
    if(k==='dxf'){const dx=dxfBuild();return saveFile(safeName()+'-cad.zip',zipStore([{name:safeName()+'.dxf',data:te.encode(dx)}]));}
    if(k==='elev'){const ps=elevPanels();if(!ps.length){toast('Add rooms first. Elevations are drawn for each room wall.');return;}const sh=elevSheetSvg(ps,1400);
      dialog(`<h2>Elevations</h2><div style="overflow:auto;max-height:62vh;border:1px solid var(--line);border-radius:8px">${sh.svg.replace(/width="\d+" height="\d+"/,'style="width:100%;min-width:900px;height:auto"')}</div><div class="acts"><button class="btn primary" data-ex="elevpng">Save as PNG</button><button class="btn" data-ex="elevsvg">Save as SVG</button><button class="btn" data-d="close">Close</button></div>`);return;}
    if(k==='elevpng'||k==='elevsvg'){const ps=elevPanels(),sh=elevSheetSvg(ps,k==='elevpng'?2600:1600);if(k==='elevsvg')return saveFile(safeName()+'-elevations.svg',sh.svg);return saveFile(safeName()+'-elevations.png',await cvBlob(await svgToCanvas(sh.svg,sh.w,sh.h)));}
    if(k==='pdf'){toast('Building PDF…',2500);return saveFile(safeName()+'-pack.pdf',await buildPdf());}
  }catch(e){toast('Export failed: '+(e&&e.message||e),4500);}
}
async function buildPdf(){
  const a3=($('#exp')&&$('#exp').value)!=='a4',pw=a3?1191:842,ph=a3?842:595,pages=[],date=new Date().toLocaleDateString(),M=36;
  const fitImg=(cv,top)=>{const u=cv.toDataURL('image/jpeg',.9),aw=pw-2*M,ah=ph-M-top,k=Math.min(aw/cv.width,ah/cv.height),dw=cv.width*k,dh=cv.height*k;return {url:u,w:cv.width,h:cv.height,x:(pw-dw)/2,y:M+(ah-dh)/2,dw,dh};};
  const pr=planSvgString(2600),pc=await svgToCanvas(pr.svg,pr.w,pr.h),im=fitImg(pc,M+34),ratio=Math.round(pr.vw*1000/(im.dw/72*25.4));
  pages.push({w:pw,h:ph,img:im,text:[{x:M,y:ph-M-14,s:16,t:S.name,b:1},{x:M,y:ph-M-28,s:9,t:`Floor plan. About 1:${ratio} at this paper size. ${date}`}]});
  const ps=elevPanels();for(let i=0;i<ps.length;i+=6){const sh=elevSheetSvg(ps.slice(i,i+6),2400),c=await svgToCanvas(sh.svg,sh.w,sh.h);pages.push({w:pw,h:ph,img:fitImg(c,M+10),text:[{x:M,y:ph-M+2,s:9,t:`Elevations, sheet ${i/6+1}. ${S.name}. ${date}`}]});}
  let txt=scheduleText();if(typeof budgetText==='function')txt+='\n\n'+budgetText();if(typeof checksText==='function')txt+='\n\n'+checksText();
  const lines=[];txt.split('\n').forEach(l=>{l=l.replace(/\t/g,'  ');while(l.length>100){lines.push(l.slice(0,100));l='    '+l.slice(100);}lines.push(l);});
  for(let i=0;i<lines.length;i+=62){pages.push({w:595,h:842,img:null,text:lines.slice(i,i+62).map((t,j)=>({x:40,y:802-j*12.2,s:8.5,t}))});}
  return pdfBuild(pages);}
$('#dcard').addEventListener('click',e=>{const b=e.target.closest('[data-ex]');if(b)doExport(b.dataset.ex);});

/* ───────── budget ───────── */
const money=v=>'$'+(Math.round(v*100)/100).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
function budgetLines(){const L=[],cnt={};S.items.forEach(i=>{if(i.pr>0)return;cnt[i.type]=(cnt[i.type]||0)+1;});
  Object.keys(cnt).filter(t=>CAT[t]&&!CAT[t].svc&&!CAT[t].missing).sort((a,b)=>CAT[a].n.localeCompare(CAT[b].n)).forEach(t=>L.push({key:'i:'+t,name:CAT[t].n,qty:cnt[t],unit:'each'}));
  S.items.filter(i=>i.pr>0&&CAT[i.type]&&!CAT[i.type].svc&&!CAT[i.type].missing).forEach(i=>L.push({key:'p:'+i.id,name:(i.nm||CAT[i.type].n),qty:1,unit:'each, your price',fixed:i.pr}));
  const fa={};S.rooms.forEach(r=>fa[r.floor]=(fa[r.floor]||0)+area(r));Object.keys(fa).forEach(f=>L.push({key:'f:'+f,name:'Floor: '+FLOORS[f].n,qty:+fa[f].toFixed(2),unit:'m²'}));
  const d=S.openings.filter(o=>o.kind==='door').length,w=S.openings.filter(o=>o.kind==='window').length;if(d)L.push({key:'door',name:'Doors',qty:d,unit:'each'});if(w)L.push({key:'window',name:'Windows',qty:w,unit:'each'});
  const wf={};S.walls.forEach(x=>{const f=x.fin||'paint';if(f!=='paint')wf[f]=(wf[f]||0)+Math.hypot(x.x2-x.x1,x.y2-x.y1)*S.H;});Object.keys(wf).forEach(f=>L.push({key:'w:'+f,name:'Wall finish: '+FINS[f]+' (one face)',qty:+wf[f].toFixed(2),unit:'m²'}));
  return L;}
/** Read by the BTO money plan (same site): renovation = floors, wall finishes, doors, windows, built-in carpentry, bathroom fittings and other costs; furniture = everything else you place. */
const RENO_ITEMS=new Set(['ward','wardS','shoe','tvwall','cab','sink','hob','over','oventw','corner','island','pantry','wc','vanity','dvanity','shower','bathtub','heater']);
function budgetSummary(){let furniture=0,reno=0;for(const l of budgetLines()){const v=l.qty*(l.fixed??(S.prices[l.key]||0));const it=l.key.startsWith('p:')?S.items.find(i=>i.id===l.key.slice(2)):null,t=it?it.type:l.key.startsWith('i:')?l.key.slice(2):null;if(t&&!RENO_ITEMS.has(t))furniture+=v;else reno+=v;}for(const x of S.extras)reno+=+x.amt||0;return {name:S.name,furniture:Math.round(furniture),reno:Math.round(reno),cap:S.budget||0,at:Date.now()};}
function budgetTotal(){let t=0;for(const l of budgetLines())t+=l.qty*(l.fixed??(S.prices[l.key]||0));for(const x of S.extras)t+=+x.amt||0;return t;}
function budgetHtml(){const L=budgetLines(),tot=budgetTotal(),cap=S.budget||0,diff=cap-tot;
  return `<div class="sec"><h3>Budget</h3><p class="note" style="margin-top:0">Enter your own unit prices from quotes. Nothing is pre-filled.</p>${row('Budget cap ($)',`<input type="number" data-bcap="1" value="${cap||''}" min="0" step="any" inputmode="decimal" placeholder="optional">`)}
    <div style="height:8px"></div>${L.map(l=>l.fixed!==undefined?`<div class="bl"><span>${esc(l.name)}<small>${l.qty} ${l.unit}</small></span><span style="text-align:right;color:var(--ink2)">set on item</span><b>${money(l.fixed)}</b></div>`:`<div class="bl"><span>${esc(l.name)}<small>${l.qty} ${l.unit}</small></span><input type="number" data-bp="${l.key}" value="${S.prices[l.key]??''}" min="0" step="any" inputmode="decimal" placeholder="price" aria-label="Unit price for ${esc(l.name)}"><b>${money(l.qty*(S.prices[l.key]||0))}</b></div>`).join('')||'<p class="note">Nothing to price yet.</p>'}
    <h3 style="margin-top:16px">Other costs</h3>${S.extras.map(x=>`<div class="bl x"><input type="text" data-bx="name:${x.id}" value="${esc(x.name)}" maxlength="40" placeholder="Item" aria-label="Cost name"><input type="number" data-bx="amt:${x.id}" value="${x.amt||''}" min="0" step="any" placeholder="$"><button class="btn" data-act="xdel" data-v="${x.id}" aria-label="Remove line">×</button></div>`).join('')}
    <div class="acts"><button class="btn" data-act="xadd">Add a cost line</button></div>
    <div class="kv" style="margin-top:12px;font-weight:600"><span>Total</span><b>${money(tot)}</b></div>
    ${cap?`<div class="kv"><span>${diff>=0?'Under budget by':'Over budget by'}</span><b style="color:var(${diff>=0?'--accent':'--danger'})">${money(Math.abs(diff))}</b></div>`:''}
    <p class="note">Furniture, flooring, doors, windows and special wall finishes come from your design. Add labour, carpentry and permits as cost lines.</p></div>`;}
function budgetText(){const L=['BUDGET'],ls=budgetLines();ls.forEach(l=>{const p=l.fixed??S.prices[l.key];L.push(`  ${l.name}: ${l.qty} ${l.unit}`+(p?` x ${money(p)} = ${money(l.qty*p)}`:' (no price)'));});
  S.extras.forEach(x=>L.push(`  ${x.name||'Other'}: ${money(+x.amt||0)}`));L.push(`  TOTAL ${money(budgetTotal())}`+(S.budget?`  (cap ${money(S.budget)})`:''));return L.join('\n');}
$('#rbody').addEventListener('change',e=>{const t=e.target;if(!S||!t.dataset)return;
  if(t.dataset.bp!==undefined){const v=parseFloat(t.value);mut(()=>{if(isFinite(v)&&v>=0)S.prices[t.dataset.bp]=v;else delete S.prices[t.dataset.bp];});}
  else if(t.dataset.bx){const [f,id]=t.dataset.bx.split(':');mut(()=>{const x=S.extras.find(q=>q.id===id);if(!x)return;if(f==='name')x.name=t.value.slice(0,40);else x.amt=Math.max(0,parseFloat(t.value)||0);});}
  else if(t.dataset.bcap!==undefined){mut(()=>{S.budget=Math.max(0,parseFloat(t.value)||0);});}});
$('#rbody').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||!S)return;
  if(b.dataset.act==='xadd')mut(()=>S.extras.push({id:uid(),name:'',amt:0}));
  else if(b.dataset.act==='xdel')mut(()=>{S.extras=S.extras.filter(q=>q.id!==b.dataset.v);});});
/* ───────── versions, cloud, comments ───────── */
const VKEY='flatstudio.versions';
const vers=()=>{try{return JSON.parse(localStorage.getItem(VKEY)||'[]');}catch(e){return [];}};
const vstore=a=>{try{localStorage.setItem(VKEY,JSON.stringify(a.slice(0,30)));return true;}catch(e){return false;}};
const fmtT=t=>new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
function versHtml(){const v=vers();return v.length?v.map(x=>`<div class="kv"><span>${esc(x.name)}<br><small style="color:var(--ink2)">${fmtT(x.t)}</small></span><span class="vb"><button class="btn" data-f="vload" data-id="${x.id}">Restore</button><button class="btn danger" data-f="vdel" data-id="${x.id}" aria-label="Delete version">×</button></span></div>`).join(''):'<p class="note" style="margin:6px 0">No saved versions yet. Save one before a big change so you can come back to it.</p>';}
function openFiles(){
  dialog(`<h2>Files</h2><h4 class="dh">Versions</h4><div class="vrow"><input id="vn" type="text" maxlength="40" placeholder="Name this version"><button class="btn primary" data-f="vsave">Save version</button></div><div id="vl">${versHtml()}</div>
    <div id="cloudSec" hidden><h4 class="dh">My account</h4><div id="cl"><p class="note">Loading…</p></div></div>
    <h4 class="dh">Text</h4><p class="note" style="margin:0 0 8px">Copy this to keep a backup. Paste a saved design and press Load to bring it back. Imported 3D models and the traced image are not included.</p>
    <textarea id="jt" spellcheck="false" aria-label="Design data"></textarea><p id="jerr" class="note" style="color:var(--danger)"></p>
    <div class="acts"><button class="btn" data-d="copy">Copy</button><button class="btn" data-d="load">Load from box</button><button class="btn" data-d="close">Close</button></div>`);
  $('#jt').value=JSON.stringify(S);cloudRender();}
async function cloudInit(){const db=await capUse('db'),u=await capUse('user');if(!db||!u)return null;let id=null;try{id=await u.id();}catch(e){}return id?{db,id}:null;}
async function cloudRender(){const c=await cloudInit(),sec=$('#cloudSec');if(!sec)return;if(!c){return;}sec.hidden=false;const el=$('#cl');
  try{const [mine,shared]=await Promise.all([c.db.collection('data/users/'+c.id+'/designs').get(),c.db.collection('shared/designs').get()]);
    const row=(d,own)=>{const x=d.data()||{};return `<div class="kv"><span>${esc(x.name||'Untitled')}<br><small style="color:var(--ink2)">${fmtT(x.t||0)}</small></span><span class="vb"><button class="btn" data-f="${own?'copen':'sopen'}" data-id="${d.id}">Open</button>${own?`<button class="btn danger" data-f="cdel" data-id="${d.id}" aria-label="Delete">×</button>`:''}</span></div>`;};
    const sh=new Set(shared.docs.map(d=>d.id));
    el.innerHTML=`<div class="acts" style="margin:0 0 8px"><button class="btn primary" data-f="csave">Save this design</button><button class="btn" data-f="cshare">${S.cid&&sh.has(S.cid)?'Update shared copy':'Share with everyone here'}</button>${S.cid&&sh.has(S.cid)?'<button class="btn" data-f="cunshare">Stop sharing</button>':''}</div>
      ${mine.docs.map(d=>row(d,true)).join('')||'<p class="note">Nothing saved to your account yet.</p>'}<h4 class="dh" style="margin-top:14px">Shared designs</h4>${shared.docs.map(d=>row(d,false)).join('')||'<p class="note">Nothing has been shared yet.</p>'}`;
  }catch(e){el.innerHTML=`<p class="note">Cloud saving is not available right now (${esc(e&&e.code||'error')}).</p>`;}}
$('#dcard').addEventListener('click',async e=>{const b=e.target.closest('[data-f]');if(!b||!S)return;const f=b.dataset.f,id=b.dataset.id;
  if(f==='vsave'){const n=($('#vn').value||'').trim()||S.name+' '+fmtT(Date.now()),v=vers();v.unshift({id:'v'+Date.now().toString(36),name:n.slice(0,40),t:Date.now(),json:JSON.stringify(S)});if(!vstore(v))toast('Could not save, browser storage is full.');$('#vl').innerHTML=versHtml();$('#vn').value='';return;}
  if(f==='vdel'){vstore(vers().filter(x=>x.id!==id));$('#vl').innerHTML=versHtml();return;}
  if(f==='vload'){const x=vers().find(q=>q.id===id);if(x){try{newDesign(loadState(JSON.parse(x.json)));closeDlg();toast('Restored '+x.name);}catch(er){toast('That version could not be read.');}}return;}
  const c=await cloudInit();if(!c)return;
  try{
    if(f==='csave'){S.cid=S.cid||('d'+Date.now().toString(36));await c.db.collection('data/users/'+c.id+'/designs').doc(S.cid).set({name:S.name,json:JSON.stringify(S),t:Date.now()});toast('Saved to your account');save();cloudRender();}
    else if(f==='cshare'){S.cid=S.cid||('d'+Date.now().toString(36));await c.db.collection('shared/designs').doc(S.cid).set({name:S.name,json:JSON.stringify(S),owner:c.id,t:Date.now()});toast('Shared. Anyone who opens this page can open a copy.');save();cloudRender();}
    else if(f==='cunshare'){await c.db.collection('shared/designs').doc(S.cid).delete();toast('No longer shared');cloudRender();}
    else if(f==='cdel'){await c.db.collection('data/users/'+c.id+'/designs').doc(id).delete();cloudRender();}
    else if(f==='copen'||f==='sopen'){const d=await c.db.collection(f==='copen'?'data/users/'+c.id+'/designs':'shared/designs').doc(id).get();const x=d.data();if(x&&x.json){const o=loadState(JSON.parse(x.json));if(f==='copen')o.cid=id;newDesign(o);closeDlg();toast('Opened '+(x.name||'design'));}}
  }catch(er){toast('Cloud action failed'+(er&&er.code?' ('+er.code+')':'')+'. You may only have view access here.',4500);}});
$('#bShare').addEventListener('click',openFiles,true);
capUse('comments').then(c=>{if(c&&c.openComposer){const b=$('#bComment');b.hidden=false;b.addEventListener('click',()=>{c.openComposer({element:$('#plan')}).catch(()=>toast('Comments are not available here.'));});}});

/* ───────── HDB presets and checks ───────── */
function hdbPreset(n){
  const walls=[],openings=[],rooms=[],items=[];
  const W=(x1,y1,x2,y2)=>walls.push({id:uid(),x1,y1,x2,y2,fin:'paint',col:'',str:false});
  const R=(nm,x,y,w,h,f)=>rooms.push({id:uid(),name:nm,x,y,w,h,floor:f});
  const D=(axis,c,p,w,flip)=>openings.push({id:uid(),kind:'door',axis,c,p,w,flip,dt:'single'});
  const N=(axis,c,p,w,wt)=>openings.push({id:uid(),kind:'window',axis,c,p,w,wt,flip:-1});
  const I=(type,x,y,rot,w,d,c)=>{const k=CAT[type];items.push({id:uid(),type,x,y,rot,w:w||k.w,d:d||k.d,color:c||k.c});};
  let W0,D0;
  if(n===3){W0=9;D0=7;
    W(0,0,9,0);W(9,0,9,7);W(9,7,0,7);W(0,7,0,0);W(3.2,0,3.2,3.4);W(5,0,5,3.4);W(0,3.4,9,3.4);W(6,3.4,6,7);W(6,5.6,9,5.6);
    R('Bedroom 2',0,0,3.2,3.4,'oak');R('Common Bath',3.2,0,1.8,3.4,'tile');R('Master Bedroom',5,0,4,3.4,'oak');R('Living & Dining',0,3.4,6,3.6,'oak');R('Kitchen',6,3.4,3,2.2,'tile');R('Service Yard',6,5.6,3,1.4,'tile');
    D('h',3.4,1.8,.8,-1);D('h',3.4,4.1,.75,-1);D('h',3.4,5.5,.9,-1);D('v',6,4.9,.9,1);D('h',5.6,7.5,.8,1);D('h',7,1.5,1,-1);
    N('h',0,1.6,1.5,'std');N('h',0,7.0,1.8,'std');N('h',0,4.1,.5,'high');N('h',7,4.5,2.2,'tall');N('v',9,4.5,1,'std');N('v',9,6.3,.8,'std');N('v',9,1.7,1.2,'std');N('v',0,1.7,1,'std');
    I('bed_s',.6,1.1,0,1,2);I('ward',2.84,2.5,90,1.8);I('desk',2.0,.4,0,1.2,.6);I('chair',2.0,.95,180);
    I('bed_q',7,1.1,0);I('bside',5.95,.3,0);I('bside',8.05,.3,0);I('ward',5.36,1.6,270,1.8);
    I('shower',4.49,.51,0);I('vanity',3.49,1.5,270);I('wc',3.61,2.3,270);
    I('tvc',.26,5.2,270,1.8);I('rug',1.9,5.2,90,2.4,1.6,'#d9d3c5');I('coffee',1.7,5.2,90);I('sofa',3.0,5.2,90,2.2,.95);I('dining',4.2,5.8,0,1.5,1.3);I('shoe',2.6,6.82,180);I('plant',5.6,6.6,0);I('aircon',3.0,3.55,0);
    I('fridge',6.45,3.81,0);I('sink',7.4,3.76,0,1,.6);I('hob',8.3,3.76,0,.6,.6);I('over',7.4,3.58,0,1.2,.35);I('washer',8.5,6.64,180);I('trap',7.5,6.3,0);
  }else{W0=12.4;D0=9;
    W(0,0,12.4,0);W(12.4,0,12.4,9);W(12.4,9,0,9);W(0,9,0,0);W(3.4,0,3.4,3.8);W(6.8,0,6.8,3.8);W(10.6,0,10.6,3.8);W(0,3.8,12.4,3.8);W(10.6,2.2,12.4,2.2);W(3.2,3.8,3.2,9);W(0,7,3.2,7);
    R('Bedroom 2',0,0,3.4,3.8,'oak');R('Bedroom 3',3.4,0,3.4,3.8,'oak');R('Master Bedroom',6.8,0,3.8,3.8,'oak');R('Master Bath',10.6,0,1.8,2.2,'tile');R('Common Bath',10.6,2.2,1.8,1.6,'tile');
    R('Kitchen',0,3.8,3.2,3.2,'tile');R('Service Yard',0,7,3.2,2,'tile');R('Living & Dining',3.2,3.8,9.2,5.2,'oak');
    D('h',3.8,1.7,.8,-1);D('h',3.8,5.1,.8,-1);D('h',3.8,8.7,.9,-1);D('h',3.8,11.5,.75,-1);D('v',10.6,1.1,.75,-1);D('v',3.2,5.4,.9,-1);D('h',7,1.6,.8,1);D('h',9,5.5,1,-1);
    N('h',0,1.7,1.6,'std');N('h',0,5.1,1.6,'std');N('h',0,8.7,1.8,'std');N('h',0,11.5,.5,'high');N('v',12.4,3.0,.5,'high');N('v',0,5.4,1.2,'std');N('v',0,8.0,.8,'std');N('h',9,8.5,3,'tall');N('v',12.4,6.5,1.2,'std');N('v',0,1.9,1,'std');
    I('bed_s',.6,1.1,0,1,2);I('ward',3.04,2.5,90,1.8);I('desk',2.2,.4,0,1.2,.6);I('chair',2.2,.95,180);
    I('bed_s',4.0,1.1,0,1,2);I('ward',6.44,2.5,90,1.8);I('desk',5.6,.4,0,1.2,.6);I('chair',5.6,.95,180);
    I('bed_k',8.7,1.15,0,1.9);I('bside',7.45,.3,0);I('bside',9.95,.3,0);I('ward',7.16,2.6,270,2.0);
    I('wc',11.0,.41,0);I('vanity',11.95,.3,0);I('shower',11.65,1.65,0);I('wc',11.0,2.66,0);I('vanity',11.95,2.55,0);
    I('fridge',.45,4.21,0);I('sink',1.3,4.16,0,1,.6);I('hob',2.1,4.16,0,.6,.6);I('cab',2.7,4.16,0,.6,.6);I('over',1.8,3.98,0,1.6,.35);I('washer',.5,8.6,0);I('trap',1.6,8.2,0);
    I('tvc',12.14,5.0,90,1.8);I('rug',9.9,5.0,90,2.6,2,'#d9d3c5');I('sofa',8.2,5.0,270,2.4,.95);I('coffee',9.4,5.0,90);I('dining',5.6,7.4,0,1.8,1.3);I('shoe',4.2,8.82,180);I('plant',11.9,8.5,0);I('aircon',6.0,3.95,0);
  }
  return {name:n+'-room (generic layout)',H:2.6,wallColor:'#f2f0eb',walls,rooms,openings,items,dims:[],layers:{furn:1,labels:1,dims:1,grid:1}};}
function snapBase(){return {t:Date.now(),walls:S.walls.map(w=>({x1:w.x1,y1:w.y1,x2:w.x2,y2:w.y2,str:!!w.str})),
  wet:S.items.filter(i=>CAT[i.type]&&CAT[i.type].wet).map(i=>({type:i.type,x:i.x,y:i.y})),
  ops:S.openings.map(o=>({axis:o.axis,c:o.c,p:o.p,w:o.w,kind:o.kind}))};}
function wallCover(b,walls){const dx=b.x2-b.x1,dy=b.y2-b.y1,L=Math.hypot(dx,dy);if(L<1e-6)return 1;
  if(b.x1!==b.x2&&b.y1!==b.y2){return walls.some(w=>(Math.hypot(w.x1-b.x1,w.y1-b.y1)<.12&&Math.hypot(w.x2-b.x2,w.y2-b.y2)<.12)||(Math.hypot(w.x1-b.x2,w.y1-b.y2)<.12&&Math.hypot(w.x2-b.x1,w.y2-b.y1)<.12))?1:0;}
  const hz=b.y1===b.y2,a0=hz?Math.min(b.x1,b.x2):Math.min(b.y1,b.y2),a1=hz?Math.max(b.x1,b.x2):Math.max(b.y1,b.y2),c=hz?b.y1:b.x1,iv=[];
  for(const w of walls){if(w.x1!==w.x2&&w.y1!==w.y2)continue;const wh=w.y1===w.y2;if(wh!==hz)continue;if(Math.abs((wh?w.y1:w.x1)-c)>.06)continue;
    const s=Math.max(a0,wh?Math.min(w.x1,w.x2):Math.min(w.y1,w.y2)),e=Math.min(a1,wh?Math.max(w.x1,w.x2):Math.max(w.y1,w.y2));if(e>s)iv.push([s,e]);}
  iv.sort((p,q)=>p[0]-q[0]);let tot=0,cur=a0;for(const [s,e] of iv){const s2=Math.max(s,cur);if(e>s2){tot+=e-s2;cur=e;}}return tot/(a1-a0);}
const itemPoly=it=>{const a=it.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([qx,qy])=>[it.x+qx*it.w/2*c-qy*it.d/2*s,it.y+qx*it.w/2*s+qy*it.d/2*c]);};
function polyOverlap(A,B){const ax=[A,B];for(const P of ax)for(let i=0;i<4;i++){const q=P[(i+1)%4],nx=-(q[1]-P[i][1]),ny=q[0]-P[i][0];let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
    for(const p of A){const d=p[0]*nx+p[1]*ny;a0=Math.min(a0,d);a1=Math.max(a1,d);}for(const p of B){const d=p[0]*nx+p[1]*ny;b0=Math.min(b0,d);b1=Math.max(b1,d);}
    const L=Math.hypot(nx,ny)||1;if(a1/L<=b0/L+.03||b1/L<=a0/L+.03)return false;}return true;}
function runChecks(){
  const out=[],add=(lvl,msg,cat)=>out.push({lvl,msg,cat}),B=S.base;
  const nm=t=>CAT[t]?CAT[t].n:t,f1=v=>v.toFixed(1);
  if(B){
    for(const b of B.walls){const cv=wallCover(b,S.walls),len=Math.hypot(b.x2-b.x1,b.y2-b.y1),isStr=b.str||S.walls.some(w=>w.str&&wallCover(b,[w])>.5);
      if(cv<.95){add(isStr?'warn':'info',`${cv<.05?'Removed':'Shortened'} wall: ${f1(len)} m wall at (${f1(b.x1)}, ${f1(b.y1)}) to (${f1(b.x2)}, ${f1(b.y2)}), ${Math.round((1-cv)*100)}% gone.${isStr?' You marked this wall structural, so it must stay. Do not hack it.':' If it is structural it cannot be removed. Confirm with HDB and a registered contractor before work.'}`,'walls');}}
    for(const w of S.walls){const cv=wallCover(w,B.walls);if(cv<.5)add('info',`New wall: ${f1(Math.hypot(w.x2-w.x1,w.y2-w.y1))} m at (${f1(w.x1)}, ${f1(w.y1)}). New partitions still need to follow HDB's renovation rules.`,'walls');}
    const cur=S.items.filter(i=>CAT[i.type]&&CAT[i.type].wet),pool=B.wet.map(x=>Object.assign({},x,{used:false}));
    for(const it of cur){let best=null,bd=1e9;for(const p of pool){if(p.used||p.type!==it.type)continue;const d=Math.hypot(p.x-it.x,p.y-it.y);if(d<bd){bd=d;best=p;}}
      if(!best){add('info',`${nm(it.type)} is new, it was not in the original layout.`,'wet');continue;}best.used=true;
      if(bd>.3)add(bd>1?'warn':'info',`${nm(it.type)} moved ${bd.toFixed(1)} m from its original position. Moving wet fixtures changes pipes and waterproofing, so check what is allowed before you commit.`,'wet');}
    for(const p of pool)if(!p.used)add('info',`${nm(p.type)} from the original layout is no longer in the design.`,'wet');
    for(const w of S.walls.filter(x=>x.str)){const wi=wallInfo(w);for(const o of wi.ops){if(!B.ops.some(b=>b.axis===o.axis&&Math.abs(b.c-o.c)<.1&&Math.abs(b.p-o.p)<.3&&b.kind===o.kind))add('warn',`A new ${o.kind} opening is cut into a wall you marked structural, near (${f1(o.axis==='h'?o.p:o.c)}, ${f1(o.axis==='h'?o.c:o.p)}).`,'walls');}}
  }
  /* design sanity checks */
  const its=S.items.filter(i=>CAT[i.type]&&!CAT[i.type].flat&&!CAT[i.type].elev&&!CAT[i.type].svc&&!CAT[i.type].top&&!CAT[i.type].missing);
  for(let i=0;i<its.length;i++)for(let j=i+1;j<its.length;j++){const A=its[i],Bq=its[j];if(Math.hypot(A.x-Bq.x,A.y-Bq.y)>Math.max(A.w,A.d)+Math.max(Bq.w,Bq.d))continue;
    if(CAT[A.type].n==='Dining set'||CAT[Bq.type].n==='Dining set')continue;if(polyOverlap(itemPoly(A),itemPoly(Bq)))add('warn',`${nm(A.type)} overlaps ${nm(Bq.type)} near (${f1(A.x)}, ${f1(A.y)}).`,'layout');}
  for(const it of its){if(S.rooms.length&&!S.rooms.some(r=>pip(it.x,it.y,rpts(r))))add('warn',`${nm(it.type)} at (${f1(it.x)}, ${f1(it.y)}) is outside every room.`,'layout');}
  for(const o of S.openings){if(o.kind!=='door'||(o.dt&&o.dt!=='single'&&o.dt!=='double'))continue;const f=o.flip||-1,half=o.dt==='double'?o.w/2:o.w,hs=o.dt==='double'?[[o.p-o.w/2,1],[o.p+o.w/2,-1]]:[[o.p-o.w/2,1]];let hit=null;
    for(const [hu,dir] of hs){for(let u=.05;u<=half&&!hit;u+=.1)for(let n=.05;n<=half&&!hit;n+=.1){if(u*u+n*n>half*half)continue;const uu=hu+dir*u,nn=f*n,px=o.axis==='h'?uu:o.c+nn,py=o.axis==='h'?o.c+nn:uu;
        for(const it of its)if(pip(px,py,itemPoly(it))){hit=it;break;}}}
    if(hit)add('warn',`A door near (${f1(o.axis==='h'?o.p:o.c)}, ${f1(o.axis==='h'?o.c:o.p)}) swings into the ${nm(hit.type).toLowerCase()}. Flip it, resize it or move the furniture.`,'layout');
    if(o.w<.75)add('info',`A door near (${f1(o.axis==='h'?o.p:o.c)}, ${f1(o.axis==='h'?o.c:o.p)}) is only ${Math.round(o.w*1000)} mm wide.`,'layout');}
  /* clearance checks */
  const nearWall=(px,py)=>{for(const w of S.walls){const wi=wallInfo(w),T=wi.th/2+.03,dx=w.x2-w.x1,dy=w.y2-w.y1,L2=dx*dx+dy*dy||1,t=clamp(((px-w.x1)*dx+(py-w.y1)*dy)/L2,0,1);if(Math.hypot(px-(w.x1+t*dx),py-(w.y1+t*dy))<T)return true;}return false;};
  const blocked=(px,py,self)=>{if(nearWall(px,py))return true;for(const o of its){if(o===self)continue;if(pip(px,py,itemPoly(o)))return true;}return false;};
  const sideOpen=(it,sx,sy,dist)=>{const a=it.rot*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),ex=sx?Math.abs(sx)*it.w/2:it.w/2,ey=sy?Math.abs(sy)*it.d/2:it.d/2;let bad=0;
    for(const k of[-.7,0,.7]){const lx=sx?sx*(it.w/2+dist):k*it.w/2,ly=sy?sy*(it.d/2+dist):k*it.d/2;const px=it.x+lx*c-ly*sn,py=it.y+lx*sn+ly*c;if(blocked(px,py,it))bad++;}return bad<2;};
  for(const it of its){
    if(['bed_q','bed_k','bed_s'].includes(it.type)){const L=sideOpen(it,-1,0,.6),R=sideOpen(it,1,0,.6),F=sideOpen(it,0,1,.6);
      if(!L&&!R&&!F)add('warn',`${nm(it.type)} near (${f1(it.x)}, ${f1(it.y)}) has less than 60 cm of free space on every side. There is no way to get into the bed.`,'clear');
      else if(it.type!=='bed_s'&&!L&&!R)add('info',`${nm(it.type)} near (${f1(it.x)}, ${f1(it.y)}) can only be reached from the foot. Leave 60 cm on at least one long side.`,'clear');
      else if(it.type!=='bed_s'&&(+!L+ +!R)===1&&!F)add('info',`${nm(it.type)} near (${f1(it.x)}, ${f1(it.y)}) is tight on two sides. A 60 cm walkway on one long side is the usual minimum.`,'clear');}
    if(['ward','wardS','dress'].includes(it.type)&&!sideOpen(it,0,1,it.type==='dress'?.5:.6))add('warn',`${nm(it.type)} near (${f1(it.x)}, ${f1(it.y)}) has less than ${it.type==='dress'?50:60} cm in front, so doors and drawers will be hard to use.`,'clear');
  }
  const TALL=['ward','wardS','bookc','shelf','fridgeL','fridge','bunk'];
  for(const o of S.openings){if(o.kind!=='window')continue;const mx=o.axis==='h'?o.p:o.c,my=o.axis==='h'?o.c:o.p;
    for(const it of its){if(!TALL.includes(it.type))continue;let hit=false;
      for(const u of[-.4,0,.4])for(const n of[-.35,.35]){const px=o.axis==='h'?o.p+u*o.w:o.c+n,py=o.axis==='h'?o.c+n:o.p+u*o.w;if(pip(px,py,itemPoly(it)))hit=true;}
      if(hit)add('info',`${nm(it.type)} stands in front of the window near (${f1(mx)}, ${f1(my)}). It will block light and make the window hard to open.`,'clear');}}
  return out;}
const LUX=[[/bath|toilet|wc/i,200,'bathroom'],[/kitchen/i,300,'kitchen'],[/study|office|work/i,300,'study'],[/living|dining|hall/i,150,'living'],[/bed|master/i,100,'bedroom'],[/yard|service|store|corridor/i,100,'utility']];
const LM_PER_LIGHT=1000;
function lightPlan(){return S.rooms.map(r=>{const ar=rarea(r),rule=LUX.find(x=>x[0].test(r.name))||[null,150,'general'],lux=rule[1],need=lux*ar/.5,want=Math.max(1,Math.round(need/LM_PER_LIGHT)),
    have=S.items.filter(it=>CAT[it.type]&&['ceilL','pendant'].includes(it.type)&&pip(it.x,it.y,rpts(r))).length,
    lamps=S.items.filter(it=>CAT[it.type]&&CAT[it.type].lamp&&!['ceilL','pendant'].includes(it.type)&&pip(it.x,it.y,rpts(r))).length;
    return {r,ar,lux,kind:rule[2],want,have,lamps};});}
function lightingHtml(){const L=lightPlan();if(!L.length)return '';
  return `<div class="sec"><h3>Lighting plan</h3><p class="note" style="margin-top:0">Rough guide only: target light level by room type, an assumed 1000 lumen ceiling light and 50% efficiency. A lighting designer or electrician decides the real layout.</p>`+
  L.map(x=>{const gap=x.want-x.have;return `<div class="chk-i info"><i></i><span><b>${esc(x.r.name)}</b>: ${x.ar.toFixed(1)} m², about ${x.lux} lux for a ${x.kind}. Suggested ${x.want} ceiling light${x.want>1?'s':''}, you have ${x.have}${x.lamps?` plus ${x.lamps} lamp${x.lamps>1?'s':''}`:''}.${gap>0?` <button class="btn" data-lt="${x.r.id}" style="margin-left:6px;padding:2px 8px">Add ${gap}</button>`:''}</span></div>`;}).join('')+`</div>`;}
function addLights(id){const r=S.rooms.find(x=>x.id===id);if(!r)return;const pl=lightPlan().find(x=>x.r.id===id),n=pl.want-pl.have;if(n<=0)return;const pts=rpts(r),xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const cand=[];const cols=Math.ceil(Math.sqrt(n*(x1-x0)/(y1-y0||1))),rows=Math.ceil(n/cols);
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const x=x0+(i+.5)*(x1-x0)/cols,y=y0+(j+.5)*(y1-y0)/rows;if(pip(x,y,pts))cand.push([+x.toFixed(2),+y.toFixed(2)]);}
  if(!cand.length){const c=rcent(r);cand.push([c.x,c.y]);}
  mut(()=>{cand.slice(0,n).forEach(c=>S.items.push({id:uid(),type:'ceilL',x:c[0],y:c[1],rot:0,w:CAT.ceilL.w,d:CAT.ceilL.d,color:CAT.ceilL.c}));});toast('Ceiling lights added');}
function checksText(){const r=runChecks(),L=['CHECKS (planning aid only, not an HDB approval)'];if(!S.base)L.push('  No original layout was set, so changes to walls and wet areas were not compared.');
  if(!r.length)L.push('  No issues found.');r.forEach(x=>L.push(`  [${x.lvl==='warn'?'CHECK':'NOTE'}] ${x.msg}`));return L.join('\n');}
function checksHtml(){const r=runChecks(),warn=r.filter(x=>x.lvl==='warn'),info=r.filter(x=>x.lvl!=='warn');
  const li=(x)=>`<div class="chk-i ${x.lvl}"><i></i><span>${esc(x.msg)}</span></div>`;
  return `<div class="sec"><h3>Original layout</h3>${S.base?`<p class="note" style="margin-top:0">Saved ${fmtT(S.base.t)}. Changes below are compared with it.</p><div class="acts"><button class="btn" data-act="setbase">Replace with current</button><button class="btn" data-act="clearbase">Clear</button></div>`:`<p class="note" style="margin-top:0">Load or draw your flat as it is handed over, then press the button. Later changes to walls and wet areas will be compared against it.</p><div class="acts"><button class="btn primary" data-act="setbase">Set current as original</button></div>`}</div>
    ${lightingHtml()}
    <div class="sec"><h3>Needs a look (${warn.length})</h3>${warn.map(li).join('')||'<p class="note" style="margin-top:0">Nothing flagged.</p>'}</div>
    <div class="sec"><h3>Notes (${info.length})</h3>${info.map(li).join('')||'<p class="note" style="margin-top:0">None.</p>'}</div>
    <div class="sec"><p class="note" style="margin:0"><b>This is a planning aid, not an approval.</b> It only knows what you tell it: mark structural walls in the wall inspector, and set the original layout. HDB decides which walls, floors and services can be altered and which works need a permit or a registered contractor. Check HDB's current renovation guidelines for your flat type before you start work.</p></div>`;}
$('#rbody').addEventListener('click',e=>{const lt=e.target.closest('[data-lt]');if(lt&&S){addLights(lt.dataset.lt);return;}const b=e.target.closest('[data-act]');if(!b||!S)return;
  if(b.dataset.act==='setbase'){mut(()=>{S.base=snapBase();});toast('Saved as the original layout');}
  else if(b.dataset.act==='clearbase')mut(()=>{S.base=null;});});


/* ───────── photo render: accumulated passes (soft shadows + antialiasing) ───────── */
let photoJob=null;
function photoDialog(){dialog(`<h2>Render photo</h2><p class="note" style="margin:0 0 10px">Renders the current 3D view in high quality: soft shadows and smooth edges, built up over many passes. Keep this tab open.</p>
  <div class="row" style="grid-template-columns:92px 1fr"><span>Quality</span><select id="phq"><option value="24">Draft (24 passes)</option><option value="64" selected>Good (64 passes)</option><option value="160">Best (160 passes)</option></select></div>
  <div class="row" style="grid-template-columns:92px 1fr"><span>Size</span><select id="phs"><option value="1600">1600 px wide</option><option value="2400">2400 px wide</option></select></div>
  <div id="phprog" style="height:6px;background:var(--line);border-radius:3px;margin:12px 0 4px;overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--accent)"></i></div><p id="pht" class="note" style="margin:0"></p>
  <div class="acts"><button class="btn primary" data-ph="go">Start</button><button class="btn" data-ph="stop">Close</button></div>`);}
async function photoRun(){
  if(!renderer){toast('The 3D view is not available.');return;}
  const N=+$('#phq').value,W=+$('#phs').value,asp=camera.aspect||1.5,H=Math.round(W/asp);
  const prog=$('#phprog i'),txt=$('#pht'),go=$('[data-ph=go]');go.disabled=true;
  const job=photoJob={stop:false};
  const acc=document.createElement('canvas');acc.width=W;acc.height=H;const ax=acc.getContext('2d');
  const oldSize=renderer.getSize(new THREE.Vector2()),oldPR=renderer.getPixelRatio();
  const sp=sun.position.clone(),sm=sun.shadow.mapSize.clone(),lampBase=lampPool.map(l=>l.position.clone());
  renderer.setPixelRatio(1);renderer.setSize(W,H,false);camera.aspect=W/H;camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096,4096);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
  const od=orb.dist;if(mode==='orbit'){const b=bounds();orb.dist=clamp(Math.max((b.w+2)/(.72*camera.aspect),(b.h+2)/.6),4,45);updateOrbit();}
  if(sync3D)sync3D();
  const rad=sunC.rad*.05+.2;let done=0;
  try{
    for(let i=0;i<N&&!job.stop;i++){
      const a=i*2.399963,r=Math.sqrt((i+.5)/N)*rad;sun.position.set(sp.x+Math.cos(a)*r,sp.y+Math.sin(a*1.3)*r*.5,sp.z+Math.sin(a)*r);
      camera.setViewOffset(W,H,((i*.618034)%1)-.5,((i*.754877)%1)-.5,W,H);
      renderer.render(scene,camera);
      ax.globalAlpha=1/(i+1);ax.drawImage(renderer.domElement,0,0);done=i+1;
      prog.style.width=(done/N*100)+'%';txt.textContent=`Pass ${done} of ${N}`;
      if(i%2===1)await new Promise(r=>setTimeout(r,0));
    }
  }finally{
    camera.clearViewOffset();if(mode==='orbit'){orb.dist=od;updateOrbit();}sun.position.copy(sp);sun.shadow.mapSize.copy(sm);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
    renderer.setPixelRatio(oldPR);renderer.setSize(oldSize.x,oldSize.y,false);camera.aspect=oldSize.x/oldSize.y;camera.updateProjectionMatrix();resize3D();dirty=true;photoJob=null;}
  if(job.stop&&done<2){return;}
  go.disabled=false;txt.textContent=job.stop?`Stopped at pass ${done}.`:'Done.';
  const bl=await cvBlob(acc);await saveFile(safeName()+'-render.png',bl);
}
$('#rPhoto').addEventListener('click',photoDialog);
let vsig='';
function fillViews(){const sel=$('#viewSel');if(!sel||!S)return;const vs=S.views||[];const sg=JSON.stringify([vs.map(v=>v.id+v.n),S.rooms.map(r=>r.id+r.name)]);if(sg===vsig)return;vsig=sg;
  sel.innerHTML='<option value="">Views and rooms</option><option value="save">+ Save this view</option>'+(vs.length?'<optgroup label="Saved views">'+vs.map(v=>`<option value="v:${v.id}">${esc(v.n)} (${v.m})</option>`).join('')+'</optgroup>':'')+(vs.length?'<optgroup label="Delete a view">'+vs.map(v=>`<option value="d:${v.id}">Delete: ${esc(v.n)}</option>`).join('')+'</optgroup>':'')+(S.rooms.length?'<optgroup label="Go to room (walk)">'+S.rooms.map(r=>`<option value="r:${r.id}">${esc(r.name)}</option>`).join('')+'</optgroup>':'');sel.value='';}
$('#viewSel').addEventListener('change',e=>{const v=e.target.value;e.target.value='';if(!v||!S)return;
  if(v==='save'){dialog(`<h2>Save this view</h2><div class="row" style="grid-template-columns:70px 1fr"><span>Name</span><input id="vn" value="${mode==='walk'?'Walk view':'Overview'}" maxlength="40"></div><div class="acts"><button class="btn primary" data-vw="save">Save</button><button class="btn" data-vw="x">Cancel</button></div>`);return;}
  const [k,id]=[v.slice(0,1),v.slice(2)];
  if(k==='v'){const w=(S.views||[]).find(x=>x.id===id);if(!w)return;setMode(w.m);if(w.m==='walk'){walk.x=w.a[0];walk.y=w.a[1];walk.yaw=w.a[2];walk.pitch=w.a[3];updateWalkCam();}else{orb.az=w.a[0];orb.pol=w.a[1];orb.dist=w.a[2];orb.tx=w.a[3];orb.tz=w.a[4];updateOrbit();}dirty3=true;render2D();}
  else if(k==='d'){mut(()=>{S.views=(S.views||[]).filter(x=>x.id!==id);});fillViews();}
  else if(k==='r'){const r=S.rooms.find(x=>x.id===id);if(!r)return;const c=rcent(r);setMode('walk');{const free=(px,py)=>pip(px,py,rpts(r))&&!solids.some(q=>{const dx=px-q.cx,dz=py-q.cz,lx=dx*q.c+dz*q.s,lz=-dx*q.s+dz*q.c;return Math.abs(lx)<q.hx+.15&&Math.abs(lz)<q.hz+.15;});let bp=null,bd=1e9;for(let ox=-4;ox<=4;ox+=.1)for(let oy=-4;oy<=4;oy+=.1){const d=ox*ox+oy*oy;if(d<bd&&free(c.x+ox,c.y+oy)){bd=d;bp=[c.x+ox,c.y+oy];}}if(bp){c.x=bp[0];c.y=bp[1];}}
  walk.x=c.x;walk.y=c.y;{let best=0,by=0;for(let k=0;k<16;k++){const yw=k*Math.PI/8,fx=-Math.sin(yw),fz=-Math.cos(yw);let d=0;for(;d<12;d+=.1){const px=c.x+fx*d,py=c.y+fz*d;if(!pip(px,py,rpts(r)))break;let hit=false;for(const q of solids){const dx=px-q.cx,dz=py-q.cz,lx=dx*q.c+dz*q.s,lz=-dx*q.s+dz*q.c;if(Math.abs(lx)<q.hx&&Math.abs(lz)<q.hz){hit=true;break;}}if(hit)break;}if(d>best+.05){best=d;by=yw;}}walk.yaw=by;}updateWalkCam();dirty3=true;render2D();}});
$('#dcard').addEventListener('click',e=>{const b=e.target.closest('[data-vw]');if(!b)return;
  if(b.dataset.vw==='save'){const n=($('#vn').value||'View').trim().slice(0,40);const a=mode==='walk'?[walk.x,walk.y,walk.yaw,walk.pitch,0]:[orb.az,orb.pol,orb.dist,orb.tx,orb.tz];mut(()=>{S.views=(S.views||[]);S.views.push({id:uid(),n,m:mode==='walk'?'walk':'orbit',a:a.map(x=>+x.toFixed(3))});});fillViews();toast('View saved');}
  $('#dlg').classList.remove('on');});
$('#dcard').addEventListener('click',e=>{const b=e.target.closest('[data-ph]');if(!b)return;
  if(b.dataset.ph==='go')photoRun();else{if(photoJob)photoJob.stop=true;closeDlg();}});
/* ───────── boot ───────── */
(function boot(){
  let st=null;try{const raw=localStorage.getItem('flatstudio.v1');if(raw)st=loadState(JSON.parse(raw));}catch(e){}
  const q=new URLSearchParams(location.search),qf=q.get('flat'),qc=parseFloat(q.get('cap')),ql=q.get('layout');
  if(!st||!st.walls.length)st=loadState(qf==='3'?hdbPreset(3):qf==='5'?hdbPreset(5):sample());
  if(isFinite(qc)&&qc>0&&st.budget!==qc){st.budget=qc;setTimeout(()=>toast('Budget cap set from your money plan: '+money(qc)),600);}
  if(q.has('flat')||q.has('cap')||ql)history.replaceState(null,'',location.pathname);
  try{const u=JSON.parse(localStorage.getItem('flatstudio.under')||'null');if(u&&u.src&&[u.x,u.y,u.w,u.h].every(isFinite))under=Object.assign({rot:0,op:.65,show:true},u);}catch(e){}
  S=st;$('#pname').value=S.name;buildLeft();setTool('select');init3D();setMode('orbit');loadSavedModels();
  requestAnimationFrame(()=>{fit();resize3D();resetOrbit();if(camera)updateOrbit();changed();
    // ?layout= from the money plan: open that brochure unit, keeping any other design as a saved version first.
    const L=ql&&BRO[ql];if(L&&S.name!==L.design.name){if(S.walls.length){const v=vers();v.unshift({id:'v'+Date.now().toString(36),name:('Before '+L.label).slice(0,40),t:Date.now(),json:JSON.stringify(S)});vstore(v);}loadBrochure(ql);}
    if(innerWidth<760){try{if(!localStorage.getItem('flatstudio.phoneTip')){localStorage.setItem('flatstudio.phoneTip','1');setTimeout(()=>toast('Flat Studio is easier on a computer or a tablet in landscape. On a phone, use the tabs at the bottom.',6000),1200);}}catch(e){}}
    requestAnimationFrame(frame);});
})();
