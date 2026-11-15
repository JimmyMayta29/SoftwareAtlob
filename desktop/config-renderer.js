const form = document.querySelector('#conexion');
const campos = document.querySelector('#campos');
const radiosModo = [...document.querySelectorAll('input[name="modoSelector"]')];
const seccionCliente = document.querySelector('#seccion-cliente');
const seccionLocal = document.querySelector('#seccion-local');
const panelEstado = document.querySelector('#panel-estado');
const estado = document.querySelector('#estado');
const estadoCausa = document.querySelector('#estado-causa');
const estadoAccion = document.querySelector('#estado-accion');
const boton = document.querySelector('#conectar');
const verificarServidorBtn = document.querySelector('#verificar-servidor');
const seleccionarCaBtn = document.querySelector('#seleccionar-ca');
const caResumen = document.querySelector('#ca-resumen');
const caHuella = document.querySelector('#ca-huella');
const reintentar = document.querySelector('#reintentar');
const restaurarDefecto = document.querySelector('#valores-defecto');
const opcionMigrar = document.querySelector('#opcion-migrar');

let modoActual = 'cliente';

function modoSeleccionado() {
  return modoActual;
}

function aplicarVisibilidadModo(modo) {
  modoActual = modo === 'local' ? 'local' : 'cliente';
  for (const radio of radiosModo) {
    radio.checked = radio.value === modoActual;
  }
  const esCliente = modoActual === 'cliente';
  seccionCliente.hidden = !esCliente;
  seccionLocal.hidden = esCliente;
  verificarServidorBtn.hidden = !esCliente;
  restaurarDefecto.hidden = esCliente;

  form.elements.namedItem('servidorUrl').required = esCliente;
  for (const campoLocal of ['host', 'puerto', 'base', 'usuario', 'contrasena']) {
    form.elements.namedItem(campoLocal).required = !esCliente;
  }

  boton.textContent = esCliente ? 'Guardar y abrir ATLOB ERP' : 'Conectar y continuar';
}

function mostrarResumenCa(huellaSha256, origenTexto) {
  const tieneCa = Boolean(form.elements.namedItem('caPem').value.trim());
  if (tieneCa) {
    caResumen.textContent = origenTexto
      ? `Certificado CA cargado (${origenTexto}).`
      : 'Certificado CA local cargado correctamente.';
    if (huellaSha256) {
      caHuella.textContent = `Huella X.509 SHA-256: ${huellaSha256}`;
      caHuella.hidden = false;
    } else {
      caHuella.hidden = true;
    }
  } else {
    caResumen.textContent = 'Seleccione el archivo público atlob-lan-ca.crt entregado por la PC principal.';
    caHuella.textContent = '';
    caHuella.hidden = true;
  }
}

function actualizarMigracion() {
  const base = form.elements.namedItem('base').value.trim().toLowerCase();
  opcionMigrar.hidden = base === '' || ['sistema_contable', 'atlob_test'].includes(base);
  if (opcionMigrar.hidden) form.elements.namedItem('migrar').checked = false;
}

function mostrarMensaje(datos) {
  const texto = datos?.mensaje || '';
  const diagnostico = datos?.diagnostico || null;
  if (!texto && !diagnostico) {
    panelEstado.hidden = true;
    panelEstado.classList.remove('error', 'exito');
    estado.textContent = '';
    estadoCausa.hidden = true;
    estadoAccion.hidden = true;
    return;
  }

  panelEstado.hidden = false;
  const esExito = Boolean(datos?.esExito);
  const esError = esExito ? false : Boolean(datos?.esError ?? true);
  panelEstado.classList.toggle('error', esError);
  panelEstado.classList.toggle('exito', esExito);
  estado.textContent = diagnostico?.titulo || texto;

  if (diagnostico?.causa) {
    estadoCausa.textContent = `Detalle: ${diagnostico.causa}`;
    estadoCausa.hidden = false;
  } else {
    estadoCausa.textContent = '';
    estadoCausa.hidden = true;
  }

  if (diagnostico?.accion) {
    estadoAccion.textContent = `Acción sugerida: ${diagnostico.accion}`;
    estadoAccion.hidden = false;
  } else {
    estadoAccion.textContent = '';
    estadoAccion.hidden = true;
  }
}

function aplicarEstado(datos) {
  const bloqueada = Boolean(datos.bloqueada);
  campos.disabled = bloqueada;
  boton.disabled = bloqueada;
  verificarServidorBtn.disabled = bloqueada;
  seleccionarCaBtn.disabled = bloqueada;
  restaurarDefecto.disabled = bloqueada;
  reintentar.disabled = false;
  reintentar.hidden = !datos.guardada;

  if (datos.remoto?.servidorUrl) {
    form.elements.namedItem('servidorUrl').value = datos.remoto.servidorUrl;
  } else if (datos.detectado?.servidorUrl && !form.elements.namedItem('servidorUrl').value) {
    form.elements.namedItem('servidorUrl').value = datos.detectado.servidorUrl;
  }

  if (datos.remoto?.caPem) {
    form.elements.namedItem('caPem').value = datos.remoto.caPem;
    mostrarResumenCa(datos.remoto.huellaSha256, 'configuración guardada');
  } else if (datos.detectado?.caPem && !form.elements.namedItem('caPem').value) {
    form.elements.namedItem('caPem').value = datos.detectado.caPem;
    mostrarResumenCa(datos.detectado.huellaSha256, datos.detectado.origen || 'detectado localmente');
  } else {
    mostrarResumenCa(null, '');
  }

  if (datos.conexion) {
    for (const nombre of ['host', 'puerto', 'base', 'usuario']) {
      if (datos.conexion[nombre]) {
        form.elements.namedItem(nombre).value = datos.conexion[nombre];
      }
    }
  }

  aplicarVisibilidadModo(datos.modo || (datos.conexion ? 'local' : 'cliente'));
  mostrarMensaje(datos);
  actualizarMigracion();
}

