const nombreCredencial = /(?:(?:usuario|clave|password|contrasena)[_-]?sol|client[_-]?(?:id|secret)(?:[_-]?sire)?|secreto[_-]?(?:sire|api|totp)|identificador[_-]?(?:sol|api)|password|(?:access|refresh)[_-]?token|token(?:[_-]?sunat)?|authorization|mfa[_-]?(?:secret|code)|jwt(?:[_-]?refresh)?[_-]?secret|(?:sunat|backup)[_-]?encryption[_-]?key|auth[_-]?tag)(?:[_-]?(?:encrypted|cifrad[oa]|iv|tag))?/;
const campoSensible = new RegExp(`^${nombreCredencial.source}$`, 'i');
const valorSensible = new RegExp(String.raw`(?<![\w-])(["']?)(${nombreCredencial.source})\1\s*(?:=|:)\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;}]+)`, 'gi');

export function sanitizarMensaje(error: unknown, alternativo = 'Error desconocido'): string {
  const mensaje = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  return (mensaje || alternativo)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTADO]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTADO]')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/gi, '[REDACTADO]@')
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
const estadosConexion = new Set(['SIN_CONFIGURAR', 'VALIDANDO', 'CONECTADO', 'ERROR', 'CREDENCIALES_VENCIDAS', 'MODO_SIMULADO']);
const operacionesConexion = new Set(['ACTUALIZAR_CREDENCIALES', 'VALIDAR_CONEXION']);

export function filtrarDetalleAuditoria(tabla: string, datos: unknown): unknown {
  if (!tablasCredenciales.has(tabla)) return sanitizarDatos(datos);
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return undefined;
  const origen = datos as Record<string, unknown>;
  const detalle: Record<string, string | boolean> = {};
  for (const campo of indicadoresAuditoria) {
    const valor = origen[campo];
    if (typeof valor === 'boolean') detalle[campo] = valor;
  }
  if (typeof origen.estado === 'string' && estadosConexion.has(origen.estado)) detalle.estado = origen.estado;
  if (typeof origen.operacionAuditoria === 'string' && operacionesConexion.has(origen.operacionAuditoria)) {
    detalle.operacionAuditoria = origen.operacionAuditoria;
  }
  return detalle;
}
