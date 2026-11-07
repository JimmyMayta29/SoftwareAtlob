const nombreCredencial = /(?:(?:usuario|clave|password|contrasena)[_-]?sol|client[_-]?(?:id|secret)(?:[_-]?sire)?|secreto[_-]?(?:sire|api|totp)|identificador[_-]?(?:sol|api)|password|pgpassword|connection[_-]?string|(?:test[_-]?)?database[_-]?url|(?:access|refresh)[_-]?token|token(?:[_-]?sunat)?|authorization|mfa[_-]?(?:secret|seed[_-]?secret|code)|jwt(?:[_-]?refresh)?[_-]?secret|(?:sunat|backup)[_-]?encryption[_-]?key|(?:api|private|secret)[_-]?key|(?:pin|clave)[_-]?certificado|certificado[_-]?pfx|encrypted[_-]?dek|auth[_-]?tag)(?:[_-]?(?:encrypted|cifrad[oa]|iv|tag))?/;
const campoSensible = new RegExp(`^${nombreCredencial.source}$`, 'i');
const valorSensible = new RegExp(String.raw`(?<![\w-])(["']?)(${nombreCredencial.source})\1\s*(?:=|:)\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;}]+)`, 'gi');

export function sanitizarMensaje(error: unknown, alternativo = 'Error desconocido'): string {
  const mensaje = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  return (mensaje || alternativo)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTADO]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTADO]')
    .replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@]+:[^\s/@]+@/gi, '$1://[REDACTADO]@')
    .replace(valorSensible, '$2=[REDACTADO]');
}

export function sanitizarDatos(datos: unknown): unknown {
  if (typeof datos === 'string') return sanitizarMensaje(datos, '');
  if (Array.isArray(datos)) return datos.map(sanitizarDatos);
  if (datos === null || typeof datos !== 'object' || datos instanceof Date) return datos;
  return Object.fromEntries(Object.entries(datos)
    .filter(([campo]) => !campoSensible.test(campo))
    .map(([campo, valor]) => [campo, sanitizarDatos(valor)]));
}

const tablasCredenciales = new Set(['credenciales_sunat', 'sunat_conexiones', 'sunat_empresa_keys', 'sunat_tokens']);
const indicadoresAuditoria = [
  'cambioUsuarioSol', 'cambioClaveSol', 'cambioIdentificadorSire', 'cambioSecretoSire',
  'tieneSireSecret', 'modoSimulado', 'valido'
];
const estadosConexion = new Set(['SIN_CONFIGAR', 'SIN_CONFIGURAR', 'VALIDANDO', 'CONECTADO', 'ERROR', 'CREDENCIALES_VENCIDAS', 'MODO_SIMULADO']);
const operacionesConexion = new Set(['ACTUALIZAR_CREDENCIALES', 'VALIDAR_CONEXION']);

// Primera barrera: lista blanca estricta de campos permitidos en detalles de auditoría.
const CAMPOS_COMUNES_AUDITORIA = [
  'id', 'empresaId', 'periodoId', 'ejercicioId', 'asientoId', 'estado', 'version',
  'motivo', 'glosa', 'moneda', 'tipoCambio', 'fecha', 'periodo', 'anio', 'mes',
  'total', 'subtotal', 'igv', 'operacionAuditoria', 'advertencia', 'advertencias',
  'createdAt', 'updatedAt'
] as const;

