import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { iniciales } from '@/shared/lib/bancos';
import { renderConApp } from '@/test/render';
import { BankLogo, colorTextoSobre } from './BankLogo';

describe('BankLogo', () => {
  it('entidad del catálogo → SVG local con alt', () => {
    renderConApp(<BankLogo entidad="bbva" nombre="BBVA" />);
    const img = screen.getByRole('img', { name: 'Logo de BBVA' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/bancos/bbva.svg');
  });

  it('si el SVG no carga → iniciales sobre el color', () => {
    renderConApp(<BankLogo entidad="trade_republic" nombre="Trade Republic" color="#111111" />);
    fireEvent.error(screen.getByRole('img', { name: 'Logo de Trade Republic' }));
    const logo = screen.getByRole('img', { name: 'Logo de Trade Republic' });
    expect(logo.tagName).toBe('SPAN');
    expect(logo).toHaveTextContent('TR');
    expect(logo).toHaveStyle({ backgroundColor: '#111111', color: '#ffffff' });
  });

  it('banco «Otro» (entidad null) → iniciales con su color', () => {
    renderConApp(<BankLogo entidad={null} nombre="Caja Rural" color="#ffd60a" />);
    const logo = screen.getByRole('img', { name: 'Logo de Caja Rural' });
    expect(logo).toHaveTextContent('CR');
    expect(logo).toHaveStyle({ backgroundColor: '#ffd60a', color: '#0b1220' });
  });

  it('entidad desconocida o color inválido → respaldo seguro', () => {
    renderConApp(<BankLogo entidad="../../evil" nombre="abanca" color="red;background:url(x)" />);
    const logo = screen.getByRole('img', { name: 'Logo de abanca' });
    expect(logo.tagName).toBe('SPAN');
    expect(logo).toHaveTextContent('AB');
    expect(logo).toHaveStyle({ backgroundColor: '#5fd3a0' });
  });

  it('usa el idioma activo para el texto alternativo', () => {
    renderConApp(<BankLogo entidad="ing" nombre="ING" />, { idioma: 'en' });
    expect(screen.getByRole('img', { name: 'ING logo' })).toBeInTheDocument();
  });
});

describe('iniciales y contraste', () => {
  it('iniciales', () => {
    expect(iniciales('Caja Rural de Navarra')).toBe('CR');
    expect(iniciales('abanca')).toBe('AB');
    expect(iniciales('  ')).toBe('?');
  });
  it('contraste', () => {
    expect(colorTextoSobre('#000000')).toBe('#ffffff');
    expect(colorTextoSobre('#ffffff')).toBe('#0b1220');
  });
});
