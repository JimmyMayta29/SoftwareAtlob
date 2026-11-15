const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlobDesktop', {
  esEscritorio: true,
  obtenerEstadoConexion: () => ipcRenderer.invoke('desktop:estado-conexion'),
  verificarConexionAhora: () => ipcRenderer.invoke('desktop:verificar-ahora'),
  reconfigurarServidor: () => ipcRenderer.invoke('desktop:reconfigurar-servidor'),
  suscribirEstadoConexion: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, estado) => callback(estado);
    ipcRenderer.on('desktop:cambio-estado-conexion', listener);
    return () => ipcRenderer.removeListener('desktop:cambio-estado-conexion', listener);
  },
});
