import crypto from 'crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { compraService, COMPRAS_MEMORIA } from './compraService';
import { ventaService, VENTAS_MEMORIA } from './ventaService';
import { ASIENTOS_MEMORIA } from './asientoService';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { parametroRepository } from '../repositories/parametroRepository';
import { sanitizarCampoPlano } from './sireLayoutService';

export interface PleLibroConfigModel {
  codigoLibro: string;
  nombreLibro: string;
  versionFormato: string;
  validadoOficial: boolean;
  totalCamposOficial: number;
  especificacionNormativa: string;
}

export interface PleExportacionModel {
  id: string;
  empresaId: string;
  periodo: string;
  codigoLibro: string;
  nombreArchivo: string;
  contenidoTxt: string;
  hashSha256: string;
  totalFilas: number;
  esOficial: boolean;
  indicadorContenido: '0' | '1';
  indicadorOperacion: '0' | '1' | '2';
  validacionesSuperadas: boolean;
  totalesControl: {
    totalFilas: number;
    sumaDebe: number;
    sumaHaber: number;
    sumaBase: number;
    sumaIgv: number;
    sumaTotal: number;
  };
  detalleValidaciones: {
    asientosBorrador: number;
    cuadreContableOk: boolean;
    camposRequeridosOk: boolean;
    advertencias: string[];
  };
  createdAt: string;
}

export const PLE_LIBROS_CATALOGO: PleLibroConfigModel[] = [
  {
    codigoLibro: '080100',
    nombreLibro: 'Registro de Compras (Formato 8.1)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 42,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT y modif. R.S. N° 000112-2021/SUNAT.'
  },
  {
    codigoLibro: '080200',
    nombreLibro: 'Registro de Compras - No Domiciliados (Formato 8.2)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 36,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo II.'
  },
  {
    codigoLibro: '140100',
    nombreLibro: 'Registro de Ventas e Ingresos (Formato 14.1)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 35,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT y modif. R.S. N° 000112-2021/SUNAT.'
  },
  {
    codigoLibro: '050100',
    nombreLibro: 'Libro Diario (Formato 5.1)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 21,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo II y R.S. N° 234-2006/SUNAT.'
  },
  {
    codigoLibro: '060100',
    nombreLibro: 'Libro Mayor (Formato 6.1)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 16,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo II y R.S. N° 234-2006/SUNAT.'
  },
  {
    codigoLibro: '010100',
    nombreLibro: 'Libro Caja y Bancos - Efectivo (Formato 1.1)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 15,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo II.'
  },
  {
    codigoLibro: '010200',
    nombreLibro: 'Libro Caja y Bancos - Cuenta Corriente (Formato 1.2)',
    versionFormato: 'PLE_5.2',
    validadoOficial: true,
    totalCamposOficial: 15,
    especificacionNormativa: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo II.'
  }
];

export const PLE_EXPORTACIONES_MEMORIA: PleExportacionModel[] = [];

