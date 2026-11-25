import assert from 'node:assert/strict';
import {
  PartidaBancoMatching,
  PartidaLibroMatching,
  ReglaAprendidaMatching,
  ejecutarMotorMatching,
} from './matchingEngine';

let pasados = 0;

function caso(nombre: string, fn: () => void): void {
  fn();
  pasados += 1;
  console.log(`  ✅ ${nombre}`);
}

console.log('\n====================================================================');
console.log('🧪 PRUEBAS UNITARIAS — MOTOR DE MATCHING 4 CAPAS (FASE 3.3)');
console.log('====================================================================');

caso('1. Capa 1 (1:1): N° operación exacta, ceros a la izquierda y doc SUNAT', () => {
  const bancos: PartidaBancoMatching[] = [
    {
      id: 'b-op-exacta',
      fecha: '2026-10-10',
      monto: '-1250.00',
      referencia: 'OP-99881',
      descripcion: 'TRANSFERENCIA PROVEEDOR',
    },
    {
      id: 'b-ceros',
      fecha: '2026-10-11',
      monto: '3400.50',
      referencia: '0004567',
      descripcion: 'ABONO CLIENTE',
    },
    {
      id: 'b-doc',
      fecha: '2026-10-12',
      monto: '-500.00',
      referencia: null,
      descripcion: 'PAGO FACTURA F001-000123',
      docExtraido: 'F001-000123',
    },
  ];

  const libros: PartidaLibroMatching[] = [
    {
      id: 'l-op-exacta',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'as-1',
      asientoDetalleId: null,
      fecha: '2026-10-04', // 6 días de desfase: permitido hasta 7 días en coincidencia exacta de operación
      importeConSigno: '-1250.00',
      numeroOperacion: 'OP-99881',
      glosa: 'Pago transferencia',
    },
    {
      id: 'l-ceros',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'as-2',
      asientoDetalleId: null,
      fecha: '2026-10-11',
      importeConSigno: '3400.50',
      numeroOperacion: '4567',
      glosa: 'Cobranza cliente',
    },
    {
      id: 'l-doc',
      origenLibro: 'ASIENTO_MANUAL',
      asientoId: 'as-3',
      asientoDetalleId: 'l-doc',
      fecha: '2026-10-12',
      importeConSigno: '-500.00',
      numeroOperacion: null,
      docRef: '01-F001-000123',
      glosa: 'Asiento manual 104x',
    },
  ];

  const res = ejecutarMotorMatching({
    partidasBanco: bancos,
    partidasLibro: libros,
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
  });

  assert.equal(res.grupos.length, 3);
  assert.equal(res.estadisticas.autoConciliados, 3);
  assert.equal(res.estadisticas.sugeridos, 0);
  assert.equal(res.estadisticas.diferenciaPendiente, '0.00');

  for (const g of res.grupos) {
    assert.equal(g.capaMatching, 1);
    assert.equal(g.tipoMatch, '1:1');
    assert.equal(g.reglaAplicada, 'CAPA_1_OPERACION_MONTO');
    assert.equal(g.score, 1);
    assert.equal(g.estado, 'CONCILIADO');
    assert.equal(g.diferenciaMonto, '0.00');
  }

  const grupoDoc = res.grupos.find((g) => g.itemsBanco[0].partida.id === 'b-doc')!;
  assert.equal(grupoDoc.itemsLibro[0].partida.origenLibro, 'ASIENTO_MANUAL');
  assert.equal(grupoDoc.itemsLibro[0].partida.asientoDetalleId, 'l-doc');
});

