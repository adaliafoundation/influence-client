# Influence Client - Codebase Overview

## What is This?

**Influence** is a browser-based space strategy MMO built on the **Starknet** blockchain (Ethereum L2). This repository is the **game client** -- a React + Three.js web application where players manage asteroids, crews, buildings, ships, and trade resources in a persistent space economy.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 (Create React App + react-app-rewired) |
| 3D Rendering | Three.js via @react-three/fiber + @react-three/drei |
| State Management | Zustand (persisted to localStorage) |
| Server State | React Query (with WebSocket-driven cache invalidation) |
| Styling | Styled Components |
| Blockchain | Starknet (starknet.js, starknetkit) |
| Wallets | Argent X, Braavos, Argent WebWallet, Argent Mobile |
| Payments | Stripe, Ramp Network, Layerswap, AVNU (DEX) |
| Server | Express (Node.js) -- serves static build + OpenGraph tags |
| Deployment | Heroku (Node.js buildpack) |
| Audio | Howler.js |
| Shaders | GLSL (glslify) |
| Routing | React Router v5 |

---

## Folder & File Hierarchy

```
influence-client/
|
|-- server.js                  # Express server: static files, IP filtering, OpenGraph, basic auth
|-- server.webpack.config.js   # Webpack config for bundling server.js -> server.built.js
|-- auth.js                    # HTTP basic auth middleware (admin / AUTH_PASSWORD)
|-- opengraph.js               # Social sharing meta tag generation (Twitter/Facebook cards)
|-- prebuild.js                # Heroku prebuild: fixes git+ssh -> https in package-lock
|-- config-overrides.js        # Webpack customizations: GLSL loaders, SVG-as-components, caching
|-- Procfile                   # Heroku: `web: node server.built.js`
|-- app.json                   # Heroku env var definitions (API keys, Starknet provider)
|-- block_networks.json        # IP CIDR ranges denied access by the server
|-- static.json                # Heroku static buildpack config
|
|-- public/                    # Static assets served directly
|   |-- index.html             # HTML shell for React app
|   |-- manifest.json          # PWA manifest
|   |-- stories/               # JSON story data files (recruitment narratives)
|   |-- textures/              # Runtime-loaded textures
|       |-- asteroids/         #   Asteroid belt markers/icons
|       |-- asteroid/          #   Surface view textures (ramps, markers, docking gates)
|       |-- buildings/         #   Building category icons (PNG)
|       |-- skybox/            #   Cubemap skybox textures (6 faces)
|       |-- star/              #   Lensflare textures
|       |-- model-viewer/      #   HDR environment for 3D model previews
|
|-- patches/                   # npm patch files (cephes math library fix)
|
|-- src/
    |-- index.js               # React entry: QueryClient, ServiceWorker, ErrorBoundary, render
    |-- index.css              # Global styles
    |-- Game.js                # Root app component: context providers, router, scene + interface
    |-- ScreensizeWarning.js   # Warning overlay for small screens (< 796px)
    |-- ErrorBoundary.js       # React error boundary
    |-- theme.js               # Styled-components theme (colors, fonts, breakpoints)
    |-- gtm.js                 # Google Tag Manager setup
    |-- reportWebVitals.js     # Performance metric reporting
    |-- service-worker.js      # PWA service worker (Workbox)
    |-- serviceWorkerRegistration.js
    |-- worker.js              # Web worker for background computation
    |-- setupTests.js          # Test configuration
    |
    |-- appConfig/             # Environment-based configuration
    |   |-- index.js           #   Config loader (merges default + env-specific + env vars)
    |   |-- _default.json      #   Default config schema (API endpoints, feature flags)
    |   |-- prerelease.json    #   Pre-release overrides (testnet, staging APIs)
    |   |-- production.json    #   Production overrides (mainnet, production APIs)
    |
    |-- assets/                # Bundled static assets
    |   |-- icons/             #   SVG icons
    |   |   |-- *.svg          #     General UI icons (~80 icons)
    |   |   |-- action_buttons/#     Action button icons (Construct, Extract, SetCourse, etc.)
    |   |   |-- buildings/     #     Building type icons (Extractor, Factory, Habitat, etc.)
    |   |   |-- crew_traits/   #     Crew trait icons (numbered 1-50)
    |   |   |-- crew_classes/  #     Crew class icons
    |   |   |-- scene/         #     3D scene overlay icons (markers, reticules)
    |   |   |-- animated/      #     Lottie animation JSON files
    |   |-- images/            #   Raster images
    |   |   |-- crew_collections/  # Crew collection art
    |   |   |-- hud_headers/       # HUD panel headers
    |   |   |-- modal_headers/     # Modal dialog headers
    |   |   |-- sales/             # Store/sale promotional images
    |   |   |-- wallets/           # Wallet provider logos
    |   |-- intro.json         #   Lottie intro animation data
    |
    |-- contexts/              # React context providers (app-wide state)
    |   |-- SessionContext.js   #   Wallet connection, auth, Starknet chain state
    |   |-- CrewContext.js      #   Player crew data, permissions, selected crew
    |   |-- ChainTransactionContext.js  # Transaction execution and status tracking
    |   |-- ActivitiesContext.js #  WebSocket event streaming, cache invalidation
    |   |-- ActionItemContext.js #  Pending action items for player's crew
    |   |-- WebsocketContext.js  #  Socket.io connection, room subscriptions
    |   |-- CoachmarkContext.js  #  Tutorial/onboarding guidance system
    |   |-- DevToolContext.js    #  Dev tools: 3D viewer overrides
    |   |-- ScreensizeContext.js #  Window dimension tracking
    |   |-- SyncedTimeContext.js #  Server-synced block time
    |
    |-- hooks/                 # Custom React hooks
    |   |-- useStore.js        #   Zustand store (1100+ lines): UI state, selection, graphics
    |   |-- useSession.js      #   SessionContext convenience wrapper
    |   |-- useCrewContext.js   #   CrewContext convenience wrapper
    |   |-- useActionButtons.js #  Computes available actions for current selection
    |   |-- useAssetSearch.js   #  Search with filters and sorting
    |   |-- useBlockTime.js     #  Block time synchronization
    |   |-- useWebsocket.js     #  WebSocket subscription hooks
    |   |-- useWebWorker.js     #  Web worker communication hook
    |   |                      #  --- Entity data hooks ---
    |   |-- useEntity.js / useEntities.js      # Generic entity fetching
    |   |-- useAsteroid.js / useAsteroids.js   # Asteroid queries
    |   |-- useCrew.js / useCrewmate.js        # Crew / crewmate queries
    |   |-- useShip.js / useBuilding.js        # Ship / building queries
    |   |-- useLot.js / useAsteroidLotData.js  # Lot and surface data
    |   |-- useDeliveries.js                   # Shipment tracking
    |   |-- useActivities.js                   # Activity/event queries
    |   |                      #  --- Wallet data hooks ---
    |   |-- useWalletAsteroids.js / useWalletShips.js / useWalletCrews.js
    |   |-- useWalletBuildings.js / useWalletTokenBalance.js
    |   |-- useWalletAgreements.js / useWalletLeasedLots.js
    |   |                      #  --- Paged data hooks ---
    |   |-- usePagedActionItems.js / usePagedAgreements.js
    |   |-- usePagedAssets.js / usePagedEvents.js
    |   |                      #  --- Misc hooks ---
    |   |-- useAutocomplete.js / useHydratedCrew.js / useHydratedLocation.js
    |   |-- useBusyActivity.js / useShoppingListData.js / usePriceHelper.js
    |   |-- useSimulationEnabled.js / useSimulationState.js / useTutorialSteps.js
    |   |-- (... 90+ hooks total)
    |   |
    |   |-- actionManagers/    #   Transaction builder hooks (complex multi-step ops)
    |       |-- useConstructionManager.js   # Building: plan -> construct -> deconstruct
    |       |-- useDeliveryManager.js       # Shipment: package -> send -> accept
    |       |-- useMarketplaceManager.js    # Buy/sell limit orders
    |       |-- useExtractionManager.js     # Resource extraction lifecycle
    |       |-- useCoreSampleManager.js     # Deposit core sampling
    |       |-- useShipTravelManager.js     # Ship travel planning + execution
    |       |-- useDryDockManager.js        # Ship assembly in dry dock
    |       |-- useProcessManager.js        # Material processing/refining
    |       |-- useCrewManager.js           # Crew management ops
    |       |-- useAgreementManager.js      # Agreements/contracts
    |       |-- usePolicyManager.js         # Access policies
    |       |-- useScanManager.js           # Asteroid orbital scans
    |       |-- useShipDockingManager.js    # Ship land/launch
    |       |-- useShipEmergencyManager.js  # Emergency mode toggle
    |       |-- useEjectCrewManager.js      # Crew ejection
    |       |-- useFeedCrewManager.js       # Crew feeding
    |       |-- useJettisonCargoManager.js  # Cargo jettison
    |       |-- (... 30+ action managers)
    |
    |-- lib/                   # Utility libraries
    |   |-- api.js             #   Axios HTTP client: entity queries, user endpoints, AVNU DEX
    |   |-- activities.js      #   Activity metadata, hydration, cache invalidation (84KB)
    |   |-- actionItem.js      #   Format activities as actionable UI items (39KB)
    |   |-- actionStages.js    #   Action stage definitions
    |   |-- utils.js           #   General utilities: formatting, timers, BigInt, crew bonuses
    |   |-- formatters.js      #   Entity name formatters
    |   |-- priceUtils.js      #   Token formatting (ETH 1e18, SWAY 1e6), price calculations
    |   |-- geometryUtils.js   #   Orbital mechanics, circle geometry, position computations
    |   |-- cacheKey.js        #   React Query cache key patterns
    |   |-- constants.js       #   App-wide constants
    |   |-- assetUtils.js      #   Asset type utilities
    |   |-- asteroidConfig.js  #   Asteroid rendering configuration
    |   |-- porkchop.js        #   Porkchop plot (travel planning trajectory calculations)
    |   |-- visuals.js         #   Visual/theme helpers
    |   |-- getAlertContent.js #   Alert message generation
    |   |
    |   |-- graphics/          #   3D graphics utilities
    |   |   |-- CubeSphere.js                  # Procedural planet/asteroid mesh generation
    |   |   |-- Lensflare.js                   # Custom lens flare post-processing
    |   |   |-- OctaveNoise.js                 # Perlin noise for terrain generation
    |   |   |-- TextureRenderer.js             # Dynamic texture generation
    |   |   |-- TrackballModControlsImpl.js     # Custom trackball camera controls
    |   |   |-- cubeTransforms.js              # Cube-to-sphere UV mapping
    |   |   |-- exportGLTF.js                  # GLTF model export utility
    |   |   |-- cellular3.glsl                 # Procedural cellular noise shader
    |   |
    |   |-- math/              #   Math utilities
    |       |-- Seed.js        #     Deterministic PRNG seeding
    |
    |-- components/            # Shared UI component library (140+ components)
    |   |-- Button.js / ButtonAlt.js / ButtonPill.js / BrightButton.js  # Button variants
    |   |-- TextInput.js / NumberInput.js / SliderInput.js / Range.js   # Form inputs
    |   |-- Dropdown.js / Multiselect.js / Autocomplete.js              # Selectors
    |   |-- Dialog.js / ConfirmationDialog.js / GenericDialog.js        # Dialogs
    |   |-- DataTable.js / DataReadout.js / Badge.js                    # Data display
    |   |-- Details.js / DetailsV2.js / DetailsModal.js                 # Entity detail cards
    |   |-- TabContainer.js / HeroLayout.js / Pagination.js             # Layout
    |   |-- Icons.js                      # 100+ SVG icon components
    |   |-- AsteroidRendering.js          # 3D asteroid preview component
    |   |-- CrewmateCard.js / CrewmateCardFramed.js / CrewmateInfoPane.js
    |   |-- ResourceThumbnail.js / ResourceColorIcon.js / ResourceSelection.js
    |   |-- LiveTimer.js / Time.js / LiveFoodStatus.js / LiveReadyStatus.js
    |   |-- Loader.js / PageLoader.js / Reconnecting.js
    |   |-- EntityName.js / EntityLink.js / LotLink.js / ShipLink.js
    |   |-- SearchFilters.js / SearchFilterTray.js
    |   |-- Porkchop.js                   # Porkchop trajectory plot component
    |   |-- DraggableModal.js             # Floating window container
    |   |-- (... many more)
    |   |
    |   |-- filters/           #   Asset search filter components
    |   |   |-- AsteroidNameFilter.js / BuildingNameFilter.js / LotIdFilter.js
    |   |   |-- OwnershipFilter.js / CrewOwnershipFilter.js
    |   |   |-- RangeFilter.js / CheckboxFilter.js / BooleanFilter.js / TextFilter.js
    |   |   |-- BuildingAccessFilter.js / LotLeaseFilter.js / LotOccupiedFilter.js
    |   |   |-- SurfaceAreaFilter.js
    |   |   |-- components.js  #   Shared filter UI (SearchMenu, Highlighter, CheckboxRow)
    |   |
    |   |-- porkchop/          #   Porkchop diagram sub-components
    |       |-- Grid.js / Reticule.js / SolutionLabels.js
    |
    |-- simulation/            # Tutorial/training simulation system
    |   |-- useSimulationSteps.js    # 40+ step state machine for onboarding tutorial
    |   |-- simulationConfig.js      # Fixed test data (crew IDs, asteroid IDs, etc.)
    |   |-- MockDataManager.js       # Generates mock entities for simulation
    |   |-- MockTransactionManager.js# Simulates blockchain transactions
    |
    |-- game/                  # Main game code
        |-- Game.js / Scene.js / Interface.js / Launcher.js  # (see below)
        |-- Audio.js           #   Sound management (Howler.js): ambient music, UI effects
        |-- Intro.js           #   Lottie intro animation on first load
        |-- Cutscene.js        #   Video cutscene playback
        |-- Postprocessor.js   #   Post-processing: bloom, tone mapping
        |-- QueryLoader.js     #   Loading bar for data fetching
        |-- Landing.js         #   Initial landing page
        |-- ChatListener.js    #   Chat event listener
        |-- StripeListener.js  #   Stripe payment event listener
        |-- Referral.js        #   Referral system handler
        |-- GpuContextLost.js  #   WebGL context loss recovery
        |-- uiConstants.js     #   headerHeight (68px), menuPadding (25px)
        |
        |-- scene/             #   3D scene (Three.js / react-three-fiber)
        |   |-- Star.js        #     Central star with lensflare
        |   |-- Planets.js     #     Orbiting planets (web worker position calc)
        |   |-- Asteroids.js   #     Belt view: all asteroids as shader-rendered points
        |   |-- Asteroid.js    #     Surface view: terrain, lots, crews, buildings
        |   |-- SettingsManager.js #  Graphics settings (skybox, FOV, pixel ratio)
        |   |
        |   |-- star/
        |   |   |-- lensflareConfig.js   # Lensflare parameters
        |   |
        |   |-- planets/
        |   |   |-- Orbit.js             # Planet orbital path (LineLoop)
        |   |
        |   |-- asteroids/               # Belt view sub-components
        |   |   |-- Marker.js            #   Animated markers (origin, destination, hover)
        |   |   |-- Orbit.js             #   Asteroid orbital paths (shader animated)
        |   |   |-- TravelSolution.js    #   Flight path trajectory visualization
        |   |   |-- highlighters.js      #   Asteroid color-coding logic
        |   |   |-- asteroids.vert/frag  #   Point rendering shaders
        |   |   |-- marker/              #   Marker shaders
        |   |   |-- orbit/               #   Orbit shaders + color config
        |   |
        |   |-- asteroid/                # Surface view sub-components
        |   |   |-- Lots.js              #   Land parcel rendering (InstancedMesh)
        |   |   |-- Crews.js             #   Crew member sprites on surface
        |   |   |-- Deliveries.js        #   Delivery route visualization
        |   |   |-- Rings.js             #   Orbital ring effects
        |   |   |-- Telemetry.js         #   Asteroid stats overlay
        |   |   |-- helpers/
        |   |   |   |-- QuadtreeTerrainCube.js   # LOD terrain quadtree
        |   |   |   |-- QuadtreeTerrainPlane.js  # Planar terrain variant
        |   |   |   |-- TerrainChunk.js          # Individual terrain patch
        |   |   |   |-- TerrainChunkManager.js   # Chunk lifecycle management
        |   |   |   |-- TerrainChunkUtils.js     # Chunk utility functions
        |   |   |   |-- LotGeometry.js           # Lot parcel geometry generation
        |   |   |   |-- utils.js                 # Surface math helpers
        |   |   |-- shaders/
        |   |       |-- height.glsl / height_w_stitching.glsl  # Terrain height
        |   |       |-- color.glsl              # Surface coloring
        |   |       |-- normal.glsl             # Normal mapping
        |   |       |-- resource.glsl           # Resource abundance visualization
        |   |       |-- delivery.vert/frag      # Delivery path shaders
        |   |       |-- partials/
        |   |           |-- getAbundance.glsl / getHeight.glsl / getUnitSphereCoords.glsl
        |   |
        |   |-- stellarPlane/
        |       |-- stellarPlane.vert/frag      # Background plane shaders
        |
        |-- interface/         #   UI overlay on the 3D scene
        |   |-- Alerts.js      #     Toast notification system
        |   |-- DeepLink.js    #     URL deep-linking to entities
        |   |-- Draggables.js  #     Floating window container
        |   |-- MainMenu.js    #     Bottom menu bar (zoom, time controls, logo)
        |   |-- ModelViewer.js #     3D asset preview overlay
        |   |-- RandomEvent.js #     Random event popup
        |   |-- RecruitCrewmate.js # Crew recruitment dialog
        |   |-- HUD.js         #     Main HUD container
        |   |
        |   |-- hud/                         # HUD panels
        |   |   |-- ActionDialog.js          #   Master action dialog (routes to 30+ dialogs)
        |   |   |-- ActionItems.js           #   Left panel: available actions list
        |   |   |-- ActionItem.js            #   Individual action card
        |   |   |-- AvatarMenu.js            #   Player profile/avatar
        |   |   |-- InfoPane.js              #   Selected entity information
        |   |   |-- HudMenu.js               #   Navigation menu overlay
        |   |   |-- SceneBanner.js           #   Top banner (search, travel mode)
        |   |   |-- SystemControls.js        #   Camera/view controls
        |   |   |-- LotLoadingProgress.js    #   Terrain chunk loading indicator
        |   |   |-- WelcomeSimulation.js     #   Training mode welcome
        |   |   |-- TutorialMessage.js       #   Tutorial text
        |   |   |-- TutorialActionItems.js   #   Tutorial-guided actions
        |   |   |
        |   |   |-- actionButtons/           #   Action button definitions (40+ buttons)
        |   |   |   |-- index.js             #     Button registry
        |   |   |   |-- ActionButton.js      #     Base button component
        |   |   |   |-- ActionButtonStack.js #     Stacked button group
        |   |   |   |-- Construct.js / Extract.js / SetCourse.js / LandShip.js / ...
        |   |   |
        |   |   |-- actionDialogs/           #   Action dialog implementations (25+ dialogs)
        |   |   |   |-- components.js        #     Shared dialog components
        |   |   |   |-- Construct.js / Extract.js / SetCourse.js / Process.js / ...
        |   |   |   |-- MarketplaceOrder.js / ShoppingList.js / SellingList.js
        |   |   |   |-- SurfaceTransfer.js / TransferToSite.js / JettisonCargo.js
        |   |   |
        |   |   |-- actionForms/
        |   |   |   |-- RouteSelection.js    #   Travel route selection form
        |   |   |
        |   |   |-- hudBanners/              #   Top-of-screen banners
        |   |   |   |-- Banner.js / SearchAsteroidsBanner.js
        |   |   |   |-- SearchLotsBanner.js / TravelBanner.js
        |   |   |
        |   |   |-- hudMenus/               #   HUD menu panels (side panels)
        |   |       |-- index.js             #     Menu registry
        |   |       |-- MyAssets.js          #     Player's owned assets list
        |   |       |-- MyCrews.js           #     Player's crews
        |   |       |-- Favorites.js         #     Watchlisted asteroids
        |   |       |-- Inventory.js         #     Building/ship inventory
        |   |       |-- Resources.js         #     Asteroid resource overview
        |   |       |-- RoutePlanner.js      #     Travel route planner (porkchop diagram)
        |   |       |-- SearchMap.js         #     Map search interface
        |   |       |-- AsteroidInfo.js      #     Asteroid detail panel
        |   |       |-- LotInfo.js           #     Lot detail panel
        |   |       |-- ShipInfo.js          #     Ship detail panel
        |   |       |-- OrbitDetails.js      #     Orbital mechanics display
        |   |       |-- DockDetails.js       #     Docking/port information
        |   |       |-- StationManifest.js   #     Station crew manifest
        |   |       |-- AsteroidChat.js      #     Asteroid local chat
        |   |       |-- DevTools.js          #     Developer tools panel
        |   |       |-- AdminAsteroid.js / AdminBuilding.js / AdminShip.js  # Admin panels
        |   |       |-- components/          #     Shared menu components
        |   |           |-- TitleArea.js / AsteroidTitleArea.js / LotTitleArea.js
        |   |           |-- ShipTitleArea.js / AssetBlocks.js / AsteroidResources.js
        |   |           |-- LotResources.js / EntityNameForm.js / EntityDescriptionForm.js
        |   |           |-- PolicyPanels.js / MarketplaceSettings.js
        |   |           |-- ListForSalePanel.js / SwitchToAdministratingCrew.js
        |   |
        |   |-- details/                     #   Detail view panels
        |   |   |-- AsteroidDetails.js       #     Asteroid info + tabs
        |   |   |-- CrewDetails.js           #     Crew overview
        |   |   |-- CrewmateDetails.js       #     Individual crewmate stats
        |   |   |-- EntityActivityLog.js     #     Historical activity log
        |   |   |-- ListView.js              #     Filterable asset list view
        |   |   |-- Marketplace.js           #     Marketplace trading interface
        |   |   |-- CrewAssignments.js       #     Crew job assignments
        |   |   |
        |   |   |-- asteroidDetails/
        |   |   |   |-- Information.js / Resources.js / AsteroidBonuses.js
        |   |   |   |-- components/
        |   |   |       |-- AsteroidComposition.js / AsteroidGraphic.js / AsteroidSpinner.js
        |   |   |
        |   |   |-- crewAssignments/
        |   |   |   |-- Assignment.js / Complete.js / Create.js
        |   |   |
        |   |   |-- listViews/
        |   |   |   |-- index.js             #     List view registry
        |   |   |   |-- asteroids.js / buildings.js / ships.js / crews.js / crewmates.js
        |   |   |   |-- coreSamples.js / agreements.js / events.js / actionItems.js
        |   |   |   |-- components.js        #     Shared list view components
        |   |   |
        |   |   |-- marketplace/
        |   |       |-- Home.js / OpenOrders.js / DepthChart.js
        |   |       |-- AsteroidResourcePrices.js
        |   |
        |   |-- mainMenu/
        |   |   |-- Menu.js / MenuItem.js / TimeControls.js
        |   |
        |   |-- modelViewer/
        |   |   |-- LotViewer.js / ShipViewer.js / LinkedViewer.js / DevToolsViewer.js
        |   |
        |   |-- draggable/
        |       |-- index.js                 #     Draggable component type registry
        |
        |-- launcher/          #   Pre-game launcher overlay
            |-- Play.js        #     Main play screen (crew status, play button)
            |-- Settings.js    #     Game settings (graphics, audio, notifications)
            |-- Help.js        #     FAQ and support links
            |-- Rewards.js     #     Achievement/reward display
            |-- Inbox.js       #     Player messages
            |
            |-- store/         #     In-game store
            |   |-- Store.js           #   Store layout
            |   |-- AsteroidSKU.js     #   Asteroid purchase page
            |   |-- CrewmateSKU.js      #   Crewmate recruitment page
            |   |-- StarterPackSKU.js   #   Starter pack bundle
            |   |-- SwaySKU.js          #   SWAY token purchase
            |   |-- FaucetSKU.js        #   Testnet faucet
            |   |-- FundingFlow.js      #   Purchase workflow orchestration
            |   |-- StripeCheckout.js   #   Stripe payment integration
            |   |-- components/
            |       |-- PurchaseForm.js / SKUButton.js / SKUHighlight.js
            |       |-- SKUTitle.js / SKUInputRow.js / SKULayout.js
            |       |-- EthFaucetButton.js / SwayFaucetButton.js
            |
            |-- components/    #     Launcher shared components
                |-- LauncherDialog.js / RecruitmentMenu.js / SupportMenu.js
                |-- RewardMissions.js / RewardQuests.js / RewardReferrals.js
```

