import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileBlob, PresentationFile } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import { pathToFileURL } from 'node:url';

const workspaceDir = 'C:/Users/admin/Downloads/RicoSoft/RicoSoft';
const skillDir = 'C:/Users/admin/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/Presentations';
const templatePath = 'C:/Users/admin/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-light-mode/assets/reference.pptx';
const finalPath = path.join(workspaceDir, 'Reportes', 'RicoSoft_Post_Despliegue_color2.pptx');
const stagingDir = path.join(workspaceDir, '.codex-presentation-build');
const renderDir = path.join(stagingDir, 'rendered-final');
await fs.mkdir(path.dirname(finalPath), { recursive: true });
await fs.mkdir(renderDir, { recursive: true });
try { await fs.access(finalPath); throw new Error(`Output already exists: ${finalPath}`); } catch (e) { if (e.message.startsWith('Output already exists:')) throw e; }

const presentation = await PresentationFile.importPptx(await FileBlob.load(templatePath));
// Keep and reorder the actual template layouts selected for the RicoSoft story.
presentation.slides.keep([0, 3, 8, 9, 14, 16, 17, 25]);
presentation.slides.reorder([
  'sl/y90nupkv',  // cover
  'sl/jyx0ra1s',  // two-column status
  'sl/14bup87q',  // first-day timeline
  'sl/m90b6t0r',  // acceptance checklist
  'sl/vaxsvy10',  // background processes
  'sl/y5wne50z',  // response timeline cards
  'sl/udsvah03',  // acceptance gates
  'sl/l0bepsfm',  // close
]);
// The source timeline connectors extend past the canvas edge; trim them to the template's margins.
presentation.resolve('sh/1c7e50ni').position = { left: 35.46, top: 354.2, width: 1209, height: 0.03 };
presentation.resolve('sh/wrelszu9').position = { left: 35.46, top: 560.8, width: 1209, height: 0.03 };
const put = (id, text) => { presentation.resolve(id).text = text; };
const notes = (id, text) => { presentation.resolve(id).text = text; };

// Cover
put('sh/7qp4be9c', 'RicoSoft\nPost-despliegue');
put('sh/65g3298r', 'Guía de validación, operación y respuesta inicial\nGrupo Ricol · 28 de octubre de 2026');
put('sh/ts7md4r2', 'SISTEMAS E INFORMÁTICA');
notes('nt/y90nupkv', 'Fuentes: server/DEPLOY.md; Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md. La guía y los reportes describen procedimientos; no verifican el estado actual del servidor productivo.');

// Slide 2 — documented versus still to verify
put('sh/ozydc3u9', 'Estado del despliegue y límites de verificación');
put('sh/fapwfyds', 'Documentado\nBackend para Windows con Node.js 20 o superior y PM2. El runbook indica compilar, aplicar migraciones pendientes antes del reinicio y guardar el estado de PM2.\n\nPC-RC-SV aparece como destino previsto en la auditoría; su instalación y configuración real no fueron verificadas.');
put('sh/1cj2d8b6', 'Por comprobar en el servidor\nRuntime y URL final del frontend.\n\nHTTPS confiable, proxy y acceso desde otro equipo.\n\nEstado de migraciones, CI y protección de rama. Backup y restauración de SQL Server y archivos.');
put('sh/p0rel8vu', '2');
notes('nt/jyx0ra1s', 'Fuentes: server/DEPLOY.md; Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md, secciones 1, 2, 3 y 9. El informe aclara que PC-RC-SV y su base no se inspeccionaron.');

