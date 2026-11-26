/*
 * The trips card: a small HTML page AI apps show in the chat when the
 * assistant calls list_trips, get_trip, start_trip or update_trip (and the
 * vehicle tools, for saved vehicles), so the driver sees their trips as
 * cards instead of JSON, with each defect open or repaired (who fixed it,
 * when, the invoice). list_defects shows its open and repaired defects in it
 * too. It follows the MCP Apps extension
 * (io.modelcontextprotocol/ui): the tools name this resource in
 * `_meta.ui.resourceUri`, the host loads it in a sandboxed iframe and posts
 * the tool result to it. Clients without MCP Apps ignore it and read the
 * text content as before.
 *
 * The page is self-contained (no network, no scripts from elsewhere) and
 * builds every value with textContent, never innerHTML, since trip remarks
 * are free text.
 */

export const TRIPS_CARD_URI = 'ui://pats-pretrips/trips-card.html'

/** The MIME type MCP Apps hosts look for. */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app'

export const SITE_URL = 'https://patspretrips.ca'

/** What a tool sets in `_meta` to show its result in the trips card. */
export const TRIPS_CARD_TOOL_META = {
	ui: { resourceUri: TRIPS_CARD_URI },
	// The key hosts read before `ui.resourceUri` was settled.
	'ui/resourceUri': TRIPS_CARD_URI,
}

export const TRIPS_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PreTrips</title>
<style>
:root {
	color-scheme: light dark;
	--bg: #ffffff;
	--card: #f7f7f8;
	--border: #e3e3e6;
	--text: #18181b;
	--muted: #63636b;
	--ok-bg: #e7f6ec;
	--ok-text: #17663a;
	--bad-bg: #fdeaea;
	--bad-text: #a32020;
	--chip-bg: #ececef;
	--accent: #1f5fbf;
}
:root[data-theme="dark"] {
	--bg: #1b1b1f;
	--card: #26262b;
	--border: #36363d;
	--text: #f1f1f3;
	--muted: #a2a2ab;
	--ok-bg: #173826;
	--ok-text: #7fdca1;
	--bad-bg: #431d1d;
	--bad-text: #ff9c9c;
	--chip-bg: #34343a;
	--accent: #7fb0ff;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-theme="light"]) {
		--bg: #1b1b1f;
		--card: #26262b;
		--border: #36363d;
		--text: #f1f1f3;
		--muted: #a2a2ab;
		--ok-bg: #173826;
		--ok-text: #7fdca1;
		--bad-bg: #431d1d;
		--bad-text: #ff9c9c;
		--chip-bg: #34343a;
		--accent: #7fb0ff;
	}
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
	background: var(--bg);
	color: var(--text);
	font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
#content { padding: 12px; }
/* Only while the frame is shorter than the card (see fit()): the card
   scrolls inside itself, since some hosts neither grow the frame to the
   height asked for nor let it scroll. */
