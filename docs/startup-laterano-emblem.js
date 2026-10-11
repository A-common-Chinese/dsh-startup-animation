/* DSH / CONCORD. Original geometric chancery seal.
 * Equal-radius intersections form three lancet apertures inside a broken circle.
 * The central S-shaped signal and serif DSH inscription identify the Harness.
 * Five polygon groups are shared by Canvas, SVG, Rust and native app icons.
 */
(() => {
  'use strict';
  const arc = (x,y,rx,ry,a,b,n=40) => Array.from({length:n+1},(_,i)=>{
    const t=a+(b-a)*i/n;
    return [+(x+Math.cos(t)*rx).toFixed(3),+(y+Math.sin(t)*ry).toFixed(3)];
  });
  function lancet(cx,spring,w,bottom,thickness){
    const contour=(half,y)=>[
      [cx-half,bottom],
      ...arc(cx+half,y,half*2,half*2,Math.PI,Math.PI*4/3,18),
      ...arc(cx-half,y,half*2,half*2,Math.PI*5/3,Math.PI*2,18),
      [cx+half,bottom],
    ];
    return [contour(w,spring),contour(w-thickness,spring+1)];
  }
  const parts = [
    [[...arc(0,-5,89,89,2.16,7.265,84),...arc(0,-5,83,83,7.265,2.16,84)],
      [[-5,-104],[0,-109],[5,-104],[0,-99]],
      [[-97,-8],[-89,-8],[-89,-2],[-97,-2]],
      [[89,-8],[97,-8],[97,-2],[89,-2]]],
    [...lancet(-45,13,18,42,6),[[-67,42],[-23,42],[-23,46],[-67,46]]],
    [...lancet(45,13,18,42,6),[[23,42],[67,42],[67,46],[23,46]]],
    [
      [[-37,56],[-25,56],...arc(-25,67,13,11,-Math.PI/2,Math.PI/2,22),[-37,78],[-37,75],[-33,75],[-33,59],[-37,59]],
      [[-28,60],[-25,60],...arc(-25,67,8,7,-Math.PI/2,Math.PI/2,18),[-28,74]],
      [[-8,58],[-1,54],[7,56],[9,62],[6,62],[4,59],[0,58],[-4,60],[-4,63],[6,68],[9,72],[8,77],[3,80],[-4,80],[-9,76],[-9,71],[-6,71],[-3,76],[3,76],[5,73],[3,71],[-7,66],[-9,62]],
      [[13,56],[24,56],[24,59],[21,59],[21,65],[31,65],[31,59],[28,59],[28,56],[39,56],[39,59],[36,59],[36,75],[39,75],[39,78],[28,78],[28,75],[31,75],[31,69],[21,69],[21,75],[24,75],[24,78],[13,78],[13,75],[16,75],[16,59],[13,59]],
    ],
    [
      ...lancet(0,-14,28,46,6),
      [[-7,-21],[5,-29],[10,-24],[10,-15],[-3,-3],[-3,3],[10,14],[10,27],[-5,39],[-11,32],[-11,26],[2,15],[2,11],[-11,0],[-11,-11]],
      [[-33,46],[33,46],[33,50],[-33,50]],
    ],
  ];
  window.DSHLateranoEmblem=Object.freeze({name:'CONCORD',parts});
})();