---

## Architecture Overview

### Three-Layer State Model

```
 +------------------------------------------------------+
 | TRANSIENT UI STATE (Zustand)                         |
 | Selection, zoom, menus, filters, graphics settings   |
 | Persisted to localStorage                            |
 +------------------------------------------------------+
                          |
 +------------------------------------------------------+
 | SERVER STATE (React Query)                           |
 | Entities, activities, market data, crew info         |
 | Cache invalidated by WebSocket events                |
 +------------------------------------------------------+
                          |
 +------------------------------------------------------+
 | BLOCKCHAIN STATE (React Contexts)                    |
 | Wallet, transactions, permissions, block time        |
 | Real-time via Socket.io                              |
 +------------------------------------------------------+
```

### Context Provider Hierarchy

```
QueryClientProvider          (React Query)
  SessionContext.Provider    (wallet + auth)
    WebsocketContext.Provider (Socket.io)
      ActivitiesContext.Provider (event streaming)
        CrewContext.Provider  (crew data + permissions)
          ChainTransactionContext.Provider (tx execution)
            ActionItemContext.Provider (pending actions)
              CoachmarkContext.Provider (tutorial)
                ScreensizeContext.Provider
                  SyncedTimeContext.Provider
                    <Game />
```

### Rendering Architecture

