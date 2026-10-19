import type { Traduccion } from '@/shared/i18n/tipos';
import type es from './es';

export default {
  'titulo': 'Hello',
  'descripcion': "Here's a summary of your finances.",
} satisfies Traduccion<typeof es>;
