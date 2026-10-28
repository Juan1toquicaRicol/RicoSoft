import { FileBlob, PresentationFile } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p=await PresentationFile.importPptx(await FileBlob.load('C:/Users/admin/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-light-mode/assets/reference.pptx'));
const rows=(await p.inspect({kind:'slide,textbox,shape,table,notes',maxChars:120000})).ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x));
for(const ix of [8,9,14,16,17]) {console.log('\n=== SOURCE SLIDE',ix+1,'==='); for(const r of rows.filter(r=>r.slideIndex===ix)) console.log(JSON.stringify(r));}
