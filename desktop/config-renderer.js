const form = document.querySelector('#conexion');
const campos = document.querySelector('#campos');
const estado = document.querySelector('#estado');
const boton = document.querySelector('#conectar');
const reintentar = document.querySelector('#reintentar');
const opcionMigrar = document.querySelector('#opcion-migrar');

function actualizarMigracion() {
  const base = form.elements.namedItem('base').value.trim().toLowerCase();
  opcionMigrar.hidden = base === '' || ['sistema_contable', 'atlob_test'].includes(base);
  if (opcionMigrar.hidden) form.elements.namedItem('migrar').checked = false;
}

function aplicarEstado(datos) {
  campos.disabled = datos.bloqueada;
  boton.disabled = datos.bloqueada;
  reintentar.disabled = false;
  reintentar.hidden = !datos.guardada;
  estado.textContent = datos.mensaje || '';
  estado.classList.toggle('error', Boolean(datos.mensaje));
  if (datos.conexion) {
    for (const nombre of ['host', 'puerto', 'base', 'usuario']) {
      form.elements.namedItem(nombre).value = datos.conexion[nombre];
    }
  }
  actualizarMigracion();
}

async function intentar(solicitud) {
  campos.disabled = true;
  boton.disabled = true;
  reintentar.disabled = true;
  estado.textContent = 'Comprobando PostgreSQL y preparando la aplicación…';
  estado.classList.remove('error');
  try {
    const respuesta = await solicitud();
    if (respuesta?.ok) return;
    aplicarEstado(respuesta);
  } catch {
    aplicarEstado({ mensaje: 'No se pudo comprobar la conexión. Vuelve a intentarlo.' });
  }
}

form.addEventListener('submit', evento => {
  evento.preventDefault();
  if (!form.reportValidity()) return;
  const datos = Object.fromEntries(new FormData(form));
  form.elements.namedItem('contrasena').value = '';
  void intentar(() => window.configuracionAtlob.conectar(datos));
});

form.elements.namedItem('base').addEventListener('input', actualizarMigracion);
reintentar.addEventListener('click', () => void intentar(() => window.configuracionAtlob.reintentar()));
window.configuracionAtlob.estado().then(aplicarEstado).catch(() => {
  aplicarEstado({ bloqueada: true, mensaje: 'No se pudo leer el estado de la aplicación.' });
});
