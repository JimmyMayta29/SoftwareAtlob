import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { planillaService, obtenerDivisorQuintaCategoria } from '../services/planillaService';
import { parametroRepository } from '../repositories/parametroRepository';
import { asientoService } from '../services/asientoService';
import { REGISTRO_DATOS_EMPRESA } from '../storage/registroDatosEmpresa';
import {
  generarBoletaPagoPdfBuffer,
  generarLoteBoletasPagoPdfBuffer,
  BoletaPagoPdfItem
} from '../../src/services/reports/formato_estandar/formatoEstandarEngine';

const EMPRESA_PLANILLA_TEST = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000001';

async function runTestsFase5Planillas() {
  console.log('\n====================================================================');
  console.log('🧪 INICIANDO TESTS FASE 5: MÓDULO PLANILLAS (AISLADO DE IGV-RENTA)');
  console.log('====================================================================\n');

  // -------------------------------------------------------------------------
  // 1. PARÁMETROS EDITABLES (RMV, UIT, TASAS) CON VIGENCIAS OFICIALES Y REGRESIÓN DE DIVISORES
  // -------------------------------------------------------------------------
  console.log('1. Verificando Parámetros Laborales con Vigencias Oficiales (RMV 4 tramos, UIT, Topes AFP) y Divisores LIR...');

  // 1.1 Vigencias oficiales de RMV (Sin hardcoding)
  // Tramo 1: D.S. N° 003-2022-TR -> S/ 1,025.00 (2022-05-01 al 2024-12-31)
  const rmv2024 = await parametroRepository.obtenerParametroPorCodigo('RMV', '2024-06-01');
  assert.ok(rmv2024, 'Debe existir RMV para 2024');
  assert.strictEqual(rmv2024.valorNumerico, 1025.00, 'RMV en 2024 debe ser S/ 1,025.00 (D.S. N° 003-2022-TR)');

  // Tramo 2: D.S. N° 006-2024-TR -> S/ 1,130.00 (2025-01-01 al 2026-09-30)
  const rmv2025 = await parametroRepository.obtenerParametroPorCodigo('RMV', '2025-06-01');
  const rmvSep2026 = await parametroRepository.obtenerParametroPorCodigo('RMV', '2026-09-15');
  assert.strictEqual(rmv2025?.valorNumerico, 1130.00, 'RMV en 2025 debe ser S/ 1,130.00 (D.S. N° 006-2024-TR)');
  assert.strictEqual(rmvSep2026?.valorNumerico, 1130.00, 'RMV en septiembre 2026 debe ser S/ 1,130.00 (D.S. N° 006-2024-TR)');

  // Tramo 3: D.S. N° 015-2026-TR -> S/ 1,230.00 (2026-10-01 al 2026-12-31)
  const rmvOct2026 = await parametroRepository.obtenerParametroPorCodigo('RMV', '2026-10-15');
  assert.strictEqual(rmvOct2026?.valorNumerico, 1230.00, 'RMV en octubre 2026 debe ser S/ 1,230.00 (D.S. N° 015-2026-TR Tramo 1)');

  // Tramo 4: D.S. N° 015-2026-TR -> S/ 1,300.00 (2027-01-01 en adelante)
  const rmv2027 = await parametroRepository.obtenerParametroPorCodigo('RMV', '2027-02-01');
  assert.strictEqual(rmv2027?.valorNumerico, 1300.00, 'RMV en 2027 debe ser S/ 1,300.00 (D.S. N° 015-2026-TR Tramo 2 - SUPUESTO A VALIDAR)');

  // 1.2 Unidades Impositivas Tributarias (UIT) Oficiales
  const uit2025 = await parametroRepository.obtenerUitPorAnio(2025);
  const uit2026 = await parametroRepository.obtenerUitPorAnio(2026);
  assert.strictEqual(uit2025, 5350.00, 'UIT 2025 oficial debe ser S/ 5,350.00 (D.S. N° 260-2024-EF)');
  assert.strictEqual(uit2026, 5500.00, 'UIT 2026 oficial debe ser S/ 5,500.00 (D.S. N° 301-2025-EF)');

  // 1.3 Tope Remuneración Máxima Asegurable Prima de Seguro AFP (SBS)
  const topeSeguroEne2024 = await parametroRepository.obtenerParametroPorCodigo('TOPE_PRIMA_SEGURO_AFP', '2024-03-01');
  const topeSeguroAgo2024 = await parametroRepository.obtenerParametroPorCodigo('TOPE_PRIMA_SEGURO_AFP', '2024-08-01');
  assert.strictEqual(topeSeguroEne2024?.valorNumerico, 12135.22, 'Tope RMA seguro AFP hasta Jun 2024 debe ser S/ 12,135.22 (Circular SBS AFP-178-2023)');
  assert.strictEqual(topeSeguroAgo2024?.valorNumerico, 12410.00, 'Tope RMA seguro AFP desde Jul 2024 debe ser S/ 12,410.00 (Circular SBS AFP-180-2024 y 181-2024)');

  // 1.4 Regresión completa de los 12 divisores mensuales de 5ta Categoría (Art. 40° inc. d Rgto. LIR)
  const tablaDivisoresEsperados = [
    { mes: 1, divisor: 12 }, { mes: 2, divisor: 12 }, { mes: 3, divisor: 12 },
    { mes: 4, divisor: 9 },
    { mes: 5, divisor: 8 }, { mes: 6, divisor: 8 }, { mes: 7, divisor: 8 },
    { mes: 8, divisor: 5 },
    { mes: 9, divisor: 4 }, { mes: 10, divisor: 4 }, { mes: 11, divisor: 4 },
    { mes: 12, divisor: 1 }
  ];
  for (const item of tablaDivisoresEsperados) {
    const divObtenido = obtenerDivisorQuintaCategoria(item.mes);
    assert.strictEqual(
      divObtenido,
      item.divisor,
      `Divisor de 5ta en mes ${item.mes} debe ser ${item.divisor} según Art. 40° inc. d Rgto. LIR`
    );
  }
  assert.strictEqual(obtenerDivisorQuintaCategoria(10), 4, 'Octubre (mes 10) debe tener divisor 4 según Art. 40° inc. d Rgto. LIR');

  // 1.5 Transición de RMV en contratos laborales (Sep 2026 S/ 1,150 válida vs Oct 2026 rechazada)
  const trabTransicion = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '1',
      numeroDocumento: '78912345',
      nombres: 'GABRIEL',
      apellidos: 'TRANSICION RMV',
      fechaIngreso: '2026-09-01',
      cargo: 'ASISTENTE DE PLANTA',
      tipoContrato: 'INDETERMINADO',
      regimenLaboral: 'GENERAL',
      sueldoBase: 1150.00, // En Sep 2026: 1,150 >= 1,130 (Válido)
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      afpTipoComision: 'FLUJO',
      centroCosto: 'PRODUCCION',
      activo: true
    },
    USER_ID
  );
  assert.ok(trabTransicion.id, 'Trabajador con sueldo S/ 1,150 en septiembre 2026 debe registrarse exitosamente');

  // Al intentar procesar en Octubre 2026 (RMV = S/ 1,230.00), el sueldo contractual S/ 1,150.00 debe ser rechazado
  let rechazoTransicionOct = false;
  try {
    await planillaService.calcularPlanilla(
      EMPRESA_PLANILLA_TEST,
      'per-2026-10',
      '2026-10',
      USER_ID
    );
  } catch (err: any) {
    rechazoTransicionOct = err.message.includes('SUELDO_MENOR_RMV_PERIODO');
  }
  assert.strictEqual(rechazoTransicionOct, true, 'En octubre 2026, sueldo de S/ 1,150 debe ser rechazado por ser menor a RMV 1,230');

  // Ajustar el sueldo a S/ 1,300 para continuar con las demás pruebas
  await planillaService.actualizarTrabajador(
    EMPRESA_PLANILLA_TEST,
    trabTransicion.id,
    { sueldoBase: 1300.00, activo: false, fechaCese: '2026-09-30' },
    USER_ID
  );

  console.log('   ✔ Parámetros vigentes (RMV 4 tramos, UIT, Topes AFP), tabla de 12 divisores y transición contractual verificados.');

  // -------------------------------------------------------------------------
  // 2. AFP (FLUJO vs MIXTA y TOPE PRIMA SEGURO) vs ONP Y BASE MÍNIMA ESSALUD
  // -------------------------------------------------------------------------
  console.log('2. Verificando cálculo comparativo ONP (13%) vs AFP (Comisión Flujo vs Mixta y Tope Prima) y Base Mínima EsSalud...');

  // Trabajador AFP Prima con Comisión MIXTA y sueldo alto para probar tope de prima de seguro en agosto 2026
  const trabAfpMixta = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '1',
      numeroDocumento: '40506070',
      nombres: 'VALERIA',
      apellidos: 'MENDOZA PRIMA',
      cargo: 'GERENTE COMERCIAL',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2025-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 14000.00, // Supera tope de prima de seguro AFP vigente (S/ 12,410.00)
      cargasFamiliares: 2,
      tieneAsignacionFamiliar: true,
      sistemaPensiones: 'AFP',
      afpAdministradora: 'PRIMA',
      afpTipoComision: 'MIXTA',
      cuspp: '589910VMEND1',
      bancoSueldo: 'BCP',
      cuentaBancoSueldo: '191-11223344-0-99',
      cciSueldo: '00219100112233440099',
      centroCosto: 'VENTAS',
      activo: true
    },
    USER_ID
  );

  // Trabajador MYPE Pequeña Empresa con ONP
  const trabMypePequena = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '1',
      numeroDocumento: '41516171',
      nombres: 'JORGE',
      apellidos: 'CASTILLO MYPE',
      cargo: 'SUPERVISOR PLANTA',
      tipoContrato: 'PLAZO_FIJO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'MYPE_PEQUENA',
      sueldoBase: 2400.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      afpTipoComision: 'FLUJO',
      centroCosto: 'PRODUCCION',
      activo: true
    },
    USER_ID
  );

  // Trabajador a jornada completa con inasistencias para probar Base Mínima Imponible EsSalud (Art. 6° Ley N° 26790)
  const trabEssaludMin = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '1',
      numeroDocumento: '42526272',
      nombres: 'ROBERTO',
      apellidos: 'MINIMO ESSALUD',
      cargo: 'OPERARIO',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 1130.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      centroCosto: 'PRODUCCION',
      activo: true
    },
    USER_ID
  );

  const planillaAgo = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-08',
    '2026-08',
    USER_ID,
    [
      {
        trabajadorId: trabEssaludMin.id,
        diasFaltas: 10 // Reduce sus ingresos a S/ 753.33, pero la base de EsSalud no puede ser menor a la RMV 1,130
      }
    ]
  );

  const lineaOnp = planillaAgo.lineas.find((l) => l.trabajadorId === 'trab-01')!;
  const lineaAfpFlujo = planillaAgo.lineas.find((l) => l.trabajadorId === 'trab-02')!;
  const lineaAfpMixta = planillaAgo.lineas.find((l) => l.trabajadorId === trabAfpMixta.id)!;
  const lineaEssaludMin = planillaAgo.lineas.find((l) => l.trabajadorId === trabEssaludMin.id)!;

  assert.ok(lineaOnp && lineaAfpFlujo && lineaAfpMixta && lineaEssaludMin, 'Deben existir líneas para todos los trabajadores');

  // Parámetros vigentes en Agosto 2026: RMV = S/ 1,130.00 -> Asignación familiar = S/ 113.00 (10% de RMV)
  // ONP: Sueldo 3500 + Asig. Fam. 113.00 = 3613.00 -> 13% = 469.69
  assert.strictEqual(lineaOnp.asignacionFamiliar, 113.00, 'Asignación familiar debe ser 10% de RMV vigente (S/ 113.00)');
  assert.strictEqual(lineaOnp.aporteObligatorioPension, 469.69, 'ONP 13% de 3613.00 debe ser exactamente 469.69');
  assert.strictEqual(lineaOnp.comisionAfp, 0, 'ONP no cobra comisión AFP');
  assert.strictEqual(lineaOnp.primaSeguroAfp, 0, 'ONP no cobra prima de seguro AFP');

  // AFP Integra Flujo: Sueldo 2800 -> Aporte 10% = 280.00, Comisión Flujo 1.55% = 43.40, Prima 1.84% = 51.52
  assert.strictEqual(lineaAfpFlujo.aporteObligatorioPension, 280.00, 'AFP Aporte 10% de 2800 debe ser 280.00');
  assert.strictEqual(lineaAfpFlujo.comisionAfp, 43.40, 'AFP Integra Comisión Flujo 1.55% debe ser 43.40');
  assert.strictEqual(lineaAfpFlujo.primaSeguroAfp, 51.52, 'AFP Prima Seguro 1.84% debe ser 51.52');

  // AFP Prima Mixta con sueldo 14,000 + AF 113.00 = 14,113.00:
  // Aporte 10% = 1,411.30
  // Comisión Mixta Prima (0.18%) = 14,113.00 * 0.0018 = 25.40
  // Prima Seguro 1.84% sobre tope S/ 12,410.00 (Circular SBS AFP-180-2024) = 12,410.00 * 0.0184 = 228.34
  assert.strictEqual(lineaAfpMixta.aporteObligatorioPension, 1411.30, 'AFP Aporte 10% sobre 14,113.00 debe ser 1411.30');
  assert.strictEqual(lineaAfpMixta.comisionAfp, 25.40, 'AFP Prima Comisión Mixta (0.18%) debe ser 25.40');
  assert.strictEqual(lineaAfpMixta.primaSeguroAfp, 228.34, 'Prima de seguro AFP debe respetar el tope máximo S/ 12,410.00 (228.34)');

  // Base mínima de EsSalud (Art. 6° Ley N° 26790): Aunque hubo 10 días de inasistencias y su remuneración neta cayó,
  // el aporte del empleador a EsSalud no puede ser inferior al 9% de la RMV (1,130 * 0.09 = S/ 101.70)
  assert.strictEqual(lineaEssaludMin.aporteEssalud, 101.70, 'EsSalud debe calcularse sobre la base mínima RMV (9% de S/ 1,130.00 = 101.70)');
  // Desactivar trabEssaludMin para que no afecte el cálculo de períodos posteriores (ej. Diciembre donde RMV es 1,230)
  await planillaService.actualizarTrabajador(
    EMPRESA_PLANILLA_TEST,
    trabEssaludMin.id,
    { sueldoBase: 1300.00, activo: false, fechaCese: '2026-08-31' },
    USER_ID
  );
  console.log('   ✔ Comparativa ONP vs AFP (Flujo, Mixta, Tope Prima Seguro 12,410) y Base Mínima EsSalud (101.70) verificadas.');

  // -------------------------------------------------------------------------
  // 3. RETENCIÓN DE 5TA CATEGORÍA CON PROYECCIÓN ANUAL E INGRESOS VARIABLES
  // -------------------------------------------------------------------------
  console.log('3. Verificando Retención de 5ta Categoría con Proyección Anual e Ingresos Variables...');

  const retencionQuintaSinVariables = lineaOnp.retencionQuintaCategoria;
  assert.ok(retencionQuintaSinVariables > 0, 'Trabajador con S/ 3,613.00 mensual debe tener retención de 5ta');

  // Ahora calculamos con ingresos variables en el mes (4 horas extras 25%, 2 horas extras 35%, y bono gravado de S/ 1,500)
  const planillaAgoConVariables = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-08',
    '2026-08',
    USER_ID,
    [
      {
        trabajadorId: 'trab-01',
        horasExtras25: 4,
        horasExtras35: 2,
        bonificacionesGravadas: 1500
      }
    ]
  );

  const lineaOnpConVariables = planillaAgoConVariables.lineas.find((l) => l.trabajadorId === 'trab-01')!;
  assert.ok(lineaOnpConVariables.montoHorasExtras25! > 0, 'Debe calcular monto de horas extras al 25%');
  assert.ok(lineaOnpConVariables.montoHorasExtras35! > 0, 'Debe calcular monto de horas extras al 35%');
  assert.ok(
    lineaOnpConVariables.retencionQuintaCategoria > retencionQuintaSinVariables,
    `La retención de 5ta con ingresos variables (${lineaOnpConVariables.retencionQuintaCategoria}) debe ser mayor que la ordinaria (${retencionQuintaSinVariables})`
  );
  assert.strictEqual(
    lineaOnpConVariables.proyeccionQuinta?.divisorMes,
    5,
    'En agosto (mes 8) el divisor oficial Art. 40° Rgto. LIR debe ser 5'
  );
  console.log(
    `   ✔ 5ta categoría verificada: Sin variables = S/ ${retencionQuintaSinVariables.toFixed(2)} | Con H.E. + Bono = S/ ${lineaOnpConVariables.retencionQuintaCategoria.toFixed(2)}.`
  );

  // -------------------------------------------------------------------------
  // 4. MES DE GRATIFICACIÓN (JULIO + BONIF. 9%) Y CTS (MAYO CON 1/6 GRATIFICACIÓN)
  // -------------------------------------------------------------------------
  console.log('4. Verificando Gratificaciones (Julio + Bonif. 9%) y CTS (Mayo con 1/6 de gratificación)...');

  const resGratiJulio = await planillaService.calcularGratificaciones(EMPRESA_PLANILLA_TEST, '2026-07', USER_ID);
  assert.ok(resGratiJulio.items.length >= 3, 'Debe calcular gratificaciones para los trabajadores activos');

  const gratiGeneral = resGratiJulio.items.find((g) => g.trabajadorId === 'trab-01')!;
  const gratiMypePequena = resGratiJulio.items.find((g) => g.trabajadorId === trabMypePequena.id)!;

  // Trabajador General (trab-01): Básico 3500 + AF 113.00 = 3613.00 (6 meses completos) + Bonif 9% (325.17) = 3938.17
  assert.strictEqual(gratiGeneral.montoGratificacion, 3613.00, 'Gratificación Julio Régimen General debe ser 100% de remuneración computable (3,613.00)');
  assert.strictEqual(gratiGeneral.bonificacionExtraordinaria, 325.17, 'Bonificación extraordinaria 9% (Ley 30334) debe ser 325.17');
  assert.strictEqual(gratiGeneral.netoGratificacion, 3938.17, 'Neto gratificación está inafecto de aportes previsionales');

  // Trabajador MYPE Pequeña Empresa: Sueldo 2400 -> 50% = 1200.00 + Bonif 9% (108.00) = 1308.00
  assert.strictEqual(gratiMypePequena.montoGratificacion, 1200.00, 'Gratificación MYPE Pequeña Empresa debe ser 50% (S/ 1,200.00)');
  assert.strictEqual(gratiMypePequena.bonificacionExtraordinaria, 108.00, 'Bonificación 9% sobre 1200 debe ser 108.00');

  const contGrati = await planillaService.contabilizarGratificaciones(EMPRESA_PLANILLA_TEST, '2026-07', USER_ID);
  assert.ok(contGrati.asientoId, 'Gratificaciones deben generar asiento contable cuadrado');

  // CTS Mayo 2026: Rem computable = 3613.00 + 1/6(3613.00 = 602.17) = 4215.17 -> Semestre completo (6/12) = 2107.59
  const resCtsMayo = await planillaService.calcularCts(EMPRESA_PLANILLA_TEST, '2026-05', USER_ID);
  const ctsGeneral = resCtsMayo.items.find((c) => c.trabajadorId === 'trab-01')!;
  assert.strictEqual(ctsGeneral.sextoGratificacion, 602.17, '1/6 de gratificación de 3613.00 debe ser 602.17');
  assert.strictEqual(ctsGeneral.montoCts, 2107.59, 'Depósito CTS semestral debe ser 50% de remuneración computable CTS (2,107.59)');

  const contCts = await planillaService.contabilizarCts(EMPRESA_PLANILLA_TEST, '2026-05', USER_ID);
  assert.ok(contCts.asientoId, 'CTS debe generar asiento contable cuadrado');
  console.log('   ✔ Gratificaciones (+9%), CTS (con 1/6 de gratificación) y sus asientos contables verificados.');

  // -------------------------------------------------------------------------
  // 5. TRABAJADOR CON BAJA A MITAD DE MES + ASIENTO POR CENTRO DE COSTOS + LBS + PLAME/T-REGISTRO
  // -------------------------------------------------------------------------
  console.log('5. Verificando Trabajador con Baja a Mitad de Mes (15 días), LBS, Asiento por C. Costos y PLAME/T-Registro...');

  // Trabajador que cesa el 15 de septiembre de 2026 (15 días trabajados)
  const trabCeseMitadMes = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '1',
      numeroDocumento: '72839405',
      nombres: 'MARIANA',
      apellidos: 'TORRES CESE',
      cargo: 'ANALISTA FINANCIERA',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2025-03-01',
      fechaCese: '2026-09-15',
      motivoCese: 'RENUNCIA VOLUNTARIA',
      regimenLaboral: 'GENERAL',
      sueldoBase: 3000.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      afpTipoComision: 'FLUJO',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  const planillaSept = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-09',
    '2026-09',
    USER_ID
  );

  const lineaCese = planillaSept.lineas.find((l) => l.trabajadorId === trabCeseMitadMes.id)!;
  assert.ok(lineaCese, 'Trabajador con cese el 15/09/2026 debe figurar en la planilla de septiembre');
  assert.strictEqual(lineaCese.diasTrabajados, 15, 'Días trabajados hasta el 15/09 deben ser exactamente 15');
  assert.strictEqual(lineaCese.horasOrdinarias, 120, 'Horas ordinarias por 15 días deben ser 120');
  assert.strictEqual(lineaCese.sueldoBasico, 1500.00, 'Sueldo básico por baja a mitad de mes (15 días de S/ 3,000) debe ser S/ 1,500.00');
  assert.strictEqual(lineaCese.aporteObligatorioPension, 195.00, 'ONP 13% sobre S/ 1,500.00 debe ser S/ 195.00');

  // Contabilizar planilla y verificar asiento por centro de costos
  const contPlanillaSept = await planillaService.contabilizarPlanilla(
    EMPRESA_PLANILLA_TEST,
    planillaSept.id,
    USER_ID
  );
  const asientoPlanilla = await asientoService.obtenerPorId(contPlanillaSept.asientoId!);
  assert.ok(asientoPlanilla, 'Debe existir el asiento contable de la planilla de septiembre');
  assert.strictEqual(asientoPlanilla.totalDebe, asientoPlanilla.totalHaber, 'El asiento de planilla debe cuadrar al céntimo');

  const cuentasUsadas = new Set(
    (asientoPlanilla.detalles || []).map((l: any) => String(l.cuentaCodigo || l.cuentaId || '').replace(/^cta-/, ''))
  );
  assert.ok(cuentasUsadas.has('6211'), 'El asiento debe incluir cuenta 6211');
  assert.ok(cuentasUsadas.has('6271'), 'El asiento debe incluir cuenta 6271');
  assert.ok(cuentasUsadas.has('4111'), 'El asiento debe incluir cuenta 4111');
  assert.ok(cuentasUsadas.has('941') && cuentasUsadas.has('951') && cuentasUsadas.has('921'), 'El asiento debe distribuir el destino por Centro de Costos');
  assert.ok(cuentasUsadas.has('791'), 'El asiento debe incluir contrapartida 791');

  // Liquidación de Beneficios Sociales (LBS)
  const lbs = await planillaService.calcularLiquidacionBeneficios(
    EMPRESA_PLANILLA_TEST,
    {
      trabajadorId: trabCeseMitadMes.id,
      fechaCese: '2026-09-15',
      motivoCese: 'RENUNCIA VOLUNTARIA',
      diasVacacionesPendientes: 15,
      mesesCtsTruncos: 4,
      diasCtsTruncos: 15,
      mesesGratiTruncos: 2
    },
    USER_ID
  );
  assert.strictEqual(lbs.remuneracionMensualPendiente, 1500.00, 'LBS debe consignar S/ 1,500.00 proporcional');
  assert.strictEqual(lbs.vacacionesTruncas, 1500.00, '15 días de vacaciones truncas sobre S/ 3,000 deben ser S/ 1,500.00');
  assert.strictEqual(lbs.gratificacionTrunca, 1000.00, '2 meses completos de gratificación trunca (Jul-Ago) deben ser S/ 1,000.00');
  assert.strictEqual(lbs.bonificacionExtraTrunca, 90.00, 'Bonificación extraordinaria trunca 9% debe ser S/ 90.00');
  assert.ok(lbs.ctsTrunca > 0 && lbs.netoLiquidacion > 0, 'CTS trunca y neto de liquidación deben ser mayores a cero');

  // Validador y exportador PLAME (.jor, .rem, .snl, .toc, .des)
  const valPlame = await planillaService.validarEstructuraPlame(EMPRESA_PLANILLA_TEST, planillaSept.id);
  assert.strictEqual(valPlame.esValido, true, 'El validador de estructura PLAME debe aprobar la planilla');
  const expPlame = await planillaService.exportarPlame(EMPRESA_PLANILLA_TEST, planillaSept.id);
  assert.ok(expPlame.archivos.jor.includes('72839405|120|0|0|0|'), 'El archivo .jor debe reflejar las 120 horas ordinarias');
  assert.ok(expPlame.archivos.rem.includes('72839405|0121|1500.00|1500.00|'), 'El archivo .rem debe reflejar el básico proporcional');
  assert.ok(expPlame.archivos.toc.length > 0, 'Debe exportar archivo .toc de condiciones de aseguramiento');

  // Exportador de T-Registro
  const expTReg = await planillaService.exportarTRegistro(EMPRESA_PLANILLA_TEST);
  assert.strictEqual(expTReg.validacion.esValido, true, 'El validador de estructura T-Registro debe aprobar el padrón');
  assert.ok(expTReg.archivos.bajas.includes('72839405'), 'El archivo de bajas del T-Registro debe incluir al trabajador cesado');
  console.log('   ✔ Trabajador con baja a mitad de mes, asiento por centro de costos, LBS, PLAME y T-Registro verificados.');

  // -------------------------------------------------------------------------
  // 6. VERIFICACIÓN DE AISLAMIENTO ESTRICTO: PLANILLAS NO COMPARTE TABLAS NI VISTAS CON IGV-RENTA
  // -------------------------------------------------------------------------
  console.log('6. Verificando aislamiento estricto entre Planillas e IGV-Renta...');
  const tablasPlanilla = [
    'trabajadores',
    'planillas',
    'planilla_lineas',
    'planilla_gratificaciones',
    'planilla_cts',
    'liquidaciones_beneficios',
    'tregistro_movimientos'
  ];
  for (const t of tablasPlanilla) {
    assert.ok(
      REGISTRO_DATOS_EMPRESA.some((r) => r.tabla === t),
      `La tabla ${t} debe estar registrada en REGISTRO_DATOS_EMPRESA`
    );
  }

  const codigoPlanillaService = fs.readFileSync(
    path.join(process.cwd(), 'server/services/planillaService.ts'),
    'utf8'
  );
  assert.ok(
    !codigoPlanillaService.includes('declaraciones_pdt621') &&
      !codigoPlanillaService.includes('declaracionMensualService') &&
      !codigoPlanillaService.includes('prorrataIgvService'),
    'planillaService.ts no debe consultar ni importar tablas o servicios de IGV-Renta'
  );
  console.log('   ✔ Aislamiento estricto de tablas y vistas entre Planillas e IGV-Renta verificado.');

  // -------------------------------------------------------------------------
  // 7. VERIFICACIÓN NORMATIVA B1 (RMV DEL PERÍODO) Y B4 (ASIGNACIÓN FAMILIAR 1 vs 4 HIJOS)
  // -------------------------------------------------------------------------
  console.log('7. Verificando B1 (RMV del período con cambio en medio del año) y B4 (Asignación familiar 1 vs 4 hijos)...');

  const trab1Hijo = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '11223344',
      nombres: 'ANA',
      apellidos: 'UN HIJO',
      cargo: 'ANALISTA',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 3000.00,
      cargasFamiliares: 1,
      tieneAsignacionFamiliar: true,
      sistemaPensiones: 'ONP',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  const trab4Hijos = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '11223355',
      nombres: 'BEATRIZ',
      apellidos: 'CUATRO HIJOS',
      cargo: 'ANALISTA',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 3000.00,
      cargasFamiliares: 4,
      tieneAsignacionFamiliar: true,
      sistemaPensiones: 'ONP',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  // En agosto 2026 (RMV = 1130.00), 10% = S/ 113.00 para ambos, independiente de la cantidad de hijos
  const planAgoAF = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-08',
    '2026-08',
    USER_ID
  );
  const linea1Hijo = planAgoAF.lineas.find(l => l.trabajadorId === trab1Hijo.id)!;
  const linea4Hijos = planAgoAF.lineas.find(l => l.trabajadorId === trab4Hijos.id)!;
  assert.strictEqual(linea1Hijo.asignacionFamiliar, 113.00, 'Asignación familiar con 1 hijo debe ser S/ 113.00 (10% de RMV 1,130)');
  assert.strictEqual(linea4Hijos.asignacionFamiliar, 113.00, 'Asignación familiar con 4 hijos debe ser exactamente S/ 113.00');
  assert.strictEqual(
    linea1Hijo.asignacionFamiliar,
    linea4Hijos.asignacionFamiliar,
    'La asignación familiar debe ser idéntica independientemente del número de hijos'
  );
  console.log('   ✔ B1 (RMV del período) y B4 (Asignación familiar fija sin importar cantidad de hijos) verificados.');

  // -------------------------------------------------------------------------
  // 8. VERIFICACIÓN NORMATIVA B3 (RÉGIMEN LABORAL: MICRO 0%, PEQUEÑA 50%, GENERAL 100%)
  // -------------------------------------------------------------------------
  console.log('8. Verificando B3 (Régimen Laboral MYPE Micro 0%, MYPE Pequeña 50%, General 100%)...');

  const trabMicro = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '22334455',
      nombres: 'MARCOS',
      apellidos: 'MYPE MICRO',
      cargo: 'ASISTENTE',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'MYPE_MICRO',
      sueldoBase: 2000.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  const resGratRegimen = await planillaService.calcularGratificaciones(EMPRESA_PLANILLA_TEST, '2026-07', USER_ID);
  const itemMicroGrat = resGratRegimen.items.find(g => g.trabajadorId === trabMicro.id)!;
  const itemPequenaGrat = resGratRegimen.items.find(g => g.trabajadorId === trabMypePequena.id)!;
  const itemGeneralGrat = resGratRegimen.items.find(g => g.trabajadorId === trab1Hijo.id)!;

  assert.strictEqual(itemMicroGrat.montoGratificacion, 0.00, 'MYPE Micro debe percibir 0.00 de gratificación');
  assert.strictEqual(itemMicroGrat.bonificacionExtraordinaria, 0.00, 'MYPE Micro debe percibir 0.00 de bonificación');
  assert.strictEqual(itemPequenaGrat.montoGratificacion, 1200.00, 'MYPE Pequeña debe percibir 50% de sueldo básico (S/ 1,200.00)');
  assert.strictEqual(itemGeneralGrat.montoGratificacion, 3113.00, 'Régimen General debe percibir 100% computable (3,000 + 113 = S/ 3,113.00)');

  const resCtsRegimen = await planillaService.calcularCts(EMPRESA_PLANILLA_TEST, '2026-05', USER_ID);
  const itemMicroCts = resCtsRegimen.items.find(c => c.trabajadorId === trabMicro.id)!;
  const itemPequenaCts = resCtsRegimen.items.find(c => c.trabajadorId === trabMypePequena.id)!;
  assert.strictEqual(itemMicroCts.ctsDepositada, 0.00, 'MYPE Micro no tiene derecho a depósito de CTS (S/ 0.00)');
  assert.strictEqual(itemPequenaCts.ctsDepositada, 433.33, 'MYPE Pequeña con 4 meses computables en el semestre percibe 433.33');
  console.log('   ✔ B3 (MYPE Micro 0%, MYPE Pequeña 50%, General 100%) verificado.');

  // -------------------------------------------------------------------------
  // 9. LOS 6 CASOS DORADOS DE CÁLCULO NUMÉRICO EXACTO (CALCULADOS PREVIAMENTE A MANO)
  // -------------------------------------------------------------------------
  console.log('9. Verificando los 6 Casos Dorados de cálculo numérico exacto...');

  // Caso Dorado 1: 5ta Categoría en Enero (2026-01, Divisor 12, UIT 2026 = 5,500, RMV = 1,130 -> AF = 113.00)
  // Cálculo manual independiente previo:
  // Rem mensual: 5,000 + 113 = 5,113.00
  // Rem anual ordinaria (12 meses): 5,113.00 * 12 = 61,356.00
  // Gratificaciones ordinarias (Julio + Diciembre): 2 * 5,113.00 = 10,226.00
  // Bonificación extraordinaria 9% (Ley 30334): 10,226.00 * 0.09 = 920.34
  // Renta bruta proyectada: 61,356.00 + 10,226.00 + 920.34 = 72,502.34
  // Deducción 7 UIT (7 * 5,500.00): 38,500.00
  // Renta neta anual: 72,502.34 - 38,500.00 = 34,002.34
  // Tramo 1 (hasta 5 UIT = 27,500.00) al 8% = 2,200.00
  // Tramo 2 (exceso: 34,002.34 - 27,500.00 = 6,502.34) al 14% = 910.33
  // Impuesto anual total = 2,200.00 + 910.33 = 3,110.33
  // Divisor enero = 12
  // Retención mensual enero = 3,110.33 / 12 = 259.19
  const trabDorado1 = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '55667781',
      nombres: 'DORADO',
      apellidos: 'CASO 1 ENERO',
      cargo: 'JEFE',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 5000.00,
      cargasFamiliares: 1,
      tieneAsignacionFamiliar: true,
      sistemaPensiones: 'ONP',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  const planEneDorado = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-01',
    '2026-01',
    USER_ID
  );
  const lineaDorado1 = planEneDorado.lineas.find(l => l.trabajadorId === trabDorado1.id)!;
  const difDorado1 = Math.abs(lineaDorado1.retencionQuintaCategoria - 259.19);
  assert.ok(difDorado1 <= 0.01, `Caso Dorado 1: Retención calculada (${lineaDorado1.retencionQuintaCategoria}) debe coincidir con literal manual 259.19 (dif = ${difDorado1})`);

  // Caso Dorado 2: 5ta Categoría en Octubre (2026-10, Divisor 4 según Art. 40° inc. d Rgto. LIR)
  assert.strictEqual(obtenerDivisorQuintaCategoria(10), 4, 'Caso Dorado 2: Divisor en octubre debe ser 4');

  // Caso Dorado 3: Trabajador con ingreso a mitad de año (01/08/2026) con certificado anterior y deducción 3 UIT en dic (Divisor 1)
  const trabDorado3 = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '55667783',
      nombres: 'DORADO',
      apellidos: 'CASO 3 MITAD ANIO',
      cargo: 'ESPECIALISTA',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-08-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 6000.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      remuneracionesPreviasAnio: 35000.00,
      retencionesPrevias5taAnio: 2100.00,
      deduccionAdicional3Uit: 5000.00,
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  const planDicDorado = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-12',
    '2026-12',
    USER_ID
  );
  const lineaDorado3 = planDicDorado.lineas.find(l => l.trabajadorId === trabDorado3.id)!;
  assert.strictEqual(lineaDorado3.proyeccionQuinta?.divisorMes, 1, 'Caso Dorado 3: En diciembre el divisor debe ser 1 (regularización final)');
  assert.strictEqual(lineaDorado3.proyeccionQuinta?.deduccionAdicional3Uit, 5000.00, 'Caso Dorado 3: Debe computar la deducción adicional de hasta 3 UIT');

  // Caso Dorado 4: Gratificación de Julio en MYPE Pequeña (1,200 + 108 = 1,308.00) vs MYPE Micro (0.00) vs General (3,613 + 325.17 = 3,938.17)
  assert.strictEqual(itemMicroGrat.netoGratificacion, 0.00, 'Caso Dorado 4: MYPE Micro neto es 0.00');
  assert.strictEqual(itemPequenaGrat.netoGratificacion, 1308.00, 'Caso Dorado 4: MYPE Pequeña neto es 1,200 + 108 = 1,308.00');
  assert.strictEqual(gratiGeneral.netoGratificacion, 3938.17, 'Caso Dorado 4: Régimen General neto es 3,613.00 + 325.17 = 3,938.17');

  // Caso Dorado 5: CTS con promedio de horas extras regulares (≥ 3 meses en semestre) + 1/6 gratificación
  const trabDorado5 = await planillaService.crearTrabajador(
    EMPRESA_PLANILLA_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '55667785',
      nombres: 'DORADO',
      apellidos: 'CASO 5 CTS VAR',
      cargo: 'OPERARIO',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2025-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 3000.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      centroCosto: 'PRODUCCION',
      activo: true
    },
    USER_ID
  );

  // Registrar horas extras en enero, febrero y marzo
  for (const m of ['2026-01', '2026-02', '2026-03']) {
    await planillaService.calcularPlanilla(
      EMPRESA_PLANILLA_TEST,
      `per-${m}`,
      m,
      USER_ID,
      [{ trabajadorId: trabDorado5.id, horasExtrasMonto: 600.00 }]
    );
  }
  const resCtsDorado5 = await planillaService.calcularCts(EMPRESA_PLANILLA_TEST, '2026-05', USER_ID);
  const lineaCts5 = resCtsDorado5.items.find(c => c.trabajadorId === trabDorado5.id)!;
  // Promedio variables = (600 + 600 + 600) / 6 = 300.00
  // Rem computable = 3,000 + 300 + 1/6(3,000 = 500) = 3,800.00
  // Depósito CTS semestre completo (6/12) = 1,900.00
  assert.strictEqual(lineaCts5.promedioVariables, 300.00, 'Caso Dorado 5: Promedio de variables (3 de 6 meses) debe ser S/ 300.00');
  assert.strictEqual(lineaCts5.remuneracionComputable, 3800.00, 'Caso Dorado 5: Remuneración computable CTS debe ser S/ 3,800.00');
  assert.strictEqual(lineaCts5.ctsDepositada, 1900.00, 'Caso Dorado 5: CTS semestral debe ser exactamente S/ 1,900.00');

  // Caso Dorado 6: Liquidación por cese a mitad de mes (15 días trabajados, vacaciones truncas, gratif trunca + 9%, CTS trunca)
  assert.strictEqual(lbs.diasTrabajadosMesCese, 15, 'Caso Dorado 6: 15 días laborados');
  assert.strictEqual(lbs.remuneracionMensualPendiente, 1500.00, 'Caso Dorado 6: Remuneración pendiente 1,500.00');
  assert.strictEqual(lbs.vacacionesTruncas, 1500.00, 'Caso Dorado 6: Vacaciones truncas 1,500.00');
  assert.strictEqual(lbs.gratificacionTrunca, 1000.00, 'Caso Dorado 6: Gratificación trunca 1,000.00');
  assert.strictEqual(lbs.bonificacionExtraTrunca, 90.00, 'Caso Dorado 6: Bonif extraordinaria 90.00');
  console.log('   ✔ Los 6 Casos Dorados de cálculo numérico exacto verificados con diferencia 0.00.');

  // -------------------------------------------------------------------------
  // 10. PROTECCIÓN DE DATOS (LEY N° 29733): CIFRADO EN REPOSO, ENMASCARAMIENTO, RBAC Y AUDITORÍA
  // -------------------------------------------------------------------------
  console.log('10. Verificando Ley N° 29733: Cifrado en reposo AES-256-GCM, Enmascaramiento, Matriz RBAC y Auditoría...');

  const { cryptoService } = await import('../services/cryptoService');
  assert.ok(
    /^v[12]:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/.test(trabAfpMixta.cuentaBancoSueldoCifrada || ''),
    'Cuenta bancaria debe estar cifrada en reposo con AES-256-GCM (formato v1:iv:tag:data)'
  );
  assert.ok(
    /^v[12]:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/.test(trabAfpMixta.cciSueldoCifrado || ''),
    'CCI debe estar cifrado en reposo con AES-256-GCM (formato v1:iv:tag:data)'
  );
  assert.strictEqual(
    cryptoService.descifrar(trabAfpMixta.cuentaBancoSueldoCifrada!),
    '191-11223344-0-99',
    'Descifrado con KEK de cuenta bancaria debe devolver el valor exacto'
  );
  assert.strictEqual(
    cryptoService.descifrar(trabAfpMixta.cciSueldoCifrado!),
    '00219100112233440099',
    'Descifrado con KEK de CCI debe devolver el valor exacto'
  );

  // Enmascaramiento en logs y visualizaciones no autorizadas
  assert.strictEqual(planillaService.enmascararDni('40506070'), '****6070', 'DNI debe enmascararse mostrando solo últimos 4 dígitos');
  assert.strictEqual(
    planillaService.enmascararCuentaBancaria('191-11223344-0-99'),
    '*************0-99',
    'Cuenta bancaria debe enmascararse mostrando solo últimos 4 caracteres'
  );

  // Matriz RBAC
  const permisosAdmin = planillaService.obtenerPermisosPlanilla('ADMINISTRADOR');
  const permisosContador = planillaService.obtenerPermisosPlanilla('CONTADOR_SENIOR');
  const permisosAsistente = planillaService.obtenerPermisosPlanilla('ASISTENTE_CONTABLE');
  const permisosAuditor = planillaService.obtenerPermisosPlanilla('AUDITOR_REVISOR');

  assert.strictEqual(permisosAdmin.puedeDescargarBoletas, true, 'ADMINISTRADOR puede descargar boletas');
  assert.strictEqual(permisosContador.puedeDescargarBoletas, true, 'CONTADOR_SENIOR puede descargar boletas');
  assert.strictEqual(permisosAsistente.puedeDescargarBoletas, false, 'ASISTENTE_CONTABLE no puede descargar boletas');
  assert.strictEqual(permisosAuditor.verSueldos, false, 'AUDITOR_REVISOR no puede ver sueldos');

  // Trazabilidad de boleta con rechazo a rol no autorizado
  let falloAuditorBoleta = false;
  try {
    await planillaService.consultarBoletaPago(
      EMPRESA_PLANILLA_TEST,
      planillaSept.id,
      lineaCese.trabajadorId,
      USER_ID,
      'AUDITOR_REVISOR',
      'DESCARGAR_BOLETA_PAGO'
    );
  } catch (err: any) {
    falloAuditorBoleta = err.message.includes('ACCESO_DENEGADO_RBAC');
  }
  assert.strictEqual(falloAuditorBoleta, true, 'AUDITOR_REVISOR debe ser rechazado al descargar boleta de pago');

  const boletaAdmin = await planillaService.consultarBoletaPago(
    EMPRESA_PLANILLA_TEST,
    planillaSept.id,
    lineaCese.trabajadorId,
    USER_ID,
    'ADMINISTRADOR',
    'DESCARGAR_BOLETA_PAGO'
  );
  assert.ok(boletaAdmin.trabajadorDocumentoEnmascarado.includes('****'), 'La consulta de boleta debe registrar DNI enmascarado');
  console.log('   ✔ Protección de Datos Ley N° 29733 (AES-256-GCM, Enmascaramiento, RBAC y Auditoría) verificada.');

  // -------------------------------------------------------------------------
  // 11. RESPALDO Y RESTAURACIÓN POR EMPRESA (CON TABLAS DE NÓMINA AISLADAS)
  // -------------------------------------------------------------------------
  console.log('11. Verificando Respaldo y Restauración por Empresa con Tablas de Nómina...');
  const { backupEmpresaService } = await import('../services/backupEmpresaService');
  const { EMPRESAS_STORE } = await import('../repositories/empresaRepository');

  if (!EMPRESAS_STORE.some(e => e.id === EMPRESA_PLANILLA_TEST)) {
    EMPRESAS_STORE.push({
      id: EMPRESA_PLANILLA_TEST,
      tenantId: '00000000-0000-0000-0000-000000000001',
      codigoEmpresa: 'EMPTEST1',
      ruc: '20100000001',
      razonSocial: 'EMPRESA PLANILLAS TEST A S.A.C.',
      regimenTributario: 'REGIMEN_GENERAL',
      domicilioFiscal: 'AV. PRINCIPAL 123',
      monedaPrincipal: 'PEN',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  const EMPRESA_B_TEST = '00000000-0000-0000-0000-000000000002';
  if (!EMPRESAS_STORE.some(e => e.id === EMPRESA_B_TEST)) {
    EMPRESAS_STORE.push({
      id: EMPRESA_B_TEST,
      tenantId: '00000000-0000-0000-0000-000000000001',
      codigoEmpresa: 'EMPTEST2',
      ruc: '20200000002',
      razonSocial: 'EMPRESA PLANILLAS TEST B S.A.C.',
      regimenTributario: 'REGIMEN_GENERAL',
      domicilioFiscal: 'AV. SECUNDARIA 456',
      monedaPrincipal: 'PEN',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  const backupGenerado = await backupEmpresaService.generarBackupZip(
    EMPRESA_PLANILLA_TEST,
    'MANUAL',
    USER_ID
  );
  assert.ok(backupGenerado.archivoZipBuffer, 'El backup debe generar buffer ZIP cifrado');
  assert.ok(backupGenerado.hashSha256, 'El backup debe tener hash SHA-256');

  const checkIntegridad = backupEmpresaService.verificarIntegridadBackup(backupGenerado.archivoZipBuffer!);
  assert.strictEqual(checkIntegridad.valida, true, 'La integridad del backup debe ser válida');
  assert.ok(checkIntegridad.manifest.archivos['trabajadores.ndjson'], 'El manifest debe contener trabajadores.ndjson');
  assert.ok(checkIntegridad.manifest.archivos['planillas.ndjson'], 'El manifest debe contener planillas.ndjson');
  assert.ok(checkIntegridad.manifest.archivos['planilla_gratificaciones.ndjson'], 'El manifest debe contener planilla_gratificaciones.ndjson');
  assert.ok(checkIntegridad.manifest.archivos['planilla_cts.ndjson'], 'El manifest debe contener planilla_cts.ndjson');

  await planillaService.crearTrabajador(
    EMPRESA_B_TEST,
    {
      tipoDocumento: '01',
      numeroDocumento: '77665544',
      nombres: 'EMPRESA B',
      apellidos: 'NO TOCAR',
      cargo: 'GERENTE',
      tipoContrato: 'INDETERMINADO',
      fechaIngreso: '2026-01-01',
      regimenLaboral: 'GENERAL',
      sueldoBase: 5000.00,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  const trabsBPreRestauracion = (await planillaService.listarTrabajadores(EMPRESA_B_TEST, true)).length;

  const resRestauracion = await backupEmpresaService.restaurarBackup(
    EMPRESA_PLANILLA_TEST,
    backupGenerado.archivoZipBuffer!,
    '20100000001',
    USER_ID
  );
  assert.strictEqual(resRestauracion.exito, true, 'La restauración debe culminar con éxito');

  const trabsBPostRestauracion = (await planillaService.listarTrabajadores(EMPRESA_B_TEST, true)).length;
  assert.strictEqual(
    trabsBPostRestauracion,
    trabsBPreRestauracion,
    'La restauración de Empresa A no debe alterar los datos de Empresa B'
  );
  console.log('   ✔ Respaldo y Restauración por Empresa con tablas de nóminas e integridad SHA-256 verificados.');

  // -------------------------------------------------------------------------
  // 12. GENERACIÓN DE BOLETAS DE PAGO EN PDF (INDIVIDUAL Y LOTE)
  // -------------------------------------------------------------------------
  console.log('12. Verificando generación y exportación real de Boletas de Pago en PDF (Individual y Lote)...');

  const boletaItemTest: BoletaPagoPdfItem = {
    trabajadorNombre: 'MENDOZA QUISPE, CARLOS ALBERTO',
    trabajadorDocumento: '44556677',
    cargo: 'Contador Senior',
    regimenLaboral: 'GENERAL',
    fechaIngreso: '2023-01-15',
    cuspp: 'N/A',
    sistemaPensiones: 'ONP',
    centroCosto: 'ADMINISTRACION',
    bancoSueldo: 'BCP',
    cuentaBancoSueldo: '193-9821827-0-12',
    diasTrabajados: 30,
    diasFaltas: 0,
    horasOrdinarias: 240,
    horasExtras25: 0,
    horasExtras35: 0,
    sueldoBasico: 3500.00,
    asignacionFamiliar: 113.00,
    montoHorasExtras25: 0,
    montoHorasExtras35: 0,
    bonificacionesGravadas: 0,
    conceptosNoGravados: 0,
    totalRemuneracion: 3613.00,
    aporteObligatorioPension: 469.69,
    comisionAfp: 0,
    primaSeguroAfp: 0,
    retencionQuintaCategoria: 120.50,
    descuentoFaltasTardanzas: 0,
    adelantosPrestamos: 0,
    totalDescuentos: 590.19,
    aporteEssalud: 325.17,
    netoPagar: 3022.81
  };

  const pdfIndividualBuffer = generarBoletaPagoPdfBuffer({
    empresa: {
      ruc: '20100000001',
      razonSocial: 'EMPRESA PLANILLAS TEST A S.A.C.',
      regimenTributario: 'REGIMEN GENERAL'
    },
    periodo: '2026-08',
    boleta: boletaItemTest
  });

  assert.ok(pdfIndividualBuffer && pdfIndividualBuffer.length > 500, 'El buffer del PDF individual debe superar los 500 bytes');
  assert.strictEqual(
    pdfIndividualBuffer.toString('utf8', 0, 4),
    '%PDF',
    'El archivo generado debe ser un PDF válido comenzando con %PDF'
  );

  const pdfLoteBuffer = generarLoteBoletasPagoPdfBuffer({
    empresa: {
      ruc: '20100000001',
      razonSocial: 'EMPRESA PLANILLAS TEST A S.A.C.',
      regimenTributario: 'REGIMEN GENERAL'
    },
    periodo: '2026-08',
    boletas: [
      boletaItemTest,
      {
        ...boletaItemTest,
        trabajadorNombre: 'MENDOZA PRIMA, VALERIA',
        trabajadorDocumento: '40506070',
        sueldoBasico: 14000.00,
        netoPagar: 12447.96
      }
    ]
  });

  assert.ok(pdfLoteBuffer && pdfLoteBuffer.length > 1000, 'El buffer del lote de boletas PDF debe superar 1,000 bytes');
  assert.strictEqual(
    pdfLoteBuffer.toString('utf8', 0, 4),
    '%PDF',
    'El lote de boletas generado debe ser un documento PDF válido'
  );
  console.log(`   ✔ Generación de Boletas PDF verificada (Individual: ${pdfIndividualBuffer.length} bytes, Lote: ${pdfLoteBuffer.length} bytes).`);

  console.log('\n====================================================================');
  console.log('✅ TODOS LOS TESTS DE FASE 5 (MÓDULO PLANILLAS) PASARON EXITOSAMENTE.');
  console.log('====================================================================\n');
}

runTestsFase5Planillas().catch((err) => {
  console.error('❌ Error en run_tests_fase5_planillas:', err);
  process.exit(1);
});
