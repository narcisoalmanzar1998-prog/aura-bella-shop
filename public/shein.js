(function auraSheinStore(){
 "use strict";
 const cfg=window.AURA_SUPABASE||{};
 const client=window.supabase&&cfg.url&&(cfg.publishableKey||cfg.anonKey)
   ?window.supabase.createClient(cfg.url,cfg.publishableKey||cfg.anonKey):null;
 const phone="18098992529";
 const money=n=>"RD$ "+new Intl.NumberFormat("es-DO",{maximumFractionDigits:0}).format(Number(n)||0);
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const safeUrl=v=>/^https:\/\//i.test(String(v||""))?String(v):"/logo-aura-bella.jpg";
 const cats=["hombre","mujer","ninos"];
 const names={hombre:"Ropa de hombre",mujer:"Ropa de mujer",ninos:"Ropa de niños"};
 let rows=[],lookup=new Map(),choice=new Map(),cart=[],currentUser=null,authClient=null,loading=false,cartError="";
 let currentOrder=null,lastLoaded=0;
 const cartItems=()=>cart.map(entry=>({row:lookup.get(entry.sku),quantity:Number(entry.quantity)})).filter(x=>x.row&&x.quantity>0);
 const cartCount=()=>cartItems().reduce((s,x)=>s+x.quantity,0);
 const notify=()=>window.auraShop?.refreshCart?.();
 const groupRecords=(cat)=>{
   const map=new Map();
   for(const row of rows.filter(r=>r.category===cat)){
     const id=String(row.source_product_id);
     if(!map.has(id))map.set(id,[]);
     map.get(id).push(row);
   }
   return Array.from(map.entries()).map(([id,variants])=>({id,variants}));
 };
 function selected(group){
   const wanted=choice.get(group.id);
   return group.variants.find(v=>v.sku===wanted)||group.variants[0];
 }
 function productLink(v){
   const base=new URL(location.pathname,location.origin);
   base.searchParams.set("sku",v.sku);
   base.hash="ropa-"+v.category;
   return base.toString();
 }
 function card(g){
   const v=selected(g);
   if(!v)return "";
   const colors=Array.from(new Set(g.variants.map(x=>x.color)));
   const sizes=Array.from(new Set(g.variants.filter(x=>x.color===v.color).map(x=>x.size)));
   const colorOptions=colors.map(c=>'<option value="'+esc(c)+'"'+(c===v.color?' selected':'')+'>'+esc(c)+'</option>').join("");
   const sizeOptions=sizes.map(s=>'<option value="'+esc(s)+'"'+(s===v.size?' selected':'')+'>'+esc(s)+'</option>').join("");
   return '<article class="shein-item" data-shein-group="'+esc(g.id)+'">'+
    '<img class="shein-photo" loading="lazy" src="'+esc(safeUrl(v.image_url))+'" alt="'+esc(v.brand+' '+v.title)+'" onerror="this.onerror=null;this.src=\'/logo-aura-bella.jpg\'">'+
    '<div class="shein-detail"><span class="shein-brand">'+esc(v.brand)+'</span>'+
    '<h4 class="shein-name">'+esc(v.title)+'</h4>'+
    '<p class="shein-description">'+esc(v.description||"Selecciona tu color y talla para solicitar este artículo.")+'</p>'+
    '<div class="shein-variant-grid"><label class="shein-field">Color<select data-shein-color="'+esc(g.id)+'">'+colorOptions+'</select></label>'+
    '<label class="shein-field">Talla<select data-shein-size="'+esc(g.id)+'">'+sizeOptions+'</select></label></div>'+
    '<div class="shein-numbers"><div class="shein-unit"><span>Precio del producto</span><strong>'+money(v.unit_price_rd)+'</strong></div>'+
    '<p class="shein-shipping">🚚 Costo de envío: '+money(v.shipping_rd)+' por unidad</p>'+
    '<div class="shein-total"><span>Total a pagar</span><strong>'+money(v.total_rd)+'</strong></div></div>'+
    '<div class="shein-actions"><button type="button" data-shein-add="'+esc(v.sku)+'">Agregar al carrito</button>'+
    '<button type="button" class="shein-buy" data-shein-order="'+esc(v.sku)+'">Pedir por WhatsApp</button></div>'+
    '<span class="shein-status" aria-live="polite"></span></div></article>';
 }
 function renderStore(){
   for(const cat of cats){
     const section=document.getElementById("ropa-"+cat);
     if(!section)continue;
     const target=section.querySelector(".apparel-products");
     const empty=section.querySelector(".apparel-empty");
     const status=section.querySelector(".apparel-status");
     if(!target)continue;
     const groups=groupRecords(cat);
     target.classList.toggle("has-items",groups.length>0);
     section.classList.toggle("has-shein",groups.length>0);
     target.innerHTML=groups.map(card).join("");
     if(empty)empty.hidden=groups.length>0;
     if(status)status.hidden=groups.length>0;
     const count=section.querySelector("[data-shein-amount]");
     if(count)count.textContent=groups.length?groups.length+" modelos disponibles":"Próximamente";
   }
 }
 function cartHtml(){
   const things=cartItems();
   if(!things.length)return "";
   const products=things.reduce((sum,{row,quantity})=>sum+row.unit_price_rd*quantity,0);
   const shipping=things.reduce((sum,{row,quantity})=>sum+row.shipping_rd*quantity,0);
   return '<section class="shein-cart-part"><h3 class="shein-cart-heading">Ropa SHEIN</h3>'+
    (cartError?'<p role="alert" class="shop-warning">'+esc(cartError)+'</p>':"")+
    things.map(({row:r,quantity})=>'<div class="shein-cart-row"><img src="'+esc(safeUrl(r.image_url))+'" alt="'+esc(r.title)+'" onerror="this.onerror=null;this.src=\'/logo-aura-bella.jpg\'"><div>'+
      '<div class="shein-cart-item-title">'+esc(r.brand+' '+r.title)+'</div>'+
      '<div class="shein-cart-item-meta">Color: '+esc(r.color)+' · Talla: '+esc(r.size)+'</div>'+
      '<div class="shein-cart-price">Artículo '+money(r.unit_price_rd)+' + 🚚 '+money(r.shipping_rd)+' por unidad</div>'+
      '<div class="shein-cart-price">Total ('+quantity+' uds.): '+money(r.total_rd*quantity)+'</div>'+
      '<div class="shein-cart-qty"><button type="button" data-shein-qty="'+esc(r.sku)+'" data-shein-delta="-1"'+(loading?' disabled':'')+'>−</button>'+
      '<span>'+quantity+'</span><button type="button" data-shein-qty="'+esc(r.sku)+'" data-shein-delta="1"'+(loading?' disabled':'')+'>+</button>'+
      '<button class="shein-remove" type="button" data-shein-remove="'+esc(r.sku)+'">Eliminar</button></div></div></div>').join("")+
    '<div class="shein-summary"><div><span>Artículos</span><strong>'+money(products)+'</strong></div>'+
    '<div><span>🚚 Envío ('+cartCount()+' unidades × costo unitario)</span><strong>'+money(shipping)+'</strong></div>'+
    '<div class="grand-total"><span>Total ropa + envío</span><strong>'+money(products+shipping)+'</strong></div></div></section>';
 }
 function message(things,perfumes){
   const text=["¡Hola, Aura Bella Shop! ✨","","Quiero realizar un pedido:",""];
   let productTotal=0,shipTotal=0,count=0;
   for(const {row:r,quantity:q} of things){
     productTotal+=r.unit_price_rd*q;shipTotal+=r.shipping_rd*q;count+=q;
     text.push("🛍️ Producto: "+r.brand+" "+r.title,
       "🎨 Color: "+r.color,"📏 Talla: "+r.size,
       "🔢 Cantidad: "+q,
       "💰 Precio del producto: "+money(r.unit_price_rd)+" por unidad",
       "🚚 Costo de envío: "+money(r.shipping_rd)+" × "+q+" = "+money(r.shipping_rd*q),
       "💳 Total a pagar: "+money(r.total_rd*q),
       "🔗 Enlace: "+productLink(r),"");
   }
   let perfumeTotal=0,pending=false;
   for(const {p,quantity:q} of perfumes){
     text.push("🌸 Perfume: "+p.brand+" "+p.name+" × "+q+" — "+(p.price===null?"Consultar precio":money(p.price*q)));
     if(p.price===null)pending=true;
     else perfumeTotal+=p.price*q;
   }
   if(perfumes.length)text.push("Nota: envío y disponibilidad de perfumes por confirmar (no aplica el cargo SHEIN).","");
   text.push("💰 Subtotal ropa: "+money(productTotal),
     "🚚 Envío SHEIN ("+count+" unidades): "+money(shipTotal),
     "💳 Total"+(pending?" parcial":"")+" a pagar: "+money(productTotal+shipTotal+perfumeTotal),
     "",
     "📦 He leído y acepto el plazo estimado de entrega de 17 días y el costo de envío indicado.",
     "",
     "¡Me gustaría confirmar mi pedido!");
   return text.join("\n");
 }
 const consent=document.createElement("div");
 consent.className="shein-layer";consent.id="sheinConsent";consent.setAttribute("aria-hidden","true");
 consent.innerHTML='<section class="shein-dialog" role="dialog" aria-modal="true" aria-labelledby="sheinConsentTitle">'+
  '<button type="button" class="shein-close" data-shein-back aria-label="Cerrar">×</button>'+
  '<h2 id="sheinConsentTitle">📦 INFORMACIÓN IMPORTANTE SOBRE TU PEDIDO</h2>'+
  '<p>¡Gracias por elegir Aura Bella Shop! ✨</p>'+
  '<p>Nuestros productos SHEIN provienen directamente de los Estados Unidos. 🇺🇸</p>'+
  '<p>Por este motivo, contamos con un tiempo estimado de entrega de <b>17 días</b>, durante el cual recibimos, preparamos, empaquetamos y coordinamos la entrega de tu pedido.</p>'+
  '<p>🚚 <b>Costo de envío: <span id="sheinConsentShipping">RD$100</span> por producto.</b> El cargo se aplica por unidad, sin descuentos automáticos.</p>'+
  '<p>Agradecemos tu confianza y comprensión.</p>'+
  '<p><b>Aura Bella Shop — Elegancia en cada detalle. ✨</b></p>'+
  '<div id="sheinConsentSummary" class="shein-summary"></div>'+
  '<label class="shein-check-row"><input type="checkbox" id="sheinAccept"><span>He leído y acepto el plazo estimado de entrega de 17 días y el costo de envío indicado de <span id="sheinConsentShippingCheck">RD$100</span> por cada unidad SHEIN.</span></label>'+
  '<div class="shein-dialog-actions"><button type="button" class="shein-back" data-shein-back>Volver a la tienda</button>'+
  '<button type="button" class="shein-confirm" id="sheinGoWhatsapp" disabled>Aceptar y continuar a WhatsApp</button></div></section>';
 document.body.appendChild(consent);
 let wasOpen=false;
 function closeConsent(){
  consent.classList.remove("is-open");consent.setAttribute("aria-hidden","true");
  document.body.style.overflow=document.getElementById("cartLayer")?.classList.contains("is-open")?"hidden":"";
  currentOrder=null;
 }
 function openConsent(things,perfumes=[]){
   if(!things.length)return;
   // Each public listing is verified for the announced shipping route, delivery estimate and rights.
   const shipping=things.reduce((n,i)=>n+i.row.shipping_rd*i.quantity,0);
   const products=things.reduce((n,i)=>n+i.row.unit_price_rd*i.quantity,0);
   const pricePerf=perfumes.reduce((n,i)=>n+(i.p.price||0)*i.quantity,0);
   const count=things.reduce((n,i)=>n+i.quantity,0);
   const unitShip=things[0].row.shipping_rd;
   document.getElementById("sheinConsentShipping").textContent=money(unitShip);
   document.getElementById("sheinConsentShippingCheck").textContent=money(unitShip);
   const summary=document.getElementById("sheinConsentSummary");
   summary.innerHTML='<div><span>Productos SHEIN</span><strong>'+money(products)+'</strong></div>'+
    '<div><span>Envío ('+count+' unidades)</span><strong>'+money(shipping)+'</strong></div>'+
    (perfumes.length?'<div><span>Perfumes con precio</span><strong>'+money(pricePerf)+'</strong></div>':"")+
    '<div class="grand-total"><span>Total'+(perfumes.some(x=>x.p.price===null)?" parcial":"")+'</span><strong>'+money(products+shipping+pricePerf)+'</strong></div>';
   currentOrder={things,perfumes};
   document.getElementById("sheinAccept").checked=false;
   document.getElementById("sheinGoWhatsapp").disabled=true;
   consent.classList.add("is-open");consent.setAttribute("aria-hidden","false");
   document.body.style.overflow="hidden";
   document.getElementById("sheinAccept").focus();
 }
 function checkoutCart(perfumeItems=[]){openConsent(cartItems(),perfumeItems);}
 function orderOne(sku){
   const row=lookup.get(String(sku));
   if(!row)return;
   openConsent([{row,quantity:1}],[]);
 }
 async function refreshCatalog(){
  if(!client)return;
  const received=[];let from=0;
  while(true){
   const {data,error}=await client.from("shein_products")
     .select("sku,source_product_id,category,title,brand,description,color,size,image_url,unit_price_rd,shipping_rd,total_rd,verified_at")
     .order("source_product_id").order("sku").range(from,from+499);
   if(error)throw error;
   received.push(...(data||[]));
   if(!data||data.length<500)break;
   from+=500;if(from>5000)break;
  }
  rows=received;lookup=new Map(rows.map(r=>[r.sku,r]));lastLoaded=Date.now();
  renderStore();notify();
  const skuFromUrl=new URLSearchParams(location.search).get("sku");
  if(skuFromUrl&&lookup.has(skuFromUrl)){
    choice.set(String(lookup.get(skuFromUrl).source_product_id),skuFromUrl);
    renderStore();
  }
 }
 let catalogPromise=refreshCatalog().catch(err=>{
   console.warn("No se pudo cargar la ropa SHEIN",err?.message);
   for(const cat of cats){
    const node=document.querySelector("#ropa-"+cat+" .apparel-empty");
    if(node)node.textContent="El catálogo de ropa no está disponible en este momento. Intenta actualizar la página.";
   }
 });
 async function setSession(user,connectedClient){
  const uid=user?.id||null;
  if(uid===currentUser?.id&&connectedClient===authClient)return;
  currentUser=user||null;authClient=connectedClient||null;cart=[];cartError="";
  notify();
  if(!currentUser||!authClient)return;
  await catalogPromise;
  const {data,error}=await authClient.from("shein_cart_items")
   .select("sku,quantity").eq("user_id",uid);
  if(currentUser?.id!==uid)return;
  if(error){cartError="No se pudo cargar el carrito de ropa. Inténtalo nuevamente.";console.warn(error.message);}
  else cart=(data||[]).filter(r=>lookup.has(r.sku)).map(r=>({sku:r.sku,quantity:r.quantity}));
  notify();
 }
 async function change(sku,delta,remove=false){
  if(!currentUser||!authClient){await window.auraAuth?.requireAccount?.();return;}
  if(loading||!lookup.has(sku))return;
  const existing=cart.find(x=>x.sku===sku);
  const old=Number(existing?.quantity||0);
  const value=remove?0:Math.max(0,Math.min(99,old+delta));
  if(old===value)return;
  const prev=cart.map(x=>({...x}));
  loading=true;
  if(value===0)cart=cart.filter(x=>x.sku!==sku);
  else if(existing)existing.quantity=value;
  else cart.push({sku,quantity:value});
  notify();
  try{
   const r=value===0
     ?await authClient.from("shein_cart_items").delete().eq("user_id",currentUser.id).eq("sku",sku)
     :await authClient.from("shein_cart_items").upsert({
         user_id:currentUser.id,sku,quantity:value,updated_at:new Date().toISOString()
       },{onConflict:"user_id,sku"});
   if(r.error)throw r.error;
   cartError="";
  }catch(e){cart=prev;cartError="No se pudo guardar el artículo de ropa. Inténtalo nuevamente.";console.warn("SHEIN cart",e.message);}
  finally{loading=false;notify();}
 }
 document.addEventListener("change",e=>{
  const color=e.target.closest("[data-shein-color]");
  const size=e.target.closest("[data-shein-size]");
  if(color||size){
   const id=(color||size).dataset.sheinColor||(color||size).dataset.sheinSize;
   const group=groupRecords(rows.find(r=>r.source_product_id===id)?.category||"").find(g=>g.id===id);
   if(!group)return;
   const cardNode=e.target.closest(".shein-item");
   const current=selected(group);
   const newColor=color?color.value:current.color;
   const newSize=size?size.value:current.size;
   let variant=group.variants.find(v=>v.color===newColor&&v.size===newSize);
   if(!variant)variant=group.variants.find(v=>v.color===newColor)||group.variants[0];
   choice.set(id,variant.sku);
   cardNode.outerHTML=card(group);
   return;
  }
  if(e.target.id==="sheinAccept"){
    document.getElementById("sheinGoWhatsapp").disabled=!e.target.checked;
  }
 });
 document.addEventListener("click",async e=>{
  const order=e.target.closest("[data-shein-order]");
  if(order){orderOne(order.dataset.sheinOrder);return;}
  const add=e.target.closest("[data-shein-add]");
  if(add){await change(add.dataset.sheinAdd,1);if(currentUser)await window.auraShop?.openCart?.();return;}
  const qty=e.target.closest("[data-shein-qty]");
  if(qty){await change(qty.dataset.sheinQty,Number(qty.dataset.sheinDelta));return;}
  const del=e.target.closest("[data-shein-remove]");
  if(del){await change(del.dataset.sheinRemove,0,true);return;}
  const back=e.target.closest("[data-shein-back]");
  if(back){closeConsent();return;}
  if(e.target.id==="sheinGoWhatsapp"){
   if(e.target.disabled||!currentOrder||!document.getElementById("sheinAccept").checked)return;
   const text=message(currentOrder.things,currentOrder.perfumes);
   const link="https://wa.me/"+phone+"?text="+encodeURIComponent(text);
   closeConsent();
   window.open(link,"_blank","noopener,noreferrer");
  }
 });
 consent.addEventListener("click",e=>{if(e.target===consent)closeConsent();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&consent.classList.contains("is-open"))closeConsent();});
 document.addEventListener("visibilitychange",()=>{
   if(!document.hidden&&Date.now()-lastLoaded>300000){catalogPromise=refreshCatalog().catch(e=>console.warn(e.message));}
 });
 window.auraApparel={setSession,getCartCount:cartCount,cartHtml,checkoutCart,orderOne,refreshCatalog};
})();