caso('2. Capa 1 anti-ambigüedad: empate operación+monto+días degrada a SUGERIDO', () => {
  const res = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-1',
        fecha: '2026-10-10',
        monto: '-200.00',
        referencia: 'OP-777',
        descripcion: 'PAGO OP-777',
      },
    ],
    partidasLibro: [
      {
        id: 'l-1',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a-1',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-200.00',
        numeroOperacion: 'OP-777',
        glosa: 'Pago 1',
      },
      {
        id: 'l-2',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a-2',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-200.00',
        numeroOperacion: 'OP-777',
        glosa: 'Pago 2',
      },
    ],
  });

  assert.equal(res.grupos.length, 1);
  assert.equal(res.grupos[0].capaMatching, 1);
  assert.equal(res.grupos[0].estado, 'SUGERIDO');
  assert.equal(res.grupos[0].score, 0.88);
  assert.equal(res.grupos[0].reglaAplicada, 'CAPA_1_OPERACION_MONTO_AMBIGUO');
});

caso('3. Capa 2 (1:1): Monto + ventana + contraparte (RUC, tokens y regla aprendida)', () => {
  const reglas: ReglaAprendidaMatching[] = [
    {
      id: 'regla-1',
      patronContraparte: 'SERVICIOS CLOUD ANDES',
      rucContraparte: null,
      anexoId: 'anexo-cloud',
      usosConfirmados: 4,
      activo: true,
    },
  ];

  const res = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-ruc',
        fecha: '2026-10-05',
        monto: '-1800.00',
        referencia: null,
        descripcion: 'TRANSF PROVEEDOR RUC 20511223344',
        rucExtraido: '20511223344',
      },
      {
        id: 'b-regla',
        fecha: '2026-10-06',
        monto: '-450.00',
        referencia: null,
        descripcion: 'CARGO SERVICIOS CLOUD ANDES MENSUAL',
        contraparteExtraida: 'SERVICIOS CLOUD ANDES',
      },
    ],
    partidasLibro: [
      {
        id: 'l-ruc',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a-r',
        asientoDetalleId: null,
        fecha: '2026-10-07',
        importeConSigno: '-1800.00',
        numeroOperacion: null,
        glosa: 'Pago factura proveedor',
        anexoId: 'anexo-prov',
        anexoRuc: '20511223344',
        anexoNombre: 'DISTRIBUIDORA NORTE SAC',
      },
      {
        id: 'l-regla',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a-c',
        asientoDetalleId: null,
        fecha: '2026-10-06',
        importeConSigno: '-450.00',
        numeroOperacion: null,
        glosa: 'Suscripción plataforma octubre',
        anexoId: 'anexo-cloud',
        anexoNombre: 'CLOUD ANDES TECHNOLOGIES SRL',
      },
    ],
    reglasAprendidas: reglas,
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
  });

  assert.equal(res.grupos.length, 2);
  assert.equal(res.estadisticas.autoConciliados, 2);
  for (const g of res.grupos) {
    assert.equal(g.capaMatching, 2);
    assert.equal(g.estado, 'CONCILIADO');
    assert.ok(g.score >= 0.9 && g.score <= 0.98, `score fuera de rango: ${g.score}`);
  }
});

