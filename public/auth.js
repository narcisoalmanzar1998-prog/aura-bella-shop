(function auraAuthModule(){
 "use strict";
 const cfg=window.AURA_SUPABASE||{};
 const configured=!!(window.supabase&&typeof window.supabase.createClient==="function"&&/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(String(cfg.url||""))&&String(cfg.publishableKey||cfg.anonKey||"").length>=20);
 const client=configured?window.supabase.createClient(cfg.url,cfg.publishableKey||cfg.anonKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}):null;
 let user=null,aal2=false,mode="login",pendingEmail="",pendingEnroll=null,verifiedFactor=null,openedFrom=null,refreshSeq=0,passwordRecovery=false;
 const panel=document.createElement("div");
 panel.className="shop-layer";panel.id="accountLayer";panel.setAttribute("aria-hidden","true");
 panel.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="accountTitle" class="shop-panel"><button type="button" class="shop-close" data-account-close aria-label="Cerrar">×</button><div class="eyebrow">Aura Bella Shop · Clientes</div><h2 id="accountTitle">Mi cuenta</h2><div id="accountBody"></div><p class="shop-msg" role="status" id="accountMessage"></p></section>';
 document.body.appendChild(panel);
 const $=s=>document.getElementById(s);
 const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const form=(label,name,type,extra="")=>'<label for="a-'+name+'">'+label+'</label><input id="a-'+name+'" name="'+name+'" type="'+type+'" '+extra+' required>';
 const submit=label=>'<button type="submit" class="shop-primary">'+label+'</button>';
 const alertText=(msg,error=false)=>{const el=$("accountMessage");if(el){el.textContent=msg||"";el.dataset.type=error?"error":"ok";}};
 function content(){
   if(!configured)return '<div class="shop-warning">El área de clientes aún no está habilitada. El catálogo y los pedidos individuales por WhatsApp siguen funcionando. Se requiere conectar el proyecto Supabase y configurar su servicio de correo.</div>';
   if(mode==="signup")return '<p class="shop-subtitle">Crea tu cuenta. Te enviaremos un código al correo para confirmarlo.</p><div class="shop-tabs"><button type="button" data-account-action="login" aria-selected="false">Ingresar</button><button type="button" aria-selected="true">Crear cuenta</button></div><form class="shop-form" data-account-form="signup">'+form("Nombre","name","text",'autocomplete="name" minlength="2" maxlength="80"')+form("Correo electrónico","email","email",'autocomplete="email"')+form("Contraseña (mínimo 8 caracteres)","password","password",'autocomplete="new-password" minlength="8"')+submit("Crear cuenta")+'</form><p class="shop-help">Después de confirmar el correo, configurarás un segundo factor con tu app autenticadora.</p>';
   if(mode==="confirm")return '<p class="shop-subtitle">Introduce el código de seis dígitos enviado a <b>'+escapeHTML(pendingEmail)+'</b>. También puedes consultar la carpeta de correo no deseado.</p><form class="shop-form" data-account-form="confirm">'+form("Código de correo","code","text",'autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')+submit("Verificar correo")+'</form><div class="shop-actions"><button class="shop-secondary" type="button" data-account-action="resend">Reenviar código</button><button class="shop-tertiary" type="button" data-account-action="login">Ya tengo cuenta</button></div>';
   if(mode==="forgot")return '<p class="shop-subtitle">Enviaremos instrucciones para cambiar la contraseña a tu correo.</p><form class="shop-form" data-account-form="forgot">'+form("Correo electrónico","email","email",'autocomplete="email"')+submit("Recuperar acceso")+'</form><button class="shop-tertiary" type="button" data-account-action="login">Volver a ingresar</button>';
   if(mode==="reset")return '<p class="shop-subtitle">Crea una contraseña nueva para tu cuenta.</p><form class="shop-form" data-account-form="reset">'+form("Nueva contraseña","password","password",'autocomplete="new-password" minlength="8"')+submit("Guardar contraseña")+'</form>';
   if(mode==="setup")return '<p class="shop-subtitle">Tu correo está confirmado. Antes de utilizar el carrito, activa la verificación en dos pasos (2FA).</p><p class="shop-help">1. Instala una app de autenticación como Google Authenticator o Microsoft Authenticator.<br>2. Escanea el código QR.<br>3. Escribe el código de seis dígitos que aparezca en tu app.</p><div class="shop-actions"><button type="button" class="shop-primary" data-account-action="start-mfa">Configurar 2FA</button><button type="button" class="shop-secondary" data-account-action="logout">Cerrar sesión</button></div>';
   if(mode==="enroll"&&pendingEnroll){
     const qr=String(pendingEnroll.qr||"");const img=qr.startsWith("data:image/")?'<img class="shop-qr" src="'+escapeHTML(qr)+'" alt="Código QR para configurar 2FA">':"";
     return '<p class="shop-subtitle">Escanea este código en tu app autenticadora. Si no puedes escanearlo, escribe la clave manualmente.</p>'+img+'<p class="shop-secret">'+escapeHTML(pendingEnroll.secret)+'</p><p class="shop-help">Guarda el acceso a tu app autenticadora: lo necesitarás cada vez que inicies sesión.</p><form class="shop-form" data-account-form="enroll">'+form("Código de 6 dígitos de tu app","code","text",'autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')+submit("Activar verificación en dos pasos")+'</form>';
   }
   if(mode==="challenge")return '<p class="shop-subtitle">Por seguridad, introduce el código temporal que muestra tu aplicación autenticadora.</p><form class="shop-form" data-account-form="challenge">'+form("Código de verificación en dos pasos","code","text",'autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')+submit("Verificar e ingresar")+'</form><div class="shop-actions"><button class="shop-secondary" type="button" data-account-action="logout">Cerrar sesión</button></div>';
   if(mode==="profile")return '<p class="shop-subtitle">Bienvenida a tu cuenta de Aura Bella Shop.</p><p><b>Correo:</b> '+escapeHTML(user?.email||"")+'</p><p class="shop-help">Verificación del correo y segundo factor activos. Tu carrito está protegido y se guarda en tu cuenta.</p><div class="shop-actions"><button type="button" data-account-action="cart" class="shop-primary">Ver mi carrito</button><button type="button" data-account-action="logout" class="shop-secondary">Cerrar sesión</button></div>';
   return '<p class="shop-subtitle">Accede a tu cuenta o crea una para guardar el carrito de compras.</p><div class="shop-tabs"><button type="button" aria-selected="true">Ingresar</button><button type="button" data-account-action="signup" aria-selected="false">Crear cuenta</button></div><form class="shop-form" data-account-form="login">'+form("Correo electrónico","email","email",'autocomplete="email"')+form("Contraseña","password","password",'autocomplete="current-password"')+submit("Iniciar sesión")+'</form><div class="shop-actions"><button type="button" class="shop-tertiary" data-account-action="forgot">Olvidé mi contraseña</button></div><p class="shop-help">La cuenta utiliza verificación de correo y un segundo factor con una app de códigos.</p>';
 }
 function render(){const body=$("accountBody");if(body)body.innerHTML=content();alertText("");}
 function chooseMode(m){mode=m;render();}
 function openAccount(){
   openedFrom=document.activeElement;
   if(!configured)mode="not-configured";
   else if(!user)mode="login";
   else if(aal2)mode="profile";
   else if(verifiedFactor)mode="challenge";
   else mode="setup";
   render();
   panel.classList.add("is-open");panel.setAttribute("aria-hidden","false");
   document.body.style.overflow="hidden";
   panel.querySelector(".shop-close")?.focus();
 }
 function closeAccount(){panel.classList.remove("is-open");panel.setAttribute("aria-hidden","true");document.body.style.overflow="";openedFrom?.focus?.();}
 async function requireAccount(){if(user&&aal2)return true;openAccount();return false;}
 function notifyCart(){window.auraShop?.setSession?.(user&&aal2?user:null, user&&aal2?client:null);}
 async function refresh(){
   if(!client)return;
   const id=++refreshSeq;
   try {
     const {data:{user:current},error:err}=await client.auth.getUser();
     if(id!==refreshSeq)return;
     if(err||!current){user=null;aal2=false;verifiedFactor=null;notifyCart();if(panel.classList.contains("is-open"))chooseMode("login");return;}
     user=current;
     const [{data:level,error:lerr},{data:factors,error:ferr}]=await Promise.all([client.auth.mfa.getAuthenticatorAssuranceLevel(),client.auth.mfa.listFactors()]);
     if(id!==refreshSeq)return;
     if(lerr||ferr)throw (lerr||ferr);
     verifiedFactor=(factors?.totp||[]).find(f=>f.status==="verified")||null;
     aal2=level?.currentLevel==="aal2";
     notifyCart();
     if(aal2){mode="profile";if(panel.classList.contains("is-open"))render();}
     else {mode=verifiedFactor?"challenge":"setup";if(panel.classList.contains("is-open"))render();}
   }catch(e){alertText("No se pudo comprobar la sesión. Intenta nuevamente.",true);console.warn("Auth check failed",e?.message);}
 }
 function getFormData(form){const d=new FormData(form);return Object.fromEntries(d.entries());}
 async function onForm(e){
   const form=e.target.closest("[data-account-form]");if(!form)return;
   e.preventDefault();if(!client)return;
   const action=form.dataset.accountForm,data=getFormData(form);
   const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;alertText("");
   try{
     let res;
     if(action==="signup"){
       pendingEmail=String(data.email).trim().toLowerCase();
       res=await client.auth.signUp({email:pendingEmail,password:String(data.password),options:{data:{display_name:String(data.name).trim()},emailRedirectTo:location.origin+location.pathname}});
       if(res.error)throw res.error;
       if(res.data?.session){await refresh();alertText("Cuenta creada. Configura la verificación en dos pasos.");}
       else{chooseMode("confirm");alertText("Revisa tu correo e introduce el código de confirmación.");}
     }else if(action==="confirm"){
       res=await client.auth.verifyOtp({email:pendingEmail,token:String(data.code).trim(),type:"email"});
       if(res.error)throw res.error;
       await refresh();alertText("Correo confirmado. Configura tu segundo factor para acceder al carrito.");
     }else if(action==="login"){
       res=await client.auth.signInWithPassword({email:String(data.email).trim(),password:String(data.password)});
       if(res.error)throw res.error;
       await refresh();
       if(!user){alertText("Revisa tu correo para confirmar la cuenta antes de ingresar.",true);}
       else if(!aal2){alertText("Completa la verificación en dos pasos para acceder a tu carrito.");}
     }else if(action==="enroll"||action==="challenge"){
       const factorId=action==="enroll"?pendingEnroll?.id:verifiedFactor?.id;
       if(!factorId)throw new Error("No se encontró el factor de seguridad. Vuelve a iniciar sesión.");
       res=await client.auth.mfa.challengeAndVerify({factorId,code:String(data.code).trim()});
       if(res.error)throw res.error;
       pendingEnroll=null;await refresh();alertText("Verificación completada. Ya puedes utilizar tu carrito.");
     }else if(action==="forgot"){
       res=await client.auth.resetPasswordForEmail(String(data.email).trim(),{redirectTo:location.origin+location.pathname});
       if(res.error)throw res.error;alertText("Si el correo existe, recibirás las instrucciones para recuperar el acceso.");
     }else if(action==="reset"){
       res=await client.auth.updateUser({password:String(data.password)});
       if(res.error)throw res.error;passwordRecovery=false;await refresh();alertText("Contraseña actualizada correctamente.");
     }
   }catch(err){alertText(err?.message||"Ocurrió un problema. Inténtalo de nuevo.",true);}
   finally{if(btn&&document.contains(btn))btn.disabled=false;}
 }
 async function onAction(e){
   const button=e.target.closest("[data-account-action]");if(!button)return;
   const action=button.dataset.accountAction;
   if(["login","signup","forgot"].includes(action)){chooseMode(action);return;}
   if(action==="cart"){closeAccount();window.auraShop?.openCart?.();return;}
   if(!client)return;
   button.disabled=true;alertText("");
   try{
     if(action==="resend"){
       if(!pendingEmail)throw new Error("Vuelve al registro e introduce tu correo.");
       const r=await client.auth.resend({type:"signup",email:pendingEmail});
       if(r.error)throw r.error;alertText("Hemos solicitado el reenvío. Revisa tu correo.");
     }else if(action==="logout"){
       const r=await client.auth.signOut();if(r.error)throw r.error;
       user=null;aal2=false;verifiedFactor=null;notifyCart();chooseMode("login");alertText("Sesión cerrada.");
     }else if(action==="start-mfa"){
       const r=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"Aura Bella Shop"});
       if(r.error)throw r.error;
       pendingEnroll={id:r.data.id,qr:r.data.totp?.qr_code,secret:r.data.totp?.secret};
       chooseMode("enroll");
     }
   }catch(err){alertText(err?.message||"Ocurrió un problema. Inténtalo nuevamente.",true);}
   finally{if(document.contains(button))button.disabled=false;}
 }
 panel.addEventListener("submit",onForm);
 panel.addEventListener("click",e=>{if(e.target===panel||e.target.closest("[data-account-close]"))closeAccount();else onAction(e);});
 document.addEventListener("click",e=>{if(e.target.closest("#accountToggle"))openAccount();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&panel.classList.contains("is-open"))closeAccount();});
 window.auraAuth={openAccount,requireAccount,client:()=>client,currentUser:()=>user,hasMfa:()=>aal2};
 if(client){
   client.auth.onAuthStateChange((event)=>{
     if(event==="PASSWORD_RECOVERY"){passwordRecovery=true;setTimeout(()=>{mode="reset";openAccount();mode="reset";render();},20);}
     else if(["SIGNED_IN","SIGNED_OUT","MFA_CHALLENGE_VERIFIED","USER_UPDATED","TOKEN_REFRESHED"].includes(event))setTimeout(refresh,0);
   });
   refresh();
 }
})();
