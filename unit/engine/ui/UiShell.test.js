// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiShell } from '../../../src/engine/ui/UiShell.js';
import { createAiSettingsEntity } from '../../../src/engine/entities/AiSettingsEntity.js';
import { GameEngine } from '../../../src/gamecore/services/GameEngine.js';
import { loadGameConfigs } from '../../../src/gamecore/services/config/loadGameConfigs.js';

const configs = loadGameConfigs();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

describe('UiShell contextual interface', () => {
  let root;
  let ui;
  let engine;
  let snapshot;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    ui = new UiShell(root, { locale: 'ru', configs, lore: '# Archive' });
    engine = GameEngine.create(configs, { humanFaction: 'cryos', nameSeed: 42 });
    snapshot = engine.getSnapshot();
  });

  function render(selection, extras = {}) {
    ui.updateGame({
      snapshot,
      selection,
      legalActions: [],
      purchaseActions: engine.generateLegalPurchaseActions('cryos'),
      selectedHistory: [],
      selectedEconomy: null,
      ...extras,
    });
  }

  it('opens a selected player planet and renders its shipyard', () => {
    render({ kind: 'planet', id: 1 });
    expect(root.querySelector('[data-ref="contextPanel"] h2').textContent).toBe(snapshot.planets[0].name);
    expect(root.querySelectorAll('.context-shipyard .shipyard-item')).toHaveLength(5);
    expect(root.textContent).toContain('Орбитальная верфь');
    expect(root.querySelector('[data-ref="eventLog"]').textContent).toContain('[1:0]');
    expect(root.querySelector('[data-ref="eventLog"]').textContent).not.toContain('undefined');
  });

  it('offers an explicit chooser when ship and planet share a sector', () => {
    render({
      kind: 'sector',
      x: 0,
      y: 0,
      candidates: [{ kind: 'ship', id: 1 }, { kind: 'planet', id: 1 }],
    });
    expect(root.querySelectorAll('.object-choice')).toHaveLength(2);
    expect(root.textContent).toContain('В секторе несколько объектов');
  });

  it('renders enemy economy, friendly history, and enemy personal reports', () => {
    const enemyPlanet = snapshot.planets.find((planet) => planet.faction === 'ignis');
    render(
      { kind: 'planet', id: enemyPlanet.id },
      { selectedEconomy: engine.getFactionEconomySnapshot('ignis') },
    );
    expect(root.textContent).toContain('Экономическая разведка');
    expect(root.textContent).toContain('Стоимость флота');

    render({ kind: 'ship', id: 1 }, {
      selectedHistory: [{
        type: 'UNIT_ACTION',
        round: 1,
        details: { unitId: 1, actionType: 'MOVE', from: [1, 0], to: [1, 1] },
      }],
    });
    expect(root.textContent).toContain('История корабля');
    expect(root.textContent).toContain('[1:1]');

    const mutable = structuredClone(snapshot);
    const enemy = mutable.ships.find((ship) => ship.faction === 'ignis');
    enemy.aiMemory.reports.push({
      role: 'unit',
      title: 'Пепельный манёвр',
      narrative: 'Корабль удержал раскалённый рубеж.',
      rationale: 'Защита колонии важнее преследования.',
    });
    snapshot = mutable;
    render({ kind: 'ship', id: enemy.id });
    expect(root.textContent).toContain('Пепельный манёвр');
    expect(root.textContent).toContain('Защита колонии');
  });

  it('opens both log dialogs and shows a desktop lore tooltip', () => {
    root.querySelector('[data-action="activity"]').click();
    root.querySelector('[data-action="events"]').click();
    expect(root.querySelector('[data-ref="activityDialog"]').open).toBe(true);
    expect(root.querySelector('[data-ref="eventsDialog"]').open).toBe(true);

    ui.showBoardTooltip(engine.getObjectsAt(0, 0), { x: 20, y: 20 });
    const tooltip = root.querySelector('[data-ref="boardTooltip"]');
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toContain('Сектор [0:0]');
    expect(tooltip.textContent.length).toBeGreaterThan(60);
  });

  it('uses seven model selects including reserve HQ, keeps missing models, and refreshes options', () => {
    const settings = createAiSettingsEntity({ unitReportModel: 'missing:latest' });
    ui.openSettings(settings);
    expect(root.querySelectorAll('select[name$="Model"]')).toHaveLength(7);
    expect(root.querySelector('select[name="headquartersFallbackModel"]')).toBeTruthy();
    expect(root.querySelector('input[name="reasoningEnabled"]')).toBeTruthy();
    expect(root.querySelector('input[name="headquartersThink"]')).toBeNull();
    ui.setModelOptions(['zeta:1', 'alpha:1'], settings);
    const select = root.querySelector('select[name="unitReportModel"]');
    expect(select.value).toBe('missing:latest');
    expect([...select.options].map((option) => option.value)).toEqual([
      'missing:latest',
      'alpha:1',
      'zeta:1',
    ]);
    expect(select.options[0].textContent).toContain('недоступна');
  });

  it('forwards chooser and model refresh controls to controller handlers', () => {
    const selectObject = vi.fn();
    const refreshModels = vi.fn();
    ui.on({ selectObject, refreshModels });
    render({
      kind: 'sector',
      x: 0,
      y: 0,
      candidates: [{ kind: 'ship', id: 1 }, { kind: 'planet', id: 1 }],
    });
    root.querySelector('.object-choice').click();
    root.querySelector('[data-action="refresh-models"]').click();
    expect(selectObject).toHaveBeenCalledWith('ship', 1);
    expect(refreshModels).toHaveBeenCalledOnce();
  });
});