caso('4. Capa 2 anti-ambigüedad: montos duplicados ambiguos pasan a SUGERIDO; con RUC distinto auto-concilian', () => {
  const resAmbiguo = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-dup-1',
        fecha: '2026-10-10',
        monto: '-100.00',
        referencia: null,
        descripcion: 'PAGO TELEFONIA MOVISTAR',
        contraparteExtraida: 'TELEFONIA MOVISTAR',
      },
      {
        id: 'b-dup-2',
        fecha: '2026-10-10',
        monto: '-100.00',
        referencia: null,
        descripcion: 'PAGO TELEFONIA MOVISTAR',
        contraparteExtraida: 'TELEFONIA MOVISTAR',
      },
    ],
    partidasLibro: [
      {
        id: 'l-dup-1',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a1',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-100.00',
        numeroOperacion: null,
        glosa: 'Pago telefonía movistar línea 1',
        anexoNombre: 'TELEFONIA MOVISTAR',
      },
      {
        id: 'l-dup-2',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a2',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-100.00',
        numeroOperacion: null,
        glosa: 'Pago telefonía movistar línea 2',
        anexoNombre: 'TELEFONIA MOVISTAR',
      },
    ],
  });

  assert.equal(resAmbiguo.grupos.length, 2);
  assert.equal(resAmbiguo.estadisticas.autoConciliados, 0);
  assert.equal(resAmbiguo.estadisticas.sugeridos, 2);
  for (const g of resAmbiguo.grupos) {
    assert.equal(g.capaMatching, 2);
    assert.equal(g.estado, 'SUGERIDO');
    assert.ok(g.score <= 0.85);
    assert.match(g.observacion, /Múltiples candidatos con monto idéntico/i);
  }

  // Mismo monto duplicado pero con RUC diferente -> se desambigua y auto-concilia
  const resDesambiguado = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-a',
        fecha: '2026-10-10',
        monto: '-100.00',
        referencia: null,
        descripcion: 'PAGO RUC 20111111111',
        rucExtraido: '20111111111',
      },
      {
        id: 'b-b',
        fecha: '2026-10-10',
        monto: '-100.00',
        referencia: null,
        descripcion: 'PAGO RUC 20222222222',
        rucExtraido: '20222222222',
      },
    ],
    partidasLibro: [
      {
        id: 'l-a',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a1',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-100.00',
        numeroOperacion: null,
        glosa: 'Proveedor A',
        anexoRuc: '20111111111',
      },
      {
        id: 'l-b',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a2',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-100.00',
        numeroOperacion: null,
        glosa: 'Proveedor B',
        anexoRuc: '20222222222',
      },
    ],
  });

  assert.equal(resDesambiguado.estadisticas.autoConciliados, 2);
  assert.equal(resDesambiguado.estadisticas.sugeridos, 0);
});

caso('5. Capa 3 (1:N y N:1): Subset-sum exacto y con tolerancia de redondeo usando Money', () => {
  const res1N = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-lote',
        fecha: '2026-10-15',
        monto: '1500.00',
        referencia: 'LOTE-01',
        descripcion: 'DEPOSITO CONSOLIDADO VENTAS POS',
      },
    ],
    partidasLibro: [
      {
        id: 'l-1',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a1',
        asientoDetalleId: null,
        fecha: '2026-10-14',
        importeConSigno: '500.00',
        numeroOperacion: 'V-01',
        glosa: 'Venta POS 1',
      },
      {
        id: 'l-2',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a2',
        asientoDetalleId: null,
        fecha: '2026-10-15',
        importeConSigno: '650.25',
        numeroOperacion: 'V-02',
        glosa: 'Venta POS 2',
      },
      {
        id: 'l-3',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a3',
        asientoDetalleId: null,
        fecha: '2026-10-15',
        importeConSigno: '349.75',
        numeroOperacion: 'V-03',
        glosa: 'Venta POS 3',
      },
      {
        id: 'l-distractor',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a4',
        asientoDetalleId: null,
        fecha: '2026-10-15',
        importeConSigno: '-1500.00', // signo opuesto: nunca debe mezclarse
        numeroOperacion: 'E-01',
        glosa: 'Egreso distractor',
      },
    ],
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
  });

  assert.equal(res1N.grupos.length, 1);
  assert.equal(res1N.grupos[0].capaMatching, 3);
  assert.equal(res1N.grupos[0].tipoMatch, '1:N');
  assert.equal(res1N.grupos[0].estado, 'CONCILIADO');
  assert.equal(res1N.grupos[0].itemsLibro.length, 3);
  assert.equal(res1N.grupos[0].diferenciaMonto, '0.00');

  // N:1 con tolerancia de redondeo (S/ 0.03 dentro de S/ 0.05)
  const resN1 = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-p1',
        fecha: '2026-10-20',
        monto: '-400.02',
        referencia: null,
        descripcion: 'CARGO PARCIAL 1',
      },
      {
        id: 'b-p2',
        fecha: '2026-10-21',
        monto: '-600.01',
        referencia: null,
        descripcion: 'CARGO PARCIAL 2',
      },
    ],
    partidasLibro: [
      {
        id: 'l-egreso-unico',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a5',
        asientoDetalleId: null,
        fecha: '2026-10-20',
        importeConSigno: '-1000.00',
        numeroOperacion: null,
        glosa: 'Pago consolidado proveedor',
      },
    ],
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.05', umbralAutoMatch: 0.9 },
  });

  assert.equal(resN1.grupos.length, 1);
  assert.equal(resN1.grupos[0].capaMatching, 3);
  assert.equal(resN1.grupos[0].tipoMatch, 'N:1');
  assert.equal(resN1.grupos[0].itemsBanco.length, 2);
  assert.equal(resN1.grupos[0].diferenciaMonto, '-0.03');
  assert.ok(resN1.grupos[0].score >= 0.85 && resN1.grupos[0].score <= 0.92);
});

