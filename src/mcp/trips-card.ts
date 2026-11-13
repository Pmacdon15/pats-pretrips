/*
 * The trips card: a small HTML page AI apps show in the chat when the
 * assistant calls list_trips or get_trip, so the driver sees their trips as
 * cards instead of JSON. It follows the MCP Apps extension
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
	padding: 12px;
}
header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
h1 { font-size: 15px; margin: 0; }
.muted { color: var(--muted); font-size: 12px; }
.list { display: grid; gap: 8px; }
.trip { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.title { font-weight: 600; font-size: 14px; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; color: var(--muted); font-size: 12px; }
.facts b { color: var(--text); font-weight: 500; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.chip { border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; background: var(--chip-bg); }
.chip.ok { background: var(--ok-bg); color: var(--ok-text); }
.chip.bad { background: var(--bad-bg); color: var(--bad-text); }
.remarks { margin-top: 8px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
a { color: var(--accent); font-size: 12px; text-decoration: none; }
a:hover { text-decoration: underline; }
.empty { padding: 16px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 10px; }
</style>
</head>
<body>
<header><h1 id="heading">Pat's PreTrips</h1><span class="muted" id="count"></span></header>
<div class="list" id="list"><div class="empty">Loading trips…</div></div>
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

	function openTrip(id) {
		var url = SITE + '/pretrip/' + encodeURIComponent(id);
		request('ui/open-link', { url: url }).then(function (res) {
			if (res && res.error) window.open(url, '_blank', 'noopener');
		});
	}

	function tripCard(t) {
		var card = el('article', 'trip');
		var top = el('div', 'row');
		top.appendChild(el('span', 'title', [t.make, t.model].filter(Boolean).join(' ') || 'Trip ' + t.trip_id));
		top.appendChild(el('span', 'muted', when(t.date)));
		card.appendChild(top);

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
		if (defects.length) defects.forEach(function (d) { chips.appendChild(el('span', 'chip bad', d)); });
		else chips.appendChild(el('span', 'chip ok', 'No defects'));
		if (t.can_update) chips.appendChild(el('span', 'chip', 'Editable'));
		card.appendChild(chips);

		if (t.remarks) card.appendChild(el('div', 'remarks', t.remarks));

		var foot = el('div', 'row');
		foot.style.marginTop = '8px';
		foot.appendChild(el('span', 'muted', 'Trip #' + t.trip_id));
		var link = el('a', null, 'Open in PreTrips →');
		link.href = SITE + '/pretrip/' + encodeURIComponent(t.trip_id);
		link.addEventListener('click', function (e) { e.preventDefault(); openTrip(t.trip_id); });
		foot.appendChild(link);
		card.appendChild(foot);
		return card;
	}

	function render(data) {
		if (!data || typeof data !== 'object') return;
		var list = document.getElementById('list');
		var heading = document.getElementById('heading');
		var count = document.getElementById('count');
		var trips = Array.isArray(data.trips) ? data.trips : data.trip ? [data.trip] : null;
		if (!trips) return;
		list.replaceChildren();
		if (data.trip) {
			heading.textContent = 'Trip #' + data.trip.trip_id;
			count.textContent = '';
		} else {
			heading.textContent = data.when === 'past' ? 'Past trips' : 'Current trips';
			count.textContent = trips.length + ' trip' + (trips.length === 1 ? '' : 's') +
				(data.page > 1 || data.has_more ? ' · page ' + data.page + (data.has_more ? ', more available' : '') : '');
		}
		if (!trips.length) {
			list.appendChild(el('div', 'empty', data.when === 'past' ? 'No older trips.' : 'No trips in the last 24 hours.'));
		} else {
			trips.forEach(function (t) { list.appendChild(tripCard(t)); });
		}
		reportSize();
	}

	function applyTheme(ctx) {
		if (ctx && (ctx.theme === 'dark' || ctx.theme === 'light')) {
			document.documentElement.setAttribute('data-theme', ctx.theme);
		}
	}

	function reportSize() {
		var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
		notify('ui/notifications/size-changed', { height: h });
	}

	window.addEventListener('message', function (event) {
		var msg = event.data;
		if (!msg || msg.jsonrpc !== '2.0') return;
		if (msg.id != null && pending[msg.id]) {
			pending[msg.id](msg);
			delete pending[msg.id];
			return;
		}
		if (msg.method === 'ui/notifications/tool-result') {
			render(msg.params && msg.params.structuredContent);
		} else if (msg.method === 'ui/notifications/host-context-changed') {
			applyTheme(msg.params);
		} else if (msg.id != null) {
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
		applyTheme(res && res.result && res.result.hostContext);
		notify('ui/notifications/initialized');
	});

	if (typeof ResizeObserver !== 'undefined') new ResizeObserver(reportSize).observe(document.body);
})();
</script>
</body>
</html>
`
