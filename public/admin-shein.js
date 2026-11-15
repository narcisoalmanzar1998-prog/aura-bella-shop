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
 let inventory=[],settings={exchange_rate:65,margin_rd:1000,shipping_rd:100,lead_days:17},incoming=[],busy=false,pendingList=[],selectedPendingId=null,selectedPhotoId=null,publishedSkus=new Set();
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
   if(publishedSkus.has(String(r.sku)))return "Publicado en tienda";
   if(!r.enabled)return "Desactivado";
   if(!(r.available&&r.source_authorized&&r.image_rights_ok&&r.via_usa_confirmed&&r.eta_17_confirmed))
     return "Faltan condiciones de venta";
   if(!r.image_url)return "Fotos aún privadas";
   if(Date.now()-new Date(r.verified_at).valueOf()>14*86400000)return "Verificación desactualizada";
   return "Pendiente de publicar";
 };
 function preview(){
   const target=$("csvPreview");
   if(!incoming.length){target.innerHTML='<p class="hint">Selecciona un CSV o JSON autorizado para revisar sus variantes antes de importar.</p>';$("csvImport").disabled=true;return;}
   const h='<tr><th>SKU</th><th>Artículo</th><th>Variante</th><th>Original USD</th><th>Venta RD$</th><th>Estado</th></tr>';
   const result=incoming.slice(0,8).map(r=>{
    const price=Math.round(Number(r.cost_usd)*Number(settings.exchange_rate)+Number(settings.margin_rd));
    return '<tr><td>'+esc(r.sku)+'</td><td>'+esc(r.brand+' '+r.title)+'</td><td>'+esc(r.color+' / '+r.size)+'</td><td>US$'+esc(r.cost_usd)+'</td><td>'+rd(price)+'</td><td>'+esc(draftStatus(r))+'</td></tr>';
   }).join("");
   target.innerHTML='<p class="hint">'+incoming.length+' variantes listas. Los borradores no se publicarán hasta cumplir todas las verificaciones.</p><div class="table-scroll"><table>'+h+result+'</table></div>';
   $("csvImport").disabled=false;
 }
 function renderStats(){
   $("adminCount").textContent=String(inventory.length);
   $("adminReady").textContent=String(inventory.filter(r=>publishedSkus.has(String(r.sku))).length);
   $("adminDrafts").textContent=String(inventory.filter(r=>!publishedSkus.has(String(r.sku))).length);
   $("rateValue").value=Number(settings.exchange_rate);
   $("leadInput").value=Number(settings.lead_days);
   $("leadDaysCheckbox").textContent=String(settings.lead_days);
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
   const sell=Math.round(Number(r.cost_usd)*Number(settings.exchange_rate)+Number(settings.margin_rd));
   const publish=publishedSkus.has(String(r.sku));
   return '<tr><td><code>'+esc(r.sku)+'</code></td><td><strong>'+esc(r.brand+' '+r.title)+'</strong><small>'+esc(categories[r.category]+' · '+r.color+' · '+r.size)+'</small></td>'+
    '<td>US$'+esc(r.cost_usd)+'</td><td>'+rd(sell)+'</td><td>'+rd(settings.shipping_rd)+'</td><td><b>'+rd(sell+Number(settings.shipping_rd))+'</b></td>'+
    '<td><span class="'+(publish?"ok":"pending")+'">'+esc(draftStatus(r))+'</span></td>'+
    '<td><div class="admin-row-actions">'+
  (publish?'<a href="/?sku='+encodeURIComponent(r.sku)+'#ropa-'+esc(r.category)+'" target="_blank" rel="noopener noreferrer">Ver en tienda</a> ':
    '<button type="button" data-shein-publish="'+esc(r.sku)+'">Autorizar fotos y publicar</button> ')+
  '<button type="button" data-toggle-sku="'+esc(r.sku)+'" data-activate="'+(r.enabled?"false":"true")+'">'+
   (r.enabled?"Desactivar":"Activar en inventario")+'</button> '+
  '<button type="button" data-shein-edit-sku="'+esc(r.sku)+'">Editar datos</button> '+
  '<button type="button" class="admin-danger" data-shein-delete-sku="'+esc(r.sku)+'">Eliminar producto</button>'+
  '</div></td></tr>';
  }).join("");
  table.innerHTML=head+body;
  $("inventoryCount").textContent="Mostrando "+Math.min(filtered.length,250)+" de "+filtered.length+" variantes.";
 }
 async function load(){
  const {data,error}=await client.rpc("admin_shein_list");
  if(error)throw error;
  settings=data.settings||settings;
  inventory=data.items||[];
  const pub=await client.from("shein_products").select("sku").limit(2000);
  if(pub.error)throw pub.error;
  publishedSkus=new Set((pub.data||[]).map(x=>String(x.sku)));
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
   '<td><span class="'+(approved?'ok':'pending')+'">'+(approved?'Revisado':(p.draft_form&&Object.keys(p.draft_form).length?'Borrador guardado':'Pendiente'))+'</span></td>'+
   '<td><button type="button" data-review-pending="'+esc(p.source_product_id)+'">'+(approved?'Editar / agregar variantes':'Editar / publicar')+'</button> '+
   '<button type="button" data-shein-attach-photo="'+esc(p.source_product_id)+'">Adjuntar varias fotos</button> '+
   ((p.review_photo_paths?.length||p.review_photo_path)?'<button type="button" data-shein-see-photo="'+esc(p.source_product_id)+'">Ver '+(p.review_photo_paths?.length||1)+' fotos privadas</button> ':'')+
   '<a href="'+esc(p.source_url)+'" target="_blank" rel="noopener noreferrer">Ver SHEIN</a> '+
   '<button type="button" class="admin-danger" data-shein-delete-pending="'+esc(p.source_product_id)+'">Eliminar pendiente</button></td></tr>';
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
   $("skuFormAlert").hidden=true;
   $("skuFormAlert").textContent="";
   $("approvedPhotoFile").value="";
   $("approvedPhotoPreview").innerHTML="";
   $("updateSavedResult").textContent="";
 }
 function formError(message,field){
   const alert=$("skuFormAlert");
   alert.textContent=message;
   alert.hidden=false;
   status(message,true);
   $("manualProductSection").scrollIntoView({behavior:"auto",block:"start"});
   if(field?.focus)field.focus({preventScroll:true});
 }
 function sheinIdFromUrl(value){
   const url=String(value||"").trim();
   if(!/^https:\/\/([a-z0-9-]+\.)*shein\.com\//i.test(url))return "";
   return url.match(/-p-([0-9]{3,25})\.html(?:[?#]|$)/i)?.[1]||"";
 }
 function syncProductId(form){
   const value=sheinIdFromUrl(form.elements.namedItem("source_url")?.value);
   if(value)form.elements.namedItem("source_product_id").value=value;
   return value;
 }
 $("skuForm").addEventListener("input",e=>{
   if(e.target?.name==="source_url")syncProductId($("skuForm"));
   $("skuFormAlert").hidden=true;
   $("skuFormAlert").textContent="";
 });



 function draftData(){
   const form=$("skuForm"),out={};
   for(const key of fields){
     if(key==="verified_at"||flags.includes(key))continue;
     const input=form.elements.namedItem(key);
     out[key]=String(input?.value??"");
   }
   for(const flag of flags)out[flag]=String(Boolean($("manual-"+flag)?.checked));
   out.manualVerified=String(Boolean($("manualVerified")?.checked));
   out.source_product_id=selectedPendingId||out.source_product_id;
   return out;
 }
 async function ensureReferenceFromForm(){
   const form=$("skuForm");
   const id=syncProductId(form);
   const source_url=String(form.elements.namedItem("source_url")?.value||"").trim();
   const category=String(form.elements.namedItem("category")?.value||"").trim();
   const title=String(form.elements.namedItem("title")?.value||"").trim();
   const brand=String(form.elements.namedItem("brand")?.value||"").trim();
   const rawPrice=String(form.elements.namedItem("cost_usd")?.value||"").trim();
   if(!id){
     formError("Pega primero un enlace SHEIN del producto que termine en -p-123456.html.");
     return null;
   }
   if(!category||!title||!brand){
     formError("Para guardar fotos o borrador, indica categoría, nombre del artículo y marca. Los demás campos pueden quedar vacíos.");
     return null;
   }
   if(rawPrice&&(!/^\d{1,6}(\.\d{1,2})?$/.test(rawPrice)||Number(rawPrice)<=0)){
     formError("El precio original debe ser positivo y tener hasta dos decimales.");
     return null;
   }
   const prepared=await client.rpc("admin_shein_prepare_reference",{
      p_source_url:source_url,p_category:category,p_brand:brand,p_title:title,
      p_regular_usd:rawPrice?Number(rawPrice):null
   });
   if(prepared.error){
     formError("No se pudo registrar la referencia: "+prepared.error.message);
     return null;
   }
   if(String(prepared.data?.product_id)!==id){
      formError("El identificador del producto no coincide con el enlace.");
      return null;
   }
   selectedPendingId=id;
   await load();
   return id;
 }
 async function saveDraftInternal(){
   if(!selectedPendingId){
      const id=await ensureReferenceFromForm();
      if(!id)return false;
   }
   const id=String($("skuForm").elements.namedItem("source_product_id")?.value??"").trim();
   if(id!==selectedPendingId){formError("El ID SHEIN no coincide con la referencia seleccionada. No se guardó.");return false;}
   try{
     const {error}=await client.rpc("admin_shein_save_draft",{
       p_source_product_id:selectedPendingId,p_draft:draftData()
     });
     if(error)throw error;
     await load();
     return true;
   }catch(err){
     formError("No se pudo guardar el borrador: "+(err.message||"error de conexión"));
     return false;
   }
 }
 async function saveDraftWithPhotos(){
   if(!selectedPendingId){
     const id=await ensureReferenceFromForm();
     if(!id)return;
   }
   const files=Array.from($("approvedPhotoFile").files||[]);
   if(files.length){
     const uploaded=await uploadImages(selectedPendingId,"review",files);
     if(!uploaded){formError("No se pudieron guardar todas las fotos. Revisa el aviso anterior.");return;}
   }
   const saved=await saveDraftInternal();
   if(saved){
     $("skuFormAlert").hidden=true;
     status("Borrador guardado correctamente. Puedes dejar campos vacíos; el producto NO se ha publicado. "+(files.length?files.length+" foto(s) añadida(s) a revisión privada.":""));
   }
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
     return true;
   }catch(err){
     await load();
     if(kind==="review")await showReviewGallery(id);
     else if(selectedPendingId===id)showApprovedGallery(id);
     status("Se guardaron "+count+" de "+files.length+" fotos. No se pudieron subir las restantes: "+(err.message||"error"),true);
     return false;
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

 $("uploadReviewFromForm").addEventListener("click",async()=>{
   if(!selectedPendingId){
     const id=await ensureReferenceFromForm();
     if(!id)return;
   }
   const files=Array.from(approvedFile.files||[]);
   if(!files.length){formError("Selecciona una o varias fotos antes de pulsar guardar.");return;}
   const ok=await uploadImages(selectedPendingId,"review",files);
   if(ok)status("Fotos guardadas privadamente sin exigir los demás campos del artículo. Puedes completar la ficha después.");
 });

 $("updateSheinSaved").addEventListener("click",async()=>{
   if(busy||isUploading)return;
   const id=syncProductId($("skuForm"));
   if(!id){formError("Selecciona un artículo guardado o pega su enlace SHEIN antes de actualizar.");return;}
   if(selectedPendingId&&selectedPendingId!==id){
      formError("El enlace pertenece a un producto distinto del que estás editando. Abre la referencia correcta.");return;
   }
   let productId=selectedPendingId;
   if(!productId){
      productId=await ensureReferenceFromForm();
      if(!productId)return;
   }
   const draft=draftData();
   const existing=inventory.filter(r=>String(r.source_product_id)===productId);
   const willUpdate=existing.length>0&&draft.manualVerified==="true"&&
      draft.title&&draft.brand&&draft.color&&draft.cost_usd&&draft.source_url;
   if(willUpdate&&!window.confirm("¿Actualizar los datos y precios de "+existing.length+
       " variante(s) existentes sin cambiar sus SKU ni tallas? Si modificas condiciones de venta, puede cambiar su visibilidad. "+
       "Las fotografías guardadas se conservan."))return;
   busy=true;
   $("updateSheinSaved").disabled=true;
   try{
     const files=Array.from($("approvedPhotoFile").files||[]);
     if(files.length){
       const kind=$("manual-image_rights_ok").checked?"approved":"review";
       const uploaded=await uploadImages(productId,kind,files);
       if(!uploaded)throw Error("No se completó la subida de fotografías. Revisa el aviso en pantalla.");
     }
     const updated=await client.rpc("admin_shein_update_saved_product",{
       p_source_product_id:productId,p_draft:draft
     });
     if(updated.error)throw updated.error;
     await load();
     const n=Number(updated.data?.updated_variants||0);
     const msg=updated.data?.draft_only
       ? "Cambios guardados como borrador. No se modificaron las variantes de la tienda; para aplicarlos, completa el formulario y marca la verificación del precio."
       : "Producto actualizado: "+n+" variante(s), precios recalculados y fotografías conservadas. Los SKU y tallas existentes no se modificaron.";
     $("updateSavedResult").textContent=msg;
     $("skuFormAlert").hidden=true;
     status(msg);
   }catch(err){
     formError("No se pudieron actualizar los datos guardados: "+(err?.message||"error de conexión"));
   }finally{busy=false;$("updateSheinSaved").disabled=false;}
 });

 $("saveSheinDraft").addEventListener("click",saveDraftWithPhotos);

 $("uploadApprovedPhoto").addEventListener("click",async()=>{
   let id=String($("skuForm").elements.namedItem("source_product_id")?.value||"").trim();
   if(!selectedPendingId||selectedPendingId!==id){
     id=await ensureReferenceFromForm();
     if(!id)return;
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
   e.preventDefault();
   try{
     const id=btn.dataset.reviewPending;
     const p=pendingList.find(r=>String(r.source_product_id)===String(id));
     if(!p){status("No encontramos este artículo en la lista. Pulsa «Actualizar inventario» y vuelve a intentarlo.",true);return;}
     resetSelection();
     selectedPendingId=String(p.source_product_id);
     const form=$("skuForm");
     const variants=inventory.filter(x=>String(x.source_product_id)===String(p.source_product_id));
     const current=variants[0]||null;
     const variantSizes=[...new Set(variants.map(x=>String(x.size)))];
     const baseSku=current&&String(current.sku).endsWith("-"+current.size)
       ?String(current.sku).slice(0,-(String(current.size).length+1))
       :current?.sku||"";
     const live=current?{
       sku:baseSku,category:current.category,title:current.title,
       brand:current.brand,description:current.description||"",
       color:current.color,size:variantSizes.join(", "),
       cost_usd:current.cost_usd,source_url:current.source_url,image_url:current.image_url,
       available:current.available,enabled:current.enabled,
       source_authorized:current.source_authorized,image_rights_ok:current.image_rights_ok,
       via_usa_confirmed:current.via_usa_confirmed,eta_17_confirmed:current.eta_17_confirmed
     }:{};
     const values={
       source_product_id:p.source_product_id,category:p.category,title:p.name_hint,
       brand:p.brand_hint,source_url:p.source_url,
       cost_usd:p.regular_price_usd??"",
       ...live,
       ...(p.draft_form||{})
     };
     for(const [key,value] of Object.entries(values)){
       if(flags.includes(key)){$("manual-"+key).checked=value===true||value==="true";continue;}
       if(key==="manualVerified"){$("manualVerified").checked=value===true||value==="true";continue;}
       const field=form.elements.namedItem(key);
       if(field)field.value=value;
     }
     syncProductId(form);
     const selected=$("selectedPending");
     selected.hidden=false;
     selected.textContent="Referencia SHEIN "+p.source_product_id+" seleccionada. "+
       (variants.length?variants.length+" variantes existentes. ":"")+
       (p.regular_price_usd==null?"Falta verificar el precio original tachado. ":"Precio original tachado: US$"+Number(p.regular_price_usd).toFixed(2)+". ")+
       "Para modificar un producto ya guardado, edita los campos y pulsa «Actualizar producto guardado». Los SKU, las tallas y las fotos existentes se conservan.";
     showApprovedGallery(selectedPendingId);
     $("manualProductSection").scrollIntoView({behavior:"auto",block:"start"});
     selected.focus?.({preventScroll:true});
     status((p.draft_form&&Object.keys(p.draft_form).length?"Borrador recuperado. ":"Formulario abierto. ")+"SHEIN "+selectedPendingId+". Puedes subir fotos y guardar aunque falten datos.");
   }catch(err){
     formError("No se pudo abrir el formulario: "+(err?.message||"error desconocido"));
   }
 });
 $("settingsForm").addEventListener("submit",e=>{
  e.preventDefault();
  const rate=Number($("rateValue").value);
  const margin=Number($("marginInput").value);
  const shipping=Number($("shippingInput").value);
  const days=Number($("leadInput").value);
  if(!$("settingsForm").checkValidity()||
      !Number.isFinite(rate)||rate<1||rate>500||Math.abs(rate*100-Math.round(rate*100))>0.000001||
      !Number.isInteger(margin)||margin<0||margin>100000||
      !Number.isInteger(shipping)||shipping<0||shipping>100000||
      !Number.isInteger(days)||days<1||days>90){
    const msg="Valores inválidos: tasa de 1 a 500 con hasta 2 decimales; ganancia y envío entre 0 y 100,000; entrega de 1 a 90 días.";
    $("settingsResult").textContent=msg;status(msg,true);return;
  }
  const daysChanged=days!==Number(settings.lead_days);
  if(daysChanged&&!window.confirm("El plazo pasará de "+settings.lead_days+" a "+days+
      " días en los productos SHEIN publicados y sus mensajes de WhatsApp. ¿Confirmas que ese nuevo plazo es real para todos los productos activos?"))return;
  const priceChanged=rate!==Number(settings.exchange_rate)||margin!==Number(settings.margin_rd)||
     shipping!==Number(settings.shipping_rd);
  if(priceChanged&&!window.confirm("Se recalcularán los precios SHEIN publicados con la nueva tasa, ganancia y costo de envío. No afecta a los perfumes. ¿Guardar?"))return;
  run(async()=>{
    const {data,error}=await client.rpc("admin_shein_update_settings",{
      p_exchange_rate:rate,p_margin_rd:margin,p_shipping_rd:shipping,
      p_lead_days:days,p_delivery_confirmed:daysChanged
    });
    if(error)throw error;
    $("settingsResult").textContent="Cambios guardados. "+Number(data?.recalculated||0)+
      " variante(s) revisadas y productos SHEIN actualizados. Plazo: "+days+" días.";
  });
 });


 function formSelectedSizes(value){
   return [...new Set(String(value||"").split(/[,;\n|]+/).map(s=>s.trim()).filter(Boolean))];
 }
 function internalSku(base,size,multiple){
   if(!multiple)return base;
   const token=String(size).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
     .replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toUpperCase();
   return base+"-"+token;
 }
 async function promotePrivatePhotos(productId){
   const existing=pathsFor(productId,"approved");
   if(existing.length)return;
   const originals=pathsFor(productId,"review");
   if(!originals.length)throw Error("No hay fotos seleccionadas ni imágenes privadas para este producto.");
   for(let i=0;i<originals.length;i++){
     const oldPath=originals[i];
     status("Preparando imagen autorizada "+(i+1)+" de "+originals.length+"…");
     const downloaded=await client.storage.from("shein-review").download(oldPath);
     if(downloaded.error||!downloaded.data)throw downloaded.error||Error("No se pudo leer una fotografía privada.");
     const ext=oldPath.split(".").pop().toLowerCase();
     const media=ext==="jpg"||ext==="jpeg"?"image/jpeg":ext==="png"?"image/png":"image/webp";
     const newPath=productId+"/"+crypto.randomUUID()+"."+ext;
     const uploaded=await client.storage.from("shein-approved").upload(newPath,downloaded.data,
       {upsert:false,contentType:media});
     if(uploaded.error)throw uploaded.error;
     const linked=await client.rpc("admin_shein_add_photo",{
       p_source_product_id:productId,p_storage_path:newPath,p_kind:"approved"
     });
     if(linked.error){
       await client.storage.from("shein-approved").remove([newPath]);
       throw linked.error;
     }
   }
   await load();
 }
 $("skuForm").addEventListener("submit",async e=>{
   e.preventDefault();
   if(busy||isUploading)return;
   const form=e.target;
   const productId=syncProductId(form);
   if(!productId){
     formError("El enlace debe ser un producto de SHEIN con formato «-p-397402549.html». El ID del producto se obtiene automáticamente desde el enlace.");
     return;
   }
   if(!form.checkValidity()){
     const field=form.querySelector(":invalid");
     const label=field?.closest("label")?.textContent?.trim().replace(/\s+/g," ").slice(0,130)||"un dato obligatorio";
     formError("Completa o corrige «"+label+"». Puedes guardar como borrador si necesitas continuar después.",field);
     return;
   }
   const fd=Object.fromEntries(new FormData(form).entries());
   fd.source_product_id=productId;
   for(const flag of flags)fd[flag]=$("manual-"+flag).checked;
   if(!$("manualVerified").checked){
     formError("Confirma que verificaste el precio ORIGINAL TACHADO (no el promocional), las tallas y la disponibilidad.");
     return;
   }
   if(!flags.every(flag=>fd[flag])){
     formError("Para publicar debes marcar todas las condiciones reales: existencias, activación, derechos comerciales, ruta desde EE. UU. y plazo de entrega.");
     return;
   }
   const sizes=formSelectedSizes(fd.size);
   if(!sizes.length||sizes.length>20){
     formError("Indica de 1 a 20 tallas disponibles, separadas por comas.");return;
   }
   if(sizes.some(size=>size.length>50)){
     formError("Cada talla debe tener menos de 50 caracteres.");return;
   }
   let base;
   try{base=normalize({...fd,verified_at:new Date().toISOString()},0);}
   catch(err){formError(err.message);return;}
   const skuList=sizes.map(size=>internalSku(base.sku,size,sizes.length>1));
   if(new Set(skuList).size!==skuList.length||skuList.some(k=>k.length>100)){
     formError("El código base es demasiado largo o las tallas generan identificadores duplicados.");return;
   }
   const previous=pendingList.find(p=>String(p.source_product_id)===productId);
   const known=previous?.regular_price_usd==null?null:Number(previous.regular_price_usd);
   if(known!==null&&Math.abs(known-Number(base.cost_usd))>=0.01){
     if(!window.confirm("Atención: para este enlace ya había un precio ORIGINAL TACHADO de US$"+
       known.toFixed(2)+", pero acabas de introducir US$"+Number(base.cost_usd).toFixed(2)+
       ". ¿Verificaste que el nuevo importe sea el precio ORIGINAL TACHADO de estas variantes?"))return;
   }
   const files=Array.from(approvedFile.files||[]);
   const hasPhotos=files.length||pathsFor(productId,"approved").length||pathsFor(productId,"review").length;
   if(!hasPhotos){
     formError("Selecciona las fotografías del producto. Al pulsar publicar se subirán automáticamente, sin otro botón.");
     return;
   }
   const price=Math.round(Number(base.cost_usd)*Number(settings.exchange_rate)+Number(settings.margin_rd));
   const total=price+Number(settings.shipping_rd);
   const count=sizes.length;
   const confirmMsg="¿Publicar "+count+" variante(s) de "+base.title+" en Aura Bella Shop?"+
     "\nTalla(s): "+sizes.join(", ")+
     "\nPrecio original SHEIN confirmado por ti: US$"+Number(base.cost_usd).toFixed(2)+
     "\nVenta: "+rd(price)+" + envío: "+rd(settings.shipping_rd)+" = "+rd(total)+" por unidad."+
     "\nConfirmas que las imágenes están autorizadas para uso comercial y que hay existencias de TODAS las tallas, envío desde EE. UU. y plazo real de "+settings.lead_days+" días.";
   if(!window.confirm(confirmMsg))return;
   busy=true;
   try{
     status("Preparando el artículo SHEIN y su galería…");
     const prep=await client.rpc("admin_shein_prepare_reference",{
       p_source_url:base.source_url,p_category:base.category,p_brand:base.brand,
       p_title:base.title,p_regular_usd:Number(base.cost_usd)
     });
     if(prep.error)throw prep.error;
     if(String(prep.data?.product_id)!==productId)throw Error("La referencia SHEIN devuelta no coincide con el enlace.");
     selectedPendingId=productId;
     await load();
     if(files.length){
       const uploaded=await uploadImages(productId,"approved",files);
       if(!uploaded)throw Error("Una o más fotos no se pudieron cargar. Revisa el mensaje y vuelve a intentarlo.");
     }
     await promotePrivatePhotos(productId);
     const approved=pathsFor(productId,"approved");
     if(!approved.length)throw Error("No hay ninguna fotografía autorizada.");
     const photo=publicPhotoUrl(approved[0]);
     if(!/^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/shein-approved\//i.test(photo)){
       throw Error("No se pudo obtener la dirección de las fotografías autorizadas.");
     }
     const rows=sizes.map((size,i)=>({
       ...base,
       sku:skuList[i],
       size,
       image_url:photo,
       verified_at:new Date().toISOString()
     }));
     status("Publicando "+rows.length+" variante(s) en la tienda…");
     const imported=await client.rpc("admin_shein_import",{p_rows:rows});
     if(imported.error)throw imported.error;
     const marked=await client.rpc("admin_shein_mark_reviewed",{p_source_product_id:productId});
     if(marked.error)throw marked.error;
     await load();
     const missing=skuList.filter(k=>!publishedSkus.has(k));
     if(missing.length)throw Error("No aparecen en el catálogo público: "+missing.join(", ")+". Revisa las verificaciones.");
     resetSelection();
     $("skuFormAlert").hidden=true;
     status("¡PUBLICADO! "+rows.length+" talla(s) de "+base.title+". Precio del producto "+rd(price)+
        " + envío "+rd(settings.shipping_rd)+" = "+rd(total)+" por unidad. Ya se muestran en la tienda.");
     $("inventoryTable").scrollIntoView({behavior:"smooth",block:"start"});
   }catch(err){
     try{await load()}catch(loadError){console.warn("No se pudo actualizar inventario",loadError);}
     formError("No se pudo completar la publicación: "+(err?.message||"error de conexión")+
       ". Se conservan las imágenes que se hayan subido; puedes intentarlo otra vez.");
   }finally{busy=false;}
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

 function singleSizeFor(item){
   let size=String(item.size||"").trim();
   if(!size||/[;,]/.test(size)){
     const hint=size.split(/[;,]/).map(x=>x.trim()).filter(Boolean).at(-1)||"";
     const chosen=window.prompt("Este registro incluye varias tallas juntas: "+size+
        ". Un SKU corresponde a UNA sola talla. ¿Cuál está disponible para esta variante? "+
        "Las demás se agregan como variantes separadas:",hint);
     if(chosen===null)return null;
     size=String(chosen).trim();
   }
   if(!size||size.length>40||!(/^[\p{L}\p{N} .()+/-]+$/u.test(size))){
     status("Introduce una sola talla válida, por ejemplo: M, XL o XXL.",true);
     return null;
   }
   return size;
 }
 async function publishInventory(sku){
   if(busy||isUploading)return;
   const item=inventory.find(r=>String(r.sku)===String(sku));
   if(!item){status("Esta variante no existe en inventario.",true);return;}
   const p=pendingList.find(r=>String(r.source_product_id)===String(item.source_product_id));
   if(!p){status("La variante no tiene un enlace SHEIN relacionado. Completa su referencia antes de publicarla.",true);return;}
   if(![item.available,item.source_authorized,item.image_rights_ok,item.via_usa_confirmed,item.eta_17_confirmed].every(Boolean)){
     status("Para publicar confirma existencias, permisos comerciales de los datos y fotos, ruta de envío y plazo real. Puedes guardar todo como borrador mientras tanto.",true);
     return;
   }
   if(Date.now()-new Date(item.verified_at).valueOf()>14*86400000){
      status("El precio o stock se verificó hace más de 14 días. Actualiza la ficha antes de publicar.",true);return;
   }
   const original=Number(p.regular_price_usd);
   if(!Number.isFinite(original)||original<=0){
     status("Falta el precio original tachado de SHEIN. Abre el formulario del enlace y verifícalo.",true);return;
   }
   const review=pathsFor(String(p.source_product_id),"review");
   const publicPhotos=pathsFor(String(p.source_product_id),"approved");
   if(!review.length&&!publicPhotos.length){
      status("No hay imágenes cargadas para este producto. Adjunta tus fotos primero.",true);return;
   }
   const size=singleSizeFor(item);
   if(!size)return;
   const base=Math.round(original*Number(settings.exchange_rate)+Number(settings.margin_rd));
   const shipping=Number(settings.shipping_rd);
   const notice="¿Confirmas que tienes autorización comercial para publicar las imágenes de este artículo, "+
      "que la disponibilidad, envío desde Estados Unidos y plazo de "+settings.lead_days+" días son reales? "+
      "Se publicará UNA variante talla "+size+" usando el precio ORIGINAL TACHADO de US$"+
      original.toFixed(2)+". Precio de venta "+rd(base)+" + envío "+rd(shipping)+
      " = "+rd(base+shipping)+". La cifra anterior en inventario era US$"+
      Number(item.cost_usd).toFixed(2)+". "+
      (publicPhotos.length?"Se utilizarán las imágenes comerciales autorizadas.":"Se copiarán "+review.length+" fotos privadas a la galería pública.");
   if(!window.confirm(notice))return;
   busy=true;
   try{
     if(!publicPhotos.length){
       let count=0;
       for(const path of review){
         status("Preparando foto autorizada "+(count+1)+" de "+review.length+"…");
         const downloaded=await client.storage.from("shein-review").download(path);
         if(downloaded.error||!downloaded.data)throw downloaded.error||new Error("No se pudo leer la foto "+path);
         const ext=path.split(".").pop().toLowerCase();
         const mime=ext==="jpg"||ext==="jpeg"?"image/jpeg":ext==="png"?"image/png":"image/webp";
         const target=String(p.source_product_id)+"/"+crypto.randomUUID()+"."+ext;
         const upl=await client.storage.from("shein-approved").upload(target,downloaded.data,{
           upsert:false,contentType:mime
         });
         if(upl.error)throw upl.error;
         const link=await client.rpc("admin_shein_add_photo",{
           p_source_product_id:String(p.source_product_id),p_storage_path:target,p_kind:"approved"
         });
         if(link.error){
           await client.storage.from("shein-approved").remove([target]);
           throw link.error;
         }
         count++;
       }
     }
     status("Publicando el producto con su precio original y una talla…");
     const res=await client.rpc("admin_shein_publish_approved",{p_sku:String(sku),p_single_size:size});
     if(res.error)throw res.error;
     await load();
     if(!publishedSkus.has(String(sku)))throw new Error("Supabase no confirmó que el producto sea visible; comprueba la conexión.");
     status("¡Producto publicado! SKU "+sku+" · "+rd(base)+" + envío "+rd(shipping)+
       " = "+rd(base+shipping)+". Ya puedes abrirlo en la tienda.");
   }catch(err){
     try{await load()}catch(loadErr){console.warn(loadErr);}
     status("No se pudo publicar: "+(err.message||"error de conexión")+
       ". Las fotografías que hayan sido autorizadas se conservan; puedes intentar de nuevo.",true);
   }finally{busy=false;}
 }
 async function deleteInventory(sku){
   if(busy)return;
   const item=inventory.find(x=>String(x.sku)===String(sku));
   if(!item)return;
   const response=window.prompt("ELIMINACIÓN DEFINITIVA de "+item.brand+" "+item.title+
      ". Se borrará la variante "+sku+" del inventario y de la tienda y del carrito de clientes. "+
      "Para confirmar, escribe exactamente el SKU:", "");
   if(response!==String(sku)){if(response!==null)status("Eliminación cancelada: el SKU no coincidió.",true);return;}
   busy=true;status("Eliminando variante "+sku+"…");
   try{
     const {error}=await client.rpc("admin_shein_delete_sku",{p_sku:String(sku)});
     if(error)throw error;
     await load();
     status("Variante "+sku+" eliminada del inventario y la tienda. Si su enlace sigue pendiente, puedes eliminarlo en la lista superior.");
   }catch(err){status("No se pudo eliminar: "+(err.message||"error"),true);}
   finally{busy=false;}
 }
 async function deletePending(id){
   if(busy)return;
   const p=pendingList.find(x=>String(x.source_product_id)===String(id));
   if(!p)return;
   const linked=inventory.filter(x=>String(x.source_product_id)===String(id));
   if(linked.length){
     status("Primero elimina "+linked.length+" variante(s) del inventario: "+
      linked.map(x=>x.sku).join(", ")+". Luego podrás eliminar este enlace pendiente.",true);
     $("inventoryTable").scrollIntoView({behavior:"smooth",block:"center"});
     return;
   }
   const value=window.prompt("ELIMINACIÓN DEFINITIVA del enlace SHEIN "+id+
     ". Se borrarán también sus fotos guardadas (privadas y autorizadas) y el borrador. "+
     "Para confirmar escribe exactamente el ID SHEIN:","");
   if(value!==String(id)){if(value!==null)status("Eliminación cancelada: el ID no coincidió.",true);return;}
   busy=true;status("Eliminando enlace pendiente "+id+"…");
   try{
     const {data,error}=await client.rpc("admin_shein_delete_pending",{p_source_product_id:String(id)});
     if(error)throw error;
     const failed=[];
     for(const [bucket,paths] of [["shein-review",data?.private_photos],["shein-approved",data?.public_photos]]){
       if(!Array.isArray(paths)||!paths.length)continue;
       const result=await client.storage.from(bucket).remove(paths);
       if(result.error)failed.push(bucket+": "+result.error.message);
     }
     if(selectedPendingId===String(id))resetSelection();
     await load();
     status(failed.length?
       "Enlace eliminado de la lista, pero falta limpiar algunos archivos: "+failed.join("; "):
       "Enlace "+id+" eliminado definitivamente, junto con su borrador y sus fotografías.",failed.length>0);
   }catch(err){status("No se pudo eliminar el pendiente: "+(err.message||"error"),true);}
   finally{busy=false;}
 }
 $("pendingSheinRows").addEventListener("click",e=>{
   const button=e.target.closest("[data-shein-delete-pending]");
   if(button){e.preventDefault();deletePending(button.dataset.sheinDeletePending);}
 });

 $("inventoryTable").addEventListener("click",e=>{
   const edit=e.target.closest("[data-shein-edit-sku]");
   if(edit){
      e.preventDefault();
      const item=inventory.find(v=>String(v.sku)===String(edit.dataset.sheinEditSku));
      const button=item&&$("pendingSheinRows").querySelector('[data-review-pending="'+String(item.source_product_id)+'"]');
      if(!button){status("No encontramos la referencia de este producto. Actualiza el inventario e inténtalo de nuevo.",true);return;}
      button.click();
      return;
   }
   const del=e.target.closest("[data-shein-delete-sku]");
   if(del){e.preventDefault();deleteInventory(del.dataset.sheinDeleteSku);return;}
   const pub=e.target.closest("[data-shein-publish]");
   if(pub){e.preventDefault();publishInventory(pub.dataset.sheinPublish);return;}
   const b=e.target.closest("[data-toggle-sku]");
   if(!b)return;
   const sku=b.dataset.toggleSku,enable=b.dataset.activate==="true";
   if(!confirm((enable?"Activar en inventario":"Desactivar")+" la variante "+sku+
     "? Activar en inventario no publica el producto sin fotos autorizadas."))return;
   run(async()=>{
     const {error}=await client.rpc("admin_shein_set_enabled",{p_sku:sku,p_enabled:enable});
     if(error)throw error;
   });
 });
 initial();
})();