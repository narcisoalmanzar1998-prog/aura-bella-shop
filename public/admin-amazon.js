(function(){
"use strict";
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const client=window.supabase?.createClient(window.AURA_SUPABASE?.url,window.AURA_SUPABASE?.publishableKey||window.AURA_SUPABASE?.anonKey);
let items=[];
function status(s,error=false){$("amazonStatus").textContent=s;$("amazonStatus").classList.toggle("error",error)}
const asinOf=s=>{try{const u=new URL(s);if(u.protocol!=="https:"||!/(^|\.)amazon\.com$/i.test(u.hostname))return null;return (u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)||[])[1]?.toUpperCase()||null}catch{return null}};
function rules(category,usd){return Math.round(Number(usd)*(category==="Árabe"?63:65)+(category==="Árabe"?1500:3500))}
async function load(){const {data,error}=await client.rpc("admin_amazon_perfumes_list");if(error)throw error;items=data||[];paint()}
function paint(){
 const f=$("amazonSearch").value.toLowerCase(), rows=items.filter(p=>[p.name,p.brand,p.asin,p.category].join(" ").toLowerCase().includes(f));
 $("amazonStats").textContent=items.length+" productos · "+items.filter(p=>p.published).length+" publicados · "+items.filter(p=>!p.published).length+" pendientes";
 $("amazonRows").innerHTML=rows.map(p=>'<tr><td>'+esc(p.asin)+'</td><td><b>'+esc(p.brand+" "+p.name)+'</b><small>'+esc(p.concentration+" · "+p.size_ml+" ml · "+p.variant)+'</small></td><td>'+esc(p.category)+'</td><td>'+(p.cost_usd===null?'Por verificar':'US$ '+esc(p.cost_usd))+'</td><td>'+(p.cost_usd===null?'Pendiente':'RD$ '+rules(p.category,p.cost_usd).toLocaleString("es-DO"))+'</td><td class="'+(p.published?'ok':'pending')+'">'+(p.published?'Publicado':'Pendiente')+'</td><td><button data-amazon-edit="'+p.id+'">Editar</button> <button data-amazon-publish="'+p.id+'">'+(p.published?'Retirar':'Publicar')+'</button> <button class="admin-danger" data-amazon-delete="'+p.id+'">Eliminar</button> <a href="'+esc(p.amazon_url)+'" target="_blank" rel="noopener noreferrer">Amazon</a></td></tr>').join("")||'<tr><td colspan="7">No hay perfumes registrados.</td></tr>';
}
function formData(){const o=Object.fromEntries(new FormData($("amazonForm")).entries());o.available=$("amazonAvailable").checked;o.asin=asinOf(o.amazon_url)||"";o.id=$("amazonId").value||undefined;o.cost_usd=o.cost_usd||null;o.verified_at=$("amazonVerified").value?new Date($("amazonVerified").value).toISOString():null;return o}
function reset(){ $("amazonForm").reset();$("amazonId").value="";$("amazonPreview").textContent="Sin precio confirmado"; }
function edit(p){reset();for(const [k,v] of Object.entries(p)){const el=$("amazonForm").elements.namedItem(k);if(el&&el.type!=="checkbox"&&k!=="verified_at")el.value=v??""} $("amazonId").value=p.id;$("amazonVerified").value=p.verified_at?new Date(new Date(p.verified_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):"";$("amazonAvailable").checked=!!p.available;$("amazonPreview").textContent=p.cost_usd?"Precio final RD$ "+rules(p.category,p.cost_usd).toLocaleString("es-DO"):"Sin precio confirmado";$("amazonForm").scrollIntoView({behavior:"smooth",block:"start"})}
function analyze(){
 const lines=$("amazonLinks").value.split(/[\n\s,;]+/).map(s=>s.trim()).filter(Boolean);if(lines.length>50)throw Error("Máximo 50 enlaces por lote");
 const unique=new Map(), invalid=[];for(const url of lines){const asin=asinOf(url);if(asin)unique.set(asin,"https://www.amazon.com/dp/"+asin);else invalid.push(url)}
 $("amazonAnalysis").innerHTML='<p>'+unique.size+' enlaces de Amazon válidos, '+invalid.length+' inválidos. No se extraen precios automáticamente.</p>'+Array.from(unique).map(([id])=>'<span style="display:inline-block;border:1px solid #d5c7ac;padding:5px;margin:3px">'+esc(id)+'</span>').join("");
 return Array.from(unique);
}
async function guard(fn){try{status("Procesando…");await fn();status("Operación completada.");await load()}catch(e){status(e.message||"No se pudo completar la operación.",true)}}
async function ready(){if(!client)return status("Supabase no configurado",true);
 const {data:{user}}=await client.auth.getUser();const {data:aal}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 if(!user||aal?.currentLevel!=="aal2")return status("Inicia sesión como administradora y completa la verificación de dos factores.",true);
 await guard(load)}
$("amazonAnalyze").onclick=()=>{try{analyze()}catch(e){status(e.message,true)}};
$("amazonImport").onclick=()=>guard(async()=>{
 const links=analyze(),category=$("amazonBulkCategory").value,audience=$("amazonBulkAudience").value;
 if(!category)throw Error("Selecciona la categoría confirmada. No se adivina si es árabe, nicho o diseñador.");
 for(const [asin,url] of links){if(items.some(p=>p.asin===asin))continue;
  const {error}=await client.rpc("admin_amazon_perfumes_save",{p_item:{asin,amazon_url:url,category,audience,brand:"Por verificar",name:"Por verificar",concentration:"Por verificar",size_ml:1,variant:"",available:false}});
  if(error)throw error;
 } $("amazonLinks").value="";
});
$("amazonForm").addEventListener("input",()=>{try{const o=formData();$("amazonPreview").textContent=o.cost_usd&&o.category?"Precio final RD$ "+rules(o.category,o.cost_usd).toLocaleString("es-DO"):"Sin precio confirmado"}catch{}});
$("amazonForm").onsubmit=e=>{e.preventDefault();guard(async()=>{
 const d=formData();if(!d.asin)throw Error("Usa un enlace Amazon.com con ASIN (/dp/XXXXXXXXXX).");
 if(!d.category)throw Error("Selecciona una categoría verificada.");
 if(d.cost_usd&&(!d.verified_at||!d.seller||!d.fulfillment))throw Error("Para registrar el precio verifica fecha, vendedor y logística.");
 if(!d.cost_usd){d.verified_at=null;d.available=false;}
 const {error}=await client.rpc("admin_amazon_perfumes_save",{p_item:d});if(error)throw error;reset();
})};
$("amazonRows").onclick=e=>{
 const b=e.target.closest("button");if(!b)return;
 const id=Number(b.dataset.amazonEdit||b.dataset.amazonPublish||b.dataset.amazonDelete),p=items.find(x=>x.id===id);if(!p)return;
 if(b.dataset.amazonEdit){edit(p);return}
 if(b.dataset.amazonDelete){if(!confirm("¿Eliminar definitivamente "+p.brand+" "+p.name+"?"))return;guard(async()=>{const {error}=await client.rpc("admin_amazon_perfumes_delete",{p_id:id});if(error)throw error});return}
 if(b.dataset.amazonPublish){if(!confirm((p.published?"Retirar":"Publicar")+" el perfume "+p.brand+" "+p.name+"?"))return;guard(async()=>{const {error}=await client.rpc("admin_amazon_perfumes_publish",{p_id:id,p_publish:!p.published});if(error)throw error});}
};
$("amazonSearch").oninput=paint;$("amazonClear").onclick=reset;ready();
})();