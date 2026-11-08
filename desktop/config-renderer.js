const form = document.querySelector('#conexion');
const campos = document.querySelector('#campos');
const panelEstado = document.querySelector('#panel-estado');
const estado = document.querySelector('#estado');
const estadoCausa = document.querySelector('#estado-causa');
const estadoAccion = document.querySelector('#estado-accion');
const boton = document.querySelector('#conectar');
const reintentar = document.querySelector('#reintentar');
const restaurarDefecto = document.querySelector('#valores-defecto');
const opcionMigrar = document.querySelector('#opcion-migrar');

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
    panelEstado.classList.remove('error');
    estado.textContent = '';
    estadoCausa.hidden = true;
    estadoAccion.hidden = true;
    return;
  }

  panelEstado.hidden = false;
  panelEstado.classList.toggle('error', Boolean(datos?.esError ?? true));
  estado.textContent = diagnostico?.titulo || texto;

  if (diagnostico?.causa) {
    estadoCausa.textContent = `Causa probable: ${diagnostico.causa}`;
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
  campos.disabled = Boolean(datos.bloqueada);
  boton.disabled = Boolean(datos.bloqueada);
  restaurarDefecto.disabled = Boolean(datos.bloqueada);
  reintentar.disabled = false;
  reintentar.hidden = !datos.guardada;
  mostrarMensaje(datos);
  if (datos.conexion) {
    for (const nombre of ['host', 'puerto', 'base', 'usuario']) {
      if (datos.conexion[nombre]) {
        form.elements.namedItem(nombre).value = datos.conexion[nombre];
      }
    }
  }
  actualizarMigracion();
}

async function intentar(solicitud) {
  campos.disabled = true;
  boton.disabled = true;
  restaurarDefecto.disabled = true;
  reintentar.disabled = true;
  mostrarMensaje({
    esError: false,
    mensaje: 'Verificando el servicio PostgreSQL local y preparando ATLOB ERP…'
  });
  try {
    const respuesta = await solicitud();
    if (respuesta?.ok) return;
    aplicarEstado(respuesta);
  } catch {
    aplicarEstado({
      mensaje: 'No se pudo comprobar la conexión con PostgreSQL.',
      diagnostico: {
        titulo: 'No se pudo comprobar la conexión local',
        causa: 'La ventana no recibió respuesta del verificador interno.',
        accion: 'Verifique que PostgreSQL esté en ejecución en localhost:5432 e inténtelo nuevamente.'
      }
    });
  }
}

form.addEventListener('submit', evento => {
  evento.preventDefault();
  if (!form.elements.namedItem('host').value.trim()) form.elements.namedItem('host').value = 'localhost';
  if (!form.elements.namedItem('puerto').value.trim()) form.elements.namedItem('puerto').value = '5432';
  if (!form.reportValidity()) return;
  const datos = Object.fromEntries(new FormData(form));
  form.elements.namedItem('contrasena').value = '';
  void intentar(() => window.configuracionAtlob.conectar(datos));
});

restaurarDefecto.addEventListener('click', () => {
  form.elements.namedItem('host').value = 'localhost';
  form.elements.namedItem('puerto').value = '5432';
  actualizarMigracion();
});

form.elements.namedItem('base').addEventListener('input', actualizarMigracion);
reintentar.addEventListener('click', () => void intentar(() => window.configuracionAtlob.reintentar()));
window.configuracionAtlob.estado().then(aplicarEstado).catch(() => {
  aplicarEstado({ bloqueada: true, mensaje: 'No se pudo leer el estado inicial de la aplicación.' });
});