function bloquearControles(valor) {
  campos.disabled = valor;
  boton.disabled = valor;
  verificarServidorBtn.disabled = valor;
  seleccionarCaBtn.disabled = valor;
  restaurarDefecto.disabled = valor;
  reintentar.disabled = valor;
}

async function intentar(solicitud, textoProceso) {
  bloquearControles(true);
  mostrarMensaje({
    esError: false,
    mensaje: textoProceso || 'Verificando conectividad segura de ATLOB ERP…',
  });
  try {
    const respuesta = await solicitud();
    if (respuesta?.ok) return;
    aplicarEstado(respuesta);
  } catch {
    aplicarEstado({
      modo: modoSeleccionado(),
      mensaje: 'No se pudo comprobar la conexión con el servidor.',
      diagnostico: {
        titulo: 'No se pudo completar la comprobación',
        causa: 'La ventana no recibió respuesta del verificador interno.',
        accion: 'Verifique los datos ingresados y vuelva a intentarlo.',
      },
    });
  } finally {
    bloquearControles(false);
  }
}

for (const radio of radiosModo) {
  radio.addEventListener('change', () => {
    aplicarVisibilidadModo(radio.value);
    mostrarMensaje(null);
  });
}

seleccionarCaBtn.addEventListener('click', async () => {
  try {
    const res = await window.configuracionAtlob.seleccionarCertificadoCa();
    if (res?.cancelado) return;
    if (res?.ok && res.caPem) {
      form.elements.namedItem('caPem').value = res.caPem;
      mostrarResumenCa(res.huellaSha256, res.archivo || 'archivo seleccionado');
      mostrarMensaje({
        esExito: true,
        mensaje: 'Certificado CA válido cargado.',
        diagnostico: {
          titulo: 'Certificado CA cargado correctamente',
          causa: `Huella X.509 SHA-256: ${res.huellaSha256}`,
          accion: 'Pulse "Comprobar TLS y conexión" o "Guardar y abrir ATLOB ERP".',
        },
      });
    } else if (res?.diagnostico || res?.mensaje) {
      mostrarMensaje(res);
    }
  } catch {
    mostrarMensaje({
      esError: true,
      mensaje: 'No se pudo leer el certificado CA seleccionado.',
    });
  }
});

verificarServidorBtn.addEventListener('click', () => {
  const servidorUrl = form.elements.namedItem('servidorUrl').value.trim();
  const caPem = form.elements.namedItem('caPem').value;
  if (!servidorUrl) {
    form.elements.namedItem('servidorUrl').reportValidity();
    return;
  }
  void intentar(async () => {
    const respuesta = await window.configuracionAtlob.verificarServidor({ servidorUrl, caPem });
    if (respuesta?.ok) {
      return {
        esExito: true,
        modo: 'cliente',
        remoto: respuesta.remoto,
        mensaje: respuesta.mensaje || 'Conexión HTTPS TLS y PostgreSQL central verificados.',
        diagnostico: respuesta.diagnostico,
      };
    }
    return { ...respuesta, modo: 'cliente' };
  }, 'Verificando certificado TLS HTTPS y disponibilidad de PostgreSQL central…');
});

form.addEventListener('submit', evento => {
  evento.preventDefault();
  const modo = modoSeleccionado();
  if (modo === 'local') {
    if (!form.elements.namedItem('host').value.trim()) form.elements.namedItem('host').value = 'localhost';
    if (!form.elements.namedItem('puerto').value.trim()) form.elements.namedItem('puerto').value = '5432';
  }
  if (!form.reportValidity()) return;
  const datos = Object.fromEntries(new FormData(form));
  datos.modo = modo;
  form.elements.namedItem('contrasena').value = '';
  void intentar(
    () => window.configuracionAtlob.conectar(datos),
    modo === 'cliente'
      ? 'Validando servidor HTTPS central y guardando configuración segura…'
      : 'Verificando el servicio PostgreSQL local y preparando ATLOB ERP…'
  );
});

restaurarDefecto.addEventListener('click', () => {
  form.elements.namedItem('host').value = 'localhost';
  form.elements.namedItem('puerto').value = '5432';
  actualizarMigracion();
});

form.elements.namedItem('base').addEventListener('input', actualizarMigracion);
reintentar.addEventListener('click', () => void intentar(
  () => window.configuracionAtlob.reintentar(),
  'Reconectando con la configuración guardada…'
));

window.configuracionAtlob.estado().then(aplicarEstado).catch(() => {
  aplicarEstado({ bloqueada: true, mensaje: 'No se pudo leer el estado inicial de la aplicación.' });
});
