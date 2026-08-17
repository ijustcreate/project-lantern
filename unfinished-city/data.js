'use strict';
const W=12,H=8,KEY='unfinished-city-mobile-v1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const svg=(type,color)=>{
 const C=color||'#171c24';
 const shapes={
  path:`<rect x="1" y="4" width="10" height="4" fill="#b89f69"/><rect x="1" y="5" width="10" height="1" fill="#efe0ad"/>`,
  home:`<rect x="2" y="5" width="8" height="6" fill="#fff0c0"/><rect x="1" y="4" width="10" height="2" fill="#8b3e35"/><rect x="4" y="7" width="3" height="4" fill="#5d3c2d"/><rect x="8" y="7" width="1" height="2" fill="#55a1b2"/>`,
  garden:`<rect x="1" y="8" width="10" height="3" fill="#70472e"/><rect x="2" y="5" width="1" height="4" fill="#4a7f3e"/><rect x="5" y="4" width="1" height="5" fill="#4a7f3e"/><rect x="8" y="6" width="1" height="3" fill="#4a7f3e"/><rect x="1" y="4" width="3" height="2" fill="#f0bd39"/><rect x="4" y="3" width="3" height="2" fill="#c94f3f"/><rect x="7" y="5" width="3" height="2" fill="#7952a5"/>`,
  bridge:`<rect x="0" y="5" width="12" height="3" fill="#7c4b2d"/><rect x="1" y="4" width="2" height="5" fill="#aa6d3e"/><rect x="9" y="4" width="2" height="5" fill="#aa6d3e"/><rect x="3" y="4" width="6" height="1" fill="#e0b86f"/>`,
  shelter:`<rect x="2" y="5" width="8" height="5" fill="#f1dfab"/><rect x="1" y="3" width="10" height="3" fill="#1c6f70"/><rect x="4" y="7" width="4" height="3" fill="#7952a5"/>`,
  wetland:`<rect x="0" y="8" width="12" height="3" fill="#55a1b2"/><rect x="2" y="3" width="1" height="7" fill="#4a7f3e"/><rect x="5" y="4" width="1" height="6" fill="#4a7f3e"/><rect x="8" y="2" width="1" height="8" fill="#4a7f3e"/><rect x="1" y="2" width="3" height="2" fill="#7fa668"/><rect x="7" y="1" width="3" height="2" fill="#7fa668"/>`,
  stage:`<rect x="1" y="7" width="10" height="3" fill="#8f5634"/><rect x="2" y="3" width="8" height="4" fill="#c94f3f"/><rect x="3" y="4" width="1" height="2" fill="#f0bd39"/><rect x="8" y="4" width="1" height="2" fill="#f0bd39"/>`,
  repair:`<rect x="2" y="7" width="8" height="3" fill="#d28e3c"/><rect x="4" y="2" width="2" height="6" fill="#171c24"/><rect x="6" y="2" width="4" height="2" fill="#171c24"/><rect x="7" y="1" width="2" height="4" fill="#c94f3f"/>`,
  entity:`<rect x="4" y="1" width="4" height="4" fill="#f1c59c"/><rect x="3" y="5" width="6" height="4" fill="${C}"/><rect x="3" y="9" width="2" height="3" fill="#171c24"/><rect x="7" y="9" width="2" height="3" fill="#171c24"/><rect x="2" y="6" width="1" height="3" fill="#f1c59c"/><rect x="9" y="6" width="1" height="3" fill="#f1c59c"/>`
 };
 return `<svg class="sprite ${type==='entity'?'entity':''}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${shapes[type]||shapes.entity}</svg>`
};
const parts={
 path:{label:'Path',cat:'connect',count:7,desc:'Connects nearby places.',delta:{move:1,habitat:-1}},
 home:{label:'Home',cat:'build',count:2,desc:'Adds shelter and a new neighbor.',delta:{shelter:2,water:-1}},
 garden:{label:'Garden',cat:'restore',count:3,desc:'Grows habitat but needs water.',delta:{habitat:2,water:-1}},
 bridge:{label:'Bridge',cat:'connect',count:1,desc:'Crosses water; needs two children.',delta:{move:3,habitat:-1},joint:true},
 shelter:{label:'Shared Shelter',cat:'build',count:2,desc:'A public room for weather and rest.',delta:{shelter:3,move:1}},
 wetland:{label:'Wetland Patch',cat:'restore',count:2,desc:'Stores water and restores habitat.',delta:{water:2,habitat:3}},
 stage:{label:'Gathering Stage',cat:'build',count:1,desc:'Creates a place for public events.',delta:{move:1,shelter:1}},
 repair:{label:'Repair Kit',cat:'restore',count:3,desc:'Repairs one strained place.',delta:{shelter:1,move:1}}
};
const intentionDefs={protect:'Protect this',connect:'Connect this',repair:'Repair this',grow:'Help this grow',quiet:'Keep this quiet',gather:'Gather here',wild:'Keep this wild',unfinished:'Leave unfinished'};
const colors=['#171c24','#c94f3f','#f0bd39','#1c6f70','#7952a5','#7fa668','#55a1b2','#fff4d5'];