caso('6. Capa 4 (Fuzzy): auto-concilia si >= umbral, sugiere en [0.60, umbral) y omite < 0.60', () => {
  const baseBanco: PartidaBancoMatching[] = [
    {
      id: 'b-fuzzy-alto',
      fecha: '2026-10-10',
      monto: '-850.00',
      referencia: null,
      descripcion: 'TRANSFERENCIA CONSULTORIA TECNOLOGICA ANDINA',
      contraparteExtraida: 'CONSULTORIA TECNOLOGICA ANDINA',
      rucExtraido: '20600112233',
    },
    {
      id: 'b-fuzzy-medio',
      fecha: '2026-10-10',
      monto: '-500.00',
      referencia: null,
      descripcion: 'PAGO MANTENIMIENTO EQUIPO OFICINA',
    },
    {
      id: 'b-sin-match',
      fecha: '2026-10-01',
      monto: '-900.00',
      referencia: null,
      descripcion: 'CARGO DESCONOCIDO MISCELANEO',
    },
  ];

  const baseLibro: PartidaLibroMatching[] = [
    {
      id: 'l-fuzzy-alto',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'a1',
      asientoDetalleId: null,
      fecha: '2026-10-14', // 4 días: fuera de Capa 2 (3d), dentro de Capa 4 (6d)
      importeConSigno: '-850.00',
      numeroOperacion: null,
      glosa: 'Honorarios consultoría tecnológica andina',
      anexoRuc: '20600112233',
      anexoNombre: 'CONSULTORIA TECNOLOGICA ANDINA SAC',
    },
    {
      id: 'l-fuzzy-medio',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'a2',
      asientoDetalleId: null,
      fecha: '2026-10-12',
      importeConSigno: '-498.00', // ligera diferencia de 2.00 (0.4%)
      numeroOperacion: null,
      glosa: 'Mantenimiento equipo oficina central',
    },
    {
      id: 'l-sin-match',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'a3',
      asientoDetalleId: null,
      fecha: '2026-10-07', // 6 días
      importeConSigno: '-830.00', // 7.7% diferencia + 0 tokens + 6 días => < 0.60
      numeroOperacion: null,
      glosa: 'Compra suministros almacén',
    },
  ];

  // Con umbral 0.90: ambos fuzzy quedan en SUGERIDO y el de <0.60 queda pendiente
  const resDefault = ejecutarMotorMatching({
    partidasBanco: baseBanco,
    partidasLibro: baseLibro,
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.9 },
  });

  assert.equal(resDefault.grupos.length, 2);
  assert.equal(resDefault.estadisticas.autoConciliados, 0);
  assert.equal(resDefault.estadisticas.sugeridos, 2);
  assert.equal(resDefault.estadisticas.pendientesBancoRestantes, 1);
  assert.equal(resDefault.estadisticas.pendientesLibroRestantes, 1);
  for (const g of resDefault.grupos) {
    assert.equal(g.capaMatching, 4);
    assert.ok(g.score >= 0.6 && g.score <= 0.89);
  }

  // Con umbral 0.80: el fuzzy alto supera umbral y auto-concilia en Capa 4
  const resUmbral80 = ejecutarMotorMatching({
    partidasBanco: baseBanco,
    partidasLibro: baseLibro,
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00', umbralAutoMatch: 0.8 },
  });

  const grupoAlto = resUmbral80.grupos.find((g) => g.itemsBanco[0].partida.id === 'b-fuzzy-alto')!;
  const grupoMedio = resUmbral80.grupos.find((g) => g.itemsBanco[0].partida.id === 'b-fuzzy-medio')!;
  assert.equal(grupoAlto.estado, 'CONCILIADO');
  assert.ok(grupoAlto.score >= 0.8);
  assert.equal(grupoMedio.estado, 'SUGERIDO');
  assert.ok(grupoMedio.score >= 0.6 && grupoMedio.score < 0.8);
});