// Slide 3 — first hours and day
put('sh/pc7qhwn6', 'Primeras verificaciones');
put('sh/ihcvml4j', 'Al iniciar');
put('sh/3ap8fm50', 'Primera hora');
put('sh/gnepkr69', 'Primer día');
put('sh/honqdwnu', 'Servicio disponible\nConfirmar URL final, HTTPS, proceso PM2 y logs de arranque. `/health` solo confirma respuesta del proceso; no prueba SQL, Siesa ni procesos programados.');
put('sh/jilcvq54', 'Flujos críticos\nValidar inicio de sesión, permisos, tenant activo, flujos aprobados, adjuntos y navegación/refresco de rutas.');
put('sh/14rqpgne', 'Operación estable\nRevisar estado de SQL, Siesa/VPN y jobs habilitados. Confirmar una sola instancia, reinicio ordenado y ejecución de los procesos esperados.');
put('sh/rm5czq50', '3');
notes('nt/14bup87q', 'Fuentes: Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md, secciones 5 y 9; Reportes/SINCRONIZACIONES_Y_MONITOREO_2026-10-26.md, secciones 4, 5 y 9.');

// Slide 4 — browser acceptance
put('sh/k7q50v2x', 'Validación funcional desde la red interna');
put('sh/7ahoba18', 'Pruebas de aceptación\nNo basta con un build correcto.');
put('sh/q5gb21kb', '• Abrir la URL final desde un segundo equipo y confirmar el certificado HTTPS.\n\n• Iniciar sesión con perfiles aprobados; revisar navegación, permisos y cambio de tenant.\n\n• Ejecutar flujos frecuentes y validar archivos, rutas directas y resultado en pantalla.');
// Empty circles mark acceptance criteria as pending validation, not completed checks.
for (const id of ['sh/cbu58j2h', 'sh/fapcz6ls', 'sh/p0ru503u', 'sh/wvetgbud', 'sh/lk7ut0va']) {
  const icon = presentation.resolve(id);
  icon.geometry = 'ellipse';
  icon.fill = 'none';
  icon.line = { style: 'solid', fill: '#000000', width: 1.5 };
}
put('sh/xc3mho32', 'Frontend carga en la URL final');
put('sh/e9gb61k7', 'API responde por HTTPS');
put('sh/ozitcv29', 'Roles y tenant aislados');
put('sh/xwnupgvy', 'Adjuntos y rutas probados');
put('sh/atwbelcn', 'Usuario referente acepta el resultado');
put('sh/l8z690ji', '4');
notes('nt/m90b6t0r', 'Fuente: Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md, sección 9, aceptación mínima antes de liberar. El informe indica que `/health` por sí solo no valida aceptación desde navegador.');

// Slide 5 — job states from the documented production decision
put('sh/wzipwn2t', 'Procesos automáticos y monitoreo');
put('sh/k3y5ov21', 'Configuración objetivo acordada\nA 26 de octubre de 2026: CrossChex y renovación de servicios activos; ingesta/procesamiento de correo y tracking apagados.\n\nConfirmar el `.env` real antes de arrancar. Siesa se sincroniza manualmente; Monitoreo muestra Siesa/VPN y ejecuciones.');
put('sh/5wvax0f6', 'CrossChex\ncada minuto');
put('sh/upkrilwj', 'Objetivo activo. Requiere MDB, driver ODBC compatible y una sola fuente biométrica activa.');
put('sh/judsvqxg', 'Renovación\n06:00 diaria');
put('sh/it4rm5wv', 'Objetivo activo. Revisar la primera corrida y la regla de destinatarios por tenant.');
put('sh/l0bqlgf2', 'Correo\napagado');
put('sh/0z29cbyh', 'Ingesta y procesamiento apagados hasta configurar la cuenta de Google Workspace.');
put('sh/gjax03m9', 'Tracking\napagado');
put('sh/1kjyt83e', 'Proveedor disponible simulado; mantener desactivado para embarques reales.');
put('sh/x0rqpsje', '5');
notes('nt/vaxsvy10', 'Fuente: Reportes/SINCRONIZACIONES_Y_MONITOREO_2026-10-26.md, secciones 1, 2, 4, 7 y 9. El estado activo/apagado es la configuración objetivo acordada en esa fecha, no una comprobación del `.env` actual.');

