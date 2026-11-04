/* LANTERN-014 — ONE USEFUL THING. Deterministic, offline, inspectable engine.
 * No API, network, cloud identity, human moral scores, or automatic commitments.
 * All results come from source text and visible fixed transformations.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Lantern014 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODES = Object.freeze(['unstick', 'sort', 'draft', 'decide']);
  const BUDGETS = Object.freeze([2, 5, 15, 30]);
  const MAX_SOURCE = 8000;
  const LABELS = {unstick: 'Unstick', sort: 'Sort a pile', draft: 'Make a useful note', decide: 'Choose a test'};
  const tidy = s => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  function clip(s, n) { s=tidy(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
  function cleanLine(s) {
    return tidy(s).replace(/^\s*(?:[-*•]|\d{1,2}[.)]|\[[ xX]\])\s*/, '').replace(/^\s*(?:TODO|TO-DO|TASK)\s*[:\-]\s*/i, '').trim();
  }
  function extractLines(source) {
    let expanded = tidy(source).replace(/([.!?])\s+(?=[A-Z])/g, '$1\n');
    const candidates = expanded.split(/\n+|;\s*/).map(cleanLine).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const line of candidates) {
      let text = clip(line.replace(/\s+/g,' '), 240);
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase()); out.push(text);
      if (out.length === 15) break;
    }
    return out;
  }
  function priority(text) {
    if (/\b(today|now|urgent|asap|overdue|tomorrow|deadline|due|before noon|this morning)\b/i.test(text)) return 'now';
    if (/\b(later|someday|eventually|maybe|when i can|next month|future)\b/i.test(text)) return 'later';
    return 'next';
  }
  function pickTitle(text, lines) {
    const lead = cleanLine(lines[0] || text);
    return clip(lead.replace(/^(i\s+(?:need|want|have|hope|plan|wish|would like)\s+to\s+)/i, ''), 62) || 'One useful thing';
  }
  function strategy(source) {
    const s = String(source || '').toLowerCase();
    const cases = [
      {match: /\b(photo|photos|image|images|raw|lightroom|picture|pictures|photograph)\b/, key:'photos',
       move:'Create a folder called “Photo picks”; move or copy three candidate images into it.',
       proof:'Three actual image files exist in the new folder.'},
      {match:/\b(resume|cv|job application|applying|work history|interview)\b/, key:'resume',
       move:'Open your résumé and add one verified job title, employer, and date range.',
       proof:'The résumé contains one accurate, saved work-history entry.'},
      {match:/\b(bug|broken code|debug|github|repository|script error|website error|app bug)\b/, key:'debug',
       move:'Reproduce the problem once; record the exact action, expected result, and observed result.',
       proof:'A reproduction note names an actual input and actual observed failure.'},
      {match:/\b(song|lyric|lyrics|album|track|guitar|melody|music|mix)\b/, key:'music',
       move:'Open one unfinished song or track and save a single concrete change to it.',
       proof:'One track or lyric file now contains the saved change.'},
      {match:/\b(file|folder|document|downloads|desktop|archive|organize files|sort files)\b/, key:'files',
       move:'Create a folder named “To sort” and move five loose files into it.',
       proof:'Five files are now together in one folder.'},
      {match:/\b(bill|payment|budget|expense|overdraft|money|balance|cost)\b/, key:'expenses',
       move:'Write down one upcoming expense, its amount, and the date it is due—without account numbers.',
       proof:'You have one dated expense record you can act on.'},
      {match:/\b(event|gathering|fellowship|potluck|party|church night|volunteer night)\b/, key:'event',
       move:'Create a three-line event brief: what it is, where it is, and when it happens. Put “TBD” for unknown details.',
       proof:'A three-line event brief exists as a saved note.'},
      {match:/\b(clean|laundry|clutter|messy room|dishes|tidy|organize room)\b/, key:'tidy',
       move:'Put five out-of-place items where they belong.',
       proof:'Five objects have actually been moved, not merely listed.'},
      {match:/\b(meal|recipe|food|cook|kitchen|dinner|lunch)\b/, key:'food',
       move:'Check what ingredients are already available and prepare one usable portion or ingredient.',
       proof:'Something edible is prepared, or one ingredient is washed, cut, or portioned.'},
      {match:/\b(email|letter|message|text someone|reply|write to|announcement|post)\b/, key:'writing',
       move:'Draft the first two factual sentences in the editable work note. Save it without sending.',
       proof:'Two editable sentences exist in the saved draft.'},
      {match:/\b(camera|cable|adapter|pedal|midi|equipment|device|hardware)\b/, key:'gear',
       move:'Connect one device or cable and record exactly what changed or failed.',
       proof:'One real connection has been tested and its result recorded.'}
    ];
    return cases.find(x => x.match.test(s)) || {
      key:'general',
      move:'Choose the first concrete task in your note. Perform its smallest physical or digital step for five minutes.',
      proof:'A real file, object, or situation has changed—not just the plan.'
    };
  }
  function actionFromLines(lines, fallback) {
    const first = lines.find(x => /\b(?:need to|have to|must|should|fix|finish|clean|sort|organize|write|open|send|make|build|move|take|record|test|update|check|create|pay|prepare|copy|edit|file|pick)\b/i.test(x));
    if (!first) return fallback;
    let action = first.replace(/^i\s+(?:need|want|have|plan)\s+to\s+/i, '')
      .replace(/^i\s+should\s+/i, '').replace(/\.$/, '');
    if (!action || action.length > 145 || /\b(and then|after that|someday|eventually)\b/i.test(action)) return fallback;
    return clip(action.charAt(0).toUpperCase() + action.slice(1) + '.', 155);
  }
  function optionsFromSource(source, lines) {
    let out = [];
    const short = String(source || '').match(/\b(?:between|either)\s+([^\n,;.]{2,80}?)\s+(?:or|and)\s+([^\n,;.]{2,80})/i);
    if (short) out = [cleanLine(short[1]), cleanLine(short[2])];
    if (out.length < 2) {
      const or = String(source || '').split(/\s+or\s+/i);
      if (or.length === 2 && or.every(x => x.trim().length <= 95)) out = or.map(cleanLine);
    }
    if (out.length < 2 && lines.length >= 2) out = lines.slice(0, 4);
    out = [...new Set(out.map(x => clip(x, 100)).filter(Boolean))].slice(0,4);
    return out.length >= 2 ? out : ['Try the smallest reversible option', 'Keep things as they are for now'];
  }
  function build(input) {
    const source=tidy(input && input.source);
    if (!source) throw new Error('Write one sentence about what you want to move forward.');
    if (source.length > MAX_SOURCE) throw new Error('Keep the note under 8,000 characters.');
    const mode = input.mode || 'unstick';
    if (!MODES.includes(mode)) throw new Error('Unknown mode.');
    const minutes=Number(input.minutes || 5);
    if (!BUDGETS.includes(minutes)) throw new Error('Select a supported time budget.');
    const lines=extractLines(source);
    const idea=strategy(source);
    const title=pickTitle(source,lines);
    const notes=lines.map((text,i)=>({id:i+1,text,priority:priority(text),done:false}));
    const options=mode==='decide'?optionsFromSource(source,lines):[];
    const chosen=null;
    let move, proof;
    if(mode==='unstick') {
      move=idea.move; proof=idea.proof;
    } else if(mode==='sort') {
      const first=notes.find(n=>n.priority==='now') || notes[0];
      move=first ? 'Start with this item: '+clip(first.text,145) : idea.move;
      proof='At least one listed item is checked off because a real action was taken.';
    } else if(mode==='draft') {
      move='Edit the generated note so its first paragraph accurately describes the situation; save the file.';
      proof='A usable .md note has been saved locally with your verified details.';
    } else {
      move='Choose one option below, then perform a reversible five-minute test or observation of it.';
      proof='One option is selected, and one actual test result or observation is recorded.';
    }
    return {schema:'lantern.solo-work-card/v1',title,source,mode,minutes,move,proof,
      strategy:idea.key,notes,options,chosen,done:false,outcome:'',parent_id:null,version:1};
  }
  function markdown(card) {
    const c = card || {};
    const heading='# '+tidy(c.title || 'One useful thing');
    const parts=[heading,'','Made with LANTERN 014 • offline, human-controlled work card',
      '',`Mode: ${LABELS[c.mode] || c.mode || 'Unstick'} | Timebox: ${c.minutes || 5} minutes`,
      '', '## First useful move', tidy(c.move), '', '## Counts as done',tidy(c.proof),
      '', '## Original words', tidy(c.source)];
    if (Array.isArray(c.notes)&&c.notes.length){
      parts.push('','## Items');
      for (const n of c.notes) parts.push(`- [${n.done?'x':' '}] ${tidy(n.text)} (${n.priority || 'next'})`);
    }
    if (Array.isArray(c.options)&&c.options.length){
      parts.push('','## Options');
      for(const x of c.options) parts.push('- '+tidy(x)+(c.chosen===x?' ← selected':''));
    }
    parts.push('','## My working note',tidy(c.workNote || '') || '(Write here; no facts invented by the app.)',
      '', '## Outcome (self-reported)',c.done?'Marked complete':'Not yet marked complete',
      tidy(c.outcome) || '(No outcome recorded.)');
    if(c.id) parts.push('','Snapshot ID: '+String(c.id));
    if(c.parent_id) parts.push('Parent snapshot: '+String(c.parent_id));
    parts.push('','---','This file records your words and your own reported actions. It is not external verification.');
    return parts.join('\n')+'\n';
  }
  function safeSnapshot(x) {
    if(!x || x.schema!=='lantern.solo-work-card/v1') throw new Error('Unrecognized work-card format.');
    if (typeof x.source!=='string' || x.source.length>MAX_SOURCE || !x.source.trim()) throw new Error('Invalid source text.');
    if (!MODES.includes(x.mode) || !BUDGETS.includes(Number(x.minutes))) throw new Error('Invalid work-card choices.');
    const base=build({source:x.source,mode:x.mode,minutes:Number(x.minutes)});
    const notes=base.notes.map((n,i)=>({...n, done:Boolean(x.notes && x.notes[i] && x.notes[i].done)}));
    const selected=(base.options.includes(x.chosen) ? x.chosen : null);
    return {...base,notes,chosen:selected,done:Boolean(x.done),
      workNote:clip(x.workNote,12000),outcome:clip(x.outcome,2000),
      id:clip(x.id,140),createdAt:clip(x.createdAt,60),
      parent_id:clip(x.parent_id,140)||null,
      version:Number.isInteger(x.version)&&x.version>=1&&x.version<=10000?x.version:1};
  }
  function validShelf(raw) {
    if(!raw || raw.schema!=='lantern.solo-shelf/v1' || !Array.isArray(raw.cards) || raw.cards.length>100) throw new Error('This is not a valid Solo Shelf backup.');
    const list=raw.cards.map(safeSnapshot),ids=new Set();
    for(const c of list){
      if(!c.id||ids.has(c.id))throw new Error('Duplicate or missing snapshot identity.');
      ids.add(c.id);
    }
    return {schema:'lantern.solo-shelf/v1',cards:list};
  }
  return {MODES,BUDGETS,MAX_SOURCE,LABELS,extractLines,priority,strategy,build,markdown,safeSnapshot,validShelf};
});
