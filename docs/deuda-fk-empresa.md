# Deuda técnica de llaves foráneas compuestas por empresa (`fk_empresa_*`)

## 1. Situación actual en bases reales

En el esquema actual de PostgreSQL (inspeccionado sobre `atlob_test` con **25 migraciones aplicadas**, antes de Fase 22), existen **34 tablas hijas** y **76 llaves foráneas (FKs) de 1 columna** entre tablas pertenecientes a empresa (`padre <> 'empresas'`), que referencian únicamente `(id)` en la tabla destino en lugar de `(empresa_id, id)`.

Los 8 scripts de endurecimiento diseñados para convertir estas relaciones en FKs compuestas por empresa:

- `server/db/fk_empresa_01_contabilidad.sql`
- `server/db/fk_empresa_02_comprobantes.sql`
- `server/db/fk_empresa_03_cartera.sql`
- `server/db/fk_empresa_04_tesoreria.sql`
- `server/db/fk_empresa_05_planillas.sql`
- `server/db/fk_empresa_06_tributos.sql`
- `server/db/fk_empresa_07_sire.sql`
- `server/db/fk_empresa_08_kardex.sql`

**NO están incluidos en `MIGRATION_FILES`** (`server/db/migration-files.ts`). Actualmente solo se ejecutan de forma transaccional y se revierten con `ROLLBACK` dentro de `server/tests/real/test_pg_seguridad.ts` (apoyándose en `server/tests/real/test_pg_fk_empresa.ts`).

Consecuencias verificadas en catálogo real (`pg_constraint`) antes de Fase 22:

1. **Ninguna** de las tablas padre involucradas tiene aplicada en base real la restricción `UNIQUE (empresa_id, id)` (`*_empresa_id_id_key`).
2. Las 76 FKs de 1 columna siguen activas sin protección compuesta `(empresa_id, id)` en el motor (aunque RLS con `ENABLE` + `FORCE` y las validaciones de aplicación mitiguen el cruce entre empresas en sesión normal).
3. Dos tablas hijas sin columna `empresa_id` propia (`reglas_contabilizacion_detalle` y `planilla_lineas`) aún dependen de `fk_empresa_01_contabilidad.sql` y `fk_empresa_05_planillas.sql` para incorporar `empresa_id` y su trigger de propagación.
4. A partir de Fase 22 (`schema_fase22_conciliacion_v2_base.sql`), las nuevas FKs entre tablas de empresa nacen directamente compuestas: `cuentas_financieras_cuenta_contable_id_fkey` (`(empresa_id, cuenta_contable_id)` → `plan_cuentas(empresa_id, id)` con `uq_plan_cuentas_empresa_id_id`), elevando el total diagnosticado por `server/db/diagnosticoFkEmpresa.ts` de **76** a **77** relaciones.

---

## 2. Inventario exacto antes de Fase 22 (34 tablas hijas / 76 FKs)

Inspección directa en `atlob_test` (25 migraciones, previo a `schema_fase22_conciliacion_v2_base.sql`):

