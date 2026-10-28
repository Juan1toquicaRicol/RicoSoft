import fs from 'node:fs/promises';
import { FileBlob, PresentationFile } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p = await PresentationFile.importPptx(await FileBlob.load('C:/Users/admin/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-light-mode/assets/reference.pptx'));
console.log((await p.inspect({kind:'slide,textbox,shape,image,table,chart,layout',maxChars:20000})).ndjson);
console.log('size', JSON.stringify(p.slideSize), 'slides',p.slides.items.length);
for (let i=0;i<p.slides.items.length;i++) {const png=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(`C:/Users/admin/Downloads/RicoSoft/RicoSoft/.codex-presentation-build/template-slide-${i+1}.png`,new Uint8Array(await png.arrayBuffer()));}
