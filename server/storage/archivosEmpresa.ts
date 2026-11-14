import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REGISTRO_ARCHIVOS_EMPRESA } from './registroDatosEmpresa';

export interface ArchivoEmpresaItem {
  carpeta: string;
  nombre: string;
  rutaRelativa: string;
  tamanoBytes: number;
  hashSha256: string;
  buffer: Buffer;
}

export const archivosEmpresaService = {
  /**
   * Obtiene la ruta base del almacenamiento físico de archivos de empresas
   */
  obtenerRutaBase(): string {
    const custom = process.env.EMPRESA_STORAGE_ROOT;
    if (custom) return path.resolve(custom);
    return path.resolve(process.cwd(), 'storage', 'empresas');
  },

  /**
   * Obtiene la ruta de una carpeta de empresa específica
   */
  obtenerRutaCarpeta(empresaId: string, subcarpeta?: string): string {
    const base = path.join(this.obtenerRutaBase(), empresaId);
    if (subcarpeta) {
      return path.join(base, subcarpeta);
    }
    return base;
  },

  /**
   * Inicializa la estructura de directorios según REGISTRO_ARCHIVOS_EMPRESA
   */
  asegurarCarpetas(empresaId: string): void {
    for (const reg of REGISTRO_ARCHIVOS_EMPRESA) {
      const ruta = this.obtenerRutaCarpeta(empresaId, reg.carpeta);
      if (!fs.existsSync(ruta)) {
        fs.mkdirSync(ruta, { recursive: true });
      }
    }
  },

  /**
   * Guarda un archivo físico en la carpeta correspondiente de la empresa
   */
  guardarArchivo(empresaId: string, carpeta: string, nombre: string, contenido: Buffer): string {
    this.asegurarCarpetas(empresaId);
    const rutaCarpeta = this.obtenerRutaCarpeta(empresaId, carpeta);
    const rutaCompleta = path.join(rutaCarpeta, nombre);
    fs.writeFileSync(rutaCompleta, contenido);
    return rutaCompleta;
  },

  /**
   * Lista todos los archivos exportables de una empresa
   */
  listarArchivosExportables(empresaId: string): ArchivoEmpresaItem[] {
    const items: ArchivoEmpresaItem[] = [];
    const baseEmpresa = this.obtenerRutaCarpeta(empresaId);
    if (!fs.existsSync(baseEmpresa)) return items;

    for (const reg of REGISTRO_ARCHIVOS_EMPRESA) {
      if (!reg.exportar) continue; // Excluir temporales y respaldos recursivos
      const rutaCarpeta = path.join(baseEmpresa, reg.carpeta);
      if (!fs.existsSync(rutaCarpeta)) continue;

      const archivos = fs.readdirSync(rutaCarpeta, { withFileTypes: true });
      for (const arch of archivos) {
        if (arch.isFile()) {
          const rutaArchivo = path.join(rutaCarpeta, arch.name);
          const buffer = fs.readFileSync(rutaArchivo);
          const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
          items.push({
            carpeta: reg.carpeta,
            nombre: arch.name,
            rutaRelativa: path.posix.join(reg.carpeta, arch.name),
            tamanoBytes: buffer.length,
            hashSha256: sha256,
            buffer
          });
        }
      }
    }

    return items;
  },

  /**
   * Restaura archivos físicos en la estructura de la empresa
   */
  restaurarArchivos(empresaId: string, archivos: Array<{ carpeta: string; nombre: string; buffer: Buffer }>): number {
    this.asegurarCarpetas(empresaId);
    let count = 0;
    for (const arch of archivos) {
      this.guardarArchivo(empresaId, arch.carpeta, arch.nombre, arch.buffer);
      count++;
    }
    return count;
  },

  /**
   * Limpia los archivos exportables de una empresa antes de restaurar
   */
  limpiarArchivosExportables(empresaId: string): void {
    const baseEmpresa = this.obtenerRutaCarpeta(empresaId);
    if (!fs.existsSync(baseEmpresa)) return;

    for (const reg of REGISTRO_ARCHIVOS_EMPRESA) {
      if (!reg.exportar) continue;
      const rutaCarpeta = path.join(baseEmpresa, reg.carpeta);
      if (fs.existsSync(rutaCarpeta)) {
        const archivos = fs.readdirSync(rutaCarpeta);
        for (const arch of archivos) {
          try {
            fs.unlinkSync(path.join(rutaCarpeta, arch));
          } catch {
            // Ignorar errores de archivo en uso
          }
        }
      }
    }
  }
};

