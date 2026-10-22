import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, CLAVE_IDIOMA } from './I18nProvider';
import { recursos } from './registro';
import { interpolar, traducir } from './traducir';
import { IDIOMAS } from './tipos';
import { useIdioma, useT } from './useT';

const variables = (texto: string) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('registro de textos', () => {
  for (const [ns, porIdioma] of Object.entries(recursos)) {
    it(`${ns}: es/en/ca tienen las mismas claves, sin textos vacíos y con las mismas variables`, () => {
      const claves = Object.keys(porIdioma.es).sort();
      for (const idioma of IDIOMAS) {
        const mensajes: Record<string, string> = porIdioma[idioma];
        expect(Object.keys(mensajes).sort()).toEqual(claves);
        for (const clave of claves) {
          const texto = mensajes[clave] ?? '';
          expect(texto.trim(), `${ns}.${idioma}.${clave}`).not.toBe('');
          expect(variables(texto), `${ns}.${idioma}.${clave}`).toEqual(variables(porIdioma.es[clave as keyof typeof porIdioma.es]));
        }
      }
    });
  }
});

describe('traducir', () => {
  it('interpola variables y deja las que faltan', () => {
    expect(interpolar('Hola {nombre}, {x}', { nombre: 'Ana' })).toBe('Hola Ana, {x}');
    expect(traducir('es', 'common', 'banco.logo', { nombre: 'BBVA' })).toBe('Logo de BBVA');
    expect(traducir('ca', 'common', 'nav.inicio')).toBe('Inici');
    expect(traducir('en', 'common', 'nav.inicio')).toBe('Home');
  });
});

function Muestra() {
  const t = useT('common');
  const { idioma, setIdioma, locale } = useIdioma();
  return (
    <>
      <p>{t('nav.inicio')}</p>
      <p>{locale}</p>
      <button type="button" onClick={() => setIdioma(idioma === 'es' ? 'ca' : 'es')}>
        cambiar
      </button>
    </>
  );
}

describe('I18nProvider', () => {
  it('cambia de idioma, actualiza <html lang> y lo recuerda en el dispositivo', () => {
    render(
      <I18nProvider idioma="es">
        <Muestra />
      </I18nProvider>,
    );
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    act(() => screen.getByRole('button').click());
    expect(screen.getByText('Inici')).toBeInTheDocument();
    expect(screen.getByText('ca-ES')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ca');
    expect(window.localStorage.getItem(CLAVE_IDIOMA)).toBe('ca');
  });

  it('arranca con el idioma guardado', () => {
    window.localStorage.setItem(CLAVE_IDIOMA, 'en');
    render(
      <I18nProvider>
        <Muestra />
      </I18nProvider>,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