| Script `fk_empresa_*` fuera de `MIGRATION_FILES` | Tabla hija | Cantidad | Restricciones y destino actual de 1 columna (sin protección compuesta real) |
|---|---|---:|---|
| `fk_empresa_01_contabilidad.sql` | `asiento_detalle` | 4 | `asiento_detalle_anexo_id_fkey`: `anexo_id` -> `anexos(id)` (`RESTRICT`); `asiento_detalle_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`CASCADE`); `asiento_detalle_centro_costo_id_fkey`: `centro_costo_id` -> `centros_costo(id)` (`NO ACTION`); `asiento_detalle_cuenta_id_fkey`: `cuenta_id` -> `plan_cuentas(id)` (`RESTRICT`) |
| `fk_empresa_01_contabilidad.sql` | `asientos` | 3 | `asientos_asiento_extorno_id_fkey`: `asiento_extorno_id` -> `asientos(id)` (`NO ACTION`); `asientos_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`RESTRICT`); `asientos_subdiario_id_fkey`: `subdiario_id` -> `subdiarios(id)` (`RESTRICT`) |
| `fk_empresa_01_contabilidad.sql` | `correlativos` | 2 | `correlativos_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`CASCADE`); `correlativos_subdiario_id_fkey`: `subdiario_id` -> `subdiarios(id)` (`CASCADE`) |
| `fk_empresa_01_contabilidad.sql` | `periodos` | 1 | `periodos_ejercicio_id_fkey`: `ejercicio_id` -> `ejercicios(id)` (`CASCADE`) |
| `fk_empresa_01_contabilidad.sql` | `reglas_contabilizacion_detalle` *(sin columna `empresa_id`)* | 1 | `reglas_contabilizacion_detalle_regla_id_fkey`: `regla_id` -> `reglas_contabilizacion(id)` (`CASCADE`) |
| `fk_empresa_01_contabilidad.sql` | `saldos_mensuales` | 1 | `saldos_mensuales_anexo_id_fkey`: `anexo_id` -> `anexos(id)` (`SET NULL`) |
| `fk_empresa_02_comprobantes.sql` | `comprobantes_compra` | 4 | `comprobantes_compra_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `comprobantes_compra_documento_modificado_id_fkey`: `documento_modificado_id` -> `comprobantes_compra(id)` (`NO ACTION`); `comprobantes_compra_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`RESTRICT`); `comprobantes_compra_proveedor_id_fkey`: `proveedor_id` -> `anexos(id)` (`RESTRICT`) |
| `fk_empresa_02_comprobantes.sql` | `comprobantes_venta` | 4 | `comprobantes_venta_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `comprobantes_venta_cliente_id_fkey`: `cliente_id` -> `anexos(id)` (`RESTRICT`); `comprobantes_venta_documento_modificado_id_fkey`: `documento_modificado_id` -> `comprobantes_venta(id)` (`NO ACTION`); `comprobantes_venta_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`RESTRICT`) |
| `fk_empresa_03_cartera.sql` | `aplicaciones_cobranza` | 2 | `aplicaciones_cobranza_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `aplicaciones_cobranza_cuenta_por_cobrar_id_fkey`: `cuenta_por_cobrar_id` -> `cuentas_por_cobrar(id)` (`CASCADE`) |
| `fk_empresa_03_cartera.sql` | `aplicaciones_pago` | 2 | `aplicaciones_pago_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `aplicaciones_pago_cuenta_por_pagar_id_fkey`: `cuenta_por_pagar_id` -> `cuentas_por_pagar(id)` (`CASCADE`) |
| `fk_empresa_03_cartera.sql` | `cuentas_por_cobrar` | 2 | `cuentas_por_cobrar_cliente_id_fkey`: `cliente_id` -> `anexos(id)` (`RESTRICT`); `cuentas_por_cobrar_comprobante_id_fkey`: `comprobante_id` -> `comprobantes_venta(id)` (`CASCADE`) |
| `fk_empresa_03_cartera.sql` | `cuentas_por_pagar` | 2 | `cuentas_por_pagar_comprobante_id_fkey`: `comprobante_id` -> `comprobantes_compra(id)` (`CASCADE`); `cuentas_por_pagar_proveedor_id_fkey`: `proveedor_id` -> `anexos(id)` (`RESTRICT`) |
| `fk_empresa_04_tesoreria.sql` | `cajas_chicas` | 2 | `cajas_chicas_cuenta_financiera_id_fkey`: `cuenta_financiera_id` -> `cuentas_financieras(id)` (`NO ACTION`); `cajas_chicas_responsable_anexo_id_fkey`: `responsable_anexo_id` -> `anexos(id)` (`NO ACTION`) |
| `fk_empresa_04_tesoreria.sql` | `conciliaciones_bancarias` | 2 | `conciliaciones_bancarias_cuenta_financiera_id_fkey`: `cuenta_financiera_id` -> `cuentas_financieras(id)` (`RESTRICT`); `conciliaciones_bancarias_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`NO ACTION`) |
| `fk_empresa_04_tesoreria.sql` | `extracto_lineas` | 2 | `extracto_lineas_extracto_id_fkey`: `extracto_id` -> `extractos_bancarios(id)` (`CASCADE`); `extracto_lineas_movimiento_tesoreria_id_fkey`: `movimiento_tesoreria_id` -> `movimientos_tesoreria(id)` (`SET NULL`) |
| `fk_empresa_04_tesoreria.sql` | `extractos_bancarios` | 1 | `extractos_bancarios_cuenta_financiera_id_fkey`: `cuenta_financiera_id` -> `cuentas_financieras(id)` (`CASCADE`) |
| `fk_empresa_04_tesoreria.sql` | `movimientos_tesoreria` | 4 | `movimientos_tesoreria_anexo_id_fkey`: `anexo_id` -> `anexos(id)` (`NO ACTION`); `movimientos_tesoreria_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `movimientos_tesoreria_cuenta_financiera_id_fkey`: `cuenta_financiera_id` -> `cuentas_financieras(id)` (`RESTRICT`); `movimientos_tesoreria_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`NO ACTION`) |
| `fk_empresa_04_tesoreria.sql` | `rendiciones_caja_chica` | 3 | `rendiciones_caja_chica_asiento_reposicion_id_fkey`: `asiento_reposicion_id` -> `asientos(id)` (`NO ACTION`); `rendiciones_caja_chica_caja_chica_id_fkey`: `caja_chica_id` -> `cajas_chicas(id)` (`CASCADE`); `rendiciones_caja_chica_movimiento_reposicion_id_fkey`: `movimiento_reposicion_id` -> `movimientos_tesoreria(id)` (`NO ACTION`) |
| `fk_empresa_04_tesoreria.sql` | `transferencias_cuentas` | 6 | `transferencias_cuentas_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `transferencias_cuentas_cuenta_destino_id_fkey`: `cuenta_destino_id` -> `cuentas_financieras(id)` (`RESTRICT`); `transferencias_cuentas_cuenta_origen_id_fkey`: `cuenta_origen_id` -> `cuentas_financieras(id)` (`RESTRICT`); `transferencias_cuentas_movimiento_destino_id_fkey`: `movimiento_destino_id` -> `movimientos_tesoreria(id)` (`NO ACTION`); `transferencias_cuentas_movimiento_origen_id_fkey`: `movimiento_origen_id` -> `movimientos_tesoreria(id)` (`NO ACTION`); `transferencias_cuentas_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`NO ACTION`) |
| `fk_empresa_05_planillas.sql` | `liquidaciones_beneficios` | 2 | `liquidaciones_beneficios_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`SET NULL`); `liquidaciones_beneficios_trabajador_id_fkey`: `trabajador_id` -> `trabajadores(id)` (`CASCADE`) |
| `fk_empresa_05_planillas.sql` | `planilla_cts` | 2 | `planilla_cts_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`SET NULL`); `planilla_cts_trabajador_id_fkey`: `trabajador_id` -> `trabajadores(id)` (`CASCADE`) |
| `fk_empresa_05_planillas.sql` | `planilla_gratificaciones` | 2 | `planilla_gratificaciones_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`SET NULL`); `planilla_gratificaciones_trabajador_id_fkey`: `trabajador_id` -> `trabajadores(id)` (`CASCADE`) |
| `fk_empresa_05_planillas.sql` | `planilla_lineas` *(sin columna `empresa_id`)* | 2 | `planilla_lineas_planilla_id_fkey`: `planilla_id` -> `planillas(id)` (`CASCADE`); `planilla_lineas_trabajador_id_fkey`: `trabajador_id` -> `trabajadores(id)` (`RESTRICT`) |
| `fk_empresa_05_planillas.sql` | `planillas` | 3 | `planillas_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `planillas_asiento_pago_id_fkey`: `asiento_pago_id` -> `asientos(id)` (`NO ACTION`); `planillas_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`NO ACTION`) |
| `fk_empresa_05_planillas.sql` | `provisiones_sociales` | 3 | `provisiones_sociales_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `provisiones_sociales_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`NO ACTION`); `provisiones_sociales_trabajador_id_fkey`: `trabajador_id` -> `trabajadores(id)` (`CASCADE`) |
| `fk_empresa_05_planillas.sql` | `tregistro_movimientos` | 1 | `tregistro_movimientos_trabajador_id_fkey`: `trabajador_id` -> `trabajadores(id)` (`CASCADE`) |
| `fk_empresa_06_tributos.sql` | `declaraciones_pdt621` | 2 | `declaraciones_pdt621_asiento_determinacion_id_fkey`: `asiento_determinacion_id` -> `asientos(id)` (`SET NULL`); `declaraciones_pdt621_declaracion_anterior_id_fkey`: `declaracion_anterior_id` -> `declaraciones_pdt621(id)` (`SET NULL`) |
| `fk_empresa_06_tributos.sql` | `declaraciones_prorrata_igv` | 1 | `declaraciones_prorrata_igv_asiento_ajuste_id_fkey`: `asiento_ajuste_id` -> `asientos(id)` (`SET NULL`) |
| `fk_empresa_06_tributos.sql` | `recibos_honorarios` | 4 | `recibos_honorarios_asiento_id_fkey`: `asiento_id` -> `asientos(id)` (`NO ACTION`); `recibos_honorarios_cuenta_por_pagar_id_fkey`: `cuenta_por_pagar_id` -> `cuentas_por_pagar(id)` (`SET NULL`); `recibos_honorarios_periodo_id_fkey`: `periodo_id` -> `periodos(id)` (`NO ACTION`); `recibos_honorarios_proveedor_id_fkey`: `proveedor_id` -> `anexos(id)` (`NO ACTION`) |
| `fk_empresa_06_tributos.sql` | `retenciones_percepciones_igv` | 1 | `retenciones_percepciones_igv_anexo_id_fkey`: `anexo_id` -> `anexos(id)` (`RESTRICT`) |
| `fk_empresa_07_sire.sql` | `sire_conciliacion_lineas` | 2 | `sire_conciliacion_lineas_conciliacion_id_fkey`: `conciliacion_id` -> `sire_conciliaciones(id)` (`CASCADE`); `sire_conciliacion_lineas_linea_propuesta_id_fkey`: `linea_propuesta_id` -> `sire_propuesta_lineas(id)` (`NO ACTION`) |
| `fk_empresa_07_sire.sql` | `sire_conciliaciones` | 1 | `sire_conciliaciones_propuesta_id_fkey`: `propuesta_id` -> `sire_propuestas(id)` (`CASCADE`) |
| `fk_empresa_07_sire.sql` | `sire_propuesta_lineas` | 1 | `sire_propuesta_lineas_propuesta_id_fkey`: `propuesta_id` -> `sire_propuestas(id)` (`CASCADE`) |
| `fk_empresa_08_kardex.sql` | `movimientos_kardex` | 1 | `movimientos_kardex_producto_id_fkey`: `producto_id` -> `articulos_kardex(id)` (`CASCADE`) |

**Totales por módulo (`fk_empresa_01` a `08`):**

- `01_contabilidad`: 6 tablas / 12 FKs
- `02_comprobantes`: 2 tablas / 8 FKs
- `03_cartera`: 4 tablas / 8 FKs
- `04_tesoreria`: 7 tablas / 20 FKs *(Fase 22 agrega 1 FK ya compuesta en `cuentas_financieras`)*
- `05_planillas`: 7 tablas / 15 FKs
- `06_tributos`: 4 tablas / 8 FKs
- `07_sire`: 3 tablas / 4 FKs
- `08_kardex`: 1 tabla / 1 FK
- **Total antes de Fase 22:** **34 tablas hijas / 76 FKs simples**.

*(Nota: si en el futuro se incorporan `fk_empresa_01..08.sql` a `MIGRATION_FILES`, deberán hacerse idempotentes en ese momento para convivir sin colisiones con restricciones creadas por migraciones aditivas como `uq_plan_cuentas_empresa_id_id`.)*

---

## 3. Regla nueva para migraciones futuras (Fases 2 a 6)

Toda nueva migración (Fases 2 a 6 del módulo de Conciliación Bancaria V2 y cualquier otro módulo) que cree una llave foránea compuesta `(empresa_id, <col_fk>)` hacia `<tabla_destino>(empresa_id, id)` **debe seguir obligatoriamente esta regla**:

1. **Verificar en catálogo real (`pg_constraint`)** antes de redactar la migración si ya existe una restricción `UNIQUE (empresa_id, id)` en `<tabla_destino>`.
2. **Si no existe**, crearla de forma condicional (`IF NOT EXISTS`) dentro de la propia migración usando un nombre propio siguiendo la convención `uq_<tabla>_empresa_id_id` (por ejemplo: `uq_movimientos_tesoreria_empresa_id_id`, `uq_extracto_lineas_empresa_id_id`, `uq_conciliaciones_bancarias_empresa_id_id`, etc.).
3. **No asumir nunca ningún `fk_empresa_*.sql`** ni nombres como `<tabla>_empresa_id_id_key`, ya que esos scripts están fuera de `MIGRATION_FILES`.
4. Si la FK compuesta utiliza `ON DELETE SET NULL (<col_fk>)`, documentar explícitamente la **versión mínima de PostgreSQL = 15** en cabecera y `COMMENT ON CONSTRAINT` / `COMMENT ON COLUMN`.

Patrón de referencia idempotente:

```sql
DO $uq_destino$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.<tabla_destino>'::regclass
           AND conname = 'uq_<tabla_destino>_empresa_id_id'
    ) THEN
        ALTER TABLE public.<tabla_destino>
            ADD CONSTRAINT uq_<tabla_destino>_empresa_id_id UNIQUE (empresa_id, id);
    END IF;
END;
$uq_destino$;
```

---

## 4. Nota informativa sobre `public.pcge_base`

- El catálogo `public.pcge_base` en PostgreSQL contiene **1,629 registros** (cargados por `schema_fase13_pcge_completo.sql`).
- Respecto al **PCGE 2019 modificado**, `public.pcge_base` **carece de las divisionarias `772` / `7721`–`7725`** (Rendimientos ganados). Sí contiene, entre otras cuentas financieras, `6391` (*Gastos bancarios*), `6412` (*Impuesto a las transacciones financieras*), `67311` (*Instituciones financieras*) y `7793` (*Otros ingresos financieros*).
- **Alcance estrictamente informativo:** no modificar `public.pcge_base` ni ejecutar cargas sobre ella durante las fases de Conciliación Bancaria V2. Por esta razón, `conciliacion_config_empresa.cuenta_interes_ingreso_codigo` se mantiene nullable sin `DEFAULT` en BD (en Fase 1 la UI puede sugerir `'7793'` sin persistirlo automáticamente hasta configuración explícita de cada empresa).
