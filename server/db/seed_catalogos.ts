import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, type DatabaseService } from '../config/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCatalogosSeeds(client: Pick<DatabaseService, 'query'> = db) {
  if (!db.isPostgresConnected()) return;

  console.log('🌱 [Seeds] Insertando Catálogos Oficiales de SUNAT...');

  // 1. Tipos de Comprobante de Pago (Catálogo 01 SUNAT)
  // TODO: Validar vigencia con Anexo 8 Resolución de Superintendencia N° 000040-2022/SUNAT
  const comprobantes = [
    { cod: '01', desc: 'Factura Electrónica' },
    { cod: '03', desc: 'Boleta de Venta Electrónica' },
    { cod: '07', desc: 'Nota de Crédito Electrónica' },
    { cod: '08', desc: 'Nota de Débito Electrónica' },
    { cod: 'R1', desc: 'Recibo por Honorarios Electrónico' },
    { cod: '09', desc: 'Guía de Remisión Remitente' },
    { cod: '14', desc: 'Recibo por Servicios Públicos (Luz, Agua, Teléfono)' }
  ];

  for (const c of comprobantes) {
    await client.query(`
      INSERT INTO catalogos_sunat (tabla_sunat, codigo, descripcion, vigencia_desde)
      VALUES ('TIPO_COMPROBANTE', $1, $2, '2020-01-01')
      ON CONFLICT (tabla_sunat, codigo, vigencia_desde) DO NOTHING;
    `, [c.cod, c.desc]);
  }

  // 2. Bienes y Servicios Sujetos al Sistema de Detracciones (SPOT - Catálogo SUNAT)
  // TODO: Validar con Anexo 3 de la Resolución de Superintendencia N° 183-2004/SUNAT actualizada a 2026
  const detracciones = [
    { cod: '022', desc: 'Otros servicios empresariales', pct: 12.0 },
    { cod: '024', desc: 'Comisión mercantil', pct: 10.0 },
    { cod: '025', desc: 'Fabricación de bienes por encargo', pct: 10.0 },
    { cod: '020', desc: 'Mantenimiento y reparación de bienes muebles', pct: 12.0 },
    { cod: '037', desc: 'Demás servicios gravados con el IGV', pct: 12.0 },
    { cod: '019', desc: 'Arrendamiento de bienes muebles', pct: 10.0 },
    { cod: '030', desc: 'Contratos de construcción', pct: 4.0 },
    { cod: '021', desc: 'Movimiento de carga', pct: 10.0 }
  ];

  for (const d of detracciones) {
    await client.query(`
      INSERT INTO catalogos_sunat (tabla_sunat, codigo, descripcion, vigencia_desde, datos_extra)
      VALUES ('BIEN_DETRACCION', $1, $2, '2020-01-01', $3)
      ON CONFLICT (tabla_sunat, codigo, vigencia_desde) DO NOTHING;
    `, [d.cod, d.desc, JSON.stringify({ porcentaje: d.pct })]);
  }

  // 3. Motivos de Nota de Crédito (Catálogo 09 SUNAT)
  // TODO: Validar con Catálogo 09 vigente de Comprobantes de Pago Electrónicos
  const motivosNC = [
    { cod: '01', desc: 'Anulación de la operación' },
    { cod: '02', desc: 'Anulación por error en el RUC' },
    { cod: '03', desc: 'Corrección por error en la descripción' },
    { cod: '04', desc: 'Descuento global' },
    { cod: '05', desc: 'Descuento por ítem' },
    { cod: '06', desc: 'Devolución total' },
    { cod: '07', desc: 'Devolución por ítem' }
  ];

  for (const m of motivosNC) {
    await client.query(`
      INSERT INTO catalogos_sunat (tabla_sunat, codigo, descripcion, vigencia_desde)
      VALUES ('MOTIVO_NC', $1, $2, '2020-01-01')
      ON CONFLICT (tabla_sunat, codigo, vigencia_desde) DO NOTHING;
    `, [m.cod, m.desc]);
  }

  // 4. Catálogo Base Oficial PCGE 2026 Clasificado
  const rutaJson = path.join(__dirname, '../data/pcge_base_v2.json');
  if (fs.existsSync(rutaJson)) {
    const raw = fs.readFileSync(rutaJson, 'utf8');
    const { cuentas } = JSON.parse(raw);
    const BATCH_SIZE = 100;
    for (let i = 0; i < cuentas.length; i += BATCH_SIZE) {
      const batch = cuentas.slice(i, i + BATCH_SIZE);
      const values: any[] = [];
      const placeholders = batch.map((c: any, idx: number) => {
        const offset = idx * 13;
        values.push(
          c.codigo, c.denominacion, c.elemento, c.nivel, c.codigo_padre || null,
          c.tipo_cuenta, c.es_registro, c.clasificacion_eeff, c.naturaleza_saldo,
          c.signo_eeff, c.es_correctora, c.columna_hoja_trabajo, c.cuenta_cierre_relacionada || null
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
      }).join(', ');

      await client.query(`
        INSERT INTO pcge_base (
          codigo, denominacion, elemento, nivel, codigo_padre,
          tipo_cuenta, es_registro, clasificacion_eeff, naturaleza_saldo,
          signo_eeff, es_correctora, columna_hoja_trabajo, cuenta_cierre_relacionada
        ) VALUES ${placeholders}
        ON CONFLICT (codigo) DO UPDATE SET
          denominacion = EXCLUDED.denominacion,
          elemento = EXCLUDED.elemento,
          nivel = EXCLUDED.nivel,
          codigo_padre = EXCLUDED.codigo_padre,
          tipo_cuenta = EXCLUDED.tipo_cuenta,
          es_registro = EXCLUDED.es_registro,
          clasificacion_eeff = EXCLUDED.clasificacion_eeff,
          naturaleza_saldo = EXCLUDED.naturaleza_saldo,
          signo_eeff = EXCLUDED.signo_eeff,
          es_correctora = EXCLUDED.es_correctora,
          columna_hoja_trabajo = EXCLUDED.columna_hoja_trabajo,
          cuenta_cierre_relacionada = EXCLUDED.cuenta_cierre_relacionada;
      `, values);
    }
    console.log(`✅ [Seeds] Catálogo PCGE Base cargado (${cuentas.length} cuentas oficiales).`);
  }

  console.log('✅ [Seeds] Catálogos SUNAT y PCGE cargados exitosamente.');
}
