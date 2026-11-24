import { PerfilBancoV2 } from '../../../types/conciliacionV2';

export const PERFILES_BANCO_PREDEFINIDOS: readonly PerfilBancoV2[] = [
  {
    id: null,
    empresaId: null,
    codigo: 'BCP_ESTANDAR',
    nombre: 'BCP — Formato Estándar (CSV / XLSX)',
    banco: 'BCP',
    formato: 'CSV',
    delimitador: ',',
    codificacion: 'UTF-8',
    filaEncabezado: 1,
    formatoFecha: 'DD/MM/YYYY',
    separadorDecimal: '.',
    mapeoColumnas: {
      fecha: 'Fecha',
      descripcion: 'Descripción operación',
      referencia: 'Nro. operación',
      monto: 'Monto',
      saldo: 'Saldo',
      signoCargoNegativo: true,
    },
    esSistema: true,
    predefinido: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    codigo: 'INTERBANK_ESTANDAR',
    nombre: 'Interbank — Formato Estándar (CSV / XLSX)',
    banco: 'Interbank',
    formato: 'CSV',
    delimitador: ';',
    codificacion: 'UTF-8',
    filaEncabezado: 1,
    formatoFecha: 'DD/MM/YYYY',
    separadorDecimal: '.',
    mapeoColumnas: {
      fecha: 'Fecha de operación',
      descripcion: 'Descripción',
      referencia: 'Nro. de operación',
      abono: 'Abono',
      cargo: 'Cargo',
      saldo: 'Saldo contable',
      signoCargoNegativo: true,
    },
    esSistema: true,
    predefinido: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    codigo: 'BBVA_ESTANDAR',
    nombre: 'BBVA — Formato Estándar (CSV / XLSX)',
    banco: 'BBVA',
    formato: 'XLSX',
    delimitador: null,
    codificacion: 'UTF-8',
    filaEncabezado: 1,
    formatoFecha: 'DD/MM/YYYY',
    separadorDecimal: '.',
    mapeoColumnas: {
      fecha: 'Fecha',
      descripcion: 'Concepto',
      referencia: 'Referencia',
      monto: 'Importe',
      saldo: 'Saldo',
      signoCargoNegativo: true,
    },
    esSistema: true,
    predefinido: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    codigo: 'SCOTIABANK_ESTANDAR',
    nombre: 'Scotiabank — Formato Estándar (CSV / XLSX)',
    banco: 'Scotiabank',
    formato: 'CSV',
    delimitador: ',',
    codificacion: 'UTF-8',
    filaEncabezado: 1,
    formatoFecha: 'DD/MM/YYYY',
    separadorDecimal: '.',
    mapeoColumnas: {
      fecha: 'Fecha',
      descripcion: 'Descripción',
      referencia: 'Documento',
      abono: 'Abono',
      cargo: 'Cargo',
      saldo: 'Saldo',
      signoCargoNegativo: true,
    },
    esSistema: true,
    predefinido: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    codigo: 'BANCO_NACION_ESTANDAR',
    nombre: 'Banco de la Nación — Formato Estándar (TXT / CSV)',
    banco: 'Banco de la Nación',
    formato: 'TXT',
    delimitador: '|',
    codificacion: 'LATIN1',
    filaEncabezado: 1,
    formatoFecha: 'DD/MM/YYYY',
    separadorDecimal: '.',
    mapeoColumnas: {
      fecha: 'Fecha',
      descripcion: 'Descripción',
      referencia: 'Nro. Documento',
      abono: 'Abono',
      cargo: 'Cargo',
      saldo: 'Saldo',
      signoCargoNegativo: true,
    },
    esSistema: true,
    predefinido: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
];

export function buscarPerfilPredefinido(codigo: string): PerfilBancoV2 | null {
  const norm = codigo.trim().toUpperCase();
  const encontrado = PERFILES_BANCO_PREDEFINIDOS.find((p) => p.codigo === norm);
  return encontrado ? { ...encontrado, mapeoColumnas: { ...encontrado.mapeoColumnas } } : null;
}

export function buscarPerfilPredefinidoPorBanco(banco: string): PerfilBancoV2 | null {
  const norm = banco
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (!norm) {
    return null;
  }
  const encontrado = PERFILES_BANCO_PREDEFINIDOS.find((p) => {
    const bancoPerfil = p.banco
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    return norm.includes(bancoPerfil) || bancoPerfil.includes(norm);
  });
  return encontrado ? { ...encontrado, mapeoColumnas: { ...encontrado.mapeoColumnas } } : null;
}
