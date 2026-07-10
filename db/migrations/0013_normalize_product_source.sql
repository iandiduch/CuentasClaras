-- Normaliza el enum shopping_product_source a sus dos valores canónicos:
-- 'catalog' (producto traído de la API de catálogo de precios configurada
-- por PRICE_CATALOG_BASE_URL) y 'manual' (ítem libre cargado a mano).
-- Bases provisionadas con un esquema anterior pueden tener otro nombre para
-- el valor de catálogo; acá se renombra in-place, lo que actualiza también
-- todas las filas existentes. Idempotente: si solo existen los valores
-- canónicos no hace nada.
DO $$
DECLARE
  legacy_value text;
BEGIN
  FOR legacy_value IN
    SELECT unnest(enum_range(NULL::shopping_product_source))::text
  LOOP
    IF legacy_value NOT IN ('catalog', 'manual') THEN
      EXECUTE format(
        'ALTER TYPE shopping_product_source RENAME VALUE %L TO %L',
        legacy_value,
        'catalog'
      );
    END IF;
  END LOOP;
END $$;
