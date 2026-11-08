import { db } from '../config/database';

export interface MovimientoAnalisisCuenta {
  lineaId: string;
  asientoId: string;
  voucherNumero: string;
  fechaContable: string;
  glosaAsiento: string;
  subdiarioCodigo: string;
  subdiarioNombre: string;
  codigoCuenta: string;
  denominacionCuenta: string;
  linea: number;
  glosaLinea: string;
  debePen: number;
  haberPen: number;
  saldoPen: number;
  debeUsd: number;
  haberUsd: number;
  saldoUsd: number;
  docTipo?: string;
  docSerie?: string;
  docNumero?: string;
  docFecha?: string;
  fechaVencimiento?: string;
  anexoTipoDoc?: string;
  anexoNumeroDoc?: string;
  anexoRazonSocial?: string;
  marcaRevision?: {
    id: string;
    estadoRevision: 'REVISADO' | 'OBSERVADO' | 'PENDIENTE';
    comentario?: string;
    usuarioNombre?: string;
    updatedAt: string;
  };
}

export interface ResultadoMovimientosCuenta {
  periodo: string;
  cuentaFiltro?: string;
  saldoInicialPen: number;
  totalDebePen: number;
  totalHaberPen: number;
  saldoFinalPen: number;
  saldoInicialUsd: number;
  totalDebeUsd: number;
  totalHaberUsd: number;
  saldoFinalUsd: number;
  movimientos: MovimientoAnalisisCuenta[];
}

export interface FilaAntiguedadSaldo {
  anexoId?: string;
  anexoNumeroDoc: string;
  anexoRazonSocial: string;
  docTipo: string;
  docSerie: string;
  docNumero: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  diasAntiguedad: number;
  saldoTotal: number;
  tramo0_30: number;
  tramo31_60: number;
  tramo61_90: number;
  tramoMas90: number;
}

export interface ResultadoAntiguedadSaldos {
  periodo: string;
  cuenta: string;
  totalSaldo: number;
  totalTramo0_30: number;
  totalTramo31_60: number;
  totalTramo61_90: number;
  totalTramoMas90: number;
  partidas: FilaAntiguedadSaldo[];
}

export interface FilaCuentaControl {
  codigoCuenta: string;
  nombreCuenta: string;
  moduloAuxiliar: string;
  saldoContable: number;
  saldoAuxiliar: number;
  diferencia: number;
  estado: 'CUADRADO' | 'DESCUADRADO';
  observacion: string;
}

export interface AlertaAuditoria {
  id: string;
  tipo: 'SALDO_CONTRARIO' | 'BANCO_SOBREGIRADO' | 'FALTA_SUSTENTO' | 'DUPLICADOS' | 'POST_CIERRE';
  severidad: 'ALTA' | 'MEDIA' | 'BAJA';
  titulo: string;
  descripcion: string;
  codigoCuenta?: string;
  asientoId?: string;
  voucherNumero?: string;
  monto?: number;
}

