/* Built-in drinks. Strengths are typical label values; every drink can be edited
 * before it goes on the tab. Shared by the page (window.DryDrinks) and the tests.
 */
(function (root) {
  'use strict';

  const GROUPS = [
    { group: 'Brewed in Botswana', items: [
      { id: 'stl',    name: 'St Louis Lager',      short: 'St Louis',     abv: 3.5, ml: 340 },
      { id: 'stlx',   name: 'St Louis Export',     short: 'Export',       abv: 4.7, ml: 340 },
      { id: 'bl',     name: 'Carling Black Label', short: 'Black Label',  abv: 5.5, ml: 750 },
      { id: 'cl',     name: 'Castle Lager',        short: 'Castle',       abv: 5.0, ml: 340 },
      { id: 'clt',    name: 'Castle Lite',         short: 'Castle Lite',  abv: 4.0, ml: 340 },
      { id: 'lion',   name: 'Lion Lager',          short: 'Lion',         abv: 5.0, ml: 340 },
      { id: 'chib',   name: 'Chibuku',             short: 'Chibuku',      abv: 3.5, ml: 1000, note: 'Chibuku keeps fermenting in the carton, so it gets stronger the longer it sits. Adjust the strength if yours is old.' }
    ]},
    { group: 'From across the border', items: [
      { id: 'hsil',   name: 'Heineken Silver',     short: 'Silver',       abv: 4.0, ml: 440, serve: 'can', sizes: [330, 440, 500] },
      { id: 'corona', name: 'Corona Extra',        short: 'Corona',       abv: 4.5, ml: 355, serve: 'bottle' },
      { id: 'wl',     name: 'Windhoek Lager',      short: 'Windhoek',     abv: 4.0, ml: 340 },
      { id: 'wd',     name: 'Windhoek Draught',    short: 'Draught',      abv: 4.0, ml: 440 },
      { id: 'hansa',  name: 'Hansa Pilsener',      short: 'Hansa',        abv: 4.2, ml: 340 },
      { id: 'hein',   name: 'Heineken',            short: 'Heineken',     abv: 5.0, ml: 330 },
      { id: 'sav',    name: 'Savanna Dry',         short: 'Savanna',      abv: 6.0, ml: 330 },
      { id: 'bf',     name: 'Brutal Fruit',        short: 'Brutal Fruit', abv: 4.5, ml: 275, note: 'Strength varies by flavour. Check the label.' }
    ]},
    { group: 'Anything else', items: [
      { id: 'custom', name: 'Something else',      abv: 5.0, ml: 330, custom: true }
    ]}
  ];

  const SIZES = [275, 330, 340, 355, 440, 500, 750, 1000];
  // A favourite is a drink in a size: { id, ml }.
  const DEFAULT_FAVS = [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }];

  const all = () => GROUPS.reduce((a, g) => a.concat(g.items), []);
  const byId = (id) => all().find((d) => d.id === id) || null;
  const byName = (name) => all().find((d) => !d.custom && d.name === name) || null;

  /** The built-in drink a favourite points at, in the favourite's size. Old saves stored bare ids. */
  function favOf(entry) {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    const it = byId(id);
    if (!it || it.custom) return null;
    return Object.assign({}, it, { ml: typeof entry === 'object' && entry.ml > 0 ? entry.ml : it.ml });
  }

  /** Favourites as { id, ml }, with old bare ids given their drink's usual size and unknown ones dropped. */
  const normalizeFavs = (list) => (Array.isArray(list) ? list : []).map(favOf).filter(Boolean).map((d) => ({ id: d.id, ml: d.ml }));

  const api = { GROUPS, SIZES, DEFAULT_FAVS, all, byId, byName, favOf, normalizeFavs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryDrinks = api;
})(typeof self !== 'undefined' ? self : this);
