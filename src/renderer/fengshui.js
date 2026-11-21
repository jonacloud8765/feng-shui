// The Feng Shui button: a perfect yin-yang or an ink dragon. Click to bring
// the current layout back into balance.

const YINYANG = `<svg viewBox="-50 -50 100 100" aria-hidden="true">
  <defs><radialGradient id="g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e3d6"/></radialGradient></defs>
  <circle r="48" fill="url(#g)"/>
  <path d="M0 -48 A48 48 0 0 1 0 48 A24 24 0 0 1 0 0 A24 24 0 0 0 0 -48 Z" fill="#141414"/>
  <circle cy="-24" r="7" fill="#141414"/>
  <circle cy="24" r="7" fill="#f4efe6"/>
  <circle r="48" fill="none" stroke="#141414" stroke-width="2.2"/>
</svg>`;

// An ink-brush dragon of our own, coiled in a circle and chasing its pearl.
const BODY = ['M60 31 C 44 26, 26 40, 28 60', 'M28 60 C 31 77, 52 83, 66 72', 'M66 72 C 76 64, 74 51, 64 50', 'M64 50 C 57 49, 53 55, 57 60'];
const DRAGON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <pattern id="wave" width="16" height="8" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="#d3ccbd" stroke-width="0.7">
        <circle cx="8" cy="8" r="7"/><circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="2"/>
        <circle cx="0" cy="4" r="7"/><circle cx="16" cy="4" r="7"/>
      </g>
    </pattern>
    <clipPath id="c"><circle cx="50" cy="50" r="47"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="48" fill="#f4efe6"/>
  <rect width="100" height="100" fill="url(#wave)" clip-path="url(#c)" opacity="0.6"/>
  <g fill="none" stroke="#141210" stroke-linecap="round" stroke-linejoin="round">
    <!-- dorsal spines along the outside of the coil -->
    <path d="M49 26 l-2 -6 l4 4 M39 29 l-5 -5 l6 2 M30 38 l-6 -3 l6 -1 M25 50 l-6 0 l5 -3 M27 63 l-5 3 l3 -5 M35 75 l-3 5 l0 -6 M46 80 l0 6 l-2 -5 M58 79 l3 5 l-4 -3 M70 70 l5 3 l-5 0 M74 59 l6 0 l-5 -3" stroke-width="1.6"/>
    <!-- legs with three-toed claws -->
    <path d="M35 40 l9 5 l1 5 M44 45 l4 -1 M45 50 l3 2 M45 50 l-1 3" stroke-width="2.2"/>
    <path d="M56 79 l4 -9 l5 -2 M65 68 l2 -3 M65 68 l3 1 M60 70 l-1 -4" stroke-width="2.2"/>
    <!-- the body, tapering to the tail -->
    <path d="${BODY[0]}" stroke-width="9.5"/>
    <path d="${BODY[1]}" stroke-width="8"/>
    <path d="${BODY[2]}" stroke-width="5.5"/>
    <path d="${BODY[3]}" stroke-width="2.6"/>
    <!-- belly scales -->
    <path d="${BODY[0]} ${BODY[1].replace('M28 60', '')}" stroke="#f4efe6" stroke-width="1.1" stroke-dasharray="1.6 2.6"/>
    <!-- mane and horns -->
    <path d="M60 28 l-8 -6 M58 33 l-8 1 M61 25 l-5 -8" stroke-width="1.8"/>
    <path d="M66 21 C 63 15, 60 12, 56 11 M70 20 C 69 14, 67 10, 64 8" stroke-width="1.6"/>
    <!-- whiskers -->
    <path d="M86 22 C 91 17, 95 18, 94 12 M83 32 C 89 37, 86 43, 91 47" stroke-width="1.1"/>
  </g>
  <!-- head with open jaws -->
  <path d="M57 31 C 59 23, 68 18, 77 19 L 87 21 C 90 22, 90 25, 87 26 L 80 27.5 L 85 30 C 84 33.5, 78 34, 74 33 C 68 36, 61 36, 57 31 Z" fill="#141210"/>
  <circle cx="72" cy="23.5" r="1.7" fill="#f4efe6"/><circle cx="72.4" cy="23.5" r="0.8" fill="#141210"/>
  <!-- the flaming pearl -->
  <circle cx="84" cy="42" r="3.6" fill="#a3221b"/>
  <path d="M80.5 40 c -2 -2 -1 -5 1 -6 M87 40 c 2 -2 2 -5 0 -6.5 M84 38.4 c 0 -2 1 -3 2 -4" fill="none" stroke="#a3221b" stroke-width="1" stroke-linecap="round"/>
  <text x="37" y="63" font-family="Hiragino Mincho ProN, Songti SC, serif" font-size="12" fill="#a3221b" font-weight="700">龍</text>
  <circle cx="50" cy="50" r="47.5" fill="none" stroke="#141210" stroke-width="1.6"/>
</svg>`;

const btn = document.getElementById('b');
const icon = new URLSearchParams(location.search).get('icon') === 'dragon' ? 'dragon' : 'yinyang';
btn.innerHTML = icon === 'dragon' ? DRAGON : YINYANG;
btn.addEventListener('click', () => {
  btn.classList.remove('spin');
  void btn.offsetWidth;
  btn.classList.add('spin');
  window.morrow.fengShui();
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); window.morrow.openSettings(); });
