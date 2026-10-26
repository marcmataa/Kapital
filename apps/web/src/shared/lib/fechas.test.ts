import { describe, expect, it } from 'vitest';
import {
  diasDelMes,
  fechaEnZona,
  finDeMes,
  formatearDiaMes,
  formatearFecha,
  formatearFechaHora,
  formatearMes,
  hoy,
  inicioDeMes,
  mismoDiaMesAnterior,
  partesDe,
  rangoDeMes,
  sumarDias,
  sumarMeses,
} from './fechas';

describe('hoy en Europe/Madrid', () => {
  it('usa el día de Madrid, no el UTC', () => {
    // 22:30 UTC del 17/10 = 00:30 del 18/10 en Madrid (CEST, UTC+2)
    expect(hoy('Europe/Madrid', new Date('2026-10-17T22:30:00Z'))).toBe('2026-10-18');
    // 23:30 UTC del 31/12 = 00:30 del 01/01 en Madrid (CET, UTC+1)
    expect(hoy('Europe/Madrid', new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(hoy('Europe/Madrid', new Date('2026-10-17T21:59:59Z'))).toBe('2026-10-17');
  });
  it('acepta otras zonas', () => {
    expect(fechaEnZona(new Date('2026-10-18T02:00:00Z'), 'America/New_York')).toBe('2026-10-17');
  });
});

describe('meses', () => {
  it('rango del mes', () => {
    expect(rangoDeMes('2026-10-17')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(rangoDeMes('2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(inicioDeMes('2026-09-30')).toBe('2026-09-01');
    expect(finDeMes('2027-02-01')).toBe('2027-02-28');
    expect(diasDelMes(2026, 4)).toBe(30);
  });
  it('sumar meses cruzando años', () => {
    expect(sumarMeses('2026-01-15', -1)).toBe('2025-12-01');
    expect(sumarMeses('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarMeses('2026-10-01', -13)).toBe('2025-09-01');
  });
  it('sección 11 — fin de mes: 31/10 ↔ 30/09 y 29/03/2027 ↔ 28/02/2027', () => {
    expect(mismoDiaMesAnterior('2026-10-31')).toBe('2026-09-30');
    expect(mismoDiaMesAnterior('2027-03-29')).toBe('2027-02-28');
    expect(mismoDiaMesAnterior('2026-10-15')).toBe('2026-09-15');
    expect(mismoDiaMesAnterior('2026-01-31')).toBe('2025-12-31');
  });
  it('sumar días', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('valida el formato', () => {
    expect(() => partesDe('17/10/2026')).toThrow();
    expect(partesDe('2026-10-17')).toEqual({ anio: 2026, mes: 10, dia: 17 });
  });
});

describe('formato por idioma', () => {
  it('fecha corta de día y mes: la misma en cualquier navegador, por idioma', () => {
    expect(formatearDiaMes('2026-10-14', 'es-ES')).toBe('14 oct');
    expect(formatearDiaMes('2026-09-03', 'es-ES')).toBe('3 sept');
    expect(formatearDiaMes('2026-10-14', 'en-GB')).toBe('14 Oct');
    expect(formatearDiaMes('2026-10-14', 'ca-ES')).toBe('14 oct');
    expect(formatearDiaMes('2026-03-01', 'ca-ES')).toBe('1 març');
    expect(formatearDiaMes('2026-08-01', 'ca')).toBe('1 ag');
    expect(() => formatearDiaMes('14/10/2026', 'es-ES')).toThrow();
  });
  it('un día civil no cambia de día con la zona', () => {
    expect(formatearFecha('2026-10-17', 'es-ES', 'corta')).toBe('17/10/2026');
    expect(formatearFecha('2026-10-01', 'es-ES', 'corta')).toBe('01/10/2026');
    expect(formatearFecha('2026-10-17', 'en-GB', 'corta')).toBe('17/10/2026');
    expect(formatearFecha('2026-10-17', 'es-ES')).toMatch(/^17 oct\.? 2026$/);
  });
  it('mes en texto', () => {
    expect(formatearMes('2026-10-01', 'es-ES')).toBe('octubre de 2026');
    expect(formatearMes('2026-10-01', 'en-GB')).toBe('October 2026');
    expect(formatearMes('2026-10-01', 'ca-ES')).toMatch(/octubre/);
  });
  it('timestamp técnico en hora de Madrid', () => {
    expect(formatearFechaHora('2026-10-12T19:30:00Z', 'es-ES')).toMatch(/12 oct\.? 2026.*21:30/);
  });
});
