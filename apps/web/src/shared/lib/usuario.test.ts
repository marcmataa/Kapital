import { describe, expect, it } from 'vitest';
import { nombreUsuario } from './usuario';

describe('nombreUsuario', () => {
  it('usa given_name como nombre de pila y full_name como completo', () => {
    expect(nombreUsuario({ given_name: 'Lucía', full_name: 'Lucía Prueba Gómez', name: 'Otro' })).toEqual({
      dePila: 'Lucía',
      completo: 'Lucía Prueba Gómez',
    });
  });

  it('solo full_name: el nombre de pila es su primera palabra', () => {
    expect(nombreUsuario({ full_name: 'Pau Ejemplo Ruiz' })).toEqual({ dePila: 'Pau', completo: 'Pau Ejemplo Ruiz' });
  });

  it('solo name: vale como completo y como origen del nombre de pila', () => {
    expect(nombreUsuario({ name: 'Iker Inventado' })).toEqual({ dePila: 'Iker', completo: 'Iker Inventado' });
  });

  it('solo given_name: sirve también como nombre completo', () => {
    expect(nombreUsuario({ given_name: 'Nora' })).toEqual({ dePila: 'Nora', completo: 'Nora' });
  });

  it('sin metadata (email y contraseña) no hay nombre', () => {
    expect(nombreUsuario({})).toEqual({ dePila: null, completo: null });
    expect(nombreUsuario(undefined)).toEqual({ dePila: null, completo: null });
    expect(nombreUsuario(null)).toEqual({ dePila: null, completo: null });
  });

  it('ignora espacios sobrantes y textos vacíos', () => {
    expect(nombreUsuario({ given_name: '   ', full_name: '  Ada   Ficticia  ' })).toEqual({
      dePila: 'Ada',
      completo: 'Ada Ficticia',
    });
    expect(nombreUsuario({ given_name: '', full_name: ' ', name: '\t' })).toEqual({ dePila: null, completo: null });
  });

  it('ignora valores que no son texto', () => {
    expect(nombreUsuario({ given_name: 42, full_name: ['Ana'], name: { x: 1 } })).toEqual({
      dePila: null,
      completo: null,
    });
  });
});
