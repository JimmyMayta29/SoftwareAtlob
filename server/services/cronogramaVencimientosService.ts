import { db } from '../config/database';
import { auditoriaChainService } from './auditoriaChainService';

export type DigitoRucCronograma = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'B';
export type ObligacionCronograma = 'PDT_621' | 'PLAME' | 'SIRE' | 'DAOT' | 'RENTA_ANUAL';

export interface FilaCronogramaVencimiento {
  id: string;
  anio: number;
  periodo: string; // 'YYYY-MM'
  ultimoDigitoRuc: DigitoRucCronograma;
  fechaVencimientoPdt621: string; // 'YYYY-MM-DD'
  fechaVencimientoPlame: string; // 'YYYY-MM-DD'
  fechaVencimientoSire: string; // 'YYYY-MM-DD'
  fechaVencimientoDaot: string; // 'YYYY-MM-DD'
  fechaVencimientoRentaAnual: string; // 'YYYY-MM-DD'
  fuenteResolucion: string;
  esSupuestoValidar: boolean;
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface AlertaVencimientoEmpresa {
  periodo: string;
  ruc: string;
  esBuenContribuyente: boolean;
  digitoEvaluado: DigitoRucCronograma;
  etiquetaGrupo: string;
  fechaVencimientoPdt621: string;
  fechaVencimientoPlame: string;
  fechaVencimientoDaot: string;
  fechaVencimientoRentaAnual: string;
  diasRestantesPdt621: number;
  estadoAlerta: 'VENCIDO' | 'POR_VENCER_URGENTE' | 'PROXIMO' | 'EN_PLAZO';
  esSupuestoValidar: boolean;
  fuenteResolucion: string;
}

const DIGITOS_ORDEN: DigitoRucCronograma[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'B'];

function generarFilasBaseAnio(anio: number): FilaCronogramaVencimiento[] {
  const filas: FilaCronogramaVencimiento[] = [];
  const diasBasePorDigito: Record<DigitoRucCronograma, number> = {
    '0': 15,
    '1': 16,
    '2': 19,
    '3': 20,
    '4': 21,
    '5': 22,
    '6': 23,
    '7': 26,
    '8': 27,
    '9': 28,
    'B': 29
  };

  const diasAnualesDaot: Record<DigitoRucCronograma, string> = {
    '0': `${anio + 1}-03-01`,
    '1': `${anio + 1}-03-02`,
    '2': `${anio + 1}-03-03`,
    '3': `${anio + 1}-03-04`,
    '4': `${anio + 1}-03-05`,
    '5': `${anio + 1}-03-08`,
    '6': `${anio + 1}-03-09`,
    '7': `${anio + 1}-03-10`,
    '8': `${anio + 1}-03-11`,
    '9': `${anio + 1}-03-12`,
    'B': `${anio + 1}-03-15`
  };

  const diasAnualesRenta: Record<DigitoRucCronograma, string> = {
    '0': `${anio + 1}-03-26`,
    '1': `${anio + 1}-03-29`,
    '2': `${anio + 1}-03-30`,
    '3': `${anio + 1}-03-31`,
    '4': `${anio + 1}-04-01`,
    '5': `${anio + 1}-04-02`,
    '6': `${anio + 1}-04-05`,
    '7': `${anio + 1}-04-06`,
    '8': `${anio + 1}-04-07`,
    '9': `${anio + 1}-04-08`,
    'B': `${anio + 1}-04-09`
  };

  for (let mes = 1; mes <= 12; mes++) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const anioVenc = mes === 12 ? anio + 1 : anio;
    const mesVenc = mes === 12 ? 1 : mes + 1;
    const mesVencStr = String(mesVenc).padStart(2, '0');

    for (const dig of DIGITOS_ORDEN) {
      const diaPdt = diasBasePorDigito[dig];
      const diaSire = Math.max(10, diaPdt - 1);
      const fechaPdt = `${anioVenc}-${mesVencStr}-${String(diaPdt).padStart(2, '0')}`;
      const fechaSire = `${anioVenc}-${mesVencStr}-${String(diaSire).padStart(2, '0')}`;

      filas.push({
        id: `cron-${periodo}-${dig}`,
        anio,
        periodo,
        ultimoDigitoRuc: dig,
        fechaVencimientoPdt621: fechaPdt,
        fechaVencimientoPlame: fechaPdt,
        fechaVencimientoSire: fechaSire,
        fechaVencimientoDaot: diasAnualesDaot[dig],
        fechaVencimientoRentaAnual: diasAnualesRenta[dig],
        fuenteResolucion: `Cronograma Referencial SUNAT Ejercicio ${anio} (editable por R.S.)`,
        esSupuestoValidar: true,
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z'
      });
    }
  }
  return filas;
}

