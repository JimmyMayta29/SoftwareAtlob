import assert from 'node:assert';
import { db } from '../config/database';
import { asientoService } from '../services/asientoService';
import { anexoService } from '../services/anexoService';
import { asientoInputSchema, detalleInputSchema } from '../controllers/asientoController';

async function main() {
  console.log('========================================================================');
  console.log('🧪 PRUEBA ESPECÍFICA: VOUCHER LIBRE, VALIDACIÓN ZOD Y SUBDIARIOS');
  console.log('========================================================================\n');

  // Test 1: Validación Zod de payload flexible proveniente del frontend
  console.log('--- 1. Validación Zod de payload con alias tradicionales del frontend ---');
  const payloadFrontend = {
    subdiario: '01',
    periodo: '2026-01',
    fechaContable: '2026-01-15',
    glosaGeneral: 'Por la compra de suministros varios de oficina',
    tipoCambio: 0, // Llega en 0 cuando no cargó TC
    detalles: [
      {
        cuentaCodigo: '6032',
        debe: 500,
        haber: 0,
        anexoNumDoc: '20100070970',
        tipoComprobante: '01',
        serieComprobante: 'F001',
        numeroComprobante: '000123'
      },
      {
        cuentaCodigo: '40111',
        debe: 90,
        haber: 0
      },
      {
        cuentaCodigo: '4212',
        debe: 0,
        haber: 590,
        anexoNumDoc: '20100070970',
        tipoComprobante: '01',
        serieComprobante: 'F001',
        numeroComprobante: '000123'
      }
    ]
  };

  const parsed = await asientoInputSchema.parseAsync(payloadFrontend);
  assert.strictEqual(parsed.subdiarioId, '01', 'Debe normalizar subdiario a subdiarioId');
  assert.strictEqual(parsed.periodoId, '2026-01', 'Debe normalizar periodo a periodoId');
  assert.strictEqual(parsed.fecha, '2026-01-15', 'Debe normalizar fechaContable a fecha');
  assert.strictEqual(parsed.glosa, 'Por la compra de suministros varios de oficina', 'Debe normalizar glosaGeneral a glosa');
  assert.strictEqual(parsed.tipoCambio, 1.0, 'Tipo de cambio 0 debe corregirse a default 1.0');
  assert.strictEqual(parsed.detalles.length, 3, 'Debe procesar 3 detalles');
  assert.strictEqual(parsed.detalles[0].linea, 1, 'Debe asignar línea consecutiva 1');
  assert.strictEqual(parsed.detalles[0].cuentaId, '6032', 'Debe asignar cuentaId desde cuentaCodigo');
  assert.strictEqual(parsed.detalles[1].linea, 2, 'Debe asignar línea consecutiva 2');
  assert.strictEqual(parsed.detalles[2].linea, 3, 'Debe asignar línea consecutiva 3');
  console.log('✅ Normalización y validación Zod aprobada sin errores.\n');

  // Test 2: Persistencia real en PostgreSQL de asiento creado como borrador
  console.log('--- 2. Persistencia en PostgreSQL de Asiento Borrador y Contabilización ---');
  const empresaId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000001';

  // Registrar anexo previo si no existe
  let anexo = await anexoService.obtenerPorDocumento(empresaId, '20100070970');
  if (!anexo) {
    anexo = await anexoService.crear(empresaId, {
      tipoDocumento: '6',
      numeroDocumento: '20100070970',
      razonSocial: 'SUPERMERCADOS PERUANOS S.A.',
      tipoEntidad: 'PROVEEDOR'
    });
  }
  assert.ok(anexo, 'El anexo debe existir en la base de datos');

  const nuevoBorrador = await asientoService.crearBorrador(empresaId, parsed as any, userId);
  assert.ok(nuevoBorrador.id, 'El asiento borrador debe tener ID generado');
  assert.strictEqual(nuevoBorrador.estado, 'BORRADOR', 'El estado inicial debe ser BORRADOR');
  assert.strictEqual(nuevoBorrador.totalDebe, 590, 'El total Debe debe ser 590.00');
  assert.strictEqual(nuevoBorrador.totalHaber, 590, 'El total Haber debe ser 590.00');
  console.log(`✅ Asiento borrador ${nuevoBorrador.id} guardado correctamente en PostgreSQL.`);

  // Contabilizar asiento
  const contabilizado = await asientoService.contabilizar(nuevoBorrador.id, empresaId, userId);
  assert.ok(contabilizado.numero, 'El asiento contabilizado debe tener número');
  assert.strictEqual(contabilizado.estado, 'CONTABILIZADO', 'El estado debe cambiar a CONTABILIZADO');
  console.log(`✅ Asiento contabilizado formalmente con correlativo N° ${contabilizado.numero}.\n`);

  // Test 3: Listado de asientos con límite ampliado (hasta 1000) e integridad de códigos de subdiarios
  console.log('--- 3. Verificación de Listado de Asientos y Conteo por Subdiario ---');
  const listado = await asientoService.listar(empresaId, { limit: 1000 });
  assert.ok(listado.data.length > 0, 'El listado debe devolver registros');
  assert.ok(listado.limit >= 1000, 'El límite de paginación debe soportar 1000 registros');

  // Verificar que cada fila tiene subdiarioCodigo y subdiario
  for (const item of listado.data) {
    assert.ok(item.subdiarioCodigo, `El asiento ${item.id} debe incluir subdiarioCodigo`);
    assert.ok((item as any).subdiario, `El asiento ${item.id} debe incluir subdiario`);
  }

  // Comprobar mapa de conteos por subdiario
  const mapaConteo: Record<string, number> = {};
  for (const a of listado.data) {
    const cod = ((a as any).subdiarioCodigo || (a as any).subdiario || a.subdiarioId || '').replace(/^sub-/, '').padStart(2, '0');
    mapaConteo[cod] = (mapaConteo[cod] || 0) + 1;
  }

  console.log('Conteo real de asientos por subdiario en PostgreSQL:');
  for (const [subd, cant] of Object.entries(mapaConteo)) {
    console.log(`  Subdiario ${subd}: ${cant} asiento(s)`);
  }
  assert.ok(Object.keys(mapaConteo).length >= 1, 'Debe haber asientos contabilizados en sus respectivos subdiarios');
  console.log('✅ Integridad de códigos y conteos de subdiarios verificada con éxito.\n');

  console.log('========================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE VOUCHER LIBRE Y SUBDIARIOS PASARON CON ÉXITO');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('❌ Error en prueba:', err);
  process.exit(1);
});
