import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import express from 'express';
import { Pool, type PoolClient } from 'pg';
import type {
  PartidaBancoMatching,
  PartidaLibroMatching,
  ReglaAprendidaMatching,
} from '../services/conciliacion/matching/matchingEngine';

const soloUnitarias =
  process.argv.includes('--solo-unitarias') ||
  process.env.ATLOB_CONCILIACION_SOLO_UNITARIAS === '1';

let totalCasos = 0;
let casosPasados = 0;

async function ejecutarCaso(nombre: string, fn: () => void | Promise<void>) {
  totalCasos += 1;
  await fn();
  casosPasados += 1;
  console.log(`  ✅ PASÓ: ${nombre}`);
}

function resolverTestDatabaseUrl(): string {
  const localEnv = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
  const url = process.env.TEST_DATABASE_URL ?? localEnv.TEST_DATABASE_URL;
  assert.ok(
    url,
    'TEST_DATABASE_URL requerida en entorno o .env para ejecutar Bloque B en atlob_test.'
  );

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL no tiene un formato de URL válido.');
  }

  assert.ok(
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.username === 'contabilidad_app' &&
      parsed.pathname === '/atlob_test' &&
      [...parsed.searchParams.keys()].every((k) => k === 'sslmode'),
    `TEST_DATABASE_URL debe apuntar a /atlob_test local como usuario contabilidad_app (recibido: ${parsed.username}@${parsed.hostname}${parsed.pathname}).`
  );

  return url;
}

async function fijarContextoRls(client: PoolClient, empresaId: string, usuarioId = '') {
  await client.query(
    `SELECT set_config('app.empresa_id', $1, true),
            set_config('app.current_empresa_id', $1, true),
            set_config('app.usuario_id', $2, true),
            set_config('app.current_user_id', $2, true)`,
    [empresaId, usuarioId]
  );
}