function redondear(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export class AnalisisCuentaService {
  /**
   * Obtiene los movimientos contables de una cuenta o prefijo para un período determinado,
   * calculando con rigor decimal el saldo inicial, los movimientos y el saldo final acumulado.
   */
  async obtenerMovimientosCuenta(
    empresaId: string,
    periodo: string,
    codigoCuenta?: string,
    anexoFiltro?: string
  ): Promise<ResultadoMovimientosCuenta> {
    const anio = parseInt(periodo.split('-')[0], 10);

    // 1. Calcular Saldo Inicial (Asientos contabilizados anteriores en el mismo ejercicio)
    const saldoInicialRes = await db.query<{
      debe_inicial: string;
      haber_inicial: string;
      debe_me_inicial: string;
      haber_me_inicial: string;
    }>(
      `
      SELECT 
        COALESCE(SUM(ad.debe), 0) AS debe_inicial,
        COALESCE(SUM(ad.haber), 0) AS haber_inicial,
        COALESCE(SUM(ad.debe_me), 0) AS debe_me_inicial,
        COALESCE(SUM(ad.haber_me), 0) AS haber_me_inicial
      FROM asiento_detalle ad
      JOIN asientos a ON a.id = ad.asiento_id
      JOIN periodos p ON p.id = a.periodo_id
      JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
      WHERE a.empresa_id = $1
        AND a.estado = 'CONTABILIZADO'
        AND p.anio = $2
        AND p.codigo_periodo < $3
        AND ($4::text IS NULL OR pc.codigo LIKE $4 || '%')
      `,
      [empresaId, anio, periodo, codigoCuenta || null]
    );

    const debeIni = parseFloat(saldoInicialRes.rows[0]?.debe_inicial || '0');
    const haberIni = parseFloat(saldoInicialRes.rows[0]?.haber_inicial || '0');
    const saldoInicialPen = redondear(debeIni - haberIni);

    const debeMeIni = parseFloat(saldoInicialRes.rows[0]?.debe_me_inicial || '0');
    const haberMeIni = parseFloat(saldoInicialRes.rows[0]?.haber_me_inicial || '0');
    const saldoInicialUsd = redondear(debeMeIni - haberMeIni);

    // 2. Consultar Movimientos del Período
    const movimientosRes = await db.query<{
      linea_id: string;
      asiento_id: string;
      voucher_numero: string;
      fecha_contable: string;
      glosa_asiento: string;
      subdiario_codigo: string;
      subdiario_nombre: string;
      codigo_cuenta: string;
      denominacion_cuenta: string;
      linea: number;
      glosa_linea: string;
      debe: string;
      haber: string;
      debe_me: string;
      haber_me: string;
      doc_tipo: string;
      doc_serie: string;
      doc_numero: string;
      fecha_vencimiento: string;
      anexo_tipo_doc: string;
      anexo_numero_doc: string;
      anexo_razon_social: string;
      marca_id: string;
      marca_estado: 'REVISADO' | 'OBSERVADO' | 'PENDIENTE';
      marca_comentario: string;
      marca_usuario_nombre: string;
      marca_updated_at: string;
    }>(
      `
      SELECT 
        ad.id AS linea_id,
        a.id AS asiento_id,
        COALESCE(a.numero, 'BORRADOR') AS voucher_numero,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha_contable,
        a.glosa AS glosa_asiento,
        s.codigo AS subdiario_codigo,
        COALESCE(s.nombre, s.descripcion) AS subdiario_nombre,
        pc.codigo AS codigo_cuenta,
        pc.nombre AS denominacion_cuenta,
        ad.linea,
        COALESCE(ad.glosa_linea, a.glosa) AS glosa_linea,
        ad.debe,
        ad.haber,
        ad.debe_me,
        ad.haber_me,
        ad.doc_tipo,
        ad.doc_serie,
        ad.doc_numero,
        TO_CHAR(ad.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        an.tipo_documento AS anexo_tipo_doc,
        an.numero_documento AS anexo_numero_doc,
        an.razon_social AS anexo_razon_social,
        m.id AS marca_id,
        m.estado_revision AS marca_estado,
        m.comentario AS marca_comentario,
        m.usuario_nombre AS marca_usuario_nombre,
        TO_CHAR(m.updated_at, 'YYYY-MM-DD HH24:MI') AS marca_updated_at
      FROM asiento_detalle ad
      JOIN asientos a ON a.id = ad.asiento_id
      JOIN periodos p ON p.id = a.periodo_id
      JOIN subdiarios s ON s.id = a.subdiario_id
      JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
      LEFT JOIN anexos an ON an.id = ad.anexo_id
      LEFT JOIN marcas_analisis_cuenta m ON m.asiento_id = a.id AND (m.linea_id IS NULL OR m.linea_id = ad.id)
      WHERE a.empresa_id = $1
        AND a.estado = 'CONTABILIZADO'
        AND p.codigo_periodo = $2
        AND ($3::text IS NULL OR pc.codigo LIKE $3 || '%')
        AND (
          $4::text IS NULL OR 
          an.numero_documento ILIKE '%' || $4 || '%' OR 
          an.razon_social ILIKE '%' || $4 || '%' OR 
          ad.doc_numero ILIKE '%' || $4 || '%'
        )
      ORDER BY a.fecha ASC, a.numero ASC, ad.linea ASC
      `,
      [empresaId, periodo, codigoCuenta || null, anexoFiltro || null]
    );

    let runningPen = saldoInicialPen;
    let runningUsd = saldoInicialUsd;
    let sumDebePen = 0;
    let sumHaberPen = 0;
    let sumDebeUsd = 0;
    let sumHaberUsd = 0;

    const movimientos: MovimientoAnalisisCuenta[] = movimientosRes.rows.map((row) => {
      const debe = parseFloat(row.debe || '0');
      const haber = parseFloat(row.haber || '0');
      const debeUsd = parseFloat(row.debe_me || '0');
      const haberUsd = parseFloat(row.haber_me || '0');

      sumDebePen = redondear(sumDebePen + debe);
      sumHaberPen = redondear(sumHaberPen + haber);
      sumDebeUsd = redondear(sumDebeUsd + debeUsd);
      sumHaberUsd = redondear(sumHaberUsd + haberUsd);

      runningPen = redondear(runningPen + (debe - haber));
      runningUsd = redondear(runningUsd + (debeUsd - haberUsd));

      return {
        lineaId: row.linea_id,
        asientoId: row.asiento_id,
        voucherNumero: row.voucher_numero,
        fechaContable: row.fecha_contable,
        glosaAsiento: row.glosa_asiento,
        subdiarioCodigo: row.subdiario_codigo,
        subdiarioNombre: row.subdiario_nombre,
        codigoCuenta: row.codigo_cuenta,
        denominacionCuenta: row.denominacion_cuenta,
        linea: row.linea,
        glosaLinea: row.glosa_linea,
        debePen: debe,
        haberPen: haber,
        saldoPen: runningPen,
        debeUsd: debeUsd,
        haberUsd: haberUsd,
        saldoUsd: runningUsd,
        docTipo: row.doc_tipo,
        docSerie: row.doc_serie,
        docNumero: row.doc_numero,
        fechaVencimiento: row.fecha_vencimiento,
        anexoTipoDoc: row.anexo_tipo_doc,
        anexoNumeroDoc: row.anexo_numero_doc,
        anexoRazonSocial: row.anexo_razon_social,
        marcaRevision: row.marca_id
          ? {
              id: row.marca_id,
              estadoRevision: row.marca_estado,
              comentario: row.marca_comentario,
              usuarioNombre: row.marca_usuario_nombre,
              updatedAt: row.marca_updated_at,
            }
          : undefined,
      };
    });

    return {
      periodo,
      cuentaFiltro: codigoCuenta,
      saldoInicialPen,
      totalDebePen: sumDebePen,
      totalHaberPen: sumHaberPen,
      saldoFinalPen: runningPen,
      saldoInicialUsd,
      totalDebeUsd: sumDebeUsd,
      totalHaberUsd: sumHaberUsd,
      saldoFinalUsd: runningUsd,
      movimientos,
    };
  }

  /**
   * Obtiene la antigüedad de saldos clasificada por anexo y documento origen
   * (0-30 días, 31-60 días, 61-90 días, >90 días) garantizando suma exacta al céntimo.
   */
  async obtenerAntiguedadSaldos(
    empresaId: string,
    periodo: string,
    cuentaPrefijo: string = '1212'
  ): Promise<ResultadoAntiguedadSaldos> {
    const res = await db.query<{
      anexo_id: string;
      anexo_numero: string;
      anexo_nombre: string;
      doc_tipo: string;
      doc_serie: string;
      doc_numero: string;
      fecha_origen: string;
      fecha_vencimiento: string;
      total_debe: string;
      total_haber: string;
    }>(
      `
      SELECT 
        an.id AS anexo_id,
        COALESCE(an.numero_documento, 'SIN_RUC') AS anexo_numero,
        COALESCE(an.razon_social, 'SIN RAZON SOCIAL') AS anexo_nombre,
        COALESCE(ad.doc_tipo, '01') AS doc_tipo,
        COALESCE(ad.doc_serie, 'F001') AS doc_serie,
        COALESCE(ad.doc_numero, '0000000') AS doc_numero,
        TO_CHAR(MIN(a.fecha), 'YYYY-MM-DD') AS fecha_origen,
        TO_CHAR(MIN(COALESCE(ad.fecha_vencimiento, a.fecha)), 'YYYY-MM-DD') AS fecha_vencimiento,
        SUM(ad.debe) AS total_debe,
        SUM(ad.haber) AS total_haber
      FROM asiento_detalle ad
      JOIN asientos a ON a.id = ad.asiento_id
      JOIN periodos p ON p.id = a.periodo_id
      JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
      LEFT JOIN anexos an ON an.id = ad.anexo_id
      WHERE a.empresa_id = $1
        AND a.estado = 'CONTABILIZADO'
        AND p.codigo_periodo <= $2
        AND pc.codigo LIKE $3 || '%'
      GROUP BY an.id, an.numero_documento, an.razon_social, ad.doc_tipo, ad.doc_serie, ad.doc_numero
      HAVING SUM(ad.debe) <> SUM(ad.haber)
      ORDER BY an.razon_social ASC, MIN(a.fecha) ASC
      `,
      [empresaId, periodo, cuentaPrefijo]
    );

    const [anioStr, mesStr] = periodo.split('-');
    const anio = parseInt(anioStr, 10);
    const mes = parseInt(mesStr, 10);
    const fechaCorte = new Date(anio, mes, 0); // Último día del mes evaluado

    let totalSaldo = 0;
    let totalTramo0_30 = 0;
    let totalTramo31_60 = 0;
    let totalTramo61_90 = 0;
    let totalTramoMas90 = 0;

    const partidas: FilaAntiguedadSaldo[] = [];

    for (const r of res.rows) {
      const debe = parseFloat(r.total_debe || '0');
      const haber = parseFloat(r.total_haber || '0');
      // Si es cuenta de activo (12, 16), el saldo deudor es Debe - Haber.
      // Si es cuenta de pasivo (42, 46), el saldo acreedor es Haber - Debe.
      const esPasivo = cuentaPrefijo.startsWith('4');
      const saldo = esPasivo ? redondear(haber - debe) : redondear(debe - haber);

      if (saldo === 0) continue;

      const fEmision = new Date(r.fecha_origen);
      const diffMs = fechaCorte.getTime() - fEmision.getTime();
      const dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      let tramo0_30 = 0;
      let tramo31_60 = 0;
      let tramo61_90 = 0;
      let tramoMas90 = 0;

      if (dias <= 30) {
        tramo0_30 = saldo;
      } else if (dias <= 60) {
        tramo31_60 = saldo;
      } else if (dias <= 90) {
        tramo61_90 = saldo;
      } else {
        tramoMas90 = saldo;
      }

      totalSaldo = redondear(totalSaldo + saldo);
      totalTramo0_30 = redondear(totalTramo0_30 + tramo0_30);
      totalTramo31_60 = redondear(totalTramo31_60 + tramo31_60);
      totalTramo61_90 = redondear(totalTramo61_90 + tramo61_90);
      totalTramoMas90 = redondear(totalTramoMas90 + tramoMas90);

      partidas.push({
        anexoId: r.anexo_id,
        anexoNumeroDoc: r.anexo_numero,
        anexoRazonSocial: r.anexo_nombre,
        docTipo: r.doc_tipo,
        docSerie: r.doc_serie,
        docNumero: r.doc_numero,
        fechaEmision: r.fecha_origen,
        fechaVencimiento: r.fecha_vencimiento,
        diasAntiguedad: dias,
        saldoTotal: saldo,
        tramo0_30,
        tramo31_60,
        tramo61_90,
        tramoMas90,
      });
    }

    return {
      periodo,
      cuenta: cuentaPrefijo,
      totalSaldo,
      totalTramo0_30,
      totalTramo31_60,
      totalTramo61_90,
      totalTramoMas90,
      partidas,
    };
  }

  /**
   * Conciliación automática entre Cuentas de Control y Módulos Auxiliares
   * (IGV, Clientes, Proveedores, Bancos, Ventas y Compras).
   */
  async obtenerCuentasControl(empresaId: string, periodo: string): Promise<FilaCuentaControl[]> {
    const controles: FilaCuentaControl[] = [];

    // Helper para saldo neto contable
    async function getSaldoContable(prefijo: string, invertido: boolean = false): Promise<number> {
      const q = await db.query<{ debe: string; haber: string }>(
        `
        SELECT COALESCE(SUM(ad.debe), 0) AS debe, COALESCE(SUM(ad.haber), 0) AS haber
        FROM asiento_detalle ad
        JOIN asientos a ON a.id = ad.asiento_id
        JOIN periodos p ON p.id = a.periodo_id
        JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
        WHERE a.empresa_id = $1 AND a.estado = 'CONTABILIZADO' AND p.codigo_periodo = $2
          AND pc.codigo LIKE $3 || '%'
        `,
        [empresaId, periodo, prefijo]
      );
      const debe = parseFloat(q.rows[0]?.debe || '0');
      const haber = parseFloat(q.rows[0]?.haber || '0');
      return invertido ? redondear(haber - debe) : redondear(debe - haber);
    }

    // 1. IGV Cuenta Propia (40111) vs Auxiliar SIRE Compras / Ventas
    const saldoIgvContable = await getSaldoContable('40111');
    const qIgvAux = await db.query<{ igv_compras: string; igv_ventas: string }>(
      `
      SELECT 
        (SELECT COALESCE(SUM(c.igv), 0) FROM comprobantes_compra c JOIN periodos p ON p.id = c.periodo_id WHERE c.empresa_id = $1 AND p.codigo_periodo = $2) AS igv_compras,
        (SELECT COALESCE(SUM(v.igv), 0) FROM comprobantes_venta v JOIN periodos p ON p.id = v.periodo_id WHERE v.empresa_id = $1 AND p.codigo_periodo = $2) AS igv_ventas
      `,
      [empresaId, periodo]
    );
    const igvCompras = parseFloat(qIgvAux.rows[0]?.igv_compras || '0');
    const igvVentas = parseFloat(qIgvAux.rows[0]?.igv_ventas || '0');
    const igvAuxiliar = redondear(igvCompras - igvVentas);
    const difIgv = redondear(saldoIgvContable - igvAuxiliar);
    controles.push({
      codigoCuenta: '40111',
      nombreCuenta: 'TRIBUTOS POR PAGAR — IGV CUENTA PROPIA',
      moduloAuxiliar: 'Registro de Compras y Ventas (Crédito vs Débito)',
      saldoContable: saldoIgvContable,
      saldoAuxiliar: igvAuxiliar,
      diferencia: difIgv,
      estado: difIgv === 0 ? 'CUADRADO' : 'DESCUADRADO',
      observacion: difIgv === 0 ? 'Concordancia perfecta con registros de compras/ventas' : `Diferencia de S/ ${Math.abs(difIgv).toFixed(2)}`,
    });

    // 2. Facturas por Cobrar Comerciales (1212) vs Cartera de Clientes
    const saldo1212 = await getSaldoContable('1212');
    const qCxc = await db.query<{ total_saldo: string }>(
      `
      SELECT COALESCE(SUM(c.saldo), 0) AS total_saldo
      FROM cuentas_por_cobrar c
      JOIN comprobantes_venta v ON v.id = c.comprobante_id
      JOIN periodos p ON p.id = v.periodo_id
      WHERE c.empresa_id = $1 AND p.codigo_periodo = $2
      `,
      [empresaId, periodo]
    );
    const saldo1212Aux = redondear(parseFloat(qCxc.rows[0]?.total_saldo || '0'));
    const dif1212 = redondear(saldo1212 - saldo1212Aux);
    controles.push({
      codigoCuenta: '1212',
      nombreCuenta: 'CUENTAS POR COBRAR COMERCIALES — TERCEROS',
      moduloAuxiliar: 'Cartera de Clientes / Documentos por Cobrar',
      saldoContable: saldo1212,
      saldoAuxiliar: saldo1212Aux,
      diferencia: dif1212,
      estado: dif1212 === 0 ? 'CUADRADO' : 'DESCUADRADO',
      observacion: dif1212 === 0 ? 'Totalizado con cartera de clientes activo' : `Diferencia en cobranzas S/ ${Math.abs(dif1212).toFixed(2)}`,
    });

    // 3. Facturas por Pagar Comerciales (4212) vs Cartera de Proveedores
    const saldo4212 = await getSaldoContable('4212', true); // Acreedora
    const qCxp = await db.query<{ total_saldo: string }>(
      `
      SELECT COALESCE(SUM(p_cartera.saldo), 0) AS total_saldo
      FROM cuentas_por_pagar p_cartera
      JOIN comprobantes_compra c ON c.id = p_cartera.comprobante_id
      JOIN periodos p ON p.id = c.periodo_id
      WHERE p_cartera.empresa_id = $1 AND p.codigo_periodo = $2
      `,
      [empresaId, periodo]
    );
    const saldo4212Aux = redondear(parseFloat(qCxp.rows[0]?.total_saldo || '0'));
    const dif4212 = redondear(saldo4212 - saldo4212Aux);
    controles.push({
      codigoCuenta: '4212',
      nombreCuenta: 'CUENTAS POR PAGAR COMERCIALES — TERCEROS',
      moduloAuxiliar: 'Cartera de Proveedores / Documentos por Pagar',
      saldoContable: saldo4212,
      saldoAuxiliar: saldo4212Aux,
      diferencia: dif4212,
      estado: dif4212 === 0 ? 'CUADRADO' : 'DESCUADRADO',
      observacion: dif4212 === 0 ? 'Saldos de obligaciones con proveedores cuadrados' : `Diferencia en pagos S/ ${Math.abs(dif4212).toFixed(2)}`,
    });

    // 4. Cuentas Financieras (10) vs Tesorería
    const saldo10 = await getSaldoContable('10');
    const qTesoreria = await db.query<{ total_fondos: string }>(
      `
      SELECT COALESCE(SUM(saldo_actual), 0) AS total_fondos
      FROM cajas_chicas WHERE empresa_id = $1
      `,
      [empresaId]
    );
    const saldo10Aux = redondear(parseFloat(qTesoreria.rows[0]?.total_fondos || '0'));
    const dif10 = redondear(saldo10 - saldo10Aux);
    controles.push({
      codigoCuenta: '10',
      nombreCuenta: 'EFECTIVO Y EQUIVALENTES DE EFECTIVO',
      moduloAuxiliar: 'Módulo de Tesorería y Fondos',
      saldoContable: saldo10,
      saldoAuxiliar: saldo10Aux,
      diferencia: dif10,
      estado: dif10 === 0 ? 'CUADRADO' : 'DESCUADRADO',
      observacion: dif10 === 0 ? 'Saldos de fondos conciliados' : `Diferencia con tesorería S/ ${Math.abs(dif10).toFixed(2)}`,
    });

    // 5. Ventas Netas (70) vs Registro de Ventas
    const saldo70 = await getSaldoContable('70', true); // Acreedora
    const qVentas = await db.query<{ base_total: string }>(
      `
      SELECT COALESCE(SUM(base_gravada + base_no_gravada + exonerado), 0) AS base_total
      FROM comprobantes_venta v
      JOIN periodos p ON p.id = v.periodo_id
      WHERE v.empresa_id = $1 AND p.codigo_periodo = $2
      `,
      [empresaId, periodo]
    );
    const saldo70Aux = redondear(parseFloat(qVentas.rows[0]?.base_total || '0'));
    const dif70 = redondear(saldo70 - saldo70Aux);
    controles.push({
      codigoCuenta: '70',
      nombreCuenta: 'VENTAS — INGRESOS DE ACTIVIDADES ORDINARIAS',
      moduloAuxiliar: 'Registro de Ventas e Ingresos (Bases Imponibles)',
      saldoContable: saldo70,
      saldoAuxiliar: saldo70Aux,
      diferencia: dif70,
      estado: dif70 === 0 ? 'CUADRADO' : 'DESCUADRADO',
      observacion: dif70 === 0 ? 'Ventas netas coinciden exactamente' : `Diferencia de S/ ${Math.abs(dif70).toFixed(2)}`,
    });

    // 6. Compras y Gastos (60 / 63) vs Registro de Compras
    const saldo60 = await getSaldoContable('60');
    const saldo63 = await getSaldoContable('63');
    const saldoComprasContable = redondear(saldo60 + saldo63);
    const qCompras = await db.query<{ base_total: string }>(
      `
      SELECT COALESCE(SUM(base_gravada + base_no_gravada + exonerado), 0) AS base_total
      FROM comprobantes_compra c
      JOIN periodos p ON p.id = c.periodo_id
      WHERE c.empresa_id = $1 AND p.codigo_periodo = $2
      `,
      [empresaId, periodo]
    );
    const saldoComprasAux = redondear(parseFloat(qCompras.rows[0]?.base_total || '0'));
    const difCompras = redondear(saldoComprasContable - saldoComprasAux);
    controles.push({
      codigoCuenta: '60/63',
      nombreCuenta: 'COMPRAS Y GASTOS POR SERVICIOS DE TERCEROS',
      moduloAuxiliar: 'Registro de Compras (Bases Imponibles Adquisiciones)',
      saldoContable: saldoComprasContable,
      saldoAuxiliar: saldoComprasAux,
      diferencia: difCompras,
      estado: difCompras === 0 ? 'CUADRADO' : 'DESCUADRADO',
      observacion: difCompras === 0 ? 'Compras contables cuadradas con RCE' : `Diferencia de S/ ${Math.abs(difCompras).toFixed(2)}`,
    });

    return controles;
  }

  /**
   * Alertas de Auditoría Contable Preventiva
   * Detecta saldos contrarios a la naturaleza, sobregiros bancarios, asientos sin sustento,
   * posibles duplicados y transacciones post-cierre.
   */
  async obtenerAlertasAuditoria(empresaId: string, periodo: string): Promise<AlertaAuditoria[]> {
    const alertas: AlertaAuditoria[] = [];

    // 1. Saldo contrario a su naturaleza
    // Activo (1, 2, 3) con saldo acreedor < 0 (excepto correctoras 19, 29, 36, 39)
    // Pasivo/Patrimonio (4, 5) con saldo deudor < 0
    const qSaldos = await db.query<{
      codigo: string;
      nombre: string;
      tipo_cuenta: string;
      debe: string;
      haber: string;
    }>(
      `
      SELECT pc.codigo, pc.nombre, pc.tipo_cuenta,
             COALESCE(SUM(ad.debe), 0) AS debe,
             COALESCE(SUM(ad.haber), 0) AS haber
      FROM plan_cuentas pc
      LEFT JOIN asiento_detalle ad ON ad.cuenta_id = pc.id
      LEFT JOIN asientos a ON a.id = ad.asiento_id AND a.estado = 'CONTABILIZADO'
      LEFT JOIN periodos p ON p.id = a.periodo_id AND p.codigo_periodo = $2
      WHERE pc.empresa_id = $1
      GROUP BY pc.id, pc.codigo, pc.nombre, pc.tipo_cuenta
      HAVING SUM(ad.debe) > 0 OR SUM(ad.haber) > 0
      `,
      [empresaId, periodo]
    );

    for (const r of qSaldos.rows) {
      const debe = parseFloat(r.debe);
      const haber = parseFloat(r.haber);
      const cod = r.codigo;

      // Saldo deudor = debe - haber; saldo acreedor = haber - debe
      const saldoDeudor = redondear(debe - haber);
      const esCorrectora = cod.startsWith('19') || cod.startsWith('29') || cod.startsWith('36') || cod.startsWith('39');

      // Cuentas de Activo (1..3) deben tener saldo deudor >= 0
      if ((cod.startsWith('1') || cod.startsWith('2') || cod.startsWith('3')) && !esCorrectora && saldoDeudor < 0) {
        alertas.push({
          id: `contra-nat-${cod}`,
          tipo: 'SALDO_CONTRARIO',
          severidad: 'ALTA',
          titulo: `Saldo acreedor anormal en cuenta de Activo (${cod})`,
          descripcion: `La cuenta ${cod} - ${r.nombre} presenta saldo acreedor de S/ ${Math.abs(saldoDeudor).toFixed(2)}, contrario a su naturaleza deudora.`,
          codigoCuenta: cod,
          monto: Math.abs(saldoDeudor),
        });
      }

      // Cuentas de Bancos 104 con saldo deudor < 0 (Sobregiro bancario)
      if (cod.startsWith('104') && saldoDeudor < 0) {
        alertas.push({
          id: `sobregiro-${cod}`,
          tipo: 'BANCO_SOBREGIRADO',
          severidad: 'ALTA',
          titulo: `Sobregiro Bancario en Cuenta ${cod}`,
          descripcion: `La cuenta corriente bancaria ${cod} presenta saldo negativo de S/ ${Math.abs(saldoDeudor).toFixed(2)}. Requiere reclasificación a pasivo corriente.`,
          codigoCuenta: cod,
          monto: Math.abs(saldoDeudor),
        });
      }

      // Cuentas de Pasivo (4) y Patrimonio (5) deben tener saldo acreedor >= 0
      if ((cod.startsWith('4') || cod.startsWith('5')) && (haber - debe) < 0) {
        alertas.push({
          id: `contra-nat-${cod}`,
          tipo: 'SALDO_CONTRARIO',
          severidad: 'MEDIA',
          titulo: `Saldo deudor anormal en cuenta de Pasivo/Patrimonio (${cod})`,
          descripcion: `La cuenta ${cod} - ${r.nombre} presenta saldo deudor de S/ ${Math.abs(debe - haber).toFixed(2)}.`,
          codigoCuenta: cod,
          monto: Math.abs(debe - haber),
        });
      }
    }

    // 2. Falta de Glosa o Documento Sustentatorio
    const qFaltaSustento = await db.query<{
      asiento_id: string;
      numero: string;
      glosa: string;
      lineas_sin_doc: string;
    }>(
      `
      SELECT 
        a.id AS asiento_id,
        COALESCE(a.numero, 'BORRADOR') AS numero,
        a.glosa,
        COUNT(ad.id) FILTER (WHERE (pc.codigo LIKE '12%' OR pc.codigo LIKE '42%') AND (ad.doc_numero IS NULL OR LENGTH(TRIM(ad.doc_numero)) = 0)) AS lineas_sin_doc
      FROM asientos a
      JOIN periodos p ON p.id = a.periodo_id
      LEFT JOIN asiento_detalle ad ON ad.asiento_id = a.id
      LEFT JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
      WHERE a.empresa_id = $1 AND a.estado = 'CONTABILIZADO' AND p.codigo_periodo = $2
      GROUP BY a.id, a.numero, a.glosa
      HAVING LENGTH(TRIM(COALESCE(a.glosa, ''))) < 5 OR COUNT(ad.id) FILTER (WHERE (pc.codigo LIKE '12%' OR pc.codigo LIKE '42%') AND (ad.doc_numero IS NULL OR LENGTH(TRIM(ad.doc_numero)) = 0)) > 0
      `,
      [empresaId, periodo]
    );

    for (const f of qFaltaSustento.rows) {
      if (!f.glosa || f.glosa.trim().length < 5) {
        alertas.push({
          id: `sin-glosa-${f.asiento_id}`,
          tipo: 'FALTA_SUSTENTO',
          severidad: 'MEDIA',
          titulo: `Asiento ${f.numero} sin glosa o descripción insuficiente`,
          descripcion: `El asiento no posee una glosa explicativa clara que describa el hecho contable.`,
          asientoId: f.asiento_id,
          voucherNumero: f.numero,
        });
      }
      if (parseInt(f.lineas_sin_doc, 10) > 0) {
        alertas.push({
          id: `sin-doc-${f.asiento_id}`,
          tipo: 'FALTA_SUSTENTO',
          severidad: 'ALTA',
          titulo: `Asiento ${f.numero} contiene líneas comerciales sin comprobante de referencia`,
          descripcion: `Existen líneas en cuentas 12/42 que carecen de número de serie y documento de referencia.`,
          asientoId: f.asiento_id,
          voucherNumero: f.numero,
        });
      }
    }

    // 3. Asientos Duplicados Sospechosos
    const qDuplicados = await db.query<{
      fecha: string;
      anexo_id: string;
      monto: string;
      total_asientos: string;
      asiento_ids: string[];
    }>(
      `
      SELECT 
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        ad.anexo_id,
        ad.debe AS monto,
        COUNT(DISTINCT a.id) AS total_asientos,
        ARRAY_AGG(DISTINCT a.id::text) AS asiento_ids
      FROM asiento_detalle ad
      JOIN asientos a ON a.id = ad.asiento_id
      JOIN periodos p ON p.id = a.periodo_id
      WHERE a.empresa_id = $1 AND a.estado = 'CONTABILIZADO' AND p.codigo_periodo = $2
        AND ad.anexo_id IS NOT NULL AND ad.debe > 0
      GROUP BY a.fecha, ad.anexo_id, ad.debe
      HAVING COUNT(DISTINCT a.id) > 1
      `,
      [empresaId, periodo]
    );

    for (const dup of qDuplicados.rows) {
      alertas.push({
        id: `dup-${dup.fecha}-${dup.monto}`,
        tipo: 'DUPLICADOS',
        severidad: 'MEDIA',
        titulo: `Posible asiento duplicado por importe de S/ ${parseFloat(dup.monto).toFixed(2)}`,
        descripcion: `Se detectaron ${dup.total_asientos} asientos registrados en la misma fecha (${dup.fecha}) con el mismo anexo y monto idéntico.`,
        monto: parseFloat(dup.monto),
      });
    }

    // 4. Movimientos post-cierre de período
    const qPostCierre = await db.query<{
      asiento_id: string;
      numero: string;
      fecha_cierre: string;
      created_at: string;
    }>(
      `
      SELECT a.id AS asiento_id, a.numero, TO_CHAR(p.fecha_cierre, 'YYYY-MM-DD HH24:MI') AS fecha_cierre,
             TO_CHAR(a.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
      FROM asientos a
      JOIN periodos p ON p.id = a.periodo_id
      WHERE a.empresa_id = $1 AND p.codigo_periodo = $2 AND p.estado = 'CERRADO'
        AND a.created_at > p.fecha_cierre
      `,
      [empresaId, periodo]
    );

    for (const pc of qPostCierre.rows) {
      alertas.push({
        id: `post-cierre-${pc.asiento_id}`,
        tipo: 'POST_CIERRE',
        severidad: 'ALTA',
        titulo: `Asiento ${pc.numero} registrado después del cierre del período`,
        descripcion: `El período fue cerrado el ${pc.fecha_cierre}, pero el asiento fue creado posteriormente (${pc.created_at}).`,
        asientoId: pc.asiento_id,
        voucherNumero: pc.numero,
      });
    }

    return alertas;
  }

  /**
   * Registra o actualiza una marca y nota de revisión de auditoría.
   */
  async guardarMarca(
    empresaId: string,
    data: {
      asientoId: string;
      lineaId?: string;
      estadoRevision: 'REVISADO' | 'OBSERVADO' | 'PENDIENTE';
      comentario?: string;
      usuarioId?: string;
      usuarioNombre?: string;
    }
  ) {
    const res = await db.query(
      `
      INSERT INTO marcas_analisis_cuenta 
        (empresa_id, asiento_id, linea_id, estado_revision, comentario, usuario_id, usuario_nombre, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (empresa_id, id) DO NOTHING
      RETURNING *
      `,
      [
        empresaId,
        data.asientoId,
        data.lineaId || null,
        data.estadoRevision,
        data.comentario || null,
        data.usuarioId || null,
        data.usuarioNombre || 'Auditor',
      ]
    );

    if (res.rows.length === 0) {
      // Si no retornó por conflicto de id (o actualizamos por asiento/linea)
      const updateRes = await db.query(
        `
        UPDATE marcas_analisis_cuenta
        SET estado_revision = $1, comentario = $2, usuario_id = $3, usuario_nombre = $4, updated_at = CURRENT_TIMESTAMP
        WHERE empresa_id = $5 AND asiento_id = $6 AND (($7::uuid IS NULL AND linea_id IS NULL) OR linea_id = $7::uuid)
        RETURNING *
        `,
        [
          data.estadoRevision,
          data.comentario || null,
          data.usuarioId || null,
          data.usuarioNombre || 'Auditor',
          empresaId,
          data.asientoId,
          data.lineaId || null,
        ]
      );
      return updateRes.rows[0];
    }

    return res.rows[0];
  }

  /**
   * Obtiene marcas de revisión registradas para un asiento
   */
  async obtenerMarcasAsiento(empresaId: string, asientoId: string) {
    const res = await db.query(
      `
      SELECT id, asiento_id, linea_id, estado_revision, comentario, usuario_nombre, TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
      FROM marcas_analisis_cuenta
      WHERE empresa_id = $1 AND asiento_id = $2
      ORDER BY created_at ASC
      `,
      [empresaId, asientoId]
    );
    return res.rows;
  }
}

export const analisisCuentaService = new AnalisisCuentaService();
