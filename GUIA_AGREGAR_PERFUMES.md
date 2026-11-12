# Aura Bella Shop — Cómo agregar perfumes al catálogo

Última actualización: noviembre de 2026.

## Requisito obligatorio: notas olfativas

**Ningún perfume nuevo debe publicarse sin las tres capas de su pirámide olfativa y una fuente verificable.** La web oculta automáticamente las fichas incompletas y registra una advertencia en la consola del navegador.

Cada objeto dentro de `const perfumes=[...]` en `public/index.html` y `public/coleccion.html` debe contener:

```json
{
  "id": 51,
  "category": "Árabe",
  "name": "Nombre exacto del perfume",
  "brand": "Nombre de la marca",
  "audience": "Unisex",
  "concentration": "EDP",
  "size": 100,
  "photo": "images/nueva-foto.jpg",
  "notes": [
    ["Nota de salida 1", "Nota de salida 2"],
    ["Nota de corazón 1", "Nota de corazón 2"],
    ["Nota de fondo 1", "Nota de fondo 2"]
  ],
  "notes_source": "Marca (ficha oficial) o referencia olfativa consultada",
  "price": null
}
```

Nota: el fragmento es ilustrativo. Agregar los demás campos del catálogo original si corresponde; no copiar notas de ejemplo a perfumes reales.

## Checklist para cada nuevo perfume

1. Verificar **nombre exacto**, presentación, concentración y variante (EDT, EDP, Parfum, Extrait, Intense, etc.); no mezclar versiones.
2. Consultar la web del **fabricante**. Si la marca solo indica acordes, buscar una ficha olfativa especializada con pirámide claramente definida y documentar la procedencia.
3. Registrar **salida** (primer arreglo), **corazón** (segundo) y **fondo** (tercero) en `notes` como arreglos de textos en español; nunca dejar listas vacías o nulas.
4. Añadir `notes_source` con la fuente utilizada. Mantener una URL de referencia en notas editoriales privadas si se desea auditarla.
5. Añadir fotografía del frasco y verificar los derechos de uso comercial de esa imagen.
6. Calcular y aprobar el precio de venta en RD$. Los precios internos y costos mayoristas nunca deben incluirse en el repositorio público.
7. Asignar un **ID numérico nuevo y único** (el carrito Supabase admite ahora IDs superiores a 50).
8. Actualizar **ambas páginas**: `public/index.html` y `public/coleccion.html`, manteniendo el mismo conjunto de productos.
9. Probar **Ver fichas**, **Agregar al carrito** y **Pedir en WhatsApp**, conservando el número comercial +1 809-899-2529.

## Pautas de exactitud

- El listado de notas publicado describe la **versión de referencia**, no una garantía sobre composición química o una percepción uniforme de la fragancia.
- Algunas marcas no publican pirámides tradicionales y diferentes referencias discrepan. No inventar notas: investigar, registrar la fuente y verificar antes de publicar.
- No incluir links de Amazon, su ranking ni comparaciones de precios dentro de la tienda.
- Mantener el catálogo en español y el diseño de lujo negro, blanco y dorado.
