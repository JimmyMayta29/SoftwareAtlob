import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolverBinarioOpenSSL(): string {
  const candidatos = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
  ].filter((v): v is string => Boolean(v));

  for (const bin of candidatos) {
    try {
      execFileSync(bin, ['version'], { stdio: 'ignore' });
      return bin;
    } catch {
      // Probar siguiente candidato
    }
  }
  throw new Error('OPENSSL_NO_ENCONTRADO: Instale OpenSSL o Git for Windows para generar certificados TLS LAN.');
}

export function detectarIpsLan(): string[] {
  const interfaces = os.networkInterfaces();
  const ips = new Set<string>();
  for (const lista of Object.values(interfaces)) {
    if (!lista) continue;
    for (const item of lista) {
      if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) {
        ips.add(item.address);
      }
    }
  }
  return [...ips];
}

export function generarCertificadosLan(opciones: { dir?: string; ipsExtra?: string[]; force?: boolean } = {}) {
  const openssl = resolverBinarioOpenSSL();
  const certDir = path.resolve(opciones.dir || path.join('storage', 'certs'));
  fs.mkdirSync(certDir, { recursive: true });

  const caKeyPath = path.join(certDir, 'atlob-lan-ca.key');
  const caCertPath = path.join(certDir, 'atlob-lan-ca.crt');
  const serverKeyPath = path.join(certDir, 'atlob-lan.key');
  const serverCsrPath = path.join(certDir, 'atlob-lan.csr');
  const serverCertPath = path.join(certDir, 'atlob-lan.crt');
  const caExtPath = path.join(certDir, 'atlob-ca.ext');
  const serverExtPath = path.join(certDir, 'atlob-server.ext');
  const infoPath = path.join(certDir, 'cert-info.json');

  const ips = new Set<string>(['127.0.0.1', ...detectarIpsLan(), ...(opciones.ipsExtra || [])]);
  const hostname = os.hostname();
  const dnsNames = Array.from(new Set(['localhost', hostname].filter(Boolean)));
  const sanEntries = [
    ...dnsNames.map((d, idx) => `DNS.${idx + 1} = ${d}`),
    ...[...ips].map((ip, idx) => `IP.${idx + 1} = ${ip}`),
  ];

  // 1. Generar Autoridad Certificadora (CA) local si no existe o si se fuerza regeneración
  if (opciones.force || !fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath)) {
    fs.writeFileSync(
      caExtPath,
      [
        '[req]',
        'distinguished_name = req_dn',
        'x509_extensions = v3_ca',
        'prompt = no',
        '',
        '[req_dn]',
        'CN = ATLOB ERP Local CA',
        'O = Estudio Contable Piloto',
        'C = PE',
        '',
        '[v3_ca]',
        'subjectKeyIdentifier = hash',
        'authorityKeyIdentifier = keyid:always,issuer',
        'basicConstraints = critical, CA:true, pathlen:0',
        'keyUsage = critical, digitalSignature, cRLSign, keyCertSign',
      ].join('\n'),
      'utf8'
    );

    execFileSync(openssl, ['genrsa', '-out', caKeyPath, '2048'], { stdio: 'pipe' });
    execFileSync(
      openssl,
      [
        'req',
        '-x509',
        '-new',
        '-nodes',
        '-key',
        caKeyPath,
        '-sha256',
        '-days',
        '3650',
        '-out',
        caCertPath,
        '-config',
        caExtPath,
        '-extensions',
        'v3_ca',
      ],
      { stdio: 'pipe' }
    );
  }

  // 2. Generar clave privada y CSR del servidor LAN
  execFileSync(openssl, ['genrsa', '-out', serverKeyPath, '2048'], { stdio: 'pipe' });
  const ipPrincipal = [...ips].find(ip => ip !== '127.0.0.1') || '127.0.0.1';

  fs.writeFileSync(
    serverExtPath,
    [
      'authorityKeyIdentifier = keyid,issuer',
      'basicConstraints = CA:FALSE',
      'keyUsage = critical, digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment',
      'extendedKeyUsage = serverAuth',
      'subjectAltName = @alt_names',
      '',
      '[alt_names]',
      ...sanEntries,
    ].join('\n'),
    'utf8'
  );

  execFileSync(
    openssl,
    [
      'req',
      '-new',
      '-key',
      serverKeyPath,
      '-out',
      serverCsrPath,
      '-subj',
      `/C=PE/O=ATLOB ERP LAN/CN=${ipPrincipal}`,
    ],
    { stdio: 'pipe' }
  );

  // 3. Firmar certificado del servidor con la CA local (825 días conforme a estándares TLS modernos)
  execFileSync(
    openssl,
    [
      'x509',
      '-req',
      '-in',
      serverCsrPath,
      '-CA',
      caCertPath,
      '-CAkey',
      caKeyPath,
      '-CAcreateserial',
      '-out',
      serverCertPath,
      '-days',
      '825',
      '-sha256',
      '-extfile',
      serverExtPath,
    ],
    { stdio: 'pipe' }
  );

  // 4. Verificar cadena CA -> Servidor
  const verificacion = execFileSync(openssl, ['verify', '-CAfile', caCertPath, serverCertPath], {
    encoding: 'utf8',
  }).trim();

  if (!verificacion.includes(': OK')) {
    throw new Error(`ERROR_VERIFICACION_CERTIFICADO: ${verificacion}`);
  }

  // Limpiar archivos intermedios temporales
  for (const temp of [serverCsrPath, caExtPath, serverExtPath]) {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }

  const certBuffer = fs.readFileSync(serverCertPath);
  const caBuffer = fs.readFileSync(caCertPath);
  const huellaServidor = crypto.createHash('sha256').update(certBuffer).digest('hex');
  const huellaCa = crypto.createHash('sha256').update(caBuffer).digest('hex');

  const resumen = {
    generadoEn: new Date().toISOString(),
    cn: ipPrincipal,
    dns: dnsNames,
    ips: [...ips],
    caCertPath,
    serverCertPath,
    serverKeyPath,
    huellaCaSha256: huellaCa,
    huellaServidorSha256: huellaServidor,
    verificacionOpenSsl: verificacion,
  };
  fs.writeFileSync(infoPath, JSON.stringify(resumen, null, 2), 'utf8');
  return resumen;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ipsExtra: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ip' && args[i + 1]) {
      ipsExtra.push(args[i + 1]);
      i++;
    }
  }
  const res = generarCertificadosLan({ force, ipsExtra });
  console.log('✅ Certificados TLS LAN generados y verificados:');
  console.log(JSON.stringify(res, null, 2));
}
