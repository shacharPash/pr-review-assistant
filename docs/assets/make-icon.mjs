// Generates the extension icon set: a copper Claude-style radial leaf burst
// with the GitHub Octocat as the focal center, on a TRANSPARENT background.
//
// This is a one-off asset tool, not part of the app build. It needs a
// transparent-capable SVG rasterizer that isn't a project dependency:
//   npm install --no-save @resvg/resvg-js
//   node docs/assets/make-icon.mjs
// Outputs extension/icons/icon-{16,32,48,128,1024}.png.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const C = 512; // center
const OCTOCAT =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

// One petal/leaf pointing straight up from center, given inner & outer radius.
function leaf(inner, outer, width) {
  return `M 0,${-inner} C ${width},${-(inner + (outer - inner) * 0.45)} ${width},${-(outer - 40)} 0,${-outer} C ${-width},${-(outer - 40)} ${-width},${-(inner + (outer - inner) * 0.45)} 0,${-inner} Z`;
}

function ring(count, inner, outer, width, fill, phase = 0) {
  let g = '';
  for (let i = 0; i < count; i++) {
    const angle = phase + (360 / count) * i;
    g += `<path d="${leaf(inner, outer, width)}" fill="${fill}" transform="rotate(${angle})"/>`;
  }
  return `<g transform="translate(${C},${C})">${g}</g>`;
}

const N = 16;
const octScale = 18.8;
const octSize = 24 * octScale; // ~451
const octOffset = C - octSize / 2;
const discR = 358; // solid copper base disc

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="cu" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C - 60}" r="470">
      <stop offset="0.25" stop-color="#F4C49C"/>
      <stop offset="0.62" stop-color="#D98A52"/>
      <stop offset="1" stop-color="#B0633A"/>
    </radialGradient>
    <radialGradient id="cuBack" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C - 60}" r="470">
      <stop offset="0.3" stop-color="#CE824E"/>
      <stop offset="1" stop-color="#8A4A29"/>
    </radialGradient>
    <radialGradient id="disc" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C - 70}" r="430">
      <stop offset="0.2" stop-color="#D9854B"/>
      <stop offset="0.7" stop-color="#B5673A"/>
      <stop offset="1" stop-color="#8F4E2C"/>
    </radialGradient>
  </defs>
  <!-- leafy scalloped edge: back layer (darker, offset) then front layer -->
  ${ring(N, 300, 500, 70, 'url(#cuBack)', 360 / N / 2)}
  ${ring(N, 290, 470, 76, 'url(#cu)', 0)}
  <!-- solid copper medallion, deeper than the leaves so the white Octocat pops -->
  <circle cx="${C}" cy="${C}" r="${discR}" fill="url(#disc)"/>
  <!-- focal Octocat -->
  <g transform="translate(${octOffset},${octOffset}) scale(${octScale})" fill="#F7F1E7">
    <path d="${OCTOCAT}"/>
  </g>
</svg>`;

writeFileSync(new URL('./toolbar-mark.svg', import.meta.url), svg);

const sizes = [16, 32, 48, 128, 1024];
for (const s of sizes) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: s }, background: 'rgba(0,0,0,0)' });
  const png = r.render().asPng();
  const out = new URL(
    s === 1024 ? '../../extension/icons/icon-1024.png' : `../../extension/icons/icon-${s}.png`,
    import.meta.url,
  );
  writeFileSync(out, png);
  console.log('wrote', out.pathname.split('/').slice(-1)[0], `(${s}px)`);
}