const LISTA_BLANCA_POR_TABLA: Record<string, readonly string[]> = {
  empresas: [
    'tenantId', 'codigoEmpresa', 'ruc', 'razonSocial', 'nombreComercial',
    'regimenTributario', 'domicilioFiscal', 'departamento', 'provincia', 'distrito',
    'contactoNombre', 'contactoTelefono', 'contactoEmail', 'monedaPrincipal',
    'metodoInventario', 'esDemo', 'isActive'
  ],
  asientos: [
    'subdiarioId', 'numero', 'cuo', 'origen', 'origenId', 'fechaDocumento',
    'codigoLibro', 'estadoOperacion', 'totalDebe', 'totalHaber', 'extornoId',
    'asientoExtornoId', 'detalles', 'linea', 'cuentaId', 'cuentaCodigo', 'cuentaNombre',
    'anexoId', 'anexoTipoDoc', 'anexoNumero', 'anexoNumDoc', 'anexoNombre',
    'debe', 'haber', 'debeMe', 'haberMe', 'centroCostoId', 'centroCostoCodigo',
    'unidadOperacion', 'docTipo', 'docSerie', 'docNumero', 'fechaEmision',
    'fechaVencimiento', 'glosaLinea', 'correlativoPle'
  ],
  periodos: ['accion', 'codigoPeriodo', 'totalDebe', 'totalHaber', 'fechaCierre'],
  comprobantes_compra: [
    'fechaEmision', 'fechaVencimiento', 'fechaContable', 'tipoComprobante', 'serie', 'numero',
    'proveedorId', 'proveedorNombre', 'proveedorRuc', 'baseGravada', 'baseNoGravada',
    'exonerado', 'isc', 'icbper', 'otrosTributos', 'tipoAdquisicion', 'formaPago',
    'diasCredito', 'tieneDetraccion', 'codigoBienDetraccion', 'porcentajeDetraccion',
    'tieneRetencion', 'porcentajeRetencion', 'esServicio', 'esActivo', 'porcentajeAdmin',
    'porcentajeVentas', 'asientoNumero', 'asientoGenerado', 'documentoOriginalId',
    'esVenta', 'tipoNota', 'motivoCodigo', 'motivoDescripcion', 'nuevoSaldo'
  ],
  comprobantes_venta: [
    'fechaEmision', 'fechaVencimiento', 'fechaContable', 'tipoComprobante', 'serie', 'numero',
    'clienteId', 'clienteNombre', 'clienteRuc', 'baseGravada', 'baseNoGravada',
    'exonerado', 'isc', 'icbper', 'otrosTributos', 'tipoOperacion', 'formaPago',
    'diasCredito', 'tieneDetraccion', 'codigoBienDetraccion', 'porcentajeDetraccion',
    'tienePercepcion', 'porcentajePercepcion', 'hashCpe', 'asientoNumero', 'asientoGenerado',
    'documentoOriginalId', 'esVenta', 'tipoNota', 'motivoCodigo', 'motivoDescripcion', 'nuevoSaldo'
  ],
  cuentas_por_pagar: [
    'comprobanteId', 'proveedorId', 'proveedorNombre', 'proveedorRuc', 'serieNumero',
    'importeOriginal', 'saldo', 'fechaEmision', 'fechaVencimiento', 'diasCredito',
    'notaId', 'nuevoSaldoRestituido'
  ],
  cuentas_por_cobrar: [
    'comprobanteId', 'clienteId', 'clienteNombre', 'clienteRuc', 'serieNumero',
    'importeOriginal', 'saldo', 'fechaEmision', 'fechaVencimiento', 'diasCredito',
    'notaId', 'nuevoSaldoRestituido'
  ],
  aplicaciones_pago: [
    'input', 'resultados', 'fechaPago', 'referenciaBanco', 'aplicaciones',
    'cuentaPorPagarId', 'importe', 'aplicacionId', 'nuevoSaldo', 'estadoCuenta'
  ],
  aplicaciones_cobranza: [
    'input', 'resultados', 'fechaCobranza', 'referenciaBanco', 'aplicaciones',
    'cuentaPorCobrarId', 'importe', 'aplicacionId', 'nuevoSaldo', 'estadoCuenta'
  ],
  cajas_chicas: ['nombre', 'responsableAnexoId', 'cuentaFinancieraId', 'montoFondo', 'saldoActual'],
  extractos_bancarios: [
    'cuentaFinancieraId', 'nombreArchivo', 'totalLineas', 'fechaCorteDesde',
    'fechaCorteHasta', 'saldoInicial', 'saldoFinal', 'hashArchivo'
  ],
  conciliaciones_bancarias: [
    'cuentaFinancieraId', 'fechaCorte', 'saldoSegunLibros', 'saldoSegunBanco',
    'partidasConciliadas', 'partidasEnTransito', 'diferencia', 'cerradaPor', 'fechaCierre'
  ],
  movimientos_tesoreria: [
    'cuentaFinancieraId', 'tipo', 'medioPago', 'numeroOperacion', 'anexoId',
    'importe', 'importeMe', 'saldoSinAplicar', 'conciliado', 'aplicaciones',
    'documentoId', 'importeAplicado'
  ],
  recibos_honorarios: [
    'proveedorId', 'proveedorNombre', 'proveedorRuc', 'serie', 'numero',
    'fechaEmision', 'fechaPago', 'importeBruto', 'aplicaRetencion', 'tasaRetencion',
    'retencion', 'netoPagar', 'suspensionCuarta', 'numeroResolucionSuspension',
    'vigenciaSuspensionDesde', 'vigenciaSuspensionHasta', 'cuentaGasto',
    'cuentaPorPagarId', 'origenParametroTasa'
  ],
  trabajadores: [
    'tipoDocumento', 'numeroDocumento', 'apellidosNombres', 'regimenLaboral',
    'sistemaPensiones', 'cuentaBancoSueldo', 'cciSueldo', 'activo'
  ],
  planillas: [
    'fechaCalculo', 'fechaPago', 'totalIngresos', 'totalDescuentos',
    'totalAportesEmpleador', 'totalNeto', 'trabajadores', 'asientoPagoId',
    'nombreArchivoZip', 'trabajadoresExportados', 'documentosEnmascarados'
  ],
  planilla_lineas: [
    'planillaId', 'trabajadorId', 'numeroDocumento', 'cuentaBancoSueldo',
    'cciSueldo', 'rolSolicitante'
  ],
  tregistro_movimientos: [
    'ruc', 'trabajadorId', 'tipoMovimiento', 'fechaEfectiva', 'motivoBaja',
    'totalTrabajadores', 'documentosEnmascarados'
  ],
  consolidaciones_mensuales: [
    'metodoInventario', 'totalAsientos', 'resumen', 'totalComprasNetas',
    'totalVentasNetas', 'totalCostoVentas', 'totalVariacionExistencias',
    'asientosIds', 'claveConsolidacion', 'usuarioId', 'extornosGenerados'
  ],
  declaraciones_pdt621: [
    'igvPorPagar', 'nuevoSaldoAFavor', 'pagoCuentaRenta', 'asientoDeterminacionId',
    'numeroOrden', 'fechaPresentacion', 'totalTributosPorPagar',
    'declaracionAnteriorId', 'motivoRectificatoria'
  ],
  daot_exclusiones: ['rucTercero', 'tipoOperacion', 'motivoExclusion'],
  detracciones: [
    'comprobanteCompraId', 'comprobanteVentaId', 'codigoBien', 'descripcionBien',
    'porcentaje', 'monto', 'cuentaBancoNacion', 'numeroConstancia', 'fechaDeposito',
    'permiteCreditoFiscal', 'periodoAcreditado'
  ],
  parametros_tributarios: [
    'codigoParametro', 'codigo', 'nombre', 'categoria', 'valorNumerico', 'valorTexto',
    'vigenteDesde', 'vigenteHasta', 'normaReferencia'
  ],
  cronograma_vencimientos: [
    'ultimoDigitoRuc', 'fechaVencimientoPdt621', 'fechaVencimientoPlame', 'fuenteResolucion'
  ],
  sire_propuestas: [
    'tipo', 'ticket', 'numTicket', 'modoSimulado', 'totalComprobantes',
    'totalRegistros', 'nombreArchivo', 'hash', 'hashSha256', 'estadoApiSunat'
  ],
  sire_conciliacion_lineas: [
    'difTotal', 'difBase', 'difIgv', 'clave', 'comprobanteGeneradoId',
    'destinoCompra', 'lineaId', 'extornoId'
  ],
  sire_ajustes_posteriores: [
    'periodoAjuste', 'periodoAfectado', 'ajusteData', 'estadoApiSunat',
    'tipoComprobante', 'serie', 'numero', 'proveedorRuc', 'clienteRuc', 'importeAjuste'
  ],
  reglas_proveedor_sire: [
    'proveedorRuc', 'proveedorRazonSocial', 'destinoCompra', 'cuentaGasto',
    'cuentaContableDestino', 'centroCostoId', 'formaPagoDefault', 'diasCredito',
    'aprobacionAutomatica'
  ],
  ple_exportaciones: ['codigoLibro', 'nombreArchivo', 'totalFilas', 'esOficial', 'hash'],
  historial_generaciones_electronicas: ['modulo', 'subtipo', 'nombreArchivo', 'hash', 'totalRegistros'],
  comprobantes_xml: ['totalArchivos', 'exitosos', 'fallidos'],
  backups_empresa: ['nombreArchivo', 'origen', 'tamanoBytes', 'hashSha256'],
  restauracion_backup: ['ruc', 'totalRestaurados', 'origenBackup', 'fechaBackup'],
  MIGRACION_LOCALSTORAGE: [
    'totalEmpresas', 'totalCompras', 'totalVentas', 'totalAsientos',
    'totalHonorarios', 'totalTrabajadores', 'totalMovimientos', 'errores',
    'success', 'timestamp'
  ],
  general: ['accion', 'resultado', 'totalRegistros']
};

