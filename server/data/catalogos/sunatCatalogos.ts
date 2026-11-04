/**
 * Atlob Consultores ERP — Catálogos Normativos SUNAT PLE 5.x / PCGE 2019 (Servidor)
 */

export interface CatalogoItem {
  codigo: string;
  descripcion: string;
  abreviatura?: string;
  estado?: 'CONFIRMADO' | 'PENDIENTE_VALIDAR';
  observacion?: string;
}

export const TABLA_2_TIPO_DOC_IDENTIDAD: CatalogoItem[] = [
  { codigo: '0', descripcion: 'DOC. TRIB. NO DOMICILIADO SIN RUC', abreviatura: 'S/D', estado: 'CONFIRMADO' },
  { codigo: '1', descripcion: 'DOCUMENTO NACIONAL DE IDENTIDAD (DNI)', abreviatura: 'DNI', estado: 'CONFIRMADO' },
  { codigo: '4', descripcion: 'CARNET DE EXTRANJERÍA', abreviatura: 'C/E', estado: 'CONFIRMADO' },
  { codigo: '6', descripcion: 'REGISTRO ÚNICO DE CONTRIBUYENTES (RUC)', abreviatura: 'RUC', estado: 'CONFIRMADO' },
  { codigo: '7', descripcion: 'PASAPORTE', abreviatura: 'PAS', estado: 'CONFIRMADO' },
  { codigo: 'A', descripcion: 'CÉDULA DIPLOMÁTICA DE IDENTIDAD', abreviatura: 'CDI', estado: 'CONFIRMADO' },
  { codigo: 'B', descripcion: 'DOCUMENTO IDENTIDAD PAÍS RESIDENCIA-NO.D', abreviatura: 'EXT', estado: 'CONFIRMADO' },
  { codigo: 'C', descripcion: 'TAX IDENTIFICATION NUMBER (TIN - PERSONA NATURAL)', abreviatura: 'TIN', estado: 'CONFIRMADO' },
  { codigo: 'D', descripcion: 'IDENTIFICATION NUMBER (IN - PERSONA JURÍDICA)', abreviatura: 'IN', estado: 'CONFIRMADO' },
  { codigo: 'E', descripcion: 'TAM - TARJETA ANDINA DE MIGRACIÓN', abreviatura: 'TAM', estado: 'PENDIENTE_VALIDAR', observacion: 'Uso facultativo en regímenes de frontera' },
];

export const TABLA_4_TIPO_MONEDA: CatalogoItem[] = [
  { codigo: 'PEN', descripcion: 'SOL PERUANO (S/)', abreviatura: 'PEN', estado: 'CONFIRMADO' },
  { codigo: 'USD', descripcion: 'DÓLAR ESTADOUNIDENSE (US$)', abreviatura: 'USD', estado: 'CONFIRMADO' },
  { codigo: 'EUR', descripcion: 'EURO (€)', abreviatura: 'EUR', estado: 'CONFIRMADO' },
];

