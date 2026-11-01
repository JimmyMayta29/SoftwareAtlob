import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { planillaService } from '../services/planillaService';
import { parametroRepository } from '../repositories/parametroRepository';
import { asientoService } from '../services/asientoService';
import { REGISTRO_DATOS_EMPRESA } from '../storage/registroDatosEmpresa';

const EMPRESA_PLANILLA_TEST = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000001';

async function runTestsFase5Planillas() {
  console.log('\n====================================================================');
  console.log('🧪 INICIANDO TESTS FASE 5: MÓDULO PLANILLAS (AISLADO DE IGV-RENTA)');
  console.log('====================================================================\n');

  // -------------------------------------------------------------------------
  // 1. PARÁMETROS EDITABLES (RMV, UIT, TASAS) CON VIGENCIA Y ASIGNACIÓN FAMILIAR
  // -------------------------------------------------------------------------
  console.log('1. Verificando Parámetros Laborales Editables (RMV, UIT, Tasas) con vigencia...');
  const rmvSept = await parametroRepository.obtenerParametroPorCodigo('RMV', '2026-09-30');
  assert.ok(rmvSept, 'Debe existir el parámetro RMV vigente en septiembre 2026');
  assert.strictEqual(rmvSept.valorNumerico, 1025, 'RMV en septiembre 2026 debe ser S/ 1,025.00');

  // Guardar una nueva vigencia de RMV a partir de noviembre 2026 (S/ 1,130.00)
  await parametroRepository.guardarOActualizarParametro(
    {
      codigoParametro: 'RMV',
      descripcion: 'Remuneración Mínima Vital Incrementada (Prueba Vigencia)',
      valorNumerico: 1130,
      tipoDato: 'MONEDA',
      vigenteDesde: '2026-11-01',
      vigenteHasta: '2026-12-31'
    },
    USER_ID
  );

  const rmvEnSeptiembre = await parametroRepository.obtenerParametroPorCodigo('RMV', '2026-09-15');
  const rmvEnNoviembre = await parametroRepository.obtenerParametroPorCodigo('RMV', '2026-11-15');
  assert.strictEqual(rmvEnSeptiembre?.valorNumerico, 1025, 'Consulta histórica en 2026-09-15 debe devolver RMV = 1025');
  assert.strictEqual(rmvEnNoviembre?.valorNumerico, 1130, 'Consulta en 2026-11-15 debe devolver nueva RMV = 1130');

  // Validar que no se permita registrar trabajador a jornada completa por debajo de la RMV
  let rechazoMenorRmv = false;
  try {
    await planillaService.crearTrabajador(
      EMPRESA_PLANILLA_TEST,
      {
        tipoDocumento: '1',
        numeroDocumento: '99887766',
        nombres: 'PEDRO',
        apellidos: 'SUELDO MENOR',
        fechaIngreso: '2026-06-01',
        cargo: 'AUXILIAR',
        tipoContrato: 'INDETERMINADO',
        regimenLaboral: 'GENERAL',
        sueldoBase: 850, // Menor a RMV 1025
        tieneAsignacionFamiliar: false,
        sistemaPensiones: 'ONP',
        afpTipoComision: 'FLUJO',
        centroCosto: 'ADMINISTRACION',
        activo: true
      },
      USER_ID
    );
  } catch (err: any) {
    rechazoMenorRmv = err.message.includes('RMV');
  }
  assert.strictEqual(rechazoMenorRmv, true, 'Debe rechazar remuneración básica menor a la RMV en contrato indeterminado');
  console.log('   ✔ RMV con vigencia multi-fecha y validación de mínimo vital verificadas.');

  // -------------------------------------------------------------------------
  // 2. AFP (FLUJO vs MIXTA y TOPE PRIMA SEGURO) vs ONP
  // -------------------------------------------------------------------------
  console.log('2. Verificando cálculo comparativo ONP (13%) vs AFP (Comisión Flujo vs Mixta y Tope Prima)...');

  // Trabajador AFP Prima con Comisión MIXTA y sueldo alto para probar tope de prima de seguro
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
      sueldoBase: 14000, // Supera tope de prima de seguro AFP (S/ 12,135.22)
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
      sueldoBase: 2400,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      afpTipoComision: 'FLUJO',
      centroCosto: 'PRODUCCION',
      activo: true
    },
    USER_ID
  );

  const planillaAgo = await planillaService.calcularPlanilla(
    EMPRESA_PLANILLA_TEST,
    'per-2026-08',
    '2026-08',
    USER_ID
  );

  const lineaOnp = planillaAgo.lineas.find((l) => l.trabajadorId === 'trab-01')!;
  const lineaAfpFlujo = planillaAgo.lineas.find((l) => l.trabajadorId === 'trab-02')!;
  const lineaAfpMixta = planillaAgo.lineas.find((l) => l.trabajadorId === trabAfpMixta.id)!;

  assert.ok(lineaOnp && lineaAfpFlujo && lineaAfpMixta, 'Deben existir líneas para ONP, AFP Flujo y AFP Mixta');

  // ONP: Sueldo 3500 + Asig. Fam. 102.50 = 3602.50 -> 13% = 468.33
  assert.strictEqual(lineaOnp.asignacionFamiliar, 102.5, 'Asignación familiar debe ser 10% de RMV (102.50)');
  assert.strictEqual(lineaOnp.aporteObligatorioPension, 468.33, 'ONP 13% de 3602.50 debe ser 468.33');
  assert.strictEqual(lineaOnp.comisionAfp, 0, 'ONP no cobra comisión AFP');
  assert.strictEqual(lineaOnp.primaSeguroAfp, 0, 'ONP no cobra prima de seguro AFP');

  // AFP Integra Flujo: Sueldo 2800 -> Aporte 10% = 280.00, Comisión Flujo 1.55% = 43.40, Prima 1.84% = 51.52
  assert.strictEqual(lineaAfpFlujo.aporteObligatorioPension, 280.0, 'AFP Aporte 10% de 2800 debe ser 280.00');
  assert.strictEqual(lineaAfpFlujo.comisionAfp, 43.4, 'AFP Integra Comisión Flujo 1.55% debe ser 43.40');
  assert.strictEqual(lineaAfpFlujo.primaSeguroAfp, 51.52, 'AFP Prima Seguro 1.84% debe ser 51.52');

  // AFP Prima Mixta con sueldo 14,000 + AF 102.50 = 14,102.50:
  // Aporte 10% = 1,410.25
  // Comisión Mixta Prima (0.18%) = 14,102.50 * 0.0018 = 25.38
  // Prima Seguro 1.84% sobre tope S/ 12,135.22 = 223.29 (menor que 14,102.50 * 0.0184 = 259.49)
  assert.strictEqual(lineaAfpMixta.aporteObligatorioPension, 1410.25, 'AFP Aporte 10% sobre 14,102.50 debe ser 1410.25');
  assert.strictEqual(lineaAfpMixta.comisionAfp, 25.38, 'AFP Prima Comisión Mixta (0.18%) debe ser 25.38');
  assert.strictEqual(lineaAfpMixta.primaSeguroAfp, 223.29, 'Prima de seguro AFP debe respetar el tope máximo S/ 12,135.22 (223.29)');
  console.log('   ✔ Comparativa ONP vs AFP (Flujo, Mixta y Tope Prima Seguro) verificada.');

  // -------------------------------------------------------------------------
  // 3. RETENCIÓN DE 5TA CATEGORÍA CON PROYECCIÓN ANUAL E INGRESOS VARIABLES
  // -------------------------------------------------------------------------
  console.log('3. Verificando Retención de 5ta Categoría con Proyección Anual e Ingresos Variables...');

  // En Agosto (mes 8), divisor oficial = 5
  const retencionQuintaSinVariables = lineaOnp.retencionQuintaCategoria;
  assert.ok(retencionQuintaSinVariables > 0, 'Trabajador con S/ 3,602.50 mensual (14 sueldos = S/ 50,435 > 7 UIT S/ 38,500) debe tener retención de 5ta');

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
  // 4. MES DE GRATIFICACIÓN (JULIO / DICIEMBRE + BONIF. 9%) Y CTS (MAYO / NOVIEMBRE)
  // -------------------------------------------------------------------------
  console.log('4. Verificando Gratificaciones (Julio/Diciembre + Bonif. 9%) y CTS (Mayo/Noviembre)...');

  const resGratiJulio = await planillaService.calcularGratificaciones(EMPRESA_PLANILLA_TEST, '2026-07', USER_ID);
  assert.ok(resGratiJulio.items.length >= 3, 'Debe calcular gratificaciones para los trabajadores activos');

  const gratiGeneral = resGratiJulio.items.find((g) => g.trabajadorId === 'trab-01')!;
  const gratiMypePequena = resGratiJulio.items.find((g) => g.trabajadorId === trabMypePequena.id)!;

  // Trabajador General (trab-01): Básico 3500 + AF 102.50 = 3602.50 (6 meses completos) + Bonif 9% (324.23) = 3926.73
  assert.strictEqual(gratiGeneral.montoGratificacion, 3602.5, 'Gratificación Julio Régimen General debe ser 100% de remuneración computable');
  assert.strictEqual(gratiGeneral.bonificacionExtraordinaria, 324.23, 'Bonificación extraordinaria 9% (Ley 30334) debe ser 324.23');
  assert.strictEqual(gratiGeneral.netoGratificacion, 3926.73, 'Neto gratificación está inafecto de ONP/AFP');

  // Trabajador MYPE Pequeña Empresa (trabMypePequena): Sueldo 2400 -> 50% = 1200.00 + Bonif 9% (108.00) = 1308.00
  assert.strictEqual(gratiMypePequena.montoGratificacion, 1200.0, 'Gratificación MYPE Pequeña Empresa debe ser 50% (medio sueldo)');
  assert.strictEqual(gratiMypePequena.bonificacionExtraordinaria, 108.0, 'Bonificación 9% sobre 1200 debe ser 108.00');

  const contGrati = await planillaService.contabilizarGratificaciones(EMPRESA_PLANILLA_TEST, '2026-07', USER_ID);
  assert.ok(contGrati.asientoId, 'Gratificaciones deben generar asiento contable cuadrado');

  // CTS Mayo 2026
  const resCtsMayo = await planillaService.calcularCts(EMPRESA_PLANILLA_TEST, '2026-05', USER_ID);
  const ctsGeneral = resCtsMayo.items.find((c) => c.trabajadorId === 'trab-01')!;
  // Remuneración computable CTS = 3602.50 + 1/6(3602.50 = 600.42) = 4202.92 -> Semestre completo (6/12) = 2101.46
  assert.strictEqual(ctsGeneral.sextoGratificacion, 600.42, '1/6 de gratificación de 3602.50 debe ser 600.42');
  assert.strictEqual(ctsGeneral.montoCts, 2101.46, 'Depósito CTS semestral debe ser 50% de la remuneración computable CTS (2101.46)');

  const contCts = await planillaService.contabilizarCts(EMPRESA_PLANILLA_TEST, '2026-05', USER_ID);
  assert.ok(contCts.asientoId, 'CTS debe generar asiento contable cuadrado');
  console.log('   ✔ Gratificaciones (+9%), CTS (con 1/6 de gratificación) y sus asientos contables verificados.');

  // -------------------------------------------------------------------------
  // 5. TRABAJADOR CON BAJA A MITAD DE MES + ASIENTO POR CENTRO DE COSTOS + LBS + PLAME/T-REGISTRO
  // -------------------------------------------------------------------------
  console.log('5. Verificando Trabajador con Baja a Mitad de Mes (15 días), LBS, Asiento por C. Costos y PLAME/T-Registro...');

  // Crear un trabajador que cesará el 15 de septiembre de 2026 (mitad de mes = 15 días trabajados)
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
      fechaCese: '2026-09-15', // Baja a mitad de mes (15 días en septiembre)
      motivoCese: 'RENUNCIA VOLUNTARIA',
      regimenLaboral: 'GENERAL',
      sueldoBase: 3000,
      cargasFamiliares: 0,
      tieneAsignacionFamiliar: false,
      sistemaPensiones: 'ONP',
      afpTipoComision: 'FLUJO',
      centroCosto: 'ADMINISTRACION',
      activo: true
    },
    USER_ID
  );

  // Calcular planilla de Septiembre 2026
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
  assert.strictEqual(lineaCese.sueldoBasico, 1500.0, 'Sueldo básico por baja a mitad de mes (15 días de S/ 3,000) debe ser S/ 1,500.00');
  assert.strictEqual(lineaCese.aporteObligatorioPension, 195.0, 'ONP 13% sobre S/ 1,500.00 debe ser S/ 195.00');

  // Contabilizar planilla y verificar asiento por centro de costos (Cuentas 62, 40, 41, y destino 941/951/921 vs 791)
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
  assert.ok(cuentasUsadas.has('941') && cuentasUsadas.has('951') && cuentasUsadas.has('921'), 'El asiento debe distribuir el destino por Centro de Costos (941 Adm, 951 Ventas, 921 Producción)');
  assert.ok(cuentasUsadas.has('791'), 'El asiento debe incluir contrapartida 791');

  // Emitir Liquidación de Beneficios Sociales (LBS) con vacaciones truncas, CTS trunca y gratificación trunca
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
  assert.strictEqual(lbs.remuneracionMensualPendiente, 1500.0, 'LBS debe consignar S/ 1,500.00 de remuneración proporcional por los 15 días');
  assert.strictEqual(lbs.vacacionesTruncas, 1500.0, '15 días de vacaciones truncas sobre S/ 3,000 deben ser S/ 1,500.00');
  assert.strictEqual(lbs.gratificacionTrunca, 1000.0, '2 meses completos de gratificación trunca (Jul-Ago) sobre S/ 3,000 deben ser S/ 1,000.00');
  assert.strictEqual(lbs.bonificacionExtraTrunca, 90.0, 'Bonificación extraordinaria trunca 9% debe ser S/ 90.00');
  assert.ok(lbs.ctsTrunca > 0 && lbs.netoLiquidacion > 0, 'CTS trunca y neto de liquidación deben ser mayores a cero');

  // Validador de estructura PLAME y Exportador PLAME (.jor, .rem, .snl, .toc, .des)
  const valPlame = await planillaService.validarEstructuraPlame(EMPRESA_PLANILLA_TEST, planillaSept.id);
  assert.strictEqual(valPlame.esValido, true, 'El validador de estructura PLAME debe aprobar la planilla');
  const expPlame = await planillaService.exportarPlame(EMPRESA_PLANILLA_TEST, planillaSept.id);
  assert.ok(expPlame.archivos.jor.includes('72839405|120|0|0|0|'), 'El archivo .jor debe reflejar las 120 horas ordinarias del trabajador con baja a mitad de mes');
  assert.ok(expPlame.archivos.rem.includes('72839405|0121|1500.00|1500.00|'), 'El archivo .rem debe reflejar el básico proporcional de S/ 1,500.00');
  assert.ok(expPlame.archivos.toc.length > 0, 'Debe exportar archivo .toc de condiciones de aportación');

  // Exportador separado de T-Registro (.tra, .per, altas, bajas, modificaciones)
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

  // Limpiar trabajador temporal de cese y vigencia temporal de RMV para no alterar otras suites si se reutiliza el proceso
  await parametroRepository.guardarOActualizarParametro(
    {
      codigoParametro: 'RMV',
      descripcion: 'Remuneración Mínima Vital',
      valorNumerico: 1025,
      tipoDato: 'MONEDA',
      vigenteDesde: '2022-05-01',
      vigenteHasta: null
    },
    USER_ID
  );

  console.log('   ✔ Aislamiento estricto Planillas vs IGV-Renta y registro declarativo verificados.');
  console.log('\n✅ TODOS LOS TESTS DE FASE 5 (MÓDULO PLANILLAS) PASARON EXITOSAMENTE.\n');
}

runTestsFase5Planillas().catch((err) => {
  console.error('❌ Error en run_tests_fase5_planillas:', err);
  process.exit(1);
});