const CONJUNTOS_LISTA_BLANCA = new Map<string, Set<string>>(
  Object.entries(LISTA_BLANCA_POR_TABLA).map(([tabla, campos]) => [
    tabla,
    new Set([...CAMPOS_COMUNES_AUDITORIA, ...campos])
  ])
);
const CONJUNTO_COMUN = new Set<string>(CAMPOS_COMUNES_AUDITORIA);

export function esCampoPermitidoAuditoria(tabla: string, campo: string): boolean {
  if (campoSensible.test(campo)) return false;
  if (tablasCredenciales.has(tabla)) {
    return indicadoresAuditoria.includes(campo) || campo === 'estado' || campo === 'operacionAuditoria';
  }
  const conjunto = CONJUNTOS_LISTA_BLANCA.get(tabla) ?? CONJUNTO_COMUN;
  return conjunto.has(campo);
}

function enmascararValorCampo(campo: string, valor: string): string {
  const limpio = sanitizarMensaje(valor, '');
  if ((campo === 'cuentaBancoSueldo' || campo === 'cciSueldo') && limpio.length > 4 && !limpio.includes('*')) {
    return `${'*'.repeat(Math.max(4, limpio.length - 4))}${limpio.slice(-4)}`;
  }
  return limpio;
}

function proyectarConListaBlanca(tabla: string, valor: unknown, profundidad = 0): unknown {
  if (profundidad > 4 || valor === null || valor === undefined) return valor;
  if (typeof valor === 'boolean' || typeof valor === 'number') return valor;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'string') return sanitizarMensaje(valor, '');
  if (Array.isArray(valor)) {
    return valor
      .slice(0, 100)
      .map(elemento => proyectarConListaBlanca(tabla, elemento, profundidad + 1))
      .filter(elemento => elemento !== undefined);
  }
  if (typeof valor !== 'object') return undefined;

  const salida: Record<string, unknown> = {};
  for (const [campo, subvalor] of Object.entries(valor as Record<string, unknown>)) {
    // Primera barrera: lista blanca explícita por tabla; segunda barrera: regex de campos y valores sensibles.
    if (!esCampoPermitidoAuditoria(tabla, campo)) continue;
    if (subvalor === undefined) continue;
    if (typeof subvalor === 'string') {
      salida[campo] = enmascararValorCampo(campo, subvalor);
    } else {
      const proyectado = proyectarConListaBlanca(tabla, subvalor, profundidad + 1);
      if (proyectado !== undefined) salida[campo] = proyectado;
    }
  }
  return salida;
}

export function filtrarDetalleAuditoria(tabla: string, datos: unknown): unknown {
  if (datos === undefined || datos === null) return datos;
  if (tablasCredenciales.has(tabla)) {
    if (typeof datos !== 'object' || Array.isArray(datos)) return undefined;
    const origen = datos as Record<string, unknown>;
    const detalle: Record<string, string | boolean> = {};
    for (const campo of indicadoresAuditoria) {
      const valor = origen[campo];
      if (typeof valor === 'boolean' && !campoSensible.test(campo)) detalle[campo] = valor;
    }
    if (typeof origen.estado === 'string' && estadosConexion.has(origen.estado)) detalle.estado = origen.estado;
    if (typeof origen.operacionAuditoria === 'string' && operacionesConexion.has(origen.operacionAuditoria)) {
      detalle.operacionAuditoria = origen.operacionAuditoria;
    }
    return detalle;
  }
  if (typeof datos !== 'object' || Array.isArray(datos) || datos instanceof Date) return undefined;
  return proyectarConListaBlanca(tabla, datos, 0);
}
