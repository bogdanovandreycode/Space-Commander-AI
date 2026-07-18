import logoUrl from '../assets/branding/logo.webp';
import { dictionaries } from './i18n/index.js';
import { renderMarkdown } from './renderMarkdown.js';

export class UiShell {
  constructor(root, { locale, configs, lore }) {
    this.root = root;
    this.locale = locale;
    this.t = dictionaries[locale];
    this.configs = configs;
    this.lore = lore;
    this.handlers = {};
    this.activityItems = [];
    this.externalEvents = [];
    this.#mount();
  }

  on(handlers) {
    this.handlers = handlers;
  }

  get boardHost() {
    return this.refs.board;
  }

  setLoading(progress) {
    this.refs.loadingProgress.style.width = `${Math.round(progress * 100)}%`;
    this.refs.loadingValue.textContent = `${Math.round(progress * 100)}%`;
  }

  showMenu({ canContinue = false, error = '' } = {}) {
    this.refs.loading.hidden = true;
    this.refs.game.hidden = true;
    this.refs.faction.hidden = true;
    this.refs.menu.hidden = false;
    this.refs.continueButton.hidden = !canContinue;
    this.refs.clearButton.hidden = !canContinue;
    this.refs.menuError.textContent = error;
  }

  showFactionSelect() {
    this.refs.menu.hidden = true;
    this.refs.faction.hidden = false;
  }

  showGame() {
    this.refs.loading.hidden = true;
    this.refs.menu.hidden = true;
    this.refs.faction.hidden = true;
    this.refs.game.hidden = false;
  }

  updateGame({ snapshot, selection, legalActions, purchaseActions }) {
    const human = snapshot.humanFaction;
    const ai = snapshot.aiFaction;
    this.root.classList.toggle('human-ignis', human === 'ignis');
    this.root.classList.toggle('human-cryos', human === 'cryos');
    this.refs.round.textContent = String(snapshot.round);
    this.refs.humanFaction.textContent = this.configs.factions.factions[human].shortName;
    this.refs.aiFaction.textContent = this.configs.factions.factions[ai].shortName;
    this.refs.humanCredits.textContent = String(snapshot.factions[human].credits);
    this.refs.aiCredits.textContent = String(snapshot.factions[ai].credits);
    this.refs.humanFleet.textContent = String(snapshot.ships.filter((ship) => ship.faction === human).length);
    this.refs.aiFleet.textContent = String(snapshot.ships.filter((ship) => ship.faction === ai).length);
    this.refs.endTurn.disabled = snapshot.activeFaction !== human || Boolean(snapshot.winner);
    this.#renderSelected(selection, snapshot, legalActions);
    this.#renderShipyard(selection, snapshot, purchaseActions);
    this.#renderReports(snapshot);
    if (snapshot.winner) this.showVictory(snapshot.winner === human);
  }

  setBusy(busy) {
    this.root.classList.toggle('is-busy', busy);
    this.refs.endTurn.disabled = busy || this.refs.endTurn.disabled;
  }

  setActivity(activity) {
    const message = typeof activity === 'string' ? activity : activity.message;
    this.refs.activityCurrent.textContent = message;
    this.activityItems.push(message);
    this.activityItems = this.activityItems.slice(-8);
    this.refs.activityLog.replaceChildren(...this.activityItems.map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
  }

  addEvent(event) {
    const text = this.#eventText(event);
    if (!text) return;
    this.externalEvents.push(text);
    this.externalEvents = this.externalEvents.slice(-12);
    this.refs.eventLog.replaceChildren(...this.externalEvents.map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
  }

  showError(message) {
    this.refs.toast.textContent = message;
    this.refs.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.refs.toast.hidden = true; }, 6000);
  }

  showVictory(won) {
    this.refs.victoryTitle.textContent = won ? this.t.victory : this.t.defeat;
    this.refs.victory.classList.toggle('defeat', !won);
    this.refs.victory.showModal();
  }

