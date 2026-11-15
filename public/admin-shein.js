(function auraSheinAdmin(){
 "use strict";
 const cfg=window.AURA_SUPABASE||{};
 const client=window.supabase?.createClient(cfg.url,cfg.publishableKey||cfg.anonKey);
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const rd=n=>"RD$ "+new Intl.NumberFormat("es-DO",{maximumFractionDigits:0}).format(Number(n)||0);
 const categories={hombre:"Hombre",mujer:"Mujer",ninos:"Niños"};
 const fields=["sku","source_product_id","category","title","brand","description","color","size","cost_usd","source_url","image_url","available","enabled","source_authorized","image_rights_ok","via_usa_confirmed","eta_17_confirmed","verified_at"];
 const flags=["available","enabled","source_authorized","image_rights_ok","via_usa_confirmed","eta_17_confirmed"];
 let inventory=[],settings={exchange_rate:65,margin_rd:1000,shipping_rd:100,lead_days:17},incoming=[],busy=false,pendingList=[],selectedPendingId=null,selectedPhotoId=null;
 function status(message,isError=false){
  const el=$("adminStatus");
  el.textContent=message;el.classList.toggle("error",isError);
 }
 function asBool(v){
  if(typeof v==="boolean")return v;
  if(["true","1","yes","si","sí","s"].includes(String(v??"").trim().toLowerCase()))return true;
  if(["false","0","no","n",""].includes(String(v??"").trim().toLowerCase()))return false;
  throw Error("Un campo de Sí/No contiene un valor inválido: "+v);
 }
 function normalize(r,index){
  const obj={};
  for(const k of fields)obj[k]=r[k]??"";
  for(const k of flags)obj[k]=asBool(obj[k]);
  obj.category=String(obj.category).trim().toLowerCase();
  obj.sku=String(obj.sku).trim();
  obj.source_product_id=String(obj.source_product_id).trim();
  obj.title=String(obj.title).trim();
  obj.brand=String(obj.brand).trim();
  obj.color=String(obj.color).trim();
  obj.size=String(obj.size).trim();
  obj.description=String(obj.description).trim();
  obj.source_url=String(obj.source_url).trim();
  obj.image_url=String(obj.image_url).trim();
  const cost=String(obj.cost_usd).trim();
  if(!/^\d{1,6}(\.\d{1,2})?$/.test(cost)||Number(cost)<=0)throw Error("Precio original tachado inválido en fila "+(index+1));
  obj.cost_usd=Number(cost).toFixed(2);
  if(!categories[obj.category]||!obj.sku||!obj.source_product_id||!obj.title||!obj.brand||!obj.color||!obj.size)throw Error("Datos de producto incompletos en fila "+(index+1));
  if(!/^https:\/\/([a-z0-9-]+\.)*shein\.com\//i.test(obj.source_url))throw Error("El enlace debe ser un producto SHEIN válido. Fila "+(index+1));
  if(obj.image_url&&!/^https:\/\//i.test(obj.image_url))throw Error("Imagen no válida, fila "+(index+1));
  if(!obj.verified_at||!Number.isFinite(new Date(obj.verified_at).valueOf()))throw Error("Falta fecha real de verificación, fila "+(index+1));
  obj.verified_at=new Date(obj.verified_at).toISOString();
  if(new Date(obj.verified_at).valueOf()>Date.now()+5*60000)throw Error("Fecha futura en fila "+(index+1));
  return obj;
 }
 function parseCsv(text){
  const cleaned=text.replace(/^\uFEFF/,"");
  const firstLine=cleaned.split(/\r?\n/)[0];
  const delimiter=firstLine.includes(";")&&!firstLine.includes(",")?";":",";
  const lines=[];let line=[],value="",quoted=false;
  for(let i=0;i<cleaned.length;i++){
   const c=cleaned[i];
   if(c==='"'){
    if(quoted&&cleaned[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
   }else if(c===delimiter&&!quoted){line.push(value);value="";}
   else if((c==="\n"||c==="\r")&&!quoted){
     if(c==="\r"&&cleaned[i+1]==="\n")i++;
     line.push(value);if(line.some(x=>x.trim()))lines.push(line);
     line=[];value="";
   }else value+=c;
  }
  if(quoted)throw Error("Archivo CSV con comillas sin cerrar.");
  line.push(value);if(line.some(x=>x.trim()))lines.push(line);
  if(lines.length<2)throw Error("CSV vacío: debe incluir cabecera y filas.");
  const header=lines[0].map(x=>x.trim().toLowerCase());
  for(const f of fields)if(!header.includes(f))throw Error("Falta columna "+f+" en el archivo CSV.");
  return lines.slice(1).map(line=>Object.fromEntries(header.map((h,i)=>[h,line[i]??""])));
 }
 const draftStatus=r=>{
  const flagsOK=r.source_authorized&&r.image_rights_ok&&r.via_usa_confirmed&&r.eta_17_confirmed&&r.available&&r.enabled&&r.image_url;
  if(!flagsOK)return "Borrador o sin condiciones confirmadas";
  if(Date.now()-new Date(r.verified_at).valueOf()>14*86400000)return "Oferta antigua: revisar";
  return "Publicable";
 };
 function preview(){
   const target=$("csvPreview");
   if(!incoming.length){target.innerHTML='<p class="hint">Selecciona un CSV o JSON autorizado para revisar sus variantes antes de importar.</p>';$("csvImport").disabled=true;return;}
   const h='<tr><th>SKU</th><th>Artículo</th><th>Variante</th><th>Original USD</th><th>Venta RD$</th><th>Estado</th></tr>';
   const result=incoming.slice(0,8).map(r=>{
    const price=Math.round(Number(r.cost_usd)*65+Number(settings.margin_rd));
    return '<tr><td>'+esc(r.sku)+'</td><td>'+esc(r.brand+' '+r.title)+'</td><td>'+esc(r.color+' / '+r.size)+'</td><td>US$'+esc(r.cost_usd)+'</td><td>'+rd(price)+'</td><td>'+esc(draftStatus(r))+'</td></tr>';
   }).join("");
   target.innerHTML='<p class="hint">'+incoming.length+' variantes listas. Los borradores no se publicarán hasta cumplir todas las verificaciones.</p><div class="table-scroll"><table>'+h+result+'</table></div>';
   $("csvImport").disabled=false;
 }
 function renderStats(){
   $("adminCount").textContent=String(inventory.length);
   $("adminReady").textContent=String(inventory.filter(r=>draftStatus(r)==="Publicable").length);
   $("adminDrafts").textContent=String(inventory.filter(r=>draftStatus(r)!=="Publicable").length);
   $("rateValue").value="RD$"+settings.exchange_rate+" / US$1";
   $("leadValue").textContent=settings.lead_days+" días";
   $("marginInput").value=settings.margin_rd;
   $("shippingInput").value=settings.shipping_rd;
   preview();
 }
 function renderInventory(){
  const search=$("inventorySearch").value.trim().toLowerCase();
  const filtered=inventory.filter(r=>[r.sku,r.title,r.brand,r.color,r.size].join(" ").toLowerCase().includes(search));
  const table=$("inventoryTable");
  const head='<tr><th>SKU</th><th>Producto · variante</th><th>Original SHEIN</th><th>Venta</th><th>Envío</th><th>Total</th><th>Estado</th><th>Acción</th></tr>';
  const body=filtered.slice(0,250).map(r=>{
   const sell=Math.round(Number(r.cost_usd)*65+Number(settings.margin_rd));
   const publish=draftStatus(r)==="Publicable";
   return '<tr><td><code>'+esc(r.sku)+'</code></td><td><strong>'+esc(r.brand+' '+r.title)+'</strong><small>'+esc(categories[r.category]+' · '+r.color+' · '+r.size)+'</small></td>'+
    '<td>US$'+esc(r.cost_usd)+'</td><td>'+rd(sell)+'</td><td>'+rd(settings.shipping_rd)+'</td><td><b>'+rd(sell+Number(settings.shipping_rd))+'</b></td>'+
    '<td><span class="'+(publish?"ok":"pending")+'">'+esc(draftStatus(r))+'</span></td>'+
    '<td><button type="button" data-toggle-sku="'+esc(r.sku)+'" data-activate="'+(r.enabled?"false":"true")+'">'+(r.enabled?"Desactivar":"Activar")+'</button></td></tr>';
  }).join("");
  table.innerHTML=head+body;
  $("inventoryCount").textContent="Mostrando "+Math.min(filtered.length,250)+" de "+filtered.length+" variantes.";
 }
 async function load(){
  const {data,error}=await client.rpc("admin_shein_list");
  if(error)throw error;
  settings=data.settings||settings;
  inventory=data.items||[];
  renderStats();renderInventory();
  const {data:pending,error:pendingError}=await client.rpc("admin_shein_pending");
  pendingList=pendingError?[]:(pending||[]);
  const target=$("pendingSheinRows");
  if(pendingError){target.innerHTML='<tr><td colspan="7">No se pudieron consultar los enlaces pendientes.</td></tr>';}
  else if(!pendingList.length){target.innerHTML='<tr><td colspan="7">No hay enlaces pendientes.</td></tr>';}
  else target.innerHTML=pendingList.map(p=>{
   const orig=p.regular_price_usd==null?null:Number(p.regular_price_usd);
   const base=orig==null?null:Math.round(orig*Number(settings.exchange_rate)+Number(settings.margin_rd));
   const total=base==null?null:base+Number(settings.shipping_rd);
   const approved=p.status==="revisado";
   return '<tr><td>'+esc(p.source_product_id)+'</td><td><b>'+esc(p.brand_hint+' · '+p.name_hint)+'</b><small>'+esc(p.variant_notes||p.note||'')+'</small></td>'+
   '<td>'+esc(categories[p.category]||p.category)+'</td><td>'+(orig==null?'Por verificar':'US$'+orig.toFixed(2))+'</td>'+
   '<td>'+(total==null?'Pendiente':rd(total)+' (referencia interna)')+'</td>'+
   '<td><span class="'+(approved?'ok':'pending')+'">'+(approved?'Revisado':'Pendiente')+'</span></td>'+
   '<td><button type="button" data-review-pending="'+esc(p.source_product_id)+'">'+(approved?'Agregar variante':'Verificar y publicar')+'</button> '+
   '<button type="button" data-shein-attach-photo="'+esc(p.source_product_id)+'">Adjuntar varias fotos</button> '+
   ((p.review_photo_paths?.length||p.review_photo_path)?'<button type="button" data-shein-see-photo="'+esc(p.source_product_id)+'">Ver '+(p.review_photo_paths?.length||1)+' fotos privadas</button> ':'')+
   '<a href="'+esc(p.source_url)+'" target="_blank" rel="noopener noreferrer">Ver SHEIN</a></td></tr>';
  }).join('');
 }
 async function initial(){
  if(!client){$("adminGate").textContent="Supabase no está configurado.";return;}
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user){$("adminGate").innerHTML='Inicia sesión en <a href="/">Aura Bella Shop</a> y completa Google Authenticator antes de abrir este panel.';return;}
  const {data:aal,error:aalError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError||aal?.currentLevel!=="aal2"){
   $("adminGate").innerHTML='Tu sesión necesita el segundo factor. Abre <a href="/">Mi cuenta en la tienda</a>, verifica con tu aplicación autenticadora y regresa aquí.';return;
  }
  try{
   await load();$("adminGate").hidden=true;$("adminArea").hidden=false;
  }catch(e){$("adminGate").textContent="No tienes permisos administrativos o el panel no está disponible: "+(e.message||"error de conexión");}
 }
 async function run(action){
  if(busy)return;
  busy=true;status("Procesando cambios...");
  try{await action();await load();status("Cambios guardados correctamente.");}
  catch(e){status(e.message||"No se pudieron guardar los cambios.",true);}
  finally{busy=false;}
 }
 function resetSelection(){
   selectedPendingId=null;
   $("selectedPending").hidden=true;
   $("skuForm").reset();
   $("approvedPhotoFile").value="";
   $("approvedPhotoPreview").innerHTML="";
 }


 const reviewFile=$("sheinReviewFile");
 const approvedFile=$("approvedPhotoFile");
 const supportedImages=["image/jpeg","image/png","image/webp"];
 let isUploading=false;
 const pathsFor=(id,kind)=>{
  const r=pendingList.find(p=>String(p.source_product_id)===String(id));
  if(!r)return [];
  const arr=kind==="review"?r.review_photo_paths:r.approved_photo_paths;
  if(Array.isArray(arr))return arr;
  return kind==="review"&&r.review_photo_path?[r.review_photo_path]:[];
 };
 const publicPhotoUrl=path=>client.storage.from("shein-approved").getPublicUrl(path).data?.publicUrl||"";
 function verifyFiles(files,existing){
  if(!files.length)throw Error("Selecciona una o varias fotos.");
  if(files.length+existing>12)throw Error("Máximo 12 fotos por producto. Ya hay "+existing+" guardadas; selecciona hasta "+(12-existing)+" más.");
  for(const file of files){
   if(!supportedImages.includes(file.type)||file.size>8388608||file.size<1)
      throw Error("Cada fotografía debe ser JPG, PNG o WEBP y no superar 8 MB: "+file.name);
  }
 }
 function photoTiles(id,kind,entries){
   return '<p class="admin-photo-count">'+entries.length+' de 12 fotos guardadas para '+esc(id)+
      ' · '+(kind==="review"?"Revisión PRIVADA":"Uso comercial autorizado")+'</p>'+
     '<div class="admin-photo-grid">'+entries.map((x,i)=>
       '<div class="admin-photo-tile"><img loading="lazy" src="'+esc(x.url)+'" alt="Fotografía '+(i+1)+' de '+entries.length+'">'+
       '<small>Foto '+(i+1)+(kind==="approved"&&i===0?' · Principal':'')+'</small>'+
       '<button type="button" data-shein-remove-photo="'+esc(id)+'" data-photo-kind="'+kind+
       '" data-photo-path="'+esc(x.path)+'">Quitar foto</button></div>').join('')+'</div>';
 }
 async function showReviewGallery(id){
  const display=$("sheinReviewPreview");
  const paths=pathsFor(id,"review");
  if(!paths.length){display.innerHTML='<p class="hint">Este producto todavía no tiene fotografías privadas. Puedes seleccionar varias a la vez.</p>';return;}
  const previews=await Promise.all(paths.map(async path=>{
   const {data,error}=await client.storage.from("shein-review").createSignedUrl(path,600);
   return {path,url:error?"":data?.signedUrl||""};
  }));
  display.innerHTML='<div class="alert"><b>Fotos privadas de revisión · '+esc(id)+'</b>'+
   '<p>No se muestran en la tienda. Para utilizar imágenes SHEIN públicamente necesitas permiso comercial.</p>'+
   photoTiles(id,"review",previews.filter(p=>/^https:\/\//i.test(p.url)))+'</div>';
  display.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function showApprovedGallery(id){
  const display=$("approvedPhotoPreview");
  const paths=pathsFor(id,"approved");
  if(!paths.length){
   display.innerHTML='<p class="hint">Sin fotos comerciales autorizadas para este producto. Puedes seleccionar hasta 12.</p>';
   const field=$("skuForm").elements.namedItem("image_url");
   if(field&&field.value.includes("/storage/v1/object/public/shein-approved/"))field.value="";
   return;
  }
  const entries=paths.map(path=>({path,url:publicPhotoUrl(path)})).filter(e=>/^https:\/\//i.test(e.url));
  display.innerHTML=photoTiles(id,"approved",entries)+
   '<p class="hint">La primera foto es la portada. Las demás aparecerán como miniaturas seleccionables en la ficha pública, una vez verificado el producto.</p>';
  const field=$("skuForm").elements.namedItem("image_url");
  if(field&&entries.length)field.value=entries[0].url;
 }
 async function uploadImages(id,kind,files){
   if(isUploading)return;
   const paths=pathsFor(id,kind);
   try{verifyFiles(files,paths.length)}catch(err){status(err.message,true);return;}
   if(!/^\d{1,25}$/.test(id)){status("Identificador SHEIN inválido.",true);return;}
   if(!pendingList.some(p=>p.source_product_id===id)){status("Primero selecciona un producto pendiente.",true);return;}
   if(kind==="approved"){
     if(!$("manual-image_rights_ok").checked){status("Confirma el permiso de uso comercial de TODAS las fotos antes de subirlas.",true);return;}
     if(!confirm("¿Tienes autorización comercial para publicar las "+files.length+" fotos seleccionadas? Se guardarán en almacenamiento público."))return;
   }
   const bucket=kind==="review"?"shein-review":"shein-approved";
   let count=0;isUploading=true;
   $("uploadApprovedPhoto").disabled=true;
   try{
     for(const file of files){
       status("Subiendo "+(count+1)+" de "+files.length+" fotos a "+(kind==="review"?"revisión privada":"la galería comercial")+"…");
       const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[file.type];
       const path=id+"/"+crypto.randomUUID()+"."+ext;
       const {error}=await client.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
       if(error)throw error;
       const linked=await client.rpc("admin_shein_add_photo",{
          p_source_product_id:id,p_storage_path:path,p_kind:kind
       });
       if(linked.error){
         await client.storage.from(bucket).remove([path]);
         throw linked.error;
       }
       count++;
     }
     await load();
     if(kind==="approved"){
       if(selectedPendingId===id)showApprovedGallery(id);
       status(count+" fotos autorizadas guardadas. La ficha sigue pendiente hasta completar las demás verificaciones.");
     }else{
       await showReviewGallery(id);
       status(count+" fotos añadidas a la revisión privada. No se publicaron en la tienda.");
     }
   }catch(err){
     await load();
     if(kind==="review")await showReviewGallery(id);
     else if(selectedPendingId===id)showApprovedGallery(id);
     status("Se guardaron "+count+" de "+files.length+" fotos. No se pudieron subir las restantes: "+(err.message||"error"),true);
   }finally{
     isUploading=false;
     $("uploadApprovedPhoto").disabled=false;
     reviewFile.value="";approvedFile.value="";selectedPhotoId=null;
   }
 }
 $("pendingSheinRows").addEventListener("click",async e=>{
   const attach=e.target.closest("[data-shein-attach-photo]");
   if(attach){
     selectedPhotoId=attach.dataset.sheinAttachPhoto;
     if(!pendingList.some(p=>p.source_product_id===selectedPhotoId))return;
     reviewFile.value="";
     reviewFile.click();
     return;
   }
   const view=e.target.closest("[data-shein-see-photo]");
   if(view)await showReviewGallery(view.dataset.sheinSeePhoto);
 });
 reviewFile.addEventListener("change",async()=>{
   const id=selectedPhotoId;
   const files=Array.from(reviewFile.files||[]);
   if(id&&files.length)await uploadImages(id,"review",files);
 });
 $("uploadApprovedPhoto").addEventListener("click",async()=>{
   const id=String($("skuForm").elements.namedItem("source_product_id")?.value||"").trim();
   if(!selectedPendingId||selectedPendingId!==id){
     status("Primero pulsa «Verificar y publicar» en el producto pendiente.",true);return;
   }
   const files=Array.from(approvedFile.files||[]);
   if(!files.length){status("Selecciona varias fotos propias o autorizadas desde tu celular.",true);return;}
   await uploadImages(id,"approved",files);
 });
 document.addEventListener("click",async e=>{
   const button=e.target.closest("[data-shein-remove-photo]");
   if(!button||isUploading)return;
   const id=button.dataset.sheinRemovePhoto,kind=button.dataset.photoKind,path=button.dataset.photoPath;
   if(!["review","approved"].includes(kind)||!pathsFor(id,kind).includes(path))return;
   if(!confirm("¿Quitar esta fotografía "+(kind==="review"?"privada":"comercial")+" de la galería?"))return;
   button.disabled=true;
   try{
     const {error}=await client.rpc("admin_shein_remove_photo",{
        p_source_product_id:id,p_storage_path:path,p_kind:kind
     });
     if(error)throw error;
     const bucket=kind==="review"?"shein-review":"shein-approved";
     const deleted=await client.storage.from(bucket).remove([path]);
     await load();
     if(kind==="review")await showReviewGallery(id);
     else if(selectedPendingId===id)showApprovedGallery(id);
     status(deleted.error?"Foto desvinculada; el archivo requiere eliminación manual: "+deleted.error.message:"Foto quitada. Las demás se conservan.",!!deleted.error);
   }catch(err){status("No se pudo quitar la foto: "+(err.message||"error"),true);}
   finally{button.disabled=false;}
 });
 $("clearProductForm").addEventListener("click",resetSelection);
 $("pendingSheinRows").addEventListener("click",e=>{
   const btn=e.target.closest("[data-review-pending]");
   if(!btn)return;
   const p=pendingList.find(r=>r.source_product_id===btn.dataset.reviewPending);
   if(!p)return;
   resetSelection();selectedPendingId=p.source_product_id;
   const form=$("skuForm");
   for(const [key,value] of Object.entries({
    source_product_id:p.source_product_id,category:p.category,title:p.name_hint,
    brand:p.brand_hint,source_url:p.source_url,
    cost_usd:p.regular_price_usd??""
   })){
    const field=form.elements.namedItem(key);
    if(field)field.value=value;
   }
   $("selectedPending").hidden=false;
   $("selectedPending").textContent="Revisando referencia SHEIN "+p.source_product_id+
    ". El precio original "+(p.regular_price_usd==null?"aún necesita verificarse":"registrado es US$"+Number(p.regular_price_usd).toFixed(2))+
    ". Completa el SKU de esta variante, color, talla, imagen permitida y los controles de verificación. No se activa nada sin esas confirmaciones.";
   showApprovedGallery(p.source_product_id);
   document.getElementById("manualProductSection").scrollIntoView({behavior:"smooth",block:"start"});
   form.elements.namedItem("sku")?.focus();
 });
 $("settingsForm").addEventListener("submit",e=>{
  e.preventDefault();
  const m=Number($("marginInput").value),ship=Number($("shippingInput").value);
  if(!Number.isInteger(m)||!Number.isInteger(ship)||m<0||ship<0){status("Escribe importes enteros válidos.",true);return;}
  run(async()=>{
   const {error}=await client.rpc("admin_shein_update_prices",{p_margin_rd:m,p_shipping_rd:ship});
   if(error)throw error;
  });
 });
 $("skuForm").addEventListener("submit",e=>{
  e.preventDefault();const fd=Object.fromEntries(new FormData(e.target).entries());
  for(const f of flags)fd[f]=$("manual-"+f).checked;
  if(!$("manualVerified").checked){status("Confirma que verificaste el precio original tachado, el tamaño o talla y la disponibilidad.",true);return;}
  fd.verified_at=new Date().toISOString();
  let input;
  try{input=normalize(fd,0);}catch(e){status(e.message,true);return;}
  if(selectedPendingId&&input.source_product_id!==selectedPendingId){
   status("El ID del producto seleccionado no coincide con la referencia en revisión.",true);return;
  }
  if(input.enabled&&!(input.available&&input.source_authorized&&input.image_rights_ok&&input.via_usa_confirmed&&input.eta_17_confirmed&&input.image_url)){
   status("Para publicar debes confirmar disponibilidad, permisos de catálogo e imagen, ruta desde EE. UU., plazo de 17 días y URL de imagen autorizada. Sin eso, guarda la variante desactivada.",true);return;
  }
  if(input.enabled&&!confirm("¿Confirmas que verificaste el precio ORIGINAL TACHADO, la variante, los derechos de uso de imágenes y el plazo de entrega? La variante aparecerá en la tienda si cumple los requisitos."))return;
  run(async()=>{
   const {error}=await client.rpc("admin_shein_import",{p_rows:[input]});
   if(error)throw error;
   if(selectedPendingId&&input.enabled){
     const mark=await client.rpc("admin_shein_mark_reviewed",{p_source_product_id:selectedPendingId});
     if(mark.error)throw mark.error;
   }
   resetSelection();
  });
 });
 $("fileImport").addEventListener("change",async e=>{
   incoming=[];status("");
   const file=e.target.files?.[0];if(!file){preview();return;}
   try{
    const text=await file.text();
    let data=/\.json$/i.test(file.name)?JSON.parse(text):parseCsv(text);
    if(!Array.isArray(data)||!data.length)throw Error("El archivo no contiene artículos.");
    incoming=data.map(normalize);
    if(incoming.length>2000)throw Error("Usa un archivo con máximo 2,000 variantes por importación.");
    if(new Set(incoming.map(r=>r.sku)).size!==incoming.length)throw Error("El archivo contiene SKU duplicados.");
    status(incoming.length+" variantes preparadas. Asegúrate de que cost_usd contiene el precio ORIGINAL TACHADO, no el promocional.");
   }catch(err){incoming=[];status(err.message,true);}
   preview();
 });
 $("csvImport").addEventListener("click",()=>{
  if(!incoming.length)return;
  if(!confirm("¿Importar "+incoming.length+" variantes desde un archivo autorizado? Los productos sin permisos, sin ruta de EE. UU. o sin plazo confirmado permanecerán ocultos."))return;
  run(async()=>{
   for(let i=0;i<incoming.length;i+=100){
    const {error}=await client.rpc("admin_shein_import",{p_rows:incoming.slice(i,i+100)});
    if(error)throw Error("Lote "+(Math.floor(i/100)+1)+": "+error.message);
    status("Importadas "+Math.min(i+100,incoming.length)+" de "+incoming.length+" variantes...");
   }
   incoming=[];$("fileImport").value="";
  });
 });
 $("downloadTemplate").addEventListener("click",()=>{
   const content=fields.join(",")+"\n";
   const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");a.href=url;a.download="plantilla_shein_aura_bella.csv";
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 $("exportInventory").addEventListener("click",()=>{
  if(!inventory.length){status("Todavía no hay variantes para exportar.",true);return;}
  const csvCell=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
  const out=[fields.join(",")];
  for(const item of inventory)out.push(fields.map(key=>csvCell(item[key])).join(","));
  const blob=new Blob(["\uFEFF"+out.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="AURA_BELLA_SHEIN_INVENTARIO_PRIVADO.csv";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status("Archivo privado exportado. No lo compartas públicamente: contiene costos SHEIN en USD.");
 });
 $("inventorySearch").addEventListener("input",renderInventory);
 $("refreshInventory").addEventListener("click",()=>run(async()=>{}));
 $("inventoryTable").addEventListener("click",e=>{
  const b=e.target.closest("[data-toggle-sku]");if(!b)return;
  const sku=b.dataset.toggleSku,enable=b.dataset.activate==="true";
  if(!confirm((enable?"Activar":"Desactivar")+" la variante "+sku+"?"))return;
  run(async()=>{
   const {error}=await client.rpc("admin_shein_set_enabled",{p_sku:sku,p_enabled:enable});
   if(error)throw error;
  });
 });
 initial();
})();