async function queryEnEmpresa<T extends Record<string, any> = any>(
  pool: Pool,
  empresaId: string,
  usuarioId: string,
  sql: string,
  params: unknown[] = []
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fijarContextoRls(client, empresaId, usuarioId);
    const res = await client.query<T>(sql, params);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// BLOQUE A — PRUEBAS UNITARIAS PURAS (SIN POSTGRESQL)
// ============================================================================

async function ejecutarBloqueUnitario() {
  const { ejecutarMotorMatching } = await import(
    '../services/conciliacion/matching/matchingEngine'
  );

  console.log('\n====================================================================');
  console.log('🧪 BLOQUE A — UNITARIAS FASE 3 (MOTOR DE MATCHING 4 CAPAS)');
  console.log('====================================================================');

  await ejecutarCaso(
    'A1. Capa 1: N° operación con ceros a la izquierda + monto exacto + doc SUNAT 01-F001-000123 (incluyendo ASIENTO_MANUAL)',
    () => {
      const bancos: PartidaBancoMatching[] = [
        {
          id: 'b-op-exacta',
          fecha: '2026-10-10',
          monto: '-1250.00',
          referencia: 'OP-99881',
          descripcion: 'TRANSFERENCIA PROVEEDOR',
        },
        {
          id: 'b-ceros',
          fecha: '2026-10-11',
          monto: '3400.50',
          referencia: '0004567',
          descripcion: 'ABONO CLIENTE',
        },
        {
          id: 'b-doc',
          fecha: '2026-10-12',
          monto: '-500.00',
          referencia: null,
          descripcion: 'PAGO FACTURA F001-000123',
          docExtraido: 'F001-000123',
        },
      ];

      const libros: PartidaLibroMatching[] = [
        {
          id: 'l-op-exacta',
          origenLibro: 'MOVIMIENTO_TESORERIA',
          asientoId: 'as-1',
          asientoDetalleId: null,
          fecha: '2026-10-04',
          importeConSigno: '-1250.00',
          numeroOperacion: 'OP-99881',
          glosa: 'Pago transferencia',
        },
        {
          id: 'l-ceros',
          origenLibro: 'MOVIMIENTO_TESORERIA',
          asientoId: 'as-2',
          asientoDetalleId: null,
          fecha: '2026-10-11',
          importeConSigno: '3400.50',
          numeroOperacion: '4567',
          glosa: 'Cobranza cliente',
        },
        {
          id: 'l-doc',
          origenLibro: 'ASIENTO_MANUAL',
          asientoId: 'as-3',
          asientoDetalleId: 'l-doc',
          fecha: '2026-10-12',
          importeConSigno: '-500.00',
          numeroOperacion: null,
          docRef: '01-F001-000123',
          glosa: 'Asiento manual 10411',
        },
      ];

      const res = ejecutarMotorMatching({
        partidasBanco: bancos,
        partidasLibro: libros,
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
      });

      assert.equal(res.grupos.length, 3);
      assert.equal(res.estadisticas.autoConciliados, 3);
      assert.equal(res.estadisticas.sugeridos, 0);
      assert.equal(res.estadisticas.pendientesBancoRestantes, 0);
      assert.equal(res.estadisticas.pendientesLibroRestantes, 0);
      assert.equal(res.estadisticas.diferenciaPendiente, '0.00');

      for (const g of res.grupos) {
        assert.equal(g.capaMatching, 1);
        assert.equal(g.tipoMatch, '1:1');
        assert.equal(g.reglaAplicada, 'CAPA_1_OPERACION_MONTO');
        assert.equal(g.score, 1);
        assert.equal(g.estado, 'CONCILIADO');
        assert.equal(g.diferenciaMonto, '0.00');
      }

      const grupoDoc = res.grupos.find((g) => g.itemsBanco[0].partida.id === 'b-doc')!;
      assert.equal(grupoDoc.itemsLibro[0].partida.origenLibro, 'ASIENTO_MANUAL');
      assert.equal(grupoDoc.itemsLibro[0].partida.asientoDetalleId, 'l-doc');
    }
  );

  await ejecutarCaso(
    'A2. Montos duplicados ambiguos -> SUGERIDO sin auto-conciliar, salvo desempate por contraparte o regla aprendida',
    () => {
      // 1) Empate en Capa 1
      const resCapa1Ambiguo = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-c1',
            fecha: '2026-10-10',
            monto: '-200.00',
            referencia: 'OP-777',
            descripcion: 'PAGO OP-777',
          },
        ],
        partidasLibro: [
          {
            id: 'l-c1-1',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-1',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-200.00',
            numeroOperacion: 'OP-777',
            glosa: 'Pago 1',
          },
          {
            id: 'l-c1-2',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-2',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-200.00',
            numeroOperacion: 'OP-777',
            glosa: 'Pago 2',
          },
        ],
      });
      assert.equal(resCapa1Ambiguo.grupos.length, 1);
      assert.equal(resCapa1Ambiguo.grupos[0].capaMatching, 1);
      assert.equal(resCapa1Ambiguo.grupos[0].estado, 'SUGERIDO');
      assert.equal(resCapa1Ambiguo.grupos[0].reglaAplicada, 'CAPA_1_OPERACION_MONTO_AMBIGUO');
      assert.equal(resCapa1Ambiguo.estadisticas.autoConciliados, 0);

      // 2) Empate en Capa 2 por montos duplicados con misma contraparte -> SUGERIDO
      const resCapa2Ambiguo = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-dup-1',
            fecha: '2026-10-10',
            monto: '-100.00',
            referencia: null,
            descripcion: 'PAGO TELEFONIA MOVISTAR',
            contraparteExtraida: 'TELEFONIA MOVISTAR',
          },
          {
            id: 'b-dup-2',
            fecha: '2026-10-10',
            monto: '-100.00',
            referencia: null,
            descripcion: 'PAGO TELEFONIA MOVISTAR',
            contraparteExtraida: 'TELEFONIA MOVISTAR',
          },
        ],
        partidasLibro: [
          {
            id: 'l-dup-1',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a1',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-100.00',
            numeroOperacion: null,
            glosa: 'Pago telefonía movistar línea 1',
            anexoNombre: 'TELEFONIA MOVISTAR',
          },
          {
            id: 'l-dup-2',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a2',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-100.00',
            numeroOperacion: null,
            glosa: 'Pago telefonía movistar línea 2',
            anexoNombre: 'TELEFONIA MOVISTAR',
          },
        ],
      });
      assert.equal(resCapa2Ambiguo.grupos.length, 2);
      assert.equal(resCapa2Ambiguo.estadisticas.autoConciliados, 0);
      assert.equal(resCapa2Ambiguo.estadisticas.sugeridos, 2);
      for (const g of resCapa2Ambiguo.grupos) {
        assert.equal(g.capaMatching, 2);
        assert.equal(g.estado, 'SUGERIDO');
        assert.equal(g.reglaAplicada, 'CAPA_2_AMBIGUO_DUPLICADO');
      }

      // 3) Desempate por contraparte (RUC distinto) -> auto-concilia
      const resPorRuc = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-ruc-1',
            fecha: '2026-10-10',
            monto: '-100.00',
            referencia: null,
            descripcion: 'PAGO PROVEEDOR RUC 20111111111',
            rucExtraido: '20111111111',
          },
          {
            id: 'b-ruc-2',
            fecha: '2026-10-10',
            monto: '-100.00',
            referencia: null,
            descripcion: 'PAGO PROVEEDOR RUC 20222222222',
            rucExtraido: '20222222222',
          },
        ],
        partidasLibro: [
          {
            id: 'l-ruc-1',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a1',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-100.00',
            numeroOperacion: null,
            glosa: 'Pago servicios',
            anexoRuc: '20111111111',
          },
          {
            id: 'l-ruc-2',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a2',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-100.00',
            numeroOperacion: null,
            glosa: 'Pago servicios',
            anexoRuc: '20222222222',
          },
        ],
      });
      assert.equal(resPorRuc.estadisticas.autoConciliados, 2);
      assert.equal(resPorRuc.estadisticas.sugeridos, 0);

      // 4) Desempate por regla aprendida distinta para montos idénticos sin RUC
      const reglas: ReglaAprendidaMatching[] = [
        {
          id: 'regla-cloud',
          patronContraparte: 'CLOUD ANDES',
          rucContraparte: null,
          anexoId: 'anexo-cloud',
          usosConfirmados: 3,
          activo: true,
        },
        {
          id: 'regla-legal',
          patronContraparte: 'ESTUDIO LEGAL SUR',
          rucContraparte: null,
          anexoId: 'anexo-legal',
          usosConfirmados: 2,
          activo: true,
        },
      ];
      const resPorRegla = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-reg-1',
            fecha: '2026-10-15',
            monto: '-250.00',
            referencia: null,
            descripcion: 'CARGO SERVICIOS CLOUD ANDES',
            contraparteExtraida: 'CLOUD ANDES',
          },
          {
            id: 'b-reg-2',
            fecha: '2026-10-15',
            monto: '-250.00',
            referencia: null,
            descripcion: 'TRANSFERENCIA ESTUDIO LEGAL SUR',
            contraparteExtraida: 'ESTUDIO LEGAL SUR',
          },
        ],
        partidasLibro: [
          {
            id: 'l-reg-1',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-c',
            asientoDetalleId: null,
            fecha: '2026-10-15',
            importeConSigno: '-250.00',
            numeroOperacion: null,
            glosa: 'Suscripción mensual plataforma',
            anexoId: 'anexo-cloud',
            anexoNombre: 'PROVEEDOR TECNOLOGICO SAC',
          },
          {
            id: 'l-reg-2',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-l',
            asientoDetalleId: null,
            fecha: '2026-10-15',
            importeConSigno: '-250.00',
            numeroOperacion: null,
            glosa: 'Asesoría corporativa octubre',
            anexoId: 'anexo-legal',
            anexoNombre: 'ASESORES CORPORATIVOS SRL',
          },
        ],
        reglasAprendidas: reglas,
      });
      assert.equal(resPorRegla.estadisticas.autoConciliados, 2);
      assert.equal(resPorRegla.estadisticas.sugeridos, 0);
      assert.ok(
        resPorRegla.grupos.some(
          (g) =>
            g.itemsBanco[0].partida.id === 'b-reg-1' &&
            g.itemsLibro[0].partida.id === 'l-reg-1' &&
            g.capaMatching === 2
        )
      );
      assert.ok(
        resPorRegla.grupos.some(
          (g) =>
            g.itemsBanco[0].partida.id === 'b-reg-2' &&
            g.itemsLibro[0].partida.id === 'l-reg-2' &&
            g.capaMatching === 2
        )
      );
    }
  );

  await ejecutarCaso(
    'A3. Ventanas de fecha: toleranciaDias dentro vs fuera en Capa 1, Capa 2 y Capa 4',
    () => {
      // Capa 2: toleranciaDias = 3 => 3 días dentro (Capa 2 CONCILIADO), 4 días fuera de Capa 2 (pasa a Capa 4 SUGERIDO), 7 días fuera de Capa 4 (> 6 días)
      const dentroCapa2 = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-3d',
            fecha: '2026-10-10',
            monto: '-600.00',
            referencia: null,
            descripcion: 'PAGO RUC 20444555666 SUMINISTROS',
            rucExtraido: '20444555666',
          },
        ],
        partidasLibro: [
          {
            id: 'l-3d',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-3d',
            asientoDetalleId: null,
            fecha: '2026-10-13', // +3 días exactos
            importeConSigno: '-600.00',
            numeroOperacion: null,
            glosa: 'Suministros oficina',
            anexoRuc: '20444555666',
          },
        ],
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.9 },
      });
      assert.equal(dentroCapa2.grupos.length, 1);
      assert.equal(dentroCapa2.grupos[0].capaMatching, 2);
      assert.equal(dentroCapa2.grupos[0].estado, 'CONCILIADO');

      const fueraCapa2DentroCapa4 = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-4d',
            fecha: '2026-10-10',
            monto: '-600.00',
            referencia: null,
            descripcion: 'PAGO RUC 20444555666 SUMINISTROS',
            rucExtraido: '20444555666',
          },
        ],
        partidasLibro: [
          {
            id: 'l-4d',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-4d',
            asientoDetalleId: null,
            fecha: '2026-10-14', // +4 días: fuera de Capa 2 (>3), dentro de Capa 4 (<=6)
            importeConSigno: '-600.00',
            numeroOperacion: null,
            glosa: 'Suministros oficina',
            anexoRuc: '20444555666',
          },
        ],
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.9 },
      });
      assert.equal(fueraCapa2DentroCapa4.grupos.length, 1);
      assert.equal(fueraCapa2DentroCapa4.grupos[0].capaMatching, 4);
      assert.equal(fueraCapa2DentroCapa4.grupos[0].estado, 'SUGERIDO');

      const fueraTodasLasVentanas = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-7d',
            fecha: '2026-10-10',
            monto: '-600.00',
            referencia: null,
            descripcion: 'PAGO RUC 20444555666 SUMINISTROS',
            rucExtraido: '20444555666',
          },
        ],
        partidasLibro: [
          {
            id: 'l-7d',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-7d',
            asientoDetalleId: null,
            fecha: '2026-10-17', // +7 días: > 2 * 3 = 6 días
            importeConSigno: '-600.00',
            numeroOperacion: null,
            glosa: 'Suministros oficina',
            anexoRuc: '20444555666',
          },
        ],
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.9 },
      });
      assert.equal(fueraTodasLasVentanas.grupos.length, 0);
      assert.equal(fueraTodasLasVentanas.estadisticas.pendientesBancoRestantes, 1);
      assert.equal(fueraTodasLasVentanas.estadisticas.pendientesLibroRestantes, 1);

      // Capa 1 con referencia exacta: permitido hasta max(toleranciaDias, 7) días; 8 días queda fuera
      const capa1SieteDias = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-op7',
            fecha: '2026-10-10',
            monto: '-300.00',
            referencia: 'OP-5555',
            descripcion: 'TRANSF OP-5555',
          },
        ],
        partidasLibro: [
          {
            id: 'l-op7',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-op7',
            asientoDetalleId: null,
            fecha: '2026-10-17', // +7 días
            importeConSigno: '-300.00',
            numeroOperacion: 'OP-5555',
            glosa: 'Pago transferencia',
          },
        ],
        parametros: { toleranciaDias: 2 },
      });
      assert.equal(capa1SieteDias.grupos.length, 1);
      assert.equal(capa1SieteDias.grupos[0].capaMatching, 1);

      const capa1OchoDias = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-op8',
            fecha: '2026-10-10',
            monto: '-300.00',
            referencia: 'OP-5555',
            descripcion: 'TRANSF',
          },
        ],
        partidasLibro: [
          {
            id: 'l-op8',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-op8',
            asientoDetalleId: null,
            fecha: '2026-10-18', // +8 días (> 7 y > 2*2=4)
            importeConSigno: '-300.00',
            numeroOperacion: 'OP-5555',
            glosa: 'Otro concepto',
          },
        ],
        parametros: { toleranciaDias: 2 },
      });
      assert.equal(capa1OchoDias.grupos.length, 0);
    }
  );

  await ejecutarCaso(
    'A4. Capa 3 (1:N y N:1) con tolerancia de redondeo y precisión Money sin flotantes',
    () => {
      // 1:N exacto incluyendo decimales clásicos binarios (0.10 + 0.20 = 0.30) y distractor de signo opuesto
      const res1N = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-lote',
            fecha: '2026-10-15',
            monto: '1500.30',
            referencia: 'LOTE-01',
            descripcion: 'DEPOSITO CONSOLIDADO VENTAS POS',
          },
        ],
        partidasLibro: [
          {
            id: 'l-1',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a1',
            asientoDetalleId: null,
            fecha: '2026-10-14',
            importeConSigno: '500.10',
            numeroOperacion: 'V-01',
            glosa: 'Venta POS 1',
          },
          {
            id: 'l-2',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a2',
            asientoDetalleId: null,
            fecha: '2026-10-15',
            importeConSigno: '650.00',
            numeroOperacion: 'V-02',
            glosa: 'Venta POS 2',
          },
          {
            id: 'l-3',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a3',
            asientoDetalleId: null,
            fecha: '2026-10-15',
            importeConSigno: '350.20',
            numeroOperacion: 'V-03',
            glosa: 'Venta POS 3',
          },
          {
            id: 'l-distractor',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a4',
            asientoDetalleId: null,
            fecha: '2026-10-15',
            importeConSigno: '-1500.30',
            numeroOperacion: 'E-01',
            glosa: 'Egreso distractor',
          },
        ],
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
      });

      assert.equal(res1N.grupos.length, 1);
      assert.equal(res1N.grupos[0].capaMatching, 3);
      assert.equal(res1N.grupos[0].tipoMatch, '1:N');
      assert.equal(res1N.grupos[0].estado, 'CONCILIADO');
      assert.equal(res1N.grupos[0].itemsLibro.length, 3);
      assert.equal(res1N.grupos[0].diferenciaMonto, '0.00');

      // N:1 con tolerancia de redondeo (-0.03 dentro de 0.05)
      const resN1 = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-p1',
            fecha: '2026-10-20',
            monto: '-400.02',
            referencia: null,
            descripcion: 'CARGO PARCIAL 1',
          },
          {
            id: 'b-p2',
            fecha: '2026-10-21',
            monto: '-600.01',
            referencia: null,
            descripcion: 'CARGO PARCIAL 2',
          },
        ],
        partidasLibro: [
          {
            id: 'l-egreso-unico',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a5',
            asientoDetalleId: null,
            fecha: '2026-10-20',
            importeConSigno: '-1000.00',
            numeroOperacion: null,
            glosa: 'Pago consolidado proveedor',
          },
        ],
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.05', umbralAutoMatch: 0.9 },
      });

      assert.equal(resN1.grupos.length, 1);
      assert.equal(resN1.grupos[0].capaMatching, 3);
      assert.equal(resN1.grupos[0].tipoMatch, 'N:1');
      assert.equal(resN1.grupos[0].itemsBanco.length, 2);
      assert.equal(resN1.grupos[0].diferenciaMonto, '-0.03');

      // N:1 excediendo tolerancia (-0.06 > 0.05) -> NO debe emparejar en Capa 3
      const resExcede = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-ex1',
            fecha: '2026-10-20',
            monto: '-400.04',
            referencia: null,
            descripcion: 'CARGO 1',
          },
          {
            id: 'b-ex2',
            fecha: '2026-10-21',
            monto: '-600.02',
            referencia: null,
            descripcion: 'CARGO 2',
          },
        ],
        partidasLibro: [
          {
            id: 'l-ex',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a6',
            asientoDetalleId: null,
            fecha: '2026-10-20',
            importeConSigno: '-1000.00',
            numeroOperacion: null,
            glosa: 'Pago único',
          },
        ],
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.05' },
      });
      assert.equal(
        resExcede.grupos.filter((g) => g.capaMatching === 3).length,
        0,
        'Diferencia de 0.06 > 0.05 no debe conciliarse en Capa 3'
      );
    }
  );

  await ejecutarCaso(
    'A5. Capa 4 fuzzy determinista: >= umbralAutoMatch automático vs [0.60, umbralAutoMatch) sugerido vs < 0.60 manual',
    () => {
      const baseBanco: PartidaBancoMatching[] = [
        {
          id: 'b-fuzzy-alto',
          fecha: '2026-10-10',
          monto: '-850.00',
          referencia: null,
          descripcion: 'TRANSFERENCIA CONSULTORIA TECNOLOGICA ANDINA',
          contraparteExtraida: 'CONSULTORIA TECNOLOGICA ANDINA',
          rucExtraido: '20600112233',
        },
        {
          id: 'b-fuzzy-medio',
          fecha: '2026-10-10',
          monto: '-500.00',
          referencia: null,
          descripcion: 'PAGO MANTENIMIENTO EQUIPO OFICINA',
        },
        {
          id: 'b-sin-match',
          fecha: '2026-10-01',
          monto: '-900.00',
          referencia: null,
          descripcion: 'CARGO DESCONOCIDO MISCELANEO',
        },
      ];

      const baseLibro: PartidaLibroMatching[] = [
        {
          id: 'l-fuzzy-alto',
          origenLibro: 'MOVIMIENTO_TESORERIA',
          asientoId: 'a1',
          asientoDetalleId: null,
          fecha: '2026-10-14', // 4 días: fuera de Capa 2 (3d), dentro de Capa 4 (6d)
          importeConSigno: '-850.00',
          numeroOperacion: null,
          glosa: 'Honorarios consultoría tecnológica andina',
          anexoRuc: '20600112233',
          anexoNombre: 'CONSULTORIA TECNOLOGICA ANDINA SAC',
        },
        {
          id: 'l-fuzzy-medio',
          origenLibro: 'MOVIMIENTO_TESORERIA',
          asientoId: 'a2',
          asientoDetalleId: null,
          fecha: '2026-10-12',
          importeConSigno: '-498.00',
          numeroOperacion: null,
          glosa: 'Mantenimiento equipo oficina central',
        },
        {
          id: 'l-sin-match',
          origenLibro: 'MOVIMIENTO_TESORERIA',
          asientoId: 'a3',
          asientoDetalleId: null,
          fecha: '2026-10-07',
          importeConSigno: '-830.00', // score < 0.60 => queda pendiente manual
          numeroOperacion: null,
          glosa: 'Compra suministros almacén',
        },
      ];

      const resUmbral90 = ejecutarMotorMatching({
        partidasBanco: baseBanco,
        partidasLibro: baseLibro,
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.9 },
      });
      assert.equal(resUmbral90.grupos.length, 2);
      assert.equal(resUmbral90.estadisticas.autoConciliados, 0);
      assert.equal(resUmbral90.estadisticas.sugeridos, 2);
      assert.equal(resUmbral90.estadisticas.pendientesBancoRestantes, 1);
      assert.equal(resUmbral90.estadisticas.pendientesLibroRestantes, 1);

      const resUmbral80 = ejecutarMotorMatching({
        partidasBanco: baseBanco,
        partidasLibro: baseLibro,
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.8 },
      });
      const resUmbral80Invertido = ejecutarMotorMatching({
        partidasBanco: [...baseBanco].reverse(),
        partidasLibro: [...baseLibro].reverse(),
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.8 },
      });

      assert.deepEqual(resUmbral80, resUmbral80Invertido);
      const grupoAlto = resUmbral80.grupos.find(
        (g) => g.itemsBanco[0].partida.id === 'b-fuzzy-alto'
      )!;
      const grupoMedio = resUmbral80.grupos.find(
        (g) => g.itemsBanco[0].partida.id === 'b-fuzzy-medio'
      )!;
      assert.equal(grupoAlto.capaMatching, 4);
      assert.equal(grupoAlto.estado, 'CONCILIADO');
      assert.ok(grupoAlto.score >= 0.8);
      assert.equal(grupoMedio.capaMatching, 4);
      assert.equal(grupoMedio.estado, 'SUGERIDO');
      assert.ok(grupoMedio.score >= 0.6 && grupoMedio.score < 0.8);
      assert.equal(resUmbral80.estadisticas.pendientesBancoRestantes, 1);
      assert.equal(resUmbral80.estadisticas.pendientesLibroRestantes, 1);
    }
  );

  await ejecutarCaso(
    'A6. Rendimiento sobre 5,200 líneas (2,600 banco + 2,600 libro) < 2,000 ms y 100% reproducible en 2 corridas seguidas',
    () => {
      const bancos: PartidaBancoMatching[] = [];
      const libros: PartidaLibroMatching[] = [];

      for (let i = 0; i < 2600; i += 1) {
        const dia = String((i % 28) + 1).padStart(2, '0');
        const fecha = `2026-10-${dia}`;
        const centavos = 1000 + (i % 900) * 13 + Math.floor(i / 900);
        const montoStr = `${(centavos / 100).toFixed(2)}`;
        const signed = i % 3 === 0 ? montoStr : `-${montoStr}`;

        if (i < 1300) {
          bancos.push({
            id: `b-${i}`,
            fecha,
            monto: signed,
            referencia: `OP-${10000 + i}`,
            descripcion: `OPERACION ${i} EMPRESA ${i % 40}`,
          });
          libros.push({
            id: `l-${i}`,
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: `as-${i}`,
            asientoDetalleId: null,
            fecha,
            importeConSigno: signed,
            numeroOperacion: `OP-${10000 + i}`,
            glosa: `Movimiento ${i}`,
          });
        } else if (i < 2100) {
          const ruc = `205000${String(10000 + i).slice(-5)}`;
          bancos.push({
            id: `b-${i}`,
            fecha,
            monto: signed,
            referencia: null,
            descripcion: `TRANSF PROVEEDOR ${i} RUC ${ruc}`,
            rucExtraido: ruc,
          });
          libros.push({
            id: `l-${i}`,
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: `as-${i}`,
            asientoDetalleId: null,
            fecha,
            importeConSigno: signed,
            numeroOperacion: null,
            glosa: `Pago proveedor ${i}`,
            anexoRuc: ruc,
          });
        } else {
          bancos.push({
            id: `b-${i}`,
            fecha,
            monto: signed,
            referencia: null,
            descripcion: `CARGO BANCO VARIOS ${i}`,
          });
          libros.push({
            id: `l-${i}`,
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: `as-${i}`,
            asientoDetalleId: null,
            fecha,
            importeConSigno: `${((centavos + 77) / 100).toFixed(2)}`,
            numeroOperacion: null,
            glosa: `Asiento distinto ${i}`,
          });
        }
      }

      const t0 = performance.now();
      const res1 = ejecutarMotorMatching({
        partidasBanco: bancos,
        partidasLibro: libros,
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
      });
      const elapsed1 = performance.now() - t0;

      const t1 = performance.now();
      const res2 = ejecutarMotorMatching({
        partidasBanco: [...bancos].reverse(),
        partidasLibro: [...libros].reverse(),
        parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
      });
      const elapsed2 = performance.now() - t1;

      assert.equal(res1.estadisticas.autoConciliados, 2100);
      assert.ok(elapsed1 < 2000, `Corrida 1 excedió 2000 ms: ${elapsed1.toFixed(1)} ms`);
      assert.ok(elapsed2 < 2000, `Corrida 2 excedió 2000 ms: ${elapsed2.toFixed(1)} ms`);
      assert.deepEqual(res1, res2, 'El motor debe ser 100% reproducible en dos corridas seguidas');
      console.log(
        `     ⏱️  5,200 líneas: corrida1=${elapsed1.toFixed(1)} ms | corrida2=${elapsed2.toFixed(1)} ms`
      );
    }
  );

  await ejecutarCaso(
    'A7. Capa 1: referencias de ceros largos (00000000, -00000) ignoradas sin emparejar conceptos distintos',
    () => {
      const resCeros = ejecutarMotorMatching({
        partidasBanco: [
          {
            id: 'b-ceros-largos',
            fecha: '2026-10-10',
            monto: '-250.00',
            referencia: '00000000',
            descripcion: 'CARGO GENERICO A',
          },
          {
            id: 'b-ceros-neg',
            fecha: '2026-10-10',
            monto: '-350.00',
            referencia: '-00000',
            descripcion: 'CARGO GENERICO B',
          },
        ],
        partidasLibro: [
          {
            id: 'l-ceros-largos',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-c1',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-250.00',
            numeroOperacion: '00000000',
            glosa: 'Otro concepto distinto',
          },
          {
            id: 'l-ceros-neg',
            origenLibro: 'MOVIMIENTO_TESORERIA',
            asientoId: 'a-c2',
            asientoDetalleId: null,
            fecha: '2026-10-10',
            importeConSigno: '-350.00',
            numeroOperacion: '-00000',
            glosa: 'Concepto diferente sin coincidencia',
          },
        ],
      });

      assert.equal(
        resCeros.grupos.filter((g) => g.capaMatching === 1).length,
        0,
        'Referencias compuestas solo por ceros largos (00000000, -00000) no deben hacer match en Capa 1'
      );
    }
  );
}