  openSettings(settings) {
    const form = this.refs.settingsForm;
    for (const [key, value] of Object.entries(settings)) {
      const input = form.elements.namedItem(key);
      if (!input) continue;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = String(value);
    }
    this.refs.connectionStatus.textContent = '';
    this.refs.settings.showModal();
  }

  readSettings() {
    const form = new FormData(this.refs.settingsForm);
    const numberKeys = new Set([
      'headquartersTemperature', 'procurementTemperature', 'unitTemperature', 'reportTemperature',
      'headquartersNumPredict', 'procurementNumPredict', 'unitNumPredict', 'reportNumPredict',
      'headquartersContextSize', 'procurementContextSize', 'unitContextSize', 'reportContextSize',
      'tacticalRadius', 'timeoutMs',
    ]);
    const settings = {};
    for (const [key, value] of form.entries()) settings[key] = numberKeys.has(key) ? Number(value) : value;
    for (const key of ['headquartersThink', 'reportsEnabled', 'fallbackEnabled', 'debug', 'llmEnabled']) {
      settings[key] = this.refs.settingsForm.elements.namedItem(key).checked;
    }
    return settings;
  }

  setConnectionStatus(message, ok = false) {
    this.refs.connectionStatus.textContent = message;
    this.refs.connectionStatus.classList.toggle('ok', ok);
  }

