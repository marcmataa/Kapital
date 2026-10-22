import type { Traduccion } from '@/shared/i18n/tipos';
import type es from './es';

export default {
  'titulo': 'Benvingut a Kapital',
  'descripcion': 'Prepararem el teu compte en uns quants passos.',

  'progreso.paso': 'Pas {paso} de {total}',
  'progreso.resumen': 'Resum',
  'progreso.etiqueta': 'Progrés de la configuració',

  'accion.atras': 'Enrere',
  'accion.siguiente': 'Següent',
  'accion.saltar': 'Omet',
  'accion.empezar': 'Comença',
  'accion.anadirOtro': 'Afegeix-ne un altre',
  'accion.quitar': 'Treu {banco}',

  'idioma.titulo': 'En quin idioma vols fer servir Kapital?',
  'idioma.descripcion': 'El podràs canviar quan vulguis a Configuració.',

  'principal.titulo': 'Quin és el teu banc principal?',
  'principal.descripcion': 'Serà el compte per defecte de les teves despeses amb targeta.',
  'principal.error': 'Tria el teu banc principal.',

  'saldo.titulo': 'Quant tens avui a {banco}?',
  'saldo.descripcion': 'És el teu punt de partida: el teu patrimoni comença a comptar des d’avui.',
  'saldo.etiqueta': 'Saldo actual',
  'saldo.ayuda': 'Pots escriure 1258,50 o 1.258,50. Si no tens res, posa 0.',
  'saldo.vacio': 'Escriu el saldo. Si no tens res, posa 0.',
  'saldo.invalido': 'Escriu un import positiu, per exemple 1.258,50.',
  'saldo.maximo': 'L’import és massa gran.',

  'otros.titulo': 'Fas servir un altre banc?',
  'otros.descripcion': 'Pots tenir fins a {max} bancs. Si no, omet aquest pas.',
  'otros.saldoEtiqueta': 'Saldo a {banco}',
  'otros.anadidos': 'Bancs que has afegit',
  'otros.limite': 'Ja tens {max} bancs, que és el màxim.',

  'efectivo.titulo': 'Quant portes en efectiu?',
  'efectivo.descripcion': 'Si no portes res, deixa-ho a 0.',
  'efectivo.etiqueta': 'Efectiu',

  'resumen.titulo': 'Tot a punt',
  'resumen.descripcion': 'Això és el que tens avui. Fins que no premis «Comença» no es desa res.',
  'resumen.principal': 'Principal',
  'resumen.efectivo': 'Efectiu',
  'resumen.patrimonio': 'Patrimoni a {fecha}',

  'error.yaCompletado': 'Ja havies acabat la configuració. Et portem al teu inici.',
  'error.datos': 'Alguna dada no és vàlida. Revisa els saldos i els noms dels bancs.',
  'error.nombreDuplicado': 'Hi ha dos comptes amb el mateix nom. Canvia el nom d’un dels teus bancs.',
  'error.limite': 'Només pots tenir {max} bancs.',
  'error.sesion': 'La teva sessió ha caducat. Torna a iniciar sessió.',
  'error.red': 'No hi ha connexió. Revisa la xarxa i torna-ho a provar.',
  'error.generico': 'No hem pogut desar la configuració. Torna-ho a provar.',

  'selector.etiqueta': 'Bancs',
  'selector.otro': 'Un altre banc',
  'selector.otroTitulo': 'El teu banc',
  'selector.nombre': 'Nom del banc',
  'selector.color': 'Color',
  'selector.nombreVacio': 'Escriu el nom del banc.',
  'selector.nombreOcupado': 'Ja tens un compte amb aquest nom.',

  'color.verde': 'Verd',
  'color.azul': 'Blau',
  'color.marino': 'Blau marí',
  'color.rojo': 'Vermell',
  'color.naranja': 'Taronja',
  'color.morado': 'Lila',
  'color.rosa': 'Rosa',
  'color.gris': 'Gris',
} satisfies Traduccion<typeof es>;
