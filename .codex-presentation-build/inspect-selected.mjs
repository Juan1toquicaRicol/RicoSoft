import { FileBlob, PresentationFile } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p=await PresentationFile.importPptx(await FileBlob.load('C:/Users/admin/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-light-mode/assets/reference.pptx'));
const rows=(await p.inspect({kind:'slide,textbox,shape,image,table,chart,notes',maxChars:100000})).ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x));
const wanted=new Set([0,2,3,8,9,14,16,17,25]);
for(const r of rows){ if(r.kind==='slide' ? wanted.has(r.slideIndex) : wanted.has(r.slideIndex)) console.log(JSON.stringify(r)); }