export const CRONOGRAMA_VENCIMIENTOS_MEMORIA: FilaCronogramaVencimiento[] = [
  ...generarFilasBaseAnio(2025),
  ...generarFilasBaseAnio(2026)
];

function esRolAdministrador(rol?: string): boolean {
  const r = (rol || '').toUpperCase();
  return r === 'ADMIN_ESTUDIO' || r === 'ADMINISTRADOR' || r === 'ADMIN';
}

export const cronogramaVencimientosService = {
  /**
   * Obtiene todas las filas del cronograma de vencimientos para un período o año
   */
  listarPorPeriodo(periodo: string = '2026-09'): FilaCronogramaVencimiento[] {
    const anio = Number(periodo.split('-')[0]) || 2026;
    if (!CRONOGRAMA_VENCIMIENTOS_MEMORIA.some(f => f.periodo === periodo)) {
      CRONOGRAMA_VENCIMIENTOS_MEMORIA.push(...generarFilasBaseAnio(anio).filter(f => f.periodo === periodo));
    }
    return CRONOGRAMA_VENCIMIENTOS_MEMORIA
      .filter(f => f.periodo === periodo)
      .sort((a, b) => DIGITOS_ORDEN.indexOf(a.ultimoDigitoRuc) - DIGITOS_ORDEN.indexOf(b.ultimoDigitoRuc));
  },

  /**
   * Obtiene el vencimiento aplicable a un RUC o dígito específico (incluyendo Buenos Contribuyentes 'B')
   */
  obtenerPorDigitoORuc(
    periodo: string,
    rucODigito: string,
    esBuenContribuyente: boolean = false
  ): FilaCronogramaVencimiento {
    const filas = this.listarPorPeriodo(periodo);
    const limpio = (rucODigito || '0').trim().toUpperCase();
    const digito: DigitoRucCronograma = esBuenContribuyente || limpio === 'B'
      ? 'B'
      : ((limpio.slice(-1).match(/[0-9]/) ? limpio.slice(-1) : '0') as DigitoRucCronograma);

    return filas.find(f => f.ultimoDigitoRuc === digito) || filas[0];
  },

  /**
   * Calcula la alerta de vencimiento y días restantes para mostrar en la barra de estado y en el estudio
   */
  calcularAlertaVencimiento(
    periodo: string,
    ruc: string,
    esBuenContribuyente: boolean = false,
    fechaReferenciaHoy: string = '2026-10-12'
  ): AlertaVencimientoEmpresa {
    const fila = this.obtenerPorDigitoORuc(periodo, ruc, esBuenContribuyente);
    const hoyMs = new Date(`${fechaReferenciaHoy}T00:00:00Z`).getTime();
    const vencMs = new Date(`${fila.fechaVencimientoPdt621}T00:00:00Z`).getTime();
    const diasRestantes = Math.round((vencMs - hoyMs) / (1000 * 60 * 60 * 24));

    let estadoAlerta: AlertaVencimientoEmpresa['estadoAlerta'] = 'EN_PLAZO';
    if (diasRestantes < 0) {
      estadoAlerta = 'VENCIDO';
    } else if (diasRestantes <= 3) {
      estadoAlerta = 'POR_VENCER_URGENTE';
    } else if (diasRestantes <= 7) {
      estadoAlerta = 'PROXIMO';
    }

    return {
      periodo,
      ruc,
      esBuenContribuyente: fila.ultimoDigitoRuc === 'B',
      digitoEvaluado: fila.ultimoDigitoRuc,
      etiquetaGrupo: fila.ultimoDigitoRuc === 'B'
        ? 'Buenos Contribuyentes y UESP'
        : `Dígito RUC ${fila.ultimoDigitoRuc}`,
      fechaVencimientoPdt621: fila.fechaVencimientoPdt621,
      fechaVencimientoPlame: fila.fechaVencimientoPlame,
      fechaVencimientoDaot: fila.fechaVencimientoDaot,
      fechaVencimientoRentaAnual: fila.fechaVencimientoRentaAnual,
      diasRestantesPdt621: diasRestantes,
      estadoAlerta,
      esSupuestoValidar: fila.esSupuestoValidar,
      fuenteResolucion: fila.fuenteResolucion
    };
  },

  /**
   * Permite al administrador actualizar fechas de vencimiento y confirmar o marcar supuestos a validar
   */
  async actualizarFilaCronograma(
    input: {
      periodo: string;
      ultimoDigitoRuc: DigitoRucCronograma;
      fechaVencimientoPdt621?: string;
      fechaVencimientoPlame?: string;
      fechaVencimientoSire?: string;
      fechaVencimientoDaot?: string;
      fechaVencimientoRentaAnual?: string;
      fuenteResolucion?: string;
      esSupuestoValidar?: boolean;
    },
    usuarioId: string,
    rolUsuario: string,
    empresaContextoId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<FilaCronogramaVencimiento> {
    if (!esRolAdministrador(rolUsuario)) {
      throw new Error('PERMISO_DENEGADO: Solo ADMIN_ESTUDIO o ADMINISTRADOR puede modificar el cronograma de vencimientos.');
    }

    const actual = this.obtenerPorDigitoORuc(input.periodo, input.ultimoDigitoRuc, input.ultimoDigitoRuc === 'B');
    const idx = CRONOGRAMA_VENCIMIENTOS_MEMORIA.findIndex(
      f => f.periodo === input.periodo && f.ultimoDigitoRuc === input.ultimoDigitoRuc
    );

    const actualizada: FilaCronogramaVencimiento = {
      ...actual,
      fechaVencimientoPdt621: input.fechaVencimientoPdt621 || actual.fechaVencimientoPdt621,
      fechaVencimientoPlame: input.fechaVencimientoPlame || actual.fechaVencimientoPlame,
      fechaVencimientoSire: input.fechaVencimientoSire || actual.fechaVencimientoSire,
      fechaVencimientoDaot: input.fechaVencimientoDaot || actual.fechaVencimientoDaot,
      fechaVencimientoRentaAnual: input.fechaVencimientoRentaAnual || actual.fechaVencimientoRentaAnual,
      fuenteResolucion: input.fuenteResolucion || actual.fuenteResolucion,
      esSupuestoValidar: input.esSupuestoValidar !== undefined ? input.esSupuestoValidar : false,
      version: actual.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: usuarioId
    };

    if (idx >= 0) {
      CRONOGRAMA_VENCIMIENTOS_MEMORIA[idx] = actualizada;
    } else {
      CRONOGRAMA_VENCIMIENTOS_MEMORIA.push(actualizada);
    }

    if (db.isPostgresConnected()) {
      try {
        await db.query(`
          INSERT INTO cronograma_vencimientos (periodo, ultimo_digito_ruc, fecha_vencimiento_pdt621, fecha_vencimiento_sire, fecha_vencimiento_plame)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (periodo, ultimo_digito_ruc)
          DO UPDATE SET fecha_vencimiento_pdt621 = EXCLUDED.fecha_vencimiento_pdt621,
                        fecha_vencimiento_sire = EXCLUDED.fecha_vencimiento_sire,
                        fecha_vencimiento_plame = EXCLUDED.fecha_vencimiento_plame
        `, [
          actualizada.periodo,
          actualizada.ultimoDigitoRuc,
          actualizada.fechaVencimientoPdt621,
          actualizada.fechaVencimientoSire,
          actualizada.fechaVencimientoPlame
        ]);
      } catch {
        // Fallback en memoria
      }
    }

    await auditoriaChainService.registrar({
      empresaId: empresaContextoId,
      usuarioId,
      accion: 'ACTUALIZAR_CRONOGRAMA_VENCIMIENTOS',
      tablaAfectada: 'cronograma_vencimientos',
      registroId: actualizada.id,
      datosAnteriores: {
        fechaVencimientoPdt621: actual.fechaVencimientoPdt621,
        fechaVencimientoPlame: actual.fechaVencimientoPlame,
        version: actual.version
      },
      datosNuevos: {
        periodo: actualizada.periodo,
        ultimoDigitoRuc: actualizada.ultimoDigitoRuc,
        fechaVencimientoPdt621: actualizada.fechaVencimientoPdt621,
        fechaVencimientoPlame: actualizada.fechaVencimientoPlame,
        fuenteResolucion: actualizada.fuenteResolucion,
        version: actualizada.version
      }
    });

    return actualizada;
  }
};