```
<Game>
  |
  |-- <Scene>  (react-three-fiber Canvas)
  |     |
  |     |-- <Star />           (central star + lensflare)
  |     |-- <Planets />        (orbiting planets, visible when zoomed out)
  |     |-- <Asteroids />      (asteroid belt, visible when zoomed out)
  |     |-- <Asteroid />       (surface view, visible when zoomed in)
  |     |-- <Postprocessor />  (bloom, tone mapping)
  |     |-- <SettingsManager />(skybox, background)
  |
  |-- <Interface>  (React Router overlay on Canvas)
        |
        |-- <Launcher />       (pre-game menu: Play, Store, Settings)
        |-- <HUD />            (in-game: actions, info, menus)
        |-- <MainMenu />       (bottom bar: time, zoom, fullscreen)
        |-- <Alerts />         (toast notifications)
        |-- <ModelViewer />    (3D asset preview)
        |-- <Draggables />     (floating windows)
```

---

## Main Flows

### 1. Application Bootstrap

1. `src/index.js` creates `QueryClient`, registers service worker, renders `<Game />`
2. `Game.js` wraps the app in context providers (Session, Crew, Websocket, Activities, etc.)
3. `Interface.js` sets up React Router routes
4. If not authenticated, shows `<Launcher />` (Play page with connect wallet prompt)
5. `Scene.js` initializes the Three.js Canvas and renders the 3D scene

