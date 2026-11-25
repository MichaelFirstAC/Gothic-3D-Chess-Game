// The polished top of the pillar, painted as one piece so that nothing on it
// repeats: black marble with smoky, white and gold veins, inlaid with brass and
// pale stone. Soft shade is painted in where the dais and the stands meet it.
import { paintedTexture, seededRandom } from './textures.js';
import { TOP_HALF, TOP_CORNER, DAIS_FOOT } from './pillarShape.js';

const BRASS = '#a8864a';
const PALE = '#7d7268';

export function slabMarble(size = 2048) {
  const random = seededRandom(613);
  const range = (min, max) => min + random() * (max - min);

  return paintedTexture(size, size, (ctx) => {
    // From here on, drawing is in world units: x to the right, z downward.
    const unit = size / (TOP_HALF * 2);
    ctx.setTransform(unit, 0, 0, unit, size / 2, size / 2);
    const everything = () => ctx.fillRect(-TOP_HALF, -TOP_HALF, TOP_HALF * 2, TOP_HALF * 2);

    ctx.fillStyle = '#211c25';
    everything();

    // Clouds of lighter and darker stone, some leaning to plum, some to smoke.
    const cloud = (x, z, radius, colour) => {
      const g = ctx.createRadialGradient(x, z, 0, x, z, radius);
      g.addColorStop(0, colour);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, z - radius, radius * 2, radius * 2);
    };
    for (let i = 0; i < 900; i++) {
      const tone = random();
      const alpha = range(0.04, 0.16);
      const colour = tone < 0.45 ? `rgba(4,3,6,${alpha * 1.6})`
        : tone < 0.75 ? `rgba(104,78,112,${alpha})` : `rgba(128,124,134,${alpha * 0.8})`;
      cloud(range(-7, 7), range(-7, 7), range(0.15, 1) ** 1.5 * 1.5, colour);
    }

    // A vein wanders from a point in a general direction, thinning as it goes,
    // and now and then throws off a finer branch.
    const vein = (x, z, heading, steps, width, colour, alpha, branching) => {
      ctx.strokeStyle = colour;
      let angle = heading;
      for (let step = 0; step < steps; step++) {
        const fade = 1 - step / steps;
        angle += (random() - 0.5) * 0.85 + (heading - angle) * 0.12;
        const length = range(0.07, 0.2);
        const nx = x + Math.cos(angle) * length;
        const nz = z + Math.sin(angle) * length;
        ctx.lineWidth = width * (0.35 + 0.65 * fade) * range(0.6, 1.4);
        // A broad faint pass under a sharp one softens the edges into the stone.
        for (const [spread, strength] of [[5, 0.1], [2.2, 0.22], [1, 1]]) {
          ctx.save();
          ctx.lineWidth *= spread;
          ctx.globalAlpha = alpha * strength * (0.4 + 0.6 * fade);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, z);
          ctx.lineTo(nx, nz);
          ctx.stroke();
          ctx.restore();
        }
        if (branching > 0 && random() < 0.07) {
          vein(nx, nz, angle + (random() < 0.5 ? -1 : 1) * range(0.5, 1.2),
            Math.round(steps * 0.35), width * 0.55, colour, alpha * 0.8, branching - 1);
          ctx.strokeStyle = colour;
        }
        x = nx;
        z = nz;
      }
    };
    // They run mostly along one diagonal, as bedded stone does.
    const across = (count, steps, width, colour, alpha, branching) => {
      for (let i = 0; i < count; i++) {
        const heading = 0.62 + range(-0.35, 0.35) + (random() < 0.18 ? -1.5 : 0);
        vein(range(-7.5, 4), range(-7.5, 5), heading, Math.round(steps * range(0.6, 1.3)), width, colour, alpha, branching);
      }
    };
    across(16, 80, 0.07, '#8d8598', 0.2, 1); // smoke
    across(22, 70, 0.016, '#cfc8d4', 0.36, 2); // white
    across(34, 24, 0.007, '#b9aebf', 0.24, 0); // hairlines
    across(9, 66, 0.02, '#c9a35a', 0.7, 2); // gold

    // ---- inlay ----
    // The outline of the slab, drawn in by `inset`.
    const outline = (inset) => {
      const half = TOP_HALF - inset;
      const corner = TOP_CORNER - inset * Math.SQRT2;
      const cut = corner - half;
      ctx.beginPath();
      [[cut, half], [half, cut], [half, -cut], [cut, -half], [-cut, -half], [-half, -cut], [-half, cut], [-cut, half]]
        .forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
      ctx.closePath();
    };
    const line = (width, colour = BRASS, alpha = 0.95) => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // The border: a band of pale stone between two brass lines.
    outline(0.13);
    line(0.1, PALE, 0.8);
    outline(0.07);
    line(0.025);
    outline(0.195);
    line(0.02);

    // A double line frames the dais.
    for (const [half, width] of [[DAIS_FOOT + 0.14, 0.03], [DAIS_FOOT + 0.22, 0.012]]) {
      ctx.beginPath();
      ctx.rect(-half, -half, half * 2, half * 2);
      line(width);
    }

    // A paler strip each side, where the captured pieces stand, so that the
    // black ones show against it.
    for (const side of [1, -1]) {
      const strip = () => {
        ctx.beginPath();
        [[5.1, -3.65], [5.62, -4.05], [6.12, -3.65], [6.12, 3.65], [5.62, 4.05], [5.1, 3.65]]
          .forEach(([x, z], i) => (i ? ctx.lineTo(side * x, z) : ctx.moveTo(side * x, z)));
        ctx.closePath();
      };
      strip();
      ctx.fillStyle = 'rgba(176,164,160,0.3)';
      ctx.fill();
      line(0.022);
    }

    // A ring under each candle stand.
    for (const x of [-5.7, 5.7]) {
      for (const z of [-5.7, 5.7]) {
        for (const [radius, width] of [[0.535, 0.028], [0.49, 0.01]]) {
          ctx.beginPath();
          ctx.arc(x, z, radius, 0, Math.PI * 2);
          line(width);
        }
      }
    }

    // A quatrefoil at each end, with a long pointed arm to either side.
    for (const end of [1, -1]) {
      const z = end * 5.62;
      const leaf = 0.17;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.arc(Math.cos(a) * leaf, z + Math.sin(a) * leaf, leaf, a - Math.PI * 0.75, a + Math.PI * 0.75);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(118,28,44,0.85)';
      ctx.fill();
      line(0.028);
      ctx.beginPath();
      ctx.arc(0, z, 0.5, 0, Math.PI * 2);
      line(0.018);
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(side * 0.56, z - 0.16);
        ctx.quadraticCurveTo(side * 1.3, z - 0.04, side * 3.3, z);
        ctx.quadraticCurveTo(side * 1.3, z + 0.04, side * 0.56, z + 0.16);
        line(0.018);
        ctx.beginPath();
        ctx.arc(side * 3.46, z, 0.075, 0, Math.PI * 2);
        line(0.018);
      }
    }

    // ---- shade ----
    // Darkness gathers at the foot of the dais and round each stand.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 0.42 * unit;
    ctx.fillStyle = '#000';
    const foot = DAIS_FOOT - 0.03;
    for (let pass = 0; pass < 2; pass++) ctx.fillRect(-foot, -foot, foot * 2, foot * 2);
    ctx.restore();
    for (const x of [-5.7, 5.7]) {
      for (const z of [-5.7, 5.7]) cloud(x, z, 0.85, 'rgba(0,0,0,0.62)');
    }
  });
}