caso('7. Determinismo absoluto independiente del orden de entrada y sin colisiones entre capas', () => {
  const bancos: PartidaBancoMatching[] = [
    {
      id: 'b-1',
      fecha: '2026-10-05',
      monto: '-300.00',
      referencia: 'OP-101',
      descripcion: 'PAGO OP-101 PROVEEDOR X',
      rucExtraido: '20100100100',
    },
    {
      id: 'b-2',
      fecha: '2026-10-05',
      monto: '-300.00',
      referencia: null,
      descripcion: 'PAGO PROVEEDOR X SIN REF',
      rucExtraido: '20100100100',
    },
  ];
  const libros: PartidaLibroMatching[] = [
    {
      id: 'l-1',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'a1',
      asientoDetalleId: null,
      fecha: '2026-10-05',
      importeConSigno: '-300.00',
      numeroOperacion: 'OP-101',
      glosa: 'Pago proveedor X',
      anexoRuc: '20100100100',
    },
    {
      id: 'l-2',
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: 'a2',
      asientoDetalleId: null,
      fecha: '2026-10-05',
      importeConSigno: '-300.00',
      numeroOperacion: null,
      glosa: 'Segundo pago proveedor X',
      anexoRuc: '20100100100',
    },
  ];

  const r1 = ejecutarMotorMatching({ partidasBanco: bancos, partidasLibro: libros });
  const r2 = ejecutarMotorMatching({
    partidasBanco: [...bancos].reverse(),
    partidasLibro: [...libros].reverse(),
  });

  assert.deepEqual(r1, r2);
  assert.equal(r1.estadisticas.autoConciliados, 2);
  assert.equal(r1.grupos[0].capaMatching, 1);
  assert.equal(r1.grupos[1].capaMatching, 2);
});

caso('8. Rendimiento: 5,000 líneas (2,500 banco + 2,500 libro) en < 2,000 ms', () => {
  const bancos: PartidaBancoMatching[] = [];
  const libros: PartidaLibroMatching[] = [];

  for (let i = 0; i < 2500; i += 1) {
    const dia = String((i % 28) + 1).padStart(2, '0');
    const fecha = `2026-10-${dia}`;
    const centavos = 1000 + (i % 900) * 13 + Math.floor(i / 900);
    const montoStr = `${(centavos / 100).toFixed(2)}`;
    const signed = i % 3 === 0 ? montoStr : `-${montoStr}`;

    if (i < 1200) {
      // Capa 1
      bancos.push({
        id: `b-${i}`,
        fecha,
        monto: signed,
        referencia: `OP-${10000 + i}`,
        descripcion: `OPERACION ${i} EMPRESA ${i % 40}`,
      });
      libros.push({
        id: `l-${i}`,
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: `as-${i}`,
        asientoDetalleId: null,
        fecha,
        importeConSigno: signed,
        numeroOperacion: `OP-${10000 + i}`,
        glosa: `Movimiento ${i}`,
      });
    } else if (i < 2000) {
      // Capa 2
      const ruc = `205000${String(10000 + i).slice(-5)}`;
      bancos.push({
        id: `b-${i}`,
        fecha,
        monto: signed,
        referencia: null,
        descripcion: `TRANSF PROVEEDOR ${i} RUC ${ruc}`,
        rucExtraido: ruc,
      });
      libros.push({
        id: `l-${i}`,
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: `as-${i}`,
        asientoDetalleId: null,
        fecha,
        importeConSigno: signed,
        numeroOperacion: null,
        glosa: `Pago proveedor ${i}`,
        anexoRuc: ruc,
      });
    } else {
      // Sin match o candidatos densos para Capa 3/4
      bancos.push({
        id: `b-${i}`,
        fecha,
        monto: signed,
        referencia: null,
        descripcion: `CARGO BANCO VARIOS ${i}`,
      });
      libros.push({
        id: `l-${i}`,
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: `as-${i}`,
        asientoDetalleId: null,
        fecha,
        importeConSigno: `${((centavos + 77) / 100).toFixed(2)}`,
        numeroOperacion: null,
        glosa: `Asiento distinto ${i}`,
      });
    }
  }

  const t0 = performance.now();
  const res = ejecutarMotorMatching({
    partidasBanco: bancos,
    partidasLibro: libros,
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
  });
  const elapsedMs = performance.now() - t0;

  assert.equal(res.estadisticas.autoConciliados, 2000);
  assert.ok(elapsedMs < 2000, `Rendimiento excedió 2000 ms: ${elapsedMs.toFixed(1)} ms`);
  console.log(`     ⏱️  5,000 líneas procesadas en ${elapsedMs.toFixed(1)} ms`);
});