### 2. Wallet Connection & Authentication

1. User clicks "Connect Wallet" in `<Launcher />`
2. `SessionContext` opens StarknetKit modal (Argent X / Braavos / WebWallet)
3. Connection state: `DISCONNECTED -> CONNECTING -> CONNECTED -> AUTHENTICATING -> AUTHENTICATED`
4. On success, `SessionContext` stores wallet address, chain, and provider
5. `CrewContext` loads the player's crews, permissions, and current crew state

### 3. Belt View (Zoomed Out)

1. `Scene.js` renders `<Asteroids />` when `zoomStatus === 'out'`
2. Web worker computes asteroid positions using `AdalianOrbit` SDK
3. Asteroids rendered as shader-driven GL points (custom vert/frag)
4. Click an asteroid -> `dispatchOriginSelected(id)` in Zustand store
5. `<Marker />` shows animated reticule on selected asteroid
6. `<Orbit />` highlights the orbital path
7. HUD shows asteroid info, available actions

### 4. Zoom to Surface View

1. User double-clicks or selects "Zoom In" on an asteroid
2. `zoomStatus` transitions: `'out' -> 'zooming-in' -> 'in'`
3. Camera animates via GSAP (3-second transition)
4. `<Asteroids />` hides, `<Asteroid />` renders
5. `QuadtreeTerrainCube` builds LOD terrain from procedural noise
6. `<Lots />` renders land parcels as `InstancedMesh`
7. `<Crews />` shows crew sprites on the surface
8. HUD updates to show lot-level actions (build, extract, scan, etc.)

