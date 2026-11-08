export interface FortalezaPasswordUI {
  valida: boolean;
  puntaje: 0 | 1 | 2 | 3 | 4;
  etiqueta: 'Muy corta' | 'Débil' | 'Aceptable' | 'Fuerte' | 'Muy fuerte';
  mensaje?: string;
}

const PATRONES_TRIVIALES_UI = [
  'password',
  'contrasena',
  'contraseña',
  'administrador',
  'admin123',
  'qwerty',
  'asdfgh',
  '123456',
  '234567',
  '345678',
  '456789',
  '654321',
  '987654',
  '000000',
  '111111',
  'abcdef',
  'sistema123',
  'contable123',
  'atloberp'
];

export function evaluarFortalezaPasswordUI(password: string, usuario?: string): FortalezaPasswordUI {
  if (!password) {
    return { valida: false, puntaje: 0, etiqueta: 'Muy corta', mensaje: 'Mínimo 10 caracteres combinando letras y números.' };
  }
  if (password.length < 10) {
    return {
      valida: false,
      puntaje: 0,
      etiqueta: 'Muy corta',
      mensaje: `Faltan ${10 - password.length} caracteres (mínimo 10).`
    };
  }
  if (new TextEncoder().encode(password).length > 72) {
    return {
      valida: false,
      puntaje: 0,
      etiqueta: 'Débil',
      mensaje: 'La contraseña supera la longitud máxima permitida.'
    };
  }

  const minuscula = password.toLowerCase();
  if (PATRONES_TRIVIALES_UI.some(p => minuscula.includes(p))) {
    return {
      valida: false,
      puntaje: 1,
      etiqueta: 'Débil',
      mensaje: 'Evite palabras o secuencias comunes fáciles de adivinar.'
    };
  }
  if (/(.)\1{3,}/.test(password)) {
    return {
      valida: false,
      puntaje: 1,
      etiqueta: 'Débil',
      mensaje: 'Evite repetir el mismo carácter cuatro o más veces seguidas.'
    };
  }
  if (new Set(minuscula).size < 5) {
    return {
      valida: false,
      puntaje: 1,
      etiqueta: 'Débil',
      mensaje: 'Use al menos 5 caracteres distintos.'
    };
  }

  const baseUsuario = (usuario || '').trim().toLowerCase().split('@')[0];
  if (baseUsuario.length >= 4 && minuscula.includes(baseUsuario)) {
    return {
      valida: false,
      puntaje: 1,
      etiqueta: 'Débil',
      mensaje: 'La contraseña no debe incluir su nombre de usuario.'
    };
  }

  const tieneMayus = /[A-ZÁÉÍÓÚÑ]/.test(password);
  const tieneMinus = /[a-záéíóúñ]/.test(password);
  const tieneNumero = /[0-9]/.test(password);
  const tieneSimbolo = /[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]/.test(password);
  const clases = [tieneMayus, tieneMinus, tieneNumero, tieneSimbolo].filter(Boolean).length;

  if (!(tieneMayus || tieneMinus) || !tieneNumero) {
    return {
      valida: false,
      puntaje: 1,
      etiqueta: 'Débil',
      mensaje: 'Incluya letras y al menos un número.'
    };
  }
  if (clases < 3 && password.length < 14) {
    return {
      valida: false,
      puntaje: 1,
      etiqueta: 'Débil',
      mensaje: 'Combine mayúsculas, minúsculas y números (o use 14+ caracteres con números).'
    };
  }

  if (clases === 4 && password.length >= 14) {
    return { valida: true, puntaje: 4, etiqueta: 'Muy fuerte' };
  }
  if (clases >= 4 || password.length >= 13) {
    return { valida: true, puntaje: 3, etiqueta: 'Fuerte' };
  }
  return { valida: true, puntaje: 2, etiqueta: 'Aceptable' };
}

export function validarRucModulo11UI(ruc: string): boolean {
  const clean = ruc.trim();
  if (!/^(10|15|17|20)\d{9}$/.test(clean)) return false;
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(clean[i], 10) * factores[i];
  }
  const residuo = suma % 11;
  let esperado = 11 - residuo;
  if (esperado === 10) esperado = 0;
  else if (esperado === 11) esperado = 1;
  return parseInt(clean[10], 10) === esperado;
}

