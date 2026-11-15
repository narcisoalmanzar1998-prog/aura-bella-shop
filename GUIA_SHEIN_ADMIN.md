# Aura Bella Shop — Integración de ropa SHEIN (noviembre 2026)

## Estado y alcance

- La tienda conserva los 100 perfumes, su carrito y su inicio de sesión.
- La ropa está organizada en Hombre, Mujer y Niños.
- Los artículos SHEIN provienen **solo de importaciones autorizadas** en CSV/JSON o de ingreso manual con permisos comprobados.
- **No existe una sincronización en tiempo real activa con SHEIN**: requiere acceso autorizado a una API o feed apto para revender en un sitio externo. La plataforma OpenAPI de SHEIN se centra en gestión de vendedores de SHEIN: https://openapi-portal.sheincorp.com/.
- No se permite copiar imágenes o descripciones sin derechos. El panel exige declaraciones de autorización y las almacena privadamente.
- El aviso de «envío mediante Estados Unidos» y «17 días» **solo puede acompañar productos cuyo canal y plazo hayan sido confirmados por la tienda**.

## Precios

Las fórmulas SHEIN son distintas de los perfumes:

- Tasa fija: 1 USD = 65 RD$.
- Ganancia fija inicial: RD$1,000 por unidad (editable por el administrador).
- Envío inicial: RD$100 por unidad (editable por el administrador).
- Precio venta = redondear(costo SHEIN USD × 65 + ganancia), al peso dominicano.
- Total unitario = precio venta + envío.
- Total de N unidades = suma(precio de cada variante × unidades) + suma(envío unitario × unidades). Sin descuento de envío automático.

El cálculo ocurre **en Supabase**, no en el código público. Solo se publica el precio de venta, envío y total en RD$. Costo USD, tasas internas y ganancias no se muestran a clientes. La tasa 65 es fija.

Ejemplo: US$10 → RD$1,650 producto + RD$100 envío = RD$1,750 total.

## Seguridad y administración

Panel: \`https://aura-bella-shop.onrender.com/admin.html\`

Inicia sesión en la tienda y completa Google Authenticator **antes** de abrir el panel. La autorización está limitada a la cuenta administradora registrada en la base de datos. La interfaz no confiere permisos: las funciones SQL verifican la identidad y AAL2 de forma independiente.

Los costos en dólares se almacenan en esquema privado y se consultan mediante funciones administrativas restringidas. El catálogo público se almacena en otra tabla y no contiene costos, ganancias ni enlaces privados a las ofertas.

## Cómo importar

Descarga la plantilla CSV desde el panel. **Una fila = una variante SKU** (combinación de talla y color).

Encabezados obligatorios:

\`\`\`csv
sku,source_product_id,category,title,brand,description,color,size,cost_usd,source_url,image_url,available,enabled,source_authorized,image_rights_ok,via_usa_confirmed,eta_17_confirmed,verified_at
\`\`\`

- \`category\`: \`hombre\`, \`mujer\` o \`ninos\`.
- \`cost_usd\`: valor validado en USD para esa variante exacta; máximo 2 decimales.
- \`source_url\`: página del producto en un dominio \`shein.com\`.
- \`image_url\`: archivo HTTPS del que se dispone derecho de uso comercial.
- \`available\`: existencias confirmadas.
- \`enabled\`: activo en la tienda.
- \`source_authorized\`: permiso para usar los datos del producto en el comercio propio.
- \`image_rights_ok\`: autorización comercial de la imagen.
- \`via_usa_confirmed\`: comprobación de que **tu operación** efectivamente despacha desde Estados Unidos.
- \`eta_17_confirmed\`: comprobación del plazo estimado de 17 días.
- \`verified_at\`: instante real en que se comprobó la oferta, en formato ISO 8601 y zona horaria incluida.

Un producto se muestra al público **solo si todas las verificaciones son positivas, está disponible y habilitado, y la oferta se comprobó en los últimos 14 días**. Esto evita publicar como actuales ofertas antiguas.

Para sincronizar, vuelve a importar un archivo con los mismos SKU y los datos verificados recientemente. El sistema evita duplicados por SKU, actualiza disponibilidad y recalcula los precios. Puedes exportar el inventario privado, editarlo y volver a importarlo.

**Nunca publiques en GitHub los CSV de costo**, ni credenciales, claves secretas, ni capturas de ofertas que incluyan información privada.

## Compra y carrito

1. El cliente elige la talla y el color.
2. El artículo muestra precio RD$, envío por unidad y total.
3. En «Pedir por WhatsApp», aparece el aviso de 17 días y el envío por unidad. Debe marcar la aceptación.
4. Se abre WhatsApp +1 809-899-2529 con producto, color, talla, cantidad, precio, envío, total, enlace de la página propia y aceptación.
5. Para agregar artículos al carrito guardado, debe iniciar sesión con Supabase y completar el segundo factor TOTP (Google Authenticator).
6. El carrito admite **perfumes y ropa** sin aplicar el costo SHEIN a los perfumes.

No se cobra automáticamente ni se coloca una orden real ante SHEIN: WhatsApp inicia una **solicitud de pedido** para confirmación humana.

## Próximo paso: automatización de catálogo

Se requiere un convenio o feed autorizado de SHEIN que conceda explícitamente el derecho de reutilizar datos de producto en tiendas externas. Con credenciales válidas se podrá conectar un proceso servidor seguro que transforme el feed en el esquema documentado. **No implementar scraping ni guardar secretos en el navegador o GitHub.**
