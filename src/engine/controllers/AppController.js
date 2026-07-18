import { PixiBoardRenderer } from '../../gamecore/render/pixi/PixiBoardRenderer.js';
import { GameEngine } from '../../gamecore/services/GameEngine.js';
import { MultiAgentTurnOrchestrator } from '../ai/MultiAgentTurnOrchestrator.js';
import { DiagnosticsService } from '../services/DiagnosticsService.js';
import { OllamaClient } from '../services/OllamaClient.js';

export class AppController {
  constructor({ configs, ui, storage, settings, locale }) {
    this.configs = configs;
    this.ui = ui;
    this.storage = storage;
    this.settings = settings;
    this.locale = locale;
    this.diagnostics = new DiagnosticsService(settings.debug);
    this.client = new OllamaClient(settings, this.diagnostics);
    this.engine = null;
    this.renderer = null;
    this.orchestrator = null;
    this.selection = null;
    this.busy = false;
  }

  init() {
    this.ui.on({
      newGame: (faction) => this.newGame(faction),
      continueGame: () => this.continueGame(),
      clearSave: () => this.clearSave(),
      endTurn: () => this.endTurn(),
      build: (actionId) => this.build(actionId),
      openSettings: () => this.openSettings(),
      refreshModels: (settings) => this.refreshModels(settings),
      selectObject: (kind, id) => this.selectObject(kind, id),
      saveSettings: (settings) => this.saveSettings(settings),
      testConnection: (settings) => this.testConnection(settings),
      restart: () => this.restart(),
      menu: () => this.showMenu(),
      language: () => this.switchLanguage(),
    });
    const save = this.storage.loadGame();
    this.ui.showMenu({ canContinue: Boolean(save) });
  }

  async newGame(humanFaction) {
    this.engine = GameEngine.create(this.configs, { humanFaction });
    this.selection = null;
    this.ui.showGame();
    await this.#ensureRenderer();
    this.#createOrchestrator();
    this.#refresh();
    this.#autosave();
  }

  async continueGame() {
    const save = this.storage.loadGame();
    if (!save) {
      this.ui.showMenu();
      return;
    }
    try {
      const humanFaction = save.state?.humanFaction ?? 'cryos';
      this.engine = GameEngine.create(this.configs, { humanFaction });
      this.engine.restore(save);
      this.selection = null;
      this.ui.showGame();
      await this.#ensureRenderer();
      this.#createOrchestrator();
      this.#refresh();
    } catch (error) {
      this.engine = null;
      const message = error?.message === 'INCOMPATIBLE_SAVE_VERSION'
        ? (this.locale === 'ru'
          ? 'Версия сохранения несовместима. Удалите его и начните новую игру.'
          : 'The save version is incompatible. Delete it and start a new game.')
        : (this.locale === 'ru' ? 'Сохранение повреждено.' : 'The save is damaged.');
      this.ui.showMenu({ canContinue: true, error: message });
    }
  }

  clearSave() {
    this.storage.clearGame();
    this.ui.showMenu({ canContinue: false });
  }

  async endTurn() {
    if (this.busy || !this.engine) return;
    const snapshot = this.engine.getSnapshot();
    if (snapshot.activeFaction !== snapshot.humanFaction || snapshot.winner) return;
    this.#setBusy(true);
    this.selection = null;
    try {
      this.engine.endFactionTurn();
      this.#autosave();
      this.#refresh();
      await this.orchestrator.runAiTurn();
      if (!this.engine.getSnapshot().winner) this.engine.endFactionTurn();
      this.#autosave();
      this.#refresh();
    } catch (error) {
      this.ui.showError(error?.message ?? String(error));
      if (this.engine.getSnapshot().activeFaction === this.engine.getSnapshot().aiFaction) {
        this.engine.endFactionTurn();
      }
      this.#refresh();
    } finally {
      this.#setBusy(false);
    }
  }

