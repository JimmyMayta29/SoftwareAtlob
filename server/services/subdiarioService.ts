import { db } from '../config/database';
import { auditoriaChainService } from './auditoriaChainService';

export type TipoOperacionSubdiario =
  | 'APERTURA'
  | 'COMPRAS'
  | 'VENTAS'
  | 'PLANILLA'
  | 'HONORARIOS'
  | 'CAJA'
  | 'BANCO'
  | 'DIARIO'
  | 'PROVISIONES'
  | 'AJUSTES'
  | 'CIERRE';

export interface SubdiarioItem {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  tipoOperacion: TipoOperacionSubdiario;
  permiteAsientoManual: boolean;
  cuentaFinancieraId?: string | null;
  esSistema: boolean;
  activo: boolean;
  orden: number;
  creadoPor?: string | null;
  creadoEn: string;
}

export const SUBDIARIOS_BASE_SISTEMA: Omit<SubdiarioItem, 'id' | 'empresaId' | 'creadoEn'>[] = [
  { codigo: '00', nombre: 'Apertura', tipoOperacion: 'APERTURA', permiteAsientoManual: true, esSistema: true, activo: true, orden: 0 },
  { codigo: '01', nombre: 'Registro de Compras (RCE)', tipoOperacion: 'COMPRAS', permiteAsientoManual: false, esSistema: true, activo: true, orden: 1 },
  { codigo: '02', nombre: 'Registro de Ventas (RVIE)', tipoOperacion: 'VENTAS', permiteAsientoManual: false, esSistema: true, activo: true, orden: 2 },
  { codigo: '03', nombre: 'Cobranzas y Caja', tipoOperacion: 'CAJA', permiteAsientoManual: false, esSistema: true, activo: true, orden: 3 },
  { codigo: '04', nombre: 'Pagos a Proveedores', tipoOperacion: 'BANCO', permiteAsientoManual: false, esSistema: true, activo: true, orden: 4 },
  { codigo: '05', nombre: 'Cuentas Corrientes y SPOT', tipoOperacion: 'BANCO', permiteAsientoManual: false, esSistema: true, activo: true, orden: 5 },
  { codigo: '06', nombre: 'Recibos por Honorarios', tipoOperacion: 'HONORARIOS', permiteAsientoManual: false, esSistema: true, activo: true, orden: 6 },
  { codigo: '07', nombre: 'Planilla de Remuneraciones', tipoOperacion: 'PLANILLA', permiteAsientoManual: false, esSistema: true, activo: true, orden: 7 },
  { codigo: '08', nombre: 'Ajustes', tipoOperacion: 'AJUSTES', permiteAsientoManual: true, esSistema: true, activo: true, orden: 8 },
  { codigo: '09', nombre: 'Cierre del ejercicio', tipoOperacion: 'CIERRE', permiteAsientoManual: true, esSistema: true, activo: true, orden: 9 },
  { codigo: '10', nombre: 'Diario General', tipoOperacion: 'DIARIO', permiteAsientoManual: true, esSistema: true, activo: true, orden: 10 },
  { codigo: '11', nombre: 'Provisiones Varias', tipoOperacion: 'PROVISIONES', permiteAsientoManual: true, esSistema: true, activo: true, orden: 11 },
];

export const SUBDIARIOS_EMPRESA_MEMORIA = new Map<string, SubdiarioItem[]>();

function obtenerListaMemoria(empresaId: string): SubdiarioItem[] {
  let list = SUBDIARIOS_EMPRESA_MEMORIA.get(empresaId);
  if (!list) {
    list = SUBDIARIOS_BASE_SISTEMA.map((b, idx) => ({
      ...b,
      id: `sub-${empresaId.slice(0, 8)}-${b.codigo}`,
      empresaId,
      descripcion: b.nombre,
      creadoEn: new Date().toISOString()
    }));
    SUBDIARIOS_EMPRESA_MEMORIA.set(empresaId, list);
  }
  return list;
}

