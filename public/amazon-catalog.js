(function(){
"use strict";
async function loadAmazonPerfumes(){
 try{
  const cfg=window.AURA_SUPABASE||{};
  const client=window.supabase?.createClient(cfg.url,cfg.publishableKey||cfg.anonKey);
  if(!client)return;
  const {data,error}=await client.from("amazon_perfumes_catalog").select("id,category,audience,brand,name,concentration,size_ml,variant,image_url,description,price_rd").order("id");
  if(error)throw error;
  const old=new Set(perfumes.map(p=>Number(p.id)));
  for(const p of data||[]){
   const id=1000000+Number(p.id);
   if(old.has(id))continue;
   const record={id,category:p.category,audience:p.audience,brand:p.brand,name:p.name,concentration:p.concentration,size:Number(p.size_ml),
    photo:/^https:\/\//i.test(p.image_url)?p.image_url:null,price:Number(p.price_rd),amazonManaged:true,variant:p.variant,
    description:p.description,notes:[[],[],[]],notes_source:""};
   perfumes.push(record);old.add(id);
  }
  render();
  window.auraShop?.refreshCatalog?.();
 }catch(e){console.warn("No se pudieron cargar perfumes adicionales:",e.message)}
}
loadAmazonPerfumes();
})();