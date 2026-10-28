import { FileBlob, PresentationFile } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p=await PresentationFile.importPptx(await FileBlob.load('C:/Users/admin/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-light-mode/assets/reference.pptx'));
const rows=(await p.inspect({kind:'slide,textbox,shape,notes',maxChars:120000})).ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x));
for(const ix of [3,8,14,16,17]) {console.log('\n==',ix+1,'=='); for(const r of rows.filter(r=>r.slideIndex===ix && ['textbox','notes'].includes(r.kind))) console.log(r.kind,r.id,JSON.stringify((r.text??'').slice(0,170)));}
