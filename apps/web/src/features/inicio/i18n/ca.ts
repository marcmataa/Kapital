import type { Traduccion } from '@/shared/i18n/tipos';
import type es from './es';

export default {
  'titulo': 'Hola',
  'descripcion': 'Aquí tens un resum de les teves finances.',
} satisfies Traduccion<typeof es>;