export const TABLA_10_TIPO_COMPROBANTE: CatalogoItem[] = [
  { codigo: '00', descripcion: 'OTROS DOCUMENTOS', abreviatura: 'OTROS', estado: 'CONFIRMADO' },
  { codigo: '01', descripcion: 'FACTURA', abreviatura: 'FAC', estado: 'CONFIRMADO' },
  { codigo: '02', descripcion: 'RECIBO POR HONORARIOS', abreviatura: 'RxH', estado: 'CONFIRMADO' },
  { codigo: '03', descripcion: 'BOLETA DE VENTA', abreviatura: 'BOL', estado: 'CONFIRMADO' },
  { codigo: '04', descripcion: 'LIQUIDACIÓN DE COMPRA', abreviatura: 'LIQ', estado: 'CONFIRMADO' },
  { codigo: '07', descripcion: 'NOTA DE CRÉDITO', abreviatura: 'NC', estado: 'CONFIRMADO' },
  { codigo: '08', descripcion: 'NOTA DE DÉBITO', abreviatura: 'ND', estado: 'CONFIRMADO' },
  { codigo: '09', descripcion: 'GUÍA DE REMISIÓN - REMITENTE', abreviatura: 'GRR', estado: 'CONFIRMADO' },
  { codigo: '12', descripcion: 'TICKET O CINTA EMITIDO POR MÁQUINA REGISTRADORA', abreviatura: 'TKT', estado: 'CONFIRMADO' },
  { codigo: '13', descripcion: 'DOCUMENTO EMITIDO POR BANCOS E INSTITUCIONES FINANCIERAS', abreviatura: 'DOC_BCO', estado: 'CONFIRMADO' },
  { codigo: '14', descripcion: 'RECIBO POR SERVICIOS PÚBLICOS', abreviatura: 'REC_SERV', estado: 'CONFIRMADO' },
  { codigo: '18', descripcion: 'DOCUMENTOS AUTORIZADOS POR SUNAT', abreviatura: 'DOC_AUT', estado: 'CONFIRMADO' },
  { codigo: '20', descripcion: 'COMPROBANTE DE RETENCIÓN', abreviatura: 'RET', estado: 'CONFIRMADO' },
  { codigo: '22', descripcion: 'COMPROBANTE POR OPERACIONES NO HABITUALES', abreviatura: 'NOHAB', estado: 'CONFIRMADO' },
  { codigo: '31', descripcion: 'GUÍA DE REMISIÓN - TRANSPORTISTA', abreviatura: 'GRT', estado: 'CONFIRMADO' },
  { codigo: '40', descripcion: 'COMPROBANTE DE PERCEPCIÓN', abreviatura: 'PERC', estado: 'CONFIRMADO' },
  { codigo: '50', descripcion: 'DECLARACIÓN ÚNICA DE ADUANAS (DUA) / DAM', abreviatura: 'DUA', estado: 'CONFIRMADO' },
  { codigo: '52', descripcion: 'DESPACHO SIMPLIFICADO DE IMPORTACIÓN (DSI)', abreviatura: 'DSI', estado: 'CONFIRMADO' },
  { codigo: '91', descripcion: 'COMPROBANTE DE NO DOMICILIADO', abreviatura: 'NO_DOM', estado: 'CONFIRMADO' },
  { codigo: '97', descripcion: 'NOTA DE CRÉDITO - NO DOMICILIADO', abreviatura: 'NC_NDOM', estado: 'CONFIRMADO' },
  { codigo: '98', descripcion: 'NOTA DE DÉBITO - NO DOMICILIADO', abreviatura: 'ND_NDOM', estado: 'CONFIRMADO' },
  { codigo: '99', descripcion: 'DOCUMENTO INTERNO / PLANILLA O VOUCHER', abreviatura: 'DOC_INT', estado: 'PENDIENTE_VALIDAR', observacion: 'Código auxiliar interno para asientos sin comprobante SUNAT externo' },
];

export const TABLA_8_LIBROS_PLE: CatalogoItem[] = [
  { codigo: '010100', descripcion: 'LIBRO CAJA Y BANCOS - DETALLE DE LOS MOVIMIENTOS DEL EFECTIVO (1.1)', estado: 'CONFIRMADO' },
  { codigo: '010200', descripcion: 'LIBRO CAJA Y BANCOS - DETALLE DE LOS MOVIMIENTOS DE LA CUENTA CORRIENTE (1.2)', estado: 'CONFIRMADO' },
  { codigo: '030100', descripcion: 'LIBRO DE INVENTARIOS Y BALANCES - BALANCE GENERAL (3.1)', estado: 'CONFIRMADO' },
  { codigo: '030200', descripcion: 'LIBRO DE INVENTARIOS Y BALANCES - DETALLE DEL SALDO DE LA CUENTA 10 (3.2)', estado: 'CONFIRMADO' },
  { codigo: '031800', descripcion: 'LIBRO DE INVENTARIOS Y BALANCES - ESTADO DE FLUJOS DE EFECTIVO (3.18)', estado: 'CONFIRMADO' },
  { codigo: '032000', descripcion: 'LIBRO DE INVENTARIOS Y BALANCES - ESTADO DE RESULTADOS (3.20)', estado: 'CONFIRMADO' },
  { codigo: '050100', descripcion: 'LIBRO DIARIO (5.1)', estado: 'CONFIRMADO' },
  { codigo: '050200', descripcion: 'LIBRO DIARIO DE FORMATO SIMPLIFICADO (5.2)', estado: 'CONFIRMADO' },
  { codigo: '060100', descripcion: 'LIBRO MAYOR (6.1)', estado: 'CONFIRMADO' },
  { codigo: '080100', descripcion: 'REGISTRO DE COMPRAS (8.1)', estado: 'CONFIRMADO' },
  { codigo: '080200', descripcion: 'REGISTRO DE COMPRAS - INFORMACIÓN PARA SUJETOS NO DOMICILIADOS (8.2)', estado: 'CONFIRMADO' },
  { codigo: '140100', descripcion: 'REGISTRO DE VENTAS E INGRESOS (14.1)', estado: 'CONFIRMADO' },
];

