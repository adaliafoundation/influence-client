import axios from 'axios';
import { Asteroid, Building, Deposit, Entity, Inventory, Order, Ship } from '@influenceth/sdk';
import esb from 'elastic-builder';
import { executeSwap, fetchQuotes } from '@avnu/avnu-sdk';

import { appConfig } from '~/appConfig';
import useStore from '~/hooks/useStore';
import { entityToAgreements, esbLocationQuery, esbPermissionQuery, safeBigInt, safeEntityId } from './utils';
import { TOKEN, TOKEN_SCALE } from './priceUtils';

// set default app version
const apiVersion = 'v2';

// pass initial config to axios
const config = { baseURL: appConfig.get('Api.influence'), headers: {} };
const initialToken = useStore.getState().currentSession?.token;
if (initialToken) config.headers = { Authorization: `Bearer ${initialToken}`};
const instance = axios.create(config);

// subscribe to changes relevant to the config
useStore.subscribe(
  s => [s.currentSession.token],
  ([newToken]) => instance.defaults.headers = { Authorization: `Bearer ${newToken}` }
);

// const arrayComponents = {
//   ContractAgreement: 'ContractAgreements',
//   ContractPolicy: 'ContractPolicies',
//   DryDock: 'DryDocks',
//   Extractor: 'Extractors',
//   Inventory: 'Inventories',
//   PrepaidAgreement: 'PrepaidAgreements',
//   PrepaidPolicy: 'PrepaidPolicies',
//   Processor: 'Processors',
//   PublicPolicy: 'PublicPolicies',
//   WhitelistAgreement: 'WhitelistAgreements',
//   WhitelistAccountAgreement: 'WhitelistAccountAgreements',
// };

const formatESEntityData = (responseData) => {
  return responseData?.hits?.hits?.map((h) => h._source) || [];
}

const buildQuery = (queryObj) => {
  return Object.keys(queryObj || {}).map((key) => {
    return `${encodeURIComponent(key)}=${encodeURIComponent(queryObj[key])}`;
  }).join('&');
};

const getEntityById = async ({ label, id, components }) => {
  return new Promise((resolve, reject) => {
    getEntities({ label, ids: [id], components }).then(entities => {
      if (entities[0]) resolve(entities[0]);
      resolve(null);
    });
  });
};

const getEntities = async ({ ids, match, label, components }) => {
  const query = {};
  if (ids) {
    if (ids.length === 0) return [];
    query.id = ids.join(',');
  } else if (match) {
    // i.e. { 'Celestial.celestialType': 2 }
    // i.e. { 'Location.location': { label: Entity.IDS.LOT, id: 123 } }
    query.match = `${Object.keys(match)[0]}:${JSON.stringify(Object.values(match)[0])}`;
  }
  if (label) {
    query.label = Array.isArray(label) ? label.join(',') : label;  // i.e. 3 (Entity.IDS.ASTEROID)
  }
  if (components) {
    query.components = components.join(',');  // i.e. [ 'Celestial', 'Control' ]
  }

  const response = await instance.get(`/${apiVersion}/entities?${buildQuery(query)}`);
  return response.data;
};

