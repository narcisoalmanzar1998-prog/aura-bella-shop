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
 let inventory=[],settings={exchange_rate:65,margin_rd:1000,shipping_rd:100,lead_days:17},incoming=[],busy=false;
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
  if(!/^\d{1,6}(\.\d{1,2})?$/.test(cost)||Number(cost)<=0)throw Error("Costo USD incorrecto en fila "+(index+1));
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
   const h='<tr><th>SKU</th><th>Artículo</th><th>Variante</th><th>Costo USD</th><th>Venta RD$</th><th>Estado</th></tr>';
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
  const head='<tr><th>SKU</th><th>Producto · variante</th><th>Costo SHEIN</th><th>Venta</th><th>Envío</th><th>Total</th><th>Estado</th><th>Acción</th></tr>';
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
  const target=$("pendingSheinRows");
  if(pendingError){target.innerHTML='<tr><td colspan="5">No se pudieron consultar los enlaces pendientes.</td></tr>';}
  else if(!(pending||[]).length){target.innerHTML='<tr><td colspan="5">No hay enlaces pendientes.</td></tr>';}
  else target.innerHTML=pending.map(r=>'<tr><td>'+esc(r.source_product_id)+'</td><td>'+esc(r.brand_hint+' · '+r.name_hint)+'</td><td>'+esc(({hombre:'Hombre',mujer:'Mujer',ninos:'Niños'})[r.category]||r.category)+'</td><td><span class="pending">'+esc(r.status)+'</span></td><td><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener noreferrer">Abrir producto SHEIN</a></td></tr>').join('');
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
  if(!$("manualVerified").checked){status("Confirma que verificaste realmente la oferta y sus datos.",true);return;}
  fd.verified_at=new Date().toISOString();
  let input;
  try{input=normalize(fd,0);}catch(e){status(e.message,true);return;}
  run(async()=>{
   const {error}=await client.rpc("admin_shein_import",{p_rows:[input]});
   if(error)throw error;
   $("skuForm").reset();
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
    status(incoming.length+" variantes revisadas. Verifica las licencias y los precios antes de importar.");
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