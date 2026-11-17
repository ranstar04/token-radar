// Token Radar's dashboard (radar-3). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail drawer with the model's own inputs,
// the live-token view and the method section — including the leave-one-out backtest and the farm
// economics. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, verdict: 'all', watchOnly: false, growingOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  function fmtNet(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+' : '-') + '$' + Math.round(Math.abs(n));
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // The multiple through the same hierarchy main.ts uses: the category's own median, shrunk toward
  // its family median; a thin category uses its family median, shrunk toward the snapshot-wide
  // median; a category with no family uses the snapshot-wide median. The family a category belongs
  // to comes from DATA.families, so the page needs no hard-coded map.
  function multipleOf(row) {
    var m = DATA.model;
    var cat = row.category || 'Other';
    var catEntry = null;
    DATA.multiples.forEach(function (c) { if (c.category === cat) catEntry = c; });
    if (catEntry) {
      var famEntry = null;
      DATA.families.forEach(function (f) { if (f.categories && f.categories.indexOf(cat) >= 0) famEntry = f; });
      var parent = famEntry ? famEntry.multiple : DATA.global_multiple;
      var w = catEntry.comparables / (catEntry.comparables + m.shrink_k);
      return round4(w * catEntry.multiple + (1 - w) * parent);
    }
    var fam2 = null;
    DATA.families.forEach(function (f) { if (f.categories && f.categories.indexOf(cat) >= 0) fam2 = f; });
    if (fam2) {
      var w2 = fam2.comparables / (fam2.comparables + m.shrink_k);
      return round4(w2 * fam2.multiple + (1 - w2) * DATA.global_multiple);
    }
    return DATA.global_multiple;
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function multipliersOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * (growth >= 0 ? m.growth_weight : m.growth_negative_weight);
    var age = row.age_days === null || row.age_days === undefined ? null : row.age_days;
    var maturity;
    if (age === null) maturity = m.unknown_age_multiplier;
    else if (age <= m.maturity_days) maturity = m.maturity_floor + m.maturity_range * (age / m.maturity_days);
    else maturity = m.maturity_floor + m.maturity_range - m.maturity_decline * (Math.min(age - m.maturity_days, m.maturity_decline_days) / m.maturity_decline_days);
    var breadth = 1 + m.breadth_per_chain * Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_max_chains);
    return { growth: growth, growthMult: growthMult, maturity: maturity, breadth: breadth };
  }
  function impliedOf(row) {
    var mult = multipliersOf(row);
    return Math.max(1, Math.round(row.tvl_usd * multipleOf(row) * mult.growthMult * mult.maturity * mult.breadth));
  }
  function rangeOf(row) {
    var mult = multipliersOf(row);
    var lo = Math.max(1, Math.round(row.tvl_usd * row.multiple_lo * mult.growthMult * mult.maturity * mult.breadth));
    var hi = Math.max(1, Math.round(row.tvl_usd * row.multiple_hi * mult.growthMult * mult.maturity * mult.breadth));
    return { lo: lo, hi: hi };
  }
  function farmersFor(tvl) {
    if (tvl >= 1e9) return 100000;
    if (tvl >= 1e8) return 40000;
    return 10000;
  }
  // The farm economics, recomputed from the row: a 2% airdrop pool split among a rough farmer count,
  // discounted by confidence, against setup gas, $2 a week for the hold and the hours at $10 an hour.
  function econOf(row) {
    var m = DATA.model;
    var implied = impliedOf(row);
    var weeks = Math.ceil(row.hold_days / 7);
    var gas = (row.capital_usd >= 150 ? m.gas_setup_high : m.gas_setup_low) + m.gas_weekly * weeks;
    var hours = round2(0.25 + 0.17 * weeks + 0.17);
    var ev = round2((implied * m.airdrop_pool_share * row.confidence) / farmersFor(row.tvl_usd));
    var fee = gas + round2(hours * m.time_value_per_hour);
    var net = round2(ev - fee);
    var verdict = net >= m.verdict_farm_min ? 'FARM' : net <= m.verdict_skip_max ? 'SKIP' : 'THIN';
    return { ev: ev, fee: fee, hours: hours, net: net, verdict: verdict };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age,
  // growth and the model's own verdict decide the action, the capital, the hold and every cost and
  // time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the deposit earning for the full hold.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main vault on " + chain + ' and let the yield compound.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then put the bridged funds to work in its app.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of the liquid staking token through ' + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('staking') >= 0 || c.indexOf('liquid staking') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one market position on ' + name + ', then leave the market to settle.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it through the month.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the account funded.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('cede') >= 0 || c.indexOf('central') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the balance earning.';
    if (c.indexOf('chain') >= 0 || c.indexOf('infrastructure') >= 0) return 'Bridge $' + capital + ' of USDC to the chain ' + name + ' serves and use it in one app there.';
    if (c.indexOf('govern') >= 0) return 'Deposit $' + capital + " into " + name + "'s vault on " + chain + ' and vote in one governance round.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply top-up, a borrow, or a repay';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'a swap, a liquidity rebalance, or a fee claim';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'a small bridge, or a swap on the destination chain';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'a stake top-up, or a reward claim';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'a small trade, or a funding-fee claim';
    if (c.indexOf('yield') >= 0) return 'a vault deposit, or a reward harvest';
    if (c.indexOf('govern') >= 0) return 'a vote, or a proposal comment';
    return 'a deposit, a swap, or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = p.capital_usd !== undefined ? p.capital_usd : capitalFor(p);
    var hold = p.hold_days !== undefined ? p.hold_days : holdDaysFor(p.age_days);
    var fee = p.fee_usd !== undefined ? p.fee_usd : 18;
    var net = p.net_usd !== undefined ? p.net_usd : 0;
    var verdict = p.verdict || 'THIN';
    var growthPct = p.change_7d === null || p.change_7d === undefined ? 0 : Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, p.change_7d));
    var weekly = weeklyActionFor(p);
    var action = actionFor(p, capital, chain);
    if (p.multiple_source === 'family') {
      action += ' The comparables for this category are thin (no direct category price; the value is priced from the ' + p.multiple_level + ' family, ' + p.comparables + ' live tokens), so treat the implied value as a rough range \u2014 the P10\u2013P90 range on this row is the honest one.';
    } else if (p.multiple_source === 'global') {
      action += ' There are no direct comparables for this category at all (the value is priced from the snapshot-wide median), so treat the implied value as a rough range \u2014 the P10\u2013P90 range on this row is the honest one.';
    }
    var steps = [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about $' + fee + ' of fees and time in total', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      {
        text: growthPct < 0
          ? 'Do one small qualifying action each week, such as ' + weekly + ', and stop there: while TVL is falling, do not add capital \u2014 a shrinking protocol pays its airdrop to the few who stayed, not to the most recent depositors.'
          : growthPct > 10
            ? 'Do one qualifying action each week, such as ' + weekly + ', and add a small top-up while growth holds above 10%: rising TVL is the model\u2019s strongest signal that the launch will be worth farming.'
            : 'Do one qualifying action each week, such as ' + weekly + ', so the wallet stays active.',
        cost: 'about $2 of gas a week', time: '10 minutes a week'
      }
    ];
    if ((p.chains || []).length > 3) {
      steps.push({ text: 'Bridge $' + Math.round(capital / 2) + ' of USDC to each of the other ' + (p.chains.length - 1) + ' chains the protocol runs on, so the position is live on every chain before the snapshot \u2014 some launches weight multi-chain users.', cost: '$' + Math.round(capital / 2) + ' of USDC per chain, plus bridge gas', time: '20 minutes' });
    }
    steps.push(
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      {
        text: verdict === 'FARM'
          ? 'Write the wallet, the dates and every transaction in a farm log, then farm on schedule: at an expected net of about ' + fmtNet(net) + ' the row clears its costs with room to spare.'
          : verdict === 'THIN'
            ? 'Write the wallet, the dates and every transaction in a farm log, then deploy only half the capital first: at an expected net of about ' + fmtNet(net) + ' the row barely clears its costs, so keep the rest back until the next snapshot still shows growth.'
            : 'Do not deploy capital now: at an expected net of about ' + fmtNet(net) + ' this row does not clear its costs. Write the row in the log and re-check the board in 30 days \u2014 the value only moves if TVL, growth or the comparables move.',
        cost: 'nothing but the log', time: '5 minutes'
      }
    );
    return steps.map(stepText);
  }

  var watchSet = new Set(DATA.watchlist || []);

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatch(r) { return watchSet ? watchSet.has(r.slug) : false; }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.watchOnly && !isWatch(r)) return false;
      if (state.growingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'net') { av = a.net_usd; bv = b.net_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function openDetail(slug) { state.selected = slug; writeHash(); render(); }
  function closeDetail() { state.selected = null; writeHash(); render(); }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    var bt = DATA.backtest;
    return el('div', { class: 'wrap' },
      el('section', { class: 'lede' },
        el('h1', null, DATA.watchlist_size + ' watchlist protocols, ranked by ', el('em', { text: 'implied value' })),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, found by the same rule. Implied value is this radar\u2019s own model, not a promise: it prices each protocol the way its category trades today. The model was backtested against the snapshot\u2019s own traded tokens, and every row carries a farm verdict \u2014 FARM, THIN or SKIP by expected net dollars after gas and time.' }),
        el('div', { class: 'facts' },
          el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug is ranked' })),
          el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' of them below the floor' })),
          el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('small', { text: top ? top.name : '' })),
          el('div', { class: 'fact' }, el('span', { text: 'Backtest median miss' }), el('b', { text: bt ? 'x' + bt.median_miss : 'n/a' }), el('small', { text: bt ? bt.within_3x_pct + '% of traded tokens within 3x' : '' }))
        )
      ),
      controls(),
      state.tab === 'pre-token' ? boardPanel() : livePanel(),
      methodBox(),
      el('p', { class: 'note' }, el('b', { text: 'Read this before you farm. ' }), 'A protocol on this board records no token in the snapshot; that is not proof it has none. Implied value is the entry\u2019s own claim from the snapshot\u2019s figures, never a prediction that a token is issued, when it is issued, or what it will trade at. Farming costs real money and a token may never come. Never pay anyone to claim an airdrop. Source: the sealed snapshot, fetched from the DefiLlama protocol index on ' + DATA.as_of + '.')
    );
  }

  // The backtest scatter: log10 TVL against log10 market cap for every traded token, with the
  // log-log fit and the y=x line (a perfect price) for reference. Built as an SVG string so the
  // markup parses as real SVG.
  function scatterSvg() {
    var bt = DATA.backtest;
    if (!bt || !bt.points || bt.points.length < 10) return '';
    var pts = bt.points;
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var minX = Math.floor(Math.min.apply(null, xs));
    var maxX = Math.ceil(Math.max.apply(null, xs));
    var minY = Math.floor(Math.min.apply(null, ys));
    var maxY = Math.ceil(Math.max.apply(null, ys));
    var W = 560, H = 280, padL = 46, padB = 30, padT = 12, padR = 12;
    var pw = W - padL - padR, ph = H - padT - padB;
    function sx(x) { return padL + ((x - minX) / (maxX - minX)) * pw; }
    function sy(y) { return padT + ph - ((y - minY) / (maxY - minY)) * ph; }
    var s = '';
    s += '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Backtest scatter: log market cap against log TVL">';
    s += '<defs><clipPath id="plot"><rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>';
    var gx;
    for (gx = minX; gx <= maxX; gx++) {
      s += '<line x1="' + sx(gx).toFixed(1) + '" y1="' + padT + '" x2="' + sx(gx).toFixed(1) + '" y2="' + (padT + ph) + '" stroke="#1e2c47" stroke-width="1"/>';
      s += '<text x="' + sx(gx).toFixed(1) + '" y="' + (padT + ph + 16) + '" fill="#64748b" font-size="10" text-anchor="middle">' + gx + '</text>';
    }
    var gy;
    for (gy = minY; gy <= maxY; gy++) {
      s += '<line x1="' + padL + '" y1="' + sy(gy).toFixed(1) + '" x2="' + (padL + pw) + '" y2="' + sy(gy).toFixed(1) + '" stroke="#1e2c47" stroke-width="1"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (sy(gy).toFixed(1) + 3) + '" fill="#64748b" font-size="10" text-anchor="end">' + gy + '</text>';
    }
    s += '<g clip-path="url(#plot)">';
    var x1 = Math.max(minX, minY), x2 = Math.min(maxX, maxY);
    s += '<line x1="' + sx(x1).toFixed(1) + '" y1="' + sy(x1).toFixed(1) + '" x2="' + sx(x2).toFixed(1) + '" y2="' + sy(x2).toFixed(1) + '" stroke="#64748b" stroke-width="1" stroke-dasharray="4 4"/>';
    var fx1 = minX, fy1 = bt.fit_slope * fx1 + bt.fit_intercept;
    var fx2 = maxX, fy2 = bt.fit_slope * fx2 + bt.fit_intercept;
    s += '<line x1="' + sx(fx1).toFixed(1) + '" y1="' + sy(fy1).toFixed(1) + '" x2="' + sx(fx2).toFixed(1) + '" y2="' + sy(fy2).toFixed(1) + '" stroke="#34d399" stroke-width="2"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + sx(p[0]).toFixed(1) + '" cy="' + sy(p[1]).toFixed(1) + '" r="2.2" fill="#22d3ee" opacity="0.65"/>';
    });
    s += '</g>';
    s += '<text x="' + (padL + pw / 2) + '" y="' + (H - 6) + '" fill="#8ea0bf" font-size="11" text-anchor="middle">log10 TVL (USD)</text>';
    s += '<text x="12" y="' + (padT + ph / 2) + '" fill="#8ea0bf" font-size="11" text-anchor="middle" transform="rotate(-90 12 ' + (padT + ph / 2) + ')">log10 market cap (USD)</text>';
    s += '</svg>';
    return s;
  }

  function methodBox() {
    var m = DATA.model;
    var bt = DATA.backtest;
    var topMults = DATA.multiples.slice(0, 12);
    var counts = { category: 0, family: 0, global: 0 };
    var verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) {
      if (counts[r.multiple_source] !== undefined) counts[r.multiple_source]++;
      if (verdicts[r.verdict] !== undefined) verdicts[r.verdict]++;
    });
    return el('details', { class: 'method', open: 'open' },
      el('summary', null, 'How the value is scored \u2014 and how it was tested', el('span', { class: 'tag', text: 'the formula, the backtest and the farm economics' })),
      el('div', { class: 'body' },
        el('p', null, 'Implied value = TVL \u00d7 multiple \u00d7 growth \u00d7 maturity \u00d7 breadth. The multiple is hierarchical: a category with at least ' + m.min_comparables + ' traded comparables uses its own median market-cap-to-TVL ratio, shrunk toward its family median with weight n / (n + ' + m.shrink_k + '); a thin category uses its family median, shrunk the same way toward the snapshot-wide median ' + fmtMult(DATA.global_multiple) + '; a category with no family uses the snapshot-wide median directly. Each ratio is clamped to ' + m.multiple_floor + '\u2013' + m.multiple_cap + '. On this board ' + counts.category + ' rows are priced from their own category, ' + counts.family + ' from their family and ' + counts.global + ' from the snapshot-wide median. Growth clamps the 7-day TVL change to ' + m.growth_floor + '%\u2026+' + m.growth_cap + '% and weighs it ' + m.growth_weight + ' when positive and ' + m.growth_negative_weight + ' when negative \u2014 a fall hurts twice as much as a rise helps. Maturity runs ' + m.maturity_floor + '\u2013' + (m.maturity_floor + m.maturity_range) + ' over ' + m.maturity_days + ' days listed with no token, then declines back toward ' + (m.maturity_floor + m.maturity_range - m.maturity_decline) + ' \u2014 waiting two years earns the peak, waiting longer does not (unknown age: ' + fmtMult(m.unknown_age_multiplier) + '). Breadth adds ' + (m.breadth_per_chain * 100) + '% per extra chain, up to ' + m.breadth_max_chains + '.'),
        el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Multiple' }), el('th', { class: 'num', text: 'Comparables' }))),
          el('tbody', null, topMults.map(function (c) {
            return el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: fmtMult(c.multiple) }), el('td', { class: 'num', text: String(c.comparables) }));
          }))
        ),
        el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Family' }), el('th', { class: 'num', text: 'Multiple' }), el('th', { class: 'num', text: 'Comparables' }))),
          el('tbody', null, DATA.families.map(function (f) {
            return el('tr', null, el('td', { text: f.family + ' (' + f.categories.join(', ') + ')' }), el('td', { class: 'num', text: fmtMult(f.multiple) }), el('td', { class: 'num', text: String(f.comparables) }));
          }))
        ),
        el('h3', { text: 'Backtest: the model priced the tokens that already trade' }),
        el('p', null, 'Leave-one-out over ' + bt.n + ' traded tokens: each token was priced by the same formula with itself removed from the comparables, then compared with its real market cap. The median miss is \u00d7' + bt.median_miss + ' \u2014 the typical token lands about that far from its real cap in either direction \u2014 and ' + bt.within_3x_pct + '% land within 3\u00d7 (' + bt.within_2x_pct + '% within 2\u00d7). A flat baseline that prices every token off the single global median misses by \u00d7' + bt.flat_median_miss + ' with ' + bt.flat_within_3x_pct + '% within 3\u00d7, so the hierarchy and the multipliers buy a real improvement, not a cosmetic one. The chart below plots every traded token: log market cap against log TVL, with the log-log fit (green, slope ' + bt.fit_slope + ') and the y = x line a perfect price would follow (dashed). The model gets the order of magnitude right for about a third of tokens; it does not pretend to price any single launch precisely \u2014 that is what the P10\u2013P90 range on each row is for.'),
        el('div', { class: 'scatter', html: scatterSvg() }),
        el('p', { class: 'scatter-note', text: 'Each dot is one traded token from the same snapshot. The green line is the best log-log fit; the dashed line is a perfect price.' }),
        el('h3', { text: 'Farm economics: what a row is worth after gas and time' }),
        el('p', null, 'A launch is assumed to airdrop ' + (m.airdrop_pool_share * 100) + '% of the implied value, split among a rough farmer count by TVL tier (100,000 farmers at $1B+, 40,000 at $100M+, 10,000 below), then discounted by the row\u2019s confidence \u2014 how sure the price is, from the level and the count of comparables. Costs are setup gas ($' + m.gas_setup_high + ' for large positions, $' + m.gas_setup_low + ' for small ones) plus $' + m.gas_weekly + ' a week for the hold, and the hours spent are valued at $' + m.time_value_per_hour + ' an hour. Net \u2265 +$' + m.verdict_farm_min + ' is FARM, \u2264 \u2212$' + Math.abs(m.verdict_skip_max) + ' is SKIP, anything between is THIN. On this board that is ' + verdicts.FARM + ' FARM, ' + verdicts.THIN + ' THIN and ' + verdicts.SKIP + ' SKIP \u2014 most rows do not clear their costs, and the board says so instead of hiding it. The assumptions are stated so any reader can re-price them.'),
        el('p', null, 'Every row\u2019s detail view shows its own multiple, its source and comparables, its confidence, its P10\u2013P90 range and its farm economics, so any number on this board can be checked against the formula above.')
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var verdict = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      el('option', { value: 'FARM', text: 'FARM only' }),
      el('option', { value: 'THIN', text: 'THIN only' }),
      el('option', { value: 'SKIP', text: 'SKIP only' })
    );
    verdict.value = state.verdict;
    verdict.addEventListener('change', function () { state.verdict = verdict.value; writeHash(); render(); });
    var tvl = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '100000000', text: 'TVL $100M+' }),
      el('option', { value: '500000000', text: 'TVL $500M+' }),
      el('option', { value: '1000000000', text: 'TVL $1B+' })
    );
    tvl.value = String(state.minTvl);
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watchonly', checked: state.watchOnly ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; render(); });
    var growBox = el('input', { type: 'checkbox', id: 'growing', checked: state.growingOnly ? 'checked' : null });
    growBox.addEventListener('change', function () { state.growingOnly = growBox.checked; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdict),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), tvl),
      el('div', { class: 'checks' },
        el('label', null, watchBox, 'Watchlist only'),
        el('label', null, growBox, 'Growing (7d > 0)')
      ),
      el('div', { class: 'tabs' }, pre, live),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, numeric) {
    return el('th', { scope: 'col', class: numeric ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function verdictBadge(v) {
    return el('span', { class: 'verdict verdict-' + v.toLowerCase(), text: v });
  }

  function boardPanel() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.minTvl = 0; state.watchOnly = false; state.growingOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var range = rangeOf(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          isWatch(r) ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(range.lo) + '\u2013' + fmtUsd(range.hi) }),
        el('td', { class: 'num' }, verdictBadge(r.verdict), el('span', { text: ' ' + fmtNet(r.net_usd) })),
        el('td', { class: 'num' }, el('span', { class: 'bar', style: 'width:' + Math.max(2, Math.round(90 * r.implied_value_usd / max)) + 'px' }), el('b', { text: fmtUsd(r.implied_value_usd) }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('table', { class: 'board' },
        el('thead', null, el('tr', null,
          sortHeader('implied', '#', true),
          sortHeader('name', 'Protocol', false),
          sortHeader('tvl', 'TVL', true),
          sortHeader('growth', '7d', true),
          sortHeader('age', 'Age', true),
          sortHeader('implied', 'Range (P10\u2013P90)', true),
          sortHeader('net', 'Net', true),
          sortHeader('implied', 'Implied value', true)
        )),
        tbody
      )
    );
  }

  function livePanel() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = r.mcap_usd !== null && r.tvl_usd > 0 ? r.mcap_usd / r.tvl_usd : null;
      tbody.appendChild(el('tr', { tabindex: '0' },
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: r.mcap_usd === null ? 'n/a' : fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio === null ? 'n/a' : fmtMult(ratio) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) })
      ));
    });
    return el('div', null,
      el('p', { class: 'note', text: 'These protocols already trade. Their market caps are the comparables the pre-token board is priced from \u2014 a lending protocol is priced like lending protocols trade, a bridge like bridges trade.' }),
      el('div', { class: 'panel' },
        el('table', { class: 'board' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' })
          )),
          tbody
        )
      )
    );
  }

  function detailDrawer() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var m = DATA.model;
    var mult = multipliersOf(row);
    var recomputed = multipleOf(row);
    var base = row.tvl_usd * recomputed;
    var check = impliedOf(row);
    var range = rangeOf(row);
    var econ = econOf(row);
    var steps = farmSteps(row);
    var chainText = (row.chains || []).length ? row.chains.join(', ') : 'an unnamed chain';
    var sourceLabel = row.multiple_source === 'category'
      ? (row.category || 'Other') + ' multiple'
      : row.multiple_source === 'family'
        ? row.multiple_level + ' family multiple'
        : 'snapshot-wide multiple';
    return el('aside', { class: 'drawer', role: 'dialog', 'aria-label': row.name },
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail }),
      el('h2', { text: row.name }),
      el('div', { class: 'sub', text: '#' + row.rank + ' \u00b7 ' + (row.category || 'Other') + ' \u00b7 ' + chainText + (isWatch(row) ? ' \u00b7 on the watchlist' : '') }),
      el('dl', { class: 'kv' },
        el('dt', { text: 'TVL' }), el('dd', { text: fmtUsd(row.tvl_usd) }),
        el('dt', { text: 'TVL change, 7d' }), el('dd', { text: row.change_7d === null ? 'n/a' : fmtPct(row.change_7d) }),
        el('dt', { text: 'Listed since' }), el('dd', { text: (row.listed_at || 'unknown') + ' (' + fmtAge(row.age_days) + ')' }),
        el('dt', { text: 'Token on record' }), el('dd', { text: 'none recorded' }),
        el('dt', { text: 'Farm verdict' }), el('dd', null, verdictBadge(row.verdict))
      ),
      el('div', { class: 'modelbox' },
        el('h3', { text: 'How the implied value is scored' }),
        el('table', null, el('tbody', null,
          el('tr', null, el('td', { text: 'TVL \u00d7 ' + sourceLabel + ' (' + fmtMult(recomputed) + (row.comparables > 0 ? ', ' + row.comparables + ' comparables' : ', no direct comparables') + ', confidence ' + row.confidence.toFixed(2) + ')' }), el('td', { text: fmtUsd(base) })),
          el('tr', null, el('td', { text: 'Growth \u00d7' + fmtMult(mult.growthMult) + ' (7d ' + (row.change_7d === null ? 'n/a' : fmtPct(row.change_7d)) + ', falls weigh ' + m.growth_negative_weight + ')' }), el('td', { text: fmtUsd(base * mult.growthMult) })),
          el('tr', null, el('td', { text: 'Maturity \u00d7' + fmtMult(mult.maturity) + ' (' + fmtAge(row.age_days) + ' with no token, peak at 2y)' }), el('td', { text: fmtUsd(base * mult.growthMult * mult.maturity) })),
          el('tr', null, el('td', { text: 'Breadth \u00d7' + fmtMult(mult.breadth) + ' (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')' }), el('td', { text: fmtUsd(base * mult.growthMult * mult.maturity * mult.breadth) })),
          el('tr', { class: 'total' }, el('td', { text: 'Implied value' }), el('td', { text: fmtUsd(row.implied_value_usd) })),
          el('tr', null, el('td', { text: 'P10\u2013P90 range' }), el('td', { text: fmtUsd(range.lo) + ' \u2013 ' + fmtUsd(range.hi) }))
        )),
        el('p', { class: 'note', text: (check === row.implied_value_usd && range.lo === row.implied_lo_usd && range.hi === row.implied_hi_usd ? 'The page recomputes this number and its range from the snapshot figures and agrees with the board.' : 'The page recomputes this number from the snapshot figures.') })
      ),
      el('div', { class: 'modelbox' },
        el('h3', { text: 'Farm economics' }),
        el('table', null, el('tbody', null,
          el('tr', null, el('td', { text: 'Capital to deploy' }), el('td', { text: '$' + row.capital_usd })),
          el('tr', null, el('td', { text: 'Expected airdrop value (2% pool, confidence ' + row.confidence.toFixed(2) + ')' }), el('td', { text: fmtUsd(econ.ev) })),
          el('tr', null, el('td', { text: 'Fees and time (' + row.hold_days + ' days, ' + econ.hours + 'h at $10/h)' }), el('td', { text: fmtUsd(econ.fee) })),
          el('tr', { class: 'total' }, el('td', { text: 'Expected net' }), el('td', { text: fmtNet(econ.net) + ' \u00b7 ' + econ.verdict }))
        )),
        el('p', { class: 'note', text: (econ.net === row.net_usd && econ.verdict === row.verdict ? 'The page recomputes the economics from the row and agrees with the board.' : 'The page recomputes the economics from the row.') })
      ),
      el('h3', { text: 'How to farm it' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var parts = s.split(' Cost: ');
        var main = parts[0] || s;
        var meta = parts[1] ? 'Cost: ' + parts[1] : '';
        return el('li', null, main, meta ? el('span', { class: 'meta', text: meta }) : null);
      }))
    );
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.textContent = '';
    app.appendChild(header());
    app.appendChild(lede());
    var drawer = detailDrawer();
    if (drawer) app.appendChild(drawer);
  }

  readHash();
  render();
})();
