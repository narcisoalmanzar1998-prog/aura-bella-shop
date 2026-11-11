(function auraShopApp(){
  "use strict";
  const PHONE="18098992529";
  const KEY="aura-bella-cart-v2";
  const catalog=typeof perfumes!=="undefined"?perfumes:[];
  const byId=new Map(catalog.map(p=>[Number(p.id),p]));
  let cart=readCart();
  let opener=null;
  function esc(text){return String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function money(price){return price==null?"Consultar precio":"RD$ "+new Intl.NumberFormat("es-DO",{maximumFractionDigits:0}).format(price);}
  function details(p){return [p.concentration,p.size?p.size+" ml":null].filter(Boolean).join(", ");}
  function productMessage(p){return "Hola! me encantaria pedir: "+p.brand+" "+p.name+(details(p)?" ("+details(p)+")":"")+".\nPrecio publicado: "+money(p.price)+".\n¿Me confirman disponibilidad para hacer el pedido?";}
  function waLink(message){return "https://wa.me/"+PHONE+"?text="+encodeURIComponent(message);}
  function readCart(){
    try {const obj=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(obj)?obj.filter(i=>byId.has(Number(i.id))).map(i=>({id:Number(i.id),quantity:Math.max(1,Math.min(99,Math.floor(Number(i.quantity)||1)))})):[];}catch(e){return [];}
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(cart));}catch(e){}updateBadge();}
  function updateBadge(){const badge=document.getElementById("cartCount");if(badge)badge.textContent=String(cart.reduce((sum,i)=>sum+i.quantity,0));}
  function getItems(){return cart.map(i=>({p:byId.get(i.id),quantity:i.quantity})).filter(i=>!!i.p);}
  function cartMessage(){
    const items=getItems();const lines=["Hola! me encantaria pedir:",""];
    for (const {p,quantity} of items)lines.push("• "+quantity+" x "+p.brand+" "+p.name+(details(p)?" ("+details(p)+")":"")+" — "+money(p.price));
    const known=items.reduce((sum,{p,quantity})=>sum+(p.price==null?0:p.price*quantity),0);
    const pending=items.some(({p})=>p.price==null);
    lines.push("","Subtotal con precios publicados: "+money(known)+(pending?" (hay productos por cotizar)":""));
    lines.push("¿Me confirman disponibilidad y precio total para realizar el pedido?");
    return lines.join("\n");
  }
  const layer=document.createElement("div");layer.id="cartLayer";layer.className="shop-layer";layer.setAttribute("aria-hidden","true");
  layer.innerHTML='<div class="shop-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle"><button type="button" class="shop-close" data-close-cart aria-label="Cerrar carrito">×</button><div class="eyebrow">Aura Bella Shop</div><h2 id="cartTitle">Mi carrito</h2><p class="shop-subtitle">Organiza tus perfumes y envía el pedido completo por WhatsApp.</p><div id="cartBody"></div></div>';
  document.body.appendChild(layer);
  function render(){
    const body=document.getElementById("cartBody"),items=getItems();
    if(!body)return;
    if(!items.length){body.innerHTML='<p class="shop-help">Tu carrito está vacío. Explora la colección y agrega los perfumes que te gusten.</p><div class="shop-actions"><button type="button" class="shop-primary" data-close-cart>Seguir comprando</button></div>';return;}
    const pending=items.some(({p})=>p.price==null);
    const known=items.reduce((sum,{p,quantity})=>sum+(p.price==null?0:p.price*quantity),0);
    body.innerHTML=(pending?'<div class="shop-warning">Algunos perfumes requieren cotización. Te confirmaremos su precio final por WhatsApp.</div>':"")+
      items.map(({p,quantity})=>'<div class="shop-cart-item"><img src="'+esc(p.photo||"")+'" alt="'+esc(p.name)+'"><div><div class="shop-cart-name">'+esc(p.brand+" "+p.name)+'</div><div class="shop-cart-small">'+esc(details(p))+' · '+esc(money(p.price))+'</div><div class="shop-cart-qty"><button type="button" data-qty-id="'+p.id+'" data-delta="-1" aria-label="Quitar una unidad de '+esc(p.name)+'">−</button><span>'+quantity+'</span><button type="button" data-qty-id="'+p.id+'" data-delta="1" aria-label="Añadir una unidad de '+esc(p.name)+'">+</button></div></div><div><strong>'+esc(p.price==null?"A cotizar":money(p.price*quantity))+'</strong><div><button class="shop-remove" type="button" data-remove="'+p.id+'">Eliminar</button></div></div></div>').join("")+
      '<div class="shop-cart-total"><span>Subtotal '+(pending?"parcial":"")+'</span><strong>'+esc(money(known))+'</strong></div>'+
      '<p class="shop-help">La solicitud no confirma la compra. Te atenderemos para confirmar existencias y entrega. El carrito se guarda en este dispositivo.</p>'+
      '<div class="shop-actions"><a class="shop-primary" href="'+esc(waLink(cartMessage()))+'" target="_blank" rel="noopener noreferrer">Pedir carrito en WhatsApp</a><button type="button" class="shop-secondary" data-close-cart>Seguir comprando</button></div>';
  }
  function openCart(){opener=document.activeElement;render();layer.classList.add("is-open");layer.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";layer.querySelector(".shop-close").focus();}
  function closeCart(){layer.classList.remove("is-open");layer.setAttribute("aria-hidden","true");document.body.style.overflow="";if(opener&&opener.focus)opener.focus();}
  function add(id){const product=byId.get(Number(id));if(!product)return;const i=cart.find(c=>c.id===Number(id));if(i)i.quantity=Math.min(99,i.quantity+1);else cart.push({id:Number(id),quantity:1});persist();openCart();}
  function adjust(id,delta){const item=cart.find(c=>c.id===Number(id));if(!item)return;item.quantity+=delta;if(item.quantity<=0)cart=cart.filter(i=>i.id!==Number(id));item.quantity=Math.min(99,item.quantity);persist();render();}
  function remove(id){cart=cart.filter(i=>i.id!==Number(id));persist();render();}
  document.addEventListener("click",event=>{
    const addBtn=event.target.closest("[data-add]");if(addBtn){add(addBtn.getAttribute("data-add"));return;}
    const cartBtn=event.target.closest("#cartToggle");if(cartBtn){openCart();return;}
    if(event.target.closest("[data-close-cart]")){closeCart();return;}
    const qty=event.target.closest("[data-qty-id]");if(qty){adjust(qty.getAttribute("data-qty-id"),Number(qty.getAttribute("data-delta")));return;}
    const rem=event.target.closest("[data-remove]");if(rem){remove(rem.getAttribute("data-remove"));return;}
  });
  layer.addEventListener("click",e=>{if(e.target===layer)closeCart();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&layer.classList.contains("is-open"))closeCart();});
  updateBadge();
  window.auraShop={openCart,add,waLink,cartMessage,productMessage,number:PHONE};
})();