### 5. Action Execution (e.g., Building Construction)

1. `useActionButtons()` computes available actions for current selection
2. User clicks an action button (e.g., "Construct") -> opens `<ActionDialog />`
3. Dialog routes to `actionDialogs/Construct.js`
4. User fills out the form (building type, lot, resources)
5. `useConstructionManager()` builds the transaction payload:
   ```js
   { caller_crew, lot, building_type, ... }
   ```
6. User confirms -> `ChainTransactionContext.execute('ConstructionStart', payload)`
7. Transaction sent to Starknet via wallet provider
8. Pending TX tracked in `CrewContext`
9. WebSocket notifies on block inclusion
10. `ActivitiesContext` invalidates relevant React Query caches
11. UI updates to show the new building

### 6. Ship Travel (Belt Navigation)

1. Select origin asteroid, click "Set Course"
2. `<TravelBanner />` appears, user selects destination asteroid
3. `<RoutePlanner />` shows porkchop diagram (departure time vs. travel time)
4. `useShipTravelManager()` computes trajectory via `AdalianOrbit` SDK
5. `<TravelSolution />` renders flight path in 3D scene
6. User confirms -> transaction sent to Starknet
7. Ship enters transit state, HUD shows countdown

### 7. Marketplace Trading

1. Navigate to marketplace via HUD menu or deep link
2. `Marketplace.js` shows order book, depth chart, price history
3. `useMarketplaceManager()` manages buy/sell limit orders
4. User places order -> transaction on Starknet
5. Orders visible in `OpenOrders.js`, filled via on-chain matching

