const stringArray = {
  type: 'array',
  items: { type: 'string' },
};

const integerArray = {
  type: 'array',
  items: { type: 'integer' },
};

export const HEADQUARTERS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    doctrine: { type: 'string' },
    commanderComment: { type: 'string' },
    strategicRationale: { type: 'string' },
    priorities: stringArray,
    unitRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unitId: { type: 'integer' },
          recommendation: { type: 'string' },
          targetType: { type: 'string', enum: ['UNIT', 'PLANET', 'CELL', 'NONE'] },
          targetId: { type: ['integer', 'null'] },
          targetCell: {
            anyOf: [
              {
                type: 'array',
                items: { type: 'integer' },
                minItems: 2,
                maxItems: 2,
              },
              { type: 'null' },
            ],
          },
          priority: { type: 'number', minimum: 0, maximum: 100 },
          acceptableAlternatives: stringArray,
          reasonCode: { type: 'string' },
        },
        required: [
          'unitId',
          'recommendation',
          'targetType',
          'targetId',
          'targetCell',
          'priority',
          'acceptableAlternatives',
          'reasonCode',
        ],
        additionalProperties: false,
      },
    },
    executionOrder: integerArray,
    procurementDirective: {
      type: 'object',
      properties: {
        goal: { type: 'string' },
        maxSpend: { type: 'number', minimum: 0 },
        minimumReserve: { type: 'number', minimum: 0 },
        desiredFleetChanges: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
        avoidPlanetIds: integerArray,
        preferredPlanetIds: integerArray,
      },
      required: [
        'goal',
        'maxSpend',
        'minimumReserve',
        'desiredFleetChanges',
        'avoidPlanetIds',
        'preferredPlanetIds',
      ],
      additionalProperties: false,
    },
  },
  required: [
    'doctrine',
    'commanderComment',
    'strategicRationale',
    'priorities',
    'unitRecommendations',
    'executionOrder',
    'procurementDirective',
  ],
  additionalProperties: false,
};

export const PROCUREMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    purchaseActionIds: integerArray,
    spendingPosture: { type: 'string', enum: ['SAVE', 'SPEND', 'COUNTER', 'EXPAND'] },
    reasonCode: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['purchaseActionIds', 'spendingPosture', 'reasonCode', 'rationale'],
  additionalProperties: false,
};

export const UNIT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    actionId: { type: 'integer' },
    recommendationStatus: {
      type: 'string',
      enum: [
        'EXECUTING',
        'PARTIAL',
        'DEFERRED_UNSAFE',
        'DEFERRED_IMPOSSIBLE',
        'REPLACED',
        'WAITING',
      ],
    },
    intentCode: { type: 'string' },
    reasonCode: { type: 'string' },
    rationale: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'actionId',
    'recommendationStatus',
    'intentCode',
    'reasonCode',
    'rationale',
    'confidence',
  ],
  additionalProperties: false,
};

export const REPORT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['SUCCESS', 'PARTIAL', 'DEFERRED', 'FAILED', 'WAITING'],
    },
    title: { type: 'string' },
    narrative: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['status', 'title', 'narrative', 'rationale'],
  additionalProperties: false,
};
