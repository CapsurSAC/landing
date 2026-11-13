import { describe, expect, it } from 'vitest';
import { celularInventado, celularValido, correoValido } from './reglas.js';

describe('celular', () => {
  it.each(['951234867', '+51 951 234 867', '951-234-867', '(+51) 951234867', '+51951234867'])(
    'acepta %s',
    (n) => expect(celularValido(n)).toBe(true),
  );

  it.each(['95123486', '951234867123', '851234867', '', 'abc', '+52 951234867', '9512 34 867 1'])(
    'rechaza %s',
    (n) => expect(celularValido(n)).toBe(false),
  );
});

describe('celular inventado', () => {
  it.each([
    '987654321', // escalera hacia abajo
    '912345678', // escalera hacia arriba
    '911111111', // dígito repetido
    '999999999',
    '987987987', // bloque repetido
    '912121212',
    '999888777', // tríos
    '+51 987 654 321', // con prefijo
  ])('detecta %s', (n) => expect(celularInventado(n)).toBe(true));

  it.each(['951234867', '962847315', '978213546', '900111222'])('deja pasar %s', (n) =>
    expect(celularInventado(n)).toBe(false),
  );

  it('no opina sobre lo que no es un celular', () => {
    expect(celularInventado('123')).toBe(false);
  });

  // La regla vieja, escrita a mano antes de reglas.json: el cambio no debe mover ningún resultado.
  const referencia = (valor) => {
    const d = valor.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '');
    if (!/^9\d{8}$/.test(d)) return false;
    const cola = d.slice(1);
    return (
      /(\d)\1{5}/.test(d) ||
      '0123456789'.includes(cola) ||
      '9876543210'.includes(cola) ||
      /^(\d{3})\1\1$/.test(d) ||
      /^9(\d\d)\1{3}$/.test(d) ||
      /^(\d)\1\1(\d)\2\2(\d)\3\3$/.test(d)
    );
  };

  it('coincide con la regla anterior en 200 000 números al azar y en todos los casos especiales', () => {
    const numeros = [];
    for (let i = 0; i < 200_000; i++) {
      numeros.push('9' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'));
    }
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) {
        numeros.push(`9${a}${a}${a}${a}${a}${a}${b}${b}`, `9${a}${b}${a}${b}${a}${b}${a}${b}`);
        numeros.push(`9${a}${b}9${a}${b}9${a}${b}`, `99${a}${a}${a}${b}${b}${b}`.slice(0, 9));
      }
    }
    const distintos = numeros.filter((n) => celularInventado(n) !== referencia(n));
    expect(distintos).toEqual([]);
  });
});

describe('correo', () => {
  it.each(['ana@ejemplo.com', 'a.b@sub.dominio.pe', 'ana+capsur@gmail.com'])('acepta %s', (c) =>
    expect(correoValido(c)).toBe(true),
  );

  it.each(['ana@ejemplo', 'ana@ejemplo.c', 'ana ejemplo@x.com', '@x.com', 'ana@.com', ''])(
    'rechaza %s',
    (c) => expect(correoValido(c)).toBe(false),
  );
});