### 8. Real-Time Event Flow

```
Starknet Block  ->  Backend Indexer  ->  WebSocket  ->  Client
                                            |
                                    WebsocketContext
                                            |
                                    ActivitiesContext
                                     /            \
                          Cache Invalidation    Activity Hydration
                          (React Query)         (enrich with entity data)
                                                      |
                                              ActionItemContext
                                              (format as UI items)
                                                      |
                                                 HUD updates
```

### 9. Tutorial / Simulation Mode

1. User clicks "Training" in `<Launcher />`
2. `simulationEnabled` set to true in Zustand store
3. `MockDataManager` provides fake entities, `MockTransactionManager` simulates chain
4. `useSimulationSteps()` runs a 40+ step state machine
5. Steps guide user through: crew creation, asteroid selection, building, extraction, travel
6. `CoachmarkContext` highlights UI elements for each step

### 10. Store / Purchase Flow

1. `<Launcher />` -> `<Store />` shows SKU pages (asteroids, crewmates, SWAY, packs)
2. User selects item -> `<PurchaseForm />` with quantity/price
3. Payment options: Stripe (fiat), Ramp Network (fiat->crypto), Layerswap (bridge), direct crypto
4. `FundingFlow.js` orchestrates the multi-step purchase workflow
5. On payment success, asset minted on Starknet and added to player's wallet

