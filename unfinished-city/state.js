'use strict';
let selectedPart=null,selectedFilter='all',intentMode=null,releaseSprite=null,undoStack=[],redoStack=[],paint=colors[0],tool='draw',drawing=false;
let spritePixels=Array(144).fill('');
const seedTiles=()=>{
 const a=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let terrain='ground';
  if(x===5||x===6||(x===4&&y>4))terrain='water';
  if(x<3&&y>3)terrain='wild';
  if(x>8)terrain='high';
  if(y<2&&x>3&&x<9)terrain='plaza';
  a.push({x,y,terrain,structure:null,intention:null,entity:null});
 }
 const put=(x,y,s)=>a[y*W+x].structure=s;
 put(1,2,'home');put(8,2,'home');put(4,1,'stage');put(3,5,'garden');put(7,5,'shelter');put(5,4,'bridge');put(2,6,'wetland');
 return a;
};
const initial=()=>({version:1,day:1,weather:'clear',children:1,tiles:seedTiles(),inventory:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.count])),metrics:{water:5,move:3,shelter:4,habitat:5},history:[{day:0,text:'Earlier visitors built two homes, a small bridge, and a wetland garden.'}],sprites:[],settings:{contrast:false,motion:false,large:false},lastStory:'This city was here before you. One western home cannot reach the commons, and the wetland has begun to shrink.'});
let state=load();
function load(){try{const raw=localStorage.getItem(KEY);if(raw){const p=JSON.parse(raw);if(p&&p.tiles&&p.tiles.length===W*H)return p}}catch(e){}return initial()}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));$('#storage-pill').textContent='SAVED';return true}catch(e){$('#storage-pill').textContent='MEMORY';return false}}
function snapshot(){undoStack.push(JSON.stringify(state));if(undoStack.length>30)undoStack.shift();redoStack=[]}
function restore(raw){state=JSON.parse(raw);save();renderAll()}
function terrainValid(tile,type){if(type==='bridge')return tile.terrain==='water'&&!tile.structure;if(type==='wetland')return (tile.terrain==='water'||tile.terrain==='wild')&&!tile.structure;if(type==='repair')return !!tile.intention||tile.structure==='repair';return tile.terrain!=='water'&&!tile.structure}
function summary(){const homes=state.tiles.filter(t=>t.structure==='home').length, intents=state.tiles.filter(t=>t.intention).length;let issues=[];if(state.metrics.water<4)issues.push('water is scarce');if(state.metrics.move<5)issues.push('homes remain disconnected');if(state.metrics.habitat<4)issues.push('the wetland is strained');if(!issues.length)issues.push('the city is stable but unfinished');return `${homes} homes, ${intents} inherited intentions, and ${issues[0]}.`}
