(function auraShopApp(){
  "use strict";
  const PHONE="18098992529";
  const catalog=typeof perfumes!=="undefined"?perfumes:[];
  const byId=new Map(catalog.map(p=>[Number(p.id),p]));
  let cart=[],accountUser=null,supabaseClient=null,opener=null,loading=false,cartError="";
  const htmlEscape=text=>String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=n=>n===null?"Consultar precio":"RD$ "+new Intl.NumberFormat("es-DO",{maximumFractionDigits:0}).format(n);
  const details=p=>[p.concentration,p.size?p.size+" ml":null].filter(Boolean).join(", ");
  function productMessage(p){return "Hola! me encantaria pedir: "+p.brand+" "+p.name+(details(p)?" ("+details(p)+")":"")+".\nPrecio: "+money(p.price)+".\n¿Me confirman disponibilidad para realizar el pedido?";}
  function waLink(message){return "https://wa.me/"+PHONE+"?text="+encodeURIComponent(message);}
  function updateBadge(){const badge=document.getElementById("cartCount");if(badge)badge.textContent=String(cart.reduce((sum,i)=>sum+i.quantity,0));}
  const items=()=>cart.map(i=>({p:byId.get(i.id),quantity:i.quantity})).filter(v=>!!v.p);
  function cartMessage(){
    const lines=["Hola! me encantaria pedir:",""];
    for(const {p,quantity} of items())lines.push("• "+quantity+" x "+p.brand+" "+p.name+(details(p)?" ("+details(p)+")":"")+" — "+money(p.price));
    const known=items().reduce((s,{p,quantity})=>s+(p.price==null?0:p.price*quantity),0);
    if(items().some(({p})=>p.price===null))lines.push("","Subtotal de productos con precio: "+money(known)+" (otros por cotizar)");
    else lines.push("","Total de productos: "+money(known));
    lines.push("¿Me confirman existencias, envío y precio final para hacer el pedido?");
    return lines.join("\n");
  }
  const layer=document.createElement("div");layer.id="cartLayer";layer.className="shop-layer";layer.setAttribute("aria-hidden","true");
  layer.innerHTML='<section class="shop-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle"><button type="button" class="shop-close" data-close-cart aria-label="Cerrar carrito">×</button><div class="eyebrow">Aura Bella Shop</div><h2 id="cartTitle">Mi carrito</h2><p class="shop-subtitle">Selecciona tus fragancias y envía el pedido completo por WhatsApp.</p><div id="cartBody"></div></section>';
  document.body.appendChild(layer);
  function render(){
    const body=document.getElementById("cartBody");if(!body)return;
    if(loading){body.innerHTML='<p class="shop-help" role="status">Cargando tu carrito seguro…</p>';return;}
    if(!accountUser){body.innerHTML='<p class="shop-help">Inicia sesión y completa tu verificación en dos pasos para consultar el carrito.</p>';return;}
    if(cartError)body.innerHTML='<div class="shop-warning" role="alert">'+htmlEscape(cartError)+'</div>';
    else body.innerHTML="";
    if(!cart.length){body.innerHTML+='<p class="shop-help">Tu carrito está vacío. Explora la colección y agrega tus perfumes favoritos.</p><div class="shop-actions"><button type="button" class="shop-primary" data-close-cart>Seguir comprando</button></div>';return;}
    const hasPending=items().some(({p})=>p.price===null);
    const known=items().reduce((s,{p,quantity})=>s+(p.price===null?0:p.price*quantity),0);
    body.innerHTML+=(hasPending?'<div class="shop-warning">Hay perfumes por cotizar. Su precio se confirmará por WhatsApp.</div>':"")+
    items().map(({p,quantity})=>'<div class="shop-cart-item"><img src="'+htmlEscape(p.photo||"")+'" alt="'+htmlEscape(p.name)+'"><div><div class="shop-cart-name">'+htmlEscape(p.brand+" "+p.name)+'</div><div class="shop-cart-small">'+htmlEscape(details(p))+' · '+htmlEscape(money(p.price))+'</div><div class="shop-cart-qty"><button type="button" data-qty-id="'+p.id+'" data-delta="-1" aria-label="Quitar una unidad">−</button><span>'+quantity+'</span><button type="button" data-qty-id="'+p.id+'" data-delta="1" aria-label="Agregar una unidad">+</button></div></div><div><strong>'+htmlEscape(p.price===null?"A cotizar":money(p.price*quantity))+'</strong><div><button class="shop-remove" type="button" data-remove="'+p.id+'">Eliminar</button></div></div></div>').join("")+
    '<div class="shop-cart-total"><span>Subtotal'+(hasPending?" parcial":"")+'</span><strong>'+htmlEscape(money(known))+'</strong></div><p class="shop-help">Este envío es una solicitud de pedido; confirmaremos inventario, envío y total antes de realizar la venta.</p><div class="shop-actions"><a class="shop-primary" href="'+htmlEscape(waLink(cartMessage()))+'" target="_blank" rel="noopener noreferrer">Pedir carrito en WhatsApp</a><button type="button" data-close-cart class="shop-secondary">Seguir comprando</button></div>';
  }
  function closeCart(){layer.classList.remove("is-open");layer.setAttribute("aria-hidden","true");document.body.style.overflow="";opener?.focus?.();}
  async function openCart(){
    if(!accountUser||!supabaseClient){await window.auraAuth?.requireAccount?.();return;}
    opener=document.activeElement;render();layer.classList.add("is-open");layer.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";layer.querySelector(".shop-close")?.focus();
  }
  async function setSession(user,client){
    const prev=accountUser?.id;
    if(user&&client&&prev===user.id&&supabaseClient===client)return;
    accountUser=user||null;supabaseClient=client||null;cart=[];loading=!!accountUser;cartError="";updateBadge();
    if(!accountUser){if(layer.classList.contains("is-open"))closeCart();return;}
    render();
    const expected=accountUser.id;
    const {data,error}=await supabaseClient.from("cart_items").select("product_id,quantity").eq("user_id",expected);
    if(accountUser?.id!==expected)return;
    loading=false;
    if(error){cartError="No se pudo leer tu carrito. Comprueba que el proyecto y las políticas estén configurados correctamente.";}
    else cart=(data||[]).filter(i=>byId.has(Number(i.product_id))).map(i=>({id:Number(i.product_id),quantity:Number(i.quantity)}));
    updateBadge();render();
  }
  async function change(id,delta,remove=false){
    if(!accountUser||!supabaseClient){await window.auraAuth?.requireAccount?.();return;}
    if(loading)return;
    const p=byId.get(Number(id));if(!p)return;
    const existing=cart.find(c=>c.id===p.id);
    const oldQty=existing?.quantity||0;const nextQty=remove?0:Math.max(0,Math.min(99,oldQty+delta));
    if(oldQty===nextQty)return;
    const before=cart.map(i=>({...i}));
    if(nextQty===0)cart=cart.filter(i=>i.id!==p.id);
    else if(existing)existing.quantity=nextQty;
    else cart.push({id:p.id,quantity:nextQty});
    cartError="";loading=true;updateBadge();render();
    const uid=accountUser.id,client=supabaseClient;
    try{
      let r;
      if(nextQty===0)r=await client.from("cart_items").delete().eq("user_id",uid).eq("product_id",p.id);
      else r=await client.from("cart_items").upsert({user_id:uid,product_id:p.id,quantity:nextQty,updated_at:new Date().toISOString()},{onConflict:"user_id,product_id"});
      if(r.error)throw r.error;
    }catch(err){
      if(accountUser?.id===uid){cart=before;cartError="No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo.";console.warn("Cart update failed",err?.message);}
    }finally{if(accountUser?.id===uid){loading=false;updateBadge();render();}}
  }
  async function add(id){
    if(!accountUser||!supabaseClient){await window.auraAuth?.requireAccount?.();return;}
    if(document.getElementById("overlay")?.classList.contains("open")&&typeof closeFicha==="function")closeFicha();
    await change(id,1);
    await openCart();
  }
  document.addEventListener("click",e=>{
    const add=e.target.closest("[data-add]");if(add){addProductClicked(add);return;}
    if(e.target.closest("#cartToggle")){openCart();return;}
    if(e.target.closest("[data-close-cart]")){closeCart();return;}
    const qty=e.target.closest("[data-qty-id]");if(qty){change(qty.dataset.qtyId,Number(qty.dataset.delta));return;}
    const remove=e.target.closest("[data-remove]");if(remove){change(remove.dataset.remove,0,true);return;}
  });
  async function addProductClicked(b){const id=Number(b.dataset.add);await add(id);}
  layer.addEventListener("click",e=>{if(e.target===layer)closeCart();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&layer.classList.contains("is-open"))closeCart();});
  updateBadge();
  window.auraShop={setSession,openCart,add,waLink,cartMessage,productMessage,number:PHONE};
})();