// Slide 6 — failure response
put('sh/upg3i18r', 'Respuesta inicial ante una falla');
put('sh/1cr2tg72', '1 · Diagnosticar');
put('sh/6hw3y9sb', '2 · Recuperar');
put('sh/gbylkbqh', '3 · Cerrar');
put('sh/nedoru9c', 'Aislar el impacto\nRegistrar hora, usuarios, módulo y alcance. Separar problema de aplicación, SQL o Siesa; conservar logs sin secretos.');
put('sh/90v6t4ri', 'Recuperar el servicio\nPriorizar volver a un build compatible. Seguir el procedimiento de PM2, revisar estado/logs y repetir las pruebas de aceptación.');
put('sh/v2xovu9o', 'Tratar migraciones aparte\nNo marcar ni revertir migraciones a ciegas. Comparar esquema e historial; preferir una corrección forward o restauración aprobada con análisis de pérdida.');
put('sh/itw3upcf', '6');
notes('nt/y5wne50z', 'Fuentes: Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md, sección 5; server/DEPLOY.md, secciones Operación diaria y Notas. Las migraciones pueden no ser reversibles; el runbook pide comparar estado físico e historial antes de resolverlas.');

// Slide 7 — evidence gates
put('sh/83qtobep', 'Criterios de aceptación post-despliegue');
put('sh/ah8nu54b', 'La publicación se acepta con evidencia del entorno real. Los checks de código no sustituyen la prueba de navegador, datos, integraciones ni recuperación.\n\nRegistrar resultados, responsables y pendientes en el cierre de cambio.');
put('sh/ofq5svm5', 'CI e integración\nCI completo verde, integración sin fallas ni omitidos y CI gate requerido en GitHub.');
put('sh/2xsjepgb', 'Seguridad y recuperación\nHTTPS confiable desde LAN; backup y restauración probados para base de datos y archivos.');
put('sh/3y107axw', 'Operación validada\nFlujos desde otro equipo, procesos esperados, logs revisados y responsables definidos.');
put('sh/94zaxgfa', '7');
// Empty circles keep these criteria neutral; they are not claims that checks have passed.
for (const id of ['sh/bih4na5w', 'sh/cnu1kzyd', 'sh/do3id4fy']) {
  const icon = presentation.resolve(id);
  icon.geometry = 'ellipse';
  icon.fill = 'none';
  icon.line = { style: 'solid', fill: '#000000', width: 1.5 };
}
notes('nt/udsvah03', 'Fuente: Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md, secciones 5, 7 y 9. Estos puntos son criterios de aceptación, no afirmaciones de que ya se hayan completado.');

// Closing slide
put('sh/8fil4b21', 'Cierre\noperativo');
put('sh/tgr2xg3m', 'Confirmar el estado real\nGuardar evidencia y responsables\nAceptar solo con pruebas del entorno');
put('sh/md0321kv', 'RicoSoft · Grupo Ricol');
notes('nt/l0bepsfm', 'Fuentes: server/DEPLOY.md; Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md; Reportes/SINCRONIZACIONES_Y_MONITOREO_2026-10-26.md.');

