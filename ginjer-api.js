/* Ginjer client adapter. API requests and token storage are handled by the local Node backend. */
(() => {
  const demoDevices = devices.map(d => ({ ...d, chips: d.chips.map(c => [...c]) }));
  const demoProfile = { name: 'Shaheen Ansari', email: 'shaheenansari2519cs@gmail.com' };
  const runtime = { token: '', connected: false, organisations: [], projects: [], modules: [], activeOrg: null, activeProject: null, details: new Map(), error: '' };
  const mapState = { instance: null, element: null, markers: [], generation: 0, query: '' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const queries = {
    signIn: `query SignIn($auth: SignInInput!) { signIn(auth: $auth) { _id firstName lastName emailId token defaultAccount organisationId } }`,
    organisations: `query OrgList { accounts { organisationId name isActive isAccepted isAdmin } }`,
    projects: `query ProjectList($params: ParamInput!) { projectOverview(params: $params) { _id name description active organisationId location { placeName lat lng } userCount { _id userCount } deviceCount { _id deviceCount } clusterCount { _id clusterCount } nonLoRaWANDeviceCount { _id nonLoRaWANDeviceCount } } }`,
    devices: `query DeviceList($params: ParamInput!) { projects(params: $params) { _id name clusters { _id name devices { _id name devEui hardwareId timestamp } } } }`,
    details: `query DeviceDetails($params: ParamInput!) { projects(params: $params) { _id name clusters { _id name devices { _id name description devEui organisationId projectId clusterId hardwareId networkId hardwareType timestamp deleted position { placeName lat lng } outputs { outputId outputName value label color } attributes { attributeId attributeName value } } } } }`,
    modules: `query ModuleList($params: ParamInput!) { modules(params: $params) { _id label moduleType organisationId } }`,
    downlink: `query SendDownlink($action: SendDownlinkInput!) { sendDownlink(action: $action) { timestamp type message } }`
  };

  async function setBackendToken(token) {
    const response = await fetch('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Local backend rejected the token (' + response.status + ').');
  }
  function clearBackendToken() {
    fetch('/api/token', { method: 'DELETE', keepalive: true }).catch(() => {});
  }
  const request = async (query, variables = {}, authenticated = true) => {
    if (location.protocol === 'file:') throw new Error('Start Alumhacks.bat, then open http://127.0.0.1:8787.');
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) headers['X-Ginjer-Authenticated'] = 'true';
    const response = await fetch('/api/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    let body;
    try { body = await response.json(); } catch { throw new Error('Local backend returned an unreadable response (' + response.status + ').'); }
    if (!response.ok) throw new Error(body?.errors?.map(e => e.message).join('; ') || body?.error || 'Ginjer request failed (' + response.status + ').');
    if (body.errors?.length) throw new Error(body.errors.map(e => e.message).join('; '));
    return body.data || {};
  };
  const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
  const flattenDevices = projects => asArray(projects).flatMap(p => asArray(p.clusters).flatMap(c => asArray(c.devices).map(d => ({ ...d, clusterName: c.name }))));
  const displayDate = value => {
    if (!value) return 'Not reported';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };
  const chooseIcon = name => /panic|alert|button|sos/i.test(name) ? ['alert','#f16e63'] : /water|level|fill/i.test(name) ? ['water','#36a9d4'] : /air|quality/i.test(name) ? ['air','#55a9a0'] : /cold|chain|temperature/i.test(name) ? ['snow','#9cba68'] : ['controller','#81af27'];
  const formatValue = value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');
  function normalizeDevice(d) {
    const [kind, color] = chooseIcon(d.name || d.hardwareType || 'device');
    const outputs = asArray(d.outputs);
    const chips = outputs.slice(0, 2).map(o => {
      const value = formatValue(o.value ?? o.label);
      const supplied = String(o.color || '').toLowerCase();
      const status = ['red','amber','green','blue'].includes(supplied) ? supplied
        : /alert|off|low|poor|empty|false|error/.test(value.toLowerCase()) ? 'red'
        : /moderate|warning|medium/.test(value.toLowerCase()) ? 'amber' : 'green';
      return [`${o.outputName || o.label || 'Output'}: ${value}`, status];
    });
    if (!chips.length) chips.push(['Output data unavailable','blue']);
    if (chips.length === 1) chips.push([`Last heard: ${d.timestamp ? displayDate(d.timestamp) : 'Unknown'}`,'blue']);
    const pos = d.position || {};
    return {
      ...d,
      apiId: d._id,
      id: d.devEui || d.hardwareId || d._id,
      name: esc(d.name || 'Unnamed device'),
      heard: esc(displayDate(d.timestamp)),
      chips: chips.map(([a,b]) => [esc(a),esc(b)]),
      kind,
      color,
      loc: esc(pos.placeName || d.clusterName || 'Location unavailable'),
      output: esc(formatValue(outputs[0]?.value ?? outputs[0]?.label ?? '—')),
      outputs,
      attributes: asArray(d.attributes),
      position: pos,
      networkId: d.networkId || ''
    };
  }

  async function loadProject(project) {
    const params = { organisationId: runtime.activeOrg.organisationId, projectId: project._id };
    const [deviceResult, detailResult, moduleResult] = await Promise.allSettled([
      request(queries.devices, { params }),
      request(queries.details, { params }),
      request(queries.modules, { params: { organisationId: runtime.activeOrg.organisationId } })
    ]);
    if (deviceResult.status === 'rejected') throw deviceResult.reason;
    const listed = flattenDevices(deviceResult.value.projects);
    const detailed = detailResult.status === 'fulfilled' ? flattenDevices(detailResult.value.projects) : [];
    const byId = new Map(detailed.map(d => [d._id, d]));
    const liveDevices = listed.map(d => normalizeDevice({ ...d, ...(byId.get(d._id) || {}) }));
    runtime.details = new Map(detailed.map(d => [d._id, d]));
    runtime.modules = moduleResult.status === 'fulfilled' ? asArray(moduleResult.value.modules) : [];
    runtime.error = '';
    if (detailResult.status === 'rejected') runtime.error = `Device list loaded; details unavailable: ${detailResult.reason.message}`;
    if (!liveDevices.length) runtime.error = 'No devices were returned for this project.';
    runtime.activeProject = project;
    state.activeProjectName = project.name || 'Project';
    devices.splice(0, devices.length, ...liveDevices);
    state.device = devices[0] || null;
    runtime.connected = true;
    render();
  }

  async function loadOrganisation(organisation) {
    runtime.activeOrg = organisation;
    state.activeOrgName = organisation.name || 'Organization';
    const result = await request(queries.projects, { params: { organisationId: organisation.organisationId } });
    runtime.projects = asArray(result.projectOverview);
    const first = runtime.projects.find(p => p.active !== false) || runtime.projects[0];
    if (!first) throw new Error(`No projects were returned for ${organisation.name || 'this organization'}.`);
    await loadProject(first);
  }

  async function loadAccountData(defaultId = '') {
    const orgData = await request(queries.organisations);
    runtime.organisations = asArray(orgData.accounts).filter(o => o.isAccepted !== false && o.isActive !== false);
    const preferred = runtime.organisations.find(o => o.organisationId === defaultId);
    const candidates = [...(preferred ? [preferred] : []), ...runtime.organisations.filter(o => o !== preferred)];
    if (!candidates.length) throw new Error('No accepted organization was returned for this account.');
    const failures = [];
    for (const organisation of candidates) {
      try { await loadOrganisation(organisation); return; }
      catch (err) { failures.push(err.message || 'Could not load projects.'); }
    }
    throw new Error(`Could not load projects from your accepted organizations. ${failures.join(' ')}`);
  }

  function finishConnection() {
    overlayRoot.innerHTML = '';
    state.tab = 'devices';
    state.route = 'devices';
    render();
    showToast('Connected to Ginjer. Device data loaded.');
  }

  function resetConnectionError(err, form) {
    clearBackendToken();
    runtime.token = '';
    runtime.connected = false;
    runtime.organisations = []; runtime.projects = []; runtime.modules = []; runtime.activeOrg = null; runtime.activeProject = null;
    state.activeOrgName = ''; state.activeProjectName = ''; state.device = devices[1];
    devices.splice(0, devices.length, ...demoDevices.map(d => ({ ...d, chips: d.chips.map(c => [...c]) })));
    state.profileName = demoProfile.name;
    state.profileEmail = demoProfile.email;
    form.querySelector('.api-error').textContent = err.message || 'Could not connect to Ginjer.';
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = false;
    submit.textContent = 'Connect';
  }

  async function signIn(email, password, form) {
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Connecting…';
    form.querySelector('.api-error').textContent = '';
    try {
      const data = await request(queries.signIn, { auth: { emailId: email, password, application: 'Ginjer', forever: true } }, false);
      const user = data.signIn;
      if (!user?.token) throw new Error('Sign-in succeeded without a token. Check the account and API response.');
      runtime.token = user.token;
      await setBackendToken(user.token);
      state.profileName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Ginjer User';
      state.profileEmail = user.emailId || email;
      const defaultId = (typeof user.defaultAccount === 'string' ? user.defaultAccount : user.defaultAccount?.organisationId) || user.organisationId;
      await loadAccountData(defaultId);
      finishConnection();
    } catch (err) { resetConnectionError(err, form); }
  }

  async function connectWithToken(token, form) {
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Connecting…';
    form.querySelector('.api-error').textContent = '';
    try {
      runtime.token = token.trim().replace(/^Bearer\s+/i, '');
      if (!runtime.token) throw new Error('Paste the token value from your Postman environment.');
      await setBackendToken(runtime.token);
      state.profileName = 'Ginjer user';
      state.profileEmail = 'Connected with API token';
      await loadAccountData();
      finishConnection();
    } catch (err) { resetConnectionError(err, form); }
  }

  function openConnect(initialMode = 'password') {
    overlayRoot.innerHTML = `<div class="scrim"><section class="sheet api-sheet" role="dialog" aria-modal="true" aria-labelledby="api-title"><div class="sheet-grabber"></div><h2 id="api-title">Connect to Ginjer</h2><p class="sheet-subtitle">Load organizations, projects, and devices from your Ginjer account.</p><form id="ginjer-login" data-mode="password"><div class="api-auth-tabs" role="tablist" aria-label="Ginjer sign-in method"><button class="active" type="button" data-auth-mode="password" role="tab" aria-selected="true">Email and password</button><button type="button" data-auth-mode="token" role="tab" aria-selected="false">Use API token</button></div><div data-password-fields><label class="api-label">Email<input name="email" type="email" autocomplete="username" required placeholder="Email address" /></label><label class="api-label">Password<input name="password" type="password" autocomplete="current-password" required placeholder="Password" /></label><p class="api-privacy">Credentials are sent only to prodapi.ginjer.io for sign-in.</p></div><div data-token-fields hidden><label class="api-label">Postman token<input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the Current value of the token variable" /></label><p class="api-privacy">The token is sent to Ginjer in the authorization header and kept only in memory until you disconnect or close this page. Never share it in chat.</p></div><p class="api-error" role="alert"></p><div class="sheet-actions"><button class="action-secondary" type="button" data-api-close>Cancel</button><button class="action-primary" type="submit">Connect</button></div></form></section></div>`;
    overlayRoot.querySelector('[data-api-close]').addEventListener('click', () => overlayRoot.innerHTML = '');
    overlayRoot.querySelector('.scrim').addEventListener('click', e => { if (e.target === e.currentTarget) overlayRoot.innerHTML = ''; });
    const form = overlayRoot.querySelector('#ginjer-login');
    form.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.authMode;
      form.dataset.mode = mode;
      form.querySelector('[data-password-fields]').hidden = mode !== 'password';
      form.querySelector('[data-token-fields]').hidden = mode !== 'token';
      form.elements.email.required = mode === 'password';
      form.elements.password.required = mode === 'password';
      form.elements.token.required = mode === 'token';
      form.querySelectorAll('[data-auth-mode]').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
    }));
    if (initialMode === 'token') form.querySelector('[data-auth-mode="token"]').click();
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (form.dataset.mode === 'token') connectWithToken(form.elements.token.value, form);
      else signIn(form.elements.email.value.trim(), form.elements.password.value, form);
    });
  }
  function chooseFrom(title, items, label, action) {
    overlayRoot.innerHTML = `<div class="scrim"><section class="sheet" role="dialog" aria-modal="true"><div class="sheet-grabber"></div><h2>${esc(title)}</h2><div class="filter-options">${items.map((item,i) => `<button class="filter-option" type="button" data-choice="${i}"><span>${esc(label(item))}</span>${i===0?svg('check'):svg('chevron')}</button>`).join('') || '<p class="empty-state">No items available.</p>'}</div><div class="sheet-actions"><button class="action-secondary" type="button" data-choice-close>Close</button></div></section></div>`;
    overlayRoot.querySelector('[data-choice-close]').addEventListener('click', () => overlayRoot.innerHTML = '');
    overlayRoot.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.choice)];
      button.disabled = true;
      try { await action(item); overlayRoot.innerHTML = ''; render(); }
      catch (err) { button.disabled = false; showToast(err.message || 'Could not load selection.'); }
    }));
  }

  function openOrganisations() {
    chooseFrom('Organizations', runtime.organisations, o => o.name || o.organisationId, loadOrganisation);
  }
  function openProjects() {
    chooseFrom('Projects', runtime.projects, p => p.name || p._id, loadProject);
  }

  function outputStatus(value, color) {
    const v = String(value ?? '').toLowerCase();
    if (color && /^#[0-9a-f]{3,8}$/i.test(color)) return color;
    if (/alert|off|low|poor|empty|false|error/.test(v)) return '#f16e63';
    if (/moderate|warning|medium/.test(v)) return '#f2bd4b';
    return '#81af27';
  }

  const originalRender = render;
  render = function () { originalRender(); decorate(); };
  const originalDevicesView = devicesView;
  devicesView = function () {
    const html = originalDevicesView();
    return runtime.connected && devices.length === 0
      ? html.replace('No devices match your search.', 'No devices are available in this project.')
      : html;
  };
  function hasCoordinates(device) {
    const position = device?.position;
    if (position?.lat == null || position?.lng == null || position.lat === '' || position.lng === '') return false;
    const lat = Number(position.lat), lng = Number(position.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  locationsView = function (full = false) {
    const positioned = devices.filter(hasCoordinates);
    const note = positioned.length ? '' : runtime.connected
      ? 'Ginjer has not returned coordinates for devices in this project yet.'
      : 'Demo devices have no verified coordinates. Connect to Ginjer to map live devices.';
    const header = full ? pageBar('Device Map') : '';
    return `<section class="screen map-screen${full ? ' full-map' : ''}" aria-label="${full ? 'Device map' : 'Locations'}">
      <div id="interactive-map" role="application" aria-label="Interactive map. Pan and zoom to explore device locations."></div>
      ${header}<div class="map-top">${searchBar('Search Devices')}</div>
      ${note ? `<div class="map-empty-note" role="status">${note}</div>` : ''}
      <div class="map-bottom-caption">${positioned.length} of ${devices.length} devices have map coordinates</div>
      <div id="map-quick" aria-live="polite"></div>
      ${full ? '' : `<button class="map-fab" type="button" aria-label="Open full map" data-action="expand-map">${svg('globe')}</button>`}
      <div class="map-tile-error" role="status">Map tiles did not load. Check your internet connection.</div>
    </section>`;
  };

  function mapColor(device) {
    const status = device?.chips?.[0]?.[1];
    return ({ red: '#f16e63', amber: '#f2bd4b', blue: '#36a9d4', green: '#82ae25' })[status] || '#82ae25';
  }

  function showMapDevice(device) {
    const quick = document.getElementById('map-quick');
    const screen = app.querySelector('.map-screen');
    if (!quick || !screen) return;
    screen.classList.add('has-selection');
    quick.innerHTML = `<div class="map-quick-card"><span class="notice-icon ${device.chips?.[0]?.[1] || 'green'}">${svg(device.kind)}</span><span><span class="map-quick-title">${device.name}</span><span class="map-quick-sub">${device.loc} · Last heard ${device.heard}</span></span><button class="map-quick-open" type="button" aria-label="Open ${esc(device.name)} details">${svg('chevron')}</button></div>`;
    quick.querySelector('.map-quick-open').addEventListener('click', () => {
      state.device = device;
      state.previous = state.route;
      go('detail');
    });
  }

  function removeInteractiveMap() {
    mapState.generation++;
    if (mapState.instance) mapState.instance.remove();
    mapState.instance = null;
    mapState.element = null;
    mapState.markers = [];
  }

  function syncInteractiveMap() {
    const element = document.getElementById('interactive-map') || document.getElementById('device-map');
    if (!element) { removeInteractiveMap(); return; }
    if (mapState.element === element && mapState.instance) {
      requestAnimationFrame(() => mapState.instance?.invalidateSize({ pan: false }));
      return;
    }
    removeInteractiveMap();
    mapState.element = element;
    const generation = mapState.generation;
    requestAnimationFrame(() => {
      if (generation !== mapState.generation || !element.isConnected) return;
      if (!window.L) {
        element.innerHTML = '<p class="map-empty-note">The map library did not load. Restart the Alumhacks server and reload.</p>';
        return;
      }
      const isDetailMap = element.id === 'device-map';
      const map = window.L.map(element, { zoomControl: !isDetailMap, scrollWheelZoom: false, tap: true });
      mapState.instance = map;
      const tiles = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map);
      const shell = element.closest('.map-screen');
      tiles.on('tileerror', () => shell?.classList.add('tile-error'));
      tiles.on('tileload', () => shell?.classList.remove('tile-error'));

      const selected = isDetailMap ? state.device : (state.route === 'map' && state.previous === 'detail' ? state.device : null);
      const positioned = isDetailMap
        ? (selected && hasCoordinates(selected) ? [selected] : [])
        : devices.filter(hasCoordinates);
      const markers = [];
      for (const device of positioned) {
        const latLng = [Number(device.position.lat), Number(device.position.lng)];
        const icon = window.L.divIcon({
          className: 'device-map-icon',
          html: `<span style="--marker-color:${mapColor(device)}">${svg(device.kind)}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 34]
        });
        const marker = window.L.marker(latLng, { icon, title: device.name, alt: device.name, keyboard: true }).addTo(map);
        marker.bindTooltip(device.name, { direction: 'top', offset: [0, -24] });
        marker.on('click', () => {
          if (isDetailMap) {
            marker.bindPopup(`<strong>${device.name}</strong><br>${device.loc}<br>${latLng[0]}, ${latLng[1]}`).openPopup();
          } else {
            showMapDevice(device);
          }
        });
        markers.push({ device, marker });
      }
      mapState.markers = markers;
      if (positioned.length > 1) {
        map.fitBounds(window.L.latLngBounds(positioned.map(device => [Number(device.position.lat), Number(device.position.lng)])), { padding: [42, 42], maxZoom: 14 });
      } else if (positioned.length === 1) {
        map.setView([Number(positioned[0].position.lat), Number(positioned[0].position.lng)], 13);
      } else {
        const projectLocation = runtime.activeProject?.location;
        if (hasCoordinates({ position: projectLocation })) {
          map.setView([Number(projectLocation.lat), Number(projectLocation.lng)], 11);
        } else {
          map.setView([22.9734, 78.6569], 4);
        }
      }
      requestAnimationFrame(() => map.invalidateSize({ pan: false }));
      if (!isDetailMap && selected && hasCoordinates(selected)) showMapDevice(selected);
      if (mapState.query) filterMapDevices(mapState.query);
    });
  }

  function filterMapDevices(query) {
    const normalized = String(query || '').trim().toLowerCase();
    mapState.query = normalized;
    for (const { device, marker } of mapState.markers) {
      const matches = !normalized || `${device.name} ${device.id} ${device.loc}`.toLowerCase().includes(normalized);
      const icon = marker.getElement();
      if (icon) icon.style.display = matches ? '' : 'none';
    }
  }
  window.filterAlumhacksMapDevices = filterMapDevices;

  const originalAnalyticsView = analyticsView;
  analyticsView = function () {
    if (!runtime.connected) return originalAnalyticsView();
    const cards = devices.flatMap(d => d.outputs.map(o => metricCard(o.outputName || o.label || 'Device output', `${d.name} · ${d.loc}`, 'value', formatValue(o.value ?? o.label), d.id, d.heard))).join('');
    return `<section class="screen view-pad" aria-label="Analytics"><button class="selector" type="button" data-action="dashboard"><span class="leading">${svg('chart')}<span>${esc(runtime.activeProject?.name || 'Project')}</span></span>${svg('down')}</button><div class="api-note">The supplied API returns current device outputs, not historical analytics. Values below are device outputs.</div><div class="metric-list">${cards || '<div class="empty-state">No output values were returned for this project.</div>'}</div></section>`;
  };
  const originalNotificationsView = notificationsView;
  notificationsView = function () {
    const html = originalNotificationsView();
    if (!runtime.connected) return html;
    return html.replace('<div class="notice-list"', '<div class="api-note notification-api-note">Sample alerts · the supplied API collection has no notifications operation.</div><div class="notice-list"');
  };
  const originalDetailView = detailView;
  detailView = function () {
    if (!runtime.connected || !state.device?.apiId) return originalDetailView();
    const d = state.device;
    const outputs = d.outputs.map((o,i) => `<div class="output-card"><span>${esc(o.outputName || o.label || `Output ${i+1}`)}</span><strong>${esc(formatValue(o.value ?? o.label))}</strong><i class="output-state" style="background:${outputStatus(o.value,o.color)}"></i></div>`).join('');
    const attributes = d.attributes.map(a => `<div><strong>${esc(a.attributeName || 'Attribute')}</strong> · ${esc(formatValue(a.value))}</div>`).join('');
    const location = d.position?.placeName || d.clusterName || 'Location unavailable';
    return `<section class="screen live-detail" aria-label="Device details">${pageBar('Device Details',buttonIcon('more','More options','detail-options'))}<div class="detail-body"><div class="detail-summary">${thumb(d.kind,d.color)}<div><span class="device-title">${esc(d.name)}</span><span class="detail-id">DevEUI · ${esc(d.id)}</span><span class="detail-last">Last heard · ${esc(d.heard)}</span></div></div><div class="detail-fields"><div class="detail-field"><label>Location</label><strong>${esc(location)}</strong></div><div class="detail-field"><label>Main Output</label><strong>${esc(d.output)}</strong></div></div><button class="more-button" type="button" data-action="see-more">${state.expanded?'See less':'See more'}${svg(state.expanded?'up':'down')}</button>${state.expanded?`<div class="detail-expand"><strong>Device type</strong> · ${esc(d.hardwareType || 'Not reported')}<br><strong>Network ID</strong> · ${esc(d.networkId || 'Not reported')}<br>${attributes || '<strong>Attributes</strong> · None returned'}</div>`:''}<h2 class="detail-section-title">Outputs</h2><div class="output-grid">${outputs || '<div class="empty-state">No outputs returned for this device.</div>'}</div><h2 class="detail-section-title">Location</h2>${miniMap()}<div class="detail-expand">${esc(location)}${d.position?.lat != null && d.position?.lng != null ? ` · ${esc(d.position.lat)}, ${esc(d.position.lng)}` : ''}</div><button class="mini-map-button" type="button" data-action="expand-map">${svg('map')}View Map</button><div class="detail-actions"><button class="action-secondary" type="button" data-action="refresh">Refresh data</button><button class="action-primary" type="button" data-action="downlink">Send Downlink</button></div></div></section>`;
  };

  function openDownlink() {
    const interfaces = runtime.modules.filter(m => m.moduleType === 'DOWNLINK_INTERFACE');
    const d = state.device;
    if (!runtime.connected) {
      overlayRoot.innerHTML = '<div class="scrim"><section class="sheet api-sheet downlink-sheet" role="dialog" aria-modal="true" aria-labelledby="downlink-title"><div class="sheet-grabber"></div><h2 id="downlink-title">Send Downlink</h2><p class="sheet-subtitle">Connect to Ginjer with an API token to send this command.</p><div class="downlink-illustration" aria-hidden="true"></div><label class="api-label downlink-field">Select<select disabled aria-label="Select downlink interface"><option></option></select></label><label class="api-label downlink-field">Value<textarea rows="1" disabled aria-label="Downlink value"></textarea></label><div class="sheet-actions"><button class="action-secondary" type="button" data-api-close>Cancel</button><button class="action-primary" type="button" data-api-connect>Save</button></div></section></div>';
      overlayRoot.querySelector('[data-api-close]').onclick = () => overlayRoot.innerHTML = '';
      overlayRoot.querySelector('[data-api-connect]').onclick = () => openConnect('token');
      return;
    }
    const options = interfaces.map(m => '<option value="' + esc(m._id) + '">' + esc(m.label || m._id) + '</option>').join('');
    overlayRoot.innerHTML = '<div class="scrim"><section class="sheet api-sheet downlink-sheet" role="dialog" aria-modal="true" aria-labelledby="downlink-title"><div class="sheet-grabber"></div><h2 id="downlink-title">Send Downlink</h2><p class="sheet-subtitle">Choose a downlink interface and enter the JSON command for ' + esc(d?.name || 'this device') + '.</p><div class="downlink-illustration" aria-hidden="true"></div><label class="api-label downlink-field">Select<select id="downlink-interface" required>' + (options || '<option value="">No downlink interface available</option>') + '</select></label><label class="api-label downlink-field">Value<textarea id="downlink-value" rows="1" spellcheck="false" placeholder="JSON object, for example {&quot;value&quot;:1}">{}</textarea></label><p class="api-error" role="alert"></p><div class="sheet-actions"><button class="action-secondary" type="button" data-api-close>Cancel</button><button class="action-primary" type="button" data-api-send ' + (interfaces.length ? '' : 'disabled') + '>Send</button></div></section></div>';
    overlayRoot.querySelector('[data-api-close]').onclick = () => overlayRoot.innerHTML = '';
    overlayRoot.querySelector('[data-api-send]').onclick = async e => {
      const button = e.currentTarget, error = overlayRoot.querySelector('.api-error');
      let value;
      try { value = JSON.parse(overlayRoot.querySelector('#downlink-value').value); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a JSON object.'); }
      catch (err) { error.textContent = err.message; return; }
      button.disabled = true; button.textContent = 'Sending…'; error.textContent = '';
      try {
        const result = await request(queries.downlink, { action: { organisationId: runtime.activeOrg.organisationId, deviceId: d.apiId, downlinkInterfaceId: overlayRoot.querySelector('#downlink-interface').value, value } });
        overlayRoot.innerHTML = '';
        showToast(result.sendDownlink?.message || 'Ginjer accepted the downlink request.');
      } catch (err) { error.textContent = err.message; button.disabled = false; button.textContent = 'Send'; }
    };
  }
  function decorate() {
    if (state.route === 'profile') {
      const menu = app.querySelector('.profile-menu');
      if (menu && !app.querySelector('.api-panel')) {
        const panel = document.createElement('section');
        panel.className = 'api-panel';
        panel.innerHTML = runtime.connected
          ? `<div class="api-panel-title"><i class="api-dot live"></i><span>Connected to Ginjer</span></div><div class="api-panel-sub">${esc(runtime.activeOrg?.name || '')} · ${esc(runtime.activeProject?.name || '')}</div><button class="api-panel-button" type="button" data-api-project>Change project</button><button class="api-panel-button" type="button" data-api-org>Change organization</button><button class="api-panel-button muted" type="button" data-api-disconnect>Disconnect</button>${runtime.error?`<p class="api-error">${esc(runtime.error)}</p>`:''}`
          : `<div class="api-panel-title"><i class="api-dot"></i><span>Demo data</span></div><div class="api-panel-sub">Connect your Ginjer account to load live organizations, projects, and devices.</div><button class="action-primary api-connect-button" type="button" data-api-connect>Connect to Ginjer</button>${runtime.error?`<p class="api-error">${esc(runtime.error)}</p>`:''}`;
        menu.after(panel);
        panel.querySelector('[data-api-connect]')?.addEventListener('click', openConnect);
        panel.querySelector('[data-api-project]')?.addEventListener('click', openProjects);
        panel.querySelector('[data-api-org]')?.addEventListener('click', openOrganisations);
        panel.querySelector('[data-api-disconnect]')?.addEventListener('click', disconnect);
      }
    }
    if (runtime.connected && state.route === 'analytics') {
      const title = app.querySelector('.api-note');
      if (title) title.title = 'Analytics and historical telemetry are not included in the supplied Postman collection.';
    }
  }

  function disconnect() {
    clearBackendToken();
    runtime.token = ''; runtime.connected = false; runtime.organisations = []; runtime.projects = []; runtime.modules = []; runtime.activeOrg = null; runtime.activeProject = null; runtime.details.clear(); runtime.error = '';
    devices.splice(0, devices.length, ...demoDevices.map(d => ({ ...d, chips: d.chips.map(c => [...c]) })));
    state.profileName = demoProfile.name; state.profileEmail = demoProfile.email; state.activeOrgName = ''; state.activeProjectName = ''; state.device = devices[1];
    state.route = 'login'; state.tab = 'devices'; render(); showToast('Signed out.');
  }

  async function refreshLiveData() {
    if (!runtime.connected || !runtime.activeProject) return;
    try { await loadProject(runtime.activeProject); showToast('Device data refreshed from Ginjer.'); }
    catch (err) { showToast(`Refresh failed: ${err.message || 'Ginjer request failed.'}`); }
  }

  function decorateStatusNotes() {
    if (!runtime.connected) return;
    if (state.route === 'notifications' && !app.querySelector('.notification-api-note')) {
      const list = app.querySelector('.notice-list');
      list?.insertAdjacentHTML('beforebegin', '<div class="api-note notification-api-note">Sample alerts · the supplied API collection has no notifications operation.</div>');
    }
  }

  const priorRender = render;
  render = function () { priorRender(); decorate(); decorateStatusNotes(); syncInteractiveMap(); };
  const priorOpenOrganizations = openOrganizations;
  openOrganizations = function () { if (runtime.connected) return openOrganisations(); return priorOpenOrganizations(); };
  const priorOpenDashboard = openDashboard;
  openDashboard = function () { if (runtime.connected) return openProjects(); return priorOpenDashboard(); };
  const priorOpenDownlink = openDownlink;
  openDownlink = function () { return priorOpenDownlink(); };

  app.addEventListener('submit', event => {
    const form = event.target;
    if (form?.id !== 'login-screen-form') return;
    event.preventDefault();
    signIn(form.elements.email.value.trim(), form.elements.password.value, form);
  }, true);
  app.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'token-login') { event.stopImmediatePropagation(); event.preventDefault(); openConnect('token'); return; }
    if (action === 'preview-demo') { event.stopImmediatePropagation(); event.preventDefault(); state.route = 'devices'; state.tab = 'devices'; render(); return; }
    if (!runtime.connected) return;
    if (action === 'logout') { event.stopImmediatePropagation(); event.preventDefault(); disconnect(); }
    else if (action === 'project') { event.stopImmediatePropagation(); event.preventDefault(); openProjects(); }
    else if (action === 'save-profile') { event.stopImmediatePropagation(); event.preventDefault(); showToast('Profile updates are not available in the supplied API.'); }
    else if (action === 'refresh') { event.stopImmediatePropagation(); event.preventDefault(); refreshLiveData(); }
  }, true);

  window.addEventListener('pagehide', clearBackendToken);

  const style = document.createElement('style');
  style.textContent = `.api-panel{margin:14px 16px 10px;padding:14px;border:1px solid #e9eee2;border-radius:12px;background:#fff;box-shadow:var(--shadow-soft)}.api-panel-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650}.api-dot{width:9px;height:9px;border-radius:50%;background:#f2bd4b;box-shadow:0 0 0 4px #f2bd4b22}.api-dot.live{background:#81af27;box-shadow:0 0 0 4px #81af2722}.api-panel-sub{margin:6px 0 10px;color:#818984;font-size:10px;line-height:1.5}.api-panel-button{margin:2px 4px 2px 0;padding:6px 9px;border:1px solid #e8eddf;border-radius:8px;background:#fff;color:#6d9820;font-size:10px}.api-panel-button.muted{color:#777}.api-connect-button{width:100%;min-height:36px;font-size:11px}.api-note{padding:8px 10px;margin:10px 0;border:1px solid #e7eddc;border-radius:9px;background:#f5f8ef;color:#6f7b69;font-size:9px;line-height:1.45}.notification-api-note{margin:10px 14px 0}.api-sheet{max-height:min(90%,720px);overflow:auto}.api-label{display:grid;gap:6px;margin-top:12px;color:#687168;font-size:10px}.api-label input,.api-label select,.api-label textarea{width:100%;min-height:40px;padding:10px;border:1px solid #e4e9df;border-radius:9px;background:#fff;color:#29302b;font:inherit;font-size:12px}.api-label textarea{resize:vertical;font-family:ui-monospace,Consolas,monospace}.api-privacy{margin:10px 0 0;color:#858c86;font-size:9px;line-height:1.5}.api-error{min-height:14px;margin:8px 0 0;color:#bb5148;font-size:10px;line-height:1.4;white-space:normal}.api-map-note{position:absolute;z-index:4;left:14px;right:14px;top:75px;padding:9px 11px;border-radius:9px;background:#ffffffed;color:#737b72;font-size:10px;line-height:1.4}.api-sheet [disabled]{opacity:.5;cursor:not-allowed}`;
  style.textContent += '.api-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;margin:12px 0;border-radius:10px;background:#f2f4ee}.api-auth-tabs button{min-height:34px;border:0;border-radius:7px;background:transparent;color:#727b71;font:inherit;font-size:10px}.api-auth-tabs button.active{background:#fff;color:#516f24;box-shadow:0 1px 4px #00000012}.api-label input[name="token"]{font-family:ui-monospace,Consolas,monospace;font-size:11px}';
  document.head.append(style);
  decorate();
})();