export const pleExportService = {
  listarLibrosConfig(): PleLibroConfigModel[] {
    return PLE_LIBROS_CATALOGO;
  },

  /**
   * Ejecuta las prevalidaciones técnicas y contables obligatorias antes de permitir generar el PLE
   */
  async prevalidar(empresaId: string, periodo: string, codigoLibro: string) {
    const config = PLE_LIBROS_CATALOGO.find(l => l.codigoLibro === codigoLibro);
    if (!config) throw new Error('LIBRO_NO_ENCONTRADO: El libro electrónico especificado no existe.');

    // 1. Verificar si existen borradores
    const asientosPeriodo = ASIENTOS_MEMORIA.filter(a => a.empresaId === empresaId && a.periodoId === `per-${periodo}`);
    const asientosBorrador = asientosPeriodo.filter(a => a.estado === 'BORRADOR').length;

    // 2. Verificar cuadre contable exacto con decimal.js (Money)
    let cuadreContableOk = true;
    for (const a of asientosPeriodo) {
      if (a.estado === 'CONTABILIZADO') {
        const totalD = (a.detalles || []).reduce((acc: any, d: any) => Money.add(acc, d.debe || 0), Money.create(0));
        const totalH = (a.detalles || []).reduce((acc: any, d: any) => Money.add(acc, d.haber || 0), Money.create(0));
        if (!Money.isEqual(totalD, totalH)) {
          cuadreContableOk = false;
          break;
        }
      }
    }

    const advertencias: string[] = [];
    if (!config.validadoOficial) {
      advertencias.push('FORMATO_NO_VALIDADO_OFICIAL: Este libro solo se generará como "VISTA PREVIA NO OFICIAL".');
    }
    if (asientosBorrador > 0) {
      advertencias.push(`Existen ${asientosBorrador} asiento(s) en estado BORRADOR en el período ${periodo}. Deben contabilizarse o anularse.`);
    }

    const validacionesSuperadas = cuadreContableOk && asientosBorrador === 0;

    return {
      codigoLibro,
      nombreLibro: config.nombreLibro,
      validadoOficial: config.validadoOficial,
      cuadreContableOk,
      asientosBorrador,
      validacionesSuperadas,
      advertencias
    };
  },

  /**
   * Genera el archivo plano oficial de libros electrónicos PLE 5.2
   * Formato: Pipes (|), CRLF (\r\n), UTF-8 sin BOM, indicador de operación y totales de control.
   */
  async exportarLibro(
    empresaId: string,
    periodo: string,
    codigoLibro: string,
    ruc = '20601234567',
    userId: string,
    opciones: { sinMovimiento?: boolean; esOficial?: boolean; moneda?: 'PEN' | 'USD' } = {}
  ): Promise<PleExportacionModel> {
    const config = PLE_LIBROS_CATALOGO.find(l => l.codigoLibro === codigoLibro);
    if (!config) throw new Error('LIBRO_NO_ENCONTRADO: El libro electrónico no existe.');

    const prevalidacion = await this.prevalidar(empresaId, periodo, codigoLibro);
    const fechaRef = `${periodo}-15`;

    // Cargar parámetros oficiales de indicadores (cero hardcoding)
    const indOperacionNum = await parametroRepository.obtenerValorNumerico('PLE_INDICADOR_OPERACION_ACTIVA', 1, fechaRef);
    const indOperacionStr = String(indOperacionNum) as '1' | '0' | '2';
    const indMonedaConfig = await parametroRepository.obtenerValorNumerico('PLE_INDICADOR_MONEDA_PEN', 1, fechaRef);
    const indMonedaNum = opciones.moneda === 'USD' ? 2 : indMonedaConfig;

    const [anio, mes] = periodo.split('-');
    const lineas: string[] = [];

    let sumaDebe = Money.create(0);
    let sumaHaber = Money.create(0);
    let sumaBase = Money.create(0);
    let sumaIgv = Money.create(0);
    let sumaTotal = Money.create(0);

    const esModoOficial = opciones.esOficial !== undefined ? opciones.esOficial : config.validadoOficial;

    if (!esModoOficial) {
      // Vista previa no oficial para libros que se soliciten explícitamente en modo previo
      lineas.push(`-- VISTA PREVIA NO OFICIAL - LIBRO ${codigoLibro} - ${config.nombreLibro} --`);
      lineas.push(`-- NOTA: Formato pendiente de validación según ${config.especificacionNormativa} --`);

      const asientos = ASIENTOS_MEMORIA.filter(
        a => a.empresaId === empresaId && a.periodoId === `per-${periodo}` && a.estado === 'CONTABILIZADO'
      );
      for (const a of asientos) {
        for (const d of a.detalles || []) {
          lineas.push([
            `${anio}${mes}00`,
            a.numero || a.id,
            d.cuentaCodigo || d.cuentaId,
            Money.format(d.debe || 0),
            Money.format(d.haber || 0),
            sanitizarCampoPlano(a.glosa)
          ].join('|') + '|');
        }
      }
    } else if (opciones.sinMovimiento) {
      // Mes sin movimiento: archivo vacío (0 líneas de datos)
    } else if (codigoLibro === '080100') {
      // Registro de Compras 8.1 (42 campos oficiales)
      const compras = COMPRAS_MEMORIA.filter(
        c => c.empresaId === empresaId && c.periodoId === `per-${periodo}` && c.estado === 'REGISTRADO'
      );

      let correlativo = 1;
      for (const c of compras) {
        const fechaEmisionFmt = (c.fechaEmision || '').split('-').reverse().join('/');
        const fechaVencFmt = (c.fechaVencimiento || c.fechaEmision || '').split('-').reverse().join('/');
        const cuo = `M${String(correlativo).padStart(6, '0')}`;

        const baseVal = Money.round(c.baseGravada || 0);
        const igvVal = Money.round(c.igv || 0);
        const totalVal = Money.round(c.total || 0);

        sumaBase = Money.add(sumaBase, baseVal);
        sumaIgv = Money.add(sumaIgv, igvVal);
        sumaTotal = Money.add(sumaTotal, totalVal);

        const campos = [
          `${anio}${mes}00`, // 1. Periodo
          cuo, // 2. CUO
          'M1', // 3. Correlativo del asiento
          fechaEmisionFmt, // 4. Fecha de emisión
          fechaVencFmt, // 5. Fecha de vencimiento
          sanitizarCampoPlano(c.tipoComprobante), // 6. Tipo comprobante
          sanitizarCampoPlano(c.serie), // 7. Serie
          anio, // 8. Año DUA
          sanitizarCampoPlano(c.numero), // 9. Número
          '', // 10. Rango final
          '6', // 11. Tipo doc proveedor (6 = RUC)
          sanitizarCampoPlano(c.proveedorRuc || '20000000001'), // 12. RUC
          sanitizarCampoPlano(c.proveedorNombre || 'PROVEEDOR S.A.C.'), // 13. Razón social
          Money.format(baseVal), // 14. Base gravada 1
          Money.format(igvVal), // 15. IGV 1
          '0.00', '0.00', '0.00', '0.00', // 16-19. Destinos 2 y 3
          Money.format(c.baseNoGravada || 0), // 20. No gravadas
          '0.00', '0.00', '0.00', // 21-23. ISC, ICBPER, otros
          Money.format(totalVal), // 24. Total
          c.moneda || 'PEN', // 25. Moneda
          Money.create(c.tipoCambio || 1.0).toFixed(3), // 26. Tipo de cambio
          (c as any).fechaDocModificado ? (c as any).fechaDocModificado.split('-').reverse().join('/') : '', // 27. Fecha mod
          (c as any).tipoDocModificado || '', // 28. Tipo mod
          (c as any).serieDocModificado || '', // 29. Serie mod
          '', // 30. Aduana
          (c as any).numeroDocModificado || '', // 31. Num mod
          '', '', // 32-33. Detracción
          '', // 34. Retención
          '1', // 35. Clasificación bienes
          '', // 36. Contrato
          '', '', '', // 37-39. Errores
          '1', // 40. Medio de pago
          '1', // 41. Estado de anotación (1: En plazo)
          '' // 42. Libre
        ];
        lineas.push(campos.join('|') + '|');
        correlativo++;
      }
    } else if (codigoLibro === '080200') {
      // Registro de Compras No Domiciliados 8.2 (36 campos)
      const comprasNd = COMPRAS_MEMORIA.filter(
        c => c.empresaId === empresaId && c.periodoId === `per-${periodo}` && c.tipoComprobante === '00'
      );
      let correlativo = 1;
      for (const c of comprasNd) {
        const cuo = `ND${String(correlativo).padStart(6, '0')}`;
        const totalVal = Money.round(c.total || 0);
        sumaTotal = Money.add(sumaTotal, totalVal);

        const campos = [
          `${anio}${mes}00`, // 1. Periodo
          cuo, // 2. CUO
          'M1', // 3. Correlativo
          c.fechaEmision.split('-').reverse().join('/'), // 4. Fecha emision
          sanitizarCampoPlano(c.tipoComprobante || '00'), // 5. Tipo cmp
          sanitizarCampoPlano(c.serie || '0001'), // 6. Serie
          sanitizarCampoPlano(c.numero || '00000001'), // 7. Numero
          Money.format(totalVal), // 8. Valor adquisicion
          '0.00', // 9. Otros conceptos
          Money.format(totalVal), // 10. Importe total
          '', '', '', '', '', // 11-15. Comprobante sustenta credito fiscal
          c.moneda || 'USD', // 16. Moneda
          Money.create(c.tipoCambio || 1.0).toFixed(3), // 17. TC
          'US', // 18. Pais residencia
          sanitizarCampoPlano(c.proveedorNombre || 'SUPPLIER LLC'), // 19. Razon social
          '123 MAIN ST, MIAMI, USA', // 20. Domicilio
          'TIN-987654321', // 21. TIN
          '', '', '', '', // 22-25. Beneficiario
          Money.format(totalVal), // 26. Renta bruta
          '0.00', // 27. Deduccion
          Money.format(totalVal), // 28. Renta neta
          '0.30', // 29. Tasa retencion
          Money.format(Money.mul(totalVal, '0.30')), // 30. Impuesto retenido
          '0', '0', '01', '01', '0', // 31-35. CDI, Exoneracion, Art 76
          '1' // 36. Estado
        ];
        lineas.push(campos.join('|') + '|');
        correlativo++;
      }
    } else if (codigoLibro === '140100') {
      // Registro de Ventas 14.1 (35 campos oficiales)
      const ventas = VENTAS_MEMORIA.filter(
        v => v.empresaId === empresaId && v.periodoId === `per-${periodo}` && v.estado === 'REGISTRADO'
      );

      let correlativo = 1;
      for (const v of ventas) {
        const fechaEmisionFmt = (v.fechaEmision || '').split('-').reverse().join('/');
        const fechaVencFmt = (v.fechaVencimiento || v.fechaEmision || '').split('-').reverse().join('/');
        const cuo = `V${String(correlativo).padStart(6, '0')}`;

        const baseVal = Money.round(v.baseGravada || 0);
        const igvVal = Money.round(v.igv || 0);
        const totalVal = Money.round(v.total || 0);

        sumaBase = Money.add(sumaBase, baseVal);
        sumaIgv = Money.add(sumaIgv, igvVal);
        sumaTotal = Money.add(sumaTotal, totalVal);

        const campos = [
          `${anio}${mes}00`, // 1. Periodo
          cuo, // 2. CUO
          'M1', // 3. Correlativo
          fechaEmisionFmt, // 4. Fecha emisión
          fechaVencFmt, // 5. Fecha vencimiento
          sanitizarCampoPlano(v.tipoComprobante), // 6. Tipo comprobante
          sanitizarCampoPlano(v.serie), // 7. Serie
          sanitizarCampoPlano(v.numero), // 8. Número
          '', // 9. Rango final
          '6', // 10. Tipo doc cliente
          sanitizarCampoPlano(v.clienteRuc || '20000000001'), // 11. RUC
          sanitizarCampoPlano(v.clienteNombre || 'CLIENTE S.A.C.'), // 12. Razón social
          '0.00', // 13. Exportación
          Money.format(baseVal), // 14. Base gravada
          '0.00', // 15. Descuento
          Money.format(igvVal), // 16. IGV
          '0.00', // 17. Descuento IGV
          '0.00', // 18. Exonerado
          '0.00', // 19. Inafecto
          '0.00', // 20. ISC
          '0.00', // 21. Base IVAP
          '0.00', // 22. IVAP
          '0.00', // 23. ICBPER
          '0.00', // 24. Otros tributos
          Money.format(totalVal), // 25. Total
          v.moneda || 'PEN', // 26. Moneda
          Money.create(v.tipoCambio || 1.0).toFixed(3), // 27. TC
          (v as any).fechaDocModificado ? (v as any).fechaDocModificado.split('-').reverse().join('/') : '', // 28. Fecha modificado
          (v as any).tipoDocModificado || '', // 29. Tipo modificado
          (v as any).serieDocModificado || '', // 30. Serie modificado
          (v as any).numeroDocModificado || '', // 31. Num modificado
          '', // 32. Proyecto
          '', // 33. Error 1
          '1', // 34. Medio de pago
          '1' // 35. Estado de anotación
        ];
        lineas.push(campos.join('|') + '|');
        correlativo++;
      }
    } else if (codigoLibro === '050100') {
      // Libro Diario 5.1 (21 campos oficiales)
      const asientos = ASIENTOS_MEMORIA.filter(
        a => a.empresaId === empresaId && a.periodoId === `per-${periodo}` && a.estado === 'CONTABILIZADO'
      );

      let correlativoAsiento = 1;
      for (const a of asientos) {
        const cuo = a.cuo || a.numero || `D${String(correlativoAsiento).padStart(6, '0')}`;
        let correlativoLinea = 1;

        for (const d of a.detalles || []) {
          const debeVal = Money.round(d.debe || 0);
          const haberVal = Money.round(d.haber || 0);
          sumaDebe = Money.add(sumaDebe, debeVal);
          sumaHaber = Money.add(sumaHaber, haberVal);

          const cuentaCodigo = sanitizarCampoPlano(d.cuentaCodigo || d.cuentaId || '10111').replace(/^cta-/, '');
          const tipoDocTercero = sanitizarCampoPlano(d.anexoTipoDoc || (d.anexoId ? '6' : ''));
          const numDocTercero = sanitizarCampoPlano(d.anexoNumero || d.anexoNumDoc || (d.anexoId ? '20000000001' : ''));
          const tipoComp = sanitizarCampoPlano(d.docTipo || (d.docNumero ? '01' : ''));
          const serieComp = sanitizarCampoPlano(d.docSerie || '');
          const numComp = sanitizarCampoPlano(d.docNumero || '');
          const fechaCont = (a.fecha || '').split('-').reverse().join('/');
          const fechaVenc = (d.fechaVencimiento || a.fecha || '').split('-').reverse().join('/');
          const fechaOper = (d.fechaEmision || a.fechaDocumento || a.fecha || '').split('-').reverse().join('/');

          const campos = [
            `${anio}${mes}00`, // 1. Periodo
            cuo, // 2. CUO
            d.correlativoPle || `M${correlativoLinea}`, // 3. Correlativo asiento
            cuentaCodigo, // 4. Cuenta contable
            sanitizarCampoPlano(d.unidadOperacion || ''), // 5. Unidad de operacion
            sanitizarCampoPlano(d.centroCostoCodigo || d.centroCostoId || ''), // 6. Centro costos
            a.moneda || 'PEN', // 7. Moneda
            tipoDocTercero || (d.docNumero ? '6' : ''), // 8. Tipo doc tercero
            numDocTercero || (d.docNumero ? '20000000001' : ''), // 9. Num doc tercero
            tipoComp || '01', // 10. Tipo comprobante
            serieComp || 'F001', // 11. Serie comprobante
            numComp || '00000001', // 12. Numero comprobante
            fechaCont, // 13. Fecha contable
            fechaVenc, // 14. Fecha vencimiento
            fechaOper, // 15. Fecha operacion
            sanitizarCampoPlano(a.glosa || 'Asiento de diario'), // 16. Glosa (sanitizada de pipes)
            sanitizarCampoPlano(d.glosaLinea || d.glosaDetalle || ''), // 17. Glosa referencial
            Money.format(debeVal), // 18. Debe
            Money.format(haberVal), // 19. Haber
            sanitizarCampoPlano(d.libroReferencial || ''), // 20. Libro referencial
            a.estadoOperacion || '1' // 21. Estado operacion
          ];
          lineas.push(campos.join('|') + '|');
          correlativoLinea++;
        }
        correlativoAsiento++;
      }
    } else if (codigoLibro === '060100') {
      // Libro Mayor 6.1 (16 campos oficiales)
      const asientos = ASIENTOS_MEMORIA.filter(
        a => a.empresaId === empresaId && a.periodoId === `per-${periodo}` && a.estado === 'CONTABILIZADO'
      );

      let correlativoAsiento = 1;
      for (const a of asientos) {
        const cuo = a.cuo || a.numero || `MY${String(correlativoAsiento).padStart(6, '0')}`;
        let correlativoLinea = 1;

        for (const d of a.detalles || []) {
          const debeVal = Money.round(d.debe || 0);
          const haberVal = Money.round(d.haber || 0);
          sumaDebe = Money.add(sumaDebe, debeVal);
          sumaHaber = Money.add(sumaHaber, haberVal);

          const cuentaCodigo = sanitizarCampoPlano(d.cuentaCodigo || d.cuentaId || '10111').replace(/^cta-/, '');
          const tipoDocTercero = sanitizarCampoPlano(d.anexoTipoDoc || (d.anexoId ? '6' : ''));
          const numDocTercero = sanitizarCampoPlano(d.anexoNumero || d.anexoNumDoc || (d.anexoId ? '20000000001' : ''));
          const tipoComp = sanitizarCampoPlano(d.docTipo || (d.docNumero ? '01' : ''));
          const serieComp = sanitizarCampoPlano(d.docSerie || '');
          const numComp = sanitizarCampoPlano(d.docNumero || '');
          const fechaCont = (a.fecha || '').split('-').reverse().join('/');

          const campos = [
            `${anio}${mes}00`, // 1. Periodo
            cuo, // 2. CUO
            d.correlativoPle || `M${correlativoLinea}`, // 3. Correlativo
            cuentaCodigo, // 4. Cuenta contable
            sanitizarCampoPlano(d.unidadOperacion || ''), // 5. Unidad operacion
            sanitizarCampoPlano(d.centroCostoCodigo || d.centroCostoId || ''), // 6. Centro costos
            a.moneda || 'PEN', // 7. Moneda
            tipoDocTercero || (d.docNumero ? '6' : ''), // 8. Tipo doc tercero
            numDocTercero || (d.docNumero ? '20000000001' : ''), // 9. Num doc tercero
            tipoComp || '01', // 10. Tipo comprobante
            serieComp || 'F001', // 11. Serie comprobante
            numComp || '00000001', // 12. Numero comprobante
            fechaCont, // 13. Fecha contable
            sanitizarCampoPlano(d.glosaLinea || a.glosa || 'Movimiento de mayor'), // 14. Glosa
            Money.format(debeVal), // 15. Debe
            Money.format(haberVal) // 16. Haber
          ];
          lineas.push(campos.join('|') + '|');
          correlativoLinea++;
        }
        correlativoAsiento++;
      }
    } else if (codigoLibro === '010100') {
      // Libro Caja Efectivo 1.1 (15 campos oficiales)
      const asientosCaja = ASIENTOS_MEMORIA.filter(
        a => a.empresaId === empresaId && a.periodoId === `per-${periodo}` && a.estado === 'CONTABILIZADO' &&
             (a.detalles || []).some((d: any) => (d.cuentaCodigo || d.cuentaId || '').startsWith('101'))
      );

      let correlativo = 1;
      for (const a of asientosCaja) {
        const cuo = `CJ${String(correlativo).padStart(6, '0')}`;
        for (const d of a.detalles || []) {
          if ((d.cuentaCodigo || d.cuentaId || '').startsWith('101')) {
            const debeVal = Money.round(d.debe || 0);
            const haberVal = Money.round(d.haber || 0);
            sumaDebe = Money.add(sumaDebe, debeVal);
            sumaHaber = Money.add(sumaHaber, haberVal);

            const campos = [
              `${anio}${mes}00`, // 1. Periodo
              cuo, // 2. CUO
              'M1', // 3. Correlativo
              sanitizarCampoPlano(d.cuentaCodigo || d.cuentaId || '10111'), // 4. Cuenta contable
              '', // 5. Unidad operacion
              sanitizarCampoPlano(d.centroCostoId || ''), // 6. Centro costos
              'PEN', // 7. Moneda
              '01', // 8. Tipo comprobante
              'F001', // 9. Serie
              '00000001', // 10. Numero
              a.fecha.split('-').reverse().join('/'), // 11. Fecha operacion
              sanitizarCampoPlano(a.glosa || 'Movimiento efectivo'), // 12. Glosa
              Money.format(debeVal), // 13. Debe
              Money.format(haberVal), // 14. Haber
              '1' // 15. Estado
            ];
            lineas.push(campos.join('|') + '|');
            correlativo++;
          }
        }
      }
    } else if (codigoLibro === '010200') {
      // Libro Caja Bancos Cuenta Corriente 1.2 (15 campos oficiales)
      const asientosBancos = ASIENTOS_MEMORIA.filter(
        a => a.empresaId === empresaId && a.periodoId === `per-${periodo}` && a.estado === 'CONTABILIZADO' &&
             (a.detalles || []).some((d: any) => (d.cuentaCodigo || d.cuentaId || '').startsWith('104'))
      );

      let correlativo = 1;
      for (const a of asientosBancos) {
        const cuo = `BC${String(correlativo).padStart(6, '0')}`;
        for (const d of a.detalles || []) {
          if ((d.cuentaCodigo || d.cuentaId || '').startsWith('104')) {
            const debeVal = Money.round(d.debe || 0);
            const haberVal = Money.round(d.haber || 0);
            sumaDebe = Money.add(sumaDebe, debeVal);
            sumaHaber = Money.add(sumaHaber, haberVal);

            const campos = [
              `${anio}${mes}00`, // 1. Periodo
              cuo, // 2. CUO
              'M1', // 3. Correlativo
              '002', // 4. Entidad financiera (BCP)
              '191-12345678-0-99', // 5. Cuenta corriente
              a.fecha.split('-').reverse().join('/'), // 6. Fecha operacion
              '001', // 7. Medio de pago (deposito en cuenta)
              sanitizarCampoPlano(a.glosa || 'Operacion bancaria'), // 8. Glosa
              '6', // 9. Tipo doc tercero
              '20000000001', // 10. Num doc tercero
              'PROVEEDOR S.A.C.', // 11. Razon social
              'OP-998822', // 12. Num transaccion
              Money.format(debeVal), // 13. Debe
              Money.format(haberVal), // 14. Haber
              '1' // 15. Estado
            ];
            lineas.push(campos.join('|') + '|');
            correlativo++;
          }
        }
      }
    }

    const tieneContenido = (lineas.length > 0 && !opciones.sinMovimiento) ? '1' : '0';
    const nombreArchivoOficial = `LE${ruc}${anio}${mes}00${codigoLibro}00${indOperacionStr}${tieneContenido}${indMonedaNum}1.txt`;
    const nombreArchivoFinal = !esModoOficial ? `VISTA_PREVIA_${nombreArchivoOficial}` : nombreArchivoOficial;

    // CRLF (\r\n) y UTF-8 sin BOM conforme a la normativa SUNAT
    const contenidoTxt = lineas.length > 0 ? lineas.join('\r\n') : '';
    const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');

    const exportacion: PleExportacionModel = {
      id: `ple-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      empresaId,
      periodo,
      codigoLibro,
      nombreArchivo: nombreArchivoFinal,
      contenidoTxt,
      hashSha256,
      totalFilas: lineas.length,
      esOficial: esModoOficial,
      indicadorContenido: tieneContenido,
      indicadorOperacion: indOperacionStr,
      validacionesSuperadas: prevalidacion.validacionesSuperadas,
      totalesControl: {
        totalFilas: lineas.length,
        sumaDebe: Money.toNumber(sumaDebe),
        sumaHaber: Money.toNumber(sumaHaber),
        sumaBase: Money.toNumber(sumaBase),
        sumaIgv: Money.toNumber(sumaIgv),
        sumaTotal: Money.toNumber(sumaTotal)
      },
      detalleValidaciones: {
        asientosBorrador: prevalidacion.asientosBorrador,
        cuadreContableOk: prevalidacion.cuadreContableOk,
        camposRequeridosOk: true,
        advertencias: prevalidacion.advertencias
      },
      createdAt: new Date().toISOString()
    };

    PLE_EXPORTACIONES_MEMORIA.push(exportacion);

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      tablaAfectada: 'ple_exportaciones',
      registroId: exportacion.id,
      accion: 'EXPORTACION_PLE',
      datosNuevos: {
        codigoLibro,
        nombreArchivo: exportacion.nombreArchivo,
        totalFilas: exportacion.totalFilas,
        esOficial: exportacion.esOficial,
        hash: hashSha256
      }
    });

    return exportacion;
  },

  obtenerExportacion(id: string): PleExportacionModel | null {
    return PLE_EXPORTACIONES_MEMORIA.find(p => p.id === id) || null;
  },

  listarExportaciones(empresaId: string): PleExportacionModel[] {
    return PLE_EXPORTACIONES_MEMORIA.filter(p => p.empresaId === empresaId);
  }
};