// Color system and editable diagrams: preserve the light template while adding
// purposeful color, diagram nodes, markers, and tinted cards.
const palette = { navy:'#15304B', blue:'#2878B8', teal:'#138A83', green:'#5B9A55', amber:'#E6A23C', coral:'#E46D58', violet:'#7A68A6', sky:'#EAF4FB', mint:'#EAF6F2', sand:'#FFF3DE', rose:'#FCECE8', lavender:'#F0EDFA' };
const addShape = (slideId, geometry, position, fill='none', lineFill='none', lineWidth=0, name='RicoSoft visual') => {
  return presentation.resolve(slideId).shapes.add({ geometry, name, position, fill, line:{style:'solid',fill:lineFill,width:lineWidth} });
};
const addDot = (slideId,x,y,size,color,label='') => {
  const sh=addShape(slideId,'ellipse',{left:x,top:y,width:size,height:size},color,color,0,'RicoSoft color node');
  if(label){ sh.text=label; sh.text.style={fontSize:Math.round(size*.24),bold:true,color:'#FFFFFF',alignment:'center',typeface:'Helvetica Neue'}; sh.text.insets=0; }
  return sh;
};
const addRibbon = (slideId) => {
  [palette.blue,palette.teal,palette.amber,palette.coral,palette.violet].forEach((c,i)=>addShape(slideId,'rect',{left:i*256,top:0,width:256,height:9},c,c,0,'RicoSoft color ribbon'));
  addShape(slideId,'roundRect',{left:20,top:36,width:7,height:62},palette.teal,palette.teal,0,'Title accent');
};
for (const sid of ['sl/y90nupkv','sl/jyx0ra1s','sl/14bup87q','sl/m90b6t0r','sl/vaxsvy10','sl/y5wne50z','sl/udsvah03','sl/l0bepsfm']) addRibbon(sid);
// Cover: a four-step post-deployment path in the open right-hand area.
const cover='sl/y90nupkv';
const flowX=[735,850,965,1080], flowColors=[palette.blue,palette.teal,palette.amber,palette.coral], flowNames=['Validar','Operar','Responder','Cerrar'];
for(let i=0;i<3;i++) addShape(cover,'line',{left:flowX[i]+58,top:355,width:58,height:0},'none',flowColors[i],4,'Post-deployment path');
flowX.forEach((x,i)=>{
  addDot(cover,x,306,62,flowColors[i],`0${i+1}`);
  const label=addShape(cover,'textbox',{left:x-23,top:386,width:110,height:34},'none','none',0,'Post-deployment phase');
  label.text=flowNames[i]; label.text.style={fontSize:17,bold:true,color:palette.navy,alignment:'center',typeface:'Helvetica Neue'}; label.text.insets=0;
});
addShape(cover,'ellipse',{left:1130,top:230,width:74,height:74},palette.lavender,palette.violet,2,'Decorative color form');
addShape(cover,'ellipse',{left:1161,top:470,width:48,height:48},palette.mint,palette.teal,2,'Decorative color form');
// Status slide: contrasting color rails distinguish documented procedure from pending verification.
addShape('sl/jyx0ra1s','roundRect',{left:30,top:190,width:7,height:440},palette.teal,palette.teal,0,'Documented status rail');
addShape('sl/jyx0ra1s','roundRect',{left:647,top:228,width:7,height:402},palette.amber,palette.amber,0,'Pending status rail');
// Timeline: one color per checkpoint, matching the deck's process palette.
presentation.resolve('sh/1c7e50ni').line={style:'solid',fill:'#A9B9C4',width:2};
['sh/gbedwfmx','sh/6lwvql4v','sh/t8ne10n6'].forEach((id,i)=>{const sh=presentation.resolve(id);sh.fill=[palette.blue,palette.teal,palette.violet][i];});
// Acceptance checklist: colored empty circles remain visibly pending.
['sh/cbu58j2h','sh/fapcz6ls','sh/p0ru503u','sh/wvetgbud','sh/lk7ut0va'].forEach((id,i)=>{const sh=presentation.resolve(id);sh.line={style:'solid',fill:[palette.blue,palette.teal,palette.violet,palette.amber,palette.coral][i],width:2.5};});
// Process map: color markers for the four scheduler states and add compact editable icons.
const process='sl/vaxsvy10';
const processRows=[{y:265,c:palette.blue,t:'CX'},{y:369,c:palette.teal,t:'06'},{y:473,c:palette.coral,t:'@'},{y:578,c:palette.violet,t:'↗'}];
processRows.forEach(({y,c,t})=>addDot(process,462,y,34,c,t));
addShape(process,'roundRect',{left:30,top:242,width:7,height:385},palette.blue,palette.blue,0,'Process summary rail');
// Incident-response cards: three distinct recovery stages.
['sh/md4nipsr','sh/8zm5kzax','sh/a14nm9s3'].forEach((id,i)=>{const sh=presentation.resolve(id);sh.fill=[palette.sky,palette.mint,palette.sand][i];});
presentation.resolve('sh/wrelszu9').line={style:'solid',fill:'#A9B9C4',width:2};
['sh/hsn2l4bu','sh/je5knut0','sh/4felwzu5'].forEach((id,i)=>{presentation.resolve(id).fill=[palette.blue,palette.amber,palette.teal][i];});
// Acceptance gates: tinted cards with matching outlined status circles.
['sh/9gzml0nq','sh/oza1gfyh','sh/p0ji9kf2'].forEach((id,i)=>{const sh=presentation.resolve(id);sh.fill=[palette.sky,palette.mint,palette.lavender][i];});
['sh/bih4na5w','sh/cnu1kzyd','sh/do3id4fy'].forEach((id,i)=>{presentation.resolve(id).line={style:'solid',fill:[palette.blue,palette.teal,palette.violet][i],width:2.5};});
// Closing: a clustered set of editable circles balances the large title and reinforces the four-step flow.
const closing='sl/l0bepsfm';
[[790,230,118,palette.sky,palette.blue],[955,310,112,palette.mint,palette.teal],[790,420,112,palette.sand,palette.amber],[955,510,98,palette.rose,palette.coral]].forEach(([x,y,size,fill,stroke])=>addShape(closing,'ellipse',{left:x,top:y,width:size,height:size},fill,stroke,4,'Closing visual node'));
addDot(closing,850,350,56,palette.violet,'CI');
// Soft color panels add visual structure without obscuring the original template content.
const addBackPanel=(slideId,x,y,w,h,fill,name)=>{const panel=addShape(slideId,'roundRect',{left:x,top:y,width:w,height:h},fill,'none',0,name);panel.sendToBack();return panel;};
addBackPanel('sl/jyx0ra1s',29,180,605,458,palette.mint,'Documented information panel');
addBackPanel('sl/jyx0ra1s',645,211,606,427,palette.sand,'Pending verification panel');
addBackPanel('sl/14bup87q',27,392,390,222,palette.sky,'Initial validation panel');
addBackPanel('sl/14bup87q',439,392,390,222,palette.mint,'First hour panel');
addBackPanel('sl/14bup87q',851,392,393,222,palette.lavender,'First day panel');
addBackPanel('sl/m90b6t0r',770,299,478,338,palette.sky,'Acceptance checklist panel');
[[238,palette.sky],[341,palette.mint],[445,palette.rose],[549,palette.lavender]].forEach(([y,c])=>addBackPanel('sl/vaxsvy10',447,y,797,88,c,'Scheduled process row'));
// The closing center label names the subject area without implying deployment approval.
presentation.resolve('sl/l0bepsfm');
const candidatePath = path.join(stagingDir, 'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
for (let i = 0; i < presentation.slides.items.length; i++) {
  const png = await presentation.export({ slide: presentation.slides.items[i], format: 'png', scale: 1 });
  await fs.writeFile(path.join(renderDir, `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await png.arrayBuffer()));
}
const inspection = await presentation.inspect({kind:'slide,textbox,shape,image,table,chart,notes',maxChars:50000});
await fs.writeFile(path.join(stagingDir,'final-inspect.ndjson'),inspection.ndjson,'utf8');
const referenceSha256 = createHash('sha256').update(await fs.readFile(templatePath)).digest('hex');
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir,'container_tools/artifact_tool_utils.mjs')).href);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: 'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  integrityValidatorPath: path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  explicitTotalSlideCount: 8,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: {basis:'reference',families:['Helvetica Neue','Helvetica Neue Medium'],referencePath:templatePath,referenceSha256,scriptFonts:{}},
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir,'RicoSoft_Post_Despliegue.validation.json'),
});
console.log(JSON.stringify({finalPath, slideCount:presentation.slides.items.length, result},null,2));

