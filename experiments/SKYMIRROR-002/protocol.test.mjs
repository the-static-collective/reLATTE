import test from 'node:test';
import assert from 'node:assert/strict';
import {bytesForText, frame, deframe, bytesToChips, chipsToBytes, transmission, decodeCapture, syntheticCapture, crc16} from './protocol.mjs';

test('hex-known CRC-16/CCITT-FALSE vector',()=>{assert.equal(crc16(new TextEncoder().encode('123456789')),0x29b1);});
test('framing roundtrip byte exact',()=>{
  const original=bytesForText('hello');
  assert.deepEqual(deframe(frame(original)),original);
  assert.deepEqual(chipsToBytes(bytesToChips(frame(original))),frame(original));
});
test('UTF-8 survives exact byte recovery',()=>{
  const s='✠ sky';
  const result=decodeCapture(syntheticCapture(s));
  assert.equal(result.status,'VALID');
  assert.equal(result.text,s);
});
test('short packet resolves preamble phase despite camera jitter',()=>{
  const result=decodeCapture(syntheticCapture('HI',{chipMs:600,frameMs:43,noise:9}));
  assert.equal(result.status,'VALID');
  assert.equal(result.text,'HI');
});
test('inverted polarity is recovered as a distinct observation',()=>{
  const result=decodeCapture(syntheticCapture('LIGHT',{inverted:true,noise:5}));
  assert.equal(result.status,'VALID');
  assert.equal(result.inverted,true);
  assert.equal(result.text,'LIGHT');
});
test('0.5 second chips decode at imperfect 25 fps capture',()=>{
  const result=decodeCapture(syntheticCapture('MIRROR',{chipMs:500,frameMs:41,noise:12}),{chipMs:500});
  assert.equal(result.status,'VALID');
  assert.equal(result.text,'MIRROR');
});
test('reversed ordering is explicitly rejected',()=>{
  const arr=syntheticCapture('X');
  assert.throws(()=>decodeCapture(arr.reverse()),/UNSORTED_SAMPLES/);
});
test('low contrast blocks delivery',()=>{
  const result=decodeCapture(syntheticCapture('X',{low:110,high:119,noise:1}));
  assert.equal(result.status,'LOW_CONTRAST');
});
test('truncated capture never claims reception',()=>{
  const arr=syntheticCapture('HI');
  assert.notEqual(decodeCapture(arr.slice(0,Math.floor(arr.length*.6))).status,'VALID');
});
test('tampered frame fails CRC',()=>{
  const raw=frame(bytesForText('WITNESS'));
  raw[3]^=0x1;
  assert.throws(()=>deframe(raw),/CRC_MISMATCH/);
});
test('length and invalid Manchester pairs cannot pass',()=>{
  assert.throws(()=>bytesForText('x'.repeat(25)),/PAYLOAD_LENGTH/);
  const chips=bytesToChips(frame(bytesForText('X')));
  chips[0]=chips[1];
  assert.throws(()=>chipsToBytes(chips),/MANCHESTER_ERROR/);
});
test('rate and payload durations calculated from actual symbols',()=>{
  const a=transmission('HI',600);
  assert.equal(a.durationMs,(20+(4+2)*16)*600);
  assert.throws(()=>transmission('HI',90),/CHIP_RATE_RANGE/);
});
