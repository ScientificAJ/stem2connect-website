import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { programs, reviewedOn, filterPrograms, rankPrograms, matchReasons } from '../../opportunities-data.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const ids = programs.map(p => p.id);
assert.equal(new Set(ids).size, ids.length, 'Program IDs must be unique');
for (const id of ['bwsi','sams','clark','mites','esteem','esp','wss','duke-stem','summet','sally-ride','wie-rise','okstate-robotics','aggie','ualr','dsap','smart']) assert(ids.includes(id), `Requested program missing: ${id}`);
for (const p of programs) {
  for (const key of ['name','organization','description','eligibility','costNote','deadline','admissions','cycle']) assert(p[key]?.length, `${p.id}: missing ${key}`);
  for (const url of [p.url,...p.sources]) {const parsed = new URL(url); assert.equal(parsed.protocol,'https:'); assert(!/(^|\.)(example\.(org|com|net)|localhost)$/.test(parsed.hostname),'Placeholder link');}
  assert(['upcoming','closed','verify','archived'].includes(p.status));
  if (p.coordinates) {assert.equal(p.coordinates.length,2); assert(p.coordinates[0]>=-90&&p.coordinates[0]<=90);assert(p.coordinates[1]>=-180&&p.coordinates[1]<=180);}
  else assert(p.modes.includes('online'),`${p.id}: only online programs may omit campus coordinates`);
}
// Strict preferences must exclude incompatible or unconfirmed options.
assert(filterPrograms(programs,{budget:'free'}).every(p=>p.tuitionFree));
assert(!filterPrograms(programs,{budget:'free'}).some(p=>p.id==='bwsi'));
assert(filterPrograms(programs,{budget:'500'}).every(p=>p.price!==null&&p.price<=500));
assert(filterPrograms(programs,{mode:'online'}).every(p=>p.modes.includes('online')));
assert.deepEqual(filterPrograms(programs,{query:'  carnegie mellon  '}).map(p=>p.id),['sams']);
assert(!filterPrograms(programs,{grade:'9'}).some(p=>p.id==='mites'));
assert(!filterPrograms(programs,{age:'16'}).some(p=>p.id==='clark'));
assert(filterPrograms(programs,{topics:['environment']}).every(p=>p.topics.includes('environment')));
assert.equal(filterPrograms(programs,{query:'no-such-program'}).length,0);
assert.deepEqual(filterPrograms(programs,{savedOnly:true},['sams']).map(p=>p.id),['sams']);
assert(!filterPrograms(programs,{finder:true}).some(p=>p.status==='archived'));
assert.equal(rankPrograms(programs).at(-1).id,'duke-stem');
assert(matchReasons(programs.find(p=>p.id==='summet'),{goal:'build'}).includes('Hands-on projects'));
assert.equal(filterPrograms(programs,{mode:'online',grade:'9',budget:'free',season:'year-round'})[0].id,'wss');
// Runtime libraries are local and only load after Map is selected.
const html = await readFile(join(root,'opportunities.html'),'utf8');
assert(!html.includes('leaflet.js')); assert(!html.includes('tile.openstreetmap.org'));
assert(!html.includes('example.org'));
for (const file of ['opportunities.js','opportunities.css','opportunities-data.mjs']) assert((await stat(join(root,file))).size < 60000, `${file} exceeded the startup budget`);
// A usable, generated directory remains available when scripts are unavailable.
const e = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards = programs.map(p=>`<article class="program-card"><p class="program-org">${e(p.organization)}</p><h2>${e(p.name)}</h2><p class="program-description">${e(p.description)}</p><p>${e(p.location)} · ${e(p.duration)}</p><p><strong>${e(p.cost)}</strong></p><p>${e(p.costNote)}</p><p>${e(p.eligibility)}</p><p>${e(p.deadline)}</p><a class="program-official" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">Official program ↗</a></article>`).join('\n');
await writeFile(join(root,'opportunities-directory.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Program directory | STEM2Connect</title><link rel="preconnect" href="https://use.typekit.net" crossorigin />
<link rel="preconnect" href="https://p.typekit.net" crossorigin />
<link rel="preload" as="style" href="https://use.typekit.net/zmn3juo.css" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="https://use.typekit.net/zmn3juo.css" /></noscript>
<link rel="stylesheet" href="adobe-typography.css?v=1" />
<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="opportunities.css?v=3"></head><body class="opportunity-page"><main class="opp-container" style="padding-block:40px"><a href="opportunities.html" class="opp-text-button">← Back to the interactive guide</a><h1>STEM opportunity directory</h1><p>Reviewed ${reviewedOn}. Confirm current availability with each provider.</p><div class="program-grid">${cards}</div></main></body></html>\n`);
console.log(`Opportunities: ${programs.length} sourced entries; matching, URL, coordinate, fallback, and startup-budget checks passed.`);
