const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('configuracionAtlob', {
  estado: () => ipcRenderer.invoke('desktop:estado'),
  conectar: conexion => ipcRenderer.invoke('desktop:conectar', conexion),
  reintentar: () => ipcRenderer.invoke('desktop:reintentar'),
  verificarServidor: datos => ipcRenderer.invoke('desktop:verificar-servidor', datos),
  seleccionarCertificadoCa: () => ipcRenderer.invoke('desktop:seleccionar-ca'),
});
