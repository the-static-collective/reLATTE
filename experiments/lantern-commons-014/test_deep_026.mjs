import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('./Lantern_026_Deep_Glean.html',import.meta.url),'utf8');
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.dataset={};this.style={};this.value='';this.textContent='';this.checked=false}
 append(...x){this.children.push(...x)}replaceChildren(...x){this.children=[...x]}
 addEventListener(k,v){this.events[k]=v}setAttribute(k,v){this[k]=v}remove(){}
 click(){return this.events.click?.({preventDefault(){},target:this})}
}
