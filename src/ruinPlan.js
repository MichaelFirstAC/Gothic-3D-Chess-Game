// What has fallen. The same plan every time, so that walls, pillars, vaults,
// glass and lamps all agree about it. Pure data.

// Wall bays, named by where they stand ("x,z"). A number is the height, above
// the base level, that the break wanders about; 'gone' leaves only the stubs
// beside its pillars. Bays not listed still stand whole.
export const BAYS = {
  // The east arm, behind the black pieces.
  '16,-20.5': 23, '16,-29.5': 'gone', '16,-38.5': 14, '-16,-38.5': 27,
  // The west arm.
  '-16,20.5': 'gone', '-16,29.5': 18, '16,29.5': 25, '16,38.5': 'gone',
  // The two transepts.
  '-20.5,-16': 20, '-29.5,-16': 'gone', '20.5,16': 'gone', '29.5,16': 24, '20.5,-16': 28,
};

// Pillars snapped off, by "x,z": the height the break wanders about.
export const PIERS = {
  '16,-25': 24, '16,-34': 13, '-16,25': 17, '-16,16': 26, '-34,-16': 14, '25,16': 19, '16,43': 22,
};

export const keyOf = (x, z) => `${x},${z}`;
export const bayState = ({ x, z }) => BAYS[keyOf(x, z)];
export const pierState = ({ x, z }) => PIERS[keyOf(x, z)];

// Vaults still whole, by "x,z" of their middle. All the others have fallen but
// for the ribs springing from the walls.
export const WHOLE_VAULTS = new Set(['0,-47.5', '0,47.5']);
