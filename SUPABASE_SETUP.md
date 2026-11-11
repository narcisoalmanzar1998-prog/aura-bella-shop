# Aura Bella Shop — activar cuentas y carrito con Supabase

La tienda ya tiene frontend de cuentas, verificación de email, TOTP y carrito con SQL protegido. **No activar el registro de clientes antes de configurar Supabase y SMTP**.

## 1. Crear proyecto Supabase (Free)
1. Ir a https://supabase.com/dashboard y crear un proyecto.
2. Guardar la contraseña de la base en un gestor seguro.
3. En **Project Settings > API / Data API > Project URL and API keys**, copiar:
   - **Project URL** (ejemplo: https://abcxyz.supabase.co).
   - **Publishable key** (empieza por `sb_publishable_`; en proyectos anteriores, la llave anon).
4. Estas dos son públicas para el navegador. **NO** colocar `service_role`, `sb_secret_`, contraseña de la base ni claves SMTP en GitHub.

## 2. Activar autenticación
1. **Authentication > Providers > Email**: habilitar Email y contraseña.
2. **Authentication > Settings**: activar **Confirm email**.
3. **Authentication > URL Configuration**:
   - **Site URL**: `https://aura-bella-shop.onrender.com`
   - **Redirect URLs**: añadir
     - `https://aura-bella-shop.onrender.com/**`
     - `https://aura-bella-shop.onrender.com/coleccion.html`
4. **Authentication > Multi-Factor Auth**: TOTP debe estar habilitado.

## 3. Verificación por código de correo
En **Authentication > Email Templates > Confirm sign up**, personalizar el mensaje para incluir `{{ .Token }}` (seis dígitos). Por ejemplo:

```html
<p>Bienvenida a Aura Bella Shop.</p>
<p>Tu código de verificación es: <strong>{{ .Token }}</strong></p>
<p>Si no solicitaste esta cuenta, ignora el mensaje.</p>
```

La plantilla tiene que usar el código `{{ .Token }}` y no solamente un enlace de confirmación para que funcione el formulario de 6 dígitos.

**Importante**: el correo SMTP incluido por defecto en Supabase NO sirve para clientes públicos, solo para miembros autorizados de tu organización (límite muy bajo). Configura **Authentication > SMTP Settings > Enable custom SMTP** con un proveedor de envío como Brevo o Resend. Debes verificar un remitente autorizado; según el proveedor, puede requerir dominio propio. No guardes credenciales SMTP en este repositorio.

## 4. Crear carrito seguro
Abrir **Supabase > SQL Editor** y ejecutar el archivo `supabase/setup.sql` del repositorio.

El carrito `public.cart_items` tiene políticas RLS por usuario y requiere MFA confirmada (`aal2`). No dar permisos de escritura a invitados.

## 5. Vincular Supabase a la web
Modificar `public/auth-config.js` para completar los dos valores públicos:

```js
window.AURA_SUPABASE = {
  url: "https://TU-PROYECTO.supabase.co",
  publishableKey: "sb_publishable_TU_CLAVE_PUBLICA"
};
```

Guardar y confirmar los cambios en la rama `main`. Render publica automáticamente el sitio.
Antes de completar este archivo la web muestra que **las cuentas aún no están habilitadas** (no envía códigos ficticios).

## 6. Probar el flujo antes del lanzamiento
1. Entrar en una ventana privada, abrir la tienda y pulsar **Mi cuenta > Crear cuenta**.
2. Recibir el código por correo y validarlo.
3. Configurar un segundo factor (escaneo QR) desde Google Authenticator / Microsoft Authenticator.
4. Entrar con email y contraseña; cuando se solicite, introducir el código TOTP.
5. Añadir perfumes al carrito. Recargar la web y comprobar que siguen guardados.
6. Abrir la cuenta desde otro navegador y comprobar que aparece el mismo carrito.
7. Pulsar **Pedir carrito en WhatsApp**: tiene que ir a `+1 809-899-2529` y mostrar lista, cantidades y subtotal.
8. Pulsar **Pedir en WhatsApp** sobre un perfume: el mensaje debe mencionar el perfume elegido.
9. Probar con una segunda cuenta que no pueda ver el carrito de la primera.

## Consideraciones
- Las cuentas y el carrito necesitan conexión a internet con Supabase.
- La venta se solicita por WhatsApp, no hay pagos automáticos.
- Las fotos y catálogo permanecen en Render; no deben mostrarse precios mayoristas o fuentes de aprovisionamiento.
- Los 35 precios aprobados siguen visibles; otros 15 muestran "Consultar precio".
- Si un usuario pierde su app autenticadora, habrá que definir un procedimiento seguro de recuperación para clientes.
