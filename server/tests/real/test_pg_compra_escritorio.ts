import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import type { CompraInput } from '../../services/compraService';

async function verificarCompra() {
  const connectionString = process.env.TEST_DATABASE_URL || parse(readFileSync('.env')).TEST_DATABASE_URL;
  const destino = new URL(connectionString);
  assert(['postgres:', 'postgresql:'].includes(destino.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname));
  assert.equal(destino.pathname, '/atlob_test');
  assert.equal(destino.username, 'contabilidad_app');
  assert([...destino.searchParams.keys()].every(k => k === 'sslmode'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  const { conContextoEmpresa, setPostgresPool } = await import('../../config/database');
  const { empresaRepository } = await import('../../repositories/empresaRepository');
  const { compraService } = await import('../../services/compraService');
  const { anexoService } = await import('../../services/anexoService');
  const { librosEEFFService } = await import('../../services/librosEEFFService');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });

  try {
    const client = await pool.connect();
    try {
      const { rows: [sesion] } = await client.query('SELECT current_database() AS base, current_user AS rol');
      assert.deepEqual(sesion, { base: 'atlob_test', rol: 'contabilidad_app' });
      await client.query('BEGIN');
      const puntos: string[] = [];
      // Conserva las transacciones internas y permite revertir todos los fixtures al final.
      setPostgresPool({
        query: client.query.bind(client),
        connect: async () => ({
          query: async (sql: string, params?: unknown[]) => {
            if (sql === 'BEGIN') {
              const punto = `compra_escritorio_${puntos.length}`;
              await client.query(`SAVEPOINT ${punto}`);
              puntos.push(punto);
            } else if (sql === 'ROLLBACK' || sql === 'COMMIT') {
              const punto = puntos.pop();
              if (sql === 'ROLLBACK') await client.query(`ROLLBACK TO SAVEPOINT ${punto}`);
              await client.query(`RELEASE SAVEPOINT ${punto}`);
            } else {
              return client.query(sql, params);
            }
          },
          release() {},
        }),
      });

      const usuarioId = randomUUID();
      const tenantId = randomUUID();
      await client.query("INSERT INTO tenants (id,nombre) VALUES ($1,'Prueba escritorio')", [tenantId]);
      await client.query("INSERT INTO usuarios_estudio (id,email,password_hash,nombre,rol_global) VALUES ($1,$2,'fixture','Prueba escritorio','ADMINISTRADOR')", [usuarioId, `${usuarioId}@example.invalid`]);
      const empresa = await empresaRepository.crear({
        tenantId, usuarioId, codigoEmpresa: usuarioId.slice(0, 8), ruc: `20${String(Date.now()).slice(-9)}`,
        razonSocial: 'Empresa prueba escritorio', regimenTributario: 'REGIMEN_GENERAL', domicilioFiscal: 'Prueba escritorio',
        monedaPrincipal: 'PEN', ejercicio: 2026, metodoInventario: 'PERIODICO',
      });
      assert.equal(empresa.metodoInventario, 'PERIODICO');
      const periodos = await client.query('SELECT codigo_periodo FROM periodos WHERE empresa_id=$1 ORDER BY mes', [empresa.id]);
      assert.equal(periodos.rowCount, 12);
      assert.equal(periodos.rows[8].codigo_periodo, '2026-09');
      console.log('EMPRESA_EJERCICIO_12_PERIODOS=OK');

      await conContextoEmpresa(empresa.id, usuarioId, async () => {
        const proveedor = await anexoService.crear(empresa.id, { tipoDocumento: '6', numeroDocumento: '20999998765', razonSocial: 'Proveedor de prueba', tipoEntidad: 'PROVEEDOR' });
        const entrada: CompraInput = {
          periodoId: '2026-09', fechaEmision: '2026-09-07', fechaContable: '2026-09-07', tipoComprobante: '01',
          serie: 'F001', numero: '900001', proveedorId: proveedor.id, baseGravada: 100, igv: 18, total: 118, formaPago: 'CONTADO',
        };
        const compra = await compraService.registrar(empresa.id, entrada, usuarioId);
        assert.equal(compra.estado, 'REGISTRADO');
        assert.match(compra.asientoNumero ?? '', /^0109/);
        assert.equal((await compraService.listar(empresa.id, { periodoId: '2026-09' })).items[0].total, 118);
        assert((await compraService.obtenerRegistroCompras(empresa.id, '2026-09')).cuadreLibroDiario.estaCuadrado);
        console.log('COMPRA_PG_Y_ASIENTO=OK');

        const libro = await librosEEFFService.generarLibroDiario(empresa.id, '2026-09');
        assert.equal(libro.totalAsientos, 1);
        assert.equal(libro.totalDebe, 118);
        assert.equal(libro.totalHaber, 118);
        assert.equal(libro.asientos[0].asientoNumero, compra.asientoNumero);
        console.log('LIBRO_DIARIO_PG_118_118=OK');

        const borrador = await compraService.crearBorrador(empresa.id, { ...entrada, numero: '900002' }, usuarioId);
        assert.equal((await compraService.obtenerPorId(empresa.id, borrador.id))?.proveedorId, proveedor.id);
        const registrado = await compraService.registrarBorradorCompra(borrador.id, usuarioId, empresa.id);
        assert.equal(registrado.id, borrador.id);
        assert.match(registrado.asientoNumero ?? '', /^0109/);
        console.log('BORRADOR_PG_REGISTRADO=OK');
      });
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      setPostgresPool(null, false);
      console.log('ROLLBACK_COMPRA_ESCRITORIO=OK');
    }
  } finally {
    await pool.end();
  }
}

verificarCompra().catch((error: Error & { code?: string; constraint?: string }) => {
  console.error('COMPRA_ESCRITORIO_FALLIDA', error.code || error.name, error.message, error.constraint || '', error.stack?.split('\n').find(line => line.includes('test_pg_compra_escritorio.ts:'))?.trim() || '');
  process.exitCode = 1;
});
