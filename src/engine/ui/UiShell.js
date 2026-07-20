import logoUrl from '../assets/branding/logo.webp';
import { dictionaries } from './i18n/index.js';
import { renderMarkdown } from './renderMarkdown.js';

const MODEL_FIELDS = [
  ['headquartersDecisionModel', 'HQ · decision'],
  ['headquartersFallbackModel', 'HQ · reserve (think off)'],
  ['headquartersReportModel', 'HQ · report'],
  ['procurementDecisionModel', 'Procurement · decision'],
  ['procurementReportModel', 'Procurement · report'],
  ['unitDecisionModel', 'Unit · decision'],
  ['unitReportModel', 'Unit · report'],
];

export class UiShell {
  constructor(root, { locale, configs, lore }) {
    this.root = root;
    this.locale = locale;
    this.t = dictionaries[locale];
    this.configs = configs;
    this.lore = lore;
    this.handlers = {};
    this.activityItems = [];
    this.lastSnapshot = null;
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

  updateGame({
    snapshot,
    selection,
    legalActions,
    purchaseActions,
    selectedHistory = [],
    selectedEconomy = null,
  }) {
    this.lastSnapshot = snapshot;
    const human = snapshot.humanFaction;
    this.root.classList.toggle('human-ignis', human === 'ignis');
    this.root.classList.toggle('human-cryos', human === 'cryos');
    this.refs.round.textContent = String(snapshot.round);
    this.refs.humanFaction.textContent = this.configs.factions.factions[human].shortName;
    this.refs.humanCredits.textContent = String(snapshot.factions[human].credits);
    this.refs.humanFleet.textContent = String(snapshot.ships.filter((ship) => ship.faction === human).length);
    this.refs.humanIncome.textContent = `+${this.#projectedIncome(snapshot, human)}`;
    this.refs.endTurn.disabled = snapshot.activeFaction !== human || Boolean(snapshot.winner);
    this.#renderContext({
      snapshot,
      selection,
      legalActions,
      purchaseActions,
      selectedHistory,
      selectedEconomy,
    });
    this.#renderActivityReports(snapshot);
    this.#renderEventLog(snapshot);
    if (snapshot.winner) this.showVictory(snapshot.winner === human);
  }

  setBusy(busy) {
    this.root.classList.toggle('is-busy', busy);
    if (busy) this.refs.endTurn.disabled = true;
  }

  setActivity(activity) {
    const message = typeof activity === 'string' ? activity : activity.message;
    if (!message) return;
    this.refs.activityCurrent.textContent = message;
    this.activityItems.push(message);
    this.activityItems = this.activityItems.slice(-50);
    this.refs.activityLog.replaceChildren(...this.activityItems.map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
  }

  addEvent() {
    // Confirmed transactions are rendered from GameState.eventLog on the next refresh.
  }

  showBoardTooltip(objects, anchor) {
    if (!objects?.length || !anchor) {
      this.refs.boardTooltip.hidden = true;
      return;
    }
    const lines = objects.map(({ kind, entity }) => {
      const definition = kind === 'ship'
        ? this.configs.ships.ships[entity.type]
        : this.configs.planets.planetTypes[entity.type];
      const typeName = definition.displayName[this.locale];
      return `${entity.name} · ${typeName} · ${this.#sector(entity)}\n${definition.loreDescription[this.locale]}`;
    });
    this.refs.boardTooltip.textContent = lines.join('\n\n');
    this.refs.boardTooltip.style.left = `${Math.min(anchor.x + 14, globalThis.innerWidth - 340)}px`;
    this.refs.boardTooltip.style.top = `${Math.min(anchor.y + 14, globalThis.innerHeight - 180)}px`;
    this.refs.boardTooltip.hidden = false;
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
    if (!this.refs.victory.open) this.refs.victory.showModal();
  }

  openSettings(settings) {
    const form = this.refs.settingsForm;
    for (const [key, value] of Object.entries(settings)) {
      const input = form.elements.namedItem(key);
      if (!input) continue;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = String(value);
    }
    this.setModelOptions([], settings);
    this.refs.connectionStatus.textContent = '';
    if (!this.refs.settings.open) this.refs.settings.showModal();
  }

  setModelOptions(models, settings = this.readSettings()) {
    const sorted = [...new Set(models)].sort((a, b) => a.localeCompare(b));
    for (const [name] of MODEL_FIELDS) {
      const select = this.refs.settingsForm.elements.namedItem(name);
      if (!select) continue;
      const current = settings[name] || select.value;
      const values = current && !sorted.includes(current) ? [current, ...sorted] : sorted;
      select.replaceChildren(...values.map((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model === current && !sorted.includes(model)
          ? `${model} (${this.locale === 'ru' ? 'недоступна' : 'unavailable'})`
          : model;
        return option;
      }));
      if (!values.length) {
        const option = document.createElement('option');
        option.value = current ?? '';
        option.textContent = current || (this.locale === 'ru' ? 'Модели не найдены' : 'No models found');
        select.append(option);
      }
      select.value = current ?? '';
    }
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
    for (const key of ['reasoningEnabled', 'reportsEnabled', 'fallbackEnabled', 'debug', 'llmEnabled']) {
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
        <div class="screen-heading"><p class="eyebrow">${this.t.subtitle}</p><h1>${this.t.chooseFaction}</h1></div>
        <div class="faction-grid">
          <button class="faction-card cryos-card" data-faction="cryos"><span class="faction-sigil">◈</span><strong>${this.t.cryos}</strong><small>${this.t.cryosDesc}</small></button>
          <button class="faction-card ignis-card" data-faction="ignis"><span class="faction-sigil">✦</span><strong>${this.t.ignis}</strong><small>${this.t.ignisDesc}</small></button>
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
            <div class="metric"><span>${this.t.income}</span><strong data-ref="humanIncome">+10</strong></div>
            <div class="metric"><span>${this.t.ships}</span><strong data-ref="humanFleet">1</strong></div>
          </aside>

          <section class="board-column">
            <div class="board-frame" data-ref="board"></div>
            <button class="primary end-turn" data-ref="endTurn" data-action="end-turn">${this.t.endTurn}<span>→</span></button>
          </section>

          <aside class="fleet-panel context-panel">
            <div class="context-actions">
              <button class="ghost compact" data-action="activity">${this.t.activity}</button>
              <button class="ghost compact" data-action="events">${this.t.events}</button>
            </div>
            <div data-ref="contextPanel" class="context-card"></div>
          </aside>
        </section>
      </main>

      <dialog class="modal log-modal" data-ref="activityDialog">
        <header><div><p class="eyebrow">AI PIPELINE</p><h2>${this.t.activity}</h2></div><button type="button" class="icon-button" data-close="activityDialog">×</button></header>
        <div class="log-dialog-body">
          <p class="activity-current" data-ref="activityCurrent">${this.t.tacticalLinkReady}</p>
          <ol class="activity-log" data-ref="activityLog"></ol>
          <h3>${this.t.commandReports}</h3>
          <div class="reports-list" data-ref="commandReports"></div>
        </div>
      </dialog>

      <dialog class="modal log-modal" data-ref="eventsDialog">
        <header><div><p class="eyebrow">TACTICAL RECORD</p><h2>${this.t.events}</h2></div><button type="button" class="icon-button" data-close="eventsDialog">×</button></header>
        <div class="log-dialog-body"><ol class="event-log" data-ref="eventLog"></ol></div>
      </dialog>

      <dialog class="modal" data-ref="settings">
        <form data-ref="settingsForm">
          <header><div><p class="eyebrow">OLLAMA CONTROL</p><h2>${this.t.settings}</h2></div><button type="button" class="icon-button" data-close="settings">×</button></header>
          <div class="settings-grid">${this.#settingsFields()}</div>
          <p class="connection-status" data-ref="connectionStatus"></p>
          <footer>
            <button type="button" class="ghost" data-action="refresh-models">${this.t.refreshModels}</button>
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
        <p class="eyebrow">${this.t.subtitle}</p><h2 data-ref="victoryTitle">${this.t.victory}</h2>
        <p>${this.locale === 'ru' ? 'Температурный баланс галактики изменён.' : 'The thermal balance of the galaxy has changed.'}</p>
        <button class="primary" data-action="menu">${this.t.backToMenu}</button>
      </dialog>

      <div class="board-tooltip" data-ref="boardTooltip" role="tooltip" hidden></div>
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
    if (button.dataset.objectKind) {
      this.handlers.selectObject?.(button.dataset.objectKind, Number(button.dataset.objectId));
    }
    const action = button.dataset.action;
    if (action === 'new') this.showFactionSelect();
    if (action === 'continue') this.handlers.continueGame?.();
    if (action === 'clear') this.handlers.clearSave?.();
    if (action === 'menu') {
      if (this.refs.victory.open) this.refs.victory.close();
      this.handlers.menu?.();
    }
    if (action === 'end-turn') this.handlers.endTurn?.();
    if (action === 'settings') this.handlers.openSettings?.();
    if (action === 'archive') this.refs.archive.showModal();
    if (action === 'activity') this.refs.activityDialog.showModal();
    if (action === 'events') this.refs.eventsDialog.showModal();
    if (action === 'restart') this.handlers.restart?.();
    if (action === 'language') this.handlers.language?.();
    if (action === 'test-connection') this.handlers.testConnection?.(this.readSettings());
    if (action === 'refresh-models') this.handlers.refreshModels?.(this.readSettings());
  }

  #renderContext(context) {
    const host = this.refs.contextPanel;
    host.replaceChildren();
    const {
      snapshot,
      selection,
      legalActions,
      purchaseActions,
      selectedHistory,
      selectedEconomy,
    } = context;
    if (!selection) {
      host.append(this.#element('p', 'context-placeholder', this.t.selectObject));
      return;
    }
    if (selection.kind === 'sector') {
      host.append(
        this.#element('p', 'eyebrow', `${this.t.sector} [${selection.x}:${selection.y}]`),
        this.#element('h2', '', this.t.chooseObject),
      );
      const chooser = this.#element('div', 'object-chooser');
      for (const candidate of selection.candidates) {
        const entity = candidate.kind === 'ship'
          ? snapshot.ships.find((item) => item.id === candidate.id)
          : snapshot.planets.find((item) => item.id === candidate.id);
        if (!entity) continue;
        const button = this.#element('button', 'object-choice');
        button.dataset.objectKind = candidate.kind;
        button.dataset.objectId = String(candidate.id);
        button.append(
          this.#element('strong', '', entity.name),
          this.#element('span', '', this.#typeName(candidate.kind, entity)),
        );
        chooser.append(button);
      }
      host.append(chooser);
      return;
    }
    if (selection.kind === 'ship') {
      const ship = snapshot.ships.find((item) => item.id === selection.id);
      if (ship) this.#renderShip(host, ship, snapshot, legalActions, selectedHistory);
      return;
    }
    const planet = snapshot.planets.find((item) => item.id === selection.id);
    if (planet) this.#renderPlanet(host, planet, snapshot, purchaseActions, selectedEconomy);
  }

  #renderShip(host, ship, snapshot, legalActions, history) {
    const definition = this.configs.ships.ships[ship.type];
    const friendly = ship.faction === snapshot.humanFaction;
    host.append(
      this.#element('p', 'eyebrow', friendly ? this.t.friendlyShip : this.t.enemyShip),
      this.#element('h2', '', ship.name),
      this.#element('p', 'object-subtitle', `${definition.displayName[this.locale]} · ${this.#sector(ship)}`),
      this.#stats([
        [`HP`, `${ship.hp}/${definition.stats.maxHp}`],
        [`ATK`, definition.stats.attack],
        [this.t.range, definition.attack.range],
        [this.t.status, ship.hasActed ? this.t.actionSpent : this.t.ready],
      ]),
      this.#element('p', 'lore-description', definition.loreDescription[this.locale]),
    );
    const heading = this.#element('h3', '', friendly ? this.t.shipHistory : this.t.personalReports);
    const list = this.#element('div', 'history-list');
    if (friendly) {
      for (const event of [...history].reverse()) {
        list.append(this.#element('article', '', this.#eventText(event, snapshot)));
      }
    } else {
      const reports = [...(ship.aiMemory?.reports ?? snapshot.unitReports.filter((item) => item.unitId === ship.id))]
        .slice(-30)
        .reverse();
      for (const report of reports) list.append(this.#reportArticle(report));
    }
    if (!list.childElementCount) list.textContent = this.t.noEntries;
    host.append(heading, list);
    if (friendly && !ship.hasActed) {
      host.append(this.#element('small', 'legal-summary', `${this.t.availableActions}: ${legalActions.length}`));
    }
  }

  #renderPlanet(host, planet, snapshot, purchaseActions, economy) {
    const definition = this.configs.planets.planetTypes[planet.type];
    const ownerTurn = planet.faction === 'grey' ? 0 : snapshot.factions[planet.faction]?.ownerTurns ?? 0;
    const shipyardReady = definition.production.enabled && planet.productionReadyFromOwnerTurn <= ownerTurn;
    const repairReady = planet.repairReadyFromOwnerTurn <= ownerTurn;
    const incomeReady = planet.incomeReadyFromOwnerTurn <= ownerTurn;
    const relation = planet.faction === snapshot.humanFaction
      ? this.t.yourPlanet
      : planet.faction === snapshot.aiFaction
        ? this.t.enemyPlanet
        : this.t.neutralPlanet;
    host.append(
      this.#element('p', 'eyebrow', relation),
      this.#element('h2', '', planet.name),
      this.#element('p', 'object-subtitle', `${definition.displayName[this.locale]} · ${this.#sector(planet)}`),
      this.#stats([
        ['HP', `${planet.hp}/${definition.maxHp}`],
        [this.t.income, incomeReady ? `+${definition.incomePerTurn}` : this.t.nextTurn],
        [this.t.repair, repairReady ? `+${definition.planetRepairPerTurn}` : this.t.notReady],
        [this.t.shipyard, shipyardReady ? this.t.ready : this.t.notReady],
      ]),
      this.#element('p', 'lore-description', definition.loreDescription[this.locale]),
    );
    if (planet.faction === snapshot.humanFaction) {
      host.append(this.#element('h3', '', this.t.shipyard));
      this.#renderShipyard(host, planet, snapshot, purchaseActions);
    } else if (planet.faction === snapshot.aiFaction && economy) {
      host.append(this.#element('h3', '', this.t.economicIntel));
      host.append(this.#stats([
        [this.t.credits, economy.credits],
        [this.t.expectedIncome, `+${economy.projectedIncome}`],
        [this.t.planets, economy.planetCount],
        [this.t.availableShipyards, `${economy.availableShipyards}/${economy.shipyardCount}`],
        [this.t.fleetValue, economy.fleetValue],
      ]));
      const composition = Object.entries(economy.fleetComposition ?? {})
        .map(([type, count]) => `${this.configs.ships.ships[type]?.displayName[this.locale] ?? type}: ${count}`)
        .join(' · ');
      host.append(this.#element('p', 'economy-composition', composition || this.t.noShips));
    } else {
      host.append(this.#element('p', 'neutral-status', this.t.neutralColonization));
    }
  }

  #renderShipyard(host, planet, snapshot, purchaseActions) {
    const yard = this.#element('div', 'context-shipyard');
    for (const [type, definition] of Object.entries(this.configs.ships.ships)) {
      const action = purchaseActions.find((item) => item.planetId === planet.id && item.unitType === type);
      const button = this.#element('button', 'shipyard-item');
      button.disabled = !action;
      if (action) button.dataset.build = String(action.id);
      button.append(
        this.#element('strong', '', definition.displayName[this.locale]),
        this.#element('span', '', `ATK ${definition.stats.attack} · HP ${definition.stats.maxHp}`),
        this.#element('b', '', `${definition.cost} ◈`),
        this.#element('small', '', action ? '' : this.#purchaseReason(planet, snapshot, definition)),
      );
      yard.append(button);
    }
    host.append(yard);
  }

  #purchaseReason(planet, snapshot, definition) {
    const ownerTurn = snapshot.factions[snapshot.humanFaction].ownerTurns;
    if (snapshot.winner) return this.t.gameOver;
    if (planet.productionReadyFromOwnerTurn > ownerTurn) return this.t.colonyNotReady;
    if (snapshot.factions[snapshot.humanFaction].credits < definition.cost) return this.t.insufficientCredits;
    if (snapshot.ships.some((ship) => ship.x === planet.x && ship.y === planet.y)) return this.t.occupied;
    if (planet.productionUsedOwnerTurn === ownerTurn) return this.t.productionUsed;
    return this.t.unavailableClass;
  }

  #renderActivityReports(snapshot) {
    const reports = [...(snapshot.commandReports ?? [])].reverse();
    this.refs.commandReports.replaceChildren(...reports.map((report) => this.#reportArticle(report)));
    if (!reports.length) this.refs.commandReports.textContent = this.t.noReports;
  }

  #renderEventLog(snapshot) {
    const events = [...(snapshot.eventLog ?? [])].reverse();
    this.refs.eventLog.replaceChildren(...events.map((event) => {
      const li = document.createElement('li');
      li.textContent = this.#eventText(event, snapshot);
      return li;
    }));
    if (!events.length) this.refs.eventLog.textContent = this.t.noEntries;
  }

  #reportArticle(report) {
    const article = this.#element('article', 'report-entry');
    article.append(
      this.#element('strong', '', report.title || this.#reportRole(report.role)),
      this.#element('p', '', report.narrative || report.report || this.t.noReportText),
    );
    if (report.rationale) article.append(this.#element('small', '', report.rationale));
    return article;
  }

  #eventText(event, snapshot) {
    const details = event.details ?? event.actualResult ?? event;
    const ship = snapshot.ships.find((item) => item.id === (details.unitId ?? details.createdUnitId));
    const shipName = details.unitName
      ?? ship?.name
      ?? `${this.t.ship} #${details.unitId ?? details.createdUnitId ?? '?'}`;
    if (event.type === 'SHIP_DEPLOYED') {
      return `${shipName} ${this.locale === 'ru' ? 'введён в строй в секторе' : 'was commissioned in sector'} [${details.to?.join(':')}].`;
    }
    if (event.type === 'PURCHASE' || details.actionType === 'BUILD') {
      const planet = snapshot.planets.find((item) => item.id === details.planetId);
      return `${shipName} ${this.locale === 'ru' ? 'построен на верфи' : 'was built at'} ${details.planetName ?? planet?.name ?? ''} ${planet ? this.#sector(planet) : `[${details.to?.join(':')}]`}.`;
    }
    if (event.type === 'UNIT_ACTION') {
      if (details.actionType === 'MOVE') {
        return `${shipName}: ${this.locale === 'ru' ? 'переход из сектора' : 'transit from sector'} [${details.from?.join(':')}] ${this.locale === 'ru' ? 'в' : 'to'} [${details.to?.join(':')}].`;
      }
      if (details.actionType?.startsWith('ATTACK')) {
        return `${shipName} ${this.locale === 'ru' ? 'открыл огонь по цели' : 'opened fire on'} ${details.targetName ?? ''} ${this.locale === 'ru' ? 'в секторе' : 'in sector'} [${details.to?.join(':')}], ${this.locale === 'ru' ? 'урон' : 'damage'} ${details.damageDealt}.`;
      }
      if (details.actionType === 'COLONIZE') {
        const planet = snapshot.planets.find((item) => item.id === details.colonizedPlanetId);
        return `${shipName} ${this.locale === 'ru' ? 'завершил колонизацию мира' : 'completed colonization of'} ${details.targetName ?? planet?.name ?? ''} ${planet ? this.#sector(planet) : `[${details.to?.join(':')}]`}.`;
      }
      if (details.actionType === 'WAIT') return `${shipName} ${this.locale === 'ru' ? 'удерживал позицию' : 'held position'}.`;
    }
    if (event.type === 'TURN_STARTED') {
      return `${this.locale === 'ru' ? 'Началась фаза фракции' : 'Faction phase began'} ${this.#factionName(event.faction)} · ${this.t.round} ${event.round}.`;
    }
    if (event.type === 'GAME_OVER') {
      return `${this.locale === 'ru' ? 'Операция завершена. Победитель:' : 'Operation complete. Victor:'} ${this.#factionName(details.winner)}.`;
    }
    return `${event.type ?? details.actionType ?? this.t.event} · ${this.t.round} ${event.round ?? snapshot.round}`;
  }

  #settingsFields() {
    const input = (name, label, type = 'text', step = '') => `
      <label><span>${label}</span><input name="${name}" type="${type}" ${step ? `step="${step}"` : ''} required></label>`;
    const selects = MODEL_FIELDS.map(([name, label]) => `
      <label><span>${label}</span><select name="${name}" required></select></label>`).join('');
    return `
      ${input('ollamaUrl', 'Ollama URL')}
      ${input('keepAlive', 'Keep alive')}
      ${selects}
      ${input('timeoutMs', 'Timeout (ms)', 'number')}
      ${input('tacticalRadius', 'Tactical radius', 'number')}
      ${input('headquartersTemperature', 'HQ decision temperature', 'number', '0.1')}
      ${input('unitTemperature', 'Unit decision temperature', 'number', '0.1')}
      ${input('procurementTemperature', 'Procurement decision temperature', 'number', '0.1')}
      ${input('reportTemperature', 'Report temperature', 'number', '0.1')}
      ${input('headquartersNumPredict', 'HQ num_predict', 'number')}
      ${input('unitNumPredict', 'Unit num_predict', 'number')}
      ${input('procurementNumPredict', 'Procurement num_predict', 'number')}
      ${input('reportNumPredict', 'Report num_predict', 'number')}
      ${input('headquartersContextSize', 'HQ num_ctx', 'number')}
      ${input('unitContextSize', 'Unit num_ctx', 'number')}
      ${input('procurementContextSize', 'Procurement num_ctx', 'number')}
      ${input('reportContextSize', 'Report num_ctx', 'number')}
      <label class="check"><input name="llmEnabled" type="checkbox"><span>LLM AI enabled</span></label>
      <label class="check"><input name="reasoningEnabled" type="checkbox"><span>Reasoning for all AI roles</span></label>
      <label class="check"><input name="reportsEnabled" type="checkbox"><span>Reports enabled</span></label>
      <label class="check"><input name="fallbackEnabled" type="checkbox"><span>Fallback enabled</span></label>
      <label class="check"><input name="debug" type="checkbox"><span>Debug diagnostics</span></label>
    `;
  }

  #stats(rows) {
    const stats = this.#element('dl', 'object-stats');
    for (const [label, value] of rows) {
      stats.append(this.#element('dt', '', String(label)), this.#element('dd', '', String(value)));
    }
    return stats;
  }

  #element(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '') element.textContent = text;
    return element;
  }

  #typeName(kind, entity) {
    const definition = kind === 'ship'
      ? this.configs.ships.ships[entity.type]
      : this.configs.planets.planetTypes[entity.type];
    return definition.displayName[this.locale];
  }

  #sector(entity) {
    return `${this.t.sector} [${entity.x}:${entity.y}]`;
  }

  #factionName(faction) {
    return this.configs.factions.factions[faction]?.shortName ?? faction;
  }

  #projectedIncome(snapshot, faction) {
    const ownerTurn = snapshot.factions[faction].ownerTurns;
    return snapshot.planets
      .filter((planet) => planet.faction === faction && planet.incomeReadyFromOwnerTurn <= ownerTurn)
      .reduce((sum, planet) => sum + this.configs.planets.planetTypes[planet.type].incomePerTurn, 0);
  }

  #reportRole(role) {
    return {
      headquarters: this.t.headquarters,
      procurement: this.t.procurement,
      unit: this.t.ship,
    }[role] ?? this.t.reports;
  }
}