html.fit #app { max-height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
h1 { font-size: 15px; margin: 0; }
.muted { color: var(--muted); font-size: 12px; }
.list { display: grid; gap: 8px; align-content: start; }
.trip { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.title { font-weight: 600; font-size: 14px; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; color: var(--muted); font-size: 12px; }
.facts b { color: var(--text); font-weight: 500; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.chip { border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; background: var(--chip-bg); }
.chip.ok { background: var(--ok-bg); color: var(--ok-text); }
.chip.bad { background: var(--bad-bg); color: var(--bad-text); }
.repairs { display: grid; gap: 6px; margin-top: 8px; }
.repair { border-left: 3px solid var(--ok-text); padding: 2px 0 2px 8px; font-size: 12px; }
.repair.open { border-left-color: var(--bad-text); }
.repair .what { font-weight: 600; }
.repair .links { display: flex; gap: 12px; margin-top: 2px; }
.remarks { margin-top: 8px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
a { color: var(--accent); font-size: 12px; text-decoration: none; }
a:hover { text-decoration: underline; }
.trip.compact { padding: 0; }
.trip.compact > summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
.trip.compact > summary::-webkit-details-marker { display: none; }
.trip.compact > summary .sum { flex: 1; min-width: 0; }
.trip.compact > summary .sub { display: flex; align-items: center; gap: 8px; margin-top: 2px; min-width: 0; }
.trip.compact > summary .sub .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.trip.compact > summary .chev { display: inline-block; color: var(--muted); transition: transform .15s; flex: none; }
.trip.compact[open] > summary .chev { transform: rotate(90deg); }
.trip.compact > .body { padding: 0 12px 10px; border-top: 1px solid var(--border); }
.pill { border-radius: 999px; padding: 1px 7px; font-size: 11px; font-weight: 600; background: var(--chip-bg); white-space: nowrap; flex: none; }
.pill.ok { background: var(--ok-bg); color: var(--ok-text); }
.pill.bad { background: var(--bad-bg); color: var(--bad-text); }
.empty { padding: 16px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 10px; }
.empty .hint { margin-top: 6px; font-size: 12px; color: var(--text); }
</style>
</head>
<body>
<div id="app"><div id="content">
<header><h1 id="heading">Pat's PreTrips</h1><span class="muted" id="count"></span></header>
<div class="list" id="list"><div class="empty">Loading trips…</div></div>
</div></div>
<script>
(function () {
	var SITE = ${JSON.stringify(SITE_URL)};
	var nextId = 1;
	var pending = {};

	function send(message) {
		window.parent.postMessage(Object.assign({ jsonrpc: '2.0' }, message), '*');
	}
	function request(method, params) {
		var id = nextId++;
		send({ id: id, method: method, params: params || {} });
		return new Promise(function (resolve) { pending[id] = resolve; });
	}
	function notify(method, params) { send({ method: method, params: params || {} }); }

	function el(tag, className, text) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = String(text);
		return node;
	}
	function fact(label, value) {
		var span = el('span', null, label + ' ');
		span.appendChild(el('b', null, value));
		return span;
	}
	function when(iso) {
		var d = new Date(iso);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function tripUrl(id) {
		return SITE + '/pretrip/' + encodeURIComponent(id);
	}
	// repaired_on is a plain date (YYYY-MM-DD): read it as that day where
	// the driver is, not as midnight UTC.
	function day(ymd) {
		var parts = String(ymd || '').slice(0, 10).split('-').map(Number);
		if (parts.length !== 3 || parts.some(isNaN)) return '';
		return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}
	// Only links to the app itself: an https URL on the site's own origin.
	// The trailing slash pins the host, so "https://patspretrips.ca.evil.test"
	// or "https://patspretrips.ca@evil.test" never pass, and neither does
	// javascript:, data: or any other scheme.
	function isSiteUrl(url) {
		return typeof url === 'string' && url.indexOf(SITE + '/') === 0;
	}

	// Runs inside the click, so the browser still counts it as the driver's
	// own click: a window opened after waiting on the host would be blocked
	// as a popup. Order: ChatGPT's own API, then a plain new window (works
	// where the frame may open popups), then asking the host to open it.
	function openUrl(url) {
		if (!isSiteUrl(url)) return;
		if (window.openai && typeof window.openai.openExternal === 'function') {
			try { window.openai.openExternal({ href: url }); return; } catch (e) {}
		}
		var opened = null;
		try { opened = window.open(url, '_blank'); } catch (e) {}
		if (opened) {
			try { opened.opener = null; } catch (e) {}
			return;
		}
		request('ui/open-link', { url: url });
	}

	function linkTo(label, url) {
		if (!isSiteUrl(url)) return el('span', 'muted', label);
		var link = el('a', null, label);
		link.href = url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.addEventListener('click', function (e) { e.preventDefault(); openUrl(url); });
		return link;
	}

	function repairedBy(r) {
		return [r.mechanic_name, r.shop_name].filter(Boolean).join(', ') || 'Unknown';
	}

	// One repaired defect: who fixed it and when, the invoice and signature.
	function repairRow(defect, r) {
		var row = el('div', 'repair');
		row.appendChild(el('div', 'what', defect + ' · Repaired'));
		var bits = [day(r.repaired_on), 'by ' + repairedBy(r)].filter(Boolean).join(' ');
		if (r.invoice_number) bits += ' · Invoice ' + r.invoice_number;
		bits += r.signed ? ' · Signed' : ' · Not signed';
		row.appendChild(el('div', 'muted', bits));
		if (r.notes) row.appendChild(el('div', 'remarks', r.notes));
		var links = el('div', 'links');
		if (isSiteUrl(r.invoice_url)) links.appendChild(linkTo('Invoice →', r.invoice_url));
		if (isSiteUrl(r.signature_url)) links.appendChild(linkTo('Signature →', r.signature_url));
		if (links.childNodes.length) row.appendChild(links);
		return row;
	}

	function tripTitle(t) {
		return [t.make, t.model].filter(Boolean).join(' ') || 'Trip';
	}

	// With several trips, each one is a short row (truck, time, plate and
	// how many defects are still open) that opens to the full card on a tap,
	// so the list stays short enough for the chat instead of being cut off.
	function compactTrip(t) {
		var card = el('details', 'trip compact');
		var summary = el('summary');
		var sum = el('div', 'sum');
		var top = el('div', 'row');
		top.appendChild(el('span', 'title', tripTitle(t)));
		top.appendChild(el('span', 'muted', when(t.date)));
		sum.appendChild(top);
		var sub = el('div', 'sub');
		var defects = Array.isArray(t.defects) ? t.defects : [];
		var statuses = Array.isArray(t.defect_status) ? t.defect_status : [];
		var open = defects.filter(function (d) {
			return !statuses.some(function (x) {
				return x && x.status === 'repaired' && x.repair && String(x.defect).toLowerCase() === String(d).toLowerCase();
			});
		}).length;
		var pill = !defects.length ? ['ok', 'No defects']
			: open ? ['bad', open + (open === 1 ? ' defect open' : ' defects open')]
			: ['ok', 'Defects repaired'];
		sub.appendChild(el('span', 'pill ' + pill[0], pill[1]));
		if (t.truck_plate) sub.appendChild(el('span', 'muted', t.truck_plate));
		sum.appendChild(sub);
		summary.appendChild(sum);
		summary.appendChild(el('span', 'chev', '›'));
		card.appendChild(summary);
		var body = el('div', 'body');
		tripDetails(t, null, body);
		card.appendChild(body);
		card.addEventListener('toggle', function () { reportSize(); reveal(card); });
		return card;
	}

	function tripCard(t, status) {
		var card = el('article', 'trip');
		var top = el('div', 'row');
		top.appendChild(el('span', 'title', tripTitle(t)));
		top.appendChild(el('span', 'muted', when(t.date)));
		card.appendChild(top);
		tripDetails(t, status, card);
		return card;
	}

	// Everything on a trip below its title: plates, defects, repairs,
	// remarks and the link to the trip page.
	function tripDetails(t, status, card) {

		var facts = el('div', 'facts');
		if (t.truck_plate) facts.appendChild(fact('Truck', t.truck_plate));
		if (t.trailer_plate_a) facts.appendChild(fact('Trailer A', t.trailer_plate_a));
		if (t.trailer_plate_b) facts.appendChild(fact('Trailer B', t.trailer_plate_b));
		if (t.odometer != null) facts.appendChild(fact('Odometer', Number(t.odometer).toLocaleString() + ' km'));
		if (t.carrier) facts.appendChild(fact('Carrier', t.carrier));
		if (t.inspection_address) facts.appendChild(fact('At', t.inspection_address));
		card.appendChild(facts);

		var chips = el('div', 'chips');
		var defects = Array.isArray(t.defects) ? t.defects : [];
		var statuses = Array.isArray(status) ? status : Array.isArray(t.defect_status) ? t.defect_status : [];
		var repaired = [];
		if (defects.length) defects.forEach(function (d) {
			var s = statuses.filter(function (x) { return x && String(x.defect).toLowerCase() === String(d).toLowerCase(); })[0];
			var fixed = s && s.status === 'repaired' && s.repair;
			if (fixed) repaired.push({ defect: d, repair: s.repair });
			chips.appendChild(el('span', fixed ? 'chip ok' : 'chip bad', d + (s ? (fixed ? ' · Repaired' : ' · Open') : '')));
		});
		else chips.appendChild(el('span', 'chip ok', 'No defects'));
		// Signed trips keep their details; only defects and remarks can be added.
		if (t.can_update) chips.appendChild(el('span', 'chip', t.can_edit_details === false ? 'Signed · can add defects' : 'Editable'));
		card.appendChild(chips);

		if (repaired.length) {
			var list = el('div', 'repairs');
			repaired.forEach(function (x) { list.appendChild(repairRow(x.defect, x.repair)); });
			card.appendChild(list);
		}

		if (t.remarks) card.appendChild(el('div', 'remarks', t.remarks));

		var foot = el('div', 'row');
		foot.style.marginTop = '8px';
		foot.style.justifyContent = 'flex-end';
		foot.appendChild(linkTo('Open in PreTrips →', tripUrl(t.trip_id)));
		card.appendChild(foot);
	}

	// A defect from list_defects: still open, or repaired with its repair.
	function defectCard(d, repairedOne) {
		var card = el('article', 'trip');
		var top = el('div', 'row');
		top.appendChild(el('span', 'title', d.defect));
		top.appendChild(el('span', repairedOne ? 'chip ok' : 'chip bad', repairedOne ? 'Repaired' : 'Open'));
		card.appendChild(top);
		var facts = el('div', 'facts');
		var truck = [d.make, d.model].filter(Boolean).join(' ');
		if (truck) facts.appendChild(fact('Truck', truck));
		if (d.truck_plate) facts.appendChild(fact('Plate', d.truck_plate));
		if (d.trip_date) facts.appendChild(fact('Reported', when(d.trip_date)));
		card.appendChild(facts);
		if (repairedOne) {
			var list = el('div', 'repairs');
			list.appendChild(repairRow(d.defect, d));
			card.appendChild(list);
		}
		var foot = el('div', 'row');
		foot.style.marginTop = '8px';
		foot.style.justifyContent = 'flex-end';
		foot.appendChild(linkTo('Open in PreTrips →', tripUrl(d.trip_id)));
		card.appendChild(foot);
		return card;
	}

	function isObject(x) {
		return !!x && typeof x === 'object' && !Array.isArray(x);
	}
	function clear(node) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	function renderDefects(data, list, heading, count) {
		var open = Array.isArray(data.open) ? data.open.filter(isObject) : null;
		var repaired = Array.isArray(data.repaired) ? data.repaired.filter(isObject) : null;
		heading.textContent = 'Defects & repairs';
		count.textContent = [
			open ? (data.open_count != null ? data.open_count : open.length) + ' open' : '',
			repaired ? (data.repaired_count != null ? data.repaired_count : repaired.length) + ' repaired' : '',
		].filter(Boolean).join(' · ');
		if (!(open && open.length) && !(repaired && repaired.length)) {
			list.appendChild(el('div', 'empty', open ? 'No open defects.' : 'No repairs yet.'));
			return;
		}
		(open || []).forEach(function (d) { list.appendChild(defectCard(d, false)); });
		(repaired || []).forEach(function (r) { list.appendChild(defectCard(r, true)); });
	}

	// A saved vehicle from list_vehicles or the other vehicle tools.
	function vehicleCard(v) {
		var card = el('article', 'trip');
		var top = el('div', 'row');
		var model = [v.make, v.model].filter(Boolean).join(' ');
		top.appendChild(el('span', 'title', v.name || model || 'Vehicle ' + v.vehicle_id));
		top.appendChild(el('span', 'muted', 'Vehicle #' + v.vehicle_id));
		card.appendChild(top);
		var facts = el('div', 'facts');
		if (v.name && model) facts.appendChild(fact('Truck', model));
		if (v.truck_plate) facts.appendChild(fact('Plate', v.truck_plate));
		if (v.trailer_plate_a) facts.appendChild(fact('Trailer A', v.trailer_plate_a));
		if (v.trailer_plate_b) facts.appendChild(fact('Trailer B', v.trailer_plate_b));
		if (facts.childNodes.length) card.appendChild(facts);
		var foot = el('div', 'row');
		foot.style.marginTop = '8px';
		foot.appendChild(el('span', 'muted', ''));
		foot.appendChild(linkTo('Manage vehicles →', SITE + '/vehicles'));
		card.appendChild(foot);
		return card;
	}

	function renderVehicles(data, list, heading, count) {
		var one = isObject(data.vehicle);
		var vehicles = (one ? [data.vehicle] : data.vehicles).filter(isObject);
		if (one) {
			heading.textContent = data.status === 'deleted' ? 'Vehicle deleted' : 'Vehicle #' + data.vehicle.vehicle_id;
			count.textContent = '';
		} else {
			heading.textContent = 'Saved vehicles';
			count.textContent = vehicles.length + ' vehicle' + (vehicles.length === 1 ? '' : 's');
		}
		if (!vehicles.length) {
			list.appendChild(el('div', 'empty', 'No saved vehicles yet.'));
		} else {
			vehicles.forEach(function (v) { list.appendChild(vehicleCard(v)); });
		}
	}

	// The space a trip list is for: "Personal", or the organization's name.
	function spaceName(x) {
		if (!isObject(x)) return '';
		if (x.space === 'organization') return typeof x.organization_name === 'string' ? x.organization_name : 'Organization';
		return x.space === 'personal' ? 'Personal' : '';
	}

	function emptyTrips(data) {
		var box = el('div', 'empty');
		var name = spaceName(data);
		var where = data.space === 'organization' ? ' in ' + name : data.space === 'personal' ? ' in your personal space' : '';
		box.appendChild(el('div', null, (data.when === 'past' ? 'No older trips' : 'No trips in the last 24 hours') + where + '.'));
		// Trips in the driver's other spaces (issue #92), so an empty list
		// never reads as "no trips" when they are only somewhere else.
		var elsewhere = Array.isArray(data.elsewhere) ? data.elsewhere.filter(isObject) : [];
		elsewhere.forEach(function (e) {
			var n = Number(e.count) || 0;
			box.appendChild(el('div', 'hint', n + (e.has_more ? '+' : '') + ' trip' + (n === 1 && !e.has_more ? '' : 's') + ' in ' + (spaceName(e) === 'Personal' ? 'your personal space' : spaceName(e))));
		});
		return box;
	}

	function renderTrips(data, list, heading, count) {
		var one = isObject(data.trip);
		var trips = (one ? [data.trip] : data.trips).filter(isObject);
		if (one) {
			heading.textContent = tripTitle(data.trip);
			count.textContent = '';
		} else {
			heading.textContent = data.when === 'past' ? 'Past trips' : 'Current trips';
			count.textContent = [
				trips.length + ' trip' + (trips.length === 1 ? '' : 's'),
				spaceName(data),
				data.page > 1 || data.has_more ? 'page ' + data.page + (data.has_more ? ', more available' : '') : '',
			].filter(Boolean).join(' · ');
		}
		if (!trips.length) {
			list.appendChild(emptyTrips(data));
		} else {
			trips.forEach(function (t) {
				list.appendChild(trips.length > 1 ? compactTrip(t) : tripCard(t, one ? data.defect_status : null));
			});
		}
	}

	// Draws a tool result. Anything that is not a trips or defects result is
	// left alone. The new card is built off-screen and swapped in whole, so
	// odd data never leaves a half-drawn card: if building it fails, the card
	// says so instead.
	function render(data) {
		if (!isObject(data)) return;
		var defects = Array.isArray(data.open) || Array.isArray(data.repaired);
		var vehicles = Array.isArray(data.vehicles) || isObject(data.vehicle);
		if (!defects && !vehicles && !Array.isArray(data.trips) && !isObject(data.trip)) return;
		var list = document.getElementById('list');
		var heading = document.getElementById('heading');
		var count = document.getElementById('count');
		var built = document.createDocumentFragment();
		try {
			if (defects) renderDefects(data, built, heading, count);
			else if (vehicles && !isObject(data.trip) && !Array.isArray(data.trips)) renderVehicles(data, built, heading, count);
			else renderTrips(data, built, heading, count);
		} catch (e) {
			heading.textContent = "Pat's PreTrips";
			count.textContent = '';
			built = el('div', 'empty', 'Could not show this result.');
		}
		clear(list);
		list.appendChild(built);
		reportSize();
	}

	function applyTheme(ctx) {
		if (isObject(ctx) && (ctx.theme === 'dark' || ctx.theme === 'light')) {
			document.documentElement.setAttribute('data-theme', ctx.theme);
		}
	}

	// The height asked for is the card's full height, measured on #content,
	// which is never clipped, and told both ways hosts listen: the MCP Apps
	// notification and ChatGPT's notifyIntrinsicHeight. Some hosts (Claude
	// on iOS among them) make the frame a little shorter than asked, keeping
	// some of it for their own padding, which left the card scrolling by a
	// few lines. So when the host has resized the frame and it is still a
	// little short, the card asks for that much more, once per gap. A frame
	// far shorter than asked means the host will not grow it: then, and
	// while waiting, the card scrolls inside itself (issue #92) rather than
	// being cut off.
	var MAX_EXTRA = 120;
	var asked = -1;
	var extra = 0;
	var lastInner = window.innerHeight;
	function fullHeight() {
		return Math.ceil(document.getElementById('content').getBoundingClientRect().height);
	}
	function fit() {
		var short = window.innerHeight > 0 && window.innerHeight < fullHeight();
		document.documentElement.classList.toggle('fit', short);
	}
	function reportSize() {
		fit();
		var h = fullHeight() + extra;
		if (h === asked) return;
		asked = h;
		notify('ui/notifications/size-changed', { height: h });
		if (window.openai && typeof window.openai.notifyIntrinsicHeight === 'function') {
			try { window.openai.notifyIntrinsicHeight(h); } catch (e) {}
		}
	}
	function onResize() {
		var inner = window.innerHeight;
		var gap = fullHeight() - inner;
		// Only when the host just changed the frame in answer to a height the
		// card asked for, so a host that ignores it never makes the card ask
		// for more and more.
		if (inner > 0 && inner !== lastInner && asked > 0 && gap > 0 && extra + gap <= MAX_EXTRA) {
			extra += gap;
		}
		lastInner = inner;
		reportSize();
	}

	// An opened trip whose details fall below the bottom of the frame is
	// scrolled into view, so opening it visibly does something.
	function reveal(card) {
		if (card.open && typeof card.scrollIntoView === 'function') {
			card.scrollIntoView({ block: 'nearest' });
		}
	}

	// Only the frame that embeds the card speaks for the host: the host
	// itself, or the sandbox proxy frame that relays for it. A message from
	// any other window (a sibling frame, a popup, the top page reaching in
	// through window.frames) is ignored, so nothing else can draw trips in
	// the card or answer its requests. The origin is not checked: it differs
	// per AI app and is not known in advance, and the parent's page cannot
	// change while the card is in it (navigating the parent unloads the card).
	window.addEventListener('message', function (event) {
		if (event.source !== window.parent) return;
		var msg = event.data;
		if (!isObject(msg) || msg.jsonrpc !== '2.0') return;
		var hasId = typeof msg.id === 'number' || typeof msg.id === 'string';
		if (typeof msg.method !== 'string') {
			// A response: only to a request the card sent and still waits on
			// (the card numbers its requests, so the id must be that number).
			if (typeof msg.id === 'number' && Object.prototype.hasOwnProperty.call(pending, msg.id)) {
				var resolve = pending[msg.id];
				delete pending[msg.id];
				resolve(msg);
			}
			return;
		}
		var params = isObject(msg.params) ? msg.params : null;
		if (msg.method === 'ui/notifications/tool-result') {
			if (params) render(params.structuredContent);
		} else if (msg.method === 'ui/notifications/host-context-changed') {
			applyTheme(params);
		} else if (hasId) {
			// Requests the card has nothing for (ping, teardown) get an empty
			// result, so the host is not left waiting.
			send({ id: msg.id, result: {} });
		}
	});

	// ChatGPT's Apps SDK puts the result on window.openai instead.
	if (window.openai && window.openai.toolOutput) render(window.openai.toolOutput);
	window.addEventListener('openai:set-globals', function () {
		if (window.openai) render(window.openai.toolOutput);
	});

	request('ui/initialize', {
		protocolVersion: '2026-01-26',
		appInfo: { name: 'pats-pretrips-trips-card', version: '1.0.0' },
		appCapabilities: {},
	}).then(function (res) {
		var ctx = isObject(res.result) ? res.result.hostContext : null;
		applyTheme(ctx);
		notify('ui/notifications/initialized');
		// Hosts may drop what the card sent before it was initialized (a
		// result drawn early, from window.openai), so say the height again.
		asked = -1;
		reportSize();
	});

	if (typeof ResizeObserver !== 'undefined') {
		var sizes = new ResizeObserver(reportSize);
		sizes.observe(document.getElementById('content'));
	}
	window.addEventListener('resize', onResize);
})();
</script>
</body>
</html>
`