  async handleCellClick(x, y) {
    if (this.busy || !this.engine) return;
    const snapshot = this.engine.getSnapshot();
    const objects = this.engine.getObjectsAt(x, y);
    const clickedShip = objects.find((object) => object.kind === 'ship')?.entity;
    const clickedPlanet = objects.find((object) => object.kind === 'planet')?.entity;
    if (snapshot.activeFaction !== snapshot.humanFaction || snapshot.winner) return;

    if (this.selection?.kind === 'ship') {
      const legal = this.engine.generateLegalActionsForUnit(this.selection.id);
      const action = legal.find(
        (candidate) => candidate.type !== 'WAIT' && candidate.to?.[0] === x && candidate.to?.[1] === y,
      );
      if (action) {
        this.#setBusy(true);
        const result = this.engine.executeUnitAction(action);
        this.ui.addEvent(result);
        await this.renderer.playAction(result);
        this.selection = null;
        this.#autosave();
        this.#refresh();
        this.#setBusy(false);
        return;
      }
    }

    if (clickedShip && clickedPlanet) {
      this.selection = {
        kind: 'sector',
        x,
        y,
        candidates: [
          { kind: 'ship', id: clickedShip.id },
          { kind: 'planet', id: clickedPlanet.id },
        ],
      };
    } else if (clickedShip) this.selection = { kind: 'ship', id: clickedShip.id };
    else if (clickedPlanet) this.selection = { kind: 'planet', id: clickedPlanet.id };
    else this.selection = null;
    this.#refresh();
  }

  selectObject(kind, id) {
    if (!this.engine || !['ship', 'planet'].includes(kind)) return;
    this.selection = { kind, id: Number(id) };
    this.#refresh();
  }

  handleCellHover(x, y, anchor) {
    if (!this.engine || x == null || y == null) {
      this.ui.showBoardTooltip();
      return;
    }
    this.ui.showBoardTooltip(this.engine.getObjectsAt(x, y), anchor);
  }

  async build(actionId) {
    if (this.busy || !this.engine) return;
    const result = this.engine.executePurchaseAction(actionId);
    if (!result.executed) {
      this.ui.showError(this.locale === 'ru' ? 'Покупка больше недоступна.' : 'Purchase is no longer available.');
      return;
    }
    this.ui.addEvent(result);
    await this.renderer.playAction({ ...result, to: [
      this.engine.getPlanet(result.planetId).x,
      this.engine.getPlanet(result.planetId).y,
    ] });
    this.#autosave();
    this.#refresh();
  }

  saveSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.storage.saveSettings(this.settings);
    this.diagnostics.setEnabled(this.settings.debug);
    this.client.updateSettings(this.settings);
    this.orchestrator?.updateSettings(this.settings);
    this.ui.setActivity(this.locale === 'ru' ? 'Настройки AI сохранены.' : 'AI settings saved.');
  }

  async openSettings() {
    this.ui.openSettings(this.settings);
    await this.refreshModels(this.settings);
  }

  async refreshModels(settings = this.settings) {
    this.ui.setConnectionStatus(this.locale === 'ru' ? 'Загрузка моделей…' : 'Loading models…');
    const client = new OllamaClient({ ...this.settings, ...settings }, this.diagnostics);
    try {
      const models = await client.listModels();
      this.ui.setModelOptions(models, { ...this.settings, ...settings });
      this.ui.setConnectionStatus(
        models.length
          ? (this.locale === 'ru' ? `Найдено моделей: ${models.length}.` : `Models found: ${models.length}.`)
          : (this.locale === 'ru' ? 'Ollama доступна, но моделей не найдено.' : 'Ollama is available, but no models were found.'),
        true,
      );
    } catch (error) {
      this.ui.setModelOptions([], { ...this.settings, ...settings });
      const message = error?.message === 'OLLAMA_NETWORK_OR_CORS'
        ? (this.locale === 'ru'
          ? 'Список недоступен: проверьте Ollama и OLLAMA_ORIGINS. Сохранённые модели оставлены.'
          : 'Model list unavailable: check Ollama and OLLAMA_ORIGINS. Saved models were preserved.')
        : (error?.message ?? String(error));
      this.ui.setConnectionStatus(message);
    }
  }

  async testConnection(settings) {
    const merged = { ...this.settings, ...settings };
    const client = new OllamaClient(merged, this.diagnostics);
    this.ui.setConnectionStatus(this.locale === 'ru' ? 'Проверка…' : 'Testing…');
    try {
      const result = await client.testConnection([
        merged.headquartersDecisionModel,
        merged.headquartersReportModel,
        merged.procurementDecisionModel,
        merged.procurementReportModel,
        merged.unitDecisionModel,
        merged.unitReportModel,
      ]);
      const message = result.missingModels.length
        ? `${this.locale === 'ru' ? 'Ollama доступна. Не найдены' : 'Ollama is available. Missing'}: ${result.missingModels.join(', ')}`
        : (this.locale === 'ru' ? 'Ollama доступна, модели найдены.' : 'Ollama is available and models were found.');
      this.ui.setConnectionStatus(message, result.missingModels.length === 0);
    } catch (error) {
      const message = error?.message === 'OLLAMA_NETWORK_OR_CORS'
        ? (this.locale === 'ru'
          ? 'Нет доступа: проверьте Ollama, OLLAMA_ORIGINS и разрешение браузера на localhost.'
          : 'No access: check Ollama, OLLAMA_ORIGINS, and browser localhost permission.')
        : error?.message;
      this.ui.setConnectionStatus(message);
    }
  }

  restart() {
    if (!this.engine) return;
    const accepted = globalThis.confirm(
      this.locale === 'ru' ? 'Начать этот матч заново?' : 'Restart this match?',
    );
    if (accepted) this.newGame(this.engine.getSnapshot().humanFaction);
  }

  showMenu() {
    this.ui.showMenu({ canContinue: Boolean(this.storage.loadGame()) });
  }

  switchLanguage() {
    this.settings = { ...this.settings, language: this.locale === 'ru' ? 'en' : 'ru' };
    this.storage.saveSettings(this.settings);
    globalThis.location.reload();
  }

  async #ensureRenderer() {
    if (this.renderer) {
      this.renderer.resize();
      return;
    }
    this.renderer = new PixiBoardRenderer(
      this.ui.boardHost,
      (x, y) => this.handleCellClick(x, y),
      (x, y, anchor) => this.handleCellHover(x, y, anchor),
    );
    await this.renderer.init();
  }

  #createOrchestrator() {
    this.orchestrator = new MultiAgentTurnOrchestrator({
      engine: this.engine,
      client: this.client,
      settings: this.settings,
      locale: this.locale,
      onActivity: (activity) => this.ui.setActivity(activity),
      onEvent: (event) => {
        this.ui.addEvent(event);
        this.#autosave();
        this.#refresh();
      },
    });
  }

  #refresh() {
    if (!this.engine) return;
    const snapshot = this.engine.getSnapshot();
    if (this.selection?.kind === 'ship' && !snapshot.ships.some((item) => item.id === this.selection.id)) {
      this.selection = null;
    }
    if (this.selection?.kind === 'planet' && !snapshot.planets.some((item) => item.id === this.selection.id)) {
      this.selection = null;
    }
    if (this.selection?.kind === 'sector') {
      const objects = this.engine.getObjectsAt(this.selection.x, this.selection.y);
      if (objects.length < 2) this.selection = objects[0]
        ? { kind: objects[0].kind, id: objects[0].entity.id }
        : null;
    }
    const legalActions = this.selection?.kind === 'ship'
      ? this.engine.generateLegalActionsForUnit(this.selection.id)
      : [];
    const purchaseActions = this.engine.generateLegalPurchaseActions(snapshot.humanFaction);
    const selectedObject = this.selection?.kind === 'ship'
      ? snapshot.ships.find((item) => item.id === this.selection.id)
      : this.selection?.kind === 'planet'
        ? snapshot.planets.find((item) => item.id === this.selection.id)
        : this.selection?.kind === 'sector'
          ? { x: this.selection.x, y: this.selection.y, faction: 'grey' }
          : null;
    const selectedHistory = this.selection?.kind === 'ship'
      ? this.engine.getUnitHistory(this.selection.id, 30)
      : [];
    const selectedEconomy = this.selection?.kind === 'planet'
      && selectedObject?.faction
      && snapshot.factions[selectedObject.faction]
      ? this.engine.getFactionEconomySnapshot(selectedObject.faction)
      : null;
    this.renderer?.render(snapshot, selectedObject, legalActions);
    this.ui.updateGame({
      snapshot,
      selection: this.selection,
      legalActions,
      purchaseActions,
      selectedHistory,
      selectedEconomy,
    });
  }

  #autosave() {
    if (this.engine) this.storage.saveGame(this.engine.serialize());
  }

  #setBusy(busy) {
    this.busy = busy;
    this.ui.setBusy(busy);
  }
}
