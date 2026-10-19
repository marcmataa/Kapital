import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderConApp } from '@/test/render';
import { Button } from './Button';

describe('Button', () => {
  it('es type="button" por defecto y dispara onClick', async () => {
    const onClick = vi.fn();
    renderConApp(<Button onClick={onClick}>Guardar</Button>);
    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toHaveAttribute('type', 'button');
    await userEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('respeta type="submit"', () => {
    renderConApp(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });

  it('en carga se desactiva, marca aria-busy y no dispara onClick', async () => {
    const onClick = vi.fn();
    renderConApp(
      <Button cargando onClick={onClick}>
        Guardar
      </Button>,
    );
    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('aplica la variante', () => {
    renderConApp(<Button variante="peligro">Eliminar</Button>);
    expect(screen.getByRole('button', { name: 'Eliminar' }).className).toContain('bg-negativo');
  });
});
