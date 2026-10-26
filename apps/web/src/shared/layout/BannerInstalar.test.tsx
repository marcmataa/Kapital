import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderConApp } from '@/test/render';
import { BannerInstalar, CLAVE_BANNER_INSTALAR, esSafariIos } from './BannerInstalar';

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function simularNavegador(ua: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
}

/** Evento `beforeinstallprompt` falso con la respuesta del usuario elegida. */
function ofrecerInstalacion(outcome: 'accepted' | 'dismissed') {
  const evento = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(evento, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => {
    window.dispatchEvent(evento);
  });
  return { evento, prompt };
}

afterEach(() => vi.restoreAllMocks());

describe('BannerInstalar', () => {
  it('detecta Safari de iOS (y no Chrome de iOS ni Android)', () => {
    expect(esSafariIos(UA_IPHONE)).toBe(true);
    expect(esSafariIos(UA_IPHONE_CHROME)).toBe(false);
    expect(esSafariIos(UA_ANDROID)).toBe(false);
  });

  it('iOS Safari: explica Compartir → Añadir a pantalla de inicio', () => {
    simularNavegador(UA_IPHONE);
    renderConApp(<BannerInstalar />);
    const banner = screen.getByRole('region', { name: 'Instalar la app' });
    expect(banner).toHaveTextContent('Añade Kapital a la pantalla de inicio');
    expect(banner).toHaveTextContent('toca Compartir');
    expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument();
  });

  it('descartarlo lo recuerda en este dispositivo', async () => {
    simularNavegador(UA_IPHONE);
    const { unmount } = renderConApp(<BannerInstalar />);
    await userEvent.click(screen.getByRole('button', { name: 'No mostrar más' }));
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLAVE_BANNER_INSTALAR)).toBe('1');
    unmount();
    renderConApp(<BannerInstalar />);
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('sin localStorage no rompe: se muestra y se puede cerrar', async () => {
    simularNavegador(UA_IPHONE);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    renderConApp(<BannerInstalar />);
    await userEvent.click(screen.getByRole('button', { name: 'No mostrar más' }));
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('Android: aparece con beforeinstallprompt y «Instalar» abre el diálogo del sistema', async () => {
    simularNavegador(UA_ANDROID);
    renderConApp(<BannerInstalar />);
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
    const { evento, prompt } = ofrecerInstalacion('accepted');
    expect(evento.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLAVE_BANNER_INSTALAR)).toBe('1');
  });

  it('escritorio sin beforeinstallprompt: no se muestra', () => {
    simularNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36');
    renderConApp(<BannerInstalar />);
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('ya instalada (standalone): no se muestra', () => {
    simularNavegador(UA_IPHONE);
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    try {
      renderConApp(<BannerInstalar />);
      expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window.navigator, 'standalone');
    }
  });

  it('está traducido', () => {
    simularNavegador(UA_IPHONE);
    renderConApp(<BannerInstalar />, { idioma: 'ca' });
    expect(screen.getByRole('region', { name: 'Instal·la l’app' })).toHaveTextContent('Afegeix Kapital a la pantalla d’inici');
  });
});