---

## Key External Dependencies

| Package | Purpose |
|---------|---------|
| `@influenceth/sdk` | Game logic: entity definitions, orbital mechanics, activities, recipes |
| `starknet` / `starknetkit` | Starknet blockchain interaction + wallet connection |
| `three` / `@react-three/fiber` | 3D WebGL rendering |
| `zustand` | Client state management |
| `react-query` | Server state caching + synchronization |
| `styled-components` | CSS-in-JS theming |
| `axios` | HTTP client for API calls |
| `socket.io-client` | WebSocket real-time events |
| `howler` | Audio playback |
| `moment` / `numeral` | Date/number formatting |
| `victory` | Charting (market data) |
| `@avnu/avnu-sdk` | AMM/DEX swap integration |

---

## Entity Reference Pattern

All game entities use a standardized reference format:

```js
{ id: <number>, label: Entity.IDS.<TYPE> }
// Examples:
{ id: 123, label: Entity.IDS.ASTEROID }
{ id: 456, label: Entity.IDS.BUILDING }
{ id: 789, label: Entity.IDS.CREW }
```

This pattern is used across hooks, action managers, API calls, and cache keys.

---

## Development

```bash
npm start         # Dev server (react-app-rewired)
npm run build     # Production build + server bundle
npm run analyze   # Bundle size analysis
```

Environment config is selected via `REACT_APP_CONFIG_ENV` (falls back to `NODE_ENV`). See `appConfig/` for available settings per environment.