// ============================================================================
// BLOQUE B — INTEGRACIÓN REAL EN POSTGRESQL (atlob_test / contabilidad_app)
// ============================================================================

async function ejecutarBloquePostgresReal() {
  const testDbUrl = resolverTestDatabaseUrl();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';

  console.log('\n====================================================================');
  console.log('🐘 BLOQUE B — INTEGRACIÓN REAL FASE 3 EN POSTGRESQL (atlob_test)');
  console.log('====================================================================');

  const pool = new Pool({
    connectionString: testDbUrl,
    options: '-c search_path=public,pg_catalog',
    max: 10,
    connectionTimeoutMillis: 5000,
  });

  const { env } = await import('../config/env');
  env.NODE_ENV = 'test';
  const { setPostgresPool, conContextoEmpresa } = await import('../config/database');
  const { runMigrations } = await import('../db/migrate');
  setPostgresPool(pool, true);

  const { auditoriaChainService } = await import('../services/auditoriaChainService');
  const { authJwtService } = await import('../services/authJwtService');
  const { apiRoutes } = await import('../routes');

  const checkClient = await pool.connect();
  try {
    const {
      rows: [identity],
    } = await checkClient.query<{
      database_name: string;
      role_name: string;
      session_role: string;
      version_num: number;
      database_owner: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
    }>(`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             session_user AS session_role,
             current_setting('server_version_num')::int AS version_num,
             (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner,
             rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `);

    assert.equal(identity?.database_name, 'atlob_test');
    assert.equal(identity.role_name, 'contabilidad_app');
    assert.equal(identity.session_role, 'contabilidad_app');
    assert.equal(identity.database_owner, 'contabilidad_app');
    assert.ok(
      identity.rolcanlogin &&
        !(
          identity.rolsuper ||
          identity.rolcreatedb ||
          identity.rolcreaterole ||
          identity.rolbypassrls
        ),
      'contabilidad_app debe tener LOGIN y no tener rolsuper, rolcreatedb, rolcreaterole ni rolbypassrls'
    );
    assert.ok(identity.version_num >= 150000);
  } finally {
    checkClient.release();
  }

  await runMigrations();

  const tenantId = randomUUID();
  const empA = randomUUID();
  const empB = randomUUID();
  const usrAdmin = randomUUID();
  const usrSenior = randomUUID();
  const usrAsistente = randomUUID();
  const usrAuditor = randomUUID();
  const usrSoloB = randomUUID();

  const ej2026A = randomUUID();
  const ej2026B = randomUUID();
  const per202603A = randomUUID();
  const per202603B = randomUUID();
  const sub01A = randomUUID();
  const sub01B = randomUUID();

  const cta1041A = randomUUID();
  const cta10412A = randomUUID();
  const cta10413A = randomUUID();
  const cta6412A = randomUUID();
  const cta6391A = randomUUID();
  const cta67311A = randomUUID();
  const cta7793A = randomUUID();
  const cta70111A = randomUUID();
  const cta1041B = randomUUID();

  const cuentaAId = randomUUID();
  const cuentaConcId = randomUUID();
  const cuentaRevId = randomUUID();
  const cuentaBId = randomUUID();

  const anexoProvA = randomUUID();
  const anexoCliA = randomUUID();

  const extAId = randomUUID();
  const extConcId = randomUUID();
  const linCapa1Id = randomUUID();
  const linCapa2Id = randomUUID();
  const linSugAceptarId = randomUUID();
  const linSugRechazarId = randomUUID();
  const linManual1NId = randomUUID();
  const linManualN1aId = randomUUID();
  const linManualN1bId = randomUUID();
  const linConc1Id = randomUUID();
  const linConc2Id = randomUUID();

  const movCapa1Id = randomUUID();
  const movCapa2Id = randomUUID();
  const movSugAceptarId = randomUUID();
  const movSugRechazarId = randomUUID();
  const movManual1NId = randomUUID();
  const movManualN1Id = randomUUID();
  const movConc1Id = randomUUID();
  const movConc2Id = randomUUID();
  const movRevSugId = randomUUID();
  const movRevHistId = randomUUID();

  const asientoManualId = randomUUID();
  const asientoManualDet1041Id = randomUUID();
  const asientoManualDetContraId = randomUUID();

  const sufijo = tenantId.slice(0, 8);
  const rucA = `2098${String(randomInt(1000000, 9999999))}`;
  const rucB = `2098${String(randomInt(1000000, 9999999))}`;
  const hashDummy = await bcrypt.hash(randomUUID(), 4);

  let httpServer: ReturnType<typeof express.application.listen> | null = null;
  let httpPort = 0;

  try {
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      await seedClient.query(
        `INSERT INTO tenants (id, nombre, subdominio, estado) VALUES ($1, $2, $3, 'ACTIVO')`,
        [tenantId, `Tenant Concil V2 F3 ${sufijo}`, `concil-f3-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
         VALUES
           ($1, $6,  $11, 'Admin F3',     'ADMINISTRADOR',      true),
           ($2, $7,  $11, 'Senior F3',    'CONTADOR_SENIOR',    true),
           ($3, $8,  $11, 'Asistente F3', 'ASISTENTE_CONTABLE', true),
           ($4, $9,  $11, 'Auditor F3',   'AUDITOR_REVISOR',    true),
           ($5, $10, $11, 'Solo B F3',    'CONTADOR_SENIOR',    true)`,
        [
          usrAdmin,
          usrSenior,
          usrAsistente,
          usrAuditor,
          usrSoloB,
          `admin.f3.${sufijo}@atlob.test`,
          `senior.f3.${sufijo}@atlob.test`,
          `asistente.f3.${sufijo}@atlob.test`,
          `auditor.f3.${sufijo}@atlob.test`,
          `solob.f3.${sufijo}@atlob.test`,
          hashDummy,
        ]
      );

      await seedClient.query(
        `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
         VALUES
           ($1, $3, $4, $6, 'EMPRESA CONCIL F3 A SAC', 'REGIMEN_GENERAL', 'Av. F3 A 100', 'PEN', true),
           ($2, $3, $5, $7, 'EMPRESA CONCIL F3 B SAC', 'REGIMEN_GENERAL', 'Av. F3 B 200', 'PEN', true)`,
        [empA, empB, tenantId, `EMP-F3A-${sufijo}`, `EMP-F3B-${sufijo}`, rucA, rucB]
      );

      for (const [uid, eid, rol] of [
        [usrAdmin, empA, 'ADMINISTRADOR'],
        [usrSenior, empA, 'CONTADOR_SENIOR'],
        [usrAsistente, empA, 'ASISTENTE_CONTABLE'],
        [usrAuditor, empA, 'AUDITOR_REVISOR'],
        [usrSoloB, empB, 'ADMINISTRADOR'],
      ] as const) {
        await fijarContextoRls(seedClient, eid, uid);
        await seedClient.query(
          `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
           VALUES ($1, $2, $3, $4, 'ACTIVO')`,
          [randomUUID(), uid, eid, rol]
        );
      }

      // Empresa A
      await fijarContextoRls(seedClient, empA, usrAdmin);
      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ej2026A, empA]
      );
      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES ($1, $2, $3, 2026, 3, '2026-03', 'ABIERTO')`,
        [per202603A, empA, ej2026A]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS F3', 'BANCOS', true)`,
        [sub01A, empA]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES
           ($1, $7, '10411', 'Banco BCP F3 MN',      5, 'ACTIVO',  true, true),
           ($2, $7, '6412',  'ITF F3',                4, 'GASTO',   true, true),
           ($3, $7, '6391',  'Comisiones F3',         4, 'GASTO',   true, true),
           ($4, $7, '67311', 'Interes Gasto F3',      5, 'GASTO',   true, true),
           ($5, $7, '7793',  'Interes Ingreso F3',    4, 'INGRESO', true, true),
           ($6, $7, '70111', 'Ventas F3',             5, 'INGRESO', true, true),
           ($8, $7, '10412', 'Banco BBVA F3 Conc MN', 5, 'ACTIVO',  true, true),
           ($9, $7, '10413', 'Banco IBK F3 Rev MN',   5, 'ACTIVO',  true, true)`,
        [
          cta1041A,
          cta6412A,
          cta6391A,
          cta67311A,
          cta7793A,
          cta70111A,
          empA,
          cta10412A,
          cta10413A,
        ]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES
           ($1, $2, 'BANCO', 'BCP',      '193-993001-F3', 'PEN', '10411', $3, 1000.00, 1000.00, true),
           ($4, $2, 'BANCO', 'BBVA',     '0011-993002-F3', 'PEN', '10412', $5, 1000.00, 1000.00, true),
           ($6, $2, 'BANCO', 'INTERBANK','200-993003-F3', 'PEN', '10413', $7, 1000.00, 1000.00, true)`,
        [cuentaAId, empA, cta1041A, cuentaConcId, cta10412A, cuentaRevId, cta10413A]
      );
      await seedClient.query(
        `INSERT INTO conciliacion_config_empresa (
           empresa_id, conciliacion_v2_habilitada, tolerancia_dias, tolerancia_monto, umbral_auto_match,
           cuenta_itf_codigo, cuenta_comision_codigo, cuenta_interes_gasto_codigo, cuenta_interes_ingreso_codigo
         ) VALUES ($1, true, 3, 0.05, 0.9000, '6412', '6391', '67311', '7793')`,
        [empA]
      );
      await seedClient.query(
        `INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
         VALUES
           ($1, $3, '6', '20511223344', 'PROVEEDOR MIXTO ANDINO SAC', 'PROVEEDOR'),
           ($2, $3, '6', '20600998877', 'COMERCIAL PACIFICO SAC',    'CLIENTE')`,
        [anexoProvA, anexoCliA, empA]
      );

      // Extracto bancario para 2026-03
      await seedClient.query(
        `INSERT INTO extractos_bancarios (
           id, empresa_id, cuenta_financiera_id, nombre_archivo, fecha_corte_desde, fecha_corte_hasta,
           saldo_inicial, saldo_final, hash_archivo, estado
         ) VALUES
           ($1, $2, $3, 'ext_f3_202603.csv', '2026-03-01', '2026-03-31', 1000.00, 1430.03, $4, 'CARGADO'),
           ($5, $2, $6, 'ext_f3_conc_202603.csv', '2026-03-01', '2026-03-31', 1000.00, 420.00, $7, 'CARGADO')`,
        [
          extAId,
          empA,
          cuentaAId,
          `hash-ext-f3-${sufijo}`,
          extConcId,
          cuentaConcId,
          `hash-ext-f3-conc-${sufijo}`,
        ]
      );

      await seedClient.query(
        `INSERT INTO extracto_lineas (
           id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo,
           conciliada, estado_conciliacion, ruc_extraido, contraparte_extraida
         ) VALUES
           ($1,  $8,  $9, '2026-03-05', 'PAGO PROVEEDOR OP 4567',                  '0004567', -1200.00, -200.00, false, 'PENDIENTE_LIBROS', NULL,          NULL),
           ($2,  $8,  $9, '2026-03-08', 'ABONO COMERCIAL PACIFICO RUC 20600998877', NULL,       2500.00, 2300.00, false, 'PENDIENTE_LIBROS', '20600998877', 'COMERCIAL PACIFICO'),
           ($3,  $8,  $9, '2026-03-11', 'CARGO SERVICIO LOGISTICO LIMA',            NULL,       -450.00, 1850.00, false, 'PENDIENTE_LIBROS', NULL,          'SERVICIO LOGISTICO LIMA'),
           ($4,  $8,  $9, '2026-03-18', 'CARGO SEGURO CORPORATIVO',                 NULL,       -320.00, 1530.00, false, 'PENDIENTE_LIBROS', NULL,          'SEGURO CORPORATIVO'),
           ($5,  $8,  $9, '2026-03-25', 'CARGO PAGO MIXTO PROVEEDORES',             'MAN-1N',   -900.00,  630.00, false, 'PENDIENTE_LIBROS', '20511223344', 'PROVEEDOR MIXTO ANDINO'),
           ($6,  $8,  $9, '2026-03-26', 'ABONO PARCIAL UNO',                        NULL,        700.00, 1330.00, false, 'PENDIENTE_LIBROS', NULL,          NULL),
           ($7,  $8,  $9, '2026-03-27', 'ABONO PARCIAL DOS',                        NULL,        800.03, 2130.03, false, 'PENDIENTE_LIBROS', NULL,          NULL),
           ($10, $12, $9, '2026-03-10', 'PAGO CONCURRENTE OP 8811',                 '0008811',  -400.00,  600.00, false, 'PENDIENTE_LIBROS', NULL,          NULL),
           ($11, $12, $9, '2026-03-12', 'CARGO TELECOMUNICACIONES NORTE',           NULL,       -180.00,  420.00, false, 'PENDIENTE_LIBROS', NULL,          'TELECOMUNICACIONES NORTE')`,
        [
          linCapa1Id,
          linCapa2Id,
          linSugAceptarId,
          linSugRechazarId,
          linManual1NId,
          linManualN1aId,
          linManualN1bId,
          extAId,
          empA,
          linConc1Id,
          linConc2Id,
          extConcId,
        ]
      );

      // Movimientos de tesorería en 2026-03
      await seedClient.query(
        `INSERT INTO movimientos_tesoreria (
           id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo, medio_pago,
           numero_operacion, moneda, tipo_cambio, importe, glosa, estado, conciliado, anexo_id
         ) VALUES
           ($1,  $7, $8, $9,  '2026-03-05', 'EGRESO',  '003', '4567', 'PEN', 1.0000, 1200.00, 'Pago transferencia proveedor',   'REGISTRADO', false, NULL),
           ($2,  $7, $8, $9,  '2026-03-09', 'INGRESO', '003', NULL,   'PEN', 1.0000, 2500.00, 'Cobranza cliente',               'REGISTRADO', false, $10),
           ($3,  $7, $8, $9,  '2026-03-15', 'EGRESO',  '007', NULL,   'PEN', 1.0000,  450.00, 'Pago servicio logistico lima',   'REGISTRADO', false, NULL),
           ($4,  $7, $8, $9,  '2026-03-22', 'EGRESO',  '003', NULL,   'PEN', 1.0000,  320.00, 'Seguro corporativo mensual',     'REGISTRADO', false, NULL),
           ($5,  $7, $8, $9,  '2026-03-31', 'EGRESO',  '003', NULL,   'PEN', 1.0000,  600.00, 'Tramo tesorería mixto',          'REGISTRADO', false, $11),
           ($6,  $7, $8, $9,  '2026-03-19', 'INGRESO', '003', NULL,   'PEN', 1.0000, 1500.00, 'Cobranza consolidada',           'REGISTRADO', false, NULL),
           ($12, $7, $8, $16, '2026-03-10', 'EGRESO',  '003', '8811', 'PEN', 1.0000,  400.00, 'Pago concurrente op 8811',        'REGISTRADO', false, NULL),
           ($13, $7, $8, $16, '2026-03-16', 'EGRESO',  '003', NULL,   'PEN', 1.0000,  180.00, 'Pago telecomunicaciones norte',  'REGISTRADO', false, NULL),
           ($14, $7, $8, $17, '2026-03-15', 'EGRESO',  '003', NULL,   'PEN', 1.0000,  220.00, 'Servicio courier expreso lima',  'REGISTRADO', false, NULL),
           ($15, $7, $8, $17, '2026-03-18', 'EGRESO',  '003', '9922', 'PEN', 1.0000,  310.00, 'Pago proveedor hist op 9922',    'REGISTRADO', false, NULL)`,
        [
          movCapa1Id,
          movCapa2Id,
          movSugAceptarId,
          movSugRechazarId,
          movManual1NId,
          movManualN1Id,
          empA,
          per202603A,
          cuentaAId,
          anexoCliA,
          anexoProvA,
          movConc1Id,
          movConc2Id,
          movRevSugId,
          movRevHistId,
          cuentaConcId,
          cuentaRevId,
        ]
      );

      // Asiento manual directo en 10411 (sin movimiento_tesoreria) por 300.00 HABER -> -300.00
      await seedClient.query(
        `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
         VALUES ($1, $2, $3, $4, '05030099', $5, '2026-03-31', 'Asiento manual directo 10411', 'PEN', 'BORRADOR')`,
        [asientoManualId, empA, per202603A, sub01A, `CUO-F3-${sufijo}`]
      );
      await seedClient.query(
        `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, anexo_id, debe, haber, glosa_linea)
         VALUES
           ($1, $3, $4, 1, $5, $7,   0.00, 300.00, 'Salida manual banco 10411'),
           ($2, $3, $4, 2, $6, NULL, 300.00,   0.00, 'Contrapartida gasto manual')`,
        [
          asientoManualDet1041Id,
          asientoManualDetContraId,
          asientoManualId,
          empA,
          cta1041A,
          cta6391A,
          anexoProvA,
        ]
      );
      await seedClient.query(
        `UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`,
        [asientoManualId]
      );
      await seedClient.query('COMMIT');

      // Empresa B
      await seedClient.query('BEGIN');
      await fijarContextoRls(seedClient, empB, usrSoloB);
      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ej2026B, empB]
      );
      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES ($1, $2, $3, 2026, 3, '2026-03', 'ABIERTO')`,
        [per202603B, empB, ej2026B]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS F3 B', 'BANCOS', true)`,
        [sub01B, empB]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES ($1, $2, '10411', 'Banco BCP F3 B', 5, 'ACTIVO', true, true)`,
        [cta1041B, empB]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-993099-B', 'PEN', '10411', $3, 0.00, 0.00, true)`,
        [cuentaBId, empB, cta1041B]
      );
      await seedClient.query('COMMIT');
    } catch (err) {
      await seedClient.query('ROLLBACK');
      throw err;
    } finally {
      seedClient.release();
    }

    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api', apiRoutes);
    httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer!.once('listening', resolve));
    httpPort = (httpServer.address() as { port: number }).port;

    const apiFetch = async (path: string, token: string, method = 'GET', body?: unknown) => {
      const resp = await fetch(`http://127.0.0.1:${httpPort}/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await resp.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: resp.status, body: json, text };
    };

    const emitir = (
      id: string,
      email: string,
      nombre: string,
      rolGlobal: any,
      esAdmin: boolean,
      empId: string
    ) =>
      authJwtService.emitirSesion(
        {
          id,
          email,
          passwordHash: hashDummy,
          nombre,
          rolGlobal,
          mfaActivado: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        esAdmin,
        empId
      );

    const sesionAdmin = await emitir(
      usrAdmin,
      `admin.f3.${sufijo}@atlob.test`,
      'Admin F3',
      'ADMINISTRADOR',
      true,
      empA
    );
    const sesionSenior = await emitir(
      usrSenior,
      `senior.f3.${sufijo}@atlob.test`,
      'Senior F3',
      'CONTADOR_SENIOR',
      false,
      empA
    );
    const sesionAsistente = await emitir(
      usrAsistente,
      `asistente.f3.${sufijo}@atlob.test`,
      'Asistente F3',
      'ASISTENTE_CONTABLE',
      false,
      empA
    );
    const sesionAuditor = await emitir(
      usrAuditor,
      `auditor.f3.${sufijo}@atlob.test`,
      'Auditor F3',
      'AUDITOR_REVISOR',
      false,
      empA
    );
    const sesionSoloB = await emitir(
      usrSoloB,
      `solob.f3.${sufijo}@atlob.test`,
      'Solo B F3',
      'CONTADOR_SENIOR',
      false,
      empB
    );

    let grupoCapa1Id = '';
    let grupoCapa2Id = '';
    let grupoSugAceptarId = '';
    let grupoSugRechazarId = '';
    let grupoManual1NId = '';
    let grupoManualN1Id = '';
    let reglaAprendidaId = '';
    let historialId = '';

    // ------------------------------------------------------------------
    // B1. POST /matching/ejecutar + aceptar/rechazar sugerencias
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B1. POST /matching/ejecutar: auto-match Capa 1 y Capa 2 + SUGERIDO aceptar/rechazar en PG real',
      async () => {
        const execRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
          }
        );
        assert.equal(execRes.status, 200, `Error ejecutarMatching: ${execRes.text}`);
        assert.equal(execRes.body?.data?.autoConciliados, 2);
        assert.equal(execRes.body?.data?.sugeridos, 2);

        const gruposCreados = execRes.body.data.gruposCreados as any[];
        assert.equal(gruposCreados.length, 4);

        const gCapa1 = gruposCreados.find(
          (g) => g.itemsBanco[0]?.extractoLineaId === linCapa1Id
        );
        const gCapa2 = gruposCreados.find(
          (g) => g.itemsBanco[0]?.extractoLineaId === linCapa2Id
        );
        const gSugAcep = gruposCreados.find(
          (g) => g.itemsBanco[0]?.extractoLineaId === linSugAceptarId
        );
        const gSugRech = gruposCreados.find(
          (g) => g.itemsBanco[0]?.extractoLineaId === linSugRechazarId
        );

        assert.ok(gCapa1 && gCapa1.capaMatching === 1 && gCapa1.estado === 'CONCILIADO');
        assert.ok(gCapa2 && gCapa2.capaMatching === 2 && gCapa2.estado === 'CONCILIADO');
        assert.ok(gSugAcep && gSugAcep.capaMatching === 4 && gSugAcep.estado === 'SUGERIDO');
        assert.ok(gSugRech && gSugRech.capaMatching === 4 && gSugRech.estado === 'SUGERIDO');

        grupoCapa1Id = gCapa1.id;
        grupoCapa2Id = gCapa2.id;
        grupoSugAceptarId = gSugAcep.id;
        grupoSugRechazarId = gSugRech.id;

        // Verificar persistencia real en extracto_lineas y movimientos_tesoreria tras auto-match
        const bdCheck = await queryEnEmpresa(
          pool,
          empA,
          usrSenior,
          `SELECT el.id, el.conciliada, el.estado_conciliacion AS "estadoConciliacion",
                  mt.conciliado AS "movConciliado", mt.estado_conciliacion_libro AS "estadoLibro"
           FROM extracto_lineas el
           LEFT JOIN movimientos_tesoreria mt
             ON mt.id = el.movimiento_tesoreria_id AND mt.empresa_id = el.empresa_id
           WHERE el.empresa_id = $1 AND el.id = ANY($2::uuid[])`,
          [empA, [linCapa1Id, linCapa2Id, linSugAceptarId, linSugRechazarId]]
        );
        const porLinea = new Map(bdCheck.rows.map((r) => [r.id, r]));
        assert.equal(porLinea.get(linCapa1Id)?.conciliada, true);
        assert.equal(porLinea.get(linCapa1Id)?.estadoConciliacion, 'CONCILIADO');
        assert.equal(porLinea.get(linCapa1Id)?.movConciliado, true);
        assert.equal(porLinea.get(linCapa1Id)?.estadoLibro, 'CONCILIADO');
        assert.equal(porLinea.get(linCapa2Id)?.conciliada, true);
        assert.equal(porLinea.get(linCapa2Id)?.estadoConciliacion, 'CONCILIADO');
        assert.equal(porLinea.get(linSugAceptarId)?.conciliada, false);
        assert.equal(porLinea.get(linSugAceptarId)?.estadoConciliacion, 'SUGERIDO');

        // Aceptar sugerencia (individual)
        const aceptarRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/sugerencias/aceptar`,
          sesionAsistente.accessToken,
          'POST',
          { grupoIds: [grupoSugAceptarId] }
        );
        assert.equal(aceptarRes.status, 200, `Error aceptarSugerencias: ${aceptarRes.text}`);
        assert.equal(aceptarRes.body?.data?.[0]?.estado, 'CONCILIADO');

        const checkAcep = await queryEnEmpresa(
          pool,
          empA,
          usrSenior,
          `SELECT el.conciliada, el.estado_conciliacion AS "estadoConc",
                  mt.conciliado AS "movConc", mt.estado_conciliacion_libro AS "movEstado"
           FROM extracto_lineas el
           JOIN movimientos_tesoreria mt ON mt.id = $3 AND mt.empresa_id = $1
           WHERE el.empresa_id = $1 AND el.id = $2`,
          [empA, linSugAceptarId, movSugAceptarId]
        );
        assert.equal(checkAcep.rows[0].conciliada, true);
        assert.equal(checkAcep.rows[0].estadoConc, 'CONCILIADO');
        assert.equal(checkAcep.rows[0].movConc, true);
        assert.equal(checkAcep.rows[0].movEstado, 'CONCILIADO');

        // Rechazar sugerencia
        const rechazarRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/sugerencias/${grupoSugRechazarId}/rechazar`,
          sesionSenior.accessToken,
          'POST',
          { motivo: 'No corresponde al periodo de póliza' }
        );
        assert.equal(rechazarRes.status, 200, `Error rechazarSugerencia: ${rechazarRes.text}`);
        assert.equal(rechazarRes.body?.data?.estado, 'RECHAZADO');

        const checkRech = await queryEnEmpresa(
          pool,
          empA,
          usrSenior,
          `SELECT conciliada, estado_conciliacion AS "estadoConc"
           FROM extracto_lineas WHERE empresa_id = $1 AND id = $2`,
          [empA, linSugRechazarId]
        );
        assert.equal(checkRech.rows[0].conciliada, false);
        assert.equal(checkRech.rows[0].estadoConc, 'PENDIENTE_LIBROS');
      }
    );

    // ------------------------------------------------------------------
    // B2. Conciliación manual 1:N (con ASIENTO_MANUAL) y N:1 + tolerancia + reglas aprendidas CRUD
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B2. Conciliación manual 1:N (ASIENTO_MANUAL) + N:1 + rechazo 409 DIFERENCIA_EXCEDE_TOLERANCIA + aprenderRegla & CRUD /reglas-aprendidas',
      async () => {
        // Rechazo 409 por exceso de tolerancia (-900.00 vs -600.00 -> dif -300.00 > 0.05)
        const excedeRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/manual`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaIds: [linManual1NId],
            libroItems: [{ origenLibro: 'MOVIMIENTO_TESORERIA', id: movManual1NId }],
            observacion: 'Debe fallar por diferencia',
          }
        );
        assert.equal(excedeRes.status, 409);
        assert.equal(excedeRes.body?.details?.codigo, 'DIFERENCIA_EXCEDE_TOLERANCIA');

        // Conciliación manual 1:N incluyendo MOVIMIENTO_TESORERIA + ASIENTO_MANUAL y aprenderRegla
        const manual1NRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/manual`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaIds: [linManual1NId],
            libroItems: [
              { origenLibro: 'MOVIMIENTO_TESORERIA', id: movManual1NId },
              { origenLibro: 'ASIENTO_MANUAL', id: asientoManualDet1041Id },
            ],
            observacion: 'Agrupación manual 1:N con asiento manual 10411',
            aprenderRegla: {
              patronContraparte: 'PROVEEDOR MIXTO ANDINO',
              rucContraparte: '20511223344',
              anexoId: anexoProvA,
              cuentaContableId: cta6391A,
              tipoClasificacion: 'TRANSFERENCIA',
            },
          }
        );
        assert.equal(manual1NRes.status, 201, `Error manual 1:N: ${manual1NRes.text}`);
        assert.equal(manual1NRes.body?.data?.tipoMatch, '1:N');
        assert.equal(manual1NRes.body?.data?.estado, 'CONCILIADO_MANUAL');
        assert.equal(manual1NRes.body?.data?.diferenciaMonto, '0.00');
        assert.equal(manual1NRes.body?.data?.itemsBanco?.length, 1);
        assert.equal(manual1NRes.body?.data?.itemsLibro?.length, 2);
        assert.ok(
          manual1NRes.body.data.itemsLibro.some(
            (it: any) =>
              it.origenLibro === 'ASIENTO_MANUAL' && it.asientoDetalleId === asientoManualDet1041Id
          ),
          'El grupo 1:N debe persistir el ítem ASIENTO_MANUAL'
        );
        grupoManual1NId = manual1NRes.body.data.id;

        // Verificar que /resumen refleja el ASIENTO_MANUAL como conciliado
        const resumenRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/resumen?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(resumenRes.status, 200);
        const manualEnResumen = (resumenRes.body?.data?.asientosManualesLibros as any[])?.find(
          (a) => a.id === asientoManualDet1041Id
        );
        assert.ok(manualEnResumen, 'ASIENTO_MANUAL debe aparecer en /resumen');
        assert.equal(manualEnResumen.conciliado, true);
        assert.equal(manualEnResumen.grupoConciliacionId, grupoManual1NId);

        // Conciliación manual N:1 dentro de tolerancia (700.00 + 800.03 vs 1500.00 => dif 0.03 <= 0.05)
        const manualN1Res = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/manual`,
          sesionAsistente.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaIds: [linManualN1aId, linManualN1bId],
            libroItems: [{ origenLibro: 'MOVIMIENTO_TESORERIA', id: movManualN1Id }],
            observacion: 'Agrupación manual N:1 con redondeo',
          }
        );
        assert.equal(manualN1Res.status, 201, `Error manual N:1: ${manualN1Res.text}`);
        assert.equal(manualN1Res.body?.data?.tipoMatch, 'N:1');
        assert.equal(manualN1Res.body?.data?.estado, 'CONCILIADO_MANUAL');
        assert.equal(manualN1Res.body?.data?.diferenciaMonto, '0.03');
        assert.equal(manualN1Res.body?.data?.itemsBanco?.length, 2);
        assert.equal(manualN1Res.body?.data?.itemsLibro?.length, 1);
        grupoManualN1Id = manualN1Res.body.data.id;

        // Verificar regla aprendida creada y CRUD completo de /reglas-aprendidas
        const listarReglas = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas?soloActivas=true`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(listarReglas.status, 200);
        const reglaAuto = (listarReglas.body?.data as any[])?.find(
          (r) => r.patronContraparte === 'PROVEEDOR MIXTO ANDINO'
        );
        assert.ok(reglaAuto, 'aprenderRegla debe crear registro en conciliacion_reglas_aprendidas');
        assert.equal(reglaAuto.rucContraparte, '20511223344');
        assert.equal(reglaAuto.usosConfirmados, 1);
        reglaAprendidaId = reglaAuto.id;

        const crearRegla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas`,
          sesionSenior.accessToken,
          'POST',
          {
            patronContraparte: 'TELECOMUNICACIONES DEL SUR',
            rucContraparte: '20100200300',
            cuentaContableId: cta6391A,
            tipoClasificacion: 'COMISION_BANCARIA',
          }
        );
        assert.equal(crearRegla.status, 201);
        const reglaCrudId = crearRegla.body.data.id as string;

        const actualizarRegla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas/${reglaCrudId}`,
          sesionSenior.accessToken,
          'PUT',
          { activo: false, tipoClasificacion: 'OTRO' }
        );
        assert.equal(actualizarRegla.status, 200);
        assert.equal(actualizarRegla.body?.data?.activo, false);
        assert.equal(actualizarRegla.body?.data?.tipoClasificacion, 'OTRO');

        const eliminarRegla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas/${reglaCrudId}`,
          sesionSenior.accessToken,
          'DELETE'
        );
        assert.equal(eliminarRegla.status, 200);
        assert.equal(eliminarRegla.body?.data?.eliminada, true);
      }
    );

    // ------------------------------------------------------------------
    // B3. Desconciliación atómica + restauración cheque/pendiente + inmutabilidad historial
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B3. Desconciliación atómica (PENDIENTE_LIBROS / CHEQUE_NO_COBRADO / PENDIENTE_BANCO) + historial inmutable',
      async () => {
        // 1) Desconciliar grupo con cheque (medio_pago = '007') -> debe volver a CHEQUE_NO_COBRADO
        const descCheque = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos/${grupoSugAceptarId}/desconciliar`,
          sesionSenior.accessToken,
          'POST',
          { motivo: 'Cheque devuelto por firma inconforme en banco' }
        );
        assert.equal(descCheque.status, 200, `Error desconciliar cheque: ${descCheque.text}`);
        assert.equal(descCheque.body?.data?.estado, 'DESCONCILIADO');

        const checkCheque = await queryEnEmpresa(
          pool,
          empA,
          usrSenior,
          `SELECT el.conciliada, el.estado_conciliacion AS "estadoBanco", el.movimiento_tesoreria_id AS "movRef",
                  mt.conciliado AS "movConciliado", mt.estado_conciliacion_libro AS "estadoLibro"
           FROM extracto_lineas el
           JOIN movimientos_tesoreria mt ON mt.id = $3 AND mt.empresa_id = $1
           WHERE el.empresa_id = $1 AND el.id = $2`,
          [empA, linSugAceptarId, movSugAceptarId]
        );
        assert.equal(checkCheque.rows[0].conciliada, false);
        assert.equal(checkCheque.rows[0].estadoBanco, 'PENDIENTE_LIBROS');
        assert.equal(checkCheque.rows[0].movRef, null);
        assert.equal(checkCheque.rows[0].movConciliado, false);
        assert.equal(checkCheque.rows[0].estadoLibro, 'CHEQUE_NO_COBRADO');

        // 2) Desconciliar grupo N:1 con medio_pago = '003' -> debe volver a PENDIENTE_BANCO y ambas líneas a PENDIENTE_LIBROS
        const descN1 = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos/${grupoManualN1Id}/desconciliar`,
          sesionSenior.accessToken,
          'POST',
          { motivo: 'Revisión de abonos parciales duplicados en cierre' }
        );
        assert.equal(descN1.status, 200);
        assert.equal(descN1.body?.data?.estado, 'DESCONCILIADO');

        const checkN1 = await queryEnEmpresa(
          pool,
          empA,
          usrSenior,
          `SELECT el.id, el.conciliada, el.estado_conciliacion AS "estadoBanco",
                  mt.conciliado AS "movConciliado", mt.estado_conciliacion_libro AS "estadoLibro"
           FROM extracto_lineas el
           JOIN movimientos_tesoreria mt ON mt.id = $3 AND mt.empresa_id = $1
           WHERE el.empresa_id = $1 AND el.id = ANY($2::uuid[])`,
          [empA, [linManualN1aId, linManualN1bId], movManualN1Id]
        );
        assert.equal(checkN1.rows.length, 2);
        for (const r of checkN1.rows) {
          assert.equal(r.conciliada, false);
          assert.equal(r.estadoBanco, 'PENDIENTE_LIBROS');
          assert.equal(r.movConciliado, false);
          assert.equal(r.estadoLibro, 'PENDIENTE_BANCO');
        }

        // 3) Verificar visibilidad en GET /matching/historial-desconciliacion
        const histRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/historial-desconciliacion?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(histRes.status, 200);
        const historial = histRes.body?.data as any[];
        assert.equal(historial.length, 2);
        const regHistCheque = historial.find((h) => h.grupoId === grupoSugAceptarId)!;
        assert.ok(regHistCheque);
        assert.equal(regHistCheque.motivo, 'Cheque devuelto por firma inconforme en banco');
        assert.equal(regHistCheque.estadoAnteriorLibro, 'CONCILIADO');
        historialId = regHistCheque.id;

        // 4) Comprobar inmutabilidad real en SQL: UPDATE y DELETE directos deben fallar con CONCILIACION_HISTORIAL_INMUTABLE
        await assert.rejects(
          () =>
            queryEnEmpresa(
              pool,
              empA,
              usrAdmin,
              `UPDATE public.conciliacion_historial_desconciliacion SET motivo = 'Alterado' WHERE empresa_id = $1 AND id = $2`,
              [empA, historialId]
            ),
          (err: any) => String(err?.message ?? '').includes('CONCILIACION_HISTORIAL_INMUTABLE')
        );

        await assert.rejects(
          () =>
            queryEnEmpresa(
              pool,
              empA,
              usrAdmin,
              `DELETE FROM public.conciliacion_historial_desconciliacion WHERE empresa_id = $1 AND id = $2`,
              [empA, historialId]
            ),
          (err: any) => String(err?.message ?? '').includes('CONCILIACION_HISTORIAL_INMUTABLE')
        );
      }
    );

    // ------------------------------------------------------------------
    // B4. Cadena de auditoría + RLS multiempresa + RBAC lector
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B4. Integridad de auditoria_log + aislamiento RLS multiempresa (403/404) + RBAC lector (AUDITOR_REVISOR)',
      async () => {
        // 1) Cadena de auditoría íntegra tras todas las operaciones de Fase 3
        const checkAud = await conContextoEmpresa(empA, usrAdmin, () =>
          auditoriaChainService.verificarIntegridad(empA)
        );
        assert.equal(checkAud.valido, true, `Cadena de auditoría corrupta: ${checkAud.mensaje}`);
        assert.ok(
          checkAud.totalRegistros >= 8,
          `Esperados >= 8 registros de auditoría en Fase 3, obtenidos ${checkAud.totalRegistros}`
        );

        // 2) Usuario Empresa B intentando acceder a rutas de Empresa A -> 403
        const crossListGrupos = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(crossListGrupos.status, 403);

        const crossExec = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
          sesionSoloB.accessToken,
          'POST',
          { cuentaFinancieraId: cuentaAId, periodo: '2026-03' }
        );
        assert.equal(crossExec.status, 403);

        const crossAceptar = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/sugerencias/aceptar`,
          sesionSoloB.accessToken,
          'POST',
          { grupoIds: [grupoCapa1Id] }
        );
        assert.equal(crossAceptar.status, 403);

        const crossDesc = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos/${grupoCapa1Id}/desconciliar`,
          sesionSoloB.accessToken,
          'POST',
          { motivo: 'Intento de desconciliación cruzada' }
        );
        assert.equal(crossDesc.status, 403);

        const crossReglas = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(crossReglas.status, 403);

        // 3) Usuario Empresa B usando su propia ruta pero con IDs de Empresa A -> 404 por RLS y sin fugas
        const bCuentaA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/matching/grupos?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(bCuentaA.status, 404);

        const bAceptarGrupoA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/matching/sugerencias/aceptar`,
          sesionSoloB.accessToken,
          'POST',
          { grupoIds: [grupoCapa2Id] }
        );
        assert.equal(bAceptarGrupoA.status, 404);

        const bDescGrupoA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/matching/grupos/${grupoManual1NId}/desconciliar`,
          sesionSoloB.accessToken,
          'POST',
          { motivo: 'Intento RLS sobre grupo ajeno' }
        );
        assert.equal(bDescGrupoA.status, 404);

        const bPutReglaA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/reglas-aprendidas/${reglaAprendidaId}`,
          sesionSoloB.accessToken,
          'PUT',
          { activo: false }
        );
        assert.equal(bPutReglaA.status, 404);

        const bDelReglaA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/reglas-aprendidas/${reglaAprendidaId}`,
          sesionSoloB.accessToken,
          'DELETE'
        );
        assert.equal(bDelReglaA.status, 404);

        // Confirmar que Empresa A permanece intacta
        const gruposA = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(gruposA.status, 200);
        const g1NIntacto = (gruposA.body?.data as any[])?.find((g) => g.id === grupoManual1NId);
        assert.equal(g1NIntacto?.estado, 'CONCILIADO_MANUAL');

        // 4) Bloqueo RBAC: lector AUDITOR_REVISOR no puede mutar matching ni reglas; sí puede leer
        const audGrupos = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(audGrupos.status, 200);

        const audExec = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
          sesionAuditor.accessToken,
          'POST',
          { cuentaFinancieraId: cuentaAId, periodo: '2026-03' }
        );
        assert.equal(audExec.status, 403);

        const audAceptar = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/sugerencias/aceptar`,
          sesionAuditor.accessToken,
          'POST',
          { grupoIds: [grupoCapa1Id] }
        );
        assert.equal(audAceptar.status, 403);

        const audManual = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/manual`,
          sesionAuditor.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaIds: [linSugAceptarId],
            libroItems: [{ origenLibro: 'MOVIMIENTO_TESORERIA', id: movSugAceptarId }],
          }
        );
        assert.equal(audManual.status, 403);

        const audDesc = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos/${grupoCapa1Id}/desconciliar`,
          sesionAuditor.accessToken,
          'POST',
          { motivo: 'Auditor sin permiso de escritura' }
        );
        assert.equal(audDesc.status, 403);

        const audPostRegla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas`,
          sesionAuditor.accessToken,
          'POST',
          { patronContraparte: 'NO_PERMITIDO' }
        );
        assert.equal(audPostRegla.status, 403);

        const asisPostRegla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reglas-aprendidas`,
          sesionAsistente.accessToken,
          'POST',
          { patronContraparte: 'ASIS_NO_PERMITIDO' }
        );
        assert.equal(asisPostRegla.status, 403);
      }
    );

    // ------------------------------------------------------------------
    // B5. Concurrencia (ALTO 1): 2 POST /matching/ejecutar en paralelo
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B5. Concurrencia (ALTO 1): 2 POST /matching/ejecutar paralelos sin grupos activos duplicados ni ruptura de auditoria_log',
      async () => {
        const [exec1, exec2] = await Promise.all([
          apiFetch(
            `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
            sesionSenior.accessToken,
            'POST',
            { cuentaFinancieraId: cuentaConcId, periodo: '2026-03' }
          ),
          apiFetch(
            `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
            sesionSenior.accessToken,
            'POST',
            { cuentaFinancieraId: cuentaConcId, periodo: '2026-03' }
          ),
        ]);

        assert.equal(exec1.status, 200, `Error exec1 paralelo: ${exec1.text}`);
        assert.equal(exec2.status, 200, `Error exec2 paralelo: ${exec2.text}`);

        const dupBancoRes = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT ci.extracto_linea_id AS id, COUNT(*)::int AS total
           FROM conciliacion_item ci
           JOIN conciliacion_grupo cg
             ON cg.empresa_id = ci.empresa_id
            AND cg.id = ci.grupo_id
           WHERE cg.empresa_id = $1
             AND cg.cuenta_financiera_id = $2
             AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL', 'SUGERIDO')
             AND ci.extracto_linea_id IS NOT NULL
           GROUP BY ci.extracto_linea_id
           HAVING COUNT(*) > 1`,
          [empA, cuentaConcId]
        );
        assert.equal(
          dupBancoRes.rows.length,
          0,
          `No debe existir ningún extracto_linea_id en más de un grupo activo: ${JSON.stringify(dupBancoRes.rows)}`
        );

        const dupLibroRes = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT ci.movimiento_tesoreria_id AS id, COUNT(*)::int AS total
           FROM conciliacion_item ci
           JOIN conciliacion_grupo cg
             ON cg.empresa_id = ci.empresa_id
            AND cg.id = ci.grupo_id
           WHERE cg.empresa_id = $1
             AND cg.cuenta_financiera_id = $2
             AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL', 'SUGERIDO')
             AND ci.movimiento_tesoreria_id IS NOT NULL
           GROUP BY ci.movimiento_tesoreria_id
           HAVING COUNT(*) > 1`,
          [empA, cuentaConcId]
        );
        assert.equal(
          dupLibroRes.rows.length,
          0,
          `No debe existir ningún movimiento_tesoreria_id en más de un grupo activo: ${JSON.stringify(dupLibroRes.rows)}`
        );

        const activosConcRes = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT estado, COUNT(*)::int AS total
           FROM conciliacion_grupo
           WHERE empresa_id = $1
             AND cuenta_financiera_id = $2
             AND estado IN ('CONCILIADO', 'CONCILIADO_MANUAL', 'SUGERIDO')
           GROUP BY estado`,
          [empA, cuentaConcId]
        );
        const porEstado = new Map(activosConcRes.rows.map((r) => [r.estado, r.total]));
        assert.equal(porEstado.get('CONCILIADO'), 1);
        assert.equal(porEstado.get('SUGERIDO'), 1);

        const checkAud = await conContextoEmpresa(empA, usrAdmin, () =>
          auditoriaChainService.verificarIntegridad(empA)
        );
        assert.equal(checkAud.valido, true, `Cadena de auditoría corrupta tras concurrencia: ${checkAud.mensaje}`);
      }
    );

    // ------------------------------------------------------------------
    // B6. Reversión de importación con sugerencias vs historial (ALTO 2)
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B6. Reversión de importación (ALTO 2): SUGERIDO sin confirmar revierte 200 OK sin 23503; historial/desconciliado bloquea 409',
      async () => {
        // 1) Importar CSV pequeño que produce un SUGERIDO sin confirmar y revertirlo -> HTTP 200
        const csvSug = [
          'Fecha,Descripción operación,Nro. operación,Monto,Saldo',
          '10/03/2026,CARGO COURIER EXPRESO LIMA,,-220.00,780.00',
        ].join('\n');

        const confSug = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaRevId,
            periodo: '2026-03',
            perfilCodigo: 'BCP_ESTANDAR',
            nombreArchivo: 'rev_sugerido_202603.csv',
            contentType: 'text/csv',
            contenidoBase64: Buffer.from(csvSug, 'utf8').toString('base64'),
          }
        );
        assert.equal(confSug.status, 201, `Error confirmar CSV sugerido: ${confSug.text}`);
        const importSugId = confSug.body.data.importId as string;

        const matchSug = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
          sesionSenior.accessToken,
          'POST',
          { cuentaFinancieraId: cuentaRevId, periodo: '2026-03' }
        );
        assert.equal(matchSug.status, 200, `Error matching CSV sugerido: ${matchSug.text}`);
        assert.equal(matchSug.body?.data?.sugeridos, 1);

        const revSug = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/importaciones/${importSugId}/revertir`,
          sesionSenior.accessToken,
          'POST',
          { motivo: 'Reversión de lote con sugerencia pendiente sin confirmar' }
        );
        assert.equal(revSug.status, 200, `Error revertir lote con SUGERIDO: ${revSug.text}`);
        assert.equal(revSug.body?.data?.estado, 'REVERTIDO');

        // 2) Importar otro archivo, conciliar y desconciliar -> revertir debe devolver 409 IMPORTACION_CON_HISTORIAL_CONCILIACION
        const csvHist = [
          'Fecha,Descripción operación,Nro. operación,Monto,Saldo',
          '18/03/2026,PAGO PROVEEDOR HIST OP 9922,9922,-310.00,690.00',
        ].join('\n');

        const confHist = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaRevId,
            periodo: '2026-03',
            perfilCodigo: 'BCP_ESTANDAR',
            nombreArchivo: 'rev_historial_202603.csv',
            contentType: 'text/csv',
            contenidoBase64: Buffer.from(csvHist, 'utf8').toString('base64'),
          }
        );
        assert.equal(confHist.status, 201, `Error confirmar CSV historial: ${confHist.text}`);
        const importHistId = confHist.body.data.importId as string;

        const matchHist = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/ejecutar`,
          sesionSenior.accessToken,
          'POST',
          { cuentaFinancieraId: cuentaRevId, periodo: '2026-03' }
        );
        assert.equal(matchHist.status, 200, `Error matching CSV historial: ${matchHist.text}`);
        assert.equal(matchHist.body?.data?.autoConciliados, 1);
        const grupoHistId = matchHist.body.data.gruposCreados[0].id as string;

        const descHist = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/grupos/${grupoHistId}/desconciliar`,
          sesionSenior.accessToken,
          'POST',
          { motivo: 'Desconciliación previa a intento de reversión de lote' }
        );
        assert.equal(descHist.status, 200, `Error desconciliar grupo hist: ${descHist.text}`);
        assert.equal(descHist.body?.data?.estado, 'DESCONCILIADO');

        const revHistBloq = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/importaciones/${importHistId}/revertir`,
          sesionSenior.accessToken,
          'POST',
          { motivo: 'Intento de reversión con historial de desconciliación' }
        );
        assert.equal(revHistBloq.status, 409, `Esperado 409 al revertir con historial: ${revHistBloq.text}`);
        assert.equal(revHistBloq.body?.details?.codigo, 'IMPORTACION_CON_HISTORIAL_CONCILIACION');
      }
    );

    // ------------------------------------------------------------------
    // B7. RBAC aprenderRegla (MEDIO 5)
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B7. RBAC aprenderRegla (MEDIO 5): ASISTENTE_CONTABLE enviando aprenderRegla en POST /matching/manual -> 403 PERMISO_INSUFICIENTE',
      async () => {
        const asisManualRegla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/matching/manual`,
          sesionAsistente.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaIds: [linManualN1aId, linManualN1bId],
            libroItems: [{ origenLibro: 'MOVIMIENTO_TESORERIA', id: movManualN1Id }],
            observacion: 'Intento de asistente creando regla aprendida',
            aprenderRegla: {
              patronContraparte: 'REGLA_PROHIBIDA_ASISTENTE',
              tipoClasificacion: 'TRANSFERENCIA',
            },
          }
        );
        assert.equal(
          asisManualRegla.status,
          403,
          `Esperado 403 para ASISTENTE_CONTABLE con aprenderRegla: ${asisManualRegla.text}`
        );
        assert.equal(asisManualRegla.body?.details?.codigo, 'PERMISO_INSUFICIENTE');

        const reglaNoCreada = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT id FROM conciliacion_reglas_aprendidas
           WHERE empresa_id = $1 AND patron_contraparte = 'REGLA_PROHIBIDA_ASISTENTE'`,
          [empA]
        );
        assert.equal(reglaNoCreada.rows.length, 0);
      }
    );

    // ------------------------------------------------------------------
    // B8. Sincronía desconciliarPartida Fase 1 <-> Fase 3 (MEDIO 3)
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B8. Sincronía desconciliarPartida (MEDIO 3): POST /partidas/desconciliar sobre línea en grupo 1:N -> 409 GRUPO_CONCILIACION_COMPUESTO',
      async () => {
        const descFase1Compuesto = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/partidas/desconciliar`,
          sesionSenior.accessToken,
          'POST',
          {
            extractoLineaId: linManual1NId,
            motivo: 'Intento de desconciliar partida perteneciente a grupo compuesto 1:N',
          }
        );
        assert.equal(
          descFase1Compuesto.status,
          409,
          `Esperado 409 GRUPO_CONCILIACION_COMPUESTO: ${descFase1Compuesto.text}`
        );
        assert.equal(descFase1Compuesto.body?.details?.codigo, 'GRUPO_CONCILIACION_COMPUESTO');
      }
    );
  } finally {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }

    const cleanClient = await pool.connect();
    try {
      for (const empId of [empA, empB]) {
        await cleanClient.query(
          `SELECT set_config('app.empresa_id', $1, false),
                  set_config('app.current_empresa_id', $1, false),
                  set_config('app.usuario_id', $2, false),
                  set_config('app.current_user_id', $2, false)`,
          [empId, usrAdmin]
        );
        const sentencias = [
          [`DELETE FROM conciliacion_reglas_aprendidas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_item WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_grupo WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_import WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM anexos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM asiento_detalle WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM asientos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM subdiarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM periodos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM ejercicios WHERE empresa_id = $1`, [empId]],
        ] as const;

        for (const [sql, params] of sentencias) {
          try {
            await cleanClient.query(sql, [...params]);
          } catch {
            // Ignorar tablas protegidas por triggers append-only (auditoria_log, historial desconciliación, asientos contabilizados)
          }
        }
      }

      for (const uid of [usrAdmin, usrSenior, usrAsistente, usrAuditor, usrSoloB]) {
        await cleanClient.query(
          `SELECT set_config('app.usuario_id', $1, false), set_config('app.current_user_id', $1, false)`,
          [uid]
        );
        try {
          await cleanClient.query(`DELETE FROM refresh_tokens WHERE usuario_id = $1`, [uid]);
          await cleanClient.query(`DELETE FROM usuario_empresa WHERE usuario_id = $1`, [uid]);
        } catch {
          // Ignorar si ya fue limpiado
        }
      }

      for (const [sql, params] of [
        [`DELETE FROM empresas WHERE id = ANY($1::uuid[])`, [[empA, empB]]],
        [
          `DELETE FROM usuarios_estudio WHERE id = ANY($1::uuid[])`,
          [[usrAdmin, usrSenior, usrAsistente, usrAuditor, usrSoloB]],
        ],
        [`DELETE FROM tenants WHERE id = $1`, [tenantId]],
      ] as const) {
        try {
          await cleanClient.query(sql, [...params]);
        } catch {
          // Tablas inmutables conservan trazas de prueba con UUID único
        }
      }
    } finally {
      cleanClient.release();
    }

    setPostgresPool(null, false);
    await pool.end();
  }
}

async function main() {
  process.env.NODE_ENV = 'test';
  if (soloUnitarias) {
    process.env.DATABASE_URL = '';
  }

  await ejecutarBloqueUnitario();

  if (!soloUnitarias) {
    await ejecutarBloquePostgresReal();
  } else {
    console.log('\nℹ️  Modo --solo-unitarias activo: Bloque B (PostgreSQL) omitido intencionalmente.');
  }

  console.log('\n====================================================================');
  console.log(
    `🎉 CONCILIACIÓN BANCARIA V2 FASE 3: ${casosPasados}/${totalCasos} casos aprobados`
  );
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n❌ FALLO EN SUITE CONCILIACIÓN V2 FASE 3:', err);
  process.exitCode = 1;
});