  #mount() {
    this.root.innerHTML = `
      <div class="loading-screen" data-ref="loading">
        <div class="loading-card">
          <img src="${logoUrl}" alt="Space Commander" class="loading-logo">
          <p>Synchronizing orbital assets</p>
          <div class="loading-track"><span data-ref="loadingProgress"></span></div>
          <strong data-ref="loadingValue">0%</strong>
        </div>
      </div>

      <main class="menu-screen" data-ref="menu" hidden>
        <div class="menu-backdrop"></div>
        <section class="menu-panel">
          <img src="${logoUrl}" alt="" class="menu-logo">
          <p class="eyebrow">${this.t.subtitle}</p>
          <h1>${this.t.brand}</h1>
          <p class="menu-copy">${this.locale === 'ru'
            ? 'Две доктрины делят умирающую галактику. Командуйте флотом, захватывайте Серые миры и не отдайте противнику последнюю планету.'
            : 'Two doctrines divide a dying galaxy. Command your fleet, claim the Grey Worlds, and protect your last planet.'}</p>
          <div class="menu-actions">
            <button class="primary large" data-action="new">${this.t.newGame}</button>
            <button data-ref="continueButton" data-action="continue">${this.t.continue}</button>
            <button class="ghost danger" data-ref="clearButton" data-action="clear">${this.t.clearSave}</button>
          </div>
          <p class="error-copy" data-ref="menuError"></p>
        </section>
      </main>

      <main class="faction-screen" data-ref="faction" hidden>
        <div class="screen-heading">
          <p class="eyebrow">${this.t.subtitle}</p>
          <h1>${this.t.chooseFaction}</h1>
        </div>
        <div class="faction-grid">
          <button class="faction-card cryos-card" data-faction="cryos">
            <span class="faction-sigil">◈</span>
            <strong>${this.t.cryos}</strong>
            <small>${this.t.cryosDesc}</small>
          </button>
          <button class="faction-card ignis-card" data-faction="ignis">
            <span class="faction-sigil">✦</span>
            <strong>${this.t.ignis}</strong>
            <small>${this.t.ignisDesc}</small>
          </button>
        </div>
        <button class="ghost" data-action="menu">← ${this.t.backToMenu}</button>
      </main>

      <main class="game-screen" data-ref="game" hidden>
        <header class="command-bar">
          <div class="brand-lockup"><span class="brand-mark">SC</span><div><strong>${this.t.brand}</strong><small>${this.t.subtitle}</small></div></div>
          <div class="turn-chip"><span>${this.t.round}</span><strong data-ref="round">1</strong></div>
          <nav>
            <button class="ghost compact" data-action="archive">${this.t.archive}</button>
            <button class="ghost compact" data-action="settings">${this.t.settings}</button>
            <button class="ghost compact" data-action="language">${this.locale.toUpperCase()}</button>
            <button class="ghost compact" data-action="restart">${this.t.restart}</button>
          </nav>
        </header>

        <section class="battle-layout">
          <aside class="fleet-panel human-panel">
            <p class="eyebrow">${this.t.yourFleet}</p>
            <h2 data-ref="humanFaction">Cryos</h2>
            <div class="metric"><span>${this.t.credits}</span><strong data-ref="humanCredits">25</strong></div>
            <div class="metric"><span>${this.t.yourFleet}</span><strong data-ref="humanFleet">1</strong></div>
            <section class="mini-panel">
              <h3>${this.t.selected}</h3>
              <div data-ref="selectedPanel" class="selected-panel"></div>
            </section>
          </aside>

          <section class="board-column">
            <div class="board-frame" data-ref="board"></div>
            <button class="primary end-turn" data-ref="endTurn" data-action="end-turn">${this.t.endTurn}<span>→</span></button>
          </section>

          <aside class="fleet-panel ai-panel">
            <p class="eyebrow">${this.t.enemyFleet}</p>
            <h2 data-ref="aiFaction">Ignis</h2>
            <div class="metric"><span>${this.t.credits}</span><strong data-ref="aiCredits">25</strong></div>
            <div class="metric"><span>${this.t.enemyFleet}</span><strong data-ref="aiFleet">1</strong></div>
            <section class="mini-panel activity-panel">
              <h3>${this.t.activity}</h3>
              <p class="activity-current" data-ref="activityCurrent">Tactical link ready.</p>
              <ol data-ref="activityLog"></ol>
            </section>
          </aside>
        </section>

        <section class="intel-grid">
          <article class="intel-card shipyard-card">
            <h3>${this.t.shipyard}</h3>
            <div data-ref="shipyard"></div>
          </article>
          <article class="intel-card">
            <h3>${this.t.events}</h3>
            <ol class="event-log" data-ref="eventLog"></ol>
          </article>
          <article class="intel-card">
            <h3>${this.t.reports}</h3>
            <div class="reports-list" data-ref="reports"></div>
          </article>
        </section>
      </main>

      <dialog class="modal" data-ref="settings">
        <form data-ref="settingsForm">
          <header><div><p class="eyebrow">OLLAMA CONTROL</p><h2>${this.t.settings}</h2></div><button type="button" class="icon-button" data-close="settings">×</button></header>
          <div class="settings-grid">
            ${this.#settingsFields()}
          </div>
          <p class="connection-status" data-ref="connectionStatus"></p>
          <footer>
            <button type="button" class="ghost" data-action="test-connection">${this.t.testConnection}</button>
            <button type="submit" class="primary">${this.t.saveSettings}</button>
          </footer>
        </form>
      </dialog>

      <dialog class="modal lore-modal" data-ref="archive">
        <header><div><p class="eyebrow">CLASSIFIED ARCHIVE</p><h2>${this.t.archive}</h2></div><button type="button" class="icon-button" data-close="archive">×</button></header>
        <div class="lore-content" data-ref="lore"></div>
      </dialog>

      <dialog class="victory-modal" data-ref="victory">
        <p class="eyebrow">${this.t.subtitle}</p>
        <h2 data-ref="victoryTitle">${this.t.victory}</h2>
        <p>${this.locale === 'ru' ? 'Температурный баланс галактики изменён.' : 'The thermal balance of the galaxy has changed.'}</p>
        <button class="primary" data-action="menu">${this.t.backToMenu}</button>
      </dialog>

      <div class="toast" data-ref="toast" hidden></div>
    `;
    this.refs = Object.fromEntries(
      [...this.root.querySelectorAll('[data-ref]')].map((element) => [element.dataset.ref, element]),
    );
    this.refs.lore.append(renderMarkdown(this.lore));
    this.root.addEventListener('click', (event) => this.#handleClick(event));
    this.refs.settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handlers.saveSettings?.(this.readSettings());
      this.refs.settings.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        for (const dialog of this.root.querySelectorAll('dialog[open]')) dialog.close();
      }
    });
  }

  #handleClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.close) this.refs[button.dataset.close]?.close();
    if (button.dataset.faction) this.handlers.newGame?.(button.dataset.faction);
    if (button.dataset.build) this.handlers.build?.(Number(button.dataset.build));
    const action = button.dataset.action;
    if (action === 'new') this.showFactionSelect();
    if (action === 'continue') this.handlers.continueGame?.();
    if (action === 'clear') this.handlers.clearSave?.();
    if (action === 'menu') {
      this.refs.victory.open && this.refs.victory.close();
      this.handlers.menu?.();
    }
    if (action === 'end-turn') this.handlers.endTurn?.();
    if (action === 'settings') this.handlers.openSettings?.();
    if (action === 'archive') this.refs.archive.showModal();
    if (action === 'restart') this.handlers.restart?.();
    if (action === 'language') this.handlers.language?.();
    if (action === 'test-connection') this.handlers.testConnection?.(this.readSettings());
  }

  #renderSelected(selection, snapshot, legalActions) {
    const panel = this.refs.selectedPanel;
    panel.replaceChildren();
    if (!selection) {
      panel.textContent = this.t.selectObject;
      return;
    }
    const title = document.createElement('strong');
    const meta = document.createElement('p');
    if (selection.kind === 'ship') {
      const ship = snapshot.ships.find((item) => item.id === selection.id);
      if (!ship) return;
      const definition = this.configs.ships.ships[ship.type];
      title.textContent = definition.displayName[this.locale];
      meta.textContent = `HP ${ship.hp}/${definition.stats.maxHp} · ATK ${definition.stats.attack}`;
      const status = document.createElement('small');
      status.textContent = ship.hasActed
        ? (this.locale === 'ru' ? 'Действие выполнено' : 'Action spent')
        : `${legalActions.length} legal actions`;
      panel.append(title, meta, status);
    } else {
      const planet = snapshot.planets.find((item) => item.id === selection.id);
      if (!planet) return;
      const definition = this.configs.planets.planetTypes[planet.type];
      title.textContent = definition.displayName[this.locale];
      meta.textContent = `HP ${planet.hp}/${definition.maxHp} · +${definition.incomePerTurn}`;
      panel.append(title, meta);
    }
  }

  #renderShipyard(selection, snapshot, purchaseActions) {
    const host = this.refs.shipyard;
    host.replaceChildren();
    const planet = selection?.kind === 'planet'
      ? snapshot.planets.find((item) => item.id === selection.id)
      : null;
    if (!planet || planet.faction !== snapshot.humanFaction) {
      host.textContent = this.t.selectPlanet;
      return;
    }
    for (const [type, definition] of Object.entries(this.configs.ships.ships)) {
      const action = purchaseActions.find((item) => item.planetId === planet.id && item.unitType === type);
      const button = document.createElement('button');
      button.className = 'shipyard-item';
      button.disabled = !action;
      if (action) button.dataset.build = String(action.id);
      const name = document.createElement('strong');
      name.textContent = definition.displayName[this.locale];
      const stats = document.createElement('span');
      stats.textContent = `ATK ${definition.stats.attack} · HP ${definition.stats.maxHp}`;
      const cost = document.createElement('b');
      cost.textContent = `${definition.cost} ◈`;
      const reason = document.createElement('small');
      reason.textContent = action ? '' : this.#purchaseReason(planet, snapshot, definition);
      button.append(name, stats, cost, reason);
      host.append(button);
    }
  }

  #purchaseReason(planet, snapshot, definition) {
    const ownerTurn = snapshot.factions[snapshot.humanFaction].ownerTurns;
    if (snapshot.winner) return this.t.gameOver;
    if (snapshot.factions[snapshot.humanFaction].credits < definition.cost) return this.t.insufficientCredits;
    if (snapshot.ships.some((ship) => ship.x === planet.x && ship.y === planet.y)) return this.t.occupied;
    if (planet.productionUsedOwnerTurn === ownerTurn) return this.t.productionUsed;
    if (planet.readyFromOwnerTurn > ownerTurn) return this.t.colonyNotReady;
    return this.t.gameOver;
  }

  #renderReports(snapshot) {
    const reports = [...snapshot.unitReports]
      .sort((a, b) => (b.round ?? 0) - (a.round ?? 0))
      .slice(0, 8);
    this.refs.reports.replaceChildren(...reports.map((report) => {
      const article = document.createElement('article');
      const title = document.createElement('strong');
      title.textContent = report.callsign;
      const body = document.createElement('p');
      body.textContent = report.report;
      article.append(title, body);
      return article;
    }));
    if (!reports.length) this.refs.reports.textContent = this.locale === 'ru' ? 'Рапортов пока нет.' : 'No reports yet.';
  }

  #eventText(event) {
    const result = event?.actualResult ?? event;
    if (!result) return '';
    if (event.eventType === 'UNIT_REPORT') return `${event.report.status}: ${event.report.report}`;
    if (result.actionType === 'BUILD') return `BUILD · ${result.unitType} · −${result.cost}`;
    if (result.actionType === 'MOVE') return `MOVE · #${result.unitId} → ${result.to.join(':')}`;
    if (result.actionType === 'ATTACK_UNIT' || result.actionType === 'ATTACK_PLANET') {
      return `ATTACK · #${result.unitId} · ${result.damageDealt} DMG${result.targetDestroyed ? ' · DESTROYED' : ''}`;
    }
    if (result.actionType === 'COLONIZE') return `COLONIZE · planet #${result.colonizedPlanetId}`;
    if (result.actionType === 'WAIT') return `WAIT · #${result.unitId}`;
    return '';
  }

  #settingsFields() {
    const textInput = (name, label, type = 'text', step = '') => `
      <label><span>${label}</span><input name="${name}" type="${type}" ${step ? `step="${step}"` : ''} required></label>`;
    return `
      ${textInput('ollamaUrl', 'Ollama URL')}
      ${textInput('keepAlive', 'Keep alive')}
      ${textInput('headquartersModel', 'Headquarters model')}
      ${textInput('unitModel', 'Unit model')}
      ${textInput('procurementModel', 'Procurement model')}
      ${textInput('reportModel', 'Report model')}
      ${textInput('timeoutMs', 'Timeout (ms)', 'number')}
      ${textInput('tacticalRadius', 'Tactical radius', 'number')}
      ${textInput('headquartersTemperature', 'HQ temperature', 'number', '0.1')}
      ${textInput('unitTemperature', 'Unit temperature', 'number', '0.1')}
      ${textInput('procurementTemperature', 'Procurement temperature', 'number', '0.1')}
      ${textInput('reportTemperature', 'Report temperature', 'number', '0.1')}
      ${textInput('headquartersNumPredict', 'HQ num_predict', 'number')}
      ${textInput('unitNumPredict', 'Unit num_predict', 'number')}
      ${textInput('procurementNumPredict', 'Procurement num_predict', 'number')}
      ${textInput('reportNumPredict', 'Report num_predict', 'number')}
      ${textInput('headquartersContextSize', 'HQ num_ctx', 'number')}
      ${textInput('unitContextSize', 'Unit num_ctx', 'number')}
      ${textInput('procurementContextSize', 'Procurement num_ctx', 'number')}
      ${textInput('reportContextSize', 'Report num_ctx', 'number')}
      <label class="check"><input name="llmEnabled" type="checkbox"><span>LLM AI enabled</span></label>
      <label class="check"><input name="headquartersThink" type="checkbox"><span>HQ think</span></label>
      <label class="check"><input name="reportsEnabled" type="checkbox"><span>Reports enabled</span></label>
      <label class="check"><input name="fallbackEnabled" type="checkbox"><span>Fallback enabled</span></label>
      <label class="check"><input name="debug" type="checkbox"><span>Debug diagnostics</span></label>
    `;
  }
}
