// Deterministic timing and checkpoint contract shared by the cinema preview.
const assert=require('node:assert/strict');
require('../docs/startup-sequence.js');
const {Sequence,durations,lateranoDurations,total,checkpoints}=globalThis.DSHBoot;
assert.equal(total,13.8);
assert.deepEqual(durations,[2.1,1.8,2.2,3.4,1.8,2.5]);
assert.deepEqual(checkpoints,[0,2,4]);
const s=new Sequence();
assert.equal(s.waiting,true);
for(const phase of checkpoints){
 assert.equal(s.phase,phase);
 assert.equal(s.playing,false);
 s.choose(2);s.play();
 s.tick(durations[phase]/2);
 s.play(); // Repeated activation never changes elapsed time or advances a phase.
 assert.equal(s.phase,phase);
 assert.equal(s.choose(1),true); // Channel changes are live, not form submission.
 s.tick(durations[phase]/2);
 assert.equal(s.phase,phase+1);assert.equal(s.playing,true);
 s.tick(durations[phase+1]);
 if(phase<4){assert.equal(s.phase,phase+2);assert.equal(s.waiting,true);assert.equal(s.elapsed,0);}
}
assert.equal(s.completed,true);assert.equal(s.time,total);
s.restart();assert.equal(s.waiting,true);assert.equal(s.completed,false);
const auto=new Sequence(false);auto.play();auto.tick(total);
assert.equal(auto.completed,true);
auto.seek(3.9);assert.equal(auto.phase,2);assert.equal(auto.elapsed,0);assert.equal(auto.playing,false);
auto.seek(total);assert.equal(auto.completed,true);
auto.seek(-4);assert.equal(auto.phase,0);assert.equal(auto.elapsed,0);
auto.tick(NaN);auto.jump(99);assert.equal(auto.choose(-1),false);assert.equal(auto.phase,0);
const delayed=new Sequence();delayed.play();delayed.tick(100);
assert.equal(delayed.phase,2);assert.equal(delayed.waiting,true);assert.equal(delayed.elapsed,0);
delayed.jump(5);assert.equal(delayed.completed,false);delayed.play();delayed.tick(durations[5]);assert.equal(delayed.completed,true);
const loading=new Sequence(false);loading.hold(3);loading.play();loading.tick(100);
assert.equal(loading.phase,3);assert.equal(loading.elapsed,durations[3]);assert.equal(loading.held,true);assert.equal(loading.playing,true);
loading.tick(50);assert.equal(loading.time,9.5,'a pending real load must not accumulate hidden time');
loading.release(3);loading.tick(.001);assert.equal(loading.phase,4);assert.equal(loading.held,false);
loading.hold(5);loading.tick(100);assert.equal(loading.phase,5);assert.equal(loading.completed,false,'the final voice can also hold completion');
loading.release(5);loading.tick(.001);assert.equal(loading.completed,true);
loading.restart();assert.equal(loading.barriers.size,0);

assert.deepEqual(lateranoDurations,[3.4,2.6,3.6,4.2,2.8,3.8]);
assert.equal(Object.isFrozen(lateranoDurations),true);
const styled=new Sequence(false);
assert.equal(styled.durations,durations);assert.equal(styled.total,total);
styled.jump(1);styled.choose(2);styled.hold(3);styled.play();styled.tick(durations[1]/2);
const barriers=styled.barriers,choices=styled.choices;
assert.equal(styled.setDurations(lateranoDurations),true);
assert.equal(styled.phase,1);assert.equal(styled.progress,.5);assert.equal(styled.elapsed,1.3);
assert.equal(styled.playing,true);assert.equal(styled.completed,false);assert.equal(styled.held,false);
assert.equal(styled.total,20.4);assert.equal(styled.time,4.7);
assert.equal(styled.barriers,barriers);assert.deepEqual([...barriers],[3]);
assert.equal(styled.choices,choices);assert.equal(styled.choices[1],2);
assert.equal(Object.isFrozen(styled.durations),true);
assert.equal(new Sequence().total,13.8);assert.deepEqual(durations,[2.1,1.8,2.2,3.4,1.8,2.5]);
styled.pause();assert.equal(styled.setDurations(durations),true);
assert.equal(styled.playing,false);assert.equal(styled.progress,.5);assert.equal(styled.elapsed,.9);