export const ESTADOS_OPERACION_PLE: CatalogoItem[] = [
  { codigo: '1', descripcion: 'Operación anotada en el período correspondiente', estado: 'CONFIRMADO' },
  { codigo: '8', descripcion: 'Operación omitida en un período anterior y regularizada en el actual', estado: 'CONFIRMADO' },
  { codigo: '9', descripcion: 'Ajuste o rectificación de operación anotada en período anterior', estado: 'CONFIRMADO' },
];

export const SUBDIARIOS_SISTEMA = [
  { codigo: '00', descripcion: '00 - Apertura e Inventario Inicial' },
  { codigo: '01', descripcion: '01 - Registro de Compras' },
  { codigo: '02', descripcion: '02 - Registro de Ventas' },
  { codigo: '03', descripcion: '03 - Planilla de Remuneraciones' },
  { codigo: '04', descripcion: '04 - Caja y Bancos' },
  { codigo: '05', descripcion: '05 - Diario General' },
  { codigo: '06', descripcion: '06 - Recibos por Honorarios' },
  { codigo: '07', descripcion: '07 - Provisiones del Ejercicio' },
  { codigo: '08', descripcion: '08 - Ajustes y Cierre' },
  { codigo: '09', descripcion: '09 - Cierre del Ejercicio' }
];

export const SUBDIARIOS_NORMATIVOS: CatalogoItem[] = [
  { codigo: '00', descripcion: '00 - Apertura e Inventario Inicial', abreviatura: 'APE', estado: 'CONFIRMADO' },
  { codigo: '01', descripcion: '01 - Registro de Compras (RCE / PLE 8.1)', abreviatura: 'CMP', estado: 'CONFIRMADO' },
  { codigo: '02', descripcion: '02 - Registro de Ventas (RVIE / PLE 14.1)', abreviatura: 'VNT', estado: 'CONFIRMADO' },
  { codigo: '03', descripcion: '03 - Ingreso de Caja / Cobranzas', abreviatura: 'CJ_ING', estado: 'CONFIRMADO' },
  { codigo: '04', descripcion: '04 - Egreso de Caja / Pagos Efectivo', abreviatura: 'CJ_EGR', estado: 'CONFIRMADO' },
  { codigo: '05', descripcion: '05 - Movimientos de Bancos y Cuentas Corrientes', abreviatura: 'BCO', estado: 'CONFIRMADO' },
  { codigo: '06', descripcion: '06 - Recibos por Honorarios (4ta Categoría)', abreviatura: 'RxH', estado: 'CONFIRMADO' },
  { codigo: '07', descripcion: '07 - Planilla de Remuneraciones y Beneficios', abreviatura: 'PLA', estado: 'CONFIRMADO' },
  { codigo: '08', descripcion: '08 - Destino y Transferencia Automática (Clase 9 / 79 / 20 / 61)', abreviatura: 'DST', estado: 'CONFIRMADO' },
  { codigo: '09', descripcion: '09 - Ajuste por Diferencia de Cambio y Cierre', abreviatura: 'CIE', estado: 'CONFIRMADO' },
];

export const CODIGOS_PENDIENTES_DE_VALIDAR = [
  { catalogo: 'Tabla 2 PLE', codigo: 'E', descripcion: 'TAM - Tarjeta Andina de Migración', motivo: 'Uso facultativo en regímenes especiales fronterizos; requiere resolución específica para PLE 5.x general.' },
  { catalogo: 'Tabla 10 PLE', codigo: '99', descripcion: 'Documento interno de planilla o voucher contable', motivo: 'Código de uso práctico interno del sistema contable; no admitido en compras ni ventas PLE.' },
  { catalogo: 'Libro PLE 6.1', codigo: '060100 (Variante 16 vs 21 campos)', descripcion: 'Estructura de campos de Libro Mayor 6.1', motivo: 'La especificación base del validador PLE 5.2 admite 16 campos consolidados (validado en archivoValidadorService.ts) y variante extendida de 21 campos para enlace con comprobante.' }
];
