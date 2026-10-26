import type { Traduccion } from '@/shared/i18n/tipos';
import type es from './es';

export default {
  'titulo': 'Welcome to Kapital',
  'descripcion': "Let's set up your account in a few steps.",

  'progreso.paso': 'Step {paso} of {total}',
  'progreso.resumen': 'Summary',
  'progreso.etiqueta': 'Setup progress',

  'accion.atras': 'Back',
  'accion.siguiente': 'Next',
  'accion.saltar': 'Skip',
  'accion.empezar': 'Get started',
  'accion.anadirOtro': 'Add another',
  'accion.quitar': 'Remove {banco}',

  'idioma.titulo': 'Which language do you want to use Kapital in?',
  'idioma.descripcion': 'You can change it any time in Settings.',

  'principal.titulo': 'What is your main bank?',
  'principal.descripcion': 'It will be the default account for your card spending.',
  'principal.error': 'Choose your main bank.',

  'saldo.titulo': 'How much do you have in {banco} today?',
  'saldo.descripcion': 'This is your starting point: your net worth counts from today.',
  'saldo.etiqueta': 'Current balance',
  'saldo.ayuda': 'You can type 1258.50 or 1,258.50. If you have nothing, enter 0.',
  'saldo.vacio': 'Enter the balance. If you have nothing, enter 0.',
  'saldo.invalido': 'Enter a positive amount, for example 1,258.50.',
  'saldo.maximo': 'The amount is too large.',

  'otros.titulo': 'Do you use another bank?',
  'otros.descripcion': 'You can have up to {max} banks. If not, skip this step.',
  'otros.saldoEtiqueta': 'Balance in {banco}',
  'otros.anadidos': 'Banks you have added',
  'otros.limite': 'You already have {max} banks, which is the maximum.',

  'efectivo.titulo': 'How much cash do you have?',
  'efectivo.descripcion': 'If you have none, leave it at 0.',
  'efectivo.etiqueta': 'Cash',

  'resumen.titulo': 'All set',
  'resumen.descripcion': 'This is what you have today. Nothing is saved until you press “Get started”.',
  'resumen.principal': 'Main',
  'resumen.efectivo': 'Cash',
  'resumen.patrimonio': 'Net worth on {fecha}',

  'error.yaCompletado': 'You had already finished the setup. Taking you to your home screen.',
  'error.datos': 'Some data is not valid. Check the balances and bank names.',
  'error.nombreDuplicado': 'Two accounts have the same name. Rename one of your banks.',
  'error.limite': 'You can only have {max} banks.',
  'error.sesion': 'Your session has expired. Please sign in again.',
  'error.red': 'No connection. Check your network and try again.',
  'error.generico': "We couldn't save your setup. Please try again.",

  'selector.etiqueta': 'Banks',
  'selector.otro': 'Other bank',
  'selector.otroTitulo': 'Your bank',
  'selector.nombre': 'Bank name',
  'selector.color': 'Colour',
  'selector.nombreVacio': 'Enter the bank name.',
  'selector.nombreOcupado': 'You already have an account with that name.',
  'selector.buscar': 'Search banks',
  'selector.sinResultados': 'No bank matches. If yours is not listed, choose “Other bank”.',

  'color.verde': 'Green',
  'color.azul': 'Blue',
  'color.marino': 'Navy',
  'color.rojo': 'Red',
  'color.naranja': 'Orange',
  'color.morado': 'Purple',
  'color.rosa': 'Pink',
  'color.gris': 'Grey',
} satisfies Traduccion<typeof es>;
