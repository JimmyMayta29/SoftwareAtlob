import AdmZip from 'adm-zip';
import { Money } from '../../utils/decimal';
import type {
  PlanillaModel,
  TrabajadorModel
} from '../planillaService';

export interface PlameArchivosGenerados {
  periodo: string;
  archivos: {
    jor: string;
    rem: string;
    snl: string;
    toc: string;
    des: string;
  };
  nombresArchivos: {
    jor: string;
    rem: string;
    snl: string;
    toc: string;
    des: string;
  };
  paqueteZipBase64: string;
  totalRegistros: number;
  generadoAt: string;
}

export interface TRegistroArchivosGenerados {
  periodo: string;
  archivos: {
    altas: string;
    bajas: string;
    modificaciones: string;
  };
  nombresArchivos: {
    altas: string;
    bajas: string;
    modificaciones: string;
  };
  paqueteZipBase64: string;
  validacion: {
    esValido: boolean;
    altasCount: number;
    bajasCount: number;
    modificacionesCount: number;
  };
  generadoAt: string;
}

export const plameExportService = {
  validarEstructuraPlame(
    empresaRuc: string,
    planilla: PlanillaModel,
    trabajadores: TrabajadorModel[]
  ): {
    esValido: boolean;
    errores: string[];
    advertencias: string[];
    estadisticas: {
      totalTrabajadores: number;
      totalHorasOrdinarias: number;
      totalRemuneracion: number;
    };
  } {
    const errores: string[] = [];
    const advertencias: string[] = [];
    let totHoras = 0;
    let totRem = Money.create(0);

    if (!empresaRuc || !/^\d{11}$/.test(empresaRuc)) {
      errores.push('RUC_EMPRESA_INVALIDO: El RUC de la empresa para PLAME debe tener exactamente 11 dígitos numéricos.');
    }

    if (!planilla.mes || !/^\d{4}-\d{2}$/.test(planilla.mes)) {
      errores.push('PERIODO_INVALIDO: El período de la planilla debe tener formato YYYY-MM.');
    }

    if (!planilla.lineas || planilla.lineas.length === 0) {
      errores.push('PLANILLA_VACIA: La planilla no contiene líneas de trabajadores procesadas.');
    }

    for (const linea of planilla.lineas || []) {
      const trab = trabajadores.find(t => t.id === linea.trabajadorId);
      const doc = linea.trabajadorDocumento || trab?.numeroDocumento || '';
      const tipoDoc = trab?.tipoDocumento || '01';

      if (!doc || doc.trim().length < 8) {
        errores.push(`DOCUMENTO_INVALIDO: El trabajador ${linea.trabajadorNombre} tiene un documento no válido para PLAME.`);
      }

      if (linea.diasTrabajados === undefined || linea.diasTrabajados < 0 || linea.diasTrabajados > 30) {
        errores.push(`DIAS_INVALIDOS: Trabajador ${doc} registra ${linea.diasTrabajados} días trabajados (debe estar entre 0 y 30).`);
      }

      const horas = linea.horasOrdinarias ?? ((linea.diasTrabajados || 30) * 8);
      totHoras += horas;
      totRem = Money.add(totRem, Money.create(linea.totalRemuneracion));

      if (linea.sistemaPensiones === 'AFP' && !trab?.cuspp && !linea.cuspp) {
        advertencias.push(`CUSPP_VACIO: El trabajador ${doc} pertenece a AFP pero no tiene CUSPP registrado.`);
      }
    }

    return {
      esValido: errores.length === 0,
      errores,
      advertencias,
      estadisticas: {
        totalTrabajadores: planilla.lineas?.length || 0,
        totalHorasOrdinarias: totHoras,
        totalRemuneracion: Money.toNumber(totRem)
      }
    };
  },

  exportarPlame(
    empresaRuc: string,
    planilla: PlanillaModel,
    trabajadores: TrabajadorModel[]
  ): PlameArchivosGenerados {
    const [anio, mes] = planilla.mes.split('-');
    const prefijoArchivo = `0601${anio}${mes}${empresaRuc}`;

    let contenidoJor = '';
    let contenidoRem = '';
    let contenidoSnl = '';
    let contenidoToc = '';
    let contenidoDes = '';

    for (const linea of planilla.lineas) {
      const trab = trabajadores.find(t => t.id === linea.trabajadorId);
      const tipoDocSunat = (trab?.tipoDocumento || '01').padStart(2, '0');
      const numDoc = (linea.trabajadorDocumento || trab?.numeroDocumento || '').trim();

      const diasTrab = linea.diasTrabajados ?? 30;
      const horasOrd = linea.horasOrdinarias ?? (diasTrab * 8);
      const minOrd = 0;
      const horasExt = Math.floor((linea.horasExtras25 || 0) + (linea.horasExtras35 || 0));
      const minExt = 0;

      // Estructura 01: Jornada Laboral (.jor)
      contenidoJor += `${tipoDocSunat}|${numDoc}|${horasOrd}|${minOrd}|${horasExt}|${minExt}|\r\n`;

      // Estructura 02: Ingresos y Remuneraciones (.rem)
      // Concepto 0121: Remuneración básica
      contenidoRem += `${tipoDocSunat}|${numDoc}|0121|${linea.sueldoBasico.toFixed(2)}|${linea.sueldoBasico.toFixed(2)}|\r\n`;

      if (linea.asignacionFamiliar > 0) {
        // Concepto 0201: Asignación familiar
        contenidoRem += `${tipoDocSunat}|${numDoc}|0201|${linea.asignacionFamiliar.toFixed(2)}|${linea.asignacionFamiliar.toFixed(2)}|\r\n`;
      }

      if (linea.horasExtras > 0) {
        // Concepto 0105: Horas extras 25% y 35%
        contenidoRem += `${tipoDocSunat}|${numDoc}|0105|${linea.horasExtras.toFixed(2)}|${linea.horasExtras.toFixed(2)}|\r\n`;
      }

      if ((linea.bonificacionesGravadas || 0) > 0) {
        // Concepto 0306: Bonificaciones regulares gravadas
        contenidoRem += `${tipoDocSunat}|${numDoc}|0306|${linea.bonificacionesGravadas!.toFixed(2)}|${linea.bonificacionesGravadas!.toFixed(2)}|\r\n`;
      }

      // Estructura 03: Días Subsidiados y No Laborados (.snl)
      const diasFaltas = linea.diasFaltas || 0;
      if (diasFaltas > 0) {
        // Tipo suspensión '07': Permiso o falta sin goce de haber
        contenidoSnl += `${tipoDocSunat}|${numDoc}|07|${diasFaltas}|\r\n`;
      }
      const diasSuspension = linea.diasSuspensionPerfecta || 0;
      if (diasSuspension > 0) {
        // Tipo suspensión '25': Suspensión perfecta de labores
        contenidoSnl += `${tipoDocSunat}|${numDoc}|25|${diasSuspension}|\r\n`;
      }

      // Estructura 04: Tasas de Condiciones de Aseguramiento (.toc)
      // SCTR, EPS, Aseguramiento
      const sctrPensión = '0';
      const sctrSalud = trab?.afiliadoEps ? '1' : '0';
      contenidoToc += `${tipoDocSunat}|${numDoc}|${sctrSalud}|${sctrPensión}|\r\n`;

      // Estructura 05: Descuentos al trabajador (.des)
      if ((linea.descuentoFaltasTardanzas || 0) > 0) {
        contenidoDes += `${tipoDocSunat}|${numDoc}|0701|${linea.descuentoFaltasTardanzas!.toFixed(2)}|\r\n`;
      }
      if ((linea.adelantosPrestamos || 0) > 0) {
        contenidoDes += `${tipoDocSunat}|${numDoc}|0703|${linea.adelantosPrestamos!.toFixed(2)}|\r\n`;
      }
    }

    const zip = new AdmZip();
    zip.addFile(`${prefijoArchivo}.jor`, Buffer.from(contenidoJor, 'latin1'));
    zip.addFile(`${prefijoArchivo}.rem`, Buffer.from(contenidoRem, 'latin1'));
    zip.addFile(`${prefijoArchivo}.snl`, Buffer.from(contenidoSnl, 'latin1'));
    zip.addFile(`${prefijoArchivo}.toc`, Buffer.from(contenidoToc, 'latin1'));
    if (contenidoDes) {
      zip.addFile(`${prefijoArchivo}.des`, Buffer.from(contenidoDes, 'latin1'));
    }

    const zipBase64 = zip.toBuffer().toString('base64');

    return {
      periodo: planilla.mes,
      archivos: {
        jor: contenidoJor,
        rem: contenidoRem,
        snl: contenidoSnl,
        toc: contenidoToc,
        des: contenidoDes
      },
      nombresArchivos: {
        jor: `${prefijoArchivo}.jor`,
        rem: `${prefijoArchivo}.rem`,
        snl: `${prefijoArchivo}.snl`,
        toc: `${prefijoArchivo}.toc`,
        des: `${prefijoArchivo}.des`
      },
      paqueteZipBase64: zipBase64,
      totalRegistros: planilla.lineas.length,
      generadoAt: new Date().toISOString()
    };
  },

  exportarTRegistro(
    empresaRuc: string,
    trabajadores: TrabajadorModel[],
    periodoReferencia = new Date().toISOString().slice(0, 7)
  ): TRegistroArchivosGenerados {
    let contenidoAltas = '';
    let contenidoBajas = '';
    let contenidoModificaciones = '';

    for (const trab of trabajadores) {
      const tipoDoc = (trab.tipoDocumento || '01').padStart(2, '0');
      const numDoc = trab.numeroDocumento.trim();
      const apPaterno = trab.apellidos.split(' ')[0] || trab.apellidos;
      const apMaterno = trab.apellidos.split(' ').slice(1).join(' ') || '';
      const nombres = trab.nombres;
      const fNac = trab.fechaNacimiento || '1990-01-01';

      if (trab.fechaCese && trab.fechaCese.startsWith(periodoReferencia)) {
        // Estructura oficial de Baja (D.S. N° 018-2007-TR y R.S. N° 210-2007/SUNAT)
        const motivoCeseCodigo = trab.motivoCese === 'TERMINO_CONTRATO' ? '07'
          : trab.motivoCese === 'MUTUO_DISENSO' ? '09'
          : trab.motivoCese === 'DESPIDO' ? '04'
          : '01'; // 01: Renuncia voluntaria
        contenidoBajas += `${tipoDoc}|${numDoc}|${trab.fechaCese}|${motivoCeseCodigo}|\r\n`;
      } else if (trab.fechaIngreso && trab.fechaIngreso.startsWith(periodoReferencia)) {
        // Estructura oficial de Alta de Trabajador
        const catRegimen = trab.regimenLaboral === 'MYPE_MICRO' ? '01'
          : trab.regimenLaboral === 'MYPE_PEQUENA' ? '02'
          : '00'; // General
        const codPension = trab.sistemaPensiones === 'ONP' ? '01'
          : trab.afpAdministradora === 'INTEGRA' ? '21'
          : trab.afpAdministradora === 'PRIMA' ? '23'
          : trab.afpAdministradora === 'PROFUTURO' ? '22'
          : '24'; // Habitat
        contenidoAltas += `${tipoDoc}|${numDoc}|${apPaterno}|${apMaterno}|${nombres}|${fNac}|${trab.fechaIngreso}|${trab.cargo}|${catRegimen}|${codPension}|${trab.sueldoBase.toFixed(2)}|\r\n`;
      } else {
        // Modificación de condiciones laborales
        contenidoModificaciones += `${tipoDoc}|${numDoc}|${trab.cargo}|${trab.sueldoBase.toFixed(2)}|${trab.centroCosto}|\r\n`;
      }
    }

    const zip = new AdmZip();
    const nombreAltas = `RP_${empresaRuc}.alt`;
    const nombreBajas = `RP_${empresaRuc}.baj`;
    const nombreModif = `RP_${empresaRuc}.mod`;

    if (contenidoAltas) zip.addFile(nombreAltas, Buffer.from(contenidoAltas, 'latin1'));
    if (contenidoBajas) zip.addFile(nombreBajas, Buffer.from(contenidoBajas, 'latin1'));
    if (contenidoModificaciones) zip.addFile(nombreModif, Buffer.from(contenidoModificaciones, 'latin1'));

    const zipBase64 = zip.toBuffer().toString('base64');

    return {
      periodo: periodoReferencia,
      archivos: {
        altas: contenidoAltas,
        bajas: contenidoBajas,
        modificaciones: contenidoModificaciones
      },
      nombresArchivos: {
        altas: nombreAltas,
        bajas: nombreBajas,
        modificaciones: nombreModif
      },
      paqueteZipBase64: zipBase64,
      validacion: {
        esValido: true,
        altasCount: contenidoAltas.split('\r\n').filter(Boolean).length,
        bajasCount: contenidoBajas.split('\r\n').filter(Boolean).length,
        modificacionesCount: contenidoModificaciones.split('\r\n').filter(Boolean).length
      },
      generadoAt: new Date().toISOString()
    };
  }
};