export const subdiarioService = {
  /**
   * Inicializa los subdiarios base del sistema para una empresa
   */
  async inicializarSubdiariosEmpresa(empresaId: string): Promise<void> {
    if (db.isPostgresConnected()) {
      for (const sub of SUBDIARIOS_BASE_SISTEMA) {
        await db.query(`
          INSERT INTO subdiarios (
            empresa_id, codigo, descripcion, nombre, tipo, tipo_operacion,
            permite_asiento_manual, es_sistema, activo, orden
          ) VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $7, $8)
          ON CONFLICT (empresa_id, codigo) DO UPDATE
          SET nombre = EXCLUDED.nombre,
              tipo_operacion = EXCLUDED.tipo_operacion,
              permite_asiento_manual = EXCLUDED.permite_asiento_manual,
              es_sistema = EXCLUDED.es_sistema,
              orden = EXCLUDED.orden
        `, [
          empresaId,
          sub.codigo,
          sub.nombre,
          sub.tipoOperacion,
          sub.permiteAsientoManual,
          sub.esSistema,
          sub.activo,
          sub.orden
        ]);
      }
      return;
    }

    obtenerListaMemoria(empresaId);
  },

  /**
   * Lista todos los subdiarios de la empresa
   */
  async listar(empresaId: string, options?: { soloActivos?: boolean; permiteManual?: boolean }): Promise<SubdiarioItem[]> {
    if (db.isPostgresConnected()) {
      let sql = `
        SELECT id, empresa_id as "empresaId", codigo,
               COALESCE(nombre, descripcion) as nombre,
               COALESCE(tipo_operacion, tipo) as "tipoOperacion",
               permite_asiento_manual as "permiteAsientoManual",
               cuenta_financiera_id as "cuentaFinancieraId",
               es_sistema as "esSistema",
               COALESCE(activo, is_active, true) as activo,
               orden,
               creado_por as "creadoPor",
               creado_en as "creadoEn"
        FROM subdiarios
        WHERE empresa_id = $1
      `;
      const params: any[] = [empresaId];
      let pIdx = 2;

      if (options?.soloActivos) {
        sql += ` AND COALESCE(activo, is_active, true) = true`;
      }
      if (options?.permiteManual !== undefined) {
        sql += ` AND permite_asiento_manual = $${pIdx++}`;
        params.push(options.permiteManual);
      }

      sql += ` ORDER BY orden ASC, codigo ASC`;

      const res = await db.query(sql, params);
      if (res.rows.length === 0) {
        // Inicializar si estaba vacía
        await this.inicializarSubdiariosEmpresa(empresaId);
        const resReintento = await db.query(sql, params);
        return resReintento.rows;
      }
      return res.rows;
    }

    let list = obtenerListaMemoria(empresaId);
    if (options?.soloActivos) {
      list = list.filter(s => s.activo);
    }
    if (options?.permiteManual !== undefined) {
      list = list.filter(s => s.permiteAsientoManual === options.permiteManual);
    }
    return list.sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo));
  },

  /**
   * Obtiene un subdiario por ID
   */
  async obtenerPorId(empresaId: string, id: string): Promise<SubdiarioItem | null> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, empresa_id as "empresaId", codigo,
               COALESCE(nombre, descripcion) as nombre,
               COALESCE(tipo_operacion, tipo) as "tipoOperacion",
               permite_asiento_manual as "permiteAsientoManual",
               cuenta_financiera_id as "cuentaFinancieraId",
               es_sistema as "esSistema",
               COALESCE(activo, is_active, true) as activo,
               orden,
               creado_por as "creadoPor",
               creado_en as "creadoEn"
        FROM subdiarios
        WHERE empresa_id = $1 AND id = $2
      `, [empresaId, id]);
      return res.rows[0] || null;
    }

    const list = obtenerListaMemoria(empresaId);
    return list.find(s => s.id === id) || null;
  },

  /**
   * Obtiene un subdiario por su código de 2 dígitos
   */
  async obtenerPorCodigo(empresaId: string, codigo: string): Promise<SubdiarioItem | null> {
    const codNorm = codigo.padStart(2, '0');
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, empresa_id as "empresaId", codigo,
               COALESCE(nombre, descripcion) as nombre,
               COALESCE(tipo_operacion, tipo) as "tipoOperacion",
               permite_asiento_manual as "permiteAsientoManual",
               cuenta_financiera_id as "cuentaFinancieraId",
               es_sistema as "esSistema",
               COALESCE(activo, is_active, true) as activo,
               orden,
               creado_por as "creadoPor",
               creado_en as "creadoEn"
        FROM subdiarios
        WHERE empresa_id = $1 AND codigo = $2
      `, [empresaId, codNorm]);
      return res.rows[0] || null;
    }

    const list = obtenerListaMemoria(empresaId);
    return list.find(s => s.codigo === codNorm) || null;
  },

  /**
   * Obtiene el subdiario asignado a un tipo de operación automática
   */
  async obtenerPorTipoOperacion(empresaId: string, tipoOperacion: TipoOperacionSubdiario): Promise<SubdiarioItem> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, empresa_id as "empresaId", codigo,
               COALESCE(nombre, descripcion) as nombre,
               COALESCE(tipo_operacion, tipo) as "tipoOperacion",
               permite_asiento_manual as "permiteAsientoManual",
               cuenta_financiera_id as "cuentaFinancieraId",
               es_sistema as "esSistema",
               COALESCE(activo, is_active, true) as activo,
               orden,
               creado_por as "creadoPor",
               creado_en as "creadoEn"
        FROM subdiarios
        WHERE empresa_id = $1 AND (tipo_operacion = $2 OR tipo = $2) AND COALESCE(activo, is_active, true) = true
        ORDER BY es_sistema DESC, orden ASC, codigo ASC
        LIMIT 1
      `, [empresaId, tipoOperacion]);

      if (res.rows.length > 0) return res.rows[0];
    }

    const list = obtenerListaMemoria(empresaId);
    const encontrado = list.find(s => s.tipoOperacion === tipoOperacion && s.activo);
    if (encontrado) return encontrado;

    // Fallback por defecto según normativa
    const fallbackBase = SUBDIARIOS_BASE_SISTEMA.find(b => b.tipoOperacion === tipoOperacion) || SUBDIARIOS_BASE_SISTEMA[0];
    return {
      ...fallbackBase,
      id: `sub-${empresaId.slice(0, 8)}-${fallbackBase.codigo}`,
      empresaId,
      creadoEn: new Date().toISOString()
    };
  },

  /**
   * Crea un nuevo subdiario personalizado (solo ADMINISTRADOR / ADMIN_ESTUDIO)
   */
  async crearSubdiario(
    empresaId: string,
    data: {
      codigo: string;
      nombre: string;
      tipoOperacion: TipoOperacionSubdiario;
      cuentaFinancieraId?: string | null;
      permiteAsientoManual?: boolean;
    },
    userId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<SubdiarioItem> {
    // 1. Validar código de 2 dígitos
    const codigo = data.codigo.trim().padStart(2, '0');
    if (!/^\d{2}$/.test(codigo)) {
      throw new Error('CODIGO_INVALIDO: El código de subdiario debe constar exactamente de 2 dígitos numéricos.');
    }

    // 2. Validar tipos permitidos para creación por usuario
    const tiposPermitidosUsuario: TipoOperacionSubdiario[] = ['CAJA', 'BANCO', 'DIARIO', 'PROVISIONES', 'AJUSTES'];
    if (!tiposPermitidosUsuario.includes(data.tipoOperacion)) {
      throw new Error(`TIPO_NO_PERMITIDO: Los subdiarios adicionales solo pueden ser de tipo CAJA, BANCO, DIARIO, PROVISIONES o AJUSTES.`);
    }

    // 3. Validar cuenta financiera si es BANCO o CAJA
    if ((data.tipoOperacion === 'BANCO' || data.tipoOperacion === 'CAJA') && data.cuentaFinancieraId) {
      // Opcional o validable
    }

    // 4. Determina si permite asiento manual
    const permiteManual = data.tipoOperacion === 'DIARIO' ||
      data.tipoOperacion === 'PROVISIONES' ||
      data.tipoOperacion === 'AJUSTES' ||
      Boolean(data.permiteAsientoManual);

    if (db.isPostgresConnected()) {
      const existe = await db.query(
        'SELECT 1 FROM subdiarios WHERE empresa_id = $1 AND codigo = $2',
        [empresaId, codigo]
      );
      if (existe.rows.length > 0) {
        throw new Error(`CODIGO_DUPLICADO: Ya existe un subdiario con el código "${codigo}" en esta empresa.`);
      }

      const res = await db.query(`
        INSERT INTO subdiarios (
          empresa_id, codigo, descripcion, nombre, tipo, tipo_operacion,
          permite_asiento_manual, cuenta_financiera_id, es_sistema, activo,
          orden, creado_por, creado_en
        ) VALUES (
          $1, $2, $3, $3, $4, $4,
          $5, $6, false, true,
          20, $7, CURRENT_TIMESTAMP
        )
        RETURNING id, empresa_id as "empresaId", codigo, nombre,
                  tipo_operacion as "tipoOperacion", permite_asiento_manual as "permiteAsientoManual",
                  cuenta_financiera_id as "cuentaFinancieraId", es_sistema as "esSistema",
                  activo, orden, creado_por as "creadoPor", creado_en as "creadoEn"
      `, [
        empresaId,
        codigo,
        data.nombre.trim(),
        data.tipoOperacion,
        permiteManual,
        data.cuentaFinancieraId || null,
        userId
      ]);

      const nuevo = res.rows[0];

      await auditoriaChainService.registrar({
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'subdiarios',
        registroId: nuevo.id,
        accion: 'SUBDIARIO_CREADO',
        datosNuevos: { codigo, nombre: data.nombre, tipoOperacion: data.tipoOperacion }
      });

      return nuevo;
    }

    // Modo Memoria
    const list = obtenerListaMemoria(empresaId);
    if (list.some(s => s.codigo === codigo)) {
      throw new Error(`CODIGO_DUPLICADO: Ya existe un subdiario con el código "${codigo}" en esta empresa.`);
    }

    const nuevo: SubdiarioItem = {
      id: `sub-${empresaId.slice(0, 8)}-${codigo}`,
      empresaId,
      codigo,
      nombre: data.nombre.trim(),
      descripcion: data.nombre.trim(),
      tipoOperacion: data.tipoOperacion,
      permiteAsientoManual: permiteManual,
      cuentaFinancieraId: data.cuentaFinancieraId || null,
      esSistema: false,
      activo: true,
      orden: 20,
      creadoPor: userId,
      creadoEn: new Date().toISOString()
    };

    list.push(nuevo);

    await auditoriaChainService.registrar({
      empresaId,
      usuarioId: userId,
      tablaAfectada: 'subdiarios',
      registroId: nuevo.id,
      accion: 'SUBDIARIO_CREADO',
      datosNuevos: { codigo, nombre: data.nombre, tipoOperacion: data.tipoOperacion }
    });

    return nuevo;
  },

  /**
   * Actualiza el nombre o estado de un subdiario (el código es inmutable)
   */
  async actualizarSubdiario(
    empresaId: string,
    id: string,
    data: {
      nombre?: string;
      activo?: boolean;
      cuentaFinancieraId?: string | null;
      permiteAsientoManual?: boolean;
    },
    userId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<SubdiarioItem> {
    const actual = await this.obtenerPorId(empresaId, id);
    if (!actual) throw new Error('SUBDIARIO_NO_ENCONTRADO: El subdiario no existe.');

    if (db.isPostgresConnected()) {
      const res = await db.query(`
        UPDATE subdiarios
        SET nombre = COALESCE($3, nombre),
            descripcion = COALESCE($3, descripcion),
            activo = COALESCE($4, activo, is_active),
            is_active = COALESCE($4, is_active, activo),
            cuenta_financiera_id = COALESCE($5, cuenta_financiera_id),
            permite_asiento_manual = COALESCE($6, permite_asiento_manual)
        WHERE empresa_id = $1 AND id = $2
        RETURNING id, empresa_id as "empresaId", codigo,
                  COALESCE(nombre, descripcion) as nombre,
                  COALESCE(tipo_operacion, tipo) as "tipoOperacion",
                  permite_asiento_manual as "permiteAsientoManual",
                  cuenta_financiera_id as "cuentaFinancieraId",
                  es_sistema as "esSistema",
                  COALESCE(activo, is_active, true) as activo,
                  orden, creado_por as "creadoPor", creado_en as "creadoEn"
      `, [
        empresaId,
        id,
        data.nombre?.trim(),
        data.activo,
        data.cuentaFinancieraId !== undefined ? data.cuentaFinancieraId : null,
        data.permiteAsientoManual
      ]);

      const actualizado = res.rows[0];

      await auditoriaChainService.registrar({
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'subdiarios',
        registroId: id,
        accion: 'SUBDIARIO_ACTUALIZADO',
        datosAnteriores: { nombre: actual.nombre, activo: actual.activo },
        datosNuevos: { nombre: actualizado.nombre, activo: actualizado.activo }
      });

      return actualizado;
    }

    if (data.nombre) {
      actual.nombre = data.nombre.trim();
      actual.descripcion = data.nombre.trim();
    }
    if (data.activo !== undefined) actual.activo = data.activo;
    if (data.cuentaFinancieraId !== undefined) actual.cuentaFinancieraId = data.cuentaFinancieraId;
    if (data.permiteAsientoManual !== undefined) actual.permiteAsientoManual = data.permiteAsientoManual;

    await auditoriaChainService.registrar({
      empresaId,
      usuarioId: userId,
      tablaAfectada: 'subdiarios',
      registroId: id,
      accion: 'SUBDIARIO_ACTUALIZADO',
      datosAnteriores: { nombre: actual.nombre, activo: actual.activo },
      datosNuevos: { nombre: actual.nombre, activo: actual.activo }
    });

    return actual;
  },

  /**
   * Elimina un subdiario personalizado. Si tiene asientos, bloquea y exige desactivación.
   */
  async eliminarSubdiario(
    empresaId: string,
    id: string,
    userId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<{ eliminada: boolean }> {
    const sub = await this.obtenerPorId(empresaId, id);
    if (!sub) throw new Error('SUBDIARIO_NO_ENCONTRADO: El subdiario no existe.');

    if (sub.esSistema) {
      throw new Error('SUBDIARIO_SISTEMA: Los subdiarios base del sistema no pueden ser eliminados.');
    }

    if (db.isPostgresConnected()) {
      const movs = await db.query(
        'SELECT count(*)::int as total FROM asientos WHERE empresa_id = $1 AND subdiario_id = $2',
        [empresaId, id]
      );
      if (movs.rows[0]?.total > 0) {
        throw new Error(
          `SUBDIARIO_CON_ASIENTOS: No se puede eliminar el subdiario "${sub.codigo} - ${sub.nombre}" porque contiene ${movs.rows[0].total} asiento(s) registrado(s). Solo puede ser desactivado.`
        );
      }

      await db.query('DELETE FROM subdiarios WHERE empresa_id = $1 AND id = $2', [empresaId, id]);

      await auditoriaChainService.registrar({
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'subdiarios',
        registroId: id,
        accion: 'SUBDIARIO_ELIMINADO',
        datosAnteriores: { codigo: sub.codigo, nombre: sub.nombre }
      });

      return { eliminada: true };
    }

    // Modo Memoria
    const list = obtenerListaMemoria(empresaId);
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
    }

    await auditoriaChainService.registrar({
      empresaId,
      usuarioId: userId,
      tablaAfectada: 'subdiarios',
      registroId: id,
      accion: 'SUBDIARIO_ELIMINADO',
      datosAnteriores: { codigo: sub.codigo, nombre: sub.nombre }
    });

    return { eliminada: true };
  },

  /**
   * Valida que el correlativo no supere el límite de 4 dígitos (9999)
   */
  validarLimiteCorrelativo(numero: number): void {
    if (numero > 9999) {
      throw new Error(
        'LIMITE_CORRELATIVO_EXCEDIDO: Se ha alcanzado el límite máximo de 9999 asientos para este subdiario en el período. Cree un subdiario adicional para continuar registrando.'
      );
    }
  }
};

