import type { Mensajes } from '@/shared/i18n/tipos';

export default {
  'titulo': 'Bienvenido a Kapital',
  'descripcion': 'Vamos a preparar tu cuenta en unos pasos.',

  'progreso.paso': 'Paso {paso} de {total}',
  'progreso.resumen': 'Resumen',
  'progreso.etiqueta': 'Progreso de la configuración',

  'accion.atras': 'Atrás',
  'accion.siguiente': 'Siguiente',
  'accion.saltar': 'Saltar',
  'accion.empezar': 'Empezar',
  'accion.anadirOtro': 'Añadir otro',
  'accion.quitar': 'Quitar {banco}',

  'idioma.titulo': '¿En qué idioma quieres usar Kapital?',
  'idioma.descripcion': 'Podrás cambiarlo cuando quieras en Configuración.',

  'principal.titulo': '¿Cuál es tu banco principal?',
  'principal.descripcion': 'Será la cuenta por defecto de tus gastos con tarjeta.',
  'principal.error': 'Elige tu banco principal.',

  'saldo.titulo': '¿Cuánto tienes hoy en {banco}?',
  'saldo.descripcion': 'Es tu punto de partida: tu patrimonio empieza a contar desde hoy.',
  'saldo.etiqueta': 'Saldo actual',
  'saldo.ayuda': 'Puedes escribir 1258,50 o 1.258,50. Si no tienes nada, pon 0.',
  'saldo.vacio': 'Escribe el saldo. Si no tienes nada, pon 0.',
  'saldo.invalido': 'Escribe un importe positivo, por ejemplo 1.258,50.',
  'saldo.maximo': 'El importe es demasiado grande.',

  'otros.titulo': '¿Usas otro banco?',
  'otros.descripcion': 'Puedes tener hasta {max} bancos. Si no, sáltate este paso.',
  'otros.saldoEtiqueta': 'Saldo en {banco}',
  'otros.anadidos': 'Bancos que has añadido',
  'otros.limite': 'Ya tienes {max} bancos, que es el máximo.',

  'efectivo.titulo': '¿Cuánto llevas en efectivo?',
  'efectivo.descripcion': 'Si no llevas nada, déjalo en 0.',
  'efectivo.etiqueta': 'Efectivo',

  'resumen.titulo': 'Todo listo',
  'resumen.descripcion': 'Esto es lo que tienes hoy. Hasta que no pulses «Empezar» no se guarda nada.',
  'resumen.principal': 'Principal',
  'resumen.efectivo': 'Efectivo',
  'resumen.patrimonio': 'Patrimonio a {fecha}',

  'error.yaCompletado': 'Ya habías terminado la configuración. Te llevamos a tu inicio.',
  'error.datos': 'Algún dato no es válido. Revisa los saldos y los nombres de los bancos.',
  'error.nombreDuplicado': 'Hay dos cuentas con el mismo nombre. Cambia el nombre de uno de tus bancos.',
  'error.limite': 'Solo puedes tener {max} bancos.',
  'error.sesion': 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  'error.red': 'No hay conexión. Revisa tu red e inténtalo de nuevo.',
  'error.generico': 'No hemos podido guardar tu configuración. Inténtalo de nuevo.',

  'selector.etiqueta': 'Bancos',
  'selector.otro': 'Otro banco',
  'selector.otroTitulo': 'Tu banco',
  'selector.nombre': 'Nombre del banco',
  'selector.color': 'Color',
  'selector.nombreVacio': 'Escribe el nombre del banco.',
  'selector.nombreOcupado': 'Ya tienes una cuenta con ese nombre.',
  'selector.buscar': 'Buscar banco',
  'selector.sinResultados': 'Ningún banco coincide. Si no está, elige «Otro banco».',

  'color.verde': 'Verde',
  'color.azul': 'Azul',
  'color.marino': 'Azul marino',
  'color.rojo': 'Rojo',
  'color.naranja': 'Naranja',
  'color.morado': 'Morado',
  'color.rosa': 'Rosa',
  'color.gris': 'Gris',
} as const satisfies Mensajes;
