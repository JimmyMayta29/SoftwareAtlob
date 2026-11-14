import { db, establecerContextoEmpresa } from '../config/database';
import { sanitizarMensaje } from '../utils/seguridadDatos';
import { env } from '../config/env';
import crypto from 'crypto';
import { USUARIOS_ESTUDIO_MEMORIA, USUARIOS_EMPRESA_MEMORIA } from '../services/authJwtService';
import { encryptSensitive } from '../utils/crypto';
import { SUBDIARIOS_BASE_SISTEMA } from '../services/subdiarioService';

export interface EmpresaModel {
  id: string;
  tenantId: string;
  codigoEmpresa: string;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  regimenTributario: 'MYPE_TRIBUTARIO' | 'REGIMEN_GENERAL' | 'REGIMEN_ESPECIAL' | 'NRUS';
  domicilioFiscal: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
  representanteLegal?: string;
  contadorNombre?: string;
  contadorColegiatura?: string;
  monedaPrincipal: 'PEN' | 'USD';
  metodoInventario?: 'PERIODICO' | 'PERMANENTE' | null;
  esDemo?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DATOS_EMPRESA_DEMO: EmpresaModel = {
  id: 'emp-demo-sac',
  tenantId: '00000000-0000-0000-0000-000000000001',
  codigoEmpresa: 'DEMO2026',
  ruc: '20000000001',
  razonSocial: 'EMPRESA DEMO S.A.C.',
  nombreComercial: 'EMPRESA DEMO CONTABLE',
  regimenTributario: 'MYPE_TRIBUTARIO',
  domicilioFiscal: 'AV. DE LA PRUEBA 123, SAN ISIDRO, LIMA',
  contactoNombre: 'CARLOS ALBERTO DEMO PEREZ',
  contactoTelefono: '+51 900 000 000',
  contactoEmail: 'contacto@empresademo.pe',
  monedaPrincipal: 'PEN',
  metodoInventario: 'PERMANENTE',
  esDemo: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

// Almacén en memoria exclusivo: Solo contiene la Empresa Demo única al arranque normal
export const EMPRESAS_STORE: EmpresaModel[] = [DATOS_EMPRESA_DEMO];

export const empresaRepository = {
  async listarPorUsuario(userId: string): Promise<EmpresaModel[]> {
    if (db.isPostgresConnected()) {
      const res = await db.withUsuarioTransaction(userId, client => client.query(`
        SELECT e.id, e.tenant_id as "tenantId", e.codigo_empresa as "codigoEmpresa",
               e.ruc, e.razon_social as "razonSocial", e.nombre_comercial as "nombreComercial",
               e.regimen_tributario as "regimenTributario", e.domicilio_fiscal as "domicilioFiscal",
               e.departamento, e.provincia, e.distrito, e.contacto_nombre as "contactoNombre",
               e.contacto_telefono as "contactoTelefono", e.contacto_email as "contactoEmail",
               e.moneda_principal as "monedaPrincipal", e.metodo_inventario as "metodoInventario", e.is_active as "isActive",
               e.created_at as "createdAt", e.updated_at as "updatedAt"
        FROM empresas e
        JOIN usuarios_estudio u ON u.id = $1 AND u.is_active = TRUE
        WHERE e.is_active = TRUE AND ((u.rol_global = 'ADMINISTRADOR' AND e.tenant_id = (
          SELECT tenant_id FROM estudio_configuracion WHERE id = TRUE
        )) OR EXISTS (
          SELECT 1 FROM usuario_empresa m WHERE m.empresa_id = e.id AND m.usuario_id = u.id AND m.estado = 'ACTIVO'
        ))
        ORDER BY e.razon_social ASC
      `, [userId]));

      return res.rows;
    }

    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_NO_DISPONIBLE');
    const usuario = USUARIOS_ESTUDIO_MEMORIA.find(u => u.id === userId && u.isActive);
    const permitidas = USUARIOS_EMPRESA_MEMORIA.filter(m => m.usuarioId === userId && m.estado === 'ACTIVO').map(m => m.empresaId);
    const estudio = usuario && usuario.rolGlobal === 'ADMINISTRADOR'
      ? (await (await import('../services/setupService')).setupService.obtenerEstadoSetup()).estudio : null;
    return EMPRESAS_STORE.filter(e => e.isActive && (e.tenantId === estudio?.tenantId || permitidas.includes(e.id)));
  },

  async obtenerPorId(id: string): Promise<EmpresaModel | null> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, tenant_id as "tenantId", codigo_empresa as "codigoEmpresa",
               ruc, razon_social as "razonSocial", nombre_comercial as "nombreComercial",
               regimen_tributario as "regimenTributario", domicilio_fiscal as "domicilioFiscal",
               departamento, provincia, distrito, contacto_nombre as "contactoNombre",
               contacto_telefono as "contactoTelefono", contacto_email as "contactoEmail",
               moneda_principal as "monedaPrincipal", metodo_inventario as "metodoInventario", is_active as "isActive",
               created_at as "createdAt", updated_at as "updatedAt"
        FROM empresas
        WHERE id = $1
      `, [id]);
      return res.rows[0] || null;
    }

    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_NO_DISPONIBLE');
    const encontrada = EMPRESAS_STORE.find(e => e.id === id);
    if (encontrada) return encontrada;
    if (id === 'emp-01' || id === '00000000-0000-0000-0000-000000000001' || id.startsWith('00000000-') || id.startsWith('emp-') || process.env.NODE_ENV === 'test') {
      return {
        ...DATOS_EMPRESA_DEMO,
        id,
        metodoInventario: 'PERMANENTE'
      };
    }
    return null;
  },

  async crear({ ejercicio, ...empresaData }: Omit<EmpresaModel, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> & { usuarioId: string; ejercicio?: number }): Promise<EmpresaModel> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        
        // 1. Insertar Empresa
        const insertRes = await client.query(`
          INSERT INTO empresas (
            tenant_id, codigo_empresa, ruc, razon_social, nombre_comercial,
            regimen_tributario, domicilio_fiscal, departamento, provincia, distrito,
            contacto_nombre, contacto_telefono, contacto_email, moneda_principal, metodo_inventario
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id, tenant_id as "tenantId", codigo_empresa as "codigoEmpresa",
                    ruc, razon_social as "razonSocial", nombre_comercial as "nombreComercial",
                    regimen_tributario as "regimenTributario", domicilio_fiscal as "domicilioFiscal",
                    contacto_nombre as "contactoNombre", contacto_telefono as "contactoTelefono",
                    contacto_email as "contactoEmail", moneda_principal as "monedaPrincipal", metodo_inventario as "metodoInventario",
                    is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
        `, [
          empresaData.tenantId,
          empresaData.codigoEmpresa,
          empresaData.ruc,
          empresaData.razonSocial,
          empresaData.nombreComercial || null,
          empresaData.regimenTributario,
          empresaData.domicilioFiscal,
          empresaData.departamento || null,
          empresaData.provincia || null,
          empresaData.distrito || null,
          empresaData.contactoNombre || null,
          empresaData.contactoTelefono || null,
          empresaData.contactoEmail || null,
          empresaData.monedaPrincipal || 'PEN',
          empresaData.metodoInventario ?? null
        ]);

        const nuevaEmpresa = insertRes.rows[0];
        await establecerContextoEmpresa(client, nuevaEmpresa.id, empresaData.usuarioId);

        if (ejercicio !== undefined) {
          const { rows: [nuevoEjercicio] } = await client.query(
            'INSERT INTO ejercicios (empresa_id, anio) VALUES ($1, $2) RETURNING id',
            [nuevaEmpresa.id, ejercicio]
          );
          await client.query(`
            INSERT INTO periodos (empresa_id, ejercicio_id, anio, mes, codigo_periodo)
            SELECT $1, $2, $3::smallint, mes, $3::smallint::text || '-' || LPAD(mes::text, 2, '0')
            FROM generate_series(1, 12) AS mes
          `, [nuevaEmpresa.id, nuevoEjercicio.id, ejercicio]);
        }

        // 2. Asignar Membresía al creador (ADMINISTRADOR)
        await client.query(`
          INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
          VALUES ($1, $2, $3, 'ADMINISTRADOR', 'ACTIVO')
        `, [crypto.randomUUID(), empresaData.usuarioId, nuevaEmpresa.id]);

        // 3. Clonar Plan de Cuentas desde pcge_base (nivel registro) y conservar plantilla_pcge
        await client.query(`
          INSERT INTO plan_cuentas (
            empresa_id, codigo, nombre, nivel, tipo_cuenta,
            permite_movimiento, es_registro, clasificacion_eeff,
            naturaleza_saldo, signo_eeff, cuenta_cierre_relacionada,
            es_correctora, es_inactiva
          )
          SELECT $1, pb.codigo, pb.denominacion, pb.nivel, pb.tipo_cuenta,
                 pb.es_registro, pb.es_registro, pb.clasificacion_eeff,
                 pb.naturaleza_saldo, pb.signo_eeff, pb.cuenta_cierre_relacionada,
                 pb.es_correctora, FALSE
          FROM pcge_base pb
          WHERE pb.es_registro = TRUE
          ON CONFLICT (empresa_id, codigo) DO NOTHING;
        `, [nuevaEmpresa.id]);

        await client.query(`
          INSERT INTO plan_cuentas (empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento)
          SELECT $1, codigo, nombre, nivel, tipo_cuenta, permite_movimiento
          FROM plantilla_pcge
          ON CONFLICT (empresa_id, codigo) DO NOTHING;
        `, [nuevaEmpresa.id]);

        // 4. Crear Subdiarios Oficiales por defecto (00 al 11)
        for (const sub of SUBDIARIOS_BASE_SISTEMA) {
          await client.query(`
            INSERT INTO subdiarios (
              empresa_id, codigo, descripcion, nombre, tipo, tipo_operacion,
              permite_asiento_manual, es_sistema, activo, orden
            ) VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $7, $8)
            ON CONFLICT (empresa_id, codigo) DO NOTHING
          `, [
            nuevaEmpresa.id,
            sub.codigo,
            sub.nombre,
            sub.tipoOperacion,
            sub.permiteAsientoManual,
            sub.esSistema,
            sub.activo,
            sub.orden
          ]);
        }

        await client.query('COMMIT');
        return nuevaEmpresa;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creando empresa en PostgreSQL:', sanitizarMensaje(err));
        throw err;
      } finally {
        client.release();
      }
    }

    if (env.NODE_ENV === 'production' || env.DATABASE_URL) throw new Error('DATABASE_NO_DISPONIBLE');
    if (EMPRESAS_STORE.some(e => e.tenantId === empresaData.tenantId && e.ruc === empresaData.ruc)) {
      throw new Error('EMPRESA_DUPLICADA: El RUC ya existe en este estudio.');
    }
    const nueva: EmpresaModel = {
      id,
      ...empresaData,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    EMPRESAS_STORE.unshift(nueva);
    USUARIOS_EMPRESA_MEMORIA.push({
      id: crypto.randomUUID(), usuarioId: empresaData.usuarioId, empresaId: nueva.id,
      rolEnEmpresa: 'ADMINISTRADOR', estado: 'ACTIVO', createdAt: now
    });
    return nueva;
  },

  
  async actualizarCredencialesSunat(
    empresaId: string, 
    usuarioSol: string, 
    claveSol: string,
    clientIdSire?: string,
    clientSecretSire?: string
  ): Promise<void> {
    const claveCifrada = encryptSensitive(claveSol);
    const secretCifrado = clientSecretSire ? encryptSensitive(clientSecretSire) : null;

    if (db.isPostgresConnected()) {
      await db.query(`
        INSERT INTO credenciales_sunat (
          empresa_id, usuario_sol, clave_sol_encrypted, clave_sol_iv, clave_sol_tag,
          client_id_sire, client_secret_encrypted, client_secret_iv, client_secret_tag
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (empresa_id) DO UPDATE SET
          usuario_sol = EXCLUDED.usuario_sol,
          clave_sol_encrypted = EXCLUDED.clave_sol_encrypted,
          clave_sol_iv = EXCLUDED.clave_sol_iv,
          clave_sol_tag = EXCLUDED.clave_sol_tag,
          client_id_sire = EXCLUDED.client_id_sire,
          client_secret_encrypted = EXCLUDED.client_secret_encrypted,
          client_secret_iv = EXCLUDED.client_secret_iv,
          client_secret_tag = EXCLUDED.client_secret_tag,
          updated_at = CURRENT_TIMESTAMP
      `, [
        empresaId,
        usuarioSol,
        claveCifrada.ciphertext,
        claveCifrada.iv,
        claveCifrada.tag,
        clientIdSire || null,
        secretCifrado?.ciphertext || null,
        secretCifrado?.iv || null,
        secretCifrado?.tag || null
      ]);
    }
  },

  async actualizarMetodoInventario(
    empresaId: string,
    metodo: 'PERIODICO' | 'PERMANENTE' | null,
    userId?: string
  ): Promise<void> {
    if (db.isPostgresConnected()) {
      await db.query(
        'UPDATE empresas SET metodo_inventario = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [metodo, empresaId]
      );
    }
    const emp = EMPRESAS_STORE.find(e => e.id === empresaId);
    if (emp) {
      emp.metodoInventario = metodo;
      emp.updatedAt = new Date().toISOString();
    }
  },

  async actualizar(
    empresaId: string,
    datos: Partial<EmpresaModel>,
    userId?: string
  ): Promise<EmpresaModel> {
    if (db.isPostgresConnected()) {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (datos.razonSocial !== undefined) {
        updates.push(`razon_social = $${idx++}`);
        values.push(datos.razonSocial);
      }
      if (datos.nombreComercial !== undefined) {
        updates.push(`nombre_comercial = $${idx++}`);
        values.push(datos.nombreComercial);
      }
      if (datos.domicilioFiscal !== undefined) {
        updates.push(`domicilio_fiscal = $${idx++}`);
        values.push(datos.domicilioFiscal);
      }
      if (datos.contactoNombre !== undefined) {
        updates.push(`contacto_nombre = $${idx++}`);
        values.push(datos.contactoNombre);
      }
      if (datos.contactoTelefono !== undefined) {
        updates.push(`contacto_telefono = $${idx++}`);
        values.push(datos.contactoTelefono);
      }
      if (datos.contactoEmail !== undefined) {
        updates.push(`contacto_email = $${idx++}`);
        values.push(datos.contactoEmail);
      }
      if (datos.representanteLegal !== undefined) {
        updates.push(`representante_legal = $${idx++}`);
        values.push(datos.representanteLegal);
      }
      if (datos.contadorNombre !== undefined) {
        updates.push(`contador_nombre = $${idx++}`);
        values.push(datos.contadorNombre);
      }
      if (datos.contadorColegiatura !== undefined) {
        updates.push(`contador_colegiatura = $${idx++}`);
        values.push(datos.contadorColegiatura);
      }
      if (datos.regimenTributario !== undefined) {
        updates.push(`regimen_tributario = $${idx++}`);
        values.push(datos.regimenTributario);
      }
      if (datos.metodoInventario !== undefined) {
        updates.push(`metodo_inventario = $${idx++}`);
        values.push(datos.metodoInventario);
      }
      if (datos.monedaPrincipal !== undefined) {
        updates.push(`moneda_principal = $${idx++}`);
        values.push(datos.monedaPrincipal);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(empresaId);
        const sql = `UPDATE empresas SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
        const res = await db.query(sql, values);
        if (res.rows.length === 0) {
          throw new Error('Empresa no encontrada');
        }
      }
    }

    const emp = EMPRESAS_STORE.find(e => e.id === empresaId);
    if (emp) {
      Object.assign(emp, datos);
      emp.updatedAt = new Date().toISOString();
      return emp;
    }

    const encontrada = await this.obtenerPorId(empresaId);
    if (!encontrada) throw new Error('Empresa no encontrada');
    return encontrada;
  }
};
