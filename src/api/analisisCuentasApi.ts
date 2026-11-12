import { apiClient } from './client';

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
  cuentaHasta?: string;
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

export interface MesComparativoAnual {
  mes: number;
  nombreMes: string;
  debePen: number;
  haberPen: number;
  saldoNetoPen: number;
  variacionPct: number;
}

export interface ResultadoComparativoAnual {
  anio: number;
  cuentaPrefix: string;
  meses: MesComparativoAnual[];
  totalDebePen: number;
  totalHaberPen: number;
  saldoFinalPen: number;
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

export const analisisCuentasApi = {
  obtenerMovimientos: async (
    empresaId: string,
    periodo: string,
    codigoCuenta?: string,
    anexo?: string,
    cuentaHasta?: string
  ): Promise<ResultadoMovimientosCuenta> => {
    const res = await apiClient.get<{ success: boolean; data: ResultadoMovimientosCuenta }>(
      `/empresas/${empresaId}/analisis-cuentas/movimientos`,
      {
        params: { periodo, codigoCuenta, anexo, cuentaHasta },
      }
    );
    return res.data.data;
  },

  obtenerAntiguedad: async (
    empresaId: string,
    periodo: string,
    cuenta?: string,
    cuentaHasta?: string
  ): Promise<ResultadoAntiguedadSaldos> => {
    const res = await apiClient.get<{ success: boolean; data: ResultadoAntiguedadSaldos }>(
      `/empresas/${empresaId}/analisis-cuentas/antiguedad`,
      {
        params: { periodo, cuenta, cuentaHasta },
      }
    );
    return res.data.data;
  },

  obtenerComparativoAnual: async (
    empresaId: string,
    anio: number,
    cuenta?: string
  ): Promise<ResultadoComparativoAnual> => {
    const res = await apiClient.get<{ success: boolean; data: ResultadoComparativoAnual }>(
      `/empresas/${empresaId}/analisis-cuentas/comparativo-anual`,
      {
        params: { anio, cuenta },
      }
    );
    return res.data.data;
  },

  obtenerCuentasControl: async (
    empresaId: string,
    periodo: string
  ): Promise<FilaCuentaControl[]> => {
    const res = await apiClient.get<{ success: boolean; data: FilaCuentaControl[] }>(
      `/empresas/${empresaId}/analisis-cuentas/cuentas-control`,
      {
        params: { periodo },
      }
    );
    return res.data.data;
  },

  obtenerAlertas: async (empresaId: string, periodo: string): Promise<AlertaAuditoria[]> => {
    const res = await apiClient.get<{ success: boolean; data: AlertaAuditoria[] }>(
      `/empresas/${empresaId}/analisis-cuentas/alertas`,
      {
        params: { periodo },
      }
    );
    return res.data.data;
  },

  guardarMarca: async (
    empresaId: string,
    data: {
      asientoId: string;
      lineaId?: string;
      estadoRevision: 'REVISADO' | 'OBSERVADO' | 'PENDIENTE';
      comentario?: string;
    }
  ) => {
    const res = await apiClient.post<{ success: boolean; data: any }>(
      `/empresas/${empresaId}/analisis-cuentas/marcas`,
      data
    );
    return res.data.data;
  },
};