// Rejected timing inputs leave every visible playback state and retained reference untouched.
const state={durations:styled.durations,total:styled.total,phase:styled.phase,elapsed:styled.elapsed,playing:styled.playing,completed:styled.completed,barriers:styled.barriers,choices:styled.choices};
for(const invalid of [null,undefined,{},'123456',[],[1,2,3,4,5],[1,2,3,4,5,6,7],new Array(6),new Float64Array(6),...[0,-1,NaN,Infinity,60.01,'2',null,true].map(value=>[1,2,3,value,5,6])]){
 assert.equal(styled.setDurations(invalid),false);
 for(const [key,value] of Object.entries(state))assert.equal(styled[key],value,`invalid timings changed ${key}`);
}
const supplied=[60,2,3,4,5,6];assert.equal(styled.setDurations(supplied),true);supplied[0]=1;
assert.equal(styled.durations[0],60,'caller mutations must not change validated timings');
assert.equal(styled.total,80);
const tiny=new Sequence(false);assert.equal(tiny.setDurations(Array(6).fill(1e-8)),true);assert.equal(tiny.total,6e-8);

// A pending real load remains held at its new phase boundary after either timing change.
const held=new Sequence(false);held.hold(3);held.hold(5);held.play();held.tick(100);
const heldBarriers=held.barriers;
assert.equal(held.setDurations(lateranoDurations),true);
assert.equal(held.phase,3);assert.equal(held.elapsed,4.2);assert.equal(held.progress,1);assert.equal(held.held,true);
assert.equal(held.playing,true);assert.equal(held.completed,false);assert.equal(held.barriers,heldBarriers);
held.tick(50);assert.equal(held.time,13.8,'retiming a held phase must not accumulate hidden time');
held.pause();held.setDurations(durations);assert.equal(held.held,false);assert.equal(held.elapsed,3.4);
held.play();assert.equal(held.held,true);held.setDurations(lateranoDurations);held.release(3);held.tick(.001);
assert.equal(held.phase,4);assert.equal(held.held,false);
held.tick(100);assert.equal(held.phase,5);assert.equal(held.held,true);assert.equal(held.completed,false);
held.setDurations(durations);assert.equal(held.elapsed,2.5);assert.equal(held.held,true);assert.equal(held.completed,false);
held.release(5);held.tick(.001);assert.equal(held.completed,true);
held.setDurations(lateranoDurations);assert.equal(held.completed,true);assert.equal(held.playing,false);assert.equal(held.time,20.4);assert.equal(held.progress,1);
held.restart();assert.equal(held.total,20.4);assert.deepEqual(held.durations,lateranoDurations);assert.equal(held.barriers.size,0);
held.play();held.tick(held.total);assert.equal(held.completed,true);assert.equal(held.time,20.4);
held.seek(6);assert.equal(held.phase,2);assert.equal(held.elapsed,0);assert.equal(held.completed,false);assert.equal(held.playing,false);
held.seek(20.4);assert.equal(held.completed,true);held.seek(100);assert.equal(held.time,20.4);

const retimedCheckpoints=new Sequence();retimedCheckpoints.setDurations(lateranoDurations);
for(const phase of checkpoints){
 assert.equal(retimedCheckpoints.phase,phase);assert.equal(retimedCheckpoints.waiting,true);
 retimedCheckpoints.play();retimedCheckpoints.tick(100);
}
assert.equal(retimedCheckpoints.completed,true);assert.equal(retimedCheckpoints.time,20.4);
retimedCheckpoints.jump(2);retimedCheckpoints.setDurations(durations);
assert.equal(retimedCheckpoints.waiting,true);assert.equal(retimedCheckpoints.phase,2);assert.equal(retimedCheckpoints.elapsed,0);
console.log('PASS: original 13.8s timing, per-instance 20.4s Laterano timing, normalized retiming, strict validation, checkpoints, real-load/voice holds, seek, completion and replay.');