const api = {
  getUser: async () => {
    const response = await instance.get(`/${apiVersion}/user`);
    return response.data;
  },

  updateUser: async (data) => {
    const response = await instance.patch(`/${apiVersion}/user`, data);
    return response.data;
  },

  deployWallet: async (data) => {
    const response = await instance.post(`/${apiVersion}/user/wallet/deploy`, data);
    return response.data;
  },

  getInboxSeed: async () => {
    const response = await instance.get(`/${apiVersion}/user/inboxseed`);
    return response.data;
  },

  getInboxPublicKey: async (recipient) => {
    const response = await instance.get(`/${apiVersion}/messages/key/${recipient}`);
    return response.data;
  },

  getDirectMessageHash: async (encryptedMessage) => {
    const response = await instance.post(`/${apiVersion}/messages/hash`, { encryptedMessage });
    return response.data?.hash;
  },

  getEntityActivities: async (entity, query = {}) => {
    const response = await instance.get(`/${apiVersion}/entities/${Entity.packEntity(entity)}/activity?${buildQuery(query)}`);
    return response.data;
  },

  getCrewActionItems: async (crewId) => {
    if (!crewId) return [];
    const response = await instance.get(`/${apiVersion}/user/activity/unresolved?crewId=${crewId}`);
    return response.data;
  },

  getCrewAgreements: async (crewIdOrCrewIds, crewDelegatedTo) => {
    const queryPromises = [];

    const crewIds = Array.isArray(crewIdOrCrewIds) ? crewIdOrCrewIds : [crewIdOrCrewIds];

    const hasAgreementShouldQuery = [
      esb.boolQuery().must([
        esb.termsQuery('Control.controller.id', crewIds),
        esb.boolQuery().should([
          esb.nestedQuery().path('PrepaidAgreements').query(esb.existsQuery('PrepaidAgreements')),
          esb.nestedQuery().path('ContractAgreements').query(esb.existsQuery('ContractAgreements')),
          esb.nestedQuery().path('WhitelistAgreements').query(esb.existsQuery('WhitelistAgreements')),
          esb.nestedQuery().path('WhitelistAccountAgreements').query(esb.existsQuery('WhitelistAccountAgreements')),
        ])
      ]),
      esb.nestedQuery().path('PrepaidAgreements').query(esb.termsQuery('PrepaidAgreements.permitted.id', crewIds)),
      esb.nestedQuery().path('ContractAgreements').query(esb.termsQuery('ContractAgreements.permitted.id', crewIds)),
      esb.nestedQuery().path('WhitelistAgreements').query(esb.termsQuery('WhitelistAgreements.permitted.id', crewIds)),
      esb.nestedQuery().path('WhitelistAccountAgreements').query(esb.termsQuery('WhitelistAccountAgreements.permitted', crewDelegatedTo)),
    ];

    // BUILDINGS...
    const buildingQueryBuilder = esb.boolQuery();
    buildingQueryBuilder.mustNot(esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.UNPLANNED));
    buildingQueryBuilder.should(hasAgreementShouldQuery);

    const buildingQ = esb.requestBodySearch();
    buildingQ.query(buildingQueryBuilder);
    buildingQ.from(0);
    buildingQ.size(10000);
    queryPromises.push(instance.post(`/_search/building`, buildingQ.toJSON()));

    // SHIPS...
    const shipQueryBuilder = esb.boolQuery();
    shipQueryBuilder.should(hasAgreementShouldQuery);

    const shipQ = esb.requestBodySearch();
    shipQ.query(shipQueryBuilder);
    shipQ.from(0);
    shipQ.size(10000);
    queryPromises.push(instance.post(`/_search/ship`, shipQ.toJSON()));

    // LOTS...
    const lotQueryBuilding = esb.boolQuery();
    lotQueryBuilding.should([
      esb.boolQuery().must([
        esb.termsQuery('meta.asteroid.Control.controller.id', crewIds),
        esb.boolQuery().should([
          esb.nestedQuery().path('PrepaidAgreements').query(esb.existsQuery('PrepaidAgreements')),
          esb.nestedQuery().path('ContractAgreements').query(esb.existsQuery('ContractAgreements')),
          esb.nestedQuery().path('WhitelistAgreements').query(esb.existsQuery('WhitelistAgreements')),
          esb.nestedQuery().path('WhitelistAccountAgreements').query(esb.existsQuery('WhitelistAccountAgreements')),
        ])
      ]),
      esb.nestedQuery().path('PrepaidAgreements').query(esb.termsQuery('PrepaidAgreements.permitted.id', crewIds)),
      esb.nestedQuery().path('ContractAgreements').query(esb.termsQuery('ContractAgreements.permitted.id', crewIds)),
      esb.nestedQuery().path('WhitelistAgreements').query(esb.termsQuery('WhitelistAgreements.permitted.id', crewIds)),
      esb.nestedQuery().path('WhitelistAccountAgreements').query(esb.termsQuery('WhitelistAccountAgreements.permitted', crewDelegatedTo)),
    ]);

    const lotQ = esb.requestBodySearch();
    lotQ.query(lotQueryBuilding);
    lotQ.from(0);
    lotQ.size(10000);
    queryPromises.push(instance.post(`/_search/lot`, lotQ.toJSON()));

    // COMBINE...
    const responses = await Promise.allSettled(queryPromises);
    return responses.reduce((acc, r) => {
      if (r.status === 'fulfilled') {
        formatESEntityData(r.value.data).forEach((entity) => {
          acc.push(...entityToAgreements(entity))
        });
      }
      return acc.filter((a) => (
        (a._agreement.permitted?.id !== a.Control?.controller?.id)
        && (
          crewIds.includes(a.Control?.controller?.id)
          || crewIds.includes(a._agreement.permitted?.id)
          || (crewDelegatedTo && a._agreement.permitted === crewDelegatedTo)
        )
      ));
    }, []);
  },

  getCrewSamples: async (crewId) => {
    const queryBuilder = esb.boolQuery();

    // controlled by crew
    queryBuilder.filter(esb.termQuery('Control.controller.id', crewId));

    // not depleted !(used AND remainingYield === 0)
    queryBuilder.filter(
      esb.boolQuery().mustNot([
        esb.termQuery('Deposit.status', Deposit.STATUSES.USED),
        esb.termQuery('Deposit.remainingYield', 0),
      ])
    );

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.size(10000);
    const query = q.toJSON();

    const response = await instance.post(`/_search/deposit`, query);
    return formatESEntityData(response.data);
  },

  getBuildingsWithComponent: async (asteroidId, component = 'Building') => {

    // BUILDINGS...
    const buildingQueryBuilder = esb.boolQuery();

    // on asteroid
    buildingQueryBuilder.filter(esbLocationQuery({ asteroidId }));

    // is operational
    buildingQueryBuilder.filter(esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.OPERATIONAL));

    // has component
    buildingQueryBuilder.filter(esb.existsQuery(component));

    const buildingQ = esb.requestBodySearch();
    buildingQ.query(buildingQueryBuilder);
    buildingQ.from(0);
    buildingQ.size(10000);
    const response = await instance.post(`/_search/building`, buildingQ.toJSON());
    return formatESEntityData(response.data);
  },

  getAsteroidBuildingsWithAccessibleInventories: async (asteroidId, crewId, crewSiblingIds, crewDelegatedTo, withPermission) => {
    const buildingQueryBuilder = esb.boolQuery();

    // Exclude unplanned buildings
    buildingQueryBuilder.mustNot(esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.UNPLANNED))

    // has permission
    if (withPermission) buildingQueryBuilder.filter(esbPermissionQuery(crewId, crewSiblingIds, crewDelegatedTo, withPermission));

    // on asteroid
    buildingQueryBuilder.filter(esbLocationQuery({ asteroidId }));

    // has unlocked inventory
    buildingQueryBuilder.filter(
      esb.nestedQuery()
        .path('Inventories')
        .query(esb.termQuery('Inventories.status', Inventory.STATUSES.AVAILABLE))
    );

    const buildingQ = esb.requestBodySearch();
    buildingQ.query(buildingQueryBuilder);
    buildingQ.from(0);
    buildingQ.size(10000);

    const response = await instance.post(`/_search/building`, buildingQ.toJSON());
    
    return formatESEntityData(response.data);
  },

  getAsteroidShipsWithAccessibleInventories: async (asteroidId, crewId, crewSiblingIds, crewDelegatedTo, withPermission) => {
    const shipQueryBuilder = esb.boolQuery();

    // has permission
    if (withPermission) shipQueryBuilder.filter(esbPermissionQuery(crewId, crewSiblingIds, crewDelegatedTo, withPermission));

    // on asteroid
    // (and not in orbit -- i.e. lotId is present and !== 0)
    shipQueryBuilder.filter(esbLocationQuery({ asteroidId }));
    shipQueryBuilder.filter(
      esb.nestedQuery()
        .path('Location.locations')
        .query(
          esb.boolQuery().must([
            esb.termQuery('Location.locations.label', Entity.IDS.LOT),
            esb.rangeQuery('Location.locations.id').gt(0),
          ])
        )
    );

    // has unlocked inventory
    shipQueryBuilder.filter(
      esb.nestedQuery()
        .path('Inventories')
        .query(esb.termQuery('Inventories.status', Inventory.STATUSES.AVAILABLE))
    );

    // ship is operational and not traveling or in emergency mode
    shipQueryBuilder.filter(esb.termQuery('Ship.status', Ship.STATUSES.AVAILABLE));
    shipQueryBuilder.filter(esb.termQuery('Ship.emergencyAt', 0));

    const shipQ = esb.requestBodySearch();
    shipQ.query(shipQueryBuilder);
    shipQ.from(0);
    shipQ.size(10000);

    const response = await instance.post(`/_search/ship`, shipQ.toJSON());
    
    return formatESEntityData(response.data);
  },

  getDeliveries: async (destination, origin, statuses) => {

    // BUILDINGS...
    const queryBuilder = esb.boolQuery();

    if (destination) {
      queryBuilder.filter(esb.termQuery('Delivery.dest.uuid', safeEntityId(destination)?.uuid));
    }
    if (origin) {
      queryBuilder.filter(esb.termQuery('Delivery.origin.uuid', safeEntityId(origin)?.uuid));
    }
    if (statuses) {
      queryBuilder.filter(esb.termsQuery('Delivery.status', statuses));
    };

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.from(0);
    q.size(10000);
    const response = await instance.post(`/_search/delivery`, q.toJSON());

    return formatESEntityData(response.data);
  },

  // TODO: will we want this for "random" story events
  // getUserAssignments: async () => {
  //   const response = await instance.get(`/${apiVersion}/user/assignments`);
  //   return response.data;
  // },

  getActivities: async (query) => {
    const response = await instance.get(`/${apiVersion}/user/activity${query ? `?${buildQuery(query)}` : ''}`);
    return {
      activities: response.data,
      totalHits: query?.returnTotal ? parseInt(response.headers['total-hits']) : undefined,
      blockNumber: parseInt(response.headers['starknet-block-number'])  // TODO: this is not currently used
    };
  },

  getOngoingActivities: async (asteroidUuid, eventTypes = []) => {
    const response = await instance.get(`/${apiVersion}/activity/ongoing/${asteroidUuid}?${buildQuery({ types: eventTypes.join(','), page: 1, pageSize: 250 })}`);
    return response.data;
  },

  getTransactionActivities: async (txHashes) => {
    const response = await instance.get(`/${apiVersion}/activity?${buildQuery({ txHash: txHashes.join(',') })}`);
    return {
      activities: response.data,
      blockNumber: parseInt(response.headers['starknet-block-number'])
    }
  },

  getWatchlist: async () => {
    const response = await instance.get(`/${apiVersion}/user/watchlist`); // TODO: server-side update
    return response.data;
  },

  watchAsteroid: async (i) => {
    const response = await instance.post(`/${apiVersion}/user/watchlist/${i}`);
    return response.data;
  },

  unWatchAsteroid: async (i) => {
    const response = await instance.delete(`/${apiVersion}/user/watchlist/${i}`);
    return response.data;
  },

  getReferrals: async () => {
    const response = await instance.get(`/${apiVersion}/user/referrals`);
    return response.data;
  },

  getAsteroids: async (ids) => {
    return ids?.length > 0 ? getEntities({ ids, label: Entity.IDS.ASTEROID }) : [];
  },

  getAsteroidLotData: async (i) => {
    const response = await instance.get(`/${apiVersion}/asteroids/${i}/lots/packed`, { responseType: 'arraybuffer' });
    const lotTally = Asteroid.getSurfaceArea(i);

    let shift;
    const mask = 0b11111111;

    // TODO (enhancement?): any benefit to returning a sparse array here instead?
    // (probably yes unless going to send as a buffer to worker as part of a performance enhancement)
    if (response.data) {
      return (new Uint32Array(response.data)).reduce((acc, byte, i) => {
        for (let j = 0; j < 4; j++) {
          const index = i * 4 + j;
          if (index < lotTally) {
            // shift right 24, 16, 8, then 0
            shift = (3 - j) * 8;

            // (adjust for one-index of lot ids)
            acc[index + 1] = (Number(byte) >> shift) & mask;
          }
        }
        return acc;
      }, [0]);
    }
    return null;
  },

  getAsteroidMarketplaceAggs: async (asteroidId) => {
    const queryBuilder = esb.boolQuery();

    // asteroid
    queryBuilder.filter(esbLocationQuery({ asteroidId }));

    // is operational marketplace
    queryBuilder.filter(esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.OPERATIONAL));
    queryBuilder.filter(esb.termQuery('Building.buildingType', Building.IDS.MARKETPLACE));

    // aggregate allowedProducts
    const aggregation = esb.termsAggregation('products', 'Exchange.allowedProducts').size(250);

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.agg(aggregation);
    q.size(0);
    const response = await instance.post(`/_search/building`, q.toJSON());

    return {
      marketplaceTally: response.data?.hits?.total?.value,
      products: (response.data?.aggregations?.products?.buckets || []).reduce((acc, b) => ({
        ...acc,
        [b.key]: b.doc_count
      }), {}),
    };
  },

  getAsteroidShips: async (i) => {
    const shipQueryBuilder = esb.boolQuery();

    // on asteroid
    shipQueryBuilder.filter(esbLocationQuery({ asteroidId: i }));

    // ship is operational and not traveling or in emergency mode
    shipQueryBuilder.filter(esb.termQuery('Ship.status', Ship.STATUSES.AVAILABLE));

    const shipQ = esb.requestBodySearch();
    shipQ.query(shipQueryBuilder);
    shipQ.from(0);
    shipQ.size(10000);
    const response = await instance.post(`/_search/ship`, shipQ.toJSON());

    return formatESEntityData(response.data);
  },

  getCrewOpenOrders: async (c) => {
    const queryBuilder = esb.boolQuery();

    // by crew
    queryBuilder.filter(esb.termQuery('crew.id', c));

    // order is open
    queryBuilder.filter(esb.termQuery('status', Order.STATUSES.OPEN));

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.from(0);
    q.size(10000);

    const response = await instance.post(`/_search/order`, q.toJSON());

    const orders = response?.data?.hits?.hits?.map((h) => ({
      ...h._source,
      price: h._source.price / TOKEN_SCALE[TOKEN.SWAY],
    })) || [];

    return orders;
  },

  getOrderList: async (exchangeId, productId) => {
    const queryBuilder = esb.boolQuery();

    // exchange
    queryBuilder.filter(esb.termQuery('entity.id', exchangeId));

    // product
    queryBuilder.filter(esb.termQuery('product', productId));

    // status
    queryBuilder.filter(esb.termQuery('status', Order.STATUSES.OPEN));

    // valid
    queryBuilder.filter(esb.rangeQuery('validTime').lte(Math.floor(Date.now() / 1000)));

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.from(0);
    q.size(10000);
    const response = await instance.post(`/_search/order`, q.toJSON());

    return response?.data?.hits?.hits?.map((h) => ({
      ...h._source,
      price: h._source.price / TOKEN_SCALE[TOKEN.SWAY],
    })) || [];
  },

  getOrdersByInventory: async (storage) => {
    const queryBuilder = esb.boolQuery();

    // storage
    queryBuilder.filter(esb.termQuery('storage.label', storage?.label));
    queryBuilder.filter(esb.termQuery('storage.id', storage?.id));

    // status
    queryBuilder.filter(esb.termQuery('status', Order.STATUSES.OPEN));

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.from(0);
    q.size(10000);
    const response = await instance.post(`/_search/order`, q.toJSON());

    return response?.data?.hits?.hits?.map((h) => ({
      ...h._source,
      price: h._source.price / TOKEN_SCALE[TOKEN.SWAY],
    })) || [];
  },

  getOrdersByProduct: async (asteroidId, product, orderType) => {
    const queryBuilder = esb.boolQuery();

    // asteroid
    queryBuilder.filter(
      esbLocationQuery(
        { asteroidId: asteroidId },
        'locations'
      )
    );

    // products
    if (Array.isArray(product)) {
      queryBuilder.filter(esb.termsQuery('product', product));
    } else {
      queryBuilder.filter(esb.termQuery('product', product));
    }
    
    // open sell order
    queryBuilder.filter(esb.termQuery('orderType', orderType));
    queryBuilder.filter(esb.termQuery('status', Order.STATUSES.OPEN));
    queryBuilder.filter(esb.rangeQuery('validTime').lte(Math.floor(Date.now() / 1000)));
    
    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.from(0);
    q.size(10000);
    const response = await instance.post(`/_search/order`, q.toJSON());

    return response?.data?.hits?.hits?.map((h) => ({
      ...h._source,
      price: h._source.price / TOKEN_SCALE[TOKEN.SWAY],
    })) || [];
  },

  getOrderSummaryByExchange: async (asteroidId, product) => {
    const queryBuilder = esb.boolQuery();

    // asteroid
    queryBuilder.filter(
      esbLocationQuery(
        { asteroidId: asteroidId },
        'locations'
      )
    );

    // product
    queryBuilder.filter(esb.termQuery('product', product));

    // only return aggregations
    const aggregation = esb
      .termsAggregation('exchanges', 'entity.id').size(1000) // what is an appropriate size limit here?
      .aggs([
        // buy summary
        esb
          .filterAggregation(
            'buy',
            esb.boolQuery().must([
              esb.termQuery('orderType', Order.IDS.LIMIT_BUY),
              esb.termQuery('status', Order.STATUSES.OPEN),
              esb.rangeQuery('validTime').lte(Math.floor(Date.now() / 1000))
            ])
          )
          .aggs([
            esb.sumAggregation('amount', 'amount'),
            esb.maxAggregation('price', 'price'),
          ]),

        // sell summary
        esb
          .filterAggregation(
            'sell',
            esb.boolQuery().must([
              esb.termQuery('orderType', Order.IDS.LIMIT_SELL),
              esb.termQuery('status', Order.STATUSES.OPEN),
              esb.rangeQuery('validTime').lte(Math.floor(Date.now() / 1000))
            ])
          )
          .aggs([
            esb.sumAggregation('amount', 'amount'),
            esb.minAggregation('price', 'price'),
          ]),
      ]);

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.agg(aggregation);
    q.size(0);
    const response = await instance.post(`/_search/order`, q.toJSON());

    return response.data.aggregations.exchanges.buckets.reduce((acc, b) => ({
      ...acc,
      [b.key]: {
        buy: { orders: b.buy.doc_count, amount: b.buy.amount.value, price: b.buy.price.value / TOKEN_SCALE[TOKEN.SWAY], },
        sell: { orders: b.sell.doc_count, amount: b.sell.amount.value, price: b.sell.price.value / TOKEN_SCALE[TOKEN.SWAY], },
      }
    }), {});
  },

  getOrderSummaryByProduct: async (entity) => {
    const queryBuilder = esb.boolQuery();

    // at asteroid-level
    if (entity.label === Entity.IDS.ASTEROID) {
      queryBuilder.filter(esbLocationQuery({ asteroidId: entity.id }, 'locations'));

      // get decommissioned exchanges so can exclude...
      const buildingQueryBuilder = esb.boolQuery();
      buildingQueryBuilder.filter(esbLocationQuery({ asteroidId: entity.id }));
      buildingQueryBuilder.filter(
        esb.boolQuery().mustNot([ esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.OPERATIONAL) ])
      );
      buildingQueryBuilder.filter(esb.existsQuery('Exchange'));

      const buildingQ = esb.requestBodySearch();
      buildingQ.query(buildingQueryBuilder);
      buildingQ.from(0);
      buildingQ.size(10000);
      const response = await instance.post(`/_search/building`, buildingQ.toJSON());
      const excludeBuildings = formatESEntityData(response.data);

      if (excludeBuildings.length > 0) {
        queryBuilder.mustNot(esb.termsQuery('entity.id', excludeBuildings.map((b) => b.id)));
      }

    // at market-level
    } else {
      queryBuilder.filter(esbLocationQuery({ lotId: entity.id }, 'locations'));
    }

    // only return aggregations
    const aggregation = esb
      .termsAggregation('products', 'product').size(250)
      .aggs([
        // buy summary
        esb
          .filterAggregation(
            'buy',
            esb.boolQuery().must([
              esb.termQuery('orderType', Order.IDS.LIMIT_BUY),
              esb.termQuery('status', Order.STATUSES.OPEN),
              esb.rangeQuery('validTime').lte(Math.floor(Date.now() / 1000))
            ])
          )
          .aggs([
            esb.sumAggregation('amount', 'amount'),
            esb.maxAggregation('price', 'price'),
          ]),

        // sell summary
        esb
          .filterAggregation(
            'sell',
            esb.boolQuery().must([
              esb.termQuery('orderType', Order.IDS.LIMIT_SELL),
              esb.termQuery('status', Order.STATUSES.OPEN),
              esb.rangeQuery('validTime').lte(Math.floor(Date.now() / 1000))
            ])
          )
          .aggs([
            esb.sumAggregation('amount', 'amount'),
            esb.minAggregation('price', 'price'),
          ]),
      ]);

    const q = esb.requestBodySearch();
    q.query(queryBuilder);
    q.agg(aggregation);
    q.size(0);
    const response = await instance.post(`/_search/order`, q.toJSON());

    return response.data.aggregations.products.buckets.reduce((acc, b) => ({
      ...acc,
      [b.key]: {
        buy: { orders: b.buy.doc_count, amount: b.buy.amount.value, price: b.buy.price.value / TOKEN_SCALE[TOKEN.SWAY], },
        sell: { orders: b.sell.doc_count, amount: b.sell.amount.value, price: b.sell.price.value / TOKEN_SCALE[TOKEN.SWAY], },
      }
    }), {});
  },

  getEntities,
  getEntityById,

  getNameUse: async (label, name) => {
    return getEntities({ match: { 'Name.name': name }, label, components: [] });
  },

  getOwnedCrews: async (account) => {
    return getEntities({ match: { 'Crew.delegatedTo': account }, label: Entity.IDS.CREW });
  },

  getCrewmates: async (ids) => {
    if (ids?.length > 0) {
      const q = esb.boolQuery();
      q.filter(esb.termsQuery('id', ids));
  
      const crewmateQ = esb.requestBodySearch();
      crewmateQ.query(q);
      crewmateQ.from(0);
      crewmateQ.size(10000);
      const response = await instance.post(`/_search/crewmate`, crewmateQ.toJSON());

      return formatESEntityData(response.data);
    }
    return [];
  },
  
  getCrewmatesOfCrews: async (crewIds) => {
    if (crewIds?.length > 0) {
      const q = esb.boolQuery();
      q.filter(esb.termsQuery('Control.controller.id', crewIds));
  
      const crewmateQ = esb.requestBodySearch();
      crewmateQ.query(q);
      crewmateQ.from(0);
      crewmateQ.size(10000);
      const response = await instance.post(`/_search/crewmate`, crewmateQ.toJSON());

      return formatESEntityData(response.data);
    }
    return [];
  },

  getAccountCrewmates: async (account) => {
    return getEntities({ match: { 'Nft.owners.starknet': account }, label: Entity.IDS.CREWMATE });
  },

  getConstants: async (names) => {
    const response = await instance.get(`/${apiVersion}/constants/${Array.isArray(names) ? names.join(',') : names}`);
    return response.data;
  },

  getAsteroidSale: async () => {
    const response = await instance.get(`/${apiVersion}/sales/asteroid`);
    return response.data;
  },

  requestFeeRewards: async () => {
    const response = await instance.post(`/${apiVersion}/user/rewards`);
    return response.data;
  },

  // AVNU endpoints
  getSwapQuote: async ({ sellToken, buyToken, amount, account }) => {
    const options = { baseUrl: appConfig.get('Api.avnu') };
    return fetchQuotes({
      sellTokenAddress: sellToken,
      buyTokenAddress: buyToken,
      sellAmount: safeBigInt(amount),
      takerAddress: account
    }, options);
  },

  executeSwaySwap: async ({ quote, account }) => {
    const options = { baseUrl: appConfig.get('Api.avnu') };
    return executeSwap(account, quote, {}, options);
  },

  // getBook: async (id) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.get(`/${apiVersion}/books/${id}`);
  //   return response.data;
  // },

  // getStory: async (id, sessionId) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.get(`/${apiVersion}/stories/${id}`, { params: { session: sessionId }});
  //   return response.data;
  // },

  // createStorySession: async (crewmate, story) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.post(`/${apiVersion}/stories/sessions`, { crewmate, story });
  //   return response.data;
  // },

  // getStorySession: async (id) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.get(`/${apiVersion}/stories/sessions/${id}`);
  //   return response.data;
  // },

  // getStoryPath: async (storyId, pathId, sessionId) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.get(
  //     `/${apiVersion}/stories/${storyId}/paths/${pathId}`,
  //     { params: { session: sessionId } }
  //   );
  //   return response.data;
  // },

  // patchStorySessionPath: async (sessionId, pathId) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.patch(`/${apiVersion}/stories/sessions/${sessionId}/paths/${pathId}`);
  //   return response.data;
  // },

  // deleteStorySessionPath: async (sessionId, pathId) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.delete(`/${apiVersion}/stories/sessions/${sessionId}/paths/${pathId}`);
  //   return response.data;
  // },

  // getAdalianRecruitmentStory: async (id, sessionId) => {
  //   return null;  // TODO: restore this when story is ready again
  //   const response = await instance.get(`/${apiVersion}/stories/adalian-recruitment`);
  //   return response.data;
  // },

  searchAssets: async (asset, query) => {
    const assetIndex = asset.replace(/s$/, '').toLowerCase();
    const response = await instance.post(`/_search/${assetIndex}`, query);

    return {
      hits: formatESEntityData(response.data),
      total: response.data.hits.total.value
    }
  },

  requestLogin: async (account) => {
    const response = await instance.get(`/${apiVersion}/auth/login/${account}`);
    return response.data.message;
  },

  verifyLogin: async (account, params) => {
    const response = await instance.post(`/${apiVersion}/auth/login/${account}`, params);
    return response.data.token;
  },

  // Checks the status of the faucet
  faucetInfo: async () => {
    const response = await instance.get(`/${apiVersion}/faucet`);
    return response.data;
  },

  // Request either ETH or SWAY from the faucet (non-production only)
  requestTokens: async (token) => {
    const response = await instance.post(`/${apiVersion}/faucet/${token}`);
    return response.data;
  },

  getAnnotations: async (query) => {
    const response = await instance.get(`/${apiVersion}/annotations?${buildQuery(query)}`);
    return response.data;
  },

  getAnnotationHash: async (annotation) => {
    const response = await instance.post(`/${apiVersion}/annotations/hash`, { annotation });
    return response.data?.hash;
  },

  saveAnnotation: async (params) => {
    const response = await instance.post(`/${apiVersion}/annotations`, params);
    return response.data;
  },

  saveDirectMessage: async (params) => {
    const response = await instance.post(`/${apiVersion}/messages`, params);
    return response.data;
  },

  getInboxMessages: async () => {
    const response = await instance.get(`/${apiVersion}/messages`);
    return response.data;
  },

  markMessageAsRead: async (id) => {
    const response = await instance.patch(`/${apiVersion}/messages/${id}/read`);
    return response.data;
  },

  createBanxaOrder: async (params) => {
    const response = await instance.post(`/${apiVersion}/banxa`, params);
    return response.data;
  },

  getBanxaOrder: async (orderId) => {
    const response = await instance.get(`/${apiVersion}/banxa/${orderId}`);
    return response.data;
  },

  getStripePayments: async () => {
    const response = await instance.get(`/${apiVersion}/stripe/payments`);
    return response.data;
  },

  getStripeProducts: async () => {
    const response = await instance.get(`/${apiVersion}/stripe`);
    return response.data;
  },

  createStripePaymentIntent: async (sku) => {
    const response = await instance.post(`/${apiVersion}/stripe/${sku}`);
    return response.data;
  }
};

export default api;