caso('9. Seguridad y escala: ceros largos ignorados en Capa 1 y banda densa acotada en Capa 2/3', () => {
  const resCeros = ejecutarMotorMatching({
    partidasBanco: [
      {
        id: 'b-ceros-largos',
        fecha: '2026-10-10',
        monto: '-250.00',
        referencia: '00000000',
        descripcion: 'CARGO GENERICO A',
      },
      {
        id: 'b-ceros-neg',
        fecha: '2026-10-10',
        monto: '-350.00',
        referencia: '-00000',
        descripcion: 'CARGO GENERICO B',
      },
    ],
    partidasLibro: [
      {
        id: 'l-ceros-largos',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a-c1',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-250.00',
        numeroOperacion: '00000000',
        glosa: 'Otro concepto distinto',
      },
      {
        id: 'l-ceros-neg',
        origenLibro: 'MOVIMIENTO_TESORERIA',
        asientoId: 'a-c2',
        asientoDetalleId: null,
        fecha: '2026-10-10',
        importeConSigno: '-350.00',
        numeroOperacion: '-00000',
        glosa: 'Concepto diferente sin coincidencia',
      },
    ],
  });

  // No deben hacer match en Capa 1 por referencias de ceros largos
  assert.equal(resCeros.grupos.filter((g) => g.capaMatching === 1).length, 0);

  // Banda densa: 1,500 banco + 1,500 libro con exactamente el mismo monto (-50.00)
  const bancosDensos: PartidaBancoMatching[] = [];
  const librosDensos: PartidaLibroMatching[] = [];
  for (let i = 0; i < 1500; i += 1) {
    bancosDensos.push({
      id: `bd-${i}`,
      fecha: '2026-10-15',
      monto: '-50.00',
      referencia: null,
      descripcion: `MOVIMIENTO DENSO ${i}`,
    });
    librosDensos.push({
      id: `ld-${i}`,
      origenLibro: 'MOVIMIENTO_TESORERIA',
      asientoId: `ad-${i}`,
      asientoDetalleId: null,
      fecha: '2026-10-15',
      importeConSigno: '-50.00',
      numeroOperacion: null,
      glosa: `Asiento denso distinto ${i}`,
    });
  }

  const t0 = performance.now();
  ejecutarMotorMatching({
    partidasBanco: bancosDensos,
    partidasLibro: librosDensos,
    parametros: { toleranciaDias: 3, toleranciaMonto: '0.00' },
  });
  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 2000, `Banda densa excedió 2000 ms: ${elapsedMs.toFixed(1)} ms`);
  console.log(`     ⏱️  3,000 líneas con monto idéntico procesadas en ${elapsedMs.toFixed(1)} ms`);
});

console.log(`\n🎉 Todas las pruebas unitarias de matching pasaron (${pasados}/${pasados}).\n`);
