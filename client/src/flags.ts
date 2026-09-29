// Estandartes de cada pueblo (dibujos originales en SVG, inspirados en la historia):
//   romanos: vexillum rojo con SPQR y el águila · mongoles: estandarte azul del Cielo Eterno con
//   sol y luna y colas de caballo · galos: trisquel dorado sobre verde · germanos: runa Algiz
//   sobre rojo oscuro · vikingos: estandarte del cuervo · visigodos: cruz dorada sobre azul ·
//   ostrogodos: águila dorada sobre púrpura (la de Teodorico).

import type { FactionId } from '../../shared/data.ts';

const POLE = '<rect x="6" y="4" width="3" height="74" rx="1" fill="#5a3d22"/><circle cx="7.5" cy="4" r="3" fill="#d9b35a"/>';

const FLAGS: Record<FactionId, string> = {
  romans: `<rect x="2" y="2" width="60" height="3" rx="1" fill="#5a3d22"/><rect x="30" y="0" width="3" height="80" fill="#5a3d22"/>
    <path d="M22 0 L31.5 -6 L41 0 L36 1 L31.5 -2 L27 1 Z" fill="#e8c35a" transform="translate(0 7)"/>
    <rect x="8" y="5" width="47" height="44" fill="#b3261e"/>
    <path d="M8 49 h47" stroke="#e8c35a" stroke-width="4" stroke-dasharray="2 2"/>
    <rect x="11" y="8" width="41" height="38" fill="none" stroke="#e8c35a" stroke-width="1.5"/>
    <text x="31.5" y="33" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="14" fill="#f3d27a">SPQR</text>`,
  mongols: `${POLE}<path d="M9 8 H58 L50 22 L58 36 H9 Z" fill="#2f6fbf"/>
    <circle cx="30" cy="18" r="5" fill="#f0c14b"/><path d="M24 26 Q30 33 36 26 Q30 30 24 26 Z" fill="#f0c14b"/>
    <path d="M4 10 q-3 10 1 18 M6 10 q0 11 2 19 M9 10 q2 10 1 18" stroke="#f4f4f0" stroke-width="1.6" fill="none"/>`,
  gauls: `${POLE}<rect x="9" y="8" width="46" height="36" fill="#2e6b34"/>
    <rect x="11" y="10" width="42" height="32" fill="none" stroke="#e8c35a" stroke-width="1.2"/>
    <g transform="translate(32 26)" fill="none" stroke="#f0c14b" stroke-width="2.4" stroke-linecap="round">
      <path d="M0 0 C 0 -6 7 -8 9 -3"/><path d="M0 0 C 5 3 4 11 -1 11" transform="rotate(0)"/><path d="M0 0 C -5 3 -11 -1 -8 -6"/>
    </g>`,
  germans: `${POLE}<rect x="9" y="8" width="46" height="36" fill="#6e1f1a"/>
    <path d="M9 8 H55 V44 H9 Z" fill="none" stroke="#1d1d1d" stroke-width="3"/>
    <path d="M32 14 V38 M32 22 L24 14 M32 22 L40 14" stroke="#f0c14b" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  vikings: `${POLE}<path d="M9 8 H56 Q58 30 9 44 Z" fill="#f2efe6"/>
    <path d="M12 42 L9 44 M20 39 L17 44 M28 35 L26 42 M36 30 L35 37" stroke="#c23b2e" stroke-width="2"/>
    <path d="M18 24 C 22 16 30 14 36 17 L44 13 L41 19 C 44 22 42 27 36 28 L30 34 L29 29 C 24 31 20 29 18 24 Z" fill="#1b1b1b"/>
    <circle cx="38" cy="18" r="1" fill="#f2efe6"/>`,
  visigoths: `${POLE}<rect x="9" y="8" width="46" height="36" fill="#1f3f8a"/>
    <rect x="9" y="8" width="46" height="36" fill="none" stroke="#b3261e" stroke-width="3"/>
    <path d="M32 13 L35 22 L44 26 L35 30 L32 39 L29 30 L20 26 L29 22 Z" fill="#f0c14b"/>
    <circle cx="32" cy="26" r="2" fill="#1f3f8a"/>`,
  ostrogoths: `${POLE}<rect x="9" y="8" width="46" height="36" fill="#5b2a7a"/>
    <rect x="11" y="10" width="42" height="32" fill="none" stroke="#f0c14b" stroke-width="1.2"/>
    <path d="M32 16 C 29 16 28 19 30 21 L20 17 L24 25 L18 26 L27 29 L29 37 L32 34 L35 37 L37 29 L46 26 L40 25 L44 17 L34 21 C 36 19 35 16 32 16 Z" fill="#f0c14b"/>`,
};

/** Estandarte del pueblo, como SVG en línea. */
export function flagSvg(f: FactionId): string {
  return `<svg class="flag" viewBox="0 -8 64 90" aria-hidden="true">${FLAGS[f]}</svg>`;
}
