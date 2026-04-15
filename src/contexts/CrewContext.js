import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Crewmate, Entity, Permission, Ship, System } from '@influenceth/sdk';

import { appConfig } from '~/appConfig';
import useConstants from '~/hooks/useConstants';
import useEntity from '~/hooks/useEntity';
import useSession from '~/hooks/useSession';
import useSimulationState from '~/hooks/useSimulationState';
import useStore from '~/hooks/useStore';
import useWalletCrews from '~/hooks/useWalletCrews';
import api from '~/lib/api';
import { isHybrid } from '~/lib/gameMode';
import { getCrewAbilityBonuses, locationsArrToObj, openAccessJSTime } from '~/lib/utils';
import { entitiesCacheKey } from '~/lib/cacheKey';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';
import useOwnedCrews from '~/hooks/useOwnedCrews';


const entityProps = ({ id, label }) => ({ id, label, uuid: Entity.packEntity({ id, label }) });
const simulationNftConfig = {
  owners: {
    ethereum: null,
    starknet: SIMULATION_CONFIG.accountAddress,
  },
  owner: SIMULATION_CONFIG.accountAddress,
  chain: "STARKNET"
};

const CrewContext = createContext();

export function CrewProvider({ children }) {
  const { accountAddress, authenticated, blockNumber, blockTime, provider, token, isBlockMissing } = useSession();
  const simulationState = useSimulationState();

  const queryClient = useQueryClient();

  const allPendingTransactions = useStore(s => s.pendingTransactions);
  const selectedCrewId = useStore(s => s.selectedCrewId);
  const dispatchCrewSelected = useStore(s => s.dispatchCrewSelected);

  const { data: constants, isLoading: constantsLoading } = useConstants(['CREW_SCHEDULE_BUFFER','TIME_ACCELERATION']);
  const [CREW_SCHEDULE_BUFFER, TIME_ACCELERATION] = useMemo(() => {
    if (!constants) return [];
    return [constants.CREW_SCHEDULE_BUFFER, constants.TIME_ACCELERATION];
  }, [constants]);

  const simulationCrew = useMemo(() => {
    if (!simulationState) return null;

    // TODO: put in SIMULATION_CONFIG?
    const wcrewLocations = simulationState.crewLocation || [
      entityProps({ id: 1, label: Entity.IDS.BUILDING }),
      entityProps({ id: 6881662889623553, label: Entity.IDS.LOT }),
      entityProps({ id: 1, label: Entity.IDS.ASTEROID })
    ];

    const roster = [
      simulationState.crewmate?.id || undefined,
      SIMULATION_CONFIG.crewmates.engineer,
      SIMULATION_CONFIG.crewmates.miner,
      SIMULATION_CONFIG.crewmates.merchant,
      SIMULATION_CONFIG.crewmates.pilot,
    ].filter((c) => !!c);

    return {
      ...entityProps({ id: SIMULATION_CONFIG.crewId, label: Entity.IDS.CREW }),
      _isSimulation: true,
      Crew: {
        actionRound: 0,
        actionStrategy: 0,
        actionType: 0,
        actionWeight: 0,
        delegatedTo: SIMULATION_CONFIG.accountAddress,
        lastFed: blockTime,
        readyAt: simulationState.canFastForward ? 0 : (simulationState.crewReadyAt || 0),
        roster
      },
      Location: {
        location: wcrewLocations[0],
        locations: wcrewLocations
      },
      Inventories: [],
      Name: {
        name: SIMULATION_CONFIG.crewName,
      },
      Nft: simulationNftConfig,
      Ship: {
        emergencyAt: 0,
        readyAt: 0,
        shipType: Ship.IDS.ESCAPE_MODULE,
        status: Ship.IDS.DISABLED,
        transitArrival: 0,
        transitDeparture: 0,
        variant: Ship.VARIANTS.STANDARD
      }
    };
  }, [blockTime, simulationState]);

  const { data: realRawCrews, isLoading: crewsLoading, dataUpdatedAt: rawCrewsUpdatedAt } = useWalletCrews();
  const rawCrews = useMemo(() => simulationCrew ? [simulationCrew] : realRawCrews, [simulationCrew, rawCrewsUpdatedAt]);

  const combinedCrewRoster = useMemo(
    () => (rawCrews || []).reduce((acc, c) => [...acc, ...c.Crew.roster], []),
    [rawCrews, rawCrewsUpdatedAt]
  );
  const { data: myCrewCrewmates, isLoading: crewmatesLoading } = useQuery(
    entitiesCacheKey(Entity.IDS.CREWMATE, combinedCrewRoster.join(',')), // TODO: joined key
    () => api.getCrewmates(combinedCrewRoster),
    { enabled: combinedCrewRoster?.length > 0 }
  );

  const { data: myOwnedCrewmates, isLoading: myOwnedCrewmatesLoading } = useQuery(
    entitiesCacheKey(Entity.IDS.CREWMATE, { owner: accountAddress }),
    () => api.getAccountCrewmates(accountAddress),
    { enabled: !!token }
  );

  const [adalianRecruits, arvadianRecruits] = useMemo(() => {
    if (!myOwnedCrewmates) return [[], []];
    const allRecruits = myOwnedCrewmates.filter((c) => !c.Control?.controller?.id);
    return [
      allRecruits.filter((c) => !c.Crewmate.class),
      allRecruits.filter((c) => [
        Crewmate.COLLECTION_IDS.ARVAD_CITIZEN,
        Crewmate.COLLECTION_IDS.ARVAD_SPECIALIST,
        Crewmate.COLLECTION_IDS.ARVAD_LEADERSHIP
      ].includes(c.Crewmate.coll))
    ];
  }, [myOwnedCrewmates]);

  const crewmateMap = useMemo(() => {
    if (!crewsLoading && !crewmatesLoading && !myOwnedCrewmatesLoading) {
      const map = {};
      (myCrewCrewmates || []).forEach((crewmate) => {
        if (!map[crewmate.id]) map[crewmate.id] = crewmate;
      });
      (myOwnedCrewmates || []).forEach((crewmate) => {
        if (!map[crewmate.id]) map[crewmate.id] = crewmate;
      });
      if (simulationState?.crewmate) {
        map[SIMULATION_CONFIG.crewmateId] = {
          ...entityProps({ id: SIMULATION_CONFIG.crewmateId, label: Entity.IDS.CREWMATE }),
          Control: {
            controller: entityProps({ id: SIMULATION_CONFIG.crewId, label: Entity.IDS.CREW }),
          },
          Crewmate: {
            appearance: simulationState.crewmate.appearance,
            coll: Crewmate.COLLECTION_IDS.ADALIAN,
          },
          Name: { name: simulationState.crewmate.name },
          Nft: simulationNftConfig,
          // TODO: any other crewmate search should return this as well
        };
      }
      return map;
    }
    return null;
  }, [myCrewCrewmates, myOwnedCrewmates, crewsLoading, crewmatesLoading, myOwnedCrewmatesLoading, simulationState]);

  // NOTE: this covers all queries' loading states because crewmateMap is
  // null while any of those are true
  const crewsAndCrewmatesReady = useMemo(() => !!crewmateMap && TIME_ACCELERATION, [crewmateMap, TIME_ACCELERATION]);

  // update crews' _ready value
  const crews = useMemo(() => {
    if (!crewsAndCrewmatesReady || !rawCrews) return [];
    return rawCrews.map((c) => {
      if (!!crewmateMap) {
        c._crewmates = c.Crew.roster.map((i) => crewmateMap[i]).filter((c) => !!c);

        // TODO: should all `notFurtherModified` bonuses be calculated just once here (instead of everywhere else)

        const foodBonuses = getCrewAbilityBonuses([Crewmate.ABILITY_IDS.FOOD_CONSUMPTION_TIME, Crewmate.ABILITY_IDS.FOOD_RATIONING_PENALTY], c);
        c._foodBonuses = {
          consumption: foodBonuses[Crewmate.ABILITY_IDS.FOOD_CONSUMPTION_TIME]?.totalBonus,
          rationing: foodBonuses[Crewmate.ABILITY_IDS.FOOD_RATIONING_PENALTY]?.totalBonus
        };

        const invBonuses = getCrewAbilityBonuses([Crewmate.ABILITY_IDS.INVENTORY_MASS_CAPACITY, Crewmate.ABILITY_IDS.INVENTORY_VOLUME_CAPACITY], c);
        c._inventoryBonuses = {
          mass: invBonuses[Crewmate.ABILITY_IDS.INVENTORY_MASS_CAPACITY]?.totalBonus,
          volume: invBonuses[Crewmate.ABILITY_IDS.INVENTORY_VOLUME_CAPACITY]?.totalBonus,
        };
      }
      if (c.Location?.locations) {
        c._location = locationsArrToObj(c.Location.locations);
      }
      if (c.Crew) {
        c._ready = blockTime >= c.Crew.readyAt;
        c._readyToSequence = blockTime + CREW_SCHEDULE_BUFFER >= c.Crew.readyAt;

        // if there is a launchtime set, overwrite food so 100% until launch
        if (openAccessJSTime) {
          try { // sometimes this is reported as a read-only property?
            c.Crew.lastFed = Math.max(Math.min(blockTime, openAccessJSTime / 1e3), c.Crew.lastFed);
          } catch (e) {
            console.warn('lastFed overwrite failed. refresh the page.', e);
          }
        }
      }

      return c;
    })
  }, [blockTime, crewmateMap, crewsAndCrewmatesReady, CREW_SCHEDULE_BUFFER, rawCrews, rawCrewsUpdatedAt]);

  const accountCrewIds = useMemo(() => (rawCrews || []).map((c) => c.id), [rawCrews]);

  const selectedCrew = useMemo(() => {
    if (crews && crews.length > 0) {
      // use previously selected crew if still exists
      if (selectedCrewId) {
        const previouslySelected = crews.find((crew) => crew.id === selectedCrewId);
        if (previouslySelected) return previouslySelected;
      }

      // else, use the latest readyAt crew with a roster (fallback to first crew)
      return crews
        .filter((crew) => crew.Crew.roster.length > 0)
        .sort((a, b) => a.Crew.readyAt > b.Crew.readyAt ? -1 : 1)
        ?.[0] || crews[0];
    }
    return null;
  }, [crews, selectedCrewId]);

  // hydrate crew location so can attach station to crew
  const { data: selectedCrewLocation } = useEntity(selectedCrew ? { ...selectedCrew.Location.location } : undefined);

  const [actionTypeTriggered, setActionTypeTriggered] = useState(false);
  useEffect(() => setActionTypeTriggered(false), [selectedCrew?.id]); // recheck random event status on crew change
  useEffect(() => {
    if (!actionTypeTriggered) {
      // No random events in hybrid mode (no on-chain entropy source)
      if (isHybrid()) return;
      // TODO: actionRound tmp fix
      if (selectedCrew?.Crew?.actionType && selectedCrew.Crew.actionRound) {// && (selectedCrew.Crew.actionRound + RandomEvent.MIN_ROUNDS) <= blockNumber) {
        provider.callContract(
          System.getRunSystemCall(
            'CheckForRandomEvent',
            { caller_crew: { id: selectedCrew.id, label: selectedCrew.label }},
            appConfig.get('Starknet.Address.dispatcher')
          )
        )
        .then((response) => {
          const pendingEvent = response ? parseInt(response[1]) : null;
          if (pendingEvent > 0) {
            // TODO: actionRound tmp fix
            // getBlockTime(provider, selectedCrew.Crew.actionRound + RandomEvent.MIN_ROUNDS).then((timestamp) => {
            //   console.log('SET TRIGGER', {
            //     actionType: selectedCrew.Crew.actionType,
            //     pendingEvent,
            //     timestamp,
            //     _now: Math.floor(Date.now() / 1000)
            //   });
            //   setActionTypeTriggered({
            //     actionType: selectedCrew.Crew.actionType,
            //     pendingEvent,
            //     timestamp
            //   });
            // })
            setActionTypeTriggered({
              actionType: selectedCrew.Crew.actionType,
              pendingEvent,
              timestamp: Math.floor(Date.now() / 1000)
            });
          }
        })
        .catch((err) => {
          console.warn('CheckForRandomEvent', err);
          // (wasTriggered can stay false)
        });
      }
    }
  }, [actionTypeTriggered, blockNumber, provider, selectedCrew?.Crew?.actionType, selectedCrew?.Crew?.actionRound]);

  // add final data to selected crew
  const finalSelectedCrew = useMemo(() => {
    if (!selectedCrew) return null;
    return {
      ...selectedCrew,
      _actionTypeTriggered: actionTypeTriggered,
      _ready: selectedCrew?._ready && !actionTypeTriggered,
      _station: selectedCrewLocation?.Station || {},
      _scheduleBuffer: parseInt(CREW_SCHEDULE_BUFFER),
      _siblingCrewIds: (accountCrewIds || []).filter((id) => id !== selectedCrew.id),
      _timeAcceleration: parseInt(TIME_ACCELERATION), // (attach to crew for easy use in bonus calcs)
    }
  // (launched and ready are required for some reason to get final to update)
  }, [accountCrewIds, actionTypeTriggered, selectedCrew, selectedCrew?._ready, selectedCrewLocation, CREW_SCHEDULE_BUFFER, TIME_ACCELERATION]);

  // return all pending transactions that are specific to this crew AND those that are not specific to any crew
  const pendingTransactions = useMemo(() => {
    if (!selectedCrew?.id) {
      return (allPendingTransactions || []).filter((tx) => !tx.vars?.caller_crew?.id);
    }
    return (allPendingTransactions || []).filter((tx) => !tx.vars?.caller_crew?.id || (tx.vars.caller_crew.id === selectedCrew.id));
  }, [allPendingTransactions, selectedCrew?.id])

  const refreshReadyAt = useCallback(async () => {
    const updatedCrew = await api.getEntityById({ label: Entity.IDS.CREW, id: selectedCrewId, components: ['Crew'] });
    if (updatedCrew) {
      queryClient.setQueryData(
        entitiesCacheKey(Entity.IDS.CREW, { owner: accountAddress }),
        (prevRawCrews = []) => {
          return prevRawCrews.map((c) => {
            if (c.id === updatedCrew.id) {
              // TODO: any reason not to just replace the whole Crew component here?
              c.Crew.actionRound = updatedCrew.Crew.actionRound;
              c.Crew.actionStrategy = updatedCrew.Crew.actionStrategy;
              c.Crew.actionType = updatedCrew.Crew.actionType;
              c.Crew.actionWeight = updatedCrew.Crew.actionWeight;
              c.Crew.lastFed = updatedCrew.Crew.lastFed;
              c.Crew.readyAt = updatedCrew.Crew.readyAt;

              // since refreshReadyAt can only happen on selectedCrewId, untrigger random event
              // (in case random event resolution is what brought us here)
              setActionTypeTriggered(false);
            }
            return c;
          });
        }
      );
    }
  }, [accountAddress, selectedCrewId]);

  // make sure a default-selected crew makes it into state (if logged in)
  useEffect(() => {
    if (authenticated && crewsAndCrewmatesReady && selectedCrew?.id !== selectedCrew) {
      dispatchCrewSelected(selectedCrew?.id || undefined);
    }
  }, [authenticated, crewsAndCrewmatesReady, selectedCrew]);

  const captain = useMemo(() => {
    if (simulationState && !simulationState.crewmate) return null;
    return selectedCrew?._crewmates?.[0] || null;
  }, [crewmateMap, selectedCrew, simulationState]);

  const crewCan = useCallback(
    (permission, hydratedTarget) => (finalSelectedCrew && hydratedTarget)
      ? Permission.isPermitted(finalSelectedCrew, permission, hydratedTarget, blockTime)
      : false,
    [blockTime, finalSelectedCrew]
  );

  const isBlurred = useRef(false);
  const onBlur = useCallback(() => {
    isBlurred.current = true;
  }, []);

  // if window was unfocused for long enough to miss a block, when it refocuses...
  // reload the page
  // TODO: could try just clearing the cache and making sure caught up on blocks)
  //       i.e. blockHasBeenMissed.current = false; initializeBlockData().then(() => { queryClient.clear(); });
  // TODO: could potentially miss still have missed websocket info for a short enough window
  //       that didn't miss a block...
  // TODO: could they potentially miss a block without blurring? in that case, we would
  //       probably also want to reload
  // TODO: when first create crew, should probably reload all queries since they were not being updated
  //       in the time before crew creation
  const onFocus = useCallback(() => {
    if (isBlurred.current) {
      isBlurred.current = false;

      // reload if explicitly missed a block and window has returned to focus
      if (isBlockMissing) {
        // window.location.reload();
        console.log('block was missed, invalidating all queries...');
        queryClient.invalidateQueries({}, { cancelRefetch: false});
      }
    }
  }, [isBlockMissing]);

  useEffect(() => {
    if (!!finalSelectedCrew) {
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      return () => {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      }
    }
  }, [!!finalSelectedCrew, onBlur, onFocus]);

  const [crewMovementActivity, setCrewMovementActivity] = useState(null);
  useEffect(() => setCrewMovementActivity(null), [selectedCrew?.id]);

  // handle game launch (on a timeout rather than blocktime)
  const [gameIsLaunched, setGameIsLaunched] = useState(openAccessJSTime < Date.now());
  useEffect(() => {
    const msUntilLaunch = openAccessJSTime - Date.now();
    if (msUntilLaunch > 0) {
      setGameIsLaunched(false);
      const to = setTimeout(() => {
        setGameIsLaunched(true);
      }, msUntilLaunch);
      return () => clearTimeout(to);
    } else {
      setGameIsLaunched(true);
    }
  }, []);

  return (
    <CrewContext.Provider value={{
      accountCrewIds,
      adalianRecruits,
      arvadianRecruits,
      captain,
      crew: finalSelectedCrew,
      crewCan,
      crewMovementActivity,
      crews,
      crewmateMap,
      loading: !crewsAndCrewmatesReady,
      pendingTransactions,
      refreshReadyAt,
      selectCrew: dispatchCrewSelected,  // TODO: this might be redundant
      setCrewMovementActivity,
      isLaunched: gameIsLaunched
    }}>
      {children}
    </CrewContext.Provider>
  );
};

export default CrewContext;
